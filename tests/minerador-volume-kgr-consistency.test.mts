import assert from "node:assert/strict";
import test from "node:test";
import {
  assessVolumeKgrConsistency,
  classifyVolumeKgrDiagnostics,
  findVolumeKgrInconsistencies,
  hasExplicitZeroMeasurement,
} from "../lib/minerador/volume-kgr-consistency.ts";

const zeroSemantic = { volume_measurement: { status: "zero_confirmed", rawVolume: 0, match: "exact" } };

test("classifica métricas positivas coerentes", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: 250, results: 14, kgrScore: 0.056 }), "coherent");
});

test("zero explicitamente confirmado não inventa score e preserva o estado confirmado", () => {
  assert.equal(hasExplicitZeroMeasurement(zeroSemantic), true);
  assert.equal(assessVolumeKgrConsistency({ volume: 0, results: 14, kgrScore: null, semantic: zeroSemantic }), "zero_confirmed");
});

test("zero confirmado com score numérico é incompatibilidade comprovada", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: 0, results: 14, kgrScore: 0.056, semantic: zeroSemantic }), "inconsistent");
});

test("zero sem fonte, data e match não é tratado como incompatibilidade", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: 0, results: 14, kgrScore: 0.056 }), "zero_unconfirmed");
});

test("ausência de volume, resultados ou score é medição pendente", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: null, results: 14, kgrScore: null }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: undefined, results: 14, kgrScore: null }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: "", results: 14, kgrScore: null }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: null, kgrScore: 0.2 }), "measurement_pending");
  assert.equal(assessVolumeKgrConsistency({ volume: 100, results: 20, kgrScore: null }), "measurement_pending");
});

test("não aplicável é uma dimensão estratégica independente das métricas", () => {
  assert.equal(assessVolumeKgrConsistency({ volume: null, results: null, kgrScore: null, kgrApplicability: "not_applicable" }), "not_applicable");
  assert.equal(assessVolumeKgrConsistency({ volume: 10, results: null, kgrScore: null, kgrApplicability: "not_applicable" }), "not_applicable");
  assert.equal(assessVolumeKgrConsistency({ volume: 10, results: 2, kgrScore: 0.2, kgrApplicability: "not_applicable" }), "not_applicable");
});

test("a busca de incompatibilidades inclui somente incompatibilidade comprovada", () => {
  const rows = [
    { id: "coherent", volume_search: 250, results_allintitle: 14, kgr_score: 0.056 },
    { id: "inconsistent", volume_search: 100, results_allintitle: 20, kgr_score: 0.9 },
    { id: "missing", volume_search: null, results_allintitle: null, kgr_score: null },
    { id: "zero", volume_search: 0, results_allintitle: 14, kgr_score: 0.056 },
  ];
  assert.deepEqual(findVolumeKgrInconsistencies(rows).map(row => row.id), ["inconsistent"]);
});

test("a prévia retorna categorias e contagens derivadas dos registros", () => {
  const diagnostics = classifyVolumeKgrDiagnostics([
    { id: "pending-1", volume_search: null, results_allintitle: null, kgr_score: null },
    { id: "pending-2", volume_search: 100, results_allintitle: null, kgr_score: null },
    { id: "zero", volume_search: 0, results_allintitle: 14, kgr_score: 0.056 },
    { id: "na", volume_search: 10, results_allintitle: null, kgr_score: null, analise_semantica: { kgr_aplicabilidade: "not_applicable" } },
    { id: "bad", volume_search: 100, results_allintitle: 20, kgr_score: 0.9 },
    { id: "coherent", volume_search: 100, results_allintitle: 20, kgr_score: 0.2 },
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
