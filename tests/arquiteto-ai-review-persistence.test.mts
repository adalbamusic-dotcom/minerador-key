import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARTICLE_AI_REVIEW_ARTIFACT_TYPE,
  ArticleArchitectureAiReviewSchema,
  applyHumanProposalDecisions,
  articleAiProposalId,
  buildArticleAiReviewPayload,
  currentArticleAiReviews,
  resolveArticleAiReviewBase,
  resolveArticleAiReviewReadout,
  type ArticleAiReviewProposalInput,
  type VersionedArticleArchitectureAiReview,
} from "../lib/arquiteto/article-ai-review.ts";
import { contentHash, createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { deriveArticleProcessReadModel } from "../lib/arquiteto/article-process-read-model.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const persistence = readFileSync("lib/server/arquiteto-persistence.ts", "utf8");
const artifactsRoute = readFileSync("app/api/arquiteto/artifacts/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260829120000_article_architecture_ai_review_artifact.sql", "utf8");

const BRAND = "brand-1";
const ARTICLE = "artigo-1";

const baseFor = (overrides: { role?: "principal" | "secundaria" | "reforco_narrativo" } = {}) =>
  resolveArticleAiReviewBase({
    articleId: ARTICLE,
    principalKeywordId: "kw-1",
    keywords: [
      { keywordId: "kw-1", role: "principal" },
      { keywordId: "kw-2", role: overrides.role || "secundaria" },
    ],
    articleDna: null,
    serpAssessment: { id: "serp-formation:brand-1:artigo-1:v2", version: 2, contentHash: `sha256:${"a".repeat(64)}` },
  });

const proposalFixture = (overrides: Partial<ArticleAiReviewProposalInput> = {}): ArticleAiReviewProposalInput => ({
  keywordId: "kw-2",
  keyword: "principia sérum",
  changeType: "mover_para_artigo",
  currentRole: "secundaria",
  currentSiloId: "silo-1",
  proposedRole: "principal",
  targetArticleId: "artigo-2",
  newArticleKey: null,
  siloAction: "manter_silo",
  siloId: "silo-1",
  siloName: "Sérum facial",
  newSiloKey: null,
  reason: "Contrato de busca distinto do artigo atual.",
  evidence: ["Baixa sobreposição no Top 10."],
  ...overrides,
});

const payloadFor = async (proposals: ArticleAiReviewProposalInput[], base?: Awaited<ReturnType<typeof baseFor>>) =>
  buildArticleAiReviewPayload({
    brandId: BRAND,
    articleId: ARTICLE,
    base: base || await baseFor(),
    provider: "deepseek",
    model: "deepseek-chat",
    promptContract: null,
    rawProposalCount: proposals.length + 1,
    proposals,
  });

const versionFor = async (payload: Awaited<ReturnType<typeof payloadFor>>, versionNumber = 1, previousVersionId: string | null = null) =>
  await createVersionEnvelope({
    entityId: ARTICLE,
    versionNumber,
    previousVersionId,
    origin: "ai",
    changeReason: "Revisão arquitetural por IA executada por Article.",
    createdBy: "user-1",
    payload,
  }) as VersionedArticleArchitectureAiReview;

test("NO_OP é resultado persistido, não ausência de registro", async () => {
  const payload = await payloadFor([]);

  assert.equal(payload.execution.state, "COMPLETED_NO_PROPOSALS");
  assert.equal(payload.execution.materialProposalCount, 0);
  assert.equal(payload.humanDecision, "no_action");
  assert.deepEqual(payload.proposals, []);
  // O contrato aceita o NO_OP como versão válida do artefato.
  assert.doesNotThrow(() => ArticleArchitectureAiReviewSchema.parse(payload));
});

test("depois do F5 o NO_OP continua sendo execução concluída", async () => {
  const payload = await payloadFor([]);
  const readout = resolveArticleAiReviewReadout({ review: payload, currentBaseContentHash: payload.base.articleContentHash });

  assert.equal(readout.state, "COMPLETED_NO_PROPOSALS");
  assert.equal(readout.stale, false);
  assert.equal(readout.label, "Concluída sem propostas");
  // Sem sessão nenhuma, o read-model do artigo não volta para "não executada".
  const model = deriveArticleProcessReadModel({
    logicProcessing: false, hasLogicalOutput: true, serpProcessing: false, hasSerpAssessment: true, serpHasError: false,
    aiProcessing: false, pendingProposalCount: 0, annotations: [], humanPendingDecisionCount: 0, reviewProcessing: false,
    durableAiState: "COMPLETED_NO_PROPOSALS", durableMaterialProposalCount: 0, durablePendingProposalCount: 0, aiBaseChanged: false,
  });
  assert.equal(model.ai.state, "COMPLETED_NO_PROPOSALS");
  assert.equal(model.review.state, "COMPLETED");
  assert.equal(model.review.pendingCount, 0);
});

test("propostas materiais sobrevivem com id estável e estado humano pendente", async () => {
  const payload = await payloadFor([proposalFixture()]);

  assert.equal(payload.execution.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(payload.proposals.length, 1);
  assert.equal(payload.proposals[0].proposalId, articleAiProposalId(ARTICLE, "kw-2", "mover_para_artigo"));
  assert.equal(payload.proposals[0].reviewState, "pending");
  assert.equal(payload.proposals[0].materialChange, true);
  assert.equal(payload.humanDecision, "pending");
  const model = deriveArticleProcessReadModel({
    logicProcessing: false, hasLogicalOutput: true, serpProcessing: false, hasSerpAssessment: true, serpHasError: false,
    aiProcessing: false, pendingProposalCount: 0, annotations: [], humanPendingDecisionCount: 0, reviewProcessing: false,
    durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 1, durablePendingProposalCount: 1, aiBaseChanged: false,
  });
  assert.equal(model.ai.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(model.ai.proposalCount, 1);
  assert.equal(model.review.pendingCount, 1);
});

test("mesma base e mesmo resultado produzem o mesmo contentHash", async () => {
  const first = await versionFor(await payloadFor([proposalFixture()]));
  const second = await versionFor(await payloadFor([proposalFixture()]));

  // A fundação devolve UNCHANGED quando o hash da vigente é igual.
  assert.equal(first.contentHash, second.contentHash);
  assert.match(first.contentHash, /^sha256:[a-f0-9]{64}$/);
});

test("base alterada gera novo hash mesmo com resultado idêntico", async () => {
  const original = await payloadFor([proposalFixture()]);
  const moved = await payloadFor([proposalFixture()], await baseFor({ role: "reforco_narrativo" }));

  assert.notEqual(original.base.articleContentHash, moved.base.articleContentHash);
  assert.notEqual(await contentHash(original), await contentHash(moved));
  // O resultado editorial é o mesmo; o que mudou foi a base revisada.
  assert.deepEqual(original.proposals, moved.proposals);
});

test("o hash da base ignora a SERP e a ordem das keywords", async () => {
  const first = await resolveArticleAiReviewBase({
    articleId: ARTICLE,
    principalKeywordId: "kw-1",
    keywords: [{ keywordId: "kw-2", role: "secundaria" }, { keywordId: "kw-1", role: "principal" }],
    serpAssessment: { id: "serp-a", version: 1, contentHash: `sha256:${"b".repeat(64)}` },
  });
  const second = await baseFor();

  assert.equal(first.articleContentHash, second.articleContentHash);
  assert.deepEqual(first.keywordIds, ["kw-1", "kw-2"]);
  // A referência da SERP é registrada, mas reexecutar SERP não invalida a revisão.
  assert.equal(first.serpAssessmentId, "serp-a");
  assert.equal(second.serpAssessmentId, "serp-formation:brand-1:artigo-1:v2");
});

test("ArticleDNA consolidado vira a base declarada da revisão", async () => {
  const dnaHash = `sha256:${"c".repeat(64)}`;
  const base = await resolveArticleAiReviewBase({
    articleId: ARTICLE,
    principalKeywordId: "kw-1",
    keywords: [{ keywordId: "kw-1", role: "principal" }],
    articleDna: { versionId: "article-dna:v3", versionNumber: 3, contentHash: dnaHash },
  });

  assert.equal(base.articleContentHash, dnaHash);
  assert.equal(base.articleVersionId, "article-dna:v3");
  assert.equal(base.articleVersionNumber, 3);
});

test("base divergente marca STALE e não vale como revisão vigente", async () => {
  const payload = await payloadFor([proposalFixture()]);
  const readout = resolveArticleAiReviewReadout({ review: payload, currentBaseContentHash: `sha256:${"d".repeat(64)}` });

  assert.equal(readout.state, "STALE");
  assert.equal(readout.stale, true);
  assert.match(readout.label, /Estrutura mudou/);
  const model = deriveArticleProcessReadModel({
    logicProcessing: false, hasLogicalOutput: true, serpProcessing: false, hasSerpAssessment: true, serpHasError: false,
    aiProcessing: false, pendingProposalCount: 0, annotations: [], humanPendingDecisionCount: 0, reviewProcessing: false,
    durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 1, durablePendingProposalCount: 1, aiBaseChanged: true,
  });
  // A revisão existe e é de outra base: DESATUALIZADA, nunca "não executada".
  assert.equal(model.ai.state, "STALE");
  assert.equal(model.ai.historicalProposalCount, 1);
  // STALE não vira pendência: não bloqueia a aprovação do ArticleDNA.
  assert.equal(model.ai.proposalCount, 0);
  assert.equal(model.review.pendingCount, 0);
  assert.equal(model.review.state, "NOT_REQUIRED");
});

test("decisão humana vira sucessora sem reescrever o resultado da IA", async () => {
  const payload = await payloadFor([proposalFixture(), proposalFixture({ keywordId: "kw-3", changeType: "criar_novo_artigo", targetArticleId: null, newArticleKey: "novo-1" })]);
  const accepted = applyHumanProposalDecisions(payload, [
    { proposalId: articleAiProposalId(ARTICLE, "kw-2", "mover_para_artigo"), reviewState: "accepted" },
  ], "user-1");

  assert.equal(accepted.humanDecision, "partially_decided");
  assert.equal(accepted.proposals.find(item => item.keywordId === "kw-2")?.reviewState, "accepted");
  assert.equal(accepted.proposals.find(item => item.keywordId === "kw-2")?.decidedBy, "user-1");
  assert.equal(accepted.proposals.find(item => item.keywordId === "kw-3")?.reviewState, "pending");
  // O resultado da IA permanece intacto: execução e contagem não mudam.
  assert.deepEqual(accepted.execution, payload.execution);
  assert.equal(accepted.base.articleContentHash, payload.base.articleContentHash);

  const resolved = applyHumanProposalDecisions(accepted, [
    { proposalId: articleAiProposalId(ARTICLE, "kw-3", "criar_novo_artigo"), reviewState: "rejected" },
  ], "user-1");
  assert.equal(resolved.humanDecision, "resolved");
  const readout = resolveArticleAiReviewReadout({ review: resolved, currentBaseContentHash: resolved.base.articleContentHash });
  assert.equal(readout.pendingProposalCount, 0);
  assert.equal(readout.state, "COMPLETED_WITH_PROPOSALS");
});

test("uma revisão vigente por Article; as anteriores ficam no histórico", async () => {
  const first = await versionFor(await payloadFor([]));
  const second = await versionFor(await payloadFor([proposalFixture()]), 2, first.versionId);
  const otherBrand = { ...second, payload: { ...second.payload, brandId: "brand-2" } } as VersionedArticleArchitectureAiReview;

  const current = currentArticleAiReviews([first, second, otherBrand], BRAND);

  assert.equal(Object.keys(current).length, 1);
  assert.equal(current[ARTICLE].versionNumber, 2);
  assert.equal(current[ARTICLE].versionId, second.versionId);
  // Brand A nunca lê a revisão da Brand B.
  assert.equal(currentArticleAiReviews([otherBrand], BRAND)[ARTICLE], undefined);
});

test("o contrato recusa payload incoerente entre estado e propostas", async () => {
  const payload = await payloadFor([proposalFixture()]);

  assert.throws(() => ArticleArchitectureAiReviewSchema.parse({ ...payload, proposals: [] }));
  assert.throws(() => ArticleArchitectureAiReviewSchema.parse({
    ...payload,
    execution: { ...payload.execution, state: "COMPLETED_NO_PROPOSALS" },
  }));
  assert.throws(() => ArticleArchitectureAiReviewSchema.parse({ ...payload, humanDecision: "no_action" }));
});

test("a fundação compartilhada é reutilizada, sem tabela nova", () => {
  assert.match(migration, /editorial_artifact_versions/);
  assert.match(migration, /'article_architecture_ai_review'::text/);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /create policy/i);
  // O escopo é marca + tipo + article.
  assert.match(persistence, /if \(type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE\) return \(payload as ArticleArchitectureAiReview\)\.articleId;/);
  assert.match(artifactsRoute, /artifactType: z\.enum\(\["article_dna", "silo_dna", "silo_page", ARTICLE_AI_REVIEW_ARTIFACT_TYPE\]\)/);
  assert.equal(ARTICLE_AI_REVIEW_ARTIFACT_TYPE, "article_architecture_ai_review");
});

test("a versão base declarada precisa ser um ArticleDNA canônico da mesma Brand", () => {
  assert.match(persistence, /async function resolveAiReviewSourceVersionId\(/);
  assert.match(persistence, /if \(!baseVersionId\) return null;/);
  assert.match(persistence, /A versão base da revisão não corresponde a um ArticleDNA canônico da mesma Brand\./);
  assert.match(persistence, /O hash da base revisada não corresponde à versão de ArticleDNA declarada\./);
});

test("a escrita é server-side, com readback obrigatório antes do sucesso", () => {
  assert.match(workspace, /const persisted = await persistArquitetoArtifact\(\{\n\s*brandId: selectedBrandId,\n\s*artifactType: ARTICLE_AI_REVIEW_ARTIFACT_TYPE,/);
  assert.match(workspace, /const readbackArticleAiReviews = async \(versions: readonly VersionedArticleArchitectureAiReview\[\]\) => \{/);
  assert.match(workspace, /A revisão da IA não foi confirmada no readback canônico/);
  assert.match(workspace, /await readbackArticleAiReviews\(persistedReviews\);/);
  // Nenhuma fonte local disputa a canônica.
  assert.doesNotMatch(workspace, /writeBrowserArtifact\([^)]*aiReview/);
});

test("a hidratação recupera a revisão vigente ao carregar o Arquiteto", () => {
  assert.match(workspace, /setArticleAiReviews\(currentArticleAiReviews\(canonical\.aiReviews, selectedBrandId\)\);/);
  assert.match(workspace, /durableAiState: durableAiReview\.state === "COMPLETED_NO_PROPOSALS" \|\| durableAiReview\.state === "COMPLETED_WITH_PROPOSALS"/);
  assert.match(workspace, /aiBaseChanged: durableAiReview\.stale,/);
  assert.match(workspace, /data-testid="architect-ai-stale"/);
});
