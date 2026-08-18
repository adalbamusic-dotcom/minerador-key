import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildGoogleAdsUnavailableVolumePatch, buildGoogleAdsVolumeMetricPatch, matchGoogleAdsVolumeMetrics, splitGoogleAdsVolumeKeywordIds } from "../lib/minerador/google-ads-volume.ts";

const metric = {
  keyword: "marketing para clínicas", normalizedKeyword: "marketing para clínicas", canonicalKeyword: "marketing para clínicas", closeVariants: ["marketing clinicas"], normalizedCloseVariants: ["marketing clinicas"], matchedRequestedKeywords: ["marketing para clínicas", "marketing clinicas"], averageMonthlySearches: 140, monthlySearchVolumes: [{ year: 2026, month: "JULY", searches: 140 }], competition: "MEDIUM", competitionIndex: 46, lowTopOfPageBidMicros: "6561441", highTopOfPageBidMicros: "29645058", averageCpcMicros: "1200000", currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false }, customerId: "1234567890", provider: "google_ads" as const, providerVersion: "v25" as const, measuredAt: "2026-08-03T10:00:00.000Z",
};

test("particiona internamente o lote técnico sem exigir seleção manual menor", () => {
  const ids = Array.from({ length: 20_001 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  assert.deepEqual(splitGoogleAdsVolumeKeywordIds(ids).map(batch => batch.length), [10_000, 10_000, 1]);
});

test("associa somente keywords correspondentes e preserva as não retornadas", () => {
  const keywords = [
    { id: "a", brandId: "brand-a", keyword: "marketing para clínicas", volume_search: null, results_allintitle: null, kgr_score: null },
    { id: "b", brandId: "brand-a", keyword: "marketing clinicas", volume_search: 8, results_allintitle: 2, kgr_score: 0.25 },
    { id: "c", brandId: "brand-a", keyword: "sem retorno", volume_search: 55, results_allintitle: 5, kgr_score: 0.09 },
  ];
  const result = matchGoogleAdsVolumeMetrics(keywords, [metric], "00000000-0000-4000-8000-000000000001", "request-1");
  assert.deepEqual(result.matches.map(item => item.keywordId), ["a", "b"]);
  assert.deepEqual(result.unmatchedKeywordIds, ["c"]);
});

test("a projeção Google Ads só usa valor confirmado e mantém proveniência", () => {
  const patch = buildGoogleAdsVolumeMetricPatch({ volume_search: 80, results_allintitle: 6, kgr_score: 0.075, analise_semantica: {} }, { ...metric, keywordId: "a", operationRequestId: "00000000-0000-4000-8000-000000000001", googleAdsRequestId: "request-1" });
  assert.equal(patch?.volume_search, 140);
  assert.equal(patch?.kgr_score, 0.0429);
  assert.equal(patch?.volume_source, "google_ads");
  assert.equal((patch?.analise_semantica?.volume_measurement as { provider?: string }).provider, "google_ads");
  assert.equal((patch?.analise_semantica?.volume_eligibility as { status?: string }).status, "eligible");
  assert.equal(buildGoogleAdsVolumeMetricPatch({ volume_search: 80, results_allintitle: 6, kgr_score: 0.075 }, { ...metric, averageMonthlySearches: null, keywordId: "a", operationRequestId: "00000000-0000-4000-8000-000000000001", googleAdsRequestId: "request-1" }), null);
  const unavailable = buildGoogleAdsUnavailableVolumePatch({ volume_search: 80, results_allintitle: 6, kgr_score: 0.075, analise_semantica: {} }, { ...metric, averageMonthlySearches: null, keywordId: "a", operationRequestId: "00000000-0000-4000-8000-000000000001", googleAdsRequestId: "request-1" });
  assert.equal((unavailable?.analise_semantica?.volume_eligibility as { status?: string }).status, "unavailable");
  assert.equal(unavailable && "volume_search" in unavailable, false);
});

test("a página e a Extensão não mantêm um caminho ativo para RapidAPI de volume", async () => {
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const legacyPageRoute = await readFile(new URL("../app/api/volume/route.ts", import.meta.url), "utf8");
  assert.match(workspace, /\/api\/minerador\/marcas\/\$\{encodeURIComponent\(selectedBrandId\)\}\/google-ads\/metricas-keywords/);
  assert.doesNotMatch(workspace, /fetch\("\/api\/volume"/);
  assert.match(legacyPageRoute, /VOLUME_MOVED_TO_GOOGLE_ADS/);
  assert.doesNotMatch(legacyPageRoute, /RAPIDAPI_KEY|rapidapi\.com/i);
});

test("migration cria conexão tenantizada e histórico versionado com RLS", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0007_minerador_google_ads_volume.sql", import.meta.url), "utf8");
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /REFERENCES public\.marcas\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /REFERENCES public\.keywords_kgr\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /UNIQUE \(operation_request_id, keyword_id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /public\.can_access_brand\(brand_id\)/);
  assert.match(migration, /public\.tenant_actor_has_permission\(brand_id, 'minerador', 'edit'\)/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("resposta parcial preserva diagnóstico limitado das chaves retornadas pelo Google", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url), "utf8");
  assert.match(route, /providerReturnedCount: allMetrics\.length/);
  assert.match(route, /providerReturnedKeywords = allMetrics\.slice\(0, 25\)/);
  assert.match(route, /canonicalKeyword: metric\.canonicalKeyword/);
  assert.match(route, /providerReturnedKeywordsTruncated/);
  assert.doesNotMatch(route, /developerToken|clientSecret|refreshToken/);
});
