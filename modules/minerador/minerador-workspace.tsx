"use client";

import { useState, useEffect, useRef, Fragment, useMemo } from "react";
import Papa from "papaparse";
import { 
  Key, 
  Search, 
  Loader2, 
  ArrowUpDown,
  CheckSquare,
  Square,
  Trash2,
  Check,
  X,
  Plus,
  RefreshCw,
  FolderPlus,
  Folders,
  ArrowRight,
  AlertTriangle,
  Play,
  FileSpreadsheet,
  Upload,
  Brain,
  ChevronDown,
  ChevronRight,
  Building2,
} from "lucide-react";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { useBrand } from "@/components/brand-context";
import { AppMenu } from "@/components/app-menu";
import { KeywordDnaPanel } from "@/components/editorial/dna-panels";
import { MineradorLastOrganizationRestorer } from "./last-organization-restorer";
import { DangerApprovalDialog } from "@/components/editorial/danger-approval-dialog";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  autoClassifyIntent,
  autoDetectNiche,
  deriveLogicalKeywordDna,
  mergeLogicalKeywordSemantic,
  semanticRecordsEqual,
} from "@/lib/arquiteto/keyword-dna-engine";
import { buildMineradorSiteSyncPlan, loadMineradorSiteSyncSnapshot, uniqueSiteSyncCandidates, type MineradorSiteSyncPlan } from "@/lib/minerador/site-sync-adapter";
import { calculateKgrFromMetrics, classifyKgrMeasurement, compareKgrRows, hasUsableKgrScore, kgrApplicabilityLabel, kgrDecisionLabel, kgrMeasurementLabel, readKgrApplicability, setKgrApplicability, type KgrApplicability } from "@/lib/minerador/kgr-applicability";
import { canonicalIntentLabel, normalizeIntentKey } from "@/lib/minerador/intent-taxonomy";
import { buildVolumeMetricPatch, normalizeVolumeKeyword, type VolumeLookupResult } from "@/lib/minerador/volume-provider";
import { assessVolumeKgrConsistency, hasExplicitZeroMeasurement, volumeKgrConsistencyLabel, type VolumeKgrConsistency } from "@/lib/minerador/volume-kgr-consistency";
import { ALLINTITLE_INTERVAL_MS, ALLINTITLE_MAX_BATCH_SIZE, ALLINTITLE_TOTAL_TIMEOUT_MS, allintitleStageLabel, buildAllintitleMetricPatch, currentKgrApplicability, isPersistableAllintitleResult, type AllintitleMeasurementRequest, type AllintitleMeasurementResult, type AllintitleRequestItem, type AllintitleStage } from "@/lib/minerador/allintitle";
import { deriveMineradorTableRows } from "@/lib/minerador/table-view";
import { mineradorLastOrganizationKey, mineradorOrganizationButtonSummary, mineradorOrganizationLabels, type MineradorOrganizationValues } from "@/lib/minerador/last-organization";
import { primaryKeywordPolicyLabel, readPrimaryKeywordPolicy, setPrimaryKeywordPolicy, type PrimaryKeywordPolicy } from "@/lib/minerador/primary-keyword-policy";
import { buildBrandRef } from "@/lib/tenant-routing";
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
  kgr_score_history?: Array<Record<string, unknown>>;
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
}

type SiteEvidenceView = { source?: string; sourceUrl?: string; resolvedUrl?: string | null; declaredCanonicalUrl?: string | null; urlSituation?: string; publicationStatus?: string; keywordUrlRelation?: string; architectureStatus?: string; batchId?: string; lastCheckedAt?: string; siloId?: string; siloName?: string | null; consolidatedAt?: string };
function siteEvidenceFor(item: KeywordItem): SiteEvidenceView | null { const origin = item.analise_semantica?.site_origin; return origin && typeof origin === "object" && !Array.isArray(origin) ? origin as SiteEvidenceView : null; }
function siteRelationLabel(value?: string) { return ({ confirmed_primary: "Principal confirmada", candidate_primary: "Principal candidata", supporting: "Apoio provável", mentioned: "Mencionada no conteúdo", undefined: "Sem relação definida" } as Record<string, string>)[value || "undefined"] || value || "Sem relação definida"; }
function siteArchitectureLabel(value?: string) { return ({ not_structured: "Não estruturado", awaiting_architecture: "Aguardando arquitetura", in_review: "Em revisão", architecture_confirmed: "Arquitetura confirmada", architectural_review_required: "Revisão arquitetural necessária", conflict: "Com conflito" } as Record<string, string>)[value || "awaiting_architecture"] || value || "Aguardando arquitetura"; }
function sitePublicationLabel(value?: string) { return ({ not_confirmed: "Não confirmada", published: "Publicada", not_found: "Não localizada", redirected: "Redirecionada", outside_sitemap: "Fora do sitemap", canonical_conflict: "Conflito de canonical" } as Record<string, string>)[value || "not_confirmed"] || value || "Não confirmada"; }
function siteSyncOutcomeLabel(value: string) { return ({ new: "Nova keyword", evidence_updated: "Evidência será atualizada", no_change: "Sem alteração", duplicate_in_batch: "Duplicada na prévia", invalid: "Inválida", blocked: "Bloqueada", existing: "Já existente" } as Record<string, string>)[value] || value; }

type ExtensionPreflightResult = {
  connected: boolean;
  code: string;
  message: string;
  session?: Record<string, unknown> | null;
  diagnostic?: Record<string, unknown>;
};

const extensionPreflightMessages: Record<string, string> = {
  connected: "Conexão operacional validada.",
  session_missing: "A marca foi carregada, mas esta aba ainda não foi conectada.",
  tab_mismatch: "A extensão está conectada a outra aba do Minerador.",
  brand_mismatch: "A extensão está conectada a outra marca.",
  actor_mismatch: "A conexão pertence a outro usuário.",
  route_mismatch: "A conexão pertence a outra rota do Minerador.",
  protocol_mismatch: "Recarregue a extensão para usar o protocolo atual.",
  ack_timeout: "A aba do Minerador não confirmou o handshake a tempo.",
  page_not_ready: "A página do Minerador ainda não confirmou prontidão para a extensão.",
  bridge_not_ready: "A bridge da extensão foi reinjetada, mas ainda não está operacional.",
  bridge_context_invalidated: "A extensão foi recarregada e a bridge antiga deixou de ser válida. Tente conectar novamente.",
  bridge_version_mismatch: "A bridge da extensão usa uma versão incompatível. Recarregue a extensão.",
  bridge_unavailable: "Não foi possível comunicar com a extensão nesta aba.",
  access_not_confirmed: "O acesso da página não foi confirmado para esta conta e marca.",
};

const ALLINTITLE_PREFLIGHT_TIMEOUT_MS = 7000;

function withWorkspaceTimeout<T>(operation: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
    if (timer !== null) window.clearTimeout(timer);
  });
}

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

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const { selectedBrandId, setSelectedBrandId, brands, userRole, profileLoading } = useBrand();
  const router = useRouter();
  const supabase = useMemo(() => createAuthenticatedBrowserClient(), []);
  const activeBrand = brands.find(b => b.id === selectedBrandId) || null;



  const getSiloSlug = (listId: string | null) => {
    if (!listId) return "";
    const listObj = lists.find(l => l.id === listId);
    if (!listObj) return "";
    if (activeBrand?.silos_existentes && Array.isArray(activeBrand.silos_existentes)) {
      const match = activeBrand.silos_existentes.find((s: any) => 
        (typeof s === "object" && s.nome === listObj.nome) ||
        (typeof s === "string" && s === listObj.nome)
      );
      if (match) {
        return typeof match === "object" ? match.slug : toSlug(match);
      }
    }
    return toSlug(listObj.nome); // fallback
  };

  const getCanonicalUrl = (item: KeywordItem) => {
    if (!activeBrand?.site_url) return "";
    let domain = activeBrand.site_url.trim();
    if (!domain.startsWith("http://") && !domain.startsWith("https://")) {
      domain = `https://${domain}`;
    }
    if (domain.endsWith("/")) {
      domain = domain.slice(0, -1);
    }
    
    const siloSlug = getSiloSlug(item.lista_id);
    const kwSlug = item.analise_semantica?.slug_sugerido || toSlug(item.keyword);
    
    if (siloSlug) {
      return `${domain}/${siloSlug}/${kwSlug}`;
    }
    return `${domain}/${kwSlug}`;
  };

  // Estados de Dados
  const [lists, setLists] = useState<ListObject[]>([]);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  
  // Estados de Controle/Status
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [queueProgress, setQueueProgress] = useState(0);
  const [dnaProcessing, setDnaProcessing] = useState(false);
  const [dnaProgress, setDnaProgress] = useState({ current: 0, total: 0 });
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string; code?: string; stage?: string; persistent?: boolean; retryAllintitle?: boolean; retryAllintitleIds?: string[]; diagnostic?: Record<string, unknown> } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchDataInFlightRef = useRef<string | null>(null);
  const fetchDataLoadedKeyRef = useRef<string | null>(null);
  const fetchDataActiveKeyRef = useRef<string | null>(null);
  const notificationTimerRef = useRef<number | null>(null);
  
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
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<"keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "nicho" | "lista">("keyword");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [organizationHydratedKey, setOrganizationHydratedKey] = useState<string | null>(null);

  const organizationValues = useMemo<MineradorOrganizationValues>(() => ({
    searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture,
    filterSitePublication, filterKgrApplicability, filterKgrMeasurement, sortColumn, sortDirection,
  }), [searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture, filterSitePublication, filterKgrApplicability, filterKgrMeasurement, sortColumn, sortDirection]);
  const organizationScopeKey = session?.user?.email && selectedBrandId
    ? mineradorLastOrganizationKey(session.user.email, selectedBrandId)
    : null;
  const organizationHydrationPending = Boolean(organizationScopeKey && organizationHydratedKey !== organizationScopeKey);

  const filteredKeywords = useMemo(() => deriveMineradorTableRows(keywords, lists, {
    searchQuery,
    status: filterStatus,
    intent: filterIntent,
    listId: filterListId,
    siteRelation: filterSiteRelation,
    siteArchitecture: filterSiteArchitecture,
    sitePublication: filterSitePublication,
    kgrApplicability: filterKgrApplicability,
    kgrMeasurement: filterKgrMeasurement,
    sortColumn,
    sortDirection,
  }), [keywords, lists, searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture, filterSitePublication, filterKgrApplicability, filterKgrMeasurement, sortColumn, sortDirection]);

  // SeleÃ§Ãµes Lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allintitleBatchId, setAllintitleBatchId] = useState<string | null>(null);
  const [allintitleMode, setAllintitleMode] = useState<"single" | "batch" | null>(null);
  const [allintitlePreview, setAllintitlePreview] = useState<AllintitleMeasurementResult[]>([]);
  const [allintitleExcludedIds, setAllintitleExcludedIds] = useState<Set<string>>(new Set());
  const [allintitleExtensionState, setAllintitleExtensionState] = useState<"checking" | "available" | "unavailable" | "running" | "paused" | "completed">("checking");
  const [resultsMeasuring, setResultsMeasuring] = useState(false);
  const [allintitlePreflight, setAllintitlePreflight] = useState<ExtensionPreflightResult>({ connected: false, code: "session_missing", message: extensionPreflightMessages.session_missing });
  const allintitleRunRef = useRef<{ batchId: string | null; mode: "single" | "batch" | null; requestId: string | null; keywordId: string | null; resultReceived: boolean }>({ batchId: null, mode: null, requestId: null, keywordId: null, resultReceived: false });
  const allintitleOperationTimerRef = useRef<number | null>(null);
  const [deleteApprovalOpen, setDeleteApprovalOpen] = useState(false);
  const keywordHistory = useLocalHistory("minerador", keywords, snapshot => {
    setKeywords(snapshot);
    setSelectedIds(new Set());
  }, 30, selectedBrandId || "sem-marca");

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
  const [volumeMeasuring, setVolumeMeasuring] = useState(false);


  // NotificaÃ§Ãµes
  const showNotification = (type: "success" | "error" | "info", message: string, options: { code?: string; stage?: string; persistent?: boolean; retryAllintitle?: boolean; retryAllintitleIds?: string[]; diagnostic?: Record<string, unknown> } = {}) => {
    if (notificationTimerRef.current) window.clearTimeout(notificationTimerRef.current);
    setNotification({ type, message, ...options });
    if (!options.persistent) notificationTimerRef.current = window.setTimeout(() => setNotification(null), type === "error" ? 12_000 : 3000);
  };

  const pushKeywordsHistory = (snapshot = keywords, label = "Alteração na planilha de keywords") => keywordHistory.capture(label, snapshot);

  const sendAllintitleExtensionRequest = (payload: Record<string, unknown>) => {
    const requestId = typeof payload.requestId === "string" ? payload.requestId : crypto.randomUUID();
    window.dispatchEvent(new CustomEvent("minerador:allintitle-request", { detail: { ...payload, requestId } }));
    return requestId;
  };

  const buildExtensionPreflightContext = () => ({
    actorUserId: session?.user?.id || null,
    brandId: selectedBrandId || null,
    brandRef: activeBrand ? buildBrandRef(activeBrand.nome, activeBrand.id) : null,
    origin: window.location.origin,
    pathname: window.location.pathname,
    module: "minerador",
    protocolVersion: 2,
  });

  const confirmAllintitleExtensionConnection = () => new Promise<ExtensionPreflightResult>((resolve) => {
    const requestId = crypto.randomUUID();
    const context = buildExtensionPreflightContext();
    const diagnosticBase = { requestId, context, checkedAt: new Date().toISOString() };
    const timeout = window.setTimeout(() => {
      window.removeEventListener("minerador:allintitle-response", onResponse);
      setAllintitleExtensionState("unavailable");
      const result = { connected: false, code: "ack_timeout", message: extensionPreflightMessages.ack_timeout, diagnostic: diagnosticBase };
      setAllintitlePreflight(result);
      resolve(result);
    }, ALLINTITLE_PREFLIGHT_TIMEOUT_MS);
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || detail.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("minerador:allintitle-response", onResponse);
      const nested = detail.preflight && typeof detail.preflight === "object" ? detail.preflight as Record<string, unknown> : {};
      const connected = detail.type === "extension_available" && detail.ok === true && nested.connected !== false;
      const code = connected ? "connected" : String(detail.code || nested.code || "bridge_unavailable");
      const message = connected ? extensionPreflightMessages.connected : String(detail.message || nested.message || extensionPreflightMessages[code] || extensionPreflightMessages.bridge_unavailable);
      const result: ExtensionPreflightResult = {
        connected,
        code,
        message,
        session: (detail.session || nested.session || detail.connection || null) as Record<string, unknown> | null,
        diagnostic: { ...diagnosticBase, code, message, response: detail },
      };
      setAllintitleExtensionState(connected ? "available" : "unavailable");
      setAllintitlePreflight(result);
      resolve(result);
    };
    setAllintitleExtensionState("checking");
    window.addEventListener("minerador:allintitle-response", onResponse);
    window.dispatchEvent(new CustomEvent("minerador:allintitle-request", { detail: { type: "minerador.allintitle.probe.v1", requestId, context } }));
  });

  const clearAllintitleOperationTimer = () => {
    if (allintitleOperationTimerRef.current) window.clearTimeout(allintitleOperationTimerRef.current);
    allintitleOperationTimerRef.current = null;
  };

  const closeAllintitleRun = () => {
    clearAllintitleOperationTimer();
    allintitleRunRef.current = { batchId: null, mode: null, requestId: null, keywordId: null, resultReceived: false };
    setAllintitleBatchId(null);
    setAllintitleMode(null);
    setResultsMeasuring(false);
    setAllintitlePreview([]);
    setAllintitleExcludedIds(new Set());
  };

  const armAllintitleOperationTimeout = (batchId: string, requestId: string, items: KeywordItem[]) => {
    clearAllintitleOperationTimer();
    allintitleOperationTimerRef.current = window.setTimeout(() => {
      const activeRun = allintitleRunRef.current;
      if (activeRun.batchId !== batchId || activeRun.requestId !== requestId) return;
      sendAllintitleExtensionRequest({ type: "minerador.allintitle.cancel.v1", batchId, requestId: activeRun.requestId });
      setAllintitleExtensionState("unavailable");
      showNotification("error", "A consulta allintitle excedeu o tempo limite. Os dados existentes foram preservados.", { code: "timeout", stage: "timeout", persistent: true, retryAllintitle: true, retryAllintitleIds: items.map(item => item.id), diagnostic: { requestId, batchId, keywordIds: items.map(item => item.id), code: "timeout", stage: "timeout", measuredAt: new Date().toISOString() } });
      closeAllintitleRun();
    }, ALLINTITLE_TOTAL_TIMEOUT_MS + 5000);
  };

  const persistSingleAllintitleResult = async (result: AllintitleMeasurementResult) => {
    if (!selectedBrandId) return;
    const retryOptions = { retryAllintitle: true, retryAllintitleIds: result.keywordId ? [result.keywordId] : undefined };
    if (!isPersistableAllintitleResult(result)) {
      if (result.status === "captcha") {
        clearAllintitleOperationTimer();
        setAllintitleExtensionState("paused");
        showNotification("error", "Allintitle pausado por CAPTCHA. Resolva na aba do Google e clique em Retomar.", { ...retryOptions, code: result.errorCode, stage: "paused_captcha", persistent: true });
        return;
      }
      if (result.status === "blocked") {
        closeAllintitleRun();
        showNotification("error", "Allintitle bloqueado pelo Google. Os dados existentes foram preservados.", { ...retryOptions, code: result.errorCode, stage: result.stage || "reading_page", persistent: true });
        return;
      }
      closeAllintitleRun();
      const terminalMessage = result.status === "timeout"
        ? "A consulta allintitle excedeu o tempo limite."
        : result.status === "unavailable"
          ? "A contagem de resultados não está disponível nesta página."
          : result.status === "cancelled"
            ? "A consulta allintitle foi cancelada."
            : result.status === "error"
              ? "Falha ao receber ou interpretar a resposta da extensão."
              : result.message || "Os dados existentes foram preservados.";
      showNotification("error", `${result.status === "timeout" ? terminalMessage : `Allintitle falhou na etapa: ${allintitleStageLabel[(result.stage || "failed") as AllintitleStage] || "Falhou"}. ${terminalMessage}`}`, { ...retryOptions, code: result.errorCode || result.status, stage: result.stage || "failed", persistent: true, diagnostic: { requestId: result.requestId, batchId: result.batchId, keywordId: result.keywordId, brandId: result.brandId, status: result.status, stage: result.stage || "failed", errorCode: result.errorCode || result.status } });
      return;
    }
    const item = keywords.find(keyword => keyword.id === result.keywordId);
    const allowedListIds = new Set(lists.map(list => list.id));
    if (!item || !selectedIds.has(item.id) || result.brandId !== selectedBrandId || !item.lista_id || !allowedListIds.has(item.lista_id) || item.keyword !== result.keyword) {
      closeAllintitleRun();
      showNotification("error", "Resultado allintitle descartado: keyword, seleção ou marca não conferem.");
      return;
    }
    const patch = buildAllintitleMetricPatch(item, result, currentKgrApplicability(item.analise_semantica));
    if (!Object.keys(patch).length) {
      closeAllintitleRun();
      showNotification("error", "Resultado allintitle inválido; nenhum dado foi alterado.");
      return;
    }
    setUpdating(true);
    try {
      const { error } = await withWorkspaceTimeout(supabase.from("keywords_kgr").update(patch).eq("id", item.id).eq("brand_id", selectedBrandId), 15000, "A persistência do resultado excedeu o tempo limite.");
      if (error) throw error;
      pushKeywordsHistory(keywords, "Confirmar medição individual allintitle");
      setKeywords(current => current.map(keyword => keyword.id === item.id ? { ...keyword, ...patch } : keyword));
      showNotification("success", "Resultado allintitle salvo e linha atualizada.");
    } catch (error) {
      console.error("Erro ao persistir resultado individual allintitle:", error);
      showNotification("error", "O resultado foi recebido, mas não foi salvo. Nenhum dado existente foi alterado.", { ...retryOptions, code: "persistence_timeout_or_error", stage: "persisting", persistent: true });
    } finally {
      setUpdating(false);
      closeAllintitleRun();
    }
  };

  useEffect(() => {
    const onAllintitleResponse = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || typeof detail !== "object") return;
      if (detail.type === "bridge_ready") setAllintitleExtensionState("checking");
      if (detail.type === "extension_available") {
        setAllintitleExtensionState("available");
        setAllintitlePreflight({ connected: true, code: "connected", message: extensionPreflightMessages.connected, session: (detail.connection || null) as Record<string, unknown> | null, diagnostic: { response: detail, checkedAt: new Date().toISOString() } });
      }
      if (detail.type === "bridge_error") {
        const code = String(detail.code || "bridge_unavailable");
        setAllintitleExtensionState("unavailable");
        setAllintitlePreflight({ connected: false, code, message: String(detail.message || extensionPreflightMessages[code] || extensionPreflightMessages.bridge_unavailable), session: (detail.session || null) as Record<string, unknown> | null, diagnostic: { response: detail, checkedAt: new Date().toISOString() } });
        const activeRun = allintitleRunRef.current;
        if (activeRun.mode === "single" && activeRun.batchId) {
          closeAllintitleRun();
          showNotification("error", String(detail.message || "Falha ao receber resposta da extensão."), { code, stage: "returning_result", persistent: true, retryAllintitle: true, retryAllintitleIds: activeRun.keywordId ? [activeRun.keywordId] : undefined, diagnostic: { response: detail, requestId: activeRun.requestId, batchId: activeRun.batchId } });
        }
      }
      if (detail.type === "batch_started") setAllintitleExtensionState("running");
      if (detail.type === "batch_paused") setAllintitleExtensionState("paused");
      if (detail.type === "batch_completed") {
        setAllintitleExtensionState("completed");
        const activeRun = allintitleRunRef.current;
        if (activeRun.mode === "single" && activeRun.batchId && detail.batchId !== activeRun.batchId) {
          console.debug("Resposta allintitle atrasada ignorada.", { code: "stale_response", expectedBatchId: activeRun.batchId, actualBatchId: detail.batchId, expectedRequestId: activeRun.requestId, actualRequestId: detail.requestId });
          return;
        }
        if (activeRun.mode === "single" && activeRun.batchId && (typeof detail.requestId !== "string" || !detail.requestId.trim())) {
          const diagnostic = { expectedRequestId: activeRun.requestId, actualRequestId: detail.requestId || null, expectedBatchId: activeRun.batchId, actualBatchId: detail.batchId || null, expectedKeywordId: activeRun.keywordId, actualKeywordId: null, expectedBrandId: selectedBrandId, actualBrandId: detail.brandId || null, code: "response_missing_request_id" };
          const keywordId = activeRun.keywordId;
          closeAllintitleRun();
          showNotification("error", "A extensão concluiu sem devolver o requestId da solicitação.", { code: "response_missing_request_id", stage: "returning_result", persistent: true, retryAllintitle: true, retryAllintitleIds: keywordId ? [keywordId] : undefined, diagnostic });
          return;
        }
        if (activeRun.mode === "single" && activeRun.batchId && activeRun.requestId !== detail.requestId) {
          const diagnostic = { expectedRequestId: activeRun.requestId, actualRequestId: detail.requestId || null, expectedBatchId: activeRun.batchId, actualBatchId: detail.batchId || null, expectedKeywordId: activeRun.keywordId, actualKeywordId: null, expectedBrandId: selectedBrandId, actualBrandId: detail.brandId || null, code: "request_mismatch" };
          const keywordId = activeRun.keywordId;
          closeAllintitleRun();
          showNotification("error", "A resposta da extensão não corresponde à solicitação atual.", { code: "request_mismatch", stage: "returning_result", persistent: true, retryAllintitle: true, retryAllintitleIds: keywordId ? [keywordId] : undefined, diagnostic });
          return;
        }
        if (activeRun.mode === "single" && activeRun.batchId && activeRun.requestId === detail.requestId) {
          const received = activeRun.resultReceived;
          const batchId = activeRun.batchId;
          const requestId = activeRun.requestId;
          closeAllintitleRun();
          if (!received) showNotification("error", "A extensão encerrou a consulta sem devolver um resultado final.", { code: "response_missing", stage: "returning_result", persistent: true, retryAllintitle: true, retryAllintitleIds: activeRun.keywordId ? [activeRun.keywordId] : undefined, diagnostic: { batchId, requestId, code: "response_missing" } });
        }
      }
      if (detail.type === "minerador.allintitle.result.v1") {
        const result = detail as unknown as AllintitleMeasurementResult;
        const activeRun = allintitleRunRef.current;
        if (!selectedBrandId) return;
        if (result.batchId !== activeRun.batchId) {
          console.debug("Resposta allintitle atrasada ignorada.", { code: "stale_response", expectedBatchId: activeRun.batchId, actualBatchId: result.batchId || null, expectedRequestId: activeRun.requestId, actualRequestId: result.requestId || null });
          return;
        }
        if (typeof result.requestId !== "string" || !result.requestId.trim()) {
          if (activeRun.mode === "single") {
            const diagnostic = { expectedRequestId: activeRun.requestId, actualRequestId: null, expectedBatchId: activeRun.batchId, actualBatchId: result.batchId || null, expectedKeywordId: activeRun.keywordId, actualKeywordId: result.keywordId || null, expectedBrandId: selectedBrandId, actualBrandId: result.brandId || null, code: "response_missing_request_id" };
            const keywordId = activeRun.keywordId;
            closeAllintitleRun();
            showNotification("error", "A resposta da extensão não contém o requestId da solicitação.", { code: "response_missing_request_id", stage: "returning_result", persistent: true, retryAllintitle: true, retryAllintitleIds: keywordId ? [keywordId] : undefined, diagnostic });
          }
          return;
        }
        if (result.requestId !== activeRun.requestId) {
          if (activeRun.mode === "single") {
            const diagnostic = { expectedRequestId: activeRun.requestId, actualRequestId: result.requestId, expectedBatchId: activeRun.batchId, actualBatchId: result.batchId || null, expectedKeywordId: activeRun.keywordId, actualKeywordId: result.keywordId || null, expectedBrandId: selectedBrandId, actualBrandId: result.brandId || null, code: "request_mismatch" };
            const keywordId = activeRun.keywordId;
            closeAllintitleRun();
            showNotification("error", "A resposta da extensão não corresponde à solicitação atual.", { code: "request_mismatch", stage: "returning_result", persistent: true, retryAllintitle: true, retryAllintitleIds: keywordId ? [keywordId] : undefined, diagnostic });
          }
          return;
        }
        if (result.brandId !== selectedBrandId) {
          if (activeRun.mode === "single") { const diagnostic = { expectedRequestId: activeRun.requestId, actualRequestId: result.requestId, expectedBatchId: activeRun.batchId, actualBatchId: result.batchId || null, expectedKeywordId: activeRun.keywordId, actualKeywordId: result.keywordId || null, expectedBrandId: selectedBrandId, actualBrandId: result.brandId || null, code: "brand_mismatch" }; const keywordId = activeRun.keywordId; closeAllintitleRun(); showNotification("error", "A resposta da extensão pertence a outra marca.", { code: "brand_mismatch", stage: "validating_result", persistent: true, retryAllintitle: true, retryAllintitleIds: keywordId ? [keywordId] : undefined, diagnostic }); }
          return;
        }
        if (activeRun.mode === "single" && result.keywordId !== activeRun.keywordId) {
          const diagnostic = { expectedRequestId: activeRun.requestId, actualRequestId: result.requestId, expectedBatchId: activeRun.batchId, actualBatchId: result.batchId || null, expectedKeywordId: activeRun.keywordId, actualKeywordId: result.keywordId || null, expectedBrandId: selectedBrandId, actualBrandId: result.brandId || null, code: "keyword_mismatch" };
          const keywordId = activeRun.keywordId;
          closeAllintitleRun();
          showNotification("error", "A resposta da extensão pertence a outra keyword.", { code: "keyword_mismatch", stage: "validating_result", persistent: true, retryAllintitle: true, retryAllintitleIds: keywordId ? [keywordId] : undefined, diagnostic });
          return;
        }
        allintitleRunRef.current.resultReceived = true;
        if (activeRun.mode === "single") {
          void persistSingleAllintitleResult(result);
          return;
        }
        if (activeRun.mode !== "batch") return;
        setAllintitlePreview(current => {
          const index = current.findIndex(item => item.keywordId === result.keywordId);
          return index < 0 ? [...current, result] : current.map(item => item.keywordId === result.keywordId ? result : item);
        });
      }
    };
    window.addEventListener("minerador:allintitle-response", onAllintitleResponse);
    const probeTimer = window.setTimeout(() => {
      sendAllintitleExtensionRequest({ type: "minerador.allintitle.probe.v1", context: buildExtensionPreflightContext() });
      window.setTimeout(() => setAllintitleExtensionState(current => current === "checking" ? "unavailable" : current), ALLINTITLE_PREFLIGHT_TIMEOUT_MS);
    }, 0);
    return () => { window.clearTimeout(probeTimer); window.removeEventListener("minerador:allintitle-response", onAllintitleResponse); };
  }, [allintitleBatchId, allintitleMode, selectedBrandId, activeBrand, session, sessionStatus]);

  const undoKeywords = () => {
    keywordHistory.undo();
    showNotification("success", "Voltando uma alteração na lista atual.");
  };

  const redoKeywords = () => {
    keywordHistory.redo();
    showNotification("success", "Refazendo alteração na lista atual.");
  };

  const processLogicalKeywordDna = async (
    sourceKeywords: KeywordItem[],
    sourceLists: ListObject[],
    options: { persist: boolean; showProgress: boolean },
  ) => {
    const listById = new Map(sourceLists.map(list => [list.id, list]));
    const updatedItems: KeywordItem[] = [];
    const pendingUpdates: Array<{ id: string; intent: string; analise_semantica: Record<string, string> }> = [];

    if (options.showProgress) {
      setDnaProcessing(true);
      setDnaProgress({ current: 0, total: sourceKeywords.length });
    }

    sourceKeywords.forEach((item, index) => {
      const list = item.lista_id ? listById.get(item.lista_id) : null;
      const niche = item.analise_semantica?.nicho_override || list?.nicho || autoDetectNiche(item.keyword);
      const logical = deriveLogicalKeywordDna({
        keywordId: item.id,
        keyword: item.keyword,
        intent: item.intent,
        niche,
        location: item.location,
        existingSemantic: item.analise_semantica,
      });
      const semantic = mergeLogicalKeywordSemantic(item.analise_semantica, {
        ...logical.semantic,
        nicho_override: niche,
      });
      const intent = item.intent || canonicalIntentLabel(logical.dna.searchIntent);
      const next = { ...item, intent, analise_semantica: semantic };
      updatedItems.push(next);

      if (!semanticRecordsEqual(item.analise_semantica, semantic) || item.intent !== intent) {
        pendingUpdates.push({ id: item.id, intent, analise_semantica: semantic });
      }
      if (options.showProgress) setDnaProgress({ current: index + 1, total: sourceKeywords.length });
    });

    let failed = 0;
    if (options.persist) {
      for (let offset = 0; offset < pendingUpdates.length; offset += 20) {
        const chunk = pendingUpdates.slice(offset, offset + 20);
        const results = await Promise.all(chunk.map(async update => {
          const { error } = await supabase
            .from("keywords_kgr")
            .update({ intent: update.intent, analise_semantica: update.analise_semantica })
            .eq("id", update.id)
            .eq("brand_id", selectedBrandId);
          return error;
        }));
        failed += results.filter(Boolean).length;
      }
    }

    if (options.showProgress) setDnaProcessing(false);
    return { items: updatedItems, changed: pendingUpdates.length, failed };
  };

  const handleRefreshLogicalDna = async () => {
    const targetIds = selectedIds.size > 0
      ? selectedIds
      : new Set(keywords.filter(keyword => keyword.lista_id || keyword.status?.toLowerCase() === "publicado").map(keyword => keyword.id));
    const targets = keywords.filter(keyword => targetIds.has(keyword.id));
    if (targets.length === 0) {
      showNotification("error", "Nenhuma keyword disponível para atualizar o DNA lógico.");
      return;
    }

    try {
      pushKeywordsHistory(keywords, `Detectar viés e atualizar KeywordDNA de ${targets.length} keyword(s)`);
      const result = await processLogicalKeywordDna(targets, lists, { persist: true, showProgress: true });
      const byId = new Map(result.items.map(item => [item.id, item]));
      setKeywords(current => current.map(item => byId.get(item.id) || item));
      if (result.failed > 0) {
        showNotification("error", `${result.changed - result.failed} DNA(s) atualizados; ${result.failed} falharam ao salvar.`);
      } else {
        showNotification("success", `${targets.length} KeywordDNA(s) conferidos; ${result.changed} receberam atualização lógica.`);
      }
    } catch (error) {
      console.error("Erro ao atualizar KeywordDNA lógico:", error);
      setDnaProcessing(false);
      showNotification("error", "Não foi possível atualizar o KeywordDNA lógico.");
    }
  };

  // Carrega listas e keywords iniciais do Supabase
  const fetchData = async () => {
    if (sessionStatus !== "authenticated") return;
    if (!selectedBrandId) {
      fetchDataInFlightRef.current = null;
      fetchDataActiveKeyRef.current = null;
      setLists([]);
      setKeywords([]);
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
          .from("listas_kgr")
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
      let loadedKeywords = await withSupabaseSelectRetry(async () => {
        const allowedListIds = loadedLists.map(l => l.id);
        let query = supabase
          .from("keywords_kgr")
           .select("*")
           .eq("brand_id", selectedBrandId)
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

      // A. Identifica e APAGA palavras-chave repetidas no banco (mesma palavra na mesma lista)
      const seen = new Map<string, any>();
      const duplicatesToDelete: string[] = [];
      
      loadedKeywords.forEach(k => {
        const key = `${k.keyword.toLowerCase().trim()}-${k.lista_id || 'sem-lista'}`;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, k);
        } else if (existing.status?.toLowerCase() === "publicado") {
          if (k.status?.toLowerCase() !== "publicado") duplicatesToDelete.push(k.id);
        } else if (k.status?.toLowerCase() === "publicado") {
          duplicatesToDelete.push(existing.id);
          seen.set(key, k);
        } else {
          duplicatesToDelete.push(k.id);
        }
      });

      if (duplicatesToDelete.length > 0) {
        console.log(`DeduplicaÃ§Ã£o automÃ¡tica: apagando ${duplicatesToDelete.length} registros repetidos...`);
        // Deleta as duplicatas do banco de dados
        const protectedIds = new Set(loadedKeywords.filter(k => k.status?.toLowerCase() === "publicado").map(k => k.id));
        const safeDuplicateIds = duplicatesToDelete.filter(id => !protectedIds.has(id));
        if (safeDuplicateIds.length > 0) {
          await supabase
          .from("keywords_kgr")
          .delete()
           .in("id", safeDuplicateIds)
           .eq("brand_id", selectedBrandId);
        }
        
        // Remove da lista em memÃ³ria
        loadedKeywords = loadedKeywords.filter(k => !safeDuplicateIds.includes(k.id));
      }

      // B. Auto-atribuiÃ§Ã£o de nicho para listas que nÃ£o possuem nicho definido
      const listsWithoutNicho = loadedLists.filter(l => !l.nicho || l.nicho === "Geral" || l.nicho.trim() === "");
      if (listsWithoutNicho.length > 0 && loadedKeywords.length > 0) {
        const listPromises = listsWithoutNicho.map(async (list) => {
          const listKws = loadedKeywords.filter(k => k.lista_id === list.id);
          if (listKws.length > 0) {
            const detectedNicho = autoDetectNiche(listKws[0].keyword);
            await supabase
              .from("listas_kgr")
              .update({ nicho: detectedNicho })
              .eq("id", list.id)
              .eq("marca_id", selectedBrandId);
            list.nicho = detectedNicho; // atualiza na memÃ³ria
          }
        });
        await Promise.all(listPromises);
        setLists([...loadedLists]);
      }

      // C. Primeiro processo lógico: deriva o KeywordDNA completo sem IA.
      // Só grava quando o campo está vazio ou pertence a uma execução lógica anterior;
      // classificações humanas/IA existentes não são substituídas.
      const eligibleKeywords = loadedKeywords.filter(keyword => keyword.lista_id || keyword.status?.toLowerCase() === "publicado");
      const logicalResult = await processLogicalKeywordDna(eligibleKeywords, loadedLists, {
        persist: true,
        showProgress: false,
      });
      const logicalById = new Map(logicalResult.items.map(item => [item.id, item]));
      if (fetchDataActiveKeyRef.current !== fetchKey) return;
      setKeywords(loadedKeywords.map(keyword => logicalById.get(keyword.id) || keyword));
      if (logicalResult.failed > 0) {
        showNotification("error", `${logicalResult.failed} KeywordDNA(s) foram calculados localmente, mas não puderam ser salvos.`);
      }

      fetchDataLoadedKeyRef.current = fetchKey;
      setSelectedIds(new Set());
    } catch (err: any) {
      const authError = isSupabaseBrowserAuthError(err);
      console.error("Erro ao carregar dados do Supabase:", {
        code: authError ? err.code : err?.code,
        tokenExpired: authError ? isSupabaseTokenExpirationError(err) : false,
        ...(authError ? err.diagnostic : {}),
        table: "listas_kgr/keywords_kgr",
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

  const handleCheckWithSite = async () => {
    if (selectedIds.size === 0) { showNotification("error", "Selecione pelo menos uma keyword antes de conferir o site."); return; }
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca antes de conferir o site."); return; }
    if (!targetListId) { showNotification("error", "Selecione uma lista de destino antes de conferir o site."); return; }
    setSiteSyncLoading(true);
    try {
      const snapshot = await loadMineradorSiteSyncSnapshot(selectedBrandId);
      const selectedTexts = new Set(keywords.filter(item => selectedIds.has(item.id)).map(item => item.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
      const candidates = uniqueSiteSyncCandidates(snapshot.candidates).filter(candidate => selectedTexts.has((candidate.normalizedText || candidate.text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
      if (candidates.length === 0) { showNotification("error", "Nenhuma keyword selecionada possui candidata correspondente no Site/Sitemap."); return; }
      const plan = buildMineradorSiteSyncPlan(candidates, keywords, targetListId);
      setSiteSyncPlan(plan);
      if (snapshot.candidates.length === 0) showNotification("error", "A marca ativa ainda não possui candidatos confirmados no Site/Sitemap.");
      else showNotification("success", `Conferência pronta: ${plan.summary.new} nova(s), ${plan.summary.updated} evidência(s) a atualizar e ${plan.summary.unchanged} sem alteração.`);
    } catch (error) {
      console.error("Erro ao conferir Site/Sitemap no Minerador:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível ler o catálogo Site/Sitemap.");
    } finally {
      setSiteSyncLoading(false);
    }
  };

  const handleConfirmSiteSync = async () => {
    if (!siteSyncPlan || !selectedBrandId || !targetListId) return;
    const candidates = siteSyncPlan.items.filter(item => ["new", "evidence_updated", "no_change"].includes(item.outcome)).map(item => item.candidate);
    if (!candidates.length) { showNotification("error", "A prévia não possui itens válidos para persistir."); return; }
    const batchId = crypto.randomUUID();
    setSiteSyncPersisting(true);
    try {
      const response = await fetch("/api/marca/site/import/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, targetListId, batchId, candidates }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.persisted !== true || !["completed", "partial"].includes(body.status)) throw new Error(body.error || "O Minerador não confirmou a persistência da conferência.");
      const resultItems = Array.isArray(body.items) ? body.items as Array<{ candidateId: string; outcome: string; mineradorKeywordId: string | null }> : [];
      const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
      const now = new Date().toISOString();
      setKeywords(current => {
        const next = [...current];
        for (const result of resultItems) {
          if (!["imported", "existing_in_minerador", "evidence_updated", "no_change"].includes(result.outcome)) continue;
          const candidate = candidateById.get(result.candidateId);
          if (!candidate || !result.mineradorKeywordId) continue;
          const evidence = { schemaVersion: "site-sitemap-v1", source: "site_sitemap", brandId: selectedBrandId, catalogEntryId: candidate.catalogEntryId, sourceUrl: candidate.sourceUrl, resolvedUrl: candidate.resolvedUrl ?? null, declaredCanonicalUrl: candidate.declaredCanonicalUrl ?? null, urlSituation: candidate.urlSituation, publicationStatus: candidate.publicationStatus, keywordUrlRelation: candidate.keywordUrlRelation, architectureStatus: candidate.architectureStatus, suggestedRole: candidate.suggestedRole, sourceFields: candidate.sourceFields, extractedField: candidate.sourceField, slugCoherence: candidate.slugCoherence, confidence: candidate.confidence, normalizedText: candidate.normalizedText, batchId, requestedBy: session?.user?.email || "local-user", extractedAt: candidate.extractedAt ?? null, importedAt: now, lastCheckedAt: now, relationConfirmedBy: candidate.relationConfirmedBy ?? null, relationConfirmedAt: candidate.relationConfirmedAt ?? null, siloId: targetListId, siloName: lists.find(list => list.id === targetListId)?.nome || null, consolidatedAt: now };
          const index = next.findIndex(item => item.id === result.mineradorKeywordId);
          if (index >= 0) next[index] = { ...next[index], analise_semantica: { ...(next[index].analise_semantica || {}), site_origin: evidence, site_origins: [...(Array.isArray(next[index].analise_semantica?.site_origins) ? next[index].analise_semantica.site_origins : []), evidence] } };
           else next.push({ id: result.mineradorKeywordId, brand_id: selectedBrandId, keyword: candidate.text, location: null, results_allintitle: null, volume_search: null, kgr_score: null, intent: null, status: "bruto", lista_id: targetListId, analise_semantica: { site_origin: evidence, site_origins: [evidence] }, volume_source: "real", created_at: now });
        }
        return next;
      });
      showNotification("success", body.status === "partial" ? "Conferência persistida parcialmente; revise os itens com falha." : "Conferência Site/Sitemap persistida no Minerador.");
      setSiteSyncPlan(null);
    } catch (error) {
      console.error("Erro ao persistir conferência Site/Sitemap:", error);
      showNotification("error", error instanceof Error ? error.message : "Falha ao persistir a conferência Site/Sitemap.");
    } finally {
      setSiteSyncPersisting(false);
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
      const volumeKgrConsistency = assessVolumeKgrConsistency({ volume: k.volume_search, results: k.results_allintitle, kgrScore: k.kgr_score, semantic: k.analise_semantica });
      // Colunas fixas obrigatÃ³rias
      const row: Record<string, any> = {
        "Palavra-Chave": k.keyword || "",
        "Resultados": k.results_allintitle !== null ? k.results_allintitle : "",
        "Volume": k.volume_search !== null ? k.volume_search : "",
        "KGR": readKgrApplicability(k.analise_semantica) === "applicable" && volumeKgrConsistency === "coherent" && typeof k.kgr_score === "number" && Number.isFinite(k.kgr_score) ? k.kgr_score.toFixed(3) : "",
        "KGR Aplicabilidade": readKgrApplicability(k.analise_semantica),
        "KGR Decisão": kgrDecisionLabel(readKgrApplicability(k.analise_semantica)),
        "KGR Estado do cálculo": volumeKgrConsistency === "inconsistent" ? "inconsistent" : classifyKgrMeasurement({ kgrScore: k.kgr_score, volume: k.volume_search, results: k.results_allintitle }),
        "KGR Fonte": k.volume_source || "",
        "KGR Origem da decisão": k.analise_semantica?.kgr_decisao_origem || "",
        "KGR Decidido por": k.analise_semantica?.kgr_decidido_por || "",
        "KGR Decidido em": k.analise_semantica?.kgr_decidido_em || "",
        "KGR Versão": k.analise_semantica?.kgr_decisao_versao || "",
        "KGR Justificativa": k.analise_semantica?.kgr_justificativa || "",
        "IntenÃ§Ã£o": canonicalIntentLabel(k.intent || autoClassifyIntent(k.keyword)),
        "Nicho": k.analise_semantica?.nicho_override || autoDetectNiche(k.keyword),
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

  // AÃ§Ã£o em Lote: Executa a classificaÃ§Ã£o de Nicho e IntenÃ§Ã£o via DeepSeek (IA real do Google Brasil)
  const handleBatchProcessIntentNiche = async () => {
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
          const res = await fetch("/api/process-intent-niche", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandId: selectedBrandId, keywordId: item.id, keyword: item.keyword })
          });
          const resData = await res.json();
          if (!res.ok || !resData.success) {
            console.error(`Erro ao classificar keyword "${item.keyword}":`, resData.error);
            failCount++;
          } else {
            successCount++;
            // Atualiza intenÃ§Ã£o e nicho_override no estado local reativamente
            setKeywords(prev => prev.map(k => k.id === item.id ? { 
              ...k, 
              intent: canonicalIntentLabel(resData.intent),
              analise_semantica: {
                ...(k.analise_semantica || {}),
                nicho_override: resData.nicho
              }
            } : k));
          }
        } catch (err) {
          console.error(`Falha na classificaÃ§Ã£o para a palavra "${item.keyword}":`, err);
          failCount++;
        }
      }

      if (failCount === 0) {
        showNotification("success", `Classificação de Nicho & Intenção de todas as ${successCount} palavras concluída!`);
      } else {
        showNotification("success", `ClassificaÃ§Ã£o concluÃ­da: ${successCount} com sucesso e ${failCount} falhas.`);
      }
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao executar processamento de Nicho & Intenção.");
    } finally {
      setQueueProcessing(false);
      setUpdating(false);
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

  // AÃ§Ã£o: Apaga palavras repetidas na visualizaÃ§Ã£o atual (mantendo apenas 1 cÃ³pia de cada)
  const handleDeleteDuplicates = async () => {
    const idsToDelete: string[] = [];
    duplicateGroups.forEach(group => {
      // MantÃ©m o primeiro registro e manda deletar os outros
      const published = group.filter(k => k.status?.toLowerCase() === "publicado");
      const nonPublished = group.filter(k => k.status?.toLowerCase() !== "publicado");
      const toDelete = published.length > 0
        ? nonPublished.map(k => k.id)
        : nonPublished.slice(1).map(k => k.id);
      idsToDelete.push(...toDelete);
    });

    if (idsToDelete.length === 0) return;

    const confirmDelete = confirm(`Deseja realmente apagar as ${idsToDelete.length} ocorrÃªncias duplicadas, mantendo apenas 1 registro Ãºnico de cada palavra-chave?`);
    if (!confirmDelete) return;

    setUpdating(true);
    try {
      pushKeywordsHistory();
      const { error } = await supabase
        .from("keywords_kgr")
        .delete()
        .in("id", idsToDelete)
        .eq("brand_id", selectedBrandId);

      if (error) throw error;

      setKeywords(prev => prev.filter(item => item.status?.toLowerCase() === "publicado" || !idsToDelete.includes(item.id)));
      setSelectedIds(current => new Set([...current].filter(id => !idsToDelete.includes(id))));
      showNotification("success", `${idsToDelete.length} duplicatas nÃƒÂ£o-publicadas apagadas. Publicados preservados.`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao apagar duplicatas.");
    } finally {
      setUpdating(false);
    }
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
            let statusVal = "bruto";
            if (statusKey && row[statusKey]) {
              const s = String(row[statusKey]).trim().toLowerCase();
              if (["bruto", "aprovado", "rejeitado", "publicado"].includes(s)) {
                statusVal = s;
              }
            }

            // Procura por Silo do CSV
            const siloKey = Object.keys(row).find(
              (k) => ["silo", "lista", "categoria", "silo_slug", "silo_nome"].includes(k.toLowerCase().trim())
            );
            const rowSiloVal = siloKey ? String(row[siloKey]).trim() : "";
            
            let matchedListId = null;
            if (rowSiloVal) {
              const matchedList = lists.find(l => 
                l.nome.toLowerCase() === rowSiloVal.toLowerCase() ||
                toSlug(l.nome) === toSlug(rowSiloVal)
              );
              
              if (matchedList) {
                matchedListId = matchedList.id;
              } else {
                if (activeBrand?.silos_existentes && Array.isArray(activeBrand.silos_existentes)) {
                  const matchedSiloObj = activeBrand.silos_existentes.find((s: any) => 
                    (typeof s === "object" && (s.nome?.toLowerCase() === rowSiloVal.toLowerCase() || s.slug === toSlug(rowSiloVal))) ||
                    (typeof s === "string" && (s.toLowerCase() === rowSiloVal.toLowerCase() || toSlug(s) === toSlug(rowSiloVal)))
                  );
                  
                  if (matchedSiloObj) {
                    const sNome = typeof matchedSiloObj === "object" ? matchedSiloObj.nome : matchedSiloObj;
                    try {
                      const { data: newListData } = await supabase
                        .from("listas_kgr")
                        .insert([{
                          nome: sNome,
                          marca_id: activeBrand.id,
                          nicho: activeBrand.nicho || null
                        }])
                        .select()
                        .single();
                      
                      if (newListData) {
                        matchedListId = newListData.id;
                        lists.push(newListData); // Adiciona na memÃ³ria local
                      }
                    } catch (err) {
                      console.error("Erro ao auto-criar silo do CSV:", err);
                    }
                  }
                }
              }
            }

            if (!matchedListId && filterListId !== "Todos") {
              matchedListId = filterListId;
            }

            if (!matchedListId) {
              // Pula palavras sem associaÃ§Ã£o de Silo resolvido
              continue; 
            }

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
            const semanticObj: Record<string, string> = mergeLogicalKeywordSemantic(null, {
              ...logicalDna.semantic,
              nicho_override: resolvedNiche,
            });
            if (rowSlugVal) {
              semanticObj.slug_sugerido = toSlug(rowSlugVal);
            } else if (statusVal === "publicado") {
              semanticObj.slug_sugerido = toSlug(keyword);
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
            showNotification("error", "Nenhuma palavra-chave vÃ¡lida associada a um Silo foi encontrada. Verifique se informou a coluna Silo no CSV ou selecione um Silo padrÃ£o no topo.");
            setImporting(false);
            e.target.value = "";
            return;
          }

          // Insere dados em lote no Supabase
          const { data: insertedKeywords, error } = await supabase
            .from("keywords_kgr")
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
  // Abre modal de importaÃ§Ã£o manual com valores coerentes prÃ©-preenchidos
  const openManualModal = () => {
    if (filterListId !== "Todos") {
      setManualListId(filterListId);
    } else if (lists.length > 0) {
      setManualListId(lists[0].id);
    } else {
      setManualListId("");
    }
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
    if (!manualListId) {
      showNotification("error", "Selecione uma Categoria/Silo para associar os novos termos.");
      return;
    }
    if (!lists.some(list => list.id === manualListId && list.marca_id === selectedBrandId)) {
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
          lista_id: manualListId,
          analise_semantica: analise
        };
      });

      const { data: insertedKeywords, error } = await supabase
        .from("keywords_kgr")
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
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Renderiza o indicador de ordenaÃ§Ã£o
  const renderSortIcon = (column: typeof sortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 text-slate-650 opacity-40 ml-1 inline" />;
    return sortDirection === "asc" 
      ? <ArrowUpDown className="w-3 h-3 text-indigo-400 ml-1 inline rotate-180 transition-transform" /> 
      : <ArrowUpDown className="w-3 h-3 text-indigo-400 ml-1 inline transition-transform" />;
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
        .from("listas_kgr")
        .insert([payload])
        .select();

      if (error) throw error;
      
      showNotification("success", "Lista criada com sucesso!");
      setNewListName("");
      setNewListNicho("");
      setIsListModalOpen(false);
      
      // Recarrega listas do banco filtradas
      let listsQuery = supabase
        .from("listas_kgr")
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
        return item?.status?.toLowerCase() !== "publicado";
      });
      const protectedCount = rawIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        showNotification("error", "Silo de keyword publicada e bloqueado e nao pode ser alterado.");
        return;
      }
      pushKeywordsHistory(keywords, `Mover ${idsToUpdate.length} keyword(s) de silo/categoria`);

      const { error } = await supabase
        .from("keywords_kgr")
        .update({ lista_id: listId || null })
        .in("id", idsToUpdate)
        .eq("brand_id", selectedBrandId);

      if (error) throw error;

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id) ? { ...k, lista_id: listId || null } : k));
      showNotification("success", `Silo/Categoria atualizado para ${idsToUpdate.length} palavra(s). ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao mover palavra-chave.");
    }
  };

  // AtualizaÃ§Ã£o direta do nicho na cÃ©lula da tabela (salvo no JSONB analise_semantica)
  const handleUpdateNiche = async (id: string, nicheValue: string) => {
    try {
      const idsToUpdate = selectedIds.has(id) ? Array.from(selectedIds) : [id];
      pushKeywordsHistory(keywords, `Alterar nicho de ${idsToUpdate.length} keyword(s)`);

      const promises = idsToUpdate.map(async (wordId) => {
        const wordItem = keywords.find(k => k.id === wordId);
        if (!wordItem) return;

        const currentSemantic = wordItem.analise_semantica || {};
        const updatedSemantic = { ...currentSemantic };
        if (nicheValue) {
          updatedSemantic.nicho_override = nicheValue;
        } else {
          delete updatedSemantic.nicho_override;
        }

        const { error } = await supabase
          .from("keywords_kgr")
          .update({ analise_semantica: updatedSemantic })
          .eq("id", wordId)
          .eq("brand_id", selectedBrandId);

        if (error) throw error;
      });

      await Promise.all(promises);

      // Atualiza no estado local
      setKeywords(prev => prev.map(k => {
        if (idsToUpdate.includes(k.id)) {
          const currentSemantic = k.analise_semantica || {};
          const updatedSemantic = { ...currentSemantic };
          if (nicheValue) {
            updatedSemantic.nicho_override = nicheValue;
          } else {
            delete updatedSemantic.nicho_override;
          }
          return { ...k, analise_semantica: updatedSemantic };
        }
        return k;
      }));

      showNotification("success", `Nicho atualizado para ${idsToUpdate.length} palavra(s).`);
    } catch (err: any) {
      console.error("Erro ao salvar nicho:", err);
      showNotification("error", "Falha ao salvar nicho.");
    }
  };

  // AtualizaÃ§Ã£o direta do status na cÃ©lula da tabela (com suporte a aplicaÃ§Ã£o em massa)
  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const rawIds = selectedIds.has(id) ? Array.from(selectedIds) : [id];
      const idsToUpdate = rawIds.filter(wordId => {
        const item = keywords.find(k => k.id === wordId);
        return item?.status?.toLowerCase() !== "publicado";
      });
      const protectedCount = rawIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        showNotification("error", "Status publicado e bloqueado e nao pode ser rebaixado.");
        return;
      }
      pushKeywordsHistory(keywords, `Alterar status de ${idsToUpdate.length} keyword(s) para ${status}`);

      const { error } = await supabase
        .from("keywords_kgr")
        .update({ status: status })
        .in("id", idsToUpdate)
        .eq("brand_id", selectedBrandId);

      if (error) throw error;

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id) ? { ...k, status: status } : k));
      showNotification("success", `Status atualizado para ${idsToUpdate.length} palavra(s). ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao salvar status.");
    }
  };

  // Checkboxes
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredKeywords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredKeywords.map(k => k.id)));
    }
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
      .filter(item => item.status?.toLowerCase() !== "publicado")
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
        .from("keywords_kgr")
        .update({ lista_id: targetListId })
        .in("id", movableIds)
        .eq("brand_id", selectedBrandId);

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

  const handleBatchKgrDecision = async (applicability: KgrApplicability) => {
    if (selectedIds.size === 0) return;
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    if (applicability === "applicable") {
      const missingVolume = selectedItems.filter(item => !(typeof item.volume_search === "number" && Number.isFinite(item.volume_search) && item.volume_search >= 0));
      const zeroVolume = selectedItems.filter(item => item.volume_search === 0);
      const missingResults = selectedItems.filter(item => !(typeof item.results_allintitle === "number" && Number.isFinite(item.results_allintitle) && item.results_allintitle >= 0));
      const errors: string[] = [];
      if (zeroVolume.length > 0) errors.push("Volume zero não permite calcular KGR.");
      else if (missingVolume.length > 0) errors.push("Meça o volume antes de aprovar como KGR.");
      if (missingResults.length > 0) errors.push("Meça os resultados antes de aprovar como KGR.");
      if (errors.length > 0) {
        showNotification("error", errors.join(" "));
        return;
      }
    }

    const actorId = session?.user?.email || "local-user";
    const decidedAt = new Date().toISOString();
    const nextById = new Map(selectedItems.map(item => {
      const calculatedScore = applicability === "applicable" ? calculateKgrFromMetrics(item.volume_search, item.results_allintitle) : null;
      const semanticBase = setKgrApplicability(item.analise_semantica, applicability, { actorId, decidedAt });
      const semantic = applicability === "applicable" && calculatedScore !== null
        ? { ...semanticBase, kgr_calculation: { volume: item.volume_search, results: item.results_allintitle, score: calculatedScore, calculatedAt: decidedAt, actorId } }
        : semanticBase;
      return [item.id, { semantic, kgr_score: calculatedScore ?? item.kgr_score, status: applicability === "applicable" && item.status?.toLowerCase() !== "publicado" ? "aprovado" : item.status }];
    }));
    pushKeywordsHistory(keywords, `${applicability === "applicable" ? "Aprovar" : "Marcar não aplicável"} KGR de ${selectedItems.length} keyword(s)`);
    setUpdating(true);
    try {
      await Promise.all(Array.from(nextById.entries()).map(async ([id, next]) => {
        const current = keywords.find(item => item.id === id);
        const { error } = await supabase.from("keywords_kgr").update({ analise_semantica: next.semantic, kgr_score: next.kgr_score, ...(next.status !== current?.status ? { status: next.status } : {}) }).eq("id", id).eq("brand_id", selectedBrandId);
        if (error) throw error;
      }));
      setKeywords(current => current.map(item => {
        const next = nextById.get(item.id);
        return next ? { ...item, analise_semantica: next.semantic, kgr_score: next.kgr_score, status: next.status } : item;
      }));
      showNotification("success", applicability === "applicable" ? "KGR aprovado para a seleção." : "Seleção marcada como não aplicável ao KGR.");
    } catch (error) {
      console.error("Erro ao salvar decisão KGR em massa:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar a decisão KGR.");
    } finally {
      setUpdating(false);
    }
  };

  const handlePrimaryKeywordPolicyChange = async (item: KeywordItem, policy: Extract<PrimaryKeywordPolicy, "locked" | "reviewable">) => {
    if (item.status?.toLowerCase() !== "publicado") return;
    const currentPolicy = readPrimaryKeywordPolicy({ status: item.status, semantic: item.analise_semantica });
    if (currentPolicy === policy) return;
    const policyLabel = primaryKeywordPolicyLabel(policy);
    if (!window.confirm(`${policyLabel}. A URL, o slug, o canonical e a keyword atual permanecerão protegidos. Confirmar política?`)) return;
    const actorId = session?.user?.email || "local-user";
    const changedAt = new Date().toISOString();
    const semantic = setPrimaryKeywordPolicy(item.analise_semantica, { status: item.status, keyword: item.keyword, policy, actorId, changedAt });
    setUpdating(true);
    try {
      const { error } = await supabase.from("keywords_kgr").update({ analise_semantica: semantic }).eq("id", item.id).eq("brand_id", selectedBrandId);
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

  // AÃ§Ã£o em Lote: Aprovar KGR
  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    await handleBatchKgrDecision("applicable");
  };

  const handleBatchMarkKgrNotApplicable = async () => {
    await handleBatchKgrDecision("not_applicable");
  };

  // AÃ£o em Lote: Marcar como Publicado
  const handleBatchPublish = async () => {
    if (selectedIds.size === 0) return;

    // Protecao: nao publicar com dados estimados sem aviso explicito.
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    const estimatedItems = selectedItems.filter(
      k => (k.volume_source || "real") === "estimado"
    );
    if (estimatedItems.length > 0) {
      const ok = window.confirm(
        `ATENÇÃO: ${estimatedItems.length} palavra(s) possuem volume ESTIMADO (sem dado real da API).\n\n` +
        `Publicar com dados estimados pode levar a decisões de SEO incorretas.\n` +
        `Tem certeza que deseja publicar mesmo assim?`
      );
      if (!ok) return;
    }
    pushKeywordsHistory(keywords, `Marcar ${selectedIds.size} keyword(s) como publicadas`);

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("keywords_kgr")
        .update({ status: "publicado" })
        .in("id", Array.from(selectedIds))
        .eq("brand_id", selectedBrandId);

      if (error) throw error;

      setKeywords(prev => prev.map(item =>
        selectedIds.has(item.id) ? { ...item, status: "publicado" } : item
      ));
      showNotification("success", "Palavras marcadas como publicadas com sucesso!");
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao publicar palavras-chave.");
    } finally {
      setUpdating(false);
    }
  };

  const startAllintitleMeasurement = async (items: KeywordItem[]) => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca antes de medir resultados allintitle."); return; }
    setResultsMeasuring(true);
    const preflight = await confirmAllintitleExtensionConnection();
    if (!preflight.connected) {
      setResultsMeasuring(false);
      showNotification("error", preflight.message, { code: preflight.code, persistent: true, retryAllintitle: true, diagnostic: preflight.diagnostic });
      return;
    }
    const allowedListIds = new Set(lists.map(list => list.id));
    const invalidScope = items.some(item => !item.id || !item.keyword.trim() || !item.lista_id || !allowedListIds.has(item.lista_id));
    if (invalidScope) { setResultsMeasuring(false); showNotification("error", "A medição exige keywords reais vinculadas a um silo da marca ativa."); return; }
    if (items.length > ALLINTITLE_MAX_BATCH_SIZE) { setResultsMeasuring(false); showNotification("error", `A medição allintitle opera em lotes pequenos de até ${ALLINTITLE_MAX_BATCH_SIZE} keywords.`); return; }
    const batchId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const request: AllintitleMeasurementRequest = {
      type: "minerador.allintitle.measure.v1",
      batchId,
      requestId,
      userId: session?.user?.email || undefined,
      brandId: selectedBrandId,
      requestedAt: new Date().toISOString(),
      options: { intervalMs: ALLINTITLE_INTERVAL_MS, maxItems: ALLINTITLE_MAX_BATCH_SIZE },
      items: items.map<AllintitleRequestItem>(item => ({ keywordId: item.id, keyword: item.keyword, currentResultsAllintitle: item.results_allintitle })),
    };
    setAllintitleBatchId(batchId);
    setAllintitleMode(items.length === 1 ? "single" : "batch");
    allintitleRunRef.current = { batchId, mode: items.length === 1 ? "single" : "batch", requestId, keywordId: items.length === 1 ? items[0]?.id || null : null, resultReceived: false };
    setAllintitlePreview([]);
    setAllintitleExcludedIds(new Set());
    setAllintitleExtensionState("running");
    armAllintitleOperationTimeout(batchId, requestId, items);
    sendAllintitleExtensionRequest({ ...request, context: buildExtensionPreflightContext() } as unknown as Record<string, unknown>);
  };

  const handleMeasureAllintitleSelection = () => {
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    if (!selectedItems.length) {
      showNotification("error", "Selecione pelo menos uma keyword para medir resultados allintitle.");
      return;
    }
    void startAllintitleMeasurement(selectedItems);
  };

  const handleCancelAllintitle = () => {
    if (!allintitleBatchId) return;
    sendAllintitleExtensionRequest({ type: "minerador.allintitle.cancel.v1", batchId: allintitleBatchId, requestId: allintitleRunRef.current.requestId });
    setAllintitleExtensionState("completed");
    closeAllintitleRun();
  };

  const handleResumeAllintitle = () => {
    if (!allintitleBatchId) return;
    const activeRun = allintitleRunRef.current;
    sendAllintitleExtensionRequest({ type: "minerador.allintitle.resume.v1", batchId: allintitleBatchId, requestId: activeRun.requestId, context: buildExtensionPreflightContext() });
    const retryItems = activeRun.keywordId ? keywords.filter(item => item.id === activeRun.keywordId) : keywords.filter(item => selectedIds.has(item.id));
    if (activeRun.requestId && retryItems.length) armAllintitleOperationTimeout(allintitleBatchId, activeRun.requestId, retryItems);
    setAllintitleExtensionState("running");
    setResultsMeasuring(true);
  };

  const handleConfirmAllintitle = async () => {
    if (!selectedBrandId) return;
    const allowedListIds = new Set(lists.map(list => list.id));
    const candidates = allintitlePreview.filter(result => isPersistableAllintitleResult(result) && !allintitleExcludedIds.has(result.keywordId));
    if (!candidates.length) { showNotification("error", "A prévia não possui resultados válidos selecionados para confirmação."); return; }
    const updates = new Map<string, ReturnType<typeof buildAllintitleMetricPatch>>();
    let failed = 0;
    setUpdating(true);
    try {
      for (const result of candidates) {
        const item = keywords.find(keyword => keyword.id === result.keywordId);
        if (!item || result.brandId !== selectedBrandId || !item.lista_id || !allowedListIds.has(item.lista_id)) { failed += 1; continue; }
        const patch = buildAllintitleMetricPatch(item, result, currentKgrApplicability(item.analise_semantica));
        if (!Object.keys(patch).length) continue;
        const { error } = await supabase.from("keywords_kgr").update(patch).eq("id", item.id).eq("brand_id", selectedBrandId);
        if (error) { failed += 1; continue; }
        updates.set(item.id, patch);
      }
      if (updates.size > 0) {
        pushKeywordsHistory(keywords, `Confirmar ${updates.size} medição(ões) allintitle`);
        setKeywords(current => current.map(item => updates.has(item.id) ? { ...item, ...updates.get(item.id) } : item));
      }
      if (failed > 0) showNotification("error", `${updates.size} resultado(s) confirmados; ${failed} item(ns) foram preservados sem alteração.`);
      else showNotification("success", `${updates.size} resultado(s) allintitle confirmados sem recarregar a tabela.`);
    } finally {
      setUpdating(false);
    }
  };

  // AÃ§Ã£o em Lote: volume pela API e resultados allintitle pela extensão conectada
  const handleBatchQualify = async () => {
    if (selectedIds.size === 0) return;
    setUpdating(true);
    setVolumeMeasuring(true);
    showNotification("success", `Qualificando ${selectedIds.size} palavras-chave...`);

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));
    const keywordStrings = selectedKeywords.map(k => k.keyword);

    try {
      const response = await fetch("/api/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keywordStrings })
      });
      const resData = await response.json().catch(() => null);
      if (resData?.code === "provider_quota_exceeded") {
        showNotification("info", "Não foi possível coletar volume. Tente novamente mais tarde.", { code: "provider_quota_exceeded", stage: "volume_provider" });
        return;
      }
      if (!response.ok || !resData?.success) {
        const error = new Error(resData?.error || "O provedor de volume não retornou uma resposta válida.") as Error & { code?: string };
        error.code = typeof resData?.code === "string" ? resData.code : "volume_request_failed";
        throw error;
      }

      const providerResults: VolumeLookupResult[] = Array.isArray(resData.data) ? resData.data as VolumeLookupResult[] : [];
      const successfulResults = providerResults.filter((result): result is Extract<VolumeLookupResult, { status: "success" }> => result.status === "success");
      const measuredResults = new Map<string, Extract<VolumeLookupResult, { status: "success" }>>(successfulResults
        .filter(result => Number.isFinite(result.volume) && result.volume >= 0)
        .map(result => [normalizeVolumeKeyword(result.keyword), result] as [string, Extract<VolumeLookupResult, { status: "success" }> ]));
      const providerErrorResults = providerResults.filter((result): result is Extract<VolumeLookupResult, { status: "error" }> => result.status === "error");
      const providerErrors = providerErrorResults.length;
      const providerErrorDetails = providerErrorResults
        .slice(0, 3)
        .map(result => `${result.keyword}: ${result.error}`)
        .join(" | ");
      const notFoundCount = providerResults.filter(result => result.status === "not_found").length;
      if (measuredResults.size === 0) {
        throw new Error(providerErrorDetails || `O provedor não retornou volume válido para nenhuma keyword${notFoundCount > 0 ? "; keyword exata não encontrada." : "."} Os metadados existentes foram preservados.`);
      }

      const updatedMetrics = new Map<string, ReturnType<typeof buildVolumeMetricPatch>>();
      pushKeywordsHistory(keywords, `Qualificar volume/KGR de ${selectedKeywords.length} keyword(s)`);

      for (const item of selectedKeywords) {
        const measuredResult = measuredResults.get(normalizeVolumeKeyword(item.keyword));
        const patch = buildVolumeMetricPatch(item, measuredResult);
        if (Object.keys(patch).length === 0) {
          continue;
        }

        const { error } = await supabase
          .from("keywords_kgr")
          .update(patch)
          .eq("id", item.id)
          .eq("brand_id", selectedBrandId);
        if (error) throw error;
        updatedMetrics.set(item.id, patch);
      }

      if (providerErrors > 0 || notFoundCount > 0) {
        showNotification(
          "error",
          `${providerErrors + notFoundCount} keyword(s) não receberam medição.${providerErrorDetails ? ` Erro real do provedor: ${providerErrorDetails}.` : ""} Os metadados existentes foram preservados.`,
          { code: providerErrors > 0 ? "provider_error" : "exact_keyword_not_found", stage: "volume_provider", persistent: true }
        );
      } else {
        showNotification("success", "Volume qualificado; KGR recalculado quando havia métricas suficientes.");
      }
      setKeywords(current => current.map(item => {
        const metrics = updatedMetrics.get(item.id);
        return metrics ? { ...item, ...metrics } : item;
      }));
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "volume_request_failed";
      if (code === "provider_quota_exceeded") {
        showNotification("info", "Não foi possível coletar volume. Tente novamente mais tarde.", { code, stage: "volume_provider" });
        return;
      }
      console.error(err);
      const message = code === "provider_quota_exceeded" ? "Não foi possível coletar volume." : `Volume falhou: ${err instanceof Error ? err.message : "Erro de conexão"}`;
      showNotification("error", message, { code, stage: "volume_provider", persistent: true });
    } finally {
      setVolumeMeasuring(false);
      setUpdating(false);
    }
  };

  // AÃ§Ã£o em Lote: Excluir com dupla confirmaÃ§Ã£o
  const handleBatchDelete = async (approved = false) => {
    if (selectedIds.size === 0) return;
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    const deletableIds = selectedItems
      .filter(item => item.status?.toLowerCase() !== "publicado")
      .map(item => item.id);
    if (deletableIds.length === 0) {
      showNotification("error", "Nada foi apagado: publicados estÃƒÂ£o protegidos.");
      return;
    }
    
    if (!approved) { setDeleteApprovalOpen(true); return; }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("keywords_kgr")
        .delete()
        .in("id", deletableIds)
        .eq("brand_id", selectedBrandId);

      if (error) throw error;

      pushKeywordsHistory(keywords, `Excluir ${deletableIds.length} keyword(s) não publicadas`);
      setKeywords(prev => prev.filter(item => item.status?.toLowerCase() === "publicado" || !deletableIds.includes(item.id)));
      setSelectedIds(current => new Set([...current].filter(id => !deletableIds.includes(id))));
      setDeleteApprovalOpen(false);
      showNotification("success", "Palavras excluÃ­das com sucesso.");
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao excluir palavras.");
    } finally {
      setUpdating(false);
    }
  };

  const selectedDeletableCount = keywords.filter(item => selectedIds.has(item.id) && item.status?.toLowerCase() !== "publicado").length;
  const organizeFilterLabels = mineradorOrganizationLabels(organizationValues, lists);
  const organizeFilterSummary = mineradorOrganizationButtonSummary(organizeFilterLabels);
  const clearOrganizeFilters = () => {
    setFilterStatus("Todos");
    setFilterIntent("Todos");
    setFilterListId("Todos");
    setFilterSiteRelation("Todos");
    setFilterSiteArchitecture("Todos");
    setFilterSitePublication("Todos");
    setFilterKgrApplicability("Todos");
    setFilterKgrMeasurement("Todos");
  };

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex items-center justify-center font-mono">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col items-center justify-center p-6 text-center font-mono">
        <Building2 className="w-12 h-12 text-indigo-500 mb-3" />
        <h1 className="text-lg font-bold text-white uppercase tracking-wider">Minerador KGR</h1>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
          Ãrea restrita. Por favor, faÃ§a login com suas credenciais para acessar a plataforma.
        </p>
        <button 
          onClick={() => signIn()} 
          className="mt-6 bg-indigo-650 hover:bg-indigo-600 text-white rounded px-6 py-2.5 font-bold text-xs transition-colors shadow-lg shadow-indigo-950/40 cursor-pointer"
        >
          Fazer Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#06070a] font-mono text-xs text-slate-200 select-none">
      <MineradorLastOrganizationRestorer
        userId={session?.user?.email || ""}
        brandId={selectedBrandId}
        ready={!loading && sessionStatus === "authenticated"}
        knownListIds={lists.map(list => list.id)}
        values={organizationValues}
        onHydrated={setOrganizationHydratedKey}
        onApply={view => {
          setSearchQuery(view.searchQuery); setFilterStatus(view.filterStatus); setFilterIntent(view.filterIntent); setFilterListId(view.filterListId);
          setFilterSiteRelation(view.filterSiteRelation); setFilterSiteArchitecture(view.filterSiteArchitecture); setFilterSitePublication(view.filterSitePublication);
          setFilterKgrApplicability(view.filterKgrApplicability); setFilterKgrMeasurement(view.filterKgrMeasurement);
          setSortColumn(view.sortColumn); setSortDirection(view.sortDirection);
        }}
      />
      
      {/* NotificaÃ§Ã£o pop-up */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-md rounded border px-3 py-2 shadow-xl ${
          notification.type === "success" 
            ? "bg-emerald-950 border-emerald-800 text-emerald-400" 
            : notification.type === "info"
            ? "bg-amber-950 border-amber-800 text-amber-300"
            : "bg-rose-955 border-rose-800 text-rose-400"
        }`}>
          <div className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><p className="text-xs">{notification.message}</p>{(notification.stage || notification.code) && <p className="mt-1 font-mono text-[10px] opacity-80">{notification.stage ? `Etapa: ${notification.stage}` : ""}{notification.stage && notification.code ? " · " : ""}{notification.code ? `Código: ${notification.code}` : ""}</p>}<div className="mt-2 flex gap-3 text-[10px] font-bold"><button onClick={() => { if (notification.retryAllintitle) { const retryIds = notification.retryAllintitleIds; void startAllintitleMeasurement(keywords.filter(item => retryIds?.length ? retryIds.includes(item.id) : selectedIds.has(item.id))); } }} className={notification.retryAllintitle ? "hover:text-white" : "hidden"}>Tentar novamente</button><button onClick={() => navigator.clipboard?.writeText(JSON.stringify({ message: notification.message, stage: notification.stage || null, code: notification.code || null, diagnostic: notification.diagnostic || null }, null, 2))} className="hover:text-white">Copiar diagnóstico</button><button onClick={() => setNotification(null)} className="hover:text-white">Fechar</button></div></div></div>
        </div>
      )}

      {/* BARRA UNICA: FERRAMENTAS DO MINERADOR + MENU HAMBURGER DE NAVEGABILIDADE */}
      <div className="z-30 flex h-10 shrink-0 items-center justify-between overflow-x-auto border-b border-slate-900 bg-[#0b0c10] px-3 font-mono">
        {/* Esquerda: Identidade + Busca + Filtros + Ferramentas locais da Planilha */}
        <div className="flex items-center gap-2 py-1">
          <span className="text-slate-500 font-bold uppercase tracking-widest text-[11px] shrink-0">Minerador</span>
          <span className="text-slate-800 select-none shrink-0">Â·</span>

          <HistoryControls entries={keywordHistory.entries} canUndo={keywordHistory.canUndo} canRedo={keywordHistory.canRedo}
            onUndo={undoKeywords} onRedo={redoKeywords} onRestore={keywordHistory.restore} compact/>

          <span className="text-slate-800 select-none shrink-0">|</span>

          {/* Busca */}
          <div className="relative shrink-0">
            <Search className="w-3 h-3 text-slate-600 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Buscar..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 bg-transparent border border-slate-800 rounded pl-6 pr-2 py-0.5 text-[12px] text-slate-200 placeholder-slate-700 focus:outline-none focus:border-slate-600 transition-colors" />
          </div>

          <span className="text-slate-800 select-none shrink-0">|</span>

          <button
            type="button"
            onClick={() => setOrganizeOpen(open => !open)}
            className="flex items-center gap-1.5 rounded border border-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white shrink-0"
            aria-expanded={organizeOpen}
          >
            <Folders className="h-3.5 w-3.5" />
            <span title={organizeFilterLabels.length > 3 ? organizeFilterLabels.join(" · ") : undefined}>{organizeFilterSummary}</span>
          </button>

          <span className="text-slate-800 select-none shrink-0">|</span>

          {/* Importar CSV */}
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="flex items-center gap-1 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            title="Importar arquivo CSV">
            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            <span>CSV</span>
          </button>

          {/* Importar Manual */}
          <button onClick={openManualModal}
            className="flex items-center gap-1 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Adicionar palavras manualmente">
            <Plus className="w-3 h-3" />
            <span>Manual</span>
          </button>
          <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />

          {/* Exportar */}
          <button onClick={() => {
              if (selectedIds.size === 0) { showNotification("error", "Selecione pelo menos uma palavra-chave para exportar."); return; }
              setExportFileName(`kgr-export-${new Date().toISOString().slice(0, 10)}`);
              setIsExportModalOpen(true);
            }}
            className="flex items-center gap-1 border border-slate-800 hover:border-emerald-805 text-emerald-500 hover:text-emerald-450 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Exportar selecionadas para CSV">
            <FileSpreadsheet className="w-3 h-3" />
            <span>Exportar</span>
          </button>

          {/* Primeiro processo lógico: KeywordDNA sem IA */}
          <button onClick={handleRefreshLogicalDna}
            disabled={dnaProcessing || loading}
            className="flex items-center gap-1 border border-indigo-900/50 bg-indigo-950/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-300 hover:border-indigo-700 hover:text-indigo-200 rounded transition-colors cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            title={selectedIds.size > 0 ? "Atualizar o DNA lógico das keywords selecionadas" : "Atualizar o DNA lógico de todas as keywords carregadas"}>
            {dnaProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{dnaProcessing ? `KeywordDNA ${dnaProgress.current}/${dnaProgress.total}` : "Detectar viés · KeywordDNA"}</span>
          </button>

        </div>

        <AppMenu active="minerador" countLabel={filteredKeywords.length > 0 ? `${filteredKeywords.length} termos` : undefined} />
      </div>

      {organizeOpen && (
        <section className="shrink-0 border-b border-slate-900 bg-[#0b0c10] px-4 py-3 font-sans" aria-label="Filtros de organização">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-400">
              Status
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-slate-600">
                <option value="Todos">Todos</option><option value="bruto">Bruto</option><option value="aprovado">Aprovado</option><option value="rejeitado">Rejeitado</option><option value="publicado">Publicado</option>
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
              <p className="mt-1 text-[11px] text-slate-400">Nada é gravado até a confirmação explícita. A lista de destino é <span className="text-slate-200">{lists.find(list => list.id === targetListId)?.nome || targetListId}</span>.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
              <span className="rounded border border-slate-800 px-1.5 py-0.5">Recebidas: {siteSyncPlan.summary.received}</span>
              <span className="rounded border border-emerald-900/50 px-1.5 py-0.5 text-emerald-300">Novas: {siteSyncPlan.summary.new}</span>
              <span className="rounded border border-indigo-900/50 px-1.5 py-0.5 text-indigo-300">Atualizadas: {siteSyncPlan.summary.updated}</span>
              <span className="rounded border border-slate-800 px-1.5 py-0.5">Sem alteração: {siteSyncPlan.summary.unchanged}</span>
              <span className="rounded border border-amber-900/50 px-1.5 py-0.5 text-amber-300">Duplicadas: {siteSyncPlan.summary.duplicateInBatch}</span>
              <span className="rounded border border-rose-900/50 px-1.5 py-0.5 text-rose-300">Inválidas/bloqueadas: {siteSyncPlan.summary.invalid + siteSyncPlan.summary.blocked}</span>
            </div>
          </div>
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-slate-900/80 bg-[#06070a]">
            {siteSyncPlan.items.map(item => (
              <div key={item.candidate.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-900/60 px-3 py-2 text-[11px] last:border-b-0">
                <span className="min-w-48 font-semibold text-slate-200">{item.candidate.text}</span>
                <span className="text-slate-500">{siteRelationLabel(item.candidate.keywordUrlRelation)}</span>
                <span className="text-slate-500">URL: {item.candidate.urlSituation}</span>
                <span className="text-slate-500">{siteArchitectureLabel(item.candidate.architectureStatus)}</span>
                <span className={item.outcome === "new" ? "text-emerald-300" : item.outcome === "evidence_updated" ? "text-indigo-300" : item.outcome === "no_change" ? "text-slate-400" : "text-amber-300"}>{siteSyncOutcomeLabel(item.outcome)}</span>
                {item.mineradorKeywordId && <span className="font-mono text-[10px] text-slate-600">{item.mineradorKeywordId}</span>}
                <a href={item.candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Origem</a>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setSiteSyncPlan(null)} disabled={siteSyncPersisting} className="rounded border border-slate-800 px-3 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50">Voltar</button>
            <button onClick={handleConfirmSiteSync} disabled={siteSyncPersisting || !siteSyncPlan.items.some(item => ["new", "evidence_updated", "no_change"].includes(item.outcome))} className="flex items-center gap-1 rounded border border-emerald-700/60 bg-emerald-900/30 px-3 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50">
              {siteSyncPersisting && <Loader2 className="h-3 w-3 animate-spin" />}
              {siteSyncPersisting ? "Persistindo..." : "Confirmar conferência"}
            </button>
          </div>
        </section>
      )}


      {/* PLANILHA PRINCIPAL */}
     <main className="flex-1 overflow-auto relative">
        {loading || organizationHydrationPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#06070a]/90">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mb-2" />
            <span className="text-[10px] text-slate-500 font-mono">{loading ? "Buscando do Supabase..." : "Restaurando organização..."}</span>
          </div>
        ) : filteredKeywords.length === 0 ? (
          <div className="p-16 text-center">
            <AlertTriangle className="w-6 h-6 text-slate-655 mx-auto mb-2" />
            <p className="font-bold text-slate-400">Nenhuma palavra-chave encontrada</p>
            <p className="text-[10px] text-slate-600 mt-1">Insira palavras do banco ou utilize filtros diferentes.</p>
          </div>
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
            <table className="w-full border-collapse text-left text-[12.5px] font-sans tracking-wide whitespace-nowrap">
            
            {/* CabeÃ§alho Fixo OrdenÃ¡vel */}
            <thead className="bg-[#0b0c10] border-b border-slate-900 sticky top-0 z-20">
              <tr className="text-slate-500">
                <th className="py-2 px-2 text-center border-r border-slate-900/50 w-8 font-mono text-[10px]">#</th>
                <th className="py-2 px-3 w-8 text-center border-r border-slate-900/50">
                  <button onClick={handleToggleSelectAll} className="hover:text-indigo-400 transition-colors inline-block align-middle">
                    {selectedIds.size === filteredKeywords.length ? (
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th 
                  className="py-2 px-3 border-r border-slate-900/50 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("keyword")}
                >
                  Palavra-Chave {renderSortIcon("keyword")}
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-24 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("results_allintitle")}
                >
                  Resultados {renderSortIcon("results_allintitle")}
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-24 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("volume_search")}
                >
                  Volume {renderSortIcon("volume_search")}
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-24 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("kgr_score")}
                >
                  KGR {renderSortIcon("kgr_score")}
                </th>
                <th className="py-2 px-3 text-center border-r border-slate-900/50 w-36">
                  Intenção
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-32 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("nicho")}
                >
                  Nicho (Mercado) {renderSortIcon("nicho")}
                </th>
                <th 
                  className="py-2 px-3 border-r border-slate-900/50 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("lista")}
                >
                  Silo/Categoria {renderSortIcon("lista")}
                </th>
                <th className="py-2 px-3 text-center w-20">Status</th>
              </tr>
            </thead>

            {/* Linhas da Planilha */}
            <tbody className="divide-y divide-slate-900/50 bg-[#06070a]">
              {filteredKeywords.map((item, index) => {
                const isSelected = selectedIds.has(item.id);
                const kgrApplicability = readKgrApplicability(item.analise_semantica);
                const kgrMeasurement = classifyKgrMeasurement({ kgrScore: item.kgr_score, volume: item.volume_search, results: item.results_allintitle });
                const volumeKgrConsistency: VolumeKgrConsistency = assessVolumeKgrConsistency({ volume: item.volume_search, results: item.results_allintitle, kgrScore: item.kgr_score, semantic: item.analise_semantica });
                const zeroConfirmed = hasExplicitZeroMeasurement(item.analise_semantica);
                const volumeMeasurement = item.analise_semantica?.volume_measurement && typeof item.analise_semantica.volume_measurement === "object" && !Array.isArray(item.analise_semantica.volume_measurement)
                  ? item.analise_semantica.volume_measurement as Record<string, unknown>
                  : null;
                const primaryKeywordPolicy = readPrimaryKeywordPolicy({ status: item.status, semantic: item.analise_semantica });
                const kgrApproved = kgrApplicability === "applicable" && ["aprovado", "publicado"].includes(item.status?.toLowerCase() || "") && kgrMeasurement === "complete" && volumeKgrConsistency === "coherent" && hasUsableKgrScore(item.kgr_score);
                
                // FormataÃ§Ã£o KGR de acordo com a regra estrita de Golden Ratio
                let kgrText = "-";
                let kgrColor = "text-slate-500";
                if (item.kgr_score !== null && item.volume_search !== null && volumeKgrConsistency === "coherent") {
                  kgrText = item.kgr_score.toFixed(3);
                  const score = item.kgr_score;
                  const vol = item.volume_search;
                  
                  if (score < 0.25 && vol <= 250) {
                    // Verde: KGR < 0.25 e Volume <= 250 (Regras estritas cumpridas)
                    kgrColor = "bg-emerald-950/60 text-emerald-400 border border-emerald-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  } else if ((score >= 0.25 && score <= 1.00) || (vol > 250 && score < 0.25)) {
                    // Amarelo: volume Ã© alto mas dÃ¡ pra trabalhar, ou KGR estÃ¡ entre 0.25 e 1.00
                    kgrColor = "bg-amber-950/60 text-amber-400 border border-amber-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  } else {
                    // Vermelho: nÃ£o se enquadra dentro das regras do KGR (KGR > 1.00)
                    kgrColor = "bg-rose-955/20 text-rose-455 border border-rose-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  }
                }

                // Nicho auto-detectado da palavra-chave
                const niche = autoDetectNiche(item.keyword);

                const isExpanded = expandedRowId === item.id;

                return (
                  <Fragment key={item.id}>
                    <tr 
                      className={`hover:bg-slate-900/40 transition-colors ${
                        item.status?.toLowerCase() === "publicado"
                          ? "bg-rose-955/10 border-l-2 border-l-rose-500"
                          : isSelected 
                          ? "bg-indigo-950/20" 
                          : ""
                      }`}
                    >
                      {/* NÃºmero da Linha */}
                      <td className="py-1 px-2 text-center border-r border-slate-900/40 w-8 text-slate-500 font-mono text-[11px] select-none">
                        {index + 1}
                      </td>

                      {/* Checkbox */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 w-8">
                        <button onClick={() => handleToggleSelect(item.id)} className="text-slate-600 hover:text-indigo-400 transition-colors inline-block align-middle">
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      {/* Palavra */}
                      <td 
                        className="py-1 px-3 border-r border-slate-900/40 text-slate-300 max-w-xs truncate cursor-pointer hover:text-white" 
                        onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                      >
                        <div className="flex items-center gap-1.5 select-none">
                          <span className="text-slate-500 hover:text-slate-300">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </span>
                          <span 
                            title={item.keyword} 
                            className={item.status?.toLowerCase() === "publicado" ? "text-rose-455 font-semibold" : ""}
                          >
                            {item.keyword}
                          </span>
                          {item.status?.toLowerCase() === "publicado" && (
                            <span 
                              className="ml-2 text-[10px] text-blue-400 font-mono truncate max-w-[340px] select-all"
                              title="Canonical publicado fixo: slug e URL nao podem ser alterados ou removidos."
                            >
                              {getCanonicalUrl(item) || "canonical publicado"}
                            </span>
                          )}
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${primaryKeywordPolicy === "locked" ? "border-slate-700 bg-slate-900 text-slate-300" : primaryKeywordPolicy === "reviewable" ? "border-amber-900/70 bg-amber-950/30 text-amber-300" : "border-indigo-900/60 bg-indigo-950/30 text-indigo-300"}`}
                            title={primaryKeywordPolicy === "reviewable" ? "A URL permanece protegida, mas a principal pode ser revista no Arquiteto após validação." : undefined}
                          >
                            {primaryKeywordPolicyLabel(primaryKeywordPolicy)}
                          </span>
                        </div>
                      </td>

                      {/* Resultados */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 text-slate-400 font-mono">
                        {item.results_allintitle !== null ? item.results_allintitle : "-"}
                      </td>

                      {/* Volume */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 text-slate-400 font-mono">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{item.volume_search !== null ? item.volume_search : "-"}</span>
                          {zeroConfirmed && (
                            <span className="text-[8px] uppercase tracking-wide bg-sky-950/60 text-sky-300 border border-sky-900/40 px-1 rounded font-bold" title="Zero mensal explicitamente confirmado pela keyword exata.">
                              0 confirmado
                            </span>
                          )}
                          {(item.volume_source || "real") === "estimado" && (
                            <span
                              className="text-[8px] uppercase tracking-wide bg-amber-950/60 text-amber-400 border border-amber-900/40 px-1 rounded font-bold"
                              title="Volume sem fonte real (API falhou). Não use para decisão editorial sem revisar."
                            >
                              Estimado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* KGR */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 font-mono">
                        <div className="flex items-center justify-center">
                          <span className={kgrApproved ? kgrColor : kgrApplicability === "not_applicable" ? "font-bold text-slate-300" : "text-slate-500"}>
                            {kgrApplicability === "not_applicable"
                              ? "Não aplicável"
                              : kgrApplicability === "pending"
                              ? "Pendente"
                              : volumeKgrConsistency === "inconsistent"
                              ? "Inconsistente"
                              : volumeKgrConsistency === "zero_confirmed" || volumeKgrConsistency === "zero_unconfirmed"
                              ? "Não calculável"
                              : kgrApproved
                              ? kgrText
                              : kgrMeasurement === "invalid"
                              ? "Inválido"
                              : kgrMeasurement === "without_data" || kgrMeasurement === "partial"
                              ? "Sem medição"
                              : "Pendente"}
                          </span>
                        </div>
                      </td>

                      {/* Intenção */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 w-40">
                        <span className={`font-semibold ${normalizeIntentKey(item.intent) === "unknown" ? "text-slate-500" : "text-slate-300"}`}>
                          {canonicalIntentLabel(item.intent)}
                        </span>
                      </td>

                      {/* Nicho (Mercado) - SelecionÃ¡vel */}
                      <td className="py-0.5 px-3 border-r border-slate-900/40 w-32 text-center">
                        <select
                          value={item.analise_semantica?.nicho_override || "Geral"}
                          onChange={(e) => handleUpdateNiche(item.id, e.target.value)}
                          className={`bg-[#06070a] border rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer w-full text-center ${
                            (item.analise_semantica?.nicho_override) === "Odontologia" ? "text-cyan-400 border-cyan-900/40 bg-cyan-950/20" :
                            (item.analise_semantica?.nicho_override) === "Advocacia" ? "text-amber-450 border-amber-900/40 bg-amber-950/20" :
                            (item.analise_semantica?.nicho_override) === "SaÃºde" ? "text-teal-400 border-teal-900/40 bg-teal-950/20" :
                            (item.analise_semantica?.nicho_override) === "EstÃ©tica" ? "text-pink-400 border-pink-900/40 bg-pink-950/10" :
                            (item.analise_semantica?.nicho_override) === "Fitness" ? "text-emerald-400 border-emerald-900/40 bg-emerald-950/20" :
                            (item.analise_semantica?.nicho_override) === "ServiÃ§os" ? "text-orange-400 border-orange-900/40 bg-orange-950/20" :
                            (item.analise_semantica?.nicho_override) === "Marketing" ? "text-indigo-400 border-indigo-900/40 bg-indigo-950/20" :
                            "text-slate-500 border-slate-900 bg-slate-950"
                          }`}
                        >
                          <option value="Odontologia" className="bg-[#0b0c10] text-cyan-400">Odontologia</option>
                          <option value="Advocacia" className="bg-[#0b0c10] text-amber-400">Advocacia</option>
                          <option value="SaÃºde" className="bg-[#0b0c10] text-teal-400">SaÃºde</option>
                          <option value="EstÃ©tica" className="bg-[#0b0c10] text-pink-400">EstÃ©tica</option>
                          <option value="Fitness" className="bg-[#0b0c10] text-emerald-400">Fitness</option>
                          <option value="ServiÃ§os" className="bg-[#0b0c10] text-orange-400">ServiÃ§os</option>
                          <option value="Marketing" className="bg-[#0b0c10] text-indigo-400">Marketing</option>
                          <option value="Geral" className="bg-[#0b0c10] text-slate-400">Geral</option>
                        </select>
                      </td>

                      {/* Silo/Categoria (Lista Pertencente) */}
                      <td className="py-0.5 px-3 border-r border-slate-900/40">
                        <select
                          value={item.lista_id || ""}
                          onChange={(e) => handleUpdateKeywordList(item.id, e.target.value)}
                          disabled={item.status?.toLowerCase() === "publicado"}
                          className="bg-[#06070a] border border-slate-900 focus:border-indigo-650 rounded px-1.5 py-0.5 text-[10px] text-slate-355 font-semibold focus:outline-none cursor-pointer max-w-[150px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="" className="bg-[#0b0c10] text-slate-500">Sem Silo/Categoria</option>
                          {lists.map(list => (
                            <option key={list.id} value={list.id} className="bg-[#0b0c10]">{list.nome}</option>
                          ))}
                        </select>
                      </td>

                      {/* Status Dropdown */}
                      <td className="py-0.5 px-3 border-r border-slate-900/40 text-center w-24">
                        <select
                          value={item.status || "bruto"}
                          onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                          disabled={item.status?.toLowerCase() === "publicado"}
                          className={`bg-[#06070a] border rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer focus:border-indigo-650 w-full text-center ${
                            item.status?.toLowerCase() === "publicado"
                              ? "text-rose-455 border-rose-900/60 bg-rose-955/15"
                              : item.status?.toLowerCase() === "aprovado"
                              ? "text-emerald-450 border-emerald-900/30 bg-emerald-950/40"
                              : item.status?.toLowerCase() === "rejeitado"
                              ? "text-rose-455 border-rose-900/30 bg-rose-955/10"
                              : "text-slate-500 border-slate-900 bg-slate-950"
                          }`}
                        >
                          <option value="bruto" className="bg-[#0b0c10] text-slate-500">Bruto</option>
                          <option value="aprovado" className="bg-[#0b0c10] text-emerald-400">Aprovado</option>
                          <option value="rejeitado" className="bg-[#0b0c10] text-rose-455">Rejeitado</option>
                          <option value="publicado" className="bg-[#0b0c10] text-rose-400">Publicado</option>
                        </select>
                      </td>
                    </tr>

                    {/* Acordeom ExpansÃ­vel com AnÃ¡lise SemÃ¢ntica DinÃ¢mica em JSONB */}
                    {isExpanded && (
                      <tr className="bg-slate-950/95 border-b border-slate-900/60">
                        <td colSpan={10} className="p-4 border-r border-l border-slate-900/50">
                          {/* URL CanÃ´nica baseada no domÃ­nio e slug */}
                          <div className="mb-4 bg-[#0b0c10] border border-slate-900/80 rounded p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-sans">
                            <div className="flex flex-col gap-0.5 max-w-full">
                              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                                ðŸ”— URL CanÃ´nica {item.status?.toLowerCase() === "publicado" ? "Publicada (Fixa)" : "Planejada"}
                              </span>
                              <span className="text-slate-300 select-all font-mono truncate max-w-md md:max-w-2xl block mt-0.5">
                                {getCanonicalUrl(item) || "Defina o domÃ­nio do site e o slug nas configuraÃ§Ãµes da marca."}
                              </span>
                            </div>
                            {getCanonicalUrl(item) && activeBrand?.site_url && (
                              <a
                                href={getCanonicalUrl(item)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/30 text-indigo-300 text-[10px] px-3 py-1.5 rounded font-semibold transition-all shrink-0 flex items-center gap-1"
                              >
                                Acessar Link
                              </a>
                            )}
                          </div>

                          <KeywordDnaPanel
                            keyword={item}
                            statusUpdating={updating}
                            onWorkflowStatusChange={(status) => handleUpdateStatus(item.id, status)}
                          />

                          <div className="mb-4 grid grid-cols-1 gap-2 rounded border border-indigo-950/60 bg-indigo-950/10 p-3 text-[11px] font-sans sm:grid-cols-3">
                            <section className="rounded border border-slate-800/70 bg-[#06070a]/30 p-2">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-indigo-400">Métricas</span>
                              <div className="mt-1 text-slate-400">Volume: <strong className="text-slate-200">{item.volume_search === 0 ? (zeroConfirmed ? "0 confirmado" : "0 sem confirmação") : item.volume_search ?? "Pendente"}</strong></div>
                              <div className="text-slate-400">Resultados allintitle: <strong className="text-slate-200">{item.results_allintitle ?? "Pendente"}</strong></div>
                              <div className="text-slate-400">Medição: <strong className="text-slate-200">{kgrMeasurementLabel(kgrMeasurement)}</strong></div>
                              <div className="text-slate-400">Fonte do volume: <strong className="text-slate-200">{item.volume_source || "Pendente"}</strong></div>
                              <div className="text-slate-400">Estado da medição: <strong className={volumeKgrConsistency === "inconsistent" ? "text-rose-300" : "text-slate-200"}>{volumeKgrConsistencyLabel(volumeKgrConsistency)}</strong></div>
                              {volumeMeasurement && <div className="text-slate-400">Última consulta: <strong className="text-slate-200">{String(volumeMeasurement.measuredAt || "Pendente")}</strong></div>}
                            </section>
                            <section className="rounded border border-slate-800/70 bg-[#06070a]/30 p-2">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-indigo-400">Estratégia KGR · cálculo técnico</span>
                              <div className="mt-1 text-slate-400">{kgrApplicabilityLabel(kgrApplicability)}</div>
                              <div className="text-slate-400">KGR calculado: <strong className="text-slate-200">{kgrApplicability === "not_applicable" ? "Não utilizado" : kgrApplicability === "applicable" && volumeKgrConsistency === "inconsistent" ? "Incompatibilidade comprovada" : kgrApplicability === "applicable" && (volumeKgrConsistency === "zero_confirmed" || volumeKgrConsistency === "zero_unconfirmed") ? "Não calculável com volume zero" : kgrApplicability === "applicable" && hasUsableKgrScore(item.kgr_score) ? item.kgr_score.toFixed(3) : "Não utilizado até decisão"}</strong></div>
                              {kgrApplicability === "pending" && kgrMeasurement === "complete" && <div className="text-slate-400">Métricas completas — prontas para decisão KGR</div>}
                            </section>
                            <section className="rounded border border-slate-800/70 bg-[#06070a]/30 p-2">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-indigo-400">Decisão humana</span>
                              <div className="mt-1 text-slate-200">{kgrApplicabilityLabel(kgrApplicability)}</div>
                              <div className="text-slate-400">{String(item.analise_semantica?.kgr_decidido_por || "Pendente")} · {String(item.analise_semantica?.kgr_decidido_em || "—")}</div>
                            </section>
                          </div>

                          {item.status?.toLowerCase() === "publicado" && (
                            <section className="mb-4 rounded border border-rose-900/50 bg-rose-955/10 p-3 text-[11px] font-sans">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-rose-300">Identidade publicada</span>
                              <div className="mt-2 grid grid-cols-1 gap-2 text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                                <span>URL: <strong className="text-slate-200">fixa</strong></span>
                                <span>Slug: <strong className="text-slate-200">fixo</strong></span>
                                <span>Canonical: <strong className="text-slate-200">fixo</strong></span>
                                <span>Keyword principal: <strong className="text-slate-200">{primaryKeywordPolicyLabel(primaryKeywordPolicy).replace("Principal ", "").toLowerCase()}</strong></span>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <label className="text-slate-400" htmlFor={`primary-policy-${item.id}`}>Política da principal</label>
                                <select
                                  id={`primary-policy-${item.id}`}
                                  value={primaryKeywordPolicy}
                                  disabled={updating}
                                  onChange={(event) => void handlePrimaryKeywordPolicyChange(item, event.target.value as Extract<PrimaryKeywordPolicy, "locked" | "reviewable">)}
                                  className="rounded border border-slate-700 bg-[#06070a] px-2 py-1 text-[10px] font-semibold text-slate-200 outline-none focus:border-slate-500 disabled:opacity-50"
                                >
                                  <option value="locked">Travada</option>
                                  <option value="reviewable">Revisável</option>
                                </select>
                                {primaryKeywordPolicy === "reviewable" && <span className="text-amber-300">A URL permanece protegida; revisão ocorre somente no Arquiteto com validação humana.</span>}
                              </div>
                            </section>
                          )}

                          {siteEvidenceFor(item) && (
                            <div className="mb-4 grid grid-cols-1 gap-2 rounded border border-emerald-950/60 bg-emerald-950/10 p-3 text-[11px] font-sans sm:grid-cols-2 lg:grid-cols-3">
                              <span className="text-emerald-300">Origem: Site/Sitemap</span>
                              <span className="text-slate-400">Relação: <strong className="text-slate-200">{siteRelationLabel(siteEvidenceFor(item)?.keywordUrlRelation)}</strong></span>
                              <span className="text-slate-400">URL técnica: <strong className="text-slate-200">{siteEvidenceFor(item)?.urlSituation || "Não verificada"}</strong></span>
                              <span className="text-slate-400">Publicação: <strong className="text-slate-200">{sitePublicationLabel(siteEvidenceFor(item)?.publicationStatus)}</strong></span>
                              <span className="text-slate-400">Arquitetura: <strong className="text-slate-200">{siteArchitectureLabel(siteEvidenceFor(item)?.architectureStatus)}</strong></span>
                              <span className="text-slate-400">Silo existente: <strong className="text-slate-200">{siteEvidenceFor(item)?.siloName || siteEvidenceFor(item)?.siloId || "Não consolidado"}</strong></span>
                              {siteEvidenceFor(item)?.resolvedUrl && <a href={siteEvidenceFor(item)?.resolvedUrl || "#"} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-400 hover:text-indigo-300">URL resolvida: {siteEvidenceFor(item)?.resolvedUrl}</a>}
                              {siteEvidenceFor(item)?.declaredCanonicalUrl && <a href={siteEvidenceFor(item)?.declaredCanonicalUrl || "#"} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-400 hover:text-indigo-300">Canonical: {siteEvidenceFor(item)?.declaredCanonicalUrl}</a>}
                              {siteEvidenceFor(item)?.sourceUrl && <a href={siteEvidenceFor(item)?.sourceUrl} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-400 hover:text-indigo-300">URL de origem: {siteEvidenceFor(item)?.sourceUrl}</a>}
                            </div>
                          )}

                          {item.analise_semantica && Object.keys(item.analise_semantica).length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-[12px] font-sans whitespace-normal">
                              {Object.entries(item.analise_semantica).filter(([key]) => !["dna_campos_logicos", "site_origin", "site_origins", "kgr_aplicabilidade", "kgr_decisao", "kgr_decisao_origem", "kgr_decidido_por", "kgr_decidido_em", "kgr_decisao_versao", "kgr_decisao_historico", "kgr_justificativa"].includes(key)).map(([key, value]) => {
                                const formatKeyName = (k: string) => {
                                  const labels: Record<string, string> = {
                                    urgencia_tempo: "â±ï¸ UrgÃªncia / Tempo",
                                    intencao_local: "ðŸ“ IntenÃ§Ã£o Local",
                                    perfil_b2b: "ðŸ’¼ Perfil B2B",
                                    emocao_dominante: "ðŸŽ­ EmoÃ§Ã£o Dominante",
                                    nivel_consciencia: "ðŸ§  NÃ­vel de ConsciÃªncia",
                                    "objecao_implÃ­cita": "ðŸ›¡ï¸ ObjeÃ§Ã£o ImplÃ­cita",
                                    objecao_implicita: "ðŸ›¡ï¸ ObjeÃ§Ã£o ImplÃ­cita",
                                    poder_aquisitivo: "ðŸ’° Poder Aquisitivo",
                                    gatilho_de_conversao: "âš¡ Gatilho de ConversÃ£o"
                                  };
                                  return labels[k] || k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                                };

                                return (
                                  <div key={key} className="bg-[#0b0c10] border border-slate-900 p-3 rounded shadow-sm">
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                                      {formatKeyName(key)}
                                    </span>
                                    <p className="text-slate-300 leading-relaxed">
                                      {typeof value === "string" || typeof value === "number" ? value : JSON.stringify(value)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-xs text-slate-500 font-sans">
                              Nenhuma análise semântica disponível para esta palavra-chave. Selecione o termo e dispare a Análise Semântica (DeepSeek) no rodapé.
                            </div>
                          )}
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
      </main>

      {allintitleMode === "batch" && allintitleBatchId && (
        <section className="fixed inset-x-4 bottom-16 z-40 mx-auto max-w-5xl rounded-lg border border-indigo-900/70 bg-[#0b0c10] shadow-2xl" role="dialog" aria-label="Prévia de resultados allintitle">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Resultados allintitle pela extensão</p><p className="mt-1 text-xs text-slate-400">{allintitleExtensionState === "unavailable" ? allintitlePreflight.message : "Revise os resultados antes de confirmar qualquer persistência."}</p></div>
            <div className="flex gap-2"><button onClick={handleCancelAllintitle} className="rounded border border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-300">Cancelar lote</button>{allintitleExtensionState === "paused" && <button onClick={handleResumeAllintitle} className="rounded border border-amber-700 bg-amber-950/30 px-3 py-1.5 text-[10px] font-bold text-amber-200">Retomar após resolver CAPTCHA</button>}</div>
          </header>
          <div className="max-h-64 overflow-auto p-3 text-[11px]">
            {allintitlePreview.length === 0 ? <p className="py-4 text-center text-slate-500">{allintitleExtensionState === "running" ? "A extensão está medindo uma keyword por vez..." : "Nenhum resultado retornado ainda."}</p> : allintitlePreview.map(result => {
              const persistable = isPersistableAllintitleResult(result);
              const previous = keywords.find(item => item.id === result.keywordId)?.results_allintitle ?? null;
              return <label key={result.keywordId} className="mb-2 flex items-center gap-3 rounded border border-slate-800 bg-black/20 px-3 py-2"><input type="checkbox" disabled={!persistable} checked={persistable && !allintitleExcludedIds.has(result.keywordId)} onChange={() => setAllintitleExcludedIds(current => { const next = new Set(current); if (next.has(result.keywordId)) next.delete(result.keywordId); else next.add(result.keywordId); return next; })}/><span className="min-w-0 flex-1 truncate text-slate-200">{result.keyword}</span><span className="font-mono text-slate-500">anterior: {previous ?? "pendente"}</span><span className={persistable ? "font-mono text-emerald-300" : "font-mono text-amber-300"}>{persistable ? `novo: ${result.resultsAllintitle}` : result.status}</span><span className="max-w-48 truncate text-slate-500">{result.message || result.errorCode || result.source}</span></label>;
            })}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-3"><span className="text-[10px] text-slate-500">Somente sucesso e zero confirmado podem ser gravados. Volume e demais metadados são preservados.</span><div className="flex gap-2"><button onClick={closeAllintitleRun} className="rounded border border-slate-700 px-3 py-1.5 text-[10px] text-slate-300">Fechar prévia</button><button disabled={updating || !allintitlePreview.some(result => isPersistableAllintitleResult(result) && !allintitleExcludedIds.has(result.keywordId))} onClick={handleConfirmAllintitle} className="rounded border border-emerald-700 bg-emerald-950/30 px-3 py-1.5 text-[10px] font-bold text-emerald-200 disabled:opacity-40">Confirmar resultados válidos</button></div></footer>
        </section>
      )}

      {/* FOOTER BATCH ACTIONS BAR */}
      {selectedIds.size > 0 && (
        <footer className="z-30 flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-900 bg-[#0b0c10] px-3 py-2.5 shadow-2xl animate-in slide-in-from-bottom-12">
          
          <div className="flex shrink-0 items-center gap-1.5 rounded border border-indigo-900/60 bg-indigo-950/30 px-2.5 py-1 text-[11px] font-bold text-indigo-100">
            <span>{selectedIds.size} selecionada{selectedIds.size === 1 ? "" : "s"}</span>
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-2">
            
            {/* Mover para Categoria/Silo */}
            <div className="flex items-center gap-1.5 bg-[#06070a] border border-slate-800 rounded px-2.5 py-1">
              <span className="text-[11px] text-slate-500 font-semibold">Mover para Silo:</span>
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="bg-transparent text-slate-300 font-semibold focus:outline-none cursor-pointer pr-1 max-w-[120px] truncate"
              >
                {lists.map(list => (
                  <option key={list.id} value={list.id} className="bg-[#0b0c10]">{list.nome}</option>
                ))}
              </select>
              <button
                onClick={handleBatchMove}
                disabled={updating || !targetListId}
                className="p-1 hover:bg-slate-900 rounded transition-colors text-indigo-400"
                title="Mover Palavras"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={handleCheckWithSite}
              disabled={siteSyncLoading || siteSyncPersisting || loading || !selectedBrandId || !targetListId}
              className="flex items-center gap-1.5 rounded border border-emerald-900/50 bg-emerald-950/20 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition-colors hover:border-emerald-700 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              title="Conferir somente as keywords selecionadas com o Site/Sitemap">
              {siteSyncLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>{siteSyncLoading ? "Conferindo..." : "Conferir com o site"}</span>
            </button>

            {/* Descobrir KGR (Qualificar/Quantificar) */}
            <button
              onClick={handleMeasureAllintitleSelection}
              disabled={updating || resultsMeasuring || allintitleMode !== null}
              title="Consulta a quantidade de resultados allintitle usando a extensão."
              className="flex items-center gap-1 rounded border border-cyan-900/60 bg-cyan-950/20 px-3 py-1.5 text-[11px] font-bold text-cyan-300 transition-all hover:border-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{resultsMeasuring ? "Medindo resultados..." : "Medir resultados"}</span>
            </button>
            <button
              onClick={handleBatchQualify}
              disabled={updating || volumeMeasuring}
              title="Consulta o volume da keyword no provedor configurado."
              className="flex items-center gap-1 bg-[#06070a] border border-slate-800 hover:bg-slate-900 text-emerald-450 font-bold py-1.5 px-4 rounded transition-all"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>{volumeMeasuring ? "Medindo volume..." : "Medir volume"}</span>
            </button>

            {allintitleMode === "single" && allintitleBatchId && (
              <div className="flex items-center gap-2 rounded border border-indigo-900/60 bg-indigo-950/20 px-3 py-1.5 text-[10px] text-indigo-100">
                <span>{allintitleExtensionState === "paused" ? "CAPTCHA detectado. Resolva na aba Google." : "Consultando resultados allintitle..."}</span>
                {allintitleExtensionState === "paused" && <><button onClick={handleResumeAllintitle} className="font-bold text-amber-200 hover:text-amber-100">Retomar</button><button onClick={handleCancelAllintitle} className="text-slate-300 hover:text-white">Cancelar</button></>}
              </div>
            )}

            <select
              defaultValue=""
              disabled={updating}
              aria-label="Decisão KGR"
              onChange={(event) => {
                const decision = event.target.value;
                event.currentTarget.value = "";
                if (decision === "applicable") void handleBatchApprove();
                if (decision === "not_applicable") void handleBatchMarkKgrNotApplicable();
              }}
              className="rounded border border-indigo-900/60 bg-indigo-950/30 px-3 py-1.5 text-[11px] font-bold text-indigo-100 outline-none hover:border-indigo-700 disabled:opacity-50"
              title="Registrar decisão humana para as keywords selecionadas"
            >
              <option value="" className="bg-[#0b0c10]">Decisão KGR</option>
              <option value="applicable" className="bg-[#0b0c10]">Aprovar como KGR</option>
              <option value="not_applicable" className="bg-[#0b0c10]">Marcar não aplicável</option>
            </select>

            {/* Marcar como Publicado */}
            <button
              onClick={handleBatchPublish}
              disabled={updating}
              className="flex items-center gap-1 bg-rose-955/25 hover:bg-rose-955/40 border border-rose-900/60 disabled:opacity-50 text-rose-400 font-bold py-1.5 px-4 rounded transition-all hover:scale-[1.01]"
            >
              <span>Marcar Publicado</span>
            </button>

             {/* Processar Nicho & Intenção (DeepSeek / IA Real) */}
            <button
              onClick={handleBatchProcessIntentNiche}
              disabled={updating || queueProcessing}
              className="flex items-center gap-1.5 bg-[#06070a] border border-indigo-950/40 hover:bg-slate-900 disabled:opacity-50 text-indigo-400 font-bold py-1.5 px-4 rounded transition-all hover:scale-[1.01]"
              title="Processar Nicho e Intenção reais de acordo com a pesquisa no mercado brasileiro via DeepSeek"
            >
              {queueProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              ) : (
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>
                {queueProcessing 
                  ? `Processando (${queueProgress} de ${selectedIds.size})...` 
                  : "Processar Nicho & Intenção"}
              </span>
            </button>

            {/* Análise Semântica */}
            <button
              onClick={handleBatchAnalyze}
              disabled={updating || queueProcessing}
              className="flex items-center gap-1.5 bg-[#06070a] border border-indigo-950/40 hover:bg-slate-900 disabled:opacity-50 text-indigo-400 font-bold py-1.5 px-4 rounded transition-all"
            >
              {queueProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              ) : (
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>
                {queueProcessing 
                  ? `Analisando (${queueProgress} de ${selectedIds.size})...` 
                  : "Análise Semântica"}
              </span>
            </button>

            {/* Excluir */}
            <button
              onClick={() => void handleBatchDelete(false)}
              disabled={updating || queueProcessing}
              className="flex items-center gap-1 bg-red-950/20 border border-red-900/30 hover:bg-red-900/30 disabled:opacity-50 text-red-400 font-bold py-1.5 px-4 rounded transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>

          </div>
        </footer>
      )}

      <DangerApprovalDialog open={deleteApprovalOpen} title="Excluir keywords não-publicadas"
        description={`Esta ação excluirá permanentemente ${selectedDeletableCount} keyword(s) do Supabase.`}
        impact={["A exclusão é permanente para registros não-publicados.", "Keywords publicadas continuam protegidas.", "A seleção foi recalculada antes desta confirmação."]}
        verificationPhrase={`EXCLUIR ${selectedDeletableCount}`} confirmLabel="Aprovar exclusão permanente"
        onCancel={() => setDeleteApprovalOpen(false)} onConfirm={() => handleBatchDelete(true)}/>

      {/* Modal de criaÃ§Ã£o de Categoria/Silo */}
      {isListModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded overflow-hidden relative shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 to-purple-600"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1">
                <FolderPlus className="w-3.5 h-3.5 text-indigo-450" /> Criar Silo / Categoria
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
                  className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nicho / Setor do Projeto</label>
                <input 
                  type="text" 
                  placeholder="Ex: Odontologia, Advocacia"
                  value={newListNicho}
                  onChange={(e) => setNewListNicho(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650"
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
                  className="bg-indigo-650 hover:bg-indigo-600 text-white font-bold py-1.5 px-4 rounded transition-all"
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
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 to-purple-600"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-400" /> Importar Lista Manualmente (Copiar & Colar)
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
                  className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 font-sans text-xs resize-y min-h-[120px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Selecionar Silo / Categoria */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">
                    Silo / Lista Destino {manualStatus === "publicado" && <span className="text-rose-500 font-bold ml-1">* Silo de PublicaÃ§Ã£o ObrigatÃ³rio</span>}
                  </label>
                  <select
                    value={manualListId}
                    onChange={(e) => setManualListId(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-350 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
                  >
                    <option value="" disabled>Selecione um Silo</option>
                    {lists.map(list => (
                      <option key={list.id} value={list.id}>{list.nome}</option>
                    ))}
                  </select>
                </div>

                {/* LocalizaÃ§Ã£o padrÃ£o */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Localidade / RegiÃ£o</label>
                  <input
                    type="text"
                    placeholder="Ex: Brasil, SP, Rio de Janeiro"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 text-xs font-semibold"
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
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-350 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
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
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-350 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
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
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-355 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
                  >
                    <option value="bruto">Bruto</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="rejeitado">Rejeitado</option>
                    <option value="publicado">Publicado</option>
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
                  className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-1.5 px-4 rounded transition-all flex items-center gap-1.5"
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
