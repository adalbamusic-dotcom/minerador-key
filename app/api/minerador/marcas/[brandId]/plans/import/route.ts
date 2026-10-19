import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { EDITORIAL_GROUP_COLORS } from "@/lib/editorial/editorial-groups";
import { DECLARED_PLAN_ARTICLES_MAX, DECLARED_PLAN_LOCK_CHOICES, DECLARED_PLAN_ROLES, DECLARED_PLAN_SCOPE_MAX } from "@/lib/minerador/declared-plan";
import { importDeclaredPlanWithCore, readDeclaredPlanCardRows, type DeclaredPlanImportRefusalCode } from "@/lib/minerador/declared-plan-import-core";
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

/*
 * 2026-10-13 · CADASTRO ÚNICO (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`):
 * o card manda as linhas estruturadas (`subject` = título do Assunto,
 * `principal` = a keyword que o carrega, `lock` = automática/travada/livre) e
 * o destino (Silo novo, Silo existente ou artigo publicado). O Silo é opcional
 * no destino publicado e no Silo existente (vem do grupo).
 */
const StructuredPlanSchema = z.object({
  silo: z.object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().max(200).nullable().optional(),
    objective: z.string().max(4000).nullable().optional(),
  }).strict().nullable().optional(),
  articles: z.array(z.object({
    order: z.number().int().min(1).max(99),
    subject: z.string().trim().max(400),
    principal: z.string().trim().max(400).nullable().optional(),
    role: z.enum(DECLARED_PLAN_ROLES),
    scope: z.string().max(DECLARED_PLAN_SCOPE_MAX * 2),
    lock: z.enum(DECLARED_PLAN_LOCK_CHOICES).nullable().optional(),
    /** 2026-10-16 · o slug do artigo ("/silo/artigo/", URL ou "artigo"); ausente = mantém o gravado; null = tira. O núcleo normaliza e recusa o inválido. */
    slug: z.string().trim().max(400).nullable().optional(),
  }).strict()).min(1).max(DECLARED_PLAN_ARTICLES_MAX + 10),
}).strict();

const DestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_silo") }).strict(),
  z.object({ kind: z.literal("existing_silo"), groupId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("published"), url: z.string().trim().min(1).max(2048) }).strict(),
  // 2026-10-18 · "Keyword (sem Silo)" (SDD sdd-assunto-pela-principal-e-volume-2026-10-18 §6.2-a): sem grupo, sem plano, sem trava.
  z.object({ kind: z.literal("keyword"), keywordId: z.string().uuid().optional(), keyword: z.string().trim().min(1).max(400).optional(), basis: z.enum(["zero", "low"]).nullable().optional() }).strict()
    .refine(value => Boolean(value.keywordId) || Boolean(value.keyword), "Informe a keyword (id ou texto)."),
]);

const RequestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  text: z.string().max(60000).optional(),
  plan: StructuredPlanSchema.optional(),
  group: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), groupId: z.string().uuid() }).strict(),
    z.object({ mode: z.literal("new"), name: z.string().max(200).nullable().optional(), color: z.enum(EDITORIAL_GROUP_COLORS) }).strict(),
  ]).optional(),
  destination: DestinationSchema.optional(),
  importRequestId: z.string().uuid().optional(),
  /** 2026-10-13 · Silo existente: "append" (padrão) ou "replace" (SDD sdd-arquiteto-so-le-e-listas-leves §5.2). */
  planMode: z.enum(["append", "replace"]).optional(),
  /** 2026-10-13 · "replace": o decisionHash da prévia das quatro listas (obrigatório no apply). */
  decisionHash: z.string().trim().min(1).max(200).optional(),
  /** 2026-10-16 · o texto traz vários Silos (CSV de planejamento): o Silo a cadastrar agora. Sem ele, 422 SILO_CHOICE_REQUIRED com os Silos. */
  siloName: z.string().trim().min(1).max(200).optional(),
}).strict().refine(value => Boolean(value.text?.trim()) !== Boolean(value.plan), "Envie o texto colado ou o plano estruturado (um dos dois).")
  .refine(value => Boolean(value.group) || value.destination?.kind === "keyword", "Escolha o grupo (cor) do cadastro.");

const REFUSAL_STATUS: Record<DeclaredPlanImportRefusalCode, number> = {
  ACTOR_REQUIRED: 401,
  BRAND_REQUIRED: 404,
  PLAN_REQUIRED: 400,
  IMPORT_REQUEST_REQUIRED: 400,
  IMPORT_REQUEST_IN_PROGRESS: 409,
  PLAN_BLOCKED: 422,
  GROUP_REFUSED: 409,
  GROUPS_NOT_AVAILABLE: EDITORIAL_GROUP_REFUSAL_STATUS.GROUPS_NOT_AVAILABLE,
  DECISION_REQUIRED: 400,
  DECISION_STALE: 409,
  WITHDRAWAL_FAILED: 409,
  SILO_CHOICE_REQUIRED: 422,
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
      // O destino "Keyword (sem Silo)" não usa grupo (o núcleo nem o lê).
      group: input.group ?? { mode: "new", name: null, color: "" },
      destination: input.destination ?? null,
      importRequestId: input.importRequestId ?? null,
      brandSiteUrl,
      planMode: input.planMode ?? null,
      decisionHash: input.decisionHash ?? null,
      siloName: input.siloName ?? null,
    });
    if (!result.ok) return editorialGroupsFailure(result.code, REFUSAL_STATUS[result.code], result.reason, { requestId, ...(result.blockers ? { blockers: result.blockers } : {}) });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof ZodError) return editorialGroupsFailure("INVALID_PLAN_IMPORT_REQUEST", 400, "O pedido de importação do plano é inválido.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code, message: issue.message })) });
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "PLAN_IMPORT_UNAUTHENTICATED" : "PLAN_IMPORT_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("PLAN_IMPORT_FAILED", 503, "O plano do Silo não pôde ser importado agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}

/**
 * GET `?groupId=` — o plano GRAVADO do grupo no formato do card (leitura
 * compatível, SDD 2026-10-13 §5): título, keyword, detalhes, papel, ordem e
 * trava de cada artigo. Só leitura; nada é regravado por ler.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return editorialGroupsFailure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId });
    const groupId = request.nextUrl.searchParams.get("groupId") || "";
    if (!z.string().uuid().safeParse(groupId).success) return editorialGroupsFailure("INVALID_PLAN_READ_REQUEST", 400, "Informe o grupo (groupId).", { requestId });
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "view", profile });
    const result = await readDeclaredPlanCardRows({ brandId: context.brandId, keywordsClient: profile.supabase, groupsClient: editorialGroupsClient(), groupId });
    if (!result.ok) return editorialGroupsFailure(result.code, result.code === "GROUP_NOT_FOUND" ? 404 : EDITORIAL_GROUP_REFUSAL_STATUS.GROUPS_NOT_AVAILABLE, result.reason, { requestId });
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof AuthzError) return editorialGroupsFailure(error.status === 401 ? "PLAN_IMPORT_UNAUTHENTICATED" : "PLAN_IMPORT_AUTHORIZATION_FAILED", error.status, error.message, { requestId });
    return editorialGroupsFailure("PLAN_READ_FAILED", 503, "O plano do Silo não pôde ser lido agora.", { requestId, databaseCode: safeDatabaseCode(error) });
  }
}
