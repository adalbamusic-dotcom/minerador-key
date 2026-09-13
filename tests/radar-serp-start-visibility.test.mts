import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarInvestigationView, type RadarInvestigationInput } from "../lib/radar/investigation-state.ts";
import { radarSerpCollectionAction } from "../lib/radar/serp-collection-state.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

/*
 * O START DA SERP SUMIU DA TELA.
 *
 * A barra da investigação morava dentro do painel da SERP, que só existe
 * quando alguém expande o card. Em artigo sem snapshot isso deixava a tela sem
 * ação nenhuma: a coleta existia, atrás de dois cliques que ninguém tinha
 * motivo para dar. Estes testes prendem as duas metades do conserto — a ação
 * derivada do estado real, e o lugar onde ela é renderizada.
 */
const base = (patch: Partial<RadarInvestigationInput> = {}): RadarInvestigationInput => ({
  hasSnapshot: false, curationStarted: false, organicResults: 0, pendingDecisions: 0,
  selectedReferences: 0, pendingExtractions: 0, analyzedPages: 0, comparablePages: 0,
  modelReady: false, modelStale: false, reportReady: false, reportStale: false,
  investigationReviewed: false, investigationApproved: false,
  serpCurationApproved: false, serpCurationCurrent: false, sentToPlanner: false,
  ...patch,
});

const coleta = (patch: Parameters<typeof radarSerpCollectionAction>[0]) => radarSerpCollectionAction(patch);

test("artigo sem snapshot: a investigação não começou e a ação primária é coletar", () => {
  const view = buildRadarInvestigationView(base({ collection: coleta({ hasSnapshot: false, state: "NOT_COLLECTED", contextReady: true }) }));
  assert.equal(view.state, "NOT_STARTED");
  assert.equal(view.headline, "Investigação não iniciada");
  assert.equal(view.completedCount, 0);
  assert.equal(view.stages.length, 6);
  assert.equal(view.stages[0].state, "PENDING");
  assert.ok(view.stages.slice(1).every(etapa => etapa.state === "BLOCKED"));
  assert.equal(view.action.id, "COLLECT");
  assert.equal(view.action.label, "Iniciar coleta da SERP");
  assert.equal(view.action.enabled, true);
  assert.equal(view.action.blockedReason, null);
});

test("artigo com snapshot: a ação primária deixa de ser coletar", () => {
  const view = buildRadarInvestigationView(base({ hasSnapshot: true, organicResults: 7, collection: coleta({ hasSnapshot: true, state: "SUCCESS", contextReady: true }) }));
  assert.notEqual(view.action.id, "COLLECT");
  assert.equal(view.action.id, "START_CURATION");
  assert.equal(view.stages[0].state, "DONE");
});

test("coleta em voo: o botão continua visível e desabilitado, sem convidar a um segundo disparo", () => {
  for (const state of ["VALIDATING", "COLLECTING", "PERSISTING"] as const) {
    const view = buildRadarInvestigationView(base({ collection: coleta({ hasSnapshot: false, state, contextReady: true }) }));
    assert.equal(view.action.id, "COLLECT", state);
    assert.equal(view.action.enabled, false, state);
    assert.notEqual(view.action.label, "Iniciar coleta da SERP");
    assert.equal(view.stages[0].state, "IN_PROGRESS", state);
    assert.ok(view.action.blockedReason, "o motivo precisa estar escrito em " + state);
  }
});

test("bloqueio estrutural mostra bloqueio, nunca retry", () => {
  const motivo = "A keyword principal deste artigo não pertence à marca selecionada.";
  const view = buildRadarInvestigationView(base({ collection: coleta({ hasSnapshot: false, state: "STRUCTURAL_BLOCK", contextReady: true, blockedReason: motivo }) }));
  assert.equal(view.action.id, "COLLECT");
  assert.equal(view.action.enabled, false);
  assert.equal(view.action.label, "Coleta bloqueada");
  assert.equal(view.action.blockedReason, motivo);
  assert.doesNotMatch(view.action.label, /tentar novamente/i);
  assert.equal(view.stages[0].state, "BLOCKED");
  assert.equal(view.nextAction, motivo);
});

test("falha transitória oferece repetir, porque repetir pode resolver", () => {
  const view = buildRadarInvestigationView(base({ collection: coleta({ hasSnapshot: false, state: "TRANSIENT_FAILURE", contextReady: true }) }));
  assert.equal(view.action.id, "COLLECT");
  assert.equal(view.action.enabled, true);
  assert.equal(view.action.label, "Iniciar coleta da SERP");
  assert.equal(view.action.blockedReason, null);
});

test("contexto insuficiente desabilita com motivo: nenhum clique mudo", () => {
  const view = buildRadarInvestigationView(base({ collection: coleta({ hasSnapshot: false, state: "NOT_COLLECTED", contextReady: false }) }));
  assert.equal(view.action.enabled, false);
  assert.ok(view.action.blockedReason);
  assert.equal(view.nextAction, view.action.blockedReason);
});

test("sem informação de coleta a barra continua oferecendo o start, e não fica muda", () => {
  const view = buildRadarInvestigationView(base());
  assert.equal(view.action.id, "COLLECT");
  assert.equal(view.action.label, "Iniciar coleta da SERP");
  assert.equal(view.action.enabled, true);
});

/* ------------------------- onde a barra é montada ------------------------- */

/*
 * A barra global de seis etapas existiu por um lote e foi removida: ela tirou
 * a SERP de dentro da SERP. A ação voltou para o rodapé da aba que a possui.
 */
test("a ação da SERP vive dentro da própria aba, não em uma barra acima dos cards", () => {
  const workbench = read("../modules/radar/radar-r3-workbench.tsx");
  const painel = read("../modules/radar/radar-r3-serp-panel.tsx");

  assert.doesNotMatch(workbench, /InvestigationBar/);
  assert.doesNotMatch(workbench, /radar-investigation-bar/);
  assert.match(painel, /data-testid="radar-serp-tab-action"/);
  assert.match(painel, /radar-serp-collect-action/);
  // O rodapé é o fim da área da aba: renderizado depois do conteúdo dela.
  assert.ok(painel.indexOf("{content[activeTab]}") < painel.indexOf("<TabAction"));
});

test("o clique da ação chama o handler canônico de coleta, e abrir a linha não chama provider", () => {
  const page = read("../modules/radar/radar-page.tsx");
  assert.match(page, /if \(id === "COLLECT"\) return void collect\(target\);/);
  // A coleta só existe dentro de `collect`; nenhum efeito a dispara ao montar.
  assert.doesNotMatch(page, /useEffect\([^)]*collect\(/);
  assert.match(page, /collectingArticleIdRef\.current\) return "FAILED_RETRYABLE";/);
});
