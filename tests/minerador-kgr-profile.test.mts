import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateKgrFromMetrics, kgrApplicabilityLabel, kgrDecisionLabel, readKgrApplicability, setKgrApplicability } from "../lib/minerador/kgr-applicability.ts";

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const keywordPanel = panel.slice(panel.indexOf("export function KeywordDnaPanel"), panel.indexOf("export function KeywordDnaProvenance"));
const humanReviewPanel = panel.slice(panel.indexOf("function HumanReviewPanel"), panel.indexOf("function TechnicalDetails"));
const technicalDetails = panel.slice(panel.indexOf("function TechnicalDetails"), panel.indexOf("export function KeywordDnaPanel"));

test("R4 calcula somente com volume positivo e allintitle não negativo", () => {
  assert.equal(calculateKgrFromMetrics(90, 336), 3.7333);
  assert.equal(calculateKgrFromMetrics(90, 0), 0);
  assert.equal(calculateKgrFromMetrics(null, 336), null);
  assert.equal(calculateKgrFromMetrics(0, 336), null);
  assert.equal(calculateKgrFromMetrics(90, null), null);
});

test("R4 mantém aplicabilidade e decisão humanas separadas do cálculo", () => {
  const before = { volume_search: 90, results_allintitle: 336, kgr_score: 3.7333 };
  const after = setKgrApplicability(before, "not_applicable", { actorId: "human-1", decidedAt: "2026-08-18T12:00:00.000Z" });
  assert.equal(after.volume_search, before.volume_search);
  assert.equal(after.results_allintitle, before.results_allintitle);
  assert.equal(after.kgr_score, before.kgr_score);
  assert.equal(readKgrApplicability(after), "not_applicable");
  assert.equal(kgrApplicabilityLabel("pending"), "Pendente");
  assert.equal(kgrApplicabilityLabel("applicable"), "Aplicável");
  assert.equal(kgrApplicabilityLabel("not_applicable"), "Não aplicável");
  assert.equal(kgrDecisionLabel("not_applicable"), "NÃO");
});

test("R7 mantém inputs, resultado e motivo do KGR dentro da Revisão Humana", () => {
  for (const label of ["Volume usado", "Resultado usado", "Estado do cálculo", "Aplicabilidade", "Decisão"]) {
    assert.match(keywordPanel, new RegExp(label));
  }
  for (const state of ["Aguardando volume", "Aguardando Resultado", "Volume zero", "Medição insuficiente", "Medição inconsistente", "Calculável"]) {
    assert.match(panel, new RegExp(state));
  }
  assert.match(panel, /calculateKgrFromMetrics\(volume, allintitle\)/);
  assert.match(keywordPanel, /const kgrCalculatedValue = calculateKgrFromMetrics/);
  assert.match(keywordPanel, /value: kgrScore/);
  assert.match(humanReviewPanel, /kgrDetails/);
  assert.match(humanReviewPanel, /KGR · detalhes técnicos/);
  assert.doesNotMatch(keywordPanel, /<ProfileBento number="4" title="KGR"/);
  assert.doesNotMatch(keywordPanel, /Excelente|Bom|Ruim|Fácil|Difícil|KD|dificuldade SEO/i);
});

test("R7 não materializa card principal de KGR e preserva histórico na proveniência", () => {
  assert.doesNotMatch(keywordPanel, /const hasKgrInputs/);
  assert.doesNotMatch(keywordPanel, /<ProfileBento number="4" title="KGR"/);
  assert.match(technicalDetails, /Histórico KGR/);
  assert.match(technicalDetails, /kgrHistory/);
});

test("R4 não reabre providers, IA, schema ou a lógica do DNA no painel", () => {
  assert.doesNotMatch(humanReviewPanel, /fetch\(|supabase/);
  assert.match(keywordPanel, /kgrApplicabilityValue/);
  assert.match(keywordPanel, /kgrCalculationState/);
});

test("R6 mantém KGR automático e sem ação humana na bulk bar", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const automaticKgrScore = calculateKgrFromMetrics/);
  assert.match(workspace, /kgrTechnicalTone\(score, vol\)/);
  assert.doesNotMatch(workspace, /aria-label="Decisão KGR"/);
  assert.doesNotMatch(workspace, /handleBatchKgrDecision/);
});
