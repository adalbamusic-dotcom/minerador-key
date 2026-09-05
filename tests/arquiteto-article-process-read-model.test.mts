import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { aggregateArticleProcessReadModels, deriveArticleProcessReadModel } from "../lib/arquiteto/article-process-read-model.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const base = {
  logicProcessing: false, hasLogicalOutput: true,
  serpProcessing: false, hasSerpAssessment: true, serpHasError: false,
  aiProcessing: false, annotations: [], humanPendingDecisionCount: 0, reviewProcessing: false,
} as const;

test("proposta de IA pendente é concluída pela IA e pendente na revisão", () => {
  const model = deriveArticleProcessReadModel({ ...base, pendingProposalCount: 3 });
  assert.equal(model.ai.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(model.ai.proposalCount, 3);
  assert.equal(model.review.state, "PENDING");
  assert.equal(model.review.pendingCount, 3);
});

test("proposta aplicada permanece visível e pendente até o pente-fino humano", () => {
  const model = deriveArticleProcessReadModel({
    ...base, pendingProposalCount: 0,
    annotations: Array.from({ length: 3 }, () => ({ reviewState: "pending_fine_review" as const })),
  });
  assert.equal(model.ai.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(model.ai.proposalCount, 3);
  assert.equal(model.review.state, "PENDING");
  assert.equal(model.review.pendingCount, 3);
});

test("pente-fino concluído não reclassifica a execução de IA", () => {
  const model = deriveArticleProcessReadModel({
    ...base, pendingProposalCount: 0,
    annotations: Array.from({ length: 3 }, () => ({ reviewState: "reviewed" as const })),
  });
  assert.equal(model.ai.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(model.review.state, "COMPLETED");
  assert.equal(model.review.pendingCount, 0);
});

test("sem execução não inventa proposta nem revisão", () => {
  const model = deriveArticleProcessReadModel({ ...base, hasLogicalOutput: false, hasSerpAssessment: false, pendingProposalCount: 0 });
  assert.equal(model.logic.state, "NOT_RUN");
  assert.equal(model.serp.state, "NOT_RUN");
  assert.equal(model.ai.state, "NOT_RUN");
  assert.equal(model.review.state, "NOT_REQUIRED");
});

test("Workbench agrega as projeções por artigo sem reler fontes paralelas", () => {
  const completed = deriveArticleProcessReadModel({ ...base, pendingProposalCount: 0, annotations: [{ reviewState: "reviewed" }] });
  const pending = deriveArticleProcessReadModel({ ...base, pendingProposalCount: 1 });
  const aggregate = aggregateArticleProcessReadModels([completed, pending]);
  assert.equal(aggregate.logic, "completed");
  assert.equal(aggregate.serp, "completed");
  assert.equal(aggregate.ai, "completed");
  assert.equal(aggregate.review, "pending");
});

test("linha, topo e painel expandido consomem o read model único", () => {
  assert.match(workspace, /const articleProcessReadModelFor = useCallback/);
  assert.match(workspace, /scopedArticles\.map\(articleProcessReadModelFor\)/);
  assert.match(workspace, /aggregateArticleProcessReadModels\(scopedArticleProcessModels\)/);
  assert.match(workspace, /const articleProcess = articleProcessReadModelFor\(art\)/);
  assert.match(workspace, /articleProcess\.review\.pendingCount/);
  assert.match(workspace, /articleAiStateLabel\(articleProcess\.ai\.state\)/);
  assert.match(workspace, /articleReviewStateLabel\(articleProcess\.review\.state\)/);
});

test("as tabs internas navegam localmente sem disparar executor", () => {
  const tabSegment = workspace.slice(workspace.indexOf("role=\"tablist\""), workspace.indexOf("{expandedProcessTab === \"logic\""));
  assert.match(tabSegment, /setExpandedProcessTabs/);
  assert.doesNotMatch(tabSegment, /handleValidateSerp|handleRevalidateStructure|processDeterministicStructure|confirmSelectedArchitectures/);
});

test("falha de lock e falha de confirmação continuam auditáveis", () => {
  const repository = readFileSync("lib/server/pipeline-repositories.ts", "utf8");
  assert.match(repository, /\.eq\("lock_version", expectedLock\)/);
  assert.match(repository, /O item de workflow foi alterado ou não pertence à Brand/);
  assert.match(workspace, /if \(!persisted\) \{\s*showNotification\("error", "A proposta não foi aplicada: a working copy não confirmou o salvamento\."\);\s*return;/);
});
