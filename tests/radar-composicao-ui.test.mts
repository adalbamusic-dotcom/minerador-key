import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarInvestigationView, radarSerpTabAction, radarWorkbenchPrimaryAction, type RadarInvestigationInput } from "../lib/radar/investigation-state.ts";
import { radarSerpCollectionAction } from "../lib/radar/serp-collection-state.ts";

/*
 * REGRESSÃO DE COMPOSIÇÃO.
 *
 * Um lote anterior tentou resolver "não existe botão de start" redesenhando a
 * tela: a jornada virou uma barra global acima dos cards e o diagnóstico de
 * contrato virou um painel que ocupava metade da área de trabalho. O problema
 * era de posição de botão, não de arquitetura de produto.
 *
 * Estes testes fixam a composição: a SERP é autocontida, cada aba tem a sua
 * ação no rodapé, e diagnóstico técnico mora em detalhes recolhidos.
 */
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const painel = () => ler("../modules/radar/radar-r3-serp-panel.tsx");
const workbench = () => ler("../modules/radar/radar-r3-workbench.tsx");
const dossie = () => ler("../modules/radar/radar-r3-content-dossier.tsx");

const base = (patch: Partial<RadarInvestigationInput> = {}): RadarInvestigationInput => ({
  hasSnapshot: false, curationStarted: false, organicResults: 0, pendingDecisions: 0,
  selectedReferences: 0, pendingExtractions: 0, analyzedPages: 0, comparablePages: 0,
  modelReady: false, modelStale: false, reportReady: false, reportStale: false,
  investigationReviewed: false, investigationApproved: false,
  serpCurationApproved: false, serpCurationCurrent: false, sentToPlanner: false,
  ...patch,
});

const coletado = (patch: Partial<RadarInvestigationInput> = {}) => base({ hasSnapshot: true, organicResults: 7, ...patch });

/* ------------------------------- A e B ----------------------------------- */

test("A · nenhuma barra global de investigação é montada acima dos cards", () => {
  const fonte = workbench();
  assert.doesNotMatch(fonte, /InvestigationBar/);
  assert.doesNotMatch(fonte, /radar-investigation-bar/);
  assert.doesNotMatch(fonte, /radar-investigation-primary/);
  // A área expandida continua vindo depois dos cards, sem nada entre eles.
  assert.ok(fonte.indexOf("RADAR_R3_AREAS.map(area => <AreaCard") < fonte.indexOf('expandedArea === "pesquisa"'));
});

test("B · o contexto editorial não é painel principal: vive recolhido no dossiê", () => {
  const fonteWorkbench = workbench();
  const fonteDossie = dossie();

  assert.doesNotMatch(fonteWorkbench, /CONTEXTO EDITORIAL/);
  assert.doesNotMatch(fonteWorkbench, /radar-editorial-context/);

  // O dado continua inteiro — dentro de <details>, e nunca aberto por padrão.
  assert.match(fonteDossie, /radar-editorial-context/);
  assert.match(fonteDossie, /Proveniência e detalhes técnicos/);
  assert.doesNotMatch(fonteDossie, /<details[^>]*\sopen/);
  assert.ok(fonteDossie.indexOf("Proveniência e detalhes técnicos") < fonteDossie.indexOf("<EditorialContextDetails"));
});

test("B · a ausência de contexto aparece como selo compacto na faixa do Article", () => {
  const fonte = workbench();
  /*
   * GATE 14.1 · o card "Conteúdo" deixou de existir.
   *
   * Fundamento não é etapa: o ArticleDNA passou a uma faixa de contexto sempre
   * visível. O selo de contexto parcial continua — mudou de lugar, não de
   * significado.
   */
  assert.match(fonte, /contexto parcial/i);
  assert.match(fonte, /model\.editorialContext/);
  assert.match(fonte, /data-testid="radar-article-context-band"/);
});

/* ------------------------------- C e D ----------------------------------- */

test("C · artigo sem snapshot oferece Iniciar coleta da SERP dentro da aba Coleta", () => {
  const acao = radarSerpCollectionAction({ hasSnapshot: false, state: "NOT_COLLECTED", contextReady: true });
  assert.equal(acao.actionLabel, "Iniciar coleta da SERP");
  assert.equal(acao.canStart, true);
  assert.equal(acao.isFirstCollection, true);

  const fonte = painel();
  assert.match(fonte, /const collectionTabAction: RadarSerpTabAction \| null/);
  assert.match(fonte, /activeTab === "collection" \? collectionTabAction/);
  assert.match(fonte, /radar-serp-collect-action/);
});

test("D · artigo com snapshot não oferece a primeira coleta", () => {
  const acao = radarSerpCollectionAction({ hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.notEqual(acao.actionLabel, "Iniciar coleta da SERP");
  assert.equal(acao.isFirstCollection, false);

  // Bloqueio estrutural não vira botão: repetir não conserta vínculo quebrado.
  const bloqueada = radarSerpCollectionAction({ hasSnapshot: false, state: "STRUCTURAL_BLOCK", contextReady: false, blockedReason: "vínculo inválido" });
  assert.equal(bloqueada.canStart, false);
});

/* ------------------------------- E e F ----------------------------------- */

test("E · a ação da curadoria pertence à aba Concorrentes", () => {
  const view = buildRadarInvestigationView(coletado());
  assert.equal(view.action.id, "START_CURATION");

  const naAba = radarSerpTabAction("competitors", view);
  assert.equal(naAba?.kind, "run");
  assert.equal(naAba?.id, "START_CURATION");
  assert.equal(naAba?.label, "Iniciar curadoria");
  assert.equal(naAba?.enabled, true);

  // Quem não é dona aponta para a dona, em vez de fingir que não há o que fazer.
  const naColeta = radarSerpTabAction("collection", view);
  assert.equal(naColeta?.kind, "navigate");
  assert.equal(naColeta?.target, "competitors");
  assert.equal(naColeta?.label, "Continuar para Concorrentes");
});

test("F · a ação da análise pertence à aba Análise, incluindo a geração do relatório", () => {
  const pronta = coletado({ curationStarted: true, selectedReferences: 5, pendingExtractions: 5 });
  const inicio = radarSerpTabAction("analysis", buildRadarInvestigationView(pronta));
  assert.equal(inicio?.kind, "run");
  assert.equal(inicio?.id, "START_ANALYSIS");
  assert.equal(inicio?.label, "Analisar páginas selecionadas (5)");

  const analisada = { ...pronta, pendingExtractions: 0, analyzedPages: 5, comparablePages: 4, modelReady: true };
  const relatorio = radarSerpTabAction("analysis", buildRadarInvestigationView(analisada));
  assert.equal(relatorio?.id, "GENERATE_REPORT");
  assert.equal(relatorio?.label, "Gerar relatório competitivo");

  const comRelatorio = { ...analisada, reportReady: true };
  const view = buildRadarInvestigationView(comRelatorio);
  assert.equal(radarSerpTabAction("evidence", view)?.label, "Continuar para Revisão");
  assert.equal(radarSerpTabAction("review", view)?.id, "REVIEW_INVESTIGATION");
  assert.equal(radarSerpTabAction("review", view)?.kind, "run");
  // Histórico é leitura: nunca recebe ação primária.
  assert.equal(radarSerpTabAction("history", view), null);
});

test("F · decidir resultado acontece na tabela, então o rodapé explica em vez de oferecer clique mudo", () => {
  const view = buildRadarInvestigationView(coletado({ curationStarted: true, pendingDecisions: 7 }));
  const acao = radarSerpTabAction("competitors", view);
  assert.equal(acao?.id, "DECIDE_RESULTS");
  assert.equal(acao?.enabled, false);
  assert.match(String(acao?.blockedReason), /tabela acima/);
});

/* ------------------------------- G e H ----------------------------------- */

test("G · o rodapé usa os handlers canônicos que já existiam", () => {
  const fonte = painel();
  assert.match(fonte, /if \(acao\.id === "COLLECT"\) return onRefresh\(\);/);
  assert.match(fonte, /if \(acao\.id === "START_CURATION"\) return onStartAnalysis\?\.\(\);/);
  assert.match(fonte, /if \(acao\.id === "START_ANALYSIS" \|\| acao\.id === "ANALYZE_PENDING"\) return onAnalyzeSelected\?\.\(\);/);
  assert.match(fonte, /onInvestigationAction\?\.\(acao\.id\);/);
  // Navegar entre abas não dispara domínio nenhum.
  assert.match(fonte, /if \(acao\.kind === "navigate"\)/);

  /*
   * GATE 15.3 · o despacho legado continua existindo — e deixou de ser alcançável.
   *
   * `runInvestigationAction` permanece na página: §17 permite reusar código, e
   * apagá-lo mexeria em caminhos de escrita remota que este gate não discute. O
   * que mudou é que ele não chega mais ao Workbench. A prova é a ausência da
   * LIGAÇÃO, não a ausência da função.
   */
  const page = ler("../modules/radar/radar-page.tsx");
  assert.match(page, /if \(id === "COLLECT"\) return void collect\(target\);/, "a função segue íntegra");
  assert.doesNotMatch(page, /onInvestigationAction=\{/, "LEGACY_HANDLERS_REACHABLE_FROM_PHASE1_UI = NO");
  /* No Workbench a prop não é declarada nem recebida — citá-la num comentário que explica a remoção é o oposto de religá-la. */
  assert.doesNotMatch(workbench(), /onInvestigationAction[?:=]/, "e o Workbench nem declara mais a prop");
});

test("H · nenhum provider é chamado ao renderizar a SERP ou o Workbench", () => {
  for (const fonte of [painel(), workbench(), dossie()]) {
    assert.doesNotMatch(fonte, /fetch\(/);
    assert.doesNotMatch(fonte, /useEffect/);
  }
});

/* --------------------------- SERP autocontida ----------------------------- */

test("GATE 15.3 · o painel legado continua no repositório e fora da superfície", () => {
  /*
   * §17: reuso de CÓDIGO é permitido; reuso de WORKFLOW não. O arquivo das seis
   * abas continua inteiro — nada foi apagado — e nenhum módulo o importa.
   * Enquanto ninguém o montar, ele é história, não autoridade.
   */
  const fonte = painel();
  for (const aba of ["collection", "competitors", "analysis", "evidence", "review", "history"]) {
    assert.ok(fonte.includes(aba), `a aba ${aba} continua existindo no arquivo`);
  }
  assert.doesNotMatch(workbench(), /RadarR3SerpPanel/, "e o Workbench não o monta");
  assert.doesNotMatch(ler("../modules/radar/radar-page.tsx"), /RadarR3SerpPanel/, "nem a página");
});

/* ------------- a ação do artigo ativo, com a SERP recolhida --------------- */

const acaoDoArtigo = (patch: Partial<RadarInvestigationInput> = {}, coleta?: Parameters<typeof radarSerpCollectionAction>[0]) =>
  radarWorkbenchPrimaryAction({
    investigation: buildRadarInvestigationView(base(patch)),
    collection: coleta ? radarSerpCollectionAction(coleta) : null,
  });

test("1 · artigo com snapshot e curadoria não iniciada oferece Iniciar curadoria", () => {
  const acao = acaoDoArtigo({ hasSnapshot: true, organicResults: 7 }, { hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.equal(acao?.id, "START_CURATION");
  assert.equal(acao?.label, "Iniciar curadoria");
  assert.equal(acao?.enabled, true);
  assert.equal(acao?.kind, "run");
});

test("2 · artigo sem snapshot oferece Iniciar coleta da SERP mesmo com a SERP recolhida", () => {
  const acao = acaoDoArtigo({}, { hasSnapshot: false, state: "NOT_COLLECTED", contextReady: true });
  assert.equal(acao?.id, "COLLECT");
  assert.equal(acao?.label, "Iniciar coleta da SERP");
  assert.equal(acao?.enabled, true);

  /*
   * GATE 15.3 · a ação legada saiu da tela; o motivo ficou.
   *
   * A autoridade acima continua devolvendo COLLECT — ela é domínio e não muda.
   * O que muda é a UI: oferecer "Iniciar coleta da SERP" era a segunda
   * autoridade de workflow, no lugar mais visível do Workbench. Sem view da
   * investigação não há o que operar, e a tela passa a dizer isso em vez de
   * herdar uma etapa do fluxo antigo.
   */
  const fonte = workbench();
  assert.doesNotMatch(fonte, /data-testid="radar-primary-action"/, "LEGACY_PRIMARY_ACTION_VISIBLE = NO");
  assert.doesNotMatch(fonte, /<PrimaryAction/, "o componente legado não é montado em lugar nenhum");
  const slot = fonte.slice(fonte.lastIndexOf("{expandedArea !== \"pesquisa\""));
  assert.ok(slot.includes("<ResearchUnavailable"), "no lugar dele, um motivo em texto");
  assert.doesNotMatch(slot, /<button/, "READ_ONLY: o aviso não tem controle nenhum");
});

test("3 · análise com pendentes oferece Analisar páginas pendentes (N)", () => {
  const acao = acaoDoArtigo({
    hasSnapshot: true, organicResults: 7, curationStarted: true, selectedReferences: 5,
    analyzedPages: 1, pendingExtractions: 4,
  }, { hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.equal(acao?.id, "ANALYZE_PENDING");
  assert.equal(acao?.label, "Analisar páginas pendentes (4)");
});

test("4 · ação bloqueada aparece desabilitada e com o motivo, nunca some sem explicação", () => {
  const semReferencia = acaoDoArtigo({ hasSnapshot: true, organicResults: 7, curationStarted: true, selectedReferences: 0 }, { hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.equal(semReferencia?.enabled, false);
  assert.match(String(semReferencia?.blockedReason), /Nenhuma referência foi marcada/);

  // Bloqueio estrutural é a exceção: repetir não conserta vínculo quebrado.
  const bloqueada = acaoDoArtigo({}, { hasSnapshot: false, state: "STRUCTURAL_BLOCK", contextReady: false, blockedReason: "vínculo inválido" });
  assert.equal(bloqueada, null);

  /* GATE 15.3 · o motivo agora é o da Fase 1 — a única ação que existe. */
  const fonte = workbench();
  assert.doesNotMatch(fonte, /data-testid="radar-primary-action-reason"/);
  assert.match(fonte, /data-testid="radar-deep-research-reason"/, "bloqueio sem explicação continua proibido");
  assert.match(fonte, /disabled=\{!acao\.enabled \|\| busy\}/);
});

test("5 · a SERP expandida é a dona do slot: não existem dois botões para a mesma decisão", () => {
  const fonte = workbench();
  /*
   * GATE 15.3 · agora há UMA ação, e ela vem de UMA autoridade.
   *
   * O slot externo repõe exatamente a ação da Fase 1 quando a Pesquisa está
   * recolhida — o mesmo `view.phase1`, o mesmo mapa de handler. Não existe
   * mais um segundo botão lendo a autoridade legada da investigação.
   */
  assert.equal((fonte.match(/<Phase1Slot/g) || []).length, 1, "um slot, uma ação");
  assert.doesNotMatch(fonte, /<PrimaryAction/, "e nenhuma ação legada ao lado dela");
  /*
   * GATE 14.1 · a garantia ficou estrutural em vez de condicional.
   *
   * A investigação passou a viver DENTRO da área Pesquisa. Fora dela ela não é
   * renderizada, então não há como os dois botões coexistirem: o slot só existe
   * quando a Pesquisa está recolhida, e aí a Fase 1 não está na tela.
   */
  const investigacao = fonte.indexOf("<DeepResearch view=");
  const abrePesquisa = fonte.indexOf('expandedArea === "pesquisa"');
  assert.ok(abrePesquisa >= 0 && investigacao > abrePesquisa, "a investigação é montada dentro da área Pesquisa");
  assert.equal((fonte.match(/<DeepResearch view=/g) || []).length, 1, "e em um lugar só");
  /*
   * E o painel legado, que tinha rodapé de ação próprio, não é mais montado: o
   * expansível da Pesquisa passou a abrir uma superfície de CONSULTA.
   */
  assert.doesNotMatch(fonte, /RadarR3SerpPanel/, "LEGACY_WORKFLOW_VISIBLE = NO");
  assert.match(fonte, /<RadarR3ResearchDetails model=\{model\} view=/);
});

test("6 · GATE 15.3 · o Workbench não despacha mais nenhuma ação legada", () => {
  const fonte = workbench();
  /*
   * O despacho legado traduzia ids de um fluxo de seis etapas — START_CURATION,
   * ANALYZE_PENDING, APPROVE_INVESTIGATION — em chamadas de rota. Ele sai da
   * tela inteira: não há `onRun`, não há navegação para aba, não há id herdado.
   */
  assert.doesNotMatch(fonte, /onRun=\{/);
  assert.doesNotMatch(fonte, /onOpenSerp/);
  for (const legado of ["START_CURATION", "ANALYZE_PENDING", "APPROVE_INVESTIGATION", "DECIDE_RESULTS", "REVIEW_INVESTIGATION"]) {
    assert.ok(!fonte.includes(legado), `o Workbench não menciona ${legado}`);
  }
  /* A tradução continua viva na página, para quem ainda precisar dela. */
  const page = ler("../modules/radar/radar-page.tsx");
  assert.match(page, /if \(id === "START_CURATION"\) return void startSerpAnalysis\(\);/);
});

test("decidir resultado abre a SERP em vez de virar clique mudo fora dela", () => {
  const acao = acaoDoArtigo({ hasSnapshot: true, organicResults: 7, curationStarted: true, pendingDecisions: 7, selectedReferences: 2 }, { hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.equal(acao?.id, "DECIDE_RESULTS");
  assert.equal(acao?.kind, "navigate");
  assert.equal(acao?.target, "competitors");
});
