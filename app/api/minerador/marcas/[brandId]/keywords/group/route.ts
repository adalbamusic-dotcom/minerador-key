import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { KEYWORD_GROUP_ASSIGN_MAX } from "@/lib/editorial/editorial-groups";
import { assignKeywordGroupWithCore, type AssignKeywordGroupRefusalCode } from "@/lib/minerador/keyword-group-core";
import { EDITORIAL_GROUP_REFUSAL_STATUS, editorialGroupsClient, editorialGroupsFailure, safeDatabaseCode } from "@/lib/server/editorial-groups";

/**
 * ETIQUETAR KEYWORDS COM UM GRUPO (F1) — "Grupo ▸ Mover para… / Tirar do grupo".
 *
 * `{ keywordIds, groupId | null }`. A marca vem da rota; o ator é
 * `auth.users.id`. O núcleo é `assignKeywordGroupWithCore`, o escritor único
 * de `minerador_keywords.group_id`. Grava só a coluna: nada de
 * `analise_semantica`, status ou aprovação. Nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  keywordIds: z.array(z.string().uuid()).min(1).max(KEYWORD_GROUP_ASSIGN_MAX),
  groupId: z.string().uuid().nullable(),
}).strict();

const REFUSAL_STATUS: Record<AssignKeywordGroupRefusalCode, number> = {
  ACTOR_REQUIRED: 401,
  KEYWORDS_REQUIRED: 400,
  TOO_MANY_KEYWORDS: 400,
  GROUP_NOT_FOUND: EDITORIAL_GROUP_REFUSAL_STATUS.GROUP_NOT_FOUND,
  GROUP_ARCHIVED: EDITORIAL_GROUP_REFUSAL_STATUS.GROUP_ARCHIVED,
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const result = await assignKeywordGroupWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      keywordIds: input.keywordIds,
      groupId: input.groupId,
      keywordsClient: profile.supabase,
      groupsClient: editorialGroupsClient(),
    });
    if (!result.ok) {
      const status = result.code === "GROUPS_NOT_AVAILABLE" ? EDITORIAL_GROUP_REFUSAL_STATUS.GROUPS_NOT_AVAILABLE : REFUSAL_STATUS[result.code];
      return editorialGroupsFailure(result.code, status, result.message, { requestId });
    }
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof ZodError) return editorialGroupsFailure("INVALID_KEYWORD_GROUP_REQUEST", 400, "O pedido de grupo das keywords é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) });
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "KEYWORD_GROUP_UNAUTHENTICATED" : "KEYWORD_GROUP_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("KEYWORD_GROUP_FAILED", 503, "O grupo das keywords não pôde ser gravado agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}
