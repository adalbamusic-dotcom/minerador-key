import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ProviderRequestError } from "../lib/arquiteto/provider-client.ts";
import {
  buildOpenRouterChatRequest,
  OPENROUTER_MAX_COMPLETION_TOKENS,
  OPENROUTER_REASONING_HEADROOM,
  openRouterReasoningEffort,
  requestOpenRouterChatCompletion,
} from "../lib/server/openrouter-provider.ts";
import { generatePlainTextAI, generateStructuredAI, StructuredAIError } from "../lib/server/structured-ai.ts";
import { OPENROUTER_API_URL, OPENROUTER_DEFAULT_MODEL } from "../lib/openrouter-model-config.ts";

/*
 * IA da plataforma pela OpenRouter (2026-10-11). Tudo com fetch falso: nenhum
 * teste chama a OpenRouter nem consome crédito.
 */

const API_KEY = "fixture-openrouter-key-that-must-not-leak";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const provider = {
  provider: "openrouter" as const,
  apiKey: API_KEY,
  apiUrl: OPENROUTER_API_URL,
  model: OPENROUTER_DEFAULT_MODEL,
  extraHeaders: { "X-Title": "Minerador Key", "HTTP-Referer": "https://minerador.example" },
  thinkingMode: "provider_default" as const,
};

test("o pedido à OpenRouter não leva temperature e soma a folga do raciocínio ao orçamento da resposta", () => {
  const body = buildOpenRouterChatRequest({ apiUrl: OPENROUTER_API_URL, apiKey: API_KEY, model: OPENROUTER_DEFAULT_MODEL, system: "s", user: "u", maxTokens: 4_000, thinkingMode: "disabled" });
  assert.equal("temperature" in body, false);
  assert.equal("thinking" in body, false);
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.equal(body.max_tokens, 4_000 + OPENROUTER_REASONING_HEADROOM.none);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.model, OPENROUTER_DEFAULT_MODEL);

  const text = buildOpenRouterChatRequest({ apiUrl: OPENROUTER_API_URL, apiKey: API_KEY, model: OPENROUTER_DEFAULT_MODEL, system: "s", user: "u", maxTokens: 2_000, responseFormat: "text" });
  assert.equal("response_format" in text, false);
  assert.deepEqual(text.reasoning, { effort: "medium", exclude: true });
  assert.equal(text.max_tokens, 2_000 + OPENROUTER_REASONING_HEADROOM.medium);
});

test("o modo de Thinking vira esforço de raciocínio e o teto do modelo é respeitado", () => {
  /* 2026-10-18 · "disabled" desliga de verdade; só o modelo de raciocínio obrigatório (variante -pro) fica no mínimo "low". */
  assert.equal(openRouterReasoningEffort("disabled"), "none");
  assert.equal(openRouterReasoningEffort("disabled", "anthropic/claude-haiku-5.5"), "none");
  assert.equal(openRouterReasoningEffort("disabled", "openai/gpt-6-luna"), "none");
  assert.equal(openRouterReasoningEffort("disabled", "openai/gpt-6-luna-pro"), "low");
  assert.equal(openRouterReasoningEffort("disabled", "openai/gpt-6.1-sol-pro"), "low");
  const pro = buildOpenRouterChatRequest({ apiUrl: OPENROUTER_API_URL, apiKey: API_KEY, model: "openai/gpt-6.1-sol-pro", system: "s", user: "u", maxTokens: 4_000, thinkingMode: "disabled" });
  assert.deepEqual(pro.reasoning, { effort: "low", exclude: true });
  assert.equal(pro.max_tokens, 4_000 + OPENROUTER_REASONING_HEADROOM.low);
  assert.equal(openRouterReasoningEffort("provider_default"), "medium");
  assert.equal(openRouterReasoningEffort(undefined), "medium");
  assert.equal(openRouterReasoningEffort("enabled"), "high");
  const huge = buildOpenRouterChatRequest({ apiUrl: OPENROUTER_API_URL, apiKey: API_KEY, model: OPENROUTER_DEFAULT_MODEL, system: "s", user: "u", maxTokens: 500_000, thinkingMode: "enabled" });
  assert.equal(huge.max_tokens, OPENROUTER_MAX_COMPLETION_TOKENS);
});

test("a chamada vai só para a OpenRouter, com a chave no Authorization e os cabeçalhos de atribuição", async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const result = await requestOpenRouterChatCompletion({
    apiUrl: OPENROUTER_API_URL,
    apiKey: API_KEY,
    model: OPENROUTER_DEFAULT_MODEL,
    system: "s",
    user: "u",
    maxTokens: 1_000,
    extraHeaders: provider.extraHeaders,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
      return response({
        choices: [{ message: { content: JSON.stringify({ ok: true }) }, finish_reason: "stop", native_finish_reason: "completed" }],
        usage: { prompt_tokens: 10, completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 850 } },
      });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[0].headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(calls[0].headers["X-Title"], "Minerador Key");
  assert.equal(calls[0].headers["HTTP-Referer"], "https://minerador.example");
  assert.equal(result.content, JSON.stringify({ ok: true }));
  assert.equal(result.diagnostic.reasoningTokens, 850);
  assert.equal(result.diagnostic.nativeFinishReason, "completed");
  assert.equal(JSON.stringify(result.diagnostic).includes(API_KEY), false);
});

test("HTTP 402 vira mensagem de crédito, sem reflexo do corpo do provider", async () => {
  await assert.rejects(
    requestOpenRouterChatCompletion({
      apiUrl: OPENROUTER_API_URL, apiKey: API_KEY, model: OPENROUTER_DEFAULT_MODEL, system: "s", user: "u", maxTokens: 1_000,
      fetchImpl: async () => response({ error: { code: 402, message: `Insufficient credits for ${API_KEY}` } }, 402),
    }),
    (error: unknown) => error instanceof ProviderRequestError && error.status === 402 && /créditos/.test(error.message) && !error.message.includes(API_KEY),
  );
});

test("erro do provedor de origem dentro de um 200 não passa por resposta válida", async () => {
  await assert.rejects(
    requestOpenRouterChatCompletion({
      apiUrl: OPENROUTER_API_URL, apiKey: API_KEY, model: OPENROUTER_DEFAULT_MODEL, system: "s", user: "u", maxTokens: 1_000,
      fetchImpl: async () => response({ error: { code: 503, message: "upstream overloaded" } }),
    }),
    (error: unknown) => error instanceof ProviderRequestError && error.status === 503 && error.code === "AI_PROVIDER_UNAVAILABLE",
  );
});

test("generateStructuredAI com a Connection OpenRouter valida o JSON pelo Zod e não chama a DeepSeek", async () => {
  const Schema = z.object({ answer: z.string().min(1) }).strict();
  const urls: string[] = [];
  const valid = await generateStructuredAI({
    provider,
    system: "s",
    user: "u",
    schema: Schema,
    maxTokens: 500,
    timeoutMs: 5_000,
    thinkingMode: "disabled",
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.reasoning, { effort: "none" });
      assert.equal(body.max_tokens, 500 + OPENROUTER_REASONING_HEADROOM.none);
      return response({ choices: [{ message: { content: JSON.stringify({ answer: "ok" }) }, finish_reason: "stop" }] });
    },
  });
  assert.deepEqual(valid, { answer: "ok" });
  assert.deepEqual(urls, [OPENROUTER_API_URL]);
  assert.equal(urls.some((url) => url.includes("deepseek.com")), false);
});

test("raciocínio que esgota o teto devolve erro próprio e o texto puro não repete a chamada", async () => {
  let calls = 0;
  await assert.rejects(
    generatePlainTextAI({
      provider,
      system: "s",
      user: "u",
      timeoutMs: 5_000,
      fetchImpl: async () => {
        calls += 1;
        return response({ choices: [{ message: { content: "" }, finish_reason: "length" }] });
      },
    }),
    (error: unknown) => error instanceof StructuredAIError && error.code === "AI_PROVIDER_ERROR" && /limite de tokens/.test(error.message),
  );
  assert.equal(calls, 1);
});

test("resposta vazia sem corte por tamanho continua com uma única nova tentativa no texto puro", async () => {
  let calls = 0;
  await assert.rejects(
    generatePlainTextAI({
      provider,
      system: "s",
      user: "u",
      timeoutMs: 5_000,
      fetchImpl: async () => {
        calls += 1;
        return response({ choices: [{ message: { content: "" }, finish_reason: "stop" }] });
      },
    }),
    (error: unknown) => error instanceof StructuredAIError && error.code === "AI_PROVIDER_INVALID_RESPONSE",
  );
  assert.equal(calls, 2);
});

test("provider fora do contrato é recusado antes de qualquer rede", async () => {
  let calls = 0;
  await assert.rejects(
    generateStructuredAI({
      provider: { ...provider, provider: "google_ads" as never },
      system: "s", user: "u", schema: z.object({}).strict(), timeoutMs: 5_000,
      fetchImpl: async () => { calls += 1; return response({}); },
    }),
    (error: unknown) => error instanceof StructuredAIError && error.code === "AI_PROVIDER_INVALID",
  );
  assert.equal(calls, 0);
});
