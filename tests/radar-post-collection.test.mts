import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarSerpCurationSummary } from "../lib/radar/serp-curation.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";

/** Snapshot real do smoke: 7 orgânicos, dataforseo, v1 — sem curadoria ainda. */
const view = (): RadarSerpView => ({
  record: { id: "serp:mascara:v1" },
  version: 1,
  provider: "dataforseo",
  hash: "sha256:" + "a".repeat(64),
  capturedAt: "2026-09-06T04:41:19.328Z",
  source: "merged",
  partial: false,
  organicResults: Array.from({ length: 7 }, (_, index) => ({
    position: index + 1, title: `Resultado ${index + 1}`, url: `https://exemplo-${index + 1}.com/p`,
    domain: `exemplo-${index + 1}.com`, snippet: "trecho", inferredType: "other", isOwnDomain: false,
  })),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], possibleConflicts: [], limitations: [], questions: [], opportunities: [], recurringTitlePatterns: [] },
} as unknown as RadarSerpView);

const scope = { brandId: "b1", articleId: "a1", articleDnaVersionId: "v1" };

/* --------- G · contadores refletem o estado real ------------------------- */

test("sem curadoria iniciada, o contador não anuncia zero pendências sobre sete resultados", () => {
  const summary = buildRadarSerpCurationSummary({ view: view(), analysis: null, scope });
  assert.equal(summary.curationStarted, false);
  assert.equal(summary.observedResults, 7);
  assert.equal(summary.awaitingCuration, 7, "sete resultados aguardam a curadoria começar");
  assert.equal(summary.selectedCompetitors, 0);
  assert.equal(summary.approvedReferences, 0);
});

test("o painel troca o rótulo em vez de exibir zero enganoso", () => {
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /summary\.curationStarted \? "Decisões pendentes" : "Aguardando curadoria"/);
  assert.match(painel, /summary\.curationStarted \? summary\.pendingDecisions : summary\.awaitingCuration/);
});

/* --------- A, B, C · iniciar curadoria ----------------------------------- */

test("iniciar curadoria não chama provider nem cria SERP nova", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const corpo = workbench.slice(workbench.indexOf("const startSerpAnalysis = async"), workbench.indexOf("const persistSerpDecision"));
  assert.equal(/collectSerp|dataforseo/i.test(corpo), false, "a curadoria não fala com o provider");
  assert.match(corpo, /createRadarAnalysisVersion\(\{/, "usa o snapshot existente");
  assert.equal(/createRadarAnalysisSuccessor/.test(corpo), false, "abrir a curadoria não cria sucessora consolidada");
});

test("clique recusado explica o motivo em vez de retornar em silêncio", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const corpo = workbench.slice(workbench.indexOf("const startSerpAnalysis = async"), workbench.indexOf("const persistSerpDecision"));
  for (const motivo of [
    /Selecione um artigo antes de iniciar a curadoria/,
    /Outra ação da SERP ainda está em andamento/,
    /A coleta da SERP ainda está em andamento/,
    /A revisão da SERP está em andamento/,
  ]) assert.match(corpo, motivo);
  // Nenhum `return` mudo sobra nos guards de entrada.
  assert.equal(/if \(!target \|\| !data \|\| serpActionRef\.current[^)]*\) return;/.test(corpo), false);
});

/* --------- E, F · seleção controla ação, não renderização ---------------- */

test("resultados não selecionados continuam visíveis e a seleção controla só a ação", () => {
  const summary = buildRadarSerpCurationSummary({ view: view(), analysis: null, scope });
  assert.equal(summary.observedResults, 7, "os sete resultados continuam observáveis sem curadoria");
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /Apenas as páginas marcadas como concorrente ou apoio alimentam a análise/);
});

/* --------- N · o loader não inventa persistência ------------------------- */

test("workspace que não carregou não é anunciado como marca vazia", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(workbench, /pipeline\.persistenceMode === "server" \? "Nenhum artigo importado/);
  assert.match(workbench, /recuperação local desta sessão/);
});

test("o merge remoto/local preserva os dois lados sem inventar item", () => {
  const merge = readFileSync("lib/radar/workspace-merge.ts", "utf8");
  assert.match(merge, /remoteItems\.map\(remote =>/);
  assert.match(merge, /localItems\.filter\(item => !seen\.has\(item\.id\)/);
  const hydration = readFileSync("lib/radar/hydration.ts", "utf8");
  const corpo = hydration.slice(hydration.indexOf("export function reconcileRadarItems"));
  assert.match(corpo, /if \(item\.brandId !== brandId/, "marca divergente nunca é reidratada");
  assert.equal(/\.filter\(/.test(corpo.slice(0, corpo.indexOf("}"))), false, "a reconciliação não descarta item");
});
