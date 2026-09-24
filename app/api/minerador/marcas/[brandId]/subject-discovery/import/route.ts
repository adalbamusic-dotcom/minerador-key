import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import {
  importSubjectDiscoveryWithCore,
  SubjectDiscoveryImportRequestSchema,
  type SubjectDiscoveryImportRefusalCode,
} from "@/lib/minerador/subject-discovery-import";

/**
 * PESQUISA POR ASSUNTO — IMPORT AO PROCESSADOR (SDD 2026-09-24, F1b.7).
 *
 * Leva ao Processador as candidatas que o humano selecionou na lista local da
 * Pesquisa por Assunto. A marca vem da rota; o ator é `auth.users.id`; a
 * permissão é a do import da Descoberta (`minerador:create`). O corpo não
 * aceita métrica, marca nem ator. Nenhuma chamada paga, nenhuma tabela nem RPC
 * da Descoberta: quem escreve, estreito, é o núcleo.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REFUSAL_STATUS: Record<SubjectDiscoveryImportRefusalCode, number> = {
  ACTOR_REQUIRED: 401,
  BRAND_REQUIRED: 404,
  TOO_MANY_ITEMS: 400,
  IMPORT_REQUEST_IN_PROGRESS: 409,
};

function failure(code: string, status: number, message: string, diagnostic: Record<string, unknown> = {}, stage = "subject_discovery_import") {
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
    const input = SubjectDiscoveryImportRequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "create", profile });

    const result = await importSubjectDiscoveryWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      supabase: profile.supabase,
      request: input,
    });
    if (!result.ok) return failure(result.code, REFUSAL_STATUS[result.code], result.reason, { requestId }, "subject_discovery_import_validation");
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof SyntaxError) return failure("INVALID_SUBJECT_DISCOVERY_IMPORT", 400, "O corpo do envio não é um JSON válido.", { requestId }, "payload_validation");
    if (error instanceof ZodError) return failure("INVALID_SUBJECT_DISCOVERY_IMPORT", 400, "A solicitação de envio ao Processador é inválida.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) }, "payload_validation");
    if (error instanceof AuthzError) return failure(error.status === 401 ? "SUBJECT_DISCOVERY_IMPORT_UNAUTHENTICATED" : "SUBJECT_DISCOVERY_IMPORT_AUTHORIZATION_FAILED", error.status, error.message, { requestId }, "authorization");
    return failure("SUBJECT_DISCOVERY_IMPORT_FAILED", 503, "O envio ao Processador não pôde ser concluído.", { requestId, ...safeDatabaseError(error) }, "subject_discovery_import_persistence");
  }
}
