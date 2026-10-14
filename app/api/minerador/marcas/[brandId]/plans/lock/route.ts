import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { DECLARED_PLAN_LOCK_CHOICES } from "@/lib/minerador/declared-plan";
import { KEYWORD_PLAN_LOCK_MAX, setKeywordPlanLockWithCore, type KeywordPlanLockResult } from "@/lib/minerador/declared-plan-import-core";
import { EDITORIAL_GROUP_REFUSAL_STATUS, editorialGroupsClient, editorialGroupsFailure, safeDatabaseCode } from "@/lib/server/editorial-groups";

/**
 * A TRAVA DA KEYWORD DO PLANO PELO "POSTO DE PRINCIPAL" (pedido do dono,
 * 2026-10-13: "no minerador eu coloco como [Travado ao slug] e ele não aceita").
 *
 * `{ mode, keywordIds, lock, importRequestId }`. Na keyword NÃO publicada que
 * carrega o plano, o select "Posto de principal" (Revisão Humana e "Vínculo das
 * selecionadas") é a trava do cadastro. Esta rota grava pelo núcleo único do
 * cadastro (`setKeywordPlanLockWithCore` → `importDeclaredPlanWithCore`, destino
 * "Silo existente"): nova versão do plano quando muda, releitura, recusa por
 * item ("Para travar, cadastre o artigo em Cadastrar Assuntos."). `preview` não
 * grava. A marca vem da rota; o ator é `auth.users.id`. Nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  keywordIds: z.array(z.string().uuid()).min(1).max(KEYWORD_PLAN_LOCK_MAX),
  lock: z.enum(DECLARED_PLAN_LOCK_CHOICES),
  importRequestId: z.string().uuid().optional(),
}).strict();

const REFUSAL_STATUS: Record<Extract<KeywordPlanLockResult, { ok: false }>["code"], number> = {
  ACTOR_REQUIRED: 401,
  BRAND_REQUIRED: 404,
  KEYWORDS_REQUIRED: 400,
  LOCK_REQUIRED: 400,
  IMPORT_REQUEST_REQUIRED: 400,
  GROUPS_NOT_AVAILABLE: EDITORIAL_GROUP_REFUSAL_STATUS.GROUPS_NOT_AVAILABLE,
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const brandResult = await profile.supabase.from("marcas").select("id,site_url").eq("id", context.brandId).maybeSingle();
    if (brandResult.error) throw brandResult.error;
    const brandSiteUrl = brandResult.data && typeof (brandResult.data as { site_url?: unknown }).site_url === "string"
      ? (brandResult.data as { site_url: string }).site_url
      : null;
    const result = await setKeywordPlanLockWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      keywordsClient: profile.supabase,
      groupsClient: editorialGroupsClient(),
      mode: input.mode,
      keywordIds: input.keywordIds,
      lock: input.lock,
      importRequestId: input.importRequestId ?? null,
      brandSiteUrl,
    });
    if (!result.ok) return editorialGroupsFailure(result.code, REFUSAL_STATUS[result.code], result.reason, { requestId });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof ZodError) return editorialGroupsFailure("INVALID_PLAN_LOCK_REQUEST", 400, "O pedido da trava é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code, message: issue.message })) });
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "PLAN_LOCK_UNAUTHENTICATED" : "PLAN_LOCK_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("PLAN_LOCK_FAILED", 503, "A trava não pôde ser gravada agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}
