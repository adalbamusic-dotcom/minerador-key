import {
  ArticleDNASchema,
  EditorialUnitClassificationSchema,
  EditorialUnitPurposeSchema,
  ArticleSerpStrategySchema,
  type ArticleDNA,
  type ArticleSerpStrategy,
  type EditorialArticleUnitType,
  type EditorialUnitClassification,
  type EditorialUnitPurpose,
  type ArchitectKeyword,
  type ArticleKgrIdentity,
  type ArticleArchitectureStatus,
  type KeywordUrlRelationship,
  type PrimaryKeywordPolicy,
  type NormalizedSearchIntent,
} from "./contracts.ts";
import { isConfirmedKgrIdentity, resolveArticleSerpIdentityContext } from "./identity-context.ts";
import { normalizeSearchIntent } from "./intent-profile.ts";

type LooseRecord = Record<string, unknown>;

const asRecord = (value: unknown): LooseRecord => value && typeof value === "object" && !Array.isArray(value) ? value as LooseRecord : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const normalized = (value: unknown) => text(value)?.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");

function firstText(records: LooseRecord[], keys: string[]): string | undefined {
  for (const record of records) for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return undefined;
}

function sourceUrlFor(principal?: ArchitectKeyword, article?: ArticleDNA): string | undefined {
  const semantic = asRecord(principal?.analise_semantica);
  const siteOrigin = asRecord(semantic.site_origin || semantic.siteOrigin);
  const candidate = article?.publishedIdentityRef?.publishedUrl || principal?.publishedUrl || principal?.url
    || text(siteOrigin.sourceUrl) || text(siteOrigin.resolvedUrl);
  if (!candidate) return undefined;
  try { return new URL(candidate).toString(); } catch { return undefined; }
}

function evidenceFrom(principal?: ArchitectKeyword, article?: ArticleDNA): { evidence: EditorialUnitClassification["evidence"]; sourceSignals: string[]; urlPath?: string } {
  const semantic = asRecord(principal?.analise_semantica);
  const siteOrigin = asRecord(semantic.site_origin || semantic.siteOrigin);
  const sourceUrl = sourceUrlFor(principal, article);
  let urlPath: string | undefined;
  if (sourceUrl) {
    try { urlPath = new URL(sourceUrl).pathname; } catch { /* URL inválida não vira evidência */ }
  }
  const title = firstText([asRecord(principal), semantic, siteOrigin], ["title", "meta_title", "titulo", "pageTitle"]);
  const h1 = firstText([asRecord(principal), semantic, siteOrigin], ["h1", "heading", "pageH1"]);
  const schemaTypes = [siteOrigin.schemaTypes, siteOrigin.schema_types].find(Array.isArray);
  const contentSignals = [
    firstText([semantic], ["tipo_unidade", "unitType", "unit_type", "tipo_editorial", "formato_esperado"]),
    firstText([semantic], ["landingPagePurpose", "landing_page_purpose", "finalidade_landing"]),
  ].filter((value): value is string => Boolean(value));
  const evidence = {
    ...(urlPath ? { urlPath } : {}), ...(title ? { title } : {}), ...(h1 ? { h1 } : {}),
    ...(schemaTypes ? { schemaTypes: schemaTypes.filter((value): value is string => typeof value === "string") } : {}),
    ...(contentSignals.length ? { contentSignals } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
  return { evidence, sourceSignals: [...contentSignals, ...(schemaTypes || []).filter((value): value is string => typeof value === "string")], ...(urlPath ? { urlPath } : {}) };
}

function unitFromValue(value: unknown): EditorialArticleUnitType | undefined {
  const valueNormalized = normalized(value);
  if (!valueNormalized) return undefined;
  if (["article", "artigo", "guide", "tutorial", "review", "comparison", "problem_solution"].includes(valueNormalized)) return "article";
  if (["service", "service_page", "pagina_de_servico", "pagina_servico", "servico", "commercial_service"].includes(valueNormalized)) return "service_page";
  if (["landing", "landing_page", "lp", "pagina_de_campanha", "campaign_page"].includes(valueNormalized)) return "landing_page";
  if (["category", "category_page", "categoria", "pagina_de_categoria", "collection_page"].includes(valueNormalized)) return "category_page";
  if (["other", "outro", "generic", "generico"].includes(valueNormalized)) return "other";
  return undefined;
}

function unitFromSignals(principal?: ArchitectKeyword, article?: ArticleDNA): { type?: EditorialArticleUnitType; reason?: string; source?: "site_evidence" | "legacy"; confidence?: number } {
  const semantic = asRecord(principal?.analise_semantica);
  const siteOrigin = asRecord(semantic.site_origin || semantic.siteOrigin);
  const explicit = firstText([semantic, siteOrigin, asRecord(principal)], ["unitType", "unit_type", "tipo_unidade", "tipo_editorial", "formato_esperado", "editorialType"]);
  const explicitType = unitFromValue(explicit);
  if (explicitType) return { type: explicitType, reason: `Sinal editorial recebido: ${explicit}.`, source: "site_evidence", confidence: 0.82 };
  const sourceUrl = sourceUrlFor(principal, article);
  let path = "";
  try { path = sourceUrl ? new URL(sourceUrl).pathname.toLocaleLowerCase("pt-BR") : ""; } catch { /* sem path confiável */ }
  if (/\/(servicos?|services?)(\/|$)/.test(path)) return { type: "service_page", reason: "A URL publicada está em uma área de serviços.", source: "site_evidence", confidence: 0.9 };
  if (/\/(landing|lp|campanha|campaign)(\/|$)/.test(path)) return { type: "landing_page", reason: "A URL publicada está em uma área de landing/campanha.", source: "site_evidence", confidence: 0.86 };
  if (/\/(categorias?|category|collections?)(\/|$)/.test(path)) return { type: "category_page", reason: "A URL publicada está em uma área de categoria.", source: "site_evidence", confidence: 0.86 };
  const schemaTypes = [siteOrigin.schemaTypes, siteOrigin.schema_types].find(Array.isArray) || [];
  if (schemaTypes.some(value => typeof value === "string" && /service/i.test(value))) return { type: "service_page", reason: "Dados estruturados indicam uma página de serviço.", source: "site_evidence", confidence: 0.85 };
  if (schemaTypes.some(value => typeof value === "string" && /collection|category/i.test(value))) return { type: "category_page", reason: "Dados estruturados indicam uma página de categoria.", source: "site_evidence", confidence: 0.8 };
  return article ? { type: "other", reason: "Não há evidência suficiente para assumir que o registro antigo seja um artigo.", source: "legacy" } : { type: "article", reason: "Unidade formada a partir de um grupo de artigo no Arquiteto.", source: "legacy", confidence: 0.55 };
}

function landingPurposeFor(principal?: ArchitectKeyword, type?: EditorialArticleUnitType): EditorialUnitClassification["landingPagePurpose"] | undefined {
  if (type !== "landing_page") return undefined;
  const semantic = asRecord(principal?.analise_semantica);
  const explicit = normalized(firstText([semantic], ["landingPagePurpose", "landing_page_purpose", "finalidade_landing", "landingPurpose"]));
  if (["seo", "organico", "organic"].includes(explicit || "")) return "seo";
  if (["campaign", "campanha", "ads", "paid"].includes(explicit || "")) return "campaign";
  if (["hybrid", "hibrida", "hibrido"].includes(explicit || "")) return "hybrid";
  return "unknown";
}

export function suggestEditorialUnitClassification(input: { principal?: ArchitectKeyword; article?: ArticleDNA; published?: boolean }): EditorialUnitClassification {
  const existing = input.article?.unitClassification;
  if (existing) return EditorialUnitClassificationSchema.parse(existing);
  const signal = unitFromSignals(input.principal, input.article);
  const evidenceData = evidenceFrom(input.principal, input.article);
  const type = signal.type || "other";
  const source = signal.source || (input.article ? "legacy" : "unknown");
  const status = signal.type && !(signal.type === "other" && signal.source === "legacy") ? "suggested" : "unknown";
  const purpose = landingPurposeFor(input.principal, type);
  return EditorialUnitClassificationSchema.parse({
    type, status, source, ...(signal.confidence !== undefined ? { confidence: signal.confidence } : {}),
    ...(evidenceData.evidence && Object.keys(evidenceData.evidence).length ? { evidence: evidenceData.evidence } : {}),
    ...(purpose ? { landingPagePurpose: purpose } : {}),
  });
}

function kgrCompetition(identity: ArticleKgrIdentity | undefined, principalKeywordId: string, slug?: string | null): "kgr_light" | "competitive" | "unknown" {
  if (isConfirmedKgrIdentity(identity, principalKeywordId, slug)) return "kgr_light";
  if (!identity) return "unknown";
  if (identity.status === "not_kgr" || identity.isKgrArticle === false) return "competitive";
  return "unknown";
}

function unitProfileFor(unit: EditorialUnitClassification, competition: ArticleSerpStrategy["competitionStrategy"], intent: NormalizedSearchIntent): ArticleSerpStrategy["unitProfile"] {
  if (unit.status === "unknown") return "unknown";
  if (unit.type === "service_page") return "service_commercial_local";
  if (unit.type === "category_page") return "category_hub";
  if (unit.type === "landing_page") return unit.landingPagePurpose === "campaign" ? "landing_campaign_alignment" : unit.landingPagePurpose === "hybrid" ? "landing_hybrid" : unit.landingPagePurpose === "seo" ? "landing_seo_conversion" : "unknown";
  if (unit.type === "article") return competition === "kgr_light" ? "informational_article" : competition === "competitive" ? "competitive_editorial_article" : intent === "informational" && competition !== "unknown" ? "informational_article" : "unknown";
  return "generic";
}

function rulesFor(profile: ArticleSerpStrategy["unitProfile"], competition: ArticleSerpStrategy["competitionStrategy"]): Pick<ArticleSerpStrategy, "allowedRecommendationTypes" | "forbiddenRecommendationTypes"> {
  const commonForbidden = ["change_published_url", "change_published_slug", "change_published_canonical", "delete_keyword_dna", "replace_confirmed_principal"];
  if (profile === "informational_article" && competition === "kgr_light") return { allowedRecommendationTypes: ["manter", "fortalecer", "revisar_compatibilidade", "adicionar_cobertura", "melhorar_narrativa", "sugerir_apoio", "revisar_secundaria", "revisar_reforco"], forbiddenRecommendationTypes: [...commonForbidden, "separar_sem_evidencia_forte"] };
  if (profile === "competitive_editorial_article") return { allowedRecommendationTypes: ["comparar_principais", "reclassificar", "separar_com_evidencia_forte", "revisar_intencao", "revisar_hierarquia", "avaliar_canibalizacao"], forbiddenRecommendationTypes: commonForbidden };
  if (profile === "service_commercial_local") return { allowedRecommendationTypes: ["reforcar_oferta", "adicionar_prova", "adicionar_localizacao", "adicionar_diferenciais", "revisar_cta", "criar_apoio_informacional", "identificar_conflito_servico"], forbiddenRecommendationTypes: [...commonForbidden, "tratar_como_artigo_informacional"] };
  if (profile === "landing_campaign_alignment") return { allowedRecommendationTypes: ["revisar_oferta", "revisar_promessa", "revisar_aderencia", "revisar_cta", "revisar_prova", "revisar_indexacao"], forbiddenRecommendationTypes: [...commonForbidden, "exigir_serp_automatica", "exigir_profundidade_de_artigo"] };
  if (profile === "landing_seo_conversion" || profile === "landing_hybrid") return { allowedRecommendationTypes: ["revisar_oferta", "revisar_promessa", "revisar_aderencia", "revisar_cta", "revisar_prova", "revisar_indexacao", "sugerir_pagina_seo_separada"], forbiddenRecommendationTypes: commonForbidden };
  if (profile === "category_hub") return { allowedRecommendationTypes: ["revisar_taxonomia", "revisar_navegacao", "revisar_unidades_filhas", "avaliar_canibalizacao", "revisar_cobertura"], forbiddenRecommendationTypes: [...commonForbidden, "tratar_como_artigo_comum", "confundir_com_silopage"] };
  return { allowedRecommendationTypes: ["revisar_humano", "adicionar_evidencia"], forbiddenRecommendationTypes: commonForbidden };
}

export function resolveEditorialUnitPurpose(input: { unit: EditorialUnitClassification; primaryIntent: NormalizedSearchIntent; audience?: string; searchNeed?: string; published: boolean; lifecycleMode: ArticleSerpStrategy["lifecycleMode"] }): EditorialUnitPurpose {
  const { unit, primaryIntent, published } = input;
  const purpose = unit.type === "service_page" ? (primaryIntent === "local" ? "generate_local_leads" : "present_service")
    : unit.type === "landing_page" ? (unit.landingPagePurpose === "campaign" ? "convert_campaign_traffic" : "convert_seo_traffic")
      : unit.type === "category_page" ? "organize_category"
        : unit.type === "article" ? (input.lifecycleMode === "fortalecimento" ? "strengthen_published_url" : primaryIntent === "informational" ? "competitive_information" : "other")
          : "other";
  const conversionRole = unit.type === "category_page" ? "navigate" : primaryIntent === "transactional" ? "sell" : primaryIntent === "local" ? "generate_lead" : primaryIntent === "commercial_investigation" ? "assist_decision" : "inform";
  const indexationIntent = unit.type === "landing_page" && unit.landingPagePurpose === "campaign" ? "undecided" : "index";
  return EditorialUnitPurposeSchema.parse({
    unitType: unit.type, primaryObjective: published && input.lifecycleMode === "fortalecimento" ? "strengthen_published_url" : purpose,
    searchNeed: input.searchNeed || "Necessidade de busca ainda não recebida.", audienceNeed: input.audience || "Público ainda não recebido.", conversionRole, indexationIntent,
    rationale: [
      `Tipo da unidade: ${unit.type}.`,
      `Intenção central preservada: ${primaryIntent}.`,
      published ? "A unidade publicada mantém sua identidade estrutural protegida." : "A unidade ainda está em formação e requer decisão humana antes do planejamento.",
    ],
  });
}

export function resolveArticleSerpStrategy(input: { unit: EditorialUnitClassification; primaryIntent: NormalizedSearchIntent; published: boolean; principalKeywordId: string; slug?: string | null; keywordUrlRelation?: KeywordUrlRelationship; architectureStatus?: ArticleArchitectureStatus; kgrIdentity?: ArticleKgrIdentity; primaryKeywordPolicy?: PrimaryKeywordPolicy }): ArticleSerpStrategy {
  const identity = resolveArticleSerpIdentityContext({ published: input.published, principalKeywordId: input.principalKeywordId, primaryKeywordPolicy: input.primaryKeywordPolicy, keywordUrlRelation: input.keywordUrlRelation, architectureStatus: input.architectureStatus, kgrIdentity: input.kgrIdentity, slug: input.slug });
  const competitionStrategy = kgrCompetition(input.kgrIdentity, input.principalKeywordId, input.slug);
  const unitProfile = unitProfileFor(input.unit, competitionStrategy, input.primaryIntent);
  const rules = rulesFor(unitProfile, competitionStrategy);
  return ArticleSerpStrategySchema.parse({ lifecycleMode: identity.mode, competitionStrategy, unitProfile, primaryIntent: input.primaryIntent,
    rationale: [
      `Ciclo editorial resolvido como ${identity.mode}.`,
      `Competição resolvida como ${competitionStrategy}; o Arquiteto não recalcula KGR.`,
      `Perfil derivado separadamente do tipo ${input.unit.type} e da intenção ${input.primaryIntent}.`,
    ], ...rules, strategyVersion: "unit-serp-strategy-v1" });
}

export function buildArticleUnitStrategy(input: { article: ArticleDNA; unit?: EditorialUnitClassification; published?: boolean }): { unit: EditorialUnitClassification; purpose: EditorialUnitPurpose; serpStrategy: ArticleSerpStrategy } {
  const published = input.published ?? Boolean(input.article.publishedIdentityRef);
  const primary = input.article.keywordReferences.find(reference => reference.keywordId === input.article.principalKeywordId);
  const unit = input.unit || suggestEditorialUnitClassification({ article: input.article, published });
  const serpStrategy = input.article.serpStrategy || resolveArticleSerpStrategy({ unit, primaryIntent: normalizeSearchIntent(input.article.mainIntent), published, principalKeywordId: input.article.principalKeywordId, slug: input.article.suggestedSlug, primaryKeywordPolicy: input.article.primaryKeywordPolicy, keywordUrlRelation: primary?.keywordUrlRelation, architectureStatus: input.article.architectureStatus, kgrIdentity: input.article.kgrIdentity });
  const purpose = input.article.unitPurpose || resolveEditorialUnitPurpose({ unit, primaryIntent: serpStrategy.primaryIntent, audience: input.article.audience, searchNeed: input.article.problem, published, lifecycleMode: serpStrategy.lifecycleMode });
  return { unit, purpose, serpStrategy };
}

export function applyHumanEditorialUnitDecision(article: ArticleDNA, input: { type: EditorialArticleUnitType; landingPagePurpose?: EditorialUnitClassification["landingPagePurpose"]; status?: "human_confirmed" | "conflict" | "unknown" }, actorId: string, confirmedAt = new Date().toISOString()): ArticleDNA {
  const status = input.status || (input.type === "other" ? "unknown" : "human_confirmed");
  const classification = EditorialUnitClassificationSchema.parse({ type: input.type, status, source: "manual", ...(status === "human_confirmed" ? { confirmedAt, confirmedBy: actorId } : {}), ...(input.type === "landing_page" ? { landingPagePurpose: input.landingPagePurpose || "unknown" } : {}) });
  const strategy = resolveArticleSerpStrategy({ unit: classification, primaryIntent: normalizeSearchIntent(article.mainIntent), published: Boolean(article.publishedIdentityRef), principalKeywordId: article.principalKeywordId, slug: article.suggestedSlug, keywordUrlRelation: article.keywordReferences.find(reference => reference.keywordId === article.principalKeywordId)?.keywordUrlRelation, architectureStatus: article.architectureStatus, kgrIdentity: article.kgrIdentity });
  const purpose = resolveEditorialUnitPurpose({ unit: classification, primaryIntent: strategy.primaryIntent, audience: article.audience, searchNeed: article.problem, published: Boolean(article.publishedIdentityRef), lifecycleMode: strategy.lifecycleMode });
  const pending = article.humanPendingDecisions.filter(decision => !decision.toLocaleLowerCase("pt-BR").includes("tipo da unidade") && !decision.toLocaleLowerCase("pt-BR").includes("landing page"));
  return ArticleDNASchema.parse({ ...article, unitClassification: classification, unitPurpose: purpose, serpStrategy: strategy, humanPendingDecisions: pending });
}

/**
 * O TIPO DA UNIDADE É FATO DERIVADO — não decisão humana pendente.
 *
 * Pedir que alguém clique "Registrar decisão" para confirmar que um Article é
 * um Article cria pendência artificial: bloqueia a conclusão da formação e,
 * pior, a confirmação grava uma sucessora `proposed` que rebaixa um ArticleDNA
 * já aprovado. Nada disso decide nada — a fase Artigos já formou a unidade.
 *
 * A decisão humana continua existindo onde há ambiguidade REAL: sinal
 * insuficiente (`unknown`), divergência declarada (`conflict`) ou o balde
 * `other`, que é justamente "não sabemos qual é". Página de categoria não
 * entra nesta conta: cluster e SiloPage pertencem à fase Silos.
 */
export function editorialUnitTypeIsDerived(unit: EditorialUnitClassification | null | undefined): boolean {
  if (!unit) return false;
  if (unit.status === "human_confirmed") return true;
  if (unit.status === "conflict" || unit.status === "unknown") return false;
  return unit.type !== "other";
}
