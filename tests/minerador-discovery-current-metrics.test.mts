import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mapDiscoveryCandidateCurrentMetrics, mergeDiscoveryCandidateCurrentMetrics } from "../lib/minerador/discovery-current-metrics.ts";

const requestId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";

// 2026-10-16 · F1 da linha única: o teste do protocolo da Extensão (`allintitle-persistence.ts`, sem chamador) saiu com ele.

test("a projeção atual substitui a métrica operacional sem alterar o snapshot recebido", () => {
  const candidate = { candidateId, keyword: "marketing para clínicas", canonicalKeyword: "marketing para clinicas", averageMonthlySearches: 80, monthlySearchVolumes: [], competition: "LOW", competitionIndex: 10, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null, currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false }, source: "google_ads" as const, sourceData: null, provider: "google_ads" as const, providerVersion: "v25" as const, measuredAt: "2026-08-04T12:00:00.000Z", existingKeywordId: null };
  const current = mapDiscoveryCandidateCurrentMetrics({ candidate_id: candidateId, brand_id: requestId, results_allintitle: 7, allintitle_status: "measured", volume_search: 120, monthly_search_volumes: [{ year: 2026, month: "08", searches: 120 }], currency_code: "BRL", targeting: candidate.targeting, metrics_measured_at: "2026-08-04T12:00:00.000Z" });
  const projected = mergeDiscoveryCandidateCurrentMetrics(candidate, current);
  assert.equal(projected.averageMonthlySearches, 120);
  assert.equal(projected.currentMetrics?.resultsAllintitle, 7);
  assert.equal(candidate.averageMonthlySearches, 80);
});

test("a migration 0013 cria uma única projeção por candidata e histórico append-only tenantizado", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0013_minerador_discovery_candidate_current_metrics.sql", import.meta.url), "utf8");
  assert.match(migration, /minerador_discovery_candidate_current_metrics/);
  assert.match(migration, /PRIMARY KEY REFERENCES public\.minerador_discovery_candidates/);
  assert.match(migration, /minerador_discovery_candidate_metric_history/);
  assert.match(migration, /keyword_id uuid REFERENCES public\.keywords_kgr/);
  assert.match(migration, /can_access_brand/);
});
