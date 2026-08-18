import "server-only";
import type { ZodType } from "zod";
import { parseStructuredOutput, StructuredOutputError } from "@/lib/arquiteto/structured-output";
import { ProviderRequestError, requestProviderContent } from "@/lib/arquiteto/provider-client";
import { AIProviderConfigurationError, type AIProviderErrorCode, resolveAIProvider } from "@/lib/server/ai-provider-config";

export class StructuredAIError extends Error {
  status: number;
  issues?: unknown;
  code: AIProviderErrorCode | "AI_OUTPUT_INVALID" | "AI_REQUEST_INVALID";

  constructor(
    message: string,
    status = 502,
    issues?: unknown,
    code: StructuredAIError["code"] = "AI_PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "StructuredAIError";
    this.status = status;
    this.issues = issues;
    this.code = code;
  }
}

function providerConfig() {
  try {
    return resolveAIProvider();
  } catch (error) {
    if (error instanceof AIProviderConfigurationError) {
      throw new StructuredAIError(error.message, error.status, undefined, error.code);
    }
    throw error;
  }
}

export async function generateStructuredAI<T>({
  system,
  user,
  schema,
  timeoutMs,
  maxTokens = 4000,
}: {
  system: string;
  user: string;
  schema: ZodType<T>;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<T> {
  if (user.length > 250_000) {
    throw new StructuredAIError("Payload estrategico excede o limite permitido.", 413, undefined, "AI_REQUEST_INVALID");
  }

  // Timeout pode ser configurado via env (AI_TIMEOUT_MS). Default 180s.
  // Modelos grandes (deepseek-v4-pro) podem demorar mais para JSON estruturado.
  const resolvedTimeout = timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 180_000);
  const provider = providerConfig();

  // Retry unico em caso de timeout: modelos de IA podem ter latencia variavel.
  // A primeira tentativa usa o timeout completo; a segunda usa metade.
  const attempt = async (attemptTimeoutMs: number): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
    try {
      const content = await requestProviderContent({
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        system,
        user,
        extraHeaders: provider.extraHeaders,
        signal: controller.signal,
        maxTokens,
      });

      try {
        return parseStructuredOutput(content, schema);
      } catch (error) {
        if (error instanceof StructuredOutputError) {
          console.error("[structured-ai] resposta rejeitada", {
            reason: error.message,
            issues: error.issues,
            contentLength: content.length,
          });
          const firstIssue = Array.isArray(error.issues) ? error.issues[0] as { path?: PropertyKey[]; message?: string } : null;
          const issueDetail = firstIssue
            ? ` Campo ${firstIssue.path?.map(String).join(".") || "raiz"}: ${firstIssue.message || "valor invalido"}.`
            : "";
          throw new StructuredAIError(`${error.message}${issueDetail}`, 502, error.issues, "AI_OUTPUT_INVALID");
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof StructuredAIError) throw error;
      if (error instanceof ProviderRequestError) throw new StructuredAIError(error.message, error.status, undefined, error.code);
      if (error instanceof Error && error.name === "AbortError") {
        throw new StructuredAIError("A IA excedeu o tempo limite.", 504, undefined, "AI_TIMEOUT");
      }
      throw new StructuredAIError("Falha sanitizada na operação de IA.", 502, undefined, "AI_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await attempt(resolvedTimeout);
  } catch (error) {
    // Retry somente em caso de timeout (504). Erros de validacao ou API nao retentam.
    if (error instanceof StructuredAIError && error.status === 504) {
      console.warn("[structured-ai] timeout na primeira tentativa, retentando com metade do tempo...");
      return await attempt(Math.max(60_000, Math.floor(resolvedTimeout / 2)));
    }
    throw error;
  }
}
