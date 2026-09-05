import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/arquiteto/serp/route.ts", "utf8");
const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/** Reproduz a política do route: allSettled + erro global relançado. */
async function runBatch(groups: Array<{ id: string; fails?: "article" | "global" }>) {
  class GlobalError extends Error {}
  const settled = await Promise.allSettled(groups.map(async group => {
    if (group.fails === "global") throw new GlobalError("Conexão DataForSEO não resolvida.");
    if (group.fails === "article") throw new Error("KeywordDNA principal ausente no grupo.");
    return { articleId: group.id, queryCount: 1 };
  }));
  const assessments: Array<{ articleId: string; queryCount: number }> = [];
  const failures: Array<{ articleId: string; message: string }> = [];
  for (const [index, result] of settled.entries()) {
    const group = groups[index];
    if (result.status === "fulfilled") { assessments.push(result.value); continue; }
    if (result.reason instanceof GlobalError) throw result.reason;
    failures.push({ articleId: group.id, message: (result.reason as Error).message });
  }
  return { assessments, failures, summary: { requestedArticles: groups.length, completedArticles: assessments.length, failedArticles: failures.length } };
}

test("5 de 5 concluídos mantém o lote completo", async () => {
  const result = await runBatch([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }]);

  assert.equal(result.summary.completedArticles, 5);
  assert.equal(result.summary.failedArticles, 0);
  assert.equal(result.failures.length, 0);
});

test("4 sucessos e 1 falha específica preservam os assessments válidos", async () => {
  const result = await runBatch([{ id: "a" }, { id: "b" }, { id: "c", fails: "article" }, { id: "d" }, { id: "e" }]);

  assert.equal(result.summary.completedArticles, 4);
  assert.equal(result.summary.failedArticles, 1);
  assert.deepEqual(result.assessments.map(item => item.articleId), ["a", "b", "d", "e"]);
  assert.equal(result.failures[0].articleId, "c");
  // Falha nunca vira assessment.
  assert.equal(result.assessments.some(item => item.articleId === "c"), false);
});

test("1 sucesso e 4 falhas específicas ainda entregam o assessment válido", async () => {
  const result = await runBatch([
    { id: "a" }, { id: "b", fails: "article" }, { id: "c", fails: "article" }, { id: "d", fails: "article" }, { id: "e", fails: "article" },
  ]);

  assert.equal(result.summary.completedArticles, 1);
  assert.equal(result.summary.failedArticles, 4);
  assert.deepEqual(result.assessments.map(item => item.articleId), ["a"]);
});

test("erro global encerra o lote inteiro", async () => {
  await assert.rejects(
    () => runBatch([{ id: "a" }, { id: "b", fails: "global" }, { id: "c" }]),
    /Conexão DataForSEO não resolvida/,
  );
});

test("o route isola por Article e devolve failures e summary aditivos", () => {
  assert.match(route, /const settledAssessments = await Promise\.allSettled\(groups\.map\(async group => \{/);
  assert.match(route, /if \(error instanceof DataForSeoCanonicalError \|\| error instanceof IntegrationRuntimeError\) throw error;/);
  assert.match(route, /failures\.push\(describeArticleFailure\(\{/);
  assert.match(route, /summary: \{ requestedArticles: groups\.length, completedArticles: assessments\.length, failedArticles: failures\.length \}/);
  assert.match(route, /type SerpArticleFailure = \{/);
  assert.match(route, /retryable: boolean;/);
});

test("a falha por Article carrega estágio, código e motivo reais", () => {
  assert.match(route, /stage: SerpOperationDiagnostic\["stage"\];/);
  assert.match(route, /const code = failedQuery\?\.internalCode/);
  assert.match(route, /const retryable = code !== "SERP_ASSESSMENT_FAILED";/);
  assert.doesNotMatch(route, /message: "Falha genérica"/);
});

test("o cliente persiste somente assessments válidos e marca o artigo falho", () => {
  assert.match(workspace, /const incompleteAssessments = parsedAssessments\.filter/);
  assert.match(workspace, /const assessments = parsedAssessments\.filter\(assessment => !incompleteAssessments\.includes\(assessment\)\)/);
  assert.match(workspace, /const serverFailures: ArticleSerpFailure\[\] = result\.failures \|\| \[\];/);
  assert.match(workspace, /SERP parcial: \$\{completedCount\} de \$\{requestedCount\} artigo\(s\) concluído\(s\)/);
  // O estado por Article só é erro quando não existe avaliação vigente.
  assert.match(workspace, /status: latestSerpAssessmentFor\(failure\.articleId\) \? "ready" as const : "error" as const,/);
  // Nenhuma falha entra na lista persistida de assessments.
  assert.match(workspace, /await persistSerpState\(replaced, publicationVerifications, nextCandidateEvidence, merged\.confirmTargets\)/);
});

test("cada artigo com erro mostra estágio, motivo e retry só daquela unidade", () => {
  assert.match(workspace, /data-testid="architect-serp-article-error"/);
  assert.match(workspace, /Repetir SERP deste artigo/);
  assert.match(workspace, /confirmSerpValidation\(\[provisionalGroup\]\)/);
  assert.match(workspace, /Os demais artigos do lote mantêm as avaliações válidas\./);
  assert.match(workspace, /execution\?\.retryable !== false/);
});

test("a IA fica bloqueada apenas para o artigo sem SERP válida", () => {
  assert.match(workspace, /const eligibleGroups = groups\.filter\(group => latestSerpAssessmentFor\(group\.publishedAnchorId \|\| group\.id\)\)/);
  assert.match(workspace, /if \(missingSerp\.length && !eligibleGroups\.length\) \{/);
  assert.match(workspace, /const batches = buildArticleReviewBatches\(eligibleGroups\)/);
  assert.match(workspace, /ficaram de fora da revisão com IA por falta de SERP válida/);
});

test("nenhuma SERP automática e nenhuma movimentação de KeywordDNA", () => {
  // A execução continua saindo de ação humana explícita.
  assert.match(workspace, /const handleValidateSerp = \(\) => \{/);
  assert.doesNotMatch(workspace, /useEffect\(\(\) => \{\s*void confirmSerpValidation/);
  // A SERP é observacional: o route não escreve na KeywordDNA nem move keywords.
  assert.doesNotMatch(route, /minerador_keywords/);
  assert.doesNotMatch(route, /analise_semantica:/);
});
