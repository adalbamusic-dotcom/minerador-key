import assert from "node:assert/strict";
import test from "node:test";
import { ContentPlanSchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { createStatusEvent, createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { ContentPlanProtectionError, createContentPlanSuccessor, contentPlanApprovalIssues, createDefinitiveContentPlan } from "../lib/planejador/content-plan.ts";
import { buildKeywordStrategySnapshot, keywordStrategyIssues } from "../lib/planejador/keyword-strategy.ts";
import { readPlannerRadarEvidence } from "../lib/planejador/deterministic-plan.ts";
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

test("ContentPlan determinístico transforma evidência Radar em gabarito, seções e plano visual", async () => {
  const articleVersion = await version();
  const radarAnalysisPackage = {
    analysisMode: "competitive_full" as const,
    analysisEnforcement: "required" as const,
    requirements: ["Responder à intenção principal"],
    recommendations: ["Usar exemplos comparáveis"],
    observedData: ["Amostra competitiva aprovada"],
    humanDecisions: ["radar_report: approved"],
    evidencePackage: {
      schemaVersion: 1,
      packageType: "radar_evidence",
      serp: { provider: "dataforseo", query: "construir demanda orgânica" },
      relevantQuestions: [{ key: "q1", text: "Como começar a construir demanda?", note: "" }],
      relevantEntities: [{ text: "busca orgânica", source: "h1", note: "" }],
      observedSemantics: { entities: ["conteúdo próprio"], recurringTopics: ["execução"] },
      observedStructure: { sampleSize: 5, wordCounts: { median: 1200, typicalRange: [900, 1500] } },
    },
  };
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion, radarAnalysisPackage }, "human", "2026-08-27T12:00:00.000Z");
  const details = plan.payload.planning!;
  assert.deepEqual(details.gabarito?.globalWords, { min: 900, ideal: 1200, max: 1500 });
  assert.equal(details.gabarito?.counts.images, 3);
  assert.equal(details.images.length, 3);
  assert.deepEqual(details.images.map(image => image.visualFunction), ["cover", "breathing", "breathing"]);
  assert.ok(details.images.every(image => image.status === "planned" && image.prompt === null));
  assert.ok(details.structure.sections.every(section => section.wordRange && section.paragraphRange && section.estimatedParagraphs !== null));
  assert.ok(details.questions.some(item => item.text === "Como começar a construir demanda?"));
  assert.ok(details.entities.some(item => item.text === "busca orgânica"));
  assert.equal(details.blocks.filter(block => block.type === "faq").length, 0);
  assert.ok(details.guardianInstructions.some(instruction => /não gerar FAQ/i.test(instruction)));
  assert.deepEqual(details.radar.evidencePackage, radarAnalysisPackage.evidencePackage);
  assert.equal(readPlannerRadarEvidence(details.radar).wordRange?.ideal, 1200);
});

test("ContentPlan sem amostra Radar não inventa extensão, fontes, links ou URLs", async () => {
  const articleVersion = await version();
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion }, "human", "2026-08-27T12:00:00.000Z");
  const details = plan.payload.planning!;
  assert.deepEqual(details.gabarito?.globalWords, { min: null, ideal: null, max: null });
  assert.equal(details.gabarito?.estimatedParagraphs, null);
  assert.equal(details.images.length, 3);
  assert.equal(details.sources.length, 0);
  assert.equal(details.internalLinks.length, 0);
  assert.ok(details.images.every(image => image.prompt === null && image.altText === null));
  assert.ok(plan.payload.humanPendingDecisions.some(decision => /Radar aprovado/i.test(decision)));
});

test("a construção determinística é estável para a mesma entrada e data", async () => {
  const articleVersion = await version();
  const input = { brandId: "brand-1", editorialUnitType: "article" as const, editorialUnitId: article.articleId, article: articleVersion };
  const first = await createDefinitiveContentPlan(input, "human", "2026-08-27T12:00:00.000Z");
  const second = await createDefinitiveContentPlan(input, "human", "2026-08-27T12:00:00.000Z");
  assert.deepEqual(second.payload, first.payload);
});
