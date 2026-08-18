import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GoogleAdsError } from "../lib/google/ads/errors.ts";
import { buildGoogleAdsMetricsFailure, GOOGLE_ADS_HISTORICAL_METRICS_ENDPOINT, type GoogleAdsMetricsExecutionState } from "../lib/minerador/google-ads-metrics-diagnostics.ts";

const routePath = new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url);

function state(stage: GoogleAdsMetricsExecutionState["internalStage"], overrides: Partial<GoogleAdsMetricsExecutionState> = {}): GoogleAdsMetricsExecutionState {
  return {
    apiRequestStarted: true,
    providerResponseReceived: true,
    internalStage: stage,
    providerRequestIds: ["provider-request-1"],
    persistenceWriteCount: 0,
    persistedCount: 0,
    ...overrides,
  };
}

test("GoogleAdsError do provider preserva diagnóstico sanitizado e não é reclassificado", () => {
  const error = new GoogleAdsError("google_ads_invalid_request", {
    status: 400,
    requestId: "provider-request-2",
    providerCode: "INVALID_ARGUMENT",
    providerMessage: "Keyword inválida.",
    providerField: "keywords[0]",
    providerStatus: "INVALID_ARGUMENT",
    endpoint: GOOGLE_ADS_HISTORICAL_METRICS_ENDPOINT,
    providerResponseReceived: true,
    failureType: "PROVIDER_HTTP_ERROR",
    internalStage: "google_ads_request",
  });
  const failure = buildGoogleAdsMetricsFailure(error, state("provider_request", { providerResponseReceived: false }), { customerIdRef: "******1497" }, { apiVersion: "v25", requestedKeywordCount: 3 });
  assert.equal(failure.code, "GOOGLE_ADS_PROVIDER_ERROR");
  assert.equal(failure.stage, "provider_request");
  assert.equal(failure.diagnostic.providerRequestId, "provider-request-2");
  assert.equal(failure.diagnostic.providerErrorCode, "INVALID_ARGUMENT");
  assert.equal(failure.diagnostic.failedField, "keywords[0]");
  assert.equal(failure.diagnostic.httpStatus, 400);
  assert.equal(failure.diagnostic.apiVersion, "v25");
  assert.equal(failure.diagnostic.requestedKeywordCount, 3);
});

test("falha de transporte iniciada no provider continua identificada como provider_request", () => {
  const failure = buildGoogleAdsMetricsFailure(new TypeError("network unavailable"), state("provider_request", { providerResponseReceived: false }));
  assert.equal(failure.code, "GOOGLE_ADS_PROVIDER_ERROR");
  assert.equal(failure.stage, "provider_request");
  assert.equal(failure.diagnostic.failureType, "PROVIDER_TRANSPORT_ERROR");
  assert.equal(failure.diagnostic.providerResponseReceived, false);
});

test("falhas pós-provider recebem o estágio de persistência exato", () => {
  for (const stageName of ["persist_current_metrics", "persist_metric_history", "persist_measurements", "project_keywords"] as const) {
    const failure = buildGoogleAdsMetricsFailure({ code: "23505", message: `Erro em ${stageName}` }, state(stageName), {}, { apiVersion: "v25", requestedKeywordCount: 1 });
    assert.equal(failure.code, "GOOGLE_ADS_METRICS_PERSISTENCE_ERROR");
    assert.equal(failure.stage, stageName);
    assert.equal(failure.status, 503);
    assert.equal(failure.diagnostic.providerResponseReceived, true);
    assert.equal(failure.diagnostic.failureType, "INTERNAL_POST_REQUEST_ERROR");
    assert.equal(failure.diagnostic.internalStage, stageName);
    assert.equal(failure.diagnostic.providerRequestId, "provider-request-1");
    assert.equal(failure.diagnostic.endpoint, GOOGLE_ADS_HISTORICAL_METRICS_ENDPOINT);
  }
});

test("persistência parcial fica explícita e segredo nunca atravessa o diagnóstico", () => {
  const failure = buildGoogleAdsMetricsFailure(
    { code: "23514", message: "refresh_token=refresh-token-secret authorization: Bearer access-token-secret client_secret=client-secret developer_token=developer-token" },
    state("project_keywords", { persistenceWriteCount: 1 }),
  );
  assert.equal(failure.diagnostic.partialPersistence, true);
  assert.equal(failure.diagnostic.persistenceWriteCount, 1);
  const serialized = JSON.stringify(failure.diagnostic);
  for (const secret of ["refresh-token-secret", "access-token-secret", "client-secret", "developer-token"]) assert.doesNotMatch(serialized, new RegExp(secret));
  assert.match(serialized, /\[redacted\]/);
});

test("fluxo mockado completo chega ao estado completed com provider respondido", () => {
  const completed = state("completed", { providerRequestIds: ["provider-request-1", "provider-request-2"], persistenceWriteCount: 3, persistedCount: 1 });
  assert.equal(completed.providerResponseReceived, true);
  assert.equal(completed.internalStage, "completed");
  assert.equal(completed.providerRequestIds.length, 2);
  assert.equal(completed.persistenceWriteCount, 3);
  assert.equal(completed.persistedCount, 1);
});

test("rota instrumenta provider e todos os pontos de persistência sem afetar a Discovery", async () => {
  const [metricsRoute, discoveryRoute] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(metricsRoute, /internalStage: GoogleAdsMetricsStage = "request_validation"/);
  for (const stageName of ["context_resolution", "provider_request", "provider_response", "persist_current_metrics", "persist_metric_history", "persist_measurements", "project_keywords", "completed"]) {
    assert.match(metricsRoute, new RegExp(`internalStage = "${stageName}"`));
  }
  assert.match(metricsRoute, /buildGoogleAdsMetricsFailure\(error, executionState/);
  assert.doesNotMatch(metricsRoute, /if \(!\(error instanceof GoogleAdsError\)\) return failure\("GOOGLE_ADS_PROVIDER_ERROR"/);
  assert.match(discoveryRoute, /generateGoogleAdsKeywordIdeas/);
  assert.match(discoveryRoute, /providerResponseReceived = true/);
});
