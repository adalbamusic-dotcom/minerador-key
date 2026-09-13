import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  APPROVAL_STATES,
  WORKFLOW_STATUSES,
  APPROVAL_STATE_LABELS,
  WORKFLOW_STATUS_LABELS,
  applyReadyForRadar,
  applyRadarHandoffConfirmed,
  approvalStateOf,
  canSendToRadar,
  planReadyForRadarBatch,
  planReadyInvalidation,
  readReadyBase,
  readyBaseFromClaim,
  readyBaseMatchesCurrent,
  resolveArticleOperationalState,
  sameReadyBase,
  validateReadyForRadarClaims,
  type ArticleOperationalInput,
  type CanonicalApprovalIndex,
  type ReadyForRadarClaim,
} from "../lib/arquiteto/operational-status.ts";
import {
  buildArticleRunReadout,
  formatArticleRunReadout,
  formatArticleSerpReadout,
  serpSourceOf,
  serpVerdictOf,
  type ArticleRunRow,
} from "../lib/arquiteto/process-observability.ts";
import {
  describeRadarReadback,
  verifyRadarHandoffReadback,
} from "../lib/arquiteto/radar-handoff-readback.ts";

const artigoPronto = (over: Partial<ArticleOperationalInput> = {}): ArticleOperationalInput => ({
  articleId: "art-1",
  articleApproval: "APROVADO",
  siloApproval: "APROVADO",
  graphApproval: "APROVADO",
  gateIssues: [],
  ...over,
});

/* ------------------------------------------------------------------ eixos */

test("os dois eixos não compartilham vocabulário: APPROVAL_STATE_IS_WORKFLOW_STATUS = NO", () => {
  const aprovacao = new Set<string>(APPROVAL_STATES);
  const fluxo = new Set<string>(WORKFLOW_STATUSES);
  for (const estado of aprovacao) assert.equal(fluxo.has(estado), false, `${estado} vazou para o eixo operacional`);
  for (const estado of fluxo) assert.equal(aprovacao.has(estado), false, `${estado} vazou para o eixo editorial`);
  // §10: "Pronto para Radar" não pode ser lido como aprovação.
  assert.equal(WORKFLOW_STATUS_LABELS.PRONTO_PARA_RADAR, "Pronto para Radar");
  assert.equal(APPROVAL_STATE_LABELS.APROVADO, "Aprovado");
  assert.notEqual(WORKFLOW_STATUS_LABELS.PRONTO_PARA_RADAR, APPROVAL_STATE_LABELS.APROVADO);
});

test("superseded não responde pela decisão da versão canônica", () => {
  assert.equal(approvalStateOf("approved"), "APROVADO");
  assert.equal(approvalStateOf("rejected"), "REJEITADO");
  assert.equal(approvalStateOf("draft"), "BRUTO");
  assert.equal(approvalStateOf("proposed"), "BRUTO");
  assert.equal(approvalStateOf("superseded"), "BRUTO");
  assert.equal(approvalStateOf(null), "BRUTO");
});

test("§4/§5/§6 — confirmar leva o eixo operacional a CONCLUIDO sem passar por PRONTO_PARA_RADAR", () => {
  const emProcessamento = resolveArticleOperationalState(artigoPronto({ articleApproval: "BRUTO" }));
  assert.equal(emProcessamento.workflowStatus, "EM_PROCESSAMENTO");

  const aguardando = resolveArticleOperationalState(artigoPronto({ articleApproval: "BRUTO", readyToConclude: true }));
  assert.equal(aguardando.workflowStatus, "AGUARDANDO_CONCLUSAO");

  // §5: aprovar o ArticleDNA NÃO torna o item pronto para o Radar.
  const concluido = resolveArticleOperationalState(artigoPronto({ graphApproval: "BRUTO" }));
  assert.equal(concluido.approvalState, "APROVADO");
  assert.equal(concluido.workflowStatus, "CONCLUIDO");
  assert.equal(concluido.canMarkReady, false);
});

test("§9 — artefato REJEITADO nunca avança para PRONTO_PARA_RADAR", () => {
  for (const eixo of ["articleApproval", "siloApproval", "graphApproval"] as const) {
    const estado = resolveArticleOperationalState(artigoPronto({ [eixo]: "REJEITADO", markedReady: true }));
    assert.equal(estado.canMarkReady, false, `${eixo} rejeitado deixou marcar como pronto`);
    assert.notEqual(estado.workflowStatus, "PRONTO_PARA_RADAR");
    assert.ok(estado.blockers.some(motivo => motivo.includes("rejeitado")), estado.blockers.join(" "));
  }
});

test("a recusa distingue 'ainda não' de 'disse não'", () => {
  const pendente = resolveArticleOperationalState(artigoPronto({ graphApproval: "BRUTO" }));
  assert.ok(pendente.blockers.some(motivo => motivo.includes("ainda não foram confirmados")));
  const rejeitado = resolveArticleOperationalState(artigoPronto({ graphApproval: "REJEITADO" }));
  assert.ok(rejeitado.blockers.some(motivo => motivo.includes("está rejeitado")));
});

test("§7 — com os três artefatos aprovados e gates limpos, o item pode ser marcado", () => {
  const estado = resolveArticleOperationalState(artigoPronto({ markedReady: true }));
  assert.equal(estado.canMarkReady, true);
  assert.equal(estado.workflowStatus, "PRONTO_PARA_RADAR");
  // §7: nenhum approval_state muda nesse momento.
  assert.equal(estado.approvalState, "APROVADO");
});

test("gate técnico do Radar bloqueia mesmo com tudo aprovado", () => {
  const estado = resolveArticleOperationalState(artigoPronto({ gateIssues: ["Principal ausente."], markedReady: true }));
  assert.equal(estado.canMarkReady, false);
  assert.equal(estado.workflowStatus, "CONCLUIDO");
  assert.deepEqual(estado.blockers, ["Principal ausente."]);
});

test("§8 — ENVIADO_AO_RADAR só depois do readback confirmado", () => {
  const enviadoSemConfirmar = resolveArticleOperationalState(artigoPronto({ markedReady: true, sentToRadar: true }));
  assert.equal(enviadoSemConfirmar.workflowStatus, "PRONTO_PARA_RADAR");

  const confirmado = resolveArticleOperationalState(artigoPronto({ markedReady: true, sentToRadar: true, handoffConfirmed: true }));
  assert.equal(confirmado.workflowStatus, "ENVIADO_AO_RADAR");
  assert.equal(confirmado.approvalState, "APROVADO");
});

/* ------------------------------------------------------------------ lote */

test("§8 — a ação em lote atende 1, N e todos, nomeando cada recusa", () => {
  const um = planReadyForRadarBatch([artigoPronto({ articleId: "a" })]);
  assert.deepEqual(um.eligible, ["a"]);

  const varios = planReadyForRadarBatch([
    artigoPronto({ articleId: "a" }),
    artigoPronto({ articleId: "b" }),
    artigoPronto({ articleId: "c", graphApproval: "BRUTO" }),
    artigoPronto({ articleId: "d", markedReady: true }),
  ]);
  assert.deepEqual(varios.eligible, ["a", "b"]);
  assert.deepEqual(varios.alreadyReady, ["d"]);
  assert.equal(varios.refused.length, 1);
  assert.equal(varios.refused[0].articleId, "c");
  // Um lote meio bloqueado não pode virar um erro único e mudo.
  assert.ok(varios.refused[0].blockers.length > 0);
});

test("§11 — marcar como pronto só pode tocar o eixo operacional", () => {
  // A assinatura é a prova: entra e sai `WorkflowStatus`, não há artefato por onde passar.
  assert.equal(applyReadyForRadar("CONCLUIDO"), "PRONTO_PARA_RADAR");
  assert.equal(applyReadyForRadar("EM_PROCESSAMENTO"), "PRONTO_PARA_RADAR");
  // Já enviado não regride ao ser remarcado.
  assert.equal(applyReadyForRadar("ENVIADO_AO_RADAR"), "ENVIADO_AO_RADAR");
  assert.equal(applyRadarHandoffConfirmed("PRONTO_PARA_RADAR"), "ENVIADO_AO_RADAR");
  assert.equal(applyRadarHandoffConfirmed("EM_PROCESSAMENTO"), "EM_PROCESSAMENTO");
});

/* ------------------------------------------------------ status remoto */

test("§6 — o status gravado sobrevive ao F5: sem marca de sessão, o remoto responde", () => {
  // Sessão nova: `markedReady` é falso porque ninguém clicou nesta aba.
  const depoisDoF5 = resolveArticleOperationalState(artigoPronto({ persistedStatus: "PRONTO_PARA_RADAR" }));
  assert.equal(depoisDoF5.approvalState, "APROVADO");
  assert.equal(depoisDoF5.workflowStatus, "PRONTO_PARA_RADAR");
});

test("§2 — elegibilidade NÃO vira status sozinha", () => {
  // Todos os gates limpos, nada gravado: continua CONCLUIDO até alguém decidir.
  const elegivel = resolveArticleOperationalState(artigoPronto());
  assert.equal(elegivel.canMarkReady, true);
  assert.equal(elegivel.workflowStatus, "CONCLUIDO");
});

test("§9 — status gravado não sustenta artefato que foi rejeitado depois", () => {
  const rejeitadoDepois = resolveArticleOperationalState(artigoPronto({
    persistedStatus: "PRONTO_PARA_RADAR",
    graphApproval: "REJEITADO",
  }));
  assert.notEqual(rejeitadoDepois.workflowStatus, "PRONTO_PARA_RADAR");
  /*
   * O REBAIXAMENTO USA A PALAVRA DO EIXO GLOBAL.
   *
   * Antes ele caía em `CONCLUIDO` — o estado derivado da FASE. Mas
   * `workflowStatus` responde pelo status global do artigo, cujo vocabulário é
   * RASCUNHO / EM_PROCESSO / DESCARTADO / PRONTO_PARA_RADAR / ENVIADO_AO_RADAR.
   * Devolver `CONCLUIDO` ali misturava os dois eixos justamente no ponto em que
   * eles precisam ser distintos — e discordava do servidor, que grava
   * `EM_PROCESSO` ao invalidar a marca vencida (`invalidateStaleReady`).
   */
  assert.equal(rejeitadoDepois.workflowStatus, "EM_PROCESSO");
  assert.ok(rejeitadoDepois.blockers.some(motivo => motivo.includes("está rejeitado")));
});

test("§7 — ENVIADO_AO_RADAR gravado é fato consumado", () => {
  const enviado = resolveArticleOperationalState(artigoPronto({
    persistedStatus: "ENVIADO_AO_RADAR",
    graphApproval: "BRUTO",
  }));
  assert.equal(enviado.workflowStatus, "ENVIADO_AO_RADAR");
  assert.equal(enviado.approvalState, "APROVADO");
});

test("§7 — enviar exige o STATUS, não a elegibilidade", () => {
  assert.equal(canSendToRadar("PRONTO_PARA_RADAR"), true);
  assert.equal(canSendToRadar("CONCLUIDO"), false);
  assert.equal(canSendToRadar("ENVIADO_AO_RADAR"), false);
  assert.equal(canSendToRadar("EM_PROCESSAMENTO"), false);
});

/* -------------------------------------------- revalidação no servidor */

const indice = (over: Partial<CanonicalApprovalIndex> = {}): CanonicalApprovalIndex => ({
  approvedArticleVersions: new Set(["av-1"]),
  approvedSiloVersions: new Set(["sv-1"]),
  approvedSiloPageVersions: new Set(["pv-1"]),
  approvedGraphVersions: new Set(["gv-1"]),
  articleIdByVersion: new Map([["av-1", "art-1"]]),
  ...over,
});

const alegacao = (over: Partial<ReadyForRadarClaim> = {}): ReadyForRadarClaim => ({
  articleId: "art-1",
  articleDnaVersionId: "av-1",
  siloDnaVersionId: "sv-1",
  siloPageVersionId: "pv-1",
  internalLinkGraphVersionId: "gv-1",
  ...over,
});

test("§3 — o servidor aceita a alegação que fecha com o estado canônico", () => {
  const resultado = validateReadyForRadarClaims({ claims: [alegacao()], canonical: indice() });
  assert.equal(resultado.accepted.length, 1);
  assert.equal(resultado.refused.length, 0);
});

test("§3 — versão não aprovada/vigente é recusada, e a recusa diz qual eixo", () => {
  const semArtigo = validateReadyForRadarClaims({
    claims: [alegacao()],
    canonical: indice({ approvedArticleVersions: new Set(["outra"]) }),
  });
  assert.equal(semArtigo.accepted.length, 0);
  assert.match(semArtigo.refused[0].blockers.join(" "), /ArticleDNA alegado não está aprovado/);

  const semSilo = validateReadyForRadarClaims({
    claims: [alegacao()],
    canonical: indice({ approvedSiloVersions: new Set() }),
  });
  assert.match(semSilo.refused[0].blockers.join(" "), /SiloDNA alegado/);

  const semGrafo = validateReadyForRadarClaims({
    claims: [alegacao()],
    canonical: indice({ approvedGraphVersions: new Set() }),
  });
  assert.match(semGrafo.refused[0].blockers.join(" "), /InternalLinkGraph alegado/);
});

test("§3 — versão aprovada de OUTRO artigo não sustenta este", () => {
  const resultado = validateReadyForRadarClaims({
    claims: [alegacao({ articleId: "art-2" })],
    canonical: indice(),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.match(resultado.refused[0].blockers.join(" "), /pertence a outro artigo/);
});

test("§3 — um artigo recusado não derruba o lote", () => {
  const resultado = validateReadyForRadarClaims({
    claims: [
      alegacao({ articleId: "art-1" }),
      alegacao({ articleId: "art-x", articleDnaVersionId: "av-x" }),
    ],
    canonical: indice(),
  });
  assert.deepEqual(resultado.accepted.map(item => item.articleId), ["art-1"]);
  assert.deepEqual(resultado.refused.map(item => item.articleId), ["art-x"]);
});

/* ---------------------------------------------------------- observável */

test("§4 — COMPATIBLE do motor vira SUPPORTED no contrato da mesa", () => {
  assert.equal(serpVerdictOf("COMPATIBLE"), "SUPPORTED");
  assert.equal(serpVerdictOf("DIVERGENCE"), "DIVERGENCE");
  assert.equal(serpVerdictOf("INCONCLUSIVE"), "INCONCLUSIVE");
  assert.equal(serpVerdictOf("NOT_RUN"), "NOT_RUN");
  assert.equal(serpVerdictOf(null), "NOT_RUN");
});

test("§4 — COLLECTED e REUSED são distinguíveis; sem evidência não inventa passado", () => {
  const coletadas = new Set(["ref-1"]);
  assert.equal(serpSourceOf({ candidateRef: "ref-1", collectedInThisRun: coletadas, hasEvidence: true }), "COLLECTED");
  assert.equal(serpSourceOf({ candidateRef: "ref-2", collectedInThisRun: coletadas, hasEvidence: true }), "REUSED");
  assert.equal(serpSourceOf({ candidateRef: "ref-3", collectedInThisRun: coletadas, hasEvidence: false }), null);
});

test("§4 — o readout fecha a conta e não omite zero", () => {
  const linha = (over: Partial<ArticleRunRow>): ArticleRunRow => ({
    articleId: "a", serpSource: "REUSED", serpVerdict: "SUPPORTED",
    decisionBasis: "Evidência vigente.", formationChanged: false, readyToConclude: true, blocked: false,
    ...over,
  });
  const readout = buildArticleRunReadout([
    linha({ articleId: "a", serpSource: "COLLECTED", formationChanged: true }),
    linha({ articleId: "b" }),
    linha({ articleId: "c", serpSource: null, serpVerdict: "NOT_RUN", readyToConclude: false, blocked: true }),
  ]);
  assert.equal(readout.ARTICLES_PROCESSED, 3);
  assert.equal(readout.SERP_COLLECTED, 1);
  assert.equal(readout.SERP_REUSED, 1);
  assert.equal(readout.FORMATIONS_CHANGED, 1);
  assert.equal(readout.FORMATIONS_UNCHANGED, 2);
  assert.equal(readout.READY_TO_CONCLUDE, 2);
  assert.equal(readout.BLOCKED, 1);

  // A segunda execução precisa poder mostrar SERP_COLLECTED = 0.
  const segunda = buildArticleRunReadout([linha({ articleId: "a" }), linha({ articleId: "b" })]);
  const texto = formatArticleRunReadout(segunda);
  assert.match(texto, /SERP_COLLECTED = 0/);
  assert.match(texto, /SERP_REUSED = 2/);
  for (const chave of ["ARTICLES_PROCESSED", "FORMATIONS_CHANGED", "FORMATIONS_UNCHANGED", "READY_TO_CONCLUDE", "BLOCKED"]) {
    assert.match(texto, new RegExp(chave));
  }
});

test("§4 — a leitura por artigo traz fonte, veredito e base da decisão", () => {
  const texto = formatArticleSerpReadout({ serpSource: "REUSED", serpVerdict: "SUPPORTED", decisionBasis: "Evidência de 2026-09-01 ainda vigente." });
  assert.match(texto, /SERP_SOURCE = REUSED/);
  assert.match(texto, /SERP_VERDICT = SUPPORTED/);
  assert.match(texto, /DECISION_BASIS = Evidência de 2026-09-01 ainda vigente\./);
});

/* ----------------------------------------------------------- readback */

const esperado = {
  articleId: "art-1",
  brandId: "brand-1",
  articleDnaVersionId: "v-1",
  contentHash: "sha256:" + "a".repeat(64),
  keywordIds: ["kw-2", "kw-1"],
};

test("§10 — readback confirma quando o servidor devolve o mesmo artefato", () => {
  const verdict = verifyRadarHandoffReadback({
    expectations: [esperado],
    remoteItems: [{
      articleId: "art-1", brandId: "brand-1", articleDnaVersionId: "v-1",
      articleDnaContentHash: esperado.contentHash,
      arquitetoKeywordDnaReferences: [{ keywordId: "kw-1" }, { keywordId: "kw-2" }],
    }],
  });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.confirmed, ["art-1"]);
  assert.match(describeRadarReadback(verdict), /RADAR_HANDOFF_CONFIRMED = YES/);
});

test("§10 — servidor sem o item NÃO confirma, por mais que o estado local diga que enviou", () => {
  const verdict = verifyRadarHandoffReadback({ expectations: [esperado], remoteItems: [] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.confirmed.length, 0);
  assert.match(verdict.issues[0].reasons[0], /não devolveu este artigo/);
  assert.match(describeRadarReadback(verdict), /RADAR_HANDOFF_CONFIRMED = NO/);
});

test("§10 — versão, hash, brand e refs divergentes são recusas nomeadas", () => {
  const divergente = verifyRadarHandoffReadback({
    expectations: [esperado],
    remoteItems: [{
      articleId: "art-1", brandId: "outra-brand", articleDnaVersionId: "v-0",
      articleDnaContentHash: "sha256:" + "b".repeat(64),
      arquitetoKeywordDnaReferences: [{ keywordId: "kw-1" }],
    }],
  });
  assert.equal(divergente.ok, false);
  const motivos = divergente.issues[0].reasons.join(" ");
  assert.match(motivos, /Brand/);
  assert.match(motivos, /versão do ArticleDNA/);
  assert.match(motivos, /contentHash/);
  assert.match(motivos, /Refs de KeywordDNA/);
});

test("§10 — confirmar um artigo não confirma o lote", () => {
  const verdict = verifyRadarHandoffReadback({
    expectations: [esperado, { ...esperado, articleId: "art-2" }],
    remoteItems: [{
      articleId: "art-1", brandId: "brand-1", articleDnaVersionId: "v-1",
      articleDnaContentHash: esperado.contentHash,
      arquitetoKeywordDnaReferences: [{ keywordId: "kw-1" }, { keywordId: "kw-2" }],
    }],
  });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.confirmed, ["art-1"]);
  assert.equal(verdict.issues.length, 1);
});

/* ------------------------------------------------- invalidação da base */

const base = () => readyBaseFromClaim(alegacao());

test("§3 — a base gravada é lida do payload; linha sem base não pode ser conferida", () => {
  assert.deepEqual(readReadyBase({ ...base(), extra: "ignorado" }), base());
  assert.equal(readReadyBase(null), null);
  assert.equal(readReadyBase({}), null);
  // Payload antigo, com só parte das referências, também não serve.
  assert.equal(readReadyBase({ siloDnaVersionId: "sv-1", internalLinkGraphVersionId: "gv-1" }), null);
});

test("§3 — READY_BASE_MATCHES_CURRENT responde pelas quatro referências", () => {
  assert.equal(readyBaseMatchesCurrent({ base: base(), canonical: indice() }).matches, true);

  for (const [campo, conjunto] of [
    ["ArticleDNA", "approvedArticleVersions"],
    ["SiloDNA", "approvedSiloVersions"],
    ["SiloPage", "approvedSiloPageVersions"],
    ["InternalLinkGraph", "approvedGraphVersions"],
  ] as const) {
    const veredito = readyBaseMatchesCurrent({
      base: base(),
      canonical: indice({ [conjunto]: new Set(["outra"]) } as Partial<CanonicalApprovalIndex>),
    });
    assert.equal(veredito.matches, false, `${campo} trocado não invalidou`);
    assert.match(veredito.reasons.join(" "), new RegExp(campo));
  }
});

test("§3 — sem base gravada, a marca não se sustenta", () => {
  const veredito = readyBaseMatchesCurrent({ base: null, canonical: indice() });
  assert.equal(veredito.matches, false);
  assert.match(veredito.reasons[0], /antes do registro da base/);
});

test("§4 — PRONTO sobre base vencida entra na invalidação; sobre base vigente, fica", () => {
  const plano = planReadyInvalidation({
    canonical: indice(),
    rows: [
      { articleId: "vigente", status: "PRONTO_PARA_RADAR", base: base() },
      { articleId: "vencido", status: "PRONTO_PARA_RADAR", base: { ...base(), siloPageVersionId: "pv-antiga" } },
      { articleId: "sem-base", status: "PRONTO_PARA_RADAR", base: null },
    ],
  });
  assert.deepEqual(plano.keep, ["vigente"]);
  assert.deepEqual(plano.invalidate.map(item => item.articleId), ["vencido", "sem-base"]);
  assert.ok(plano.invalidate[0].reasons.length > 0);
});

test("§5 — ENVIADO_AO_RADAR nunca é rebaixado, mesmo com a base inteira trocada", () => {
  const plano = planReadyInvalidation({
    canonical: indice({
      approvedArticleVersions: new Set(),
      approvedSiloVersions: new Set(),
      approvedSiloPageVersions: new Set(),
      approvedGraphVersions: new Set(),
    }),
    rows: [
      { articleId: "enviado", status: "ENVIADO_AO_RADAR", base: base() },
      { articleId: "concluido", status: "CONCLUIDO", base: null },
    ],
  });
  assert.deepEqual(plano.invalidate, []);
  assert.deepEqual(plano.keep, ["enviado", "concluido"]);
});

test("§2 — reaprovar não ressuscita a marca antiga: a base precisa ser a MESMA", () => {
  assert.equal(sameReadyBase(base(), base()), true);
  assert.equal(sameReadyBase(base(), { ...base(), articleDnaVersionId: "av-2" }), false);
  assert.equal(sameReadyBase(null, base()), false);
  assert.equal(sameReadyBase(base(), null), false);

  // Status gravado + base trocada = não está pronto, mesmo com tudo aprovado.
  const comBaseTrocada = resolveArticleOperationalState(artigoPronto({
    persistedStatus: "PRONTO_PARA_RADAR",
    persistedBaseMatches: false,
  }));
  // Mesma razão do §9: o eixo global rebaixa com palavra do eixo global, e é
  // a mesma que o servidor grava ao invalidar.
  assert.equal(comBaseTrocada.workflowStatus, "EM_PROCESSO");
  // E é preciso clicar de novo: a elegibilidade sozinha não devolve o status.
  assert.equal(comBaseTrocada.canMarkReady, true);
});

/* ------------------------------------------------------- contratos de UI */

const workspaceSource = () => readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");

test("§5 — a aba Links oferece dois botões no caminho normal e um único de aprovação", async () => {
  const source = await workspaceSource();
  assert.match(source, /const LINKS_ADVANCED_CONTROLS = false;/);

  // Os sete controles avançados continuam implementados, mas fora da oferta.
  const gatilhados = source.split("LINKS_ADVANCED_CONTROLS && ").length - 1;
  assert.equal(gatilhados, 7, "os sete controles avançados precisam continuar atrás do gate");

  // LINK_GRAPH_APPROVAL_BUTTONS_VISIBLE = 1: o único aprovar sem gate é o da fase.
  assert.match(source, /Confirmar links internos/);
  const aprovarVisivel = source
    .split(/\r?\n/)
    .filter(linha => linha.includes("handleApproveLinks(") && linha.includes("<button"))
    .filter(linha => !linha.includes("LINKS_ADVANCED_CONTROLS"));
  assert.equal(aprovarVisivel.length, 0, "sobrou um segundo botão de aprovar o grafo fora do gate");
});

test("§10 — o readback lê o servidor e não depende mais de radarItems", async () => {
  const source = await workspaceSource();
  // A dependência antiga era a prova do falso positivo.
  assert.doesNotMatch(source, /pendingRadarSmokeReadback, radarItems, showNotification/);
  assert.ok(source.includes("verifyRadarHandoffReadback({ expectations, remoteItems })"));
  assert.ok(source.includes('cache: "no-store"'));
  // Envio deixou de declarar conclusão antes da conferência.
  assert.equal(source.includes("' enviada(s) ao Radar.'"), false);
  assert.ok(source.includes("aceita(s) pelo servidor. Conferindo no Radar"));
});

test("§11 — marcar como pronto não passa por nenhum writer de artefato", async () => {
  const source = await workspaceSource();
  const inicio = source.indexOf("const markSelectedReadyForRadar = async () => {");
  assert.ok(inicio > 0, "handler da ação em lote não encontrado");
  // O corpo vai até a próxima declaração de topo do componente.
  const resto = source.slice(inicio + 20);
  const fimRelativo = resto.search(/\r?\n {2}(const|function|useEffect|\/\*\*)/);
  const corpo = source.slice(inicio, fimRelativo > 0 ? inicio + 20 + fimRelativo : inicio + 4000);
  for (const proibido of ["persistArquitetoArtifact", "persistInternalLinkGraph", "createArticleDna", "addVersionEvents", "setAcceptedArticleDnas", "setAcceptedSiloDnas", "setAcceptedSiloPages"]) {
    assert.equal(corpo.includes(proibido), false, `a ação em lote chamou ${proibido}`);
  }
  // O único writer do caminho é o do status operacional.
  assert.match(corpo, /persistWorkflowStatus\("PRONTO_PARA_RADAR", claims\)/);
  assert.match(source, /data-testid="architect-mark-ready-for-radar"/);
});

test("§4 — o status é remoto: não há marcador de sessão nem localStorage para ele", async () => {
  const source = await workspaceSource();
  // A versão de sessão foi removida inteira; sobreviver ao F5 depende disso.
  assert.equal(source.includes("readyForRadarIds"), false, "sobrou o marcador de sessão");
  assert.equal(source.includes("setRadarHandoffConfirmed"), false, "sobrou o confirmado de sessão");
  // O cache só é escrito a partir de resposta do servidor.
  assert.match(source, /const \[remoteWorkflowStatus, setRemoteWorkflowStatus\]/);
  assert.match(source, /applyRemoteWorkflowStatus\(body\.data\?\.items \|\| \[\]\)/);
  assert.ok(source.includes("/api/arquiteto/workflow-status"));
  // E nada de localStorage para status operacional.
  const trecho = source.slice(source.indexOf("const [remoteWorkflowStatus"), source.indexOf("const [siloWorkingCopies"));
  assert.equal(trecho.includes("localStorage"), false);
});

test("§7 — enviar ao Radar exige o status gravado", async () => {
  const source = await workspaceSource();
  assert.match(source, /selectedArticlesNotReadyForRadar/);
  assert.match(source, /canSendSelectedArticlesToRadarNow/);
  assert.ok(source.includes('persistWorkflowStatus("ENVIADO_AO_RADAR", paraGravar)'));
});

test("§9 — o status operacional vive na coluna Status, nunca na de Aprovação", async () => {
  const source = await workspaceSource();
  const aprovacao = source.indexOf('data-testid="architect-approval-version"');
  const statusDaLinha = source.indexOf('data-testid="architect-row-workflow-status"');
  assert.ok(aprovacao > 0, "a coluna Aprovação sumiu");
  assert.ok(statusDaLinha > 0, "o status operacional não aparece na linha");
  // A coluna Status vem depois da de Aprovação: se o rótulo operacional
  // aparecesse antes, ele estaria dentro da célula da decisão editorial.
  assert.ok(statusDaLinha > aprovacao, "o status operacional caiu na célula de Aprovação");
});

test("§1/§4 — a invalidação é remota, e a tela não vai na frente do banco", async () => {
  const source = await workspaceSource();
  // A tela só sustenta "Pronto" com o aval do servidor sobre a base.
  assert.match(source, /persistedBaseMatches: Boolean\(gravado\?\.baseMatchesCurrent\)/);
  assert.match(source, /sameReadyBase\(gravado\?\.base \?\? null/);

  const rota = await readFile(new URL("../app/api/arquiteto/workflow-status/route.ts", import.meta.url), "utf8");
  assert.ok(rota.includes("planReadyInvalidation"), "a rota não planeja invalidação");
  assert.ok(rota.includes('target: "EM_PROCESSO"'), "a rota não persiste o rebaixamento");
  assert.ok(rota.includes('persistGlobalTransition(db,'), "a transição não deixa rastro");
  // §3 — a base viaja junto da marca, senão nada disso é conferível depois.
  assert.ok(rota.includes("payload: readyBaseFromClaim(claim)"));
  assert.ok(rota.includes("baseMatchesCurrent:"), "a resposta não informa se a base confere");
});

test("§10/UI — DECISÃO e STATUS aparecem separados", async () => {
  const source = await workspaceSource();
  assert.match(source, /data-testid="architect-operational-axes"/);
  assert.match(source, />DECISÃO</);
  assert.match(source, />STATUS</);
});
