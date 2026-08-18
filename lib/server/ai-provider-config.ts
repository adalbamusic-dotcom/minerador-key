export type AIProviderId = "deepseek" | "openrouter";

export type AIProviderErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_INVALID"
  | "AI_CREDENTIAL_MISSING"
  | "AI_PROVIDER_AUTHENTICATION"
  | "AI_PROVIDER_RATE_LIMIT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_ERROR"
  | "AI_PROVIDER_INVALID_RESPONSE"
  | "AI_TIMEOUT";

export interface ResolvedAIProvider {
  provider: AIProviderId;
  apiKey: string;
  apiUrl: string;
  model: string;
  extraHeaders: Record<string, string>;
}

export type AIProviderEnvironment = Readonly<Record<string, string | undefined>>;

export class AIProviderConfigurationError extends Error {
  readonly code: Extract<AIProviderErrorCode, "AI_PROVIDER_NOT_CONFIGURED" | "AI_PROVIDER_INVALID" | "AI_CREDENTIAL_MISSING">;
  readonly status = 503;

  constructor(
    code: Extract<AIProviderErrorCode, "AI_PROVIDER_NOT_CONFIGURED" | "AI_PROVIDER_INVALID" | "AI_CREDENTIAL_MISSING">,
    message: string,
  ) {
    super(message);
    this.name = "AIProviderConfigurationError";
    this.code = code;
  }
}

export function resolveAIProvider(env: AIProviderEnvironment = process.env): ResolvedAIProvider {
  const rawProvider = env.AI_PROVIDER?.trim().toLowerCase();
  if (!rawProvider) {
    throw new AIProviderConfigurationError(
      "AI_PROVIDER_NOT_CONFIGURED",
      "Nenhum provider de IA foi explicitamente configurado.",
    );
  }

  if (rawProvider !== "deepseek" && rawProvider !== "openrouter") {
    throw new AIProviderConfigurationError(
      "AI_PROVIDER_INVALID",
      "O provider de IA configurado não é suportado.",
    );
  }

  const provider = rawProvider as AIProviderId;
  const apiKey = provider === "deepseek" ? env.DEEPSEEK_API_KEY?.trim() : env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new AIProviderConfigurationError(
      "AI_CREDENTIAL_MISSING",
      "A credencial do provider de IA configurado não está disponível.",
    );
  }

  if (provider === "deepseek") {
    return {
      provider,
      apiKey,
      apiUrl: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      extraHeaders: {},
    };
  }

  return {
    provider,
    apiKey,
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: env.OPENROUTER_MODEL?.trim() || "deepseek/deepseek-v4-pro",
    extraHeaders: {
      "HTTP-Referer": env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
      "X-Title": "Minerador Key",
    },
  };
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
