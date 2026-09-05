type SafeInternalError = { code: string; message: string };

const sensitiveValuePattern = /\b(developer[\s_-]*token|access[\s_-]*token|refresh[\s_-]*token|client[\s_-]*secret|authorization|password|secret)\b\s*[:=]?\s*(?:bearer\s+)?[^\s,;]+/gi;

export function sanitizeDiscoveryInternalError(error: unknown): SafeInternalError {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof value.code === "string" && /^[A-Z0-9_ -]{1,40}$/i.test(value.code)
    ? value.code
    : "internal_error";
  const rawMessage = typeof value.message === "string"
    ? value.message
    : error instanceof Error
      ? error.message
      : "A etapa posterior à persistência retornou um erro sem mensagem.";
  return {
    code,
    message: rawMessage.replace(sensitiveValuePattern, "$1=[redacted]").slice(0, 240),
  };
}

export function buildDiscoveryPostPersistenceWarning(error: unknown, input: {
  internalStage: string;
  providerRequestId: string | null;
  extra?: Record<string, unknown>;
}) {
  const internal = sanitizeDiscoveryInternalError(error);
  return {
    ...(input.extra || {}),
    apiRequestStarted: true,
    providerResponseReceived: true,
    failureType: "INTERNAL_POST_REQUEST_ERROR",
    internalStage: input.internalStage,
    internalErrorCode: internal.code,
    internalErrorMessage: internal.message,
    providerRequestId: input.providerRequestId,
    googleAdsRequestId: input.providerRequestId,
    persisted: true,
    partialPersistence: false,
    postPersistenceWarning: true,
  };
}
