import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarFlowProgress, deriveRadarReferenceRole, radarSemanticDecisionLabel, resolveRadarTab, selectRadarSemanticPresentation } from "../lib/radar/flow-presentation.ts";

const term = (value: string, overrides: Record<string, unknown> = {}) => ({ term: value, frequency: 1, pageCount: 1, pageIds: ["page-1"], sources: ["body" as const], relation: "observado", decision: "pending" as const, note: "", ...overrides });

test("fluxo do Radar expõe seis etapas em ordem e identifica a etapa atual", () => {
  const progress = buildRadarFlowProgress({ serpCollected: true, referencesSelected: true, pagesAnalyzed: false, reportGenerated: false, reportApproved: false, sentToPlanner: false });
  assert.deepEqual(progress.map(item => item.label), ["SERP coletada", "Referências selecionadas", "Páginas analisadas", "Relatório gerado", "Relatório aprovado", "Enviado ao Planejador"]);
  assert.equal(progress[2].current, true);
  assert.equal(progress[1].done, true);
});

test("resolver de aba normaliza as áreas canônicas, preserva aliases e usa fallback controlado", () => {
  assert.equal(resolveRadarTab("resumo"), "resumo");
  assert.equal(resolveRadarTab("serp"), "serp");
  assert.equal(resolveRadarTab("resultados-serp"), "serp");
  assert.equal(resolveRadarTab("referencias"), "referencias");
  assert.equal(resolveRadarTab("selecionar-referencias"), "referencias");
  assert.equal(resolveRadarTab("analise-serp"), "analise-serp");
  assert.equal(resolveRadarTab("analise-amostra"), "analise-serp");
  assert.equal(resolveRadarTab("analise_amostra"), "analise-serp");
  assert.equal(resolveRadarTab("analysis"), "analise-serp");
  assert.equal(resolveRadarTab("evidencias-adicionais"), "evidencias-adicionais");
  assert.equal(resolveRadarTab(" relatorio "), "relatorio");
  assert.equal(resolveRadarTab("aba-desconhecida"), "resumo");
  assert.equal(resolveRadarTab(null), "resumo");
});

test("semântica central é confirmada, recorrência é revisável e ruído fica recuperável", () => {
  const presentation = selectRadarSemanticPresentation([term("keyword central"), term("contexto recorrente", { frequency: 3 }), term("menu"), term("contexto pontual")], ["keyword central"]);
  assert.deepEqual(presentation.central.map(item => item.term), ["keyword central"]);
  assert.deepEqual(presentation.relevant.map(item => item.term), ["contexto recorrente"]);
  assert.deepEqual(presentation.ignored.map(item => item.term), ["menu", "contexto pontual"]);
  assert.equal(radarSemanticDecisionLabel("pending"), "Aguardando decisão");
  assert.equal(radarSemanticDecisionLabel("support_term"), "Usar como apoio");
});

test("referência tem uma única função e a decisão de apoio não vira concorrente", () => {
  assert.equal(deriveRadarReferenceRole({ decision: "included", reason: "Referência principal selecionada pelo usuário." }), "primary");
  assert.equal(deriveRadarReferenceRole({ decision: "included", reason: "Referência de apoio selecionada pelo usuário." }), "support");
  assert.equal(deriveRadarReferenceRole({ decision: "included", reason: "Referência de formato selecionada pelo usuário.", formatReference: true }), "format");
  assert.equal(deriveRadarReferenceRole({ decision: "included", ownDomain: true }), "own");
  assert.equal(deriveRadarReferenceRole({ decision: "excluded", ownDomain: true }), "excluded");
});

test("página implementa as áreas sequenciais e conserva a extração explícita", () => {
  const page = readFileSync(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
  assert.match(page, /const tabs: RadarTab\[\] = \["resumo", "serp", "referencias", "analise-serp", "evidencias-adicionais", "relatorio", "historico"\]/);
  assert.match(page, /const tab: Tab = resolveRadarTab\(requestedTab\)/);
  assert.match(page, /tab === "resumo" && renderFlowProgress\(\)/);
  assert.doesNotMatch(page, /\n\s*\{renderFlowProgress\(\)\}/);
  assert.match(page, /tab === "serp" && <RadarSerpScreen/);
  assert.match(page, /tab === "referencias" && renderAdvancedSelection\(\)/);
  assert.match(page, /tab === "analise-serp" && renderSample\(\)/);
  assert.match(page, /tab === "evidencias-adicionais" && <RadarExpertBriefPanel/);
  assert.doesNotMatch(page, /tab === "analise-serp" && <ExpertContributionPanel/);
  assert.match(page, /tab === "relatorio" && renderReport\(\)/);
  assert.match(page, /tab === "historico"/);
  assert.match(page, /const setTab = \(next: Tab\) =>/);
  assert.doesNotMatch(page, /const setTab = \(next: Tab\) => \{[^}]*createRadarAnalysisSuccessor/);
  assert.match(page, /Analisar páginas selecionadas/);
  assert.doesNotMatch(page, /Analisar esta página/);
  assert.match(page, /analysisQueue = organicResults/);
  assert.match(page, /não dispara nova coleta/);
});
