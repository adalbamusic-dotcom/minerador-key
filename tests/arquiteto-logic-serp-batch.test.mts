import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveArticleProcessScope, scopedArticleProcessNotification } from "../lib/arquiteto/article-process-scope.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const serpRoute = readFileSync("app/api/arquiteto/serp/route.ts", "utf8");

// Lote real do smoke: 5 artigos, 14 keywords (1 + 5 + 6 + 1 + 1).
const articles = [
  { id: "art-1", workingArticleId: "wa-1" },
  { id: "art-2", workingArticleId: "wa-2" },
  { id: "art-3", workingArticleId: "wa-3" },
  { id: "art-4", workingArticleId: "wa-4" },
  { id: "art-5", workingArticleId: "wa-5" },
];
const masterList = [
  ...Array.from({ length: 1 }, (_, index) => ({ id: `kw-1-${index}`, workingArticleId: "wa-1" })),
  ...Array.from({ length: 5 }, (_, index) => ({ id: `kw-2-${index}`, workingArticleId: "wa-2" })),
  ...Array.from({ length: 6 }, (_, index) => ({ id: `kw-3-${index}`, workingArticleId: "wa-3" })),
  ...Array.from({ length: 1 }, (_, index) => ({ id: `kw-4-${index}`, workingArticleId: "wa-4" })),
  ...Array.from({ length: 1 }, (_, index) => ({ id: `kw-5-${index}`, workingArticleId: "wa-5" })),
];
const scope = resolveArticleProcessScope({
  selectedArticleIds: articles.map(article => article.id),
  articles,
  masterList,
  workingArticleIdFor: item => String(item.workingArticleId || ""),
});

test("5 artigos e 14 keywords permanecem contagens distintas no escopo", () => {
  assert.equal(scope.selectedWorkingArticleIds.length, 5);
  assert.equal(scope.selectedKeywordIds.length, 14);
});

test("a mensagem da Lógica não chama keyword de artigo", () => {
  const message = scopedArticleProcessNotification({
    processedArticleCount: scope.selectedWorkingArticleIds.length,
    processedKeywordCount: scope.selectedKeywordIds.length,
    workspaceArticleCount: 5,
    reservedCandidateCount: 0,
  });

  assert.equal(message, "5 artigos processados pela Lógica, envolvendo 14 keywords. Working copy com 5 artigos confirmada.");
  assert.doesNotMatch(message, /14 artigos/);
});

test("artigo unitário mantém singular e a contagem de keywords", () => {
  const message = scopedArticleProcessNotification({
    processedArticleCount: 1,
    processedKeywordCount: 1,
    workspaceArticleCount: 1,
    reservedCandidateCount: 0,
  });

  assert.equal(message, "1 artigo processado pela Lógica, envolvendo 1 keyword. Working copy com 1 artigo confirmada.");
});

test("a tarefa da Lógica publica as duas contagens a partir do escopo canônico", () => {
  assert.match(workspace, /processedArticleIds: scope\.selectedWorkingArticleIds/);
  assert.match(workspace, /processedKeywordIds: scope\.selectedKeywordIds/);
  assert.match(workspace, /processedKeywordCount: result\.processedKeywordIds\.length/);
});

test("a SERP de formação processa por artigo, com as keywords daquele artigo", () => {
  // Unidade de execução: um assessment por grupo/artigo, nunca um global.
  assert.match(serpRoute, /const settledAssessments = await Promise\.allSettled\(groups\.map\(async group => \{/);
  assert.match(serpRoute, /const articleId = group\.publishedAnchorId \|\| group\.id;/);
  assert.match(serpRoute, /group\.keywords\.map\(keyword =>/);
});

test("o erro da SERP deixa de ser genérico e declara o efeito no lote", () => {
  assert.match(workspace, /const detail = error instanceof Error && error\.message\.trim\(\)/);
  assert.match(workspace, /const message = detail \|\| architectFunctionalErrorMessage\("serp"\)/);
  assert.match(workspace, /Nenhum artigo do lote foi avaliado nesta execução/);
  assert.doesNotMatch(workspace, /a execução da SERP é atômica hoje/);
  assert.doesNotMatch(workspace, /\} catch \{\n      const message = architectFunctionalErrorMessage\("serp"\)/);
});

test("o servidor devolve estágio e código reais para a SERP", () => {
  assert.match(serpRoute, /stage: "request_validation" \| "connection_resolution" \| "provider_request" \| "response_normalization" \| "assessment" \| "completed"/);
  assert.match(serpRoute, /diagnostic,/);
  assert.match(serpRoute, /logSerpFailure\(diagnostic, error\)/);
});

test("a IA não chama o provider para artigo sem SERP válida", () => {
  // O gate passou a ser por Article: sem nenhuma SERP válida, nada é enviado.
  assert.match(workspace, /if \(missingSerp\.length && !eligibleGroups\.length\) \{/);
  assert.match(workspace, /Valide a SERP antes de revisar com IA/);
  assert.match(workspace, /const batches = buildArticleReviewBatches\(eligibleGroups\)/);
});
