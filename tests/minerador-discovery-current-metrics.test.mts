import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AllintitlePersistenceRequestSchema } from "../lib/minerador/allintitle-persistence.ts";
import { mapDiscoveryCandidateCurrentMetrics, mergeDiscoveryCandidateCurrentMetrics } from "../lib/minerador/discovery-current-metrics.ts";

const requestId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";

test("o protocolo aceita keyword legada e candidata como metas distintas", () => {
  const parsed = AllintitlePersistenceRequestSchema.parse({ operationRequestId: requestId, batchId: requestId, results: [
    { requestId, keywordId: candidateId, status: "success", resultsAllintitle: 4, measuredAt: "2026-08-04T12:00:00.000Z" },
    { requestId: "33333333-3333-4333-8333-333333333333", targetKind: "discovery_candidate", candidateId, status: "zero_results", resultsAllintitle: 0, measuredAt: "2026-08-04T12:00:00.000Z" },
  ] });
  assert.equal(parsed.results[1].targetKind, "discovery_candidate");
  const failedCandidate = AllintitlePersistenceRequestSchema.parse({ operationRequestId: requestId, batchId: requestId, results: [{ requestId: "33333333-3333-4333-8333-333333333333", targetKind: "discovery_candidate", candidateId, status: "captcha", resultsAllintitle: null, measuredAt: "2026-08-04T12:00:00.000Z", errorCode: "captcha_detected", message: "Libere a aba do Google." }] });
  assert.equal(failedCandidate.results[0].errorCode, "captcha_detected");
  assert.throws(() => AllintitlePersistenceRequestSchema.parse({ operationRequestId: requestId, batchId: requestId, results: [{ requestId, targetKind: "discovery_candidate", candidateId, keywordId: candidateId, status: "success", resultsAllintitle: 1, measuredAt: "2026-08-04T12:00:00.000Z" }] }));
});

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
