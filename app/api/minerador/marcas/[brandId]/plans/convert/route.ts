import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { DECLARED_PLAN_ARTICLES_MAX, DECLARED_PLAN_LOCK_CHOICES, DECLARED_PLAN_ROLES, DECLARED_PLAN_SCOPE_MAX } from "@/lib/minerador/declared-plan";
import { CONVERSION_WITHOUT_GROUP, convertLegacySubjectsWithCore, readConversionDraftWithCore } from "@/lib/minerador/subject-conversion-core";
import { serverConversionFollowUp } from "@/lib/server/minerador-subject-conversion";
import { EDITORIAL_GROUP_REFUSAL_STATUS, editorialGroupsClient, editorialGroupsFailure, safeDatabaseCode } from "@/lib/server/editorial-groups";

/**
 * CONVERTER O ASSUNTO DO FORMATO ANTERIOR (SDD
 * `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §5).
 *
 * GET `?groupId=` — o rascunho (linhas-título do grupo, artigo, keyword
 * sugerida, alternativas, Silo e ordem do SiloDNA vigente). Só leitura.
 *
 * POST `{ mode, groupId, silo?, rows, importRequestId }` — `preview` não grava;
 * `apply` grava pelo MESMO núcleo do card (`importDeclaredPlanWithCore`) e, em
 * seguida, roda a Lógica (grátis), aprova (D2-bis) e envia ao Arquiteto pelos
 * núcleos de sempre. A linha-título não é tocada; nada vai para a lixeira; nada
 * pago. A marca vem da rota; o ator é `auth.users.id`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RowSchema = z.object({
  fromKeywordId: z.string().uuid(),
  articleId: z.string().min(1).max(400).nullable(),
  order: z.number().int().min(1).max(DECLARED_PLAN_ARTICLES_MAX),
  role: z.enum(DECLARED_PLAN_ROLES),
  title: z.string().trim().min(1).max(400),
  keyword: z.string().trim().min(1).max(400),
  scope: z.string().max(DECLARED_PLAN_SCOPE_MAX * 2),
  lock: z.enum(DECLARED_PLAN_LOCK_CHOICES).nullable().optional(),
}).strict();

/** 2026-10-18 · o grupo, ou "sem-grupo" (o Assunto anterior sem cor; SDD sdd-assunto-pela-principal-e-volume-2026-10-18 §6.2-d). */
const GroupIdSchema = z.union([z.string().uuid(), z.literal(CONVERSION_WITHOUT_GROUP)]);

const RequestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  groupId: GroupIdSchema,
  silo: z.object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().max(200).nullable().optional(),
    objective: z.string().max(4000).nullable().optional(),
  }).strict().nullable().optional(),
  rows: z.array(RowSchema).min(1).max(DECLARED_PLAN_ARTICLES_MAX),
  importRequestId: z.string().uuid().optional(),
}).strict();

const STATUS: Record<string, number> = {
  NOTHING_TO_CONVERT: 400,
  SILO_REQUIRED: 400,
  GROUP_NOT_FOUND: 404,
  ACTOR_REQUIRED: 401,
  BRAND_REQUIRED: 404,
  PLAN_REQUIRED: 400,
  IMPORT_REQUEST_REQUIRED: 400,
  IMPORT_REQUEST_IN_PROGRESS: 409,
  PLAN_BLOCKED: 422,
  GROUP_REFUSED: 409,
  GROUPS_NOT_AVAILABLE: EDITORIAL_GROUP_REFUSAL_STATUS.GROUPS_NOT_AVAILABLE,
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const groupId = request.nextUrl.searchParams.get("groupId") || "";
    if (!GroupIdSchema.safeParse(groupId).success) return editorialGroupsFailure("INVALID_CONVERSION_READ", 400, "Informe o grupo (groupId) ou “sem-grupo”.", { requestId });
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "view", profile });
    const result = await readConversionDraftWithCore({ brandId: context.brandId, keywordsClient: profile.supabase, groupsClient: editorialGroupsClient(), groupId });
    if (!result.ok) return editorialGroupsFailure(result.code, STATUS[result.code] ?? 409, result.reason, { requestId });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "CONVERSION_UNAUTHENTICATED" : "CONVERSION_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("CONVERSION_READ_FAILED", 503, "O formato anterior não pôde ser lido agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: input.mode === "apply" ? "edit" : "view", profile });
    // Converter aprova e envia no mesmo clique: quem não pode aprovar não converte (a prévia diz).
    if (input.mode === "apply") await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "approve", profile });
    const brandResult = await profile.supabase.from("marcas").select("id,site_url").eq("id", context.brandId).maybeSingle();
    if (brandResult.error) throw brandResult.error;
    const brandSiteUrl = brandResult.data && typeof (brandResult.data as { site_url?: unknown }).site_url === "string" ? (brandResult.data as { site_url: string }).site_url : null;
    const result = await convertLegacySubjectsWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      keywordsClient: profile.supabase,
      groupsClient: editorialGroupsClient(),
      mode: input.mode,
      groupId: input.groupId,
      silo: input.silo ?? null,
      rows: input.rows,
      importRequestId: input.importRequestId ?? null,
      brandSiteUrl,
      followUp: input.mode === "apply" ? serverConversionFollowUp(context.brandId, context.actorUserId) : null,
    });
    if (!result.ok) return editorialGroupsFailure(result.code, STATUS[result.code] ?? 409, result.reason, { requestId, ...(result.blockers ? { blockers: result.blockers } : {}) });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof ZodError) return editorialGroupsFailure("INVALID_CONVERSION_REQUEST", 400, "O pedido de conversão é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code, message: issue.message })) });
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "CONVERSION_UNAUTHENTICATED" : "CONVERSION_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("CONVERSION_FAILED", 503, "A conversão não pôde ser feita agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}
