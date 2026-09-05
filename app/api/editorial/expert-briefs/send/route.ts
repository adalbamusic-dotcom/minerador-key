import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, assertCanAccessMarca, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { buildRadarExpertBriefTelegramMessage, normalizeRadarExpertBriefQuestions } from "@/lib/radar/expert-brief";
import {
  claimExpertBriefForSend,
  getExpertBrief,
  listActiveBrandExperts,
  listActiveTelegramBindingsForExpert,
  markExpertBriefSent,
  restoreExpertBriefAfterSendFailure,
  selectExpertBriefForTelegramBinding,
} from "@/lib/server/telegram/persistence";
import { sendSharedTelegramMessage } from "@/lib/server/telegram/operations";
import { TelegramCanonicalError } from "@/lib/server/telegram/canonical";

const SendRequestSchema = z.object({
  brandId: z.string().uuid(),
  expertId: z.string().uuid(),
  briefId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

function responseError(error: unknown) {
  if (error instanceof TelegramCanonicalError) return { status: error.status, body: { error: error.message, code: error.code } };
  const mapped = authzErrorResponse(error);
  return { status: mapped.status, body: { error: mapped.message } };
}

export async function POST(request: Request) {
  try {
    const input = SendRequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    await assertCanAccessMarca(profile.userId, input.brandId, profile);
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    const client = createCanonicalServiceClient();

    const experts = await listActiveBrandExperts(input.brandId, client);
    if (!experts.some(expert => expert.id === input.expertId)) throw new AuthzError(404, "Especialista não encontrado ou não utilizável nesta Marca.");

    const current = await getExpertBrief({
      brandId: input.brandId,
      briefId: input.briefId,
      expertId: input.expertId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
    }, client);
    if (!current) throw new AuthzError(404, "Pauta não encontrada neste contexto de artigo, versão e especialista.");

    const bindings = await listActiveTelegramBindingsForExpert({ brandId: input.brandId, expertId: input.expertId }, client);
    if (bindings.length !== 1) {
      throw new AuthzError(409, bindings.length === 0
        ? "O especialista ainda não possui um vínculo Telegram ativo. Conclua o onboarding antes do envio."
        : "O especialista possui mais de um vínculo Telegram ativo; resolva a ambiguidade antes do envio.");
    }
    const binding = bindings[0];

    // A retry after a confirmed readback is a no-op. The browser never gets a
    // chat/user identifier; it only receives the state needed to update the
    // contextual Radar panel.
    if (current.status === "awaiting_expert" && current.sentAt) {
      return NextResponse.json({
        brief: current,
        send: "already_confirmed",
        persistence: "remote_readback_confirmed",
        notification: "ALREADY_SENT",
      }, { headers: noStoreHeaders });
    }
    if (current.status !== "reviewed") {
      if (current.status === "ready_to_send") throw new AuthzError(409, "Este envio já está em andamento ou precisa de reconciliação antes de uma nova tentativa.");
      throw new AuthzError(409, "A pauta precisa estar revisada por uma pessoa antes do envio.");
    }

    const questions = normalizeRadarExpertBriefQuestions(current.questions);
    if (!questions.length) throw new AuthzError(409, "A pauta revisada precisa conter ao menos uma pergunta.");
    const text = buildRadarExpertBriefTelegramMessage({ title: current.title, questions, radarContext: current.radarContext });
    const claimed = await claimExpertBriefForSend({ brandId: input.brandId, expertId: input.expertId, briefId: input.briefId }, client);
    if (!claimed) throw new AuthzError(409, "A pauta foi alterada por outra operação; recarregue o artigo antes de enviar.");

    let sent: Awaited<ReturnType<typeof sendSharedTelegramMessage>>;
    try {
      sent = await sendSharedTelegramMessage({
        actorUserId: profile.userId,
        brandId: input.brandId,
        client,
        chatId: binding.telegramChatId,
        text,
      });
    } catch (error) {
      await restoreExpertBriefAfterSendFailure({ brandId: input.brandId, expertId: input.expertId, briefId: input.briefId }, client);
      throw error;
    }

    const sentBrief = await markExpertBriefSent({ brandId: input.brandId, expertId: input.expertId, briefId: input.briefId }, client);
    if (!sentBrief) throw new AuthzError(503, "O Telegram confirmou o envio, mas o estado remoto da pauta não pôde ser confirmado.");
    const selectedBinding = await selectExpertBriefForTelegramBinding({ bindingId: binding.id, brandId: input.brandId, expertId: input.expertId, briefId: input.briefId }, client);
    if (!selectedBinding) throw new AuthzError(503, "O Telegram confirmou o envio, mas o brief explícito não pôde ser associado ao vínculo.");
    const readback = await getExpertBrief({ brandId: input.brandId, briefId: input.briefId, expertId: input.expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
    if (!readback || readback.status !== "awaiting_expert" || !readback.sentAt) throw new AuthzError(503, "O envio foi aceito, mas o readback final do ExpertBrief não foi confirmado.");

    // Keep the provider response server-side. Its numeric message id is not
    // an editorial identity and is intentionally not rendered by the Radar.
    void sent.messageId;
    return NextResponse.json({ brief: readback, send: "remote_confirmed", persistence: "remote_readback_confirmed", notification: "SENT" }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados do envio do ExpertBrief inválidos.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    const mapped = responseError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers: noStoreHeaders });
  }
}
