import { z } from "zod";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";
import { TerritoryRefSchema } from "./territory-ref.ts";
import { TerritoryNarrativeSchema } from "./territory-narrative.ts";
import { SiloWorkingCopyRefSchema } from "./silo-working-copy-record.ts";
import {
  ARTICLE_TERMINAL_COMPATIBILITY,
  ARTICLE_TERMINAL_FUNNELS,
  ARTICLE_TERMINAL_INTENTS,
  ARTICLE_TERMINAL_KGR,
  ARTICLE_TERMINAL_KGR_APPLICABILITY,
  ARTICLE_TERMINAL_PROTECTIONS,
} from "./article-classification-closure.ts";

export const ConfidenceSchema = z.number().min(0).max(1);
export const IntentSchema = z.string().trim().min(1).nullable().optional();

export const NormalizedSearchIntentSchema = z.enum([
  "informational",
  "commercial_investigation",
  "transactional",
  "navigational",
  "local",
  "mixed",
  "unknown",
]);
export type NormalizedSearchIntent = z.infer<typeof NormalizedSearchIntentSchema>;
export const IntentCompatibilitySchema = z.enum(["aligned", "adjacent", "supporting", "outlier", "unknown"]);
export type IntentCompatibility = z.infer<typeof IntentCompatibilitySchema>;
export const ArticleIntentProfileSchema = z.object({
  primaryIntent: NormalizedSearchIntentSchema,
  originalLabel: z.string().min(1).optional(),
  sourceKeywordId: z.string().min(1),
  sourceKeywordDnaId: z.string().min(1),
  sourceKeywordDnaVersionId: z.string().min(1).optional(),
  confirmation: z.enum(["inherited_from_confirmed_primary", "inherited_from_candidate", "human_confirmed", "unknown"]),
  status: z.enum(["candidate", "confirmed", "conflict", "unknown"]).optional(),
  articlePurpose: NormalizedSearchIntentSchema.optional(),
  conversionLayer: z.object({
    hasCommercialCta: z.boolean(),
    ctaPurpose: z.string().min(1).optional(),
  }).strict().optional(),
  secondaryIntentSignals: z.array(z.object({
    keywordId: z.string().min(1), keywordDnaId: z.string().min(1), intent: NormalizedSearchIntentSchema, compatibility: IntentCompatibilitySchema,
  }).strict()).default([]),
}).strict();
export type ArticleIntentProfile = z.infer<typeof ArticleIntentProfileSchema>;

export const VersionStatusSchema = z.enum(["draft", "proposed", "approved", "rejected", "superseded"]);
export const ContentHashSchema = z.string().regex(/^(sha256:[a-f0-9]{64}|legacy:[a-z0-9-]+)$/);
export const VersionReferenceSchema = z.object({
  entityId: z.string().min(1),
  versionId: z.string().min(1),
  contentHash: ContentHashSchema,
}).strict();
export type VersionReference = z.infer<typeof VersionReferenceSchema>;

export const VersionMetadataSchema = z.object({
  versionId: z.string().min(1),
  entityId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  previousVersionId: z.string().min(1).nullable(),
  contentHash: ContentHashSchema,
  origin: z.enum(["human", "ai", "serp", "import", "legacy", "system"]),
  changeReason: z.string().min(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
});

export const VersionStatusEventSchema = z.object({
  eventId: z.string().min(1),
  versionId: z.string().min(1),
  status: VersionStatusSchema,
  occurredAt: z.string().datetime(),
  actorId: z.string().min(1),
  reason: z.string().min(1),
});
export type VersionStatusEvent = z.infer<typeof VersionStatusEventSchema>;

export type VersionEnvelope<T> = z.infer<typeof VersionMetadataSchema> & { payload: T };
export const versionEnvelopeSchema = <T extends z.ZodType>(payload: T) => VersionMetadataSchema.extend({ payload });

export const SemanticAnalysisSchema = z.record(z.string(), z.unknown()).nullable().optional();
export const HistoricalKgrEvidenceSchema = z.object({
  resultsAllintitle: z.number().int().nonnegative().nullable().optional(), kgr: z.number().nullable().optional(),
  status: z.enum(["available", "historical", "not_measured", "not_applicable", "unavailable", "error", "unknown"]),
  measuredAt: z.string().datetime().optional(), source: z.string().min(1).optional(), calculationVersion: z.string().min(1).optional(),
}).strict();
export type HistoricalKgrEvidence = z.infer<typeof HistoricalKgrEvidenceSchema>;
export const GoogleAdsMonthlySearchVolumeSchema = z.object({ year: z.number().int().nullable(), month: z.string().nullable(), searches: z.number().int().nonnegative().nullable() }).strict();
export const GoogleAdsDemandEvidenceSchema = z.object({
  source: z.literal("google_ads"), providerVersion: z.string().min(1).optional(), measuredAt: z.string().datetime().optional(),
  averageMonthlySearches: z.number().int().nonnegative().nullable(), monthlySearchVolumes: z.array(GoogleAdsMonthlySearchVolumeSchema),
  metricStatus: z.string().min(1).nullable().optional(), currencyCode: z.string().min(1).nullable().optional(), timeZone: z.string().min(1).nullable().optional(),
  targeting: z.record(z.string(), z.unknown()).nullable().optional(), providerCanonicalKeyword: z.string().min(1).nullable().optional(),
  matchedRequestedKeywords: z.array(z.string()).nullable().optional(), unmatchedRequestedKeywords: z.array(z.string()).nullable().optional(),
  trend: z.union([z.number(), z.string().min(1)]).nullable().optional(), seasonality: z.record(z.string(), z.unknown()).nullable().optional(),
  peakMonths: z.array(z.unknown()).nullable().optional(), recentGrowth: z.union([z.number(), z.string().min(1)]).nullable().optional(), historyCoverageMonths: z.number().int().nonnegative().nullable().optional(),
  competitionAds: z.string().nullable(), competitionIndexAds: z.number().int().nonnegative().nullable(),
  lowTopOfPageBidMicros: z.string().nullable(), highTopOfPageBidMicros: z.string().nullable(), averageCpcMicros: z.string().nullable(),
  closeVariants: z.array(z.string()), normalizedCloseVariants: z.array(z.string()), snapshotRef: z.string().min(1).nullable().optional(),
}).strict();
export type GoogleAdsDemandEvidence = z.infer<typeof GoogleAdsDemandEvidenceSchema>;
export const KeywordDemandEvidenceSchema = z.object({ historicalKgr: HistoricalKgrEvidenceSchema.optional(), googleAds: GoogleAdsDemandEvidenceSchema.optional() }).strict();
export type KeywordDemandEvidence = z.infer<typeof KeywordDemandEvidenceSchema>;
/** Valor recebido do Minerador; `reviewable` permanece como alias de transporte. */
export const PrimaryKeywordPolicySchema = z.enum(["locked", "reviewable", "revisable", "free", "conflict", "unknown"]);
export type PrimaryKeywordPolicy = z.infer<typeof PrimaryKeywordPolicySchema>;
export const PrimaryKeywordEffectivePolicySchema = z.enum(["locked", "revisable", "free", "conflict", "unknown"]);
export type PrimaryKeywordEffectivePolicy = z.infer<typeof PrimaryKeywordEffectivePolicySchema>;
export const PrimaryKeywordPolicySourceSchema = z.enum(["minerador", "human_confirmation", "legacy", "system", "unknown"]);
export type PrimaryKeywordPolicySource = z.infer<typeof PrimaryKeywordPolicySourceSchema>;
export const PrimaryKeywordPolicyHistoryEntrySchema = z.object({
  previous: PrimaryKeywordPolicySchema,
  next: PrimaryKeywordPolicySchema,
  actorId: z.string().min(1),
  changedAt: z.string().datetime(),
  reason: z.string().min(1).optional(),
}).strict();
export type PrimaryKeywordPolicyHistoryEntry = z.infer<typeof PrimaryKeywordPolicyHistoryEntrySchema>;
export const PrimaryKeywordPolicyContextSchema = z.object({
  policy: PrimaryKeywordPolicySchema,
  currentKeyword: z.string().min(1),
  publishedOriginalKeyword: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
  decidedAt: z.string().datetime().optional(),
  version: z.number().int().nonnegative().optional(),
  reviewRequired: z.boolean().optional(),
  sourcePolicy: z.string().min(1).optional(),
  source: PrimaryKeywordPolicySourceSchema.optional(),
  sourceVersion: z.string().min(1).optional(),
  sourceHash: z.string().min(1).optional(),
  history: z.array(PrimaryKeywordPolicyHistoryEntrySchema).optional(),
}).strict();

export const PrimaryKeywordCandidateSchema = z.object({
  keywordId: z.string().min(1),
  keywordDnaId: z.string().min(1),
  keyword: z.string().min(1),
  status: z.enum(["current", "candidate", "confirmed", "rejected"]),
  source: z.enum(["minerador", "serp", "human", "legacy", "system"]),
  reason: z.string().min(1).optional(),
}).strict();
export type PrimaryKeywordCandidate = z.infer<typeof PrimaryKeywordCandidateSchema>;

export const PrimaryKeywordDecisionSchema = z.object({
  status: z.enum(["pending", "confirmed", "rejected"]),
  previousKeywordId: z.string().min(1).optional(),
  selectedKeywordId: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
  decidedAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional(),
}).strict();
export type PrimaryKeywordDecision = z.infer<typeof PrimaryKeywordDecisionSchema>;

export const KeywordUrlRelationshipSchema = z.enum([
  "confirmed_primary",
  "candidate_primary",
  "likely_support",
  "mentioned_in_content",
  "undefined",
]);
export type KeywordUrlRelationship = z.infer<typeof KeywordUrlRelationshipSchema>;

export const ArticleArchitectureStatusSchema = z.enum([
  "unstructured",
  "awaiting_architecture",
  "in_review",
  "architecture_confirmed",
  "conflict",
  "structural_review_required",
]);
export type ArticleArchitectureStatus = z.infer<typeof ArticleArchitectureStatusSchema>;

/**
 * A decisão pertence ao artigo formado, mas sua cópia de trabalho fica no
 * payload da keyword que atualmente exerce o papel de Principal. Os campos
 * são aditivos para que identidades KGR históricas continuem legíveis.
 */
export const ArticleKgrDecisionSchema = z.enum([
  "YES",
  "NO",
  "PENDING_HUMAN_DECISION",
  "PENDING_APPLICABILITY",
  "ABSENT",
]);
export type ArticleKgrDecision = z.infer<typeof ArticleKgrDecisionSchema>;

export const ArticleKgrDecisionSourceSchema = z.enum([
  "FULL_KGR_RULE",
  "HUMAN_DECISION",
  "CONFIRMED_KGR_BINDING",
  "KEYWORD_APPLICABILITY_RULE",
  "AWAITING_HUMAN_DECISION",
  "AWAITING_KEYWORD_APPLICABILITY",
  "MISSING_KGR_SCORE",
]);
export type ArticleKgrDecisionSource = z.infer<typeof ArticleKgrDecisionSourceSchema>;

export const ArticleKgrDecisionHistoryEntrySchema = z.object({
  decision: z.enum(["YES", "NO"]),
  source: z.literal("HUMAN_DECISION"),
  principalKeywordId: z.string().min(1),
  principalKeywordDnaId: z.string().min(1).optional(),
  principalKeywordDnaVersionId: z.string().min(1).optional(),
  principalKeywordDnaContentHash: ContentHashSchema.optional(),
  principalKgrScore: z.number().nonnegative().nullable().optional(),
  principalKgrApplicability: z.enum(["pending", "applicable", "not_applicable"]).optional(),
  actorUserId: z.string().min(1),
  decidedAt: z.string().datetime(),
  reason: z.string().min(1),
}).strict();
export type ArticleKgrDecisionHistoryEntry = z.infer<typeof ArticleKgrDecisionHistoryEntrySchema>;

export const ArticleKgrIdentitySchema = z.object({
  isKgrArticle: z.boolean(),
  source: z.enum(["minerador", "confirmed_import", "human_confirmation", "legacy", "unknown"]),
  principalKeywordDnaId: z.string().min(1).optional(),
  brandId: z.string().min(1).optional(),
  articleId: z.string().min(1).optional(),
  workflowItemId: z.string().min(1).optional(),
  boundSlug: z.string().min(1).optional(),
  bindingStatus: z.enum(["confirmed", "candidate", "conflict", "not_applicable"]),
  principalKeywordDnaVersionId: z.string().min(1).optional(),
  principalKeywordDnaContentHash: ContentHashSchema.optional(),
  status: z.enum(["confirmed", "candidate", "conflict", "not_kgr", "unknown"]).optional(),
  primaryKeywordId: z.string().min(1).optional(),
  primaryVolume: z.number().nullable().optional(),
  resultCount: z.number().int().nonnegative().nullable().optional(),
  purpose: z.string().min(1).optional(),
  evidenceKeywordDnaIds: z.array(z.string().min(1)).optional(),
  kgrValue: z.number().nullable().optional(),
  principalKgrApplicability: z.enum(["pending", "applicable", "not_applicable"]).optional(),
  kgrTier: z.string().min(1).optional(),
  confirmedAt: z.string().datetime().optional(),
  confirmedBy: z.string().min(1).optional(),
  sourceVersion: z.string().min(1).optional(),
  sourceHash: ContentHashSchema.optional(),
  evidence: z.array(z.record(z.string(), z.unknown())).optional(),
  humanDecision: z.record(z.string(), z.unknown()).optional(),
  decision: ArticleKgrDecisionSchema.optional(),
  decisionSource: ArticleKgrDecisionSourceSchema.optional(),
  decisionReason: z.string().min(1).optional(),
  decisionContractVersion: z.string().min(1).optional(),
  decisionHistory: z.array(ArticleKgrDecisionHistoryEntrySchema).optional(),
  decidedBy: z.string().min(1).optional(),
  decidedAt: z.string().datetime().optional(),
  evaluatedAt: z.string().datetime().optional(),
  evaluatedBy: z.string().min(1).optional(),
}).strict();
export type ArticleKgrIdentity = z.infer<typeof ArticleKgrIdentitySchema>;

export const ArticleKeywordContributionSchema = z.object({
  keywordId: z.string().min(1),
  keywordDnaId: z.string().min(1),
  role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  volume: z.number().nullable(),
  incrementalVolume: z.number().nullable(),
  contribution: z.enum(["central", "incremental_volume", "semantic_coverage", "intent_support", "entity_support", "unknown"]),
  rationale: z.string().min(1),
}).strict();

export const ArticleVolumeStrategySchema = z.object({
  primaryKeywordVolume: z.number().nullable(),
  secondaryKeywordVolumeSum: z.number().nullable(),
  reinforcementKeywordVolumeSum: z.number().nullable(),
  grossCombinedVolume: z.number().nullable(),
  adjustedCombinedVolume: z.number().nullable(),
  overlapRisk: z.enum(["low", "medium", "high", "unknown"]),
  volumePurpose: z.enum(["expand_reach", "consolidate_low_volume_queries", "support_primary", "mixed", "unknown"]),
  contributions: z.array(ArticleKeywordContributionSchema).min(1),
  calculationVersion: z.string().min(1),
}).strict();
export type ArticleVolumeStrategy = z.infer<typeof ArticleVolumeStrategySchema>;

export const ArticleHierarchyStrategySchema = z.object({
  role: z.enum(["Pilar", "Suporte", "Reforco Narrativo"]),
  status: z.enum(["suggested", "human_confirmed", "conflict"]),
  score: ConfidenceSchema,
  rank: z.number().int().positive().nullable(),
  components: z.object({
    volume: ConfidenceSchema,
    semanticCentrality: ConfidenceSchema,
    topicalBreadth: ConfidenceSchema,
    siloLinkCapacity: ConfidenceSchema,
    businessPriority: ConfidenceSchema,
  }).strict(),
  rationale: z.array(z.string().min(1)).min(1),
  calculationVersion: z.string().min(1),
}).strict();
export type ArticleHierarchyStrategy = z.infer<typeof ArticleHierarchyStrategySchema>;

export const ArticleStrategicPurposeSchema = z.object({
  primaryObjective: z.enum(["answer_central_question", "capture_qualified_demand", "support_conversion", "consolidate_topic", "strengthen_published_asset", "unknown"]),
  summary: z.string().min(1),
  audienceNeed: z.string().min(1),
  searchNeed: z.string().min(1),
  semanticScope: z.array(z.string().min(1)).min(1),
  successConditions: z.array(z.string().min(1)).min(1),
}).strict();
export type ArticleStrategicPurpose = z.infer<typeof ArticleStrategicPurposeSchema>;

export const EditorialArticleUnitTypeSchema = z.enum(["article", "service_page", "landing_page", "category_page", "other"]);
export type EditorialArticleUnitType = z.infer<typeof EditorialArticleUnitTypeSchema>;

export const LandingPagePurposeSchema = z.enum(["seo", "campaign", "hybrid", "unknown"]);
export type LandingPagePurpose = z.infer<typeof LandingPagePurposeSchema>;

export const EditorialUnitClassificationSchema = z.object({
  type: EditorialArticleUnitTypeSchema,
  status: z.enum(["suggested", "human_confirmed", "conflict", "unknown"]),
  source: z.enum(["manual", "site_evidence", "ai_suggestion", "legacy", "unknown"]),
  confidence: ConfidenceSchema.optional(),
  evidence: z.object({
    urlPath: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    h1: z.string().min(1).optional(),
    schemaTypes: z.array(z.string().min(1)).optional(),
    contentSignals: z.array(z.string().min(1)).optional(),
    sourceUrl: z.string().url().optional(),
  }).strict().optional(),
  landingPagePurpose: LandingPagePurposeSchema.optional(),
  confirmedAt: z.string().datetime().optional(),
  confirmedBy: z.string().min(1).optional(),
}).strict();
export type EditorialUnitClassification = z.infer<typeof EditorialUnitClassificationSchema>;

export const EditorialUnitPurposeSchema = z.object({
  unitType: EditorialArticleUnitTypeSchema,
  primaryObjective: z.enum(["capture_kgr_opportunity", "competitive_information", "present_service", "generate_local_leads", "convert_seo_traffic", "convert_campaign_traffic", "organize_category", "strengthen_published_url", "other"]),
  searchNeed: z.string().min(1),
  audienceNeed: z.string().min(1),
  businessObjective: z.string().min(1).optional(),
  conversionRole: z.enum(["inform", "assist_decision", "generate_lead", "sell", "navigate", "mixed", "unknown"]),
  indexationIntent: z.enum(["index", "noindex", "undecided", "unknown"]),
  rationale: z.array(z.string().min(1)).min(1),
}).strict();
export type EditorialUnitPurpose = z.infer<typeof EditorialUnitPurposeSchema>;

export const ArticleSerpStrategySchema = z.object({
  lifecycleMode: z.enum(["formacao", "arquitetura_publicado", "fortalecimento"]),
  competitionStrategy: z.enum(["kgr_light", "competitive", "unknown"]),
  unitProfile: z.enum(["informational_article", "competitive_editorial_article", "service_commercial_local", "landing_seo_conversion", "landing_campaign_alignment", "landing_hybrid", "category_hub", "generic", "unknown"]),
  primaryIntent: NormalizedSearchIntentSchema,
  rationale: z.array(z.string().min(1)).min(1),
  allowedRecommendationTypes: z.array(z.string().min(1)),
  forbiddenRecommendationTypes: z.array(z.string().min(1)),
  strategyVersion: z.string().min(1),
}).strict();
export type ArticleSerpStrategy = z.infer<typeof ArticleSerpStrategySchema>;

export const ArticleKeywordStrategySchema = z.object({
  principalKeywordDnaId: z.string().min(1), secondaryKeywordDnaIds: z.array(z.string().min(1)).max(5),
  dominantIntent: NormalizedSearchIntentSchema, principalVolume: z.number().nonnegative().nullable(),
  secondaryVolume: z.number().nonnegative().nullable(), combinedVolume: z.number().nonnegative().nullable(),
  volumeCoverage: z.enum(["complete", "partial", "unavailable"]), principalKgrStatus: z.enum(["qualified", "not_qualified", "unknown"]),
  score: ConfidenceSchema, slugCoherence: z.enum(["high", "medium", "low", "protected_published", "unknown"]),
  groupingRationale: z.string().min(1), semanticNarrative: z.array(z.string().min(1)).min(1),
  publicationProtection: z.object({ isPublished: z.boolean(), protectedFields: z.array(z.enum(["slug", "canonical", "url", "brand", "principal"])) }).strict(),
}).strict();
export type ArticleKeywordStrategy = z.infer<typeof ArticleKeywordStrategySchema>;

export const ArticleControlContextSchema = z.object({
  articleId: z.string().min(1),
  brandId: z.string().min(1),
  publicationStatus: z.enum(["new", "published"]),
  architectureStatus: ArticleArchitectureStatusSchema.optional(),
  primaryKeyword: z.object({
    keywordId: z.string().min(1),
    keywordDnaId: z.string().min(1),
    keyword: z.string().min(1),
    text: z.string().min(1),
    intent: NormalizedSearchIntentSchema,
    slug: z.string().min(1),
    canonical: z.string().url().nullable(),
    policy: PrimaryKeywordEffectivePolicySchema,
    protected: z.boolean(),
    protectionReason: z.enum(["kgr_binding_confirmed", "architecture_confirmed", "minerador_locked", "published_revisable", "new_unit", "conflict", "unknown"]),
  }).strict(),
  kgr: ArticleKgrIdentitySchema.optional(),
  demandEvidence: KeywordDemandEvidenceSchema.optional(),
  keywordStrategy: ArticleKeywordStrategySchema.optional(),
  volume: ArticleVolumeStrategySchema,
  hierarchy: ArticleHierarchyStrategySchema,
  strategicPurpose: ArticleStrategicPurposeSchema,
  unit: EditorialUnitClassificationSchema.optional(),
  serpStrategy: ArticleSerpStrategySchema.optional(),
  intent: z.object({ primary: NormalizedSearchIntentSchema, sourceKeywordDnaId: z.string().min(1) }).strict().optional(),
  purpose: EditorialUnitPurposeSchema.optional(),
  allowedActions: z.array(z.string().min(1)),
  protectedActions: z.array(z.string().min(1)),
  forbiddenActions: z.array(z.string().min(1)),
}).strict();
export type ArticleControlContext = z.infer<typeof ArticleControlContextSchema>;

export const SiloCandidateMarkSchema = z.object({
  status: z.enum(["candidate", "not_candidate"]),
  origin: z.enum(["deterministic", "human"]),
  score: ConfidenceSchema.nullable(),
  reasons: z.array(z.string().min(1)).min(1),
  signals: z.object({
    volumeRank: ConfidenceSchema.nullable(),
    volumeHigh: z.boolean(),
    resultsPresent: z.boolean(),
    shortTerm: z.boolean(),
    broadEntity: z.boolean(),
    capacityPotential: z.boolean(),
    kgrOpportunity: z.boolean(),
    commercialSecondary: z.boolean(),
    specificNeed: z.boolean(),
    relatedKeywordCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type SiloCandidateMark = z.infer<typeof SiloCandidateMarkSchema>;

export const ArchitectKeywordSchema = z.object({
  id: z.string().min(1),
  keyword: z.string().trim().min(1),
  intent: IntentSchema,
  volume_search: z.number().nullable().optional(),
  results_allintitle: z.number().int().nonnegative().nullable().optional(),
  kgr_score: z.number().nullable().optional(),
  lista_id: z.string().nullable().optional(),
  silo_id: z.string().nullable().optional(),
  siloName: z.string().nullable().optional(),
  status: z.string().optional(),
  isPublished: z.boolean().optional(),
  slug_sugerido: z.string().nullable().optional(),
  hierarquia: z.string().nullable().optional(),
  analise_semantica: SemanticAnalysisSchema,
  keywordDnaRef: VersionReferenceSchema.optional(),
  publishedUrl: z.string().url().nullable().optional(),
  canonical: z.string().url().nullable().optional(),
  url: z.string().url().nullable().optional(),
  keywordUrlRelation: KeywordUrlRelationshipSchema.optional(),
  architectureStatus: ArticleArchitectureStatusSchema.optional(),
  urlEvidence: z.record(z.string(), z.unknown()).optional(),
  kgrIdentity: ArticleKgrIdentitySchema.optional(),
  primaryKeywordPolicy: PrimaryKeywordPolicySchema.optional(),
  primaryKeywordPolicyContext: PrimaryKeywordPolicyContextSchema.optional(),
  demandEvidence: KeywordDemandEvidenceSchema.optional(),
  /** Proveniência já materializada na working copy; não substitui a origem remota. */
  keywordDnaSnapshot: z.record(z.string(), z.unknown()).optional(),
  /** Hipótese determinística da Fase 2; não é aprovação nem SiloDNA. */
  siloCandidate: SiloCandidateMarkSchema.optional(),
});

export type ArchitectKeyword = z.infer<typeof ArchitectKeywordSchema>;

export const KeywordRoleSchema = z.enum([
  "principal",
  "secundaria",
  "reforco_narrativo",
  "candidata_divisao",
]);

export const ScoreBreakdownSchema = z.object({
  cobertura: z.number().min(0).max(1),
  intencao: z.number().min(0).max(1),
  centralidadeSemantica: z.number().min(0).max(1),
  aderenciaMarca: z.number().min(0).max(1),
  potencialComercial: z.number().min(0).max(1),
  volume: z.number().min(0).max(1),
  dificuldade: z.number().min(0).max(1),
  qualidadeSlug: z.number().min(0).max(1),
  ancoraPublicada: z.number().min(0).max(1),
  serp: z.number().min(0).max(1).nullable(),
});

export const PrincipalSuggestionSchema = z.object({
  keywordId: z.string().min(1),
  score: ConfidenceSchema,
  breakdown: ScoreBreakdownSchema,
  justificativa: z.array(z.string()),
  pendencias: z.array(z.string()),
});

export const GroupEvidenceSchema = z.object({
  lexical: ConfidenceSchema,
  intent: ConfidenceSchema,
  entities: ConfidenceSchema,
  silo: ConfidenceSchema,
  combined: ConfidenceSchema,
});

export const ProvisionalGroupingReasonSchema = z.object({
  code: z.enum(["same_intent", "same_entity", "same_need", "semantic_variation", "possible_separation", "ambiguity", "conflict"]),
  kind: z.enum(["support", "review", "conflict"]),
  message: z.string().min(1),
}).strict();
export type ProvisionalGroupingReason = z.infer<typeof ProvisionalGroupingReasonSchema>;

export const ProvisionalArticleGroupSchema = z.object({
  id: z.string().min(1),
  keywordIds: z.array(z.string().min(1)).min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  keywords: z.array(ArchitectKeywordSchema).min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  publishedAnchorId: z.string().nullable(),
  /** Território que originou a proposta. Ausente = grupo legado, pré-2B. */
  territoryRef: TerritoryRefSchema.optional(),
  suggestedSiloId: z.string().nullable(),
  suggestedSiloName: z.string().nullable(),
  evidence: GroupEvidenceSchema,
  confidence: ConfidenceSchema,
  alerts: z.array(z.string()),
  principalSuggestion: PrincipalSuggestionSchema,
  roles: z.record(z.string(), KeywordRoleSchema),
  suggestedHierarchy: z.enum(["Pilar", "Suporte", "Reforco Narrativo"]),
  groupingReasons: z.array(ProvisionalGroupingReasonSchema).optional(),
  architectureStatus: ArticleArchitectureStatusSchema.optional(),
  kgrIdentity: ArticleKgrIdentitySchema.optional(),
});

export type ProvisionalArticleGroup = z.infer<typeof ProvisionalArticleGroupSchema>;

export const ConflictSchema = z.object({
  id: z.string().min(1),
  level: z.enum(["keyword", "artigo", "silo"]),
  type: z.string().min(1),
  severity: z.enum(["info", "atencao", "alto", "critico"]),
  entityIds: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
  evidence: z.array(z.string()),
  recommendation: z.string().min(1),
  humanDecisionRequired: z.boolean(),
});

export type ArchitectConflict = z.infer<typeof ConflictSchema>;

export const StrategicOperationSchema = z.object({
  type: z.enum([
    "manter_grupo",
    "dividir_grupo",
    "mover_keyword",
    "anexar_ao_publicado",
    "criar_artigo",
  ]),
  groupId: z.string().min(1),
  keywordIds: z.array(z.string().min(1)),
  targetGroupId: z.string().nullable().optional(),
  publishedArticleId: z.string().nullable().optional(),
  justification: z.string().min(1),
});

export const StrategicReviewSchema = z.object({
  operations: z.array(StrategicOperationSchema),
  groupSuggestions: z.array(z.object({
    groupId: z.string().min(1),
    principalKeywordId: z.string().min(1),
    secondaryKeywordIds: z.array(z.string().min(1)),
    narrativeReinforcementIds: z.array(z.string().min(1)),
    suggestedSiloId: z.string().nullable(),
    suggestedSiloName: z.string().nullable(),
    suggestedHierarchy: z.enum(["Pilar", "Suporte", "Reforco Narrativo"]),
    justification: z.string().min(1),
    confidence: ConfidenceSchema,
    humanDecisionPoints: z.array(z.string()),
  })),
  conflicts: z.array(ConflictSchema),
  summary: z.string().min(1),
});

export type StrategicReview = z.infer<typeof StrategicReviewSchema>;

export const KeywordReviewCandidateSchema = z.object({
  keywordId: z.string().min(1),
  keyword: z.string().min(1),
  intent: z.string().nullable(),
  centralEntity: z.string().nullable(),
  audience: z.string().nullable(),
  perceivedProblem: z.string().nullable(),
  desiredResult: z.string().nullable(),
  editorialType: z.string().nullable(),
  confidence: ConfidenceSchema.nullable(),
  isPublished: z.boolean(),
  /** Snapshot de entrada preservado para a revisão estrutural; não é resposta da IA. */
  keywordDnaSnapshot: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type KeywordReviewCandidate = z.infer<typeof KeywordReviewCandidateSchema>;

export const KeywordReviewFocusGroupSchema = z.object({
  groupId: z.string().min(1),
  articleId: z.string().min(1),
  isPublished: z.boolean(),
  publishedAnchorId: z.string().nullable(),
  currentPrincipalKeywordId: z.string().min(1),
  siloId: z.string().nullable(),
  siloName: z.string().nullable(),
  keywords: z.array(KeywordReviewCandidateSchema).min(1).max(40),
}).strict();
export type KeywordReviewFocusGroup = z.infer<typeof KeywordReviewFocusGroupSchema>;

export const KeywordArticleCatalogEntrySchema = z.object({
  groupId: z.string().min(1),
  articleId: z.string().min(1),
  isPublished: z.boolean(),
  publishedAnchorId: z.string().nullable(),
  principalKeywordId: z.string().min(1),
  principalKeyword: z.string().min(1),
  keywordIds: z.array(z.string().min(1)).min(1).max(100),
  keywordTerms: z.array(z.string().min(1)).min(1).max(30),
  intents: z.array(z.string()).max(12),
  centralEntities: z.array(z.string()).max(12),
  siloId: z.string().nullable(),
  siloName: z.string().nullable(),
}).strict();
export type KeywordArticleCatalogEntry = z.infer<typeof KeywordArticleCatalogEntrySchema>;

export const LogicalKeywordRecommendationSchema = z.object({
  keywordId: z.string().min(1),
  currentGroupId: z.string().min(1),
  currentFit: ConfidenceSchema,
  bestTargetGroupId: z.string().nullable(),
  bestTargetFit: ConfidenceSchema.nullable(),
  bestTargetPublished: z.boolean(),
  recommendation: z.enum(["manter", "avaliar_publicado", "avaliar_movimento", "avaliar_novo_artigo"]),
  reason: z.string().min(1),
}).strict();
export type LogicalKeywordRecommendation = z.infer<typeof LogicalKeywordRecommendationSchema>;

export const KeywordArticleDecisionSchema = z.object({
  keywordId: z.string().min(1),
  sourceGroupId: z.string().min(1),
  action: z.enum(["manter_no_artigo", "mover_para_artigo", "reforcar_publicado", "criar_novo_artigo"]),
  targetGroupId: z.string().nullable(),
  newArticleKey: z.string().min(1).nullable(),
  siloPlacement: z.object({
    action: z.enum(["manter_silo", "usar_silo_existente", "propor_novo_silo"]),
    siloId: z.string().min(1).nullable(),
    siloName: z.string().min(1).nullable(),
    newSiloKey: z.string().min(1).nullable(),
  }).strict(),
  suggestedRole: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  justification: z.string().min(1),
  confidence: ConfidenceSchema,
  humanDecisionPoints: z.array(z.string()),
}).strict().superRefine((decision, context) => {
  const needsTarget = decision.action === "mover_para_artigo" || decision.action === "reforcar_publicado";
  if (needsTarget !== Boolean(decision.targetGroupId)) {
    context.addIssue({ code: "custom", path: ["targetGroupId"], message: "A decisao precisa de um artigo-alvo somente ao mover ou reforcar." });
  }
  if ((decision.action === "criar_novo_artigo") !== Boolean(decision.newArticleKey)) {
    context.addIssue({ code: "custom", path: ["newArticleKey"], message: "Novo artigo precisa de uma chave de agrupamento." });
  }
  const placement = decision.siloPlacement;
  if (placement.action === "usar_silo_existente" && (!placement.siloId || !placement.siloName)) {
    context.addIssue({ code: "custom", path: ["siloPlacement"], message: "Silo existente precisa de ID e nome." });
  }
  if (placement.action === "propor_novo_silo" && (!placement.newSiloKey || !placement.siloName)) {
    context.addIssue({ code: "custom", path: ["siloPlacement"], message: "Novo silo precisa de chave e nome propostos." });
  }
});
export type KeywordArticleDecision = z.infer<typeof KeywordArticleDecisionSchema>;

export const AiArchitectureReviewStageSchema = z.enum([
  "diagnosticar_grupos",
  "revisar_pertencimento",
  "revisar_papeis",
  "revisar_canibalizacao",
  "consolidar_proposta",
]);
export type AiArchitectureReviewStage = z.infer<typeof AiArchitectureReviewStageSchema>;

export const AiArchitectureReviewStageTraceSchema = z.object({
  stage: AiArchitectureReviewStageSchema,
  status: z.enum(["completed", "evidence_insufficient"]),
  keywordIds: z.array(z.string().min(1)),
  groupIds: z.array(z.string().min(1)),
  note: z.string().min(1),
}).strict();
export type AiArchitectureReviewStageTrace = z.infer<typeof AiArchitectureReviewStageTraceSchema>;

/** Diff compacto da proposta. A resposta nunca precisa repetir o KeywordDNA. */
export const KeywordArticleReviewDiffSchema = z.object({
  keywordId: z.string().min(1),
  sourceGroupId: z.string().min(1),
  targetGroupId: z.string().min(1).nullable(),
  newArticleKey: z.string().min(1).nullable(),
  fromRole: z.enum(["principal", "secundaria", "reforco_narrativo", "candidata_divisao"]).nullable(),
  toRole: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  action: KeywordArticleDecisionSchema.shape.action,
  justification: z.string().min(1),
  confidence: ConfidenceSchema,
  publishedProtected: z.boolean(),
}).strict();
export type KeywordArticleReviewDiff = z.infer<typeof KeywordArticleReviewDiffSchema>;

export const KeywordArticleReviewSchema = z.object({
  decisions: z.array(KeywordArticleDecisionSchema).min(1),
  conflicts: z.array(ConflictSchema),
  summary: z.string().min(1),
  proposalId: z.string().min(1).optional(),
  source: z.literal("ai").optional(),
  approvalStatus: z.literal("pending_human").optional(),
  stageTrace: z.array(AiArchitectureReviewStageTraceSchema).min(1).optional(),
  diff: z.array(KeywordArticleReviewDiffSchema).optional(),
}).strict();
export type KeywordArticleReview = z.infer<typeof KeywordArticleReviewSchema>;

export const BrandDNASchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  positioning: z.string().min(1),
  audience: z.array(z.string()).min(1),
  voice: z.array(z.string()).min(1),
  businessObjectives: z.array(z.string()).min(1),
  differentiators: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  editorialPrinciples: z.array(z.string()),
});
export type BrandDNA = z.infer<typeof BrandDNASchema>;

export const KeywordDNASchema = z.object({
  schemaVersion: z.literal(1),
  keywordId: z.string().min(1),
  searchIntent: z.enum(["informational", "commercial_investigation", "transactional", "navigational", "local"]),
  likelyEditorialType: z.enum(["guide", "tutorial", "review", "comparison", "best_list", "individual_product", "category", "problem_solution", "question"]),
  centralEntity: z.string().min(1),
  modifiers: z.array(z.string()),
  audience: z.string().min(1),
  perceivedProblem: z.string().min(1),
  desiredResult: z.string().min(1),
  awarenessLevel: z.string().min(1),
  journeyStage: z.string().min(1),
  objections: z.array(z.string()),
  dominantEmotion: z.string().min(1),
  commercialPotential: z.enum(["low", "medium", "high"]),
  affiliatePotential: z.enum(["none", "low", "medium", "high"]),
  reviewCandidate: z.boolean(),
  productResearchRequired: z.boolean(),
  stampOrigin: z.enum(["human", "ai", "extension", "serp", "import", "system"]),
  confidence: ConfidenceSchema,
  humanConfirmed: z.boolean(),
  volumeSearch: z.number().nonnegative().nullable().optional(),
  resultCount: z.number().int().nonnegative().nullable().optional(),
  kgrScore: z.number().nullable().optional(),
  originalIntentLabel: z.string().min(1).optional(),
  keywordUrlRelation: KeywordUrlRelationshipSchema.optional(),
  architectureStatus: ArticleArchitectureStatusSchema.optional(),
  kgrIdentity: ArticleKgrIdentitySchema.optional(),
  primaryKeywordPolicy: PrimaryKeywordPolicySchema.optional(),
  primaryKeywordPolicyContext: PrimaryKeywordPolicyContextSchema.optional(),
  demandEvidence: KeywordDemandEvidenceSchema.optional(),
  siteEvidence: z.object({
    brandId: z.string().min(1), sourceUrl: z.string().url(), catalogEntryId: z.string().min(1),
    sourceFields: z.array(z.string().min(1)).min(1), slugCoherence: z.enum(["high", "medium", "low", "unknown"]),
    confidence: z.enum(["high", "medium", "low"]), qualificationStatus: z.enum(["awaiting_minerador", "sent", "existing", "ignored"]), isKgr: z.literal(false),
  }).strict().optional(),
});
export type KeywordDNA = z.infer<typeof KeywordDNASchema>;

/** Snapshot aditivo da origem usada para formar um ArticleDNA. */
export const KeywordDnaProvenanceSnapshotSchema = z.object({
  brandId: z.string().min(1),
  keywordId: z.string().min(1),
  capturedAt: z.string().datetime(),
  versionReference: VersionReferenceSchema,
  payload: KeywordDNASchema,
  sourceKeywordSnapshot: z.record(z.string(), z.unknown()),
}).strict();
export type KeywordDnaProvenanceSnapshot = z.infer<typeof KeywordDnaProvenanceSnapshotSchema>;

export const ArticleKeywordReferenceSchema = z.object({
  keywordId: z.string().min(1),
  keywordDnaVersionId: z.string().min(1),
  keywordDnaContentHash: ContentHashSchema,
  role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  strategicContribution: z.string().min(1),
  coveredIntentions: z.array(z.string()).min(1),
  requiredTopics: z.array(z.string()),
  excludedTopics: z.array(z.string()),
  classificationOrigin: z.enum(["human", "ai", "extension", "serp", "import", "legacy", "system"]),
  confidence: ConfidenceSchema,
  humanConfirmed: z.boolean(),
  originalIntentLabel: z.string().min(1).optional(),
  normalizedIntent: NormalizedSearchIntentSchema.optional(),
  volume: z.number().nullable().optional(),
  resultCount: z.number().int().nonnegative().nullable().optional(),
  kgrScore: z.number().nullable().optional(),
  incrementalVolume: z.number().nullable().optional(),
  contribution: z.enum(["central", "incremental_volume", "semantic_coverage", "intent_support", "entity_support", "unknown"]).optional(),
  purpose: z.string().min(1).optional(),
  purposeRationale: z.string().min(1).optional(),
  overlapRisk: z.enum(["low", "medium", "high", "unknown"]).optional(),
  keywordUrlRelation: KeywordUrlRelationshipSchema.optional(),
  urlEvidence: z.record(z.string(), z.unknown()).optional(),
  keywordDnaSnapshot: KeywordDnaProvenanceSnapshotSchema.optional(),
  demandEvidence: KeywordDemandEvidenceSchema.optional(),
}).strict();
export type ArticleKeywordReference = z.infer<typeof ArticleKeywordReferenceSchema>;

export const PublishedIdentityReferenceSchema = z.object({
  publicationRecordId: z.string().min(1).optional(),
  publicationStatus: z.literal("published_protected"),
  publishedUrl: z.string().url().optional(),
  slug: z.string().min(1),
  canonical: z.string().url().optional(),
  protectedAt: z.string().datetime().optional(),
  source: z.enum(["publication_record", "keyword_dna", "manual", "imported", "unknown"]).optional(),
  sourceKeywordDnaIds: z.array(z.string().min(1)).optional(),
  verification: z.object({
    status: z.enum(["not_checked", "verified", "sitemap_match", "canonical_mismatch", "not_in_sitemap", "unreachable", "missing_site_configuration", "conflict", "error"]),
    checkedAt: z.string().datetime().nullable().optional(),
    requestedUrl: z.string().url().nullable().optional(),
    resolvedUrl: z.string().url().nullable().optional(),
    declaredCanonical: z.string().url().nullable().optional(),
    httpStatus: z.number().int().nullable().optional(),
    sitemapUrl: z.string().url().nullable().optional(),
    sitemapMatch: z.boolean().nullable().optional(),
    message: z.string().nullable().optional(),
  }).strict().optional(),
}).strict();
export type PublishedIdentityReference = z.infer<typeof PublishedIdentityReferenceSchema>;

/**
 * CLASSIFICAÇÃO TERMINAL DO ARTIGO.
 *
 * "Pendente" é estado de PROCESSO; ele pode existir na working copy e não
 * pode existir num ArticleDNA aprovado. Este objeto é o retrato fechado: cada
 * campo tem um valor terminal, o motivo por extenso e a origem do valor —
 * fato da Principal, agregado do grupo, evidência SERP ou decisão do artigo.
 *
 * OPCIONAL por retrocompatibilidade, pela mesma razão de `territoryRef`: os
 * ArticleDNA anteriores a este contrato não o têm, e ausência significa
 * LEGADO a fechar, nunca "sem classificação por decisão". O portão de
 * conclusão exige o objeto; a leitura de acervo antigo continua possível.
 *
 * Aditivo no payload jsonb de `editorial_artifact_versions`: nenhuma coluna,
 * nenhuma migration.
 */
export const ClassificationSourceSchema = z.enum(["principal", "group", "serp", "article_decision"]);

const resolvedField = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  // O motivo NÃO é decorativo: é o que impede um terminal de virar carimbo.
  reason: z.string().min(1),
  source: ClassificationSourceSchema,
}).strict();

export const ArticleClassificationSchema = z.object({
  intent: resolvedField(z.enum(ARTICLE_TERMINAL_INTENTS)),
  funnel: resolvedField(z.enum(ARTICLE_TERMINAL_FUNNELS)),
  kgr: resolvedField(z.enum(ARTICLE_TERMINAL_KGR)),
  kgrApplicability: resolvedField(z.enum(ARTICLE_TERMINAL_KGR_APPLICABILITY)),
  compatibility: resolvedField(z.enum(ARTICLE_TERMINAL_COMPATIBILITY)),
  protection: resolvedField(z.enum(ARTICLE_TERMINAL_PROTECTIONS)),
}).strict();
export type ArticleClassificationContract = z.infer<typeof ArticleClassificationSchema>;

export const ArticleDNASchema = z.object({
  schemaVersion: z.literal(1),
  articleId: z.string().min(1),
  brandId: z.string().min(1),
  principalKeywordId: z.string().min(1),
  secondaryKeywordIds: z.array(z.string().min(1)).max(5),
  narrativeReinforcementIds: z.array(z.string().min(1)),
  keywordReferences: z.array(ArticleKeywordReferenceSchema).min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  siloId: z.string().nullable(),
  /**
   * Território de origem no fluxo Silo-first. OPCIONAL por retrocompatibilidade:
   * todo ArticleDNA consolidado antes da Fase 2B não tem território, e ausência
   * significa LEGACY_NEEDS_RECONCILIATION — nunca "sem território por decisão".
   *
   * NÃO substitui `siloId` nem é derivado dele: Silo consolidado e Território de
   * trabalho são espaços de identidade distintos (C4). Aditivo no payload jsonb
   * de editorial_artifact_versions, cujo artifact_type 'article_dna' já existe:
   * nenhuma coluna, nenhuma migration.
   */
  territoryRef: TerritoryRefSchema.optional(),
  /**
   * Retrato fechado das classificações — sem nenhum estado de processo.
   *
   * Ausente = ArticleDNA anterior a este contrato. Presente = a fase Artigos
   * encerrou intenção, funil, KGR, aplicabilidade, compatibilidade e proteção.
   */
  classification: ArticleClassificationSchema.optional(),
  hierarchy: z.enum(["Pilar", "Suporte", "Reforco Narrativo"]),
  suggestedSlug: z.string().min(1),
  canonical: z.string().url().nullable(),
  mainIntent: z.string().min(1),
  intentProfile: ArticleIntentProfileSchema.optional(),
  volumeStrategy: ArticleVolumeStrategySchema.optional(),
  hierarchyStrategy: ArticleHierarchyStrategySchema.optional(),
  strategicPurpose: ArticleStrategicPurposeSchema.optional(),
  keywordStrategy: ArticleKeywordStrategySchema.optional(),
  unitClassification: EditorialUnitClassificationSchema.optional(),
  unitPurpose: EditorialUnitPurposeSchema.optional(),
  serpStrategy: ArticleSerpStrategySchema.optional(),
  auxiliaryIntents: z.array(z.string()),
  audience: z.string().min(1),
  problem: z.string().min(1),
  desiredResult: z.string().min(1),
  journeyStage: z.string().min(1),
  brandObjective: z.string().min(1),
  promise: z.string().min(1),
  angle: z.string().min(1),
  cta: z.string().min(1),
  coverage: z.array(z.string()).min(1),
  excludedSubjects: z.array(z.string()),
  antiCannibalizationBoundary: z.string().min(1),
  nearbyArticleIds: z.array(z.string()),
  differentiation: z.array(z.string()),
  entities: z.array(z.string()),
  requiredTopics: z.array(z.string()),
  questions: z.array(z.string()),
  objections: z.array(z.string()),
  evidenceNeeded: z.array(z.string()),
  sourcesNeeded: z.array(z.string()),
  internalLinks: z.array(z.string()),
  alerts: z.array(z.string()),
  confidence: ConfidenceSchema,
  humanPendingDecisions: z.array(z.string()),
  architectureStatus: ArticleArchitectureStatusSchema.optional(),
  kgrIdentity: ArticleKgrIdentitySchema.optional(),
  primaryKeywordMetrics: z.object({ volumeSearch: z.number().nonnegative().nullable(), resultCount: z.number().int().nonnegative().nullable(), kgrScore: z.number().nullable() }).strict().optional(),
  primaryKeywordPolicy: PrimaryKeywordEffectivePolicySchema.optional(),
  primaryKeywordPolicyContext: PrimaryKeywordPolicyContextSchema.optional(),
  primaryKeywordCandidates: z.array(PrimaryKeywordCandidateSchema).optional(),
  primaryKeywordDecision: PrimaryKeywordDecisionSchema.optional(),
  publishedIdentityRef: PublishedIdentityReferenceSchema.optional(),
  serpAssessmentRef: VersionReferenceSchema.optional(),
}).strict().superRefine((article, context) => {
  const principal = article.keywordReferences.filter(reference => reference.role === "principal");
  if (principal.length !== 1 || principal[0]?.keywordId !== article.principalKeywordId) {
    context.addIssue({ code: "custom", path: ["keywordReferences"], message: "ArticleDNA precisa de exatamente uma principal coerente." });
  }
  const referenceIds = new Set(article.keywordReferences.map(reference => reference.keywordId));
  const expectedIds = [article.principalKeywordId, ...article.secondaryKeywordIds, ...article.narrativeReinforcementIds];
  if (expectedIds.some(id => !referenceIds.has(id)) || referenceIds.size !== new Set(expectedIds).size) {
    context.addIssue({ code: "custom", path: ["keywordReferences"], message: "As referencias devem cobrir exatamente as keywords resumidas." });
  }
  // Uma keyword ocupa UM papel. Sem esta checagem, a mesma keyword em
  // secondaryKeywordIds e narrativeReinforcementIds (ou repetindo a principal)
  // passava: o Set colapsava a duplicata e o teto era medido sobre o conjunto
  // deduplicado, escondendo a incoerencia de papeis.
  if (new Set(expectedIds).size !== expectedIds.length) {
    context.addIssue({ code: "custom", path: ["keywordReferences"], message: "Uma keyword nao pode ocupar dois papeis no mesmo ArticleDNA." });
  }
  if (expectedIds.length > MAX_KEYWORDS_PER_ARTICLE || expectedIds.filter(id => id !== article.principalKeywordId).length > 5) {
    context.addIssue({ code: "custom", path: ["keywordReferences"], message: "Um ArticleDNA aceita uma principal e no maximo cinco keywords de apoio." });
  }
});

export type ArticleDNA = z.infer<typeof ArticleDNASchema>;

export const ArticleDNAReferenceSchema = z.object({
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  articleDnaContentHash: ContentHashSchema,
  role: z.enum(["Pilar", "Suporte"]),
}).strict();

export const SiloDNASchema = z.object({
  schemaVersion: z.literal(1),
  formationStatus: z.enum(["draft", "formed"]).default("formed"),
  siloId: z.string().min(1),
  brandId: z.string().min(1).optional(),
  /**
   * Território que originou o Silo no fluxo Silo-first. OPCIONAL por
   * retrocompatibilidade: todo SiloDNA anterior à 2C não tem território, e
   * ausência significa LEGACY_NEEDS_RECONCILIATION — nunca "sem território por
   * decisão". A obrigatoriedade vive no gate de NOVA consolidação.
   *
   * Não substitui `siloId` nem `existingSiloRef`, e nunca é derivado deles:
   * Silo consolidado e Território de trabalho são espaços distintos (C4).
   */
  territoryRef: TerritoryRefSchema.optional(),
  /**
   * Proveniência da working copy que originou esta versão consolidada.
   *
   * OPCIONAIS por retrocompatibilidade — todo SiloDNA anterior à 2C nasceu sem
   * working copy remota. A obrigatoriedade vive no gate de NOVA consolidação.
   *
   * Existem para responder, no replay, "os artefatos vieram DESTA versão da
   * working copy?". Como a RPC de consolidação compara o payload inteiro, a
   * verificação entra sem lógica de comparação nova.
   */
  workingCopyRef: SiloWorkingCopyRefSchema.optional(),
  workingCopyLockVersion: z.number().int().positive().optional(),
  /**
   * Snapshot da narrativa do Territorio de origem, preservado na consolidacao.
   *
   * Existe porque a narrativa e o que responde POR QUE estes artigos pertencem
   * juntos. Sem ela o SiloDNA guarda a estrutura (papeis, ordem, links) e perde
   * a razao editorial que a produziu, e a razao nao e reconstituivel a partir
   * da estrutura: narrativas diferentes geram a mesma lista ordenada.
   *
   * NAO se confunde com `narrativeOrder` (sequencia de leitura dos artigos) nem
   * com `boundary` (texto descritivo/legado da fronteira). E copia fiel de
   * `Territory.narrative`, nunca redigida no Silo.
   *
   * OPCIONAL pelo mesmo motivo de `territoryRef`: SiloDNA anterior a 2C nasceu
   * sem territorio. A obrigatoriedade vive no gate de NOVA consolidacao.
   */
  territoryNarrative: TerritoryNarrativeSchema.optional(),
  name: z.string().min(1).optional(),
  centralEntity: z.string(),
  centralEntitySource: z.enum(["manual", "keyword_dna"]).optional(),
  centralKeywordDnaRef: VersionReferenceSchema.optional(),
  objective: z.string(),
  audience: z.string(),
  macroProblem: z.string(),
  dominantIntent: z.string(),
  pillarArticleId: z.string().nullable(),
  supportArticleIds: z.array(z.string()),
  articleReferences: z.array(ArticleDNAReferenceSchema),
  articleRoles: z.array(z.object({ articleId: z.string(), role: z.string(), reason: z.string() })),
  narrativeOrder: z.array(z.string()),
  linkMap: z.array(z.object({ fromArticleId: z.string(), toArticleId: z.string(), reason: z.string() })),
  boundary: z.string(),
  includedTopics: z.array(z.string()),
  excludedTopics: z.array(z.string()),
  nearbySiloIds: z.array(z.string()),
  possibleConflicts: z.array(z.string()),
  gaps: z.array(z.string()),
  nextContents: z.array(z.string()),
  confidence: ConfidenceSchema,
  humanPendingDecisions: z.array(z.string()),
  serpAssessmentRefs: z.array(VersionReferenceSchema).optional(),
  serpGuidelines: z.array(z.string().min(1)).optional(),
  hierarchySignals: z.array(z.object({
    articleDnaId: z.string().min(1), principalVolume: z.number().nonnegative().nullable(), combinedVolume: z.number().nonnegative().nullable(),
    tailLength: z.number().int().nonnegative(), kgrScore: z.number().nonnegative().nullable(), semanticCentrality: ConfidenceSchema,
    intentBreadth: z.number().nonnegative(), suggestedRole: z.enum(["pillar", "support"]), supportOrder: z.number().int().positive().nullable(), rationale: z.string().min(1),
  }).strict()).default([]),
}).strict().superRefine((silo, context) => {
  // Proveniência é PAR: ou os dois campos existem, ou nenhum. Meia proveniência
  // não diz de qual versão da working copy o Silo veio — descreve a metade que
  // sobrou. A checagem vem antes do desvio de rascunho porque vale para os dois.
  if ((silo.workingCopyRef === undefined) !== (silo.workingCopyLockVersion === undefined)) {
    context.addIssue({
      code: "custom",
      path: ["workingCopyRef"],
      message: "workingCopyRef e workingCopyLockVersion precisam existir juntos ou faltar juntos.",
    });
  }
  if (silo.formationStatus === "draft") {
    if (!silo.name?.trim()) context.addIssue({ code: "custom", path: ["name"], message: "Um SiloDNA em rascunho precisa preservar o nome do silo." });
    return;
  }
  for (const field of ["centralEntity", "objective", "audience", "macroProblem", "dominantIntent", "boundary"] as const) {
    if (!silo[field].trim()) context.addIssue({ code: "custom", path: [field], message: "O SiloDNA formado precisa preencher este campo." });
  }
  const referenced = new Set(silo.articleReferences.map(reference => reference.articleId));
  const expected = [silo.pillarArticleId, ...silo.supportArticleIds].filter((id): id is string => Boolean(id));
  if (expected.some(id => !referenced.has(id)) || referenced.size !== new Set(expected).size) {
    context.addIssue({ code: "custom", path: ["articleReferences"], message: "As referencias devem cobrir exatamente os artigos do silo." });
  }
});

export type SiloDNA = z.infer<typeof SiloDNASchema>;

// ─── SiloPage: página publicável do silo ──────────────────────────────────────
// Representa a página real do site — diferente do SiloDNA que representa a
// inteligência estratégica do agrupamento. A Página do Silo referencia uma
// versão específica do SiloDNA e pode atravessar o pipeline até Publicações.

export const SiloPageSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  objective: z.string().min(1),
  linkedArticleIds: z.array(z.string()),
}).strict();

export const SiloPageBreadcrumbSchema = z.object({
  label: z.string().min(1),
  slug: z.string().min(1),
}).strict();

export const SiloPagePublicationVerificationSchema = z.object({
  status: z.enum(["not_applicable", "not_checked", "sitemap_match", "accessible", "canonical_confirmed", "canonical_mismatch", "not_in_sitemap", "unreachable", "missing_site_configuration", "conflict", "error"]),
  checkedAt: z.string().datetime().nullable(),
  requestedUrl: z.string().url().nullable(),
  resolvedUrl: z.string().url().nullable(),
  declaredCanonical: z.string().url().nullable(),
  httpStatus: z.number().int().nullable(),
  sitemapUrl: z.string().url().nullable(),
  sitemapMatch: z.boolean().nullable(),
  message: z.string().nullable(),
}).strict();
export type SiloPagePublicationVerification = z.infer<typeof SiloPagePublicationVerificationSchema>;

export const SiloPageSchema = z.object({
  schemaVersion: z.literal(1),
  formationStatus: z.enum(["draft", "formed"]).default("formed"),
  siloPageId: z.string().min(1),
  brandId: z.string().min(1),
  siloDnaRef: VersionReferenceSchema,
  siloId: z.string().min(1),
  /** Mesmo território do SiloDNA pareado. Ausente = SiloPage legada, pré-2C. */
  territoryRef: TerritoryRefSchema.optional(),
  slug: z.string().min(1),
  publicationStatus: z.enum(["new", "published"]).default("new"),
  publishedUrl: z.string().url().nullable().default(null),
  publicationVerification: SiloPagePublicationVerificationSchema.default({
    status: "not_applicable", checkedAt: null, requestedUrl: null, resolvedUrl: null, declaredCanonical: null,
    httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null,
  }),
  h1: z.string(),
  seoTitle: z.string(),
  metaDescription: z.string(),
  canonical: z.string().url().nullable(),
  intro: z.string(),
  sections: z.array(SiloPageSectionSchema),
  cta: z.string(),
  coverImageBrief: z.string(),
  visualBriefing: z.string(),
  breadcrumbs: z.array(SiloPageBreadcrumbSchema),
  pillarArticleId: z.string().nullable(),
  supportArticleIds: z.array(z.string()),
  indexationStatus: z.enum(["noindex", "index"]),
  alerts: z.array(z.string()),
  confidence: ConfidenceSchema,
  humanPendingDecisions: z.array(z.string()),
}).strict().superRefine((page, context) => {
  if (page.formationStatus === "draft") {
    if (page.publicationStatus !== "new") context.addIssue({ code: "custom", path: ["publicationStatus"], message: "Uma SiloPage em rascunho deve estar como nova." });
    if (page.publishedUrl) context.addIssue({ code: "custom", path: ["publishedUrl"], message: "Uma SiloPage em rascunho não pode possuir URL publicada." });
    return;
  }
  for (const field of ["h1", "seoTitle", "metaDescription", "intro", "cta"] as const) {
    if (!page[field].trim()) context.addIssue({ code: "custom", path: [field], message: "A SiloPage formada precisa preencher este campo." });
  }
  if (page.publicationStatus === "published" && !page.publishedUrl) {
    context.addIssue({ code: "custom", path: ["publishedUrl"], message: "SiloPage publicada precisa preservar a URL publicada completa." });
  }
  if (page.publicationStatus === "new" && page.publishedUrl) {
    context.addIssue({ code: "custom", path: ["publishedUrl"], message: "SiloPage nova não pode possuir URL publicada." });
  }
});

export type SiloPage = z.infer<typeof SiloPageSchema>;
export type SiloPageSection = z.infer<typeof SiloPageSectionSchema>;
export type SiloPageBreadcrumb = z.infer<typeof SiloPageBreadcrumbSchema>;

// ─── InternalLinkGraph: fonte canônica das relações editoriais ───────────────
// O grafo é uma entidade própria do Arquiteto. ArticleDNA, SiloDNA e SiloPage
// continuam sendo entidades distintas; os campos abaixo apenas referenciam
// versões já existentes e não copiam sua autoridade editorial.

export const InternalLinkGraphNodeTypeSchema = z.enum(["SILO_PAGE", "ARTICLE_DNA"]);
export type InternalLinkGraphNodeType = z.infer<typeof InternalLinkGraphNodeTypeSchema>;

export const InternalLinkGraphRelationTypeSchema = z.enum([
  "PILLAR_TO_SUPPORT",
  "SUPPORT_TO_PILLAR",
  "SUPPORT_TO_SUPPORT",
  "SILO_PAGE_TO_ARTICLE",
  "ARTICLE_TO_SILO_PAGE",
]);
export type InternalLinkGraphRelationType = z.infer<typeof InternalLinkGraphRelationTypeSchema>;

export const InternalLinkGraphPrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type InternalLinkGraphPriority = z.infer<typeof InternalLinkGraphPrioritySchema>;

export const InternalLinkGraphOriginSchema = z.enum(["human", "ai", "system"]);
export type InternalLinkGraphOrigin = z.infer<typeof InternalLinkGraphOriginSchema>;

export const InternalLinkGraphNodeSchema = z.object({
  nodeId: z.string().min(1),
  brandId: z.string().min(1),
  nodeType: InternalLinkGraphNodeTypeSchema,
  articleDnaVersionRef: VersionReferenceSchema.nullable().default(null),
  siloPageVersionRef: VersionReferenceSchema.nullable().default(null),
  architecturalRole: z.enum(["PILAR", "SUPORTE", "REFORCO", "OUTRO"]).nullable().default(null),
  snapshot: z.object({
    label: z.string().min(1).nullable().default(null),
    siloId: z.string().min(1).nullable().default(null),
  }).strict().default({ label: null, siloId: null }),
}).strict().superRefine((node, context) => {
  const referenceCount = Number(Boolean(node.articleDnaVersionRef)) + Number(Boolean(node.siloPageVersionRef));
  if (referenceCount !== 1) {
    context.addIssue({ code: "custom", path: ["articleDnaVersionRef"], message: "Cada nó precisa referenciar exatamente um ArticleDNA ou uma SiloPage." });
  }
  if (node.nodeType === "ARTICLE_DNA" && !node.articleDnaVersionRef) {
    context.addIssue({ code: "custom", path: ["articleDnaVersionRef"], message: "Nó ARTICLE_DNA precisa de referência de versão." });
  }
  if (node.nodeType === "SILO_PAGE" && !node.siloPageVersionRef) {
    context.addIssue({ code: "custom", path: ["siloPageVersionRef"], message: "Nó SILO_PAGE precisa de referência de versão." });
  }
});
export type InternalLinkGraphNode = z.infer<typeof InternalLinkGraphNodeSchema>;

export const InternalLinkGraphEdgeSchema = z.object({
  edgeId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  relationType: InternalLinkGraphRelationTypeSchema,
  reason: z.string().min(1),
  priority: InternalLinkGraphPrioritySchema,
  anchorConcepts: z.array(z.string().trim().min(1)).min(1),
  origin: InternalLinkGraphOriginSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  provenance: z.object({
    source: z.string().min(1),
    references: z.array(z.string().min(1)),
  }).strict(),
}).strict();
export type InternalLinkGraphEdge = z.infer<typeof InternalLinkGraphEdgeSchema>;

export const InternalLinkGraphStructuralPayloadSchema = z.object({
  brandId: z.string().min(1),
  graphId: z.string().min(1),
  siloId: z.string().min(1),
  baseSiloDnaVersionRef: VersionReferenceSchema,
  baseSiloPageVersionRef: VersionReferenceSchema,
  participatingArticleDnaVersionRefs: z.array(VersionReferenceSchema),
  nodes: z.array(InternalLinkGraphNodeSchema),
  edges: z.array(InternalLinkGraphEdgeSchema),
  // Warnings and conflicts remain part of the persisted diagnostic snapshot.
  // They are deliberately excluded from the graph content hash in
  // internal-link-graph.ts, because they are not editorial topology.
  warnings: z.array(z.string()),
  conflicts: z.array(z.string()),
}).strict();
export type InternalLinkGraphStructuralPayload = z.infer<typeof InternalLinkGraphStructuralPayloadSchema>;

export const InternalLinkGraphSchema = z.object({
  schemaVersion: z.literal(1),
  graphVersionId: z.string().min(1),
  graphId: z.string().min(1),
  brandId: z.string().min(1),
  siloId: z.string().min(1),
  baseSiloDnaVersionRef: VersionReferenceSchema,
  baseSiloPageVersionRef: VersionReferenceSchema,
  participatingArticleDnaVersionRefs: z.array(VersionReferenceSchema),
  versionNumber: z.number().int().positive(),
  previousVersionId: z.string().min(1).nullable(),
  workflowStatus: VersionStatusSchema,
  basisHash: ContentHashSchema,
  contentHash: ContentHashSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  approvedBy: z.string().min(1).nullable(),
  approvedAt: z.string().datetime().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  nodes: z.array(InternalLinkGraphNodeSchema),
  edges: z.array(InternalLinkGraphEdgeSchema),
  warnings: z.array(z.string()),
  conflicts: z.array(z.string()),
}).strict().superRefine((graph, context) => {
  const nodeIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    if (nodeIds.has(node.nodeId)) context.addIssue({ code: "custom", path: ["nodes", index, "nodeId"], message: "O grafo não pode possuir nó duplicado." });
    nodeIds.add(node.nodeId);
    if (node.brandId !== graph.brandId) context.addIssue({ code: "custom", path: ["nodes", index, "brandId"], message: "Nó fora da Brand do grafo." });
  }
  const edges = new Set<string>();
  for (const [index, edge] of graph.edges.entries()) {
    if (edge.sourceNodeId === edge.targetNodeId) context.addIssue({ code: "custom", path: ["edges", index], message: "Auto-link não é permitido." });
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) context.addIssue({ code: "custom", path: ["edges", index], message: "Aresta precisa apontar para nós do mesmo grafo." });
    const key = `${edge.sourceNodeId}\u0000${edge.targetNodeId}`;
    if (edges.has(key)) context.addIssue({ code: "custom", path: ["edges", index], message: "Aresta dirigida duplicada no grafo." });
    edges.add(key);
  }
  const references = new Set(graph.participatingArticleDnaVersionRefs.map(reference => reference.versionId));
  if (references.size !== graph.participatingArticleDnaVersionRefs.length) context.addIssue({ code: "custom", path: ["participatingArticleDnaVersionRefs"], message: "ArticleDNA participante não pode ser repetido." });
  if (graph.workflowStatus === "approved" && (!graph.approvedBy || !graph.approvedAt)) context.addIssue({ code: "custom", path: ["approvedBy"], message: "Grafo aprovado precisa registrar ator e data de aprovação." });
  if (graph.workflowStatus !== "approved" && (graph.approvedBy || graph.approvedAt)) context.addIssue({ code: "custom", path: ["approvedBy"], message: "Aprovação não pode ser registrada antes do estado aprovado." });
});
export type InternalLinkGraph = z.infer<typeof InternalLinkGraphSchema>;

export const InternalLinkGraphWorkingCopySchema = z.object({
  schemaVersion: z.literal(1),
  workingCopyId: z.string().min(1),
  graphId: z.string().min(1),
  brandId: z.string().min(1),
  siloId: z.string().min(1),
  baseGraphVersionId: z.string().min(1).nullable(),
  baseGraphContentHash: ContentHashSchema.nullable(),
  baseSiloDnaVersionRef: VersionReferenceSchema,
  baseSiloPageVersionRef: VersionReferenceSchema,
  participatingArticleDnaVersionRefs: z.array(VersionReferenceSchema),
  basisHash: ContentHashSchema,
  contentHash: ContentHashSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedBy: z.string().min(1),
  updatedAt: z.string().datetime(),
  lockVersion: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()),
  nodes: z.array(InternalLinkGraphNodeSchema),
  edges: z.array(InternalLinkGraphEdgeSchema),
  warnings: z.array(z.string()),
  conflicts: z.array(z.string()),
}).strict().superRefine((workingCopy, context) => {
  if ((workingCopy.baseGraphVersionId === null) !== (workingCopy.baseGraphContentHash === null)) {
    context.addIssue({ code: "custom", path: ["baseGraphVersionId"], message: "A working copy precisa manter a referência e o hash do grafo-base juntos." });
  }
  const nodeIds = new Set<string>();
  for (const [index, node] of workingCopy.nodes.entries()) {
    if (nodeIds.has(node.nodeId)) context.addIssue({ code: "custom", path: ["nodes", index, "nodeId"], message: "A working copy não pode possuir nó duplicado." });
    nodeIds.add(node.nodeId);
    if (node.brandId !== workingCopy.brandId) context.addIssue({ code: "custom", path: ["nodes", index, "brandId"], message: "Nó fora da Brand da working copy." });
  }
  const edges = new Set<string>();
  for (const [index, edge] of workingCopy.edges.entries()) {
    if (edge.sourceNodeId === edge.targetNodeId) context.addIssue({ code: "custom", path: ["edges", index], message: "Auto-link não é permitido na working copy." });
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) context.addIssue({ code: "custom", path: ["edges", index], message: "Aresta precisa apontar para nós da mesma working copy." });
    const key = `${edge.sourceNodeId}\u0000${edge.targetNodeId}`;
    if (edges.has(key)) context.addIssue({ code: "custom", path: ["edges", index], message: "Aresta dirigida duplicada na working copy." });
    edges.add(key);
  }
});
export type InternalLinkGraphWorkingCopy = z.infer<typeof InternalLinkGraphWorkingCopySchema>;

export const InternalLinkGraphProposalSchema = z.object({
  schemaVersion: z.literal(1),
  proposalId: z.string().min(1),
  graphId: z.string().min(1),
  brandId: z.string().min(1),
  baseGraphVersionId: z.string().min(1),
  baseGraphContentHash: ContentHashSchema,
  inputHash: ContentHashSchema,
  outputHash: ContentHashSchema.nullable(),
  payload: z.object({
    nodes: z.array(InternalLinkGraphNodeSchema),
    edges: z.array(InternalLinkGraphEdgeSchema),
    warnings: z.array(z.string()),
    conflicts: z.array(z.string()),
  }).strict(),
  reviewStatus: z.enum(["pending_human", "accepted", "partially_accepted", "rejected"]),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  reviewedBy: z.string().min(1).nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewNote: z.string().nullable(),
  aiExecutionRef: z.string().min(1).nullable(),
}).strict().superRefine((proposal, context) => {
  if (proposal.reviewStatus === "pending_human" && (proposal.reviewedBy || proposal.reviewedAt)) context.addIssue({ code: "custom", path: ["reviewedBy"], message: "Proposta pendente não pode possuir revisão humana." });
  if (proposal.reviewStatus !== "pending_human" && (!proposal.reviewedBy || !proposal.reviewedAt)) context.addIssue({ code: "custom", path: ["reviewedBy"], message: "Proposta decidida precisa registrar a revisão humana." });
});
export type InternalLinkGraphProposal = z.infer<typeof InternalLinkGraphProposalSchema>;

export const InternalLinkGraphRefSchema = z.object({
  graphId: z.string().min(1),
  graphVersionId: z.string().min(1),
  brandId: z.string().min(1),
  siloId: z.string().min(1),
  baseSiloDnaVersionRef: VersionReferenceSchema,
  baseSiloPageVersionRef: VersionReferenceSchema,
  participatingArticleDnaVersionRefs: z.array(VersionReferenceSchema),
  versionNumber: z.number().int().positive(),
  workflowStatus: VersionStatusSchema,
  basisHash: ContentHashSchema,
  contentHash: ContentHashSchema,
  approvedBy: z.string().min(1).nullable(),
  approvedAt: z.string().datetime().nullable(),
  nodes: z.array(InternalLinkGraphNodeSchema),
  edges: z.array(InternalLinkGraphEdgeSchema),
}).strict();
export type InternalLinkGraphRef = z.infer<typeof InternalLinkGraphRefSchema>;

export const EditorialUnitTypeSchema = z.enum(["article", "silo_page"]);
export type EditorialUnitType = z.infer<typeof EditorialUnitTypeSchema>;

export const ProductEvidenceDNASchema = z.object({
  schemaVersion: z.literal(1),
  evidenceId: z.string().min(1),
  product: z.object({
    name: z.string().min(1), brand: z.string().min(1), model: z.string().nullable(), category: z.string().min(1),
    marketplace: z.string().min(1), sourceUrl: z.string().url(), collectedAt: z.string().datetime(),
  }),
  rating: z.object({ average: z.number().min(0).max(5), reviewCount: z.number().int().nonnegative(), distribution: z.record(z.string(), z.number().int().nonnegative()) }),
  recurringPraise: z.array(z.object({ pattern: z.string(), frequency: z.number().int().positive(), confidence: ConfidenceSchema })),
  recurringComplaints: z.array(z.object({ pattern: z.string(), frequency: z.number().int().positive(), severity: z.string(), confidence: ConfidenceSchema })),
  objections: z.array(z.string()),
  expectations: z.array(z.string()),
  usageContexts: z.array(z.string()),
  buyerProfile: z.string().min(1),
  perceivedBenefits: z.array(z.string()),
  perceivedLimitations: z.array(z.string()),
  sources: z.array(z.object({ sourceId: z.string(), url: z.string().url(), evidenceType: z.enum(["consumer_opinion", "technical_fact", "merchant_data"]), sampleSize: z.number().int().positive().optional() })).min(1),
  confidence: ConfidenceSchema,
  verificationPending: z.array(z.string()),
}).strict();
export type ProductEvidenceDNA = z.infer<typeof ProductEvidenceDNASchema>;

export const ArtifactReferenceSchema = z.object({
  artifactId: z.string().min(1),
  artifactType: z.enum(["serp_snapshot", "product_evidence", "source", "originality_report"]),
  contentHash: ContentHashSchema,
}).strict();
export type ArtifactReference = z.infer<typeof ArtifactReferenceSchema>;

export const ContentPlanSectionSchema = z.object({
  id: z.string().min(1),
  level: z.union([z.literal(2), z.literal(3)]),
  heading: z.string().min(1),
  objective: z.string().min(1),
  topics: z.array(z.string()),
  questions: z.array(z.string()),
  entities: z.array(z.string()),
  objections: z.array(z.string()),
  keywordDnaRefs: z.array(VersionReferenceSchema),
  evidenceRefs: z.array(ArtifactReferenceSchema),
  order: z.number().int().nonnegative().optional(),
  suggestedHeading: z.string().nullable().optional(),
  decidedHeading: z.string().nullable().optional(),
  argumentativeFunction: z.string().nullable().optional(),
  wordRange: z.object({ min: z.number().int().nonnegative().nullable(), ideal: z.number().int().nonnegative().nullable(), max: z.number().int().nonnegative().nullable() }).strict().nullable().optional(),
  paragraphRange: z.object({ min: z.number().int().nonnegative().nullable(), max: z.number().int().nonnegative().nullable() }).strict().nullable().optional(),
  estimatedParagraphs: z.number().int().nonnegative().nullable().optional(),
  excludedTopics: z.array(z.string()).optional(),
  internalLinks: z.array(z.string()).optional(),
  externalLinks: z.array(z.string()).optional(),
  imageId: z.string().nullable().optional(),
  ctaId: z.string().nullable().optional(),
  instructions: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  alerts: z.array(z.string()).optional(),
  origin: z.enum(["observed", "planner", "human"]).optional(),
  humanDecision: z.string().nullable().optional(),
}).strict();
export type ContentPlanSection = z.infer<typeof ContentPlanSectionSchema>;

export const ContentPlanAnchorCandidateSchema = z.object({
  id: z.string().min(1), text: z.string().min(1), reason: z.string().min(1), approved: z.boolean(),
}).strict();

export const ContentPlanInternalLinkSchema = z.object({
  id: z.string().min(1), targetArticleId: z.string().min(1), targetSlug: z.string().min(1),
  reason: z.string().min(1), suggestedPosition: z.string().min(1), candidates: z.array(ContentPlanAnchorCandidateSchema),
  required: z.boolean(), status: z.enum(["suggested", "approved", "rejected"]), humanApproved: z.boolean(),
}).strict();

export const ContentPlanSourceSchema = z.object({
  id: z.string().min(1), claim: z.string().min(1), entity: z.string().min(1),
  sourceType: z.string().min(1), candidateUrl: z.string().url().nullable(), title: z.string().nullable(),
  reason: z.string().min(1), evidenceRef: ArtifactReferenceSchema.nullable(), status: z.enum(["suggested", "approved", "rejected", "needs_source"]), humanApproved: z.boolean(),
}).strict();

export const ContentPlanBriefItemSchema = z.object({
  id: z.string().min(1), text: z.string().min(1), origin: z.enum(["observed", "planner", "human"]),
  priority: z.enum(["required", "useful", "optional"]).default("useful"),
  classification: z.string().nullable().default(null), sectionId: z.string().nullable().default(null),
  status: z.enum(["pending", "accepted", "rejected", "covered"]).default("pending"), humanDecision: z.string().nullable().default(null),
}).strict();

export const ContentPlanBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["intro", "conclusion", "faq", "table", "comparison", "checklist", "list", "step_by_step", "quote", "alert", "cta", "image", "special"]),
  sectionId: z.string().nullable().default(null), order: z.number().int().nonnegative().default(0),
  objective: z.string().min(1), instructions: z.array(z.string()).default([]), origin: z.enum(["observed", "planner", "human"]).default("planner"),
  humanDecision: z.string().nullable().default(null), alert: z.string().nullable().default(null),
}).strict();

export const ContentPlanGabaritoSchema = z.object({
  globalWords: z.object({ min: z.number().int().nonnegative().nullable(), ideal: z.number().int().nonnegative().nullable(), max: z.number().int().nonnegative().nullable() }).strict(),
  paragraphRange: z.object({ min: z.number().int().nonnegative().nullable(), max: z.number().int().nonnegative().nullable() }).strict(),
  estimatedParagraphs: z.number().int().nonnegative().nullable(),
  tone: z.string().nullable(), depth: z.string().nullable(), detail: z.string().nullable(),
  counts: z.object({ h2: z.number().int().nonnegative(), h3: z.number().int().nonnegative(), intro: z.number().int().nonnegative(), conclusion: z.number().int().nonnegative(), faq: z.number().int().nonnegative(), tables: z.number().int().nonnegative(), comparisons: z.number().int().nonnegative(), checklists: z.number().int().nonnegative(), lists: z.number().int().nonnegative(), quotes: z.number().int().nonnegative(), images: z.number().int().nonnegative(), internalLinks: z.number().int().nonnegative(), externalLinks: z.number().int().nonnegative(), cta: z.number().int().nonnegative(), specialBlocks: z.number().int().nonnegative() }).strict(),
  alerts: z.array(z.string()).default([]), humanDecision: z.string().nullable().default(null),
}).strict();

export const ContentPlanImageBriefSchema = z.object({
  id: z.string().min(1), position: z.string().min(1), objective: z.string().min(1), subject: z.string().min(1),
  visualFunction: z.string().min(1), requiredElements: z.array(z.string()), avoid: z.array(z.string()),
  aspectRatio: z.string().min(1), prompt: z.string().nullable(), altText: z.string().nullable(), status: z.enum(["planned", "prompt_ready", "approved", "rejected"]), humanApproved: z.boolean(),
}).strict();

export const ContentPlanContextSourceSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  sourceType: z.enum(["brand_dna", "legacy_brand", "material", "skill", "prompt"]),
  versionId: z.string().nullable(),
  label: z.string().min(1),
  purpose: z.string().min(1),
  origin: z.string().min(1),
  applied: z.boolean(),
  humanDecision: z.string().nullable(),
}).strict();
export type ContentPlanContextSource = z.infer<typeof ContentPlanContextSourceSchema>;

export const ContentPlanKeywordCoverageSchema = z.object({
  keywordId: z.string().min(1),
  keywordDnaId: z.string().min(1),
  role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  status: z.enum(["covered", "partial", "unassigned", "outside_boundary", "conflict", "upstream_review"]),
  sectionIds: z.array(z.string().min(1)),
  target: z.string().min(1),
  contributions: z.array(z.string().min(1)),
  conflicts: z.array(z.string().min(1)),
  origin: z.enum(["article_dna", "planner_interpretation", "human"]),
  humanDecision: z.string().nullable(),
}).strict();
export type ContentPlanKeywordCoverage = z.infer<typeof ContentPlanKeywordCoverageSchema>;

export const ContentPlanKeywordStrategySchema = z.object({
  version: z.literal("planner-keyword-strategy-v1"),
  primary: z.object({
    keywordId: z.string().min(1), keywordDnaId: z.string().min(1), keywordDnaVersionId: z.string().min(1), text: z.string().nullable(),
    intent: z.string().min(1), volume: z.number().nonnegative().nullable(), kgrScore: z.number().nonnegative().nullable(), resultCount: z.number().int().nonnegative().nullable(), tailLength: z.number().int().nonnegative().nullable(),
  }).strict(),
  secondary: z.array(z.object({
    keywordId: z.string().min(1), keywordDnaId: z.string().min(1), keywordDnaVersionId: z.string().min(1), role: z.enum(["secundaria", "reforco_narrativo"]), text: z.string().nullable(),
    intent: z.string().min(1).nullable(), volume: z.number().nonnegative().nullable(), incrementalVolume: z.number().nonnegative().nullable(), contribution: z.string().min(1),
    rationale: z.string().min(1), conflicts: z.array(z.string().min(1)), origin: z.string().min(1),
  }).strict()).max(5),
  keywordCount: z.number().int().min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  maxKeywords: z.literal(MAX_KEYWORDS_PER_ARTICLE),
  volume: z.object({
    principal: z.number().nonnegative().nullable(), secondarySum: z.number().nonnegative().nullable(), combined: z.number().nonnegative().nullable(),
    knownCount: z.number().int().nonnegative(), totalCount: z.number().int().positive(), coverage: z.enum(["complete", "partial", "unavailable"]),
    label: z.string().min(1), purpose: z.string().min(1), overlapRisk: z.enum(["low", "medium", "high", "unknown"]),
  }).strict(),
  kgr: z.object({
    status: z.enum(["qualified", "not_qualified", "unknown", "conflict"]), score: z.number().nonnegative().nullable(), resultCount: z.number().int().nonnegative().nullable(),
    tailLength: z.number().int().nonnegative().nullable(), source: z.string().min(1), boundSlug: z.string().nullable(), keywordDnaVersionId: z.string().min(1),
  }).strict(),
  slugCoherence: z.enum(["high", "medium", "low", "protected_published", "unknown"]),
  hierarchy: z.object({ role: z.enum(["Pilar", "Suporte", "Reforco Narrativo"]), rank: z.number().int().positive().nullable(), status: z.enum(["suggested", "human_confirmed", "conflict"]), rationale: z.array(z.string().min(1)).min(1) }).strict(),
  compatibility: z.enum(["compatible", "conflict", "unknown"]),
  overlapRisk: z.enum(["low", "medium", "high", "unknown"]),
  groupingRationale: z.string().min(1),
  semanticNarrative: z.array(z.string().min(1)).min(1),
  coverage: z.array(ContentPlanKeywordCoverageSchema).min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  publicationProtection: z.object({ isPublished: z.boolean(), protectedFields: z.array(z.enum(["slug", "canonical", "url", "brand", "principal"])) }).strict(),
  alerts: z.array(z.string().min(1)),
}).strict();
export type ContentPlanKeywordStrategy = z.infer<typeof ContentPlanKeywordStrategySchema>;

export const ContentPlanDetailsSchema = z.object({
  brandId: z.string().min(1),
  editorialUnitType: EditorialUnitTypeSchema,
  editorialUnitId: z.string().min(1),
  articleId: z.string().nullable(),
  siloPageId: z.string().nullable(),
  siloId: z.string().nullable(),
  strategy: z.object({
    primaryIntent: z.string().min(1), secondaryIntents: z.array(z.string()), intentValidation: z.enum(["pending", "validated", "conflict", "insufficient"]),
    validationNotes: z.array(z.string()), angle: z.string().min(1), promise: z.string().min(1), differentiation: z.array(z.string()), boundary: z.string().min(1),
  }).strict(),
  strategyContext: z.object({
    sourceRefs: z.array(ContentPlanContextSourceSchema),
    applied: z.boolean(),
    appliedAt: z.string().datetime().nullable(),
    humanDecision: z.string().nullable(),
    conflicts: z.array(z.string()),
  }).strict().optional(),
  keywordStrategy: ContentPlanKeywordStrategySchema.optional(),
  structure: z.object({ h1: z.string().min(1), sections: z.array(ContentPlanSectionSchema).min(1) }).strict(),
  internalLinks: z.array(ContentPlanInternalLinkSchema),
  sources: z.array(ContentPlanSourceSchema),
  evidenceRefs: z.array(ArtifactReferenceSchema),
  cta: z.object({ text: z.string().min(1), objective: z.string().min(1), placement: z.string().min(1) }).strict(),
  images: z.array(ContentPlanImageBriefSchema),
  skills: z.object({ skillIds: z.array(z.string()), promptIds: z.array(z.string()) }).strict(),
  metadata: z.object({
    slug: z.string().min(1), canonical: z.string().url().nullable(), principalKeywordId: z.string().min(1),
    metaTitle: z.string(), metaDescription: z.string(), socialTitle: z.string(), socialDescription: z.string(), indexationStatus: z.enum(["noindex", "index"]),
  }).strict(),
  radar: z.object({
    researchLoadId: z.string().nullable(),
    serpSnapshotIds: z.array(z.string()),
    analysisVersionId: z.string().nullable().default(null),
    analysisMode: z.enum(["kgr_light", "competitive_full"]).nullable().default(null),
    analysisEnforcement: z.enum(["advisory", "required"]).nullable().default(null),
    packageHash: z.string().nullable().default(null),
    requirements: z.array(z.string()).default([]),
    recommendations: z.array(z.string()).default([]),
    observedData: z.array(z.string()).default([]),
    humanDecisions: z.array(z.string()).default([]),
    evidencePackage: z.record(z.string(), z.unknown()).nullable().default(null),
  }).strict(),
  review: z.object({ workflowStatus: z.string(), publicationStatus: z.string(), transferStatus: z.string(), humanNotes: z.array(z.string()) }).strict(),
  gabarito: ContentPlanGabaritoSchema.optional(),
  blocks: z.array(ContentPlanBlockSchema).default([]),
  questions: z.array(ContentPlanBriefItemSchema).default([]),
  entities: z.array(ContentPlanBriefItemSchema).default([]),
  objections: z.array(ContentPlanBriefItemSchema).default([]),
  guardianInstructions: z.array(z.string()).default([]),
  alerts: z.array(z.string()).default([]),
}).strict();
export type ContentPlanDetails = z.infer<typeof ContentPlanDetailsSchema>;

export const ContentPlanSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  planId: z.string().min(1),
  brandDnaRef: VersionReferenceSchema,
  keywordDnaRefs: z.array(VersionReferenceSchema).min(1),
  articleDnaRef: VersionReferenceSchema,
  siloDnaRef: VersionReferenceSchema,
  serpEvidenceRefs: z.array(ArtifactReferenceSchema),
  productEvidenceRefs: z.array(ArtifactReferenceSchema),
  originalityReportRef: ArtifactReferenceSchema.nullable(),
  approvedOutline: z.array(z.object({ id: z.string(), heading: z.string(), objective: z.string(), keywordDnaRefs: z.array(VersionReferenceSchema) })).min(1),
  writingInstructions: z.array(z.string()),
  humanPendingDecisions: z.array(z.string()),
  planning: ContentPlanDetailsSchema.optional(),
}).strict().superRefine((plan, context) => {
  if (plan.schemaVersion === 2 && !plan.planning) context.addIssue({ code: "custom", path: ["planning"], message: "ContentPlan v2 precisa do bloco editorial definitivo." });
});
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

export const VersionedBrandDNASchema = versionEnvelopeSchema(BrandDNASchema);
export const VersionedKeywordDNASchema = versionEnvelopeSchema(KeywordDNASchema);
export const VersionedArticleDNASchema = versionEnvelopeSchema(ArticleDNASchema);
export const VersionedSiloDNASchema = versionEnvelopeSchema(SiloDNASchema);
export const VersionedSiloPageSchema = versionEnvelopeSchema(SiloPageSchema);
export const VersionedContentPlanSchema = versionEnvelopeSchema(ContentPlanSchema);

export const SerpResultSchema = z.object({
  position: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  pageType: z.string(),
  format: z.string().nullable(),
  entities: z.array(z.string()),
});

export const SerpSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  keyword: z.string().min(1),
  location: z.string().min(1),
  capturedAt: z.string().datetime(),
  results: z.array(SerpResultSchema),
  dominantIntent: z.string(),
  formats: z.array(z.string()),
  entities: z.array(z.string()),
  questions: z.array(z.string()),
  patterns: z.array(z.string()),
  gaps: z.array(z.string()),
  opportunities: z.array(z.string()),
});

export type SerpSnapshot = z.infer<typeof SerpSnapshotSchema>;

export const SerpArchitectureImpactSchema = z.object({
  action: z.enum([
    "confirmar_grupo",
    "dividir_grupo",
    "unir_grupos",
    "trocar_principal",
    "mudar_hierarquia",
    "cancelar_artigo",
    "transformar_em_reforco",
  ]),
  groupIds: z.array(z.string()).min(1),
  keywordIds: z.array(z.string()),
  reason: z.string().min(1),
  confidence: ConfidenceSchema,
  humanDecisionRequired: z.literal(true),
});

export const OriginalityReportSchema = z.object({
  internalConflicts: z.array(ConflictSchema),
  externalSimilarity: z.object({
    status: z.enum(["aguardando_serp", "analisado"]),
    score: ConfidenceSchema.nullable(),
    matches: z.array(z.string()),
  }),
  strategicOriginality: z.object({
    score: ConfidenceSchema,
    uniqueContributions: z.array(z.string()),
    genericRisks: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
});

export const ProvenanceSchema = z.object({
  keywordDnaRefs: z.array(VersionReferenceSchema),
  evidenceRefs: z.array(ArtifactReferenceSchema),
  sourceIds: z.array(z.string()),
}).strict();

const BlockBaseSchema = z.object({ id: z.string().min(1), provenance: ProvenanceSchema });
export const ContentBlockSchema = z.discriminatedUnion("type", [
  BlockBaseSchema.extend({ type: z.literal("heading"), level: z.number().int().min(1).max(4), text: z.string() }),
  BlockBaseSchema.extend({ type: z.literal("paragraph"), text: z.string() }),
  BlockBaseSchema.extend({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string()) }),
  BlockBaseSchema.extend({ type: z.literal("table"), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  BlockBaseSchema.extend({ type: z.literal("quote"), text: z.string(), sourceId: z.string().nullable() }),
  BlockBaseSchema.extend({ type: z.literal("internal_link"), targetArticleId: z.string(), anchor: z.string() }),
  BlockBaseSchema.extend({ type: z.literal("external_source"), sourceId: z.string(), claim: z.string(), url: z.string().url().nullable() }),
  BlockBaseSchema.extend({ type: z.literal("CTA"), text: z.string(), objective: z.string() }),
  BlockBaseSchema.extend({ type: z.literal("image_brief"), objective: z.string(), format: z.string(), requiredElements: z.array(z.string()), avoid: z.array(z.string()) }),
  BlockBaseSchema.extend({ type: z.literal("note"), text: z.string() }),
  BlockBaseSchema.extend({ type: z.literal("source"), sourceId: z.string(), note: z.string() }),
  BlockBaseSchema.extend({ type: z.literal("product_block"), productEvidenceId: z.string(), title: z.string(), summary: z.string() }),
  BlockBaseSchema.extend({ type: z.literal("comparison"), title: z.string(), columns: z.array(z.string()).min(2), rows: z.array(z.array(z.string())) }),
]);

export const ContentDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  status: z.enum(["planejado", "escrevendo", "em_revisao", "aprovado"]),
  contentPlanRef: VersionReferenceSchema,
  brandDnaRef: VersionReferenceSchema,
  keywordDnaRefs: z.array(VersionReferenceSchema).min(1),
  siloDnaRef: VersionReferenceSchema,
  articleDnaRef: VersionReferenceSchema,
  serpSnapshotRefs: z.array(ArtifactReferenceSchema),
  evidenceRefs: z.array(ArtifactReferenceSchema),
  sourceIds: z.array(z.string()),
  linkMap: z.array(z.object({ targetArticleId: z.string(), anchor: z.string() })),
  instructions: z.array(z.string()),
  blocks: z.array(ContentBlockSchema),
  editorContent: z.object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() }).passthrough().nullable().default(null),
  writingBrief: z.object({ planVersionId: z.string().min(1), details: ContentPlanDetailsSchema, guardianInstructions: z.array(z.string()), alerts: z.array(z.string()), provenance: ProvenanceSchema }).strict().optional(),
  metadata: z.object({
    slug: z.string(), principalKeyword: z.string(), metaTitle: z.string(), metaDescription: z.string(), socialTitle: z.string(), socialDescription: z.string(),
    canonical: z.string().url().nullable(), indexationStatus: z.enum(["noindex", "index"]), plannedImages: z.array(z.string()),
  }).default({ slug: "", principalKeyword: "", metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "", canonical: null, indexationStatus: "noindex", plannedImages: [] }),
}).strict();

export type ContentDocument = z.infer<typeof ContentDocumentSchema>;

export const SectionWritingRequestSchema = z.object({
  documentId: z.string(),
  sectionId: z.string(),
  contentPlanRef: VersionReferenceSchema,
  articleDnaRef: VersionReferenceSchema,
  siloDnaRef: VersionReferenceSchema,
  keywordDnaRefs: z.array(VersionReferenceSchema).min(1),
  serpRefs: z.array(ArtifactReferenceSchema),
  approvedPreviousBlocks: z.array(ContentBlockSchema),
  instructions: z.array(z.string()),
});

export const SectionWritingResultSchema = z.object({
  documentId: z.string(),
  sectionId: z.string(),
  blocks: z.array(ContentBlockSchema),
  alerts: z.array(z.string()),
  sourcesUsed: z.array(z.string()),
  status: z.enum(["escrevendo", "em_revisao"]),
});

export type SectionWritingRequest = z.infer<typeof SectionWritingRequestSchema>;
export type SectionWritingResult = z.infer<typeof SectionWritingResultSchema>;
