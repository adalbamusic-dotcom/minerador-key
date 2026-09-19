/**
 * ===== PRÉ-M3 · ANCORAGEM E SUBSTITUIÇÃO DE MÍDIA =====
 *
 * Duas ações num contrato discriminado, pelo mesmo motivo que
 * `editorial/workflow` faz assim: são a mesma fronteira — "quem ocupa esta
 * posição" — e separá-las em rotas convidaria a autorizar uma e esquecer a
 * outra.
 *
 * ==================== O QUE O CLIENTE NÃO DECIDE ====================
 *
 * A marca vem da sessão canônica e da permissão editorial, nunca do corpo. Os
 * `assetId` que chegam são ponteiros, e só resolvem DENTRO da marca já
 * validada: um id de outra marca não encontra linha. O servidor relê o estado
 * dos dois ativos e reexecuta as validações — o corpo da requisição não é
 * autoridade sobre âncora, arquivo, hash nem sobre quem é o atual.
 *
 * ==================== NADA AQUI APAGA ====================
 *
 * A substituição marca o predecessor e abre a janela de 48h. Não existe DELETE,
 * não existe purge e não existe cron. A ausência de purge continua sendo o modo
 * seguro: o pior desfecho é guardar demais.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { MEDIA_ANCHOR_KINDS, anchorWriterMediaAsset, replaceWriterMediaAsset, signWriterMediaPreview, updateWriterMediaBrief } from "@/lib/server/writer-media-lifecycle";

export const runtime = "nodejs";

const AnchorSchema = z.object({
  action: z.literal("anchor"),
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  anchorKind: z.enum(MEDIA_ANCHOR_KINDS),
  anchorRef: z.string().trim().min(1).max(512),
}).strict();

const ReplaceSchema = z.object({
  action: z.literal("replace"),
  brandId: z.string().uuid(),
  predecessorAssetId: z.string().uuid(),
  successorAssetId: z.string().uuid(),
}).strict();

/*
 * `preview` e `update_brief` entram na MESMA rota porque compartilham a
 * fronteira: quem pode ver e editar mídia de uma marca é quem tem permissão
 * editorial nela. Rotas separadas convidariam a autorizar uma e esquecer outra.
 */
const PreviewSchema = z.object({
  action: z.literal("preview"),
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
}).strict();

const UpdateBriefSchema = z.object({
  action: z.literal("update_brief"),
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  altText: z.string().max(1000).optional(),
  objective: z.string().trim().min(1).max(2000).optional(),
  prompt: z.string().trim().min(1).max(12000).optional(),
}).strict();

const BodySchema = z.discriminatedUnion("action", [AnchorSchema, ReplaceSchema, PreviewSchema, UpdateBriefSchema]);

/** Recusa é 409: o pedido é legítimo, o ESTADO é que não permite. */
const STATUS_POR_DESFECHO: Record<string, number> = {
  unavailable: 503, not_found: 404, refused: 409, failed: 502, readback_failed: 502,
  /* Entregável finalizado: a recusa é de estado, não de erro. */
  finalized: 409,
  /* Ativo sem arquivo não é erro do servidor: não há o que assinar. */
  no_file: 409,
};

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const body = BodySchema.parse(await request.json());
    await assertEditorialPermission(profile, body.brandId, "redator", "edit");

    const outcome = body.action === "anchor"
      ? await anchorWriterMediaAsset({
          brandId: body.brandId, assetId: body.assetId,
          anchor: { kind: body.anchorKind, ref: body.anchorRef }, actorId: profile.userId,
        })
      : body.action === "replace"
      ? await replaceWriterMediaAsset({
          brandId: body.brandId, predecessorAssetId: body.predecessorAssetId,
          successorAssetId: body.successorAssetId, actorId: profile.userId,
        })
      : body.action === "preview"
      ? await signWriterMediaPreview({ brandId: body.brandId, assetId: body.assetId })
      : await updateWriterMediaBrief({
          brandId: body.brandId, assetId: body.assetId, altText: body.altText,
          objective: body.objective, prompt: body.prompt, actorId: profile.userId,
        });

    if (outcome.status === "replaced" || outcome.status === "anchored"
        || outcome.status === "signed" || outcome.status === "updated") {
      /*
       * A URL assinada não pode ficar em cache de proxy nem de navegador: ela
       * vale 60s e dá acesso direto ao objeto no bucket privado.
       */
      return NextResponse.json(outcome, outcome.status === "signed"
        ? { headers: { "Cache-Control": "no-store, private" } } : undefined);
    }
    /*
     * `unavailable` é a M3 ainda não aplicada, e precisa dizer isso em vez de
     * fingir um erro genérico: quem opera a plataforma tem que conseguir
     * distinguir "ainda não existe" de "falhou".
     */
    return NextResponse.json(outcome, { status: STATUS_POR_DESFECHO[outcome.status] ?? 500 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", issues: error.issues }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code }, { status: 503 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
