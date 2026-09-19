import assert from "node:assert/strict";
import test from "node:test";
import { allintitleFixtures } from "./allintitle-google.fixture.ts";
import { buildDataForSeoAllintitleRequest } from "../lib/minerador/dataforseo-serp-core.ts";
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

/* ===================== a consulta do KGR não leva aspas ==================== */

test("a consulta allintitle não leva aspas e preserva todas as palavras", () => {
  // Medição real de 2026-09-18: allintitle:"cnc" devolveu 1 resultado e
  // allintitle:cnc devolveu 1.720. A aspa degenerava a consulta.
  assert.equal(buildAllintitleQuery("cnc"), "allintitle:cnc");
  assert.equal(buildAllintitleQuery("skin care noturno"), "allintitle:skin care noturno");
  assert.equal(buildAllintitleQuery("  hidratante   corporal  "), "allintitle:hidratante corporal");
  // Aspas e barras no termo quebram o operador; continuam removidas.
  assert.equal(buildAllintitleQuery('serum "principia"'), "allintitle:serum principia");
  assert.equal(buildAllintitleQuery("retinol\\creamy"), "allintitle:retinol creamy");
  for (const keyword of ["cnc", "skin care noturno", 'serum "principia"']) {
    assert.equal(buildAllintitleQuery(keyword).includes('"'), false, `a consulta de ${keyword} não pode conter aspas`);
  }
});

test("o corpo enviado à DataForSEO carrega a consulta sem aspas", () => {
  const built = buildDataForSeoAllintitleRequest({
    keyword: "skin care noturno",
    locationCode: 2076,
    languageCode: "pt",
    operationRequestId: "87775d02-22eb-4357-bbe4-2f30e76151a3",
  });
  assert.equal(built.query, "allintitle:skin care noturno");
  assert.equal(built.body[0].keyword, "allintitle:skin care noturno");
  assert.equal(JSON.stringify(built.body).includes('\\"'), false);
});

test("a página que confirma outra consulta continua sendo recusada", () => {
  const outraConsulta = classifyAllintitleText(
    "Aproximadamente 1.234 resultados allintitle:outro termo qualquer",
    buildAllintitleQuery("seo para clinicas"),
  );
  assert.equal(outraConsulta.status, "unavailable");
  assert.equal(outraConsulta.errorCode, "query_mismatch");
  // E a página que confirma a consulta pedida é aceita mesmo com texto em volta.
  const confirmada = classifyAllintitleText(
    "Google Aproximadamente 3.750 resultados allintitle:seo para clinicas Ferramentas Todos os resultados",
    buildAllintitleQuery("seo para clinicas"),
  );
  assert.deepEqual(confirmada, { status: "success", resultsAllintitle: 3750 });
});
