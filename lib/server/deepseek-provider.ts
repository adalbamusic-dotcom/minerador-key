import "server-only";

import { fetchProviderResponse, ProviderRequestError } from "@/lib/arquiteto/provider-client";
import type { DeepSeekThinkingMode } from "@/lib/server/deepseek-canonical";

export type DeepSeekProviderRequest = {
  apiUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  thinkingMode?: DeepSeekThinkingMode;
  temperature?: number;
  /** "json_object" (padrão canônico) ou "text" para operações de saída textual. */
  responseFormat?: "json_object" | "text";
  extraHeaders?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export type DeepSeekProviderResponseDiagnostic = {
  httpStatus: number;
  finishReason: string | null;
  nativeFinishReason: string | null;
  contentPresent: boolean;
  contentLength: number;
  reasoningPresent: boolean;
  reasoningLength: number;
  completionTokens: number | null;
  reasoningTokens: number | null;
  promptTokens: number | null;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildDeepSeekChatRequest(input: Omit<DeepSeekProviderRequest, "fetchImpl" | "signal">) {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
    max_tokens: input.maxTokens,
    temperature: input.temperature ?? 0,
  };
  // O envelope JSON continua sendo o padrão; o modo texto é explícito por operação.
  if ((input.responseFormat ?? "json_object") === "json_object") body.response_format = { type: "json_object" };
  if (input.thinkingMode === "enabled" || input.thinkingMode === "disabled") {
    body.thinking = { type: input.thinkingMode };
  }
  return body;
}

export function extractDeepSeekTextContent(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!Array.isArray(value)) return null;
  const text = value.flatMap((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return [];
    const candidate = (part as Record<string, unknown>).text;
    return typeof candidate === "string" ? [candidate] : [];
  }).join("\n").trim();
  return text || null;
}

export async function requestDeepSeekChatCompletion(input: DeepSeekProviderRequest): Promise<{
  response: Response;
  envelope: Record<string, unknown>;
  content: string | null;
  diagnostic: DeepSeekProviderResponseDiagnostic;
}> {
  const response = await fetchProviderResponse(input.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
      ...(input.extraHeaders || {}),
    },
    body: JSON.stringify(buildDeepSeekChatRequest(input)),
    signal: input.signal,
  }, input.fetchImpl || fetch);

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ProviderRequestError("O provider DeepSeek retornou um envelope inválido.", 502, "AI_PROVIDER_INVALID_RESPONSE");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProviderRequestError("O provider DeepSeek retornou um envelope inválido.", 502, "AI_PROVIDER_INVALID_RESPONSE");
  }
  const envelope = raw as Record<string, unknown>;
  const choices = Array.isArray(envelope.choices) ? envelope.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0]) ? choices[0] as Record<string, unknown> : null;
  const message = firstChoice?.message && typeof firstChoice.message === "object" && !Array.isArray(firstChoice.message)
    ? firstChoice.message as Record<string, unknown>
    : null;
  const content = extractDeepSeekTextContent(message?.content);
  const reasoning = text(message?.reasoning_content) || text(message?.reasoning) || text(envelope.reasoning_content);
  const usage = envelope.usage && typeof envelope.usage === "object" && !Array.isArray(envelope.usage) ? envelope.usage as Record<string, unknown> : null;
  const usageDetails = usage?.completion_tokens_details && typeof usage.completion_tokens_details === "object" && !Array.isArray(usage.completion_tokens_details)
    ? usage.completion_tokens_details as Record<string, unknown>
    : null;
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    response,
    envelope,
    content,
    diagnostic: {
      httpStatus: response.status,
      finishReason: text(firstChoice?.finish_reason),
      nativeFinishReason: text(firstChoice?.native_finish_reason) || text(envelope.native_finish_reason),
      contentPresent: Boolean(content),
      contentLength: content?.length || 0,
      reasoningPresent: Boolean(reasoning),
      reasoningLength: reasoning?.length || 0,
      completionTokens: numberOrNull(usage?.completion_tokens),
      reasoningTokens: numberOrNull(usageDetails?.reasoning_tokens) ?? numberOrNull(usage?.reasoning_tokens),
      promptTokens: numberOrNull(usage?.prompt_tokens),
    },
  };
}
