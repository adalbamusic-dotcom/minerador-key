import assert from "node:assert/strict";
import test from "node:test";
import { ContentPlanSchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { createStatusEvent, createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { ContentPlanProtectionError, createContentPlanSuccessor, contentPlanApprovalIssues, createDefinitiveContentPlan } from "../lib/planejador/content-plan.ts";
import { buildKeywordStrategySnapshot, keywordStrategyIssues } from "../lib/planejador/keyword-strategy.ts";
import type { PlannerPublicationIdentity } from "../lib/planejador/publication-identity.ts";

const reference = (id: string, role: "principal" | "secundaria") => ({ keywordId: id, keywordDnaVersionId: `legacy:${id}:v1`, keywordDnaContentHash: `legacy:${id}`, role, strategicContribution: "Cobertura editorial", coveredIntentions: ["informacional"], requiredTopics: ["fundamentos"], excludedTopics: [], classificationOrigin: "legacy" as const, confidence: 0.8, humanConfirmed: true });
const article: ArticleDNA = {
  schemaVersion: 1, articleId: "article-1", brandId: "brand-1", principalKeywordId: "kw-1", secondaryKeywordIds: ["kw-2"], narrativeReinforcementIds: [],
  keywordReferences: [reference("kw-1", "principal"), reference("kw-2", "secundaria")], siloId: "silo-1", hierarchy: "Pilar", suggestedSlug: "guia-seo", canonical: null,
  mainIntent: "informacional", auxiliaryIntents: [], audience: "Gestores", problem: "Baixa demanda", desiredResult: "Demanda orgânica", journeyStage: "consideração", brandObjective: "Crescer",
  promise: "Construir demanda orgânica", angle: "Ativo editorial próprio", cta: "Fale com a equipe", coverage: ["fundamentos", "execução"], excludedSubjects: [], antiCannibalizationBoundary: "Não cobrir mídia paga",
  nearbyArticleIds: [], differentiation: ["Experiência prática"], entities: ["SEO"], requiredTopics: ["Fundamentos", "Execução"], questions: ["Por onde começar?"], objections: ["Quanto tempo leva?"], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.8, humanPendingDecisions: [],
};

const version = async () => createVersionEnvelope({ entityId: article.articleId, versionNumber: 1, origin: "human", changeReason: "Fixture aprovado", createdBy: "human", payload: article }) as Promise<Readonly<VersionEnvelope<ArticleDNA>>>;

test("ContentPlan definitivo preserva refs e representa a estrutura editorial", async () => {
  const articleVersion = await version();
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion }, "human");
  assert.equal(plan.payload.schemaVersion, 2);
  assert.equal(plan.payload.planning?.structure.h1, article.promise);
  assert.deepEqual(plan.payload.keywordDnaRefs.map(item => item.versionId), ["legacy:kw-1:v1", "legacy:kw-2:v1"]);
  assert.equal(ContentPlanSchema.safeParse(plan.payload).success, true);
  assert.equal(plan.payload.planning?.keywordStrategy?.keywordCount, 2);
  assert.equal(plan.payload.planning?.keywordStrategy?.volume.coverage, "unavailable");
});

test("uma principal sozinha é válida e o teto de apoio não é objetivo", async () => {
  const principalOnly = { ...article, secondaryKeywordIds: [], keywordReferences: [reference("kw-1", "principal")] };
  const articleVersion = await createVersionEnvelope({ entityId: principalOnly.articleId, versionNumber: 1, origin: "human", changeReason: "Fixture", createdBy: "human", payload: principalOnly });
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: principalOnly.articleId, article: articleVersion as VersionEnvelope<ArticleDNA> }, "human");
  assert.equal(plan.payload.planning?.keywordStrategy?.keywordCount, 1);
  assert.deepEqual(plan.payload.planning?.keywordStrategy?.secondary, []);
  assert.deepEqual(contentPlanApprovalIssues(plan, "brand-1"), []);
});

test("volume parcial e conflito KGR ficam explícitos sem inferência", async () => {
  const conflicted = { ...article, keywordReferences: [{ ...reference("kw-1", "principal"), volume: 20 }, reference("kw-2", "secundaria")], kgrIdentity: { isKgrArticle: true, source: "minerador" as const, bindingStatus: "conflict" as const, status: "conflict" as const, kgrValue: 0.04, resultCount: 120, boundSlug: "slug-anterior" } };
  const articleVersion = await createVersionEnvelope({ entityId: conflicted.articleId, versionNumber: 1, origin: "human", changeReason: "Fixture", createdBy: "human", payload: conflicted });
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: conflicted.articleId, article: articleVersion as VersionEnvelope<ArticleDNA> }, "human");
  const strategy = plan.payload.planning?.keywordStrategy;
  assert.equal(strategy?.volume.coverage, "partial");
  assert.equal(strategy?.kgr.status, "conflict");
  assert.ok(contentPlanApprovalIssues(plan, "brand-1").some(issue => /KGR/.test(issue)));
});

test("keyword de apoio pode ser coberta por tópico sem virar heading", async () => {
  const articleVersion = await version();
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion }, "human");
  const strategy = buildKeywordStrategySnapshot({ article, details: plan.payload.planning!, keywordLabels: { "kw-2": "execução" } });
  const secondary = strategy.coverage.find(item => item.keywordId === "kw-2");
  assert.equal(secondary?.role, "secundaria");
  assert.ok(["covered", "partial"].includes(secondary?.status || ""));
  assert.equal(strategy.secondary[0]?.role, "secundaria");
  assert.deepEqual(keywordStrategyIssues(strategy, article), []);
});

test("edição cria sucessora imutável e a aprovação exige evento humano", async () => {
  const articleVersion = await version();
  const first = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion }, "human");
  const details = structuredClone(first.payload.planning!);
  details.structure.h1 = "H1 revisado pela pessoa responsável";
  const successor = await createContentPlanSuccessor(first, details, "human");
  assert.equal(successor.previousVersionId, first.versionId);
  assert.equal(successor.versionNumber, 2);
  assert.equal(first.payload.planning?.structure.h1, article.promise);
  assert.deepEqual(contentPlanApprovalIssues(successor, "brand-1"), []);
  assert.notDeepEqual(successor.contentHash, first.contentHash);
  assert.equal(contentPlanApprovalIssues(successor, "brand-2").length, 1);
  const approval = createStatusEvent(successor.versionId, "approved", "human", "Revisão concluída");
  assert.equal(approval.status, "approved");
});

test("claim sem fonte permanece bloqueador e ausência de SERP não vira evidência", async () => {
  const sourceArticle = { ...article, sourcesNeeded: ["Confirmar a afirmação"] };
  const articleVersion = await createVersionEnvelope({ entityId: sourceArticle.articleId, versionNumber: 1, origin: "human", changeReason: "Fixture", createdBy: "human", payload: sourceArticle });
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: sourceArticle.articleId, article: articleVersion as VersionEnvelope<ArticleDNA> }, "human");
  assert.equal(plan.payload.serpEvidenceRefs.length, 0);
  assert.ok(contentPlanApprovalIssues(plan, "brand-1").some(issue => /fonte/.test(issue)));
});

test("ContentPlan recebe RadarEvidencePackage de forma aditiva", async () => {
  const articleVersion = await version();
  const evidencePackage = { schemaVersion: 1, packageType: "radar_evidence", serp: { snapshotId: "serp-1", query: "seo local" }, observedStructure: { sampleSize: 9 } };
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion, radarAnalysisPackage: { analysisVersionId: "analysis-1", analysisMode: "kgr_light", packageHash: "hash-1", evidencePackage } }, "human");
  assert.deepEqual(plan.payload.planning?.radar.evidencePackage, evidencePackage);
  assert.deepEqual(plan.payload.planning?.radar.requirements, []);
  assert.equal(plan.payload.planning?.radar.analysisEnforcement, null);
});

test("ContentPlan publicado protege identidade e permite edicao editorial", async () => {
  const articleVersion = await version();
  const first = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion }, "human");
  const identity: PlannerPublicationIdentity = { state: "published", label: "Publicado protegido", protected: true, source: "legacy_briefing", brandId: "brand-1", brandName: "Marca fixture", articleId: article.articleId, siloId: "silo-1", publicationRecordId: "article-1", slug: first.payload.planning!.metadata.slug, canonical: null, publishedUrl: null, publishedAt: null };
  const editorialUpdate = structuredClone(first.payload.planning!);
  editorialUpdate.strategy.angle = "Novo angulo editorial";
  const successor = await createContentPlanSuccessor(first, editorialUpdate, "human", undefined, { publicationIdentity: identity });
  assert.equal(successor.versionNumber, 2);

  const identityChange = structuredClone(first.payload.planning!);
  identityChange.metadata.slug = "slug-alterado";
  await assert.rejects(() => createContentPlanSuccessor(first, identityChange, "human", undefined, { publicationIdentity: identity }), (error: unknown) => error instanceof ContentPlanProtectionError && error.issues.some(issue => /slug/.test(issue)));
});
