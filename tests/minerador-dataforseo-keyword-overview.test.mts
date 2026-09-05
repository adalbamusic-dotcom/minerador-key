import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDataForSeoKeywordOverviewRequest,
  dataForSeoKeywordDifficultyStateLabel,
  isProcessorValidatedDataForSeoKeywordOverview,
  normalizeDataForSeoKeywordOverviewResponse,
  readDataForSeoKeywordDifficulty,
  readDataForSeoKeywordDifficultyEvidence,
} from "../lib/minerador/dataforseo-keyword-overview-core.ts";

const request = {
  keyword: "portaria remota para condomínio pequeno",
  locationCode: 2076,
  languageCode: "pt",
  operationRequestId: "10000000-0000-4000-8000-000000000099",
};

function responseFor(item: Record<string, unknown> | null) {
  return {
    tasks: [{
      id: "overview-task-1",
      status_code: 20000,
      cost: 0.0201,
      result: [{ location_code: 2076, language_code: "pt", items: item ? [item] : [] }],
    }],
  };
}

test("Keyword Overview usa a chamada Labs no mesmo passo e desliga SERP/clickstream", () => {
  const built = buildDataForSeoKeywordOverviewRequest(request);
  assert.deepEqual(built.body[0], {
    keywords: [request.keyword],
    location_code: 2076,
    language_code: "pt",
    include_serp_info: false,
    include_clickstream_data: false,
    tag: request.operationRequestId,
  });
});

test("normalização preserva KD 42 e somente as evidências SEO complementares", () => {
  const measurement = normalizeDataForSeoKeywordOverviewResponse(responseFor({
    keyword: request.keyword,
    location_code: 2076,
    language_code: "pt",
    keyword_properties: {
      keyword_difficulty: 42,
      core_keyword: "portaria remota",
      detected_language: "pt",
      is_another_language: false,
    },
    keyword_info: { last_updated_time: "2026-08-18 12:00:00 +00:00", cpc: 20.5, search_volume: 999 },
    avg_backlinks_info: { backlinks: 120.5, referring_domains: 18.2, main_domain_rank: 44.1, last_updated_time: "2026-08-17 12:00:00 +00:00" },
    search_intent_info: { main_intent: "commercial", foreign_intent: ["informational"], last_updated_time: "2026-08-16 12:00:00 +00:00" },
  }), request, "2026-08-19T12:00:00.000Z");

  assert.equal(measurement.keywordDifficulty, 42);
  assert.equal(measurement.coreKeyword, "portaria remota");
  assert.equal(measurement.externalIntent, "commercial");
  assert.equal(measurement.avgReferringDomains, 18.2);
  assert.equal(measurement.measuredAt, "2026-08-19T12:00:00.000Z");
  assert.equal("cpc" in measurement, false);
  assert.equal("searchVolume" in measurement, false);
});

test("KD zero é válido, KD ausente permanece desconhecido e resposta sem item não vira zero", () => {
  const zero = normalizeDataForSeoKeywordOverviewResponse(responseFor({ keyword: request.keyword, location_code: 2076, language_code: "pt", keyword_properties: { keyword_difficulty: 0 } }), request);
  const absent = normalizeDataForSeoKeywordOverviewResponse(responseFor({ keyword: request.keyword, location_code: 2076, language_code: "pt", keyword_properties: {} }), request);
  const noItem = normalizeDataForSeoKeywordOverviewResponse(responseFor(null), request);
  assert.equal(zero.keywordDifficulty, 0);
  assert.equal(absent.keywordDifficulty, null);
  assert.equal(noItem.keywordDifficulty, null);
  assert.equal(readDataForSeoKeywordDifficulty({ keywordDifficulty: 0 }), 0);
  assert.equal(readDataForSeoKeywordDifficulty({ keyword_difficulty: 101 }), null);
});

test("snapshot importado não vira etapa validada e medição do Processador é identificada", () => {
  const imported = { discovery_import: { sourceSnapshot: { importedMetrics: { keywordDifficulty: 38, provider: "dataforseo" } } } };
  const importedEvidence = readDataForSeoKeywordDifficultyEvidence(imported);
  assert.equal(importedEvidence.value, 38);
  assert.equal(importedEvidence.source, "imported");
  assert.equal(importedEvidence.state, "imported");
  assert.equal(isProcessorValidatedDataForSeoKeywordOverview(importedEvidence.measurement), false);

  const processor = { dataforseo_keyword_overview: { provider: "dataforseo", executor: "minerador_server", operationRequestId: request.operationRequestId, keywordDifficulty: 42 } };
  const processorEvidence = readDataForSeoKeywordDifficultyEvidence(processor);
  assert.equal(processorEvidence.value, 42);
  assert.equal(processorEvidence.source, "processor");
  assert.equal(processorEvidence.state, "validated");
  assert.equal(dataForSeoKeywordDifficultyStateLabel(processorEvidence.state, processorEvidence.value), "Validado no Processador");
});

test("resultado incompatível não é aceito silenciosamente", () => {
  assert.throws(() => normalizeDataForSeoKeywordOverviewResponse(responseFor({ keyword: "outra keyword", location_code: 2076, language_code: "pt", keyword_properties: { keyword_difficulty: 42 } }), request), /não corresponde/);
});
