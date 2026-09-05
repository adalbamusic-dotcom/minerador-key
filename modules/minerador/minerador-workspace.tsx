"use client";

import { useState, useEffect, useRef, Fragment, useMemo, useCallback, type DragEvent, type ReactNode } from "react";
import Papa from "papaparse";
import { 
  Loader2, 
  ArrowUpDown,
  Trash2,
  X,
  Plus,
  RefreshCw,
  FolderPlus,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Check,
  FileSpreadsheet,
  Brain,
  Search,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Building2,
  MoreHorizontal,
  CheckCheck,
} from "lucide-react";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { useBrand } from "@/components/brand-context";
import { AppMenu } from "@/components/app-menu";
import { InfoHint } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";
import { KeywordDnaPanel, type KeywordPresentationBrief } from "@/components/editorial/dna-panels";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import { MineradorLastOrganizationRestorer } from "./last-organization-restorer";
import { DeleteConfirmation, PublishedDeleteConfirmation, RecoveryAction } from "@/components/lifecycle/delete-confirmation";
import type { DeletionImpactEntry } from "@/lib/lifecycle";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { useNoticeCenter } from "@/components/global-notice-center";
import { useRouter } from "next/navigation";
import {
  autoClassifyIntent,
  autoDetectNiche,
  deriveLogicalKeywordDna,
  mergeLogicalKeywordSemantic,
} from "@/lib/arquiteto/keyword-dna-engine";
import { persistMineradorArquitetoHandoff } from "@/lib/arquiteto/canonical-workspace";
import { buildMineradorSiteSyncPlan, loadMineradorSiteSyncSnapshot, uniqueSiteSyncCandidates, type MineradorSiteSyncCandidate, type MineradorSiteSyncPlan } from "@/lib/minerador/site-sync-adapter";
import { classifyKgrMeasurement, kgrApplicabilityLabel, kgrDecisionLabel, kgrMeasurementLabel, kgrTechnicalTone, readKgrApplicability, type KgrApplicability } from "@/lib/minerador/kgr-applicability";
import { describeKgrApplicabilityBatch, planKgrApplicabilityBatch } from "@/lib/minerador/kgr-applicability-batch";
import { describeHumanReviewCompletionBatch, planHumanReviewCompletionBatch } from "@/lib/minerador/human-review-completion-batch";
import { applyHumanReviewEnrichment, applyHumanReviewField, applyHumanReviewKgrApplicability, canCompleteHumanReview, completeHumanReview, humanReviewRecord, isHumanReviewCompleted, type HumanReviewAction } from "@/lib/minerador/human-review";
import { evaluateMineradorArquitetoHandoffBatch } from "@/lib/minerador/arquiteto-handoff-gates";
import { canonicalIntentLabel, normalizeIntentKey } from "@/lib/minerador/intent-taxonomy";
import { assessVolumeKgrConsistency, hasExplicitZeroMeasurement, volumeKgrConsistencyLabel, type VolumeKgrConsistency } from "@/lib/minerador/volume-kgr-consistency";
import { deriveMineradorTableRows } from "@/lib/minerador/table-view";
import { mineradorLastOrganizationKey, mineradorOrganizationButtonSummary, mineradorOrganizationLabels, type MineradorOrganizationValues } from "@/lib/minerador/last-organization";
import { primaryKeywordPolicyLabel, readPrimaryKeywordPolicy, setPrimaryKeywordPolicy, type PrimaryKeywordPolicy } from "@/lib/minerador/primary-keyword-policy";
import { applyFunnelQualification, classifyKeywordFunnel } from "@/lib/minerador/keyword-qualification";
import { readVolumeEligibility, volumeEligibilityLabel } from "@/lib/minerador/volume-eligibility";
import { formatGoogleAdsCpcTableValue } from "@/lib/minerador/google-ads-demand";
import { buildLogicalOutputContract, buildLogicalProcessorMetadata, hasCompleteLogicalOutputContract, hasCurrentLogicalProcessorMetadata, logicalSemanticRecordsEqual, validateLogicalKeywordOutput } from "@/lib/minerador/logical-processor";
import { readCanonicalKeywordDna, readLogicalIntentLabel, readLogicalNiche } from "@/lib/minerador/logical-read-model";
import { resolveCanonicalKeywordSnapshot } from "@/lib/minerador/canonical-keyword-snapshot";
import { resolveMineradorProcessState, type MineradorAttemptState, type MineradorProcessAttempt, type MineradorProcessName } from "@/lib/minerador/process-state";
import { resolveSemanticReviewNotice } from "@/lib/minerador/semantic-review-notice";
import { type SemanticConsolidationDraft } from "@/lib/minerador/semantic-consolidation-draft";
import { isConclusiveSerpEvidence, type SerpSemanticEvidence } from "@/lib/minerador/serp-semantic-evidence";
import { KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE, parseKeywordSemanticQualification, semanticDraftFromQualification, type KeywordSemanticQualification } from "@/lib/minerador/keyword-semantic-qualification";
import { KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE, brandVoiceAppliedInPresentation, parseKeywordContextualPresentation } from "@/lib/minerador/keyword-contextual-presentation";
import { applyPublicationLinkAction, readPublicationLink, readSiteOrigin, type PublicationLinkEvidence } from "@/lib/minerador/publication-link";
import {
  keywordRecoveryRemainingLabel,
  resolveKeywordPublication,
} from "@/lib/minerador/keyword-lifecycle";
import { isLegacyPublishedStatus, MINERADOR_EDITORIAL_STATUSES, resolveEditorialKeywordStatus, type EditorialKeywordStatus } from "@/lib/minerador/editorial-status";
import type { KeywordTableOrderMode } from "@/lib/minerador/manual-order";
import { manualImportListaId, resolveLegacyCsvSilo } from "@/lib/minerador/legacy-import";
import { KeywordTableBulkBarShell } from "./keyword-table/keyword-table-bulk-bar-shell";
import { KeywordTableEmptyState } from "./keyword-table/keyword-table-empty-state";
import { KeywordTableHeader } from "./keyword-table/keyword-table-header";
import { KeywordTableOrganizeButton } from "./keyword-table/keyword-table-organize-button";
import { KeywordSelectionCell, KeywordSelectionHeader } from "./keyword-table/keyword-table-selection";
import { KeywordTableShell } from "./keyword-table/keyword-table-shell";
import { useKeywordTableSelection } from "./keyword-table/use-keyword-table-selection";
import { keywordTableMinimumWidth, useKeywordTableResponsiveWidths } from "./keyword-table/use-keyword-table-responsive-widths";
import { KeywordTableDragHandle, KeywordTableOrderModeSelect } from "./keyword-table/keyword-table-order";
import { useKeywordTableOrder } from "./keyword-table/use-keyword-table-order";
import { KeywordTableColumnResizeHandle, KeywordTableRowResizeHandle, useKeywordTableColumnResize, useKeywordTableRowResize } from "./keyword-table/keyword-table-resize";
import { MineradorProcessAction } from "./minerador-process-action";
import { DiscoverySourceControls, type DiscoverySourceControlsHandle, type DiscoverySourceResponse } from "./discovery/discovery-source-controls";
import { DiscoverySourceTopbarActions } from "./discovery/discovery-source-topbar-actions";
import {
  createAuthenticatedBrowserClient,
  getCurrentSupabaseToken,
  getSupabaseSessionErrorMessage,
  isSupabaseBrowserAuthError,
  isSupabaseTokenExpirationError,
  withSupabaseSelectRetry,
} from "@/lib/supabase/browser-authenticated-client";

interface ListObject {
  id: string;
  nome: string;
  nicho: string | null;
  marca_id: string;
}

type KeywordSemantic = Record<string, unknown> & {
  nicho_override?: string;
  slug_sugerido?: string;
  site_origin?: SiteEvidenceView;
  site_origins?: SiteEvidenceView[];
  primary_keyword_policy?: PrimaryKeywordPolicy;
  allintitle_measurement?: Record<string, unknown>;
  allintitle_measurement_history?: Array<Record<string, unknown>>;
  volume_measurement?: Record<string, unknown>;
  volume_eligibility?: Record<string, unknown>;
  kgr_score_history?: Array<Record<string, unknown>>;
};

type HumanReviewDraft = {
  semantic: KeywordSemantic;
  intent: string | null;
};

interface KeywordItem {
  id: string;
  // Runtime invariant: post-0005 rows always carry brand_id; the optional view type keeps legacy fixtures readable.
  brand_id?: string;
  keyword: string;
  location: string | null;
  results_allintitle: number | null;
  volume_search: number | null;
  kgr_score: number | null;
  intent: string | null;
  status: string;
  lista_id: string | null;
  analise_semantica?: KeywordSemantic | null;
  volume_source?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  purge_after?: string | null;
}

function keywordPublicationProtected(item: Pick<KeywordItem, "status" | "analise_semantica">): boolean {
  return resolveKeywordPublication({ status: item.status, semantic: item.analise_semantica || null }).isPublished;
}

type QualificationResult = {
  id: string;
  keyword: string;
  status: "processada" | "sem_alteracao" | "preservada" | "conflito" | "falha";
  intent: string;
  funnel: string;
  niche: string;
  bias: string;
  confidence: string;
};

type SiteEvidenceView = PublicationLinkEvidence & { source?: string; batchId?: string; siloId?: string; siloName?: string | null; consolidatedAt?: string };
function siteRelationLabel(value?: string) { return ({ confirmed_primary: "Principal confirmada", confirmed_secondary: "Secundária confirmada", candidate_primary: "Principal candidata", supporting: "Apoio provável", mentioned: "Mencionada no conteúdo", undefined: "Sem relação definida" } as Record<string, string>)[value || "undefined"] || value || "Sem relação definida"; }
function siteArchitectureLabel(value?: string) { return ({ not_structured: "Não estruturado", awaiting_architecture: "Aguardando arquitetura", in_review: "Em revisão", architecture_confirmed: "Arquitetura confirmada", architectural_review_required: "Revisão arquitetural necessária", conflict: "Com conflito" } as Record<string, string>)[value || "awaiting_architecture"] || value || "Aguardando arquitetura"; }
function logicalNiche(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLocaleLowerCase("pt-BR") !== "geral" ? trimmed : null;
}
function humanSemanticMarker(value: unknown) {
  return ["aprovado", "aprovada", "confirmado", "confirmada", "confirmed", "human", "humano", "manual", "humana"]
    .includes(String(value || "").trim().toLocaleLowerCase("pt-BR"));
}
function humanNicheProtected(semantic: KeywordSemantic | null | undefined) {
  return humanSemanticMarker(semantic?.nicho_origem)
    || humanSemanticMarker(semantic?.dna_origem)
    || humanSemanticMarker(semantic?.dna_revisao_humana)
    || typeof semantic?.nicho_humano === "string";
}
function humanFunnelProtected(semantic: KeywordSemantic | null | undefined) {
  return semantic?.funnel_human_confirmed === true
    || semantic?.funnel_human_confirmed === "true"
    || humanSemanticMarker(semantic?.funnel_source)
    || humanSemanticMarker(semantic?.funnel_decision_origin);
}
function siteSyncOutcomeLabel(value: string) { return ({ new: "Nova keyword", evidence_updated: "Evidência será atualizada", no_change: "Sem alteração", duplicate_in_batch: "Duplicada na prévia", invalid: "Inválida", blocked: "Bloqueada", existing: "Já existente" } as Record<string, string>)[value] || value; }
const siteVerificationStatuses = new Set(["discovered", "unverified", "accessible", "canonical_confirmed", "canonical_missing", "canonical_conflict", "redirect", "noindex", "not_found", "error", "stale"]);
function withSiteVerification(candidate: MineradorSiteSyncCandidate, body: unknown, checkedAt: string): MineradorSiteSyncCandidate {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const verification = record.verification && typeof record.verification === "object" && !Array.isArray(record.verification)
    ? record.verification as Record<string, unknown>
    : null;
  const rawStatus = String(verification?.verificationStatus || record.verificationStatus || "error");
  const urlSituation = siteVerificationStatuses.has(rawStatus) ? rawStatus : "error";
  return {
    ...candidate,
    urlSituation: urlSituation as MineradorSiteSyncCandidate["urlSituation"],
    resolvedUrl: typeof verification?.resolvedUrl === "string" ? verification.resolvedUrl : candidate.resolvedUrl ?? null,
    declaredCanonicalUrl: typeof verification?.canonical === "string" ? verification.canonical : candidate.declaredCanonicalUrl ?? null,
    lastCheckedAt: checkedAt,
    httpStatus: typeof verification?.httpStatus === "number" ? verification.httpStatus : null,
    contentType: typeof verification?.contentType === "string" ? verification.contentType : null,
    pageTitle: typeof verification?.title === "string" ? verification.title : null,
    pageH1: typeof verification?.h1 === "string" ? verification.h1 : null,
  };
}
function candidateFromStoredSiteEvidence(item: KeywordItem, brandId: string): MineradorSiteSyncCandidate | null {
  const evidence = readSiteOrigin(item.analise_semantica);
  const sourceUrl = evidence?.resolvedUrl || evidence?.sourceUrl || evidence?.declaredCanonicalUrl;
  if (!sourceUrl) return null;
  const normalizedText = item.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  return {
    id: crypto.randomUUID(),
    brandId,
    text: item.keyword,
    normalizedText,
    catalogEntryId: typeof evidence.catalogEntryId === "string" ? evidence.catalogEntryId : null,
    sourceKind: evidence.source === "manual_url" ? "manual_url" : "site_sitemap",
    sourceUrl,
    sourceField: "other",
    sourceFields: ["other"],
    suggestedRole: "unclassified",
    slugCoherence: "unknown",
    urlSituation: "unverified",
    publicationStatus: "not_confirmed",
    keywordUrlRelation: "undefined",
    architectureStatus: "awaiting_architecture",
    relationConfirmedBy: null,
    relationConfirmedAt: null,
    confidence: "medium",
    resolvedUrl: evidence.resolvedUrl || null,
    declaredCanonicalUrl: evidence.declaredCanonicalUrl || null,
    lastCheckedAt: evidence.lastCheckedAt || null,
    catalogTitle: null,
  };
}
const mineradorTableSelectClass = "border border-divider bg-surface-subtle rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer w-full truncate focus:border-module-accent";
const processorColumnWidths = {
  drag: 32, index: 32, selection: 34, keyword: 460, vinculo: 120, results: 128, volume: 120,
  kgr: 108, cpc: 96, kd: 70, intent: 168, niche: 168, funnel: 80, silo: 168, status: 108,
};
const processorColumnConstraints = {
  drag: { min: 28, max: 48 }, index: { min: 28, max: 56 }, selection: { min: 30, max: 56 }, keyword: { min: 240, max: 1200, flexible: true },
  vinculo: { min: 84, max: 320 }, results: { min: 104, max: 260, priority: "protected" as const }, volume: { min: 96, max: 260, priority: "protected" as const }, kgr: { min: 68, max: 200 }, cpc: { min: 72, max: 220 }, kd: { min: 56, max: 180 },
  intent: { min: 104, max: 420, flexible: true }, niche: { min: 104, max: 420, flexible: true }, funnel: { min: 56, max: 200 }, silo: { min: 116, max: 420, flexible: true }, status: { min: 88, max: 280 },
};
/** Só abaixo desta largura a barra horizontal do Processador é necessária. */
const processorTableMinimumWidth = keywordTableMinimumWidth(processorColumnConstraints, Object.keys(processorColumnWidths));
const mineradorWorkflowStatuses = MINERADOR_EDITORIAL_STATUSES;
type MineradorWorkflowStatus = EditorialKeywordStatus;
function funnelLabelFor(item: KeywordItem): string {
  return readCanonicalKeywordDna(item).funnelLabel;
}

const formatMetricInteger = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

type BulkProgressStep = "site" | "logic" | "volume" | "results" | "ai" | "review";
type BulkProgressStatus = "idle" | "processing" | "success" | "error";
type BulkProgressState = {
  status: BulkProgressStatus;
  step: BulkProgressStep | null;
  current: number;
  total: number | null;
  message: string;
  detail: string;
};

const initialBulkProgressState: BulkProgressState = {
  status: "idle",
  step: null,
  current: 0,
  total: null,
  message: "",
  detail: "",
};

const bulkProgressStepMeta: Record<BulkProgressStep, {
  processingLabel: string;
  textClass: string;
  barClass: string;
  activeClass: string;
  cardClass: string;
}> = {
  site: {
    processingLabel: "Conferindo site...",
    textClass: "text-context-accent",
    barClass: "bg-context-accent",
    activeClass: "border-context-accent bg-context-accent/10 text-context-accent",
    cardClass: "border-context-accent/35 bg-context-accent/10",
  },
  logic: {
    processingLabel: "Processando lógica...",
    textClass: "text-module-accent",
    barClass: "bg-module-accent",
    activeClass: "border-module-accent bg-module-accent/10 text-module-accent",
    cardClass: "border-module-accent/35 bg-module-accent/10",
  },
  volume: {
    processingLabel: "Medindo volume...",
    textClass: "text-context-accent",
    barClass: "bg-context-accent",
    activeClass: "border-context-accent bg-context-accent/10 text-context-accent",
    cardClass: "border-context-accent/35 bg-context-accent/10",
  },
  results: {
    processingLabel: "Medindo resultados...",
    textClass: "text-context-accent",
    barClass: "bg-context-accent",
    activeClass: "border-context-accent bg-context-accent/10 text-context-accent",
    cardClass: "border-context-accent/35 bg-context-accent/10",
  },
  ai: {
    processingLabel: "Executando revisão IA...",
    textClass: "text-positive-soft",
    barClass: "bg-positive-soft",
    activeClass: "border-positive-soft bg-positive-soft/10 text-positive-soft",
    cardClass: "border-positive-soft/35 bg-positive-soft/10",
  },
  review: {
    processingLabel: "Aplicando revisão...",
    textClass: "text-pending",
    barClass: "bg-pending",
    activeClass: "border-pending bg-pending/10 text-pending",
    cardClass: "border-pending/35 bg-pending/10",
  },
};

// Helper para formatar texto em slug de SEO
const toSlug = (text: string) => {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

export default function Home({ brandRef, sectionTabs }: { brandRef: string; sectionTabs?: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const { selectedBrandId, brands, userRole } = useBrand();
  const { publishNotice } = useNoticeCenter();
  const router = useRouter();
  const supabase = useMemo(() => createAuthenticatedBrowserClient(), []);
  const activeBrand = brands.find(b => b.id === selectedBrandId) || null;



  const getCanonicalUrl = (item: KeywordItem) => {
    const evidence = readSiteOrigin(item.analise_semantica);
    return evidence?.declaredCanonicalUrl || evidence?.resolvedUrl || evidence?.sourceUrl || "";
  };

  // Estados de Dados
  const [lists, setLists] = useState<ListObject[]>([]);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  
  // Estados de Controle/Status
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [, setImporting] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [, setQueueProgress] = useState(0);
  const [dnaProcessing, setDnaProcessing] = useState(false);
  const [, setDnaProgress] = useState({ current: 0, total: 0 });
  const [bulkProgress, setBulkProgress] = useState<BulkProgressState>(initialBulkProgressState);
  const [processAttemptsByKeywordId, setProcessAttemptsByKeywordId] = useState<Record<string, Partial<Record<MineradorProcessName, MineradorProcessAttempt>>>>({});
  const [, setQualificationResults] = useState<QualificationResult[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [humanReviewOpenId, setHumanReviewOpenId] = useState<string | null>(null);
  const [humanReviewDrafts, setHumanReviewDrafts] = useState<Record<string, HumanReviewDraft>>({});
  const [semanticConsolidationDrafts, setSemanticConsolidationDrafts] = useState<Record<string, SemanticConsolidationDraft>>({});
  // Qualificação Semântica persistida por keyword: fonte canônica reidratada do
  // servidor em todo carregamento (F5, nova aba, outro navegador).
  const [semanticQualifications, setSemanticQualifications] = useState<Record<string, KeywordSemanticQualification>>({});
  // Falha da coleta SERP por keyword: estado honesto, sem apagar Resultado/KGR.
  const [serpCollectionFailures, setSerpCollectionFailures] = useState<Record<string, boolean>>({});
  // Aporte contextual da IA: working copy explícita, nunca persistida no registro
  // canônico e nunca resolvida no carregamento da página.
  const [presentationBriefs, setPresentationBriefs] = useState<Record<string, KeywordPresentationBrief>>({});
  // Tentativa gerada mas não persistida: fica separada da versão canônica para
  // nunca substituí-la silenciosamente. F5 descarta a tentativa e mantém vN.
  const [presentationAttempts, setPresentationAttempts] = useState<Record<string, KeywordPresentationBrief>>({});
  const [presentationBriefLoadingId, setPresentationBriefLoadingId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const discoverySourceControlsRef = useRef<DiscoverySourceControlsHandle>(null);
  const fetchDataInFlightRef = useRef<string | null>(null);
  const fetchDataLoadedKeyRef = useRef<string | null>(null);
  const fetchDataActiveKeyRef = useRef<string | null>(null);
  
  // Estados de Filtros e OrdenaÃ§Ã£o
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterIntent, setFilterIntent] = useState("Todos");
  const [filterListId, setFilterListId] = useState("Todos");
  const [filterSiteRelation, setFilterSiteRelation] = useState("Todos");
  const [filterSiteArchitecture, setFilterSiteArchitecture] = useState("Todos");
  const [filterSitePublication, setFilterSitePublication] = useState("Todos");
  const [filterKgrApplicability, setFilterKgrApplicability] = useState("Todos");
  const [filterKgrMeasurement, setFilterKgrMeasurement] = useState("Todos");
  const [filterVolumeEligibility, setFilterVolumeEligibility] = useState<"Todos" | "operational" | "pending" | "eligible" | "below_threshold" | "unavailable" | "measurement_failed">("Todos");
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [orderMode, setOrderMode] = useState<KeywordTableOrderMode>("auto");
  const [sortColumn, setSortColumn] = useState<"keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "cpc" | "keyword_difficulty" | "nicho" | "lista">("keyword");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [organizationHydratedKey, setOrganizationHydratedKey] = useState<string | null>(null);
  const keywordOrder = useKeywordTableOrder(useMemo(() => keywords.map(item => item.id), [keywords]));
  const columnResize = useKeywordTableColumnResize(processorColumnWidths, processorColumnConstraints);
  const tableRef = useRef<HTMLElement | null>(null);
  const responsiveWidths = useKeywordTableResponsiveWidths(columnResize.widths, processorColumnConstraints, tableRef, columnResize.resizedColumnIds);
  const rowResize = useKeywordTableRowResize(36, { min: 32, max: 112 });
  const { manualOrderIds } = keywordOrder;

  const organizationValues = useMemo<MineradorOrganizationValues>(() => ({
    searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture,
    filterSitePublication, filterKgrApplicability, filterKgrMeasurement, filterVolumeEligibility, sortColumn, sortDirection,
  }), [searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture, filterSitePublication, filterKgrApplicability, filterKgrMeasurement, filterVolumeEligibility, sortColumn, sortDirection]);
  const organizationScopeKey = session?.user?.id && selectedBrandId
    ? mineradorLastOrganizationKey(session.user.id, selectedBrandId)
    : null;
  const organizationHydrationPending = Boolean(organizationScopeKey && organizationHydratedKey !== organizationScopeKey);

  const effectiveKeywords = useMemo(() => keywords.map(item => {
    const draft = humanReviewDrafts[item.id];
    return draft
      ? { ...item, analise_semantica: draft.semantic, intent: draft.intent }
      : item;
  }), [keywords, humanReviewDrafts]);

  const filteredKeywords = useMemo(() => deriveMineradorTableRows(effectiveKeywords, lists, {
    searchQuery,
    status: filterStatus,
    intent: filterIntent,
    listId: filterListId,
    siteRelation: filterSiteRelation,
    siteArchitecture: filterSiteArchitecture,
    sitePublication: filterSitePublication,
    kgrApplicability: filterKgrApplicability,
    kgrMeasurement: filterKgrMeasurement,
    volumeEligibility: filterVolumeEligibility,
    orderMode,
    manualOrderIds,
    sortColumn,
    sortDirection,
  }), [effectiveKeywords, lists, searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture, filterSitePublication, filterKgrApplicability, filterKgrMeasurement, filterVolumeEligibility, orderMode, manualOrderIds, sortColumn, sortDirection]);

  const visibleKeywordIds = useMemo(() => filteredKeywords.map(item => item.id), [filteredKeywords]);
  const selection = useKeywordTableSelection(visibleKeywordIds);
  const { selectedIds, setSelectedIds } = selection;
  const someSelectedHaveAllintitle = useMemo(
    () => effectiveKeywords.some(item => selectedIds.has(item.id) && resolveCanonicalKeywordSnapshot({ ...item, attempts: processAttemptsByKeywordId[item.id] }).metrics.result.value !== null),
    [effectiveKeywords, processAttemptsByKeywordId, selectedIds],
  );
  const visibleSelectedCount = useMemo(() => filteredKeywords.reduce((count, item) => count + (selectedIds.has(item.id) ? 1 : 0), 0), [filteredKeywords, selectedIds]);
  const allVisibleSelected = filteredKeywords.length > 0 && visibleSelectedCount === filteredKeywords.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const hiddenSelectedCount = Math.max(0, selectedIds.size - visibleSelectedCount);
  const architectHandoffGate = useMemo(
    () => evaluateMineradorArquitetoHandoffBatch({
      keywords: effectiveKeywords.filter(item => selectedIds.has(item.id)),
      brandId: selectedBrandId,
      qualifications: semanticQualifications,
    }),
    [effectiveKeywords, selectedBrandId, selectedIds, semanticQualifications],
  );
  const [deleteApprovalOpen, setDeleteApprovalOpen] = useState(false);
  const [deleteSimpleOpen, setDeleteSimpleOpen] = useState(false);
  const [deleteReview, setDeleteReview] = useState<{ ids: string[]; publishedIds: string[]; hardDeleteIds: string[]; impact: DeletionImpactEntry[]; confirmationName: string } | null>(null);
  const [recoverableKeywords, setRecoverableKeywords] = useState<KeywordItem[]>([]);
  const restoreKeywordSnapshot = useCallback((snapshot: KeywordItem[]) => {
    setKeywords(snapshot);
    setProcessAttemptsByKeywordId({});
    setHumanReviewDrafts({});
    setSemanticConsolidationDrafts({});
    setSelectedIds(new Set());
  }, [setSelectedIds]);
  const keywordHistory = useLocalHistory("minerador", keywords, restoreKeywordSnapshot, 30, selectedBrandId || "sem-marca");
  const { undo: undoKeywordHistory, redo: redoKeywordHistory } = keywordHistory;

  /**
   * Lê a Qualificação Semântica persistida das próprias keywords da Marca ativa.
   * Nenhuma chamada de provider acontece aqui: é leitura do artifact canônico.
   */
  const loadSemanticQualifications = useCallback(async (brandId: string, keywordIds: readonly string[]) => {
    const ids = [...new Set(keywordIds.filter(Boolean))];
    if (!brandId || ids.length === 0) return {} as Record<string, KeywordSemanticQualification>;
    const rows = await withSupabaseSelectRetry(async () => {
      const { data, error } = await supabase
        .from("editorial_artifact_versions")
        .select("entity_id,version_number,payload")
        .eq("marca_id", brandId)
        .eq("artifact_type", KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE)
        .in("entity_id", ids)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data || [];
    });
    const current: Record<string, KeywordSemanticQualification> = {};
    for (const row of rows as Array<{ entity_id?: unknown; payload?: unknown }>) {
      const keywordId = typeof row.entity_id === "string" ? row.entity_id : "";
      if (!keywordId || current[keywordId]) continue;
      const parsed = parseKeywordSemanticQualification(row.payload);
      if (!parsed || parsed.brandId !== brandId || parsed.keywordId !== keywordId) continue;
      current[keywordId] = parsed;
    }
    return current;
  }, [supabase]);

  /**
   * Lê a Apresentação Contextual persistida das próprias keywords da Marca.
   * Nenhuma chamada de IA acontece aqui: é leitura do artifact canônico.
   */
  const loadContextualPresentations = useCallback(async (brandId: string, keywordIds: readonly string[]) => {
    const ids = [...new Set(keywordIds.filter(Boolean))];
    if (!brandId || ids.length === 0) return {} as Record<string, KeywordPresentationBrief>;
    const rows = await withSupabaseSelectRetry(async () => {
      const { data, error } = await supabase
        .from("editorial_artifact_versions")
        .select("entity_id,version_number,payload")
        .eq("marca_id", brandId)
        .eq("artifact_type", KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE)
        .in("entity_id", ids)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data || [];
    });
    const current: Record<string, KeywordPresentationBrief> = {};
    for (const row of rows as Array<{ entity_id?: unknown; payload?: unknown }>) {
      const keywordId = typeof row.entity_id === "string" ? row.entity_id : "";
      if (!keywordId || current[keywordId]) continue;
      const parsed = parseKeywordContextualPresentation(row.payload);
      if (!parsed || parsed.brandId !== brandId || parsed.keywordId !== keywordId) continue;
      current[keywordId] = {
        contextualPresentation: {
          text: parsed.output.text,
          generatedAt: parsed.provenance.generatedAt,
          provider: parsed.provenance.provider as KeywordPresentationBrief["contextualPresentation"]["provider"],
          model: parsed.provenance.model,
          status: "generated",
          inputKeywordDnaRef: {
            entityId: parsed.input.inputKeywordDnaRef?.entityId || keywordId,
            versionId: parsed.input.inputKeywordDnaRef?.versionId || "",
            contentHash: parsed.input.inputKeywordDnaRef?.contentHash || "",
          },
          appliedSkillRefs: parsed.input.appliedSkillRefs,
        },
        brandVoiceApplied: brandVoiceAppliedInPresentation(parsed),
        appliedSkillRefs: parsed.input.appliedSkillRefs,
        generatedAt: parsed.provenance.generatedAt,
        persisted: true,
        version: parsed.lifecycle.version,
      };
    }
    return current;
  }, [supabase]);

  const readCanonicalKeywordRows = useCallback(async (ids: readonly string[]): Promise<Map<string, KeywordItem>> => {
    if (!selectedBrandId) throw new Error("Marca ativa ausente para o readback do Processador.");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return new Map();
    const rows = await withSupabaseSelectRetry(async () => {
      const { data, error } = await supabase
        .from("minerador_keywords")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .is("deleted_at", null)
        .in("id", uniqueIds);
      if (error) throw error;
      return (data || []) as KeywordItem[];
    });
    const byId = new Map(rows.map(row => [String(row.id), row]));
    if (byId.size !== uniqueIds.length) {
      throw new Error("O readback canônico do Processador não retornou todas as keywords do lote.");
    }
    return byId;
  }, [selectedBrandId, supabase]);
  // Modal de CriaÃ§Ã£o de Lista
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListNicho, setNewListNicho] = useState("");

  // Modal de ImportaÃ§Ã£o Manual (Copiar e Colar)
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualKeywordsText, setManualKeywordsText] = useState("");
  const [manualListId, setManualListId] = useState("");
  const [manualIntent, setManualIntent] = useState("");
  const [manualNicho, setManualNicho] = useState("");
  const [manualStatus, setManualStatus] = useState("bruto");
  const [manualLocation, setManualLocation] = useState("Brasil");

  // Modal de ExportaÃ§Ã£o
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState("kgr-estrategico-export");

  // Controle do Banner de Palavras Duplicadas
  const [showDuplicateBanner, setShowDuplicateBanner] = useState(true);

  // Estado para a lista alvo da aÃ§Ã£o em lote "Mover para Lista"
  const [targetListId, setTargetListId] = useState("");
  const [siteSyncLoading, setSiteSyncLoading] = useState(false);
  const [siteSyncPersisting, setSiteSyncPersisting] = useState(false);
  const [siteSyncPlan, setSiteSyncPlan] = useState<MineradorSiteSyncPlan | null>(null);
  const [manualSiteCheckKeywordId, setManualSiteCheckKeywordId] = useState<string | null>(null);
  const [manualSiteCheckUrl, setManualSiteCheckUrl] = useState("");
  const [legacyEditorialRecovery, setLegacyEditorialRecovery] = useState<{ keywordId: string; status: EditorialKeywordStatus | "" } | null>(null);
  const [volumeMeasuring, setVolumeMeasuring] = useState(false);
  const [allintitleMeasuring, setAllintitleMeasuring] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [architectHandoffSending, setArchitectHandoffSending] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  const bulkProgressLockRef = useRef(false);
  const bulkProgressResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!moreActionsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreActionsRef.current?.contains(event.target)) setMoreActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreActionsOpen]);

  useEffect(() => () => {
    if (bulkProgressResetTimerRef.current !== null) {
      window.clearTimeout(bulkProgressResetTimerRef.current);
      bulkProgressResetTimerRef.current = null;
    }
  }, []);

  // Avisos do piloto Minerador usam o contrato global.
  const showNotification = useCallback((type: "success" | "error" | "info", message: string, options: { code?: string; stage?: string; persistent?: boolean; diagnostic?: Record<string, unknown>; metadata?: Record<string, unknown> } = {}) => {
    publishNotice({
      severity: type === "success" ? "SUCCESS" : type === "error" ? "ERROR" : "INFO",
      title: "Minerador",
      message,
      details: [options.stage ? `Etapa: ${options.stage}` : "", options.code ? `Código: ${options.code}` : ""].filter(Boolean).join(" · ") || undefined,
      metadata: options.metadata,
      copyPayload: options.diagnostic,
      source: type === "success" ? "persistence" : "workflow",
      confirmed: type === "success",
      module: "minerador",
      area: "Minerador",
    });
  }, [publishNotice]);

  const setProcessAttempt = useCallback((keywordIds: readonly string[], step: MineradorProcessName, state: Exclude<MineradorAttemptState, "not_run">, operationId?: string) => {
    const finishedAt = state === "running" ? undefined : new Date().toISOString();
    setProcessAttemptsByKeywordId(previous => {
      const next = { ...previous };
      for (const keywordId of keywordIds) {
        const current = next[keywordId] || {};
        next[keywordId] = {
          ...current,
          [step]: {
            ...(current[step] || {}),
            state,
            ...(operationId ? { operationId } : {}),
            ...(state === "running" ? { startedAt: new Date().toISOString() } : { finishedAt }),
          },
        };
      }
      return next;
    });
  }, []);

  const startBulkProgress = useCallback((step: BulkProgressStep, total: number | null = null, keywordIds?: readonly string[], operationId?: string) => {
    if (bulkProgressLockRef.current) return false;
    if (bulkProgressResetTimerRef.current !== null) {
      window.clearTimeout(bulkProgressResetTimerRef.current);
      bulkProgressResetTimerRef.current = null;
    }
    bulkProgressLockRef.current = true;
    setBulkProgress({
      status: "processing",
      step,
      current: 0,
      total: total && total > 0 ? total : null,
      message: "",
      detail: "",
    });
    setProcessAttempt(keywordIds || [...selectedIds], step, "running", operationId);
    return true;
  }, [selectedIds, setProcessAttempt]);

  const updateBulkProgress = useCallback((current: number, total?: number | null, message?: string, detail?: string) => {
    setBulkProgress(previous => {
      if (previous.status !== "processing") return previous;
      const resolvedTotal = total === undefined ? previous.total : total && total > 0 ? total : null;
      return {
        ...previous,
        current: resolvedTotal === null ? Math.max(0, current) : Math.min(resolvedTotal, Math.max(0, current)),
        total: resolvedTotal,
        ...(message !== undefined ? { message } : {}),
        ...(detail !== undefined ? { detail } : {}),
      };
    });
  }, []);

  const finishBulkProgress = useCallback((status: Exclude<BulkProgressStatus, "idle" | "processing">, message?: string) => {
    bulkProgressLockRef.current = false;
    setBulkProgress(previous => ({
      ...previous,
      status,
      current: status === "success" && previous.total ? previous.total : previous.current,
      message: message || (status === "success" ? "Concluído" : "Falhou"),
      detail: message || (status === "success" ? "Concluído" : "Falhou"),
    }));
    if (bulkProgressResetTimerRef.current !== null) window.clearTimeout(bulkProgressResetTimerRef.current);
    bulkProgressResetTimerRef.current = window.setTimeout(() => {
      bulkProgressResetTimerRef.current = null;
      setBulkProgress(initialBulkProgressState);
    }, 1800);
  }, []);

  const handleDiscoverySourceComplete = useCallback((payload: DiscoverySourceResponse) => {
    const count = payload.summary.approved;
    showNotification("success", `${count} keyword(s) ${count === 1 ? "adicionada" : "adicionadas"} à Descoberta. Abra Descobrir Keywords para revisar.`);
  }, [showNotification]);
  const discoverySourceActions = useMemo(() => <DiscoverySourceTopbarActions onManual={() => discoverySourceControlsRef.current?.openManual()} onCsv={() => discoverySourceControlsRef.current?.openCsv()} />, []);

  const pushKeywordsHistory = (snapshot = keywords, label = "Alteração na planilha de keywords") => keywordHistory.capture(label, snapshot);

  const undoKeywords = useCallback(() => {
    undoKeywordHistory();
    showNotification("success", "Voltando uma alteração na lista atual.");
  }, [showNotification, undoKeywordHistory]);

  const redoKeywords = useCallback(() => {
    redoKeywordHistory();
    showNotification("success", "Refazendo alteração na lista atual.");
  }, [redoKeywordHistory, showNotification]);

  const processLogicalKeywordDna = async (
    sourceKeywords: KeywordItem[],
    sourceLists: ListObject[],
    options: { persist: boolean; showProgress: boolean },
  ) => {
    const listById = new Map(sourceLists.map(list => [list.id, list]));
    const updatedItems: KeywordItem[] = [];
    const pendingUpdates: Array<{ id: string; intent: string; analise_semantica: Record<string, unknown> }> = [];
    const logicalChangedIds: string[] = [];
    const processedAt = new Date().toISOString();

    if (options.showProgress) {
      setDnaProcessing(true);
      setDnaProgress({ current: 0, total: sourceKeywords.length });
      updateBulkProgress(0, sourceKeywords.length);
    }

    for (const [index, item] of sourceKeywords.entries()) {
      const list = item.lista_id ? listById.get(item.lista_id) : null;
      const intentOrigin = String(item.analise_semantica?.intencao_origem || item.analise_semantica?.intent_source || "").toLowerCase();
      const semanticDnaOrigin = String(item.analise_semantica?.dna_origem || "").toLowerCase();
      const humanIntentProtected = ["human", "humano", "manual", "humana"].includes(intentOrigin)
        || ["human", "humano", "manual", "humana"].includes(semanticDnaOrigin)
        || ["aprovado", "confirmado", "confirmed"].includes(String(item.analise_semantica?.dna_revisao_humana || "").toLowerCase());
      const nicheProtected = humanNicheProtected(item.analise_semantica);
      const niche = (nicheProtected ? logicalNiche(item.analise_semantica?.nicho_override) : null)
        || logicalNiche(list?.nicho)
        || logicalNiche(autoDetectNiche(item.keyword));
      const existingIntent = item.intent || (typeof item.analise_semantica?.intencao_principal === "string" ? item.analise_semantica.intencao_principal : null);
      // Existing values are context only. The current engine runs again for
      // every explicit selection; only an explicit human decision is protected.
      const intentForDerivation = humanIntentProtected ? existingIntent : null;
      const logical = deriveLogicalKeywordDna({
        keywordId: item.id,
        keyword: item.keyword,
        intent: intentForDerivation,
        niche,
        location: item.location,
        existingSemantic: item.analise_semantica,
      });
      const logicalSemantic = mergeLogicalKeywordSemantic(item.analise_semantica, logical.semantic, { forceLogical: true });
      if (niche) {
        logicalSemantic.nicho_override = niche;
        logicalSemantic.nicho = niche;
        if (!nicheProtected) logicalSemantic.nicho_origem = "logico_deterministico";
      } else if (!nicheProtected) {
        delete logicalSemantic.nicho_override;
        delete logicalSemantic.nicho;
        delete logicalSemantic.nicho_origem;
      }
      const storedIntent = humanIntentProtected && item.intent && normalizeIntentKey(item.intent) !== "unknown" ? item.intent : null;
      const semanticIntent = typeof logicalSemantic.intencao_principal === "string" && normalizeIntentKey(logicalSemantic.intencao_principal) !== "unknown"
        ? logicalSemantic.intencao_principal
        : null;
      const intent = storedIntent || semanticIntent || logical.intentLabel || canonicalIntentLabel(logical.dna.searchIntent);
      const funnelProtected = humanFunnelProtected(item.analise_semantica);
      if (!funnelProtected) {
        delete logicalSemantic.funnel;
        delete logicalSemantic.funnel_source;
        delete logicalSemantic.funnel_confidence;
        delete logicalSemantic.funnel_review_required;
        delete logicalSemantic.funnel_evidence;
      }
      const funnelQualification = classifyKeywordFunnel({
        keyword: item.keyword,
        intent,
        niche,
        location: item.location,
        semantic: logicalSemantic,
      });
      const semantic = applyFunnelQualification(logicalSemantic, funnelQualification);
      semantic.logical_output_contract = buildLogicalOutputContract({
        semantic,
        intent,
        niche,
        funnel: semantic.funnel,
      });
      const logicalOutput = validateLogicalKeywordOutput({ semantic, intent });
      if (!logicalOutput.valid || !hasCompleteLogicalOutputContract({ semantic, intent })) {
        throw new Error(`A leitura lógica não completou o contrato de saída: ${logicalOutput.missingFields.join(", ")}.`);
      }
      Object.assign(semantic, buildLogicalProcessorMetadata({ keywordId: item.id, keyword: item.keyword, location: item.location, niche }, processedAt));
      const next = { ...item, intent, analise_semantica: semantic };
      updatedItems.push(next);

      const logicalChanged = !logicalSemanticRecordsEqual(item.analise_semantica, semantic) || item.intent !== intent;
      if (logicalChanged) logicalChangedIds.push(item.id);
      const metadataCurrent = hasCurrentLogicalProcessorMetadata({
        keywordId: item.id,
        keyword: item.keyword,
        location: item.location,
        niche,
        semantic,
      });
      if (logicalChanged || !metadataCurrent) {
        pendingUpdates.push({ id: item.id, intent, analise_semantica: semantic });
      }
      if (options.showProgress) {
        setDnaProgress({ current: index + 1, total: sourceKeywords.length });
        updateBulkProgress(index + 1, sourceKeywords.length);
        if (index === 0 || (index + 1) % 10 === 0 || index === sourceKeywords.length - 1) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        }
      }
    }

    let failed = 0;
    const failedIds: string[] = [];
    if (options.persist) {
      for (let offset = 0; offset < pendingUpdates.length; offset += 20) {
        const chunk = pendingUpdates.slice(offset, offset + 20);
        const results = await Promise.allSettled(chunk.map(async update => {
          const { error } = await supabase
            .from("minerador_keywords")
            .update({ intent: update.intent, analise_semantica: update.analise_semantica })
            .eq("id", update.id)
            .eq("brand_id", selectedBrandId)
            .is("deleted_at", null);
          if (error) throw error;
          return update.id;
        }));
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            failed += 1;
            failedIds.push(chunk[index].id);
          }
        });
      }
    }

    if (options.showProgress) setDnaProcessing(false);
    const sourceById = new Map(sourceKeywords.map(item => [item.id, item]));
    let persistedById: Map<string, KeywordItem> | null = null;
    if (options.persist) persistedById = await readCanonicalKeywordRows(sourceKeywords.map(item => item.id));
    if (options.persist && persistedById) {
      const failedIdSet = new Set(failedIds);
      for (const expected of updatedItems) {
        if (failedIdSet.has(expected.id)) continue;
        const source = sourceById.get(expected.id);
        const readback = persistedById.get(expected.id);
        const valid = Boolean(source && readback
          && readback.intent === expected.intent
          && hasCompleteLogicalOutputContract({ semantic: readback.analise_semantica, intent: expected.intent })
          && hasCurrentLogicalProcessorMetadata({
            keywordId: expected.id,
            keyword: source.keyword,
            location: source.location,
            niche: (typeof expected.analise_semantica?.nicho_override === "string" ? logicalNiche(expected.analise_semantica.nicho_override) : null)
              || (typeof expected.analise_semantica?.nicho === "string" ? logicalNiche(expected.analise_semantica.nicho) : null),
            semantic: readback.analise_semantica,
          }));
        if (!valid) {
          failed += 1;
          failedIds.push(expected.id);
          failedIdSet.add(expected.id);
        }
      }
    }
    const failedSet = new Set(failedIds);
    const persistedItems = updatedItems.map(item => {
      if (failedSet.has(item.id)) return sourceById.get(item.id) || item;
      return persistedById?.get(item.id) || item;
    });
    return { items: persistedItems, changed: logicalChangedIds.length, failed, failedIds, logicalChangedIds };
  };

  const handleQualifySelected = async () => {
    const targets = keywords.filter(keyword => selectedIds.has(keyword.id));
    if (targets.length === 0) {
      showNotification("error", "Selecione pelo menos uma keyword para processar a lógica.");
      return;
    }
    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("logic", targets.length, targets.map(item => item.id), executionRequestId)) return;

    let outcome: "success" | "error" = "success";
    try {
      pushKeywordsHistory(keywords, `Processar lógica de ${targets.length} keyword(s)`);
      const result = await processLogicalKeywordDna(targets, lists, { persist: true, showProgress: true });
      const byId = new Map(result.items.map(item => [item.id, item]));
      const failedIds = new Set(result.failedIds);
      const logicalChangedIds = new Set(result.logicalChangedIds);
      setProcessAttempt(result.failedIds, "logic", "failed", executionRequestId);
      setProcessAttempt(targets.filter(item => !failedIds.has(item.id)).map(item => item.id), "logic", "success", executionRequestId);
      setQualificationResults(targets.map(item => {
        const updated = byId.get(item.id) || item;
        const semantic = updated.analise_semantica || {};
        const funnel = funnelLabelFor(updated);
        const status: QualificationResult["status"] = failedIds.has(item.id)
          ? "falha"
          : semantic.funnel_source === "human"
          ? "preservada"
          : semantic.funnel_review_required === "sim"
          ? "conflito"
          : !logicalChangedIds.has(item.id) && item.intent === updated.intent
          ? "sem_alteracao"
          : "processada";
        return {
          id: item.id,
          keyword: item.keyword,
          status,
          intent: readLogicalIntentLabel(updated),
          funnel,
          niche: String(readLogicalNiche(updated) || "Não determinado"),
          bias: String(semantic.potencial_comercial || semantic.gatilho_de_conversao || "Não identificado"),
          confidence: String(semantic.funnel_confidence || semantic.dna_confianca || "Pendente"),
        };
      }));
      setKeywords(current => current.map(item => byId.get(item.id) || item));
      if (result.failed > 0) {
        outcome = "error";
        showNotification("error", `${result.changed - result.failed} processadas; ${result.failed} falharam ao salvar.`, {
          code: "LOGIC_PARTIAL_RESULTS",
          stage: "canonical_readback",
          metadata: { executionRequestId },
        });
      } else {
        showNotification("success", `${targets.length} keyword(s) processadas; leitura lógica atualizada para revisão humana.`, {
          metadata: { executionRequestId },
        });
      }
    } catch (error) {
      outcome = "error";
      setProcessAttempt(targets.map(item => item.id), "logic", "failed", executionRequestId);
      console.error("Erro ao processar lógica das keywords:", error);
      setDnaProcessing(false);
      showNotification("error", "Não foi possível qualificar as keywords selecionadas.", {
        code: "LOGIC_OUTPUT_CONTRACT_FAILED",
        stage: "required_output_contract",
        metadata: { executionRequestId },
      });
    } finally {
      finishBulkProgress(outcome);
    }
  };

  const loadRecoverableKeywords = useCallback(async (brandId: string): Promise<KeywordItem[]> => {
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/keywords/recoverable`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) {
      // The operational grid can remain usable while a pending migration is
      // being reviewed; no local row is treated as recoverable on an error.
      return [];
    }
    return Array.isArray(body.items) ? body.items as KeywordItem[] : [];
  }, []);

  // Carrega listas e keywords iniciais do Supabase
  const fetchData = async () => {
    if (sessionStatus !== "authenticated") return;
    if (!selectedBrandId) {
      fetchDataInFlightRef.current = null;
      fetchDataActiveKeyRef.current = null;
      setLists([]);
      setKeywords([]);
      setHumanReviewDrafts({});
      setTargetListId("");
      setSiteSyncPlan(null);
      fetchDataLoadedKeyRef.current = null;
      setLoading(false);
      return;
    }
    const fetchKey = `${selectedBrandId || "sem-marca"}|${sessionStatus}`;
    if (fetchDataInFlightRef.current === fetchKey || fetchDataLoadedKeyRef.current === fetchKey) return;
    fetchDataInFlightRef.current = fetchKey;
    fetchDataActiveKeyRef.current = fetchKey;
    setSiteSyncPlan(null);
    setLoading(true);
    try {
      await getCurrentSupabaseToken();
      // 1. Carrega todas as listas de KGR (Categorias/Silos) filtradas por marca_id
      const loadedLists = await withSupabaseSelectRetry(async () => {
        const { data: listsData, error: listsError } = await supabase
          .from("minerador_keyword_lists")
          .select("*")
          .eq("marca_id", selectedBrandId)
          .order("nome", { ascending: true });
        if (listsError) throw listsError;
        return listsData || [];
      });
      if (fetchDataActiveKeyRef.current !== fetchKey) return;
      setLists(loadedLists);

      // Define a primeira lista alvo no lote se houver listas
      if (loadedLists.length > 0) {
        setTargetListId(loadedLists[0].id);
      } else {
        setTargetListId("");
      }

      // 2. Carrega as keywords pertencentes a estes silos ou sem silo (lista_id is null)
      const loadedKeywords = await withSupabaseSelectRetry(async () => {
        const allowedListIds = loadedLists.map(l => l.id);
        let query = supabase
          .from("minerador_keywords")
           .select("*")
           .eq("brand_id", selectedBrandId)
           .is("deleted_at", null)
           .order("created_at", { ascending: false });

        if (allowedListIds.length > 0) {
          const orFilter = `lista_id.is.null,${allowedListIds.map(id => `lista_id.eq.${id}`).join(",")}`;
          query = query.or(orFilter);
        } else {
          query = query.is("lista_id", null);
        }

        const { data: keywordsData, error: keywordsError } = await query;
        if (keywordsError) throw keywordsError;
        return keywordsData || [];
      });

      // B. Auto-atribuiÃ§Ã£o de nicho para listas que nÃ£o possuem nicho definido
      const listsWithoutNicho = loadedLists.filter(l => !l.nicho || l.nicho === "Geral" || l.nicho.trim() === "");
      if (listsWithoutNicho.length > 0 && loadedKeywords.length > 0) {
        const listPromises = listsWithoutNicho.map(async (list) => {
          const listKws = loadedKeywords.filter(k => k.lista_id === list.id);
          if (listKws.length > 0) {
            const detectedNicho = autoDetectNiche(listKws[0].keyword);
            await supabase
              .from("minerador_keyword_lists")
              .update({ nicho: detectedNicho })
              .eq("id", list.id)
              .eq("marca_id", selectedBrandId);
            list.nicho = detectedNicho; // atualiza na memÃ³ria
          }
        });
        await Promise.all(listPromises);
        setLists([...loadedLists]);
      }

      if (fetchDataActiveKeyRef.current !== fetchKey) return;
      // A qualificação de keywords é sempre explícita; o carregamento não deriva nem persiste DNA ou Funil.
      setKeywords(loadedKeywords);
      setProcessAttemptsByKeywordId({});
      setHumanReviewDrafts({});
      // Reidratação server-side: a Qualificação Semântica sobrevive a F5, nova
      // aba e outro navegador, sem nenhuma chamada DataForSEO.
      // A leitura do artifact é tolerante: uma falha de rede não pode apagar da
      // tela uma Qualificação remota válida.
      const persistedQualifications = await loadSemanticQualifications(selectedBrandId, loadedKeywords.map(item => String(item.id)))
        .catch(() => null);
      // A Apresentação Contextual persistida reidrata pelo mesmo princípio:
      // artifact remoto > working copy > estado vazio, e falha não apaga nada.
      const persistedPresentations = await loadContextualPresentations(selectedBrandId, loadedKeywords.map(item => String(item.id)))
        .catch(() => null);
      if (persistedPresentations) setPresentationBriefs(current => ({ ...current, ...persistedPresentations }));
      if (persistedQualifications) {
        setSemanticQualifications(current => ({ ...current, ...persistedQualifications }));
        setSemanticConsolidationDrafts(current => {
          const next = { ...current };
          for (const [keywordId, qualification] of Object.entries(persistedQualifications)) {
            const keyword = loadedKeywords.find(item => String(item.id) === keywordId);
            const logic = keyword ? readCanonicalKeywordDna(keyword) : null;
            next[keywordId] = semanticDraftFromQualification(qualification, { intent: logic?.intent ?? null, funnel: logic?.funnel ?? null });
          }
          return next;
        });
      }
      setRecoverableKeywords(await loadRecoverableKeywords(selectedBrandId));

      fetchDataLoadedKeyRef.current = fetchKey;
      setSelectedIds(new Set());
      setQualificationResults([]);
    } catch (err: any) {
      const authError = isSupabaseBrowserAuthError(err);
      console.error("Erro ao carregar dados do Supabase:", {
        code: authError ? err.code : err?.code,
        tokenExpired: authError ? isSupabaseTokenExpirationError(err) : false,
        ...(authError ? err.diagnostic : {}),
        table: "minerador_keyword_lists/minerador_keywords",
        operation: "select",
        message: authError ? undefined : err?.message,
      });
      showNotification(
        "error",
        authError ? getSupabaseSessionErrorMessage(err.code, err.expiresAt) : `Erro: ${err.message || "Erro de rede"}`,
      );
    } finally {
      if (fetchDataInFlightRef.current === fetchKey) fetchDataInFlightRef.current = null;
      if (fetchDataActiveKeyRef.current === fetchKey) setLoading(false);
    }
  };

  const handleCheckWithSite = async (singleKeywordId?: string) => {
    const effectiveSelectedIds = singleKeywordId ? new Set([singleKeywordId]) : selectedIds;
    if (effectiveSelectedIds.size === 0) { showNotification("error", "Selecione pelo menos uma keyword antes de conferir o site."); return; }
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca antes de conferir o site."); return; }
    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("site", effectiveSelectedIds.size, [...effectiveSelectedIds], executionRequestId)) return;
    let outcome: "success" | "error" = "error";
    setSiteSyncLoading(true);
    try {
      if (!session?.user?.id) { showNotification("error", "Sessão não disponível para ler o Site/Sitemap local."); return; }
      const snapshot = await loadMineradorSiteSyncSnapshot(session.user.id, selectedBrandId);
      const selectedItems = keywords.filter(item => effectiveSelectedIds.has(item.id));
      const selectedTexts = new Set(selectedItems.map(item => item.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
      const catalogCandidates = uniqueSiteSyncCandidates(snapshot.candidates).filter(candidate => selectedTexts.has((candidate.normalizedText || candidate.text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
      const storedEvidenceCandidates = selectedItems.map(item => candidateFromStoredSiteEvidence(item, selectedBrandId)).filter((candidate): candidate is MineradorSiteSyncCandidate => Boolean(candidate));
      const candidates = uniqueSiteSyncCandidates([...catalogCandidates, ...storedEvidenceCandidates]);
      if (candidates.length === 0) {
        if (effectiveSelectedIds.size !== 1) {
        showNotification("info", "Para conferir uma URL informada manualmente, selecione somente uma keyword.", { metadata: { executionRequestId } });
          return;
        }
        const keywordId = [...effectiveSelectedIds][0];
        setManualSiteCheckKeywordId(keywordId);
        setManualSiteCheckUrl(activeBrand?.site_url || "");
        outcome = "success";
        showNotification("info", "Nenhuma URL foi localizada no catálogo. Informe a página da marca para conferir este vínculo.", { metadata: { executionRequestId } });
        return;
      }
      const checkedAt = new Date().toISOString();
      const verifiedCandidates: typeof candidates = [];
      for (const candidate of candidates) {
        const response = await fetch("/api/marca/site/page/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: selectedBrandId, url: candidate.resolvedUrl || candidate.sourceUrl }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok && !body?.verificationStatus) throw new Error(body?.error || `Não foi possível conferir a página de ${candidate.text}.`);
        verifiedCandidates.push(withSiteVerification(candidate, body, checkedAt));
      }
      const plan = buildMineradorSiteSyncPlan(verifiedCandidates, keywords, targetListId);
      setSiteSyncPlan(plan);
      outcome = "success";
      showNotification("success", `Conferência pronta: ${plan.summary.new} nova(s), ${plan.summary.updated} evidência(s) a atualizar e ${plan.summary.unchanged} sem alteração.`, { metadata: { executionRequestId } });
    } catch (error) {
      console.error("Erro ao conferir Site/Sitemap no Minerador:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível ler o catálogo Site/Sitemap.", { metadata: { executionRequestId } });
    } finally {
      setSiteSyncLoading(false);
      // This action only creates a preview. It is not a completed persisted
      // site-check artifact; promotion happens in the confirmation action.
      // A successful preview is therefore a successful attempt, not a green
      // artifact. A failed preview remains visibly failed without erasing a
      // previously promoted site artifact.
      setProcessAttempt([...effectiveSelectedIds], "site", outcome === "success" ? "success" : "failed", executionRequestId);
      finishBulkProgress(outcome);
    }
  };

  const handleManualSiteCheck = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualSiteCheckKeywordId || !selectedBrandId) return;
    const keyword = keywords.find(item => item.id === manualSiteCheckKeywordId);
    const requestedUrl = manualSiteCheckUrl.trim();
    if (!keyword || !requestedUrl) { showNotification("error", "Informe a URL da página antes de conferir."); return; }
    let parsedUrl: URL;
    try { parsedUrl = new URL(requestedUrl); } catch { showNotification("error", "Informe uma URL válida da página da marca."); return; }
    setSiteSyncLoading(true);
    try {
      const response = await fetch("/api/marca/site/page/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, url: parsedUrl.toString() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && !body?.verificationStatus) throw new Error(body?.error || "Não foi possível conferir a URL informada.");
      const normalizedText = keyword.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
      const candidate = withSiteVerification({
        id: crypto.randomUUID(),
        brandId: selectedBrandId,
        text: keyword.keyword,
        normalizedText,
        catalogEntryId: null,
        sourceKind: "manual_url",
        sourceUrl: parsedUrl.toString(),
        sourceField: "other",
        sourceFields: ["other"],
        suggestedRole: "unclassified",
        slugCoherence: "unknown",
        urlSituation: "unverified",
        publicationStatus: "not_confirmed",
        keywordUrlRelation: "undefined",
        architectureStatus: "awaiting_architecture",
        relationConfirmedBy: null,
        relationConfirmedAt: null,
        confidence: "medium",
        resolvedUrl: null,
        declaredCanonicalUrl: null,
        catalogTitle: null,
      }, body, new Date().toISOString());
      setSiteSyncPlan(buildMineradorSiteSyncPlan([candidate], keywords, targetListId || null));
      setManualSiteCheckKeywordId(null);
      showNotification("success", "URL conferida. Nada será publicado até uma confirmação humana explícita.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível conferir a URL informada.");
    } finally {
      setSiteSyncLoading(false);
    }
  };

  const handleConfirmSiteSync = async () => {
    if (!siteSyncPlan || !selectedBrandId) return;
    const candidates = siteSyncPlan.items.filter(item => ["new", "evidence_updated", "no_change"].includes(item.outcome)).map(item => item.candidate);
    if (!candidates.length) { showNotification("error", "A prévia não possui itens válidos para persistir."); return; }
    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("site", candidates.length, selectedIds.size ? [...selectedIds] : undefined, executionRequestId)) return;
    let outcome: "success" | "error" = "error";
    const batchId = crypto.randomUUID();
    setSiteSyncPersisting(true);
    try {
      const response = await fetch("/api/marca/site/import/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, targetListId: targetListId || null, batchId, candidates }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.persisted !== true || !["completed", "partial"].includes(body.status)) throw new Error(body.error || "O Minerador não confirmou a persistência da conferência.");
      outcome = body.status === "partial" ? "error" : "success";
      const resultItems = Array.isArray(body.items) ? body.items as Array<{ candidateId: string; outcome: string; mineradorKeywordId: string | null }> : [];
      const persistedIds = resultItems
        .filter(result => ["imported", "existing_in_minerador", "evidence_updated", "no_change"].includes(result.outcome))
        .map(result => result.mineradorKeywordId)
        .filter((id): id is string => Boolean(id));
      const { data: readbackRows, error: readbackError } = persistedIds.length > 0
        ? await supabase.from("minerador_keywords").select("*").in("id", persistedIds).eq("brand_id", selectedBrandId).is("deleted_at", null)
        : { data: [], error: null };
      if (readbackError) throw readbackError;
      const readbackById = new Map((readbackRows || []).map(row => [String(row.id), row as KeywordItem]));
      if (readbackById.size !== new Set(persistedIds).size) throw new Error("A conferência foi gravada, mas o readback da marca ativa não foi confirmado.");
      setProcessAttempt(persistedIds, "site", "success", executionRequestId);
      setProcessAttempt(resultItems.filter(result => !result.mineradorKeywordId || !readbackById.has(result.mineradorKeywordId)).map(result => result.mineradorKeywordId || "").filter(Boolean), "site", "failed", executionRequestId);
      setKeywords(current => {
        const next = [...current];
        for (const result of resultItems) {
          if (!["imported", "existing_in_minerador", "evidence_updated", "no_change"].includes(result.outcome)) continue;
          if (!result.mineradorKeywordId) continue;
          const readbackItem = readbackById.get(result.mineradorKeywordId);
          if (!readbackItem || readbackItem.brand_id !== selectedBrandId) continue;
          const index = next.findIndex(item => item.id === result.mineradorKeywordId);
          if (index >= 0) next[index] = readbackItem;
          else next.push(readbackItem);
        }
        return next;
      });
      showNotification("success", body.status === "partial" ? "Conferência persistida parcialmente; revise os itens com falha." : "Conferência Site/Sitemap persistida no Minerador.", { metadata: { executionRequestId } });
      setSiteSyncPlan(null);
    } catch (error) {
      console.error("Erro ao persistir conferência Site/Sitemap:", error);
      setProcessAttempt(selectedIds.size ? [...selectedIds] : [], "site", "failed", executionRequestId);
      showNotification("error", error instanceof Error ? error.message : "Falha ao persistir a conferência Site/Sitemap.", { metadata: { executionRequestId } });
    } finally {
      setSiteSyncPersisting(false);
      finishBulkProgress(outcome);
    }
  };

  const handlePublicationLinkAction = async (item: KeywordItem, action: "confirm" | "correct_legacy" | "unlink", requestedEditorialStatus: EditorialKeywordStatus | "" = "") => {
    if (!selectedBrandId || !session?.user?.id) return;
    const currentView = readPublicationLink({ status: item.status, evidence: readSiteOrigin(item.analise_semantica) });
    if (action === "correct_legacy" && (!requestedEditorialStatus || !mineradorWorkflowStatuses.includes(requestedEditorialStatus))) {
      showNotification("info", "Escolha o estado editorial que deve permanecer depois da correção da marcação.");
      return;
    }
    const requestedStatusLabel = requestedEditorialStatus ? resolveEditorialKeywordStatus(requestedEditorialStatus).label : null;
    const confirmation = action === "confirm"
      ? `Confirmar a página de “${item.keyword}” como publicação da marca?\n\nA confirmação é humana e não altera o status editorial.`
      : action === "correct_legacy"
        ? `Corrigir a marcação legada de “${item.keyword}”?\n\nO status editorial ficará como “${requestedStatusLabel}”. A URL, o canonical e o histórico serão preservados; apenas a promoção não verificada será removida.`
        : `Desvincular a publicação de “${item.keyword}”?\n\nA URL, o canonical e o histórico serão preservados.`;
    if (!window.confirm(confirmation)) return;
    if (action === "confirm" && currentView.state !== "verified") return;
    if (action === "correct_legacy" && currentView.state !== "legacy_unverified") return;
    if (action === "unlink" && currentView.state !== "published") return;
    const changedAt = new Date().toISOString();
    const result = applyPublicationLinkAction(item.analise_semantica, { action, actorId: session.user.id, changedAt, status: item.status });
    if (!result.changed) { showNotification("error", result.reason || "O vínculo não pôde ser atualizado."); return; }
    setUpdating(true);
    try {
      const payload: Record<string, unknown> = { analise_semantica: result.semantic };
      if (action === "correct_legacy" && requestedEditorialStatus) payload.status = requestedEditorialStatus;
      const { error } = await supabase.from("minerador_keywords").update(payload).eq("id", item.id).eq("brand_id", selectedBrandId).is("deleted_at", null);
      if (error) throw error;
      const { data: readback, error: readbackError } = await supabase.from("minerador_keywords").select("id,brand_id,status,analise_semantica").eq("id", item.id).eq("brand_id", selectedBrandId).is("deleted_at", null).maybeSingle();
      if (readbackError) throw readbackError;
      if (!readback || readback.brand_id !== selectedBrandId) throw new Error("O vínculo não pertence à marca ativa após o salvamento.");
      const readbackView = readPublicationLink({ status: readback.status, evidence: readSiteOrigin(readback.analise_semantica as Record<string, unknown> | null) });
      if (action === "confirm" && readbackView.state !== "published") throw new Error("O readback não confirmou a publicação.");
      if (action === "unlink" && readbackView.state === "published") throw new Error("O readback ainda indica uma publicação ativa.");
      if (action === "correct_legacy" && (String(readback.status || "").toLowerCase() !== requestedEditorialStatus || resolveEditorialKeywordStatus(readback.status).kind !== "resolved" || readbackView.state === "legacy_unverified")) {
        throw new Error("O readback não confirmou o status editorial escolhido e a remoção do vínculo legado.");
      }
      setKeywords(current => current.map(keyword => keyword.id === item.id ? { ...keyword, ...(action === "correct_legacy" ? { status: readback.status } : {}), analise_semantica: readback.analise_semantica as KeywordSemantic } : keyword));
      if (action === "correct_legacy") setLegacyEditorialRecovery(null);
      showNotification("success", action === "confirm" ? "Vínculo confirmado como publicação." : action === "unlink" ? "Publicação desvinculada; histórico preservado." : "Marcação legada corrigida; status editorial e vínculo atualizados.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível atualizar o vínculo de publicação.");
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchData();
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
    }
  }, [selectedBrandId, sessionStatus, supabase]);

  // Redireciona o Admin para /marcas apenas se NENHUMA marca estiver selecionada
  useEffect(() => {
    if (sessionStatus === "authenticated" && userRole === "admin" && !selectedBrandId) {
      router.push("/marcas");
    }
  }, [sessionStatus, userRole, selectedBrandId, router]);

  // AÃ§Ã£o: Exportar selecionadas para CSV Local
  const exportSelectedToCSV = (fileName: string) => {
    if (selectedIds.size === 0) {
      showNotification("error", "Selecione pelo menos uma palavra-chave para exportar.");
      return;
    }

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));

    // Passo 2: Varre todas as chaves Ãºnicas presentes dentro dos objetos analise_semantica
    const uniqueKeysSet = new Set<string>();
    selectedKeywords.forEach(k => {
      if (k.analise_semantica && typeof k.analise_semantica === "object") {
        Object.keys(k.analise_semantica).forEach(key => {
          uniqueKeysSet.add(key);
        });
      }
    });

    const dynamicKeys = Array.from(uniqueKeysSet).filter(key => !["nicho_override", "site_origin", "site_origins", "kgr_aplicabilidade", "kgr_decisao", "kgr_decisao_origem", "kgr_decidido_por", "kgr_decidido_em", "kgr_decisao_versao", "kgr_decisao_historico", "kgr_justificativa"].includes(key));

    // Mapeamento de rÃ³tulos amigÃ¡veis para chaves conhecidas do cardÃ¡pio
    const formatKeyLabel = (k: string) => {
      const labels: Record<string, string> = {
        urgencia_tempo: "UrgÃªncia Tempo",
        intencao_local: "IntenÃ§Ã£o Local",
        perfil_b2b: "Perfil B2b",
        emocao_dominante: "EmoÃ§Ã£o Dominante",
        nivel_consciencia: "NÃ­vel ConsciÃªncia",
        "objecao_implÃ­cita": "ObjeÃ§Ã£o ImplÃ­cita",
        objecao_implicita: "ObjeÃ§Ã£o ImplÃ­cita",
        poder_aquisitivo: "Poder Aquisitivo",
        gatilho_de_conversao: "Gatilho ConversÃ£o"
      };
      if (labels[k]) return labels[k];
      return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    // Passo 3: Cria os objetos planos achatando as colunas fixas e as chaves dinÃ¢micas
    const flatData = selectedKeywords.map(k => {
      const canonicalSnapshot = resolveCanonicalKeywordSnapshot({ ...k, attempts: processAttemptsByKeywordId[k.id] });
      const automaticKgrScore = canonicalSnapshot.metrics.kgr.score;
      const volumeKgrConsistency = assessVolumeKgrConsistency({ volume: canonicalSnapshot.metrics.volume.value, results: canonicalSnapshot.metrics.result.value, kgrScore: automaticKgrScore, semantic: k.analise_semantica });
      // Colunas fixas obrigatÃ³rias
      const row: Record<string, any> = {
        "Palavra-Chave": k.keyword || "",
        "Resultados": canonicalSnapshot.metrics.result.value !== null ? canonicalSnapshot.metrics.result.value : "",
        "Volume": canonicalSnapshot.metrics.volume.value !== null ? canonicalSnapshot.metrics.volume.value : "",
        "KGR": automaticKgrScore !== null ? automaticKgrScore.toFixed(3) : "",
        "KGR Aplicabilidade": canonicalSnapshot.metrics.kgr.applicability,
        "KGR Decisão": kgrDecisionLabel(canonicalSnapshot.metrics.kgr.applicability),
        "KGR Estado do cálculo": volumeKgrConsistency === "inconsistent" ? "inconsistent" : classifyKgrMeasurement({ kgrScore: automaticKgrScore, volume: canonicalSnapshot.metrics.volume.value, results: canonicalSnapshot.metrics.result.value }),
        "KGR Fonte": k.volume_source || "",
        "KGR Origem da decisão": k.analise_semantica?.kgr_decisao_origem || "",
        "KGR Decidido por": k.analise_semantica?.kgr_decidido_por || "",
        "KGR Decidido em": k.analise_semantica?.kgr_decidido_em || "",
        "KGR Versão": k.analise_semantica?.kgr_decisao_versao || "",
        "KGR Justificativa": k.analise_semantica?.kgr_justificativa || "",
        "IntenÃ§Ã£o": canonicalSnapshot.semantic.intentLabel,
        "Nicho": canonicalSnapshot.semantic.nicheLabel,
        "Status": k.status || "bruto"
      };

      // Adiciona as colunas dinÃ¢micas encontradas
      dynamicKeys.forEach(dk => {
        const columnHeader = formatKeyLabel(dk);
        const val = k.analise_semantica ? k.analise_semantica[dk] : "";
        row[columnHeader] = val || "";
      });

      return row;
    });

    // Passo 4 & 5: Utiliza Papa.unparse com delimitador ';' para gerar o CSV
    const csvContent = Papa.unparse(flatData, {
      delimiter: ";",
      header: true
    });

    // Adiciona o BOM do UTF-8 (\uFEFF) no inÃ­cio da string para o Excel brasileiro ler acentos perfeitamente
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Garante que a extensÃ£o .csv esteja presente e limpa no nome do arquivo
    let finalFileName = fileName.trim();
    if (!finalFileName) finalFileName = "kgr-estrategico-export";
    if (!finalFileName.toLowerCase().endsWith(".csv")) {
      finalFileName += ".csv";
    }

    // Cria link temporÃ¡rio para download
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", finalFileName);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification("success", `Exportadas ${selectedKeywords.length} palavras no arquivo "${finalFileName}"!`);
  };

  // FunÃ§Ã£o para executar a fila de processamento semÃ¢ntico da IA (DeepSeek)
  const handleBatchAnalyze = async () => {
    if (selectedIds.size === 0) return;
    setQueueProcessing(true);
    setQueueProgress(0);
    setUpdating(true);

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));
    let successCount = 0;
    let failCount = 0;

    try {
      let count = 0;
      for (const item of selectedKeywords) {
        count++;
        setQueueProgress(count);
        try {
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandId: selectedBrandId, keywordId: item.id, keyword: item.keyword })
          });
          const resData = await res.json();
          if (!res.ok || !resData.success) {
            console.error(`Erro ao analisar keyword "${item.keyword}":`, resData.error);
            failCount++;
          } else {
            successCount++;
            // Atualiza a palavra-chave no estado local reativamente com o JSON retornado do DeepSeek
            setKeywords(prev => prev.map(k => k.id === item.id ? { 
              ...k, 
              analise_semantica: resData.data
            } : k));
          }
        } catch (err) {
          console.error(`Falha na requisiÃ§Ã£o para a palavra "${item.keyword}":`, err);
          failCount++;
        }
      }

      if (failCount === 0) {
        showNotification("success", `Análise Semântica de todas as ${successCount} palavras concluída!`);
      } else {
        showNotification("success", `Análise concluída: ${successCount} com sucesso e ${failCount} falhas.`);
      }
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao executar a fila de processamento semÃ¢ntico.");
    } finally {
      setQueueProcessing(false);
      setUpdating(false);
    }
  };

  const readSemanticReviewResponse = useCallback(async (response: Response, keywordIndex: number, totalKeywords: number): Promise<Record<string, unknown>> => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/x-ndjson") || !response.body) {
      return await response.json() as Record<string, unknown>;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> | null = null;
    const consumeLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      if (event.type === "progress" && typeof event.phaseNumber === "number") {
        const phaseNumber = Math.min(3, Math.max(1, event.phaseNumber));
        const label = typeof event.label === "string" ? event.label : "IA";
        updateBulkProgress(
          keywordIndex + phaseNumber / 3,
          totalKeywords,
          `${label} · fase ${phaseNumber}/3`,
          `${event.retry === true ? "tentativa 2 · " : ""}keyword ${keywordIndex + 1} de ${totalKeywords} · fase ${phaseNumber}/3`,
        );
      } else if (event.type === "result") {
        result = event;
      }
    };

    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        consumeLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) consumeLine(buffer);
    if (!result) throw new Error("A revisão IA encerrou sem devolver o resultado final.");
    return result;
  }, [updateBulkProgress]);

  // Ação em lote: revisa o contexto R1-R4 sem sobrescrever o DNA lógico.
  const handleBatchSemanticReview = async () => {
    if (selectedIds.size === 0) return;
    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));
    const executionRequestId = crypto.randomUUID();
    if (selectedKeywords.length === 0 || !startBulkProgress("ai", selectedKeywords.length, selectedKeywords.map(item => item.id), executionRequestId)) return;
    setQueueProcessing(true);
    setQueueProgress(0);
    setUpdating(true);

    let successCount = 0;
    let failCount = 0;
    let outcome: "success" | "error" = "success";
    const failedKeywords: string[] = [];
    const failedDetails: Array<{ keyword: string; code?: string; stage?: string; message?: string; diagnostic?: Record<string, unknown> }> = [];

    try {
      let count = 0;
      for (const item of selectedKeywords) {
        count++;
        try {
          const res = await fetch("/api/process-intent-niche", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandId: selectedBrandId, keywordId: item.id, mode: "semantic_review", userInitiated: true, executionRequestId })
          });
           const resData = await readSemanticReviewResponse(res, count - 1, selectedKeywords.length);
          if (!res.ok || !resData.success) {
            console.warn(`Revisão semântica sem resposta válida para "${item.keyword}":`, resData.error);
            failCount++;
            failedKeywords.push(item.keyword);
            failedDetails.push({
              keyword: item.keyword,
              code: typeof resData.code === "string" ? resData.code : undefined,
              stage: typeof resData.stage === "string" ? resData.stage : undefined,
              message: typeof resData.error === "string" ? resData.error.slice(0, 240) : undefined,
              diagnostic: resData.diagnostic && typeof resData.diagnostic === "object" && !Array.isArray(resData.diagnostic)
                ? resData.diagnostic as Record<string, unknown>
                : undefined,
            });
          } else {
            const persistedById = await readCanonicalKeywordRows([item.id]);
            const readbackItem = persistedById.get(item.id);
            const aiState = readbackItem ? resolveMineradorProcessState(readbackItem).ai : null;
            if (!readbackItem || !aiState?.complete) {
              const error = new Error("A revisão IA foi retornada, mas o readback do KeywordDNA atual não foi confirmado.") as Error & { code?: string; stage?: string };
              error.code = "PROCESSOR_READBACK_FAILED";
              error.stage = "ai_canonical_readback";
              throw error;
            }
            successCount++;
            setProcessAttempt([item.id], "ai", "success", executionRequestId);
            // A revisão é aditiva: nenhuma coluna lógica ou métrica é substituída.
            setKeywords(prev => prev.map(k => k.id === item.id ? readbackItem : k));
          }
        } catch (err) {
          console.warn(`Falha na revisão semântica para a palavra "${item.keyword}":`, err);
          setProcessAttempt([item.id], "ai", "failed", executionRequestId);
          failCount++;
          failedKeywords.push(item.keyword);
          failedDetails.push({
            keyword: item.keyword,
            code: "AI_REQUEST_FAILED",
            stage: "request",
            message: err instanceof Error ? err.message.slice(0, 240) : "Falha na requisição da IA.",
          });
        }
        setQueueProgress(count);
        updateBulkProgress(count, selectedKeywords.length);
      }

      if (failCount === 0) {
        showNotification("success", `Revisão semântica de todas as ${successCount} palavras concluída!`, {
          metadata: { executionRequestId },
        });
      } else {
        outcome = "error";
        const firstFailure = failedDetails[0];
        const notice = resolveSemanticReviewNotice({
          successCount,
          failCount,
          failures: failedDetails,
        });
        showNotification("info", notice.message, {
          code: firstFailure?.code || "AI_RUNTIME_ERROR",
          stage: firstFailure?.stage || "runtime",
          persistent: true,
          diagnostic: {
            failedKeywords: failedKeywords.slice(0, 10),
            failedCount: failCount,
            failures: failedDetails.slice(0, 10),
            providerDiagnostic: firstFailure?.diagnostic ? { ...firstFailure.diagnostic } : undefined,
          },
          metadata: { executionRequestId },
        });
      }
    } catch (err: any) {
      outcome = "error";
      console.error(err);
      setProcessAttempt(selectedKeywords.map(item => item.id), "ai", "failed", executionRequestId);
      showNotification("error", "Erro ao executar a revisão semântica com IA.", {
        code: "AI_REVIEW_EXECUTION_FAILED",
        stage: "execution",
        metadata: { executionRequestId },
      });
    } finally {
      setQueueProcessing(false);
      setUpdating(false);
      finishBulkProgress(outcome);
    }
  };

  // Memo para identificar grupos de palavras-chave duplicadas
  const duplicateGroups = useMemo(() => {
    const counts: Record<string, KeywordItem[]> = {};
    filteredKeywords.forEach(k => {
      const key = k.keyword.toLowerCase().trim();
      if (!counts[key]) counts[key] = [];
      counts[key].push(k);
    });
    return Object.values(counts).filter(group => group.length > 1);
  }, [filteredKeywords]);

  type KeywordDeleteReview = { ids: string[]; publishedIds: string[]; hardDeleteIds: string[]; impact: DeletionImpactEntry[]; confirmationName: string };

  const requestKeywordDeletePreview = useCallback(async (ids: readonly string[]): Promise<KeywordDeleteReview> => {
    if (!selectedBrandId) throw new Error("Marca ativa ausente para a exclusão.");
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/delete/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywordIds: [...new Set(ids)] }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) {
      const error = new Error(body?.message || "Não foi possível resolver a publicação das keywords.") as Error & { code?: string; diagnostic?: Record<string, unknown> };
      error.code = typeof body?.code === "string" ? body.code : "KEYWORD_DELETE_TRANSACTION_FAILED";
      throw error;
      // O servidor envia a causa tecnica; descarta-la aqui tornava a falha ininvestigavel.
      if (body?.diagnostic && typeof body.diagnostic === "object") error.diagnostic = body.diagnostic as Record<string, unknown>;
      throw error;
    }
    const impact = Array.isArray(body.items) ? body.items.flatMap((item: { impact?: Record<string, unknown> }) => {
      const nested = item?.impact || {};
      return ["ownedChildren", "downstreamDrafts", "sharedReferences", "publishedReferences"].flatMap(key => Array.isArray(nested[key]) ? nested[key] : []);
    }).filter((entry: unknown): entry is DeletionImpactEntry => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Record<string, unknown>;
      return typeof value.key === "string" && typeof value.label === "string" && typeof value.count === "number" && typeof value.classification === "string" && typeof value.behavior === "string";
    }) : [];
    const previewItems = Array.isArray(body.items) ? body.items as Array<{ id?: unknown; keyword?: unknown }> : [];
    const resolvedIds = previewItems.map(item => item.id).filter((id: unknown): id is string => typeof id === "string");
    const resolvedNames = previewItems.map(item => typeof item.keyword === "string" ? item.keyword.trim() : "").filter(Boolean);
    const confirmationName = resolvedNames.length === 1
      ? resolvedNames[0]
      : `${resolvedIds.length || new Set(ids).size} keywords selecionadas`;
    return {
      ids: resolvedIds.length > 0 ? resolvedIds : [...new Set(ids)],
      publishedIds: Array.isArray(body.publishedIds) ? body.publishedIds.filter((id: unknown): id is string => typeof id === "string") : [],
      hardDeleteIds: Array.isArray(body.hardDeleteIds) ? body.hardDeleteIds.filter((id: unknown): id is string => typeof id === "string") : [],
      impact,
      confirmationName,
    };
  }, [selectedBrandId]);

  const executeKeywordDeletion = useCallback(async (review: KeywordDeleteReview) => {
    if (!selectedBrandId) throw new Error("Marca ativa ausente para a exclusão.");
    setUpdating(true);
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds: review.ids }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) {
        const error = new Error(body?.message || "A exclusão não foi concluída.") as Error & { code?: string };
        error.code = typeof body?.code === "string" ? body.code : "KEYWORD_DELETE_TRANSACTION_FAILED";
        throw error;
      }

      const hardDeletedIds = Array.isArray(body.hardDeletedIds) ? body.hardDeletedIds as string[] : [];
      const recoverableIds = Array.isArray(body.recoverableIds) ? body.recoverableIds as string[] : [];
      // The server/RPC is the timestamp authority. Re-read the tombstones
      // instead of projecting deleted_at/purge_after from the browser clock.
      const recoverableReadback = recoverableIds.length > 0
        ? await loadRecoverableKeywords(selectedBrandId)
        : [];
      const recoveryRows = recoverableReadback.filter(item => recoverableIds.includes(item.id));

      setKeywords(previous => previous.filter(item => !review.ids.includes(item.id)));
      setSelectedIds(current => new Set([...current].filter(id => !review.ids.includes(id))));
      if (recoveryRows.length > 0) {
        setRecoverableKeywords(previous => {
          const byId = new Map(previous.map(item => [item.id, item]));
          recoveryRows.forEach(item => byId.set(item.id, item));
          return [...byId.values()].sort((left, right) => String(left.purge_after || "").localeCompare(String(right.purge_after || "")));
        });
      }

      if (hardDeletedIds.length > 0 && recoverableIds.length > 0) {
        showNotification("success", `${hardDeletedIds.length} keyword(s) excluída(s) definitivamente; ${recoverableIds.length} removida(s) da operação por 24 horas.`);
      } else if (recoverableIds.length > 0) {
        showNotification("success", `${recoverableIds.length} keyword(s) publicada(s) removida(s) da operação e disponível(is) para restauração por 24 horas.`);
      } else {
        showNotification("success", `${hardDeletedIds.length} keyword(s) excluída(s) definitivamente.`);
      }
      if (recoverableIds.length > 0 && recoveryRows.length !== recoverableIds.length) {
        showNotification("info", "A remoção recuperável foi confirmada pelo servidor; recarregue a marca para atualizar a lista de recuperação.", { code: "KEYWORD_RECOVERY_READBACK_PENDING", stage: "delete_readback", persistent: true });
      }
      return true;
    } catch (error) {
      const failure = error && typeof error === "object" ? error as { code?: unknown; diagnostic?: unknown } : {};
        const code = typeof failure.code === "string" ? failure.code : "KEYWORD_DELETE_TRANSACTION_FAILED";
        const diagnostic = failure.diagnostic && typeof failure.diagnostic === "object" && !Array.isArray(failure.diagnostic)
          ? failure.diagnostic as Record<string, unknown>
          : undefined;
      if (code === "KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW") {
        showNotification("error", "A seleção contém uma keyword publicada. Reabra a confirmação reforçada para usar a recuperação de 24 horas.", { code, stage: "publication_recheck", persistent: true });
      } else {
        showNotification("error", "Nada foi apagado: a transação não foi confirmada e nenhuma alteração parcial foi mantida.", { code, stage: "delete_transaction", persistent: true });
      }
      return false;
    } finally {
      setUpdating(false);
    }
  }, [loadRecoverableKeywords, keywords, selectedBrandId, setSelectedIds, showNotification]);

  const handleRestoreKeyword = useCallback(async (keywordId: string) => {
    if (!selectedBrandId) return;
    setUpdating(true);
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds: [keywordId] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.message || "A keyword não pôde ser restaurada.");
      const restored = recoverableKeywords.find(item => item.id === keywordId);
      if (restored) setKeywords(previous => previous.some(item => item.id === restored.id) ? previous : [({ ...restored, deleted_at: null, purge_after: null }), ...previous]);
      setRecoverableKeywords(previous => previous.filter(item => item.id !== keywordId));
      showNotification("success", "Keyword restaurada e devolvida à operação normal.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "A keyword não pôde ser restaurada.", { code: "KEYWORD_RESTORE_FAILED", stage: "restore", persistent: true });
    } finally {
      setUpdating(false);
    }
  }, [recoverableKeywords, selectedBrandId, showNotification]);

  // AÃ§Ã£o: Apaga palavras repetidas na visualizaÃ§Ã£o atual (mantendo apenas 1 cÃ³pia de cada)
  const handleDeleteDuplicates = async () => {
    const idsToDelete: string[] = [];
    duplicateGroups.forEach(group => {
      // MantÃ©m o primeiro registro e manda deletar os outros
      const published = group.filter(keywordPublicationProtected);
      const nonPublished = group.filter(k => !keywordPublicationProtected(k));
      const toDelete = published.length > 0
        ? nonPublished.map(k => k.id)
        : nonPublished.slice(1).map(k => k.id);
      idsToDelete.push(...toDelete);
    });

    if (idsToDelete.length === 0) return;

    // Duplicate cleanup enters the same preview/impact/confirmation flow as
    // the normal delete action; client-side publication hints never bypass it.
    await handleBatchDelete(false, idsToDelete);
  };

  // Importar palavras do arquivo CSV selecionado
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedBrandId) {
      showNotification("error", "Selecione uma marca antes de importar keywords.");
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (rows.length === 0) {
            showNotification("error", "Nenhum dado encontrado no arquivo CSV.");
            setImporting(false);
            e.target.value = "";
            return;
          }

          const parsedKeywords = [];
          
          for (const row of rows) {
            // Procura por Keyword / Palavra
            const keywordKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "keyword" || k.toLowerCase() === "palavra"
            );
            if (!keywordKey || !row[keywordKey]) continue;

            const keyword = row[keywordKey].trim();
            if (!keyword) continue;

            // Procura por Resultados
            const resultsKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "resultados" || k.toLowerCase() === "results_allintitle"
            );
            let resultsVal: number | null = null;
            if (resultsKey && row[resultsKey]) {
              const parsed = parseInt(row[resultsKey], 10);
              if (!isNaN(parsed)) resultsVal = parsed;
            }

            // Procura por Volume
            const volumeKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "volume" || k.toLowerCase() === "volume_search"
            );
            let volumeVal: number | null = null;
            if (volumeKey && row[volumeKey]) {
              const parsed = parseInt(row[volumeKey], 10);
              if (!isNaN(parsed)) volumeVal = parsed;
            }

            // Procura por Intent
            const intentKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "intent" || k.toLowerCase() === "intencao" || k.toLowerCase() === "intenÃ§Ã£o"
            );
            const intentVal = intentKey ? row[intentKey] : null;

            // Procura por Status
            const statusKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "status"
            );
            let statusVal: MineradorWorkflowStatus = "bruto";
            let publicationSignal: "published" | null = null;
            if (statusKey && row[statusKey]) {
              const s = String(row[statusKey]).trim().toLowerCase();
              if (isLegacyPublishedStatus(s)) publicationSignal = "published";
              else if (mineradorWorkflowStatuses.includes(s as MineradorWorkflowStatus)) statusVal = s as MineradorWorkflowStatus;
            }

            // Procura por Silo do CSV
            const siloKey = Object.keys(row).find(
              (k) => ["silo", "lista", "categoria", "silo_slug", "silo_nome"].includes(k.toLowerCase().trim())
            );
            const rowSiloVal = siloKey ? String(row[siloKey]).trim() : "";
            
            const siloResolution = resolveLegacyCsvSilo({ rawReference: rowSiloVal, brandId: selectedBrandId, lists });
            if (siloResolution.issue) {
              showNotification("error", `Referência de silo não encontrada para "${keyword}". A keyword não foi importada.`);
              continue;
            }
            const matchedListId = siloResolution.listaId;

            // Procura por Slug do CSV
            const slugKey = Object.keys(row).find(
              (k) => ["slug", "slug_sugerido", "keyword_slug"].includes(k.toLowerCase().trim())
            );
            const rowSlugVal = slugKey ? String(row[slugKey]).trim().toLowerCase() : "";

            // Calcula o score KGR caso tenha ambos
            let kgrScore: number | null = null;
            if (resultsVal !== null && volumeVal !== null && volumeVal > 0) {
              kgrScore = Number((resultsVal / volumeVal).toFixed(4));
            }

            const resolvedIntent = intentVal ? canonicalIntentLabel(intentVal) : canonicalIntentLabel(autoClassifyIntent(keyword));
            const resolvedNiche = autoDetectNiche(keyword);
            const logicalDna = deriveLogicalKeywordDna({
              keywordId: `import:${toSlug(keyword)}`,
              keyword,
              intent: resolvedIntent,
              niche: resolvedNiche,
            });
            const semanticObj: Record<string, unknown> = mergeLogicalKeywordSemantic(null, {
              ...logicalDna.semantic,
              nicho_override: resolvedNiche,
            });
            if (rowSlugVal) {
              semanticObj.slug_sugerido = toSlug(rowSlugVal);
            }
            if (publicationSignal) {
              semanticObj.publication_signal = publicationSignal;
              semanticObj.publication_signal_source = "csv";
            }

            parsedKeywords.push({
              brand_id: selectedBrandId,
              keyword,
              results_allintitle: resultsVal,
              volume_search: volumeVal,
              kgr_score: kgrScore,
              intent: resolvedIntent,
              lista_id: matchedListId,
              status: statusVal,
              analise_semantica: semanticObj
            });
          }

          if (parsedKeywords.length === 0) {
            showNotification("error", "Nenhuma palavra-chave válida foi encontrada no CSV. Verifique a coluna Keyword e as referências explícitas de silo.");
            setImporting(false);
            e.target.value = "";
            return;
          }

          // Insere dados em lote no Supabase
          const { data: insertedKeywords, error } = await supabase
            .from("minerador_keywords")
            .insert(parsedKeywords)
            .select("*");

          if (error) throw error;

          if (insertedKeywords?.length) setKeywords(current => [...insertedKeywords as KeywordItem[], ...current]);

          showNotification("success", `${parsedKeywords.length} palavras-chave importadas com sucesso!`);
        } catch (err: any) {
          console.error("Erro ao importar CSV:", err);
          showNotification("error", `Erro na importaÃ§Ã£o: ${err.message || "Erro no banco"}`);
        } finally {
          setImporting(false);
          e.target.value = "";
        }
      },
      error: (err) => {
        console.error("Erro no PapaParse:", err);
        showNotification("error", "Falha ao processar a estrutura do arquivo CSV.");
        setImporting(false);
        e.target.value = "";
      }
    });
  };
  // Abre a importação manual sempre sem silo por padrão.
  const openManualModal = () => {
    setManualListId("");
    setManualKeywordsText("");
    setManualIntent("");
    setManualNicho("");
    setManualStatus("bruto");
    setManualLocation("Brasil");
    setIsManualModalOpen(true);
  };

  // Salva palavras importadas de forma manual (copiar/colar) no Supabase em lote
  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrandId) {
      showNotification("error", "Selecione uma marca antes de importar keywords.");
      return;
    }
    if (!manualKeywordsText.trim()) {
      showNotification("error", "Digite ou cole pelo menos uma palavra-chave.");
      return;
    }
    const resolvedManualListId = manualImportListaId({ selectedListId: manualListId, brandId: selectedBrandId, lists });
    if (manualListId && !resolvedManualListId) {
      showNotification("error", "A lista selecionada não pertence à marca ativa.");
      return;
    }

    setUpdating(true);
    try {
      const keywordLines = manualKeywordsText
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (keywordLines.length === 0) {
        showNotification("error", "Nenhuma palavra-chave vÃ¡lida encontrada no texto.");
        setUpdating(false);
        return;
      }

      const payload = keywordLines.map(keyword => {
        const resolvedNiche = manualNicho || autoDetectNiche(keyword);
        const resolvedIntent = manualIntent ? canonicalIntentLabel(manualIntent) : canonicalIntentLabel(autoClassifyIntent(keyword));
        const logicalDna = deriveLogicalKeywordDna({
          keywordId: `manual:${toSlug(keyword)}`,
          keyword,
          intent: resolvedIntent,
          niche: resolvedNiche,
          location: manualLocation.trim() || null,
        });
        const analise = mergeLogicalKeywordSemantic(null, {
          ...logicalDna.semantic,
          nicho_override: resolvedNiche,
        });
        return {
          brand_id: selectedBrandId,
          keyword,
          location: manualLocation.trim() || null,
          results_allintitle: null,
          volume_search: null,
          kgr_score: null,
          intent: resolvedIntent,
          status: manualStatus,
          lista_id: resolvedManualListId,
          analise_semantica: analise
        };
      });

      const { data: insertedKeywords, error } = await supabase
        .from("minerador_keywords")
        .insert(payload)
        .select("*");

      if (error) throw error;

      if (insertedKeywords?.length) setKeywords(current => [...insertedKeywords as KeywordItem[], ...current]);

      showNotification("success", `${payload.length} palavras-chave importadas manualmente com sucesso!`);
      setIsManualModalOpen(false);
    } catch (err: any) {
      console.error("Erro na importaÃ§Ã£o manual:", err);
      showNotification("error", `Erro ao importar: ${err.message || "Erro de conexÃ£o"}`);
    } finally {
      setUpdating(false);
    }
  };

  // FunÃ§Ã£o para lidar com clique de ordenaÃ§Ã£o no cabeÃ§alho
  const handleSort = (column: typeof sortColumn) => {
    setOrderMode("auto");
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Renderiza o indicador de ordenaÃ§Ã£o
  const renderSortIcon = (column: typeof sortColumn) => {
    if (orderMode === "manual" || sortColumn !== column) return <ArrowUpDown className="w-3 h-3 text-slate-650 opacity-40 inline" />;
    return sortDirection === "asc" 
      ? <ArrowUpDown className="w-3 h-3 text-module-accent inline rotate-180 transition-transform" />
      : <ArrowUpDown className="w-3 h-3 text-module-accent inline transition-transform" />;
  };

  const handleKeywordRowDragOver = (event: DragEvent<HTMLTableRowElement>, targetId: string) => {
    if (orderMode !== "manual") return;
    const sourceId = event.dataTransfer.getData("text/plain") || keywordOrder.draggingId;
    if (!sourceId || sourceId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    keywordOrder.moveBefore(sourceId, targetId);
  };

  const handleKeywordRowDrop = (event: DragEvent<HTMLTableRowElement>) => {
    if (orderMode !== "manual") return;
    event.preventDefault();
  };

  // Cria nova lista (Silo/Categoria)
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    if (!selectedBrandId) {
      showNotification("error", "Selecione ou cadastre uma marca primeiro.");
      return;
    }

    try {
      const payload: Record<string, any> = {
        nome: newListName.trim(),
        nicho: newListNicho.trim() || null,
        marca_id: selectedBrandId,
      };

      const { data, error } = await supabase
        .from("minerador_keyword_lists")
        .insert([payload])
        .select();

      if (error) throw error;
      
      showNotification("success", "Lista criada com sucesso!");
      setNewListName("");
      setNewListNicho("");
      setIsListModalOpen(false);
      
      // Recarrega listas do banco filtradas
      let listsQuery = supabase
        .from("minerador_keyword_lists")
        .select("*");
       listsQuery = listsQuery.eq("marca_id", selectedBrandId);
      const { data: listsData } = await listsQuery.order("nome", { ascending: true });
      
      const loadedLists = listsData || [];
      setLists(loadedLists);
      if (loadedLists.length > 0 && !targetListId) {
        setTargetListId(loadedLists[0].id);
      }
    } catch (err: any) {
      console.error(err);
      showNotification("error", `Erro ao criar lista: ${err.message || "Erro no banco"}`);
    }
  };

  // AtualizaÃ§Ã£o direta da lista/grupo pertencente na cÃ©lula (com suporte a aplicaÃ§Ã£o em massa)
  const handleUpdateKeywordList = async (id: string, listId: string) => {
    try {
      if (!selectedBrandId) {
        showNotification("error", "Selecione uma marca antes de mover keywords.");
        return;
      }
      if (listId && !lists.some(list => list.id === listId && list.marca_id === selectedBrandId)) {
        showNotification("error", "A lista de destino não pertence à marca ativa.");
        return;
      }
      // Se a palavra alterada fizer parte da seleÃ§Ã£o atual, aplica a mudanÃ§a em massa
      const rawIds = selectedIds.has(id) ? Array.from(selectedIds) : [id];
      const idsToUpdate = rawIds.filter(wordId => {
        const item = keywords.find(k => k.id === wordId);
        return item ? !keywordPublicationProtected(item) : false;
      });
      const protectedCount = rawIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        showNotification("error", "Silo de keyword publicada e bloqueado e nao pode ser alterado.");
        return;
      }
      pushKeywordsHistory(keywords, `Mover ${idsToUpdate.length} keyword(s) de silo/categoria`);

      const { error } = await supabase
        .from("minerador_keywords")
        .update({ lista_id: listId || null })
        .in("id", idsToUpdate)
        .eq("brand_id", selectedBrandId)
        .is("deleted_at", null);

      if (error) throw error;

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id) ? { ...k, lista_id: listId || null } : k));
      showNotification("success", `Silo/Categoria atualizado para ${idsToUpdate.length} palavra(s). ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao mover palavra-chave.");
    }
  };

  // AtualizaÃ§Ã£o direta do status na cÃ©lula da tabela (com suporte a aplicaÃ§Ã£o em massa)
  const handleUpdateStatus = async (id: string | null, status: string) => {
    try {
      const rawIds = id === null ? Array.from(selectedIds) : selectedIds.has(id) ? Array.from(selectedIds) : [id];
      if (rawIds.length === 0) return;
      const normalizedStatus = status.toLowerCase();
      if (!mineradorWorkflowStatuses.includes(normalizedStatus as MineradorWorkflowStatus)) {
        showNotification("error", "Publicado é um vínculo de publicação, não um status editorial ativo.");
        return;
      }
      // Aprovar/rejeitar é decisão humana sobre o estado atual da keyword.
      // Nenhum processo editorial — Lógica, Volume, Resultados, SERP, KGR, IA
      // ou Revisão — pode vetar essa decisão. SERP mista continua mista; o
      // humano apenas assume a keyword como está. A única proteção mantida é a
      // do vínculo de publicação legado, tratada logo abaixo.
      const idsToUpdate = rawIds.filter(wordId => {
        const item = keywords.find(k => k.id === wordId);
        return !isLegacyPublishedStatus(item?.status);
      });
      const protectedCount = rawIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        showNotification("error", "Status publicado e bloqueado e nao pode ser rebaixado.");
        return;
      }
      pushKeywordsHistory(keywords, `Alterar status de ${idsToUpdate.length} keyword(s) para ${status}`);

      const { error } = await supabase
          .from("minerador_keywords")
        .update({ status: normalizedStatus })
        .in("id", idsToUpdate)
        .eq("brand_id", selectedBrandId)
        .is("deleted_at", null);

      if (error) throw error;

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id) ? { ...k, status: normalizedStatus } : k));
      showNotification("success", `Status atualizado para ${idsToUpdate.length} palavra(s). ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao salvar status.");
    }
  };

  const handleBatchStatus = async (status: string) => {
    if (selectedIds.size === 0) return;
    await handleUpdateStatus(null, status);
  };

  // Decisão humana de aplicabilidade do KGR sobre a seleção atual. Cada
  // keyword passa pelo mesmo contrato da Revisão Humana usado linha a linha;
  // a decisão nunca altera score, Volume, Resultado nem status editorial.
  const handleBatchKgrApplicability = async (applicability: KgrApplicability) => {
    if (selectedIds.size === 0 || !selectedBrandId) return;
    const actorId = session?.user?.email || session?.user?.id || "local-user";
    const decidedAt = new Date().toISOString();
    const plan = planKgrApplicabilityBatch(
      keywords.filter(item => selectedIds.has(item.id)),
      applicability,
      { actorId, decidedAt, openDraftIds: Object.keys(humanReviewDrafts) },
    );
    if (plan.updates.length === 0) {
      showNotification("info", describeKgrApplicabilityBatch(plan, 0));
      return;
    }
    const executionRequestId = crypto.randomUUID();
    const targetIds = plan.updates.map(update => update.id);
    if (!startBulkProgress("review", plan.updates.length, targetIds, executionRequestId)) return;
    pushKeywordsHistory(keywords, `Definir aplicabilidade do KGR de ${plan.updates.length} keyword(s) como ${kgrApplicabilityLabel(applicability)}`);
    setUpdating(true);
    let outcome: "success" | "error" = "success";
    const persistedIds: string[] = [];
    try {
      for (const update of plan.updates) {
        const { error } = await supabase
          .from("minerador_keywords")
          .update({ analise_semantica: update.semantic })
          .eq("id", update.id)
          .eq("brand_id", selectedBrandId)
          .is("deleted_at", null);
        if (error) throw error;
        persistedIds.push(update.id);
        updateBulkProgress(persistedIds.length, plan.updates.length, `KGR ${persistedIds.length}/${plan.updates.length}`);
      }
      const persistedById = await readCanonicalKeywordRows(persistedIds);
      const unconfirmed = persistedIds.filter(id => {
        const row = persistedById.get(id);
        return !row || readKgrApplicability(row.analise_semantica) !== applicability;
      });
      setKeywords(current => current.map(item => persistedById.get(item.id) || item));
      if (unconfirmed.length > 0) throw new Error(`A decisão foi salva, mas o readback canônico não confirmou ${unconfirmed.length} keyword(s).`);
      setProcessAttempt(persistedIds, "review", "success", executionRequestId);
      showNotification("success", describeKgrApplicabilityBatch(plan, persistedIds.length), { metadata: { executionRequestId } });
    } catch (error) {
      outcome = "error";
      const failedIds = targetIds.filter(id => !persistedIds.includes(id));
      if (persistedIds.length > 0) setProcessAttempt(persistedIds, "review", "success", executionRequestId);
      if (failedIds.length > 0) setProcessAttempt(failedIds, "review", "failed", executionRequestId);
      console.error("Erro ao definir aplicabilidade do KGR em lote:", error);
      showNotification("error", `${error instanceof Error ? error.message : "Não foi possível salvar a aplicabilidade do KGR."} ${persistedIds.length} de ${plan.updates.length} keyword(s) foram atualizadas.`, { metadata: { executionRequestId } });
    } finally {
      setUpdating(false);
      finishBulkProgress(outcome);
    }
  };

  // Conclusão da Revisão Humana sobre a seleção atual, com o mesmo contrato da
  // conclusão individual: defaults conservadores para itens sem decisão e
  // aplicabilidade do KGR obrigatória quando o cálculo é possível. Concluir não
  // altera status, aprovação, handoff nem métricas.
  const handleBatchCompleteHumanReview = async () => {
    if (selectedIds.size === 0 || !selectedBrandId) return;
    const actorId = session?.user?.email || session?.user?.id || "local-user";
    const completedAt = new Date().toISOString();
    const plan = planHumanReviewCompletionBatch(
      keywords.filter(item => selectedIds.has(item.id)),
      { actorId, completedAt, openDraftIds: Object.keys(humanReviewDrafts) },
    );
    if (plan.updates.length === 0) {
      showNotification("info", describeHumanReviewCompletionBatch(plan, 0));
      return;
    }
    const executionRequestId = crypto.randomUUID();
    const targetIds = plan.updates.map(update => update.id);
    if (!startBulkProgress("review", plan.updates.length, targetIds, executionRequestId)) return;
    pushKeywordsHistory(keywords, `Concluir revisão humana de ${plan.updates.length} keyword(s)`);
    setUpdating(true);
    let outcome: "success" | "error" = "success";
    const persistedIds: string[] = [];
    try {
      for (const update of plan.updates) {
        const { error } = await supabase
          .from("minerador_keywords")
          .update({ analise_semantica: update.semantic })
          .eq("id", update.id)
          .eq("brand_id", selectedBrandId)
          .is("deleted_at", null);
        if (error) throw error;
        persistedIds.push(update.id);
        updateBulkProgress(persistedIds.length, plan.updates.length, `Revisão ${persistedIds.length}/${plan.updates.length}`);
      }
      const persistedById = await readCanonicalKeywordRows(persistedIds);
      const unconfirmed = persistedIds.filter(id => {
        const row = persistedById.get(id);
        return !row || humanReviewRecord(row.analise_semantica).status !== "completed";
      });
      setKeywords(current => current.map(item => persistedById.get(item.id) || item));
      if (unconfirmed.length > 0) throw new Error(`A revisão foi salva, mas o readback canônico não confirmou ${unconfirmed.length} keyword(s).`);
      setProcessAttempt(persistedIds, "review", "success", executionRequestId);
      showNotification("success", describeHumanReviewCompletionBatch(plan, persistedIds.length), { metadata: { executionRequestId } });
    } catch (error) {
      outcome = "error";
      const failedIds = targetIds.filter(id => !persistedIds.includes(id));
      if (persistedIds.length > 0) setProcessAttempt(persistedIds, "review", "success", executionRequestId);
      if (failedIds.length > 0) setProcessAttempt(failedIds, "review", "failed", executionRequestId);
      console.error("Erro ao concluir revisão humana em lote:", error);
      showNotification("error", `${error instanceof Error ? error.message : "Não foi possível concluir a revisão humana."} ${persistedIds.length} de ${plan.updates.length} keyword(s) foram concluídas.`, { metadata: { executionRequestId } });
    } finally {
      setUpdating(false);
      finishBulkProgress(outcome);
    }
  };

  const handleToggleSelectAll = () => {
    selection.toggleVisible();
    setQualificationResults([]);
  };

  // AÃ§Ã£o em Lote: Mover para Lista
  const handleBatchMove = async () => {
    if (selectedIds.size === 0 || !targetListId || !selectedBrandId) return;
    if (!lists.some(list => list.id === targetListId && list.marca_id === selectedBrandId)) {
      showNotification("error", "A lista de destino não pertence à marca ativa.");
      return;
    }
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    const movableIds = selectedItems
      .filter(item => !keywordPublicationProtected(item))
      .map(item => item.id);
    const protectedCount = selectedItems.length - movableIds.length;

    if (movableIds.length === 0) {
      showNotification("error", "Nada foi movido: publicados nao podem trocar de Silo/Categoria.");
      return;
    }
    pushKeywordsHistory(keywords, `Mover ${movableIds.length} keyword(s) em lote`);

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("minerador_keywords")
        .update({ lista_id: targetListId })
        .in("id", movableIds)
        .eq("brand_id", selectedBrandId)
        .is("deleted_at", null);

      if (error) throw error;

      const movableSet = new Set(movableIds);
      setKeywords(prev => prev.map(item => 
        movableSet.has(item.id) ? { ...item, lista_id: targetListId } : item
      ));
      showNotification("success", `Palavras nao-publicadas movidas com sucesso. ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao mover palavras de lista.");
    } finally {
      setUpdating(false);
    }
  };

  const handleBatchSendToArchitect = async () => {
    if (!selectedBrandId || selectedIds.size === 0) return;
    if (!architectHandoffGate.ok) {
      showNotification("info", architectHandoffGate.reason, {
        code: "ARCHITECT_HANDOFF_GATE",
        stage: "handoff_precondition",
      });
      return;
    }

    setArchitectHandoffSending(true);
    try {
      const result = await persistMineradorArquitetoHandoff({
        brandId: selectedBrandId,
        keywordIds: [...selectedIds],
      });
      if (result.persistence === "UNCHANGED") {
        showNotification("success", "As keywords selecionadas já estavam no workspace canônico do Arquiteto.");
      } else {
        showNotification("success", `${result.createdKeywordIds.length} keyword(s) enviada(s) ao Arquiteto.`);
      }
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível enviar as keywords ao Arquiteto.", {
        code: "ARCHITECT_HANDOFF_FAILED",
        stage: "handoff",
      });
    } finally {
      setArchitectHandoffSending(false);
    }
  };

  const handlePrimaryKeywordPolicyChange = async (item: KeywordItem, policy: Extract<PrimaryKeywordPolicy, "locked" | "reviewable">) => {
    if (!keywordPublicationProtected(item)) return;
    const currentPolicy = readPrimaryKeywordPolicy({ status: item.status, semantic: item.analise_semantica });
    if (currentPolicy === policy) return;
    const policyLabel = primaryKeywordPolicyLabel(policy);
    if (!window.confirm(`${policyLabel}. A URL, o slug, o canonical e a keyword atual permanecerão protegidos. Confirmar política?`)) return;
    const actorId = session?.user?.email || "local-user";
    const changedAt = new Date().toISOString();
    const formalPublication = readPublicationLink({ status: item.status, evidence: readSiteOrigin(item.analise_semantica) }).state === "published";
    const semantic = setPrimaryKeywordPolicy(item.analise_semantica, { status: item.status, publicationConfirmed: formalPublication, keyword: item.keyword, policy, actorId, changedAt });
    setUpdating(true);
    try {
      const { error } = await supabase.from("minerador_keywords").update({ analise_semantica: semantic }).eq("id", item.id).eq("brand_id", selectedBrandId).is("deleted_at", null);
      if (error) throw error;
      pushKeywordsHistory(keywords, `Alterar política da principal de ${item.keyword}`);
      setKeywords(current => current.map(keyword => keyword.id === item.id ? { ...keyword, analise_semantica: semantic } : keyword));
      showNotification("success", `${policyLabel} registrada; a identidade publicada foi preservada.`);
    } catch (error) {
      console.error("Erro ao salvar política da keyword principal:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar a política da principal.");
    } finally {
      setUpdating(false);
    }
  };

  const handleHumanReviewAction = async (keywordId: string, action: HumanReviewAction) => {
    const item = keywords.find(keyword => keyword.id === keywordId);
    if (!item || !selectedBrandId) return;

    const cloneSemantic = (source: KeywordSemantic): KeywordSemantic => JSON.parse(JSON.stringify(source)) as KeywordSemantic;
    const materialSemantic = (source: KeywordSemantic): KeywordSemantic => {
      const next = cloneSemantic(source);
      delete next.dna_revisao_humana;
      delete next.dna_revisao_humana_por;
      delete next.dna_revisao_humana_em;
      delete next.kgr_decidido_por;
      delete next.kgr_decidido_em;
      const review = next.human_review && typeof next.human_review === "object" && !Array.isArray(next.human_review)
        ? next.human_review as Record<string, unknown>
        : null;
      if (review) {
        delete review.status;
        delete review.decision;
        delete review.pendingFields;
        delete review.completedAt;
        delete review.completedBy;
        if (Array.isArray(review.fieldDecisions)) {
          review.fieldDecisions = review.fieldDecisions.map(entry => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
            const decision = { ...(entry as Record<string, unknown>) };
            delete decision.actorId;
            delete decision.decidedAt;
            return decision;
          });
        }
        if (Array.isArray(review.enrichmentDecisions)) {
          review.enrichmentDecisions = review.enrichmentDecisions.map(entry => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
            const decision = { ...(entry as Record<string, unknown>) };
            delete decision.actorId;
            delete decision.decidedAt;
            return decision;
          });
        }
      }
      return next;
    };
    const draft = humanReviewDrafts[keywordId];
    const baseSemantic = item.analise_semantica || {};

    if (action.type === "reopen") {
      setHumanReviewDrafts(current => ({
        ...current,
        [keywordId]: { semantic: cloneSemantic(baseSemantic), intent: item.intent },
      }));
      setExpandedRowId(keywordId);
      setHumanReviewOpenId(keywordId);
      showNotification("info", "Revisão reaberta. Os fatos medidos permanecem somente leitura; conclua ou cancele para sair da edição.");
      return;
    }

    if (action.type === "cancel") {
      setHumanReviewDrafts(current => {
        const next = { ...current };
        delete next[keywordId];
        return next;
      });
      setHumanReviewOpenId(null);
      showNotification("info", "Edição da revisão cancelada. A última consolidação válida foi preservada.");
      return;
    }

    const actorId = session?.user?.email || session?.user?.id || "local-user";
    const now = new Date().toISOString();
    const currentSemantic = draft?.semantic || baseSemantic;
    const currentIntent = draft?.intent ?? item.intent;
    let nextSemantic = currentSemantic;
    let nextIntent = currentIntent;

    if (action.type === "field") {
      const result = applyHumanReviewField({
        semantic: currentSemantic,
        intent: currentIntent,
        field: action.field,
        logicalValue: action.logicalValue,
        aiSuggestion: action.aiSuggestion,
        decision: action.decision,
        editedValue: action.editedValue,
        actorId,
        decidedAt: now,
      });
      nextSemantic = result.semantic;
      nextIntent = result.intent;
    } else if (action.type === "enrichment") {
      nextSemantic = applyHumanReviewEnrichment({
        semantic: currentSemantic,
        field: action.field,
        value: action.value,
        decision: action.decision,
        actorId,
        decidedAt: now,
      }).semantic;
    } else if (action.type === "kgr") {
      nextSemantic = applyHumanReviewKgrApplicability({ semantic: currentSemantic, applicability: action.applicability, actorId, decidedAt: now });
    } else if (action.type === "complete") {
      const completion = canCompleteHumanReview(currentSemantic, { intent: currentIntent });
      if (!completion.ok) {
        showNotification("info", completion.reason || "Há pendências na revisão humana.");
        return;
      }
      // The button stays actionable: when the KGR applicability is still a
      // human decision, the click points to that field instead of inventing
      // "aplicável"/"não aplicável" or blocking the review beforehand.
      if (completion.pendingKgrDecision) {
        setExpandedRowId(keywordId);
        setHumanReviewOpenId(keywordId);
        showNotification("info", "Escolha a Aplicabilidade do KGR no painel de Revisão Humana para concluir.");
        return;
      }
      // A completed and current review is its own artifact: reopening and
      // concluding it without material edits stays a no-op instead of
      // fabricating a new version. A stale review is a different case — the
      // conclusion rebinds the consolidation to the current AI snapshot.
      const wasAlreadyCompleted = resolveMineradorProcessState(item).review.complete;
      const draftHasChanges = JSON.stringify(materialSemantic(currentSemantic)) !== JSON.stringify(materialSemantic(baseSemantic)) || currentIntent !== item.intent;
      if (draft && wasAlreadyCompleted && !draftHasChanges) {
        setHumanReviewDrafts(current => {
          const next = { ...current };
          delete next[keywordId];
          return next;
        });
        showNotification("info", "Nenhuma alteração nova foi encontrada; a consolidação existente foi mantida.");
        return;
      }
      nextSemantic = completeHumanReview({ semantic: currentSemantic, intent: currentIntent, actorId, completedAt: now });
    }

    if (draft && action.type !== "complete") {
      setHumanReviewDrafts(current => ({ ...current, [keywordId]: { semantic: nextSemantic as KeywordSemantic, intent: nextIntent } }));
      showNotification("info", "Alteração mantida na revisão aberta. Conclua a revisão para salvar a nova consolidação.");
      return;
    }

    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("review", 1, [keywordId], executionRequestId)) return;
    let outcome: "success" | "error" = "success";
    setUpdating(true);
    try {
      const payload: Record<string, unknown> = { analise_semantica: nextSemantic };
      if ((action.type === "field" || draft) && nextIntent !== item.intent) payload.intent = nextIntent;
      const { error } = await supabase.from("minerador_keywords").update(payload).eq("id", keywordId).eq("brand_id", selectedBrandId).is("deleted_at", null);
      if (error) throw error;
      const persistedById = await readCanonicalKeywordRows([keywordId]);
      const readbackItem = persistedById.get(keywordId);
      // The readback confirms that the human artifact was persisted for this
      // keyword. Freshness against the current AI snapshot is a separate
      // projection and never turns a persisted consolidation into a failure.
      const persistedReview = readbackItem ? humanReviewRecord(readbackItem.analise_semantica) : null;
      if (!readbackItem || !persistedReview) throw new Error("A decisão humana foi salva, mas o readback canônico não foi confirmado.");
      if (action.type === "complete" && persistedReview.status !== "completed") throw new Error("A revisão humana foi salva, mas não passou pelo gate de confirmação do DNA atual.");
      pushKeywordsHistory(keywords, action.type === "complete" ? `Concluir revisão humana de ${item.keyword}` : `Atualizar revisão humana de ${item.keyword}`);
      setProcessAttempt([keywordId], "review", "success", executionRequestId);
      setKeywords(current => current.map(keyword => keyword.id === keywordId ? readbackItem : keyword));
      if (draft) {
        setHumanReviewDrafts(current => {
          const next = { ...current };
          delete next[keywordId];
          return next;
        });
      }
      showNotification("success", action.type === "complete" ? "Revisão humana concluída; o DNA foi confirmado." : "Decisão humana registrada no DNA.", { metadata: { executionRequestId } });
    } catch (error) {
      outcome = "error";
      setProcessAttempt([keywordId], "review", "failed", executionRequestId);
      console.error("Erro ao salvar revisão humana:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar a revisão humana.", { metadata: { executionRequestId } });
    } finally {
      setUpdating(false);
      finishBulkProgress(outcome);
    }
  };

  /** Somente por ação explícita do usuário: nunca em mount, F5 ou background. */
  /**
   * Execução do processo IA para uma keyword: Apresentação Contextual.
   * Uma ação explícita = uma execução de provider = um usage event.
   */
  const runContextualPresentation = async (keywordId: string, executionRequestId: string): Promise<{ ok: boolean; code?: string; error?: string }> => {
    if (!selectedBrandId) return { ok: false, code: "BRAND_REQUIRED", error: "Selecione uma Marca antes de executar a IA." };
    setPresentationBriefLoadingId(keywordId);
    try {
      const response = await fetch(`/api/minerador/marcas/${selectedBrandId}/ia/brief-apresentacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordId, executionRequestId }),
      });
      const payload = await response.json().catch(() => null) as null | {
        success?: boolean;
        contextualPresentation?: KeywordPresentationBrief["contextualPresentation"];
        brandVoiceApplied?: boolean;
        appliedSkillRefs?: KeywordPresentationBrief["appliedSkillRefs"];
        code?: string;
        error?: string;
        stage?: string;
        persisted?: boolean;
        presentationVersion?: number | null;
      };
      if (!payload) {
        // Resposta sem JSON (ex.: 500 da rota): reporta o status real em vez de
        // uma mensagem genérica que esconde a etapa que quebrou.
        return { ok: false, code: "AI_PRESENTATION_INVALID_RESPONSE", error: `A rota da apresentação respondeu ${response.status} sem JSON utilizável.` };
      }
      if (!response.ok || !payload.success || !payload.contextualPresentation) {
        // Falha da apresentação afeta só esta tentativa: nenhum fallback para o
        // R5 legado e nenhum processo anterior alterado.
        return { ok: false, code: payload.code, error: payload.error || `A rota da apresentação falhou (${response.status}${payload.stage ? ` · etapa ${payload.stage}` : ""}).` };
      }
      const contextualPresentation = payload.contextualPresentation;
      const generatedBrief: KeywordPresentationBrief = {
        contextualPresentation,
        brandVoiceApplied: payload.brandVoiceApplied ?? contextualPresentation.appliedSkillRefs.some(ref => ref.definitionKey === "brand_voice"),
        appliedSkillRefs: payload.appliedSkillRefs || contextualPresentation.appliedSkillRefs,
        generatedAt: contextualPresentation.generatedAt,
        // Só é "persistida" quando o write do artifact foi confirmado pela rota.
        persisted: payload.persisted === true,
        version: payload.presentationVersion ?? null,
      };
      if (generatedBrief.persisted) {
        setPresentationBriefs(current => ({ ...current, [keywordId]: generatedBrief }));
        setPresentationAttempts(current => {
          if (!current[keywordId]) return current;
          const next = { ...current };
          delete next[keywordId];
          return next;
        });
        return { ok: true };
      }
      // Write não confirmado: a versão persistida anterior continua canônica e a
      // tentativa aparece separada, declarada como não persistida.
      setPresentationAttempts(current => ({ ...current, [keywordId]: generatedBrief }));
      setPresentationBriefs(current => current[keywordId]?.persisted ? current : { ...current, [keywordId]: generatedBrief });
      return { ok: true, code: "AI_PRESENTATION_NOT_PERSISTED" };
    } catch (error) {
      console.error("Erro ao gerar a apresentação contextual:", error);
      return { ok: false, code: "AI_REQUEST_FAILED", error: "Não foi possível gerar a apresentação contextual." };
    } finally {
      setPresentationBriefLoadingId(null);
    }
  };

  /**
   * Ação IA do Processador. Só o clique humano dispara; nunca mount/F5.
   * A reexecução pelo painel usa este mesmo caminho, então um clique produz
   * uma execução por keyword e uma única notificação final.
   */
  const handleBatchContextualPresentation = async (requestedIds?: readonly string[]) => {
    if (presentationBriefLoadingId) return;
    const scope = requestedIds && requestedIds.length > 0 ? new Set(requestedIds) : selectedIds;
    if (scope.size === 0) return;
    const targets = keywords.filter(item => scope.has(item.id));
    const executionRequestId = crypto.randomUUID();
    if (targets.length === 0 || !startBulkProgress("ai", targets.length, targets.map(item => item.id), executionRequestId)) return;
    setQueueProcessing(true);
    setQueueProgress(0);
    let successCount = 0;
    // Persistência e geração são relatadas separadamente: sucesso de provider
    // nunca é anunciado como sucesso de persistência.
    let persistedCount = 0;
    let unpersistedCount = 0;
    const failures: Array<{ keyword: string; error?: string }> = [];
    try {
      let processed = 0;
      for (const item of targets) {
        setProcessAttempt([item.id], "ai", "running", executionRequestId);
        const result = await runContextualPresentation(item.id, executionRequestId);
        if (result.ok) {
          successCount++;
          if (result.code === "AI_PRESENTATION_NOT_PERSISTED") unpersistedCount++;
          else persistedCount++;
          // A execução acontece em background visual: nenhuma linha é expandida,
          // nem o foco, o scroll ou a seleção do usuário são alterados.
          setProcessAttempt([item.id], "ai", "success", executionRequestId);
        } else {
          setProcessAttempt([item.id], "ai", "failed", executionRequestId);
          failures.push({ keyword: item.keyword, error: result.error });
        }
        processed++;
        setQueueProgress(processed);
        updateBulkProgress(processed, targets.length);
      }
      if (failures.length === 0 && unpersistedCount === 0) {
        showNotification("success", `Apresentação contextual gerada e persistida para ${persistedCount} keyword(s).`, { metadata: { executionRequestId } });
      } else if (failures.length === 0) {
        // Geração PASS + persistência FAIL: severidade INFO e origem workflow.
        showNotification("info", `Apresentação contextual gerada para ${successCount} keyword(s), mas não foi possível persistir ${unpersistedCount}.`, {
          code: "AI_PRESENTATION_NOT_PERSISTED",
          stage: "contextual_presentation_persistence",
          metadata: { executionRequestId, persistidas: persistedCount, naoPersistidas: unpersistedCount },
        });
      } else {
        showNotification("error", failures[0].error || "Não foi possível gerar a apresentação contextual.", {
          persistent: true,
          metadata: { executionRequestId, falhas: failures.map(failure => failure.keyword).join(", ") },
        });
      }
    } finally {
      setQueueProcessing(false);
      finishBulkProgress(failures.length === 0 ? "success" : "error");
    }
  };
  const handleOpenHumanReview = () => {
    const firstSelectedId = Array.from(selectedIds)[0];
    if (!firstSelectedId) return;
    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("review", 1, [firstSelectedId], executionRequestId)) return;
    setExpandedRowId(firstSelectedId);
    setHumanReviewOpenId(firstSelectedId);
    bulkProgressResetTimerRef.current = window.setTimeout(() => {
      setProcessAttempt([firstSelectedId], "review", "success", executionRequestId);
      finishBulkProgress("success", "Revisão pronta");
    }, 180);
  };

  // AÃ§Ã£o em Lote: volume pela API e resultados allintitle pela extensão conectada
  const handleBatchAllintitle = async () => {
    if (allintitleMeasuring || selectedIds.size === 0 || !selectedBrandId) return;
    const operationRequestId = crypto.randomUUID();
    const keywordIds = [...selectedIds];
    if (!startBulkProgress("results", keywordIds.length, keywordIds, operationRequestId)) return;
    let outcome: "success" | "error" = "success";
    setAllintitleMeasuring(true);
    setUpdating(true);
    showNotification("info", `Medindo resultados allintitle: ${keywordIds.length} alvo(s).`, { persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/dataforseo/allintitle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywordIds, operationRequestId }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        const error = new Error(data?.message || "A medição allintitle não foi concluída.") as Error & { code?: string; stage?: string; diagnostic?: Record<string, unknown> };
        error.code = typeof data?.code === "string" ? data.code : "dataforseo_request_failed";
        error.stage = typeof data?.stage === "string" ? data.stage : "provider_request";
        error.diagnostic = data?.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic : undefined;
        throw error;
      }
      const projections = Array.isArray(data.projections) ? data.projections as Array<{ keywordId?: string | null; measuredAt?: string | null; serpEvidence?: SerpSemanticEvidence | null; serpError?: { code?: string; message?: string } | null }> : [];
      const byKeywordId = new Map(projections.filter(item => typeof item.keywordId === "string").map(item => [item.keywordId!, item]));
      // The provider projection is feedback only. The table changes only from
      // the tenant-scoped canonical readback after persistence succeeds.
      let confirmedIds: string[] = [];
      if (byKeywordId.size > 0) {
        const persistedByKeywordId = await readCanonicalKeywordRows([...byKeywordId.keys()]);
        confirmedIds = [...persistedByKeywordId.entries()]
          .filter(([id, row]) => {
            const projectionMeasuredAt = byKeywordId.get(id)?.measuredAt;
            const measurement = row.analise_semantica?.allintitle_measurement;
            return resolveMineradorProcessState(row).results.complete
              && typeof projectionMeasuredAt === "string"
              && measurement && typeof measurement.measuredAt === "string"
              && measurement.measuredAt === projectionMeasuredAt;
          })
          .map(([id]) => id);
        setKeywords(current => current.map(item => confirmedIds.includes(item.id) ? persistedByKeywordId.get(item.id)! : item));
      }
      setProcessAttempt(confirmedIds, "results", "success", operationRequestId);
      setProcessAttempt(keywordIds.filter(id => !confirmedIds.includes(id)), "results", "failed", operationRequestId);
      // A evidência da SERP natural é um artefato independente da medição: ela
      // alimenta a working copy da Qualificação Semântica sem tocar Resultado,
      // KGR ou KeywordDNA persistido.
      const semanticEvidences = Array.isArray(data.semanticEvidences) ? data.semanticEvidences as Array<{ keywordId?: string | null; serpEvidence?: SerpSemanticEvidence | null; serpError?: { code?: string; message?: string } | null }> : [];
      const serpFailedIds = new Set<string>();
      for (const projection of semanticEvidences) {
        const keywordId = typeof projection.keywordId === "string" ? projection.keywordId : null;
        if (!keywordId) continue;
        if (projection.serpError) serpFailedIds.add(keywordId);
      }
      // O read-model só avança para a nova versão depois do write confirmado:
      // a Qualificação vem do artifact persistido, nunca da working copy.
      const qualificationOutcomes = Array.isArray(data.semanticQualifications)
        ? data.semanticQualifications as Array<{ keywordId?: string | null; persisted?: boolean }>
        : [];
      const persistedQualificationIds = qualificationOutcomes.filter(item => item?.persisted).map(item => String(item.keywordId)).filter(Boolean);
      const qualificationFailedCount = typeof data.semanticQualificationFailedCount === "number" ? data.semanticQualificationFailedCount : 0;
      if (persistedQualificationIds.length > 0 && selectedBrandId) {
        const refreshed = await loadSemanticQualifications(selectedBrandId, persistedQualificationIds);
        setSemanticQualifications(current => ({ ...current, ...refreshed }));
        setSemanticConsolidationDrafts(current => {
          const next = { ...current };
          for (const [keywordId, qualification] of Object.entries(refreshed)) {
            const keyword = keywords.find(item => item.id === keywordId);
            const logic = keyword ? readCanonicalKeywordDna(keyword) : null;
            next[keywordId] = semanticDraftFromQualification(qualification, { intent: logic?.intent ?? null, funnel: logic?.funnel ?? null });
          }
          return next;
        });
      }
      setSerpCollectionFailures(current => {
        const next = { ...current };
        for (const id of keywordIds) {
          if (serpFailedIds.has(id)) next[id] = true;
          else if (semanticEvidences.some(projection => projection.keywordId === id && projection.serpEvidence)) delete next[id];
        }
        return next;
      });
      // Resumo agregado da ação: uma notificação por lote, sem esconder a CALL 3.
      const serpAnalyzedCount = semanticEvidences.filter(projection => projection.serpEvidence).length;
      const serpConsolidatedCount = semanticEvidences.filter(projection => projection.serpEvidence
        && (isConclusiveSerpEvidence(projection.serpEvidence.intent) || isConclusiveSerpEvidence(projection.serpEvidence.funnel))).length;
      const persistedCount = typeof data.persistedCount === "number" ? data.persistedCount : byKeywordId.size;
      const requestedCount = typeof data.requestedCount === "number" ? data.requestedCount : keywordIds.length;
      if (data.code === "DATAFORSEO_PARTIAL_RESULTS") {
        outcome = "error";
        showNotification("info", `${persistedCount} de ${requestedCount} resultados allintitle foram persistidos; as demais medições foram preservadas.`, { code: data.code, stage: data.stage || "response_normalization", diagnostic: data.diagnostic, persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
      }
      else if (data.code === "DATAFORSEO_OVERVIEW_PARTIAL") {
        showNotification("info", data.message || `${persistedCount} resultado(s) persistidos; alguns KD(s) não foram retornados.`, { code: data.code, stage: data.stage || "response_normalization", diagnostic: data.diagnostic, persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
      }
      else if (typeof data.serpFailedCount === "number" && data.serpFailedCount > 0) {
        // Sucesso parcial honesto: as medições valem, a SERP não.
        showNotification("info", `Resultados atualizados para ${persistedCount} keyword(s); a coleta da SERP falhou para ${data.serpFailedCount} keyword(s).`, { code: "DATAFORSEO_SERP_PARTIAL", stage: "semantic_serp", metadata: { executionRequestId: operationRequestId } });
      }
      else if (qualificationFailedCount > 0) {
        // Provider passou, persistência semântica não: nada de sucesso falso.
        showNotification("info", `Resultados atualizados para ${persistedCount} keyword(s), mas não foi possível persistir a Qualificação Semântica de ${qualificationFailedCount} keyword(s).`, { code: "SEMANTIC_QUALIFICATION_PERSISTENCE_FAILED", stage: "semantic_qualification_persistence", metadata: { executionRequestId: operationRequestId, operationRequestId } });
      }
      else if (persistedQualificationIds.length > 0) {
        const serpSummary = serpConsolidatedCount > 0
          ? ` SERP consolidada para ${serpConsolidatedCount} keyword(s).`
          : " SERP analisada, mas sem evidência suficiente para consolidar Intenção/Funil.";
        showNotification("success", `Resultados e Qualificação Semântica atualizados para ${persistedCount} keyword(s).${serpSummary}`, { metadata: { executionRequestId: operationRequestId, operationRequestId } });
      }
      else {
        const serpSummary = serpAnalyzedCount > 0 ? " SERP analisada, mas sem evidência suficiente para consolidar Intenção/Funil." : "";
        showNotification("success", `Resultados atualizados para ${persistedCount} keyword(s).${serpSummary}`, { metadata: { executionRequestId: operationRequestId, operationRequestId } });
      }
    } catch (err: unknown) {
      outcome = "error";
      setProcessAttempt(keywordIds, "results", "failed", operationRequestId);
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "dataforseo_request_failed";
      const stage = err && typeof err === "object" && "stage" in err && typeof (err as { stage?: unknown }).stage === "string" ? (err as { stage: string }).stage : "provider_request";
      const diagnostic = err && typeof err === "object" && "diagnostic" in err && (err as { diagnostic?: unknown }).diagnostic && typeof (err as { diagnostic?: unknown }).diagnostic === "object" ? (err as { diagnostic: Record<string, unknown> }).diagnostic : undefined;
      showNotification("error", `Medição allintitle falhou: ${err instanceof Error ? err.message : "Erro de conexão"}`, { code, stage, diagnostic, persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
    } finally {
      setAllintitleMeasuring(false);
      setUpdating(false);
      finishBulkProgress(outcome);
    }
  };

  const handleBatchQualify = async () => {
    if (selectedIds.size === 0 || volumeMeasuring || !selectedBrandId) return;
    const keywordIds = [...selectedIds];
    const operationRequestId = crypto.randomUUID();
    if (!startBulkProgress("volume", keywordIds.length, keywordIds, operationRequestId)) return;
    let outcome: "success" | "error" = "success";
    setUpdating(true);
    setVolumeMeasuring(true);
    const batchCount = Math.ceil(keywordIds.length / 10_000);
    showNotification("info", `Consultando Google Ads...${batchCount > 1 ? ` ${batchCount} lotes serão processados em sequência.` : ""}`, { persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/google-ads/metricas-keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds, operationRequestId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        const error = new Error(data?.message || "Google Ads não retornou uma resposta válida.") as Error & { code?: string; stage?: string; diagnostic?: Record<string, unknown> };
        error.code = typeof data?.code === "string" ? data.code : "google_ads_volume_request_failed";
        error.stage = typeof data?.stage === "string" ? data.stage : "volume_provider";
        error.diagnostic = data?.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic : undefined;
        throw error;
      }
      const projections = Array.isArray(data.projections) ? data.projections as Array<{ keywordId?: string; measuredAt?: string | null }> : [];
      const byKeywordId = new Map(projections.filter(item => typeof item.keywordId === "string").map(item => [item.keywordId!, item]));
      let persistedByKeywordId = new Map<string, KeywordItem>();
      if (byKeywordId.size > 0) {
        try {
          persistedByKeywordId = await readCanonicalKeywordRows([...byKeywordId.keys()]);
        } catch (readbackError) {
          const error = new Error("A medição Google Ads foi recebida, mas o readback canônico não foi confirmado.") as Error & { code?: string; stage?: string; diagnostic?: Record<string, unknown> };
          error.code = "PROCESSOR_READBACK_FAILED";
          error.stage = "canonical_readback";
          error.diagnostic = { cause: readbackError instanceof Error ? readbackError.message : String(readbackError), provider: "google_ads" };
          throw error;
        }
      }
      const confirmedIds = [...persistedByKeywordId.entries()]
        .filter(([id, row]) => {
          const projectionMeasuredAt = byKeywordId.get(id)?.measuredAt;
          const measurement = row.analise_semantica?.volume_measurement;
          return resolveMineradorProcessState(row).volume.complete
            && typeof projectionMeasuredAt === "string"
            && measurement && typeof measurement.measuredAt === "string"
            && measurement.measuredAt === projectionMeasuredAt;
        })
        .map(([id]) => id);
      setProcessAttempt(confirmedIds, "volume", "success", operationRequestId);
      setProcessAttempt(keywordIds.filter(id => !confirmedIds.includes(id)), "volume", "failed", operationRequestId);
      setKeywords(current => current.map(item => confirmedIds.includes(item.id) ? persistedByKeywordId.get(item.id)! : item));
      const persistedCount = typeof data.persistedCount === "number" ? data.persistedCount : byKeywordId.size;
      const requestedCount = typeof data.requestedCount === "number" ? data.requestedCount : keywordIds.length;
      if (data.code === "GOOGLE_ADS_PARTIAL_RESULTS") {
        outcome = "error";
        showNotification("info", `${persistedCount} de ${requestedCount} medições Google Ads foram registradas. Keywords sem média oficial ficam inelegíveis para produção; dados anteriores foram preservados.`, { code: data.code, stage: data.stage || "response_normalization", diagnostic: data.diagnostic, persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
      }
      else showNotification("success", `${persistedCount} métricas Google Ads foram persistidas e refletidas na tabela.`, { metadata: { executionRequestId: operationRequestId, operationRequestId } });
    } catch (err: unknown) {
      outcome = "error";
      setProcessAttempt(keywordIds, "volume", "failed", operationRequestId);
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "google_ads_volume_request_failed";
      const stage = err && typeof err === "object" && "stage" in err && typeof (err as { stage?: unknown }).stage === "string" ? (err as { stage: string }).stage : "volume_provider";
      const diagnostic = err && typeof err === "object" && "diagnostic" in err && (err as { diagnostic?: unknown }).diagnostic && typeof (err as { diagnostic?: unknown }).diagnostic === "object" ? (err as { diagnostic: Record<string, unknown> }).diagnostic : undefined;
      if (code === "GOOGLE_ADS_QUOTA") showNotification("info", "O limite temporário da Google Ads API foi atingido. Nenhuma métrica anterior foi alterada.", { code, stage, diagnostic, persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
      else showNotification("error", `Atualização de métricas falhou: ${err instanceof Error ? err.message : "Erro de conexão"}`, { code, stage, diagnostic, persistent: true, metadata: { executionRequestId: operationRequestId, operationRequestId } });
    } finally {
      setVolumeMeasuring(false);
      setUpdating(false);
      finishBulkProgress(outcome);
    }
  };

  // Ação em lote: o servidor resolve publicação antes de abrir a confirmação.
  const handleBatchDelete = async (approved = false, requestedIds?: readonly string[]) => {
    if (!selectedBrandId) return false;

    if (approved) {
      if (!deleteReview) return false;
      setDeleteApprovalOpen(false);
      setDeleteSimpleOpen(false);
      const completed = await executeKeywordDeletion(deleteReview);
      if (completed) setDeleteReview(null);
      return completed;
    }

    const ids = requestedIds ? [...new Set(requestedIds)] : [...selectedIds];
    if (ids.length === 0) return false;
    setUpdating(true);
    let review: KeywordDeleteReview;
    try {
      review = await requestKeywordDeletePreview(ids);
    } catch (error) {
      // O servidor devolve a causa tecnica em body.diagnostic; preserva-la aqui e
      // o que permite investigar a falha sem adivinhacao.
      const failure = error && typeof error === "object" ? error as { diagnostic?: unknown } : {};
      const diagnostic = failure.diagnostic && typeof failure.diagnostic === "object" && !Array.isArray(failure.diagnostic)
        ? failure.diagnostic as Record<string, unknown>
        : undefined;
      const code = error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "KEYWORD_DELETE_TRANSACTION_FAILED";
      showNotification("error", "Nada foi apagado: não foi possível confirmar o estado de publicação da seleção.", { code, stage: "publication_resolution", persistent: true, diagnostic });
      return false;
    } finally {
      setUpdating(false);
    }

    setDeleteReview(review);
    if (review.publishedIds.length > 0) {
      setDeleteApprovalOpen(true);
      return false;
    }

    setDeleteSimpleOpen(true);
    return false;
  };

  const organizeFilterLabels = mineradorOrganizationLabels(organizationValues, lists);
  const organizeFilterSummary = mineradorOrganizationButtonSummary(organizeFilterLabels);
  const organizeFilterLabelKey = organizeFilterLabels.join(" · ");
  const organizeFilterTitle = organizeFilterLabels.length > 3 ? organizeFilterLabelKey : undefined;
  const topbarHistoryCount = keywordHistory.entries.length;
  const topbarCanUndo = keywordHistory.canUndo;
  const topbarCanRedo = keywordHistory.canRedo;
  const topbarVisibleKeywordCount = filteredKeywords.length;
  const topbarSelectedCount = selectedIds.size;
  const clearOrganizeFilters = () => {
    setOrderMode("auto");
    setFilterStatus("Todos");
    setFilterIntent("Todos");
    setFilterListId("Todos");
    setFilterSiteRelation("Todos");
    setFilterSiteArchitecture("Todos");
    setFilterSitePublication("Todos");
    setFilterKgrApplicability("Todos");
    setFilterKgrMeasurement("Todos");
    setFilterVolumeEligibility("Todos");
  };

  const { registerControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  useEffect(() => {
    const globalTopbarControls: GlobalTopbarModuleControls = {
      moduleId: "minerador",
      search: {
        getValue: () => searchQuery,
        setValue: (value) => setSearchQuery(value),
      },
      history: {
        getCount: () => keywordHistory.entries.length,
        canUndo: () => topbarCanUndo,
        canRedo: () => topbarCanRedo,
        undo: undoKeywords,
        redo: redoKeywords,
        open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "minerador" } })),
      },
      actions: <div className="flex min-w-0 items-center gap-0.5">
        <KeywordTableOrganizeButton
          className="min-h-8 gap-1 px-2 text-xs font-medium"
          labelClassName="max-xl:hidden"
          aria-expanded={organizeOpen}
          aria-label={organizeFilterSummary}
          onClick={() => setOrganizeOpen(open => !open)}
          title={organizeFilterTitle || "Organizar a planilha"}
        />
        {organizeFilterSummary !== "Organizar" ? <span className="sr-only">{organizeFilterSummary}</span> : null}

        <button
          type="button"
          onClick={() => {
            if (topbarSelectedCount === 0) { showNotification("error", "Selecione pelo menos uma palavra-chave para exportar."); return; }
            setExportFileName(`kgr-export-${new Date().toISOString().slice(0, 10)}`);
            setIsExportModalOpen(true);
          }}
          className="flex shrink-0 items-center gap-1 rounded border border-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-500 transition-colors hover:border-emerald-805 hover:text-emerald-450"
          title="Exportar selecionadas para CSV"
        >
          <FileSpreadsheet className="h-3 w-3" />
          <span className="hidden xl:inline">Exportar</span>
        </button>

        <AppMenu active="minerador" countLabel={topbarVisibleKeywordCount > 0 ? `${topbarVisibleKeywordCount} termos` : undefined} />
      </div>,
      tabs: sectionTabs,
    };
    registerControls(globalTopbarControls);
    return () => unregisterControls(globalTopbarControls.moduleId);
  }, [discoverySourceActions, organizeFilterSummary, organizeFilterTitle, organizeOpen, redoKeywords, searchQuery, sectionTabs, showNotification, topbarCanRedo, topbarCanUndo, topbarHistoryCount, topbarSelectedCount, topbarVisibleKeywordCount, undoKeywords, registerControls, unregisterControls, keywordHistory.entries.length]);

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center font-mono">
        <Loader2 className="w-8 h-8 text-context-accent animate-spin" />
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-mono">
        <Building2 className="w-12 h-12 text-context-accent mb-3" />
        <h1 className="text-lg font-bold text-foreground uppercase tracking-wider">Minerador KGR</h1>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
          Ãrea restrita. Por favor, faÃ§a login com suas credenciais para acessar a plataforma.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="mt-6 bg-action-accent hover:bg-action-accent/90 text-foreground rounded px-6 py-2.5 font-bold text-sm transition-colors shadow-lg shadow-action-accent/20 cursor-pointer"
        >
          Fazer Login
        </button>
      </div>
    );
  }

  const bulkProgressMeta = bulkProgress.step ? bulkProgressStepMeta[bulkProgress.step] : null;
  const bulkActionProcessing = bulkProgress.status === "processing";
  const bulkProgressPercentage = bulkProgress.total
    ? Math.min(100, Math.round((bulkProgress.current / bulkProgress.total) * 100))
    : null;
  const bulkProgressDisplayPercentage = bulkProgress.status === "success" ? 100 : bulkProgressPercentage;
  const bulkProgressBarPercentage = bulkProgress.status === "success" ? 100 : bulkProgressPercentage ?? 38;
  const bulkProgressIndeterminate = bulkProgressPercentage === null;
  const bulkProgressAriaValueText = bulkProgressDisplayPercentage === null
    ? bulkProgress.status === "processing" ? "Em andamento" : "Progresso não determinado"
    : `${bulkProgressDisplayPercentage}%`;
  const bulkProgressCardClass = bulkProgress.status === "success"
    ? "border-success/35 bg-success-soft/10"
    : bulkProgress.status === "error"
      ? "border-danger/35 bg-danger-soft/10"
      : bulkProgressMeta?.cardClass || "border-divider bg-surface-subtle";
  const bulkActionStateClass = (step: BulkProgressStep) => bulkProgress.status === "processing" && bulkProgress.step === step
    ? bulkProgressStepMeta[step].activeClass
    : "";
  const manualSiteCheckKeyword = manualSiteCheckKeywordId ? keywords.find(keyword => keyword.id === manualSiteCheckKeywordId) : null;

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-background font-mono text-xs text-foreground">
      <MineradorLastOrganizationRestorer
        userId={session?.user?.id || ""}
        brandId={selectedBrandId}
        ready={!loading && sessionStatus === "authenticated"}
        knownListIds={lists.map(list => list.id)}
        values={organizationValues}
        onHydrated={setOrganizationHydratedKey}
        onApply={view => {
          setSearchQuery(view.searchQuery); setFilterStatus(view.filterStatus); setFilterIntent(view.filterIntent); setFilterListId(view.filterListId);
          setFilterSiteRelation(view.filterSiteRelation); setFilterSiteArchitecture(view.filterSiteArchitecture); setFilterSitePublication(view.filterSitePublication);
          setFilterKgrApplicability(view.filterKgrApplicability); setFilterKgrMeasurement(view.filterKgrMeasurement); setFilterVolumeEligibility(view.filterVolumeEligibility);
          setOrderMode("auto");
          setSortColumn(view.sortColumn); setSortDirection(view.sortDirection);
        }}
      />
      <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />
      <HistoryControls moduleId="minerador" showHistory={false} showUndoRedo={false} entries={keywordHistory.entries} canUndo={keywordHistory.canUndo} canRedo={keywordHistory.canRedo}
        onUndo={undoKeywords} onRedo={redoKeywords} onRestore={keywordHistory.restore} compact presentation="popover"/>
      <DiscoverySourceControls ref={discoverySourceControlsRef} brandRef={brandRef} preliminaryIntent="Informativa" preliminaryFunnel="TOFU" onComplete={handleDiscoverySourceComplete} />
      
      {organizeOpen && (
        <section className="shrink-0 border-b border-slate-900 bg-[#0b0c10] px-4 py-3 font-sans" aria-label="Filtros de organização">
          <div className="flex flex-wrap items-end gap-2.5">
            <KeywordTableOrderModeSelect value={orderMode} onChange={setOrderMode} />
            <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Status
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todos</option><option value="bruto">Bruto</option><option value="aprovado">Aprovado</option><option value="rejeitado">Rejeitado</option><option value="publicado">Publicado (legado)</option>
              </select>
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Intenção
              <select value={filterIntent} onChange={(e) => setFilterIntent(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todas</option><option value="informational">Informativa</option><option value="commercial_investigation">Comercial investigativa</option><option value="transactional">Transacional</option><option value="navigational">Navegacional</option><option value="local">Local</option><option value="mixed">Mista</option><option value="unknown">Pendente / não classificada</option>
              </select>
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Silo
              <select value={filterListId} onChange={(e) => setFilterListId(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todos</option>{lists.map(list => <option key={list.id} value={list.id}>{list.nome}</option>)}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Relação com URL
              <select value={filterSiteRelation} onChange={(e) => setFilterSiteRelation(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todas</option><option value="confirmed_primary">Principal confirmada</option><option value="candidate_primary">Principal candidata</option><option value="supporting">Apoio provável</option><option value="mentioned">Mencionada</option><option value="undefined">Sem relação</option>
              </select>
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Arquitetura
              <select value={filterSiteArchitecture} onChange={(e) => setFilterSiteArchitecture(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todas</option><option value="awaiting_architecture">Aguardando arquitetura</option><option value="architectural_review_required">Revisão necessária</option><option value="architecture_confirmed">Confirmada</option><option value="conflict">Com conflito</option>
              </select>
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Publicação no site
              <select value={filterSitePublication} onChange={(e) => setFilterSitePublication(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todas</option><option value="published">Publicada</option><option value="not_confirmed">Não confirmada</option><option value="not_found">Não localizada</option><option value="redirected">Redirecionada</option><option value="canonical_conflict">Conflito canonical</option>
              </select>
            </label>
            <label className="flex min-w-[170px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Aplicabilidade KGR
              <select value={filterKgrApplicability} onChange={(e) => setFilterKgrApplicability(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todas</option><option value="applicable">Aplicável</option><option value="not_applicable">Não aplicável</option><option value="pending">Pendente</option>
              </select>
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Estado do cálculo KGR
              <select value={filterKgrMeasurement} onChange={(e) => setFilterKgrMeasurement(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todas</option><option value="without_data">Sem medição</option><option value="partial">Parcial</option><option value="complete">Completa</option><option value="invalid">Inválida</option>
              </select>
            </label>
            <label className="flex min-w-[190px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Elegibilidade por volume
              <select value={filterVolumeEligibility} onChange={(e) => setFilterVolumeEligibility(e.target.value as typeof filterVolumeEligibility)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="operational">Elegíveis para produção</option><option value="Todos">Todas</option><option value="pending">Pendente de medição</option><option value="eligible">Elegível por volume</option><option value="below_threshold">Inelegível · abaixo do corte</option><option value="unavailable">Inelegível · sem volume oficial</option><option value="measurement_failed">Medição falhou</option>
              </select>
            </label>
            <div className="flex items-center gap-2 pb-0.5">
              <button type="button" onClick={clearOrganizeFilters} className="rounded border border-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:border-slate-600 hover:text-slate-200">Limpar filtros</button>
            </div>
          </div>
        </section>
      )}

      {siteSyncPlan && (
        <section className="shrink-0 border-b border-emerald-950/60 bg-emerald-950/10 px-4 py-3 font-sans">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Prévia da conferência Site/Sitemap</h2>
              <p className="mt-1 text-[11px] text-slate-400">Nada é gravado até a confirmação explícita. {targetListId ? <>A lista de destino é <span className="text-slate-200">{lists.find(list => list.id === targetListId)?.nome || targetListId}</span>.</> : <>Sem Silo/Categoria: somente evidências de keywords existentes serão atualizadas.</>}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
              <span className="rounded border border-slate-800 px-1.5 py-0.5">Recebidas: {siteSyncPlan.summary.received}</span>
              <span className="rounded border border-emerald-900/50 px-1.5 py-0.5 text-emerald-300">Novas: {siteSyncPlan.summary.new}</span>
              <span className="rounded border border-context-accent/50 px-1.5 py-0.5 text-context-accent">Atualizadas: {siteSyncPlan.summary.updated}</span>
              <span className="rounded border border-slate-800 px-1.5 py-0.5">Sem alteração: {siteSyncPlan.summary.unchanged}</span>
              <span className="rounded border border-amber-900/50 px-1.5 py-0.5 text-amber-300">Duplicadas: {siteSyncPlan.summary.duplicateInBatch}</span>
              <span className="rounded border border-rose-900/50 px-1.5 py-0.5 text-rose-300">Inválidas/bloqueadas: {siteSyncPlan.summary.invalid + siteSyncPlan.summary.blocked}</span>
            </div>
          </div>
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-slate-900/80 bg-[#06070a]">
             {siteSyncPlan.items.map(item => (
               <div key={item.candidate.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-900/60 px-3 py-2 text-[11px] last:border-b-0">
                 <span className="min-w-48 font-semibold text-slate-200">{item.candidate.text}</span>
                 <span className="text-context-accent">{readPublicationLink({ status: keywords.find(keyword => keyword.id === item.mineradorKeywordId)?.status, evidence: item.candidate as unknown as PublicationLinkEvidence }).label}</span>
                 <span className="text-slate-500">{siteRelationLabel(item.candidate.keywordUrlRelation)}</span>
                 <span className="text-slate-500">URL: {item.candidate.urlSituation}</span>
                 {item.candidate.lastCheckedAt && <span className="text-slate-500">Conferida: {new Date(item.candidate.lastCheckedAt).toLocaleString("pt-BR")}</span>}
                 <span className="text-slate-500">{siteArchitectureLabel(item.candidate.architectureStatus)}</span>
                <span className={item.outcome === "new" ? "text-success" : item.outcome === "evidence_updated" ? "text-context-accent" : item.outcome === "no_change" ? "text-text-muted" : "text-warning"}>{siteSyncOutcomeLabel(item.outcome)}</span>
                {item.mineradorKeywordId && <span className="font-mono text-[10px] text-slate-600">{item.mineradorKeywordId}</span>}
                <a href={item.candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-context-accent hover:text-foreground">Origem</a>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setSiteSyncPlan(null)} disabled={siteSyncPersisting} className="rounded border border-slate-800 px-3 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50">Voltar</button>
            <button onClick={handleConfirmSiteSync} disabled={siteSyncPersisting || !siteSyncPlan.items.some(item => ["new", "evidence_updated", "no_change"].includes(item.outcome))} className="flex items-center gap-1 rounded border border-emerald-700/60 bg-emerald-900/30 px-3 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50">
              {siteSyncPersisting && <Loader2 className="h-3 w-3 animate-spin" />}
               {siteSyncPersisting ? "Persistindo..." : "Salvar conferência"}
             </button>
           </div>
         </section>
       )}

      {manualSiteCheckKeywordId && !siteSyncPlan && (
        <section className="shrink-0 border-b border-divider bg-surface-subtle px-4 py-3 font-sans" aria-label="Conferir URL manualmente">
          <form onSubmit={handleManualSiteCheck} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="minerador-manual-site-url" className="block text-sm font-semibold text-foreground">URL da página da marca</label>
              <p className="mt-1 text-sm text-text-muted">Keyword: <span className="font-medium text-foreground">{manualSiteCheckKeyword?.keyword || "—"}</span></p>
              <p className="text-sm text-text-muted">Site da Marca: <span className="font-medium text-foreground">{activeBrand?.site_url || "não configurado"}</span></p>
              <p className="mt-1 text-sm text-text-muted">O catálogo Site/Sitemap já foi consultado. A página será apenas conferida no domínio autorizado; nenhuma publicação é criada automaticamente.</p>
              <input id="minerador-manual-site-url" type="url" value={manualSiteCheckUrl} onChange={event => setManualSiteCheckUrl(event.target.value)} placeholder="https://sua-marca.com/pagina" className="mt-2 min-h-9 w-full rounded border border-divider bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-context-accent focus:ring-2 focus:ring-context-accent/30" required />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setManualSiteCheckKeywordId(null)} disabled={siteSyncLoading} className="min-h-9 rounded border border-divider px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-elevated hover:text-foreground disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={siteSyncLoading} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-action-accent px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-action-accent/85 disabled:cursor-wait disabled:opacity-50">
                {siteSyncLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Conferir URL
              </button>
            </div>
          </form>
        </section>
      )}

      {recoverableKeywords.length > 0 && (
        <section className="shrink-0 border-b border-divider bg-surface-subtle px-4 py-3 font-sans" aria-label="Keywords em recuperação">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Keywords removidas — recuperação por 24 horas</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-text-muted">
                Keywords publicadas saem da operação, mas continuam restauráveis neste período. Publicação, URL, canonical e proveniência editorial permanecem preservadas.
              </p>
            </div>
            <span className="shrink-0 rounded border border-divider bg-surface-elevated px-2 py-1 text-sm font-medium text-context-accent">
              {recoverableKeywords.length} em recuperação
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {recoverableKeywords.map(item => (
              <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded border border-divider bg-surface-elevated px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" title={item.keyword}>{item.keyword}</p>
                  <p className="mt-0.5 text-sm text-text-muted">{keywordRecoveryRemainingLabel(item)}</p>
                </div>
                <RecoveryAction onRestore={() => handleRestoreKeyword(item.id)} disabled={updating} />
              </div>
            ))}
          </div>
        </section>
      )}


      {/* PLANILHA PRINCIPAL */}
      <KeywordTableShell ref={tableRef} scroll="x" className={selectedIds.size > 0 ? "pb-14" : ""}>
        {loading || organizationHydrationPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#06070a]/90">
            <Loader2 className="w-6 h-6 text-context-accent animate-spin mb-2" />
            <span className="text-[10px] text-slate-500 font-mono">{loading ? "Buscando do Supabase..." : "Restaurando organização..."}</span>
          </div>
        ) : filteredKeywords.length === 0 ? (
          <KeywordTableEmptyState className="p-16">
            <AlertTriangle className="w-6 h-6 text-slate-655 mx-auto mb-2" />
            <p className="font-bold text-slate-400">
              {keywords.length === 0 ? "Nenhuma palavra-chave encontrada" : "Nenhuma keyword corresponde aos filtros atuais"}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">
              {keywords.length === 0 ? "Insira palavras do banco ou importe candidatas da Descoberta." : `${keywords.length} keyword(s) carregada(s), mas nenhuma corresponde à organização atual.`}
            </p>
          </KeywordTableEmptyState>
        ) : (
          <>
            {duplicateGroups.length > 0 && showDuplicateBanner && (
              <div className="bg-amber-955/20 border-b border-amber-900/60 text-amber-300 px-4 py-2.5 text-[11px] flex items-center justify-between gap-4 animate-in slide-in-from-top-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                  <span>
                    AtenÃ§Ã£o: Existem <strong>{duplicateGroups.length} palavras-chave repetidas</strong> nesta visualizaÃ§Ã£o.
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <button
                    onClick={handleDeleteDuplicates}
                    className="bg-amber-600/90 hover:bg-amber-500 text-white font-bold px-3 py-1 rounded transition-all shrink-0 shadow-lg"
                  >
                    Apagar Duplicadas (Manter apenas 1)
                  </button>
                  <button
                    onClick={() => setShowDuplicateBanner(false)}
                    className="text-slate-400 hover:text-white font-semibold px-2 py-1 shrink-0 transition-colors"
                  >
                    Ignorar Alerta
                  </button>
                </div>
              </div>
            )}
            <table data-keyword-table="processor" style={{ minWidth: processorTableMinimumWidth }} className="w-full table-fixed border-collapse text-left text-[12.5px] font-sans tracking-wide whitespace-nowrap">
             <colgroup>
               {Object.keys(processorColumnWidths).map(columnId => <col key={columnId} data-keyword-table-column={columnId} style={{ width: responsiveWidths[columnId] }} />)}
             </colgroup>
            
            {/* CabeÃ§alho Fixo OrdenÃ¡vel */}
            <KeywordTableHeader className="sticky top-0 z-20 border-b border-divider bg-surface-subtle">
              <tr className="text-text-muted">
                <th className="relative w-8 border-r border-divider/70 px-1 py-2 text-center font-mono text-[10px]" aria-label="Reordenar linhas"><KeywordTableColumnResizeHandle columnId="drag" label="reordenação" onStart={columnResize.startResize} /></th>
                <th className="relative w-8 border-r border-divider/70 px-2 py-2 text-center font-mono text-[10px]">#<KeywordTableColumnResizeHandle columnId="index" label="número" onStart={columnResize.startResize} /></th>
                <KeywordSelectionHeader allSelected={allVisibleSelected} someSelected={someVisibleSelected} onToggle={handleToggleSelectAll} resizeHandle={<KeywordTableColumnResizeHandle columnId="selection" label="seleção" onStart={columnResize.startResize} />}/>
                <th
                  className="relative border-r border-divider/70 px-3 py-2 cursor-pointer whitespace-normal transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("keyword")}
                >
                  <InlineLabelCluster label="Palavra-Chave" trailing={renderSortIcon("keyword")} /><KeywordTableColumnResizeHandle columnId="keyword" label="Palavra-Chave" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[120px] border-r border-divider/70 px-3 py-2 text-center whitespace-nowrap">
                  <InlineLabelCluster
                    label="Vínculo"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Relação com conteúdo publicado" description="Indica se a keyword está livre, possui uma página candidata, foi verificada ou já está vinculada a uma publicação como principal ou secundária." /></span>}
                  />
                  <KeywordTableColumnResizeHandle columnId="vinculo" label="Vínculo" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[128px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("results_allintitle")}
                >
                  <InlineLabelCluster
                    label="Resultados"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Concorrência encontrada para a busca" description="Mostra a quantidade medida pelo processo de concorrência orgânica usada, junto com o Volume, no cálculo e na avaliação da oportunidade." /></span>}
                    trailing={renderSortIcon("results_allintitle")}
                  />
                  <KeywordTableColumnResizeHandle columnId="results" label="Resultados" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[120px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("volume_search")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Demanda mensal da keyword" description="Demanda mensal medida para a keyword no contexto configurado."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Volume</span></InfoHint>}
                    trailing={renderSortIcon("volume_search")}
                  />
                  <KeywordTableColumnResizeHandle columnId="volume" label="Volume" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[108px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("kgr_score")}
                >
                  <InlineLabelCluster
                    label="KGR"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Relação entre demanda e concorrência" description="Compara Resultado e Volume para ajudar na triagem de oportunidades. É um indicador de apoio e não aprova ou reprova uma keyword automaticamente." /></span>}
                    trailing={renderSortIcon("kgr_score")}
                  />
                  <KeywordTableColumnResizeHandle columnId="kgr" label="KGR" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[96px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("cpc")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Valor comercial do clique" description="Custo médio por clique informado pelo Google Ads; ajuda a perceber valor e competição comercial."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">CPC</span></InfoHint>}
                    trailing={renderSortIcon("cpc")}
                  />
                  <KeywordTableColumnResizeHandle columnId="cpc" label="CPC" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[70px] border-r border-divider/70 px-2 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("keyword_difficulty")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Dificuldade orgânica estimada" description="Estimativa de dificuldade orgânica disponível para a keyword."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">KD</span></InfoHint>}
                    trailing={renderSortIcon("keyword_difficulty")}
                  />
                  <KeywordTableColumnResizeHandle columnId="kd" label="KD" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[168px] border-r border-divider/70 px-3 py-2 text-center whitespace-nowrap">
                  <InlineLabelCluster label={<InfoHint title="Leitura de intenção da busca" description="Intenção canônica atual do KeywordDNA, considerando a lógica e as decisões humanas já consolidadas."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Intenção</span></InfoHint>} />
                  <KeywordTableColumnResizeHandle columnId="intent" label="Intenção" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[168px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("nicho")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Contexto de mercado" description="Contexto de mercado identificado para a keyword."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Nicho de mercado</span></InfoHint>}
                    trailing={renderSortIcon("nicho")}
                  />
                  <KeywordTableColumnResizeHandle columnId="niche" label="Nicho de mercado" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[80px] border-r border-divider/70 px-3 py-2 text-center whitespace-nowrap"
                >
                  <InlineLabelCluster
                    label="Funil"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Etapa provável da jornada" description="TOFU é o topo do funil: descoberta e buscas amplas. MOFU é o meio: consideração e comparação de alternativas. BOFU é o fundo: busca mais próxima de contratar, comprar, agendar ou realizar outra ação." /></span>}
                  />
                  <KeywordTableColumnResizeHandle columnId="funnel" label="Funil" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[168px] border-r border-divider/70 px-3 py-2 cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("lista")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Organização editorial" description="Organização editorial à qual a keyword está associada."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Silo/Categoria</span></InfoHint>}
                    trailing={renderSortIcon("lista")}
                  />
                  <KeywordTableColumnResizeHandle columnId="silo" label="Silo/Categoria" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[108px] px-3 py-2 text-center whitespace-nowrap">
                  <InlineLabelCluster
                    label="Status"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Decisão editorial da keyword" description="Mostra o estado de decisão da keyword no Minerador. Não representa publicação: o vínculo com conteúdo publicado aparece separadamente em Vínculo." /></span>}
                  />
                  <KeywordTableColumnResizeHandle columnId="status" label="Status" onStart={columnResize.startResize} />
                </th>
              </tr>
            </KeywordTableHeader>

            {/* Linhas da Planilha */}
            <tbody className="divide-y divide-divider/70 bg-background">
              {filteredKeywords.map((item, index) => {
                const isSelected = selectedIds.has(item.id);
                const canonicalSnapshot = resolveCanonicalKeywordSnapshot({ ...item, attempts: processAttemptsByKeywordId[item.id] });
                const volumeValue = canonicalSnapshot.metrics.volume.value;
                const resultValue = canonicalSnapshot.metrics.result.value;
                const kgrApplicability = canonicalSnapshot.metrics.kgr.applicability;
                const automaticKgrScore = canonicalSnapshot.metrics.kgr.score;
                const kgrMeasurement = classifyKgrMeasurement({ kgrScore: automaticKgrScore, volume: volumeValue, results: resultValue });
                const volumeKgrConsistency: VolumeKgrConsistency = assessVolumeKgrConsistency({ volume: volumeValue, results: resultValue, kgrScore: automaticKgrScore, semantic: item.analise_semantica });
                const zeroConfirmed = hasExplicitZeroMeasurement(item.analise_semantica);
                const volumeMeasurement = item.analise_semantica?.volume_measurement && typeof item.analise_semantica.volume_measurement === "object" && !Array.isArray(item.analise_semantica.volume_measurement)
                  ? item.analise_semantica.volume_measurement as Record<string, unknown>
                  : null;
                const cpcEvidence = canonicalSnapshot.metrics.cpc;
                const cpcTitle = cpcEvidence.source === "processor"
                  ? cpcEvidence.sortValue === null
                    ? "Medição Google Ads revalidada no Processador; CPC não retornado."
                    : "CPC da medição Google Ads revalidada no Processador."
                  : cpcEvidence.source === "imported"
                    ? "CPC anterior/importado; aguardando revalidação no Processador."
                    : undefined;
                const allintitleMeasurement = item.analise_semantica?.allintitle_measurement && typeof item.analise_semantica.allintitle_measurement === "object" && !Array.isArray(item.analise_semantica.allintitle_measurement)
                  ? item.analise_semantica.allintitle_measurement as Record<string, unknown>
                  : null;
                const allintitleHistory = Array.isArray(item.analise_semantica?.allintitle_measurement_history)
                  ? item.analise_semantica.allintitle_measurement_history
                  : [];
                const keywordDifficultyEvidence = canonicalSnapshot.metrics.kd;
                const keywordDifficultyTitle = keywordDifficultyEvidence.source === "processor"
                  ? keywordDifficultyEvidence.value === null
                    ? "Keyword Overview revalidado no Processador; KD não retornado."
                    : "KD da medição DataForSEO Keyword Overview revalidada no Processador."
                  : keywordDifficultyEvidence.source === "imported"
                    ? "KD anterior/importado; aguardando revalidação no Processador."
                    : keywordDifficultyEvidence.source === "previous"
                      ? "KD de medição anterior; aguardando revalidação no Processador."
                      : undefined;
                const confirmedVolumeMeasurement = Boolean(
                  volumeMeasurement
                  && volumeMeasurement.match === "exact"
                  && ["confirmed", "zero_confirmed"].includes(String(volumeMeasurement.status || ""))
                  && typeof volumeMeasurement.rawVolume === "number"
                  && Number.isFinite(volumeMeasurement.rawVolume)
                  && volumeMeasurement.rawVolume === volumeValue,
                );
                const volumeEligibility = readVolumeEligibility(item);
                const volumeEligibilityClass = volumeEligibility === "eligible"
                  ? "border-success/50 bg-success-soft text-success"
                  : volumeEligibility === "pending"
                    ? "border-divider bg-surface-subtle text-text-muted"
                    : volumeEligibility === "measurement_failed"
                      ? "border-warning/50 bg-warning-soft text-warning"
                      : "border-divider bg-surface-subtle text-foreground/80";
                const siteOrigin = readSiteOrigin(item.analise_semantica);
                const publicationLink = canonicalSnapshot.vinculo;
                const publicationProtected = keywordPublicationProtected(item);
                const editorialStatus = canonicalSnapshot.status;
                const recoveryStatus = legacyEditorialRecovery?.keywordId === item.id ? legacyEditorialRecovery.status : "";
                const primaryKeywordPolicy = readPrimaryKeywordPolicy({ status: item.status, semantic: item.analise_semantica });
                const selectedListName = lists.find(list => list.id === item.lista_id)?.nome || "Sem Silo/Categoria";
                const keywordReadModel = canonicalSnapshot.semantic;
                const intentLabel = keywordReadModel.intentLabel;
                const intentIsPending = keywordReadModel.intentState === "unresolved";
                
                // FormataÃ§Ã£o KGR de acordo com a regra estrita de Golden Ratio
                let kgrText = "-";
                let kgrColor = "text-slate-500";
                if (automaticKgrScore !== null) {
                  kgrText = automaticKgrScore.toFixed(3);
                  const score = automaticKgrScore;
                  const vol = volumeValue;
                  const tone = kgrTechnicalTone(score, vol);
                  kgrColor = tone === "success"
                    ? "bg-success-soft text-success border border-success/50 px-1.5 py-0.5 rounded text-[10px] font-bold"
                    : tone === "warning"
                      ? "bg-warning-soft text-warning border border-warning/50 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      : tone === "danger"
                        ? "bg-danger-soft text-danger border border-danger/50 px-1.5 py-0.5 rounded text-[10px] font-bold"
                        : "text-text-muted";
                }
                const kgrTextBadge = "inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold";
                // A aplicabilidade deixou de ser badge: ela aparece no seletor da
                // própria célula. O badge fica só para o estado da medição.
                const kgrState = item.volume_search === 0
                  ? { label: "Não calculável", className: "border-divider bg-surface-subtle text-foreground/80" }
                  : volumeKgrConsistency === "inconsistent"
                    ? { label: "Inconsistente", className: "border-danger/50 bg-danger-soft text-danger" }
                    : kgrMeasurement === "invalid"
                      ? { label: "Inválido", className: "border-danger/50 bg-danger-soft text-danger" }
                      : kgrMeasurement === "without_data" || kgrMeasurement === "partial"
                        ? { label: "Sem medição", className: "border-divider bg-surface-subtle text-foreground/80" }
                        : null;
                const kgrApplicabilityClass = kgrApplicability === "applicable"
                  ? "border-success/50 bg-success-soft text-success"
                  : kgrApplicability === "not_applicable"
                    ? "border-divider bg-surface-subtle text-foreground/80"
                    : "border-pending/50 bg-pending-soft text-pending";

                const isExpanded = expandedRowId === item.id;

                return (
                  <Fragment key={item.id}>
                    <tr
                      data-keyword-table-row-id={item.id}
                      style={{ height: rowResize.getHeight(item.id) }}
                      onDragOver={(event) => handleKeywordRowDragOver(event, item.id)}
                      onDrop={handleKeywordRowDrop}
                      className={`transition-colors ${
                        keywordOrder.draggingId === item.id
                          ? "bg-surface-elevated opacity-70"
                          : publicationProtected
                          ? "border-l-2 border-l-danger bg-danger-soft hover:bg-surface-elevated"
                          : isSelected
                          ? "bg-selected hover:bg-surface-elevated"
                          : isExpanded
                          ? "border-l-2 border-l-module-accent bg-selected hover:bg-surface-elevated"
                          : "hover:bg-surface-subtle"
                      }`}
                    >
                      <td className="w-8 border-r border-divider/70 px-0.5 py-1 text-center">
                        <KeywordTableDragHandle
                          id={item.id}
                          label={item.keyword}
                          enabled={orderMode === "manual"}
                           onDragStart={keywordOrder.startDragging}
                           onDragEnd={keywordOrder.endDragging}
                           onPointerDragStart={keywordOrder.startPointerDragging}
                           onMouseDragStart={keywordOrder.startMouseDragging}
                           onKeyboardMove={(_, offset) => keywordOrder.moveByOffset(item.id, offset)}
                        />
                      </td>
                      {/* NÃºmero da Linha */}
                      <td className="w-8 border-r border-divider/70 px-2 py-1 text-center font-mono text-[11px] text-text-muted select-none">
                        {index + 1}
                      </td>

                      {/* Checkbox */}
                      <KeywordSelectionCell id={item.id} keyword={item.keyword} selected={isSelected} onPointerDown={(event) => selection.onSelectionPointerDown(item.id, event)} onClick={(event) => selection.onSelectionClick(item.id, event)}/>

                      {/* Palavra */}
                      <td className={`min-w-0 border-r border-divider/70 px-3 py-1 whitespace-normal select-text ${isExpanded ? "text-module-accent" : "text-foreground/80"}`}>
                        <div className="flex min-w-0 items-start gap-1.5">
                          <button type="button" aria-expanded={isExpanded} aria-controls={`keyword-dna-${item.id}`} aria-label={`${isExpanded ? "Recolher" : "Expandir"} dados da keyword ${item.keyword}`} onClick={() => setExpandedRowId(isExpanded ? null : item.id)} className={`mt-0.5 shrink-0 rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/50 ${isExpanded ? "text-module-accent" : "text-module-accent/70 hover:text-module-accent"}`}>
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div
                              title={item.keyword}
                              className={`break-words select-text cursor-text text-keyword ${publicationProtected ? "font-semibold" : ""}`}
                            >
                              {item.keyword}
                            </div>
                            {publicationProtected && (
                              <div
                                className="mt-0.5 block max-w-full truncate select-text font-mono text-[10px] text-identity-published"
                                title="Canonical publicado fixo: slug e URL nao podem ser alterados ou removidos."
                              >
                                {getCanonicalUrl(item) || "URL publicada não lida"}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Vínculo de publicação: separado do status editorial. */}
                      <td className="w-[120px] border-r border-divider/70 px-2 py-1 text-center whitespace-nowrap">
                        <div className="flex min-w-0 flex-col items-center gap-1">
                          <span
                            className={`inline-flex max-w-full rounded border px-1.5 py-0.5 text-[10px] font-semibold ${publicationLink.state === "published" ? "border-success/50 bg-success-soft text-success" : publicationLink.state === "verified" ? "border-context-accent/50 bg-context-accent/10 text-context-accent" : publicationLink.state === "candidate" ? "border-pending/50 bg-pending-soft text-pending" : publicationLink.state === "legacy_unverified" ? "border-warning/50 bg-warning-soft text-warning" : "border-divider bg-surface-subtle text-text-muted"}`}
                            title={publicationLink.url || "Nenhuma página real vinculada a esta keyword."}
                          >
                            {publicationLink.label}
                          </span>
                          {publicationLink.url && <a href={publicationLink.url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate text-[10px] text-context-accent hover:text-foreground" title={publicationLink.url}>Página</a>}
                          {publicationLink.state === "legacy_unverified" && (
                            <button type="button" onClick={() => void handleCheckWithSite(item.id)} disabled={updating || siteSyncLoading || siteSyncPersisting} className="min-h-7 max-w-full rounded border border-context-accent/50 px-1.5 py-0.5 text-[10px] font-medium text-context-accent hover:border-context-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent disabled:cursor-wait disabled:opacity-50">
                              Conferir página
                            </button>
                          )}
                          {publicationLink.action && item.id && (
                            <button type="button" onClick={() => void handlePublicationLinkAction(item, publicationLink.action!, publicationLink.action === "correct_legacy" ? recoveryStatus : "")} disabled={updating} className="min-h-7 max-w-full rounded border border-divider px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:border-context-accent/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent disabled:cursor-wait disabled:opacity-50">
                              {publicationLink.action === "confirm" ? "Confirmar publicada" : publicationLink.action === "correct_legacy" ? "Corrigir marcação" : "Desvincular publicação"}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Resultados */}
                      <td className="w-[128px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        {resultValue !== null ? resultValue : "-"}
                      </td>

                      {/* Volume */}
                      <td className="w-[120px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={confirmedVolumeMeasurement && volumeValue !== 0 ? "text-context-accent" : undefined}
                            title={confirmedVolumeMeasurement ? "Volume mensal confirmado pelo provedor para a keyword exata." : undefined}
                          >
                            {volumeValue !== null ? formatMetricInteger(volumeValue) : "-"}
                          </span>
                          {zeroConfirmed && (
                            <span className="rounded border border-context-accent/50 bg-context-accent/10 px-1 text-[8px] font-bold uppercase tracking-wide text-context-accent" title="Zero mensal explicitamente confirmado pela keyword exata.">
                              0 confirmado
                            </span>
                          )}
                          {!isLegacyPublishedStatus(item.status) && (
                            <span className={`max-w-full truncate rounded border px-1 text-[8px] font-bold ${volumeEligibilityClass}`} title={volumeEligibilityLabel(volumeEligibility)}>
                              {volumeEligibilityLabel(volumeEligibility)}
                            </span>
                          )}
                          {(item.volume_source || "real") === "estimado" && (
                            <span
                              className="rounded border border-warning/50 bg-warning-soft px-1 text-[8px] font-bold uppercase tracking-wide text-warning"
                              title="Volume sem fonte real (API falhou). Não use para decisão editorial sem revisar."
                            >
                              Estimado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* KGR — score técnico + decisão humana de aplicabilidade */}
                      <td className="w-[108px] border-r border-divider/70 px-2 py-0 text-center font-mono">
                        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 whitespace-normal leading-snug">
                          {automaticKgrScore !== null
                            ? <span className={kgrColor}>{kgrText}</span>
                            : kgrState
                              ? <span className={`${kgrTextBadge} ${kgrState.className}`}>{kgrState.label}</span>
                              : <span className="text-[10px] text-text-muted">Não calculável</span>}
                          <select
                            value={kgrApplicability}
                            onChange={(event) => void handleHumanReviewAction(item.id, { type: "kgr", applicability: event.target.value as KgrApplicability })}
                            disabled={updating || bulkActionProcessing}
                            aria-label="Aplicabilidade do KGR"
                            title={`Aplicabilidade do KGR: ${kgrApplicabilityLabel(kgrApplicability)}. A decisão não altera o score nem o status.`}
                            className={`w-full cursor-pointer rounded border px-1 py-0 text-center font-sans text-[10px] font-bold leading-4 focus:border-module-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${kgrApplicabilityClass}`}
                          >
                            <option value="pending">Pendente</option>
                            <option value="applicable">Aplicável</option>
                            <option value="not_applicable">Não aplicável</option>
                          </select>
                        </div>
                      </td>

                      {/* CPC — mesma evidência Google Ads da etapa Volume */}
                      <td className="w-[96px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <span
                          className={cpcEvidence.source === "processor" && cpcEvidence.sortValue !== null ? "text-context-accent" : undefined}
                          title={cpcTitle}
                        >
                          {formatGoogleAdsCpcTableValue(cpcEvidence)}
                        </span>
                      </td>

                      {/* KD — evidência SEO DataForSEO Keyword Overview */}
                      <td className="w-[70px] border-r border-divider/70 px-2 py-1 text-center font-mono text-text-muted">
                        <span
                          className={keywordDifficultyEvidence.source === "processor" && keywordDifficultyEvidence.value !== null ? "text-context-accent" : undefined}
                          title={keywordDifficultyTitle}
                        >
                          {keywordDifficultyEvidence.value !== null ? keywordDifficultyEvidence.value : "—"}
                        </span>
                      </td>

                      {/* Intenção */}
                      <td className="w-[168px] border-r border-divider/70 px-3 py-1 text-center whitespace-nowrap">
                        <span
                          title={intentLabel}
                          className={`inline-flex max-w-full rounded border px-1.5 py-0.5 text-[9px] font-bold leading-snug ${intentIsPending ? "border-divider bg-surface-subtle text-text-muted" : "border-divider bg-surface-subtle text-foreground/80"}`}
                        >
                          <span className="truncate">{intentLabel}</span>
                        </span>
                      </td>

                      {/* Nicho de mercado — projeção canônica somente leitura */}
                      <td className="w-[168px] border-r border-divider/70 px-3 py-0.5 text-center">
                        <span title={keywordReadModel.niche || "Nicho ainda não informado"} className="inline-flex max-w-full rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold text-foreground/80">
                          <span className="truncate">{keywordReadModel.nicheLabel}</span>
                        </span>
                      </td>

                      {/* Funil */}
                      <td className="w-[80px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <span className="inline-flex min-w-12 justify-center rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-[10px] font-bold text-foreground/80" title={keywordReadModel.funnel || "Funil ainda não informado"}>
                          {keywordReadModel.funnelLabel}
                        </span>
                      </td>

                      {/* Silo/Categoria (Lista Pertencente) */}
                      <td className="w-[168px] border-r border-divider/70 px-3 py-0.5">
                        <select
                          value={item.lista_id || ""}
                          onChange={(e) => handleUpdateKeywordList(item.id, e.target.value)}
                          disabled={publicationProtected}
                          title={selectedListName}
                          aria-label="Silo/Categoria"
                          className={`${mineradorTableSelectClass} text-center text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <option value="">Sem Silo/Categoria</option>
                          {lists.map(list => (
                            <option key={list.id} value={list.id}>{list.nome}</option>
                          ))}
                        </select>
                      </td>

                      {/* Status Dropdown */}
                      <td className="relative w-[108px] border-r border-divider/70 px-3 py-0.5 text-center">
                        {editorialStatus.kind === "legacyEditorialStatusUnresolved" ? (
                          <div className="flex min-w-0 flex-col items-center gap-1">
                            <span className="inline-flex w-full items-center justify-center rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted" title="O status legado não é um estado editorial ativo. Escolha um estado para corrigir a marcação.">
                              Status a definir
                            </span>
                            {publicationLink.action === "correct_legacy" && (
                              <select
                                value={recoveryStatus}
                                onChange={(event) => setLegacyEditorialRecovery({ keywordId: item.id, status: event.target.value as EditorialKeywordStatus | "" })}
                                aria-label={`Estado editorial para recuperar ${item.keyword}`}
                                className="w-full rounded border border-divider bg-surface-subtle px-1 py-1 text-center text-[10px] font-medium text-foreground focus:border-module-accent focus:outline-none"
                              >
                                <option value="">Escolher status</option>
                                <option value="bruto">Bruto</option>
                                <option value="aprovado">Aprovado</option>
                                <option value="rejeitado">Rejeitado</option>
                              </select>
                            )}
                          </div>
                        ) : (
                          <select
                            value={editorialStatus.status}
                            onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                            className={`w-full cursor-pointer rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-center text-[10px] font-bold focus:border-module-accent focus:outline-none ${
                              editorialStatus.status === "aprovado"
                                ? "text-success border-success/50 bg-success-soft"
                                : editorialStatus.status === "rejeitado"
                                ? "text-danger border-danger/50 bg-danger-soft"
                                : "text-text-muted"
                            }`}
                          >
                            <option value="bruto">Bruto</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="rejeitado">Rejeitado</option>
                          </select>
                        )}
                        <KeywordTableRowResizeHandle rowId={item.id} enabled onStart={rowResize.startResize} />
                      </td>
                    </tr>

                    {/* Acordeom ExpansÃ­vel com AnÃ¡lise SemÃ¢ntica DinÃ¢mica em JSONB */}
                    {isExpanded && (
                      <tr className="border-b border-divider bg-surface">
                        <td id={`keyword-dna-${item.id}`} colSpan={15} className="min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere] border-r border-l-2 border-l-module-accent border-divider px-3 py-3">
                          <KeywordDnaPanel
                            keyword={item}
                            visualPosition={index + 1}
                            canonicalUrl={getCanonicalUrl(item) || null}
                            profile={{
                              listName: selectedListName,
                              googleAds: {
                                eligibility: volumeEligibilityLabel(volumeEligibility),
                                eligibilityStatus: String((item.analise_semantica?.volume_eligibility as Record<string, unknown> | undefined)?.status || volumeEligibility),
                                measurement: volumeMeasurement,
                              },
                              dataForSeo: {
                                measurement: allintitleMeasurement,
                                history: allintitleHistory,
                                overview: keywordDifficultyEvidence.measurement,
                              },
                              kgr: {
                                volumeUsed: volumeValue,
                                allintitleUsed: resultValue,
                                score: automaticKgrScore,
                                calculable: automaticKgrScore !== null,
                                applicability: kgrApplicabilityLabel(kgrApplicability),
                                decision: kgrDecisionLabel(kgrApplicability),
                                measurement: kgrMeasurementLabel(kgrMeasurement),
                                consistency: volumeKgrConsistencyLabel(volumeKgrConsistency),
                                history: Array.isArray(item.analise_semantica?.kgr_score_history) ? item.analise_semantica.kgr_score_history : [],
                                justification: typeof item.analise_semantica?.kgr_justificativa === "string" ? item.analise_semantica.kgr_justificativa : null,
                              },
                            }}
                            primaryPolicy={primaryKeywordPolicy}
                            primaryPolicyLabel={primaryKeywordPolicyLabel(primaryKeywordPolicy)}
                            allowPublishedWorkflowStatus={false}
                            statusUpdating={updating}
                            onWorkflowStatusChange={(status) => handleUpdateStatus(item.id, status)}
                            onHumanReviewAction={(action) => handleHumanReviewAction(item.id, action)}
                            processAttempts={processAttemptsByKeywordId[item.id]}
                            presentationBrief={presentationBriefs[item.id]}
                            presentationBriefLoading={presentationBriefLoadingId === item.id}
                            reviewDraftActive={Boolean(humanReviewDrafts[item.id])}
                            semanticConsolidationDraft={semanticConsolidationDrafts[item.id]}
                            semanticQualification={semanticQualifications[item.id] || null}
                            presentationAttempt={presentationAttempts[item.id] || null}
                            serpCollecting={allintitleMeasuring && selectedIds.has(item.id)}
                            serpFailed={Boolean(serpCollectionFailures[item.id])}
                            humanReviewOpen={humanReviewOpenId === item.id}
                            onHumanReviewOpenChange={(open) => setHumanReviewOpenId(open ? item.id : null)}
                            onPrimaryPolicyChange={(policy) => void handlePrimaryKeywordPolicyChange(item, policy)}
                          />

                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </KeywordTableShell>

      {/* FOOTER BATCH ACTIONS BAR */}
      {selectedIds.size > 0 && (
        <KeywordTableBulkBarShell className="font-sans">
          
          <div className="flex shrink-0 items-center gap-1 border-r border-divider pr-2 text-sm font-medium text-text-muted sm:gap-1.5 sm:pr-3">
            <span className="font-semibold text-foreground">{selectedIds.size}</span>
            <span>selecionada{selectedIds.size === 1 ? "" : "s"}</span>
            {hiddenSelectedCount > 0 && <span className="hidden text-xs text-text-muted lg:inline">· {visibleSelectedCount} visíveis</span>}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2">
            <div className="hidden shrink-0 items-center border-r border-divider pr-2 sm:flex sm:pr-3">
            
            <MineradorProcessAction
              title="Verificar se a keyword já pertence ao site"
              description="Procura ou confirma uma página existente da Marca para identificar vínculo com conteúdo publicado. A conferência não publica nem altera a página."
              label="Conferir site"
              ariaLabel="Conferir site"
              icon={siteSyncLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void handleCheckWithSite()}
              disabled={bulkActionProcessing || updating || siteSyncLoading || siteSyncPersisting || loading || !selectedBrandId}
              activeClassName={bulkActionStateClass("site")}
            />
            </div>

            <div data-bulk-workflow-core className="flex shrink-0 items-center gap-0.5 text-sm font-medium sm:gap-1">
            {/* Qualificação principal: atua somente sobre a seleção atual. */}
            {/* Compatibility marker for the compact process-action contract: <span className="hidden lg:inline">Lógica</span> */}
            <MineradorProcessAction
              title="Interpretar o significado da keyword"
              description="Analisa a keyword de forma determinística para identificar intenção, entidade, modificadores, nicho, funil e outros sinais do KeywordDNA. Não consulta APIs externas."
              label="Lógica"
              ariaLabel="Lógica"
              icon={dnaProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Brain className="h-4 w-4" aria-hidden="true" />}
              onClick={handleQualifySelected}
              disabled={bulkActionProcessing || updating || queueProcessing || dnaProcessing || loading || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("logic")}
            />
            <MineradorProcessAction
              title="Atualizar demanda de busca"
              description="Consulta no Google Ads as métricas disponíveis para as keywords selecionadas, como volume, CPC, tendência e concorrência."
              label="Volume"
              ariaLabel="Volume"
              icon={volumeMeasuring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BarChart3 className="h-4 w-4" aria-hidden="true" />}
              onClick={handleBatchQualify}
              disabled={bulkActionProcessing || updating || volumeMeasuring}
              activeClassName={bulkActionStateClass("volume")}
            />
            <MineradorProcessAction
              title="Medir concorrência orgânica"
              description={`${someSelectedHaveAllintitle ? "Medir/Atualizar resultados" : "Medir/Atualizar resultados"}. Consulta os dados orgânicos usados pelo Minerador para avaliar competição, Resultado, KD e outras evidências disponíveis para a keyword.`}
              label="Resultados"
              ariaLabel="Resultados"
              icon={allintitleMeasuring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              onClick={handleBatchAllintitle}
              disabled={bulkActionProcessing || updating || volumeMeasuring || allintitleMeasuring || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("results")}
            />
            <MineradorProcessAction
              title="Apresentação contextual da keyword"
              description="Gera ou reexecuta a apresentação contextual da keyword usando o contexto aprovado da Marca e sua Voz da Marca. Cria uma nova versão do próprio artefato e não altera nenhum outro processo, nem a aprovação."
              label="IA"
              ariaLabel="IA"
              icon={queueProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void handleBatchContextualPresentation()}
              disabled={bulkActionProcessing || updating || queueProcessing || dnaProcessing || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("ai")}
            />
            <MineradorProcessAction
              title="Confirmar as decisões do KeywordDNA"
              description="Abre a revisão humana para registrar decisões que só um humano pode tomar. É opcional: não condiciona aprovação, status nem envio ao Arquiteto."
              label="Revisar"
              ariaLabel="Revisar"
              icon={bulkActionProcessing && bulkProgress.step === "review" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              onClick={handleOpenHumanReview}
              disabled={bulkActionProcessing || updating || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("review")}
            />
            </div>

            <div data-bulk-workflow-secondary className="ml-auto flex shrink-0 items-center gap-1 border-l border-divider pl-2 sm:gap-2 sm:pl-3">
            <select
              defaultValue=""
              disabled={bulkActionProcessing || updating}
              aria-label="Aplicabilidade do KGR das selecionadas"
              onChange={(event) => { const nextApplicability = event.target.value; event.currentTarget.value = ""; if (nextApplicability) void handleBatchKgrApplicability(nextApplicability as KgrApplicability); }}
              className="hidden min-h-9 w-16 shrink-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:border-module-accent/45 hover:bg-surface-subtle focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50 sm:block sm:w-20 sm:px-2"
              title="Definir a aplicabilidade do KGR das keywords selecionadas. A decisão não altera o score nem o status."
            >
              <option value="">KGR</option>
              <option value="pending">Pendente</option>
              <option value="applicable">Aplicável</option>
              <option value="not_applicable">Não aplicável</option>
            </select>
            {/* Ordem do fluxo humano: decidir KGR → concluir revisão → definir status. */}
            <MineradorProcessAction
              title="Concluir a revisão humana das selecionadas"
              description="Conclui a Revisão Humana de cada keyword selecionada com os defaults conservadores: divergências sem decisão mantêm a Lógica, enriquecimentos não selecionados são ignorados e campos sem evidência permanecem desconhecidos. Exige a Aplicabilidade do KGR decidida quando o cálculo é possível. Não altera status, aprovação nem métricas."
              label="Concluir revisão"
              ariaLabel="Concluir revisão das selecionadas"
              icon={bulkActionProcessing && bulkProgress.step === "review" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void handleBatchCompleteHumanReview()}
              disabled={bulkActionProcessing || updating || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("review")}
            />
            <select
              defaultValue=""
              disabled={bulkActionProcessing || updating}
              aria-label="Status"
              onChange={(event) => { const nextStatus = event.target.value; event.currentTarget.value = ""; if (nextStatus) void handleBatchStatus(nextStatus); }}
              className="hidden min-h-9 w-20 shrink-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:border-module-accent/45 hover:bg-surface-subtle focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50 sm:block sm:w-24 sm:px-2"
              title="Definir o status operacional das keywords selecionadas"
            >
              <option value="">Status</option>
              <option value="bruto">Bruto</option>
              <option value="aprovado">Aprovado</option>
              <option value="rejeitado">Rejeitado</option>
            </select>

            <div ref={moreActionsRef} className="relative shrink-0">
              <button
              type="button"
              onClick={() => setMoreActionsOpen(current => !current)}
                disabled={bulkActionProcessing}
                className="flex min-h-9 min-w-9 items-center justify-center rounded border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-foreground transition-colors hover:border-module-accent/45 hover:bg-surface-subtle hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:cursor-not-allowed disabled:opacity-50"
                aria-expanded={moreActionsOpen}
                aria-haspopup="menu"
                aria-controls="minerador-more-actions-menu"
                aria-label="Mais ações"
                title="Mais ações"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
              {moreActionsOpen && <div id="minerador-more-actions-menu" role="menu" className="fixed bottom-12 right-2 z-50 flex min-w-56 flex-col gap-1 rounded border border-divider bg-surface-elevated p-2 shadow-lg">
                <div role="none" className="flex items-center gap-1 rounded px-2 py-1 sm:hidden">
                  <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleCheckWithSite(); }} disabled={bulkActionProcessing || updating || siteSyncLoading || siteSyncPersisting || loading || !selectedBrandId} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm font-medium text-context-accent transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Conferir site</button>
                  <InfoHint title="Verificar se a keyword já pertence ao site" description="Procura ou confirma uma página existente da Marca para identificar vínculo com conteúdo publicado. A conferência não publica nem altera a página." />
                </div>
                <label className="flex items-center justify-between gap-3 rounded px-3 py-2 text-sm font-medium text-text-muted sm:hidden">
                  <span>Status</span>
                  <select
                    defaultValue=""
                    disabled={bulkActionProcessing || updating}
                    aria-label="Status"
                    onChange={(event) => { const nextStatus = event.target.value; event.currentTarget.value = ""; if (nextStatus) void handleBatchStatus(nextStatus); }}
                    className="min-h-9 min-w-24 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm font-medium text-foreground outline-none focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50"
                  >
                    <option value="">Selecionar</option>
                    <option value="bruto">Bruto</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="rejeitado">Rejeitado</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 rounded px-3 py-2 text-sm font-medium text-text-muted sm:hidden">
                  <span>KGR</span>
                  <select
                    defaultValue=""
                    disabled={bulkActionProcessing || updating}
                    aria-label="Aplicabilidade do KGR das selecionadas"
                    onChange={(event) => { const nextApplicability = event.target.value; event.currentTarget.value = ""; if (nextApplicability) void handleBatchKgrApplicability(nextApplicability as KgrApplicability); }}
                    className="min-h-9 min-w-24 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm font-medium text-foreground outline-none focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50"
                  >
                    <option value="">Selecionar</option>
                    <option value="pending">Pendente</option>
                    <option value="applicable">Aplicável</option>
                    <option value="not_applicable">Não aplicável</option>
                  </select>
                </label>
                <div className="flex items-center gap-1 rounded px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-muted">Mover para Silo</span>
                  <select value={targetListId} onChange={(event) => { setTargetListId(event.target.value); }} className="max-w-28 min-w-0 truncate bg-transparent text-sm font-medium text-foreground focus:outline-none" aria-label="Selecionar silo para mover keywords">
                    {lists.map(list => <option key={list.id} value={list.id}>{list.nome}</option>)}
                  </select>
                  <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleBatchMove(); }} disabled={bulkActionProcessing || updating || !targetListId} className="min-h-9 min-w-9 rounded p-1 text-context-accent hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent disabled:opacity-50" title="Mover keywords para o silo selecionado"><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                <InfoHint title="Enviar ao Arquiteto" description="Envia as keywords aprovadas para a etapa de formação de artigos.">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMoreActionsOpen(false); void handleBatchSendToArchitect(); }}
                    disabled={bulkActionProcessing || updating || queueProcessing || dnaProcessing || architectHandoffSending || !architectHandoffGate.ok}
                    className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium text-context-accent transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Enviar ao Arquiteto"
                    aria-describedby={architectHandoffGate.ok ? undefined : "minerador-architect-handoff-gate"}
                  >
                    {architectHandoffSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    <span>{architectHandoffSending ? "Enviando ao Arquiteto..." : "Enviar ao Arquiteto"}</span>
                  </button>
                </InfoHint>
                {!architectHandoffGate.ok && (
                  <p id="minerador-architect-handoff-gate" role="note" className="px-3 text-sm leading-5 text-text-muted">
                    {architectHandoffGate.reason}
                  </p>
                )}
                <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleBatchDelete(false); }} disabled={bulkActionProcessing || updating || queueProcessing} className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50 lg:hidden"><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir</button>
              </div>}
            </div>

            {/* Excluir */}
            <button
              onClick={() => void handleBatchDelete(false)}
              disabled={bulkActionProcessing || updating || queueProcessing}
              aria-label="Excluir"
              className="hidden min-h-9 shrink-0 items-center gap-1 rounded border border-danger/35 bg-transparent px-1.5 py-1 text-sm font-medium text-danger transition-colors hover:border-danger/60 hover:bg-danger-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-50 lg:flex lg:px-2"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Excluir</span>
            </button>
            </div>
          </div>

          {bulkProgress.status !== "idle" && bulkProgress.step && bulkProgressMeta && (
            <div
              data-minerador-bulk-progress
              data-progress-state={bulkProgress.status}
              data-progress-step={bulkProgress.step}
              aria-live="polite"
              title={bulkProgress.message || bulkProgressMeta.processingLabel}
              className={`ml-auto min-w-0 w-28 shrink-0 rounded border px-2 py-0.5 sm:w-44 lg:w-56 ${bulkProgressCardClass}`}
            >
              <div className="flex min-w-0 items-center gap-1 leading-3">
      <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold leading-3 ${bulkProgress.status === "success" ? "text-success" : bulkProgress.status === "error" ? "text-danger" : bulkProgressMeta.textClass}`}>
                  {bulkProgress.status === "processing" ? bulkProgress.message || bulkProgressMeta.processingLabel : bulkProgress.status === "success" ? "Concluído" : "Falhou"}
                </span>
      <span className="shrink-0 text-[11px] font-semibold leading-3 text-foreground">
                  {bulkProgressDisplayPercentage === null ? "—" : `${bulkProgressDisplayPercentage}%`}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={bulkProgressMeta.processingLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={bulkProgressIndeterminate ? undefined : bulkProgressBarPercentage}
                aria-valuetext={bulkProgressAriaValueText}
                className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-divider"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${bulkProgressMeta.barClass} ${bulkProgress.status === "processing" && bulkProgressIndeterminate ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""}`}
                  style={{ width: `${bulkProgressBarPercentage}%` }}
                />
              </div>
    <div className="truncate text-[11px] leading-3 text-text-muted">
                {bulkProgress.status === "processing" ? bulkProgress.detail || (bulkProgress.total ? `${bulkProgress.current} de ${bulkProgress.total} keywords` : "Em andamento") : bulkProgress.message}
              </div>
            </div>
          )}
        </KeywordTableBulkBarShell>
      )}

      <DeleteConfirmation open={deleteSimpleOpen} title="Excluir keywords não publicadas?"
        description="Esta ação excluirá definitivamente as keywords selecionadas e os dados operacionais não publicados que pertencem a elas. Versões e eventos canônicos permanecem preservados."
        confirmationName={deleteReview?.confirmationName || ""} impact={deleteReview?.impact || []} confirmLabel="Excluir definitivamente"
        onCancel={() => { setDeleteSimpleOpen(false); setDeleteReview(null); }} onConfirm={() => handleBatchDelete(true)}/>

      <PublishedDeleteConfirmation open={deleteApprovalOpen} title="Remover keywords publicadas por 24 horas"
        description={`Esta ação removerá ${deleteReview?.publishedIds.length || 0} keyword(s) publicada(s) da operação e permitirá restauração durante 24 horas.`}
        confirmationName={deleteReview?.confirmationName || ""} impact={deleteReview?.impact || []}
        onCancel={() => { setDeleteApprovalOpen(false); setDeleteReview(null); }} onConfirm={() => handleBatchDelete(true)}/>

      {/* Modal de criaÃ§Ã£o de Categoria/Silo */}
      {isListModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded overflow-hidden relative shadow-2xl">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-action-accent"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1">
                <FolderPlus className="w-3.5 h-3.5 text-module-accent" /> Criar Silo / Categoria
              </span>
              <button onClick={() => setIsListModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateList} className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome da Categoria/Silo</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: ClÃ­nicas Campinas, Blog Silo RJ"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="w-full rounded border border-divider bg-surface-subtle px-2.5 py-1.5 text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nicho / Setor do Projeto</label>
                <input 
                  type="text" 
                  placeholder="Ex: Odontologia, Advocacia"
                  value={newListNicho}
                  onChange={(e) => setNewListNicho(e.target.value)}
                  className="w-full rounded border border-divider bg-surface-subtle px-2.5 py-1.5 text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <button 
                  type="button" 
                  onClick={() => setIsListModalOpen(false)} 
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                    className="rounded bg-action-accent px-4 py-1.5 font-bold text-foreground transition-colors hover:bg-action-accent/85"
                >
                  Criar Silo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de ImportaÃ§Ã£o Manual (Copy e Cola) */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-lg rounded overflow-hidden relative shadow-2xl">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-action-accent"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-module-accent" /> Importar Lista Manualmente (Copiar & Colar)
              </span>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualImport} className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  Cole as Palavras-Chave (uma por linha)
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Ex:&#10;como fazer seo para dentista&#10;agencia de marketing clinica estetica&#10;dentista em campinas preco"
                  value={manualKeywordsText}
                  onChange={(e) => setManualKeywordsText(e.target.value)}
                    className="min-h-[120px] w-full resize-y rounded border border-divider bg-surface-subtle px-2.5 py-1.5 font-sans text-xs text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Silo opcional */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">
                    Silo (opcional)
                  </label>
                  <select
                    value={manualListId}
                    onChange={(e) => setManualListId(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    <option value="">Sem silo</option>
                    {lists.map(list => (
                      <option key={list.id} value={list.id}>{list.nome}</option>
                    ))}
                  </select>
                  {lists.length === 0 && <p className="text-xs text-slate-500">Nenhum silo disponível. As keywords serão importadas sem silo.</p>}
                </div>

                {/* LocalizaÃ§Ã£o padrÃ£o */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Localidade / RegiÃ£o</label>
                  <input
                    type="text"
                    placeholder="Ex: Brasil, SP, Rio de Janeiro"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    className="w-full rounded border border-divider bg-surface-subtle px-2.5 py-1.5 text-xs font-semibold text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* IntenÃ§Ã£o Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">IntenÃ§Ã£o Inicial</label>
                  <select
                    value={manualIntent}
                    onChange={(e) => setManualIntent(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    <option value="">AutomÃ¡tico (HeurÃ­stica)</option>
                    <option value="Informativa">Informativa</option>
                    <option value="Comercial investigativa">Comercial investigativa</option>
                    <option value="Transacional">Transacional</option>
                    <option value="Navegacional">Navegacional</option>
                    <option value="Local">Local</option>
                    <option value="Mista">Mista</option>
                  </select>
                </div>

                {/* Nicho Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Nicho Inicial</label>
                  <select
                    value={manualNicho}
                    onChange={(e) => setManualNicho(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    <option value="">AutomÃ¡tico (HeurÃ­stica)</option>
                    <option value="Odontologia">Odontologia</option>
                    <option value="Advocacia">Advocacia</option>
                    <option value="SaÃºde">SaÃºde</option>
                    <option value="EstÃ©tica">EstÃ©tica</option>
                    <option value="Fitness">Fitness</option>
                    <option value="ServiÃ§os">ServiÃ§os</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Status Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Status Inicial</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    <option value="bruto">Bruto</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="rejeitado">Rejeitado</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex items-center gap-1.5 rounded bg-action-accent px-4 py-1.5 font-bold text-foreground transition-colors hover:bg-action-accent/85 disabled:opacity-50"
                >
                  {updating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Importar Palavras</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de ExportaÃ§Ã£o com OpÃ§Ã£o de Renomear Arquivo */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded overflow-hidden relative shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 to-teal-600"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Exportar Planilha (CSV)
              </span>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                exportSelectedToCSV(exportFileName);
                setIsExportModalOpen(false);
              }} 
              className="p-4 flex flex-col gap-3.5"
            >
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome do Arquivo CSV</label>
                <input 
                  type="text" 
                  required
                  placeholder="Nome do arquivo..."
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-emerald-600 text-xs font-semibold"
                />
                <span className="text-[8.5px] text-slate-500 italic mt-0.5">Nota: a extensÃ£o .csv serÃ¡ adicionada automaticamente.</span>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 text-xs">
                <button 
                  type="button" 
                  onClick={() => setIsExportModalOpen(false)} 
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-650 hover:bg-emerald-600 text-white font-bold py-1.5 px-4 rounded transition-all"
                >
                  Exportar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
