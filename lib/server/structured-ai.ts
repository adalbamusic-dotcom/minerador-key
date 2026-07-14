import "server-only";
import type { ZodType } from "zod";
import { parseStructuredOutput, StructuredOutputError } from "@/lib/arquiteto/structured-output";
import { ProviderRequestError, requestProviderContent } from "@/lib/arquiteto/provider-client";

export class StructuredAIError extends Error {
  status: number;
  issues?: unknown;

  constructor(message: string, status = 502, issues?: unknown) {
    super(message);
    this.name = "StructuredAIError";
    this.status = status;
    this.issues = issues;
  }
}

function providerConfig(): {
  apiKey: string;
  apiUrl: string;
  model: string;
  extraHeaders: Record<string, string>;
} {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    return {
      apiKey: deepseekKey,
      apiUrl: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      extraHeaders: {},
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      apiKey: openRouterKey,
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-pro",
      extraHeaders: {
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "Minerador Key",
      },
    };
  }

  throw new StructuredAIError("Nenhum provedor de IA esta configurado.", 503);
}

export async function generateStructuredAI<T>({
  system,
  user,
  schema,
  timeoutMs = 90_000,
}: {
  system: string;
  user: string;
  schema: ZodType<T>;
  timeoutMs?: number;
}): Promise<T> {
  if (user.length > 250_000) {
    throw new StructuredAIError("Payload estrategico excede o limite permitido.", 413);
  }

  const provider = providerConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const content = await requestProviderContent({
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      system,
      user,
      extraHeaders: provider.extraHeaders,
      signal: controller.signal,
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
        throw new StructuredAIError(`${error.message}${issueDetail}`, 502, error.issues);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof StructuredAIError) throw error;
    if (error instanceof ProviderRequestError) throw new StructuredAIError(error.message, error.status);
    if (error instanceof Error && error.name === "AbortError") {
      throw new StructuredAIError("A IA excedeu o tempo limite.", 504);
    }
    throw new StructuredAIError(error instanceof Error ? error.message : "Erro desconhecido na IA.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
