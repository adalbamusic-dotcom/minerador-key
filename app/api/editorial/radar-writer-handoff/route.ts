import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { RadarStartError } from "@/lib/server/radar-youtube-start";
import { RadarWriterSendError, sendRadarToWriter } from "@/lib/server/radar-writer-send";

/**
 * ===== O HANDOFF AO REDATOR — RADAR_TO_WRITER_HANDOFF_1 · §5 =====
 *
 * ========================= PROVIDER_CALLS = 0 =========================
 *
 * Esta rota consolida e entrega. Ela não coleta nada: Google, YouTube, Amazon,
 * reviews e transcrição continuam em zero. Por isso ela pode ser repetida sem
 * medo — a idempotência garante que repetir não duplica documento.
 *
 * ==================== DUAS PERMISSÕES, E NÃO UMA ====================
 *
 * Quem envia precisa poder editar no Radar E criar no Redator. Exigir só a
 * primeira deixaria alguém sem acesso ao Redator criar rascunhos lá; exigir só
 * a segunda deixaria alguém de fora do Radar disparar a entrega de uma
 * investigação que ele não pode nem ler.
 */

const noStoreHeaders = { "Cache-Control": "no-store" } as const;

const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  /** A análise que a tela mostrava. Divergiu, a entrega é recusada. */
  displayedAnalysisVersionId: z.string().trim().min(1).max(256).nullable().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = CorpoSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    await assertEditorialPermission(profile, input.brandId, "redator", "create");

    const resultado = await sendRadarToWriter({
      brandId: input.brandId,
      articleId: input.articleId,
      actorId: profile.userId,
      sentAt: new Date().toISOString(),
      displayedAnalysisVersionId: input.displayedAnalysisVersionId ?? null,
    });

    return NextResponse.json({
      success: true,
      persistenceMode: "remote" as const,
      /* Só chega aqui o que o servidor releu e revalidou. */
      readbackConfirmed: true,
      change: resultado.change,
      outcome: resultado.outcome,
      analysisVersionId: resultado.analysisVersionId,
      /* A tela mostra a frase; hash e ids ficam nos detalhes técnicos. */
      headline: resultado.headline,
      bundleId: resultado.record.bundleId,
      bundleHash: resultado.record.bundleHash,
      handoffVersion: resultado.record.handoffVersion,
      primaryResearchProfile: resultado.record.primaryResearchProfile,
      bundleBytes: resultado.bundleBytes,
      handoffBytes: resultado.handoffBytes,
      /* O destino confirmado, relido do Redator. */
      documentId: resultado.documentId,
    }, { headers: noStoreHeaders });
  } catch (error) {
    /*
     * ===== TODA RECUSA VAI PARA O LOG DO SERVIDOR =====
     *
     * As recusas de domínio saem como 409 e nunca eram registradas; uma
     * exceção inesperada virava 500 com a mensagem crua, também sem registro.
     * O resultado foi "um monte de falhas" na tela e nenhuma linha no log —
     * e sem a linha, cada clique custa uma rodada de adivinhação.
     *
     * Sem credencial: código, mensagem e as primeiras molduras da pilha.
     */
    const pilha = error instanceof Error ? String(error.stack || "").split("\n").slice(1, 4).map(l => l.trim()).join(" | ") : "";
    console.error("[writer-handoff]",
      error instanceof RadarWriterSendError ? error.code : error instanceof Error ? error.name : "unknown",
      error instanceof Error ? error.message : String(error), "::", pilha);
    if (error instanceof RadarWriterSendError) {
      return NextResponse.json({
        success: false,
        code: error.code,
        error: error.message,
        /* O bloqueio viaja inteiro: quem opera precisa saber o que falta. */
        blocks: error.readiness?.blocks || [],
      }, { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof RadarStartError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido de envio ao Redator inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}

