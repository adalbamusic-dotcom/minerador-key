import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  describeArticleAiBatchOutcome,
  summarizeArticleAiExecutionStates,
  type ArticleAiExecutionStateEntry,
} from "../lib/arquiteto/ai-strategic-payload.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const withProposals = (articleId: string): ArticleAiExecutionStateEntry => ({ articleId, state: "COMPLETED_WITH_PROPOSALS" });
const noOp = (articleId: string): ArticleAiExecutionStateEntry => ({ articleId, state: "COMPLETED_NO_PROPOSALS" });
const failed = (articleId: string): ArticleAiExecutionStateEntry => ({ articleId, state: "ERROR" });

const close = (states: ArticleAiExecutionStateEntry[], materialProposalCount: number, registrationFailureCount = 0) =>
  describeArticleAiBatchOutcome({
    summary: summarizeArticleAiExecutionStates(states),
    materialProposalCount,
    registrationFailureCount,
  });

test("CASE A · 1 Article com 2 propostas fecha 1/1 e SUCCESS", () => {
  const summary = summarizeArticleAiExecutionStates([withProposals("a")]);

  assert.deepEqual(summary, { requestedArticles: 1, completedArticles: 1, failedArticles: 0 });
  const outcome = close([withProposals("a")], 2);
  assert.equal(outcome.severity, "success");
  assert.match(outcome.message, /IA concluída: 1 de 1 artigo revisado\./);
  assert.match(outcome.message, /2 propostas de arquitetura prontas para revisão humana\./);
  // A IA propõe; aplicar continua sendo decisão humana.
  assert.match(outcome.message, /Nada foi alterado\./);
  assert.doesNotMatch(outcome.message, /Parcial|erro|não concluída/);
});

test("CASE B · 1 Article em NO-OP fecha 1/1 e SUCCESS", () => {
  const outcome = close([noOp("a")], 0);

  assert.deepEqual(summarizeArticleAiExecutionStates([noOp("a")]), { requestedArticles: 1, completedArticles: 1, failedArticles: 0 });
  assert.equal(outcome.severity, "success");
  assert.match(outcome.message, /IA concluída: 1 de 1 artigo revisado\./);
  assert.match(outcome.message, /Nenhuma alteração estrutural foi recomendada\./);
});

test("CASE C · 5 Articles, 3 NO-OP e 2 com propostas, fecham 5/5 e SUCCESS", () => {
  const states = [noOp("a"), noOp("b"), noOp("c"), withProposals("d"), withProposals("e")];

  assert.deepEqual(summarizeArticleAiExecutionStates(states), { requestedArticles: 5, completedArticles: 5, failedArticles: 0 });
  const outcome = close(states, 3);
  assert.equal(outcome.severity, "success");
  assert.match(outcome.message, /IA concluída: 5 de 5 artigos revisados\./);
  assert.match(outcome.message, /3 propostas de arquitetura prontas para revisão humana\./);
});

test("CASE D · 5 Articles com 1 erro real fecham 4/5 parcial", () => {
  const states = [noOp("a"), withProposals("b"), failed("c"), noOp("d"), withProposals("e")];

  assert.deepEqual(summarizeArticleAiExecutionStates(states), { requestedArticles: 5, completedArticles: 4, failedArticles: 1 });
  const outcome = close(states, 3);
  assert.equal(outcome.severity, "warning");
  assert.match(outcome.message, /IA · Parcial 4\/5 artigos\./);
  assert.match(outcome.message, /3 propostas de arquitetura prontas para revisão humana\./);
  assert.match(outcome.message, /1 artigo com erro\./);
  assert.doesNotMatch(outcome.message, /0\/5/);
});

test("CASE E · 5 Articles todos com erro fecham 0/5 e ERROR", () => {
  const states = ["a", "b", "c", "d", "e"].map(failed);

  assert.deepEqual(summarizeArticleAiExecutionStates(states), { requestedArticles: 5, completedArticles: 0, failedArticles: 5 });
  const outcome = close(states, 0);
  assert.equal(outcome.severity, "error");
  assert.match(outcome.message, /IA não concluída: 0 de 5 artigos revisados\./);
  assert.match(outcome.message, /5 artigos com erro\./);
});

test("CASE F · proposta pendente não reduz a contagem de concluídos", () => {
  const states = [withProposals("a"), withProposals("b"), withProposals("c")];

  const summary = summarizeArticleAiExecutionStates(states);

  assert.equal(summary.completedArticles, 3);
  assert.equal(summary.failedArticles, 0);
  // O volume de propostas não muda o fechamento da execução.
  for (const proposals of [0, 1, 7, 42]) {
    assert.equal(close(states, proposals).severity, "success");
    assert.match(close(states, proposals).message, /IA concluída: 3 de 3 artigos revisados\./);
  }
});

test("CASE G · pendência humana não é falha de execução", () => {
  // O único desfecho que conta como falha é ERROR; os dois COMPLETED_* concluem.
  assert.equal(summarizeArticleAiExecutionStates([withProposals("a")]).failedArticles, 0);
  assert.equal(summarizeArticleAiExecutionStates([noOp("a")]).failedArticles, 0);
  assert.equal(summarizeArticleAiExecutionStates([failed("a")]).failedArticles, 1);
  // A regressão de origem: contar por batchCount menos falhas acumuladas.
  assert.doesNotMatch(workspace, /const completedArticles = result\.batchCount - failedArticles/);
  assert.match(workspace, /summarizeArticleAiExecutionStates\(result\.aiExecutionStates \|\| \[\]\)/);
});

test("falha de registro canônico não derruba a execução, mas impede SUCCESS", () => {
  const states = [withProposals("a"), noOp("b")];

  const outcome = close(states, 2, 2);

  // Execução concluída: 2 de 2. Durabilidade é outra dimensão.
  assert.match(outcome.message, /IA concluída: 2 de 2 artigos revisados\./);
  assert.equal(outcome.severity, "warning");
  assert.match(outcome.message, /2 artigos revisados não tiveram o registro canônico confirmado/);
  assert.match(outcome.message, /pode não sobreviver ao F5/);
  // Sem falha de registro o mesmo lote é SUCCESS limpo.
  assert.equal(close(states, 2, 0).severity, "success");
});

test("o laço separa falha de execução de falha de registro", () => {
  // Registro canônico tem catch próprio: não empurra ERROR nem entra em aiFailures.
  assert.match(workspace, /registrationFailures\.push\(\{ articleId: batchArticleId/);
  assert.match(workspace, /aiRegistrationFailures: registrationFailures/);
  // O estado do Article é gravado antes do registro e nunca é reescrito por ele.
  const loop = workspace.slice(workspace.indexOf("const batchArticleId"), workspace.indexOf("if (!reviews.length)"));
  assert.ok(loop.indexOf("state: material.length ?") < loop.indexOf("registrationFailures.push"));
  assert.equal(loop.match(/state: "ERROR"/g)?.length, 2, "ERROR só no guard de payload e na falha de execução");
});

test("o readback não confirmado vira pendência de registro, não 0/N", () => {
  const readback = workspace.slice(workspace.indexOf("Confirmando o registro canônico"), workspace.indexOf("Repartição revisada; aguardando"));

  assert.match(readback, /await readbackArticleAiReviews\(persistedReviews\)/);
  assert.match(readback, /catch \(error\)/);
  assert.match(readback, /registrationFailures\.push/);
});

test("WARNING existe como severidade do Arquiteto", () => {
  assert.match(workspace, /const showNotification = useCallback\(\(type: "success" \| "warning" \| "error", msg: string\)/);
  assert.match(workspace, /type === "warning" \? "WARNING"/);
  assert.match(workspace, /showNotification\(outcome\.severity, outcome\.message\)/);
});
