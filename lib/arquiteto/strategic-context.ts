import {
  ArticleControlContextSchema,
  ArticleHierarchyStrategySchema,
  ArticleKeywordStrategySchema,
  ArticleStrategicPurposeSchema,
  ArticleVolumeStrategySchema,
  type ArticleControlContext,
  type ArticleDNA,
  type ArticleHierarchyStrategy,
  type ArticleKgrIdentity,
  type ArticleKeywordStrategy,
  type ArticleStrategicPurpose,
  type ArticleVolumeStrategy,
  type ArchitectKeyword,
  type ProvisionalArticleGroup,
} from "./contracts.ts";
import { isConfirmedKgrIdentity, normalizePrimaryKeywordPolicy, resolveArticleSerpIdentityContext, resolvePrimaryKeywordPolicy } from "./identity-context.ts";
import { normalizeSearchIntent } from "./intent-profile.ts";
import { buildArticleUnitStrategy } from "./unit-strategy.ts";

const finiteVolume = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const sumKnown = (values: Array<number | null>) => {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
};

const sourceKeywordDnaId = (keyword: ArchitectKeyword) => keyword.keywordDnaRef?.entityId || keyword.id;

function overlapRisk(group: ProvisionalArticleGroup): ArticleVolumeStrategy["overlapRisk"] {
  if (group.keywords.length < 2) return "unknown";
  if (group.evidence.lexical >= 0.75) return "high";
  if (group.evidence.lexical >= 0.45) return "medium";
  return "low";
}

function volumeFactor(risk: ArticleVolumeStrategy["overlapRisk"]): number | null {
  if (risk === "low") return 1;
  if (risk === "medium") return 0.75;
  if (risk === "high") return 0.5;
  return null;
}

export function calculateArticleVolumeStrategy(group: ProvisionalArticleGroup): ArticleVolumeStrategy {
  const risk = overlapRisk(group);
  const factor = volumeFactor(risk);
  const principalId = group.principalSuggestion.keywordId;
  const contributions = group.keywords.map(keyword => {
    const role = keyword.id === principalId ? "principal" : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria";
    const volume = finiteVolume(keyword.volume_search);
    const contribution = role === "principal" ? "central" : role === "reforco_narrativo" ? "semantic_coverage" : "incremental_volume";
    const incrementalVolume = role === "secundaria" && volume !== null && risk === "low" ? volume : null;
    const rationale = role === "principal"
      ? "Keyword central: sua demanda orienta a identidade do artigo."
      : role === "secundaria"
        ? "Consulta compatível para ampliar alcance; volume incremental só é atribuído quando não há risco relevante de sobreposição."
        : "Reforço narrativo: completa entidades e subtemas sem criar volume artificial.";
    return { keywordId: keyword.id, keywordDnaId: sourceKeywordDnaId(keyword), role, volume, incrementalVolume, contribution, rationale };
  });
  const primaryKeywordVolume = contributions.find(item => item.role === "principal")?.volume ?? null;
  const secondaryKeywordVolumeSum = sumKnown(contributions.filter(item => item.role === "secundaria").map(item => item.volume));
  const reinforcementKeywordVolumeSum = sumKnown(contributions.filter(item => item.role === "reforco_narrativo").map(item => item.volume));
  const grossCombinedVolume = sumKnown(contributions.map(item => item.volume));
  const adjustedCombinedVolume = grossCombinedVolume !== null && factor !== null ? Math.round(grossCombinedVolume * factor * 100) / 100 : null;
  const volumePurpose = group.keywords.length <= 1
    ? "support_primary"
    : contributions.some(item => item.role === "secundaria") && contributions.some(item => item.role === "reforco_narrativo")
      ? "mixed"
      : contributions.some(item => item.role === "secundaria") ? "expand_reach" : "support_primary";
  return ArticleVolumeStrategySchema.parse({
    primaryKeywordVolume, secondaryKeywordVolumeSum, reinforcementKeywordVolumeSum, grossCombinedVolume, adjustedCombinedVolume,
    overlapRisk: risk, volumePurpose, contributions, calculationVersion: "article-strategy-v1",
  });
}

export function calculateArticleHierarchyStrategy(group: ProvisionalArticleGroup): ArticleHierarchyStrategy {
  const breakdown = group.principalSuggestion.breakdown;
  const components = {
    volume: breakdown.volume,
    semanticCentrality: breakdown.centralidadeSemantica,
    topicalBreadth: Math.max(group.evidence.lexical, group.evidence.entities),
    siloLinkCapacity: group.evidence.silo,
    businessPriority: Math.min(1, breakdown.aderenciaMarca * 0.6 + breakdown.potencialComercial * 0.4),
  };
  const score = components.volume * 0.2 + components.semanticCentrality * 0.25 + components.topicalBreadth * 0.2
    + components.siloLinkCapacity * 0.15 + components.businessPriority * 0.2;
  const status = group.architectureStatus === "architecture_confirmed" ? "human_confirmed" : group.architectureStatus === "conflict" ? "conflict" : "suggested";
  return ArticleHierarchyStrategySchema.parse({
    role: group.suggestedHierarchy,
    status,
    score: Math.max(0, Math.min(1, score)),
    rank: null,
    components,
    rationale: [
      `Papel ${group.suggestedHierarchy} derivado de centralidade semântica, abrangência, silo e prioridade de negócio.`,
      `Volume participa do score (${Math.round(components.volume * 100)}%), mas não decide sozinho a hierarquia.`,
      group.evidence.silo >= 0.75 ? "O grupo mantém capacidade forte de ligação dentro do silo." : "A capacidade de ligação no silo ainda exige revisão humana.",
    ],
    calculationVersion: "article-strategy-v1",
  });
}

export function calculateArticleStrategicPurpose(group: ProvisionalArticleGroup, primaryIntent: string, volume: ArticleVolumeStrategy, hierarchy: ArticleHierarchyStrategy): ArticleStrategicPurpose {
  const principal = group.keywords.find(keyword => keyword.id === group.principalSuggestion.keywordId) || group.keywords[0];
  const intent = normalizeSearchIntent(primaryIntent);
  const primaryObjective = intent === "informational"
    ? "answer_central_question"
    : intent === "commercial_investigation" || intent === "local"
      ? "capture_qualified_demand"
      : intent === "transactional"
        ? "support_conversion"
        : hierarchy.role === "Pilar" ? "consolidate_topic" : "unknown";
  const audience = typeof principal.analise_semantica?.publico === "string" ? principal.analise_semantica.publico : "o público associado à principal";
  const searchNeed = typeof principal.analise_semantica?.problema_percebido === "string" ? principal.analise_semantica.problema_percebido : `entender ${principal.keyword}`;
  const purposeLabel = primaryObjective === "answer_central_question" ? "responder à pergunta central"
    : primaryObjective === "capture_qualified_demand" ? "capturar uma demanda qualificada"
      : primaryObjective === "support_conversion" ? "apoiar uma decisão de conversão" : "consolidar o tema no silo";
  return ArticleStrategicPurposeSchema.parse({
    primaryObjective,
    summary: `Formar um artigo sobre “${principal.keyword}” para ${purposeLabel}, mantendo a principal como identidade e usando ${group.keywords.length - 1} referência(s) compatível(is) como cobertura controlada.`,
    audienceNeed: String(audience),
    searchNeed: String(searchNeed),
    semanticScope: group.keywords.map(keyword => keyword.keyword),
    successConditions: [
      "Preservar a intenção herdada da keyword principal.",
      volume.adjustedCombinedVolume !== null ? "Expandir cobertura sem contar sobreposição como demanda nova." : "Registrar a ausência de volume ajustado como pendência factual.",
      hierarchy.role === "Pilar" ? "Conectar o tema ao silo como referência estrutural." : "Aprofundar o silo sem competir com o artigo Pilar.",
    ],
  });
}

function principalKgrStatus(group: ProvisionalArticleGroup, principal: ArchitectKeyword): ArticleKeywordStrategy["principalKgrStatus"] {
  const identity = group.kgrIdentity || principal.kgrIdentity;
  if (!identity) return "unknown";
  if (identity.isKgrArticle && identity.bindingStatus === "confirmed" && ["minerador", "confirmed_import", "human_confirmation"].includes(identity.source)) return "qualified";
  if (identity.status === "not_kgr" || !identity.isKgrArticle) return "not_qualified";
  return "unknown";
}

function slugCoherence(group: ProvisionalArticleGroup, principal: ArchitectKeyword): ArticleKeywordStrategy["slugCoherence"] {
  if (group.publishedAnchorId || principal.isPublished || principal.status?.toLowerCase() === "publicado") return "protected_published";
  const semanticOrigin = principal.analise_semantica?.site_origin;
  const candidate = principal.urlEvidence?.slugCoherence || (semanticOrigin && typeof semanticOrigin === "object" ? (semanticOrigin as Record<string, unknown>).slugCoherence : undefined);
  return candidate === "high" || candidate === "medium" || candidate === "low" ? candidate : "unknown";
}

export function calculateArticleKeywordStrategy(input: {
  group: ProvisionalArticleGroup;
  principalIntent: string;
  volume: ArticleVolumeStrategy;
  published: boolean;
}): ArticleKeywordStrategy {
  const principal = input.group.keywords.find(keyword => keyword.id === input.group.principalSuggestion.keywordId) || input.group.keywords[0];
  const supports = input.group.keywords.filter(keyword => keyword.id !== principal.id);
  const knownVolumes = input.volume.contributions.map(contribution => contribution.volume);
  const knownCount = knownVolumes.filter(value => value !== null).length;
  const volumeCoverage = knownCount === knownVolumes.length ? "complete" : knownCount === 0 ? "unavailable" : "partial";
  const secondaryVolume = sumKnown(input.volume.contributions.filter(contribution => contribution.role === "secundaria").map(contribution => contribution.volume));
  return ArticleKeywordStrategySchema.parse({
    principalKeywordDnaId: sourceKeywordDnaId(principal),
    secondaryKeywordDnaIds: supports.filter(keyword => input.group.roles[keyword.id] !== "reforco_narrativo").slice(0, 5).map(sourceKeywordDnaId),
    dominantIntent: normalizeSearchIntent(input.principalIntent),
    principalVolume: input.volume.primaryKeywordVolume,
    secondaryVolume,
    combinedVolume: input.volume.grossCombinedVolume,
    volumeCoverage,
    principalKgrStatus: principalKgrStatus(input.group, principal),
    score: input.group.confidence,
    slugCoherence: slugCoherence(input.group, principal),
    groupingRationale: `Grupo formado com compatibilidade lexical ${Math.round(input.group.evidence.lexical * 100)}%, de intenção ${Math.round(input.group.evidence.intent * 100)}% e semântica ${Math.round(input.group.evidence.entities * 100)}%; confirmação humana permanece obrigatória.`,
    semanticNarrative: [
      `A principal "${principal.keyword}" define a intenção dominante e a promessa do artigo.`,
      ...supports.map(keyword => `"${keyword.keyword}" reforça cobertura sem substituir a principal.`),
    ],
    publicationProtection: {
      isPublished: input.published,
      protectedFields: input.published ? ["slug", "canonical", "url", "brand", "principal"] : [],
    },
  });
}

export function deriveArticleKgrIdentity(group: ProvisionalArticleGroup, principal: ArchitectKeyword, suggestedSlug: string): ArticleKgrIdentity | undefined {
  const existing = group.kgrIdentity || principal.kgrIdentity;
  if (!existing) return undefined;
  const principalKeywordDnaId = existing.principalKeywordDnaId || sourceKeywordDnaId(principal);
  const samePrincipal = !existing.principalKeywordDnaId || existing.principalKeywordDnaId === principalKeywordDnaId;
  const sameSlug = !existing.boundSlug || existing.boundSlug === suggestedSlug;
  const conflict = existing.isKgrArticle && (!samePrincipal || !sameSlug);
  const bindingStatus = conflict ? "conflict" : existing.bindingStatus;
  const status = conflict ? "conflict" : existing.isKgrArticle
    ? existing.bindingStatus === "confirmed" || existing.bindingStatus === "candidate" ? existing.bindingStatus : "unknown"
    : "not_kgr";
  return {
    ...existing,
    principalKeywordDnaId,
    primaryKeywordId: principal.id,
    primaryVolume: finiteVolume(principal.volume_search),
    boundSlug: existing.boundSlug || (existing.isKgrArticle ? suggestedSlug : undefined),
    bindingStatus,
    status,
    purpose: existing.isKgrArticle ? "Vincular a demanda KGR confirmada ou candidata à identidade da keyword principal e do slug." : "Registro explícito de não-KGR; não inferir KGR por score ou similaridade.",
  };
}

function referenceKeyword(reference: ArticleDNA["keywordReferences"][number]): string {
  const snapshot = reference.keywordDnaSnapshot?.sourceKeywordSnapshot;
  const keyword = snapshot && typeof snapshot.keyword === "string" ? snapshot.keyword : undefined;
  return keyword || reference.keywordId;
}

function fallbackVolumeStrategy(article: ArticleDNA): ArticleVolumeStrategy {
  const contributions = article.keywordReferences.map(reference => ({
    keywordId: reference.keywordId,
    keywordDnaId: reference.keywordDnaSnapshot?.keywordId || reference.keywordId,
    role: reference.role,
    volume: reference.volume ?? null,
    incrementalVolume: reference.incrementalVolume ?? null,
    contribution: reference.contribution || (reference.role === "principal" ? "central" : reference.role === "secundaria" ? "incremental_volume" : "semantic_coverage"),
    rationale: reference.purposeRationale || reference.purpose || "Contribuição registrada na referência do ArticleDNA.",
  }));
  const primary = contributions.find(item => item.role === "principal")?.volume ?? null;
  const secondary = sumKnown(contributions.filter(item => item.role === "secundaria").map(item => item.volume));
  const reinforcement = sumKnown(contributions.filter(item => item.role === "reforco_narrativo").map(item => item.volume));
  const gross = sumKnown(contributions.map(item => item.volume));
  return ArticleVolumeStrategySchema.parse({
    primaryKeywordVolume: primary, secondaryKeywordVolumeSum: secondary, reinforcementKeywordVolumeSum: reinforcement,
    grossCombinedVolume: gross, adjustedCombinedVolume: null, overlapRisk: "unknown", volumePurpose: contributions.some(item => item.role === "secundaria") ? "expand_reach" : "support_primary",
    contributions, calculationVersion: "article-strategy-v1-compat",
  });
}

function fallbackHierarchyStrategy(article: ArticleDNA): ArticleHierarchyStrategy {
  return ArticleHierarchyStrategySchema.parse({
    role: article.hierarchy, status: article.architectureStatus === "architecture_confirmed" ? "human_confirmed" : article.architectureStatus === "conflict" ? "conflict" : "suggested",
    score: article.confidence, rank: null,
    components: { volume: 0, semanticCentrality: article.confidence, topicalBreadth: article.confidence, siloLinkCapacity: article.siloId ? 1 : 0, businessPriority: article.confidence },
    rationale: ["Compatibilidade derivada de ArticleDNA legado; recalcular ao formar uma nova versão."], calculationVersion: "article-strategy-v1-compat",
  });
}

function fallbackPurpose(article: ArticleDNA, hierarchy: ArticleHierarchyStrategy): ArticleStrategicPurpose {
  return ArticleStrategicPurposeSchema.parse({
    primaryObjective: article.mainIntent === "transactional" ? "support_conversion" : article.mainIntent === "commercial_investigation" || article.mainIntent === "local" ? "capture_qualified_demand" : article.mainIntent === "informational" ? "answer_central_question" : hierarchy.role === "Pilar" ? "consolidate_topic" : "unknown",
    summary: article.promise,
    audienceNeed: article.audience,
    searchNeed: article.problem,
    semanticScope: article.coverage,
    successConditions: ["Preservar a intenção e a identidade da principal.", "Submeter a cópia à confirmação humana antes do planejamento final."],
  });
}

export function buildArticleControlContext(article: ArticleDNA, options: { published?: boolean } = {}): ArticleControlContext {
  const published = options.published ?? Boolean(article.publishedIdentityRef || article.articleId.startsWith("published:"));
  const primary = article.keywordReferences.find(reference => reference.keywordId === article.principalKeywordId) || article.keywordReferences[0];
  const volume = article.volumeStrategy || fallbackVolumeStrategy(article);
  const hierarchy = article.hierarchyStrategy || fallbackHierarchyStrategy(article);
  const strategicPurpose = article.strategicPurpose || fallbackPurpose(article, hierarchy);
  const unitStrategy = buildArticleUnitStrategy({ article, published });
  const primaryKeywordDnaId = primary.keywordDnaSnapshot?.keywordId || primary.keywordDnaVersionId || primary.keywordId;
  const sourcePolicy = article.primaryKeywordPolicyContext?.policy
    || normalizePrimaryKeywordPolicy(primary.keywordDnaSnapshot?.payload.primaryKeywordPolicy)
    || article.primaryKeywordPolicy;
  const primaryPolicy = resolvePrimaryKeywordPolicy({
    published, sourcePolicy, principalKeywordId: article.principalKeywordId,
    keywordUrlRelation: primary.keywordUrlRelation, architectureStatus: article.architectureStatus,
    kgrIdentity: article.kgrIdentity, slug: article.suggestedSlug,
  });
  const identity = resolveArticleSerpIdentityContext({
    published,
    principalKeywordId: article.principalKeywordId,
    primaryKeywordPolicy: sourcePolicy,
    keywordUrlRelation: primary.keywordUrlRelation,
    architectureStatus: article.architectureStatus,
    kgrIdentity: article.kgrIdentity,
    slug: article.suggestedSlug,
  });
  const protectedActions = [
    ...(identity.publishedIdentityProtected ? ["preserve_published_url", "preserve_published_slug", "preserve_published_canonical", "preserve_brand"] : []),
    ...(identity.principalProtected ? ["preserve_confirmed_principal"] : []),
    ...(identity.kgrIdentityProtected ? ["preserve_kgr_principal_slug_binding"] : []),
  ];
  return ArticleControlContextSchema.parse({
    articleId: article.articleId, brandId: article.brandId, publicationStatus: published ? "published" : "new",
    ...(article.architectureStatus ? { architectureStatus: article.architectureStatus } : {}),
    primaryKeyword: {
      keywordId: article.principalKeywordId, keywordDnaId: primaryKeywordDnaId, keyword: referenceKeyword(primary), intent: normalizeSearchIntent(article.mainIntent),
      text: referenceKeyword(primary), slug: article.suggestedSlug, canonical: article.canonical, policy: primaryPolicy.policy,
      protected: identity.principalProtected, protectionReason: primaryPolicy.protectionReason,
    },
    ...(article.kgrIdentity ? { kgr: article.kgrIdentity } : {}), ...(article.keywordStrategy ? { keywordStrategy: article.keywordStrategy } : {}), volume, hierarchy, strategicPurpose,
    unit: unitStrategy.unit,
    serpStrategy: unitStrategy.serpStrategy,
    intent: { primary: unitStrategy.serpStrategy.primaryIntent, sourceKeywordDnaId: primaryKeywordDnaId },
    purpose: unitStrategy.purpose,
    allowedActions: ["improve_working_copy", "add_evidence", "propose_serp_strengthening", ...(identity.principalProtected ? [] : ["correct_candidate_principal"])],
    protectedActions,
    forbiddenActions: ["invent_volume", "confirm_kgr_without_human_decision", ...(published ? ["replace_published_identity"] : [])],
  });
}

export function isControlContextKgrProtected(context: ArticleControlContext): boolean {
  return Boolean(context.kgr && isConfirmedKgrIdentity(context.kgr, context.primaryKeyword.keywordId, context.primaryKeyword.slug));
}
