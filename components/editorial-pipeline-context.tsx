"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ArticleDNA, ContentDocument, ContentPlan, ProductEvidenceDNA, SiloDNA, VersionEnvelope, VersionStatusEvent } from "@/lib/arquiteto/contracts";
import { EditorialSnapshotSchema, type EditorialSnapshot, type SerpCollectionRecord } from "@/lib/editorial/contracts";
import { createMockPlanAndDocument, mockProductEvidenceProvider, mockSerpProvider } from "@/lib/editorial/providers";
import { createMockOperationalBundle } from "@/lib/editorial/providers";
import type { AIReviewAnnotation, BrandMaterial, BrandPrompt, BrandSkill, ExternalSourceSuggestion, GuardianFinding, InternalLinkAssignment, PublicationRecord } from "@/lib/editorial/operational-contracts";
import type { BrandInvitation, OperationalPublication, PlannerItem, RadarItem } from "@/lib/editorial/operational-flow";
import { approvedArticleVersions, createDevelopmentInvitation, createOperationalDocument, createOperationalPlan, createPublicationDraft,
  importApprovedWriterItems, importArticlesToRadar, importRadarToPlanner, mergeVersionEvents, setRadarState } from "@/lib/editorial/operational-flow";
import { useBrand } from "./brand-context";
import { updateBrandWorkspace } from "@/lib/editorial/workspace";
import { LocalWorkflowRecoverySchema, PersistedEditorialWorkspaceSchema, workflowRecoveryStorageKey, type PersistenceMode, type WorkflowCommand } from "@/lib/editorial/persistence-contracts";
import type { BackgroundTaskInput, EditorialBackgroundTask } from "@/lib/editorial/background-tasks";
import type { EditorialHistoryModule } from "@/lib/editorial/history";

interface BrandWorkspace {
  architectImportedKeywordIds: string[];
  articleVersions: Record<string, VersionEnvelope<ArticleDNA>>;
  siloVersions: Record<string, VersionEnvelope<SiloDNA>>;
  versionEvents: VersionStatusEvent[];
  serpRecords: SerpCollectionRecord[];
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

const emptyWorkspace = (): BrandWorkspace => ({ architectImportedKeywordIds: [], articleVersions: {}, siloVersions: {}, versionEvents: [], serpRecords: [],
  productEvidence: [], contentPlans: {}, documents: {}, selectedEntityId: null, skills: [], prompts: [], materials: [],
  internalLinks: [], externalSources: [], guardianFindings: [], publications: [], radarItems: [], plannerItems: [],
  operationalPublications: [], invitations: [], persistenceMode: "local_fallback", documentLocks: {}, documentUserStates: {}, moduleState: {}, backgroundTasks: [], aiReviewAnnotations: [] });

interface EditorialPipelineContextValue extends BrandWorkspace {
  snapshot: EditorialSnapshot | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reloadOperational: () => Promise<void>;
  setArticleVersions: React.Dispatch<React.SetStateAction<Record<string, VersionEnvelope<ArticleDNA>>>>;
  setSiloVersions: React.Dispatch<React.SetStateAction<Record<string, VersionEnvelope<SiloDNA>>>>;
  addVersionEvents: (events: VersionStatusEvent[]) => void;
  setSelectedEntityId: (id: string | null) => void;
  simulateSerp: (articleId: string, keyword: string, location: string) => Promise<void>;
  simulateProductEvidence: (articleId: string, query: string, location: string) => Promise<void>;
  simulatePlanAndDocument: () => Promise<void>;
  simulateOperationalSkeleton: (articleId?: string, targetArticleId?: string) => void;
  importApprovedKeywordsToArchitect: (keywordIds: string[]) => { imported: number; allIds: string[] };
  importApprovedToRadar: (articleIds: string[]) => { imported: number; skipped: number };
  updateRadarState: (ids: string[], target: RadarItem["state"]) => void;
  importApprovedToPlanner: (radarIds: string[]) => { imported: number; skipped: number };
  preparePlannerItems: (ids: string[], actorId: string) => Promise<void>;
  approvePlannerItems: (ids: string[]) => void;
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
    if (module === "arquiteto") return { ...current, articleVersions: snapshot.articleVersions ?? current.articleVersions, siloVersions: snapshot.siloVersions ?? current.siloVersions, versionEvents: snapshot.versionEvents ?? current.versionEvents, aiReviewAnnotations: snapshot.aiReviewAnnotations ?? current.aiReviewAnnotations };
    if (module === "radar") return { ...current, radarItems: snapshot.radarItems ?? current.radarItems, serpRecords: snapshot.serpRecords ?? current.serpRecords, productEvidence: snapshot.productEvidence ?? current.productEvidence };
    if (module === "planejador") return { ...current, plannerItems: snapshot.plannerItems ?? current.plannerItems, contentPlans: snapshot.contentPlans ?? current.contentPlans, internalLinks: snapshot.internalLinks ?? current.internalLinks, externalSources: snapshot.externalSources ?? current.externalSources };
    if (module === "redator") return { ...current, documents: snapshot.documents ?? current.documents, guardianFindings: snapshot.guardianFindings ?? current.guardianFindings, operationalPublications: snapshot.operationalPublications ?? current.operationalPublications };
    if (module === "publicacoes") return { ...current, operationalPublications: snapshot.operationalPublications ?? current.operationalPublications };
    return current;
  }), [updateWorkspace]);

  const reloadOperational = useCallback(async () => {
    if (!selectedBrandId) return;
    try {
      const response = await fetch(`/api/editorial/workspace?marcaId=${encodeURIComponent(selectedBrandId)}`, { cache: "no-store" });
      if (!response.ok) { updateWorkspace(current => ({ ...current, persistenceMode: response.status === 503 ? "local_fallback" : "unavailable" })); return; }
      const body = await response.json(); const persisted = PersistedEditorialWorkspaceSchema.parse(body.data);
      updateWorkspace(current => ({ ...current, persistenceMode: persisted.mode,
        radarItems: persisted.radarItems, plannerItems: persisted.plannerItems,
        articleVersions: { ...current.articleVersions, ...Object.fromEntries(persisted.articleVersions.map(version => [version.payload.articleId, version])) },
        siloVersions: { ...current.siloVersions, ...Object.fromEntries(persisted.siloVersions.map(version => [version.payload.siloId, version])) },
        versionEvents: mergeVersionEvents(current.versionEvents, persisted.versionEvents),
        contentPlans: { ...current.contentPlans, ...Object.fromEntries(persisted.contentPlans.map(version => [version.entityId, version])) },
        documents: { ...current.documents, ...Object.fromEntries(persisted.documents.map(record => [record.document.id, record.document])) },
        documentLocks: { ...current.documentLocks, ...Object.fromEntries(persisted.documents.map(record => [record.document.id, record.lockVersion])) },
        documentUserStates: { ...current.documentUserStates, ...Object.fromEntries(persisted.documents.filter(record => record.userState).map(record => [record.document.id, record.userState!])) },
        operationalPublications: persisted.publications, invitations: persisted.invitations,
      }));
    } catch { updateWorkspace(current => ({ ...current, persistenceMode: "local_fallback" })); }
  }, [selectedBrandId, updateWorkspace]);

  const reload = useCallback(async () => {
    if (!selectedBrandId) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/inteligencia?marcaId=${encodeURIComponent(selectedBrandId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Erro ao carregar inteligência editorial.");
      const snapshot = EditorialSnapshotSchema.parse(body.data);
      setSnapshots(previous => ({ ...previous, [selectedBrandId]: snapshot })); await reloadOperational();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao carregar inteligência editorial.");
    } finally { setLoading(false); }
  }, [selectedBrandId, reloadOperational]);

  useEffect(() => {
    if (!selectedBrandId || recoveredBrands.current.has(selectedBrandId)) return;
    try {
      const raw = window.localStorage.getItem(workflowRecoveryStorageKey(selectedBrandId));
      if (!raw) { recoveredBrands.current.add(selectedBrandId); return; }
      const recovered = LocalWorkflowRecoverySchema.parse(JSON.parse(raw));
      const timer = window.setTimeout(() => {
        recoveredBrands.current.add(selectedBrandId);
        setWorkspaces(previous => updateBrandWorkspace(previous, selectedBrandId, emptyWorkspace, current => ({
          ...current,
          architectImportedKeywordIds: recovered.architectImportedKeywordIds,
          articleVersions: recovered.articleVersions,
          siloVersions: recovered.siloVersions,
          versionEvents: recovered.versionEvents,
          contentPlans: recovered.contentPlans,
          documents: recovered.documents,
          radarItems: recovered.radarItems,
          plannerItems: recovered.plannerItems,
          operationalPublications: recovered.operationalPublications,
          documentLocks: recovered.documentLocks,
          selectedEntityId: recovered.selectedEntityId,
          aiReviewAnnotations: recovered.aiReviewAnnotations,
          persistenceMode: "local_fallback",
        })));
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.localStorage.removeItem(workflowRecoveryStorageKey(selectedBrandId));
      recoveredBrands.current.add(selectedBrandId);
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
        versionEvents: current.versionEvents,
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

  const value = useMemo<EditorialPipelineContextValue>(() => ({
    ...workspace, snapshot: snapshots[selectedBrandId] || null, loading, error, reload, reloadOperational,
    setArticleVersions: update => updateWorkspace(current => ({ ...current, articleVersions: typeof update === "function" ? update(current.articleVersions) : update })),
    setSiloVersions: update => updateWorkspace(current => ({ ...current, siloVersions: typeof update === "function" ? update(current.siloVersions) : update })),
    addVersionEvents: events => updateWorkspace(current => ({ ...current, versionEvents: mergeVersionEvents(current.versionEvents, events) })),
    setSelectedEntityId: id => updateWorkspace(current => ({ ...current, selectedEntityId: id })),
    simulateSerp: async (articleId, keyword, location) => {
      const record = await mockSerpProvider.collectSnapshot({ articleId, keyword, location: location || "Brasil", language: "pt-BR", device: "desktop" });
      updateWorkspace(current => ({ ...current, serpRecords: [...current.serpRecords.filter(item => item.id !== record.id), record] }));
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
    importApprovedToRadar: articleIds => {
      const candidates = approvedArticleVersions(workspace.articleVersions, workspace.versionEvents).filter(version => articleIds.includes(version.payload.articleId));
      const before = workspace.radarItems.length; const next = importArticlesToRadar(workspace.radarItems, candidates, selectedBrandId);
      updateWorkspace(current => ({ ...current, radarItems: next }));
      void sendWorkflowCommand({ action: "import_radar", brandId: selectedBrandId, articleVersions: candidates, versionEvents: workspace.versionEvents.filter(event => candidates.some(version => version.versionId === event.versionId)) }, updateWorkspace);
      return { imported: next.length - before, skipped: articleIds.length - (next.length - before) };
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
        const plan = existing || await createOperationalPlan(item, article, workspace.siloVersions[item.siloId], actorId);
        prepared.push({ itemId: item.id, plan: plan as VersionEnvelope<ContentPlan> });
      }
      updateWorkspace(current => ({ ...current,
        contentPlans: { ...current.contentPlans, ...Object.fromEntries(prepared.map(entry => [entry.plan.entityId, entry.plan])) },
        plannerItems: current.plannerItems.map(item => { const entry = prepared.find(candidate => candidate.itemId === item.id); return entry ? { ...item, contentPlanVersionId: entry.plan.versionId, state: "awaiting_review" as const, updatedAt: new Date().toISOString() } : item; }),
      }));
      for (const entry of prepared) { const item = workspace.plannerItems.find(candidate => candidate.id === entry.itemId); if (item) void sendWorkflowCommand({ action: "prepare_plan", brandId: selectedBrandId, plannerItemId: item.id, expectedLock: item.lockVersion, plan: entry.plan }, updateWorkspace); }
    },
    approvePlannerItems: ids => { const eligible = workspace.plannerItems.filter(item => ids.includes(item.id) && item.state === "awaiting_review" && item.contentPlanVersionId);
      updateWorkspace(current => ({ ...current, plannerItems: current.plannerItems.map(item => eligible.some(candidate => candidate.id === item.id) ? { ...item, state: "approved" as const, updatedAt: new Date().toISOString(), lockVersion: item.lockVersion + 1 } : item) }));
      void sendWorkflowCommand({ action: "approve_plan", brandId: selectedBrandId, plannerItemIds: eligible.map(item => item.id), expectedLocks: Object.fromEntries(eligible.map(item => [item.id, item.lockVersion])) }, updateWorkspace); },
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
  }), [workspace, snapshots, selectedBrandId, loading, error, reload, reloadOperational, updateWorkspace, runBackgroundTask, consumeBackgroundTask, dismissBackgroundTask, addAiReviewAnnotations, restoreOperationalSnapshot]);

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
