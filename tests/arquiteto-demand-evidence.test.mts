import assert from "node:assert/strict";
import test from "node:test";
import { articleKeywordReference, legacyKeywordDnaPayload } from "../lib/arquiteto/adapters.ts";
import { suggestPrincipal } from "../lib/arquiteto/engine.ts";
import { normalizeKeywordDemandEvidence, sanitizeKeywordProvenanceSnapshot } from "../lib/arquiteto/demand-evidence.ts";
import { ArchitectKeywordSchema } from "../lib/arquiteto/contracts.ts";

const keyword = (overrides: Record<string, unknown> = {}) => ArchitectKeywordSchema.parse({ id: "kw-1", keyword: "marketing para clinicas", intent: "informacional", analise_semantica: {}, ...overrides });

test("KGR ausente permanece opcional e não impede a KeywordDNA", () => {
  const parsed = legacyKeywordDnaPayload(keyword({ results_allintitle: null, kgr_score: null }));
  assert.equal(parsed.resultCount, null);
  assert.equal(parsed.kgrScore, null);
  assert.equal(parsed.demandEvidence?.historicalKgr?.status, "not_measured");
});

test("volume_measurement atual tem precedência sobre o envelope legado", () => {
  const parsed = normalizeKeywordDemandEvidence(keyword({ analise_semantica: {
    volume_measurement: {
      provider: "google_ads", providerVersion: "v25", measuredAt: "2026-08-03T12:00:00.000Z", averageMonthlySearches: 0,
      monthlySearchVolumes: [{ year: 2026, month: "AUGUST", monthlySearches: 0 }], canonicalKeyword: "marketing para clinicas",
      matchedRequestedKeywords: ["marketing para clinicas"], closeVariants: ["marketing clinicas"], normalizedCloseVariants: ["marketing clinicas"],
      competition: "LOW", competitionIndex: 0, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null,
      currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: { countryCode: "BR" }, googleAdsRequestId: "measurement-1",
    },
    volume_eligibility: { status: "eligible", provider: "google_ads", measuredAt: "2026-08-03T12:00:00.000Z" },
    google_ads_measurement: { source: "google_ads", averageMonthlySearches: 999, monthlySearchVolumes: [], closeVariants: [], normalizedCloseVariants: [] },
  } }));
  assert.equal(parsed.googleAds?.averageMonthlySearches, 0);
  assert.equal(parsed.googleAds?.metricStatus, "eligible");
  assert.equal(parsed.googleAds?.providerCanonicalKeyword, "marketing para clinicas");
  assert.equal(parsed.googleAds?.currencyCode, "BRL");
  assert.deepEqual(parsed.googleAds?.matchedRequestedKeywords, ["marketing para clinicas"]);
  assert.equal(parsed.googleAds?.snapshotRef, "measurement-1");
});

test("métrica Ads normalizada preserva null, zero, CPC e close variants separados", () => {
  const parsed = normalizeKeywordDemandEvidence(keyword({ analise_semantica: { google_ads_measurement: {
    source: "google_ads", providerVersion: "v21", measuredAt: "2026-08-03T12:00:00.000Z", averageMonthlySearches: 0,
    monthlySearchVolumes: [{ year: 2026, month: "AUGUST", monthlySearches: null }], competition: "LOW", competitionIndex: null,
    lowTopOfPageBidMicros: null, highTopOfPageBidMicros: "3500000", averageCpcMicros: null,
    closeVariants: ["marketing clinicas"], normalizedCloseVariants: ["marketing clinicas"],
  } } }));
  assert.equal(parsed.googleAds?.averageMonthlySearches, 0);
  assert.equal(parsed.googleAds?.monthlySearchVolumes[0]?.searches, null);
  assert.equal(parsed.googleAds?.competitionIndexAds, null);
  assert.equal(parsed.googleAds?.averageCpcMicros, null);
  assert.deepEqual(parsed.googleAds?.closeVariants, ["marketing clinicas"]);
});

test("evidências temporais opcionais são transportadas sem virar decisão editorial", () => {
  const parsed = normalizeKeywordDemandEvidence(keyword({ analise_semantica: { volume_measurement: {
    provider: "google_ads", averageMonthlySearches: 20, monthlySearchVolumes: [], closeVariants: [], normalizedCloseVariants: [],
    trend: "crescente", seasonality: { type: "seasonal" }, peakMonths: [1, 7], recentGrowth: -0.2, historyCoverageMonths: 12,
  } } }));
  assert.equal(parsed.googleAds?.trend, "crescente");
  assert.deepEqual(parsed.googleAds?.peakMonths, [1, 7]);
  assert.equal(parsed.googleAds?.recentGrowth, -0.2);
  assert.equal(parsed.googleAds?.historyCoverageMonths, 12);
  assert.deepEqual(parsed.googleAds?.seasonality, { type: "seasonal" });
});

test("evidência já hidratada no KeywordDNA não é descartada ao readaptar a keyword", () => {
  const parsed = normalizeKeywordDemandEvidence(keyword({
    analise_semantica: {},
    demandEvidence: {
      historicalKgr: { resultsAllintitle: null, kgr: null, status: "unavailable" },
      googleAds: {
        source: "google_ads", averageMonthlySearches: 40, monthlySearchVolumes: [], competitionAds: null, competitionIndexAds: null,
        lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null, closeVariants: ["marketing clinicas"], normalizedCloseVariants: [],
        providerCanonicalKeyword: "marketing para clinicas", metricStatus: "eligible",
      },
    },
  }));
  assert.equal(parsed.historicalKgr?.status, "unavailable");
  assert.equal(parsed.googleAds?.averageMonthlySearches, 40);
  assert.equal(parsed.googleAds?.providerCanonicalKeyword, "marketing para clinicas");
});

test("evidência Ads é transportada no snapshot do ArticleDNA sem identificadores privados", () => {
  const source = keyword({ analise_semantica: { google_ads_measurement: { source: "google_ads", averageMonthlySearches: 10, monthlySearchVolumes: [], competition: null, competitionIndex: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null }, customerId: "123" } });
  const reference = articleKeywordReference(source, "principal", "brand-1");
  assert.equal(reference.demandEvidence?.googleAds?.source, "google_ads");
  assert.equal((reference.keywordDnaSnapshot?.sourceKeywordSnapshot as Record<string, unknown>).customerId, undefined);
});

test("volume não é fallback exclusivo para escolher principal", () => {
  const first = keyword({ id: "kw-1", keyword: "tema curto", volume_search: null });
  const second = keyword({ id: "kw-2", keyword: "tema longo com maior volume", volume_search: 1000 });
  const result = suggestPrincipal([first, second]);
  assert.equal(result.keywordId, "kw-1");
});

test("sanitização de proveniência remove conta e payload bruto, preservando demais campos", () => {
  const result = sanitizeKeywordProvenanceSnapshot({ keyword: "tema", customerId: "1", nested: { mcc: "2", keep: true }, rawResponse: { secret: true } }) as Record<string, unknown>;
  assert.deepEqual(result, { keyword: "tema", nested: { keep: true } });
});
