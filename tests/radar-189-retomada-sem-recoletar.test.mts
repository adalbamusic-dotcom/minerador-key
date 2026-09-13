import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  radarCanonicalReusePlan, radarResearchResumption, radarResumptionHint,
  type RadarResearchResumption,
} from "../lib/radar/research-resumption.ts";
import { radarPhase1Action, radarPhase1NextAction } from "../lib/radar/serp-phase1.ts";
import { RADAR_OPERATIONAL_STATUS_LABEL, RADAR_OPERATIONAL_STATUS_ORDER, RADAR_OPERATIONAL_STATUS_TONE, radarOperationalStatus } from "../lib/radar/operational-view.ts";
import type { RadarDeepResearchQuery, RadarDeepResearchRecord, RadarQueryEvidence } from "../lib/radar/deep-research.ts";
import type { RadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarSerpView } from "../lib/radar/snapshot-view.ts";
import { radarAnalysisMatchesSerp } from "../lib/radar/serp-curation.ts";

/*
 * ======  RADAR · GATE 18.9 — MATERIALIZAR A SERP RECUPERADA  ============
 *
 * O 18.8 devolveu à tela uma SERP canônica v8 que já estava paga e gravada. E
 * a tela continuou dizendo "Não iniciado".
 *
 * NÃO ERA UM BUG DE PROJEÇÃO. O estado da Fase 1 não mora no snapshot:
 * `radarDeepResearchState` lê `analysis.payload.deepResearch`, e o caminho de
 * recuperação escrevia `workspace.serpRecords` e mais nada. Sem registro, a
 * resposta correta daquela autoridade era mesmo NOT_STARTED — ela estava certa
 * sobre o que lhe deram, e o que lhe deram estava incompleto.
 *
 * A auditoria do §2, em uma tabela:
 *
 *   RECOVERY_WRITES_CANONICAL_SNAPSHOT = YES   (serpRecords + serpReviews)
 *   RECOVERY_WRITES_RESEARCH_UNIVERSE  = DERIVADO (a view monta do snapshot)
 *   RECOVERY_WRITES_QUERY_PLAN         = DERIVADO (do contexto, não gravado)
 *   RECOVERY_WRITES_CURATION           = NO
 *   RECOVERY_WRITES_PHASE_STATE        = NO      ← o defeito
 *
 * E o defeito seguinte, maior: a única ação oferecida era "Iniciar Pesquisa
 * Google", que recoletaria — paga — a SERP que acabara de ser recuperada.
 *
 * O QUE ESTE GATE PROVA:
 *   A     canônica recuperada ⇒ a fase deixa de ser NOT_STARTED
 *   B     e ela é dada como completa por EVIDÊNCIA, não por carimbo
 *   C     faltando 3 auxiliares, a autoridade devolve exatamente 3
 *   D     retomar não consulta o provider para a principal
 *   E     auxiliar já executada não é recoletada
 *   F     tudo resolvido ⇒ nada a coletar
 *   G     o CTA vira "Completar", não "Iniciar" nem "Refazer"
 *   H     o CTA de recuperar some depois do sucesso
 *   I     card, detalhe e planilha leem a MESMA autoridade
 *   J     `needs_review` legado não reintroduz revisão manual
 *   K     falha de localStorage continua sem poder de veto
 *   L     o registro materializado é gravado (é ele que sobrevive ao F5)
 *   M     PROVIDER_CALLS = 0, provado
 *
 * NADA DE VÍDEOS · NADA DE MATCHER · NENHUMA MIGRATION · NENHUMA COLETA.
 */

/* ======================  M · A SENTINELA DE REDE  ====================== */

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
const workbench = () => readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
const contextoDoPipeline = () => readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");

function trecho(fonte: string, de: string, ate: string): string {
  const inicio = fonte.indexOf(de);
  assert.notEqual(inicio, -1, `âncora inicial ausente: ${de}`);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.notEqual(fim, -1, `âncora final ausente: ${ate}`);
  return fonte.slice(inicio, fim);
}

/* ==========================  AS FIXTURES  ============================== */

const evidencia = (snapshotId: string): RadarQueryEvidence => ({
  serpClass: "canonical", snapshotId, collectedAt: "2026-09-11T12:00:00.000Z",
  contentHash: "hash", resultCount: 8, observedIntent: "informacional", results: [],
});

const consulta = (patch: Partial<RadarDeepResearchQuery> & { queryId: string }): RadarDeepResearchQuery => ({
  keywordId: `kw-${patch.queryId}`, keyword: `keyword ${patch.queryId}`, role: "secundaria",
  disposition: "EXECUTE", execution: "PLANNED", serpClass: "auxiliary", evidence: null, reason: "",
  ...patch,
});

const registro = (queries: RadarDeepResearchQuery[]): RadarDeepResearchRecord => ({
  startedAt: "2026-09-11T09:00:00.000Z", startedBy: "ator", primarySearchMode: "WEB",
  fingerprint: { value: "fp" } as RadarDeepResearchRecord["fingerprint"],
  queries, summary: null, researchCuration: null, finalizedAt: null, finalizedBy: null, conclusion: null,
});

/** O cenário real do USER: canônica v8 recuperada, três auxiliares por fazer. */
const canonicaRecuperada = () => registro([
  consulta({ queryId: "q0", role: "principal", serpClass: "canonical", execution: "EXECUTED", evidence: { ...evidencia("7c68012c-3b64-42e8-8ddf-b7730c32da02") } }),
  consulta({ queryId: "q1" }),
  consulta({ queryId: "q2" }),
  consulta({ queryId: "q3", role: "reforco_narrativo" }),
]);

const acaoBase = {
  contextReady: true, hasPrimaryQuery: true, running: false,
  selected: 0, pending: 0, failed: 0, analyzed: 0,
} as const;

/* ==========  A e B · A CANÔNICA RECUPERADA É UM ESTADO REAL  ========== */

test("RADAR 18.9 · A — canônica recuperada deixa de ser 'não iniciado'", () => {
  const semRegistro = radarResearchResumption({ record: null });
  assert.equal(semRegistro.state, "NO_RECORD");
  assert.equal(semRegistro.canonicalComplete, false);

  const recuperada = radarResearchResumption({ record: canonicaRecuperada() });
  assert.equal(recuperada.state, "AUXILIARY_PENDING");
  assert.notEqual(recuperada.state, semRegistro.state, "os dois cenários não podem colapsar no mesmo estado");
  assert.equal(recuperada.canonicalSnapshotId, "7c68012c-3b64-42e8-8ddf-b7730c32da02", "o snapshot que responde pela canônica é nomeado");
});

test("RADAR 18.9 · B — completa é ter EVIDÊNCIA, não carimbo de executada", () => {
  /*
   * `EXECUTED` sem evidência é o que uma rodada escreve quando acha que
   * coletou. Reaproveitar com base nisso seguiria com um universo competitivo
   * sem a SERP do artigo dentro — e o erro só apareceria na análise.
   */
  const carimboVazio = registro([
    consulta({ queryId: "q0", role: "principal", serpClass: "canonical", execution: "EXECUTED", evidence: null }),
    consulta({ queryId: "q1" }),
  ]);
  const resumo = radarResearchResumption({ record: carimboVazio });
  assert.equal(resumo.canonicalComplete, false);
  assert.equal(resumo.state, "CANONICAL_MISSING");

  const comEvidencia = radarResearchResumption({ record: canonicaRecuperada() });
  assert.equal(comEvidencia.canonicalComplete, true);
});

/* ==========  C, E e F · IDENTIDADE POR CONSULTA  ====================== */

test("RADAR 18.9 · C — três auxiliares faltando devolvem exatamente três", () => {
  const resumo = radarResearchResumption({ record: canonicaRecuperada() });
  assert.equal(resumo.auxiliaryTotal, 3);
  assert.equal(resumo.auxiliaryExecuted, 0);
  assert.deepEqual(resumo.auxiliaryPending.map(item => item.queryId), ["q1", "q2", "q3"]);
  assert.deepEqual(resumo.auxiliaryToCollect.map(item => item.queryId), ["q1", "q2", "q3"]);

  /* Consulta DISPENSADA pelo plano não volta para a fila: ela é decisão. */
  const comDispensada = registro([
    consulta({ queryId: "q0", role: "principal", serpClass: "canonical", execution: "EXECUTED", evidence: { ...evidencia("s8") } }),
    consulta({ queryId: "q1" }),
    consulta({ queryId: "qc", disposition: "CONTEXT_ONLY", execution: "NOT_EXECUTED" }),
    consulta({ queryId: "qf", disposition: "REUSE_FORMATION_EVIDENCE", execution: "REUSED_FORMATION_EVIDENCE" }),
  ]);
  const comDispensadaResumo = radarResearchResumption({ record: comDispensada });
  assert.equal(comDispensadaResumo.auxiliaryTotal, 1, "só as EXECUTE contam como auxiliares do plano");
  assert.deepEqual(comDispensadaResumo.auxiliaryToCollect.map(item => item.queryId), ["q1"]);
});

test("RADAR 18.9 · E — auxiliar já executada não volta para a fila; a que falhou volta", () => {
  const parcial = registro([
    consulta({ queryId: "q0", role: "principal", serpClass: "canonical", execution: "EXECUTED", evidence: { ...evidencia("s8") } }),
    consulta({ queryId: "q1", execution: "EXECUTED", evidence: { ...evidencia("aux-1"), serpClass: "auxiliary" } }),
    consulta({ queryId: "q2" }),
    consulta({ queryId: "q3", execution: "NOT_EXECUTED", reason: "A coleta auxiliar desta keyword não foi concluída: timeout" }),
  ]);
  const resumo = radarResearchResumption({ record: parcial });

  assert.equal(resumo.auxiliaryExecuted, 1);
  assert.deepEqual(resumo.auxiliaryPending.map(item => item.queryId), ["q2"], "pendente é a nunca tentada");
  assert.deepEqual(resumo.auxiliaryFailed.map(item => item.queryId), ["q3"], "falhada é a tentada sem evidência");
  assert.deepEqual(resumo.auxiliaryToCollect.map(item => item.queryId), ["q2", "q3"], "a retomada tenta as duas");
  assert.equal(resumo.auxiliaryToCollect.some(item => item.queryId === "q1"), false, "IDEMPOTENTE: não se paga duas vezes pela mesma consulta");

  /*
   * E A FALHADA NÃO PRENDE O CTA.
   *
   * Se ela contasse como pendente, uma keyword que o provider recusa por
   * motivo permanente deixaria a Fase 1 presa em "Completar" para sempre.
   */
  const soFalhadas = registro([
    consulta({ queryId: "q0", role: "principal", serpClass: "canonical", execution: "EXECUTED", evidence: { ...evidencia("s8") } }),
    consulta({ queryId: "q1", execution: "NOT_EXECUTED", reason: "falhou" }),
  ]);
  const acao = radarPhase1Action({ ...acaoBase, state: "AWAITING_REVIEW", resumption: radarResearchResumption({ record: soFalhadas }) });
  assert.notEqual(acao.label, "Completar Pesquisa Google", "falha permanente não tranca a fase");
});

test("RADAR 18.9 · F — com tudo resolvido, não há nada a coletar", () => {
  const completo = registro([
    consulta({ queryId: "q0", role: "principal", serpClass: "canonical", execution: "EXECUTED", evidence: { ...evidencia("s8") } }),
    consulta({ queryId: "q1", execution: "EXECUTED", evidence: { ...evidencia("aux-1"), serpClass: "auxiliary" } }),
    consulta({ queryId: "q2", execution: "EXECUTED", evidence: { ...evidencia("aux-2"), serpClass: "auxiliary" } }),
  ]);
  const resumo = radarResearchResumption({ record: completo });
  assert.equal(resumo.state, "ALL_QUERIES_SETTLED");
  assert.deepEqual(resumo.auxiliaryToCollect, [], "PROVIDER_CALLS_ON_RESUME = 0");
  assert.equal(radarResumptionHint(resumo), null, "nada a completar, nada a dizer");
});

/* ==========  D · A CANÔNICA NÃO É CONSULTADA DE NOVO  ================= */

test("RADAR 18.9 · D — a decisão de reaproveitar é domínio, e ela recusa por motivo", () => {
  const recuperada = radarResearchResumption({ record: canonicaRecuperada() });

  const reaproveita = radarCanonicalReusePlan({ resumption: recuperada, hasPersistedRecord: true, hasCanonicalSnapshot: true });
  assert.equal(reaproveita.reuse, true);
  assert.match(reaproveita.reason, /provider não é consultado para a principal/);

  /* As três recusas são distintas — colapsá-las esconderia qual delas ocorreu. */
  const semEvidencia = radarCanonicalReusePlan({ resumption: { canonicalComplete: false }, hasPersistedRecord: true, hasCanonicalSnapshot: true });
  const semRegistro = radarCanonicalReusePlan({ resumption: recuperada, hasPersistedRecord: false, hasCanonicalSnapshot: true });
  const semSnapshot = radarCanonicalReusePlan({ resumption: recuperada, hasPersistedRecord: true, hasCanonicalSnapshot: false });
  for (const recusa of [semEvidencia, semRegistro, semSnapshot]) assert.equal(recusa.reuse, false);
  assert.equal(new Set([semEvidencia.reason, semRegistro.reason, semSnapshot.reason]).size, 3);
  assert.match(semRegistro.reason, /apagaria as auxiliares já executadas/, "recomeçar do zero é o que se está evitando");

  /*
   * E A TELA CONSULTA ESSA DECISÃO — o `collect` da canônica fica atrás dela.
   *
   * Fatia do procedimento do START: `await collect(target)` só pode existir no
   * ramo em que o reaproveitamento foi RECUSADO.
   */
  const rodada = trecho(pagina(), "const rodadaDePesquisaProfunda = async () => {", "const recuperarPesquisaPaga = async () => {");
  assert.match(rodada, /radarCanonicalReusePlan\(\{/, "a decisão vem do domínio");
  /*
   * A PONTE É PARTE DA GARANTIA.
   *
   * Testar `radarCanonicalReusePlan` prova a decisão; não prova que o handler
   * a OBEDECE. Trocar `planoDeReaproveitamento.reuse` por um literal deixaria
   * todo o domínio verde e a canônica sendo recoletada — paga — em runtime. É
   * a única linha do fluxo que separa retomar de recobrar, e ela é fixada.
   */
  assert.match(rodada, /const reaproveitarCanonica = planoDeReaproveitamento\.reuse;/, "o handler usa a decisão do domínio, não um literal");
  assert.match(rodada, /hasPersistedRecord: Boolean\(registroAnterior\)/);
  assert.match(rodada, /hasCanonicalSnapshot: Boolean\(data\.latestSerpRecord\?\.research\)/);
  assert.equal((rodada.match(/await collect\(target\)/g) || []).length, 1, "uma só coleta canônica no procedimento");
  const ramoDeReuso = trecho(rodada, "if (reaproveitarCanonica) {", "if (!research) return;");
  const [reaproveita_, coleta] = ramoDeReuso.split("} else {");
  assert.equal(/await collect\(target\)/.test(reaproveita_), false, "CANONICAL_PROVIDER_CALLS_ON_RESUME = 0");
  assert.match(coleta, /await collect\(target\)/, "e quando falta, ela é coletada de verdade");
});

/* ==========  G · O CTA DIZ COMPLETAR, NÃO INICIAR NEM REFAZER  ======== */

test("RADAR 18.9 · G — depois da recuperação a ação é completar, e ela não paga a principal", () => {
  const recuperada = radarResearchResumption({ record: canonicaRecuperada() });
  const acao = radarPhase1Action({ ...acaoBase, state: "AWAITING_REVIEW", resumption: recuperada });

  assert.equal(acao.label, "Completar Pesquisa Google");
  assert.equal(acao.id, "START_RESEARCH", "o handler canônico não muda com o rótulo");
  assert.equal(acao.enabled, true);

  /* O que o rótulo antigo prometia — e por que cada um estava errado. */
  assert.notEqual(acao.label, "Iniciar Pesquisa Google", "não é começar: a principal já existe");
  assert.notEqual(acao.label, "Refazer Pesquisa Google", "e refazer recoletaria, paga, a que foi recuperada");

  assert.match(acao.hint!, /SERP principal já coletada/);
  assert.match(acao.hint!, /3 consulta\(s\) auxiliar\(es\) a executar/);
  assert.ok(acao.info, "a explicação é obrigatória nesta ação");
  assert.match(acao.info!, /NÃO a consulta de novo/);
  assert.match(acao.info!, /somente as consultas auxiliares/);
  /* §7: sem número fixo no ⓘ — o plano varia por artigo. */
  assert.equal(/\b3 consultas auxiliares\b|\bquatro consultas\b/.test(acao.info!), false, "o ⓘ não promete um número fixo");

  /* Com YouTube o destino acompanha; com uma auxiliar só, o plural acompanha. */
  const youtube = radarPhase1Action({ ...acaoBase, state: "AWAITING_REVIEW", resumption: recuperada, mode: "YOUTUBE" });
  assert.equal(youtube.label, "Completar Pesquisa YouTube");

  /*
   * SEM A PRINCIPAL NÃO HÁ O QUE COMPLETAR.
   *
   * Se o ramo olhasse só as auxiliares pendentes, um registro cuja consulta
   * central nunca produziu SERP ofereceria "Completar" — e a retomada seguiria
   * montando o universo sem a SERP do artigo dentro.
   */
  const semCanonica = radarPhase1Action({
    ...acaoBase, state: "AWAITING_REVIEW",
    resumption: radarResearchResumption({ record: registro([
      consulta({ queryId: "q0", role: "principal", serpClass: "canonical" }),
      consulta({ queryId: "q1" }),
    ]) }),
  });
  assert.notEqual(semCanonica.label, "Completar Pesquisa Google");

  /* E a coluna da planilha fala a mesma frase. */
  assert.equal(radarPhase1NextAction(acao), "Completar Pesquisa Google");
});

/* ==========  I · UMA AUTORIDADE, QUATRO CONSUMIDORES  ================= */

const vistaFake = (resumption: RadarResearchResumption, phase1: ReturnType<typeof radarPhase1Action>): RadarDeepResearchView => ({
  state: "AWAITING_REVIEW",
  resumption,
  phase1,
  /* 18.10.1: a projeção passou a ler também o que o banco já guardou. */
  persistence: { state: "NO_ANALYSIS", extractions: 0, verifiedSources: 0, missing: [], reason: "" },
  observed: { sufficiency: { level: "GOOD" }, sample: { comparablePages: 0, uniqueReferences: 8, analyzedSuccess: 0, failedFinal: 0, queriesExecuted: 1 } },
  summary: { articleKeywords: 4, queriesExecuted: 1, queriesPlanned: 4 },
  finalizedBundle: null,
} as unknown as RadarDeepResearchView);

test("RADAR 18.9 · I — card, detalhe e planilha não podem discordar do banco", () => {
  const recuperada = radarResearchResumption({ record: canonicaRecuperada() });
  const acao = radarPhase1Action({ ...acaoBase, state: "AWAITING_REVIEW", resumption: recuperada });
  const estado = radarOperationalStatus({ view: vistaFake(recuperada, acao) });

  assert.equal(estado.status, "RESEARCH_INCOMPLETE");
  assert.equal(estado.label, "Pesquisa incompleta");
  assert.notEqual(estado.status, "NOT_STARTED", "a contradição que o USER viu não pode voltar");
  /*
   * E NÃO PODE DIZER "PRONTO" TAMPOUCO.
   *
   * A suficiência desta fixture é GOOD: antes deste gate, o card cairia em
   * "Pronto" ao lado de um botão escrito "Completar Pesquisa Google".
   */
  assert.notEqual(estado.status, "READY");
  assert.notEqual(estado.status, "READY_TO_ANALYZE");

  /* O estado novo é reconhecido pelas três tabelas que a tela consulta. */
  assert.ok(RADAR_OPERATIONAL_STATUS_LABEL.RESEARCH_INCOMPLETE);
  assert.equal(RADAR_OPERATIONAL_STATUS_TONE.RESEARCH_INCOMPLETE, "pending", "trabalho aberto não é erro nem conclusão");
  /*
   * A ORDEM INTEIRA, FIXADA.
   *
   * "Depois de NOT_STARTED e antes de READY_TO_ANALYZE" deixava três posições
   * livres, e a asserção passava verde com o estado em qualquer uma delas —
   * inclusive depois de "Pesquisando", que descreve algo em execução. A ordem
   * é decisão de produto sobre o ciclo; ela é declarada por inteiro ou não é
   * declarada.
   */
  assert.deepEqual([...RADAR_OPERATIONAL_STATUS_ORDER], [
    "NOT_STARTED", "RESEARCH_INCOMPLETE", "RESEARCHING", "READY_TO_ANALYZE",
    "ANALYZING", "ANALYSIS_INCOMPLETE", "PARTIAL", "READY", "FINALIZED", "ATTENTION",
  ]);

  /* Card e planilha leem a MESMA view — nenhuma delas recalcula o estado. */
  const fonte = pagina();
  assert.equal(/radarDeepResearchState\(/.test(fonte), false, "a tela não recalcula o estado por fora da view");
});

/* ==========  H · O CTA DE RECUPERAR SOME DEPOIS DO SUCESSO  =========== */

test("RADAR 18.9 · H — recuperar não é oferecido duas vezes para o mesmo snapshot", () => {
  const fonte = workbench();
  const componente = trecho(fonte, "function RecoverSerpAction(", "function Phase1Slot(");

  /*
   * A condição é o estado da investigação, e é ela que faz o botão sumir: com
   * a canônica materializada a fase deixa de ser NOT_STARTED, e este CTA sai
   * da tela sem precisar de uma segunda regra para escondê-lo.
   */
  assert.match(componente, /view\.state !== "NOT_STARTED"/);

  /* E a materialização é o que muda esse estado — a corrente inteira. */
  const recuperar = trecho(pagina(), "const recuperarPesquisaPaga = async () => {", "const finalizeInvestigation = async () => {");
  assert.match(recuperar, /settleRadarDeepResearchQuery\(base, investigacao\.plan\.primary\.queryId/);
  assert.match(recuperar, /execution: "EXECUTED"/);
  assert.match(recuperar, /evidence: radarQueryEvidenceFrom\(\{ serpClass: "canonical", research \}\)/);
  assert.match(recuperar, /if \(investigacao\.resumption\.canonicalComplete\) \{ setNotice\(resultado\.reason\); return; \}/, "materializar duas vezes não reescreve a versão");
});

/* ==========  L · O QUE SOBREVIVE AO F5 É O QUE FOI GRAVADO  =========== */

test("RADAR 18.9 · L — a materialização é persistida, e preserva o que já existia", () => {
  const recuperar = trecho(pagina(), "const recuperarPesquisaPaga = async () => {", "const finalizeInvestigation = async () => {");

  assert.match(recuperar, /await persistSerpAnalysis\(target\.articleId, next,/, "sem gravar, o F5 devolveria 'Não iniciado' de novo");
  assert.match(recuperar, /await curationVersionFor\(target, data\.article, research, registro\)/, "a versão nasce sobre o snapshot recuperado");
  assert.match(recuperar, /claimSerpAction\(\{ articleId: target\.articleId, kind: "start" \}\)/, "a escrita respeita o guarda de ação");

  /*
   * REGISTRO EXISTENTE É PRESERVADO.
   *
   * Sobrescrever com um `startRadarDeepResearch` faria todas as auxiliares
   * voltarem a PLANNED — e a próxima retomada recoletaria o que já foi pago.
   */
  assert.match(recuperar, /const base = investigacao\.record\s*\r?\n?\s*\|\| startRadarDeepResearch\(/);

  /* A rodada também preserva: ela só começa do zero quando não reaproveita. */
  const rodada = trecho(pagina(), "const rodadaDePesquisaProfunda = async () => {", "const recuperarPesquisaPaga = async () => {");
  assert.match(rodada, /reaproveitarCanonica && registroAnterior\s*\r?\n?\s*\? registroAnterior/);
  assert.match(rodada, /radarResearchResumption\(\{ record: registro \}\)\.auxiliaryToCollect/, "a fila sai da autoridade, não de um filtro local");
});

/* ==========  J · O LEGADO NÃO VOLTA  ================================== */

test("RADAR 18.9 · J — snapshot legado em needs_review não reintroduz revisão manual", () => {
  /*
   * A VARREDURA É SOBRE O QUE RENDERIZA, NÃO SOBRE O QUE EXPLICA.
   *
   * O comentário do módulo LISTA as ações do workflow antigo justamente para
   * dizer que elas saíram. Casar com ele reprovaria o código correto — e o
   * conserto óbvio (apagar o comentário) tornaria o arquivo pior.
   */
  const fonte = workbench().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  /* Gate 15.3 continua vigente: nenhuma das ações do workflow antigo voltou. */
  for (const proibido of ["Aprovar SERP", "Rejeitar SERP", "Continuar para Análise", "Analisar páginas pendentes"]) {
    assert.equal(fonte.includes(proibido), false, `"${proibido}" pertence ao workflow legado`);
  }
  /* A varredura precisa continuar enxergando o que existe de verdade. */
  assert.match(fonte, /data-testid="radar-deep-research-button"/, "a fonte sem comentários ainda é a fonte");
  assert.equal(/RadarR3SerpPanel/.test(fonte), false, "LEGACY_WORKFLOW_VISIBLE = NO");

  /*
   * E a retomada não olha `status` do snapshot para decidir nada.
   *
   * `needs_review` é carimbo do snapshot canônico legado. Se ele governasse a
   * Fase 1, uma SERP recuperada exigiria aprovação manual — reintroduzindo
   * pela porta dos fundos o fluxo que o Gate 15.3 removeu.
   */
  const autoridade = readFileSync(new URL("../lib/radar/research-resumption.ts", import.meta.url), "utf8");
  assert.equal(/needs_review|reviewStatus|approved/.test(autoridade), false, "a retomada não depende de revisão manual");
});

/* ==========  K · O CACHE CONTINUA SEM PODER DE VETO  ================== */

test("RADAR 18.9 · K — falha de localStorage não bloqueia a retomada", () => {
  const fonte = contextoDoPipeline();

  /* A garantia do 18.8 continua de pé, agora também no caminho da recuperação. */
  assert.equal(/!saveLocalSerpRecovery\(/.test(fonte), false);
  assert.equal(/recuperação local não pôde ser salva/.test(fonte), false);

  /* E `recoverSerp` escreve no estado remoto-confirmado, não no cache. */
  const recuperar = trecho(fonte, "recoverSerp: async (articleId) => {", "reviewSerp: async (articleId");
  assert.match(recuperar, /serpPersistenceMode: "server"/, "o que voltou do banco é estado de servidor");
  assert.match(recuperar, /localRecoveryWarning: null/, "e limpa o aviso do navegador, que já não descreve nada");
  assert.equal(/saveLocalSerpRecovery|throw new Error\("A recupera/.test(recuperar), false, "LOCAL_RECOVERY_CAN_VETO_REMOTE = NO");
});

/* ==========  N · O ELO QUE DECIDE O SMOKE INTEIRO  =================== */

test("RADAR 18.9 · N — a versão materializada casa com o snapshot recuperado", () => {
  /*
   * O PORTÃO SILENCIOSO.
   *
   * `rowWorkbenchData` só entrega a versão de análise à tela se
   * `radarAnalysisMatchesSerp` disser que ela pertence ao snapshot corrente.
   * Quando não casa, `analysis` vira `null`, a view recebe `record: null` e a
   * fase volta a ser NOT_STARTED — sem erro, sem aviso, exatamente com a cara
   * do defeito que este gate corrigiu. Materializar e não casar seria pior do
   * que não materializar: o registro estaria gravado e invisível.
   *
   * O vínculo são três campos, e os três saem do MESMO snapshot recuperado.
   */
  const research = {
    id: "7c68012c-3b64-42e8-8ddf-b7730c32da02",
    version: 8,
    contentHash: "sha256:" + "b".repeat(64),
    query: "skincare para pele oleosa",
    brandId: "b", articleId: "a", articleDnaVersionId: "dna-188",
    provider: "dataforseo", collectedAt: "2026-09-11T12:00:00.000Z",
    organicResults: Array.from({ length: 8 }, (_, indice) => ({
      position: indice + 1, title: `Resultado ${indice + 1}`, url: `https://exemplo-${indice + 1}.com/p`,
      domain: `exemplo-${indice + 1}.com`, snippet: "trecho", inferredType: "other", isOwnDomain: false,
    })),
    peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
    diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], possibleConflicts: [], limitations: [], questions: [], opportunities: [], recurringTitlePatterns: [] },
  };
  /* O registro recuperado, como `parseStoredSerpSnapshotPayload` o devolve. */
  const registroSerp = {
    id: research.id, origin: "real", isMock: false, provider: "dataforseo",
    input: { keyword: research.query, articleId: "a", location: "Brasil", language: "pt-BR", device: "desktop" },
    snapshot: null, research, persistenceMode: "remote", cost: null, error: null,
  } as unknown as Parameters<typeof buildRadarSerpView>[0];

  const vista = buildRadarSerpView(registroSerp);

  /*
   * A INVARIANTE QUE SUSTENTA TUDO: o id do registro é o id da pesquisa.
   *
   * Se o payload gravado divergisse nisso, o vínculo quebraria mesmo com a
   * fábrica correta — e a quebra seria invisível.
   */
  assert.equal(vista.record.id, research.id, "o registro recuperado e a pesquisa compartilham o id");
  assert.equal(vista.version, research.version);
  assert.equal(vista.hash, research.contentHash);
  assert.ok(vista.hash, "sem hash o vínculo é recusado antes de comparar qualquer coisa");

  /* A fábrica copia exatamente esses três campos — fixado na fonte. */
  const contratos = readFileSync(new URL("../lib/radar/analysis-contracts.ts", import.meta.url), "utf8");
  assert.match(contratos, /serpSnapshotId: input\.research\.id,/);
  assert.match(contratos, /serpSnapshotVersion: input\.research\.version,/);
  assert.match(contratos, /serpSnapshotHash: input\.research\.contentHash,/);

  /* E com eles, o portão deixa a versão materializada chegar à tela. */
  const materializada = {
    payload: {
      brandId: "b", articleId: "a", articleDnaVersionId: "dna-188",
      serpSnapshotId: research.id, serpSnapshotVersion: research.version, serpSnapshotHash: research.contentHash,
    },
  } as unknown as Parameters<typeof radarAnalysisMatchesSerp>[0]["analysis"];

  assert.equal(radarAnalysisMatchesSerp({
    analysis: materializada, brandId: "b", articleId: "a", articleDnaVersionId: "dna-188", view: vista,
  }), true, "PHASE_AFTER_RECOVERY depende deste vínculo");

  /* E ele recusa uma versão de outro snapshot — o portão não é decorativo. */
  const deOutroSnapshot = { payload: { ...(materializada as { payload: Record<string, unknown> }).payload, serpSnapshotId: "outro" } } as typeof materializada;
  assert.equal(radarAnalysisMatchesSerp({
    analysis: deOutroSnapshot, brandId: "b", articleId: "a", articleDnaVersionId: "dna-188", view: vista,
  }), false);
});

/* ==========  M · A CONTA DA REDE  ==================================== */

test("RADAR 18.9 · M — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — tentativas: ${tentativasDeRede.join(", ")}`);
});
