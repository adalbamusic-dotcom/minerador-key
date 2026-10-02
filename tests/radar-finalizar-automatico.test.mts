import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_PROFILE_STATE_LABELS,
  radarProfileActionLabel,
  radarProfileAutoFinalizeDecision,
  radarProfileManualStepLabel,
  radarResearchProfileStateOfAnalysis,
  radarYoutubeFinalizeDecision,
} from "../lib/radar/research-profile-state.ts";
import { buildRadarResearchPackage } from "../lib/radar/research-profile.ts";
import { radarResearchPlanOfAnalysis } from "../lib/radar/search-mode.ts";
import { radarFinalizationReadiness, radarGoogleAutoFinalizeDecision } from "../lib/radar/investigation-finalization.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import {
  RADAR_AUTO_FINALIZE_AI_COST,
  radarAutoFinalizeButtonLabel,
  radarAutoFinalizePendingNotice,
  radarAutoFinalizeStartNote,
  radarFinalizeWithAiLabel,
  radarPhase1WithAutoFinalize,
} from "../lib/radar/operational-actions.ts";

/*
 * ====== 2026-10-02 · D9 · FINALIZAÇÃO AUTOMÁTICA NOS TRÊS PERFIS ======
 *
 * Decisão do dono (SDD da diretriz editorial pela SERP, Adendo D): Google,
 * YouTube e Amazon congelam SOZINHOS quando a coleta — e a análise, onde ela
 * existe — termina sem pendência; em seguida a IA organiza o artigo-modelo.
 * O botão manual continua. Com pendência, nada congela e a tela diz por quê.
 *
 * A regra antiga ("nada congela sozinho; só o clique") morava em
 * `lib/radar/investigation-finalization.ts` e em testes que a travavam; eles
 * passaram a exigir este contrato. Junto, os dois defeitos do YouTube achados
 * no mapeamento: a projeção ignorava o Google base como apoio já coletado, e a
 * gravação do apoio usava trava de versão velha e engolia o 409.
 *
 * Tudo aqui vale para qualquer página, marca e assunto: as fixtures são formas
 * mínimas do que fica gravado, sem nada do caso real. PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ler = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const pagina = async () => semComentarios(await ler("../modules/radar/radar-page.tsx"));
const fatia = (fonte: string, de: string, ate: string) => {
  const inicio = fonte.indexOf(de);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.ok(inicio >= 0, `âncora "${de}"`);
  assert.ok(fim > inicio, `âncora "${ate}"`);
  return fonte.slice(inicio, fim);
};
/* Cada marco é procurado DEPOIS do anterior: a ordem é a do código, não a da primeira ocorrência. */
const emOrdem = (texto: string, marcos: string[]) => {
  let desde = 0;
  for (const [indice, marco] of marcos.entries()) {
    const posicao = texto.indexOf(marco, desde);
    assert.ok(posicao >= 0, indice ? `"${marco}" deveria vir depois de "${marcos[indice - 1]}"` : `falta "${marco}"`);
    desde = posicao + marco.length;
  }
};

/* ============================ as fixtures ============================ */

const consultas = (executadas: number) =>
  Array.from({ length: executadas }, (_, indice) => ({ queryId: `q:${indice}`, executed: true }));
const universo = (quantos: number) =>
  Array.from({ length: quantos }, (_, indice) => ({ videoId: `v${indice}`, universeClass: "COMPARABLE_LONG_FORM" }));

const corridaYoutube = (extra: Record<string, unknown> = {}) => ({
  state: "COLLECTED", queries: consultas(3), universe: universo(24),
  provenance: { queriesRequested: 3, queriesSucceeded: 3, queriesFailed: 0 },
  ...extra,
});
const apoioColetado = { collectedAt: "2026-10-02T12:00:00.000Z", failureReason: null };
const apoioFalho = { collectedAt: null, failureReason: "a cota do provider foi recusada" };

/* As três formas de "o Google deste artigo já está gravado". */
const GOOGLE_BASE: Record<string, Record<string, unknown>> = {
  "investigação Google finalizada": { finalizedBundle: { bundleHash: "bundle-1" } },
  "investigação Google em curso": { deepResearch: { queries: [] } },
  "SERP do Google coletada": { serpSnapshotId: "snap-1" },
};

const corridaAmazon = (extra: Record<string, unknown> = {}) => ({
  state: "COLLECTED", queries: consultas(1), universe: universo(12),
  provenance: { queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0 },
  ...extra,
});
const pacoteAmazon = (status: string, apoio: string) => ({
  status,
  primaryResearch: { status: "COLLECTED", queryCount: 1, uniqueProductCount: 12 },
  supportResearch: { status: apoio },
});

/* ============== DEFEITO 1 · o Google base é apoio já coletado ============== */

test("DEFEITO 1 · com o Google base gravado, a projeção diz 'Pronta para finalizar' — como o pacote", () => {
  for (const [nome, base] of Object.entries(GOOGLE_BASE)) {
    const payload = { ...base, youtubeSearch: corridaYoutube() };
    const projecao = radarResearchProfileStateOfAnalysis({ payload, profile: "YOUTUBE" });
    assert.equal(projecao.state, "READY", `${nome}: o card ficava "Coletando · Apoio do Google pendente"`);
    assert.equal(projecao.nextAction.id, "FINALIZE", `${nome}: e o botão de finalizar some`);
    assert.equal(projecao.support?.collected, true);
    assert.equal(projecao.lines.includes("Apoio do Google pendente"), false);

    /*
     * O CARD E O AVISO NÃO PODEM DIZER COISAS OPOSTAS.
     *
     * O pacote é montado com `webSerpCollected` lido do MESMO plano de pesquisa
     * que a projeção passou a consultar. Para o mesmo payload, os dois dizem
     * a mesma palavra.
     */
    const pacote = buildRadarResearchPackage({
      profile: "YOUTUBE", primaryKeyword: "assunto qualquer",
      primaryRunning: false, primaryCollected: true, primaryFailed: false,
      primaryQueryCount: 3, primaryResultCount: 24,
      support: null,
      webSerpCollected: radarResearchPlanOfAnalysis(payload).sources.includes("WEB_SERP"),
    });
    assert.equal(pacote.state, "READY", nome);
    assert.equal(projecao.statusLabel, RADAR_PROFILE_STATE_LABELS.READY);
    assert.ok(pacote.headline.endsWith(projecao.statusLabel), `${nome}: "${pacote.headline}" × "${projecao.statusLabel}"`);
  }
});

test("DEFEITO 1 · sem Google gravado, o apoio pendente continua segurando — e o falho também", () => {
  const pendente = radarResearchProfileStateOfAnalysis({ payload: { youtubeSearch: corridaYoutube(), supportResearch: { collectedAt: null, failureReason: null } }, profile: "YOUTUBE" });
  assert.equal(pendente.state, "COLLECTING");
  const falho = radarResearchProfileStateOfAnalysis({ payload: { youtubeSearch: corridaYoutube(), supportResearch: apoioFalho }, profile: "YOUTUBE" });
  assert.equal(falho.state, "PARTIAL_SUPPORT_FAILED");

  /* Com o Google gravado, o registro de falha antigo não segura mais nada. */
  const falhoComBase = radarResearchProfileStateOfAnalysis({ payload: { ...GOOGLE_BASE["SERP do Google coletada"], youtubeSearch: corridaYoutube(), supportResearch: apoioFalho }, profile: "YOUTUBE" });
  assert.equal(falhoComBase.state, "READY");
});

test("DEFEITO 1 · o pacote gravado (Amazon) continua mandando no próprio apoio", () => {
  /* Quem decide o apoio da Amazon é o servidor, que já reaproveita o snapshot existente. */
  const projecao = radarResearchProfileStateOfAnalysis({
    payload: { ...GOOGLE_BASE["SERP do Google coletada"], amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("PARTIAL_SUPPORT_FAILED", "FAILED") },
    profile: "AMAZON",
  });
  assert.equal(projecao.state, "PARTIAL_SUPPORT_FAILED");
  assert.equal(projecao.support?.collected, false);
});

/* ======================= D9 · YouTube ======================= */

test("D9 · YouTube sem pendência congela sozinho, e o botão manual concorda", () => {
  const payload = { youtubeSearch: corridaYoutube(), supportResearch: apoioColetado };
  const automatico = radarProfileAutoFinalizeDecision({ payload, profile: "YOUTUBE" });
  assert.deepEqual({ next: automatico.next, pending: automatico.pending }, { next: "FINALIZE", pending: false });
  assert.equal(radarYoutubeFinalizeDecision({ payload, profile: "YOUTUBE" }).shouldFreeze, true);

  /* O caso do mapeamento: acréscimo de vídeo num artigo com o Google base finalizado. */
  const acrescimo = radarProfileAutoFinalizeDecision({ payload: { ...GOOGLE_BASE["investigação Google finalizada"], youtubeSearch: corridaYoutube() }, profile: "YOUTUBE" });
  assert.equal(acrescimo.next, "FINALIZE");
});

test("D9 · YouTube com pendência não congela, diz por quê, e o botão manual continua", () => {
  const casos: Array<[string, Record<string, unknown>, RegExp, boolean]> = [
    ["apoio do Google falhou", { youtubeSearch: corridaYoutube(), supportResearch: apoioFalho }, /apoio do Google falhou/, true],
    ["uma consulta falhou", { youtubeSearch: corridaYoutube({ provenance: { queriesRequested: 3, queriesSucceeded: 2, queriesFailed: 1 } }), supportResearch: apoioColetado }, /1 consulta\(s\) da coleta falharam/, true],
    ["coleta fechada como falha, com universo", { youtubeSearch: corridaYoutube({ state: "COLLECTION_FAILED" }), supportResearch: apoioColetado }, /falha/, true],
    ["amostra vazia", { youtubeSearch: corridaYoutube({ universe: [] }), supportResearch: apoioColetado }, /nenhum vídeo/, true],
    ["coleta em curso", { youtubeSearch: corridaYoutube({ state: "COLLECTING" }) }, /em andamento/, false],
    ["apoio ainda não gravado", { youtubeSearch: corridaYoutube(), supportResearch: { collectedAt: null, failureReason: null } }, /apoio do Google ainda não está gravado/, false],
  ];
  for (const [nome, payload, motivo, botaoManualAceita] of casos) {
    const automatico = radarProfileAutoFinalizeDecision({ payload, profile: "YOUTUBE" });
    assert.equal(automatico.next, null, `${nome}: nada congela sozinho`);
    assert.equal(automatico.pending, true, nome);
    assert.match(automatico.reason, motivo, nome);
    assert.equal(radarYoutubeFinalizeDecision({ payload, profile: "YOUTUBE" }).shouldFreeze, botaoManualAceita, `${nome}: a decisão do botão manual não mudou`);
  }
});

test("D9 · YouTube já congelado: o automático não tira outra fotografia e não chama de pendência", () => {
  const automatico = radarProfileAutoFinalizeDecision({
    payload: { youtubeSearch: corridaYoutube(), supportResearch: apoioColetado, youtubeFrozenInvestigation: { finalizedAt: "2026-10-02T13:00:00.000Z", run: corridaYoutube() } },
    profile: "YOUTUBE",
  });
  assert.deepEqual({ next: automatico.next, pending: automatico.pending }, { next: null, pending: false });
});

/* ======================= D9 · Amazon ======================= */

test("D9 · Amazon: coleta OK → analisar; análise OK → congelar; apoio falho → nada", () => {
  const coletada = radarProfileAutoFinalizeDecision({ payload: { amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("READY", "COLLECTED") }, profile: "AMAZON" });
  assert.equal(coletada.next, "ANALYZE", "a análise não tem provider e roda sozinha");

  const analisada = radarProfileAutoFinalizeDecision({ payload: { amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("READY", "COLLECTED"), amazonBlueprint: { profile: "AMAZON" } }, profile: "AMAZON" });
  assert.equal(analisada.next, "FINALIZE");

  const apoioFalhou = radarProfileAutoFinalizeDecision({ payload: { amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("PARTIAL_SUPPORT_FAILED", "FAILED") }, profile: "AMAZON" });
  assert.deepEqual({ next: apoioFalhou.next, pending: apoioFalhou.pending }, { next: null, pending: true });

  const analisadaSemApoio = radarProfileAutoFinalizeDecision({ payload: { amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("PARTIAL_SUPPORT_FAILED", "FAILED"), amazonBlueprint: { profile: "AMAZON" } }, profile: "AMAZON" });
  assert.equal(analisadaSemApoio.next, null, "a análise sem apoio pede decisão humana para congelar");
  assert.match(analisadaSemApoio.reason, /apoio do Google/);

  const consultaFalhou = radarProfileAutoFinalizeDecision({ payload: { amazonSearch: corridaAmazon({ provenance: { queriesRequested: 2, queriesSucceeded: 1, queriesFailed: 1 } }), researchPackage: pacoteAmazon("READY", "COLLECTED") }, profile: "AMAZON" });
  assert.equal(consultaFalhou.next, null);
});

test("D9 · o perfil Google não passa pela decisão dos acréscimos", () => {
  const google = radarProfileAutoFinalizeDecision({ payload: { serpSnapshotId: "snap-1" }, profile: "GOOGLE" });
  assert.deepEqual({ next: google.next, pending: google.pending }, { next: null, pending: false });
});

/* ======================= D9 · Google ======================= */

const suficiencia = (level: string, headline = "Leitura de mercado") => ({ level, headline, reasons: level === "INSUFFICIENT" ? ["Apenas 1 página comparável."] : [] }) as never;

const leituraGoogle = (entrada: { level?: string; pending?: number; analyzed?: number; failed?: number; auxiliaryFailed?: number } = {}) => {
  const sufic = suficiencia(entrada.level || "SUFFICIENT");
  const phase1 = radarPhase1Action({
    state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 12, pending: entrada.pending ?? 0, failed: entrada.failed ?? 0, analyzed: entrada.analyzed ?? 12,
    analysisConfirmed: true, sufficiency: sufic,
  });
  const finalization = radarFinalizationReadiness({
    started: true, stale: false, alreadyFinalized: false,
    pending: entrada.pending ?? 0, analyzed: entrada.analyzed ?? 12, failed: entrada.failed ?? 0, sufficiency: sufic,
  });
  return radarGoogleAutoFinalizeDecision({ phase1, finalization, sufficiency: sufic, auxiliaryFailed: entrada.auxiliaryFailed ?? 0 });
};

test("D9 · Google finaliza sozinho só quando a autoridade do botão diz pronto e não há pendência", () => {
  assert.equal(leituraGoogle().autoFinalize, true);
  assert.equal(leituraGoogle({ level: "PARTIAL_BUT_USABLE" }).autoFinalize, true, "amostra parcial mas utilizável não é pendência");
  assert.equal(leituraGoogle({ failed: 3 }).autoFinalize, true, "página sem acesso já é limitação declarada, não pendência");

  const insuficiente = leituraGoogle({ level: "INSUFFICIENT" });
  assert.equal(insuficiente.autoFinalize, false, "amostra insuficiente: encerrar é decisão humana");
  assert.match(insuficiente.reason, /insuficiente/);

  const conflito = leituraGoogle({ level: "CONFLICTING_SEARCH_INTENT", });
  assert.equal(conflito.autoFinalize, false, "intenção em conflito pede decisão");

  const auxiliar = leituraGoogle({ auxiliaryFailed: 2 });
  assert.equal(auxiliar.autoFinalize, false);
  assert.match(auxiliar.reason, /2 consulta\(s\) auxiliar/);

  const faltaAnalisar = leituraGoogle({ pending: 2 });
  assert.equal(faltaAnalisar.autoFinalize, false);
  assert.match(faltaAnalisar.reason, /Analisar concorrência/);

  assert.equal(radarGoogleAutoFinalizeDecision({ phase1: null, finalization: null, sufficiency: null }).autoFinalize, false);
});

/* ============== o que a tela diz: custo antes, motivo depois ============== */

test("o botão que dispara a coleta diz que ela também finaliza e o custo da IA", () => {
  assert.equal(RADAR_AUTO_FINALIZE_AI_COST, "+ 1 chamada de IA para organizar o artigo-modelo");
  /* 2026-10-02 · revisão: repetir o apoio também encadeia o automático, e a nota dele diz isso. */
  for (const etapa of ["coleta", "análise", "coleta do apoio"] as const) {
    const nota = radarAutoFinalizeStartNote(etapa);
    assert.ok(nota.includes(RADAR_AUTO_FINALIZE_AI_COST), etapa);
    assert.ok(nota.includes(`a ${etapa} também finaliza a investigação`), etapa);
    assert.match(nota, /Com pendência, nada congela/);
  }
  assert.match(radarAutoFinalizeButtonLabel("Iniciar pesquisa no YouTube"), /^Iniciar pesquisa no YouTube · e finaliza \(\+ 1 chamada de IA\)$/);
  assert.equal(radarFinalizeWithAiLabel("Finalizar investigação"), "Finalizar investigação · inclui 1 chamada de IA");
  assert.equal(
    radarAutoFinalizePendingNotice("O apoio do Google falhou.", "Finalizar investigação"),
    'Não finalizou sozinha: o apoio do Google falhou. Revise e use "Finalizar investigação" quando decidir.',
  );
  assert.match(radarAutoFinalizePendingNotice("SERP sem resultado", "Finalizar pesquisa"), /: SERP sem resultado\. /, "sigla fica como está");

  /* No Google, quem fecha a investigação é a análise: o botão dela diz isso. Id e handler não mudam. */
  const analisar = radarPhase1Action({ state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false, selected: 12, pending: 3, failed: 0, analyzed: 9 });
  const dita = radarPhase1WithAutoFinalize(analisar);
  assert.equal(dita.id, "ANALYZE_COMPETITION");
  assert.match(dita.label, /^Analisar concorrência · e finaliza/);
  assert.ok(dita.info?.includes(RADAR_AUTO_FINALIZE_AI_COST));
  const finalizar = radarPhase1Action({ state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false, selected: 12, pending: 0, failed: 0, analyzed: 12, analysisConfirmed: true });
  assert.deepEqual(radarPhase1WithAutoFinalize(finalizar), finalizar, "o FINALIZE ganha o aviso da IA no painel do artigo-modelo, não aqui");
});

test("a frase da pendência aponta o botão que a tela mostra NAQUELE estado — ou nenhum", () => {
  const projetar = (payload: unknown, profile: "YOUTUBE" | "AMAZON") => radarResearchProfileStateOfAnalysis({ payload, profile });

  assert.equal(radarProfileManualStepLabel(projetar({ youtubeSearch: corridaYoutube(), supportResearch: apoioFalho }, "YOUTUBE")), "Finalizar investigação");
  assert.equal(radarProfileManualStepLabel(projetar({ youtubeSearch: corridaYoutube(), supportResearch: { collectedAt: null, failureReason: null } }, "YOUTUBE")), "Repetir apoio", "apoio preso em pendente: o retry, não um finalizar que não aparece");
  assert.equal(radarProfileManualStepLabel(projetar({ youtubeSearch: corridaYoutube({ state: "COLLECTING", queries: [] }) }, "YOUTUBE")), null, "coleta em curso: nenhum botão resolve");
  assert.equal(radarProfileManualStepLabel(projetar({ amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("READY", "COLLECTED"), amazonBlueprint: { profile: "AMAZON" } }, "AMAZON")), "Finalizar investigação");
  assert.equal(radarProfileManualStepLabel(projetar({ amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("READY", "COLLECTED") }, "AMAZON")), "Analisar pesquisa Amazon");

  assert.equal(radarAutoFinalizePendingNotice("A coleta ainda está em andamento.", null), "Não finalizou sozinha: a coleta ainda está em andamento.");
});

test("o apoio do vídeo preso em pendente depois do START ganha o retry no painel", async () => {
  const painel = semComentarios(await ler("../modules/radar/radar-youtube-search-panel.tsx"));
  const pacote = fatia(painel, "function PacoteDePesquisa", "function BlueprintMultiformato");
  assert.ok(pacote.includes('data-testid="radar-retry-support-pending"'));
  assert.ok(pacote.includes("!busy && pacote.primary.collected && !pacote.primary.running"), "só com a coleta principal pronta e nada em curso");
});

/* ============== o encadeamento: no handler, depois da releitura ============== */

test("YouTube · o fim do START e do repetir apoio encadeiam o congelamento — pela mesma rotina do botão", async () => {
  const fonte = await pagina();

  const start = fatia(fonte, "const startYoutubeSearch = async", "const toggleYoutubeVideo");
  emOrdem(start, [
    "RadarYoutubeSearchRunSchema.parse(corpo.run)",
    "const apoio = await coletarApoioDoGoogle(target, run.runId);",
    "await pipeline.reloadRadarAnalysis(target.articleId);",
    "const automatico = await finalizarYoutubeSemPendencia(target);",
    "setNotice(avisoComDesfechoAutomatico(",
  ]);

  const repetir = fatia(fonte, "const repetirApoioDoGoogle = async", "const pacoteDePesquisa");
  emOrdem(repetir, ["coletarApoioDoGoogle(target, corrida.runId)", "await finalizarYoutubeSemPendencia(target)"]);

  const automatico = fatia(fonte, "const finalizarYoutubeSemPendencia = async", "const resetYoutubeSearch");
  emOrdem(automatico, [
    "await analiseConfirmadaNoServidor(target)",
    "radarProfileAutoFinalizeDecision(leitura)",
    "await congelarInvestigacaoYoutube(target, { run: corrida, base: lida.corrente })",
    "void organizarArtigosModeloDaSerp([target.articleId])",
  ]);
  assert.ok(automatico.includes('profile: "YOUTUBE" as const'));
  assert.equal(/setNotice\(/.test(automatico), false, "devolve o desfecho; quem fecha o handler diz numa frase só");

  /* O botão manual existe e passa pela MESMA rotina; organizar vem depois de gravar. */
  const manual = fatia(fonte, "const finalizeYoutubeInvestigation = async", "const congelarInvestigacaoYoutube = async");
  emOrdem(manual, [
    "const base = await versaoCorrenteNoServidor(target);",
    "const decisao = radarYoutubeFinalizeDecision({",
    "await congelarInvestigacaoYoutube(target, { run: base?.payload.youtubeSearch || run, base });",
    "void organizarArtigosModeloDaSerp([target.articleId]);",
  ]);
  const rotina = fatia(fonte, "const congelarInvestigacaoYoutube = async", "const finalizarYoutubeSemPendencia = async");
  assert.ok(rotina.includes("return gravarYoutube(target, { youtubeFrozenInvestigation: congelada }, entrada.base);"), "a base relida é a base da escrita");
  assert.ok(rotina.includes("multimodalDoArtigo(target, { corrida: entrada.run, registros: serpRecordsAtuaisRef.current })"), "nada do render anterior entra na fotografia");
});

test("Amazon · coleta, repetir apoio e [Analisar] encadeiam o automático depois de devolver a posse", async () => {
  const fonte = await pagina();
  for (const [inicio, fim, marco] of [
    ["const startAmazonSearch = async", "const retryAmazonSupport", "if (coletaConcluida !== null) await finalizarAmazonSemPendencia(target, coletaConcluida);"],
    ["const retryAmazonSupport = async", "const pedirAcaoAmazonSemProvider", "if (apoioConcluido !== null) await finalizarAmazonSemPendencia(target, apoioConcluido);"],
    ["const acaoAmazonSemProvider = async", "const resetAmazonSearch", 'if (action === "analyze") await finalizarAmazonSemPendencia(target, confirmada.headline);'],
  ] as const) {
    const corpo = fatia(fonte, inicio, fim);
    emOrdem(corpo, ["} finally {", "amazonEmVoo.current = null;", marco]);
  }

  const encadeamento = fatia(fonte, "const finalizarAmazonSemPendencia = async", "const acaoAmazonSemProvider = async");
  emOrdem(encadeamento, [
    "if (amazonEmVoo.current) return;",
    "await analiseConfirmadaNoServidor(target)",
    "radarProfileAutoFinalizeDecision(leitura)",
    'pedirAcaoAmazonSemProvider(target, "analyze"',
    'pedirAcaoAmazonSemProvider(target, "finalize"',
    "if (desfecho.congelou) void organizarArtigosModeloDaSerp([target.articleId]);",
  ]);

  /* O [Finalizar] manual organiza só quando congelou de verdade — o "já estava" idempotente não paga IA. */
  const manual = fatia(fonte, "const acaoAmazonSemProvider = async", "const resetAmazonSearch");
  assert.ok(manual.includes('congelou: action === "finalize" && !corpo.alreadyFrozen'));
  assert.ok(manual.includes("else if (confirmada.congelou) void organizarArtigosModeloDaSerp([target.articleId]);"));
});

test("Google · o fim da análise relê o servidor e congela pela mesma rotina do botão", async () => {
  const fonte = await pagina();
  const analise = fatia(fonte, "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");
  emOrdem(analise, [
    "const salvo = await pipeline.saveRadarAnalysis(target.articleId, next, {",
    'if (salvo.persistenceMode === "remote" && salvo.readbackConfirmed) analiseConfirmada =',
    'releaseSerpAction(target.articleId, "extract")',
    "if (analiseConfirmada) await finalizarGoogleSemPendencia(target, analiseConfirmada);",
  ]);

  const automatico = fatia(fonte, "const finalizarGoogleSemPendencia = async", "const confirmResearchCuration = async");
  emOrdem(automatico, [
    "await analiseConfirmadaNoServidor(target)",
    "const linhaRelida: RadarItem = { ...target, analysisVersions: lida.analyses };",
    "rowWorkbenchData(linhaRelida)",
    "radarGoogleAutoFinalizeDecision({",
    "await finalizarInvestigacaoGoogle(linhaRelida, dadosRelidos, { antes });",
  ]);

  /* O clique e o automático: um handler fino e uma rotina só, com o readback antes da IA. */
  const manual = fatia(fonte, "const finalizeInvestigation = async () => {", "const finalizarInvestigacaoGoogle = async");
  assert.ok(manual.includes("await finalizarInvestigacaoGoogle(target, data);"));
  const rotina = fatia(fonte, "const finalizarInvestigacaoGoogle = async", "const finalizarGoogleSemPendencia = async");
  emOrdem(rotina, [
    "freezeRadarEvidenceBundle({",
    "const gravado = await pipeline.saveRadarAnalysis(target.articleId, next, { requireRemote: true });",
    'if (desfecho.status === "SUCCEEDED") void organizarArtigosModeloDaSerp([target.articleId]);',
  ]);
});

test("nenhum efeito de render congela ou chama a IA — abrir a tela não finaliza nada", async () => {
  const fonte = await pagina();
  const efeitos = fonte.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || [];
  assert.ok(efeitos.length > 0);
  for (const efeito of efeitos) {
    assert.equal(/finaliz|congelar|organizar|SemPendencia/i.test(efeito), false, efeito.slice(0, 160));
  }
});

/* ============== DEFEITO 2 · a trava lida agora, e o 409 dito ============== */

test("DEFEITO 2 · a gravação do apoio declara a trava da leitura e não engole a falha", async () => {
  const fonte = await pagina();

  const leitura = fatia(fonte, "const versaoCorrenteNoServidor = useCallback", "const analiseConfirmadaNoServidor");
  assert.ok(leitura.includes("LOCK_DA_LEITURA_REMOTA.set(escolhida, remoto.lockVersion)"), "a trava viaja com o objeto lido");

  const gravacao = fatia(fonte, "const gravarYoutube = useCallback", "const reloadVideoLibrary");
  emOrdem(gravacao, [
    "const travaLida = base ? LOCK_DA_LEITURA_REMOTA.get(base) : undefined;",
    'await pipeline.saveRadarAnalysis(row.articleId, proxima, typeof travaLida === "number" ? { expectedLock: travaLida } : undefined);',
  ]);

  const apoio = fatia(fonte, "const coletarApoioDoGoogle = async", "const repetirApoioDoGoogle");
  assert.equal(apoio.includes(".catch(() => {})"), false, "o 409 não some mais em silêncio");
  assert.equal((apoio.match(/\.catch\(avisarApoioNaoGravado\)/g) || []).length, 2, "os dois caminhos que não derrubam a principal avisam");
  assert.equal((apoio.match(/await versaoCorrenteNoServidor\(target\)\)/g) || []).length, 3, "e os três partem da versão lida do servidor");

  /* O aviso chega à tela pelo handler que fecha a coleta. */
  const start = fatia(fonte, "const startYoutubeSearch = async", "const toggleYoutubeVideo");
  assert.ok(start.includes("apoioNaoGravadoRef.current?.articleId === target.articleId"));
});

/* ============== os painéis: o custo antes, o motivo depois, o manual sempre ============== */

test("os painéis dizem o automático e mantêm o botão manual", async () => {
  const youtube = semComentarios(await ler("../modules/radar/radar-youtube-search-panel.tsx"));
  assert.ok(youtube.includes("radarAutoFinalizeButtonLabel(run ? \"Nova coleta\" : radarResearchProfilePlan(pacote.profile).startLabel)"));
  assert.ok(youtube.includes('data-testid="radar-youtube-auto-finalize-pending"'));
  assert.ok(youtube.includes('data-testid="radar-youtube-auto-finalize-note"'));
  assert.ok(youtube.includes('data-testid="radar-youtube-finalize"'), "o botão manual continua");
  assert.ok(youtube.includes('radarFinalizeWithAiLabel("Finalizar investigação")'));

  const amazon = semComentarios(await ler("../modules/radar/radar-amazon-search-panel.tsx"));
  assert.ok(amazon.includes("radarAutoFinalizeButtonLabel("));
  assert.ok(amazon.includes('data-testid="radar-amazon-auto-finalize-pending"'));
  assert.ok(amazon.includes('data-testid="radar-amazon-finalize"'), "o botão manual continua");
  assert.ok(amazon.includes('radarFinalizeWithAiLabel("Finalizar investigação")'));

  /* A pendência do painel é a MESMA decisão do automático, lida do gravado. */
  const fonte = await pagina();
  const pendencia = fatia(fonte, "const pendenciaDoAutomatico = ", "const setupDoArtigo");
  assert.ok(pendencia.includes("radarProfileAutoFinalizeDecision(leitura)"));
  assert.ok(fonte.includes('autoFinalizePending: pendenciaDoAutomatico(activeRadarItem, "AMAZON"),'));
  assert.ok(fonte.includes('autoFinalizePending: pendenciaDoAutomatico(activeRadarItem, "YOUTUBE"),'));

  /* E no Google, o botão de análise diz o custo — o FINALIZE segue com o aviso do artigo-modelo. */
  const bancada = semComentarios(await ler("../modules/radar/radar-r3-workbench.tsx"));
  emOrdem(bancada, ["const resolvida = radarPhase1WithAutoFinalize(daFase1);", "const acao = radarPhase1WithArticleBlueprint(resolvida);"]);
});

/*
 * ====== 2026-10-02 · revisão · TODO BOTÃO QUE LEVA AO AUTOMÁTICO DIZ O CUSTO ======
 *
 * O botão da coleta dizia "e finaliza (+ 1 chamada de IA)"; o [Analisar] da
 * Amazon e os dois retries do apoio (YouTube e Amazon) encadeavam o mesmo
 * congelamento e a mesma IA sem dizer nada antes do clique (D7: "o botão avisa
 * a chamada de IA"). A lista de botões não é escrita à mão: ela sai da ligação
 * real — o handler que a página entrega a cada callback, a bancada que o
 * repassa com o mesmo nome e o botão do painel que o chama. Um botão novo
 * ligado a um handler que encadeia o automático cai aqui sozinho.
 */
test("todo botão cujo handler leva ao automático ou à IA declara o custo antes do clique", async () => {
  const fonte = await pagina();
  /* O corpo de um handler do componente: da declaração ao fecho com dois espaços. */
  const corpoDe = (nome: string) => {
    const inicio = fonte.indexOf(`const ${nome} = `);
    assert.ok(inicio >= 0, `handler ${nome}`);
    const fim = fonte.indexOf("\n  }", inicio);
    assert.ok(fim > inicio, `fecho de ${nome}`);
    return fonte.slice(inicio, fim);
  };
  const DESTINOS = ["finalizarAmazonSemPendencia(", "finalizarYoutubeSemPendencia(", "organizarArtigosModeloDaSerp("];
  const bancada = semComentarios(await ler("../modules/radar/radar-r3-workbench.tsx"));

  for (const [perfil, deProps, ateProps, arquivoDoPainel, conhecidos] of [
    ["amazonSearch", "amazonSearch={{", "}} youtubeSearch={{", "../modules/radar/radar-amazon-search-panel.tsx", ["onStart", "onRetrySupport", "onAnalyze", "onFinalize"]],
    ["youtubeSearch", "youtubeSearch={{", "}} googleResearch={{", "../modules/radar/radar-youtube-search-panel.tsx", ["onStart", "onRetrySupport", "onFinalize"]],
  ] as const) {
    const props = fatia(fonte, deProps, ateProps);
    const levam = [...props.matchAll(/(on[A-Z]\w*): \(\) => void (\w+)\(/g)]
      .filter(([, , handler]) => DESTINOS.some(destino => corpoDe(handler).includes(destino)))
      .map(([, callback]) => callback);
    /* Os que já se sabe que encadeiam: sem eles a derivação acima teria quebrado em silêncio. */
    for (const conhecido of conhecidos) assert.ok(levam.includes(conhecido), `${perfil}.${conhecido} leva ao automático ou à IA`);

    const painel = semComentarios(await ler(arquivoDoPainel));
    const botoes = painel.match(/<button\b[\s\S]*?<\/button>/g) || [];
    for (const callback of levam) {
      assert.ok(bancada.includes(`${callback}={${perfil}.${callback}}`), `a bancada repassa ${perfil}.${callback} com o mesmo nome`);
      const seus = botoes.filter(botao => botao.includes(`onClick={() => ${callback}?.()}`));
      assert.ok(seus.length > 0, `${perfil}.${callback}: nenhum botão achado — a forma do onClick mudou?`);
      for (const botao of seus) {
        if (callback === "onFinalize") {
          assert.ok(botao.includes("radarFinalizeWithAiLabel("), `${perfil}.${callback}: o finalizar diz a IA\n${botao}`);
          continue;
        }
        assert.ok(botao.includes("radarAutoFinalizeButtonLabel("), `${perfil}.${callback}: o rótulo diz que finaliza e o custo\n${botao}`);
        assert.ok(botao.includes("title={radarAutoFinalizeStartNote("), `${perfil}.${callback}: o title explica antes do clique\n${botao}`);
      }
    }
  }
});

test("o [Analisar] da Amazon diz o que ele faz — não o nome do retry do card", async () => {
  /* Com o apoio falho, a próxima ação RECOMENDADA é repetir o apoio; o botão que analisa continua sendo análise. */
  const projecao = radarResearchProfileStateOfAnalysis({ payload: { amazonSearch: corridaAmazon(), researchPackage: pacoteAmazon("PARTIAL_SUPPORT_FAILED", "FAILED") }, profile: "AMAZON" });
  assert.equal(projecao.nextAction.label, radarProfileActionLabel("RETRY_SUPPORT", "AMAZON"), "a tabela continua recomendando o retry");
  assert.equal(radarProfileActionLabel("ANALYZE_RESEARCH", "AMAZON"), "Analisar pesquisa Amazon");
  assert.equal(radarProfileManualStepLabel(projecao), radarProfileActionLabel("RETRY_SUPPORT", "AMAZON"), "o aviso aponta o retry do card, pelo mesmo nome");

  const painel = semComentarios(await ler("../modules/radar/radar-amazon-search-panel.tsx"));
  const analisar = fatia(painel, "onClick={() => onAnalyze?.()}", "</button>");
  /* §16 continua: o rótulo da projeção, quando a ação recomendada É a análise; o nome da análise, quando não é. */
  assert.ok(
    analisar.includes('radarAutoFinalizeButtonLabel(projecao.nextAction.id === "ANALYZE_RESEARCH" ? projecao.nextAction.label : radarProfileActionLabel("ANALYZE_RESEARCH", projecao.profile))'),
    "com o apoio falho ele se chamava como o retry e analisava",
  );
  const repetir = fatia(painel, "onClick={() => onRetrySupport?.()}", "</button>");
  assert.ok(repetir.includes('radarAutoFinalizeButtonLabel(radarProfileActionLabel("RETRY_SUPPORT", "AMAZON"))'));
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
