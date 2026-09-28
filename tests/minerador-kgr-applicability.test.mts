import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateKgrFromMetrics,
  classifyKgrMeasurement,
  compareKgrRows,
  hasHumanKgrDecision,
  hasLegacyPendingKgrApplicability,
  hasUsableKgrScore,
  isInKgrInterestVolumeRange,
  KGR_INTEREST_VOLUME_RANGE,
  readStoredKgrApplicability,
  kgrApplicabilityLabel,
  kgrDecisionLabel,
  kgrMeasurementLabel,
  readKgrApplicability,
  setKgrApplicability,
} from "../lib/minerador/kgr-applicability.ts";
import { canonicalIntentLabel, normalizeIntentKey } from "../lib/minerador/intent-taxonomy.ts";

test("sem decisão humana explícita, o KGR é não aplicável por padrão (2026-09-28)", () => {
  assert.equal(readKgrApplicability(null), "not_applicable");
  assert.equal(readKgrApplicability({}), "not_applicable");
  // Score favorável e intenção comercial nunca decidem.
  assert.equal(readKgrApplicability({ kgr_score: 0.1, intent: "comercial" }), "not_applicable");
  // Origem automática (IA, provider) nunca vale como decisão.
  assert.equal(readKgrApplicability({ kgr_decisao: "SIM", kgr_decisao_origem: "ai" }), "not_applicable");
  // "pending" legado é lido como não aplicável, sem regravar.
  const legacy = { kgr_aplicabilidade: "pending", kgr_decisao: "PENDENTE" };
  assert.equal(readKgrApplicability(legacy), "not_applicable");
  assert.equal(readStoredKgrApplicability(legacy), "pending");
  assert.equal(hasLegacyPendingKgrApplicability(legacy), true);
  assert.equal(legacy.kgr_aplicabilidade, "pending");
  // Só a decisão humana "Aplicável" liga o KGR.
  assert.equal(readKgrApplicability({ kgr_aplicabilidade: "applicable", kgr_decisao_origem: "human" }), "applicable");
  assert.equal(hasHumanKgrDecision({ kgr_aplicabilidade: "applicable" }), true);
  assert.equal(hasHumanKgrDecision({ kgr_aplicabilidade: "not_applicable" }), true);
  assert.equal(hasHumanKgrDecision({}), false);
  assert.equal(hasHumanKgrDecision(legacy), false);
  assert.equal(readStoredKgrApplicability({}), null);
});

test("faixa de interesse 150–550 é só informativa: não aplica o KGR", () => {
  assert.deepEqual(KGR_INTEREST_VOLUME_RANGE, { min: 150, max: 550 });
  assert.equal(isInKgrInterestVolumeRange(150), true);
  assert.equal(isInKgrInterestVolumeRange(550), true);
  assert.equal(isInKgrInterestVolumeRange(149), false);
  assert.equal(isInKgrInterestVolumeRange(551), false);
  assert.equal(isInKgrInterestVolumeRange(null), false);
  assert.equal(isInKgrInterestVolumeRange(Number.NaN), false);
  assert.equal(readKgrApplicability({ volume_search: 300, kgr_score: 0.1 }), "not_applicable");
});

test("marcar Aplicável sobre o padrão não grava histórico de decisão inexistente", () => {
  const first = setKgrApplicability({}, "applicable", { actorId: "a", decidedAt: "2026-09-28T12:00:00.000Z" });
  assert.deepEqual(JSON.parse(String(first.kgr_decisao_historico)), []);
  assert.equal(first.kgr_decisao_versao, 1);
  const legacy = setKgrApplicability({ kgr_aplicabilidade: "pending" }, "applicable", { actorId: "a", decidedAt: "2026-09-28T12:00:00.000Z" });
  assert.deepEqual(JSON.parse(String(legacy.kgr_decisao_historico)), []);
});

test("decisão KGR usa rótulo humano sem alterar métricas", () => {
  const before = { kgr_score: 0.12, volume_search: 50, results_allintitle: 6, intent: "informacional" };
  const after = setKgrApplicability(before, "applicable", { actorId: "user@example.com", decidedAt: "2026-07-22T12:00:00.000Z" });
  assert.equal(after.kgr_decisao, "SIM");
  assert.equal(after.kgr_decisao_origem, "human");
  assert.equal(after.kgr_decisao_versao, 1);
  assert.equal(after.kgr_score, before.kgr_score);
  assert.equal(after.volume_search, before.volume_search);
  assert.equal(after.results_allintitle, before.results_allintitle);
  assert.equal(kgrDecisionLabel("not_applicable"), "NÃO");
});

test("mudança explícita preserva histórico da decisão anterior", () => {
  const first = setKgrApplicability({}, "applicable", { actorId: "a", decidedAt: "2026-07-22T12:00:00.000Z" });
  const second = setKgrApplicability(first, "not_applicable", { actorId: "b", decidedAt: "2026-07-22T13:00:00.000Z", justification: "SERP não é aplicável ao método" });
  assert.equal(second.kgr_decisao_versao, 2);
  assert.deepEqual(JSON.parse(String(second.kgr_decisao_historico)), [{ applicability: "applicable", decision: "SIM", changedAt: "2026-07-22T13:00:00.000Z", actorId: "b" }]);
});

test("medição de métricas é independente da aplicabilidade KGR", () => {
  assert.equal(classifyKgrMeasurement({ kgrScore: null, volume: null, results: null }), "without_data");
  assert.equal(classifyKgrMeasurement({ kgrScore: null, volume: 10, results: null }), "partial");
  assert.equal(classifyKgrMeasurement({ kgrScore: null, volume: null, results: 1 }), "partial");
  assert.equal(classifyKgrMeasurement({ kgrScore: null, volume: 10, results: 1 }), "complete");
  assert.equal(classifyKgrMeasurement({ kgrScore: 0.1, volume: 10, results: 1 }), "complete");
  assert.equal(classifyKgrMeasurement({ kgrScore: -1, volume: 10, results: 1 }), "invalid");
  assert.equal(classifyKgrMeasurement({ kgrScore: null, volume: 0, results: Number.NaN }), "invalid");
  assert.equal(kgrMeasurementLabel("partial"), "Parcial");
  assert.equal(kgrApplicabilityLabel("not_applicable"), "Não aplicável");
  assert.equal(hasUsableKgrScore(0.1), true);
});

test("decisão não aplicável preserva métricas e deixa a pontuação fora da estratégia", () => {
  const source = { volume_search: 10, results_allintitle: 5, kgr_score: 0.5 };
  const decision = setKgrApplicability(source, "not_applicable", { actorId: "user@example.com", decidedAt: "2026-07-22T12:00:00.000Z" });
  assert.equal(decision.volume_search, 10);
  assert.equal(decision.results_allintitle, 5);
  assert.equal(decision.kgr_score, 0.5);
  assert.equal(readKgrApplicability(decision), "not_applicable");
});

test("KGR é calculado somente a partir das métricas persistidas", () => {
  assert.equal(calculateKgrFromMetrics(10, 5), 0.5);
  assert.equal(calculateKgrFromMetrics(10, 0), 0);
  assert.equal(calculateKgrFromMetrics(0, 5), null);
  assert.equal(calculateKgrFromMetrics(null, 5), null);
});

test("ordenação KGR é determinística por grupo e pontuação", () => {
  const applicable = { kgr_score: 0.2, volume_search: 10, results_allintitle: 2, analise_semantica: { kgr_aplicabilidade: "applicable" } };
  // Sem decisão = não aplicável por padrão (2026-09-28): fica no grupo dos não
  // aplicáveis, ordenado pela medição.
  const semDecisao = { kgr_score: null, volume_search: null, results_allintitle: null, analise_semantica: {} };
  const notApplicable = { kgr_score: 0.01, volume_search: 10, results_allintitle: 1, analise_semantica: { kgr_aplicabilidade: "not_applicable" } };
  assert.ok(compareKgrRows(applicable, semDecisao) < 0);
  assert.ok(compareKgrRows(applicable, notApplicable) < 0);
  assert.ok(compareKgrRows(notApplicable, semDecisao) < 0);
});

test("taxonomia de intenção normaliza legados sem reescrever o valor armazenado", () => {
  assert.equal(normalizeIntentKey("Informativo"), "informational");
  assert.equal(normalizeIntentKey("Comercial"), "commercial_investigation");
  assert.equal(normalizeIntentKey("Vendas"), "transactional");
  assert.equal(normalizeIntentKey("navegacional"), "navigational");
  assert.equal(normalizeIntentKey("Mista"), "mixed");
  assert.equal(canonicalIntentLabel("Vendas"), "Transacional");
  assert.equal(canonicalIntentLabel(null), "Pendente");
});
