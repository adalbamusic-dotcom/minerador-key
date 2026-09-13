import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  radarAnalysisPersistenceState, radarBundleBelongsToCurrentResearch,
} from "../lib/radar/remote-authority.ts";
import { radarPhase1Action, radarPhase1NextAction } from "../lib/radar/serp-phase1.ts";
import { RADAR_OPERATIONAL_STATUS_LABEL, RADAR_OPERATIONAL_STATUS_TONE, radarOperationalStatus } from "../lib/radar/operational-view.ts";
import type { RadarDeepResearchView } from "../lib/radar/deep-research-view.ts";

/*
 * ======  RADAR · GATE 18.10.1 — RETOMAR A CONSOLIDAÇÃO  ================
 *
 * A auditoria remota fechou a dúvida do 18.10. A v24 está assim no banco:
 *
 *   extractions = 11 · deepResearch = YES
 *   analysisCompletedAt = NULL · verifiedSources = 0
 *   benchmark = NO · competitiveReport = NO · finalizedBundle = NULL
 *
 * Onze páginas lidas, pagas e GRAVADAS. E nenhuma consolidação confirmada.
 *
 * O ciclo não tinha nome para isso. Só sabia perguntar "analisou?" e, ao ouvir
 * não, escolhia entre dois erros caros: oferecer "Analisar concorrência" como
 * se as páginas nunca tivessem sido lidas (relê o que já foi pago), ou travar
 * em "Análise não confirmada · recarregue a página" (deixa o artigo parado com
 * o trabalho preso dentro do banco). O segundo foi o que o USER encontrou.
 *
 * E existe uma armadilha ao lado: a v20, de uma investigação ANTERIOR do mesmo
 * artigo, tem `analysisCompletedAt`, benchmark, relatório e um bundle
 * `bundle:75bd4fc2`. Promovê-la resolveria a tela e descreveria a rodada nova
 * com a fotografia da antiga — e ninguém veria, porque o artigo é o mesmo.
 *
 * SOBRE AS FONTES VERIFICADAS: a rota `verify-sources` NÃO persiste nada. Ela
 * lê a análise gravada, verifica e devolve. As duas verificações do runtime
 * anterior morreram junto com a escrita que nunca foi confirmada — não há
 * autoridade remota de onde recuperá-las.
 *
 * O QUE ESTE GATE PROVA:
 *   A   v24 com 11 páginas e sem carimbo ⇒ ANALYSIS_PARTIALLY_PERSISTED
 *   B   a retomada trabalha sobre as 11 gravadas
 *   C   PAGE_EXTRACTION_CALLS = 0
 *   D   DataForSEO = 0
 *   E   o bundle da v20 não pode ser adotado como atual
 *   F   fontes ausentes ⇒ verifica só as que o plano pedir
 *   G   fontes já gravadas ⇒ reutiliza, zero verificação nova
 *   H   escrita final sem readback ⇒ continua incompleta
 *   I   escrita + readback ⇒ ANALYZED
 *   J   FINALIZE bloqueado antes de I
 *   K   FINALIZE depois de I não reexecuta ANALYZE
 *   L   o F5 reproduz a autoridade remota
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    const alvo = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    tentativasDeRede.push(alvo);
    return Promise.reject(new Error(`REDE PROIBIDA NESTE GATE: ${alvo}`));
  },
  writable: true, configurable: true,
});

const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

function trecho(fonte: string, de: string, ate: string): string {
  const inicio = fonte.indexOf(de);
  assert.notEqual(inicio, -1, `âncora inicial ausente: ${de}`);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.notEqual(fim, -1, `âncora final ausente: ${ate}`);
  return fonte.slice(inicio, fim);
}

/** A v24, exatamente como a auditoria a encontrou. */
const v24 = () => ({
  extractions: Array.from({ length: 11 }, (_, indice) => ({ id: `p${indice}` })),
  verifiedSources: [],
  benchmark: null,
  competitiveReport: null,
  analysisCompletedAt: null,
  finalizedBundle: null,
});

/** A v20: investigação ANTERIOR do mesmo artigo, completa e congelada. */
const v20 = () => ({
  extractions: Array.from({ length: 12 }, (_, indice) => ({ id: `antigo-${indice}` })),
  verifiedSources: [{ id: "s1" }, { id: "s2" }],
  benchmark: { validPageCount: 12 },
  competitiveReport: { observedCompetitiveModel: {} },
  analysisCompletedAt: "2026-09-10T18:00:00.000Z",
  finalizedBundle: { bundleId: "bundle:75bd4fc2", foundationFingerprint: "fp-da-investigacao-antiga" },
});

const acaoBase = {
  contextReady: true, hasPrimaryQuery: true, running: false,
  selected: 16, pending: 0, failed: 5, analyzed: 11,
} as const;

/* ==========  A · O ESTADO QUE FALTAVA  =============================== */

test("RADAR 18.10.1 · A — 11 páginas gravadas sem carimbo é um estado próprio", () => {
  const estado = radarAnalysisPersistenceState({ analysis: v24() });

  assert.equal(estado.state, "ANALYSIS_PARTIALLY_PERSISTED");
  assert.equal(estado.extractions, 11);
  assert.equal(estado.verifiedSources, 0);
  assert.match(estado.reason, /11 página\(s\) já estão gravadas no servidor/);

  /* O que falta é dito por nome — é isso que define o escopo da retomada. */
  assert.deepEqual(estado.missing, ["verificação das fontes", "benchmark", "relatório competitivo", "carimbo de conclusão"]);

  /*
   * E É DIFERENTE DOS TRÊS ESTADOS QUE O §2 PROÍBE.
   *
   * Colapsar em qualquer um deles produz um erro caro: NO_ANALYSIS manda reler
   * páginas pagas; ANALYSIS_CONFIRMED destrava um FINALIZE sobre evidência que
   * não existe; FINALIZED mente sobre o banco.
   */
  const semNada = radarAnalysisPersistenceState({ analysis: { extractions: [], analysisCompletedAt: null } });
  assert.equal(semNada.state, "NO_ANALYSIS");
  assert.equal(radarAnalysisPersistenceState({ analysis: null }).state, "NO_ANALYSIS");

  const carimbada = radarAnalysisPersistenceState({ analysis: { ...v24(), analysisCompletedAt: "2026-09-11T15:00:00.000Z" } });
  assert.equal(carimbada.state, "ANALYSIS_CONFIRMED");
  assert.notEqual(carimbada.state, estado.state);
});

/* ==========  E · A V20 NÃO PODE SER ADOTADA  ========================= */

test("RADAR 18.10.1 · E — bundle de investigação anterior não vira o atual", () => {
  const daInvestigacaoAtual = { fingerprint: { value: "fp-da-investigacao-atual" } };

  const veredito = radarBundleBelongsToCurrentResearch({ bundle: v20().finalizedBundle, record: daInvestigacaoAtual });
  assert.equal(veredito.belongs, false, "OLD_BUNDLE_V20_IGNORED = YES");
  assert.match(veredito.reason, /investigação anterior deste artigo/);

  /* E com esse veredito, a versão antiga NÃO é lida como finalizada. */
  const comoAtual = radarAnalysisPersistenceState({ analysis: v20(), bundleBelongsToCurrentResearch: false });
  assert.notEqual(comoAtual.state, "FINALIZED", "articleId coincidir não é parentesco");

  /* O mesmo fundamento, sim: aí o bundle é desta rodada. */
  const mesmoFundamento = radarBundleBelongsToCurrentResearch({
    bundle: { foundationFingerprint: "fp-da-investigacao-atual" }, record: daInvestigacaoAtual,
  });
  assert.equal(mesmoFundamento.belongs, true);
  assert.equal(radarAnalysisPersistenceState({ analysis: v20(), bundleBelongsToCurrentResearch: true }).state, "FINALIZED");

  /*
   * NA DÚVIDA, NÃO PERTENCE.
   *
   * Um bundle sem fingerprint, ou uma pesquisa sem registro, não provam
   * parentesco — e "não sei" não pode virar "sim" para desbloquear a tela.
   */
  const semFundamentoNoBundle = radarBundleBelongsToCurrentResearch({ bundle: { foundationFingerprint: null }, record: daInvestigacaoAtual });
  const semRegistroNaPesquisa = radarBundleBelongsToCurrentResearch({ bundle: { foundationFingerprint: "fp" }, record: null });
  const semBundle = radarBundleBelongsToCurrentResearch({ bundle: null, record: daInvestigacaoAtual });

  for (const duvidoso of [semFundamentoNoBundle, semRegistroNaPesquisa, semBundle]) {
    assert.equal(duvidoso.belongs, false);
  }

  /*
   * E CADA RECUSA DIZ A SUA CAUSA.
   *
   * As quatro colapsam no mesmo `false` se ninguém olhar o motivo — e aí uma
   * ausência de dado (não sei) fica indistinguível de uma divergência provada
   * (é de outra investigação). Quem lê o log precisa saber qual das duas foi.
   */
  const motivos = [semFundamentoNoBundle.reason, semRegistroNaPesquisa.reason, semBundle.reason, veredito.reason];
  assert.equal(new Set(motivos).size, 4, "quatro recusas, quatro motivos");
  assert.match(semFundamentoNoBundle.reason, /não declara o fundamento/);
  assert.match(semRegistroNaPesquisa.reason, /não tem registro com fundamento/);
  assert.match(semBundle.reason, /Não há bundle congelado/);
});

/* ==========  B, C, D · A RETOMADA NÃO RELÊ NADA  ==================== */

test("RADAR 18.10.1 · B, C e D — a retomada trabalha sobre as páginas já gravadas", () => {
  const fonte = pagina();
  const corpo = trecho(fonte, "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");

  /* A condição de retomada vem da autoridade, não de um palpite local. */
  assert.match(corpo, /const persistencia = data\.deepResearch\?\.persistence;/);
  assert.match(corpo, /const retomandoConsolidacao = persistencia\?\.state === "ANALYSIS_PARTIALLY_PERSISTED";/);

  /*
   * B · O PORTEIRO DEIXA PASSAR SEM CANDIDATO.
   *
   * Era ele que recusava exatamente o caso da v24 — nada a extrair e tudo por
   * consolidar — e devolvia "Nenhuma referência selecionada aguarda análise".
   */
  assert.match(corpo, /if \(!candidates\.length && !retomandoConsolidacao\) \{ setNotice\(/);

  /* C · nenhuma página é lida de novo: a amostra é a versão remota lida do banco. */
  assert.match(corpo, /const remoto = await pipeline\.readRemoteRadarAnalyses\(target\.articleId\);/);
  assert.match(corpo, /versaoDaAmostra = base\.version as RadarAnalysisVersion;/);
  assert.match(corpo, /if \(!pages\.length && !retomandoConsolidacao\) throw new Error/);

  /*
   * E a única chamada de extração continua dentro do laço de lotes, que fica
   * sem fila na retomada. PAGE_EXTRACTION_ON_RETRY = 0.
   */
  assert.equal((corpo.match(/radar-analysis\/extract/g) || []).length, 1, "um só ponto de extração");

  /*
   * A FILA NASCE VAZIA NA RETOMADA — e isto é o que garante o zero.
   *
   * `radarAnalysisCandidates` exclui as páginas EXTRAÍDAS COM SUCESSO, não as
   * que falharam: as 5 "sem acesso" da rodada anterior voltam como candidatas.
   * Sem esta linha, "Concluir análise" as releria — cinco buscas de página
   * contra um ⓘ que promete que nada é coletado de novo.
   */
  assert.match(corpo, /let fila = retomandoConsolidacao \? \[\] : \[\.\.\.candidates\];/, "PAGE_EXTRACTION_ON_RETRY = 0");

  const laco = trecho(corpo, "let fila = retomandoConsolidacao", "if (!pages.length && !retomandoConsolidacao) throw new Error");
  assert.match(laco, /radar-analysis\/extract/, "a extração vive no laço");
  assert.match(laco, /for \(const lote of radarExtractionBatches\(fila\)\)/, "e ela só roda sobre a fila");

  /*
   * E o que ficou de fora é DITO — ficar de fora é decisão, não silêncio.
   *
   * A asserção é sobre a CONDIÇÃO, não sobre as frases: trocar o seletor por
   * um literal deixa os dois textos no arquivo como código morto, e uma
   * varredura que só procurasse as palavras passaria verde sobre uma retomada
   * descrevendo "16 sem desfecho nesta rodada".
   */
  assert.match(corpo, /const conta = retomandoConsolidacao\s*\r?\n\s*\? \[/, "a conta da retomada é escolhida pela condição");
  assert.match(corpo, /candidata\(s\) sem acesso na rodada anterior continuam de fora/);
  assert.match(corpo, /nenhuma página foi lida de novo/);

  /* D · nenhuma coleta de SERP nasce do ANALYZE, retomando ou não. */
  assert.equal(/collectSerp\(|collectAuxiliarySerp|dataforseo/i.test(corpo), false, "SERP_PROVIDER_CALLS = 0");
});

/* ==========  F e G · AS FONTES VERIFICADAS  ========================= */

test("RADAR 18.10.1 · F e G — verifica o que falta, reaproveita o que existe", () => {
  /*
   * G · A AUTORIDADE DIZ O QUE JÁ ESTÁ GRAVADO.
   *
   * Com fontes verificadas no banco, elas contam e saem da lista do que falta.
   */
  const comFontes = radarAnalysisPersistenceState({ analysis: { ...v24(), verifiedSources: [{ id: "s1" }, { id: "s2" }] } });
  assert.equal(comFontes.verifiedSources, 2);
  assert.equal(comFontes.missing.includes("verificação das fontes"), false, "SOURCE_VERIFICATIONS_REUSED");

  /* F · sem fontes gravadas, a verificação entra no escopo da retomada. */
  const semFontes = radarAnalysisPersistenceState({ analysis: v24() });
  assert.ok(semFontes.missing.includes("verificação das fontes"));

  /*
   * E O PLANO É QUEM ESCOLHE QUAIS — não o cliente, e não "todas de novo".
   *
   * A rota resolve cada `sourceId` a partir da análise PERSISTIDA; a tela manda
   * ids que saíram desse plano. Na retomada, a análise persistida é a v24 — as
   * mesmas 11 páginas de onde as fontes foram descobertas.
   */
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");
  assert.match(corpo, /analysisVersionId: versaoDaAmostra\.versionId/);
  assert.match(corpo, /const paginasDaAmostra = versaoDaAmostra\.payload\.extractions;/, "o plano nasce das páginas gravadas");
});

/* ==========  H, I e J · O CARIMBO E O FINALIZE  ===================== */

test("RADAR 18.10.1 · H, I e J — sem readback continua incompleta; com ele, FINALIZE abre", () => {
  /* H · a escrita final sem confirmação não muda o estado remoto. */
  const semCarimbo = radarAnalysisPersistenceState({ analysis: v24() });
  assert.equal(semCarimbo.state, "ANALYSIS_PARTIALLY_PERSISTED");

  /* J · e a Fase 1 não oferece FINALIZE sobre ela. */
  const acaoIncompleta = radarPhase1Action({ ...acaoBase, state: "AWAITING_REVIEW", analysisConfirmed: false, persistedExtractions: 11 });
  assert.notEqual(acaoIncompleta.id, "FINALIZE_SERP", "FINALIZE_BLOCKED_BEFORE_READBACK = YES");
  assert.equal(acaoIncompleta.id, "ANALYZE_COMPETITION");
  assert.equal(acaoIncompleta.label, "Concluir análise");

  /* I · com o carimbo confirmado, e só então, a finalização é oferecida. */
  const acaoConfirmada = radarPhase1Action({ ...acaoBase, state: "AWAITING_REVIEW", analysisConfirmed: true });
  assert.equal(acaoConfirmada.id, "FINALIZE_SERP");
  assert.equal(acaoConfirmada.label, "Finalizar pesquisa");

  /* K · e finalizar não reexecuta o ANALYZE: ele congela o que já existe. */
  /* A fatia é só do FINALIZE: `confirmSerpCuration` é o handler seguinte. */
  const finalizar = trecho(pagina(), "const finalizeInvestigation = async () => {", "const confirmSerpCuration = async");
  assert.equal(/radar-analysis\/extract|verify-sources|collectSerp\(/.test(finalizar), false, "PAGE_EXTRACTION_ON_FINALIZE = 0");
  assert.match(finalizar, /freezeRadarEvidenceBundle\(\{/);
});

/* ==========  O CTA E AS PROJEÇÕES  ================================== */

const vistaFake = (persistenceState: string, phase1: ReturnType<typeof radarPhase1Action>): RadarDeepResearchView => ({
  state: "AWAITING_REVIEW",
  phase1,
  resumption: { canonicalComplete: true, auxiliaryPending: [] },
  persistence: { state: persistenceState, extractions: 11, verifiedSources: 0, missing: [], reason: "" },
  observed: { sufficiency: { level: "GOOD" }, sample: { comparablePages: 11, uniqueReferences: 17, analyzedSuccess: 11, failedFinal: 5, queriesExecuted: 4 } },
  summary: { articleKeywords: 4, queriesExecuted: 4, queriesPlanned: 4 },
  finalizedBundle: null,
} as unknown as RadarDeepResearchView);

test("RADAR 18.10.1 · o CTA diz o escopo, e o card não diz 'pronto para analisar'", () => {
  /*
   * A CONTAGEM VEM DO BANCO, NÃO DA LEITURA VIVA.
   *
   * Os dois números divergem de propósito nesta fixture: a leitura viva enxerga
   * 9 e o servidor guardou 11. Se o rótulo usasse `analyzed`, prometeria menos
   * trabalho salvo do que existe — e a pessoa decidiria refazer com base num
   * número que não é o do banco.
   */
  const acao = radarPhase1Action({ ...acaoBase, analyzed: 9, state: "AWAITING_REVIEW", analysisConfirmed: false, persistedExtractions: 11 });

  assert.equal(acao.label, "Concluir análise");
  assert.match(acao.hint!, /11 página\(s\) já gravadas no servidor/);
  assert.equal(/9 página/.test(acao.hint!), false, "a contagem do render não responde pelo que está gravado");
  assert.match(acao.hint!, /5 sem acesso/);
  assert.ok(acao.info, "a explicação é obrigatória");
  assert.match(acao.info!, /não serão coletadas de novo/);
  assert.match(acao.info!, /Nenhuma consulta ao buscador/);
  assert.match(acao.info!, /Só depois de o servidor confirmar/, "e diz por que FINALIZE ainda não aparece");

  /* Uma ação principal só: o id continua sendo o canônico do ANALYZE. */
  assert.equal(acao.id, "ANALYZE_COMPETITION");
  assert.equal(radarPhase1NextAction(acao), "Concluir análise", "a planilha fala a mesma frase");

  /*
   * E O CARD PARA DE DIZER "PRONTO PARA ANALISAR".
   *
   * A ação é a mesma das duas vezes; o significado, oposto. Onze páginas já
   * lidas e pagas não são "pronto para analisar" — quem lê isso pensa que
   * perdeu o trabalho.
   */
  const estado = radarOperationalStatus({ view: vistaFake("ANALYSIS_PARTIALLY_PERSISTED", acao) });
  assert.equal(estado.status, "ANALYSIS_INCOMPLETE");
  assert.equal(estado.label, "Análise incompleta");
  assert.equal(RADAR_OPERATIONAL_STATUS_TONE.ANALYSIS_INCOMPLETE, "pending");
  assert.equal(RADAR_OPERATIONAL_STATUS_LABEL.ANALYSIS_INCOMPLETE, "Análise incompleta");

  for (const proibido of ["NOT_STARTED", "READY", "FINALIZED", "READY_TO_ANALYZE"]) {
    assert.notEqual(estado.status, proibido, `${proibido} descreveria outra coisa`);
  }

  /* Sem consolidação pendente, o card volta ao caminho normal. */
  const normal = radarOperationalStatus({ view: vistaFake("ANALYSIS_CONFIRMED", radarPhase1Action({ ...acaoBase, state: "AWAITING_REVIEW", analysisConfirmed: true })) });
  assert.notEqual(normal.status, "ANALYSIS_INCOMPLETE");
});

/* ==========  L · O F5 REPRODUZ O BANCO  ============================= */

test("RADAR 18.10.1 · L — a projeção lê o payload persistido, não o estado local", () => {
  const fonte = pagina();

  /* A view recebe o payload REMOTO; é dele que a persistência é derivada. */
  assert.match(fonte, /persistedAnalysis: analysis\?\.payload \|\| null,/);

  /*
   * E `analysis` só existe quando casa com o snapshot corrente — a mesma porta
   * que impede a v20 de responder pela rodada atual, agora reforçada pela
   * guarda de fundamento do bundle.
   */
  assert.match(fonte, /radarAnalysisMatchesSerp\(\{ analysis: latestAnalysis/);
  assert.match(fonte, /const latestAnalysis = row\.analysisVersions\.slice\(\)\.sort\(\(a, b\) => b\.versionNumber - a\.versionNumber\)\[0\] \|\| null;/, "só a última versão responde");

  /*
   * AS PONTES DO DOMÍNIO ATÉ A TELA.
   *
   * `radarBundleBelongsToCurrentResearch` e `persistence.extractions` podem ser
   * provados isoladamente e mesmo assim nunca chegar à projeção: trocar a
   * chamada por um literal (`true`, ou remover a linha) deixa todo o domínio
   * verde e devolve à tela exatamente os dois defeitos deste gate — o bundle da
   * v20 valendo como atual, e o rótulo contando páginas do render em vez das
   * gravadas. As duas ligações são fixadas.
   */
  const view = readFileSync(new URL("../lib/radar/deep-research-view.ts", import.meta.url), "utf8");
  assert.match(view, /bundleBelongsToCurrentResearch: radarBundleBelongsToCurrentResearch\(\{\s*\r?\n\s*bundle: input\.finalizedBundle \|\| null,\s*\r?\n\s*record: record \|\| null,\s*\r?\n\s*\}\)\.belongs,/);
  assert.match(view, /persistedExtractions: persistence\.extractions \|\| undefined,/);
  assert.match(view, /analysis: input\.persistedAnalysis \|\| null,/, "e a persistência é derivada do payload remoto");
});

/* ==========  A CONTA  =============================================== */

test("RADAR 18.10.1 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — tentativas: ${tentativasDeRede.join(", ")}`);
});
