import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createGoogleAdsKeywordAccount } from "../lib/google/ads/account.ts";
import { createGoogleAdsRestClient, type GoogleAdsRestClient } from "../lib/google/ads/client.ts";
import { getGoogleAdsServerConfig } from "../lib/google/ads/config.ts";
import { buildGoogleAdsUnknownFailureDiagnostic } from "../lib/google/ads/diagnostics.ts";
import { googleAdsSafeError } from "../lib/google/ads/errors.ts";
import { generateGoogleAdsHistoricalMetrics } from "../lib/google/ads/historical-metrics.ts";
import { generateGoogleAdsKeywordIdeas } from "../lib/google/ads/keyword-ideas.ts";

const discoveryRoute = new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url);
const metricsRoute = new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url);

const account = createGoogleAdsKeywordAccount({ customerId: "123-456-7890", loginCustomerId: "111-222-3333" });
const targeting = {
  language: "languageConstants/1014",
  geoTargetConstants: ["geoTargetConstants/2076"],
  keywordPlanNetwork: "GOOGLE_SEARCH" as const,
  includeAdultKeywords: false,
};

function plannerOnlyClient() {
  return {
    listAccessibleCustomers: async () => { throw new Error("not part of this operation"); },
    searchStream: async () => { throw new Error("SearchStream preflight must not run"); },
    generateKeywordIdeas: async () => ({ data: { results: [] }, requestId: "ideas-request", providerVersion: "v25" as const, customerId: account.customerId, loginCustomerId: account.loginCustomerId }),
    generateKeywordHistoricalMetrics: async () => ({ data: { results: [] }, requestId: "metrics-request", providerVersion: "v25" as const, customerId: account.customerId, loginCustomerId: account.loginCustomerId }),
  };
}

test("Discovery e Metrics não usam SearchStream como preflight", async () => {
  const [discovery, metrics] = await Promise.all([readFile(discoveryRoute, "utf8"), readFile(metricsRoute, "utf8")]);
  assert.doesNotMatch(discovery, /resolveGoogleAdsAdvertiserAccount|\.searchStream\(/);
  assert.doesNotMatch(metrics, /resolveGoogleAdsAdvertiserAccount|\.searchStream\(/);
  assert.match(discovery, /generateGoogleAdsKeywordIdeas/);
  assert.match(metrics, /generateGoogleAdsHistoricalMetrics/);
  assert.match(discovery, /providerResponseReceived/);
  assert.match(discovery, /failureType/);
  assert.match(discovery, /internalStage/);
});

test("Keyword Planner pode ser chamado sem metadata de Customer", async () => {
  const client = plannerOnlyClient() as unknown as GoogleAdsRestClient;
  assert.equal(account.currencyCode, null);
  assert.equal(account.timeZone, null);
  const requestAccount = { customerId: account.customerId, loginCustomerId: account.loginCustomerId || undefined };
  const ideas = await generateGoogleAdsKeywordIdeas(client, { account: requestAccount, targeting, seed: { kind: "keyword", keywords: ["marketing para clínicas"] } }, account);
  const metrics = await generateGoogleAdsHistoricalMetrics(client, { account: requestAccount, targeting, keywords: ["marketing para clínicas"], includeAverageCpc: true }, account);
  assert.equal(ideas.requestId, "ideas-request");
  assert.equal(metrics.requestId, "metrics-request");
});

test("fixture de transporte nunca perde a classificação depois de iniciar", async () => {
  const routeDiagnostic = buildGoogleAdsUnknownFailureDiagnostic({ apiRequestStarted: true, providerResponseReceived: false, internalStage: "provider_request" });
  assert.deepEqual(routeDiagnostic, { apiRequestStarted: true, providerResponseReceived: false, failureType: "PROVIDER_TRANSPORT_ERROR", internalStage: "provider_request", httpStatus: null, providerRequestId: null, providerErrorCode: null, providerErrorMessage: null, googleStatus: null, endpoint: null });
  const config = getGoogleAdsServerConfig({
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
    GOOGLE_ADS_CLIENT_ID: "client-id",
    GOOGLE_ADS_CLIENT_SECRET: "client-secret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "1112223333",
    GOOGLE_ADS_API_VERSION: "v25",
  });
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: async () => { throw new TypeError("network unavailable"); } });
  await assert.rejects(
    () => generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId }, targeting, seed: { kind: "keyword", keywords: ["marketing para clínicas"] } }, account),
    (error: unknown) => {
      const safe = googleAdsSafeError(error);
      assert.equal(safe.providerResponseReceived, false);
      assert.equal(safe.failureType, "PROVIDER_TRANSPORT_ERROR");
      assert.equal(safe.internalStage, "google_ads_request");
      assert.equal(safe.httpStatus, null);
      assert.match(safe.endpoint || "", /generateKeywordIdeas/);
      return true;
    },
  );
});

test("fixture HTTP preserva response, request-id e erro seguro", async () => {
  const config = getGoogleAdsServerConfig({
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
    GOOGLE_ADS_CLIENT_ID: "client-id",
    GOOGLE_ADS_CLIENT_SECRET: "client-secret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "1112223333",
    GOOGLE_ADS_API_VERSION: "v25",
  });
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: async () => new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403, headers: { "request-id": "fixture-request" } }) });
  await assert.rejects(
    () => generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId }, targeting, seed: { kind: "keyword", keywords: ["marketing para clínicas"] } }, account),
    (error: unknown) => {
      const safe = googleAdsSafeError(error);
      assert.equal(safe.providerResponseReceived, true);
      assert.equal(safe.failureType, "PROVIDER_HTTP_ERROR");
      assert.equal(safe.httpStatus, 403);
      assert.equal(safe.requestId, "fixture-request");
      assert.equal(safe.providerStatus, "PERMISSION_DENIED");
      return true;
    },
  );
});
