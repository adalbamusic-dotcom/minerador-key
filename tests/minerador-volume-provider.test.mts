import assert from "node:assert/strict";
import test from "node:test";
import { googleKeywordInsightResponseFixture } from "./google-keyword-insight-response.fixture.ts";
import { googleKeywordTrendingInsightResponseFixture } from "./google-keyword-trending-insight-response.fixture.ts";
import { keywordMagicToolResponseFixture } from "./keyword-magic-tool-response.fixture.ts";
import { seoKeywordResearchResponseFixture } from "./seo-keyword-research-response.fixture.ts";
import { buildVolumeMetricPatch, normalizeGoogleKeywordInsightResponse, normalizeGoogleKeywordTrendingInsightResponse, normalizeKeywordMagicToolResponse, normalizeSeoKeywordResearchResponse } from "../lib/minerador/volume-provider.ts";

test("normaliza o contrato real do Google Keyword Insight por correspondência exata", () => {
  const result = normalizeGoogleKeywordInsightResponse(googleKeywordInsightResponseFixture, "keyword de teste");

  assert.deepEqual(result, {
    keyword: "keyword de teste",
    status: "success",
    volume: 10,
    metrics: {
      competitionLevel: "MEDIUM",
      competitionIndex: 64,
      lowBid: 1.159331,
      highBid: 2.945312,
      trend: 0,
    },
  });
});

test("sugestão relacionada não é atribuída à keyword solicitada", () => {
  assert.deepEqual(
    normalizeGoogleKeywordInsightResponse(googleKeywordInsightResponseFixture, "keyword ausente"),
    { keyword: "keyword ausente", status: "not_found" },
  );
});

test("schema inesperado retorna erro estruturado", () => {
  assert.deepEqual(
    normalizeGoogleKeywordInsightResponse({ unexpected: true }, "keyword de teste"),
    { keyword: "keyword de teste", status: "error", error: "Resposta do provedor não possui uma lista de sugestões válida." },
  );
});

test("Trending Insight reconhece a keyword, mas não usa value como volume", () => {
  assert.deepEqual(
    normalizeGoogleKeywordTrendingInsightResponse(googleKeywordTrendingInsightResponseFixture, "ai"),
    {
      keyword: "ai",
      status: "error",
      error: "Trending Insight retorna índices de tendência de consultas relacionadas, não volume mensal da keyword.",
    },
  );
});

test("Trending Insight retorna not_found quando meta.keyword não corresponde", () => {
  assert.deepEqual(
    normalizeGoogleKeywordTrendingInsightResponse(googleKeywordTrendingInsightResponseFixture, "seo para clinicas"),
    { keyword: "seo para clinicas", status: "not_found" },
  );
});

test("Trending Insight rejeita resposta parcial sem listas top e rising", () => {
  assert.deepEqual(
    normalizeGoogleKeywordTrendingInsightResponse([{ success: true, meta: { keyword: "ai" }, data: { top: [] } }], "ai"),
    { keyword: "ai", status: "error", error: "Trending Insight não retornou listas top e rising válidas." },
  );
});

test("Keyword Magic Tool normaliza search volume apenas para a keyword exata", () => {
  assert.deepEqual(
    normalizeKeywordMagicToolResponse(keywordMagicToolResponseFixture, "api marketplace"),
    { keyword: "api marketplace", status: "success", volume: 70 },
  );
});

test("Keyword Magic Tool não usa volume de ideia relacionada", () => {
  assert.deepEqual(
    normalizeKeywordMagicToolResponse(keywordMagicToolResponseFixture, "rapidapi marketplace"),
    { keyword: "rapidapi marketplace", status: "not_found" },
  );
});

test("Keyword Magic Tool rejeita search volume ausente ou inválido", () => {
  assert.deepEqual(
    normalizeKeywordMagicToolResponse({ keyword_ideas: [{ keyword: "api marketplace", "search volume": null }] }, "api marketplace"),
    { keyword: "api marketplace", status: "error", error: "A keyword exata não possui search volume numérico válido." },
  );
});

test("SEO Keyword Research normaliza avg_monthly_searches da keyword exata", () => {
  assert.deepEqual(
    normalizeSeoKeywordResearchResponse(seoKeywordResearchResponseFixture, "python"),
    { keyword: "python", status: "success", volume: 90500 },
  );
});

test("SEO Keyword Research não atribui sugestão relacionada à solicitação", () => {
  assert.deepEqual(
    normalizeSeoKeywordResearchResponse(seoKeywordResearchResponseFixture, "python para iniciantes"),
    { keyword: "python para iniciantes", status: "not_found" },
  );
});

test("SEO Keyword Research rejeita volume mensal inválido", () => {
  assert.deepEqual(
    normalizeSeoKeywordResearchResponse({ result: [{ keyword: "python", avg_monthly_searches: null }] }, "python"),
    { keyword: "python", status: "error", error: "A keyword exata não possui avg_monthly_searches numérico válido." },
  );
});

test("SEO Keyword Research aceita zero somente quando o campo numérico existe na keyword exata", () => {
  assert.deepEqual(
    normalizeSeoKeywordResearchResponse({ result: [{ keyword: "python", avg_monthly_searches: 0 }] }, "python"),
    { keyword: "python", status: "success", volume: 0 },
  );
  assert.equal(normalizeSeoKeywordResearchResponse({ result: [{ keyword: "python", avg_monthly_searches: "0" }] }, "python").status, "error");
  assert.equal(normalizeSeoKeywordResearchResponse({ result: [{ keyword: "python" }] }, "python").status, "error");
  assert.equal(normalizeSeoKeywordResearchResponse({ result: [{ keyword: "python related", avg_monthly_searches: 0 }] }, "python").status, "not_found");
});

test("resposta sem medição não gera patch destrutivo", () => {
  const existing = { volume_search: 80, results_allintitle: 6, kgr_score: 0.075, volume_source: "real" };
  assert.deepEqual(buildVolumeMetricPatch(existing, undefined), {});
});

test("medição válida altera volume e recalcula KGR sem tocar resultados", () => {
  const existing = { volume_search: 80, results_allintitle: 6, kgr_score: 0.075, volume_source: "real" };
  assert.deepEqual(buildVolumeMetricPatch(existing, 120), {
    volume_search: 120,
    kgr_score: 0.05,
    volume_source: "real",
  });
});

test("volume zero invalida KGR atual para evitar score com divisão por zero", () => {
  const existing = { volume_search: 80, results_allintitle: 6, kgr_score: 0.075, volume_source: "real" };
  assert.deepEqual(buildVolumeMetricPatch(existing, 0), {
    volume_search: 0,
    kgr_score: null,
    volume_source: "real",
  });
});

test("volume zero explicito invalida KGR atual e preserva o anterior no historico", () => {
  const existing = { volume_search: 80, results_allintitle: 6, kgr_score: 0.075, volume_source: "real" };
  const patch = buildVolumeMetricPatch(existing, {
    keyword: "python",
    status: "success",
    volume: 0,
    source: "seo-keyword-research8",
    measuredAt: "2026-07-26T12:00:00.000Z",
    match: "exact",
  });
  assert.equal(patch.kgr_score, null);
  assert.equal(patch.volume_search, 0);
  assert.equal(patch.analise_semantica?.volume_measurement && (patch.analise_semantica.volume_measurement as Record<string, unknown>).status, "zero_confirmed");
  assert.deepEqual(patch.analise_semantica?.kgr_score_history, [{ score: 0.075, volume: 80, results: 6, changedAt: "2026-07-26T12:00:00.000Z", reason: "zero_confirmed" }]);
  assert.equal(existing.results_allintitle, 6);
});

test("volume positivo sem resultados invalida KGR antigo sem alterar resultados", () => {
  const existing = { volume_search: 80, results_allintitle: null, kgr_score: 0.075, volume_source: "real" };
  const patch = buildVolumeMetricPatch(existing, {
    keyword: "python",
    status: "success",
    volume: 120,
    source: "seo-keyword-research8",
    measuredAt: "2026-07-26T12:00:00.000Z",
    match: "exact",
  });
  assert.equal(patch.volume_search, 120);
  assert.equal(patch.kgr_score, null);
  assert.equal(existing.results_allintitle, null);
});
