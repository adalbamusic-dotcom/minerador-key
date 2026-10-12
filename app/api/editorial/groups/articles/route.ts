import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { GROUPS_NOT_AVAILABLE } from "@/lib/editorial/editorial-groups";
import { readArticleGroupMemberships, readGroupedKeywordIndex } from "@/lib/editorial/article-groups-store";
import { applyArticleGroupTaggingWithCore, moveArticlesToGroupWithCore, previewArticleGroupTaggingWithCore } from "@/lib/editorial/article-group-core";
import {
  assertCanReadEditorialGroups,
  assertCanTagEditorialArticles,
  editorialGroupsClient,
  editorialGroupsFailure,
  safeDatabaseCode,
} from "@/lib/server/editorial-groups";

/**
 * GRUPO DOS ARTIGOS — LER, ETIQUETAR PELAS KEYWORDS, MOVER (F2).
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §6.2-9,
 * §6.3, §8 e §9. O núcleo é `lib/editorial/article-group-core.ts` (o mesmo
 * que a formação do ArticleDNA e a importação no Radar chamam).
 *
 * - GET `?marcaId=&include=keywords`: grupo EFETIVO de cada artigo (etiqueta
 *   gravada ou herança viva das keywords) e, com `include=keywords`, o grupo
 *   de cada keyword com grupo (a aba Silos do Arquiteto). Lê quem vê qualquer
 *   área editorial da marca.
 * - POST `{ marcaId, mode: "preview" | "apply", articleIds? }`: "Etiquetar
 *   artigos pelo grupo das keywords". `preview` não grava; `apply` grava só
 *   artigo sem etiqueta (aditivo). Exige edição no Arquiteto ou no Radar.
 * - PATCH `{ marcaId, articleIds, groupId | null }`: rodapé — mover para o
 *   grupo (decisão humana) ou voltar ao grupo das keywords (`null`).
 *
 * Sem a M1, `409 GROUPS_NOT_AVAILABLE`. Nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ARTICLE_ID = z.string().min(1).max(256);

const TagSchema = z.object({
  marcaId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  articleIds: z.array(ARTICLE_ID).max(2000).optional(),
}).strict();

const MoveSchema = z.object({
  marcaId: z.string().uuid(),
  articleIds: z.array(ARTICLE_ID).min(1).max(2000),
  groupId: z.string().uuid().nullable(),
}).strict();

function failureFrom(error: unknown, requestId: string, stage: string) {
  if (error instanceof ZodError) return editorialGroupsFailure("INVALID_ARTICLE_GROUP_REQUEST", 400, "O pedido de grupo dos artigos é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) });
  if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "GROUPS_UNAUTHENTICATED" : "GROUPS_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
  return editorialGroupsFailure("ARTICLE_GROUPS_FAILED", 503, "O grupo dos artigos não pôde ser lido ou gravado agora.", { requestId, stage, databaseCode: safeDatabaseCode(error) });
}

const indisponivel = (requestId: string) => editorialGroupsFailure(GROUPS_NOT_AVAILABLE, 409, "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada).", { requestId });

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const brandId = request.nextUrl.searchParams.get("marcaId") || "";
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const profile = await requireCanonicalSessionProfile();
    await assertCanReadEditorialGroups(profile, brandId);
    const client = editorialGroupsClient();
    const leitura = await readArticleGroupMemberships(client, brandId);
    if (!leitura.ok) return indisponivel(requestId);
    const comKeywords = request.nextUrl.searchParams.get("include") === "keywords";
    const keywords = comKeywords ? await readGroupedKeywordIndex(client, brandId) : null;
    if (keywords && !keywords.ok) return indisponivel(requestId);
    return NextResponse.json({
      success: true,
      available: true,
      requestId,
      articles: [...leitura.memberships.values()].map(item => ({ articleId: item.articleId, groupId: item.groupId, origin: item.origin, persisted: item.persisted, conflict: item.conflict })),
      ...(keywords ? { keywords: keywords.rows } : {}),
    });
  } catch (error) {
    return failureFrom(error, requestId, "read");
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const input = TagSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await assertCanTagEditorialArticles(profile, input.marcaId);
    const client = editorialGroupsClient();
    if (input.mode === "preview") {
      const previa = await previewArticleGroupTaggingWithCore(client, { brandId: context.brandId, articleIds: input.articleIds ?? null });
      if (!previa.ok) return indisponivel(requestId);
      return NextResponse.json({ success: true, requestId, mode: "preview", entries: previa.entries, willTagCount: previa.willTagCount });
    }
    const resultado = await applyArticleGroupTaggingWithCore(client, { brandId: context.brandId, actorUserId: context.actorUserId, articleIds: input.articleIds ?? null, trigger: "explicit" });
    if (!resultado.ok) return indisponivel(requestId);
    return NextResponse.json({ success: true, requestId, mode: "apply", tagged: resultado.tagged, notConfirmed: resultado.notConfirmed, skipped: resultado.skipped, eventRecorded: resultado.eventRecorded });
  } catch (error) {
    return failureFrom(error, requestId, "tag");
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const input = MoveSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await assertCanTagEditorialArticles(profile, input.marcaId);
    const resultado = await moveArticlesToGroupWithCore(editorialGroupsClient(), { brandId: context.brandId, actorUserId: context.actorUserId, articleIds: input.articleIds, groupId: input.groupId });
    if (!resultado.ok) return indisponivel(requestId);
    return NextResponse.json({ success: true, requestId, ...resultado });
  } catch (error) {
    return failureFrom(error, requestId, "move");
  }
}
