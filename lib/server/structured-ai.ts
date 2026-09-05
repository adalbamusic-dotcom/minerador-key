import "server-only";
import type { ZodType } from "zod";
import { parseStructuredJson, StructuredOutputError } from "@/lib/arquiteto/structured-output";
import { ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { requestDeepSeekChatCompletion } from "@/lib/server/deepseek-provider";
import type { DeepSeekCanonicalResolution, DeepSeekThinkingMode } from "@/lib/server/deepseek-canonical";
import type { AIProviderErrorCode } from "@/lib/server/ai-provider-config";

/**
 * Operação de saída textual: o provider responde em texto puro e a aplicação é
 * quem monta o contrato. Reutiliza a mesma Connection canônica, o mesmo
 * timeout, o mesmo diagnóstico e o mesmo mapeamento de erro do caminho JSON.
 */
export async function generatePlainTextAI({
  provider,
  system,
  user,
  timeoutMs,
  maxTokens = 2000,
  thinkingMode,
  fetchImpl,
  onDiagnostic,
}: {
  provider: Pick<DeepSeekCanonicalResolution, "provider" | "apiKey" | "apiUrl" | "model" | "extraHeaders" | "thinkingMode">;
  system: string;
  user: string;
  timeoutMs?: number;
  maxTokens?: number;
  thinkingMode?: DeepSeekThinkingMode;
  fetchImpl?: typeof fetch;
  onDiagnostic?: (diagnostic: StructuredAIDiagnostic) => void;
}): Promise<string> {
  if (user.length > 250_000) {
    throw new StructuredAIError("Payload estrategico excede o limite permitido.", 413, undefined, "AI_REQUEST_INVALID");
  }
  if (provider.provider !== "deepseek") {
    throw new StructuredAIError("A camada compartilhada de IA aceita somente a Connection DeepSeek.", 409, undefined, "AI_PROVIDER_INVALID");
  }

  const resolvedTimeout = timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 180_000);
  const runAttempt = async (attemptNumber: number): Promise<string> => {
  const diagnostic: StructuredAIDiagnostic = {
    attempt: attemptNumber,
    providerResolved: true,
    model: provider.model,
    thinkingMode: thinkingMode ?? provider.thinkingMode,
    requestStarted: false,
    httpStatus: null,
    finishReason: null,
    nativeFinishReason: null,
    contentPresent: false,
    contentLength: 0,
    reasoningPresent: false,
    providerDurationMs: null,
    jsonParsed: false,
    zodPassed: false,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolvedTimeout);
  const startedAt = Date.now();
  try {
    diagnostic.requestStarted = true;
    onDiagnostic?.({ ...diagnostic });
    const result = await requestDeepSeekChatCompletion({
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      system,
      user,
      extraHeaders: provider.extraHeaders,
      signal: controller.signal,
      maxTokens,
      thinkingMode: thinkingMode ?? provider.thinkingMode,
      responseFormat: "text",
      fetchImpl,
    });
    Object.assign(diagnostic, result.diagnostic);
    diagnostic.providerDurationMs = Date.now() - startedAt;
    onDiagnostic?.({ ...diagnostic });
    const text = result.content?.trim() || "";
    if (!text) {
      throw new StructuredAIError("O provider DeepSeek não retornou conteúdo utilizável.", 502, undefined, "AI_PROVIDER_INVALID_RESPONSE");
    }
    return text;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      diagnostic.httpStatus = error.status;
      diagnostic.providerDurationMs = Date.now() - startedAt;
      onDiagnostic?.({ ...diagnostic });
    }
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
    return await runAttempt(1);
  } catch (error) {
    // Somente a resposta sem conteúdo utilizável é recuperável. Auth, quota,
    // configuração, validação e timeout nunca são retentados automaticamente.
    const recoverable = error instanceof StructuredAIError && error.code === "AI_PROVIDER_INVALID_RESPONSE";
    if (!recoverable || MAX_PROVIDER_ATTEMPTS_PER_OPERATION < 2) throw error;
    return await runAttempt(2);
  }
}

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

export type StructuredAIDiagnostic = {
  providerResolved: boolean;
  model: string | null;
  thinkingMode: DeepSeekThinkingMode | null;
  requestStarted: boolean;
  httpStatus: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  contentPresent: boolean;
  contentLength: number;
  reasoningPresent: boolean;
  reasoningLength?: number;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  promptTokens?: number | null;
  /** Duração real da chamada ao provider, medida na aplicação. */
  providerDurationMs?: number | null;
  jsonParsed: boolean;
  zodPassed: boolean;
  /** Tentativa de provider desta operação (1 ou 2); ausente no caminho JSON. */
  attempt?: number;
};

/** Uma ação humana admite no máximo duas tentativas de provider. */
export const MAX_PROVIDER_ATTEMPTS_PER_OPERATION = 2;

export async function generateStructuredAI<T>({
  provider,
  system,
  user,
  schema,
  timeoutMs,
  maxTokens = 4000,
  thinkingMode,
  fetchImpl,
  onDiagnostic,
}: {
  provider: Pick<DeepSeekCanonicalResolution, "provider" | "apiKey" | "apiUrl" | "model" | "extraHeaders" | "thinkingMode">;
  system: string;
  user: string;
  schema: ZodType<T>;
  timeoutMs?: number;
  maxTokens?: number;
  thinkingMode?: DeepSeekThinkingMode;
  fetchImpl?: typeof fetch;
  onDiagnostic?: (diagnostic: StructuredAIDiagnostic) => void;
}): Promise<T> {
  if (user.length > 250_000) {
    throw new StructuredAIError("Payload estrategico excede o limite permitido.", 413, undefined, "AI_REQUEST_INVALID");
  }

  if (provider.provider !== "deepseek") {
    throw new StructuredAIError("A camada compartilhada de IA aceita somente a Connection DeepSeek.", 409, undefined, "AI_PROVIDER_INVALID");
  }

  // Timeout pode ser configurado via env (AI_TIMEOUT_MS). Default 180s.
  // O modo de Thinking é por operação; a ausência de override preserva o
  // contrato da Connection (incluindo o default do provider).
  const resolvedTimeout = timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 180_000);
  const attempt = async (): Promise<T> => {
    const diagnostic: StructuredAIDiagnostic = {
      providerResolved: true,
      model: provider.model,
      thinkingMode: thinkingMode ?? provider.thinkingMode,
      requestStarted: false,
      httpStatus: null,
      finishReason: null,
      nativeFinishReason: null,
      contentPresent: false,
      contentLength: 0,
      reasoningPresent: false,
      jsonParsed: false,
      zodPassed: false,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resolvedTimeout);
    try {
      diagnostic.requestStarted = true;
      onDiagnostic?.({ ...diagnostic });
      const result = await requestDeepSeekChatCompletion({
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        system,
        user,
        extraHeaders: provider.extraHeaders,
        signal: controller.signal,
        maxTokens,
        thinkingMode: thinkingMode ?? provider.thinkingMode,
        fetchImpl,
      });
      Object.assign(diagnostic, result.diagnostic);
      onDiagnostic?.({ ...diagnostic });
      if (!result.content) {
        throw new StructuredAIError("O provider DeepSeek não retornou conteúdo utilizável.", 502, undefined, "AI_PROVIDER_INVALID_RESPONSE");
      }

      try {
        const parsed = parseStructuredJson(result.content);
        diagnostic.jsonParsed = true;
        const validated = schema.safeParse(parsed);
        diagnostic.zodPassed = validated.success;
        onDiagnostic?.({ ...diagnostic });
        if (!validated.success) throw new StructuredOutputError("A IA retornou JSON fora do contrato esperado.", validated.error.issues);
        return validated.data;
      } catch (error) {
        if (error instanceof StructuredOutputError) {
          console.error("[structured-ai] resposta rejeitada", {
            reason: error.message,
            issues: error.issues,
            contentLength: diagnostic.contentLength,
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
      if (error instanceof ProviderRequestError) {
        diagnostic.httpStatus = error.status;
        onDiagnostic?.({ ...diagnostic });
      }
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

  return attempt();
}
