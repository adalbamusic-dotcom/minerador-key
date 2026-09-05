import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { buildDeepSeekChatRequest, requestDeepSeekChatCompletion } from "../lib/server/deepseek-provider.ts";
import { generateStructuredAI, StructuredAIError } from "../lib/server/structured-ai.ts";

const API_URL = "https://api.deepseek.com/chat/completions";
const API_KEY = "fixture-secret-that-must-not-leak";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("DeepSeek envia JSON mode e não fixa thinking globalmente", () => {
  const defaultBody = buildDeepSeekChatRequest({
    apiUrl: API_URL,
    apiKey: API_KEY,
    model: "deepseek-v4-pro",
    system: "system",
    user: "user",
    maxTokens: 1200,
    thinkingMode: "provider_default",
  });
  assert.deepEqual(defaultBody.response_format, { type: "json_object" });
  assert.equal(defaultBody.max_tokens, 1200);
  assert.equal("thinking" in defaultBody, false);

  const disabledBody = buildDeepSeekChatRequest({
    apiUrl: API_URL,
    apiKey: API_KEY,
    model: "deepseek-v4-pro",
    system: "system",
    user: "user",
    maxTokens: 1200,
    thinkingMode: "disabled",
  });
  assert.deepEqual(disabledBody.thinking, { type: "disabled" });
});

test("DeepSeek retorna content vazio para o chamador validar explicitamente", async () => {
  let calls = 0;
  const result = await requestDeepSeekChatCompletion({
    apiUrl: API_URL,
    apiKey: API_KEY,
    model: "deepseek-v4-pro",
    system: "system",
    user: "user",
    maxTokens: 1200,
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(String(url), API_URL);
      return response({ choices: [{ message: { content: "" }, finish_reason: "stop" }] });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.content, null);
  assert.deepEqual(result.diagnostic, {
    httpStatus: 200,
    finishReason: "stop",
    nativeFinishReason: null,
    contentPresent: false,
    contentLength: 0,
    reasoningPresent: false,
  });
});

test("DeepSeek mantém somente sinal de reasoning quando o conteúdo JSON é utilizável", async () => {
  const result = await requestDeepSeekChatCompletion({
    apiUrl: API_URL,
    apiKey: API_KEY,
    model: "deepseek-v4-pro",
    system: "system",
    user: "user",
    maxTokens: 1200,
    fetchImpl: async () => response({ choices: [{ message: { reasoning_content: "raciocínio privado", content: JSON.stringify({ answer: "ok" }) }, finish_reason: "stop" }] }),
  });
  assert.equal(result.content, JSON.stringify({ answer: "ok" }));
  assert.equal(result.diagnostic.reasoningPresent, true);
  assert.equal(JSON.stringify(result.diagnostic).includes("raciocínio privado"), false);
});

test("generateStructuredAI aplica JSON.parse e Zod e não tenta outro provider", async () => {
  const Schema = z.object({ answer: z.string().min(1) }).strict();
  let calls = 0;
  const valid = await generateStructuredAI({
    provider: {
      provider: "deepseek",
      apiKey: API_KEY,
      apiUrl: API_URL,
      model: "deepseek-v4-pro",
      extraHeaders: {},
      thinkingMode: "disabled",
    },
    system: "system",
    user: "user",
    schema: Schema,
    maxTokens: 500,
    timeoutMs: 5000,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(String(url), API_URL);
      assert.deepEqual(JSON.parse(String(init?.body)).response_format, { type: "json_object" });
      return response({ choices: [{ message: { content: JSON.stringify({ answer: "ok" }) }, finish_reason: "stop" }] });
    },
  });
  assert.deepEqual(valid, { answer: "ok" });
  assert.equal(calls, 1);

  await assert.rejects(
    generateStructuredAI({
      provider: {
        provider: "deepseek",
        apiKey: API_KEY,
        apiUrl: API_URL,
        model: "deepseek-v4-pro",
        extraHeaders: {},
        thinkingMode: "disabled",
      },
      system: "system",
      user: "user",
      schema: Schema,
      maxTokens: 500,
      timeoutMs: 5000,
      fetchImpl: async () => response({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }),
    }),
    (error: unknown) => error instanceof StructuredAIError && error.code === "AI_PROVIDER_INVALID_RESPONSE",
  );
});

test("DEEPSEEK_FAILURE_OPENROUTER_CALLS = 0", async () => {
  const calls: string[] = [];
  await assert.rejects(
    requestDeepSeekChatCompletion({
      apiUrl: API_URL,
      apiKey: API_KEY,
      model: "deepseek-v4-pro",
      system: "system",
      user: "user",
      maxTokens: 500,
      fetchImpl: async (url) => {
        calls.push(String(url));
        return response({ error: { message: "fixture failure" } }, 503);
      },
    }),
  );
  assert.deepEqual(calls, [API_URL]);
  assert.equal(calls.some((url) => url.toLowerCase().includes("openrouter")), false);
});

test("diagnóstico da IA separa JSON inválido de JSON fora do schema", async () => {
  const Schema = z.object({ answer: z.string().min(1) }).strict();
  const diagnostics: Array<{ jsonParsed: boolean; zodPassed: boolean; contentPresent: boolean; reasoningPresent: boolean }> = [];
  await assert.rejects(
    generateStructuredAI({
      provider: { provider: "deepseek", apiKey: API_KEY, apiUrl: API_URL, model: "deepseek-v4-pro", extraHeaders: {}, thinkingMode: "provider_default" },
      system: "system", user: "user", schema: Schema, maxTokens: 500, timeoutMs: 5000,
      fetchImpl: async () => response({ choices: [{ message: { content: "{invalid" }, finish_reason: "length" }] }),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    (error: unknown) => error instanceof StructuredAIError && error.code === "AI_OUTPUT_INVALID",
  );
  assert.equal(diagnostics.at(-1)?.jsonParsed, false);
  assert.equal(diagnostics.at(-1)?.zodPassed, false);
  assert.equal(diagnostics.at(-1)?.contentPresent, true);

  const schemaDiagnostics: Array<{ jsonParsed: boolean; zodPassed: boolean }> = [];
  await assert.rejects(
    generateStructuredAI({
      provider: { provider: "deepseek", apiKey: API_KEY, apiUrl: API_URL, model: "deepseek-v4-pro", extraHeaders: {}, thinkingMode: "disabled" },
      system: "system", user: "user", schema: Schema, maxTokens: 500, timeoutMs: 5000,
      fetchImpl: async () => response({ choices: [{ message: { content: JSON.stringify({ other: true }) }, finish_reason: "stop" }] }),
      onDiagnostic: (diagnostic) => schemaDiagnostics.push(diagnostic),
    }),
    (error: unknown) => error instanceof StructuredAIError && error.code === "AI_OUTPUT_INVALID",
  );
  assert.equal(schemaDiagnostics.at(-1)?.jsonParsed, true);
  assert.equal(schemaDiagnostics.at(-1)?.zodPassed, false);
});
