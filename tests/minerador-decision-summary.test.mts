import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildKeywordDecisionSummary } from "../lib/minerador/keyword-decision-summary.ts";

test("o resumo para decisão reúne somente sinais disponíveis e preserva zero real", () => {
  const summary = buildKeywordDecisionSummary({
    volume: 60500,
    cpc: "R$ 20,57",
    allintitle: 373,
    kgr: 0.006,
    keywordDifficulty: 42,
    intent: "Comercial",
    aiExecuted: true,
    aiVerdict: "Concorda parcialmente",
    dnaMaturity: "CONFIRMADA",
    kgrApplicability: "Não aplicável",
  });

  assert.deepEqual(summary.metrics, [
    { key: "volume", label: "Volume", value: "60.500" },
    { key: "cpc", label: "CPC", value: "R$ 20,57" },
    { key: "allintitle", label: "Resultado", value: "373" },
    { key: "kgr", label: "KGR", value: "0,006" },
    { key: "keywordDifficulty", label: "KD", value: "42" },
    { key: "intent", label: "Intenção", value: "Comercial" },
  ]);
  assert.deepEqual(summary.states, [
    { key: "ai", label: "IA", value: "Concorda parcialmente" },
    { key: "dna", label: "DNA", value: "Confirmada" },
    { key: "kgrApplicability", label: "KGR", value: "Não aplicável" },
  ]);
});

test("campos ausentes são omitidos, sem inventar KD ou valores de fallback", () => {
  const summary = buildKeywordDecisionSummary({
    volume: null,
    cpc: null,
    allintitle: 0,
    kgr: 0,
    keywordDifficulty: null,
    intent: null,
    aiExecuted: false,
    dnaMaturity: "PARCIAL",
    kgrApplicability: "Pendente",
  });

  assert.deepEqual(summary.metrics, [
    { key: "allintitle", label: "Resultado", value: "0" },
    { key: "kgr", label: "KGR", value: "0,00" },
  ]);
  assert.equal(summary.metrics.some(metric => metric.key === "keywordDifficulty"), false);
  // A IA é opcional: sem execução o resumo diz "Opcional", nunca "Pendente".
  assert.equal(summary.states[0]?.value, "Opcional");
});

test("R6.2 organiza o cockpit em demanda, competição SEO, semântica e revisão", () => {
  const summary = buildKeywordDecisionSummary({
    volume: 33100,
    cpc: "R$ 0,34",
    allintitle: 359,
    kgr: 0.0108,
    keywordDifficulty: 0,
    intent: "Comercial investigativa",
    trend: "Crescente",
    adsCompetition: "Alta",
    competitionIndex: 97,
    externalIntent: "Transacional",
    referringDomains: 0.5,
    backlinks: 1.4,
    niche: "Estética",
    funnel: "BOFU",
    aiExecuted: true,
    aiVerdict: "Concorda parcialmente",
    dnaMaturity: "COMPLETA PARA REVISÃO",
    kgrApplicability: "Aplicável",
    divergenceCount: 0,
    includeSections: true,
  });

  assert.deepEqual(summary.groups?.map(group => group.key), ["demand", "seoCompetition", "semantic"]);
  assert.deepEqual(summary.groups?.find(group => group.key === "demand")?.metrics.map(metric => [metric.label, metric.value]), [
    ["Volume", "33.100"], ["CPC", "R$ 0,34"], ["Tendência", "Crescente"], ["Concorrência Ads", "Alta"], ["Índice Ads", "97"],
  ]);
  assert.deepEqual(summary.groups?.find(group => group.key === "seoCompetition")?.metrics.map(metric => [metric.label, metric.value]), [
    ["Resultado", "359"], ["KD", "0"], ["KGR", "0,011"], ["Ref. Domains", "0,5"], ["Backlinks", "1,4"],
  ]);
  assert.deepEqual(summary.states.find(state => state.key === "divergences"), { key: "divergences", label: "Divergências", value: "0" });
});

test("KeywordDNA usa o resumo como read-model e mantém o status final humano", async () => {
  const panel = await readFile(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const keywordPanel = panel.slice(panel.indexOf("export function KeywordDnaPanel"));
  const decision = keywordPanel.slice(keywordPanel.indexOf("data-keyword-human-decision"));

  for (const label of ["RESUMO PARA DECISÃO", "Volume", "CPC", "Resultado", "KGR", "Intenção", "IA", "DNA"]) {
    assert.match(panel, new RegExp(label));
  }
  const summarySource = await readFile(new URL("../lib/minerador/keyword-decision-summary.ts", import.meta.url), "utf8");
  assert.match(summarySource, /label: "KGR"/);
  assert.doesNotMatch(summarySource, /label: "KGR aplicável"/);
  assert.match(keywordPanel, /buildKeywordDecisionSummary/);
  assert.match(keywordPanel, /readGoogleAdsCpcEvidence/);
  assert.match(keywordPanel, /formatGoogleAdsCpcTableValue/);
  assert.match(decision, /onWorkflowStatusChange/);
  assert.doesNotMatch(decision, /onChange=.*volume|onChange=.*cpc|onChange=.*allintitle|onChange=.*kgr/);
  assert.match(panel, /rounded border px-1\.5 py-0\.5 text-\[11px\] font-medium leading-none/);
  assert.doesNotMatch(panel.slice(panel.indexOf("function ProfilePill"), panel.indexOf("type ProfileFieldDefinition")), /rounded-full/);
  assert.doesNotMatch(decision, /rounded-full/);
});
