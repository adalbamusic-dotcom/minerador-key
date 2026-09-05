import test from "node:test";
import assert from "node:assert/strict";
import { buildDataForSeoKeywordFailureSemantic, buildDataForSeoKeywordMeasurementPatch } from "../lib/minerador/dataforseo-allintitle.ts";
import type { DataForSeoAllintitleMeasurement } from "../lib/minerador/dataforseo-serp-core.ts";
import type { DataForSeoKeywordOverviewMeasurement } from "../lib/minerador/dataforseo-keyword-overview-core.ts";

const measurement: DataForSeoAllintitleMeasurement = {
  keyword: "marketing para clínicas",
  query: 'allintitle:"marketing para clínicas"',
  resultsAllintitle: 60500,
  locationCode: 2076,
  languageCode: "pt",
  measuredAt: "2026-08-04T12:00:00.000Z",
  provider: "dataforseo",
  providerVersion: "v3",
  endpoint: "/v3/serp/google/organic/live/regular",
  providerRequestId: "task-1",
  cost: 0.003,
  checkUrl: null,
};

const overview: DataForSeoKeywordOverviewMeasurement = {
  keyword: measurement.keyword,
  locationCode: 2076,
  languageCode: "pt",
  measuredAt: "2026-08-04T12:00:02.000Z",
  provider: "dataforseo",
  providerVersion: "v3",
  endpoint: "/v3/dataforseo_labs/google/keyword_overview/live",
  providerRequestId: "overview-task-1",
  cost: 0.0201,
  keywordDifficulty: 42,
  coreKeyword: "marketing para clínicas",
  detectedLanguage: "pt",
  isAnotherLanguage: false,
  externalIntent: "commercial",
  externalForeignIntents: [],
  avgBacklinks: 120,
  avgReferringDomains: 18,
  avgMainDomainRank: 44,
  keywordInfoUpdatedAt: "2026-08-03T00:00:00.000Z",
  backlinksInfoUpdatedAt: "2026-08-03T00:00:00.000Z",
  searchIntentUpdatedAt: "2026-08-03T00:00:00.000Z",
};

test("nova medição substitui o valor atual, preserva decisão humana e recalcula KGR", () => {
  const patch = buildDataForSeoKeywordMeasurementPatch({
    existing: {
      results_allintitle: 10,
      volume_search: 1000,
      kgr_score: 0.01,
      analise_semantica: { kgr_aplicabilidade: "applicable", allintitle_measurement: { resultsAllintitle: 10, provider: "legacy" }, allintitle_measurement_history: [{ resultsAllintitle: 4 }] },
    },
    measurement,
    overview,
    operationRequestId: "10000000-0000-4000-8000-000000000010",
    targeting: { locationCode: 2076, languageCode: "pt" },
  });
  assert.equal(patch.results_allintitle, 60500);
  assert.equal(patch.kgr_score, 60.5);
  assert.equal(patch.analise_semantica.kgr_aplicabilidade, "applicable");
  assert.equal((patch.analise_semantica.allintitle_measurement as Record<string, unknown>).provider, "dataforseo");
  assert.equal((patch.analise_semantica.allintitle_measurement_history as Array<Record<string, unknown>>).length, 2);
  assert.equal((patch.analise_semantica.dataforseo_keyword_overview as Record<string, unknown>).keywordDifficulty, 42);
  assert.equal((patch.analise_semantica.dataforseo_keyword_overview as Record<string, unknown>).executor, "minerador_server");
});

test("remedição com o mesmo total renova measuredAt e preserva a leitura anterior no histórico", () => {
  const patch = buildDataForSeoKeywordMeasurementPatch({
    existing: {
      results_allintitle: 10,
      volume_search: 100,
      kgr_score: 0.1,
      analise_semantica: { allintitle_measurement: { resultsAllintitle: 10, measuredAt: "2026-08-04T10:00:00.000Z", provider: "dataforseo" } },
    },
    measurement: { ...measurement, resultsAllintitle: 10, measuredAt: "2026-08-05T10:00:00.000Z" },
    operationRequestId: "10000000-0000-4000-8000-000000000011",
    targeting: { locationCode: 2076, languageCode: "pt" },
  });
  assert.equal(patch.results_allintitle, 10);
  assert.equal(patch.kgr_score, 0.1);
  assert.equal((patch.analise_semantica.allintitle_measurement as Record<string, unknown>).measuredAt, "2026-08-05T10:00:00.000Z");
  assert.deepEqual(patch.analise_semantica.allintitle_measurement_history, [{ resultsAllintitle: 10, measuredAt: "2026-08-04T10:00:00.000Z", provider: "dataforseo", preservedAt: (patch.analise_semantica.allintitle_measurement_history as Array<Record<string, unknown>>)[0].preservedAt }]);
});

test("zero confirmado substitui um resultado positivo e recalcula KGR", () => {
  const patch = buildDataForSeoKeywordMeasurementPatch({
    existing: { results_allintitle: 25, volume_search: 100, kgr_score: 0.25, analise_semantica: { allintitle_measurement: { resultsAllintitle: 25 } } },
    measurement: { ...measurement, resultsAllintitle: 0 },
    operationRequestId: "10000000-0000-4000-8000-000000000012",
    targeting: { locationCode: 2076, languageCode: "pt" },
  });
  assert.equal(patch.results_allintitle, 0);
  assert.equal(patch.kgr_score, 0);
  assert.equal((patch.analise_semantica.allintitle_measurement_history as Array<Record<string, unknown>>)[0].resultsAllintitle, 25);
});

test("falha só acrescenta erro sanitizado e não apaga métricas atuais", () => {
  const semantic = buildDataForSeoKeywordFailureSemantic({ semantic: { allintitle_measurement: { resultsAllintitle: 10 }, kgr_aplicabilidade: "not_applicable" }, errorCode: "dataforseo_total_missing", message: "se_results_count ausente", operationRequestId: "10000000-0000-4000-8000-000000000010", failedAt: "2026-08-04T12:00:00.000Z" });
  assert.equal((semantic.allintitle_measurement as Record<string, unknown>).resultsAllintitle, 10);
  assert.equal((semantic.allintitle_last_error as Record<string, unknown>).errorCode, "dataforseo_total_missing");
  assert.equal(semantic.kgr_aplicabilidade, "not_applicable");
});

test("falha complementar do Keyword Overview preserva KD anterior sem impedir allintitle", () => {
  const patch = buildDataForSeoKeywordMeasurementPatch({
    existing: {
      results_allintitle: 10,
      volume_search: 100,
      kgr_score: 0.1,
      analise_semantica: { dataforseo_keyword_overview: { keywordDifficulty: 38, provider: "dataforseo" } },
    },
    measurement,
    overview: null,
    overviewError: { code: "dataforseo_timeout", message: "tempo excedido", providerRequestId: "overview-task-2" },
    operationRequestId: "10000000-0000-4000-8000-000000000013",
    targeting: { locationCode: 2076, languageCode: "pt" },
  });
  assert.equal(patch.results_allintitle, 60500);
  assert.equal((patch.analise_semantica.dataforseo_keyword_overview as Record<string, unknown>).keywordDifficulty, 38);
  assert.equal((patch.analise_semantica.dataforseo_keyword_overview_last_error as Record<string, unknown>).errorCode, "dataforseo_timeout");
});
