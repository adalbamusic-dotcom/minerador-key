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
  Play,
  FileSpreadsheet,
  Brain,
  ChevronDown,
  ChevronRight,
  Building2,
} from "lucide-react";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { useBrand } from "@/components/brand-context";
import { AppMenu } from "@/components/app-menu";
import { KeywordDnaPanel, KeywordDnaProvenance } from "@/components/editorial/dna-panels";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import { MineradorLastOrganizationRestorer } from "./last-organization-restorer";
import { DangerApprovalDialog } from "@/components/editorial/danger-approval-dialog";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { useNoticeCenter } from "@/components/global-notice-center";
import { useRouter } from "next/navigation";
import {
  autoClassifyIntent,
  autoDetectNiche,
  deriveLogicalKeywordDna,
  mergeLogicalKeywordSemantic,
  semanticRecordsEqual,
} from "@/lib/arquiteto/keyword-dna-engine";
import { buildMineradorSiteSyncPlan, loadMineradorSiteSyncSnapshot, uniqueSiteSyncCandidates, type MineradorSiteSyncPlan } from "@/lib/minerador/site-sync-adapter";
import { calculateKgrFromMetrics, classifyKgrMeasurement, hasUsableKgrScore, kgrApplicabilityLabel, kgrDecisionLabel, kgrMeasurementLabel, readKgrApplicability, setKgrApplicability, type KgrApplicability } from "@/lib/minerador/kgr-applicability";
import { canonicalIntentLabel, normalizeIntentKey } from "@/lib/minerador/intent-taxonomy";
import { assessVolumeKgrConsistency, hasExplicitZeroMeasurement, volumeKgrConsistencyLabel, type VolumeKgrConsistency } from "@/lib/minerador/volume-kgr-consistency";
import { deriveMineradorTableRows } from "@/lib/minerador/table-view";
import { mineradorLastOrganizationKey, mineradorOrganizationButtonSummary, mineradorOrganizationLabels, type MineradorOrganizationValues } from "@/lib/minerador/last-organization";
import { primaryKeywordPolicyLabel, readPrimaryKeywordPolicy, setPrimaryKeywordPolicy, type PrimaryKeywordPolicy } from "@/lib/minerador/primary-keyword-policy";
import { applyFunnelQualification, classifyKeywordFunnel, extensionFunnelHints, type FunnelValue } from "@/lib/minerador/keyword-qualification";
import { readVolumeEligibility, volumeEligibilityLabel } from "@/lib/minerador/volume-eligibility";
import type { KeywordTableOrderMode } from "@/lib/minerador/manual-order";
import { manualImportListaId, resolveLegacyCsvSilo } from "@/lib/minerador/legacy-import";
import { KeywordTableBulkBarShell } from "./keyword-table/keyword-table-bulk-bar-shell";
import { KeywordTableEmptyState } from "./keyword-table/keyword-table-empty-state";
import { KeywordTableHeader } from "./keyword-table/keyword-table-header";
import { KeywordTableOrganizeButton } from "./keyword-table/keyword-table-organize-button";
import { KeywordSelectionCell, KeywordSelectionHeader } from "./keyword-table/keyword-table-selection";
import { KeywordTableShell } from "./keyword-table/keyword-table-shell";
import { useKeywordTableSelection } from "./keyword-table/use-keyword-table-selection";
import { useKeywordTableResponsiveWidths } from "./keyword-table/use-keyword-table-responsive-widths";
import { KeywordTableDragHandle, KeywordTableOrderModeSelect } from "./keyword-table/keyword-table-order";
import { useKeywordTableOrder } from "./keyword-table/use-keyword-table-order";
import { KeywordTableColumnResizeHandle, KeywordTableRowResizeHandle, useKeywordTableColumnResize, useKeywordTableRowResize } from "./keyword-table/keyword-table-resize";
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

type QualificationResult = {
  id: string;
  keyword: string;
  status: "atualizada" | "preservada" | "conflito" | "falha";
  intent: string;
  funnel: string;
  niche: string;
  bias: string;
  confidence: string;
};

type SiteEvidenceView = { source?: string; sourceUrl?: string; resolvedUrl?: string | null; declaredCanonicalUrl?: string | null; urlSituation?: string; publicationStatus?: string; keywordUrlRelation?: string; architectureStatus?: string; batchId?: string; lastCheckedAt?: string; siloId?: string; siloName?: string | null; consolidatedAt?: string };
function siteEvidenceFor(item: KeywordItem): SiteEvidenceView | null { const origin = item.analise_semantica?.site_origin; return origin && typeof origin === "object" && !Array.isArray(origin) ? origin as SiteEvidenceView : null; }
function siteRelationLabel(value?: string) { return ({ confirmed_primary: "Principal confirmada", candidate_primary: "Principal candidata", supporting: "Apoio provável", mentioned: "Mencionada no conteúdo", undefined: "Sem relação definida" } as Record<string, string>)[value || "undefined"] || value || "Sem relação definida"; }
function siteArchitectureLabel(value?: string) { return ({ not_structured: "Não estruturado", awaiting_architecture: "Aguardando arquitetura", in_review: "Em revisão", architecture_confirmed: "Arquitetura confirmada", architectural_review_required: "Revisão arquitetural necessária", conflict: "Com conflito" } as Record<string, string>)[value || "awaiting_architecture"] || value || "Aguardando arquitetura"; }
function sitePublicationLabel(value?: string) { return ({ not_confirmed: "Não confirmada", published: "Publicada", not_found: "Não localizada", redirected: "Redirecionada", outside_sitemap: "Fora do sitemap", canonical_conflict: "Conflito de canonical" } as Record<string, string>)[value || "not_confirmed"] || value || "Não confirmada"; }
function siteSyncOutcomeLabel(value: string) { return ({ new: "Nova keyword", evidence_updated: "Evidência será atualizada", no_change: "Sem alteração", duplicate_in_batch: "Duplicada na prévia", invalid: "Inválida", blocked: "Bloqueada", existing: "Já existente" } as Record<string, string>)[value] || value; }
const mineradorTableSelectClass = "border border-divider bg-surface-subtle rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer w-full truncate focus:border-module-accent";
const processorColumnWidths = {
  drag: 32, index: 32, selection: 34, keyword: 460, principal: 128, results: 88, volume: 88,
  kgr: 136, intent: 168, niche: 168, funnel: 80, silo: 216, status: 120,
};
const processorColumnConstraints = {
  drag: { min: 28, max: 48 }, index: { min: 28, max: 56 }, selection: { min: 30, max: 56 }, keyword: { min: 240, max: 900, flexible: true },
  principal: { min: 100, max: 240 }, results: { min: 72, max: 180 }, volume: { min: 72, max: 180 }, kgr: { min: 100, max: 240 },
  intent: { min: 120, max: 280, flexible: true }, niche: { min: 120, max: 300, flexible: true }, funnel: { min: 64, max: 140 }, silo: { min: 160, max: 360, flexible: true }, status: { min: 100, max: 220 },
};
function funnelLabelFor(item: KeywordItem): string {
  const semantic = item.analise_semantica as (KeywordSemantic & Record<string, unknown>) | null | undefined;
  const proposed = typeof semantic?.funnel === "string" ? semantic.funnel.toUpperCase() as FunnelValue : null;
  const hints = extensionFunnelHints(semantic);
  if (proposed && ["TOFU", "MOFU", "BOFU"].includes(proposed)) {
    return `${proposed}${semantic?.funnel_review_required === "sim" ? "*" : ""}`;
  }
  return hints.join(" / ") || "—";
}

const formatMetricInteger = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

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
  const [, setImporting] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [queueProgress, setQueueProgress] = useState(0);
  const [dnaProcessing, setDnaProcessing] = useState(false);
  const [, setDnaProgress] = useState({ current: 0, total: 0 });
  const [qualificationResults, setQualificationResults] = useState<QualificationResult[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
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
  const [sortColumn, setSortColumn] = useState<"keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "nicho" | "lista">("keyword");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [organizationHydratedKey, setOrganizationHydratedKey] = useState<string | null>(null);
  const keywordOrder = useKeywordTableOrder(useMemo(() => keywords.map(item => item.id), [keywords]));
  const columnResize = useKeywordTableColumnResize(processorColumnWidths, processorColumnConstraints);
  const tableRef = useRef<HTMLElement | null>(null);
  const responsiveWidths = useKeywordTableResponsiveWidths(columnResize.widths, processorColumnConstraints, tableRef);
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
    volumeEligibility: filterVolumeEligibility,
    orderMode,
    manualOrderIds,
    sortColumn,
    sortDirection,
  }), [keywords, lists, searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture, filterSitePublication, filterKgrApplicability, filterKgrMeasurement, filterVolumeEligibility, orderMode, manualOrderIds, sortColumn, sortDirection]);

  const visibleKeywordIds = useMemo(() => filteredKeywords.map(item => item.id), [filteredKeywords]);
  const selection = useKeywordTableSelection(visibleKeywordIds);
  const { selectedIds, setSelectedIds } = selection;
  const visibleSelectedCount = useMemo(() => filteredKeywords.reduce((count, item) => count + (selectedIds.has(item.id) ? 1 : 0), 0), [filteredKeywords, selectedIds]);
  const allVisibleSelected = filteredKeywords.length > 0 && visibleSelectedCount === filteredKeywords.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const hiddenSelectedCount = Math.max(0, selectedIds.size - visibleSelectedCount);
  const selectedAllintitleItems = useMemo(() => keywords.filter(item => selectedIds.has(item.id)), [keywords, selectedIds]);
  const allSelectedHaveAllintitle = selectedAllintitleItems.length > 0 && selectedAllintitleItems.every(item => typeof item.results_allintitle === "number" && Number.isFinite(item.results_allintitle) && item.results_allintitle >= 0);
  const someSelectedHaveAllintitle = selectedAllintitleItems.some(item => typeof item.results_allintitle === "number" && Number.isFinite(item.results_allintitle) && item.results_allintitle >= 0);
  const [deleteApprovalOpen, setDeleteApprovalOpen] = useState(false);
  const restoreKeywordSnapshot = useCallback((snapshot: KeywordItem[]) => {
    setKeywords(snapshot);
    setSelectedIds(new Set());
  }, [setSelectedIds]);
  const keywordHistory = useLocalHistory("minerador", keywords, restoreKeywordSnapshot, 30, selectedBrandId || "sem-marca");
  const { undo: undoKeywordHistory, redo: redoKeywordHistory } = keywordHistory;
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
  const [allintitleMeasuring, setAllintitleMeasuring] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);

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

  // Avisos do piloto Minerador usam o contrato global.
  const showNotification = useCallback((type: "success" | "error" | "info", message: string, options: { code?: string; stage?: string; persistent?: boolean; diagnostic?: Record<string, unknown> } = {}) => {
    publishNotice({
      severity: type === "success" ? "SUCCESS" : type === "error" ? "ERROR" : "INFO",
      title: "Minerador",
      message,
      details: [options.stage ? `Etapa: ${options.stage}` : "", options.code ? `Código: ${options.code}` : ""].filter(Boolean).join(" · ") || undefined,
      copyPayload: options.diagnostic,
      source: type === "success" ? "persistence" : "workflow",
      confirmed: type === "success",
    });
  }, [publishNotice]);

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
      const logicalSemantic = mergeLogicalKeywordSemantic(item.analise_semantica, {
        ...logical.semantic,
        nicho_override: niche,
      });
      const intent = item.intent || canonicalIntentLabel(logical.dna.searchIntent);
      const funnelQualification = classifyKeywordFunnel({
        keyword: item.keyword,
        intent,
        niche,
        location: item.location,
        semantic: logicalSemantic,
      });
      const semantic = applyFunnelQualification(logicalSemantic, funnelQualification);
      const next = { ...item, intent, analise_semantica: semantic };
      updatedItems.push(next);

      if (!semanticRecordsEqual(item.analise_semantica, semantic) || item.intent !== intent) {
        pendingUpdates.push({ id: item.id, intent, analise_semantica: semantic });
      }
      if (options.showProgress) setDnaProgress({ current: index + 1, total: sourceKeywords.length });
    });

    let failed = 0;
    const failedIds: string[] = [];
    if (options.persist) {
      for (let offset = 0; offset < pendingUpdates.length; offset += 20) {
        const chunk = pendingUpdates.slice(offset, offset + 20);
        const results = await Promise.all(chunk.map(async update => {
          const { error } = await supabase
            .from("minerador_keywords")
            .update({ intent: update.intent, analise_semantica: update.analise_semantica })
            .eq("id", update.id)
            .eq("brand_id", selectedBrandId);
          return { id: update.id, error };
        }));
        const failedResults = results.filter(result => Boolean(result.error));
        failed += failedResults.length;
        failedIds.push(...failedResults.map(result => result.id));
      }
    }

    if (options.showProgress) setDnaProcessing(false);
    return { items: updatedItems, changed: pendingUpdates.length, failed, failedIds };
  };

  const handleQualifySelected = async () => {
    const targets = keywords.filter(keyword => selectedIds.has(keyword.id));
    if (targets.length === 0) {
      showNotification("error", "Selecione pelo menos uma keyword para qualificar.");
      return;
    }

    try {
      pushKeywordsHistory(keywords, `Qualificar ${targets.length} keyword(s)`);
      const result = await processLogicalKeywordDna(targets, lists, { persist: true, showProgress: true });
      const byId = new Map(result.items.map(item => [item.id, item]));
      const failedIds = new Set(result.failedIds);
      setQualificationResults(targets.map(item => {
        const updated = byId.get(item.id) || item;
        const semantic = updated.analise_semantica || {};
        const funnel = typeof semantic.funnel === "string" ? semantic.funnel : extensionFunnelHints(semantic).join(" / ") || "—";
        const status: QualificationResult["status"] = failedIds.has(item.id)
          ? "falha"
          : semantic.funnel_source === "human"
          ? "preservada"
          : semantic.funnel_review_required === "sim"
          ? "conflito"
          : "atualizada";
        return {
          id: item.id,
          keyword: item.keyword,
          status,
          intent: updated.intent || "Não classificada",
          funnel,
          niche: String(semantic.nicho_override || "Geral"),
          bias: String(semantic.potencial_comercial || semantic.gatilho_de_conversao || "Não identificado"),
          confidence: String(semantic.funnel_confidence || semantic.dna_confianca || "Pendente"),
        };
      }));
      setKeywords(current => current.map(item => byId.get(item.id) || item));
      if (result.failed > 0) {
        showNotification("error", `${result.changed - result.failed} qualificadas; ${result.failed} falharam ao salvar.`);
      } else {
        showNotification("success", `${targets.length} keyword(s) qualificadas; intenção, Funil, nicho e KeywordDNA atualizados para revisão.`);
      }
    } catch (error) {
      console.error("Erro ao qualificar keywords:", error);
      setDnaProcessing(false);
      showNotification("error", "Não foi possível qualificar as keywords selecionadas.");
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
      let loadedKeywords = await withSupabaseSelectRetry(async () => {
        const allowedListIds = loadedLists.map(l => l.id);
        let query = supabase
          .from("minerador_keywords")
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
          .from("minerador_keywords")
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

  const handleCheckWithSite = async () => {
    if (selectedIds.size === 0) { showNotification("error", "Selecione pelo menos uma keyword antes de conferir o site."); return; }
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca antes de conferir o site."); return; }
    if (!targetListId) { showNotification("error", "Selecione uma lista de destino antes de conferir o site."); return; }
    setSiteSyncLoading(true);
    try {
      if (!session?.user?.id) { showNotification("error", "Sessão não disponível para ler o Site/Sitemap local."); return; }
      const snapshot = await loadMineradorSiteSyncSnapshot(session.user.id, selectedBrandId);
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
    const failedKeywords: string[] = [];
    const failedDetails: Array<{ keyword: string; code?: string; stage?: string; message?: string }> = [];

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
            console.warn(`Classificação sem resposta válida para "${item.keyword}":`, resData.error);
            failCount++;
            failedKeywords.push(item.keyword);
            failedDetails.push({
              keyword: item.keyword,
              code: typeof resData.code === "string" ? resData.code : undefined,
              stage: typeof resData.stage === "string" ? resData.stage : undefined,
              message: typeof resData.error === "string" ? resData.error.slice(0, 240) : undefined,
            });
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
          console.warn(`Falha na classificação para a palavra "${item.keyword}":`, err);
          failCount++;
          failedKeywords.push(item.keyword);
          failedDetails.push({
            keyword: item.keyword,
            code: "AI_REQUEST_FAILED",
            stage: "request",
            message: err instanceof Error ? err.message.slice(0, 240) : "Falha na requisição da IA.",
          });
        }
      }

      if (failCount === 0) {
        showNotification("success", `Classificação de Nicho & Intenção de todas as ${successCount} palavras concluída!`);
      } else {
        const firstFailure = failedDetails[0];
        showNotification("info", `Classificação concluída: ${successCount} com sucesso e ${failCount} sem resposta válida. Os dados anteriores foram preservados.`, {
          code: firstFailure?.code || "AI_RUNTIME_ERROR",
          stage: firstFailure?.stage || "runtime",
          persistent: true,
          diagnostic: {
            failedKeywords: failedKeywords.slice(0, 10),
            failedCount: failCount,
            failures: failedDetails.slice(0, 10),
          },
        });
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
        .from("minerador_keywords")
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
    if (orderMode === "manual" || sortColumn !== column) return <ArrowUpDown className="w-3 h-3 text-slate-650 opacity-40 ml-1 inline" />;
    return sortDirection === "asc" 
      ? <ArrowUpDown className="w-3 h-3 text-module-accent ml-1 inline rotate-180 transition-transform" />
      : <ArrowUpDown className="w-3 h-3 text-module-accent ml-1 inline transition-transform" />;
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
        return item?.status?.toLowerCase() !== "publicado";
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
          .from("minerador_keywords")
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
          .from("minerador_keywords")
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
        .from("minerador_keywords")
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
    if (selectedIds.size === 0) return false;
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    if (applicability === "applicable") {
      const missingVolume = selectedItems.filter(item => !(typeof item.volume_search === "number" && Number.isFinite(item.volume_search) && item.volume_search >= 0));
      const zeroVolume = selectedItems.filter(item => item.volume_search === 0);
      const missingResults = selectedItems.filter(item => !(typeof item.results_allintitle === "number" && Number.isFinite(item.results_allintitle) && item.results_allintitle >= 0));
      const errors: string[] = [];
      if (zeroVolume.length > 0) {
        showNotification("info", "Volume zero: KGR não é calculável para as keywords selecionadas.");
        return;
      }
      if (missingVolume.length > 0) errors.push("Meça o volume antes de aprovar como KGR.");
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
        const { error } = await supabase.from("minerador_keywords").update({ analise_semantica: next.semantic, kgr_score: next.kgr_score, ...(next.status !== current?.status ? { status: next.status } : {}) }).eq("id", id).eq("brand_id", selectedBrandId);
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
      const { error } = await supabase.from("minerador_keywords").update({ analise_semantica: semantic }).eq("id", item.id).eq("brand_id", selectedBrandId);
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
      return false;
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
        .from("minerador_keywords")
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

  // AÃ§Ã£o em Lote: volume pela API e resultados allintitle pela extensão conectada
  const handleBatchAllintitle = async () => {
    if (allintitleMeasuring || selectedIds.size === 0 || !selectedBrandId) return;
    const operationRequestId = crypto.randomUUID();
    const keywordIds = [...selectedIds];
    setAllintitleMeasuring(true);
    setUpdating(true);
    showNotification("info", `Medindo resultados allintitle: ${keywordIds.length} alvo(s).`, { persistent: true });
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
      const projections = Array.isArray(data.projections) ? data.projections as Array<{ keywordId?: string | null; resultsAllintitle?: number }> : [];
      const byKeywordId = new Map(projections.filter(item => typeof item.keywordId === "string").map(item => [item.keywordId!, item]));
      setKeywords(current => current.map(item => {
        const projection = byKeywordId.get(item.id);
        if (!projection || typeof projection.resultsAllintitle !== "number") return item;
        return { ...item, results_allintitle: projection.resultsAllintitle, ...(typeof item.volume_search === "number" ? { kgr_score: Number((projection.resultsAllintitle / item.volume_search).toFixed(4)) } : {}) };
      }));
      const persistedCount = typeof data.persistedCount === "number" ? data.persistedCount : byKeywordId.size;
      const requestedCount = typeof data.requestedCount === "number" ? data.requestedCount : keywordIds.length;
      if (data.code === "DATAFORSEO_PARTIAL_RESULTS") showNotification("info", `${persistedCount} de ${requestedCount} resultados allintitle foram persistidos; as demais medições foram preservadas.`, { code: data.code, stage: data.stage || "response_normalization", diagnostic: data.diagnostic, persistent: true });
      else showNotification("success", data.message || `${persistedCount} resultado(s) allintitle persistidos e refletidos na tabela.`);
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "dataforseo_request_failed";
      const stage = err && typeof err === "object" && "stage" in err && typeof (err as { stage?: unknown }).stage === "string" ? (err as { stage: string }).stage : "provider_request";
      const diagnostic = err && typeof err === "object" && "diagnostic" in err && (err as { diagnostic?: unknown }).diagnostic && typeof (err as { diagnostic?: unknown }).diagnostic === "object" ? (err as { diagnostic: Record<string, unknown> }).diagnostic : undefined;
      showNotification("error", `Medição allintitle falhou: ${err instanceof Error ? err.message : "Erro de conexão"}`, { code, stage, diagnostic, persistent: true });
    } finally {
      setAllintitleMeasuring(false);
      setUpdating(false);
    }
  };

  const handleBatchQualify = async () => {
    if (selectedIds.size === 0) return;
    setUpdating(true);
    setVolumeMeasuring(true);
    const operationRequestId = crypto.randomUUID();
    const keywordIds = [...selectedIds];
    const batchCount = Math.ceil(keywordIds.length / 10_000);
    showNotification("info", `Consultando Google Ads...${batchCount > 1 ? ` ${batchCount} lotes serão processados em sequência.` : ""}`, { persistent: true });
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
      const projections = Array.isArray(data.projections) ? data.projections as Array<{ keywordId?: string; volumeSearch?: number | null; kgrScore?: number | null; eligibilityStatus?: string | null; measuredAt?: string }> : [];
      const byKeywordId = new Map(projections.filter(item => typeof item.keywordId === "string").map(item => [item.keywordId!, item]));
      setKeywords(current => current.map(item => {
        const projection = byKeywordId.get(item.id);
        if (!projection) return item;
        const eligibilityStatus = projection.eligibilityStatus;
        const semantic = eligibilityStatus && projection.measuredAt
          ? { ...(item.analise_semantica || {}), volume_eligibility: { status: eligibilityStatus, threshold: 120, provider: "google_ads", measuredAt: projection.measuredAt } }
          : item.analise_semantica;
        return {
          ...item,
          ...(typeof projection.volumeSearch === "number" ? { volume_search: projection.volumeSearch, kgr_score: projection.kgrScore ?? null, volume_source: "google_ads" } : {}),
          analise_semantica: semantic,
        };
      }));
      const persistedCount = typeof data.persistedCount === "number" ? data.persistedCount : byKeywordId.size;
      const requestedCount = typeof data.requestedCount === "number" ? data.requestedCount : keywordIds.length;
      if (data.code === "GOOGLE_ADS_PARTIAL_RESULTS") showNotification("info", `${persistedCount} de ${requestedCount} medições Google Ads foram registradas. Keywords sem média oficial ficam inelegíveis para produção; dados anteriores foram preservados.`, { code: data.code, stage: data.stage || "response_normalization", diagnostic: data.diagnostic, persistent: true });
      else showNotification("success", `${persistedCount} métricas Google Ads foram persistidas e refletidas na tabela.`);
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "google_ads_volume_request_failed";
      const stage = err && typeof err === "object" && "stage" in err && typeof (err as { stage?: unknown }).stage === "string" ? (err as { stage: string }).stage : "volume_provider";
      const diagnostic = err && typeof err === "object" && "diagnostic" in err && (err as { diagnostic?: unknown }).diagnostic && typeof (err as { diagnostic?: unknown }).diagnostic === "object" ? (err as { diagnostic: Record<string, unknown> }).diagnostic : undefined;
      if (code === "GOOGLE_ADS_QUOTA") showNotification("info", "O limite temporário da Google Ads API foi atingido. Nenhuma métrica anterior foi alterada.", { code, stage, diagnostic, persistent: true });
      else showNotification("error", `Atualização de métricas falhou: ${err instanceof Error ? err.message : "Erro de conexão"}`, { code, stage, diagnostic, persistent: true });
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
    
    if (!approved) { setDeleteApprovalOpen(true); return false; }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("minerador_keywords")
        .delete()
        .in("id", deletableIds)
        .eq("brand_id", selectedBrandId);

      if (error) throw error;

      pushKeywordsHistory(keywords, `Excluir ${deletableIds.length} keyword(s) não publicadas`);
      setKeywords(prev => prev.filter(item => item.status?.toLowerCase() === "publicado" || !deletableIds.includes(item.id)));
      setSelectedIds(current => new Set([...current].filter(id => !deletableIds.includes(id))));
      setDeleteApprovalOpen(false);
      showNotification("success", "Palavras excluÃ­das com sucesso.");
      return true;
    } catch (err: unknown) {
      const deleteError = err && typeof err === "object" ? err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } : undefined;
      const errorCode = typeof deleteError?.code === "string" ? deleteError.code : undefined;
      console.error("Falha ao excluir keywords não publicadas.", {
        code: errorCode ?? null,
        message: typeof deleteError?.message === "string" ? deleteError.message : null,
        details: typeof deleteError?.details === "string" ? deleteError.details : null,
        hint: typeof deleteError?.hint === "string" ? deleteError.hint : null,
      });
      setDeleteApprovalOpen(false);
      if (errorCode === "23503") showNotification("error", "Nada foi apagado: existem medições oficiais vinculadas. A exclusão atômica depende da migration de histórico.", { code: errorCode, persistent: true });
      else if (errorCode === "42501") showNotification("error", "Nada foi apagado: sua conta precisa da permissão Minerador: gerenciar para excluir keywords.", { code: errorCode, persistent: true });
      else showNotification("error", "Nada foi apagado: não foi possível concluir a exclusão. O diagnóstico foi registrado sem expor dados da marca.", { code: errorCode, persistent: true });
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const selectedDeletableCount = keywords.filter(item => selectedIds.has(item.id) && item.status?.toLowerCase() !== "publicado").length;
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
              <p className="mt-1 text-[11px] text-slate-400">Nada é gravado até a confirmação explícita. A lista de destino é <span className="text-slate-200">{lists.find(list => list.id === targetListId)?.nome || targetListId}</span>.</p>
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
                <span className="text-slate-500">{siteRelationLabel(item.candidate.keywordUrlRelation)}</span>
                <span className="text-slate-500">URL: {item.candidate.urlSituation}</span>
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
              {siteSyncPersisting ? "Persistindo..." : "Confirmar conferência"}
            </button>
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
            <table data-keyword-table="processor" className="w-full min-w-[1234px] table-fixed border-collapse text-left text-[12.5px] font-sans tracking-wide whitespace-nowrap">
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
                  Palavra-Chave {renderSortIcon("keyword")}<KeywordTableColumnResizeHandle columnId="keyword" label="Palavra-Chave" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[128px] border-r border-divider/70 px-3 py-2 text-center whitespace-normal">
                  Principal<KeywordTableColumnResizeHandle columnId="principal" label="Principal" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[88px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-normal transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("results_allintitle")}
                >
                  Resultados {renderSortIcon("results_allintitle")}<KeywordTableColumnResizeHandle columnId="results" label="Resultados" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[88px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-normal transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("volume_search")}
                >
                  Volume {renderSortIcon("volume_search")}<KeywordTableColumnResizeHandle columnId="volume" label="Volume" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[136px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-normal transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("kgr_score")}
                >
                  KGR {renderSortIcon("kgr_score")}<KeywordTableColumnResizeHandle columnId="kgr" label="KGR" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[168px] border-r border-divider/70 px-3 py-2 text-center whitespace-normal">
                  Intenção<KeywordTableColumnResizeHandle columnId="intent" label="Intenção" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[168px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-normal transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("nicho")}
                >
                  Nicho de mercado {renderSortIcon("nicho")}<KeywordTableColumnResizeHandle columnId="niche" label="Nicho de mercado" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[80px] border-r border-divider/70 px-3 py-2 text-center whitespace-normal"
                >
                  Funil<KeywordTableColumnResizeHandle columnId="funnel" label="Funil" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[216px] border-r border-divider/70 px-3 py-2 cursor-pointer whitespace-normal transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("lista")}
                >
                  Silo/Categoria {renderSortIcon("lista")}<KeywordTableColumnResizeHandle columnId="silo" label="Silo/Categoria" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[120px] px-3 py-2 text-center whitespace-normal">Status<KeywordTableColumnResizeHandle columnId="status" label="Status" onStart={columnResize.startResize} /></th>
              </tr>
            </KeywordTableHeader>

            {/* Linhas da Planilha */}
            <tbody className="divide-y divide-divider/70 bg-background">
              {filteredKeywords.map((item, index) => {
                const isSelected = selectedIds.has(item.id);
                const kgrApplicability = readKgrApplicability(item.analise_semantica);
                const kgrMeasurement = classifyKgrMeasurement({ kgrScore: item.kgr_score, volume: item.volume_search, results: item.results_allintitle });
                const volumeKgrConsistency: VolumeKgrConsistency = assessVolumeKgrConsistency({ volume: item.volume_search, results: item.results_allintitle, kgrScore: item.kgr_score, semantic: item.analise_semantica });
                const zeroConfirmed = hasExplicitZeroMeasurement(item.analise_semantica);
                const volumeMeasurement = item.analise_semantica?.volume_measurement && typeof item.analise_semantica.volume_measurement === "object" && !Array.isArray(item.analise_semantica.volume_measurement)
                  ? item.analise_semantica.volume_measurement as Record<string, unknown>
                  : null;
                const confirmedVolumeMeasurement = Boolean(
                  volumeMeasurement
                  && volumeMeasurement.match === "exact"
                  && ["confirmed", "zero_confirmed"].includes(String(volumeMeasurement.status || ""))
                  && typeof volumeMeasurement.rawVolume === "number"
                  && Number.isFinite(volumeMeasurement.rawVolume)
                  && volumeMeasurement.rawVolume === item.volume_search,
                );
                const volumeEligibility = readVolumeEligibility(item);
                const volumeEligibilityClass = volumeEligibility === "eligible"
                  ? "border-success/50 bg-success-soft text-success"
                  : volumeEligibility === "pending"
                    ? "border-divider bg-surface-subtle text-text-muted"
                    : volumeEligibility === "measurement_failed"
                      ? "border-warning/50 bg-warning-soft text-warning"
                      : "border-divider bg-surface-subtle text-foreground/80";
                const primaryKeywordPolicy = readPrimaryKeywordPolicy({ status: item.status, semantic: item.analise_semantica });
                const selectedListName = lists.find(list => list.id === item.lista_id)?.nome || "Sem Silo/Categoria";
                const intentLabel = canonicalIntentLabel(item.intent);
                const intentIsPending = normalizeIntentKey(item.intent) === "unknown";
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
                    kgrColor = "bg-success-soft text-success border border-success/50 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  } else if ((score >= 0.25 && score <= 1.00) || (vol > 250 && score < 0.25)) {
                    // Amarelo: volume Ã© alto mas dÃ¡ pra trabalhar, ou KGR estÃ¡ entre 0.25 e 1.00
                    kgrColor = "bg-warning-soft text-warning border border-warning/50 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  } else {
                    // Vermelho: nÃ£o se enquadra dentro das regras do KGR (KGR > 1.00)
                    kgrColor = "bg-danger-soft text-danger border border-danger/50 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  }
                }
                const kgrTextBadge = "inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold";
                const kgrState = item.volume_search === 0
                  ? { label: "Não calculável", className: "border-divider bg-surface-subtle text-foreground/80" }
                  : kgrApplicability === "not_applicable"
                    ? { label: "Não aplicável", className: "border-divider bg-surface-subtle text-foreground/80" }
                    : kgrApplicability === "pending"
                      ? { label: "Pendente", className: "border-pending/50 bg-pending-soft text-pending" }
                      : volumeKgrConsistency === "inconsistent"
                        ? { label: "Inconsistente", className: "border-danger/50 bg-danger-soft text-danger" }
                        : kgrMeasurement === "invalid"
                          ? { label: "Inválido", className: "border-danger/50 bg-danger-soft text-danger" }
                          : kgrMeasurement === "without_data" || kgrMeasurement === "partial"
                            ? { label: "Sem medição", className: "border-divider bg-surface-subtle text-foreground/80" }
                            : null;

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
                          : item.status?.toLowerCase() === "publicado"
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
                              className={`break-words select-text cursor-text ${item.status?.toLowerCase() === "publicado" ? "font-semibold text-danger" : ""}`}
                            >
                              {item.keyword}
                            </div>
                            {item.status?.toLowerCase() === "publicado" && (
                              <div
                                className="mt-0.5 block max-w-full truncate select-text font-mono text-[10px] text-context-accent"
                                title="Canonical publicado fixo: slug e URL nao podem ser alterados ou removidos."
                              >
                                {getCanonicalUrl(item) || "canonical publicado"}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Política da principal */}
                      <td className="w-[128px] border-r border-divider/70 px-3 py-1 text-center whitespace-normal">
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${primaryKeywordPolicy === "locked" ? "border-divider bg-surface-subtle text-text-muted" : primaryKeywordPolicy === "reviewable" ? "border-warning/50 bg-warning-soft text-warning" : "border-module-accent/50 bg-selected text-module-accent"}`}
                          title={primaryKeywordPolicy === "reviewable" ? "A URL permanece protegida, mas a principal pode ser revista no Arquiteto após validação." : undefined}
                        >
                          {primaryKeywordPolicyLabel(primaryKeywordPolicy)}
                        </span>
                      </td>

                      {/* Resultados */}
                      <td className="w-[88px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        {item.results_allintitle !== null ? item.results_allintitle : "-"}
                      </td>

                      {/* Volume */}
                      <td className="w-[88px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={confirmedVolumeMeasurement && item.volume_search !== 0 ? "text-context-accent" : undefined}
                            title={confirmedVolumeMeasurement ? "Volume mensal confirmado pelo provedor para a keyword exata." : undefined}
                          >
                            {item.volume_search !== null ? formatMetricInteger(item.volume_search) : "-"}
                          </span>
                          {zeroConfirmed && (
                            <span className="rounded border border-context-accent/50 bg-context-accent/10 px-1 text-[8px] font-bold uppercase tracking-wide text-context-accent" title="Zero mensal explicitamente confirmado pela keyword exata.">
                              0 confirmado
                            </span>
                          )}
                          {item.status !== "publicado" && (
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

                      {/* KGR */}
                      <td className="w-[136px] border-r border-divider/70 px-3 py-1 text-center font-mono">
                        <div className="flex items-center justify-center whitespace-normal leading-snug">
                          {kgrState
                            ? <span className={`${kgrTextBadge} ${kgrState.className}`}>{kgrState.label}</span>
                            : <span className={kgrApproved ? kgrColor : "text-slate-500"}>{kgrApproved ? kgrText : "Pendente"}</span>}
                        </div>
                      </td>

                      {/* Intenção */}
                      <td className="w-[168px] border-r border-divider/70 px-3 py-1 text-center whitespace-normal">
                        <span
                          title={intentLabel}
                          className={`inline-flex max-w-full rounded border px-1.5 py-0.5 text-[9px] font-bold leading-snug ${intentIsPending ? "border-divider bg-surface-subtle text-text-muted" : "border-divider bg-surface-subtle text-foreground/80"}`}
                        >
                          <span className="truncate">{intentLabel}</span>
                        </span>
                      </td>

                      {/* Nicho de mercado - SelecionÃ¡vel */}
                      <td className="w-[168px] border-r border-divider/70 px-3 py-0.5 text-center">
                        <select
                          value={item.analise_semantica?.nicho_override || "Geral"}
                          onChange={(e) => handleUpdateNiche(item.id, e.target.value)}
                          className={`${mineradorTableSelectClass} text-center text-foreground/80`}
                        >
                          <option value="Odontologia">Odontologia</option>
                          <option value="Advocacia">Advocacia</option>
                          <option value="SaÃºde">SaÃºde</option>
                          <option value="EstÃ©tica">EstÃ©tica</option>
                          <option value="Fitness">Fitness</option>
                          <option value="ServiÃ§os">ServiÃ§os</option>
                          <option value="Marketing">Marketing</option>
                          <option value="Geral">Geral</option>
                        </select>
                      </td>

                      {/* Funil */}
                      <td className="w-[80px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <span className="inline-flex min-w-12 justify-center rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-[10px] font-bold text-foreground/80" title={item.analise_semantica?.funnel_review_required === "sim" ? "Conflito entre a proposta lógica e o hint da Extensão; requer revisão humana." : item.analise_semantica?.funnel ? "Funil proposto pela qualificação explícita; ainda não é aprovação humana." : "Hint de funil da Extensão; ainda não é aprovação final."}>
                          {funnelLabelFor(item)}
                        </span>
                      </td>

                      {/* Silo/Categoria (Lista Pertencente) */}
                      <td className="w-[216px] border-r border-divider/70 px-3 py-0.5">
                        <select
                          value={item.lista_id || ""}
                          onChange={(e) => handleUpdateKeywordList(item.id, e.target.value)}
                          disabled={item.status?.toLowerCase() === "publicado"}
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
                      <td className="relative w-[120px] border-r border-divider/70 px-3 py-0.5 text-center">
                        <select
                          value={item.status || "bruto"}
                          onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                          disabled={item.status?.toLowerCase() === "publicado"}
                          className={`w-full cursor-pointer rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-center text-[10px] font-bold focus:border-module-accent focus:outline-none ${
                            item.status?.toLowerCase() === "publicado"
                              ? "text-danger border-danger/50 bg-danger-soft"
                              : item.status?.toLowerCase() === "aprovado"
                              ? "text-success border-success/50 bg-success-soft"
                              : item.status?.toLowerCase() === "rejeitado"
                              ? "text-danger border-danger/50 bg-danger-soft"
                              : "text-text-muted"
                          }`}
                        >
                          <option value="bruto">Bruto</option>
                          <option value="aprovado">Aprovado</option>
                          <option value="rejeitado">Rejeitado</option>
                          <option value="publicado">Publicado</option>
                        </select>
                        <KeywordTableRowResizeHandle rowId={item.id} enabled onStart={rowResize.startResize} />
                      </td>
                    </tr>

                    {/* Acordeom ExpansÃ­vel com AnÃ¡lise SemÃ¢ntica DinÃ¢mica em JSONB */}
                    {isExpanded && (
                      <tr className="border-b border-divider bg-surface">
                        <td id={`keyword-dna-${item.id}`} colSpan={13} className="border-r border-l-2 border-l-module-accent border-divider px-3 py-3">
                          <KeywordDnaPanel
                            keyword={item}
                            visualPosition={index + 1}
                            canonicalUrl={getCanonicalUrl(item) || null}
                            primaryPolicyLabel={primaryKeywordPolicyLabel(primaryKeywordPolicy)}
                            statusUpdating={updating}
                            onWorkflowStatusChange={(status) => handleUpdateStatus(item.id, status)}
                            showProvenance={false}
                          />

                          <div className="mb-3 grid grid-cols-1 gap-2 rounded border border-divider bg-surface-subtle p-2.5 text-[11px] font-sans sm:grid-cols-3">
                            <section className="rounded border border-divider bg-surface p-2">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-module-accent">Métricas</span>
                              <div className="mt-1 text-text-muted">Volume: <strong className="text-foreground">{item.volume_search === 0 ? (zeroConfirmed ? "0 confirmado" : "0 sem confirmação") : item.volume_search !== null ? formatMetricInteger(item.volume_search) : "Pendente"}</strong></div>
                              <div className="text-text-muted">Resultados allintitle: <strong className="text-foreground">{item.results_allintitle !== null ? formatMetricInteger(item.results_allintitle) : "Pendente"}</strong></div>
                              <div className="text-text-muted">Medição: <strong className="text-foreground">{kgrMeasurementLabel(kgrMeasurement)}</strong></div>
                              <div className="text-text-muted">Fonte do volume: <strong className="text-foreground">{item.volume_source || "Pendente"}</strong></div>
                              <div className="text-text-muted">Estado da medição: <strong className={volumeKgrConsistency === "inconsistent" ? "text-danger" : "text-foreground"}>{volumeKgrConsistencyLabel(volumeKgrConsistency)}</strong></div>
                              {volumeMeasurement && <div className="text-text-muted">Última consulta: <strong className="text-foreground">{String(volumeMeasurement.measuredAt || "Pendente")}</strong></div>}
                            </section>
                            <section className="rounded border border-divider bg-surface p-2">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-module-accent">Estratégia KGR · cálculo técnico</span>
                              <div className="mt-1 text-text-muted">{kgrApplicabilityLabel(kgrApplicability)}</div>
                              <div className="text-text-muted">KGR calculado: <strong className="text-foreground">{kgrApplicability === "not_applicable" ? "Não utilizado" : kgrApplicability === "applicable" && volumeKgrConsistency === "inconsistent" ? "Incompatibilidade comprovada" : kgrApplicability === "applicable" && (volumeKgrConsistency === "zero_confirmed" || volumeKgrConsistency === "zero_unconfirmed") ? "Não calculável com volume zero" : kgrApplicability === "applicable" && hasUsableKgrScore(item.kgr_score) ? item.kgr_score.toFixed(3) : "Não utilizado até decisão"}</strong></div>
                              {kgrApplicability === "pending" && kgrMeasurement === "complete" && <div className="text-text-muted">Métricas completas — prontas para decisão KGR</div>}
                            </section>
                            <section className="rounded border border-divider bg-surface p-2">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-module-accent">Decisão humana</span>
                              <div className="mt-1 text-foreground">{kgrApplicabilityLabel(kgrApplicability)}</div>
                              <div className="text-text-muted">{String(item.analise_semantica?.kgr_decidido_por || "Pendente")} · {String(item.analise_semantica?.kgr_decidido_em || "—")}</div>
                            </section>
                          </div>

                          <KeywordDnaProvenance keyword={item} />

                          {item.status?.toLowerCase() === "publicado" && (
                            <section className="mb-4 rounded border border-danger/50 bg-danger-soft p-3 text-[11px] font-sans">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-danger">Identidade publicada</span>
                              <div className="mt-2 grid grid-cols-1 gap-2 text-text-muted sm:grid-cols-2 lg:grid-cols-4">
                                <span>URL: <strong className="text-foreground">fixa</strong></span>
                                <span>Slug: <strong className="text-foreground">fixo</strong></span>
                                <span>Canonical: <strong className="text-foreground">fixo</strong></span>
                                <span>Keyword principal: <strong className="text-foreground">{primaryKeywordPolicyLabel(primaryKeywordPolicy).replace("Principal ", "").toLowerCase()}</strong></span>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <label className="text-text-muted" htmlFor={`primary-policy-${item.id}`}>Política da principal</label>
                                <select
                                  id={`primary-policy-${item.id}`}
                                  value={primaryKeywordPolicy}
                                  disabled={updating}
                                  onChange={(event) => void handlePrimaryKeywordPolicyChange(item, event.target.value as Extract<PrimaryKeywordPolicy, "locked" | "reviewable">)}
                                  className="rounded border border-divider bg-surface px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus:border-context-accent disabled:opacity-50"
                                >
                                  <option value="locked">Travada</option>
                                  <option value="reviewable">Revisável</option>
                                </select>
                                  {primaryKeywordPolicy === "reviewable" && <span className="text-warning">A URL permanece protegida; revisão ocorre somente no Arquiteto com validação humana.</span>}
                              </div>
                            </section>
                          )}

                          {siteEvidenceFor(item) && (
                            <div className="mb-4 grid grid-cols-1 gap-2 rounded border border-success/35 bg-success-soft p-3 text-[11px] font-sans sm:grid-cols-2 lg:grid-cols-3">
                              <span className="text-success">Origem: Site/Sitemap</span>
                              <span className="text-text-muted">Relação: <strong className="text-foreground">{siteRelationLabel(siteEvidenceFor(item)?.keywordUrlRelation)}</strong></span>
                              <span className="text-text-muted">URL técnica: <strong className="text-foreground">{siteEvidenceFor(item)?.urlSituation || "Não verificada"}</strong></span>
                              <span className="text-text-muted">Publicação: <strong className="text-foreground">{sitePublicationLabel(siteEvidenceFor(item)?.publicationStatus)}</strong></span>
                              <span className="text-text-muted">Arquitetura: <strong className="text-foreground">{siteArchitectureLabel(siteEvidenceFor(item)?.architectureStatus)}</strong></span>
                              <span className="text-text-muted">Silo existente: <strong className="text-foreground">{siteEvidenceFor(item)?.siloName || siteEvidenceFor(item)?.siloId || "Não consolidado"}</strong></span>
                              {siteEvidenceFor(item)?.resolvedUrl && <a href={siteEvidenceFor(item)?.resolvedUrl || "#"} target="_blank" rel="noopener noreferrer" className="truncate text-context-accent hover:text-foreground">URL resolvida: {siteEvidenceFor(item)?.resolvedUrl}</a>}
                              {siteEvidenceFor(item)?.declaredCanonicalUrl && <a href={siteEvidenceFor(item)?.declaredCanonicalUrl || "#"} target="_blank" rel="noopener noreferrer" className="truncate text-context-accent hover:text-foreground">Canonical: {siteEvidenceFor(item)?.declaredCanonicalUrl}</a>}
                              {siteEvidenceFor(item)?.sourceUrl && <a href={siteEvidenceFor(item)?.sourceUrl} target="_blank" rel="noopener noreferrer" className="truncate text-context-accent hover:text-foreground">URL de origem: {siteEvidenceFor(item)?.sourceUrl}</a>}
                            </div>
                          )}

                          {item.analise_semantica && Object.keys(item.analise_semantica).length > 0 ? (
                            <details className="rounded border border-divider bg-surface-subtle text-[11px] font-sans whitespace-normal">
                              <summary className="cursor-pointer px-3 py-2 font-semibold text-text-muted hover:text-foreground">Outros campos do KeywordDNA</summary>
                              <div className="grid grid-cols-1 gap-2 border-t border-divider p-3 sm:grid-cols-2 md:grid-cols-3">
                                {Object.entries(item.analise_semantica).filter(([key]) => !["dna_campos_logicos", "site_origin", "site_origins", "kgr_aplicabilidade", "kgr_decisao", "kgr_decisao_origem", "kgr_decidido_por", "kgr_decidido_em", "kgr_decisao_versao", "kgr_decisao_historico", "kgr_justificativa"].includes(key)).map(([key, value]) => {
                                  const label = key.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
                                  const readableValue = Array.isArray(value) ? value.map(String).join(", ") : value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => `${nestedKey}: ${String(nestedValue)}`).join(" · ") : String(value || "Não informado");
                                  return <div key={key} className="rounded border border-divider bg-surface p-2"><span className="block text-[10px] font-bold uppercase tracking-wider text-context-accent">{label}</span><p className="mt-1 break-words leading-relaxed text-foreground/80">{readableValue}</p></div>;
                                })}
                              </div>
                            </details>
                          ) : <p className="py-4 text-center text-xs text-text-muted">Nenhuma análise semântica disponível para esta palavra-chave.</p>}
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
        <KeywordTableBulkBarShell>
          
          <div className="flex shrink-0 items-center gap-1.5 rounded border border-module-accent/50 bg-selected px-1.5 py-1 text-xs font-bold text-foreground sm:px-2.5 sm:text-sm">
            <span>{selectedIds.size} selecionada{selectedIds.size === 1 ? "" : "s"}{hiddenSelectedCount > 0 ? ` · ${visibleSelectedCount} visíveis` : ""}</span>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2">
            
            {/* Mover para Categoria/Silo */}
              <div className="hidden shrink-0 items-center gap-1.5 rounded border border-divider bg-surface-subtle px-2.5 py-1 sm:flex">
               <span className="text-[11px] font-semibold text-text-muted">Mover para Silo:</span>
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="max-w-[120px] cursor-pointer truncate bg-transparent pr-1 text-[11px] font-semibold text-foreground/80 focus:outline-none"
              >
                {lists.map(list => (
                  <option key={list.id} value={list.id}>{list.nome}</option>
                ))}
              </select>
              <button
                onClick={handleBatchMove}
                disabled={updating || !targetListId}
                className="rounded p-1 text-context-accent transition-colors hover:bg-surface-elevated"
                title="Mover Palavras"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={handleCheckWithSite}
              disabled={siteSyncLoading || siteSyncPersisting || loading || !selectedBrandId || !targetListId}
              className="hidden shrink-0 items-center gap-1 rounded border border-emerald-900/50 bg-emerald-950/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition-colors hover:border-emerald-700 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 sm:flex"
              title="Conferir somente as keywords selecionadas com o Site/Sitemap">
              {siteSyncLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span>{siteSyncLoading ? "Conferindo..." : "Conferir com o site"}</span>
            </button>

            {/* Qualificação principal: atua somente sobre a seleção atual. */}
            <button
              onClick={handleQualifySelected}
              disabled={updating || queueProcessing || dnaProcessing || loading || selectedIds.size === 0}
              className="flex shrink-0 items-center gap-1 rounded bg-action-accent px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-action-accent/85 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5"
              title={selectedIds.size === 0 ? "Selecione pelo menos uma keyword." : "Classifica intenção, funil, nicho e viés e atualiza o KeywordDNA para revisão."}
            >
              {dnaProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
              <span className="hidden sm:inline">Qualificar selecionadas</span>
            </button>

            <button
              type="button"
              onClick={handleBatchProcessIntentNiche}
              disabled={updating || queueProcessing || dnaProcessing}
              className="flex shrink-0 items-center gap-1 rounded border border-context-accent/50 bg-surface-subtle px-2 py-1 text-[11px] font-semibold text-context-accent transition-colors hover:bg-context-accent/10 disabled:cursor-wait disabled:opacity-50 sm:px-2.5"
              title="Processar intenção e nicho das keywords selecionadas com IA e revisar o KeywordDNA."
              aria-label="Processar Nicho e Intenção com IA"
            >
              {queueProcessing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Brain className="h-3 w-3" aria-hidden="true" />}
              <span className="hidden sm:inline">{queueProcessing ? `Processando (${queueProgress}/${selectedIds.size})...` : "Processar Nicho & Intenção"}</span>
            </button>

            <button
              type="button"
              onClick={handleBatchAllintitle}
              disabled={updating || volumeMeasuring || allintitleMeasuring || selectedIds.size === 0}
              title="Executa a medição allintitle server-side somente nas keywords selecionadas."
              className="flex shrink-0 items-center gap-1 rounded border border-cyan-800/70 bg-cyan-950/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition-colors hover:border-cyan-700 disabled:cursor-wait disabled:opacity-50"
            >
              {allintitleMeasuring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              <span className="hidden sm:inline">{allintitleMeasuring ? "Medindo resultados..." : allSelectedHaveAllintitle ? "Atualizar resultados" : someSelectedHaveAllintitle ? "Medir/Atualizar resultados" : "Medir resultados"}</span>
            </button>
            <button
              onClick={handleBatchQualify}
              disabled={updating || volumeMeasuring}
              title="Consulta e persiste as métricas de volume pelo Google Ads."
              className="flex shrink-0 items-center gap-1 rounded border border-success/40 bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-success transition-all hover:bg-surface-elevated"
            >
              <Play className="h-3 w-3 text-emerald-400" />
              <span className="hidden sm:inline">{volumeMeasuring ? "Consultando Google Ads..." : "Atualizar métricas"}</span>
            </button>

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
              className="hidden shrink-0 rounded border border-module-accent/50 bg-selected px-2.5 py-1 text-[11px] font-semibold text-foreground outline-none hover:border-module-accent disabled:opacity-50 sm:inline-block"
              title="Registrar decisão humana para as keywords selecionadas"
            >
              <option value="">Decisão KGR</option>
              <option value="applicable">Aprovar como KGR</option>
              <option value="not_applicable">Marcar não aplicável</option>
            </select>

            <div ref={moreActionsRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMoreActionsOpen(current => !current)}
                className="flex items-center gap-1 rounded border border-divider px-2.5 py-1 text-[11px] font-semibold text-foreground/80 transition-colors hover:border-module-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent"
                aria-expanded={moreActionsOpen}
                aria-haspopup="menu"
                aria-controls="minerador-more-actions-menu"
              >
                <span className="hidden sm:inline">Mais ações</span>
                <span className="sm:hidden">Mais</span>
              </button>
              {moreActionsOpen && <div id="minerador-more-actions-menu" role="menu" className="fixed bottom-12 right-2 z-50 flex min-w-56 flex-col gap-1 rounded border border-divider bg-surface-elevated p-2 shadow-lg">
                <div className="flex items-center gap-1 rounded px-2 py-1 sm:hidden">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text-muted">Mover para Silo</span>
                  <select value={targetListId} onChange={(event) => { setTargetListId(event.target.value); setMoreActionsOpen(false); }} className="max-w-24 min-w-0 truncate bg-transparent text-xs font-semibold text-foreground focus:outline-none" aria-label="Selecionar silo para mover keywords">
                    {lists.map(list => <option key={list.id} value={list.id}>{list.nome}</option>)}
                  </select>
                  <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleBatchMove(); }} disabled={updating || !targetListId} className="rounded p-1 text-context-accent hover:bg-surface-elevated disabled:opacity-50" title="Mover keywords para o silo selecionado"><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </div>
                <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleCheckWithSite(); }} disabled={siteSyncLoading || siteSyncPersisting || loading || !selectedBrandId || !targetListId} className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-context-accent transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 sm:hidden" title="Conferir somente as keywords selecionadas com o Site/Sitemap"><RefreshCw className="h-4 w-4" aria-hidden="true" />Conferir com o site</button>
                <select defaultValue="" disabled={updating} aria-label="Decisão KGR" onChange={(event) => { const decision = event.target.value; event.currentTarget.value = ""; setMoreActionsOpen(false); if (decision === "applicable") void handleBatchApprove(); if (decision === "not_applicable") void handleBatchMarkKgrNotApplicable(); }} className="rounded border border-module-accent/50 bg-selected px-3 py-2 text-left text-sm font-semibold text-foreground outline-none sm:hidden" title="Registrar decisão humana para as keywords selecionadas"><option value="">Decisão KGR</option><option value="applicable">Aprovar como KGR</option><option value="not_applicable">Marcar não aplicável</option></select>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMoreActionsOpen(false); void handleBatchPublish(); }}
                  disabled={updating || queueProcessing}
                  className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>Marcar como publicado</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMoreActionsOpen(false); void handleBatchAnalyze(); }}
                  disabled={updating || queueProcessing || dnaProcessing}
                  className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Analisa sinais comportamentais adicionais da keyword."
                >
                  {queueProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                  <span>{queueProcessing ? `Analisando (${queueProgress}/${selectedIds.size})...` : "Análise semântica"}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleBatchDelete(false); }} disabled={updating || queueProcessing} className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-red-400 transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir</button>
              </div>}
            </div>

            {/* Excluir */}
            <button
              onClick={() => void handleBatchDelete(false)}
              disabled={updating || queueProcessing}
              className="hidden shrink-0 items-center gap-1 rounded border border-red-900/30 bg-red-950/20 px-2.5 py-1 text-[11px] font-semibold text-red-400 transition-all hover:bg-red-900/30 disabled:opacity-50 sm:flex"
            >
              <Trash2 className="h-3 w-3" />
              <span>Excluir</span>
            </button>

            {qualificationResults.length > 0 && (
              <details open className="basis-full rounded border border-divider bg-surface-subtle p-2">
                <summary className="cursor-pointer text-sm font-semibold text-slate-300">Resultado da qualificação ({qualificationResults.length})</summary>
                <div className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                  {qualificationResults.map(result => (
                    <div key={result.id} className="rounded border border-slate-800/70 px-2.5 py-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold" title={result.keyword}>{result.keyword}</span>
                        <span className={result.status === "falha" ? "shrink-0 text-rose-300" : result.status === "conflito" ? "shrink-0 text-amber-300" : result.status === "preservada" ? "shrink-0 text-slate-300" : "shrink-0 text-emerald-300"}>{result.status}</span>
                      </div>
                      <p className="mt-1 text-slate-400">Intenção: <strong className="text-slate-200">{result.intent}</strong> · Funil: <strong className="text-slate-200">{result.funnel}</strong></p>
                      <p className="text-slate-400">Nicho: <strong className="text-slate-200">{result.niche}</strong> · Viés: <strong className="text-slate-200">{result.bias}</strong> · Confiança: <strong className="text-slate-200">{result.confidence}</strong></p>
                    </div>
                  ))}
                </div>
              </details>
            )}

          </div>
        </KeywordTableBulkBarShell>
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
