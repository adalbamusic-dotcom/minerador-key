import { z } from "zod";
import {
  ContentDocumentSchema,
  ProductEvidenceDNASchema,
  SerpSnapshotSchema,
  VersionedArticleDNASchema,
  VersionedContentPlanSchema,
  VersionedSiloDNASchema,
} from "../arquiteto/contracts.ts";

export const EditorialStageSchema = z.enum(["marca", "keywords", "artigos", "silos", "serp", "planejamento", "documentos"]);
export type EditorialStage = z.infer<typeof EditorialStageSchema>;
export const PipelineStateSchema = z.enum(["not_started", "in_progress", "pending_review", "approved", "has_conflicts", "blocked"]);
export type PipelineState = z.infer<typeof PipelineStateSchema>;
export const DataOriginSchema = z.enum(["real", "legacy", "local", "mock"]);
export type DataOrigin = z.infer<typeof DataOriginSchema>;

export const EditorialBrandDtoSchema = z.object({
  id: z.string(), nome: z.string(), site_url: z.string().nullable(), nicho: z.string().nullable(),
  localizacao: z.string().nullable(), dna_diretrizes: z.string().nullable(), silos_existentes: z.unknown(), created_at: z.string().nullable(),
});
export const EditorialSiloDtoSchema = z.object({ id: z.string(), nome: z.string(), nicho: z.string().nullable(), marca_id: z.string(), created_at: z.string().nullable() });
export const EditorialKeywordDtoSchema = z.object({
  id: z.string(), keyword: z.string(), intent: z.string().nullable(), volume_search: z.number().nullable(), kgr_score: z.number().nullable(),
  lista_id: z.string(), status: z.string().nullable(), analise_semantica: z.record(z.string(), z.unknown()).nullable(), created_at: z.string().nullable(),
});
export type EditorialKeywordDto = z.infer<typeof EditorialKeywordDtoSchema>;
export const EditorialBriefingDtoSchema = z.object({
  id: z.string(), silo_id: z.string(), keyword_principal: z.string(), keywords_secundarias: z.unknown(), titulo: z.string().nullable(),
  slug_sugerido: z.string().nullable(), canonical: z.string().nullable(), hierarquia: z.string().nullable(), status: z.string().nullable(),
  meta_title: z.string().nullable(), meta_description: z.string().nullable(), diretrizes_estrategicas: z.unknown(), created_at: z.string().nullable(), updated_at: z.string().nullable(),
});
export const EditorialSnapshotSchema = z.object({
  brand: EditorialBrandDtoSchema,
  silos: z.array(EditorialSiloDtoSchema),
  keywords: z.array(EditorialKeywordDtoSchema),
  briefings: z.array(EditorialBriefingDtoSchema),
  loadedAt: z.string().datetime(),
});
export type EditorialSnapshot = z.infer<typeof EditorialSnapshotSchema>;

export const LegacyFieldSchema = z.object({ value: z.unknown().nullable(), available: z.boolean(), sourcePath: z.string() });
export const LegacyBrandViewSchema = z.object({
  brandId: z.string(), origin: z.literal("legacy"), versionId: z.string(), contentHash: z.string(), rawGuidelines: z.string().nullable(),
  fields: z.record(z.string(), LegacyFieldSchema), missingFields: z.array(z.string()), completion: z.number().min(0).max(1),
});
export const LegacyKeywordViewSchema = z.object({
  keywordId: z.string(), keyword: z.string(), origin: z.literal("legacy"), versionId: z.string(), contentHash: z.string(),
  status: z.string().nullable(), intent: LegacyFieldSchema, centralEntity: LegacyFieldSchema, audience: LegacyFieldSchema,
  perceivedProblem: LegacyFieldSchema, desiredResult: LegacyFieldSchema, commercialPotential: LegacyFieldSchema,
  editorialType: LegacyFieldSchema, affiliatePotential: LegacyFieldSchema, humanConfirmed: z.literal(false), missingFields: z.array(z.string()),
});
export type LegacyKeywordView = z.infer<typeof LegacyKeywordViewSchema>;

export const SerpQueryInputSchema = z.object({ keyword: z.string().min(1), articleId: z.string().min(1), location: z.string().min(1), language: z.string().min(2), device: z.enum(["desktop", "mobile"]) });
export const SerpCollectionStatusSchema = z.enum(["not_requested", "queued", "collecting", "collected", "failed", "stale", "needs_review", "approved"]);
export const SerpCollectionRecordSchema = z.object({
  id: z.string(), input: SerpQueryInputSchema, status: SerpCollectionStatusSchema, provider: z.string(), origin: DataOriginSchema,
  isMock: z.boolean(), snapshot: SerpSnapshotSchema.nullable(), cost: z.number().nonnegative().nullable(), error: z.string().nullable(),
  dnaIntent: z.string().nullable(), conflictReason: z.string().nullable(), humanDecisionRequired: z.boolean(),
});
export type SerpQueryInput = z.infer<typeof SerpQueryInputSchema>;
export type SerpCollectionRecord = z.infer<typeof SerpCollectionRecordSchema>;

export const ExternalSimilarityInputSchema = z.object({ articleId: z.string(), documentId: z.string(), serpSnapshotIds: z.array(z.string()).min(1) });
export const ExternalSimilarityResultSchema = z.object({ score: z.number().min(0).max(1), phraseMatches: z.array(z.string()), headingMatches: z.array(z.string()), structuralRisks: z.array(z.string()), humanDecisionRequired: z.boolean() });
export const ProductEvidenceInputSchema = z.object({ articleId: z.string(), productQuery: z.string().min(1), marketplace: z.string().min(1), location: z.string().min(1) });

export const EditorialLocalWorkspaceSchema = z.object({
  articleVersions: z.record(z.string(), VersionedArticleDNASchema), siloVersions: z.record(z.string(), VersionedSiloDNASchema),
  serpRecords: z.array(SerpCollectionRecordSchema), productEvidence: z.array(ProductEvidenceDNASchema),
  contentPlans: z.record(z.string(), VersionedContentPlanSchema), documents: z.record(z.string(), ContentDocumentSchema),
});

export const EDITORIAL_STAGES: EditorialStage[] = ["marca", "keywords", "artigos", "silos", "serp", "planejamento", "documentos"];
