/**
 * Diagnóstico técnico das falhas do ciclo de vida da keyword.
 *
 * Camada pura, sem `server-only` e sem `next/server`, para poder ser testada
 * sem banco e sem runtime de servidor. A mensagem visível ao usuário continua
 * amigável em outra camada; aqui o objetivo é não perder a causa real.
 *
 * Isto é observabilidade, não autorização: nenhuma falha diagnosticada aqui
 * autoriza exclusão.
 */

/** Nunca deixar credencial atravessar o diagnóstico devolvido ao cliente. */
// `(?:bearer\s+)?` evita o caso `Authorization: Bearer <jwt>`, em que o esquema
// seria consumido no lugar do segredo e o token escaparia intacto.
const LIFECYCLE_SENSITIVE = /(token|secret|password|senha|authorization|apikey|api_key|bearer|service_role)\s*[:=]?\s*(?:bearer\s+)?\S+|postgres(?:ql)?:\/\/\S+/gi;

export function sanitizeLifecycleDiagnosticValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(LIFECYCLE_SENSITIVE, match => `${match.split(/[:=\s]/)[0]}=[redacted]`)
    .slice(0, 300);
}

export type KeywordLifecycleDiagnostic = {
  stage: string;
  httpStatus: number;
  code: string;
  message: string | null;
  postgresCode: string | null;
  postgresMessage: string | null;
  postgresDetails: string | null;
  postgresHint: string | null;
  constraint: string | null;
  relation: string | null;
};

/**
 * Extrai o que existir no erro original. Campos ausentes permanecem `null` —
 * nada é inventado.
 */
export function lifecycleErrorDiagnostic(
  error: unknown,
  input: { stage: string; httpStatus: number; code: string },
): KeywordLifecycleDiagnostic {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = sanitizeLifecycleDiagnosticValue(value.message)
    || (error instanceof Error ? sanitizeLifecycleDiagnosticValue(error.message) : null);
  const details = sanitizeLifecycleDiagnosticValue(value.details);
  const haystack = `${message || ""} ${details || ""}`;
  return {
    stage: input.stage,
    httpStatus: input.httpStatus,
    code: input.code,
    message,
    postgresCode: sanitizeLifecycleDiagnosticValue(value.code),
    postgresMessage: message,
    postgresDetails: details,
    postgresHint: sanitizeLifecycleDiagnosticValue(value.hint),
    constraint: sanitizeLifecycleDiagnosticValue(value.constraint)
      || haystack.match(/constraint "([^"]+)"/)?.[1]
      || null,
    relation: sanitizeLifecycleDiagnosticValue(value.relation)
      || sanitizeLifecycleDiagnosticValue(value.table)
      || haystack.match(/relation "([^"]+)"/)?.[1]
      || null,
  };
}
