import { WorkspaceLoadDiagnosticsSchema, emptyLoadDiagnostics } from "./partial-read.ts";
import { z } from "zod";
import { ContentDocumentSchema, VersionedArticleDNASchema, VersionedContentPlanSchema, VersionedSiloDNASchema, VersionedSiloPageSchema, VersionStatusEventSchema } from "../arquiteto/contracts.ts";
import { BrandInvitationSchema, OperationalPublicationSchema, PlannerItemSchema, RadarItemSchema } from "./operational-flow.ts";
import { SavedGridViewSchema } from "./data-grid.ts";
import { AIReviewAnnotationSchema } from "./operational-contracts.ts";
import { SerpCollectionRecordSchema, SerpReviewRecordSchema } from "./contracts.ts";
import { RadarHydrationSnapshotSchema } from "../radar/hydration.ts";
import { ListedContentDocumentSchema } from "./content-document-listing.ts";
import { SerpMergeConflictSchema } from "../radar/serp-merge.ts";

export const PersistenceModeSchema = z.enum(["server", "local_fallback", "unavailable"]);
export type PersistenceMode = z.infer<typeof PersistenceModeSchema>;

/*
 * E1 · a listagem da mesa devolve o documento v2 com dossiê SEM o bundle, na
 * forma parcial marcada (`lib/editorial/content-document-listing.ts`). O
 * documento completo continua aceito do jeito de antes.
 */
export const PersistedDocumentSchema = z.object({
  document: ListedContentDocumentSchema,
  lockVersion: z.number().int().positive(),
  contentHash: z.string(),
  updatedAt: z.string().datetime({ offset: true }),
  userState: z.object({ cursorPosition: z.number().int().nonnegative().nullable(), scrollTop: z.number().int().nonnegative(), leftPanelOpen: z.boolean(), rightPanelOpen: z.boolean(), lastOpenedAt: z.string().datetime({ offset: true }) }).nullable(),
});
export type PersistedDocument = z.infer<typeof PersistedDocumentSchema>;

/**
 * E1 · o detalhe de UM documento — sempre completo. É o que o Redator precisa
 * ter antes de liberar edição e autosave.
 */
export const PersistedDocumentDetailSchema = z.object({
  brandId: z.string().min(1),
  document: ContentDocumentSchema,
  lockVersion: z.number().int().positive(),
  contentHash: z.string(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type PersistedDocumentDetail = z.infer<typeof PersistedDocumentDetailSchema>;

export const PersistedEditorialWorkspaceSchema = z.object({
  mode: PersistenceModeSchema,
  radarItems: z.array(RadarItemSchema),
  plannerItems: z.array(PlannerItemSchema),
  articleVersions: z.array(VersionedArticleDNASchema),
  siloVersions: z.array(VersionedSiloDNASchema),
  versionEvents: z.array(VersionStatusEventSchema),
  contentPlans: z.array(VersionedContentPlanSchema),
  serpRecords: z.array(SerpCollectionRecordSchema).default([]),
  serpReviews: z.array(SerpReviewRecordSchema).default([]),
  serpMergeConflicts: z.array(SerpMergeConflictSchema).default([]),
  serpPersistenceMode: z.enum(["server", "local_fallback"]).default("local_fallback"),
  documents: z.array(PersistedDocumentSchema),
  publications: z.array(OperationalPublicationSchema),
  invitations: z.array(BrandInvitationSchema),
  views: z.array(SavedGridViewSchema),
  /**
   * ADITIVO. Cliente antigo ignora e continua funcionando.
   *
   * Sem isto, `radarItems: []` significava cinco coisas diferentes — inclusive
   * "a consulta falhou" — e a interface escolhia a mais otimista.
   */
  loadDiagnostics: WorkspaceLoadDiagnosticsSchema.default(emptyLoadDiagnostics()),
  loadedAt: z.string().datetime({ offset: true }),
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
  siloPageVersions: z.record(z.string(), VersionedSiloPageSchema).default({}),
  versionEvents: z.array(VersionStatusEventSchema),
  contentPlans: z.record(z.string(), VersionedContentPlanSchema),
  /*
   * E1 · a cópia local guarda os documentos na forma de LISTAGEM: sem o bundle,
   * com o marcador. Cópia antiga, com o documento completo, continua legível.
   * O Redator nunca edita a partir daqui: a edição espera o detalhe do servidor.
   */
  documents: z.record(z.string(), ListedContentDocumentSchema),
  radarItems: z.array(RadarItemSchema),
  plannerItems: z.array(PlannerItemSchema),
  serpRecords: z.array(SerpCollectionRecordSchema).default([]),
  serpReviews: z.array(SerpReviewRecordSchema).default([]),
  serpMergeConflicts: z.array(SerpMergeConflictSchema).default([]),
  operationalPublications: z.array(OperationalPublicationSchema),
  documentLocks: z.record(z.string(), z.number().int().positive()),
  selectedEntityId: z.string().nullable(),
  aiReviewAnnotations: z.array(AIReviewAnnotationSchema).default([]),
  savedAt: z.string().datetime({ offset: true }),
});
export type LocalWorkflowRecovery = z.infer<typeof LocalWorkflowRecoverySchema>;

export function workflowRecoveryStorageKey(actorUserId: string, brandId: string) {
  return `minerador-pro:workflow-recovery:${actorUserId}:${brandId}`;
}

export const WorkflowCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import_radar"), brandId: z.string(), articleVersions: z.array(VersionedArticleDNASchema), versionEvents: z.array(VersionStatusEventSchema), hydrationByArticleId: z.record(z.string(), RadarHydrationSnapshotSchema).default({}),
    /**
     * Contexto arquitetural resolvido pelo cliente.
     *
     * O servidor o REVALIDA contra o estado canônico antes de gravar; ele
     * chega como insumo, nunca como veredito. Sem isto a rota reconstruía o
     * RadarItem sem Silo e obtinha uma lista vazia.
     */
    handoffContext: z.record(z.string(), z.object({
      silo: z.object({
        siloId: z.string().min(1),
        siloName: z.string().nullable(),
        territoryRef: z.string(),
        siloDnaVersionId: z.string().min(1),
        siloDnaContentHash: z.string().min(1),
        siloPageId: z.string().nullable(),
        siloPageVersionId: z.string().nullable(),
        siloPageSlug: z.string().nullable(),
        siloPageCanonical: z.string().nullable(),
        siloPagePublicationStatus: z.string().nullable(),
        articleRole: z.enum(["pillar", "support"]),
        // Adicionado junto com o marcador de procedencia em
        // ResolvedSiloContext. O objeto e .strict(): sem isto o cliente envia
        // uma chave a mais e o comando inteiro vira 400.
        siloIdProvenance: z.enum(["DECLARED", "LEGACY_TERRITORY_HYDRATION"]),
      }).strict(),
      internalLinks: z.unknown().nullable(),
      serpProvenance: z.unknown().nullable(),
    }).strict()).default({}) }),
  z.object({ action: z.literal("transition_radar"), brandId: z.string(), itemIds: z.array(z.string()), target: RadarItemSchema.shape.state, expectedLocks: z.record(z.string(), z.number().int().positive()) }),
  /*
   * ===== CORTE 2 · OS QUATRO CAMINHOS DE ESCRITA DO PLANEJADOR SAÍRAM =====
   *
   * `import_planner`, `prepare_plan`, `approve_plan` e `start_writing` não
   * existem mais. Eram as únicas portas por onde um `PlannerItem` nascia, um
   * `ContentPlan` virava exigência e um `publication_records` era criado.
   *
   * `start_writing` merece o registro: ele era a ÚNICA porta de Publicações, e
   * exigia plano aprovado no Planejador. Quem o substitui é
   * `sendWriterToPublications`, que tem rota própria em
   * `/api/redator/publication-handoff` e autoridade em ContentDocument +
   * origem Radar. Ele não entra aqui porque não é comando de esteira: é
   * handoff com readback, e handoff com readback não pode ser disparado por um
   * `void` sem espera, como esta união permite.
   *
   * O vocabulário de LEITURA continua: `plannerItemId`, `contentPlanVersionId`
   * e `sent_planner` permanecem legíveis onde já foram gravados.
   */
  /*
   * CORTE 3.5 · `import_publications` saiu junto com o caminho local-first que
   * o chamava. Deixar a ação viva no servidor sem cliente é arma carregada:
   * alguém a encontraria e voltaria a entrar em Publicações por fora do handoff.
   */
]);
export type WorkflowCommand = z.infer<typeof WorkflowCommandSchema>;

/*
 * E1 · `document` aceita também a cópia PARCIAL. A rota nunca a grava como
 * está: completa com o bundle gravado na linha (`completeWithStoredBundle`) e
 * recalcula o hash. O caminho normal do Redator continua mandando o completo.
 */
export const DocumentSaveInputSchema = z.object({
  brandId: z.string(), documentId: z.string(), expectedLockVersion: z.number().int().positive(), document: ListedContentDocumentSchema,
  contentHash: z.string(), createVersion: z.boolean().default(false), changeReason: z.string().default("Autosave editorial."),
});

export const DocumentUserStateInputSchema = z.object({
  brandId: z.string(), documentId: z.string(), cursorPosition: z.number().int().nonnegative().nullable(), scrollTop: z.number().int().nonnegative(), leftPanelOpen: z.boolean(), rightPanelOpen: z.boolean(),
});
