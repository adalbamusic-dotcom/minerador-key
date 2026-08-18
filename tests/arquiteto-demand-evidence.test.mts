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
