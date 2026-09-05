import assert from "node:assert/strict";
import test from "node:test";
import {
  DeepSeekR5ResponseError,
  requestDeepSeekR5Phase,
} from "../lib/minerador/deepseek-r5.ts";
import { parseSemanticReviewPhase1Output } from "../lib/minerador/semantic-review-phases.ts";

const API_URL = "https://api.deepseek.com/chat/completions";
const API_KEY = "fixture-secret";
const MODEL = "deepseek-v4-pro";

function envelope(content: string, finishReason = "stop") {
  return {
    id: "deepseek-fixture-request",
    model: MODEL,
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

function fixture(payload: unknown, status = 200) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  return {
    calls,
    fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    },
  };
}

const phase1 = {
  agreementFields: ["intent"],
  divergences: [],
  semanticEnrichments: [],
  remainingAmbiguities: null,
};

async function expectError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((value: unknown) => value);
  assert.ok(error instanceof DeepSeekR5ResponseError);
  assert.equal(error.code, code);
  return error;
}

function request(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return requestDeepSeekR5Phase({
    apiUrl: API_URL,
    apiKey: API_KEY,
    model: MODEL,
    system: "system",
    user: "user",
    phase: 1,
    maxCompletionTokens: 1100,
    thinkingMode: "enabled",
    fetchImpl,
    parseOutput: parseSemanticReviewPhase1Output,
    ...extra,
  });
}

test("R5 DeepSeek usa response_format json_object, max_tokens e thinking por operação", async () => {
  const fixtureResponse = fixture(envelope(JSON.stringify(phase1)));
  const result = await request(fixtureResponse.fetchImpl);
  assert.equal(fixtureResponse.calls.length, 1);
  assert.equal(fixtureResponse.calls[0]?.url, API_URL);
  assert.equal(fixtureResponse.calls[0]?.body.model, MODEL);
  assert.deepEqual(fixtureResponse.calls[0]?.body.response_format, { type: "json_object" });
  assert.equal(fixtureResponse.calls[0]?.body.max_tokens, 1100);
  assert.deepEqual(fixtureResponse.calls[0]?.body.thinking, { type: "enabled" });
  assert.deepEqual(result.output, phase1);
  assert.equal(result.diagnostic.provider, "deepseek");
  assert.equal(result.diagnostic.requestedMaxTokens, 1100);
  assert.equal(result.diagnostic.reasoningMode, "enabled");
  assert.equal(result.diagnostic.thinkingExplicitlyConfigured, true);
  assert.equal(result.diagnostic.reasoningEffort, null);
  assert.equal(result.diagnostic.jsonParse, "pass");
  assert.equal(result.diagnostic.schemaValidation, "pass");
  assert.equal(result.diagnostic.failureStage, "completed");
});

test("diagnóstico R5 registra reasoningEffort somente quando o envelope o fornece", async () => {
  const fixtureResponse = fixture({
    ...envelope(JSON.stringify(phase1)),
    choices: [{ message: { content: JSON.stringify(phase1) }, finish_reason: "stop", reasoning_effort: "high" }],
  });
  const result = await request(fixtureResponse.fetchImpl);
  assert.equal(result.diagnostic.reasoningEffort, "high");
});

test("R5 rejeita content vazio, JSON inválido, schema inválido e truncamento", async () => {
  const empty = fixture(envelope(""));
  const emptyError = await expectError(request(empty.fetchImpl), "AI_PROVIDER_EMPTY_CONTENT");
  assert.equal(emptyError.diagnostic.failureStage, "content");

  const malformed = fixture(envelope("{\"agreementFields\":"));
  const malformedError = await expectError(request(malformed.fetchImpl), "AI_PROVIDER_JSON_PARSE_FAILED");
  assert.equal(malformedError.diagnostic.jsonParse, "fail");
  assert.equal(malformedError.diagnostic.schemaValidation, "not_run");

  const invalid = fixture(envelope(JSON.stringify({ agreementFields: [] })));
  const invalidError = await expectError(request(invalid.fetchImpl), "AI_PROVIDER_SCHEMA_INVALID");
  assert.equal(invalidError.diagnostic.jsonParse, "pass");
  assert.equal(invalidError.diagnostic.schemaValidation, "fail");

  const truncated = fixture(envelope("", "length"));
  const truncatedError = await expectError(request(truncated.fetchImpl), "AI_PROVIDER_RESPONSE_TRUNCATED");
  assert.equal(truncatedError.diagnostic.failureStage, "truncated");
});

test("R5 diagnostica evidenceUsed com tipo errado com path, código, esperado e tipo recebido", async () => {
  const invalidPhase1 = {
    agreementFields: [],
    divergences: [{ field: "intent", suggestion: "Comercial", rationale: "Sinal semântico.", evidenceUsed: "keyword" }],
    semanticEnrichments: [],
    remainingAmbiguities: [],
  };
  const fixtureResponse = fixture(envelope(JSON.stringify(invalidPhase1)));
  const error = await expectError(request(fixtureResponse.fetchImpl), "AI_PROVIDER_SCHEMA_INVALID");
  assert.deepEqual(error.diagnostic.schemaIssuePaths, ["divergences.0.evidenceUsed"]);
  assert.equal(error.diagnostic.schemaIssues[0]?.path, "divergences.0.evidenceUsed");
  assert.equal(error.diagnostic.schemaIssues[0]?.code, "invalid_type");
  assert.equal(error.diagnostic.schemaIssues[0]?.expected, "array");
  assert.equal(error.diagnostic.schemaIssues[0]?.received, "string");
});

test("R5 mantém evidenceUsed obrigatório quando a propriedade está ausente", async () => {
  const invalidPhase1 = {
    agreementFields: [],
    divergences: [{ field: "intent", suggestion: "Comercial", rationale: "Sinal semântico." }],
    semanticEnrichments: [],
    remainingAmbiguities: [],
  };
  const fixtureResponse = fixture(envelope(JSON.stringify(invalidPhase1)));
  const error = await expectError(request(fixtureResponse.fetchImpl), "AI_PROVIDER_SCHEMA_INVALID");
  assert.equal(error.diagnostic.schemaIssues[0]?.path, "divergences.0.evidenceUsed");
  assert.equal(error.diagnostic.schemaIssues[0]?.expected, "array");
  assert.equal(error.diagnostic.schemaIssues[0]?.received, "undefined");
});

test("R5 aceita evidenceUsed como array não vazio de strings curtas", async () => {
  const validPhase1 = {
    agreementFields: [],
    divergences: [{ field: "intent", suggestion: "Comercial", rationale: "Sinal semântico.", evidenceUsed: ["logical.fields.keyword"] }],
    semanticEnrichments: [],
    remainingAmbiguities: [],
  };
  const fixtureResponse = fixture(envelope(JSON.stringify(validPhase1)));
  const result = await request(fixtureResponse.fetchImpl);
  assert.equal(result.diagnostic.schemaValidation, "pass");
  assert.deepEqual(result.output, validPhase1);
});

test("modo provider_default não envia thinking e não há caminho OpenRouter", async () => {
  const fixtureResponse = fixture(envelope(JSON.stringify(phase1)));
  const result = await request(fixtureResponse.fetchImpl, { thinkingMode: "provider_default" });
  assert.equal("thinking" in (fixtureResponse.calls[0]?.body || {}), false);
  assert.equal(result.diagnostic.reasoningMode, "provider_default");
  assert.equal(result.diagnostic.thinkingExplicitlyConfigured, false);
  assert.equal(result.diagnostic.requestedMaxTokens, 1100);
  assert.equal(result.diagnostic.reasoningEffort, null);
  assert.equal(fixtureResponse.calls.every((call) => call.url.includes("api.deepseek.com")), true);
});
