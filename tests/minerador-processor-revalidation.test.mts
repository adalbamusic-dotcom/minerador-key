import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveProcessorRevalidation,
  processorKgrStateLabel,
  processorMetricStateLabel,
} from "../lib/minerador/processor-revalidation.ts";
import { buildSemanticReviewContext } from "../lib/minerador/semantic-review.ts";

const discoverySemantic = {
  dna_origem: "preliminar_discovery",
  discovery_import: {
    source: "google_ads_discovery",
    lastMeasurement: {
      volume: 90,
      volumeMeasuredAt: "2026-08-18T10:00:00.000Z",
      resultsAllintitle: 336,
      resultsMeasuredAt: "2026-08-18T10:01:00.000Z",
    },
    sourceSnapshot: {
      source: "google_ads",
      provider: "google_ads",
      providerVersion: "v25",
      measuredAt: "2026-08-18T10:00:00.000Z",
      metrics: {
        averageMonthlySearches: 90,
        monthlySearchVolumes: [{ year: 2026, month: "JULHO", monthlySearches: 90 }],
        competition: "MEDIUM",
        resultsAllintitle: 336,
        allintitleMeasuredAt: "2026-08-18T10:01:00.000Z",
        keywordDifficulty: 38,
      },
    },
  },
};

const validGoogleAdsMeasurement = {
  provider: "google_ads",
  providerVersion: "v25",
  averageMonthlySearches: 110,
  monthlySearchVolumes: [{ year: 2026, month: "AGOSTO", monthlySearches: 110 }],
  competition: "MEDIUM",
  measuredAt: "2026-08-18T12:00:00.000Z",
};

const validDataForSeoMeasurement = {
  provider: "dataforseo",
  providerVersion: "v3",
  status: "success",
  resultsAllintitle: 280,
  query: "allintitle:\"portaria remota para condomínio pequeno\"",
  measuredAt: "2026-08-18T12:05:00.000Z",
};

test("Discovery não transforma snapshots anteriores em etapas validadas", () => {
  const semantic = structuredClone(discoverySemantic);
  const derived = deriveProcessorRevalidation({
    semantic,
    volumeSearch: 90,
    resultsAllintitle: 336,
  });

  assert.equal(derived.discoveryImported, true);
  assert.equal(derived.volume.state, "imported");
  assert.equal(derived.volume.validated, false);
  assert.equal(derived.results.state, "imported");
  assert.equal(derived.results.validated, false);
  assert.equal(derived.kgr.ready, false);
  assert.equal(derived.kgr.score, null);
  assert.equal(derived.kgr.source, "imported");
  assert.equal(derived.kgr.volumeUsed, 90);
  assert.equal(derived.kgr.allintitleUsed, 336);
  assert.equal(processorMetricStateLabel(derived.volume.state, true), "Anterior/importado · aguardando revalidação");
  assert.equal(processorKgrStateLabel(derived.kgr), "Aguardando revalidação dos inputs importados");
  assert.deepEqual(semantic, discoverySemantic);
});

test("a revalidação pode avançar por domínio sem promover o outro snapshot", () => {
  const derived = deriveProcessorRevalidation({
    semantic: discoverySemantic,
    volumeMeasurement: validGoogleAdsMeasurement,
    volumeSearch: 90,
    resultsAllintitle: 336,
  });

  assert.equal(derived.volume.state, "validated");
  assert.equal(derived.volume.value, 110);
  assert.equal(derived.volume.measuredAt, "2026-08-18T12:00:00.000Z");
  assert.equal(derived.results.state, "imported");
  assert.equal(derived.results.value, 336);
  assert.equal(derived.kgr.ready, false);
  assert.equal(derived.kgr.source, "mixed");
  assert.equal(derived.kgr.score, null);
});

test("KGR só fica calculável quando os dois providers têm medição do Processador", () => {
  const derived = deriveProcessorRevalidation({
    semantic: discoverySemantic,
    volumeMeasurement: validGoogleAdsMeasurement,
    dataForSeoMeasurement: validDataForSeoMeasurement,
    volumeSearch: 90,
    resultsAllintitle: 336,
  });

  assert.equal(derived.volume.state, "validated");
  assert.equal(derived.results.state, "validated");
  assert.equal(derived.kgr.ready, true);
  assert.equal(derived.kgr.source, "processor");
  assert.equal(derived.kgr.volumeUsed, 110);
  assert.equal(derived.kgr.allintitleUsed, 280);
  assert.equal(derived.kgr.score, 2.5455);
});

test("R5 recebe o estado de revalidação e não apresenta KGR importado como fato atual", () => {
  const context = buildSemanticReviewContext({
    keyword: "portaria remota para condomínio pequeno",
    intent: "Informativo",
    volume_search: 90,
    results_allintitle: 336,
    kgr_score: 3.7333,
    analise_semantica: discoverySemantic,
  });

  assert.equal(context.googleAds.valid, false);
  assert.equal(context.googleAds.validationState, "imported");
  assert.equal(context.googleAds.source, "discovery");
  assert.equal(context.googleAds.volume, 90);
  assert.equal(context.dataForSeo.valid, false);
  assert.equal(context.dataForSeo.validationState, "imported");
  assert.equal(context.dataForSeo.source, "discovery");
  assert.equal(context.dataForSeo.allintitle, 336);
  assert.equal(context.dataForSeo.keywordDifficulty, 38);
  assert.equal(context.kgr.score, null);
  assert.equal(context.kgr.persistedScore, 3.7333);
  assert.equal(context.kgr.inputSource, "imported");
});
