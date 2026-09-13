import { z } from "zod";

export const SerpPersistenceModeSchema = z.enum(["remote", "local"]);
export type SerpPersistenceMode = z.infer<typeof SerpPersistenceModeSchema>;

export const SerpResultKindSchema = z.enum(["article", "service", "local", "category", "product", "review", "comparison", "list", "video", "forum", "institutional", "other"]);
export type SerpResultKind = z.infer<typeof SerpResultKindSchema>;

export const SerpConfidenceSchema = z.enum(["high", "medium", "low", "insufficient"]);
export type SerpConfidence = z.infer<typeof SerpConfidenceSchema>;

export const SerpDiagnosticSchema = z.object({
  dominantIntent: z.string().nullable(),
  secondaryIntents: z.array(z.string()),
  confidence: SerpConfidenceSchema,
  dominantFormats: z.array(z.string()),
  resultTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
  pageTypes: z.array(z.string()),
  recurringTitlePatterns: z.array(z.string()),
  recurringSnippetPatterns: z.array(z.string()),
  frequentEntities: z.array(z.string()),
  frequentDomains: z.array(z.string()),
  localSignals: z.array(z.string()),
  questions: z.array(z.string()),
  relatedSearches: z.array(z.string()),
  possibleConflicts: z.array(z.string()),
  opportunities: z.array(z.string()),
  limitations: z.array(z.string()),
  /*
   * A DISTRIBUIÇÃO BRUTA DA RESPOSTA, POR TIPO.
   *
   * "Por que aparecem exatamente 8?" não tinha como ser respondido: o payload
   * cru não é persistido, e só as posições preservadas (5,6,7,8,9,11,12,13)
   * denunciavam que o provider devolveu mais itens de outros tipos. Aditivo com
   * `.default({})`: snapshot antigo continua válido, e a próxima coleta traz a
   * conta.
   */
  rawItemTypeCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  verdict: z.enum(["coerente", "parcialmente_coerente", "possivel_conflito", "informacao_insuficiente"]),
}).strict();
export type SerpDiagnostic = z.infer<typeof SerpDiagnosticSchema>;

export const SerpOrganicResultSchema = z.object({
  position: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  snippet: z.string(),
  sitelinks: z.array(z.object({ title: z.string().min(1), url: z.string().url() }).strict()),
  date: z.string().nullable(),
  inferredType: SerpResultKindSchema,
  confidence: SerpConfidenceSchema,
  manualType: SerpResultKindSchema.nullable(),
  notes: z.string(),
}).strict();
export type SerpOrganicResult = z.infer<typeof SerpOrganicResultSchema>;

export const SerpPeopleAlsoAskSchema = z.object({
  position: z.number().int().positive(),
  question: z.string().min(1),
  answer: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
  classification: z.enum(["obrigatoria", "util", "ja_coberta", "outro_artigo", "fora_escopo"]).nullable(),
  notes: z.string(),
}).strict();
export type SerpPeopleAlsoAsk = z.infer<typeof SerpPeopleAlsoAskSchema>;

export const SerpRelatedSearchSchema = z.object({
  term: z.string().min(1),
  classification: z.enum(["possivel_secundaria", "reforco", "novo_artigo", "ignorar"]).nullable(),
  notes: z.string(),
}).strict();
export type SerpRelatedSearch = z.infer<typeof SerpRelatedSearchSchema>;

export const SerpKnowledgeGraphSchema = z.object({
  title: z.string().nullable(),
  type: z.string().nullable(),
  description: z.string().nullable(),
  attributes: z.record(z.string(), z.string()),
  website: z.string().url().nullable(),
  sources: z.array(z.object({ title: z.string().nullable(), url: z.string().url() }).strict()),
}).strict();
export type SerpKnowledgeGraph = z.infer<typeof SerpKnowledgeGraphSchema>;

export const SerpResearchSnapshotSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  keywordId: z.string().min(1),
  keywordDnaVersionId: z.string().min(1),
  query: z.string().min(1),
  country: z.string().min(2),
  language: z.string().min(2),
  location: z.string().min(1),
  device: z.enum(["desktop", "mobile"]),
  resultLimit: z.number().int().positive().max(100),
  provider: z.string().min(1),
  providerEndpoint: z.literal("/search"),
  origin: z.enum(["real", "mock"]),
  isMock: z.boolean(),
  collectedAt: z.string().datetime(),
  version: z.number().int().positive(),
  previousSnapshotId: z.string().nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  persistenceMode: SerpPersistenceModeSchema,
  resolutionMode: z.enum(["remote_canonical", "local_recovery"]).default("local_recovery"),
  canonicalRemoteVerified: z.boolean().default(false),
  status: z.enum(["needs_review", "approved", "rejected", "superseded", "error"]),
  organicResults: z.array(SerpOrganicResultSchema),
  peopleAlsoAsk: z.array(SerpPeopleAlsoAskSchema),
  relatedSearches: z.array(SerpRelatedSearchSchema),
  knowledgeGraph: SerpKnowledgeGraphSchema.nullable(),
  diagnostic: SerpDiagnosticSchema,
}).strict();
export type SerpResearchSnapshot = z.infer<typeof SerpResearchSnapshotSchema>;

export const SerpReviewSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  snapshotId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(4000),
  reviewedBy: z.string().min(1),
  reviewedAt: z.string().datetime(),
}).strict();
export type SerpReview = z.infer<typeof SerpReviewSchema>;

export type SerpSearchInput = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  keywordId: string;
  keywordDnaVersionId: string;
  keyword: string;
  location: string;
  language: string;
  device: "desktop" | "mobile";
  expectedIntent: string;
  expectedFormat: string;
  requiredTopics: string[];
  articleEntities: string[];
  resultLimit: number;
  version: number;
  previousSnapshotId: string | null;
};
