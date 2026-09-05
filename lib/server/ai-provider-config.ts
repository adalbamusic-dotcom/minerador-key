/**
 * Compatibility error contract for routes that still map shared provider
 * failures. New AI operations must resolve a Connection through
 * deepseek-canonical.ts; this module deliberately has no ENV resolver.
 */
export type AIProviderId = "deepseek";

export type AIProviderErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_INVALID"
  | "AI_CREDENTIAL_MISSING"
  | "AI_PROVIDER_AUTHENTICATION"
  | "AI_PROVIDER_RATE_LIMIT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_ERROR"
  | "AI_PROVIDER_INVALID_RESPONSE"
  | "AI_TIMEOUT"
  | "AI_PROVIDER_CONNECTION_REQUIRED";

export interface ResolvedAIProvider {
  provider: AIProviderId;
  apiKey: string;
  apiUrl: string;
  model: string;
  extraHeaders: Record<string, string>;
}

export type AIProviderEnvironment = Readonly<Record<string, string | undefined>>;

export class AIProviderConfigurationError extends Error {
  readonly code: Extract<AIProviderErrorCode, "AI_PROVIDER_NOT_CONFIGURED" | "AI_PROVIDER_INVALID" | "AI_CREDENTIAL_MISSING" | "AI_PROVIDER_CONNECTION_REQUIRED">;
  readonly status = 503;

  constructor(
    code: Extract<AIProviderErrorCode, "AI_PROVIDER_NOT_CONFIGURED" | "AI_PROVIDER_INVALID" | "AI_CREDENTIAL_MISSING" | "AI_PROVIDER_CONNECTION_REQUIRED">,
    message: string,
  ) {
    super(message);
    this.name = "AIProviderConfigurationError";
    this.code = code;
  }
}

export function resolveAIProvider(_env: AIProviderEnvironment = process.env): never {
  void _env;
  throw new AIProviderConfigurationError(
    "AI_PROVIDER_CONNECTION_REQUIRED",
    "Operações novas de IA devem resolver uma Connection DeepSeek server-side.",
  );
}

export function aiProviderErrorResponse(error: unknown): { status: number; code: AIProviderErrorCode; message: string } {
  if (error instanceof AIProviderConfigurationError) {
    return { status: error.status, code: error.code, message: error.message };
  }

  if (error instanceof Error && "status" in error && "code" in error) {
    const candidate = error as Error & { status?: unknown; code?: unknown };
    if (typeof candidate.status === "number" && typeof candidate.code === "string") {
      return {
        status: candidate.status,
        code: candidate.code as AIProviderErrorCode,
        message: error.message,
      };
    }
  }

  return { status: 502, code: "AI_PROVIDER_ERROR", message: "Falha sanitizada na operação de IA." };
}
