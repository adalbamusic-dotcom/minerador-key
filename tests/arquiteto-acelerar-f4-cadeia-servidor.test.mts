import assert from "node:assert/strict";
import test from "node:test";
import { applyWithdrawChain, locateSubjectArticle, previewWithdrawChain, type WithdrawChainDeps } from "../lib/server/declared-plan-withdraw-chain.ts";

/*
 * SDD acelerar 2026-10-13, item 15 — "Tirar do plano" numa confirmação, com
 * as dependências fingidas: a sequência, a retomada, a parada no meio e a
 * falta de permissão do Arquiteto. Nada de banco.
 */

const previaDoPlano = {
  ok: true as const, mode: "preview" as const,
  group: { id: "g", name: "Azul", color: "azul" as const, planVersion: 1, siloName: "Wi-Fi", articleCount: 3 },
  article: { order: 2, role: "Suporte" as const, scope: "x", subject: { keywordId: "s2", phrase: "Barata", status: "aprovado" }, principal: null, canWithdraw: true, withdrawBlocker: null },
  remainingArticles: 2, nextPlanVersion: 2, approvedToReview: 1, effects: ["Nada é apagado."], decisionHash: "h1",
};

function deps(over: Partial<WithdrawChainDeps> = {}, chamadas: string[] = []): WithdrawChainDeps {
  return {
    withdraw: async mode => { chamadas.push(`plano:${mode}`); return mode === "preview" ? previaDoPlano : { ok: true, mode: "apply", group: previaDoPlano.group, subjectKeywordId: "s2", principalKeywordId: null, planVersion: 2, groupAlreadyUpdated: false, readback: { subjectPlanRemoved: true, subjectStillDeclared: true, principalMarkRemoved: null, groupPlanHash: "x" }, notices: [] }; },
    approveAndSend: async ids => { chamadas.push(`aprovar:${ids.join(",")}`); return { send: true, results: ids.map(id => ({ id, keyword: id, outcome: "approved_and_sent" as const, reason: null })), counts: { approved_and_sent: ids.length, sent: 0, approved: 0, unchanged: 0, approved_not_sent: 0, not_sent: 0, blocked: 0, excluded: 0, stale: 0 }, readbackConfirmed: true, decisionHash: "d", notices: [] }; },
    locateArticle: async () => ({ articleId: "a2", label: "Barata", siloId: "territory:x", isPillar: false }),
    canWithdrawFromSilo: async () => true,
    withdrawFromSilo: async ({ mode }) => { chamadas.push(`silo:${mode}`); return { ok: true, message: mode === "apply" ? "“Barata” saiu do Silo." : "“Barata” sai do Silo." }; },
    ...over,
  };
}

test("item 15 · a prévia lista os efeitos nos dois módulos e não grava nada", async () => {
  const chamadas: string[] = [];
  const previa = await previewWithdrawChain(deps({}, chamadas), { reapproveAndSend: true, withdrawFromSilo: true });
  assert.ok("mode" in previa && previa.mode === "preview");
  assert.ok(previa.effects.some(efeito => /reaprovados e reenviados/.test(efeito)));
  assert.ok(previa.effects.some(efeito => /sai do Silo no Arquiteto/.test(efeito)));
  assert.deepEqual(chamadas, ["plano:preview", "silo:preview"]);
});

test("item 15 · aplicar: plano → reaprovar e enviar → retirar do Silo, nessa ordem", async () => {
  const chamadas: string[] = [];
  const feito = await applyWithdrawChain(deps({}, chamadas), { decisionHash: "h1", reapproveAndSend: true, withdrawFromSilo: true, reviewKeywordIds: ["s2"] });
  assert.equal(feito.complete, true);
  assert.deepEqual(chamadas, ["plano:apply", "aprovar:s2", "silo:apply"]);
  assert.deepEqual(feito.steps.map(step => step.outcome), ["done", "done", "done"]);
});

test("item 15 · retomada: já fora do plano conta como feito e o resto segue; prévia vencida para tudo", async () => {
  const retomada = await applyWithdrawChain(deps({ withdraw: async () => ({ ok: false, code: "NOT_IN_PLAN", reason: "fora" }) }), { decisionHash: "h1", reapproveAndSend: true, withdrawFromSilo: true, reviewKeywordIds: ["s2"] });
  assert.equal(retomada.steps[0].outcome, "already");
  assert.equal(retomada.complete, true);
  const chamadas: string[] = [];
  const vencida = await applyWithdrawChain(deps({ withdraw: async () => ({ ok: false, code: "DECISION_STALE", reason: "mudou" }) }, chamadas), { decisionHash: "h0", reapproveAndSend: true, withdrawFromSilo: true, reviewKeywordIds: ["s2"] });
  assert.equal(vencida.complete, false);
  assert.equal(vencida.steps.length, 1);
  assert.ok(!chamadas.some(chamada => chamada.startsWith("aprovar") || chamada.startsWith("silo")), "nada além do plano é tentado");
});

test("item 15 · sem a permissão do Arquiteto, os passos do Minerador rodam e a retirada fica dita como pendente", async () => {
  const chamadas: string[] = [];
  const feito = await applyWithdrawChain(deps({ canWithdrawFromSilo: async () => false }, chamadas), { decisionHash: "h1", reapproveAndSend: true, withdrawFromSilo: true, reviewKeywordIds: ["s2"] });
  assert.deepEqual(feito.steps.map(step => step.outcome), ["done", "done", "skipped"]);
  assert.match(feito.steps[2].message, /Sem a permissão do Arquiteto/);
  assert.ok(!chamadas.includes("silo:apply"));
});

test("item 15 · o artigo do Assunto e o Silo vigente que o contém", () => {
  const artigo = (versionNumber: number) => ({ versionId: `v${versionNumber}`, versionNumber, payload: { articleId: "a2", subject: { keywordId: "s2", phrase: "Barata" }, principalKeywordId: "k", promise: "p" } });
  const silo = (versionNumber: number, supports: string[]) => ({ versionId: `sv${versionNumber}`, versionNumber, payload: { siloId: "territory:x", pillarArticleId: "a1", supportArticleIds: supports } });
  assert.deepEqual(locateSubjectArticle({ subjectKeywordId: "s2", articleDnas: [artigo(1), artigo(2)] as never, siloDnas: [silo(1, ["a2"]), silo(2, ["a3"])] as never }), null, "a versão vigente do Silo já não o tem");
  assert.deepEqual(locateSubjectArticle({ subjectKeywordId: "s2", articleDnas: [artigo(1)] as never, siloDnas: [silo(3, ["a2"])] as never }), { articleId: "a2", label: "Barata", siloId: "territory:x", isPillar: false });
});
