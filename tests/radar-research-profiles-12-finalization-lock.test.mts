import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  radarResearchProfileStateOfAnalysis,
  type RadarResearchProfileProjection,
} from "../lib/radar/research-profile-state.ts";
import { radarOperationalRow, RADAR_OPERATIONAL_STATUS_LABEL } from "../lib/radar/operational-view.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";

/*
 * ===== RADAR_RESEARCH_PROFILES_1.2 · O LOCK DE FINALIZAÇÃO =====
 *
 * O 1.1 pôs o ESTADO numa autoridade só. O produto continuou dividido:
 *
 *   badge da área        "Não iniciada"
 *   tabela / Status      "Não iniciado"
 *   próxima ação         "Iniciar Pesquisa YouTube"
 *   barra recolhida      oferecendo START
 *   seletor              Google e Amazon ainda clicáveis
 *   blueprint            sem porta de entrada
 *   38 vídeos            abertos como conteúdo principal
 *
 * DATA_FINALIZED = YES, PRODUCT_FINALIZED = NO. Todos esses derivavam por conta
 * própria do pipeline do GOOGLE — que num artigo de vídeo nunca começou.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const pagina = () => readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const painel = () => readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");
const workbench = () => readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");

/* ===== o artigo real: "skin care noturno", 3 consultas, 38 vídeos ===== */

const consultas = Array.from({ length: 3 }, (_, i) => ({ queryId: `ytq:${i}`, executed: true }));
const universo = Array.from({ length: 38 }, (_, i) => ({ videoId: `v${i}`, universeClass: "COMPARABLE_LONG_FORM" }));
const corrida = { state: "COLLECTED", queries: consultas, universe: universo };

const REGISTRO_REAL = {
  youtubeSearch: corrida,
  supportResearch: { collectedAt: "2026-09-14T20:00:00.000Z", failureReason: null },
  youtubeFrozenInvestigation: {
    finalizedAt: "2026-09-14T21:00:00.000Z",
    run: corrida,
    multimodal: { blueprint: {}, researchSources: ["WEB_SERP", "YOUTUBE_SERP"], editorialOutput: "MULTIFORMAT_PACKAGE" },
  },
};

const projetar = (payload: unknown, profile: "GOOGLE" | "YOUTUBE" | "AMAZON" = "YOUTUBE") =>
  radarResearchProfileStateOfAnalysis({ payload, profile });

const finalizada = () => projetar(REGISTRO_REAL);

/* ================= §2 · o que o artigo real mostra ================= */

test("§2 · o artigo finalizado não diz 'não iniciada' em lugar nenhum da projeção", () => {
  const projecao = finalizada();
  assert.equal(projecao.state, "FINALIZED");
  assert.equal(projecao.statusLabel, "Finalizado");
  assert.deepEqual(projecao.lines, [
    "YouTube",
    "3 consulta(s) · 38 vídeo(s)",
    "Investigação competitiva concluída",
    "Blueprint multiformato congelado",
  ]);

  /* As quatro frases proibidas, conferidas em tudo o que a projeção expõe. */
  const tudo = [projecao.statusLabel, projecao.headline, ...projecao.lines, projecao.nextAction.label].join(" | ");
  for (const proibida of ["Não iniciada", "Não iniciado", "Iniciar Pesquisa", "Coletando"]) {
    assert.equal(tudo.includes(proibida), false, `vazou "${proibida}" em: ${tudo}`);
  }
});

/* ============ A · o badge do cabeçalho da área ============ */

test("A · o badge da área lê a projeção, e não o estado do pipeline do Google", async () => {
  const fonte = semComentarios(await workbench());
  const cabecalho = fonte.slice(fonte.indexOf("function DeepResearch"), fonte.indexOf('data-testid="radar-search-mode"'));

  /*
   * Ele renderizava `deepResearchStateLabel(view.state)` — a vista do GOOGLE,
   * que num artigo de vídeo é NOT_STARTED por construção.
   */
  assert.ok(cabecalho.includes('data-testid="radar-deep-research-state">{doPerfil ? doPerfil.statusLabel : deepResearchStateLabel(view.state)}'));
  assert.ok(cabecalho.includes("const doPerfil = researchProjection && !researchProjection.ownedByGooglePipeline ? researchProjection : null;"));
  assert.equal(finalizada().statusLabel, "Finalizado");
});

/* ============ B e §9 · o Status GLOBAL da tabela ============ */

test("B · o Status da linha não nega uma pesquisa que congelou", () => {
  const projecao = finalizada();

  /* Sem vista do Google nenhuma — o caso do artigo de vídeo puro. */
  const semVista = radarOperationalRow({ view: null, legacyNextAction: "Iniciar Pesquisa YouTube", research: projecao });
  assert.equal(semVista.status, "READY");
  assert.equal(semVista.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.READY);
  assert.notEqual(semVista.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.NOT_STARTED);
  assert.equal(semVista.nextAction, "Revisar o relatório");

  /*
   * §9 · E "Finalizado" também seria falso: o Radar ainda tem o relatório pela
   * frente. Pesquisa congelada significa PRONTO para a etapa seguinte.
   */
  assert.notEqual(semVista.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.FINALIZED);
});

test("B · sem pesquisa congelada, a linha continua exatamente como era", () => {
  const virgem = radarOperationalRow({ view: null, legacyNextAction: "Iniciar Pesquisa" });
  assert.equal(virgem.status, "NOT_STARTED");
  assert.equal(virgem.nextAction, "Iniciar Pesquisa");

  const semCongelar = radarOperationalRow({ view: null, legacyNextAction: "Iniciar Pesquisa", research: projetar({ youtubeSearch: corrida }) });
  assert.equal(semCongelar.status, "NOT_STARTED", "só o FREEZE muda o status global");
});

test("B · com a vista do Google presente, a pesquisa congelada só vence o 'não iniciado'", () => {
  /*
   * ====== O OUTRO CAMINHO DE `radarOperationalRow` ======
   *
   * Quando existe vista do Google, ela calcula um estado. A pesquisa congelada
   * pode corrigir UMA coisa ali: a negação de um trabalho que aconteceu.
   * Qualquer outro estado descreve trabalho real do pipeline do Google e
   * continua valendo — atropelá-lo trocaria "analisando" por "pronto" e
   * esconderia a etapa em curso.
   */
  const vistaVazia = buildRadarDeepResearchView({
    context: {
      article: { articleId: "a1", articleDnaVersionId: "dna-1", payload: { promise: "skin care noturno" } },
      keywords: [{
        identity: { keywordId: "kw1", text: "skin care noturno", role: "principal" },
        strategy: { volume: 480, kgrScore: 0.4, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: null, semanticQualification: null },
        resolution: "FULL",
      }],
      editorialTopics: [], resolvedKeywordTexts: ["skin care noturno"],
      silo: { siloId: "s1", siloName: "skincare", articleRole: "SUPORTE" },
      formationSerp: null, internalLinks: null, limitations: [],
    } as never,
    snapshot: { query: "skin care noturno", organicResults: [] } as never,
    extractions: [], selectedReferences: 0, observedAt: "2026-09-14T12:00:00.000Z",
  });

  const comVista = radarOperationalRow({ view: vistaVazia, legacyNextAction: "x", research: finalizada() });
  assert.equal(comVista.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.READY);
  /* §9 · "Finalizado" prometeria o Radar inteiro concluído. O relatório espera. */
  assert.notEqual(comVista.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.FINALIZED);
  assert.equal(comVista.nextAction, "Revisar o relatório");

  /*
   * E o teto: um estado do Google que NÃO é "não iniciado" sobrevive intacto.
   * Simulamos isso pela única porta honesta — `running`, que o próprio
   * `radarOperationalStatus` lê.
   */
  const emCurso = radarOperationalRow({ view: vistaVazia, running: true, legacyNextAction: "x", research: finalizada() });
  assert.notEqual(emCurso.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.READY, "trabalho em curso não vira 'pronto'");
});

test("§9 · a página só entrega a projeção quando ela tem autoridade", async () => {
  const fonte = semComentarios(await pagina());
  const linha = fonte.slice(fonte.indexOf("const operationalRowFor"), fonte.indexOf("const columns"));
  assert.ok(linha.includes("research: projecao.ownedByGooglePipeline ? null : projecao,"), "o perfil Google não interfere aqui");
});

/* ============ C · a próxima ação ============ */

test("C · a próxima ação depois do freeze nunca é iniciar pesquisa", () => {
  const projecao = finalizada();
  assert.equal(projecao.nextAction.id, "REVIEW_REPORT");
  assert.equal(projecao.nextAction.label, "Revisar o relatório");
  assert.equal(/Iniciar/i.test(projecao.nextAction.label), false);
});

/* ============ D e §10 · a barra recolhida ============ */

test("D · a barra recolhida não oferece START sobre investigação congelada", async () => {
  const fonte = semComentarios(await workbench());
  const inicio = fonte.indexOf("function Phase1Slot");
  const barra = fonte.slice(inicio, fonte.indexOf("const disparar", inicio));

  assert.ok(barra.includes("if (doPerfil && !doPerfil.canStart) {"), "a barra pergunta antes de oferecer");
  assert.ok(barra.includes('data-testid="radar-phase1-locked"'));
  /* A guarda vem ANTES de qualquer leitura da ação do Google. */
  assert.ok(barra.indexOf("doPerfil.canStart") < barra.indexOf("const acao = view.phase1;"));

  /*
   * "Recuperar pesquisa já paga" era pior que o START: convidava a trazer de
   * volta o que já estava na tela. Ele vive dentro do slot e cai junto.
   */
  assert.ok(barra.indexOf("doPerfil.canStart") < barra.indexOf("podeRecuperar"));

  assert.equal(finalizada().canStart, false);
});

test("D · antes do freeze a barra continua oferecendo o que deve", () => {
  assert.equal(projetar({}).canStart, true, "nunca começou: pode começar");
  assert.equal(projetar({ youtubeSearch: corrida, supportResearch: { collectedAt: "x", failureReason: null } }).canStart, true, "pronta: pode recoletar");
  assert.equal(projetar({ youtubeSearch: { state: "COLLECTING", queries: [], universe: [] } }).canStart, false, "coleta em curso não aceita outro START");
});

/* ============ E · o seletor de perfil ============ */

test("E · Google e Amazon ficam desabilitados depois do freeze, com motivo legível", async () => {
  const fonte = semComentarios(await workbench());
  const abre = fonte.indexOf('data-testid="radar-search-mode"');
  const seletor = fonte.slice(abre, fonte.indexOf('data-testid="radar-profile-locked"', abre) + 200);

  assert.ok(seletor.includes("const travadoPeloPerfil = Boolean(doPerfil?.profileLocked);"));
  /*
   * ====== A GUARDA CRESCEU EM AMAZON_SEARCH_1.1 · §15 ======
   *
   * O 1.2 travava o seletor depois do freeze e sobre o pipeline do Google.
   * Faltava o meio: uma coleta EM CURSO num perfil que não é o Google deixa
   * `view.state` em NOT_STARTED, e trocar de perfil ali trocava o universo
   * sob uma pesquisa paga em andamento, em silêncio.
   *
   * As duas condições do 1.2 continuam na expressão — a nova é somada, não
   * substitui nenhuma.
   */
  assert.ok(seletor.includes("travadoPeloPerfil"), "o lock do freeze continua");
  assert.ok(seletor.includes('view.state !== "NOT_STARTED"'), "e o pipeline do Google também");
  assert.ok(seletor.includes('const emCurso = Boolean(doPerfil && doPerfil.state !== "NOT_STARTED");'), "1.1 · §15 · e agora a corrida em curso");
  assert.ok(seletor.includes('const congelado = travadoPeloPerfil || emCurso || view.state !== "NOT_STARTED";'));
  assert.ok(seletor.includes("disabled={busy || congelado}"));
  /* O motivo não pode viver só no `title`: quem usa toque nunca o vê. */
  assert.ok(seletor.includes('data-testid="radar-profile-locked"'));

  const projecao = finalizada();
  assert.equal(projecao.profileLocked, true);
  assert.equal(projecao.lockReason, "Esta investigação foi finalizada em YouTube. Reabra/zere a investigação para escolher outro perfil.");
});

test("E · o apoio do Google NÃO transforma Google em segundo perfil selecionável", () => {
  /*
   * O apoio é camada da investigação de vídeo, não alternativa a ela. Se ele
   * destravasse o seletor, um clique em "Google" trocaria o universo sob uma
   * fotografia assinada.
   */
  const projecao = finalizada();
  assert.equal(projecao.support?.collected, true, "o apoio foi coletado");
  assert.equal(projecao.profileLocked, true, "e mesmo assim o perfil segue travado");
  assert.equal(projecao.profile, "YOUTUBE");
});

test("E · antes do freeze o perfil continua trocável — a escolha é de quem não gastou", () => {
  assert.equal(projetar({}).profileLocked, false);
  assert.equal(projetar({ youtubeSearch: corrida }).profileLocked, false);
  assert.equal(projetar({}).lockReason, null);
});

/* ============ F e §5 · Ver blueprint ============ */

test("F · [Ver blueprint] existe depois do freeze e leva à fotografia", async () => {
  const fonte = semComentarios(await painel());
  const barra = fonte.slice(fonte.indexOf('data-testid="radar-youtube-summary"'), fonte.indexOf('data-testid="radar-youtube-finalized"'));

  assert.ok(barra.includes("{projecao.showBlueprint && <button"));
  assert.ok(barra.includes('data-testid="radar-youtube-view-blueprint"'));
  assert.ok(barra.includes(">Ver blueprint</button>"));
  /*
   * Ele leva à seção que traz a RECOMENDAÇÃO. Em
   * RADAR_BLUEPRINT_CANONICAL_1 esse destino passou a ser o blueprint
   * canônico — a mesma seção, agora montada pela autoridade única e com o
   * material editorial (título, gancho, roteiro, Shorts) no topo.
   */
  assert.ok(barra.includes(`querySelector('[data-testid="radar-competitive-blueprint"]')`));

  assert.equal(finalizada().showBlueprint, true);
  assert.equal(projetar({ youtubeSearch: corrida }).showBlueprint, false, "sem fotografia não há o que abrir");
});

test("§5 · o blueprint mostrado é o CONGELADO, nunca o recálculo", async () => {
  const fonte = await painel();
  const render = fonte.split("\n").filter(linha => linha.includes("<BlueprintMultiformato"));
  assert.equal(render.length, 1);
  assert.ok(render[0].includes("frozen?.multimodal?.blueprint || multimodal!"), "o congelado vem primeiro");
  assert.equal(finalizada().multimodalFrozen, true);
});

/* ============ G e H · a amostra competitiva ============ */

test("G · depois do freeze a amostra nasce recolhida, com a contagem no rótulo", async () => {
  const fonte = semComentarios(await painel());

  assert.ok(fonte.includes("projecao.sampleDefaultExpanded"), "a autoridade decide, não o painel");
  assert.ok(fonte.includes('data-testid="radar-youtube-sample-details"'));
  /*
   * ============ O RÓTULO MUDOU EM RADAR_FINAL_2.2 ============
   *
   * Depois do freeze a corrida não vem mais no payload inicial — ela é buscada
   * ao abrir. O rótulo precisa existir ANTES do conteúdo, e por isso ele lê o
   * resumo quando a corrida ainda não chegou.
   *
   * A garantia é a mesma: a contagem fica no rótulo, e recolher não esconde.
   */
  assert.ok(fonte.includes("Ver amostra competitiva · {corrida?.universe.length ?? sampleSummary?.count ?? 0} vídeo(s)"));

  assert.equal(finalizada().sampleDefaultExpanded, false);
  assert.equal(projetar({ youtubeSearch: corrida }).sampleDefaultExpanded, true, "antes de congelar, os vídeos SÃO o trabalho");
});

test("H · abrir a amostra não recalcula nem busca — é a mesma lista dos dois lados", async () => {
  const fonte = await painel();

  /*
   * Duas construções divergiriam com o tempo, e a versão recolhida acabaria
   * mostrando algo diferente da aberta sobre a mesma investigação.
   */
  assert.equal((fonte.match(/const amostra = <>/g) || []).length, 1, "uma construção só");
  assert.equal((fonte.match(/\{amostra\}/g) || []).length, 2, "usada nos dois caminhos");

  const secao = semComentarios(fonte.slice(fonte.indexOf("const amostra = <>"), fonte.indexOf("radar-youtube-provenance-details")));
  assert.equal(/fetch\(|buildRadarYoutubeUniverse|normalizeDataForSeo/.test(secao), false, "nenhuma coleta, nenhum recálculo");
  assert.deepEqual(tentativasDeRede, []);
});

/* ============ §11 · reabrir diz o que custa ============ */

test("§11 · reabrir declara a consequência ANTES do clique", async () => {
  const fonte = await painel();
  const bloco = fonte.slice(fonte.indexOf('data-testid="radar-youtube-finalized"'), fonte.indexOf("<PacoteDePesquisa"));

  assert.ok(bloco.includes('data-testid="radar-youtube-reopen-consequence"'));
  assert.match(bloco, /tira esta fotografia do corrente/);
  assert.match(bloco, /libera a escolha do perfil/);
  assert.match(bloco, /histórico gravado é preservado/);
  /* E que uma coleta nova custa: é a parte que ninguém lembra depois. */
  assert.match(bloco, /uma nova custa de novo/);
});

/* ============ I · F5 e sessão nova ============ */

test("I · F5 e outra sessão chegam à mesma projeção, travas inclusive", () => {
  const antes = projetar(REGISTRO_REAL);
  const depois = projetar(JSON.parse(JSON.stringify(REGISTRO_REAL)));
  assert.deepEqual(depois, antes);

  /* As travas atravessam junto — não são estado de tela. */
  for (const campo of ["profileLocked", "canStart", "showBlueprint", "sampleDefaultExpanded", "workflowStatusHint"] as const) {
    assert.deepEqual(depois[campo], antes[campo], campo);
  }

  /* E o Status global derivado delas também. */
  const linha = (projecao: RadarResearchProfileProjection) =>
    radarOperationalRow({ view: null, legacyNextAction: "Iniciar Pesquisa YouTube", research: projecao });
  assert.deepEqual(linha(depois), linha(antes));
});

/* ============ J · o perfil Google não regride ============ */

test("J · o perfil Google não trava nada e não ganha ações novas", () => {
  const google = projetar({ serpSnapshotId: "serp-9", deepResearch: { state: "COMPLETED" } }, "GOOGLE");
  assert.equal(google.ownedByGooglePipeline, true);
  assert.equal(google.profileLocked, false, "quem trava o pipeline do Google é ele mesmo");
  assert.equal(google.canStart, true);
  assert.equal(google.showBlueprint, false);
  assert.equal(google.sampleDefaultExpanded, true);
  assert.equal(google.workflowStatusHint, null, "e o Status global dele continua sendo dele");
});

test("J · todo consumidor testa `ownedByGooglePipeline` antes de assumir o comando", async () => {
  const wb = semComentarios(await workbench());
  const pg = semComentarios(await pagina());

  /* Badge, seletor e barra recolhida: o mesmo portão nos três. */
  assert.equal((wb.match(/!researchProjection\.ownedByGooglePipeline/g) || []).length, 3);
  /* Card da área, coluna da tabela, próxima ação e Status global. */
  assert.ok(wb.includes("if (researchProjection && !researchProjection.ownedByGooglePipeline) {"), "o card");
  assert.ok(pg.includes("if (!projecao.ownedByGooglePipeline) return <div>"), "a coluna");
  assert.ok(pg.includes("!projecaoDoPerfil.ownedByGooglePipeline ? projecaoDoPerfil.nextAction.label"), "a próxima ação");
  assert.ok(pg.includes("research: projecao.ownedByGooglePipeline ? null : projecao,"), "o Status global");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
