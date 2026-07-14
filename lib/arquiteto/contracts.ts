import { z } from "zod";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";

export const ConfidenceSchema = z.number().min(0).max(1);
export const IntentSchema = z.string().trim().min(1).nullable().optional();

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

export const ArchitectKeywordSchema = z.object({
  id: z.string().min(1),
  keyword: z.string().trim().min(1),
  intent: IntentSchema,
  volume_search: z.number().nullable().optional(),
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
});
export type KeywordDNA = z.infer<typeof KeywordDNASchema>;

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
}).strict();
export type ArticleKeywordReference = z.infer<typeof ArticleKeywordReferenceSchema>;

export const ArticleDNASchema = z.object({
  schemaVersion: z.literal(1),
  articleId: z.string().min(1),
  brandId: z.string().min(1),
  principalKeywordId: z.string().min(1),
  secondaryKeywordIds: z.array(z.string().min(1)),
  narrativeReinforcementIds: z.array(z.string().min(1)),
  keywordReferences: z.array(ArticleKeywordReferenceSchema).min(1),
  siloId: z.string().nullable(),
  hierarchy: z.enum(["Pilar", "Suporte", "Reforco Narrativo"]),
  suggestedSlug: z.string().min(1),
  canonical: z.string().url().nullable(),
  mainIntent: z.string().min(1),
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
  centralEntity: z.string().min(1),
  objective: z.string().min(1),
  audience: z.string().min(1),
  macroProblem: z.string().min(1),
  dominantIntent: z.string().min(1),
  pillarArticleId: z.string().nullable(),
  supportArticleIds: z.array(z.string()),
  articleReferences: z.array(ArticleDNAReferenceSchema).min(1),
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
}).strict().superRefine((silo, context) => {
  const referenced = new Set(silo.articleReferences.map(reference => reference.articleId));
  const expected = [silo.pillarArticleId, ...silo.supportArticleIds].filter((id): id is string => Boolean(id));
  if (expected.some(id => !referenced.has(id)) || referenced.size !== new Set(expected).size) {
    context.addIssue({ code: "custom", path: ["articleReferences"], message: "As referencias devem cobrir exatamente os artigos do silo." });
  }
});

export type SiloDNA = z.infer<typeof SiloDNASchema>;

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

export const ContentPlanSchema = z.object({
  schemaVersion: z.literal(1),
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
}).strict();
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

export const VersionedBrandDNASchema = versionEnvelopeSchema(BrandDNASchema);
export const VersionedKeywordDNASchema = versionEnvelopeSchema(KeywordDNASchema);
export const VersionedArticleDNASchema = versionEnvelopeSchema(ArticleDNASchema);
export const VersionedSiloDNASchema = versionEnvelopeSchema(SiloDNASchema);
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
