import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CompactProviderResponseSchema } from "../lib/arquiteto/keyword-review-provider.ts";
import { classifyArchitectDeepSeekFailure } from "../lib/arquiteto/deepseek-diagnostics.ts";
import { aiReviewErrorMessage } from "../lib/arquiteto/ai-review-error.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

test("resposta valida da IA vira proposta pendente somente para o artigo selecionado", () => {
  const compact = CompactProviderResponseSchema.parse({
    decisions: [{ keywordId: "kw-A", sourceGroupId: "group-A", action: "manter_no_artigo", targetGroupId: null, newArticleKey: null, suggestedRole: "principal", justification: "Mantem a intencao do artigo.", confidence: 0.9, humanDecision: null }],
    conflicts: [],
    summary: "Proposta pronta.",
  });
  assert.equal(compact.decisions[0].keywordId, "kw-A");
  assert.equal(compact.decisions[0].sourceGroupId, "group-A");
  assert.match(workspace, /onClick: workspaceMode === "articles" \? handleRevalidateStructure/);
  assert.match(workspace, /focusGroups: batches\[index\]/);
  assert.match(workspace, /const articleCatalog = buildRelevantArticleCatalog\(currentGroups, batches\[index\]\)\.filter\(article => batchGroupIds\.has\(article\.groupId\)\)/);
  assert.match(workspace, /mutationArticleIds: groups\.map\(group => group\.publishedAnchorId \|\| group\.id\)/);
  assert.match(workspace, /setPendingKeywordReview\(\{ review: result\.review, batchCount: result\.batchCount, mutationArticleIds: result\.mutationArticleIds, mutationKeywordIds: result\.mutationKeywordIds/);
  assert.match(workspace, /setMapAiKeywordReviewSnapshot\(\{ review: result\.review, batchCount: result\.batchCount, mutationArticleIds: result\.mutationArticleIds, mutationKeywordIds: result\.mutationKeywordIds/);
});

test("resposta truncada nao vira proposta e recebe diagnostico especifico", () => {
  const stage = classifyArchitectDeepSeekFailure({ providerResolved: true, requestStarted: true, httpStatus: 200, finishReason: "length", nativeFinishReason: null, contentPresent: true, reasoningPresent: false, jsonParsed: false, zodPassed: false, proposalValidated: false });
  assert.equal(stage, "finish_reason_length");
  assert.equal(aiReviewErrorMessage(stage, "Não foi possível concluir a revisão com IA."), "Resposta da IA incompleta.");
  assert.equal(CompactProviderResponseSchema.safeParse({ decisions: [], conflicts: [], summary: "incompleta" }).success, false);
});
