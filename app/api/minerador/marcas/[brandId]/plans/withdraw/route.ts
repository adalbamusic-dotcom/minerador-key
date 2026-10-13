import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { withdrawFromDeclaredPlanWithCore, type DeclaredPlanWithdrawRefusalCode } from "@/lib/minerador/declared-plan-withdraw-core";
import { assertCanReadEditorialGroups, EDITORIAL_GROUP_REFUSAL_STATUS, editorialGroupsClient, editorialGroupsFailure, safeDatabaseCode } from "@/lib/server/editorial-groups";

/**
 * TIRAR DO PLANO (SDD 2026-10-12 §6.1-5) — o núcleo único
 * `withdrawFromDeclaredPlanWithCore`.
 *
 * - GET `?groupId=`: os artigos do plano declarado do grupo (só leitura; quem
 *   vê qualquer área editorial da marca).
 * - POST `{ groupId, subjectKeywordId, mode: "preview" }`: o que muda e o
 *   `decisionHash`; nada é gravado.
 * - POST `{ groupId, subjectKeywordId, mode: "apply", decisionHash }`: grava
 *   só a decisão tomada sobre a prévia vigente, com releitura. Exige
 *   `minerador:edit` (o plano é do Minerador). Nada é apagado; nada pago.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  groupId: z.string().uuid(),
  subjectKeywordId: z.string().trim().min(1).max(200),
  mode: z.enum(["preview", "apply"]),
  decisionHash: z.string().trim().min(1).max(200).optional(),
}).strict();

const REFUSAL_STATUS: Record<DeclaredPlanWithdrawRefusalCode, number> = {
  ACTOR_REQUIRED: 401,
  BRAND_REQUIRED: 404,
  GROUP_WITHOUT_PLAN: 404,
  NOT_IN_PLAN: 409,
  PILLAR_CANNOT_LEAVE: 409,
  LAST_ARTICLE: 409,
  DECISION_REQUIRED: 400,
  DECISION_STALE: 409,
  WITHDRAW_IN_PROGRESS: 409,
  WRITE_REFUSED: 422,
  WRITE_NOT_CONFIRMED: 503,
  GROUP_REFUSED: 409,
  GROUPS_NOT_AVAILABLE: EDITORIAL_GROUP_REFUSAL_STATUS.GROUPS_NOT_AVAILABLE,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failureFrom(error: unknown, requestId: string) {
  if (error instanceof ZodError) return editorialGroupsFailure("INVALID_PLAN_WITHDRAW_REQUEST", 400, "O pedido de tirar do plano é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) });
  if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "PLAN_WITHDRAW_UNAUTHENTICATED" : "PLAN_WITHDRAW_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
  return editorialGroupsFailure("PLAN_WITHDRAW_FAILED", 503, "O plano não pôde ser lido ou alterado agora.", { requestId, databaseCode: safeDatabaseCode(error) });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const groupId = request.nextUrl.searchParams.get("groupId") || "";
    if (!UUID.test(groupId)) return editorialGroupsFailure("INVALID_PLAN_WITHDRAW_REQUEST", 400, "Informe o grupo (uuid).", { requestId });
    const profile = await requireCanonicalSessionProfile();
    const context = await assertCanReadEditorialGroups(profile, brandId);
    const result = await withdrawFromDeclaredPlanWithCore({ brandId: context.brandId, actorUserId: profile.userId, keywordsClient: profile.supabase, groupsClient: editorialGroupsClient(), mode: "list", groupId });
    if (!result.ok) return editorialGroupsFailure(result.code, REFUSAL_STATUS[result.code], result.reason, { requestId });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    return failureFrom(error, requestId);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const result = await withdrawFromDeclaredPlanWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      keywordsClient: profile.supabase,
      groupsClient: editorialGroupsClient(),
      mode: input.mode,
      groupId: input.groupId,
      subjectKeywordId: input.subjectKeywordId,
      decisionHash: input.decisionHash ?? null,
    });
    if (!result.ok) return editorialGroupsFailure(result.code, REFUSAL_STATUS[result.code], result.reason, { requestId });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    return failureFrom(error, requestId);
  }
}
