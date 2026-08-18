import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDataForSeoAllintitleRequest,
  measureDataForSeoAllintitle,
  normalizeDataForSeoAllintitleResponse,
  readDataForSeoSerpConfig,
  DataForSeoSerpError,
} from "../lib/minerador/dataforseo-serp-core.ts";
import {
  dataForSeoMismatchedLocationFixture,
  dataForSeoMissingTotalFixture,
  dataForSeoPartialFixture,
  dataForSeoSuccessFixture,
  dataForSeoTaskErrorFixture,
  dataForSeoZeroFixture,
} from "./dataforseo-serp.fixture.ts";

const request = { keyword: "marketing para clínicas", locationCode: 2076, languageCode: "pt", operationRequestId: "10000000-0000-4000-8000-000000000010" };

test("monta allintitle, desktop, profundidade 10 e tag da operação", () => {
  const built = buildDataForSeoAllintitleRequest(request);
  assert.equal(built.query, 'allintitle:"marketing para clínicas"');
  assert.deepEqual(built.body[0], { keyword: built.query, location_code: 2076, language_code: "pt", device: "desktop", depth: 10, tag: request.operationRequestId });
});

test("normaliza exclusivamente se_results_count e aceita zero explícito", () => {
  assert.equal(normalizeDataForSeoAllintitleResponse(dataForSeoSuccessFixture, request).resultsAllintitle, 60500);
  assert.equal(normalizeDataForSeoAllintitleResponse(dataForSeoZeroFixture, request).resultsAllintitle, 0);
});

test("não usa items_count ou organic.length quando se_results_count falta", () => {
  assert.throws(() => normalizeDataForSeoAllintitleResponse(dataForSeoMissingTotalFixture, request), (error: unknown) => error instanceof DataForSeoSerpError && error.code === "dataforseo_total_missing");
});

test("rejeita task, resposta parcial e localidade incompatível", () => {
  assert.throws(() => normalizeDataForSeoAllintitleResponse(dataForSeoTaskErrorFixture, request), (error: unknown) => error instanceof DataForSeoSerpError && error.code === "dataforseo_task_failed");
  assert.throws(() => normalizeDataForSeoAllintitleResponse(dataForSeoPartialFixture, request), (error: unknown) => error instanceof DataForSeoSerpError && error.code === "dataforseo_invalid_response");
  assert.throws(() => normalizeDataForSeoAllintitleResponse(dataForSeoMismatchedLocationFixture, request), (error: unknown) => error instanceof DataForSeoSerpError && error.code === "dataforseo_result_mismatch");
});

test("configuração ausente informa a integração sem revelar valores", () => {
  assert.throws(() => readDataForSeoSerpConfig({ DATAFORSEO_LOGIN: "", DATAFORSEO_PASSWORD: "secret-not-for-output" } as unknown as NodeJS.ProcessEnv), (error: unknown) => error instanceof DataForSeoSerpError && error.code === "dataforseo_configuration" && !error.message.includes("secret-not-for-output"));
});

test("fetch é simulado, envia Basic Auth e não expõe a senha na medição", async () => {
  let calledUrl = "";
  let calledBody = "";
  let requestStarted = false;
  const measurement = await measureDataForSeoAllintitle(request, {
    config: { login: "login", password: "password", baseUrl: "https://example.test", timeoutMs: 1000, locationCode: 2076, languageCode: "pt" },
    onRequestStarted: () => { requestStarted = true; },
    fetchImpl: async (url, init) => {
      calledUrl = String(url);
      calledBody = String(init?.body || "");
      return new Response(JSON.stringify(dataForSeoSuccessFixture), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.match(calledUrl, /\/v3\/serp\/google\/organic\/live\/regular$/);
  assert.match(calledBody, /allintitle/);
  assert.equal(requestStarted, true);
  assert.equal(measurement.resultsAllintitle, 60500);
  assert.equal(JSON.stringify(measurement).includes("password"), false);
});

test("request start callback não dispara para falha de validação antes do fetch", async () => {
  let requestStarted = false;
  await assert.rejects(() => measureDataForSeoAllintitle({ ...request, keyword: "" }, {
    config: { login: "login", password: "password", baseUrl: "https://example.test", timeoutMs: 1000, locationCode: 2076, languageCode: "pt" },
    onRequestStarted: () => { requestStarted = true; },
    fetchImpl: async () => new Response(JSON.stringify(dataForSeoSuccessFixture), { status: 200 }),
  }), (error: unknown) => error instanceof DataForSeoSerpError && error.code === "dataforseo_invalid_response");
  assert.equal(requestStarted, false);
});

test("timeout simulado produz dataforseo_timeout", async () => {
  await assert.rejects(() => measureDataForSeoAllintitle(request, {
    config: { login: "login", password: "password", baseUrl: "https://example.test", timeoutMs: 1, locationCode: 2076, languageCode: "pt" },
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  }), (error: unknown) => error instanceof DataForSeoSerpError && error.code === "dataforseo_timeout");
});
