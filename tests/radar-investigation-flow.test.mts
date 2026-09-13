import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarInvestigationView, radarSerpCurationBadge, type RadarInvestigationInput, type RadarInvestigationStage } from "../lib/radar/investigation-state.ts";

/*
 * A tela dizia "SERP concluída" e "Revisão aprovada" ao lado de "Análise
 * reaberta" e "Relatório aguardando geração". Cada frase estava certa sozinha;
 * a soma delas era falsa. Estes testes fixam a soma.
 */
const base = (patch: Partial<RadarInvestigationInput> = {}): RadarInvestigationInput => ({
  hasSnapshot: false,
  curationStarted: false,
  organicResults: 0,
  pendingDecisions: 0,
  selectedReferences: 0,
  pendingExtractions: 0,
  analyzedPages: 0,
  comparablePages: 0,
  modelReady: false,
  modelStale: false,
  reportReady: false,
  reportStale: false,
  investigationReviewed: false,
  investigationApproved: false,
  serpCurationApproved: false,
  serpCurationCurrent: false,
  sentToPlanner: false,
  ...patch,
});

const etapa = (view: ReturnType<typeof buildRadarInvestigationView>, stage: RadarInvestigationStage) =>
  view.stages.find(item => item.stage === stage)!;

test("coleta concluída não é investigação concluída", () => {
  const view = buildRadarInvestigationView(base({ hasSnapshot: true, organicResults: 7 }));
  assert.equal(view.state, "IN_PROGRESS");
  assert.equal(view.headline, "Investigação competitiva em andamento");
  assert.ok(!/SERP conclu/i.test(view.headline));
  assert.equal(etapa(view, "SERP_COLLECTION").state, "DONE");
  assert.equal(etapa(view, "COMPETITIVE_ANALYSIS").state, "BLOCKED");
  assert.equal(view.action.id, "START_CURATION");
  assert.notEqual(view.completedCount, view.stages.length);
});

test("curadoria mudou depois da aprovação: a investigação reabre e o selo antigo aparece como antigo", () => {
  const input = base({
    hasSnapshot: true, organicResults: 7, curationStarted: true, selectedReferences: 5,
    analyzedPages: 5, comparablePages: 4, pendingExtractions: 2,
    serpCurationApproved: true, serpCurationCurrent: false,
  });
  const view = buildRadarInvestigationView(input);
  assert.equal(view.state, "REOPENED");
  assert.equal(view.headline, "Investigação reaberta");
  assert.equal(etapa(view, "COMPETITIVE_ANALYSIS").state, "REOPENED");
  assert.equal(view.action.id, "ANALYZE_PENDING");
  assert.equal(view.curationBadge, "Curadoria SERP aprovada em versão anterior");
  assert.equal(radarSerpCurationBadge(input), view.curationBadge);
});

test("relatório gerado e revisão pendente ficam em aguardando revisão final, não em concluído", () => {
  const view = buildRadarInvestigationView(base({
    hasSnapshot: true, organicResults: 7, curationStarted: true, selectedReferences: 5,
    analyzedPages: 5, comparablePages: 4, modelReady: true, reportReady: true,
    serpCurationApproved: true, serpCurationCurrent: true,
  }));
  assert.equal(view.state, "AWAITING_FINAL_REVIEW");
  assert.equal(view.headline, "Aguardando revisão final");
  assert.equal(etapa(view, "COMPETITIVE_REPORT").state, "DONE");
  assert.equal(etapa(view, "FINAL_REVIEW").state, "PENDING");
  assert.equal(view.action.id, "REVIEW_INVESTIGATION");
});

test("a aprovação humana é o único caminho para concluído", () => {
  const pronto = base({
    hasSnapshot: true, organicResults: 7, curationStarted: true, selectedReferences: 5,
    analyzedPages: 5, comparablePages: 4, modelReady: true, reportReady: true,
    investigationReviewed: true, serpCurationApproved: true, serpCurationCurrent: true,
  });
  assert.equal(buildRadarInvestigationView(pronto).state, "AWAITING_FINAL_REVIEW");
  assert.equal(buildRadarInvestigationView(pronto).action.id, "APPROVE_INVESTIGATION");

  const aprovado = buildRadarInvestigationView({ ...pronto, investigationApproved: true });
  assert.equal(aprovado.state, "COMPLETED");
  assert.equal(aprovado.headline, "Investigação competitiva aprovada");
  assert.equal(aprovado.completedCount, aprovado.stages.length);
  assert.equal(aprovado.action.id, "PREPARE_PLANNER");
  assert.equal(buildRadarInvestigationView({ ...pronto, investigationApproved: true, sentToPlanner: true }).action.id, "NONE");
});

test("aprovar antes do relatório não existe como caminho: a etapa final permanece bloqueada", () => {
  const view = buildRadarInvestigationView(base({
    hasSnapshot: true, organicResults: 7, curationStarted: true, selectedReferences: 5,
    analyzedPages: 5, comparablePages: 4, modelReady: true,
    serpCurationApproved: true, serpCurationCurrent: true,
  }));
  assert.equal(etapa(view, "FINAL_REVIEW").state, "BLOCKED");
  assert.equal(view.action.id, "GENERATE_REPORT");
  assert.equal(view.action.label, "Gerar relatório competitivo");
});

/*
 * A JORNADA INTEIRA, EM UMA TABELA.
 *
 * Cada linha é um estado que a pessoa realmente atravessa. O que o teste fixa
 * não é o cálculo: é a promessa de que, em cada ponto, existe UMA ação com
 * nome próprio — e que ela muda quando o estado muda.
 */
test("a jornada completa entrega uma ação primária determinística por etapa", () => {
  const jornada: Array<{ nome: string; input: RadarInvestigationInput; action: string; label: string; state: string }> = [];
  let acumulado = base();

  const avanca = (nome: string, patch: Partial<RadarInvestigationInput>, action: string, label: string, state: string) => {
    acumulado = { ...acumulado, ...patch };
    jornada.push({ nome, input: acumulado, action, label, state });
  };

  avanca("START", {}, "COLLECT", "Iniciar coleta da SERP", "NOT_STARTED");
  avanca("COLLECTED", { hasSnapshot: true, organicResults: 7 }, "START_CURATION", "Iniciar curadoria", "IN_PROGRESS");
  avanca("CURATING", { curationStarted: true, pendingDecisions: 7 }, "DECIDE_RESULTS", "Decidir 7 resultado(s) pendente(s)", "IN_PROGRESS");
  avanca("CURATED", { pendingDecisions: 0, selectedReferences: 5, pendingExtractions: 5 }, "START_ANALYSIS", "Analisar páginas selecionadas (5)", "IN_PROGRESS");
  avanca("ANALYZED", { pendingExtractions: 0, analyzedPages: 5, comparablePages: 4 }, "CONSOLIDATE_MODEL", "Consolidar modelo competitivo", "IN_PROGRESS");
  avanca("MODEL_READY", { modelReady: true }, "GENERATE_REPORT", "Gerar relatório competitivo", "IN_PROGRESS");
  avanca("REPORT_READY", { reportReady: true }, "REVIEW_INVESTIGATION", "Revisar investigação", "AWAITING_FINAL_REVIEW");
  avanca("REVIEWED", { investigationReviewed: true }, "APPROVE_INVESTIGATION", "Aprovar investigação", "AWAITING_FINAL_REVIEW");
  avanca("APPROVED", { investigationApproved: true }, "PREPARE_PLANNER", "Preparar para o Planejador", "COMPLETED");

  for (const passo of jornada) {
    const view = buildRadarInvestigationView(passo.input);
    assert.equal(view.action.id, passo.action, "ação em " + passo.nome);
    assert.equal(view.action.label, passo.label, "rótulo em " + passo.nome);
    assert.equal(view.state, passo.state, "estado em " + passo.nome);
    assert.equal(view.nextAction, view.action.blockedReason || view.action.label, "próxima ação em " + passo.nome);
  }

  const acoes = jornada.map(passo => buildRadarInvestigationView(passo.input).action.id);
  assert.equal(new Set(acoes).size, acoes.length, "cada etapa da jornada tem uma ação distinta");
  assert.equal(jornada.filter(passo => buildRadarInvestigationView(passo.input).state === "COMPLETED").length, 1);
});

test("referência selecionada ausente bloqueia a ação e explica o motivo em vez de sumir", () => {
  const view = buildRadarInvestigationView(base({ hasSnapshot: true, organicResults: 7, curationStarted: true, selectedReferences: 0 }));
  assert.equal(view.action.id, "DECIDE_RESULTS");
  assert.equal(view.action.enabled, false);
  assert.equal(view.nextAction, view.action.blockedReason);
  assert.match(String(view.action.blockedReason), /Nenhuma referência foi marcada/);
});

test("o selo da curadoria fala da amostra, nunca da investigação", () => {
  assert.equal(radarSerpCurationBadge({ serpCurationApproved: false, serpCurationCurrent: false }), "Curadoria SERP não aprovada");
  assert.equal(radarSerpCurationBadge({ serpCurationApproved: true, serpCurationCurrent: true }), "Curadoria SERP aprovada");
  const view = buildRadarInvestigationView(base({ hasSnapshot: true, curationStarted: true, selectedReferences: 3, serpCurationApproved: true, serpCurationCurrent: true }));
  assert.equal(view.curationBadge, "Curadoria SERP aprovada");
  assert.notEqual(view.state, "COMPLETED");
});
