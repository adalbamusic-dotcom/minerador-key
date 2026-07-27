import assert from "node:assert/strict";
import test from "node:test";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { createDefinitiveContentPlan } from "../lib/planejador/content-plan.ts";
import { hydratePlanner, UNHYDRATED_REFERENCE } from "../lib/planejador/hydration.ts";
import { addOutlineSection, calculateOutlineMetrics, hasMaterialPlanChange, moveOutlineSection } from "../lib/planejador/outline.ts";
import { buildCockpitViewModel, findDefinitiveContentPlan, outlineOverlapAlerts } from "../lib/planejador/cockpit-view-model.ts";
import { importRadarToPlanner } from "../lib/editorial/operational-flow.ts";

const article: ArticleDNA = {
  schemaVersion: 1, articleId: "article-cockpit", brandId: "brand-cockpit", principalKeywordId: "kw-principal", secondaryKeywordIds: ["kw-secondary"], narrativeReinforcementIds: [],
  keywordReferences: [{ keywordId: "kw-principal", keywordDnaVersionId: "kw-v1", keywordDnaContentHash: "legacy:kw-principal", role: "principal", strategicContribution: "foco", coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [], classificationOrigin: "human", confidence: 0.9, humanConfirmed: true }, { keywordId: "kw-secondary", keywordDnaVersionId: "kw2-v1", keywordDnaContentHash: "legacy:kw-secondary", role: "secundaria", strategicContribution: "apoio", coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [], classificationOrigin: "human", confidence: 0.8, humanConfirmed: true }],
  siloId: "silo-cockpit", hierarchy: "Pilar", suggestedSlug: "cockpit-editorial", canonical: null, mainIntent: "informacional", auxiliaryIntents: [], audience: "Gestores", problem: "Plano incompleto", desiredResult: "Plano utilizável", journeyStage: "consideracao", brandObjective: "Crescer", promise: "Planejar um conteúdo útil", angle: "Proveniência verificável", cta: "Conhecer o próximo passo", coverage: ["estrutura"], excludedSubjects: [], antiCannibalizationBoundary: "Não duplicar o pilar", nearbyArticleIds: [], differentiation: [], entities: ["ContentPlan"], requiredTopics: ["Estrutura"], questions: ["Como revisar o plano?"], objections: ["E se faltar Radar?"], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.9, humanPendingDecisions: [],
};

const snapshot = { brand: { id: "brand-cockpit", nome: "Marca Cockpit", site_url: null, nicho: "SEO", localizacao: null, dna_diretrizes: null, silos_existentes: [], created_at: null }, silos: [{ id: "silo-cockpit", nome: "Silo Editorial", nicho: "SEO", marca_id: "brand-cockpit", created_at: null }], keywords: [{ id: "kw-principal", keyword: "planejamento editorial", intent: "informacional", volume_search: null, kgr_score: null, lista_id: null, status: "aprovada", analise_semantica: null, created_at: null }, { id: "kw-secondary", keyword: "gabarito de artigo", intent: "informacional", volume_search: null, kgr_score: null, lista_id: null, status: "aprovada", analise_semantica: null, created_at: null }], briefings: [], loadedAt: "2026-07-20T12:00:00.000Z" };

async function fixture() {
  const articleVersion = await createVersionEnvelope({ entityId: article.articleId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: "human", payload: article }) as VersionEnvelope<ArticleDNA>;
  const plan = await createDefinitiveContentPlan({ brandId: article.brandId, editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion }, "human");
  const radar = { id: "radar-item", brandId: article.brandId, articleId: article.articleId, articleDnaVersionId: articleVersion.versionId, articleDnaContentHash: articleVersion.contentHash, title: article.promise, slug: article.suggestedSlug, siloId: article.siloId || "silo-cockpit", hierarchy: article.hierarchy, principalKeywordId: article.principalKeywordId, format: "article", intent: article.mainIntent, state: "approved" as const, importedAt: "2026-07-20T12:00:00.000Z", updatedAt: "2026-07-20T12:00:00.000Z", origin: "local" as const, lockVersion: 1, unitType: "article" as const, hydration: null, analysisVersions: [] };
  const item = importRadarToPlanner([], [radar], article.brandId)[0];
  return { articleVersion, plan, item };
}

test("hidratação exibe keyword e silo textuais e separa diagnóstico técnico", async () => {
  const { articleVersion, plan, item } = await fixture();
  const hydrated = hydratePlanner({ brandId: article.brandId, snapshot, item, plan, article: articleVersion, silo: null, siloPage: null, serpRecords: [], serpReviews: [], document: null });
  assert.equal(hydrated.primaryKeyword.label, "planejamento editorial");
  assert.equal(hydrated.silo.label, "Silo Editorial");
  assert.notEqual(hydrated.primaryKeyword.label, "kw-principal");
  assert.equal(hydrated.plan.label, `ID · v${plan.versionNumber}`);
});

test("seleção do cockpit ignora ContentPlan legado sem planning e usa a versão definitiva", async () => {
  const { plan } = await fixture();
  const legacy = { ...structuredClone(plan), versionId: "legacy-plan-v1", versionNumber: 1, payload: { ...plan.payload, schemaVersion: 1, planning: undefined } } as VersionEnvelope<typeof plan.payload>;
  assert.equal(findDefinitiveContentPlan({ legacy: legacy as VersionEnvelope<typeof plan.payload>, [plan.versionId]: plan }, plan.entityId)?.versionId, plan.versionId);
  assert.equal(findDefinitiveContentPlan({ legacy: legacy as VersionEnvelope<typeof plan.payload> }, plan.entityId), null);
});

test("hidratação não inventa copy quando referência não está carregada", async () => {
  const { articleVersion, plan, item } = await fixture();
  const missing = hydratePlanner({ brandId: article.brandId, snapshot: { ...snapshot, keywords: [] }, item, plan, article: articleVersion, silo: null, siloPage: null, serpRecords: [], serpReviews: [], document: null });
  assert.equal(missing.primaryKeyword.label, UNHYDRATED_REFERENCE);
  assert.match(missing.primaryKeyword.technical.reason, /não encontrada|versão/);
});

test("outline calcula H2/H3, permite adicionar e mover e save sem mudança é materialmente igual", async () => {
  const { plan } = await fixture(); const details = plan.payload.planning!;
  const expanded = addOutlineSection(details, 3); const moved = moveOutlineSection(expanded, expanded.structure.sections.at(-1)!.id, -1); const metrics = calculateOutlineMetrics(moved);
  assert.equal(metrics.h2, details.structure.sections.length);
  assert.equal(metrics.h3, 1);
  assert.equal(hasMaterialPlanChange(details, structuredClone(details)), false);
  assert.equal(hasMaterialPlanChange(details, moved), true);
});

test("view model deriva progresso, lacunas reais, labels e bloqueio de aprovação", async () => {
  const { articleVersion, plan, item } = await fixture();
  const hydration = hydratePlanner({ brandId: article.brandId, snapshot, item, plan, article: articleVersion, silo: null, siloPage: null, serpRecords: [], serpReviews: [], document: null });
  const view = buildCockpitViewModel({ item: { ...item, state: "awaiting_review" }, plan, hydration, approvalIssues: [], documentExists: false });
  assert.equal(view.status.workflow, "Aguardando revisão");
  assert.equal(view.status.transfer, "Não enviado");
  assert.equal(view.canApprove, false);
  assert.ok(view.alertCounts.bloqueios > 0);
  assert.ok(view.alerts.some(alert => /gabarito/i.test(alert.message)));
  assert.ok(view.nextAction.message.length > 0);
  const duplicateDetails = structuredClone(plan.payload.planning!);
  duplicateDetails.structure.sections[0].heading = "Estrutura editorial";
  duplicateDetails.structure.sections.push({ ...duplicateDetails.structure.sections[0], id: "section:duplicate", heading: "Estrutura editorial" });
  assert.ok(outlineOverlapAlerts(duplicateDetails).length > 0);
});
