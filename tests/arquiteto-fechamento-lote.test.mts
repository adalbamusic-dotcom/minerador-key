import assert from "node:assert/strict";
import test from "node:test";
import {
  articleClosingBlockers,
  closeArticleRevision,
  closeArticleRevisions,
  resolveSerpEvidenceState,
  summarizeClosingEligibility,
  type ArticleClosingCandidate,
  type ClosingPersistPort,
} from "../lib/arquiteto/article-closing-service.ts";

/**
 * UMA AUTORIDADE PARA OS DOIS CAMINHOS.
 *
 * Aprovar um artigo e aprovar dez é o mesmo ato repetido. Ter um caminho para
 * o botão e outro para o lote produz duas definições de "aprovado" que
 * divergem no primeiro caso de borda.
 */

const artigo = (overrides: Partial<ArticleClosingCandidate> = {}): ArticleClosingCandidate => ({
  articleId: "article:1",
  label: "skin care principia",
  hasArticleDna: true,
  approved: false,
  formationSaved: true,
  principalKeywordIds: ["kw-a"],
  pendingDecisions: [],
  conflicts: [],
  serp: "CURRENT",
  serpDecisionResolved: true,
  ...overrides,
});

const persistOk: ClosingPersistPort = async () => ({
  readbackConfirmed: true, changed: true, versionId: "v-novo", versionNumber: 6, contentHash: "sha256:novo",
});

/* --------------- individual e lote dão o MESMO resultado ---------------- */

test("o mesmo artigo produz o mesmo resultado individual e em lote", async () => {
  const candidato = artigo();
  const individual = await closeArticleRevision({ candidate: candidato, action: "approve", persist: persistOk });
  const lote = await closeArticleRevisions({ candidates: [candidato], action: "approve", persist: persistOk });

  assert.equal(individual.outcome, "approved");
  assert.equal(lote.results[0].outcome, individual.outcome);
  assert.equal(lote.results[0].versionId, individual.versionId);
  assert.equal(lote.approved, 1);
});

/* ----------------------------- bloqueios -------------------------------- */

test("duas Principais bloqueiam, nomeando as buscas", () => {
  const blockers = articleClosingBlockers(artigo({ principalKeywordIds: ["kw-a", "kw-b"] }), "approve");
  const alvo = blockers.find(item => item.code === "MULTIPLE_PRINCIPALS");
  assert.ok(alvo);
  assert.match(alvo!.detail, /2 buscas marcadas como Principal/);
  assert.deepEqual(alvo!.references, ["kw-a", "kw-b"], "sem as referências o conflito não é localizável");
  assert.match(alvo!.resolveWith, /revisão de composição/);
});

test("decisão humana pendente bloqueia e diz qual", () => {
  const blockers = articleClosingBlockers(artigo({ pendingDecisions: ["KGR do artigo", "Tipo de unidade"] }), "approve");
  const alvo = blockers.find(item => item.code === "PENDING_HUMAN_DECISION");
  assert.match(alvo!.detail, /KGR do artigo; Tipo de unidade/);
  assert.match(alvo!.resolveWith, /aba Revisão/);
});

test("SERP desatualizada bloqueia, mas decisão humana vigente libera", () => {
  assert.ok(articleClosingBlockers(artigo({ serp: "STALE", serpDecisionResolved: false }), "approve")
    .some(item => item.code === "SERP_STALE"));
  // Evidência de outra composição com decisão registrada não barra: quem
  // decidiu foi gente, sobre aquela base.
  assert.deepEqual(articleClosingBlockers(artigo({ serp: "STALE", serpDecisionResolved: true }), "approve"), []);
});

test("conflitos repetidos são agrupados PRESERVANDO as referências", () => {
  const blockers = articleClosingBlockers(artigo({
    conflicts: [
      { detail: "Artigo atravessa dois Silos.", references: ["article:1", "silo:2"] },
      { detail: "Artigo atravessa dois Silos.", references: ["silo:3"] },
    ],
  }), "approve");
  const conflitos = blockers.filter(item => item.code === "STRUCTURAL_CONFLICT");
  assert.equal(conflitos.length, 1, "o mesmo conflito não vira duas linhas");
  assert.deepEqual(conflitos[0].references, ["article:1", "silo:2", "silo:3"], "nenhuma referência se perde");
});

test("enviar para aprovação exige formação salva, e só isso", () => {
  // Este ato não cobra decisões nem SERP: ele apenas move para a fila.
  assert.deepEqual(articleClosingBlockers(artigo({ pendingDecisions: ["KGR"], serp: "NOT_COLLECTED" }), "submit_for_approval"), []);
  assert.ok(articleClosingBlockers(artigo({ formationSaved: false }), "submit_for_approval")
    .some(item => item.code === "FORMATION_NOT_SAVED"));
});

test("reabrir revisão não apaga a aprovação: exige que ela exista", () => {
  assert.deepEqual(articleClosingBlockers(artigo({ approved: true }), "reopen_revision"), []);
  assert.ok(articleClosingBlockers(artigo({ approved: false }), "reopen_revision").length > 0);
});

/* ------------------------ readback e falha ------------------------------ */

test("readback não confirmado NUNCA vira aprovação", async () => {
  const resultado = await closeArticleRevision({
    candidate: artigo(), action: "approve",
    persist: async () => ({ readbackConfirmed: false, changed: true, versionId: "v-?", versionNumber: 6, contentHash: "sha256:?" }),
  });
  assert.equal(resultado.outcome, "pending_confirmation");
  // Mandar RELER, não repetir: a escrita pode ter commitado.
  assert.match(resultado.message, /Recarregue antes de repetir/);
});

test("erro de gravação é falha, nunca sucesso local", async () => {
  const resultado = await closeArticleRevision({
    candidate: artigo(), action: "approve",
    persist: async () => { throw new Error("42501: permissão negada"); },
  });
  assert.equal(resultado.outcome, "failed");
  assert.match(resultado.message, /42501/);
});

test("conteúdo inalterado não cria versão nem infla a contagem", async () => {
  const resultado = await closeArticleRevision({
    candidate: artigo(), action: "approve",
    persist: async () => ({ readbackConfirmed: true, changed: false, versionId: "v5", versionNumber: 5, contentHash: "sha256:igual" }),
  });
  assert.equal(resultado.outcome, "already_approved");
  assert.match(resultado.message, /nenhuma versão nova/);
});

/* ------------------------------ lote misto ------------------------------ */

test("lote misto aprova os elegíveis e mantém os bloqueados selecionados", async () => {
  const lote = await closeArticleRevisions({
    candidates: [
      artigo({ articleId: "a", label: "pronto" }),
      artigo({ articleId: "b", label: "com pendência", pendingDecisions: ["KGR"] }),
      artigo({ articleId: "c", label: "duas principais", principalKeywordIds: ["x", "y"] }),
    ],
    action: "approve",
    persist: persistOk,
  });

  assert.equal(lote.approved, 1);
  assert.equal(lote.blocked, 2);
  assert.deepEqual(lote.keepSelectedArticleIds, ["b", "c"], "o bloqueado continua selecionado para ser resolvido");
  assert.match(lote.summary, /1 aprovado\(s\) · 2 bloqueado\(s\)/);
});

test("uma falha não apaga os resultados já confirmados", async () => {
  let chamadas = 0;
  const lote = await closeArticleRevisions({
    candidates: [artigo({ articleId: "a" }), artigo({ articleId: "b" }), artigo({ articleId: "c" })],
    action: "approve",
    persist: async candidate => {
      chamadas += 1;
      if (candidate.articleId === "b") throw new Error("falha remota");
      return { readbackConfirmed: true, changed: true, versionId: `v-${candidate.articleId}`, versionNumber: 6, contentHash: "sha256:x" };
    },
  });
  assert.equal(chamadas, 3, "a falha de um não interrompe os demais");
  assert.equal(lote.approved, 2);
  assert.equal(lote.failed, 1);
  assert.equal(lote.results[0].versionId, "v-a", "o confirmado antes da falha permanece");
});

/* ---------------------- a contagem antes de aplicar --------------------- */

test("a barra sabe quantos são elegíveis e quantos estão bloqueados", () => {
  const resumo = summarizeClosingEligibility({
    candidates: [artigo({ articleId: "a" }), artigo({ articleId: "b", serp: "NOT_COLLECTED" })],
    action: "approve",
  });
  assert.equal(resumo.selected, 2);
  assert.equal(resumo.eligible, 1);
  assert.equal(resumo.blocked, 1);
  assert.equal(resumo.blockedDetails[0].articleId, "b");
  assert.match(resumo.blockedDetails[0].blockers[0].resolveWith, /Reprocessar artigos/);
});

/* ------------------------- os três estados de SERP ---------------------- */

test("evidência histórica de outra composição é STALE, não ausente", () => {
  assert.equal(resolveSerpEvidenceState({ hasAssessment: false, assessmentBaseHash: null, currentBaseHash: "b1" }), "NOT_COLLECTED");
  // Chamar isto de "não executada" apagaria trabalho que foi feito.
  assert.equal(resolveSerpEvidenceState({ hasAssessment: true, assessmentBaseHash: "b0", currentBaseHash: "b1" }), "STALE");
  assert.equal(resolveSerpEvidenceState({ hasAssessment: true, assessmentBaseHash: "b1", currentBaseHash: "b1" }), "CURRENT");
});
