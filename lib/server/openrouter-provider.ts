import "server-only";

import { fetchProviderResponse, ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { parseChatCompletionResponse, type ChatCompletionResult } from "@/lib/server/deepseek-provider";
import type { DeepSeekThinkingMode } from "@/lib/server/deepseek-canonical";

/*
 * Chamada chat/completions na OpenRouter (formato OpenAI).
 *
 * Diferenças em relação à DeepSeek, todas deliberadas:
 * - sem `temperature`: os modelos de raciocínio da OpenAI não aceitam o campo;
 * - o raciocínio é pedido por `reasoning.effort` e não volta na resposta
 *   (`exclude: true`), mas é cobrado;
 * - `max_tokens` na OpenRouter INCLUI o raciocínio. Cada operação pede só o
 *   orçamento da resposta; aqui somamos a folga do raciocínio para o modelo não
 *   gastar tudo pensando e devolver `finish_reason: "length"` vazio.
 */

export type OpenRouterReasoningEffort = "none" | "low" | "medium" | "high";

/** Folga de tokens de raciocínio somada ao orçamento da resposta, por esforço. */
export const OPENROUTER_REASONING_HEADROOM: Record<OpenRouterReasoningEffort, number> = {
  none: 0,
  low: 8_000,
  medium: 16_000,
  high: 32_000,
};

/**
 * Modelos que a OpenRouter marca com raciocínio obrigatório recusam `effort: "none"`.
 * Na lista da plataforma, são as variantes "-pro" da OpenAI.
 */
export function openRouterModelRequiresReasoning(model: string | undefined): boolean {
  return /-pro(?::[a-z0-9._-]+)?$/i.test((model ?? "").trim());
}

/** Teto de saída do modelo padrão (`max_completion_tokens` publicado pela OpenRouter). */
export const OPENROUTER_MAX_COMPLETION_TOKENS = 128_000;

/**
 * O modo de Thinking das operações vira esforço de raciocínio.
 * "disabled" desliga (`effort: "none"`), menos nos modelos de raciocínio
 * obrigatório, em que vira o mínimo seguro ("low"). Sem override, vale o esforço médio.
 *
 * SUBSTITUÍDO em 2026-10-18: "disabled" virava sempre "low". No Claude Haiku 5.5
 * o "low" é pensamento adaptativo: no teste real do artigo-modelo do Radar, 12.274
 * de 16.000 tokens foram de raciocínio e a resposta saiu cortada nas duas tentativas.
 */
export function openRouterReasoningEffort(thinkingMode: DeepSeekThinkingMode | undefined, model?: string): OpenRouterReasoningEffort {
  if (thinkingMode === "disabled") return openRouterModelRequiresReasoning(model) ? "low" : "none";
  if (thinkingMode === "enabled") return "high";
  return "medium";
}

export function openRouterMaxTokens(answerTokens: number, effort: OpenRouterReasoningEffort) {
  const answer = Number.isFinite(answerTokens) && answerTokens > 0 ? Math.floor(answerTokens) : 2_000;
  return Math.min(answer + OPENROUTER_REASONING_HEADROOM[effort], OPENROUTER_MAX_COMPLETION_TOKENS);
}

export type OpenRouterProviderRequest = {
  apiUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** Orçamento da RESPOSTA. A folga do raciocínio é somada aqui dentro. */
  maxTokens: number;
  thinkingMode?: DeepSeekThinkingMode;
  responseFormat?: "json_object" | "text";
  extraHeaders?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export function buildOpenRouterChatRequest(input: Omit<OpenRouterProviderRequest, "fetchImpl" | "signal">) {
  const effort = openRouterReasoningEffort(input.thinkingMode, input.model);
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
    max_tokens: openRouterMaxTokens(input.maxTokens, effort),
    reasoning: effort === "none" ? { effort } : { effort, exclude: true },
  };
  if ((input.responseFormat ?? "json_object") === "json_object") body.response_format = { type: "json_object" };
  return body;
}

function upstreamErrorCode(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).code;
  if (typeof code === "number" && Number.isFinite(code)) return code;
  if (typeof code === "string" && /^\d{3}$/.test(code.trim())) return Number(code.trim());
  return 0;
}

function classifyUpstream(status: number): ProviderRequestError["code"] {
  if (status === 401 || status === 403) return "AI_PROVIDER_AUTHENTICATION";
  if (status === 429) return "AI_PROVIDER_RATE_LIMIT";
  if (status === 408 || status === 425 || status === 502 || status === 503 || status === 504) return "AI_PROVIDER_UNAVAILABLE";
  return "AI_PROVIDER_ERROR";
}

export async function requestOpenRouterChatCompletion(input: OpenRouterProviderRequest): Promise<ChatCompletionResult> {
  let response: Response;
  try {
    response = await fetchProviderResponse(input.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        ...(input.extraHeaders || {}),
      },
      body: JSON.stringify(buildOpenRouterChatRequest(input)),
      signal: input.signal,
    }, input.fetchImpl || fetch);
  } catch (error) {
    // 402 é crédito: sem esta mensagem a tela diria só "erro HTTP 402".
    if (error instanceof ProviderRequestError && error.status === 402) {
      throw new ProviderRequestError("A OpenRouter recusou a chamada por falta de créditos ou de limite na chave (HTTP 402).", 402, "AI_PROVIDER_ERROR");
    }
    throw error;
  }

  const result = await parseChatCompletionResponse(response, "OpenRouter");

  // A OpenRouter pode responder 200 carregando o erro do provedor de origem.
  const choices = Array.isArray(result.envelope.choices) ? result.envelope.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0]) ? choices[0] as Record<string, unknown> : null;
  const upstreamError = result.envelope.error ?? firstChoice?.error;
  if (!result.content && upstreamError) {
    const code = upstreamErrorCode(upstreamError);
    const status = code && code >= 400 && code <= 599 ? code : 502;
    throw new ProviderRequestError(`A OpenRouter devolveu erro do provedor de origem (código ${code || "desconhecido"}).`, status, classifyUpstream(status));
  }
  return result;
}
