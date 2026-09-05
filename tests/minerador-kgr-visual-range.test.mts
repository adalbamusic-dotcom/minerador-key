import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateKgrFromMetrics,
  deriveKgrVisualState,
  KGR_FULL_RANGE_LIMIT,
  kgrTechnicalTone,
  readKgrApplicability,
} from "../lib/minerador/kgr-applicability.ts";

/**
 * Classificação visual do score KGR: 0 <= kgr < 0,25 é a faixa plenamente KGR.
 * A cor é apenas luz para a decisão humana e não altera fórmula, aplicabilidade
 * ou status editorial.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

const green = (score: unknown) => kgrTechnicalTone(score, 720) === "success";

test("A–D · scores dentro da faixa plenamente KGR ficam verdes", () => {
  for (const score of [0, 0.011, 0.168, 0.21, 0.249]) {
    assert.equal(deriveKgrVisualState(score).range, "full_kgr", `${score} pertence à faixa`);
    assert.equal(deriveKgrVisualState(score).favorable, true);
    assert.equal(green(score), true, `${score} deve ficar verde`);
  }
});

test("E–G · scores fora da faixa não ficam verdes", () => {
  for (const score of [0.25, 0.441, 0.654, 1.284]) {
    assert.equal(deriveKgrVisualState(score).range, "other", `${score} está fora da faixa`);
    assert.equal(deriveKgrVisualState(score).favorable, false);
    assert.equal(green(score), false, `${score} não pode ficar verde`);
  }
});

test("limite 0,25 é estrito e comparado sobre o número real", () => {
  assert.equal(KGR_FULL_RANGE_LIMIT, 0.25);
  assert.equal(deriveKgrVisualState(0.2499999).favorable, true);
  assert.equal(deriveKgrVisualState(0.25).favorable, false);
  // O arredondamento de exibição não decide a cor: 0,2496 mostra "0,250" e continua favorável.
  assert.equal(Number(0.2496).toFixed(3), "0.250");
  assert.equal(deriveKgrVisualState(0.2496).favorable, true);
});

test("H · sem KGR calculável não existe verde nem KGR inventado", () => {
  for (const value of [null, undefined, "", "abc", NaN, -0.1]) {
    assert.equal(deriveKgrVisualState(value).range, "unavailable");
    assert.equal(deriveKgrVisualState(value).favorable, false);
    assert.equal(kgrTechnicalTone(value, 720), "neutral");
  }
  // A ausência de Volume/Resultado válidos continua sem score, não vira zero.
  assert.equal(calculateKgrFromMetrics(null, 12), null);
  assert.equal(calculateKgrFromMetrics(0, 12), null);
  assert.equal(calculateKgrFromMetrics(720, null), null);
});

test("a cor deriva só do score: volume alto não tira o verde", () => {
  assert.equal(kgrTechnicalTone(0.168, 720), "success");
  assert.equal(kgrTechnicalTone(0.168, 33100), "success");
  assert.equal(kgrTechnicalTone(0.168, undefined), "success");
  // Faixas não favoráveis mantêm a distinção técnica existente.
  assert.equal(kgrTechnicalTone(0.441, 720), "warning");
  assert.equal(kgrTechnicalTone(1.284, 720), "danger");
});

test("I · score favorável não decide a aplicabilidade humana do KGR", () => {
  const semantic = { kgr_aplicabilidade: "pending" };
  assert.equal(deriveKgrVisualState(0.168).favorable, true);
  assert.equal(readKgrApplicability(semantic), "pending");
  assert.equal(readKgrApplicability({}), "pending");
});

test("J · score favorável não altera status editorial nem aprovação", () => {
  const kgrHelper = readFileSync(new URL("../lib/minerador/kgr-applicability.ts", import.meta.url), "utf8");
  const visualBlock = kgrHelper.slice(kgrHelper.indexOf("export function deriveKgrVisualState"), kgrHelper.indexOf("export function classifyKgrMeasurement"));
  for (const forbidden of ["status", "approved", "aprovado", "humanReview", "applicability"]) {
    assert.ok(!visualBlock.includes(forbidden), `a cor do KGR não pode consultar ${forbidden}`);
  }
});

test("a regra visual é única e compartilhada pelos consumidores", () => {
  assert.match(panel, /kgrTechnicalTone\(/);
  assert.match(workspace, /kgrTechnicalTone\(score, vol\)/);
  // Nenhum componente reimplementa o limite por conta própria.
  assert.ok(!panel.includes("< 0.25"), "o painel não pode repetir o limite");
  assert.ok(!workspace.includes("< 0.25"), "a planilha não pode repetir o limite");
});

test("a fórmula do KGR permanece inalterada", () => {
  assert.equal(calculateKgrFromMetrics(720, 388), 0.5389);
  assert.equal(calculateKgrFromMetrics(90, 336), 3.7333);
  assert.equal(calculateKgrFromMetrics(1900, 320), 0.1684);
});
