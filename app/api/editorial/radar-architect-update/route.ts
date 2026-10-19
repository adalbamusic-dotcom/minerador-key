import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { adoptArchitectVersionWithCore, previewArchitectUpdatesWithCore } from "@/lib/server/radar-architect-adoption";
import { supabaseRadarArchitectAdoptionStore } from "@/lib/server/radar-architect-adoption-store";

/*
 * ===== F5 · "ATUALIZAÇÃO DISPONÍVEL DO ARQUITETO" NO RADAR (SDD acelerar-fluxo 2026-10-13, item 14) =====
 *
 * GET  — a prévia (só leitura): quais itens do Radar estão atrás de uma versão
 *        aprovada mais nova do ArticleDNA, o que mudou, o que a adoção
 *        reaproveita, o que fica para refazer e o hash da decisão.
 * POST — `adopt`: a decisão humana sobre a prévia (seleção = recusa por item,
 *        `decisionHash` da mesma seleção). O mesmo núcleo do MCP
 *        `adopt_architect_version`. Nada pago, nada de IA; o Arquiteto não é tocado.
 *
 * 2026-10-14 · a prévia traz também a atualização de LINKS (grafo aprovado
 * vigente mais novo que o transportado, `updateKind: "links"`), adotada por
 * `linkArticleIds` no mesmo POST e no mesmo hash.
 */

const PreviewQuerySchema = z.object({
  brandId: z.string().uuid(),
  articleIds: z.array(z.string().trim().min(1).max(400)).max(500).optional(),
  siloId: z.string().trim().min(1).max(400).optional(),
  /* 2026-10-18 · a tela do Radar continua o congelamento novo depois da adoção (Google congelado, principal igual). */
  continueOnScreen: z.boolean().optional(),
}).strict();

/* 2026-10-14 · `linkArticleIds`: os links novos (grafo vigente) adotados; ao menos uma das duas seleções. */
const AdoptSchema = z.object({
  action: z.literal("adopt"),
  brandId: z.string().uuid(),
  articleIds: z.array(z.string().trim().min(1).max(400)).max(200),
  linkArticleIds: z.array(z.string().trim().min(1).max(400)).max(200).optional(),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/i),
  continueOnScreen: z.boolean().optional(),
}).strict().refine(input => input.articleIds.length > 0 || (input.linkArticleIds?.length ?? 0) > 0, { message: "Selecione ao menos um artigo.", path: ["articleIds"] });

function falha(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_request", error: "Pedido de adoção inválido.", details: error.issues }, { status: 400 });
  if (error instanceof OptimisticLockError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
  if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_architect_update_error", error: mapped.message }, { status: mapped.status });
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const params = request.nextUrl.searchParams;
    const ids = (params.get("articleIds") || "").split(",").map(id => id.trim()).filter(Boolean);
    const input = PreviewQuerySchema.parse({
      brandId: params.get("brandId"),
      ...(ids.length ? { articleIds: ids } : {}),
      ...(params.get("siloId") ? { siloId: params.get("siloId") } : {}),
      ...(params.get("continueOnScreen") === "1" ? { continueOnScreen: true } : {}),
    });
    await assertEditorialPermission(profile, input.brandId, "radar", "view");
    const preview = await previewArchitectUpdatesWithCore(supabaseRadarArchitectAdoptionStore(), { brandId: input.brandId, articleIds: input.articleIds ?? null, siloId: input.siloId ?? null, continueOnScreen: input.continueOnScreen });
    return NextResponse.json({ ok: true, ...preview });
  } catch (error) {
    return falha(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = AdoptSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    const result = await adoptArchitectVersionWithCore(supabaseRadarArchitectAdoptionStore(), {
      brandId: input.brandId, actorId: profile.userId, articleIds: input.articleIds, linkArticleIds: input.linkArticleIds ?? [], decisionHash: input.decisionHash.toLowerCase(),
      continueOnScreen: input.continueOnScreen,
    });
    if (result.state === "REFUSED") {
      return NextResponse.json({ ok: false, code: result.code === "STALE_DECISION" ? "decision_stale" : "nothing_to_adopt", error: result.message }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return falha(error);
  }
}
