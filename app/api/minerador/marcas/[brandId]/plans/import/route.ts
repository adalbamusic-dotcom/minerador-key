import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { EDITORIAL_GROUP_COLORS } from "@/lib/editorial/editorial-groups";
import { DECLARED_PLAN_ARTICLES_MAX, DECLARED_PLAN_ROLES, DECLARED_PLAN_SCOPE_MAX } from "@/lib/minerador/declared-plan";
import { importDeclaredPlanWithCore, type DeclaredPlanImportRefusalCode } from "@/lib/minerador/declared-plan-import-core";
import { EDITORIAL_GROUP_REFUSAL_STATUS, editorialGroupsClient, editorialGroupsFailure, safeDatabaseCode } from "@/lib/server/editorial-groups";

/**
 * IMPORTAR PLANO DO SILO (SDD 2026-10-12 §6.1-6, F4).
 *
 * `{ mode, text | plan, group, importRequestId }`. `preview` não escreve nada;
 * `apply` cria (ou acha) o grupo, declara os Assuntos com o plano e liga a
 * principal declarada, pelo núcleo único `importDeclaredPlanWithCore` — o
 * mesmo da ferramenta MCP `declare_silo_plan`. A marca vem da rota; o ator é
 * `auth.users.id`. Nenhuma chamada paga.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const StructuredPlanSchema = z.object({
  silo: z.object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().max(200).nullable().optional(),
    objective: z.string().max(4000).nullable().optional(),
  }).strict(),
  articles: z.array(z.object({
    order: z.number().int().min(1).max(99),
    subject: z.string().trim().min(1).max(400),
    principal: z.string().trim().max(400).nullable().optional(),
    role: z.enum(DECLARED_PLAN_ROLES),
    scope: z.string().max(DECLARED_PLAN_SCOPE_MAX * 2),
  }).strict()).min(1).max(DECLARED_PLAN_ARTICLES_MAX + 10),
}).strict();

const RequestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  text: z.string().max(60000).optional(),
  plan: StructuredPlanSchema.optional(),
  group: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), groupId: z.string().uuid() }).strict(),
    z.object({ mode: z.literal("new"), name: z.string().max(200).nullable().optional(), color: z.enum(EDITORIAL_GROUP_COLORS) }).strict(),
  ]),
  importRequestId: z.string().uuid().optional(),
}).strict().refine(value => Boolean(value.text?.trim()) !== Boolean(value.plan), "Envie o texto colado ou o plano estruturado (um dos dois).");

const REFUSAL_STATUS: Record<DeclaredPlanImportRefusalCode, number> = {
  ACTOR_REQUIRED: 401,
  BRAND_REQUIRED: 404,
  PLAN_REQUIRED: 400,
  IMPORT_REQUEST_REQUIRED: 400,
  IMPORT_REQUEST_IN_PROGRESS: 409,
  PLAN_BLOCKED: 422,
  GROUP_REFUSED: 409,
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
    const result = await importDeclaredPlanWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      keywordsClient: profile.supabase,
      groupsClient: editorialGroupsClient(),
      mode: input.mode,
      text: input.text ?? null,
      plan: input.plan ?? null,
      group: input.group,
      importRequestId: input.importRequestId ?? null,
      brandSiteUrl,
    });
    if (!result.ok) return editorialGroupsFailure(result.code, REFUSAL_STATUS[result.code], result.reason, { requestId, ...(result.blockers ? { blockers: result.blockers } : {}) });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof ZodError) return editorialGroupsFailure("INVALID_PLAN_IMPORT_REQUEST", 400, "O pedido de importação do plano é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code, message: issue.message })) });
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "PLAN_IMPORT_UNAUTHENTICATED" : "PLAN_IMPORT_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("PLAN_IMPORT_FAILED", 503, "O plano do Silo não pôde ser importado agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}
