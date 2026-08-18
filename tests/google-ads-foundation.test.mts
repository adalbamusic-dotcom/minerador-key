import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoogleAdsAdvertiserAccount } from "../lib/google/ads/account.ts";
import { getGoogleAdsAccessToken, resetGoogleAdsAccessTokenCacheForTests } from "../lib/google/ads/auth.ts";
import { createGoogleAdsRestClient } from "../lib/google/ads/client.ts";
import { getGoogleAdsServerConfig, normalizeGoogleAdsCustomerId } from "../lib/google/ads/config.ts";
import { googleAdsSafeError, GoogleAdsError } from "../lib/google/ads/errors.ts";
import { generateGoogleAdsHistoricalMetrics } from "../lib/google/ads/historical-metrics.ts";
import { generateGoogleAdsKeywordIdeas } from "../lib/google/ads/keyword-ideas.ts";
import { normalizeGoogleAdsKeyword, normalizeGoogleAdsKeywordMetrics } from "../lib/google/ads/normalizers.ts";
import { formatGoogleAdsSmokeError, GOOGLE_ADS_SMOKE_HELP, GoogleAdsSmokeError, loadGoogleAdsSmokeEnvironment, maskGoogleAdsCustomerId, parseGoogleAdsSmokeArguments, sanitizeGoogleAdsSmokeResult, validateGoogleAdsSmokeConfiguration } from "../lib/google/ads/smoke.ts";
import {
  googleAdsAccountErrorFixture,
  googleAdsAccountFixture,
  googleAdsMalformedSearchStreamFixture,
  googleAdsMalformedSearchResultsFixture,
  googleAdsMalformedSearchEntryFixture,
  googleAdsHistoricalMetricsFixture,
  googleAdsHistoricalMetricsWithoutCpcFixture,
  googleAdsHistoricalPartialFixture,
  googleAdsKeywordIdeasKeywordSeedFixture,
  googleAdsKeywordIdeasUrlSeedFixture,
  googleAdsOauthErrorFixture,
  googleAdsQuotaErrorFixture,
  googleAdsFailureErrorFixture,
} from "./google-ads.fixture.ts";

const environment = {
  GOOGLE_ADS_DEVELOPER_TOKEN: "test-developer-token",
  GOOGLE_ADS_CLIENT_ID: "test-client-id",
  GOOGLE_ADS_CLIENT_SECRET: "test-client-secret",
  GOOGLE_ADS_REFRESH_TOKEN: "test-refresh-token",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: "111-222-3333",
  GOOGLE_ADS_API_VERSION: "v25",
};
const config = getGoogleAdsServerConfig(environment);
const targeting = { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false };
const account = { customerId: "1234567890", loginCustomerId: "1112223333", currencyCode: "BRL", timeZone: "America/Sao_Paulo" };

function response(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}

test("configuração aceita somente versão suportada e customerId válido", () => {
  assert.equal(config.apiVersion, "v25");
  assert.equal(normalizeGoogleAdsCustomerId("123-456-7890"), "1234567890");
  assert.equal(normalizeGoogleAdsCustomerId(" 123 - 456 - 7890 "), "1234567890");
  assert.throws(() => normalizeGoogleAdsCustomerId("123 456 789"), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_customer_id");
  assert.throws(() => getGoogleAdsServerConfig({ ...environment, GOOGLE_ADS_API_VERSION: "v24" }), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_configuration");
  assert.throws(() => getGoogleAdsServerConfig({ ...environment, GOOGLE_ADS_CLIENT_SECRET: "" }), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_configuration");
});

test("smoke exige argumentos explícitos e mascara identificadores", () => {
  const parsed = parseGoogleAdsSmokeArguments([
    "--customer-id", "1234567890",
    "--login-customer-id", "1112223333",
    "--keyword", "marketing para clínicas",
    "--language", "languageConstants/1014",
    "--geo-target", "geoTargetConstants/2076",
    "--network", "GOOGLE_SEARCH",
    "--include-adult-keywords", "false",
  ]);
  assert.deepEqual(parsed, {
    customerId: "1234567890",
    loginCustomerId: "1112223333",
    keyword: "marketing para clínicas",
    targeting,
  });
  assert.equal(maskGoogleAdsCustomerId("1234567890"), "******7890");
  for (const argv of [["--customer-id..."], ["--customer-id", "..."], ["--customer-id", "123-456-7890"], ["--keyword", "teste"]]) {
    assert.throws(() => parseGoogleAdsSmokeArguments(argv), (error: unknown) => error instanceof GoogleAdsSmokeError && error.code === "invalid_customer_id" && error.stage === "argument_validation" && error.apiRequestStarted === false);
  }
  assert.deepEqual(GOOGLE_ADS_SMOKE_HELP.persistence, false);
});

test("check-config carrega ambiente, lista somente nomes ausentes e não inicia API", () => {
  let loadedDirectory = "";
  assert.deepEqual(loadGoogleAdsSmokeEnvironment((directory) => { loadedDirectory = directory; }, "C:/fake-project"), { configurationLoaded: true });
  assert.equal(loadedDirectory, "C:/fake-project");
  const missingEnvironment = { ...environment, GOOGLE_ADS_CLIENT_SECRET: "", GOOGLE_ADS_REFRESH_TOKEN: "" };
  assert.throws(
    () => validateGoogleAdsSmokeConfiguration(missingEnvironment),
    (error: unknown) => {
      const formatted = formatGoogleAdsSmokeError(error, "configuration_validation", false);
      return formatted.code === "google_ads_configuration_missing"
        && formatted.stage === "configuration_validation"
        && formatted.apiRequestStarted === false
        && JSON.stringify(formatted) === JSON.stringify({
          code: "google_ads_configuration_missing",
          stage: "configuration_validation",
          message: "A configuração Google Ads está incompleta.",
          missingConfiguration: ["GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"],
          configurationLoaded: true,
          configurationComplete: false,
          apiRequestStarted: false,
        });
    },
  );
  assert.deepEqual(validateGoogleAdsSmokeConfiguration(environment), { configurationLoaded: true, configurationComplete: true, apiRequestStarted: false });
});

test("OAuth é isolado por configuração e não faz rede fora do fetch simulado", async () => {
  resetGoogleAdsAccessTokenCacheForTests();
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return response({ access_token: `token-${calls}`, expires_in: 3600 });
  }) as typeof fetch;
  assert.equal(await getGoogleAdsAccessToken({ config, fetchFn }), "token-1");
  assert.equal(await getGoogleAdsAccessToken({ config, fetchFn }), "token-1");
  const secondConfig = getGoogleAdsServerConfig({ ...environment, GOOGLE_ADS_REFRESH_TOKEN: "other-test-refresh-token" });
  assert.equal(await getGoogleAdsAccessToken({ config: secondConfig, fetchFn }), "token-2");
  assert.equal(calls, 2);
  resetGoogleAdsAccessTokenCacheForTests();
  await assert.rejects(() => getGoogleAdsAccessToken({ config, fetchFn: (async () => response(googleAdsOauthErrorFixture, 400)) as typeof fetch }), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_oauth");
});

test("cliente usa literalmente as três rotas REST tipadas e mantém MCC configurado quando recebe null", async () => {
  const urls: string[] = [];
  const loginHeaders: Array<string | null> = [];
  const client = createGoogleAdsRestClient({
    config,
    getAccessToken: async () => "access-token",
    fetchFn: (async (url: string, init?: RequestInit) => {
      urls.push(url);
      loginHeaders.push(new Headers(init?.headers).get("login-customer-id"));
      return response({ results: [] }, 200, { "request-id": "request-1" });
    }) as typeof fetch,
  });
  await client.generateKeywordIdeas("1234567890", {}, { loginCustomerId: null });
  await client.generateKeywordHistoricalMetrics("1234567890", {});
  await client.searchStream("1234567890", {});
  assert.deepEqual(urls, [
    "https://googleads.googleapis.com/v25/customers/1234567890:generateKeywordIdeas",
    "https://googleads.googleapis.com/v25/customers/1234567890:generateKeywordHistoricalMetrics",
    "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream",
  ]);
  assert.deepEqual(loginHeaders, ["1112223333", "1112223333", "1112223333"]);
});

test("cliente omite login-customer-id quando não existe MCC", async () => {
  const noMccConfig = getGoogleAdsServerConfig({ ...environment, GOOGLE_ADS_LOGIN_CUSTOMER_ID: undefined });
  let loginHeader: string | null = "unexpected";
  const client = createGoogleAdsRestClient({
    config: noMccConfig,
    getAccessToken: async () => "access-token",
    fetchFn: (async (_url: string, init?: RequestInit) => {
      loginHeader = new Headers(init?.headers).get("login-customer-id");
      return response({ results: [] });
    }) as typeof fetch,
  });
  await client.generateKeywordIdeas("1234567890", {});
  assert.equal(loginHeader, null);
});

test("GoogleAdsFailure preserva todos os erros em diagnóstico sanitizado", async () => {
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsFailureErrorFixture, 400, { "request-id": "provider-failure-1" })) as typeof fetch });
  await assert.rejects(
    () => client.generateKeywordIdeas("1234567890", {}),
    (error: unknown) => {
      assert.ok(error instanceof GoogleAdsError);
      const safe = googleAdsSafeError(error);
      assert.equal(safe.requestId, "provider-failure-1");
      assert.equal(safe.httpStatus, 400);
      assert.equal(safe.providerStatus, "INVALID_ARGUMENT");
      assert.equal(safe.providerCode, "keywordPlanError:KEYWORD_PLAN_NOT_ENABLED");
      assert.equal(safe.providerMessage, "Keyword Planner is not enabled.");
      assert.equal(safe.providerField, "keywordSeed[0]");
      assert.equal(safe.providerErrors.length, 2);
      assert.equal(safe.providerErrors[0]?.trigger, "Bearer [redacted]");
      assert.equal(JSON.stringify(safe).includes("1234567890"), false);
      assert.equal(safe.classification, "KEYWORD_PLAN_PERMISSION");
      return true;
    },
  );
});

test("resolução de conta preserva MCC efetivo e moeda/fuso do Customer", async () => {
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsAccountFixture)) as typeof fetch });
  assert.deepEqual(await resolveGoogleAdsAdvertiserAccount(client, { customerId: "123-456-7890" }), account);
});

test("SearchStream malformado retorna erro estruturado com requestId", async () => {
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsMalformedSearchStreamFixture, 200, { "request-id": "search-malformed" })) as typeof fetch });
  await assert.rejects(
    () => resolveGoogleAdsAdvertiserAccount(client, { customerId: account.customerId }),
    (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_response" && error.requestId === "search-malformed",
  );
  const malformedResultsClient = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsMalformedSearchResultsFixture, 200, { "request-id": "results-malformed" })) as typeof fetch });
  await assert.rejects(
    () => resolveGoogleAdsAdvertiserAccount(malformedResultsClient, { customerId: account.customerId }),
    (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_response" && error.requestId === "results-malformed",
  );
  const malformedEntryClient = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsMalformedSearchEntryFixture, 200, { "request-id": "entry-malformed" })) as typeof fetch });
  await assert.rejects(
    () => resolveGoogleAdsAdvertiserAccount(malformedEntryClient, { customerId: account.customerId }),
    (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_response" && error.requestId === "entry-malformed",
  );
});

test("ideias usam conta resolvida, URL tipada e bloqueiam divergência antes do fetch", async () => {
  let calls = 0;
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => {
    calls += 1;
    return response(calls === 1 ? googleAdsKeywordIdeasKeywordSeedFixture : googleAdsKeywordIdeasUrlSeedFixture);
  }) as typeof fetch });
  const result = await generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId }, targeting, seed: { kind: "keyword", keywords: ["marketing para clínicas"] } }, account);
  const urlResult = await generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId }, targeting, seed: { kind: "url", url: "https://adalbapro.com.br" } }, account);
  assert.equal(result.ideas[0].providerVersion, "v25");
  assert.equal(urlResult.ideas[0].averageMonthlySearches, 260);
  await assert.rejects(() => generateGoogleAdsKeywordIdeas(client, { account: { customerId: "9999999999" }, targeting, seed: { kind: "url", url: "https://adalbapro.com.br" } }, account), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_request");
  await assert.rejects(() => generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId, loginCustomerId: "9999999999" }, targeting, seed: { kind: "url", url: "https://adalbapro.com.br" } }, account), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_request");
  assert.equal(calls, 2);
});

test("seed limita keyword e keyword-and-url a 20, enquanto histórico aceita lote acima de 20", async () => {
  let calls = 0;
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => {
    calls += 1;
    return response(googleAdsHistoricalMetricsFixture);
  }) as typeof fetch });
  const twentyOne = Array.from({ length: 21 }, (_, index) => `k${index}`);
  await assert.rejects(
    () => generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId }, targeting, seed: { kind: "keyword", keywords: twentyOne } }, account),
    (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_request",
  );
  await generateGoogleAdsHistoricalMetrics(client, { account: { customerId: account.customerId }, targeting, keywords: twentyOne, includeAverageCpc: false }, account);
  const tenThousandOne = Array.from({ length: 10_001 }, (_, index) => `k${index}`);
  await assert.rejects(
    () => generateGoogleAdsHistoricalMetrics(client, { account: { customerId: account.customerId }, targeting, keywords: tenThousandOne, includeAverageCpc: false }, account),
    (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_request",
  );
  assert.equal(calls, 1);
});

test("mais de 10 geo targets é recusado antes de qualquer fetch", async () => {
  let calls = 0;
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => {
    calls += 1;
    return response(googleAdsKeywordIdeasKeywordSeedFixture);
  }) as typeof fetch });
  const tooManyGeoTargets = { ...targeting, geoTargetConstants: Array.from({ length: 11 }, (_, index) => `geoTargetConstants/${index}`) };
  await assert.rejects(
    () => generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId }, targeting: tooManyGeoTargets, seed: { kind: "keyword", keywords: ["teste"] } }, account),
    (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_invalid_request",
  );
  assert.equal(calls, 0);
});

test("métricas históricas normalizam int64 REST, preservam closeVariants e null", async () => {
  let calls = 0;
  const bodies: unknown[] = [];
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async (_url: string, init?: RequestInit) => {
    calls += 1;
    bodies.push(JSON.parse(String(init?.body)));
    return response(calls === 1 ? googleAdsHistoricalMetricsFixture : googleAdsHistoricalMetricsWithoutCpcFixture);
  }) as typeof fetch });
  const adultTargeting = { ...targeting, includeAdultKeywords: true };
  const present = await generateGoogleAdsHistoricalMetrics(client, { account: { customerId: account.customerId }, targeting: adultTargeting, keywords: ["marketing para clínicas", "marketing clinicas", "entrada não associada"], includeAverageCpc: true }, account);
  const absent = await generateGoogleAdsHistoricalMetrics(client, { account: { customerId: account.customerId }, targeting, keywords: ["keyword sem volume"], includeAverageCpc: false }, account);
  assert.equal(present.metrics[0].averageMonthlySearches, 720);
  assert.equal(present.metrics[0].monthlySearchVolumes[0].year, 2026);
  assert.equal(present.metrics[0].monthlySearchVolumes[0].searches, 590);
  assert.equal(present.metrics[0].competitionIndex, 78);
  assert.equal(present.metrics[0].averageCpcMicros, "2200000");
  assert.deepEqual(present.metrics[0].closeVariants, ["marketing clinicas", "marketing para clínica"]);
  assert.deepEqual(absent.metrics[0].closeVariants, ["keyword sem volumes", "keyword sem o volume"]);
  assert.deepEqual(present.metrics[0].matchedRequestedKeywords, ["marketing para clínicas", "marketing clinicas"]);
  assert.deepEqual(present.unmatchedRequestedKeywords, ["entrada não associada"]);
  assert.deepEqual(present.requestedKeywords, ["marketing para clínicas", "marketing clinicas", "entrada não associada"]);
  assert.deepEqual((bodies[0] as { historicalMetricsOptions: unknown }).historicalMetricsOptions, { includeAverageCpc: true });
  assert.equal("historicalMetricsOptions" in (bodies[1] as object), false);
  assert.equal((bodies[0] as { includeAdultKeywords: boolean }).includeAdultKeywords, true);
  assert.equal((bodies[1] as { includeAdultKeywords: boolean }).includeAdultKeywords, false);
  assert.equal(absent.metrics[0].averageMonthlySearches, null);
  assert.equal(absent.metrics[0].averageCpcMicros, null);
});

test("resposta histórica sem results representa ausência de métricas, não resposta inválida", async () => {
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response({})) as typeof fetch });
  const result = await generateGoogleAdsHistoricalMetrics(client, { account: { customerId: account.customerId }, targeting, keywords: ["keyword sem retorno"], includeAverageCpc: true }, account);
  assert.deepEqual(result.metrics, []);
  assert.deepEqual(result.unmatchedRequestedKeywords, ["keyword sem retorno"]);
});

test("resultado histórico sem keywordMetrics preserva ausência em vez de falhar", async () => {
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response({ results: [{ text: "keyword sem métrica" }] }, 200, { "request-id": "metrics-absent" })) as typeof fetch });
  const result = await generateGoogleAdsHistoricalMetrics(client, { account: { customerId: account.customerId }, targeting, keywords: ["keyword sem métrica"], includeAverageCpc: true }, account);
  assert.equal(result.metrics[0].averageMonthlySearches, null);
  assert.deepEqual(result.metrics[0].monthlySearchVolumes, []);
  assert.equal(result.requestId, "metrics-absent");
});

test("saída do smoke é sanitizada, preserva histórico parcial e não presume moeda ou timezone", async () => {
  const client = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsHistoricalPartialFixture)) as typeof fetch });
  const foreignAccount = { customerId: account.customerId, loginCustomerId: null, currencyCode: "EUR", timeZone: "Europe/Lisbon" };
  const smoke = parseGoogleAdsSmokeArguments([
    "--customer-id", account.customerId,
    "--keyword", "keyword parcial",
    "--language", targeting.language,
    "--geo-target", targeting.geoTargetConstants[0],
    "--network", targeting.keywordPlanNetwork,
    "--include-adult-keywords", "false",
  ]);
  const result = await generateGoogleAdsHistoricalMetrics(client, { account: { customerId: account.customerId }, targeting, keywords: [smoke.keyword], includeAverageCpc: true }, foreignAccount);
  const sanitized = sanitizeGoogleAdsSmokeResult({ smoke, account: foreignAccount, result, durationMs: 17 });
  assert.equal(sanitized.currencyCode, "EUR");
  assert.equal(sanitized.timeZone, "Europe/Lisbon");
  assert.equal(sanitized.monthlySearchVolumes.length, 1);
  assert.equal(sanitized.customerId, "******7890");
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /test-developer-token|test-client-secret|test-refresh-token|access-token/);
  assert.throws(
    () => sanitizeGoogleAdsSmokeResult({ smoke, account: foreignAccount, result: { ...result, metrics: [] }, durationMs: 1 }),
    (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_no_data",
  );
});

test("normalização de keyword é neutra, preserva acentos e int64 inválido não vira zero", () => {
  assert.equal(normalizeGoogleAdsKeyword("  Clínicas MÉDICAS  "), "clínicas médicas");
  const metrics = normalizeGoogleAdsKeywordMetrics({ avgMonthlySearches: "not-a-number", competitionIndex: "9007199254740992", monthlySearchVolumes: [{ year: "2026", month: "JULY", monthlySearches: "not-a-number" }] });
  assert.equal(metrics.averageMonthlySearches, null);
  assert.equal(metrics.competitionIndex, null);
  assert.deepEqual(metrics.monthlySearchVolumes, [{ year: 2026, month: "JULY", searches: null }]);
});

test("erros de conta, quota, rate limit e timeout permanecem discriminados", async () => {
  const accountClient = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsAccountErrorFixture, 403)) as typeof fetch });
  await assert.rejects(() => accountClient.generateKeywordIdeas("1234567890", {}), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_account_not_authorized");
  const quotaClient = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response(googleAdsQuotaErrorFixture, 429)) as typeof fetch });
  await assert.rejects(() => quotaClient.generateKeywordIdeas("1234567890", {}), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_quota");
  const rateClient = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => response({}, 429)) as typeof fetch });
  await assert.rejects(() => rateClient.generateKeywordIdeas("1234567890", {}), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_rate_limited");
  const timeoutClient = createGoogleAdsRestClient({ config, getAccessToken: async () => "access-token", fetchFn: (async () => { throw new DOMException("timeout", "TimeoutError"); }) as typeof fetch });
  await assert.rejects(() => timeoutClient.generateKeywordIdeas("1234567890", {}), (error: unknown) => error instanceof GoogleAdsError && error.code === "google_ads_timeout");
});
