import assert from "node:assert/strict";
import test from "node:test";
import { ArchitectKeywordSchema, ArticleDNASchema } from "../lib/arquiteto/contracts.ts";
import { applyHumanEditorialUnitDecision, buildArticleUnitStrategy, resolveArticleSerpStrategy, suggestEditorialUnitClassification } from "../lib/arquiteto/unit-strategy.ts";
import { buildArticleControlContext } from "../lib/arquiteto/strategic-context.ts";

const keyword = (id: string, extras: Record<string, unknown> = {}) => ArchitectKeywordSchema.parse({
  id, keyword: "tratamento estético", intent: "Informacional", volume_search: 80, kgr_score: null,
  slug_sugerido: "tratamento-estetico", analise_semantica: { dna_origem: "import", dna_confianca: 0.8, ...extras },
});

test("sugestão de unidade usa evidência de URL e não confirma silenciosamente", () => {
  const service = suggestEditorialUnitClassification({ principal: keyword("service", { tipo_unidade: "página de serviço" }), published: true });
  assert.equal(service.type, "service_page");
  assert.equal(service.status, "suggested");
  assert.equal(service.source, "site_evidence");

  const campaign = suggestEditorialUnitClassification({ principal: keyword("campaign", { tipo_unidade: "landing page", finalidade_landing: "campanha" }), published: true });
  assert.equal(campaign.type, "landing_page");
  assert.equal(campaign.landingPagePurpose, "campaign");

  const category = suggestEditorialUnitClassification({ principal: keyword("category", { tipo_unidade: "categoria" }), published: true });
  assert.equal(category.type, "category_page");
});

test("KGR, não KGR e ausência permanecem estratégias competitivas distintas", () => {
  const unit = { type: "article" as const, status: "suggested" as const, source: "legacy" as const };
  const kgr = resolveArticleSerpStrategy({ unit, primaryIntent: "informational", published: false, principalKeywordId: "kw-1", slug: "tratamento-estetico", kgrIdentity: { isKgrArticle: true, source: "minerador", principalKeywordDnaId: "kw-1", boundSlug: "tratamento-estetico", bindingStatus: "confirmed" } });
  assert.equal(kgr.competitionStrategy, "kgr_light");
  assert.equal(kgr.unitProfile, "informational_article");

  const notKgr = resolveArticleSerpStrategy({ unit, primaryIntent: "informational", published: false, principalKeywordId: "kw-1", slug: "tratamento-estetico", kgrIdentity: { isKgrArticle: false, source: "minerador", bindingStatus: "not_applicable", status: "not_kgr" } });
  assert.equal(notKgr.competitionStrategy, "competitive");
  assert.equal(notKgr.unitProfile, "competitive_editorial_article");

  const unknown = resolveArticleSerpStrategy({ unit, primaryIntent: "informational", published: false, principalKeywordId: "kw-1", slug: "tratamento-estetico" });
  assert.equal(unknown.competitionStrategy, "unknown");
  assert.equal(unknown.unitProfile, "unknown");
});

test("ciclo editorial permanece independente do tipo e da competição", () => {
  const service = { type: "service_page" as const, status: "human_confirmed" as const, source: "manual" as const };
  assert.equal(resolveArticleSerpStrategy({ unit: service, primaryIntent: "local", published: false, principalKeywordId: "kw-1" }).lifecycleMode, "formacao");
  assert.equal(resolveArticleSerpStrategy({ unit: service, primaryIntent: "local", published: true, principalKeywordId: "kw-1", keywordUrlRelation: "candidate_primary", architectureStatus: "awaiting_architecture" }).lifecycleMode, "arquitetura_publicado");
  assert.equal(resolveArticleSerpStrategy({ unit: service, primaryIntent: "local", published: true, principalKeywordId: "kw-1", keywordUrlRelation: "confirmed_primary", architectureStatus: "architecture_confirmed" }).lifecycleMode, "fortalecimento");
  assert.equal(resolveArticleSerpStrategy({ unit: service, primaryIntent: "local", published: true, principalKeywordId: "kw-1", kgrIdentity: { isKgrArticle: true, source: "minerador", principalKeywordDnaId: "kw-1", boundSlug: "servico", bindingStatus: "confirmed" }, slug: "servico" }).lifecycleMode, "fortalecimento");
  assert.equal(resolveArticleSerpStrategy({ unit: service, primaryIntent: "local", published: true, principalKeywordId: "kw-1" }).unitProfile, "service_commercial_local");
});

test("ArticleDNA antigo continua parseável e ganha projeção aditiva no contexto", () => {
  const old = ArticleDNASchema.parse({
    schemaVersion: 1, articleId: "old-article", brandId: "brand-1", principalKeywordId: "kw-1", secondaryKeywordIds: [], narrativeReinforcementIds: [],
    keywordReferences: [{ keywordId: "kw-1", keywordDnaVersionId: "legacy:kw-1", keywordDnaContentHash: "legacy:kw-1", role: "principal", strategicContribution: "central", coveredIntentions: ["Informacional"], requiredTopics: [], excludedTopics: [], classificationOrigin: "legacy", confidence: 0.5, humanConfirmed: false }],
    siloId: "silo-1", hierarchy: "Pilar", suggestedSlug: "tratamento-estetico", canonical: null, mainIntent: "informational", auxiliaryIntents: [], audience: "público", problem: "problema", desiredResult: "resultado", journeyStage: "descoberta", brandObjective: "crescer", promise: "promessa", angle: "ângulo", cta: "cta", coverage: ["tratamento estético"], excludedSubjects: [], antiCannibalizationBoundary: "fronteira", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.5, humanPendingDecisions: [],
  });
  const projection = buildArticleUnitStrategy({ article: old });
  assert.equal(projection.unit.type, "other");
  assert.equal(projection.unit.status, "unknown");
  assert.equal(projection.serpStrategy.competitionStrategy, "unknown");
  const context = buildArticleControlContext(old);
  assert.equal(context.unit?.type, "other");
  assert.equal(context.serpStrategy?.lifecycleMode, "formacao");
  assert.equal(context.intent?.primary, "informational");
});

test("decisão humana confirma tipo, define finalidade e preserva identidade publicada", () => {
  const source = ArticleDNASchema.parse({
    schemaVersion: 1, articleId: "published-article", brandId: "brand-1", principalKeywordId: "kw-1", secondaryKeywordIds: [], narrativeReinforcementIds: [],
    keywordReferences: [{ keywordId: "kw-1", keywordDnaVersionId: "legacy:kw-1", keywordDnaContentHash: "legacy:kw-1", role: "principal", strategicContribution: "central", coveredIntentions: ["Comercial"], requiredTopics: [], excludedTopics: [], classificationOrigin: "legacy", confidence: 0.5, humanConfirmed: false, keywordUrlRelation: "confirmed_primary" }],
    siloId: "silo-1", hierarchy: "Pilar", suggestedSlug: "servico-estetico", canonical: "https://example.com/servico-estetico", mainIntent: "local", auxiliaryIntents: [], audience: "público local", problem: "problema", desiredResult: "resultado", journeyStage: "decisão", brandObjective: "crescer", promise: "promessa", angle: "ângulo", cta: "cta", coverage: ["serviço"], excludedSubjects: [], antiCannibalizationBoundary: "fronteira", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.5, humanPendingDecisions: [],
    publishedIdentityRef: { publicationStatus: "published_protected", publishedUrl: "https://example.com/servico-estetico", slug: "servico-estetico", canonical: "https://example.com/servico-estetico" },
  });
  const next = applyHumanEditorialUnitDecision(source, { type: "service_page" }, "human-1", "2026-07-22T12:00:00.000Z");
  assert.equal(next.unitClassification?.status, "human_confirmed");
  assert.equal(next.unitClassification?.type, "service_page");
  assert.equal(next.serpStrategy?.unitProfile, "service_commercial_local");
  assert.equal(next.publishedIdentityRef?.publishedUrl, source.publishedIdentityRef?.publishedUrl);
  assert.equal(next.suggestedSlug, source.suggestedSlug);
  assert.equal(next.canonical, source.canonical);
});
