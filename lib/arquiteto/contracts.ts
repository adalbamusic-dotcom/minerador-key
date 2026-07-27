import { z } from "zod";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";

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

export const ArticleKgrIdentitySchema = z.object({
  isKgrArticle: z.boolean(),
  source: z.enum(["minerador", "confirmed_import", "human_confirmation", "legacy", "unknown"]),
  principalKeywordDnaId: z.string().min(1).optional(),
  boundSlug: z.string().min(1).optional(),
  bindingStatus: z.enum(["confirmed", "candidate", "conflict", "not_applicable"]),
  status: z.enum(["confirmed", "candidate", "conflict", "not_kgr", "unknown"]).optional(),
  primaryKeywordId: z.string().min(1).optional(),
  primaryVolume: z.number().nullable().optional(),
  resultCount: z.number().int().nonnegative().nullable().optional(),
  purpose: z.string().min(1).optional(),
  evidenceKeywordDnaIds: z.array(z.string().min(1)).optional(),
  kgrValue: z.number().nullable().optional(),
  kgrTier: z.string().min(1).optional(),
  confirmedAt: z.string().datetime().optional(),
  confirmedBy: z.string().min(1).optional(),
  sourceVersion: z.string().min(1).optional(),
  sourceHash: ContentHashSchema.optional(),
  evidence: z.array(z.record(z.string(), z.unknown())).optional(),
  humanDecision: z.record(z.string(), z.unknown()).optional(),
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

export const ProvisionalArticleGroupSchema = z.object({
  id: z.string().min(1),
  keywordIds: z.array(z.string().min(1)).min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  keywords: z.array(ArchitectKeywordSchema).min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  publishedAnchorId: z.string().nullable(),
  suggestedSiloId: z.string().nullable(),
  suggestedSiloName: z.string().nullable(),
  evidence: GroupEvidenceSchema,
  confidence: ConfidenceSchema,
  alerts: z.array(z.string()),
  principalSuggestion: PrincipalSuggestionSchema,
  roles: z.record(z.string(), KeywordRoleSchema),
  suggestedHierarchy: z.enum(["Pilar", "Suporte", "Reforco Narrativo"]),
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

export const KeywordArticleReviewSchema = z.object({
  decisions: z.array(KeywordArticleDecisionSchema).min(1),
  conflicts: z.array(ConflictSchema),
  summary: z.string().min(1),
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

export const ArticleDNASchema = z.object({
  schemaVersion: z.literal(1),
  articleId: z.string().min(1),
  brandId: z.string().min(1),
  principalKeywordId: z.string().min(1),
  secondaryKeywordIds: z.array(z.string().min(1)).max(5),
  narrativeReinforcementIds: z.array(z.string().min(1)),
  keywordReferences: z.array(ArticleKeywordReferenceSchema).min(1).max(MAX_KEYWORDS_PER_ARTICLE),
  siloId: z.string().nullable(),
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
  siloId: z.string().min(1),
  brandId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  centralEntity: z.string().min(1),
  centralEntitySource: z.enum(["manual", "keyword_dna"]).optional(),
  centralKeywordDnaRef: VersionReferenceSchema.optional(),
  objective: z.string().min(1),
  audience: z.string().min(1),
  macroProblem: z.string().min(1),
  dominantIntent: z.string().min(1),
  pillarArticleId: z.string().nullable(),
  supportArticleIds: z.array(z.string()),
  articleReferences: z.array(ArticleDNAReferenceSchema),
  articleRoles: z.array(z.object({ articleId: z.string(), role: z.string(), reason: z.string() })),
  narrativeOrder: z.array(z.string()),
  linkMap: z.array(z.object({ fromArticleId: z.string(), toArticleId: z.string(), reason: z.string() })),
  boundary: z.string().min(1),
  includedTopics: z.array(z.string()),
  excludedTopics: z.array(z.string()),
  nearbySiloIds: z.array(z.string()),
  possibleConflicts: z.array(z.string()),
  gaps: z.array(z.string()),
  nextContents: z.array(z.string()),
  confidence: ConfidenceSchema,
  humanPendingDecisions: z.array(z.string()),
  hierarchySignals: z.array(z.object({
    articleDnaId: z.string().min(1), principalVolume: z.number().nonnegative().nullable(), combinedVolume: z.number().nonnegative().nullable(),
    tailLength: z.number().int().nonnegative(), kgrScore: z.number().nonnegative().nullable(), semanticCentrality: ConfidenceSchema,
    intentBreadth: z.number().nonnegative(), suggestedRole: z.enum(["pillar", "support"]), supportOrder: z.number().int().positive().nullable(), rationale: z.string().min(1),
  }).strict()).default([]),
}).strict().superRefine((silo, context) => {
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
  siloPageId: z.string().min(1),
  brandId: z.string().min(1),
  siloDnaRef: VersionReferenceSchema,
  siloId: z.string().min(1),
  slug: z.string().min(1),
  publicationStatus: z.enum(["new", "published"]).default("new"),
  publishedUrl: z.string().url().nullable().default(null),
  publicationVerification: SiloPagePublicationVerificationSchema.default({
    status: "not_applicable", checkedAt: null, requestedUrl: null, resolvedUrl: null, declaredCanonical: null,
    httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null,
  }),
  h1: z.string().min(1),
  seoTitle: z.string().min(1),
  metaDescription: z.string().min(1),
  canonical: z.string().url().nullable(),
  intro: z.string().min(1),
  sections: z.array(SiloPageSectionSchema),
  cta: z.string().min(1),
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
