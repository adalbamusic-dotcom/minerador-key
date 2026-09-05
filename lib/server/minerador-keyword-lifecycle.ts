import "server-only";

import { NextResponse } from "next/server";
import { AuthzError, authzErrorResponse, type CanonicalSessionProfile } from "./authz";
import { requireTenantPermission, type TenantContext } from "./tenant-context";
import { lifecycleErrorDiagnostic } from "@/lib/minerador/keyword-lifecycle-diagnostic";

export const KEYWORD_LIFECYCLE_ERROR_STATUS: Record<string, number> = {
  KEYWORD_DELETE_NOT_FOUND: 404,
  KEYWORD_DELETE_UNAUTHORIZED: 403,
  KEYWORD_DELETE_BRAND_MISMATCH: 403,
  KEYWORD_DELETE_TRANSACTION_FAILED: 422,
  KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: 409,
  KEYWORD_RECOVERABLE_DELETE_FAILED: 422,
  KEYWORD_RESTORE_WINDOW_EXPIRED: 409,
  KEYWORD_RESTORE_FAILED: 422,
  KEYWORD_PURGE_NOT_YET_ALLOWED: 409,
  KEYWORD_PURGE_FAILED: 422,
  LIFECYCLE_DRAFT_DESCENDANT_REQUIRES_OWNER: 409,
};

type JsonRecord = Record<string, unknown>;

function rawDatabaseError(error: unknown): { code: string | null; message: string | null } {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  return {
    code: typeof value.code === "string" ? value.code : null,
    message: typeof value.message === "string" ? value.message : null,
  };
}

export function lifecycleErrorCode(error: unknown, fallbackCode = "KEYWORD_DELETE_TRANSACTION_FAILED"): string {
  const { code, message } = rawDatabaseError(error);
  const candidate = `${message || ""} ${code || ""}`;
  const known = Object.keys(KEYWORD_LIFECYCLE_ERROR_STATUS).find(item => candidate.includes(item));
  if (known) return known;
  if (code === "PGRST202" || code === "42883") return "KEYWORD_DELETE_TRANSACTION_FAILED";
  return fallbackCode;
}

export function lifecycleErrorStatus(code: string): number {
  return KEYWORD_LIFECYCLE_ERROR_STATUS[code] || 422;
}

export function lifecycleErrorResponse(error: unknown, fallbackCode = "KEYWORD_DELETE_TRANSACTION_FAILED") {
  const mapped = authzErrorResponse(error);
  if (mapped.status !== 500 && (error instanceof AuthzError || mapped.status === 401 || mapped.status === 403)) {
    const code = mapped.status === 401 || mapped.status === 403 ? "KEYWORD_DELETE_UNAUTHORIZED" : fallbackCode;
    return NextResponse.json({
      success: false,
      code,
      message: mapped.message,
      // Observabilidade: a autorização já expunha a mensagem, mas não o estágio
      // nem o status — sem eles um 503 era indistinguível de falha de banco.
      diagnostic: lifecycleErrorDiagnostic(error, { stage: "authorization", httpStatus: mapped.status, code }),
    }, { status: mapped.status });
  }
  const code = lifecycleErrorCode(error, fallbackCode) || fallbackCode;
  const status = lifecycleErrorStatus(code);
  return NextResponse.json({
    success: false,
    code,
    message: "A operação do ciclo de vida da keyword não foi concluída. Nenhuma alteração parcial foi confirmada.",
    // A mensagem acima continua amigável; a causa técnica deixa de ser descartada.
    diagnostic: lifecycleErrorDiagnostic(error, { stage: "repository", httpStatus: status, code }),
  }, { status });
}

export async function requireMineradorLifecyclePermission(
  profile: CanonicalSessionProfile,
  brandId: string,
  action: "view" | "manage" = "manage",
): Promise<TenantContext> {
  return requireTenantPermission({
    brandId,
    actorUserId: profile.userId,
    module: "minerador",
    action,
    profile,
  });
}

export function parseRpcPayload(data: unknown): JsonRecord {
  return data && typeof data === "object" && !Array.isArray(data) ? data as JsonRecord : {};
}
