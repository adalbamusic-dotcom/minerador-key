"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ArticleDNA, ContentDocument, ContentPlan, ContentPlanDetails, ProductEvidenceDNA, SiloDNA, SiloPage, VersionEnvelope, VersionStatusEvent } from "@/lib/arquiteto/contracts";
import { EditorialSnapshotSchema, SerpCollectionRecordSchema, SerpReviewRecordSchema, type EditorialSnapshot, type SerpCollectionRecord, type SerpReviewRecord } from "@/lib/editorial/contracts";
import { createMockPlanAndDocument, mockProductEvidenceProvider, mockSerpProvider } from "@/lib/editorial/providers";
import { createMockOperationalBundle } from "@/lib/editorial/providers";
import type { AIReviewAnnotation, BrandMaterial, BrandPrompt, BrandSkill, ExternalSourceSuggestion, GuardianFinding, InternalLinkAssignment, PublicationRecord } from "@/lib/editorial/operational-contracts";
import type { BrandInvitation, OperationalPublication, PlannerItem, RadarArticleHandoffContext, RadarItem } from "@/lib/editorial/operational-flow";
import { buildRadarHandoffContexts, type RadarHandoffBlocked } from "@/lib/arquiteto/radar-handoff-context";
import type { InternalLinkGraph } from "@/lib/arquiteto/contracts";
import { approvedArticleVersions, approvedSiloPageVersions, createDevelopmentInvitation, createOperationalDocument, createOperationalPlan, createPublicationDraft,
  contentPlanApprovalIssues, importApprovedWriterItems, importArticlesToRadar, importRadarToPlanner, importSiloPagesToRadar, mergeVersionEvents, setRadarState } from "@/lib/editorial/operational-flow";
import { createContentPlanSuccessor } from "@/lib/planejador/content-plan";
import { publicationSourceIssues, publishedIdentityReferenceIssues, resolvePlannerPublicationIdentity } from "@/lib/planejador/publication-identity";
import { hasMaterialPlanChange } from "@/lib/planejador/outline";
import { createStatusEvent } from "@/lib/arquiteto/versioning";
import { useBrand } from "./brand-context";
import { useSupabaseSession } from "./auth/supabase-session-context";
import { updateBrandWorkspace } from "@/lib/editorial/workspace";
import { LocalWorkflowRecoverySchema, PersistedEditorialWorkspaceSchema, workflowRecoveryStorageKey, type PersistenceMode, type WorkflowCommand, type LocalWorkflowRecovery } from "@/lib/editorial/persistence-contracts";
import { createRadarHydrationSnapshot, reconcileRadarItems, type RadarHydrationSnapshot, type RadarHydrationSourceKeyword } from "@/lib/radar/hydration";
import type { SerpFormationAssessment } from "@/lib/arquiteto/serp-formation";
import { createRadarSerpResolutionEnvelope } from "@/lib/radar/resolution-envelope";
import { buildRadarSerpCollectPayload } from "@/lib/radar/serp/request";
import type { BackgroundTaskInput, EditorialBackgroundTask } from "@/lib/editorial/background-tasks";
import type { EditorialHistoryModule } from "@/lib/editorial/history";
import { VersionedRadarAnalysisSchema, type RadarAnalysisVersion } from "@/lib/radar/analysis-contracts";
import { beginRadarAnalysisReadback, beginRadarAnalysisWrite, canApplyRadarAnalysisReadback, EMPTY_RADAR_ANALYSIS_SYNC_STATE, finishRadarAnalysisWrite, radarAnalysisReadbackFingerprint, type RadarAnalysisSyncState } from "@/lib/radar/analysis-readback";
import { beginRadarSerpReviewReadback, beginRadarSerpReviewWrite, canApplyRadarSerpReviewReadback, EMPTY_RADAR_SERP_REVIEW_SYNC_STATE, finishRadarSerpReviewWrite, radarSerpReviewReadbackFingerprint, type RadarSerpReviewSyncState } from "@/lib/radar/serp-review-readback";
import { radarPlannerPackageToContentPlanInput } from "@/lib/radar/planner-handoff";
import { latestRadarR5SerpRecord } from "@/lib/radar/r5-sequential";
import { mergeRadarItemsPreservingLocalState } from "@/lib/radar/workspace-merge";
import { mergeSerpRecordsPreservingPayload, type SerpMergeConflict } from "@/lib/radar/serp-merge";

interface BrandWorkspace {
  architectImportedKeywordIds: string[];
  articleVersions: Record<string, VersionEnvelope<ArticleDNA>>;
  siloVersions: Record<string, VersionEnvelope<SiloDNA>>;
  siloPageVersions: Record<string, VersionEnvelope<SiloPage>>;
  versionEvents: VersionStatusEvent[];
  serpRecords: SerpCollectionRecord[];
  serpReviews: SerpReviewRecord[];
  serpMergeConflicts: SerpMergeConflict[];
  serpPersistenceMode: "server" | "local_fallback";
  /** Snapshot-scoped proof from the narrow readback endpoint; never inferred from a broad workspace load. */
  serpReviewReadbackSnapshotIds: string[];
  productEvidence: ProductEvidenceDNA[];
  contentPlans: Record<string, VersionEnvelope<ContentPlan>>;
  documents: Record<string, ContentDocument>;
  selectedEntityId: string | null;
  skills: BrandSkill[];
  prompts: BrandPrompt[];
  materials: BrandMaterial[];
  internalLinks: InternalLinkAssignment[];
  externalSources: ExternalSourceSuggestion[];
  guardianFindings: GuardianFinding[];
  publications: PublicationRecord[];
  radarItems: RadarItem[];
  plannerItems: PlannerItem[];
  operationalPublications: OperationalPublication[];
  invitations: BrandInvitation[];
  persistenceMode: PersistenceMode;
  documentLocks: Record<string, number>;
  documentUserStates: Record<string, { cursorPosition: number | null; scrollTop: number; leftPanelOpen: boolean; rightPanelOpen: boolean; lastOpenedAt: string }>;
  moduleState: Record<string, { search?: string; selectedId?: string | null; expandedId?: string | null; scrollTop?: number }>;
  backgroundTasks: EditorialBackgroundTask[];
  aiReviewAnnotations: AIReviewAnnotation[];
}

const emptyWorkspace = (): BrandWorkspace => ({ architectImportedKeywordIds: [], articleVersions: {}, siloVersions: {}, siloPageVersions: {}, versionEvents: [], serpRecords: [], serpReviews: [], serpMergeConflicts: [], serpPersistenceMode: "local_fallback", serpReviewReadbackSnapshotIds: [],
  productEvidence: [], contentPlans: {}, documents: {}, selectedEntityId: null, skills: [], prompts: [], materials: [],
  internalLinks: [], externalSources: [], guardianFindings: [], publications: [], radarItems: [], plannerItems: [],
  operationalPublications: [], invitations: [], persistenceMode: "local_fallback", documentLocks: {}, documentUserStates: {}, moduleState: {}, backgroundTasks: [], aiReviewAnnotations: [] });

function latestRadarSnapshotFingerprint(workspace: BrandWorkspace, articleId: string) {
  const snapshot = workspace.serpRecords
    .filter(record => record.input.articleId === articleId)
    .slice()
    .sort((left, right) => (left.research?.version || 0) - (right.research?.version || 0))
    .at(-1);
  return snapshot ? JSON.stringify({ id: snapshot.id, version: snapshot.research?.version || null, hash: snapshot.research?.contentHash || null }) : null;
}

function saveLocalSerpRecovery(actorUserId: string, brandId: string, workspace: BrandWorkspace, record: SerpCollectionRecord | null, review?: SerpReviewRecord) {
  if (typeof window === "undefined") return false;
  try {
    const recovery = LocalWorkflowRecoverySchema.parse({
      schemaVersion: 1,
      architectImportedKeywordIds: workspace.architectImportedKeywordIds,
      articleVersions: workspace.articleVersions,
      siloVersions: workspace.siloVersions,
      siloPageVersions: workspace.siloPageVersions,
      versionEvents: workspace.versionEvents,
      contentPlans: workspace.contentPlans,
      documents: workspace.documents,
      radarItems: workspace.radarItems,
      plannerItems: workspace.plannerItems,
      serpRecords: record ? [...workspace.serpRecords.filter(item => item.id !== record.id), record] : workspace.serpRecords,
      serpReviews: review ? [...workspace.serpReviews.filter(item => item.id !== review.id), review] : workspace.serpReviews,
      serpMergeConflicts: workspace.serpMergeConflicts,
      operationalPublications: workspace.operationalPublications,
      documentLocks: workspace.documentLocks,
      selectedEntityId: workspace.selectedEntityId,
      aiReviewAnnotations: workspace.aiReviewAnnotations,
      savedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(workflowRecoveryStorageKey(actorUserId, brandId), JSON.stringify(recovery));
    return true;
  } catch {
    return false;
  }
}

function saveLocalRadarAnalysisRecovery(actorUserId: string, brandId: string, workspace: BrandWorkspace) {
  if (typeof window === "undefined") return false;
  try {
    const recovery = LocalWorkflowRecoverySchema.parse({
      schemaVersion: 1,
      architectImportedKeywordIds: workspace.architectImportedKeywordIds,
      articleVersions: workspace.articleVersions,
      siloVersions: workspace.siloVersions,
      siloPageVersions: workspace.siloPageVersions,
      versionEvents: workspace.versionEvents,
      contentPlans: workspace.contentPlans,
      documents: workspace.documents,
      radarItems: workspace.radarItems,
      plannerItems: workspace.plannerItems,
      serpRecords: workspace.serpRecords,
      serpReviews: workspace.serpReviews,
      serpMergeConflicts: workspace.serpMergeConflicts,
      operationalPublications: workspace.operationalPublications,
      documentLocks: workspace.documentLocks,
      selectedEntityId: workspace.selectedEntityId,
      aiReviewAnnotations: workspace.aiReviewAnnotations,
      savedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(workflowRecoveryStorageKey(actorUserId, brandId), JSON.stringify(recovery));
    return true;
  } catch {
    return false;
  }
}

interface EditorialPipelineContextValue extends BrandWorkspace {
  snapshot: EditorialSnapshot | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reloadOperational: () => Promise<void>;
  setArticleVersions: React.Dispatch<React.SetStateAction<Record<string, VersionEnvelope<ArticleDNA>>>>;
  setSiloVersions: React.Dispatch<React.SetStateAction<Record<string, VersionEnvelope<SiloDNA>>>>;
  setSiloPageVersions: React.Dispatch<React.SetStateAction<Record<string, VersionEnvelope<SiloPage>>>>;
  addVersionEvents: (events: VersionStatusEvent[]) => void;
  setSelectedEntityId: (id: string | null) => void;
  simulateSerp: (articleId: string, keyword: string, location: string) => Promise<void>;
  collectSerp: (articleId: string, location: string, articleDnaVersionId: string) => Promise<SerpCollectionRecord>;
  saveRadarAnalysis: (articleId: string, analysis: RadarAnalysisVersion) => Promise<{ persistenceMode: "remote" | "local"; readbackConfirmed: boolean }>;
  reloadRadarAnalysis: (articleId: string) => Promise<void>;
  reloadSerpReview: (articleId: string) => Promise<void>;
  reviewSerp: (articleId: string, snapshotId: string, status: "approved" | "rejected", notes: string) => Promise<{ persistenceMode: "remote" | "local"; readbackConfirmed: boolean; review: SerpReviewRecord }>;
  simulateProductEvidence: (articleId: string, query: string, location: string) => Promise<void>;
  simulatePlanAndDocument: () => Promise<void>;
  simulateOperationalSkeleton: (articleId?: string, targetArticleId?: string) => void;
  importApprovedKeywordsToArchitect: (keywordIds: string[]) => { imported: number; allIds: string[] };
  setArchitectImportedKeywordIds: (keywordIds: string[]) => void;
  /**
   * Envia Articles aprovados ao Radar.
   *
   * `handoffContext` é OPCIONAL porque quem não o traz não pode ser punido
   * com descarte silencioso: o contexto é resolvido aqui, pela mesma
   * autoridade que o Arquiteto usa. Quem ainda assim não passa volta em
   * `blocked`, com o motivo legível.
   *
   * `await`: a escrita remota é a autoridade. Estado local que mudou antes
   * do servidor confirmar não é importação, é otimismo.
   */
  importApprovedToRadar: (articleIds: string[], sourceKeywords?: RadarHydrationSourceKeyword[], serpAssessments?: Record<string, SerpFormationAssessment>, handoffContext?: Record<string, RadarArticleHandoffContext>, graphs?: readonly InternalLinkGraph[]) => Promise<{ imported: number; skipped: number; blocked: RadarHandoffBlocked[] }>;
  importApprovedSiloPagesToRadar: (siloPageIds: string[]) => { imported: number; skipped: number };
  updateRadarState: (ids: string[], target: RadarItem["state"]) => void;
  importApprovedToPlanner: (radarIds: string[]) => { imported: number; skipped: number };
  preparePlannerItems: (ids: string[], actorId: string) => Promise<void>;
  savePlannerPlan: (plannerItemId: string, details: ContentPlanDetails, actorId: string) => Promise<{ created: boolean; versionId: string }>;
  approvePlannerItems: (ids: string[], actorId?: string) => void;
  startWriting: (plannerItemId: string) => Promise<{ articleId: string; documentId: string }>;
  importApprovedToPublications: (publicationIds: string[]) => { imported: number; skipped: number };
  createInvitation: (input: Omit<BrandInvitation, "id" | "brandId" | "createdAt" | "delivery" | "tokenId" | "status">) => BrandInvitation;
  addInvitation: (invitation: BrandInvitation) => void;
  updateInvitationStatus: (id: string, status: BrandInvitation["status"]) => void;
  updateDocumentLocal: (document: ContentDocument, lockVersion?: number) => void;
  setModuleState: (module: string, state: BrandWorkspace["moduleState"][string]) => void;
  runBackgroundTask: <TResult>(input: BackgroundTaskInput<TResult>) => string | null;
  consumeBackgroundTask: (id: string) => void;
  dismissBackgroundTask: (id: string) => void;
  addAiReviewAnnotations: (annotations: AIReviewAnnotation[]) => void;
  restoreOperationalSnapshot: (module: EditorialHistoryModule, snapshot: Partial<BrandWorkspace>) => void;
}

const EditorialPipelineContext = createContext<EditorialPipelineContextValue | null>(null);

export function EditorialPipelineProvider({ children }: { children: React.ReactNode }) {
  const { selectedBrandId } = useBrand();
  const { actorUserId, sessionEpoch } = useSupabaseSession();
  const [workspaces, setWorkspaces] = useState<Record<string, BrandWorkspace>>({});
  const [snapshots, setSnapshots] = useState<Record<string, EditorialSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recoveredBrands = useRef(new Set<string>());
  const activeTaskKeys = useRef(new Map<string, string>());
  const radarAnalysisSyncRef = useRef(new Map<string, RadarAnalysisSyncState>());
  const serpReviewSyncRef = useRef(new Map<string, RadarSerpReviewSyncState>());
  const actorKey = actorUserId || "unauthenticated";
  const workspaceKey = selectedBrandId ? `${actorKey}:${selectedBrandId}` : "";
  const workspace = workspaceKey ? workspaces[workspaceKey] || emptyWorkspace() : emptyWorkspace();

  const updateWorkspace = useCallback((updater: (current: BrandWorkspace) => BrandWorkspace) => {
    if (!selectedBrandId || !actorUserId) return;
    setWorkspaces(previous => updateBrandWorkspace(previous, workspaceKey, emptyWorkspace, updater));
  }, [actorUserId, selectedBrandId, workspaceKey]);

  const runBackgroundTask = useCallback(<TResult,>(input: BackgroundTaskInput<TResult>) => {
    if (!selectedBrandId || !actorUserId) return null;
    const brandId = selectedBrandId;
    const actorAtStart = actorUserId;
    const epochAtStart = sessionEpoch;
    const key = `${actorAtStart}:${brandId}:${input.type}`;
    const runningId = activeTaskKeys.current.get(key);
    if (runningId) return runningId;
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    activeTaskKeys.current.set(key, id);
    const updateBrand = (updater: (current: BrandWorkspace) => BrandWorkspace) => {
      if (actorUserId !== actorAtStart || sessionEpoch !== epochAtStart) return;
      setWorkspaces(previous => updateBrandWorkspace(previous, `${actorAtStart}:${brandId}`, emptyWorkspace, updater));
    };
    updateBrand(current => ({ ...current, backgroundTasks: [...current.backgroundTasks, {
      id, brandId, type: input.type, label: input.label, status: "queued", message: "Preparando tarefa...", current: 0, total: 1,
      startedAt, finishedAt: null, consumed: false, error: null,
    }] }));
    void Promise.resolve().then(async () => {
      updateBrand(current => ({ ...current, backgroundTasks: current.backgroundTasks.map(task => task.id === id ? { ...task, status: "running" } : task) }));
      const result = await input.execute(progress => updateBrand(current => ({ ...current, backgroundTasks: current.backgroundTasks.map(task => task.id === id
        ? { ...task, status: "running", message: progress.message, current: progress.current, total: Math.max(1, progress.total) }
        : task) })));
      updateBrand(current => ({ ...current, backgroundTasks: current.backgroundTasks.map(task => task.id === id ? {
        ...task, status: "completed", message: "Tarefa terminada", current: task.total, finishedAt: new Date().toISOString(), result,
      } : task) }));
    }).catch(reason => {
      updateBrand(current => ({ ...current, backgroundTasks: current.backgroundTasks.map(task => task.id === id ? {
        ...task, status: "failed", message: "Tarefa interrompida por erro", finishedAt: new Date().toISOString(),
        error: reason instanceof Error ? reason.message : "Erro desconhecido.",
      } : task) }));
    }).finally(() => activeTaskKeys.current.delete(key));
    return id;
  }, [actorUserId, selectedBrandId, sessionEpoch]);

  const consumeBackgroundTask = useCallback((id: string) => updateWorkspace(current => ({ ...current,
    backgroundTasks: current.backgroundTasks.map(task => task.id === id ? { ...task, consumed: true } : task),
  })), [updateWorkspace]);

  const dismissBackgroundTask = useCallback((id: string) => updateWorkspace(current => ({ ...current,
    backgroundTasks: current.backgroundTasks.filter(task => task.id !== id),
  })), [updateWorkspace]);

  const addAiReviewAnnotations = useCallback((annotations: AIReviewAnnotation[]) => updateWorkspace(current => {
    const byId = new Map((current.aiReviewAnnotations ?? []).map(annotation => [annotation.id, annotation]));
    annotations.forEach(annotation => byId.set(annotation.id, annotation));
    return { ...current, aiReviewAnnotations: [...byId.values()] };
  }), [updateWorkspace]);

  const restoreOperationalSnapshot = useCallback((module: EditorialHistoryModule, snapshot: Partial<BrandWorkspace>) => updateWorkspace(current => {
    if (module === "arquiteto") return { ...current, articleVersions: snapshot.articleVersions ?? current.articleVersions, siloVersions: snapshot.siloVersions ?? current.siloVersions, siloPageVersions: snapshot.siloPageVersions ?? current.siloPageVersions, versionEvents: snapshot.versionEvents ?? current.versionEvents, aiReviewAnnotations: snapshot.aiReviewAnnotations ?? current.aiReviewAnnotations };
    if (module === "radar") return { ...current, radarItems: snapshot.radarItems ?? current.radarItems, serpRecords: snapshot.serpRecords ?? current.serpRecords, serpReviews: snapshot.serpReviews ?? current.serpReviews, serpMergeConflicts: snapshot.serpMergeConflicts ?? current.serpMergeConflicts, productEvidence: snapshot.productEvidence ?? current.productEvidence };
    if (module === "planejador") return { ...current, plannerItems: snapshot.plannerItems ?? current.plannerItems, contentPlans: snapshot.contentPlans ?? current.contentPlans, internalLinks: snapshot.internalLinks ?? current.internalLinks, externalSources: snapshot.externalSources ?? current.externalSources };
    if (module === "redator") return { ...current, documents: snapshot.documents ?? current.documents, guardianFindings: snapshot.guardianFindings ?? current.guardianFindings, operationalPublications: snapshot.operationalPublications ?? current.operationalPublications };
    if (module === "publicacoes") return { ...current, operationalPublications: snapshot.operationalPublications ?? current.operationalPublications };
    return current;
  }), [updateWorkspace]);

  const reloadOperational = useCallback(async (sourceSnapshot?: EditorialSnapshot) => {
    if (!selectedBrandId || !actorUserId) return;
    const actorAtStart = actorUserId;
    const epochAtStart = sessionEpoch;
    try {
      const response = await fetch(`/api/editorial/workspace?marcaId=${encodeURIComponent(selectedBrandId)}`, { cache: "no-store" });
      if (actorUserId !== actorAtStart || sessionEpoch !== epochAtStart) return;
      if (!response.ok) {
        updateWorkspace(current => ({ ...current, persistenceMode: response.status === 503 ? "local_fallback" : "unavailable" }));
        return;
      }
      const body = await response.json(); const persisted = PersistedEditorialWorkspaceSchema.parse(body.data);
      const persistedPlans = persisted.contentPlans.reduce<Record<string, VersionEnvelope<ContentPlan>>>((plans, version) => {
        plans[version.versionId] = version;
        const current = plans[version.entityId];
        if (!current || current.versionNumber < version.versionNumber) plans[version.entityId] = version;
        return plans;
      }, {});
      updateWorkspace(current => {
        const articleVersions = { ...current.articleVersions, ...Object.fromEntries(persisted.articleVersions.map(version => [version.payload.articleId, version])) };
        const siloVersions = { ...current.siloVersions, ...Object.fromEntries(persisted.siloVersions.map(version => [version.payload.siloId, version])) };
        const incomingRadar = persisted.radarItems.length ? mergeRadarItemsPreservingLocalState(persisted.radarItems, current.radarItems) : current.radarItems;
        const radarItems = reconcileRadarItems(incomingRadar, articleVersions, selectedBrandId, sourceSnapshot?.keywords || snapshots[workspaceKey]?.keywords || [], siloVersions);
        const serpMerge = persisted.serpRecords.length ? mergeSerpRecordsPreservingPayload(persisted.serpRecords, current.serpRecords) : { records: current.serpRecords, conflicts: current.serpMergeConflicts };
        return { ...current, persistenceMode: persisted.mode, serpPersistenceMode: persisted.serpPersistenceMode,
        radarItems, plannerItems: persisted.plannerItems.length ? persisted.plannerItems : current.plannerItems,
        serpRecords: serpMerge.records, serpMergeConflicts: serpMerge.conflicts,
        serpReviews: persisted.serpReviews.length ? [...current.serpReviews.filter(review => !persisted.serpReviews.some(incoming => incoming.id === review.id)), ...persisted.serpReviews] : current.serpReviews,
        articleVersions,
        siloVersions,
        versionEvents: mergeVersionEvents(current.versionEvents, persisted.versionEvents),
        contentPlans: { ...current.contentPlans, ...persistedPlans },
        documents: { ...current.documents, ...Object.fromEntries(persisted.documents.map(record => [record.document.id, record.document])) },
        documentLocks: { ...current.documentLocks, ...Object.fromEntries(persisted.documents.map(record => [record.document.id, record.lockVersion])) },
        documentUserStates: { ...current.documentUserStates, ...Object.fromEntries(persisted.documents.filter(record => record.userState).map(record => [record.document.id, record.userState!])) },
         operationalPublications: persisted.publications, invitations: persisted.invitations,
       }; });
    } catch {
      updateWorkspace(current => ({ ...current, persistenceMode: "local_fallback" }));
    }
  }, [actorUserId, selectedBrandId, sessionEpoch, snapshots, updateWorkspace, workspaceKey]);

  const reload = useCallback(async () => {
    if (!selectedBrandId || !actorUserId) return;
    const actorAtStart = actorUserId;
    const epochAtStart = sessionEpoch;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inteligencia?marcaId=${encodeURIComponent(selectedBrandId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Erro ao carregar inteligência editorial.");
      const snapshot = EditorialSnapshotSchema.parse(body.data);
      if (actorUserId !== actorAtStart || sessionEpoch !== epochAtStart) return;
      setSnapshots(previous => ({ ...previous, [workspaceKey]: snapshot })); await reloadOperational(snapshot);
    } catch (reason) {
      if (actorUserId === actorAtStart && sessionEpoch === epochAtStart) setError(reason instanceof Error ? reason.message : "Erro ao carregar inteligência editorial.");
    } finally {
      if (actorUserId === actorAtStart && sessionEpoch === epochAtStart) setLoading(false);
    }
  }, [actorUserId, selectedBrandId, sessionEpoch, reloadOperational, workspaceKey]);

  useEffect(() => {
    if (!selectedBrandId || !actorUserId || recoveredBrands.current.has(workspaceKey)) return;
    try {
      const raw = window.localStorage.getItem(workflowRecoveryStorageKey(actorUserId, selectedBrandId));
      if (!raw) { recoveredBrands.current.add(workspaceKey); return; }
      const parsed = JSON.parse(raw);
      let recovered: LocalWorkflowRecovery;
      try {
        recovered = LocalWorkflowRecoverySchema.parse(parsed);
      } catch (innerError) {
        console.warn("[pipeline] recovery schema parse falhou, tentando extrair campos conhecidos", innerError);
        const partial = parsed as Record<string, unknown>;
        recovered = LocalWorkflowRecoverySchema.parse({
          schemaVersion: 1,
          architectImportedKeywordIds: Array.isArray(partial.architectImportedKeywordIds) ? partial.architectImportedKeywordIds : [],
          articleVersions: partial.articleVersions && typeof partial.articleVersions === "object" ? partial.articleVersions : {},
          siloVersions: partial.siloVersions && typeof partial.siloVersions === "object" ? partial.siloVersions : {},
          siloPageVersions: partial.siloPageVersions && typeof partial.siloPageVersions === "object" ? partial.siloPageVersions : {},
          versionEvents: Array.isArray(partial.versionEvents) ? partial.versionEvents : [],
          serpRecords: Array.isArray(partial.serpRecords) ? partial.serpRecords : [],
          serpReviews: Array.isArray(partial.serpReviews) ? partial.serpReviews : [],
          serpMergeConflicts: Array.isArray(partial.serpMergeConflicts) ? partial.serpMergeConflicts : [],
          contentPlans: partial.contentPlans && typeof partial.contentPlans === "object" ? partial.contentPlans : {},
          documents: partial.documents && typeof partial.documents === "object" ? partial.documents : {},
          radarItems: Array.isArray(partial.radarItems) ? partial.radarItems : [],
          plannerItems: Array.isArray(partial.plannerItems) ? partial.plannerItems : [],
          operationalPublications: Array.isArray(partial.operationalPublications) ? partial.operationalPublications : [],
          documentLocks: partial.documentLocks && typeof partial.documentLocks === "object" ? partial.documentLocks : {},
          selectedEntityId: typeof partial.selectedEntityId === "string" ? partial.selectedEntityId : null,
          aiReviewAnnotations: Array.isArray(partial.aiReviewAnnotations) ? partial.aiReviewAnnotations : [],
          savedAt: typeof partial.savedAt === "string" ? partial.savedAt : new Date(0).toISOString(),
        });
      }
      const timer = window.setTimeout(() => {
        recoveredBrands.current.add(workspaceKey);
        setWorkspaces(previous => updateBrandWorkspace(previous, workspaceKey, emptyWorkspace, current => ({
          ...current,
          architectImportedKeywordIds: recovered.architectImportedKeywordIds,
          articleVersions: recovered.articleVersions,
          siloVersions: recovered.siloVersions,
          siloPageVersions: recovered.siloPageVersions,
          versionEvents: recovered.versionEvents,
          serpRecords: recovered.serpRecords,
          serpReviews: recovered.serpReviews,
          serpMergeConflicts: recovered.serpMergeConflicts,
          contentPlans: recovered.contentPlans,
          documents: recovered.documents,
          radarItems: recovered.radarItems,
          plannerItems: recovered.plannerItems,
          operationalPublications: recovered.operationalPublications,
          documentLocks: recovered.documentLocks,
          selectedEntityId: recovered.selectedEntityId,
          aiReviewAnnotations: recovered.aiReviewAnnotations,
          serpPersistenceMode: "local_fallback",
          persistenceMode: "local_fallback",
        })));
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      // NUNCA apagamos o localStorage. O parse pode falhar por mudanca de schema.
      console.error("[pipeline] recovery parse falhou, mantendo localStorage intacto");
    }
  }, [actorUserId, selectedBrandId, workspaceKey]);

  useEffect(() => {
    if (!selectedBrandId || !actorUserId || !recoveredBrands.current.has(workspaceKey)) return;
    const current = workspaces[workspaceKey];
    if (!current) return;
    try {
      const recovery = LocalWorkflowRecoverySchema.parse({
        schemaVersion: 1,
        architectImportedKeywordIds: current.architectImportedKeywordIds,
        articleVersions: current.articleVersions,
        siloVersions: current.siloVersions,
        siloPageVersions: current.siloPageVersions,
        versionEvents: current.versionEvents,
        serpRecords: current.serpRecords,
        serpReviews: current.serpReviews,
        serpMergeConflicts: current.serpMergeConflicts,
        contentPlans: current.contentPlans,
        documents: current.documents,
        radarItems: current.radarItems,
        plannerItems: current.plannerItems,
        operationalPublications: current.operationalPublications,
        documentLocks: current.documentLocks,
        selectedEntityId: current.selectedEntityId,
        aiReviewAnnotations: current.aiReviewAnnotations,
        savedAt: new Date().toISOString(),
      });
      window.localStorage.setItem(workflowRecoveryStorageKey(actorUserId, selectedBrandId), JSON.stringify(recovery));
    } catch {
      // Recovery is best-effort and must never interrupt an editorial action.
    }
  }, [actorUserId, selectedBrandId, workspaces, workspaceKey]);

  useEffect(() => {
    if (!selectedBrandId || !actorUserId || snapshots[workspaceKey]) return;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [actorUserId, reload, selectedBrandId, snapshots, workspaceKey]);

  const reloadRadarAnalysis = useCallback(async (articleId: string) => {
    if (!selectedBrandId || !actorUserId) return;
    const syncKey = `${selectedBrandId}:${articleId}`;
    const currentItem = workspace.radarItems.find(item => item.articleId === articleId);
    if (!currentItem) return;
    const requestFingerprint = radarAnalysisReadbackFingerprint({ item: currentItem, snapshotId: latestRadarSnapshotFingerprint(workspace, articleId) });
    const readbackStart = beginRadarAnalysisReadback(radarAnalysisSyncRef.current.get(syncKey) || EMPTY_RADAR_ANALYSIS_SYNC_STATE);
    radarAnalysisSyncRef.current.set(syncKey, readbackStart.state);
    const response = await fetch(`/api/editorial/radar-analysis?brandId=${encodeURIComponent(selectedBrandId)}&articleId=${encodeURIComponent(articleId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.readbackConfirmed !== true || body.brandId !== selectedBrandId || body.articleId !== articleId || typeof body.radarItemId !== "string") return;
    const analyses = VersionedRadarAnalysisSchema.array().parse(Array.isArray(body.analyses) ? body.analyses : []);
    if (!analyses.length) return;
    updateWorkspace(current => {
      const local = current.radarItems.find(item => item.articleId === articleId);
      if (!local) return current;
      const currentSync = radarAnalysisSyncRef.current.get(syncKey) || EMPTY_RADAR_ANALYSIS_SYNC_STATE;
      if (!canApplyRadarAnalysisReadback(currentSync, readbackStart.token)) return current;
      if (radarAnalysisReadbackFingerprint({ item: local, snapshotId: latestRadarSnapshotFingerprint(current, articleId) }) !== requestFingerprint) return current;
      const byVersion = new Map([...local.analysisVersions, ...analyses].map(version => [version.versionId, version]));
      return { ...current, persistenceMode: "server", radarItems: current.radarItems.map(item => item.articleId === articleId ? { ...item, id: body.radarItemId, analysisVersions: [...byVersion.values()].sort((left, right) => left.versionNumber - right.versionNumber), lockVersion: typeof body.lockVersion === "number" ? Math.max(item.lockVersion, body.lockVersion) : item.lockVersion } : item) };
    });
  }, [actorUserId, selectedBrandId, updateWorkspace, workspace]);

  const reloadSerpReview = useCallback(async (articleId: string) => {
    if (!selectedBrandId || !actorUserId) return;
    const currentItem = workspace.radarItems.find(item => item.articleId === articleId);
    const currentRecord = latestRadarR5SerpRecord(workspace.serpRecords, articleId);
    if (!currentItem || !currentRecord?.research || currentRecord.origin !== "real") return;
    const syncKey = `${selectedBrandId}:${articleId}`;
    const fingerprint = radarSerpReviewReadbackFingerprint({ item: currentItem, record: currentRecord });
    const readbackStart = beginRadarSerpReviewReadback(serpReviewSyncRef.current.get(syncKey) || EMPTY_RADAR_SERP_REVIEW_SYNC_STATE);
    serpReviewSyncRef.current.set(syncKey, readbackStart.state);
    const applyFallback = () => updateWorkspace(current => {
      const item = current.radarItems.find(candidate => candidate.articleId === articleId);
      const record = latestRadarR5SerpRecord(current.serpRecords, articleId);
      const sync = serpReviewSyncRef.current.get(syncKey) || readbackStart.state;
      if (!item || !record?.research || !canApplyRadarSerpReviewReadback(sync, readbackStart.token)) return current;
      if (radarSerpReviewReadbackFingerprint({ item, record }) !== fingerprint) return current;
      return { ...current, serpPersistenceMode: "local_fallback", serpReviewReadbackSnapshotIds: current.serpReviewReadbackSnapshotIds.filter(snapshotId => snapshotId !== record.id) };
    });
    try {
      const params = new URLSearchParams({ brandId: selectedBrandId, articleId, articleDnaVersionId: currentItem.articleDnaVersionId, snapshotId: currentRecord.id });
      const response = await fetch(`/api/editorial/serp?${params.toString()}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.persistenceMode !== "remote" || body.readbackConfirmed !== true || body.brandId !== selectedBrandId || body.articleId !== articleId || body.articleDnaVersionId !== currentItem.articleDnaVersionId || body.snapshotId !== currentRecord.id) {
        applyFallback();
        return;
      }
      const record = SerpCollectionRecordSchema.parse(body.record);
      const reviews = SerpReviewRecordSchema.array().parse(Array.isArray(body.reviews) ? body.reviews : []);
      if (record.id !== currentRecord.id || record.research?.articleDnaVersionId !== currentItem.articleDnaVersionId || reviews.some(review => review.brandId !== selectedBrandId || review.articleId !== articleId || review.snapshotId !== record.id)) {
        applyFallback();
        return;
      }
      updateWorkspace(current => {
        const item = current.radarItems.find(candidate => candidate.articleId === articleId);
        const visibleRecord = latestRadarR5SerpRecord(current.serpRecords, articleId);
        const sync = serpReviewSyncRef.current.get(syncKey) || readbackStart.state;
        if (!item || !visibleRecord?.research || !canApplyRadarSerpReviewReadback(sync, readbackStart.token)) return current;
        if (radarSerpReviewReadbackFingerprint({ item, record: visibleRecord }) !== fingerprint) return current;
        const merged = mergeSerpRecordsPreservingPayload([record], current.serpRecords);
        return {
          ...current,
          serpRecords: merged.records,
          serpMergeConflicts: merged.conflicts,
          serpReviews: [...current.serpReviews.filter(review => review.snapshotId !== record.id), ...reviews],
          serpPersistenceMode: "server",
          serpReviewReadbackSnapshotIds: [...new Set([...current.serpReviewReadbackSnapshotIds, record.id])],
        };
      });
    } catch {
      applyFallback();
    }
  }, [actorUserId, selectedBrandId, updateWorkspace, workspace]);

  const createSerpResolutionEnvelope = useCallback(async (articleId: string, articleDnaVersionId: string) => {
    if (!selectedBrandId) throw new Error("Selecione uma marca antes de pesquisar a SERP.");
    const article = workspace.articleVersions[articleId];
    const radarItem = workspace.radarItems.find(item => item.articleId === articleId);
    if (!article || !radarItem) throw new Error("O artigo não está disponível no contexto editorial local do Radar.");
    if (!articleDnaVersionId.trim() || radarItem.articleDnaVersionId !== articleDnaVersionId) throw new Error("A versão do ArticleDNA deste item do Radar não está disponível ou não corresponde ao artigo selecionado.");
    return createRadarSerpResolutionEnvelope({
      brandId: selectedBrandId,
      radarItem,
      article,
      articleDnaVersionId,
      hydration: radarItem.hydration,
      sourceKeywords: (snapshots[workspaceKey]?.keywords || []) as RadarHydrationSourceKeyword[],
      silo: article.payload.siloId ? workspace.siloVersions[article.payload.siloId] : undefined,
    });
  }, [selectedBrandId, snapshots, workspace, workspaceKey]);

  const value = useMemo<EditorialPipelineContextValue>(() => ({
    ...workspace, snapshot: snapshots[workspaceKey] || null, loading, error, reload, reloadOperational, reloadRadarAnalysis, reloadSerpReview,
    setArticleVersions: update => updateWorkspace(current => ({ ...current, articleVersions: typeof update === "function" ? update(current.articleVersions) : update })),
    setSiloVersions: update => updateWorkspace(current => ({ ...current, siloVersions: typeof update === "function" ? update(current.siloVersions) : update })),
    setSiloPageVersions: update => updateWorkspace(current => ({ ...current, siloPageVersions: typeof update === "function" ? update(current.siloPageVersions) : update })),
    addVersionEvents: events => updateWorkspace(current => ({ ...current, versionEvents: mergeVersionEvents(current.versionEvents, events) })),
    setSelectedEntityId: id => updateWorkspace(current => ({ ...current, selectedEntityId: id })),
    simulateSerp: async (articleId, keyword, location) => {
      const record = await mockSerpProvider.collectSnapshot({ articleId, keyword, location: location || "Brasil", language: "pt-BR", device: "desktop" });
      updateWorkspace(current => ({ ...current, serpRecords: [...current.serpRecords.filter(item => item.id !== record.id), record] }));
    },
    collectSerp: async (articleId, location, articleDnaVersionId) => {
      if (!selectedBrandId) throw new Error("Selecione uma marca antes de pesquisar a SERP.");
      const articleVersion = workspace.articleVersions[articleId];
      const resolutionEnvelope = await createSerpResolutionEnvelope(articleId, articleDnaVersionId);
      const response = await fetch("/api/editorial/serp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildRadarSerpCollectPayload({ brandId: selectedBrandId, articleId, articleDnaVersionId, location: location || "Brasil", language: "pt-BR", device: "desktop", articleVersion, resolutionEnvelope })) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        /*
         * O CÓDIGO viaja junto com a mensagem.
         *
         * Sem ele o Radar classificava um vínculo quebrado de Silo como falha
         * transitória e oferecia "tentar novamente" para algo que nenhuma
         * repetição resolve.
         */
        const failure = Object.assign(new Error(body.error || "Não foi possível coletar a SERP."), {
          code: typeof body.code === "string" && body.code.trim() ? body.code : `http_${response.status}`,
          status: response.status,
        });
        throw failure;
      }
      const record = SerpCollectionRecordSchema.parse(body.record);
      if (!actorUserId || !saveLocalSerpRecovery(actorUserId, selectedBrandId, workspace, record)) throw new Error("A coleta real foi concluída, mas a recuperação local não pôde ser salva.");
      updateWorkspace(current => ({ ...current, serpRecords: [...current.serpRecords.filter(item => item.id !== record.id), record], serpPersistenceMode: body.persistenceMode === "remote" ? "server" : "local_fallback" }));
      return record;
    },
    saveRadarAnalysis: async (articleId, analysis) => {
      if (!selectedBrandId) throw new Error("Selecione uma marca antes de salvar a análise Radar.");
      const parsed = VersionedRadarAnalysisSchema.parse(analysis);
      if (parsed.payload.brandId !== selectedBrandId || parsed.payload.articleId !== articleId) throw new Error("A análise não corresponde ao artigo selecionado.");
      const currentItem = workspace.radarItems.find(item => item.articleId === articleId);
      if (!currentItem) throw new Error("Item Radar não encontrado.");
      const nextItem = { ...currentItem, analysisVersions: currentItem.analysisVersions.some(version => version.versionId === parsed.versionId) ? currentItem.analysisVersions : [...currentItem.analysisVersions, parsed], updatedAt: new Date().toISOString() };
      const nextWorkspace = { ...workspace, radarItems: workspace.radarItems.map(item => item.articleId === articleId ? nextItem : item) };
      const syncKey = `${selectedBrandId}:${articleId}`;
      const writeState = beginRadarAnalysisWrite(radarAnalysisSyncRef.current.get(syncKey) || EMPTY_RADAR_ANALYSIS_SYNC_STATE);
      radarAnalysisSyncRef.current.set(syncKey, writeState);
      try {
        try {
        const response = await fetch("/api/editorial/radar-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", brandId: selectedBrandId, articleId, expectedLock: currentItem.lockVersion, analysis: parsed }) });
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
          const readbackResponse = await fetch(`/api/editorial/radar-analysis?brandId=${encodeURIComponent(selectedBrandId)}&articleId=${encodeURIComponent(articleId)}&versionId=${encodeURIComponent(parsed.versionId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
          const readbackBody = await readbackResponse.json().catch(() => ({}));
          if (!readbackResponse.ok) throw new Error(`A análise foi gravada, mas o readback remoto não pôde ser confirmado (${readbackResponse.status}${typeof readbackBody.error === "string" ? `: ${readbackBody.error}` : ""}).`);
          if (readbackBody.persistenceMode !== "remote" || readbackBody.readbackConfirmed !== true || readbackBody.brandId !== selectedBrandId || readbackBody.articleId !== articleId || typeof readbackBody.radarItemId !== "string" || (typeof body.workflowRowId === "string" ? readbackBody.radarItemId !== body.workflowRowId : readbackBody.radarItemId !== currentItem.id)) throw new Error("A análise foi gravada, mas o readback remoto não corresponde à linha Radar selecionada.");
          const persistedAnalysis = VersionedRadarAnalysisSchema.parse(readbackBody.analysis);
          if (persistedAnalysis.versionId !== parsed.versionId || persistedAnalysis.payload.brandId !== parsed.payload.brandId || persistedAnalysis.payload.articleId !== parsed.payload.articleId || persistedAnalysis.payload.articleDnaVersionId !== parsed.payload.articleDnaVersionId || persistedAnalysis.payload.serpSnapshotId !== parsed.payload.serpSnapshotId || persistedAnalysis.payload.serpSnapshotVersion !== parsed.payload.serpSnapshotVersion || persistedAnalysis.payload.serpSnapshotHash !== parsed.payload.serpSnapshotHash || JSON.stringify(persistedAnalysis.payload.serpDecisions) !== JSON.stringify(parsed.payload.serpDecisions) || JSON.stringify(persistedAnalysis.payload.selectedCompetitorIds) !== JSON.stringify(parsed.payload.selectedCompetitorIds)) {
            throw new Error("A análise foi gravada, mas o readback remoto não corresponde ao snapshot selecionado.");
          }
          updateWorkspace(current => ({ ...current, radarItems: current.radarItems.map(item => item.articleId === articleId ? { ...item, id: readbackBody.radarItemId, analysisVersions: [...new Map([...item.analysisVersions, persistedAnalysis].map(version => [version.versionId, version])).values()].sort((left, right) => left.versionNumber - right.versionNumber), lockVersion: typeof readbackBody.lockVersion === "number" ? Math.max(item.lockVersion, readbackBody.lockVersion) : item.lockVersion } : item), persistenceMode: "server" }));
          return { persistenceMode: "remote" as const, readbackConfirmed: true };
        }
        if (response.status !== 503) {
          const details = Array.isArray(body.details)
            ? body.details
              .map((detail: { path?: unknown; message?: unknown }) => {
                const path = Array.isArray(detail.path) ? detail.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number").join(".") : "";
                return [path, typeof detail.message === "string" ? detail.message : ""].filter(Boolean).join(": ");
              })
              .filter(Boolean)
              .join(" ")
            : "";
          throw new Error([body.error || "Não foi possível persistir a análise Radar.", details].filter(Boolean).join(" "));
        }
      } catch (error) {
        if (error instanceof Error && !/fetch|Failed|Network|503/i.test(error.message)) throw error;
      }
      if (!actorUserId || !saveLocalRadarAnalysisRecovery(actorUserId, selectedBrandId, nextWorkspace)) {
        throw new Error("A análise foi aplicada localmente, mas a recuperação do navegador não pôde ser salva.");
      }
      updateWorkspace(current => ({ ...current, radarItems: current.radarItems.map(item => item.articleId === articleId ? nextItem : item), persistenceMode: "local_fallback" }));
      return { persistenceMode: "local" as const, readbackConfirmed: false };
      } finally {
        const currentSync = radarAnalysisSyncRef.current.get(syncKey) || writeState;
        radarAnalysisSyncRef.current.set(syncKey, finishRadarAnalysisWrite(currentSync));
      }
    },
    reviewSerp: async (articleId, snapshotId, status, notes) => {
      if (!selectedBrandId) throw new Error("Selecione uma marca antes de revisar a SERP.");
      const currentRecord = workspace.serpRecords.find(record => record.id === snapshotId);
      const articleVersion = workspace.articleVersions[articleId];
      const radarItem = workspace.radarItems.find(item => item.articleId === articleId);
      if (!radarItem) throw new Error("Item Radar não encontrado para a revisão da SERP.");
      const syncKey = `${selectedBrandId}:${articleId}`;
      const writeState = beginRadarSerpReviewWrite(serpReviewSyncRef.current.get(syncKey) || EMPTY_RADAR_SERP_REVIEW_SYNC_STATE);
      serpReviewSyncRef.current.set(syncKey, writeState);
      try {
        const resolutionEnvelope = await createSerpResolutionEnvelope(articleId, radarItem.articleDnaVersionId);
        const response = await fetch("/api/editorial/serp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review", brandId: selectedBrandId, articleId, articleDnaVersionId: radarItem.articleDnaVersionId, snapshotId, status, notes, record: currentRecord, articleVersion, resolutionEnvelope }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Não foi possível registrar a revisão da SERP.");
        const review = SerpReviewRecordSchema.parse(body.review);
        if (body.persistenceMode === "remote" && body.readbackConfirmed !== true) throw new Error("A revisão foi gravada, mas o readback remoto não pôde ser confirmado.");
        if (body.persistenceMode === "remote") {
          updateWorkspace(current => ({ ...current, serpReviews: [...current.serpReviews.filter(item => item.snapshotId !== review.snapshotId), review], serpPersistenceMode: "server", serpReviewReadbackSnapshotIds: [...new Set([...current.serpReviewReadbackSnapshotIds, review.snapshotId])] }));
          return { persistenceMode: "remote" as const, readbackConfirmed: true, review };
        }
        if (!actorUserId || !saveLocalSerpRecovery(actorUserId, selectedBrandId, workspace, null, review)) throw new Error("A revisão foi aplicada localmente, mas a recuperação do navegador não pôde ser salva.");
        updateWorkspace(current => ({ ...current, serpReviews: [...current.serpReviews.filter(item => item.snapshotId !== review.snapshotId), review], serpPersistenceMode: "local_fallback", serpReviewReadbackSnapshotIds: current.serpReviewReadbackSnapshotIds.filter(currentSnapshotId => currentSnapshotId !== review.snapshotId) }));
        return { persistenceMode: "local" as const, readbackConfirmed: false, review };
      } finally {
        const currentSync = serpReviewSyncRef.current.get(syncKey) || writeState;
        serpReviewSyncRef.current.set(syncKey, finishRadarSerpReviewWrite(currentSync));
      }
    },
    simulateProductEvidence: async (articleId, query, location) => {
      const evidence = await mockProductEvidenceProvider.collect({ articleId, productQuery: query, marketplace: "marketplace-simulado", location: location || "Brasil" });
      updateWorkspace(current => ({ ...current, productEvidence: [...current.productEvidence.filter(item => item.evidenceId !== evidence.evidenceId), evidence] }));
    },
    simulatePlanAndDocument: async () => {
      if (!selectedBrandId) return;
      const bundle = await createMockPlanAndDocument(selectedBrandId);
      updateWorkspace(current => ({ ...current, contentPlans: { ...current.contentPlans, [bundle.plan.entityId]: bundle.plan },
        documents: { ...current.documents, [bundle.document.id]: bundle.document } }));
    },
    simulateOperationalSkeleton: (articleId, targetArticleId) => {
      if (!selectedBrandId) return;
      const bundle = createMockOperationalBundle(selectedBrandId, articleId, targetArticleId);
      updateWorkspace(current => ({ ...current, internalLinks: [bundle.internalLink], externalSources: [bundle.externalSource],
        guardianFindings: [bundle.finding], publications: [bundle.publication] }));
    },
    importApprovedKeywordsToArchitect: keywordIds => {
      const allIds = [...new Set([...workspace.architectImportedKeywordIds, ...keywordIds])];
      const imported = allIds.length - workspace.architectImportedKeywordIds.length;
      updateWorkspace(current => ({ ...current, architectImportedKeywordIds: [...new Set([...current.architectImportedKeywordIds, ...keywordIds])] }));
      return { imported, allIds };
    },
    setArchitectImportedKeywordIds: keywordIds => updateWorkspace(current => ({ ...current, architectImportedKeywordIds: [...new Set(keywordIds)] })),
    importApprovedToRadar: async (articleIds, sourceKeywords = [], serpAssessments = {}, handoffContext = {}, graphs = []) => {
      const candidates = approvedArticleVersions(workspace.articleVersions, workspace.versionEvents).filter(version => articleIds.includes(version.payload.articleId));
      const hydrationKeywords = sourceKeywords.length ? sourceKeywords : snapshots[workspaceKey]?.keywords || [];

      /*
       * Contexto que não veio pronto é RESOLVIDO aqui — não descartado.
       *
       * A tela Radar chamava sem contexto, o `siloIdOf` caía em
       * `payload.siloId` (null por desenho) e os oito artigos sumiam como
       * "ignorados". Resolver no mesmo builder do Arquiteto encerra a
       * divergência entre as duas telas.
       */
      const semContexto = candidates.filter(version => !handoffContext[version.payload.articleId]);
      const resolvido = semContexto.length
        ? buildRadarHandoffContexts({
          articles: semContexto,
          siloVersions: Object.values(workspace.siloVersions),
          siloPageVersions: Object.values(workspace.siloPageVersions),
          graphs,
        })
        : { eligible: [], blocked: [] as RadarHandoffBlocked[] };
      const contexto: Record<string, RadarArticleHandoffContext> = { ...handoffContext };
      for (const entry of resolvido.eligible) {
        contexto[entry.articleId] = { silo: entry.silo, internalLinks: entry.internalLinks, serpProvenance: null };
      }

      const hydrationByArticleId: Record<string, RadarHydrationSnapshot> = {};
      for (const version of candidates) {
        const doArtigo = contexto[version.payload.articleId] || null;
        const hydration = createRadarHydrationSnapshot({ brandId: selectedBrandId, article: version, sourceKeywords: hydrationKeywords, resolvedSilo: doArtigo?.silo ?? null, silo: version.payload.siloId ? workspace.siloVersions[version.payload.siloId] : undefined, source: "arquiteto_import" });
        if (hydration) hydrationByArticleId[version.payload.articleId] = hydration;
      }
      const before = workspace.radarItems.length; const next = importArticlesToRadar(workspace.radarItems, candidates, selectedBrandId, undefined, hydrationKeywords, workspace.siloVersions, hydrationByArticleId, serpAssessments, contexto);

      /*
       * A escrita remota decide. Só depois dela o estado local muda.
       *
       * O disparo solto marcava a importação como bem-sucedida no instante do
       * clique: uma falha do servidor deixava a tela dizendo que os artigos
       * foram enviados enquanto nenhum tinha sido.
       */
      const escrita = await sendWorkflowCommand({ action: "import_radar", brandId: selectedBrandId, articleVersions: candidates, versionEvents: workspace.versionEvents.filter(event => candidates.some(version => version.versionId === event.versionId)), hydrationByArticleId, handoffContext: contexto }, updateWorkspace);
      /*
       * Servidor recusou: NADA de estado local.
       *
       * Gravar aqui produzia a importação fantasma — visível nesta aba,
       * sobrevivendo ao F5 pela recuperação local e inexistente para todo
       * mundo. Cada artigo volta nomeado, com o motivo que o servidor deu.
       */
      if (!escrita.ok) {
        return {
          imported: 0,
          skipped: 0,
          blocked: [
            ...resolvido.blocked,
            ...candidates.map(version => ({
              articleId: version.payload.articleId,
              label: version.payload.promise || version.payload.articleId,
              reasons: [escrita.message],
            })),
          ],
        };
      }
      updateWorkspace(current => ({ ...current, radarItems: next }));

      const importados = next.length - before;
      return { imported: importados, skipped: candidates.length - importados - resolvido.blocked.length, blocked: resolvido.blocked };
    },
    importApprovedSiloPagesToRadar: siloPageIds => {
      const candidates = approvedSiloPageVersions(workspace.siloPageVersions, workspace.versionEvents).filter(version => siloPageIds.includes(version.payload.siloPageId));
      const before = workspace.radarItems.length; const next = importSiloPagesToRadar(workspace.radarItems, candidates, selectedBrandId);
      updateWorkspace(current => ({ ...current, radarItems: next }));
      return { imported: next.length - before, skipped: siloPageIds.length - (next.length - before) };
    },
    updateRadarState: (ids, target) => { const expectedLocks = Object.fromEntries(workspace.radarItems.filter(item => ids.includes(item.id)).map(item => [item.id, item.lockVersion]));
      updateWorkspace(current => ({ ...current, radarItems: setRadarState(current.radarItems, ids, target) }));
      void sendWorkflowCommand({ action: "transition_radar", brandId: selectedBrandId, itemIds: ids, target, expectedLocks }, updateWorkspace); },
    importApprovedToPlanner: radarIds => {
      const candidates = workspace.radarItems.filter(item => radarIds.includes(item.id)); const before = workspace.plannerItems.length;
      const next = importRadarToPlanner(workspace.plannerItems, candidates, selectedBrandId); const importedArticleIds = new Set(next.slice(before).map(item => item.articleId));
      updateWorkspace(current => ({ ...current, plannerItems: next,
        radarItems: current.radarItems.map(item => importedArticleIds.has(item.articleId) ? { ...item, state: "sent_planner" as const, updatedAt: new Date().toISOString() } : item) }));
      void sendWorkflowCommand({ action: "import_planner", brandId: selectedBrandId, radarItemIds: candidates.map(item => item.id), expectedLocks: Object.fromEntries(candidates.map(item => [item.id, item.lockVersion])) }, updateWorkspace);
      return { imported: next.length - before, skipped: radarIds.length - (next.length - before) };
    },
    preparePlannerItems: async (ids, actorId) => {
      const prepared: Array<{ itemId: string; plan: VersionEnvelope<ContentPlan> }> = [];
      for (const item of workspace.plannerItems.filter(candidate => ids.includes(candidate.id))) {
        const article = workspace.articleVersions[item.articleId]; if (!article) continue;
        const existing = workspace.contentPlans[`plan:${item.articleId}`];
        const radar = workspace.radarItems.find(candidate => candidate.id === item.radarItemId || candidate.articleId === item.articleId);
        const approvedAnalysis = radar?.analysisVersions.filter(version => version.payload.status === "approved").sort((a, b) => b.versionNumber - a.versionNumber).at(0);
        const approvedSerp = workspace.serpRecords.find(record => record.input.articleId === item.articleId && record.origin === "real" && record.research && workspace.serpReviews.some(review => review.snapshotId === record.id && review.status === "approved"));
        const serpEvidenceRefs = approvedSerp?.research ? [{ artifactId: approvedSerp.id, artifactType: "serp_snapshot" as const, contentHash: approvedSerp.research.contentHash }] : [];
        const rawPackageData = approvedAnalysis?.payload.plannerPackage;
        const packageData = radarPlannerPackageToContentPlanInput(item.radarHandoff || rawPackageData || null);
        const radarAnalysisPackage = approvedAnalysis && packageData ? { analysisVersionId: approvedAnalysis.versionId, packageHash: approvedAnalysis.contentHash, ...packageData } : undefined;
        const plan = existing || await createOperationalPlan(item, article, item.siloId ? workspace.siloVersions[item.siloId] : undefined, actorId, serpEvidenceRefs, radarAnalysisPackage);
        prepared.push({ itemId: item.id, plan: plan as VersionEnvelope<ContentPlan> });
      }
      updateWorkspace(current => ({ ...current,
        contentPlans: { ...current.contentPlans, ...Object.fromEntries(prepared.map(entry => [entry.plan.entityId, entry.plan])) },
        plannerItems: current.plannerItems.map(item => { const entry = prepared.find(candidate => candidate.itemId === item.id); return entry ? { ...item, contentPlanVersionId: entry.plan.versionId, state: "awaiting_review" as const, updatedAt: new Date().toISOString() } : item; }),
      }));
      for (const entry of prepared) { const item = workspace.plannerItems.find(candidate => candidate.id === entry.itemId); if (item) void sendWorkflowCommand({ action: "prepare_plan", brandId: selectedBrandId, plannerItemId: item.id, expectedLock: item.lockVersion, plan: entry.plan }, updateWorkspace); }
    },
    savePlannerPlan: async (plannerItemId, details, actorId) => {
      if (!selectedBrandId) throw new Error("Selecione uma marca antes de salvar o plano.");
      const item = workspace.plannerItems.find(candidate => candidate.id === plannerItemId);
      if (!item?.contentPlanVersionId) throw new Error("Prepare o plano editorial antes de editá-lo.");
      const current = workspace.contentPlans[item.contentPlanVersionId] || Object.values(workspace.contentPlans).find(plan => plan.entityId === `plan:${item.articleId}`);
      if (!current) throw new Error("Versão ativa do plano editorial não encontrada.");
      if (current.payload.planning && !hasMaterialPlanChange(current.payload.planning, details)) return { created: false, versionId: current.versionId };
      const legacyBriefing = snapshots[workspaceKey]?.briefings.find(candidate => candidate.id === item.articleId) || null;
      const operationalPublication = workspace.operationalPublications.find(candidate => candidate.articleId === item.articleId) || null;
      const publicationIdentity = resolvePlannerPublicationIdentity({ brandId: selectedBrandId, brandName: snapshots[workspaceKey]?.brand.nome, articleId: item.articleId, article: workspace.articleVersions[item.articleId]?.payload || null, operational: operationalPublication, legacyBriefing });
      const articleIdentityIssues = workspace.articleVersions[item.articleId]?.payload ? publishedIdentityReferenceIssues(workspace.articleVersions[item.articleId].payload, publicationIdentity) : [];
      if (articleIdentityIssues.length) throw new Error(articleIdentityIssues.join(" "));
      const successor = await createContentPlanSuccessor(current, details, actorId, undefined, { publicationIdentity });
      updateWorkspace(state => ({ ...state,
        contentPlans: { ...state.contentPlans, [successor.versionId]: successor, [successor.entityId]: successor },
        plannerItems: state.plannerItems.map(candidate => candidate.id === item.id ? { ...candidate, contentPlanVersionId: successor.versionId, state: "awaiting_review" as const, updatedAt: new Date().toISOString(), lockVersion: candidate.lockVersion + 1 } : candidate),
      }));
      void sendWorkflowCommand({ action: "prepare_plan", brandId: selectedBrandId, plannerItemId: item.id, expectedLock: item.lockVersion, plan: successor }, updateWorkspace);
      return { created: true, versionId: successor.versionId };
    },
    approvePlannerItems: (ids, actorId = "human") => { const eligible = workspace.plannerItems.filter(item => ids.includes(item.id) && item.state === "awaiting_review" && item.contentPlanVersionId);
      const approvable = eligible.filter(item => { const plan = workspace.contentPlans[item.contentPlanVersionId!]; if (!plan) return false; const legacyBriefing = snapshots[workspaceKey]?.briefings.find(candidate => candidate.id === item.articleId) || null; const operationalPublication = workspace.operationalPublications.find(candidate => candidate.articleId === item.articleId) || null; const publicationIdentity = resolvePlannerPublicationIdentity({ brandId: selectedBrandId, brandName: snapshots[workspaceKey]?.brand.nome, articleId: item.articleId, article: workspace.articleVersions[item.articleId]?.payload || null, operational: operationalPublication, legacyBriefing }); const articleIdentityIssues = workspace.articleVersions[item.articleId] ? publishedIdentityReferenceIssues(workspace.articleVersions[item.articleId].payload, publicationIdentity) : []; return contentPlanApprovalIssues(plan, selectedBrandId).length === 0 && publicationIdentity.state !== "conflict" && publicationSourceIssues(plan.payload.planning!, publicationIdentity).length === 0 && articleIdentityIssues.length === 0; });
      const events = approvable.flatMap(item => { const plan = workspace.contentPlans[item.contentPlanVersionId!]; return plan ? [createStatusEvent(plan.versionId, "approved", actorId, "ContentPlan aprovado no Planejador.")] : []; });
      updateWorkspace(current => ({ ...current, versionEvents: mergeVersionEvents(current.versionEvents, events), plannerItems: current.plannerItems.map(item => approvable.some(candidate => candidate.id === item.id) ? { ...item, state: "approved" as const, updatedAt: new Date().toISOString(), lockVersion: item.lockVersion + 1 } : item) }));
      void sendWorkflowCommand({ action: "approve_plan", brandId: selectedBrandId, plannerItemIds: approvable.map(item => item.id), expectedLocks: Object.fromEntries(approvable.map(item => [item.id, item.lockVersion])), versionEvents: events }, updateWorkspace); },
    startWriting: async plannerItemId => {
      const item = workspace.plannerItems.find(candidate => candidate.id === plannerItemId);
      if (!item || (item.state !== "approved" && item.state !== "sent_writer")) throw new Error("Apenas planos editoriais aprovados podem seguir para o Redator.");
      const article = workspace.articleVersions[item.articleId]; if (!article) throw new Error("Definição do artigo não encontrada.");
      const plan = Object.values(workspace.contentPlans).find(candidate => candidate.versionId === item.contentPlanVersionId);
      if (!plan) throw new Error("Plano editorial aprovado não encontrado.");
      const document = Object.values(workspace.documents).find(candidate => candidate.articleDnaRef.entityId === article.entityId) || createOperationalDocument(plan, article, item);
      const publication = workspace.operationalPublications.find(candidate => candidate.articleId === item.articleId) || createPublicationDraft(item, plan, document, article);
      updateWorkspace(current => ({ ...current, documents: { ...current.documents, [document.id]: document },
        operationalPublications: current.operationalPublications.some(candidate => candidate.articleId === item.articleId) ? current.operationalPublications : [...current.operationalPublications, publication],
        plannerItems: current.plannerItems.map(candidate => candidate.id === item.id ? { ...candidate, state: "sent_writer" as const, updatedAt: new Date().toISOString() } : candidate), selectedEntityId: item.articleId }));
      void sendWorkflowCommand({ action: "start_writing", brandId: selectedBrandId, plannerItemId: item.id, expectedLock: item.lockVersion, articleVersion: article, plan, document, publication }, updateWorkspace);
      return { articleId: item.articleId, documentId: document.id };
    },
    importApprovedToPublications: publicationIds => {
      const eligible = workspace.operationalPublications.filter(item => publicationIds.includes(item.id) && item.state === "approved");
      const next = importApprovedWriterItems(workspace.operationalPublications, eligible.map(item => item.id));
      updateWorkspace(current => ({ ...current, operationalPublications: importApprovedWriterItems(current.operationalPublications, eligible.map(item => item.id)) }));
      void sendWorkflowCommand({ action: "import_publications", brandId: selectedBrandId, publicationIds: eligible.map(item => item.articleId), expectedLocks: Object.fromEntries(eligible.map(item => [item.articleId, item.lockVersion])) }, updateWorkspace);
      return { imported: next.filter(item => eligible.some(candidate => candidate.id === item.id) && item.state === "ready_to_export").length, skipped: publicationIds.length - eligible.length };
    },
    createInvitation: input => {
      if (!selectedBrandId) throw new Error("Selecione uma marca.");
      const invitation = createDevelopmentInvitation({ ...input, brandId: selectedBrandId });
      updateWorkspace(current => ({ ...current, invitations: [...current.invitations, invitation] })); return invitation;
    },
    addInvitation: invitation => updateWorkspace(current => current.invitations.some(item => item.id === invitation.id) ? current : ({ ...current, invitations: [...current.invitations, invitation] })),
    updateInvitationStatus: (id, status) => updateWorkspace(current => ({ ...current, invitations: current.invitations.map(invitation => invitation.id === id ? { ...invitation, status } : invitation) })),
    updateDocumentLocal: (document, lockVersion) => updateWorkspace(current => {
      const publicationState = document.status === "em_revisao" ? "awaiting_review" : document.status === "aprovado" ? "approved" : document.status === "escrevendo" ? "writing" : "draft";
      return { ...current, documents: { ...current.documents, [document.id]: document },
        operationalPublications: current.operationalPublications.map(item => item.documentId === document.id && item.state !== "published" ? { ...item, state: publicationState, updatedAt: new Date().toISOString() } : item),
        documentLocks: lockVersion ? { ...current.documentLocks, [document.id]: lockVersion } : current.documentLocks };
    }),
    setModuleState: (module, state) => updateWorkspace(current => ({ ...current, moduleState: { ...current.moduleState, [module]: { ...current.moduleState[module], ...state } } })),
    runBackgroundTask,
    consumeBackgroundTask,
    dismissBackgroundTask,
    addAiReviewAnnotations,
    restoreOperationalSnapshot,
  }), [actorUserId, workspaceKey, workspace, snapshots, selectedBrandId, loading, error, reload, reloadOperational, reloadRadarAnalysis, reloadSerpReview, updateWorkspace, runBackgroundTask, consumeBackgroundTask, dismissBackgroundTask, addAiReviewAnnotations, restoreOperationalSnapshot, createSerpResolutionEnvelope]);

  return <EditorialPipelineContext.Provider value={value}>{children}</EditorialPipelineContext.Provider>;
}

/**
 * O DESFECHO DA ESCRITA REMOTA — devolvido, nunca engolido.
 *
 * Esta função capturava a falha, marcava `persistenceMode` e retornava
 * normalmente. Quem a chamava com `await` seguia em frente e reportava
 * sucesso: a tela dizia "1 item enviado", o estado local guardava o item e
 * nada tinha chegado ao banco. O item sobrevivia ao F5 pela recuperação
 * local e sumia em qualquer outro navegador — inclusive para outra pessoa
 * na mesma Brand, porque a leitura remota é por marca, não por usuário.
 *
 * Marcar o modo de persistência continua certo. O que faltava era contar o
 * fracasso a quem decide se a operação aconteceu.
 */
export type WorkflowCommandOutcome =
  | { ok: true }
  | { ok: false; code: string; message: string };

async function sendWorkflowCommand(
  command: WorkflowCommand,
  update: (updater: (current: BrandWorkspace) => BrandWorkspace) => void,
): Promise<WorkflowCommandOutcome> {
  try {
    const response = await fetch("/api/editorial/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => null) as { code?: unknown; error?: unknown } | null;
    const code = typeof body?.code === "string" && body.code.trim() ? body.code : `http_${response.status}`;
    /*
     * SO degrada o modo de persistencia quando a falha E de persistencia.
     *
     * Um 4xx e contrato malformado do nosso lado — o servidor esta de pe e a
     * leitura continua boa. Marcar `unavailable` fazia a planilha dizer "nao
     * conclua que a marca esta vazia" enquanto o GET respondia normalmente.
     * A recusa ja volta ao chamador; nao precisa mentir sobre o caminho de
     * leitura tambem.
     */
    if (response.status >= 500 || code === "persistence_unavailable") {
      update(current => ({ ...current, persistenceMode: code === "persistence_unavailable" ? "local_fallback" : "unavailable" }));
    }
    return {
      ok: false,
      code,
      message: typeof body?.error === "string" && body.error.trim() ? body.error : "A escrita remota não foi confirmada pelo servidor.",
    };
  } catch (error) {
    update(current => ({ ...current, persistenceMode: "local_fallback" }));
    return {
      ok: false,
      code: "network",
      message: error instanceof Error ? error.message : "A escrita remota falhou antes de chegar ao servidor.",
    };
  }
}

export function useEditorialPipeline() {
  const value = useContext(EditorialPipelineContext);
  if (!value) throw new Error("useEditorialPipeline deve ser usado dentro de EditorialPipelineProvider.");
  return value;
}
