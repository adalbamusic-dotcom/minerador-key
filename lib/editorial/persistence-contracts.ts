import { z } from "zod";
import { ContentDocumentSchema, VersionedArticleDNASchema, VersionedContentPlanSchema, VersionedSiloDNASchema, VersionStatusEventSchema } from "../arquiteto/contracts.ts";
import { BrandInvitationSchema, OperationalPublicationSchema, PlannerItemSchema, RadarItemSchema } from "./operational-flow.ts";
import { SavedGridViewSchema } from "./data-grid.ts";
import { AIReviewAnnotationSchema } from "./operational-contracts.ts";

export const PersistenceModeSchema = z.enum(["server", "local_fallback", "unavailable"]);
export type PersistenceMode = z.infer<typeof PersistenceModeSchema>;

export const PersistedDocumentSchema = z.object({
  document: ContentDocumentSchema,
  lockVersion: z.number().int().positive(),
  contentHash: z.string(),
  updatedAt: z.string().datetime(),
  userState: z.object({ cursorPosition: z.number().int().nonnegative().nullable(), scrollTop: z.number().int().nonnegative(), leftPanelOpen: z.boolean(), rightPanelOpen: z.boolean(), lastOpenedAt: z.string().datetime() }).nullable(),
});
export type PersistedDocument = z.infer<typeof PersistedDocumentSchema>;

export const PersistedEditorialWorkspaceSchema = z.object({
  mode: PersistenceModeSchema,
  radarItems: z.array(RadarItemSchema),
  plannerItems: z.array(PlannerItemSchema),
  articleVersions: z.array(VersionedArticleDNASchema),
  siloVersions: z.array(VersionedSiloDNASchema),
  versionEvents: z.array(VersionStatusEventSchema),
  contentPlans: z.array(VersionedContentPlanSchema),
  documents: z.array(PersistedDocumentSchema),
  publications: z.array(OperationalPublicationSchema),
  invitations: z.array(BrandInvitationSchema),
  views: z.array(SavedGridViewSchema),
  loadedAt: z.string().datetime(),
});
export type PersistedEditorialWorkspace = z.infer<typeof PersistedEditorialWorkspaceSchema>;

// Recovery used only while the operational migration is unavailable. It keeps
// workflow continuity in the same browser without pretending to be remote
// persistence or changing any Supabase record.
export const LocalWorkflowRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  architectImportedKeywordIds: z.array(z.string()),
  articleVersions: z.record(z.string(), VersionedArticleDNASchema),
  siloVersions: z.record(z.string(), VersionedSiloDNASchema),
  versionEvents: z.array(VersionStatusEventSchema),
  contentPlans: z.record(z.string(), VersionedContentPlanSchema),
  documents: z.record(z.string(), ContentDocumentSchema),
  radarItems: z.array(RadarItemSchema),
  plannerItems: z.array(PlannerItemSchema),
  operationalPublications: z.array(OperationalPublicationSchema),
  documentLocks: z.record(z.string(), z.number().int().positive()),
  selectedEntityId: z.string().nullable(),
  aiReviewAnnotations: z.array(AIReviewAnnotationSchema).default([]),
  savedAt: z.string().datetime(),
});
export type LocalWorkflowRecovery = z.infer<typeof LocalWorkflowRecoverySchema>;

export function workflowRecoveryStorageKey(brandId: string) {
  return `minerador-pro:workflow-recovery:${brandId}`;
}

export const WorkflowCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import_radar"), brandId: z.string(), articleVersions: z.array(VersionedArticleDNASchema), versionEvents: z.array(VersionStatusEventSchema) }),
  z.object({ action: z.literal("transition_radar"), brandId: z.string(), itemIds: z.array(z.string()), target: RadarItemSchema.shape.state, expectedLocks: z.record(z.string(), z.number().int().positive()) }),
  z.object({ action: z.literal("import_planner"), brandId: z.string(), radarItemIds: z.array(z.string()), expectedLocks: z.record(z.string(), z.number().int().positive()) }),
  z.object({ action: z.literal("prepare_plan"), brandId: z.string(), plannerItemId: z.string(), expectedLock: z.number().int().positive(), plan: VersionedContentPlanSchema }),
  z.object({ action: z.literal("approve_plan"), brandId: z.string(), plannerItemIds: z.array(z.string()), expectedLocks: z.record(z.string(), z.number().int().positive()) }),
  z.object({ action: z.literal("start_writing"), brandId: z.string(), plannerItemId: z.string(), expectedLock: z.number().int().positive(), articleVersion: VersionedArticleDNASchema, plan: VersionedContentPlanSchema, document: ContentDocumentSchema, publication: OperationalPublicationSchema }),
  z.object({ action: z.literal("import_publications"), brandId: z.string(), publicationIds: z.array(z.string()), expectedLocks: z.record(z.string(), z.number().int().positive()) }),
]);
export type WorkflowCommand = z.infer<typeof WorkflowCommandSchema>;

export const DocumentSaveInputSchema = z.object({
  brandId: z.string(), documentId: z.string(), expectedLockVersion: z.number().int().positive(), document: ContentDocumentSchema,
  contentHash: z.string(), createVersion: z.boolean().default(false), changeReason: z.string().default("Autosave editorial."),
});

export const DocumentUserStateInputSchema = z.object({
  brandId: z.string(), documentId: z.string(), cursorPosition: z.number().int().nonnegative().nullable(), scrollTop: z.number().int().nonnegative(), leftPanelOpen: z.boolean(), rightPanelOpen: z.boolean(),
});
