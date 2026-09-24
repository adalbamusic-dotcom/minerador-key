import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import type { LegacyImportList } from "@/lib/minerador/legacy-import";
import { importSubjectsWithCore, type SubjectImportRefusalCode } from "@/lib/minerador/keyword-import-core";

/**
 * IMPORT DE ASSUNTOS PELO PROCESSADOR (SDD 2026-09-24, F1.3).
 *
 * `mode: "preview"` não escreve nada; `mode: "apply"` cria as novas como
 * `bruto` com a declaração e declara nas existentes só os ids marcados pelo
 * humano (`declareExistingIds`). A marca vem da rota; o ator é
 * `auth.users.id`. Nenhuma chamada paga. O import órfão do workspace não é
 * ressuscitado: esta rota deduplica pela keyword normalizada da marca.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SubjectEntrySchema = z.object({
  keyword: z.string().max(400),
  note: z.string().max(2000).nullable().optional(),
  destinationUrl: z.string().max(2048).nullable().optional(),
  listaReference: z.string().trim().max(240).nullable().optional(),
});

const SubjectImportRequestSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  importRequestId: z.string().uuid().optional(),
  source: z.enum(["manual", "csv"]).default("csv"),
  entries: z.array(SubjectEntrySchema).min(1).max(2000),
  defaultListaId: z.string().trim().max(120).nullable().optional(),
  declareExistingIds: z.array(z.string().uuid()).max(2000).default([]),
});

const REFUSAL_STATUS: Record<SubjectImportRefusalCode, number> = {
  ACTOR_REQUIRED: 401,
  BRAND_REQUIRED: 404,
  IMPORT_REQUEST_REQUIRED: 400,
  IMPORT_REQUEST_IN_PROGRESS: 409,
};

function failure(code: string, status: number, message: string, diagnostic: Record<string, unknown> = {}, stage = "subject_import") {
  return NextResponse.json({ success: false, code, stage, message, diagnostic }, { status });
}

function safeDatabaseError(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown } : {};
  return { databaseCode: typeof value.code === "string" && /^[A-Z0-9_ -]{1,40}$/.test(value.code) ? value.code : "database_error" };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca inválida.", { requestId }, "tenant_validation");
    const input = SubjectImportRequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });

    const listsResult = await profile.supabase.from("minerador_keyword_lists").select("id,nome,marca_id").eq("marca_id", context.brandId);
    if (listsResult.error) throw listsResult.error;
    const brandResult = await profile.supabase.from("marcas").select("id,site_url").eq("id", context.brandId).maybeSingle();
    if (brandResult.error) throw brandResult.error;
    const brandSiteUrl = brandResult.data && typeof (brandResult.data as { site_url?: unknown }).site_url === "string"
      ? (brandResult.data as { site_url: string }).site_url
      : null;

    const result = await importSubjectsWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      supabase: profile.supabase,
      mode: input.mode,
      source: input.source,
      items: input.entries,
      declareExistingIds: input.declareExistingIds,
      importRequestId: input.importRequestId ?? null,
      lists: (listsResult.data || []) as LegacyImportList[],
      defaultListaId: input.defaultListaId ?? null,
      brandSiteUrl,
    });
    if (!result.ok) return failure(result.code, REFUSAL_STATUS[result.code], result.reason, { requestId }, "subject_import_validation");
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof ZodError) return failure("INVALID_SUBJECT_IMPORT_REQUEST", 400, "A solicitação de import de Assuntos é inválida.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) }, "payload_validation");
    if (error instanceof AuthzError) return failure(error.status === 401 ? "SUBJECT_IMPORT_UNAUTHENTICATED" : "SUBJECT_IMPORT_AUTHORIZATION_FAILED", error.status, error.message, { requestId }, "authorization");
    return failure("SUBJECT_IMPORT_FAILED", 503, "O import de Assuntos não pôde ser concluído.", { requestId, ...safeDatabaseError(error) }, "subject_import_persistence");
  }
}
