import assert from "node:assert/strict";
import test from "node:test";
import { allintitleFixtures } from "./allintitle-google.fixture.ts";
import { ALLINTITLE_DEFAULT_BATCH_SIZE, ALLINTITLE_ITEM_TIMEOUT_MS, ALLINTITLE_MAX_BATCH_SIZE, ALLINTITLE_TOTAL_TIMEOUT_MS, buildAllintitleMetricPatch, buildAllintitleQuery, classifyAllintitleText, isPersistableAllintitleResult, parseAllintitleCountText, partitionAllintitleItems, type AllintitleMeasurementResult } from "../lib/minerador/allintitle.ts";

const base = { type: "minerador.allintitle.result.v1" as const, requestId: "request-a", batchId: "batch-a", keywordId: "keyword-a", brandId: "brand-a", keyword: "seo para clinicas", query: buildAllintitleQuery("seo para clinicas"), source: "google_search_extension" as const, measuredAt: "2026-07-22T12:00:00.000Z" };

test("parser aceita contagem comum e separadores brasileiro e internacional", () => {
  assert.deepEqual(classifyAllintitleText(allintitleFixtures.common, base.query), { status: "success", resultsAllintitle: 1234 });
  assert.deepEqual(classifyAllintitleText(allintitleFixtures.portuguese, base.query), { status: "success", resultsAllintitle: 12345 });
});

test("parser ancora a contagem em resultados e ignora o tempo da consulta", () => {
  assert.equal(parseAllintitleCountText("Aproximadamente 282 resultados (0,21 s)"), 282);
  assert.equal(parseAllintitleCountText("Aproximadamente 1.234 resultados"), 1234);
  assert.equal(parseAllintitleCountText("About 1,234 results"), 1234);
  assert.equal(parseAllintitleCountText("0,21 s"), null);
});

test("zero exige evidência explícita e ausência vira unavailable", () => {
  assert.deepEqual(classifyAllintitleText(allintitleFixtures.zero, base.query), { status: "zero_results", resultsAllintitle: 0 });
  const unavailable = classifyAllintitleText(allintitleFixtures.unavailable, base.query);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.errorCode, "result_count_not_found");
  assert.equal(unavailable.stage, "google_result_extraction");
  assert.equal(unavailable.message, "A consulta foi concluída, mas o contador de resultados não pôde ser identificado.");
});

test("CAPTCHA, consentimento e bloqueio não se tornam zero", () => {
  assert.equal(classifyAllintitleText(allintitleFixtures.captcha, base.query).status, "captcha");
  assert.equal(classifyAllintitleText(allintitleFixtures.consent, base.query).status, "blocked");
  assert.equal(classifyAllintitleText(allintitleFixtures.blocked, base.query).status, "blocked");
});

test("contrato reconhece somente sucesso numérico e zero confirmado como persistíveis", () => {
  const success: AllintitleMeasurementResult = { ...base, status: "success", resultsAllintitle: 10 };
  assert.equal(isPersistableAllintitleResult(success), true);
  assert.equal(isPersistableAllintitleResult({ ...base, status: "zero_results", resultsAllintitle: 0 }), true);
  assert.equal(isPersistableAllintitleResult({ ...base, status: "unavailable" }), false);
  assert.equal(isPersistableAllintitleResult({ ...base, status: "success", resultsAllintitle: 0 }), false);
});

test("patch preserva volume e calcula KGR apenas quando aplicável", () => {
  const existing = { results_allintitle: 7, volume_search: 100, kgr_score: 0.07, analise_semantica: { existing: true } };
  const result: AllintitleMeasurementResult = { ...base, status: "success", resultsAllintitle: 20 };
  assert.deepEqual(buildAllintitleMetricPatch(existing, result, "applicable"), {
    results_allintitle: 20,
    kgr_score: 0.2,
    analise_semantica: {
      existing: true,
      allintitle_measurement: { source: "google_search_extension", measuredAt: base.measuredAt, batchId: "batch-a", query: base.query, status: "success", previousResultsAllintitle: 7, resultsAllintitle: 20 },
      allintitle_measurement_history: [],
    },
  });
  assert.equal("kgr_score" in buildAllintitleMetricPatch(existing, result, "not_applicable"), false);
  assert.deepEqual(buildAllintitleMetricPatch(existing, { ...base, status: "error" }, "applicable"), {});
});

test("limites de lote permanecem pequenos e explícitos", () => {
  assert.equal(ALLINTITLE_DEFAULT_BATCH_SIZE, 5);
  assert.equal(ALLINTITLE_MAX_BATCH_SIZE, 10);
});

test("seleção total é repartida internamente sem limitar a operação", () => {
  assert.deepEqual(partitionAllintitleItems(Array.from({ length: 10 }, (_, index) => index)).map(batch => batch.length), [10]);
  assert.deepEqual(partitionAllintitleItems(Array.from({ length: 11 }, (_, index) => index)).map(batch => batch.length), [10, 1]);
  assert.deepEqual(partitionAllintitleItems(Array.from({ length: 23 }, (_, index) => index)).map(batch => batch.length), [10, 10, 3]);
  assert.deepEqual(partitionAllintitleItems(Array.from({ length: 51 }, (_, index) => index)).map(batch => batch.length), [10, 10, 10, 10, 10, 1]);
});

test("timeout é terminal e nunca pode ser persistido como métrica", () => {
  assert.ok(ALLINTITLE_ITEM_TIMEOUT_MS > 0);
  assert.ok(ALLINTITLE_TOTAL_TIMEOUT_MS >= ALLINTITLE_ITEM_TIMEOUT_MS);
  assert.equal(isPersistableAllintitleResult({ ...base, status: "timeout", errorCode: "measurement_timeout" }), false);
  assert.deepEqual(buildAllintitleMetricPatch({ results_allintitle: 7, volume_search: 100, kgr_score: 0.07 }, { ...base, status: "timeout" }, "applicable"), {});
});
