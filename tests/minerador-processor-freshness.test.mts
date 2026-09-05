import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveLogicalKeywordDna, mergeLogicalKeywordSemantic } from "../lib/arquiteto/keyword-dna-engine.ts";
import { deriveProcessorRevalidation } from "../lib/minerador/processor-revalidation.ts";
import {
  buildLogicalProcessorMetadata,
  LOGIC_PROCESSOR_VERSION,
  logicalProcessorInputHash,
  logicalSemanticRecordsEqual,
} from "../lib/minerador/logical-processor.ts";
import { readLogicalFunnel, readLogicalIntent, readLogicalNiche } from "../lib/minerador/logical-read-model.ts";
import { readDataForSeoKeywordDifficultyEvidence } from "../lib/minerador/dataforseo-keyword-overview-core.ts";
import { buildDataForSeoKeywordMeasurementPatch } from "../lib/minerador/dataforseo-allintitle.ts";
import { buildGoogleAdsVolumeMetricPatch } from "../lib/minerador/google-ads-volume.ts";

test("reprocessamento histórico usa a leitura lógica atual e não o valor antigo", () => {
  const keyword = "como instalar energia solar residencial";
  const logical = deriveLogicalKeywordDna({ keywordId: "historical-1", keyword });
  const historical = {
    dna_schema_version: "1",
    dna_origem: "legacy_import",
    intencao_principal: "Comercial",
    dna_campos_logicos: "",
    funnel: "BOFU",
  };
  const current = mergeLogicalKeywordSemantic(historical, logical.semantic, { forceLogical: true });

  assert.equal(current.intencao_principal, logical.semantic.intencao_principal);
  assert.notEqual(current.intencao_principal, historical.intencao_principal);
  assert.equal(current.dna_origem, "logico_deterministico");
  assert.equal(current.funnel, historical.funnel);
});

test("metadados de lógica distinguem versão do engine, inputs e instante do processamento", () => {
  const input = { keywordId: "kw-1", keyword: "Portaria   Remota", location: "Brasil", niche: "Serviços" };
  const metadata = buildLogicalProcessorMetadata(input, "2026-08-19T10:00:00.000Z");
  assert.equal(metadata.logicProcessorVersion, LOGIC_PROCESSOR_VERSION);
  assert.equal(metadata.logicInputHash, logicalProcessorInputHash(input));
  assert.equal(metadata.logicProcessedAt, "2026-08-19T10:00:00.000Z");
});

test("comparação de lógica não trata apenas o timestamp de processamento como mudança semântica", () => {
  const base = { intencao_principal: "Informativa", logicProcessorVersion: "r1.1", logicProcessedAt: "2026-08-19T10:00:00.000Z", logicInputHash: "a" };
  const next = { ...base, logicProcessedAt: "2026-08-19T10:05:00.000Z", logicInputHash: "b" };
  assert.equal(logicalSemanticRecordsEqual(base, next), true);
});

test("tabela e KeywordDNA compartilham intenção, nicho e funil atuais", () => {
  const item = {
    intent: "Informativa antiga",
    analise_semantica: {
      intencao_principal: "Comercial investigativa",
      nicho: "Serviços condominiais",
      funnel: "MOFU",
    },
  };
  assert.equal(readLogicalIntent(item), "Comercial investigativa");
  assert.equal(readLogicalNiche(item), "Serviços condominiais");
  assert.equal(readLogicalFunnel(item), "MOFU");
});

test("KGR antigo não é promovido a atual sem duas medições válidas do Processador", () => {
  const derived = deriveProcessorRevalidation({
    volumeSearch: 90,
    resultsAllintitle: 336,
    semantic: { kgr_score: "3.733", volume_search: 90, results_allintitle: 336 },
  });
  assert.equal(derived.kgr.ready, false);
  assert.equal(derived.kgr.score, null);
});

test("ações quantitativas limpam o KGR persistido enquanto o outro input ainda é histórico", () => {
  const dataForSeoPatch = buildDataForSeoKeywordMeasurementPatch({
    existing: { results_allintitle: 336, volume_search: 90, kgr_score: 3.733, analise_semantica: {} },
    measurement: {
      keyword: "keyword",
      locationCode: 2076,
      languageCode: "pt",
      provider: "dataforseo",
      providerVersion: "v3",
      endpoint: "/v3/serp/google/organic/live/regular",
      query: "allintitle:\"keyword\"",
      resultsAllintitle: 280,
      measuredAt: "2026-08-19T10:00:00.000Z",
      providerRequestId: "request-1",
      cost: null,
      checkUrl: null,
    },
    operationRequestId: "00000000-0000-4000-8000-000000000001",
    targeting: {},
    requireCurrentVolumeMeasurement: true,
  });
  assert.equal(dataForSeoPatch.kgr_score, null);

  const googlePatch = buildGoogleAdsVolumeMetricPatch(
    { volume_search: 90, results_allintitle: 336, kgr_score: 3.733, analise_semantica: {} },
    {
      keyword: "keyword",
      normalizedKeyword: "keyword",
      canonicalKeyword: "keyword",
      closeVariants: [],
      normalizedCloseVariants: [],
      matchedRequestedKeywords: ["keyword"],
      keywordId: "00000000-0000-4000-8000-000000000002",
      operationRequestId: "00000000-0000-4000-8000-000000000001",
      googleAdsRequestId: "google-request-1",
      provider: "google_ads",
      providerVersion: "v25",
      averageMonthlySearches: 110,
      monthlySearchVolumes: [],
      competition: "LOW",
      competitionIndex: 10,
      lowTopOfPageBidMicros: null,
      highTopOfPageBidMicros: null,
      averageCpcMicros: "0",
      currencyCode: "BRL",
      timeZone: "America/Sao_Paulo",
      targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
      measuredAt: "2026-08-19T10:00:00.000Z",
      customerId: "1234567890",
    },
    { requireCurrentResultsMeasurement: true },
  );
  assert.equal(googlePatch?.kgr_score, null);
});

test("KD zero continua evidência válida e null continua ausência", () => {
  const zero = readDataForSeoKeywordDifficultyEvidence({
    dataforseo_keyword_overview: { keywordDifficulty: 0, measuredAt: "2026-08-19T10:00:00.000Z", provider: "dataforseo" },
  });
  const missing = readDataForSeoKeywordDifficultyEvidence({
    dataforseo_keyword_overview: { keywordDifficulty: null, measuredAt: "2026-08-19T10:00:00.000Z", provider: "dataforseo" },
  });
  assert.equal(zero.value, 0);
  assert.equal(missing.value, null);
});

test("Processador não aplica projeção do provider sem readback canônico", () => {
  const source = readFileSync("modules/minerador/minerador-workspace.tsx", "utf8");
  assert.match(source, /readCanonicalKeywordRows/);
  assert.match(source, /The table changes only from/);
  assert.doesNotMatch(source, /persistedByKeywordId = new Map<string, VolumeReadback>/);
});
