import assert from "node:assert/strict";
import test from "node:test";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { confirmArticleArchitecture } from "../lib/arquiteto/architecture-confirmation.ts";
import { ArchitectKeywordSchema, ProvisionalArticleGroupSchema, type ArticleKgrIdentity } from "../lib/arquiteto/contracts.ts";
import { buildArticleControlContext } from "../lib/arquiteto/strategic-context.ts";
import { adaptKeywordIdentityContext, resolveArticleSerpIdentityContext } from "../lib/arquiteto/identity-context.ts";

const kgrConfirmed: ArticleKgrIdentity = {
  isKgrArticle: true, source: "minerador", principalKeywordDnaId: "kw-kgr", boundSlug: "seo-kgr",
  bindingStatus: "confirmed", status: "confirmed", primaryKeywordId: "kw-kgr", primaryVolume: 10, resultCount: 1, kgrValue: 0.1,
};

function keyword(id: string, value: string, extras: Record<string, unknown> = {}) {
  const base = {
    id, keyword: value, intent: "comercial", volume_search: 10, results_allintitle: 3, kgr_score: null,
    lista_id: "silo-1", silo_id: "silo-1", siloName: "Serviços", status: "publicado", isPublished: true,
    slug_sugerido: "seo-para-clinicas", publishedUrl: "https://adalbapro.com.br/servicos/seo-para-clinicas",
    url: "https://adalbapro.com.br/servicos/seo-para-clinicas", canonical: "https://adalbapro.com.br/servicos/seo-para-clinicas",
    analise_semantica: { intencao_principal: "comercial", entidade_central: "SEO para clínicas", ...extras },
  };
  return ArchitectKeywordSchema.parse({ ...base, ...extras, analise_semantica: { ...base.analise_semantica, ...(extras.analise_semantica as Record<string, unknown> | undefined) }, ...adaptKeywordIdentityContext({ ...base, ...extras, analise_semantica: { ...base.analise_semantica, ...(extras.analise_semantica as Record<string, unknown> | undefined) } }) });
}

function group(principal: ReturnType<typeof keyword>, support?: ReturnType<typeof keyword>) {
  const keywords = support ? [principal, support] : [principal];
  return ProvisionalArticleGroupSchema.parse({
    id: `group-${principal.id}`, keywordIds: keywords.map(item => item.id), keywords,
    publishedAnchorId: principal.isPublished ? principal.id : null, suggestedSiloId: "silo-1", suggestedSiloName: "Serviços",
    evidence: { lexical: 0.8, intent: 1, entities: 0.8, silo: 1, combined: 0.85 }, confidence: 0.85,
    alerts: [], principalSuggestion: { keywordId: principal.id, score: 1, breakdown: { cobertura: 1, intencao: 1, centralidadeSemantica: 1, aderenciaMarca: 1, potencialComercial: 1, volume: 1, dificuldade: 0.5, qualidadeSlug: 1, ancoraPublicada: principal.isPublished ? 1 : 0, serp: null }, justificativa: [], pendencias: [] },
    roles: Object.fromEntries(keywords.map(item => [item.id, item.id === principal.id ? "principal" : "secundaria"])), suggestedHierarchy: "Pilar",
    ...(principal.architectureStatus ? { architectureStatus: principal.architectureStatus } : {}), ...(principal.kgrIdentity ? { kgrIdentity: principal.kgrIdentity } : {}),
  });
}

test("SEO para Clínicas publicado revisável usa arquitetura do publicado e competição competitiva", () => {
  const principal = keyword("kw-seo", "SEO para Clínicas", {
    analise_semantica: { primary_keyword_policy: "reviewable", primary_keyword_published_original: "SEO para Clínicas", primary_keyword_current: "SEO para Clínicas", primary_keyword_policy_actor: "human-1", primary_keyword_policy_at: "2026-07-22T12:00:00.000Z", primary_keyword_policy_version: 1, primary_keyword_review_required: true, kgr_aplicabilidade: "not_applicable", kgr_decisao: "NAO", kgr_decisao_origem: "human" },
  });
  const support = keyword("kw-candidata", "SEO para clínicas de estética", { status: "aprovado", isPublished: false, publishedUrl: null, url: null, canonical: null, slug_sugerido: null, analise_semantica: {} });
  const article = deterministicArticleDnaPayload(group(principal, support), "brand-1");
  assert.equal(article.primaryKeywordPolicy, "revisable");
  assert.equal(article.primaryKeywordPolicyContext?.sourcePolicy, "reviewable");
  assert.equal(article.primaryKeywordMetrics?.volumeSearch, 10);
  assert.equal(article.primaryKeywordMetrics?.resultCount, 3);
  assert.equal(article.serpStrategy?.lifecycleMode, "arquitetura_publicado");
  assert.equal(article.serpStrategy?.competitionStrategy, "competitive");
  assert.equal(article.unitClassification?.type, "service_page");
  assert.equal(article.primaryKeywordCandidates?.[0]?.keywordId, "kw-candidata");
  const context = buildArticleControlContext(article, { published: true });
  assert.equal(context.primaryKeyword.policy, "revisable");
  assert.equal(context.primaryKeyword.protected, false);
  assert.equal(context.primaryKeyword.protectionReason, "published_revisable");
  assert.equal(context.primaryKeyword.text, "SEO para Clínicas");
  assert.deepEqual(article.keywordStrategy?.publicationProtection.protectedFields, ["slug", "canonical", "url", "brand", "principal"]);
});

test("publicado sozinho não trava a principal e unidade nova permanece livre", () => {
  const legacyPublished = keyword("kw-legacy", "Página antiga", { analise_semantica: {} });
  const legacyArticle = deterministicArticleDnaPayload(group(legacyPublished), "brand-1");
  assert.equal(legacyArticle.primaryKeywordPolicy, "unknown");
  assert.equal(legacyArticle.serpStrategy?.lifecycleMode, "arquitetura_publicado");
  assert.equal(buildArticleControlContext(legacyArticle, { published: true }).primaryKeyword.protected, false);
  const fresh = ArchitectKeywordSchema.parse({ ...legacyPublished, id: "kw-new", keyword: "Nova unidade", status: "aprovado", isPublished: false, publishedUrl: null, url: null, canonical: null, slug_sugerido: null, primaryKeywordPolicy: "free", primaryKeywordPolicyContext: { policy: "free", currentKeyword: "Nova unidade", source: "minerador" } });
  const freshArticle = deterministicArticleDnaPayload(group(fresh), "brand-1");
  assert.equal(freshArticle.primaryKeywordPolicy, "free");
  assert.equal(freshArticle.serpStrategy?.lifecycleMode, "formacao");
});

test("principal travada e KGR confirmado usam fortalecimento; KGR sem estado explícito fica desconhecido", () => {
  const locked = keyword("kw-locked", "SEO travado", { analise_semantica: { primary_keyword_policy: "locked" } });
  const lockedArticle = deterministicArticleDnaPayload(group(locked), "brand-1");
  assert.equal(lockedArticle.primaryKeywordPolicy, "locked");
  assert.equal(lockedArticle.serpStrategy?.lifecycleMode, "fortalecimento");
  assert.equal(buildArticleControlContext(lockedArticle, { published: true }).primaryKeyword.protectionReason, "minerador_locked");
  const kgr = keyword("kw-kgr", "SEO KGR", { slug_sugerido: "seo-kgr", kgrIdentity: kgrConfirmed });
  const kgrArticle = deterministicArticleDnaPayload(group(kgr), "brand-1");
  assert.equal(kgrArticle.serpStrategy?.competitionStrategy, "kgr_light");
  assert.equal(kgrArticle.serpStrategy?.lifecycleMode, "fortalecimento");
  const absent = keyword("kw-absent", "SEO sem medição", { kgr_score: null, analise_semantica: {} });
  assert.equal(deterministicArticleDnaPayload(group(absent), "brand-1").serpStrategy?.competitionStrategy, "unknown");
});

test("decisão automática de KGR não é tratada como confirmação humana", () => {
  const automated = keyword("kw-automatico", "SEO automatizado", {
    analise_semantica: { kgr_aplicabilidade: "not_applicable", kgr_decisao: "NAO", kgr_decisao_origem: "ai" },
  });
  const article = deterministicArticleDnaPayload(group(automated), "brand-1");
  assert.equal(article.kgrIdentity, undefined);
  assert.equal(article.serpStrategy?.competitionStrategy, "unknown");
});

test("confirmação humana pode substituir a principal revisável sem alterar URL, slug ou canonical", async () => {
  const principal = keyword("kw-old", "SEO para Clínicas", { analise_semantica: { primary_keyword_policy: "reviewable", primary_keyword_published_original: "SEO para Clínicas", primary_keyword_current: "SEO para Clínicas" } });
  const support = keyword("kw-new", "SEO para clínicas de estética", { status: "aprovado", isPublished: false, publishedUrl: null, url: null, canonical: null, slug_sugerido: null, analise_semantica: {} });
  const article = deterministicArticleDnaPayload(group(principal, support), "brand-1");
  const current = { versionId: "legacy:article", entityId: article.articleId, versionNumber: 1, previousVersionId: null, contentHash: "legacy:article", origin: "system" as const, changeReason: "fixture", createdAt: "2026-07-22T12:00:00.000Z", createdBy: "fixture", payload: article };
  const successor = await confirmArticleArchitecture(current, "kw-new", "human-2", "2026-07-22T13:00:00.000Z");
  assert.equal(successor.payload.principalKeywordId, "kw-new");
  assert.equal(successor.payload.primaryKeywordPolicy, "locked");
  assert.equal(successor.payload.primaryKeywordDecision?.previousKeywordId, "kw-old");
  assert.equal(successor.payload.primaryKeywordDecision?.selectedKeywordId, "kw-new");
  assert.equal(successor.payload.keywordReferences.find(reference => reference.keywordId === "kw-new")?.keywordUrlRelation, "confirmed_primary");
  assert.equal(successor.payload.publishedIdentityRef?.publishedUrl, article.publishedIdentityRef?.publishedUrl);
  assert.equal(successor.payload.suggestedSlug, article.suggestedSlug);
  assert.equal(successor.payload.canonical, article.canonical);
  assert.equal(buildArticleControlContext(successor.payload, { published: true }).serpStrategy?.lifecycleMode, "fortalecimento");
});

test("URL e principal são proteções independentes nos estados publicados", () => {
  const reviewable = resolveArticleSerpIdentityContext({ published: true, principalKeywordId: "kw", primaryKeywordPolicy: "reviewable", keywordUrlRelation: "candidate_primary", architectureStatus: "awaiting_architecture" });
  const locked = resolveArticleSerpIdentityContext({ published: true, principalKeywordId: "kw", primaryKeywordPolicy: "locked" });
  assert.equal(reviewable.principalProtected, false);
  assert.equal(reviewable.slugProtected, true);
  assert.equal(reviewable.canonicalProtected, true);
  assert.equal(reviewable.brandProtected, true);
  assert.equal(locked.principalProtected, true);
  assert.equal(locked.slugProtected, true);
});
