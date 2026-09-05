import assert from "node:assert/strict";
import test from "node:test";
import {
  collectDataForSeoCompatibilitySnapshot,
  DATAFORSEO_SERP_COMPATIBILITY_STATUS,
} from "../lib/arquiteto/dataforseo-serp-compatibility.ts";
import { normalizeDataForSeoCompatibilityResponse } from "../lib/arquiteto/dataforseo-serp-normalizer.ts";

const input = {
  brandId: "brand-1",
  articleId: "article-1",
  articleDnaVersionId: "article-v1",
  keywordId: "keyword-1",
  keywordDnaVersionId: "keyword-v1",
  keyword: "seo para clínicas",
  location: "Brasil",
  language: "pt-br",
  device: "desktop" as const,
  expectedIntent: "informational",
  expectedFormat: "article",
  requiredTopics: ["seo"],
  articleEntities: ["clínicas"],
  resultLimit: 10,
  version: 1,
  previousSnapshotId: null,
};

test("o consumidor do Arquiteto usa a SERP orgânica normal e não allintitle", async () => {
  let requestStarted = false;
  let requestedBody: unknown = null;
  let requestedUrl: string | null = null;
  let providerDiagnostic: unknown = null;
  const snapshot = await collectDataForSeoCompatibilitySnapshot(input, {
    actorUserId: "10000000-0000-4000-8000-000000000001",
    operationRequestId: "10000000-0000-4000-8000-000000000002",
    resolution: {
      resource: {} as never,
      environment: "test",
      credentialSource: "connection",
      config: { login: "fixture-login", password: "fixture-password", baseUrl: "https://api.dataforseo.test", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" },
    },
    fetchImpl: async (_url, init) => {
      requestedUrl = String(_url);
      requestedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ status_code: 20000, status_message: "Ok.", tasks: [{ id: "task-1", status_code: 20000, result: [{ items: [
        { type: "organic", rank_group: 1, title: "SEO para clínicas", url: "https://example.com/seo", description: "Estratégia de SEO para clínicas." },
        { type: "people_also_ask", question: "Como começar?", description: "Resposta." },
      ] }] }] }), { status: 200, headers: { "content-type": "application/json" } });
    },
    onRequestStarted: () => { requestStarted = true; },
    onProviderResponse: (diagnostic) => { providerDiagnostic = diagnostic; },
  });
  assert.equal(requestStarted, true);
  assert.equal(requestedUrl, "https://api.dataforseo.test/v3/serp/google/organic/live/regular");
  assert.equal(DATAFORSEO_SERP_COMPATIBILITY_STATUS, "AVAILABLE_FROM_GLOBAL_DATAFORSEO");
  assert.equal(snapshot.provider, "dataforseo");
  assert.equal(snapshot.organicResults.length, 1);
  assert.equal(snapshot.peopleAlsoAsk.length, 1);
  assert.deepEqual(providerDiagnostic, {
    httpStatus: 200,
    rootStatusCode: 20000,
    rootStatusMessage: "Ok.",
    taskStatusCode: 20000,
    taskStatusMessage: null,
    taskCount: 1,
    resultCount: 1,
    itemsCount: 2,
    providerRequestId: "task-1",
  });
  assert.deepEqual(requestedBody, [{ keyword: "seo para clínicas", location_code: 2076, language_code: "pt", device: "desktop", depth: 10, tag: "10000000-0000-4000-8000-000000000002" }]);
  assert.equal(JSON.stringify(requestedBody).toLowerCase().includes("allintitle"), false);
});

test("DataForSEO normaliza resultados orgânicos em snapshot de compatibilidade", () => {
  const snapshot = normalizeDataForSeoCompatibilityResponse({
    status_code: 20000,
    tasks: [{
      id: "task-1",
      status_code: 20000,
      result: [{
        items: [
          { type: "organic", rank_group: 1, title: "SEO para clínicas: guia", url: "https://example.com/blog/seo-clinicas", description: "Guia completo para clínicas." },
          { type: "organic", rank_group: 2, title: "Como fazer SEO local", url: "https://example.org/seo-local", description: "Estratégia informativa." },
          { type: "people_also_ask", title: "Como começar?", description: "Resposta relacionada." },
          { type: "related_search", title: "seo local para clínicas" },
        ],
      }],
    }],
  }, input, { locationCode: 2076, languageCode: "pt" }, "2026-08-24T12:00:00.000Z", "task-1");

  assert.equal(snapshot.provider, "dataforseo");
  assert.equal(snapshot.providerEndpoint, "/search");
  assert.equal(snapshot.origin, "real");
  assert.equal(snapshot.isMock, false);
  assert.equal(snapshot.organicResults.length, 2);
  assert.equal(snapshot.peopleAlsoAsk.length, 1);
  assert.equal(snapshot.relatedSearches.length, 1);
  assert.notEqual(snapshot.diagnostic.verdict, "informacao_insuficiente");
  assert.equal(snapshot.contentHash.length, 64);
});

test("ausência de resultados é insuficiência, não conflito estrutural", () => {
  const snapshot = normalizeDataForSeoCompatibilityResponse({
    status_code: 20000,
    tasks: [{ id: "task-empty", status_code: 20000, result: [{ items: [] }] }],
  }, input, { locationCode: 2076, languageCode: "pt" }, "2026-08-24T12:00:00.000Z", "task-empty");
  assert.equal(snapshot.organicResults.length, 0);
  assert.equal(snapshot.diagnostic.verdict, "informacao_insuficiente");
  assert.deepEqual(snapshot.diagnostic.possibleConflicts, []);
});

test("falha do provider não aciona fallback nem produz snapshot parcial", async () => {
  let calls = 0;
  let requestStarted = false;
  await assert.rejects(
    collectDataForSeoCompatibilitySnapshot(input, {
      actorUserId: "10000000-0000-4000-8000-000000000001",
      operationRequestId: "10000000-0000-4000-8000-000000000003",
      resolution: {
        resource: {} as never,
        environment: "test",
        credentialSource: "connection",
        config: { login: "fixture-login", password: "fixture-password", baseUrl: "https://api.dataforseo.test", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" },
      },
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ status_code: 20000, tasks: [{ id: "task-failed", status_code: 40100, status_message: "Unauthorized" }] }), { status: 200 });
      },
      onRequestStarted: () => { requestStarted = true; },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "dataforseo_task_failed");
      return true;
    },
  );
  assert.equal(requestStarted, true);
  assert.equal(calls, 1);
});

test("status raiz inválido é rejeitado antes da normalização do snapshot", () => {
  assert.throws(
    () => normalizeDataForSeoCompatibilityResponse({ status_code: 40100, status_message: "Authorization failed", tasks: [] }, input, { locationCode: 2076, languageCode: "pt" }),
    (error: unknown) => (error as { code?: string }).code === "dataforseo_invalid_response",
  );
});

test("status raiz ausente e result sem items não passam pelo gate estrutural", () => {
  assert.throws(
    () => normalizeDataForSeoCompatibilityResponse({ tasks: [{ id: "task-missing-root", status_code: 20000, result: [{ items: [] }] }] }, input, { locationCode: 2076, languageCode: "pt" }),
    (error: unknown) => (error as { code?: string }).code === "dataforseo_invalid_response",
  );
  assert.throws(
    () => normalizeDataForSeoCompatibilityResponse({ status_code: 20000, tasks: [{ id: "task-missing-items", status_code: 20000, result: [{}] }] }, input, { locationCode: 2076, languageCode: "pt" }),
    (error: unknown) => (error as { code?: string }).code === "dataforseo_invalid_response",
  );
});

test("HTTP não exitoso expõe somente diagnóstico sanitizado de transporte", async () => {
  let httpStatus: number | null = null;
  await assert.rejects(
    collectDataForSeoCompatibilitySnapshot(input, {
      actorUserId: "10000000-0000-4000-8000-000000000001",
      operationRequestId: "10000000-0000-4000-8000-000000000004",
      resolution: {
        resource: {} as never,
        environment: "test",
        credentialSource: "connection",
        config: { login: "fixture-login", password: "fixture-password", baseUrl: "https://api.dataforseo.test", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" },
      },
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
      onHttpResponse: (status) => { httpStatus = status; },
    }),
    (error: unknown) => (error as { code?: string }).code === "dataforseo_http",
  );
  assert.equal(httpStatus, 503);
});
