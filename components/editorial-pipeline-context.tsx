"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ArticleDNA, ContentDocument, ContentPlan, ContentPlanDetails, ProductEvidenceDNA, SiloDNA, SiloPage, VersionEnvelope, VersionStatusEvent } from "@/lib/arquiteto/contracts";
import { EditorialSnapshotSchema, SerpCollectionRecordSchema, SerpReviewRecordSchema, type EditorialSnapshot, type SerpCollectionRecord, type SerpReviewRecord } from "@/lib/editorial/contracts";
import { createMockPlanAndDocument, mockProductEvidenceProvider, mockSerpProvider } from "@/lib/editorial/providers";
import { createMockOperationalBundle } from "@/lib/editorial/providers";
import type { AIReviewAnnotation, BrandMaterial, BrandPrompt, BrandSkill, ExternalSourceSuggestion, GuardianFinding, InternalLinkAssignment, PublicationRecord } from "@/lib/editorial/operational-contracts";
import type { BrandInvitation, OperationalPublication, PlannerItem, RadarItem } from "@/lib/editorial/operational-flow";
import { approvedArticleVersions, approvedSiloPageVersions, createDevelopmentInvitation, createOperationalDocument, createOperationalPlan, createPublicationDraft,
  contentPlanApprovalIssues, importApprovedWriterItems, importArticlesToRadar, importRadarToPlanner, importSiloPagesToRadar, mergeVersionEvents, setRadarState } from "@/lib/editorial/operational-flow";
import { createContentPlanSuccessor } from "@/lib/planejador/content-plan";
import { publicationSourceIssues, publishedIdentityReferenceIssues, resolvePlannerPublicationIdentity } from "@/lib/planejador/publication-identity";
import { hasMaterialPlanChange } from "@/lib/planejador/outline";
import { createStatusEvent } from "@/lib/arquiteto/versioning";
import { useBrand } from "./brand-context";
import { updateBrandWorkspace } from "@/lib/editorial/workspace";
import { LocalWorkflowRecoverySchema, PersistedEditorialWorkspaceSchema, workflowRecoveryStorageKey, type PersistenceMode, type WorkflowCommand, type LocalWorkflowRecovery } from "@/lib/editorial/persistence-contracts";
import { createRadarHydrationSnapshot, reconcileRadarItems, type RadarHydrationSnapshot, type RadarHydrationSourceKeyword } from "@/lib/radar/hydration";
import type { SerpFormationAssessment } from "@/lib/arquiteto/serp-formation";
import { createRadarSerpResolutionEnvelope } from "@/lib/radar/resolution-envelope";
import type { BackgroundTaskInput, EditorialBackgroundTask } from "@/lib/editorial/background-tasks";
import type { EditorialHistoryModule } from "@/lib/editorial/history";
import { VersionedRadarAnalysisSchema, type RadarAnalysisVersion } from "@/lib/radar/analysis-contracts";
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

const emptyWorkspace = (): BrandWorkspace => ({ architectImportedKeywordIds: [], articleVersions: {}, siloVersions: {}, siloPageVersions: {}, versionEvents: [], serpRecords: [], serpReviews: [], serpMergeConflicts: [], serpPersistenceMode: "local_fallback",
  productEvidence: [], contentPlans: {}, documents: {}, selectedEntityId: null, skills: [], prompts: [], materials: [],
  internalLinks: [], externalSources: [], guardianFindings: [], publications: [], radarItems: [], plannerItems: [],
  operationalPublications: [], invitations: [], persistenceMode: "local_fallback", documentLocks: {}, documentUserStates: {}, moduleState: {}, backgroundTasks: [], aiReviewAnnotations: [] });

function saveLocalSerpRecovery(brandId: string, workspace: BrandWorkspace, record: SerpCollectionRecord) {
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
      serpRecords: [...workspace.serpRecords.filter(item => item.id !== record.id), record],
      serpReviews: workspace.serpReviews,
      serpMergeConflicts: workspace.serpMergeConflicts,
      operationalPublications: workspace.operationalPublications,
      documentLocks: workspace.documentLocks,
      selectedEntityId: workspace.selectedEntityId,
      aiReviewAnnotations: workspace.aiReviewAnnotations,
      savedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(workflowRecoveryStorageKey(brandId), JSON.stringify(recovery));
    return true;
  } catch {
    return false;
  }
}

function saveLocalRadarAnalysisRecovery(brandId: string, workspace: BrandWorkspace) {
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
    window.localStorage.setItem(workflowRecoveryStorageKey(brandId), JSON.stringify(recovery));
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
  collectSerp: (articleId: string, location: string) => Promise<SerpCollectionRecord>;
  saveRadarAnalysis: (articleId: string, analysis: RadarAnalysisVersion) => Promise<{ persistenceMode: "remote" | "local" }>;
  reviewSerp: (articleId: string, snapshotId: string, status: "approved" | "rejected", notes: string) => Promise<void>;
  simulateProductEvidence: (articleId: string, query: string, location: string) => Promise<void>;
  simulatePlanAndDocument: () => Promise<void>;
  simulateOperationalSkeleton: (articleId?: string, targetArticleId?: string) => void;
  importApprovedKeywordsToArchitect: (keywordIds: string[]) => { imported: number; allIds: string[] };
  setArchitectImportedKeywordIds: (keywordIds: string[]) => void;
  importApprovedToRadar: (articleIds: string[], sourceKeywords?: RadarHydrationSourceKeyword[], serpAssessments?: Record<string, SerpFormationAssessment>) => { imported: number; skipped: number };
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
  const [workspaces, setWorkspaces] = useState<Record<string, BrandWorkspace>>({});
  const [snapshots, setSnapshots] = useState<Record<string, EditorialSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recoveredBrands = useRef(new Set<string>());
  const activeTaskKeys = useRef(new Map<string, string>());
  const workspace = workspaces[selectedBrandId] || emptyWorkspace();

  const updateWorkspace = useCallback((updater: (current: BrandWorkspace) => BrandWorkspace) => {
    if (!selectedBrandId) return;
    setWorkspaces(previous => updateBrandWorkspace(previous, selectedBrandId, emptyWorkspace, updater));
  }, [selectedBrandId]);

  const runBackgroundTask = useCallback(<TResult,>(input: BackgroundTaskInput<TResult>) => {
    if (!selectedBrandId) return null;
    const brandId = selectedBrandId;
    const key = `${brandId}:${input.type}`;
    const runningId = activeTaskKeys.current.get(key);
    if (runningId) return runningId;
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    activeTaskKeys.current.set(key, id);
    const updateBrand = (updater: (current: BrandWorkspace) => BrandWorkspace) => {
      setWorkspaces(previous => updateBrandWorkspace(previous, brandId, emptyWorkspace, updater));
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
  }, [selectedBrandId]);

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
    if (!selectedBrandId) return;
    try {
      const response = await fetch(`/api/editorial/workspace?marcaId=${encodeURIComponent(selectedBrandId)}`, { cache: "no-store" });
      if (!response.ok) { updateWorkspace(current => ({ ...current, persistenceMode: response.status === 503 ? "local_fallback" : "unavailable" })); return; }
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
        const radarItems = reconcileRadarItems(incomingRadar, articleVersions, selectedBrandId, sourceSnapshot?.keywords || snapshots[selectedBrandId]?.keywords || [], siloVersions);
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
    } catch { updateWorkspace(current => ({ ...current, persistenceMode: "local_fallback" })); }
  }, [selectedBrandId, snapshots, updateWorkspace]);

  const reload = useCallback(async () => {
    if (!selectedBrandId) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inteligencia?marcaId=${encodeURIComponent(selectedBrandId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Erro ao carregar inteligência editorial.");
      const snapshot = EditorialSnapshotSchema.parse(body.data);
      setSnapshots(previous => ({ ...previous, [selectedBrandId]: snapshot })); await reloadOperational(snapshot);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao carregar inteligência editorial.");
    } finally { setLoading(false); }
  }, [selectedBrandId, reloadOperational]);

  useEffect(() => {
    if (!selectedBrandId || recoveredBrands.current.has(selectedBrandId)) return;
    try {
      const raw = window.localStorage.getItem(workflowRecoveryStorageKey(selectedBrandId));
      if (!raw) { recoveredBrands.current.add(selectedBrandId); return; }
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
        recoveredBrands.current.add(selectedBrandId);
        setWorkspaces(previous => updateBrandWorkspace(previous, selectedBrandId, emptyWorkspace, current => ({
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
  }, [selectedBrandId]);

  useEffect(() => {
    if (!selectedBrandId || !recoveredBrands.current.has(selectedBrandId)) return;
    const current = workspaces[selectedBrandId];
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
      window.localStorage.setItem(workflowRecoveryStorageKey(selectedBrandId), JSON.stringify(recovery));
    } catch {
      // Recovery is best-effort and must never interrupt an editorial action.
    }
  }, [selectedBrandId, workspaces]);

  useEffect(() => {
    if (!selectedBrandId || snapshots[selectedBrandId]) return;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload, selectedBrandId, snapshots]);

  const createSerpResolutionEnvelope = useCallback(async (articleId: string) => {
    if (!selectedBrandId) throw new Error("Selecione uma marca antes de pesquisar a SERP.");
    const article = workspace.articleVersions[articleId];
    const radarItem = workspace.radarItems.find(item => item.articleId === articleId);
    if (!article || !radarItem) throw new Error("O artigo não está disponível no contexto editorial local do Radar.");
    return createRadarSerpResolutionEnvelope({
      brandId: selectedBrandId,
      radarItem,
      article,
      hydration: radarItem.hydration,
      sourceKeywords: (snapshots[selectedBrandId]?.keywords || []) as RadarHydrationSourceKeyword[],
      silo: article.payload.siloId ? workspace.siloVersions[article.payload.siloId] : undefined,
    });
  }, [selectedBrandId, snapshots, workspace]);

  const value = useMemo<EditorialPipelineContextValue>(() => ({
    ...workspace, snapshot: snapshots[selectedBrandId] || null, loading, error, reload, reloadOperational,
    setArticleVersions: update => updateWorkspace(current => ({ ...current, articleVersions: typeof update === "function" ? update(current.articleVersions) : update })),
    setSiloVersions: update => updateWorkspace(current => ({ ...current, siloVersions: typeof update === "function" ? update(current.siloVersions) : update })),
    setSiloPageVersions: update => updateWorkspace(current => ({ ...current, siloPageVersions: typeof update === "function" ? update(current.siloPageVersions) : update })),
    addVersionEvents: events => updateWorkspace(current => ({ ...current, versionEvents: mergeVersionEvents(current.versionEvents, events) })),
    setSelectedEntityId: id => updateWorkspace(current => ({ ...current, selectedEntityId: id })),
    simulateSerp: async (articleId, keyword, location) => {
      const record = await mockSerpProvider.collectSnapshot({ articleId, keyword, location: location || "Brasil", language: "pt-BR", device: "desktop" });
      updateWorkspace(current => ({ ...current, serpRecords: [...current.serpRecords.filter(item => item.id !== record.id), record] }));
    },
    collectSerp: async (articleId, location) => {
      if (!selectedBrandId) throw new Error("Selecione uma marca antes de pesquisar a SERP.");
      const articleVersion = workspace.articleVersions[articleId];
      const resolutionEnvelope = await createSerpResolutionEnvelope(articleId);
      const response = await fetch("/api/editorial/serp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "collect", brandId: selectedBrandId, articleId, location: location || "Brasil", language: "pt-BR", device: "desktop", articleVersion, resolutionEnvelope }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível coletar a SERP.");
      const record = SerpCollectionRecordSchema.parse(body.record);
      if (!saveLocalSerpRecovery(selectedBrandId, workspace, record)) throw new Error("A coleta real foi concluída, mas a recuperação local não pôde ser salva.");
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
      updateWorkspace(current => ({ ...current, radarItems: current.radarItems.map(item => item.articleId === articleId ? nextItem : item) }));
      try {
        const response = await fetch("/api/editorial/radar-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", brandId: selectedBrandId, articleId, expectedLock: currentItem.lockVersion, analysis: parsed }) });
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
          updateWorkspace(current => ({ ...current, radarItems: current.radarItems.map(item => item.articleId === articleId ? { ...item, lockVersion: typeof body.lockVersion === "number" ? body.lockVersion : item.lockVersion + 1 } : item), persistenceMode: "server" }));
          return { persistenceMode: "remote" as const };
        }
        if (response.status !== 503) throw new Error(body.error || "Não foi possível persistir a análise Radar.");
      } catch (error) {
        if (error instanceof Error && !/fetch|Failed|Network|503/i.test(error.message)) throw error;
      }
      if (!saveLocalRadarAnalysisRecovery(selectedBrandId, nextWorkspace)) {
        throw new Error("A análise foi aplicada localmente, mas a recuperação do navegador não pôde ser salva.");
      }
      updateWorkspace(current => ({ ...current, persistenceMode: "local_fallback" }));
      return { persistenceMode: "local" as const };
    },
    reviewSerp: async (articleId, snapshotId, status, notes) => {
      if (!selectedBrandId) throw new Error("Selecione uma marca antes de revisar a SERP.");
      const currentRecord = workspace.serpRecords.find(record => record.id === snapshotId);
      const articleVersion = workspace.articleVersions[articleId];
      const resolutionEnvelope = await createSerpResolutionEnvelope(articleId);
      const response = await fetch("/api/editorial/serp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review", brandId: selectedBrandId, articleId, snapshotId, status, notes, record: currentRecord, articleVersion, resolutionEnvelope }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar a revisão da SERP.");
      const review = SerpReviewRecordSchema.parse(body.review);
      updateWorkspace(current => ({ ...current, serpReviews: [...current.serpReviews.filter(item => item.snapshotId !== review.snapshotId), review], serpPersistenceMode: body.persistenceMode === "remote" ? "server" : "local_fallback" }));
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
    importApprovedToRadar: (articleIds, sourceKeywords = [], serpAssessments = {}) => {
      const candidates = approvedArticleVersions(workspace.articleVersions, workspace.versionEvents).filter(version => articleIds.includes(version.payload.articleId));
      const hydrationKeywords = sourceKeywords.length ? sourceKeywords : snapshots[selectedBrandId]?.keywords || [];
      const hydrationByArticleId: Record<string, RadarHydrationSnapshot> = {};
      for (const version of candidates) {
        const hydration = createRadarHydrationSnapshot({ brandId: selectedBrandId, article: version, sourceKeywords: hydrationKeywords, silo: version.payload.siloId ? workspace.siloVersions[version.payload.siloId] : undefined, source: "arquiteto_import" });
        if (hydration) hydrationByArticleId[version.payload.articleId] = hydration;
      }
      const before = workspace.radarItems.length; const next = importArticlesToRadar(workspace.radarItems, candidates, selectedBrandId, undefined, hydrationKeywords, workspace.siloVersions, hydrationByArticleId, serpAssessments);
      updateWorkspace(current => ({ ...current, radarItems: next }));
      void sendWorkflowCommand({ action: "import_radar", brandId: selectedBrandId, articleVersions: candidates, versionEvents: workspace.versionEvents.filter(event => candidates.some(version => version.versionId === event.versionId)), hydrationByArticleId }, updateWorkspace);
      return { imported: next.length - before, skipped: articleIds.length - (next.length - before) };
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
        const packageData = rawPackageData && "packageType" in rawPackageData ? { mode: rawPackageData.analysisMode.mode, enforcement: "advisory" as const, requirements: [], recommendations: [], observedData: ["SERP: " + rawPackageData.serp.query, "Resultados incluidos: " + rawPackageData.includedOrganicResults.length, "Amostra estrutural: " + rawPackageData.observedStructure.sampleSize], keywordDecisions: [], evidencePackage: rawPackageData } : rawPackageData;
        const radarAnalysisPackage = approvedAnalysis && packageData ? { analysisVersionId: approvedAnalysis.versionId, packageHash: approvedAnalysis.contentHash, analysisMode: packageData.mode, analysisEnforcement: packageData.enforcement, requirements: packageData.requirements, recommendations: packageData.recommendations, observedData: packageData.observedData, humanDecisions: packageData.keywordDecisions.map(decision => `${decision.keywordId}: ${decision.decision}${decision.note ? ` — ${decision.note}` : ""}`), evidencePackage: "evidencePackage" in packageData ? packageData.evidencePackage : null } : undefined;
        const plan = existing || await createOperationalPlan(item, article, workspace.siloVersions[item.siloId], actorId, serpEvidenceRefs, radarAnalysisPackage);
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
      if (!item?.contentPlanVersionId) throw new Error("Prepare o ContentPlan antes de editá-lo.");
      const current = workspace.contentPlans[item.contentPlanVersionId] || Object.values(workspace.contentPlans).find(plan => plan.entityId === `plan:${item.articleId}`);
      if (!current) throw new Error("Versão ativa do ContentPlan não encontrada.");
      if (current.payload.planning && !hasMaterialPlanChange(current.payload.planning, details)) return { created: false, versionId: current.versionId };
      const legacyBriefing = snapshots[selectedBrandId]?.briefings.find(candidate => candidate.id === item.articleId) || null;
      const operationalPublication = workspace.operationalPublications.find(candidate => candidate.articleId === item.articleId) || null;
      const publicationIdentity = resolvePlannerPublicationIdentity({ brandId: selectedBrandId, brandName: snapshots[selectedBrandId]?.brand.nome, articleId: item.articleId, article: workspace.articleVersions[item.articleId]?.payload || null, operational: operationalPublication, legacyBriefing });
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
      const approvable = eligible.filter(item => { const plan = workspace.contentPlans[item.contentPlanVersionId!]; if (!plan) return false; const legacyBriefing = snapshots[selectedBrandId]?.briefings.find(candidate => candidate.id === item.articleId) || null; const operationalPublication = workspace.operationalPublications.find(candidate => candidate.articleId === item.articleId) || null; const publicationIdentity = resolvePlannerPublicationIdentity({ brandId: selectedBrandId, brandName: snapshots[selectedBrandId]?.brand.nome, articleId: item.articleId, article: workspace.articleVersions[item.articleId]?.payload || null, operational: operationalPublication, legacyBriefing }); const articleIdentityIssues = workspace.articleVersions[item.articleId] ? publishedIdentityReferenceIssues(workspace.articleVersions[item.articleId].payload, publicationIdentity) : []; return contentPlanApprovalIssues(plan, selectedBrandId).length === 0 && publicationIdentity.state !== "conflict" && publicationSourceIssues(plan.payload.planning!, publicationIdentity).length === 0 && articleIdentityIssues.length === 0; });
      const events = approvable.flatMap(item => { const plan = workspace.contentPlans[item.contentPlanVersionId!]; return plan ? [createStatusEvent(plan.versionId, "approved", actorId, "ContentPlan aprovado no Planejador.")] : []; });
      updateWorkspace(current => ({ ...current, versionEvents: mergeVersionEvents(current.versionEvents, events), plannerItems: current.plannerItems.map(item => approvable.some(candidate => candidate.id === item.id) ? { ...item, state: "approved" as const, updatedAt: new Date().toISOString(), lockVersion: item.lockVersion + 1 } : item) }));
      void sendWorkflowCommand({ action: "approve_plan", brandId: selectedBrandId, plannerItemIds: approvable.map(item => item.id), expectedLocks: Object.fromEntries(approvable.map(item => [item.id, item.lockVersion])), versionEvents: events }, updateWorkspace); },
    startWriting: async plannerItemId => {
      const item = workspace.plannerItems.find(candidate => candidate.id === plannerItemId);
      if (!item || (item.state !== "approved" && item.state !== "sent_writer")) throw new Error("Apenas ContentPlans aprovados podem seguir para o Redator.");
      const article = workspace.articleVersions[item.articleId]; if (!article) throw new Error("ArticleDNA não encontrado.");
      const plan = Object.values(workspace.contentPlans).find(candidate => candidate.versionId === item.contentPlanVersionId);
      if (!plan) throw new Error("ContentPlan aprovado não encontrado.");
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
  }), [workspace, snapshots, selectedBrandId, loading, error, reload, reloadOperational, updateWorkspace, runBackgroundTask, consumeBackgroundTask, dismissBackgroundTask, addAiReviewAnnotations, restoreOperationalSnapshot, createSerpResolutionEnvelope]);

  return <EditorialPipelineContext.Provider value={value}>{children}</EditorialPipelineContext.Provider>;
}

async function sendWorkflowCommand(command: WorkflowCommand, update: (updater: (current: BrandWorkspace) => BrandWorkspace) => void) {
  try { const response = await fetch("/api/editorial/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
    if (response.ok) return; const body = await response.json(); update(current => ({ ...current, persistenceMode: body.code === "persistence_unavailable" ? "local_fallback" : "unavailable" }));
  } catch { update(current => ({ ...current, persistenceMode: "local_fallback" })); }
}

export function useEditorialPipeline() {
  const value = useContext(EditorialPipelineContext);
  if (!value) throw new Error("useEditorialPipeline deve ser usado dentro de EditorialPipelineProvider.");
  return value;
}
