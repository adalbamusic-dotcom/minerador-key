import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_PROFILE_STATES,
  RADAR_PROFILE_STATE_LABELS,
  radarResearchProfileStateOfAnalysis,
  radarYoutubeFinalizeDecision,
  radarYoutubeReportEvidence,
} from "../lib/radar/research-profile-state.ts";
import { buildRadarReportSummary } from "../lib/radar/operational-view.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";

/*
 * ======  RADAR_RESEARCH_PROFILES_1.1 · UMA AUTORIDADE DE ESTADO  ======
 *
 * O runtime mostrou, na MESMA tela e ao mesmo tempo:
 *
 *   corpo    "3 consultas · 38 vídeos · Investigação finalizada"
 *   card     "0 consulta(s) · 0 referência(s) · Modelo competitivo: Não iniciado"
 *   tabela   "Pesquisa: Não iniciado · Próxima ação: Iniciar Pesquisa YouTube"
 *
 * Quatro cálculos independentes sobre a mesma investigação. Nenhum deles olhava
 * a fotografia congelada.
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

/* ===== o artigo real: 3 consultas, 38 vídeos, apoio coletado ===== */

const consultas = (executadas: number) =>
  Array.from({ length: executadas }, (_, indice) => ({ queryId: `ytq:${indice}`, executed: true }));
const universo = (quantos: number) =>
  Array.from({ length: quantos }, (_, indice) => ({ videoId: `v${indice}`, universeClass: "COMPARABLE_LONG_FORM" }));

const corridaConcluida = { state: "COLLECTED", queries: consultas(3), universe: universo(38) };
const apoioColetado = { collectedAt: "2026-09-14T20:00:00.000Z", failureReason: null };

const congelada = (multimodal: boolean) => ({
  finalizedAt: "2026-09-14T21:00:00.000Z",
  run: corridaConcluida,
  multimodal: multimodal ? { blueprint: {}, researchSources: ["WEB_SERP", "YOUTUBE_SERP"], editorialOutput: "MULTIFORMAT_PACKAGE" } : null,
});

const projetar = (payload: unknown, profile: "GOOGLE" | "YOUTUBE" | "AMAZON" = "YOUTUBE") =>
  radarResearchProfileStateOfAnalysis({ payload, profile });

/**
 * A INVESTIGAÇÃO DO GOOGLE VAZIA — o estado real de um artigo de vídeo.
 *
 * Nenhuma SERP curada, nenhuma página extraída: é exatamente por isso que o
 * relatório dizia "Pesquisa pendente" sobre uma investigação de YouTube
 * congelada.
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
  extractions: [],
  selectedReferences: 0,
  observedAt: "2026-09-14T12:00:00.000Z",
});

/* =================== A · run concluída sem freeze =================== */

test("A · coleta concluída com apoio e sem fotografia → READY", () => {
  const projecao = projetar({ youtubeSearch: corridaConcluida, supportResearch: apoioColetado });
  assert.equal(projecao.state, "READY");
  assert.equal(projecao.counts.queries, 3);
  assert.equal(projecao.counts.videos, 38);
  assert.equal(projecao.nextAction.id, "FINALIZE");
  assert.equal(projecao.frozen, false);
});

/* =============== B · run + apoio + freeze → FINALIZED =============== */

test("B · com fotografia, o estado é FINALIZED e os números saem dela", () => {
  const projecao = projetar({
    youtubeSearch: corridaConcluida, supportResearch: apoioColetado,
    youtubeFrozenInvestigation: congelada(true),
  });
  assert.equal(projecao.state, "FINALIZED");
  assert.equal(projecao.frozen, true);
  assert.equal(projecao.finalizedAt, "2026-09-14T21:00:00.000Z");
  assert.equal(projecao.counts.queries, 3);
  assert.equal(projecao.counts.videos, 38);
  assert.equal(projecao.multimodalFrozen, true);

  /*
   * §5 · OS NÚMEROS VÊM DA FOTOGRAFIA, NÃO DA CORRIDA VIVA.
   *
   * Uma coleta posterior que esvaziasse a corrida não pode encolher o que já
   * foi congelado — senão "congelado" não congela nada.
   */
  const corridaEsvaziada = projetar({
    youtubeSearch: { state: "COLLECTING", queries: [], universe: [] },
    youtubeFrozenInvestigation: congelada(true),
  });
  assert.equal(corridaEsvaziada.counts.videos, 38);
  assert.equal(corridaEsvaziada.state, "FINALIZED");
});

/* ======== C · freeze válido + pacote legado preso em COLLECTING ======== */

test("C · FINALIZED tem precedência sobre campo legado pendente", () => {
  /*
   * ESTE É O BLOQUEIO DO RUNTIME.
   *
   * O apoio ficou marcado como pendente e puxava o pacote inteiro para
   * "Coletando" — sobre uma investigação que já estava congelada no banco.
   */
  const projecao = projetar({
    youtubeSearch: { state: "COLLECTING", queries: consultas(3), universe: universo(38) },
    supportResearch: { collectedAt: null, failureReason: "a cota foi recusada" },
    youtubeFrozenInvestigation: congelada(true),
  });
  assert.equal(projecao.state, "FINALIZED", "nenhum campo velho faz a tela recuar");
  assert.equal(projecao.statusLabel, "Finalizado");
  /* §12 · o apoio continua GRAVADO; o que ele perde é o poder de segurar o estado. */
  assert.equal(projecao.support?.failureReason, null);
});

test("C · sem fotografia, o apoio pendente continua segurando — como deve", () => {
  const pendente = projetar({ youtubeSearch: corridaConcluida, supportResearch: { collectedAt: null, failureReason: null } });
  assert.equal(pendente.state, "COLLECTING");

  const falhou = projetar({ youtubeSearch: corridaConcluida, supportResearch: { collectedAt: null, failureReason: "a cota foi recusada" } });
  assert.equal(falhou.state, "PARTIAL_SUPPORT_FAILED");
  assert.equal(falhou.nextAction.id, "RETRY_SUPPORT");
});

/* ============ o estado que faltava: "nunca começou" ============ */

test("sem corrida nenhuma o estado é NOT_STARTED — não 'Coletando'", () => {
  /*
   * A ausência deste estado era metade do defeito: `radarResearchPackageState`
   * caía em COLLECTING quando não havia corrida, e a tela anunciava a coleta de
   * algo que ninguém pediu.
   */
  const projecao = projetar({});
  assert.equal(projecao.state, "NOT_STARTED");
  assert.equal(projecao.nextAction.id, "START_RESEARCH");
  /* E não se exibe "0 consulta(s) · 0 vídeo(s)" para quem não começou. */
  assert.equal(projecao.lines.some(linha => linha.includes("consulta(s)")), false);
  assert.ok(RADAR_PROFILE_STATES.includes(projecao.state));
});

test("coleta em curso é COLLECTING, e coleta falha sem universo é FAILED", () => {
  assert.equal(projetar({ youtubeSearch: { state: "COLLECTING", queries: consultas(3), universe: [] } }).state, "COLLECTING");
  assert.equal(projetar({ youtubeSearch: { state: "COLLECTION_FAILED", queries: [], universe: [] } }).state, "FAILED");

  /*
   * FALHA COM UNIVERSO NÃO É FALHA TOTAL: a coleta trouxe alguma coisa, e
   * descartá-la cobraria de novo o que já foi pago.
   */
  const parcial = projetar({
    youtubeSearch: { state: "COLLECTION_FAILED", queries: consultas(1), universe: universo(9) },
    supportResearch: apoioColetado,
  });
  assert.equal(parcial.state, "READY");
});

/* ============ D · o card superior ============ */

test("D · o card lê a autoridade canônica e fala de VÍDEOS, não de referências", async () => {
  const fonte = semComentarios(await workbench());
  const card = fonte.slice(fonte.indexOf("function areaCopy"), fonte.indexOf('if (area === "videos")'));

  /*
   * O card lia `model.deepResearch` — read-model do GOOGLE, vazio num artigo de
   * vídeo — e por isso anunciava "0 referência(s) · Não iniciado".
   */
  assert.ok(card.includes("if (researchProjection && !researchProjection.ownedByGooglePipeline) {"));
  assert.ok(card.indexOf("researchProjection") < card.indexOf("model.deepResearch"), "a projeção responde ANTES do read-model do Google");
  assert.ok(card.includes("lines: researchProjection.lines"));

  /* "referência(s)" é vocabulário de SERP de páginas e não sobrevive ao perfil. */
  const projecao = projetar({ youtubeSearch: corridaConcluida, supportResearch: apoioColetado, youtubeFrozenInvestigation: congelada(true) });
  assert.deepEqual(projecao.lines, [
    "YouTube",
    "3 consulta(s) · 38 vídeo(s)",
    "Investigação competitiva concluída",
    "Blueprint multiformato congelado",
  ]);
  assert.equal(projecao.lines.some(linha => /referência/i.test(linha)), false);
});

/* ============ E e F · a tabela e a próxima ação ============ */

test("E · a linha da tabela não pode dizer 'Não iniciada' sobre investigação congelada", async () => {
  const fonte = semComentarios(await pagina());
  const coluna = fonte.slice(fonte.indexOf('{ id: "research", header: "Pesquisa"'), fonte.indexOf('{ id: "report"'));

  assert.ok(coluna.includes("const projecao = projecaoDePesquisa(row);"));
  assert.ok(coluna.indexOf("projecao.ownedByGooglePipeline") < coluna.indexOf("data.deepResearch"), "a projeção responde primeiro");

  const projecao = projetar({ youtubeSearch: corridaConcluida, youtubeFrozenInvestigation: congelada(true) });
  assert.equal(projecao.statusLabel, "Finalizado");
  assert.notEqual(projecao.statusLabel, RADAR_PROFILE_STATE_LABELS.NOT_STARTED);
});

test("F · a próxima ação é derivada, e não 'Iniciar Pesquisa' depois do freeze", async () => {
  const fonte = semComentarios(await pagina());
  const inicio = fonte.indexOf("const projecaoDoPerfil = radarResearchProfileStateOfAnalysis");
  assert.ok(inicio > 0, "a próxima ação consulta a projeção do perfil");
  const acao = fonte.slice(inicio, fonte.indexOf("r3.specialist", inicio));
  assert.ok(acao.includes("!projecaoDoPerfil.ownedByGooglePipeline ? projecaoDoPerfil.nextAction.label"));
  assert.ok(acao.includes("radarPhase1NextAction(deepResearch.phase1)"), "o pipeline do Google segue respondendo por ele");

  /* Nada de texto fixo: cada estado tem a sua continuação. */
  const porEstado = [
    [projetar({}), "Iniciar pesquisa"],
    [projetar({ youtubeSearch: { state: "COLLECTING", queries: [], universe: [] } }), "Aguardar a coleta"],
    [projetar({ youtubeSearch: corridaConcluida, supportResearch: apoioColetado }), "Finalizar investigação"],
    /*
     * O TEXTO MUDOU EM AMAZON_SEARCH_1.1 · §19 — a garantia, não.
     *
     * O que este teste protege é "cada estado tem a SUA continuação": nenhum
     * rótulo fixo. O gate 1.1 nomeou a retomada do apoio para diferenciá-la da
     * retomada da pesquisa, que custa uma coleta paga.
     */
    [projetar({ youtubeSearch: corridaConcluida, supportResearch: { collectedAt: null, failureReason: "x" } }), "Tentar novamente apoio Google"],
    [projetar({ youtubeSearch: corridaConcluida, youtubeFrozenInvestigation: congelada(true) }), "Revisar o relatório"],
  ] as const;
  for (const [projecao, esperado] of porEstado) assert.equal(projecao.nextAction.label, esperado);
});

/* ============ G · FINALIZE idempotente ============ */

test("G · FINALIZE repetido não cria nova fotografia", () => {
  const jaCongelada = radarYoutubeFinalizeDecision({
    payload: { youtubeSearch: corridaConcluida, youtubeFrozenInvestigation: congelada(true) },
    profile: "YOUTUBE",
  });
  assert.equal(jaCongelada.shouldFreeze, false);
  assert.match(jaCongelada.reason, /já estava finalizada/);

  const pronta = radarYoutubeFinalizeDecision({
    payload: { youtubeSearch: corridaConcluida, supportResearch: apoioColetado },
    profile: "YOUTUBE",
  });
  assert.equal(pronta.shouldFreeze, true);

  /* Congelar o que não dá para congelar produziria uma fotografia de nada. */
  assert.equal(radarYoutubeFinalizeDecision({ payload: {}, profile: "YOUTUBE" }).shouldFreeze, false);
  assert.equal(radarYoutubeFinalizeDecision({ payload: { youtubeSearch: { state: "COLLECTING", queries: [], universe: [] } }, profile: "YOUTUBE" }).shouldFreeze, false);
});

test("G · o handler consulta a decisão ANTES de montar a fotografia", async () => {
  const fonte = semComentarios(await pagina());
  const finalize = fonte.slice(fonte.indexOf("const finalizeYoutubeInvestigation"), fonte.indexOf("const resetYoutubeSearch"));

  assert.ok(finalize.includes("const decisao = radarYoutubeFinalizeDecision({"));
  assert.ok(finalize.includes("if (!decisao.shouldFreeze) { setNotice(decisao.reason); return; }"));
  assert.ok(finalize.indexOf("radarYoutubeFinalizeDecision") < finalize.indexOf("freezeRadarYoutubeInvestigation"), "decide antes de congelar");
});

test("§11 · um evento lógico de finalização — o readback não emite outro", async () => {
  const fonte = semComentarios(await pagina());
  const finalize = fonte.slice(fonte.indexOf("const finalizeYoutubeInvestigation"), fonte.indexOf("const resetYoutubeSearch"));

  /* Um `setNotice` de sucesso, e ele é o da decisão. */
  const sucessos = (finalize.match(/setNotice\(decisao\.reason\)/g) || []).length;
  assert.equal(sucessos, 2, "a recusa e a confirmação, ambas vindas da mesma decisão");
  /* Nenhuma frase de finalização escrita à mão no handler: uma fonte só. */
  assert.equal(/setNotice\("Investiga/.test(finalize), false);
  assert.equal(/Investigação de YouTube finalizada/.test(finalize), false, "a frase antiga, duplicável, saiu");
});

/* ============ §10 · o Refinalizar ============ */

test("§10 · [Refinalizar] saiu, e [Nova coleta] não aparece sobre o congelado", async () => {
  const fonte = semComentarios(await painel());
  assert.equal(fonte.includes("Refinalizar"), false);

  const barra = fonte.slice(fonte.indexOf('data-testid="radar-youtube-summary"'), fonte.indexOf("radar-youtube-shorts-notice"));
  assert.ok(barra.includes("{!finalizada && <button"), "o START some quando há fotografia");
  assert.ok(barra.includes('{finalizada ? "Reabrir / zerar investigação" : "Zerar pesquisa YouTube"}'), "reabrir é ação explícita");
  assert.ok(barra.includes("radar-youtube-finalized"), "e o estado é dito no lugar dos botões");

  /* O FINALIZE só aparece onde faz sentido, e a autoridade decide. */
  assert.ok(barra.includes('!finalizada && (projecao.state === "READY" || projecao.state === "PARTIAL_SUPPORT_FAILED")'));
});

/* ============ §8 · o Relatório ============ */

test("§8 · o Relatório reconhece a investigação de vídeo congelada", () => {
  const evidencia = radarYoutubeReportEvidence(projetar({
    youtubeSearch: corridaConcluida, supportResearch: apoioColetado, youtubeFrozenInvestigation: congelada(true),
  }));
  assert.deepEqual(evidencia, { finalized: true, queries: 3, videos: 38, multimodalFrozen: true });

  /*
   * A VISTA É REAL E ESTÁ VAZIA — é assim que um artigo de vídeo chega ao
   * relatório: sem SERP do Google curada, sem página extraída, sem amostra.
   * Inventar um objeto aqui testaria a minha fantasia do contrato.
   */
  const resumo = buildRadarReportSummary({ observed: vistaVazia.observed, view: vistaVazia, youtube: evidencia });

  const pesquisa = resumo.checks.find(item => item.id === "research")!;
  assert.equal(pesquisa.state, "READY");
  assert.match(pesquisa.detail, /38 vídeo\(s\).*3 consulta\(s\)/);
  assert.equal(resumo.blockers.includes("A investigação ainda não tem amostra comparável."), false);

  const modelo = resumo.checks.find(item => item.id === "model")!;
  assert.equal(modelo.state, "READY");
});

test("§8 · sem a camada multiformato o modelo é PARCIAL — não se fabrica check", () => {
  const evidencia = radarYoutubeReportEvidence(projetar({
    youtubeSearch: corridaConcluida, youtubeFrozenInvestigation: congelada(false),
  }));
  assert.equal(evidencia?.multimodalFrozen, false);

  const resumo = buildRadarReportSummary({ observed: vistaVazia.observed, view: vistaVazia, youtube: evidencia });
  assert.equal(resumo.checks.find(item => item.id === "model")!.state, "PARTIAL");

  /*
   * §8 · O QUE A EVIDÊNCIA DE VÍDEO NÃO SUSTENTA CONTINUA PENDENTE.
   *
   * Fontes verificadas e especialista falam de páginas extraídas. Pintá-los de
   * verde a partir de uma investigação de YouTube seria inventar leitura.
   */
  const fontes = resumo.checks.find(item => item.id === "sources")!;
  assert.equal(fontes.state, "NOT_REQUIRED");
});

test("§8 · investigação de vídeo NÃO congelada não alimenta o relatório", () => {
  assert.equal(radarYoutubeReportEvidence(projetar({ youtubeSearch: corridaConcluida, supportResearch: apoioColetado })), null);
  assert.equal(radarYoutubeReportEvidence(projetar({}, "GOOGLE")), null);
});

/* ============ I · o perfil Google não regride ============ */

test("I · o perfil Google devolve a mão à autoridade dele", () => {
  const google = projetar({ serpSnapshotId: "serp-9", deepResearch: { state: "COMPLETED" } }, "GOOGLE");
  assert.equal(google.ownedByGooglePipeline, true);
  assert.deepEqual(google.lines, [], "nada a dizer: quem fala é o pipeline do Google");
  assert.equal(google.headline, "");
  assert.equal(radarYoutubeReportEvidence(google), null);
});

test("I · o card e a tabela caem no caminho antigo quando o perfil é Google", async () => {
  const card = semComentarios(await workbench());
  const trecho = card.slice(card.indexOf("function areaCopy"), card.indexOf('if (area === "videos")'));
  /* A guarda é `!ownedByGooglePipeline`: sem ela, Google cairia na projeção nova. */
  assert.ok(trecho.includes("!researchProjection.ownedByGooglePipeline"));
  assert.ok(trecho.includes("buildRadarResearchCardSummary"), "o caminho do Google segue inteiro abaixo");

  const tabela = semComentarios(await pagina());
  const coluna = tabela.slice(tabela.indexOf('{ id: "research", header: "Pesquisa"'), tabela.indexOf('{ id: "report"'));
  assert.ok(coluna.includes("!projecao.ownedByGooglePipeline"));
  assert.ok(coluna.includes("buildRadarResearchCardSummary"));
});

/* ============ H · F5 e sessão nova ============ */

test("H · a projeção é função pura do que está gravado — F5 e outra sessão concordam", () => {
  const payload = {
    youtubeSearch: corridaConcluida, supportResearch: apoioColetado,
    youtubeFrozenInvestigation: congelada(true),
  };

  /*
   * F5 e uma segunda sessão leem o MESMO registro e chegam ao MESMO estado
   * porque não há nada de local na conta: nem hora, nem cache, nem ordem de
   * render. A ida e volta por JSON prova que nada depende de identidade de
   * objeto.
   */
  const antes = projetar(payload);
  const depoisDoF5 = projetar(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(depoisDoF5, antes);

  const outraSessao = projetar(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(outraSessao, antes);
  assert.equal(outraSessao.nextAction.label, antes.nextAction.label);
});

test("§3 · card, corpo, tabela e relatório partem da MESMA chamada", async () => {
  const fonte = semComentarios(await pagina());

  /* Um único construtor da projeção na página, e todos os consumidores o usam. */
  assert.ok(fonte.includes("const projecaoDePesquisa = (row: RadarItem | null): RadarResearchProfileProjection =>"));
  assert.ok(fonte.includes("projecao: projecaoDePesquisa(activeRadarItem),"), "o corpo");
  assert.ok(fonte.includes("researchProjection={projecaoDePesquisa(activeRadarItem)}"), "o card");
  assert.ok(fonte.includes("const projecao = projecaoDePesquisa(row);"), "a tabela");
  assert.ok(fonte.includes("youtube: radarYoutubeReportEvidence(projecaoDePesquisa(row))"), "o relatório");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
