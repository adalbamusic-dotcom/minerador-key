import assert from "node:assert/strict";
import test from "node:test";
import { buildVolumeMetricPatch } from "../lib/minerador/volume-provider.ts";

/*
 * 2026-10-16 · F1 da linha única do Minerador: os testes dos normalizadores da
 * RapidAPI saíram com eles (o Volume é só do Google Ads). Ficam os testes do
 * construtor do patch, que a rota do Google Ads usa.
 */

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
    source: "google_ads",
    measuredAt: "2026-07-26T12:00:00.000Z",
    match: "exact",
  });
  assert.equal(patch.kgr_score, null);
  assert.equal(patch.volume_search, 0);
  assert.equal(patch.analise_semantica?.volume_measurement && (patch.analise_semantica.volume_measurement as Record<string, unknown>).status, "zero_confirmed");
  assert.equal((patch.analise_semantica?.volume_measurement as Record<string, unknown>).source, "google_ads", "a fonte é a que a rota declara, sem padrão de provider aposentado");
  assert.deepEqual(patch.analise_semantica?.kgr_score_history, [{ score: 0.075, volume: 80, results: 6, changedAt: "2026-07-26T12:00:00.000Z", reason: "zero_confirmed" }]);
  assert.equal(existing.results_allintitle, 6);
});

test("volume positivo sem resultados invalida KGR antigo sem alterar resultados", () => {
  const existing = { volume_search: 80, results_allintitle: null, kgr_score: 0.075, volume_source: "real" };
  const patch = buildVolumeMetricPatch(existing, {
    keyword: "python",
    status: "success",
    volume: 120,
    source: "google_ads",
    measuredAt: "2026-07-26T12:00:00.000Z",
    match: "exact",
  });
  assert.equal(patch.volume_search, 120);
  assert.equal(patch.kgr_score, null);
  assert.equal(existing.results_allintitle, null);
});
