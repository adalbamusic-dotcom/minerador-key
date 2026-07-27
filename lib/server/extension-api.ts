import { NextResponse } from "next/server";
import { AuthzError, authzErrorResponse } from "@/lib/server/authz";
import { ExtensionAuthError, logExtensionEvent } from "@/lib/server/extension-auth";

export function extensionRequestId() {
  return crypto.randomUUID();
}

export function extensionJson(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers || {}) },
  });
}

export function extensionErrorResponse(input: { requestId: string; endpoint: string; error: unknown; userId?: string }) {
  if (input.error instanceof ExtensionAuthError) {
    logExtensionEvent({ requestId: input.requestId, endpoint: input.endpoint, result: "error", code: input.error.code, userId: input.userId });
    return extensionJson({ ok: false, requestId: input.requestId, code: input.error.code, message: input.error.message, error: input.error.message }, { status: input.error.status });
  }

  if (input.error instanceof AuthzError) {
    const code = input.error.status === 403 ? "access_denied" : input.error.status === 404 ? "brand_not_found" : "internal_error";
    const status = input.error.status === 404 ? 404 : input.error.status === 403 ? 403 : input.error.status >= 500 ? 503 : input.error.status;
    logExtensionEvent({ requestId: input.requestId, endpoint: input.endpoint, result: "error", code, userId: input.userId });
    return extensionJson({ ok: false, requestId: input.requestId, code, message: input.error.message, error: input.error.message }, { status });
  }

  const mapped = authzErrorResponse(input.error);
  logExtensionEvent({ requestId: input.requestId, endpoint: input.endpoint, result: "error", code: "internal_error", userId: input.userId });
  const message = mapped.status >= 500 ? "Erro interno." : mapped.message;
  return extensionJson({ ok: false, requestId: input.requestId, code: "internal_error", message, error: message }, { status: 503 });
}
