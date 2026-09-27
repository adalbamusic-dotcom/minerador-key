import "server-only";

import { AuthzError } from "@/lib/server/authz";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { DifferentiationConflictError } from "@/lib/server/arquiteto-differentiation-store";

/**
 * O erro das três rotas de diferenciação, dito igual: conflito de proposta é
 * 409; autorização e contexto seguem o mapeamento do Arquiteto; o resto é 503
 * com um código estável — nunca a mensagem crua do banco ou do provider.
 */
export function differentiationErrorResponse(error: unknown, fallbackMessage: string): { status: number; body: Record<string, unknown> } {
  if (error instanceof DifferentiationConflictError) return { status: 409, body: { success: false, code: error.code, error: error.message } };
  if (error instanceof AuthzError) return { status: error.status, body: { success: false, code: error.status === 401 ? "DIFFERENTIATION_UNAUTHENTICATED" : "DIFFERENTIATION_AUTHORIZATION_FAILED", error: error.message } };
  const mapped = pipelineArtifactErrorResponse(error);
  if (mapped.status !== 503) return { status: mapped.status, body: mapped.body };
  return { status: 503, body: { success: false, code: "DIFFERENTIATION_FAILED", error: fallbackMessage } };
}
