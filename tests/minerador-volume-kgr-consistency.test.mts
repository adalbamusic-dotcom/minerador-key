import assert from "node:assert/strict";
import test from "node:test";
import {
  assessVolumeKgrConsistency,
  classifyVolumeKgrDiagnostics,
  findVolumeKgrInconsistencies,
  hasExplicitZeroMeasurement,
} from "../lib/minerador/volume-kgr-consistency.ts";

// Desde 2026-09-28 o diagnóstico segue o leitor único: sem decisão humana o KGR
// é "não aplicável" e a coerência só é avaliada com "Aplicável".
const APLICAVEL = { kgr_aplicabilidade: "applicable", kgr_decisao_origem: "human" };
const zeroSemantic = { ...APLICAVEL, volume_measurement: { status: "zero_confirmed", rawVolume: 0, match: "exact" } };

test("classifica métricas positivas coerentes", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: 250, results: 14, kgrScore: 0.056, kgrApplicability: "applicable" }), "coherent");
});

test("zero explicitamente confirmado não inventa score e preserva o estado confirmado", () => {
  assert.equal(hasExplicitZeroMeasurement(zeroSemantic), true);
  assert.equal(assessVolumeKgrConsistency({ volume: 0, results: 14, kgrScore: null, semantic: zeroSemantic }), "zero_confirmed");
});

test("zero confirmado com score numérico é incompatibilidade comprovada", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: 0, results: 14, kgrScore: 0.056, semantic: zeroSemantic }), "inconsistent");
});

test("zero sem fonte, data e match não é tratado como incompatibilidade", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: 0, results: 14, kgrScore: 0.056, kgrApplicability: "applicable" }), "zero_unconfirmed");
});

test("ausência de volume, resultados ou score é medição pendente", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: null, results: 14, kgrScore: null, kgrApplicability: "applicable" }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: undefined, results: 14, kgrScore: null, kgrApplicability: "applicable" }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: "", results: 14, kgrScore: null, kgrApplicability: "applicable" }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: null, kgrScore: 0.2, kgrApplicability: "applicable" }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: 20, kgrScore: null, kgrApplicability: "applicable" }), "measurement_pending");
});

test("sem decisão humana e com pending legado o diagnóstico segue o padrão não aplicável (2026-09-28)", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: 20, kgrScore: 0.9 }), "not_applicable");
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: 20, kgrScore: 0.9, semantic: { kgr_aplicabilidade: "pending" } }), "not_applicable");
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: 20, kgrScore: 0.9, semantic: { kgr_aplicabilidade: "applicable", kgr_decisao_origem: "ai" } }), "not_applicable");
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: 20, kgrScore: 0.9, semantic: APLICAVEL }), "inconsistent");
});

test("não aplicável é uma dimensão estratégica independente das métricas", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: null, results: null, kgrScore: null, kgrApplicability: "not_applicable" }), "not_applicable");
  assert.equal(assessVolumeKgrConsistency({ volume: 10, results: null, kgrScore: null, kgrApplicability: "not_applicable" }), "not_applicable");
  assert.equal(assessVolumeKgrConsistency({ volume: 10, results: 2, kgrScore: 0.2, kgrApplicability: "not_applicable" }), "not_applicable");
});

test("a busca de incompatibilidades inclui somente incompatibilidade comprovada", () => {
  const rows = [
    { id: "coherent", volume_search: 250, results_allintitle: 14, kgr_score: 0.056, analise_semantica: APLICAVEL },
    { id: "inconsistent", volume_search: 100, results_allintitle: 20, kgr_score: 0.9, analise_semantica: APLICAVEL },
    { id: "padrao", volume_search: 100, results_allintitle: 20, kgr_score: 0.9 },
    { id: "missing", volume_search: null, results_allintitle: null, kgr_score: null, analise_semantica: APLICAVEL },
    { id: "zero", volume_search: 0, results_allintitle: 14, kgr_score: 0.056, analise_semantica: APLICAVEL },
  ];
  assert.deepEqual(findVolumeKgrInconsistencies(rows).map(row => row.id), ["inconsistent"]);
});

test("a prévia retorna categorias e contagens derivadas dos registros", () => {
  const diagnostics = classifyVolumeKgrDiagnostics([
    { id: "pending-1", volume_search: null, results_allintitle: null, kgr_score: null, analise_semantica: APLICAVEL },
    { id: "pending-2", volume_search: 100, results_allintitle: null, kgr_score: null, analise_semantica: APLICAVEL },
    { id: "zero", volume_search: 0, results_allintitle: 14, kgr_score: 0.056, analise_semantica: APLICAVEL },
    { id: "na", volume_search: 10, results_allintitle: null, kgr_score: null, analise_semantica: { kgr_aplicabilidade: "not_applicable" } },
    { id: "bad", volume_search: 100, results_allintitle: 20, kgr_score: 0.9, analise_semantica: APLICAVEL },
    { id: "coherent", volume_search: 100, results_allintitle: 20, kgr_score: 0.2, analise_semantica: APLICAVEL },
  ]);
  assert.deepEqual(diagnostics.counts, {
    measurement_pending: 2,
    zero_unconfirmed: 1,
    not_applicable: 1,
    inconsistent: 1,
  });
  assert.equal(diagnostics.total, 5);
  assert.deepEqual(diagnostics.items.map(entry => [entry.item.id, entry.status]), [
    ["pending-1", "measurement_pending"],
    ["pending-2", "measurement_pending"],
    ["zero", "zero_unconfirmed"],
    ["na", "not_applicable"],
    ["bad", "inconsistent"],
  ]);
});
