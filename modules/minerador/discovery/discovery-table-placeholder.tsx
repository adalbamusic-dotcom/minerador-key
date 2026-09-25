"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, LoaderCircle, Play, Search, Send, X } from "lucide-react";
import { useNoticeBridge, useNoticeCenter } from "@/components/global-notice-center";
import { InfoHint } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";
import { AnchoredPopover } from "@/components/editorial/anchored-popover";
import { candidateMatchesDiscoveryOrganization, discoverySituation, EMPTY_DISCOVERY_ORGANIZATION, sortDiscoveryCandidates, type DiscoveryOrganizationFilters, type DiscoverySort, type DiscoverySortDirection, type DiscoverySortField } from "@/lib/minerador/discovery-organization";
import { DEFAULT_DISCOVERY_SEO_FILTERS, DISCOVERY_SERP_GATE_MESSAGE, candidateMatchesDiscoverySeoFilters, countDiscoveryCandidatesHiddenBySeoFilters, isDiscoverySerpMeasurementEnabled, type DiscoverySeoFilters } from "@/lib/minerador/discovery-seo-filters";
import { classifyDiscoveryRelation, type DiscoveryCandidate } from "@/lib/minerador/discovery-keywords";
import { candidateDiscoveryPerspective, candidateMatchesDiscoveryPerspective, discoveryPerspectiveLabel, sortDiscoveryCandidatesByPerspective, type DiscoveryPerspectiveFilter } from "@/lib/minerador/discovery-perspective";
import { candidatesAnsweredWithoutVolume, discoveryCompetitionCell, discoveryCpcCell, discoveryResultsCell, discoveryVolumeCell, reconcileDiscoverySelection, sameDiscoveryIdOrder, type DiscoveryCellDisplay } from "@/lib/minerador/discovery-table-cells";
import { DiscoveryImportResponseSchema } from "@/lib/minerador/discovery-import";
import { isTenantId } from "@/lib/tenant-routing";
import { applyManualOrder, type KeywordTableOrderMode } from "@/lib/minerador/manual-order";
import type { DiscoveryCandidateCurrentMetrics } from "@/lib/minerador/discovery-current-metrics";
import { KeywordTableBulkBarShell } from "../keyword-table/keyword-table-bulk-bar-shell";
import { KeywordTableEmptyState } from "../keyword-table/keyword-table-empty-state";
import { KeywordTableHeader } from "../keyword-table/keyword-table-header";
import { KeywordSelectionCell, KeywordSelectionHeader } from "../keyword-table/keyword-table-selection";
import { KeywordTableShell } from "../keyword-table/keyword-table-shell";
import { KeywordTableOrganizeButton } from "../keyword-table/keyword-table-organize-button";
import { useKeywordTableSelection } from "../keyword-table/use-keyword-table-selection";
import { KeywordTableDragHandle, KeywordTableOrderModeSelect } from "../keyword-table/keyword-table-order";
import { useKeywordTableOrder } from "../keyword-table/use-keyword-table-order";
import { KeywordTableColumnResizeHandle, KeywordTableRowResizeHandle, useKeywordTableColumnResize, useKeywordTableRowResize, type KeywordTableResizeStartEvent } from "../keyword-table/keyword-table-resize";
import { MineradorProcessAction } from "../minerador-process-action";
import { DiscoveryEmptyState } from "./discovery-empty-state";
import type { DiscoveryCustomerFocus, DiscoveryFunnel, DiscoveryIntent, DiscoveryMode } from "./discovery-types";

const columns: Array<{ label: string; field: DiscoverySortField }> = [
  { label: "Keyword", field: "keyword" },
  { label: "Relação", field: "relation" },
  { label: "Resultados", field: "results" },
  { label: "Volume", field: "volume" },
  { label: "CPC", field: "cpc" },
  { label: "Concorrência Ads", field: "competition" },
  { label: "Intenção preliminar", field: "intent" },
  { label: "Funil preliminar", field: "funnel" },
  { label: "Situação", field: "situation" },
];
const perspectiveColumn = { label: "Perspectiva", field: "perspective" as DiscoverySortField };
const discoveryColumnHints: Partial<Record<DiscoverySortField, { title: string; description: string; glyph?: boolean }>> = {
  results: {
    title: "Concorrência encontrada para a busca",
    description: "Mostra a quantidade medida pelo processo de concorrência orgânica usada para avaliar a candidata.",
    glyph: true,
  },
  volume: {
    title: "Demanda mensal da candidata",
    description: "Demanda mensal medida para a candidata no contexto configurado.",
  },
  cpc: {
    title: "Valor comercial do clique",
    description: "Custo médio por clique informado pelo Google Ads; ajuda a perceber valor e competição comercial.",
  },
  intent: {
    title: "Intenção preliminar da descoberta",
    description: "Leitura inicial do objetivo provável da busca. A interpretação canônica acontece depois no Processador.",
  },
  funnel: {
    title: "Funil preliminar da descoberta",
    description: "Etapa provável da jornada indicada para a pesquisa. É contexto inicial, não a decisão final do KeywordDNA.",
  },
};

/*
 * LARGURAS DA PLANILHA (mesma regra da planilha do Processador).
 *
 * A tabela usa o layout automático: cada coluna auxiliar encolhe até o próprio
 * conteúdo (largura 1px + nowrap) e a coluna Keyword fica sem largura, então
 * recebe todo o espaço que sobra e nunca é cortada. Se o conteúdo passar da
 * área, a planilha rola na horizontal. Os valores abaixo só entram quando o
 * humano arrasta a borda de uma coluna.
 */
const discoveryColumnWidths = {
  drag: 32, selection: 34, keyword: 320, relation: 96, results: 104, volume: 96,
  cpc: 88, competition: 128, intent: 136, funnel: 104, situation: 128, perspective: 128,
};
const discoveryColumnConstraints = {
  drag: { min: 28, max: 48 }, selection: { min: 30, max: 56 }, keyword: { min: 220, max: 1600 }, relation: { min: 72, max: 260 },
  results: { min: 88, max: 260 }, volume: { min: 80, max: 260 }, cpc: { min: 72, max: 240 },
  competition: { min: 96, max: 320 }, intent: { min: 96, max: 360 }, funnel: { min: 80, max: 240 }, situation: { min: 96, max: 320 }, perspective: { min: 96, max: 280 },
};
const fixedDiscoveryColumns = new Set(["drag", "selection"]);
const auxiliaryCell = "border-r border-divider/70 px-2 py-1 whitespace-nowrap";
const keywordCell = "border-r border-divider/70 px-3 py-1 font-medium text-keyword select-text whitespace-normal break-words";
const sourceBadge = "inline-flex shrink-0 items-center rounded border border-border bg-surface-subtle px-1.5 py-0.5 text-[11px] font-medium leading-none text-text-muted";
const control = "h-9 rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors scheme-dark in-[.light]:scheme-light in-data-[theme=light]:scheme-light focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40";
const optionClass = "bg-surface-elevated text-foreground";
const cellToneClass: Record<DiscoveryCellDisplay["tone"], string> = { value: "", processed_empty: "text-text-muted", not_processed: "", error: "font-medium text-warning", pending: "text-text-muted" };

const relationText = (value: "exact" | "phrase" | "broad" | "related") => value === "exact" ? "Exata" : value === "phrase" ? "Frase" : value === "broad" ? "Ampla" : "Relacionada";
const situationText = (value: ReturnType<typeof discoverySituation>) => value === "new" ? "Nova" : value === "existing" ? "Já existe no Processador" : value === "imported" ? "Enviada ao Processador" : value === "unavailable" ? "Sem volume oficial" : "Métrica parcial";
const sourceText = (value: string | undefined) => value === "manual" ? "Manual" : value === "csv" ? "CSV" : "Google Ads";

type DiscoveryCandidatePatch = Omit<Partial<DiscoveryCandidate>, "currentMetrics"> & { currentMetrics?: Partial<DiscoveryCandidateCurrentMetrics> };
type ImportFailureDetail = { candidateId: string; keyword: string; source: string; errorCode: string; reason: string };
type InlineTableNotice = string | null;

export function DiscoveryTablePlaceholder({ candidates = [], seoFilters = DEFAULT_DISCOVERY_SEO_FILTERS, intent, funnel, discoveryMode = "keyword", discoveryFocus = "all_customer", seed = "", brandRef, onCandidatesPatched, onSerpMeasured }: { candidates?: DiscoveryCandidate[]; seoFilters?: DiscoverySeoFilters; intent?: DiscoveryIntent; funnel?: DiscoveryFunnel; discoveryMode?: DiscoveryMode; discoveryFocus?: DiscoveryCustomerFocus; seed?: string; brandRef: string; onCandidatesPatched?: (candidateId: string, patch: DiscoveryCandidatePatch) => void; onSerpMeasured?: () => boolean }) {
  const { publishNotice } = useNoticeCenter();
  // A SERP (DataForSEO) só é liberada quando Resultado ou KD sai de "Sem medição".
  const serpMeasurementEnabled = isDiscoverySerpMeasurementEnabled(seoFilters);
  const customerDiscovery = discoveryMode === "customer_discovery";
  const [search, setSearch] = useState("");
  const [perspectiveFilter, setPerspectiveFilter] = useState<DiscoveryPerspectiveFilter>("all");
  const [filters, setFilters] = useState<DiscoveryOrganizationFilters>(EMPTY_DISCOVERY_ORGANIZATION);
  const [primarySort, setPrimarySort] = useState<DiscoverySort | null>(null);
  const [secondarySort, setSecondarySort] = useState<DiscoverySort | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [orderMode, setOrderMode] = useState<KeywordTableOrderMode>("auto");
  const organizeRef = useRef<HTMLButtonElement>(null);
  const [importing, setImporting] = useState(false);
  const [volumeMeasuring, setVolumeMeasuring] = useState(false);
  const [allintitleMeasuring, setAllintitleMeasuring] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<InlineTableNotice>(null);
  useNoticeBridge({ notice: inlineNotice, module: "minerador", area: "Tabela de descoberta", title: "Minerador · Descoberta", fallbackSeverity: "ERROR" });
  const [importedById, setImportedById] = useState<Record<string, "created" | "already_existing" | "failed">>({});
  const [metricPatches, setMetricPatches] = useState<Record<string, DiscoveryCandidatePatch>>({});
  // Candidatas pedidas em "Atualizar métricas" que voltaram sem volume (fora
  // das projections): passaram pelo processo nesta sessão. Só apresentação.
  const [volumeAnsweredIds, setVolumeAnsweredIds] = useState<ReadonlySet<string>>(() => new Set());
  const baseIds = useMemo(() => candidates.map(candidate => candidate.candidateId), [candidates]);
  const candidateOrder = useKeywordTableOrder(baseIds);
  const columnResize = useKeywordTableColumnResize(discoveryColumnWidths, discoveryColumnConstraints);
  const tableRef = useRef<HTMLElement | null>(null);
  const rowResize = useKeywordTableRowResize(36, { min: 32, max: 112 });
  /*
   * A SELEÇÃO SEGUE A ORDEM DA TELA.
   *
   * O hook recebia `baseIds`, a ordem crua das candidatas: "selecionar
   * visíveis" marcava também as linhas escondidas por busca, filtro SEO ou
   * perspectiva (e "Enviar selecionadas" as importava), e o Shift+clique e o
   * arraste pintavam o intervalo da ordem crua, não da ordenada. Agora o hook
   * recebe as linhas na ordem exibida.
   */
  const [selectionScopeIds, setSelectionScopeIds] = useState<string[]>([]);
  const selection = useKeywordTableSelection(selectionScopeIds);
  const reconciledSelectedIds = reconcileDiscoverySelection(selection.selectedIds, baseIds);
  if (reconciledSelectedIds !== selection.selectedIds) selection.setSelectedIds(reconciledSelectedIds);
  const tableColumns = useMemo(() => customerDiscovery ? [columns[0], perspectiveColumn, ...columns.slice(1)] : columns, [customerDiscovery]);
  const tableColumnIds = useMemo(() => ["drag", "selection", ...tableColumns.map(column => column.field)], [tableColumns]);
  const columnWidth = (columnId: string) => {
    if (fixedDiscoveryColumns.has(columnId) || columnResize.resizedColumnIds.includes(columnId)) return columnResize.widths[columnId as keyof typeof discoveryColumnWidths];
    return columnId === "keyword" ? undefined : 1;
  };
  const patchCandidate = useCallback((candidateId: string, patch: DiscoveryCandidatePatch) => {
    setMetricPatches(current => ({ ...current, [candidateId]: { ...current[candidateId], ...patch, currentMetrics: { ...current[candidateId]?.currentMetrics, ...patch.currentMetrics } } }));
    onCandidatesPatched?.(candidateId, patch);
  }, [onCandidatesPatched]);
  const candidatesWithImportState = useMemo(() => candidates.map(candidate => {
    const metricPatch = metricPatches[candidate.candidateId];
    const merged: DiscoveryCandidate = metricPatch ? { ...candidate, ...metricPatch, currentMetrics: { ...candidate.currentMetrics, ...metricPatch.currentMetrics } as DiscoveryCandidateCurrentMetrics } : candidate;
    return importedById[candidate.candidateId] ? { ...merged, importStatus: importedById[candidate.candidateId] === "failed" ? "import_failed" as const : "imported" as const } : merged;
  }), [candidates, importedById, metricPatches]);
  const seoHiddenCount = useMemo(() => countDiscoveryCandidatesHiddenBySeoFilters(candidatesWithImportState, seoFilters), [candidatesWithImportState, seoFilters]);
  const organizedCandidates = useMemo(() => {
    const filtered = candidatesWithImportState
      .filter(candidate => candidateMatchesDiscoverySeoFilters(candidate, seoFilters))
      .filter(candidate => !customerDiscovery || candidateMatchesDiscoveryPerspective(candidate, seed, discoveryFocus, perspectiveFilter))
      .filter(candidate => candidateMatchesDiscoveryOrganization(candidate, seed, intent || "Não definida", funnel || "Não definido", selection.selectedIds, search, filters));
    if (orderMode === "manual") return applyManualOrder(filtered, candidateOrder.manualOrderIds, candidate => candidate.candidateId);
    if (primarySort || secondarySort) return sortDiscoveryCandidates(filtered, seed, intent || "Não definida", funnel || "Não definido", primarySort, secondarySort, discoveryFocus);
    return customerDiscovery ? sortDiscoveryCandidatesByPerspective(filtered, seed, discoveryFocus) : filtered;
  }, [candidatesWithImportState, seoFilters, customerDiscovery, discoveryFocus, perspectiveFilter, seed, intent, funnel, selection.selectedIds, search, filters, orderMode, candidateOrder.manualOrderIds, primarySort, secondarySort]);
  const visibleIds = useMemo(() => organizedCandidates.map(candidate => candidate.candidateId), [organizedCandidates]);
  if (!sameDiscoveryIdOrder(selectionScopeIds, visibleIds)) setSelectionScopeIds(visibleIds);
  const visibleSelected = visibleIds.filter(id => selection.selectedIds.has(id)).length;
  const selectedCandidateIds = useMemo(() => [...selection.selectedIds], [selection.selectedIds]);
  const selectedCandidates = candidatesWithImportState.filter(candidate => selection.selectedIds.has(candidate.candidateId));
  const selectedExistingCount = selectedCandidates.filter(candidate => Boolean(candidate.existingKeywordId || candidate.importStatus === "already_exists" || candidate.importStatus === "imported")).length;
  const selectedNewCount = selectedCandidates.length - selectedExistingCount;
  const selectedCountLabel = selectedCandidateIds.length === 1 ? "selecionada" : "selecionadas";
  const selectedNewCountLabel = selectedNewCount === 1 ? "nova" : "novas";
  const selectedExistingCountLabel = selectedExistingCount === 1 ? "existente" : "existentes";
  const cycleSort = (field: DiscoverySortField) => { setOrderMode("auto"); setPrimarySort(current => current?.field !== field ? { field, direction: "asc" } : current.direction === "asc" ? { field, direction: "desc" } : null); };
  const clearOrganization = () => { setSearch(""); setFilters(EMPTY_DISCOVERY_ORGANIZATION); setPrimarySort(null); setSecondarySort(null); setOrderMode("auto"); setOrganizeOpen(false); };
  const handleCandidateRowDragOver = (event: DragEvent<HTMLTableRowElement>, targetId: string) => {
    if (orderMode !== "manual") return;
    const sourceId = event.dataTransfer.getData("text/plain") || candidateOrder.draggingId;
    if (!sourceId || sourceId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    candidateOrder.moveBefore(sourceId, targetId);
  };
  const handleCandidateRowDrop = (event: DragEvent<HTMLTableRowElement>) => { if (orderMode === "manual") event.preventDefault(); };

  const measureVolume = async () => {
    if (volumeMeasuring || !selectedCandidateIds.length) return;
    const brandId = brandRef.split("--").at(-1)?.trim() || "";
    if (!isTenantId(brandId)) { setInlineNotice("A atualização não pôde ser iniciada. Sua seleção foi preservada."); return; }
    setVolumeMeasuring(true);
    setInlineNotice(null);
    publishNotice({ severity: "PENDING", title: "Atualização de métricas", message: `Atualizando Google Ads para ${selectedCandidateIds.length} candidata(s)…`, source: "workflow" });
    try {
      const requestedIds = [...selectedCandidateIds];
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/google-ads/metricas-keywords`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationRequestId: crypto.randomUUID(), candidateIds: requestedIds }) });
      const payload = await response.json() as { success?: boolean; message?: string; projections?: Array<{ keywordId?: string; volumeSearch?: number | null; measuredAt?: string }> };
      if (!response.ok || payload.success !== true) throw new Error(payload.message || "As métricas Google Ads não foram atualizadas.");
      // `metricsMeasuredAt` marca que a consulta rodou: volume vazio passa a "0" apagado, e o dado continua null.
      for (const item of payload.projections || []) if (item.keywordId) patchCandidate(item.keywordId, { averageMonthlySearches: item.volumeSearch ?? null, currentMetrics: { averageMonthlySearches: item.volumeSearch ?? null, metricsMeasuredAt: item.measuredAt || new Date().toISOString() } });
      // A rota pula a candidata sem média oficial e a que o Google Ads não
      // devolve: fora das projections, ela passou pelo processo sem dado.
      const answeredEmpty = candidatesAnsweredWithoutVolume(requestedIds, payload.projections);
      if (answeredEmpty.length > 0) setVolumeAnsweredIds(current => new Set([...current, ...answeredEmpty]));
      publishNotice({ severity: "SUCCESS", title: "Métricas atualizadas", message: "As métricas Google Ads foram atualizadas nas candidatas selecionadas.", source: "persistence", confirmed: true });
    } catch (error) {
      publishNotice({ severity: "ERROR", title: "Atualização de métricas", message: error instanceof Error ? error.message : "As métricas Google Ads não foram atualizadas.", source: "persistence", details: process.env.NODE_ENV !== "production" && error instanceof Error ? error.message : undefined });
    } finally { setVolumeMeasuring(false); }
  };

  const measureAllintitle = async () => {
    if (!serpMeasurementEnabled) {
      publishNotice({ severity: "WARNING", title: "Medição SEO", message: DISCOVERY_SERP_GATE_MESSAGE, source: "workflow" });
      return;
    }
    if (allintitleMeasuring || !selectedCandidateIds.length) return;
    const brandId = brandRef.split("--").at(-1)?.trim() || "";
    if (!isTenantId(brandId)) { setInlineNotice("A medição não pôde ser iniciada. Sua seleção foi preservada."); return; }
    setAllintitleMeasuring(true);
    setInlineNotice(null);
    const operationRequestId = crypto.randomUUID();
    publishNotice({ severity: "PENDING", title: "Medição SEO", message: `Medindo Resultado e KD para ${selectedCandidateIds.length} candidata(s)…`, source: "workflow" });
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/dataforseo/allintitle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationRequestId, candidateIds: selectedCandidateIds }) });
      const payload = await response.json() as { success?: boolean; message?: string; projections?: Array<{ targetId?: string; candidateId?: string | null; resultsAllintitle?: number; measuredAt?: string; keywordDifficulty?: number | null; keywordOverview?: { measuredAt?: string } | null }> };
      if (!response.ok || payload.success !== true) throw new Error(payload.message || "A medição SEO não foi concluída.");
      let measuredCount = 0;
      for (const item of payload.projections || []) {
        const candidateId = item.candidateId || item.targetId;
        if (!candidateId || typeof item.resultsAllintitle !== "number") continue;
        measuredCount += 1;
        patchCandidate(candidateId, { currentMetrics: { resultsAllintitle: item.resultsAllintitle, allintitleStatus: "measured", allintitleMeasuredAt: item.measuredAt || null, allintitleProvider: "dataforseo", allintitleExecutor: "minerador_server", allintitleErrorCode: null, allintitleErrorMessage: null, keywordDifficulty: typeof item.keywordDifficulty === "number" ? item.keywordDifficulty : null, keywordDifficultyMeasuredAt: item.keywordOverview?.measuredAt || item.measuredAt || null, keywordDifficultyProvider: "dataforseo", keywordDifficultyOperationRequestId: operationRequestId } });
      }
      const filtersRevealed = measuredCount > 0 && onSerpMeasured?.() === true;
      publishNotice({ severity: "SUCCESS", title: "Medição SEO concluída", message: payload.message || "Resultado e KD atualizados nas candidatas selecionadas.", details: filtersRevealed ? "Filtros em Sem medição passaram para Todos para manter as candidatas medidas visíveis." : undefined, source: "persistence", confirmed: true });
    } catch (error) {
      publishNotice({ severity: "ERROR", title: "Medição SEO", message: error instanceof Error ? error.message : "A medição SEO não foi concluída.", source: "persistence", details: process.env.NODE_ENV !== "production" && error instanceof Error ? error.message : undefined });
    } finally { setAllintitleMeasuring(false); }
  };

  const importSelected = async () => {
    if (importing) return;
    if (!selectedCandidateIds.length) { setInlineNotice("Selecione pelo menos uma candidata para importar."); return; }
    const selectedIdSet = new Set(selectedCandidateIds);
    const candidatesForImport = candidatesWithImportState.filter(candidate => selectedIdSet.has(candidate.candidateId));
    if (candidatesForImport.length !== selectedCandidateIds.length) {
      setInlineNotice("A importação não pôde ser iniciada. Sua seleção foi preservada.");
      if (process.env.NODE_ENV !== "production") console.error("[minerador.discovery.import] seleção técnica não reconciliada", { selectedCount: selectedCandidateIds.length, availableCount: candidatesForImport.length, missingCount: selectedCandidateIds.length - candidatesForImport.length });
      return;
    }
    const brandId = brandRef.split("--").at(-1)?.trim() || "";
    if (!isTenantId(brandId)) {
      setInlineNotice("A importação não pôde ser iniciada. Sua seleção foi preservada.");
      if (process.env.NODE_ENV !== "production") console.error("[minerador.discovery.import] brandRef sem tenantId válido");
      return;
    }
    setImporting(true);
    setInlineNotice(null);
    publishNotice({ severity: "PENDING", title: "Importação para o Processador", message: `Enviando ${selectedCandidateIds.length} candidata(s)…`, source: "workflow" });
    let apiRequestStarted = false;
    try {
      const importRequestId = crypto.randomUUID();
      apiRequestStarted = true;
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/discovery/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importRequestId, candidateIds: selectedCandidateIds }) });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const body = payload && typeof payload === "object" ? payload as { message?: unknown; stage?: unknown; diagnostic?: { databaseMessage?: unknown } } : {};
        const message = typeof body.message === "string" && body.message.trim() ? body.message : "Não foi possível enviar as candidatas ao Processador.";
        const databaseMessage = typeof body.diagnostic?.databaseMessage === "string" ? body.diagnostic.databaseMessage.trim() : "";
        throw new Error(databaseMessage ? `${message} Detalhe: ${String(body.stage || "persistência")} — ${databaseMessage}` : message);
      }
      const result = DiscoveryImportResponseSchema.parse(payload);
      const next = Object.fromEntries(result.resultItems.map(item => [item.candidateId, item.outcome])) as Record<string, "created" | "already_existing" | "failed">;
      setImportedById(current => ({ ...current, ...next }));
      const successfulIds = result.resultItems.filter(item => item.outcome !== "failed").map(item => item.candidateId);
      selection.setSelectedIds(current => new Set([...current].filter(id => !successfulIds.includes(id))));
      const succeeded = result.resultItems.some(item => item.outcome !== "failed");
      const candidateById = new Map(candidatesWithImportState.map(candidate => [candidate.candidateId, candidate]));
      const details: ImportFailureDetail[] = result.resultItems.filter(item => item.outcome === "failed").map(item => {
        const candidate = candidateById.get(item.candidateId);
        return { candidateId: item.candidateId, keyword: item.keyword || candidate?.keyword || "(sem keyword)", source: item.source || candidate?.source || "google_ads", errorCode: item.errorCode || item.reason || "unknown_import_error", reason: item.reason || "falha_na_importacao" };
      });
      const severity = result.failed === 0 && succeeded ? "SUCCESS" : succeeded ? "WARNING" : "ERROR";
      const summary = `${result.created} keyword(s) adicionada(s) ao Processador · ${result.alreadyExisting} já existia(m) · ${result.failed} falha(s).`;
      publishNotice({ severity, title: "Importação para o Processador", message: `${summary}${succeeded ? " Abra a aba Processar Keywords para revisar." : ""}`, details: details.length ? details.map(detail => `${detail.keyword} · ${sourceText(detail.source)} · ${detail.errorCode}: ${detail.reason}`).join("\n") : undefined, source: "persistence", confirmed: severity === "SUCCESS", copyPayload: { resultItems: result.resultItems } });
    } catch (error) {
      const fallback = "A importação não pôde ser iniciada. Sua seleção foi preservada.";
      const message = apiRequestStarted && error instanceof Error && error.message.trim() ? error.message : fallback;
      publishNotice({ severity: "ERROR", title: "Importação para o Processador", message, source: "persistence", details: process.env.NODE_ENV !== "production" && error instanceof Error ? error.message : undefined });
    } finally { setImporting(false); }
  };

  return <section className="mt-5 flex min-h-0 w-full flex-1 flex-col" aria-label="Resultados da descoberta">
    {candidates.length > 0 && <div className="mb-3 flex min-w-0 w-full flex-wrap items-center gap-2"><label className="relative min-w-0 flex-1 sm:max-w-md"><span className="sr-only">Buscar nos resultados</span><Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nos resultados..." className="w-full rounded border border-divider bg-surface-subtle py-1.5 pl-7 pr-2 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40" /></label>{customerDiscovery && <label className="inline-flex min-h-9 items-center gap-2 text-sm text-foreground/80">Perspectiva<select value={perspectiveFilter} onChange={event => setPerspectiveFilter(event.target.value as DiscoveryPerspectiveFilter)} aria-label="Filtrar perspectiva" className={control}><option className={optionClass} value="all">Todas</option><option className={optionClass} value="customer">Cliente provável</option><option className={optionClass} value="ambiguous">Ambígua</option><option className={optionClass} value="other">Outra perspectiva</option></select></label>}<KeywordTableOrganizeButton ref={organizeRef} aria-expanded={organizeOpen} onClick={() => setOrganizeOpen(value => !value)} />{orderMode === "manual" ? <span className="text-sm text-text-muted">Ordem manual</span> : primarySort && <span className="text-sm text-text-muted">Ordenado por {tableColumns.find(column => column.field === primarySort.field)?.label} · {primarySort.direction === "asc" ? "crescente" : "decrescente"}</span>}<button type="button" onClick={clearOrganization} className="inline-flex min-h-9 items-center rounded border border-divider px-2.5 py-1 text-sm font-semibold text-text-muted hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground">Limpar organização</button><AnchoredPopover open={organizeOpen} onClose={() => setOrganizeOpen(false)} triggerRef={organizeRef} ariaLabel="Organizar resultados" className="max-h-[min(70vh,34rem)] overflow-y-auto"><OrganizationPanel columns={tableColumns} filters={filters} setFilters={setFilters} orderMode={orderMode} setOrderMode={setOrderMode} primarySort={primarySort} secondarySort={secondarySort} setPrimarySort={setPrimarySort} setSecondarySort={setSecondarySort} /></AnchoredPopover></div>}
    {seoHiddenCount > 0 && <p data-discovery-seo-hidden className="mb-3 text-sm leading-6 text-text-muted">{seoHiddenCount} {seoHiddenCount === 1 ? "candidata oculta" : "candidatas ocultas"} pelos filtros Resultado e KD. Escolha Todos nos dois para ver todas.</p>}
    {selection.selectedIds.size > 0 && !serpMeasurementEnabled && <p data-discovery-serp-gate-compact className="mb-3 text-sm leading-6 text-text-muted md:hidden">{DISCOVERY_SERP_GATE_MESSAGE}</p>}
    {inlineNotice && <p className="mb-3 rounded border border-danger/45 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger" role="alert">{inlineNotice}</p>}
    <KeywordTableShell ref={tableRef} scroll="both" data-discovery-table-viewport className={`max-h-[calc(100dvh-2.5rem)] ${selection.selectedIds.size ? "pb-14" : ""}`.trim()}>
      <table data-keyword-table="discovery" className="w-full border-collapse text-left text-sm font-sans whitespace-nowrap">
        <colgroup>{tableColumnIds.map(columnId => <col key={columnId} data-keyword-table-column={columnId} style={{ width: columnWidth(columnId) }} />)}</colgroup>
        <KeywordTableHeader className="sticky top-0 z-20 border-b border-divider bg-surface-subtle"><tr className="text-text-muted"><th className="relative w-8 border-r border-divider/70 px-1 py-2" aria-label="Reordenar linhas"><KeywordTableColumnResizeHandle columnId="drag" label="reordenação" onStart={columnResize.startResize} /></th><KeywordSelectionHeader allSelected={visibleIds.length > 0 && visibleSelected === visibleIds.length} someSelected={visibleSelected > 0 && visibleSelected < visibleIds.length} onToggle={selection.toggleVisible} resizeHandle={<KeywordTableColumnResizeHandle columnId="selection" label="seleção" onStart={columnResize.startResize} />} />{tableColumns.map(column => <SortableHeader key={column.field} column={column} sort={orderMode === "manual" ? null : primarySort} onClick={() => cycleSort(column.field)} onResize={columnResize.startResize} />)}</tr></KeywordTableHeader>
        <tbody className="divide-y divide-divider/70 bg-background">
          {organizedCandidates.map(candidate => {
            const source = candidate.source || "google_ads";
            const sourceLabel = sourceText(source);
            const perspective = customerDiscovery ? candidateDiscoveryPerspective(candidate, seed, discoveryFocus) : null;
            return <tr key={candidate.candidateId} data-keyword-table-row-id={candidate.candidateId} style={{ height: rowResize.getHeight(candidate.candidateId) }} onDragOver={event => handleCandidateRowDragOver(event, candidate.candidateId)} onDrop={handleCandidateRowDrop} className={`transition-colors ${candidateOrder.draggingId === candidate.candidateId ? "bg-surface-elevated opacity-70" : selection.selectedIds.has(candidate.candidateId) ? "bg-selected hover:bg-surface-elevated" : "hover:bg-surface-subtle"}`}><td className="w-8 border-r border-divider/70 px-0.5 py-1 text-center"><KeywordTableDragHandle id={candidate.candidateId} label={candidate.keyword} enabled={orderMode === "manual"} onDragStart={candidateOrder.startDragging} onDragEnd={candidateOrder.endDragging} onPointerDragStart={candidateOrder.startPointerDragging} onMouseDragStart={candidateOrder.startMouseDragging} onKeyboardMove={(id, offset) => candidateOrder.moveByOffset(id, offset)} /></td><KeywordSelectionCell id={candidate.candidateId} keyword={candidate.keyword} selected={selection.selectedIds.has(candidate.candidateId)} onPointerDown={event => selection.onSelectionPointerDown(candidate.candidateId, event)} onClick={event => selection.onSelectionClick(candidate.candidateId, event)} /><td className={keywordCell} title={candidate.keyword} aria-label={`${candidate.keyword} · Origem: ${sourceLabel}`}><div className="flex min-w-0 items-center gap-2"><span className="min-w-0 select-text cursor-text break-words">{candidate.keyword}</span><span className={sourceBadge} title={`Origem: ${sourceLabel}`}>{sourceLabel}</span></div></td>{customerDiscovery && <td className={auxiliaryCell} title={perspective ? discoveryPerspectiveLabel(perspective) : undefined}>{perspective ? discoveryPerspectiveLabel(perspective) : "—"}</td>}<td className={auxiliaryCell}>{relationText(classifyDiscoveryRelation(seed, candidate.keyword))}</td><DiscoveryMetricCell display={discoveryResultsCell(candidate)} /><DiscoveryMetricCell display={discoveryVolumeCell(candidate, { answeredWithoutData: volumeAnsweredIds.has(candidate.candidateId) })} /><DiscoveryMetricCell display={discoveryCpcCell(candidate)} /><DiscoveryMetricCell display={discoveryCompetitionCell(candidate)} /><td className={auxiliaryCell}>{intent || "Não definida"}</td><td className={auxiliaryCell}>{funnel || "Não definido"}</td><td className="relative whitespace-nowrap px-2 py-1">{situationText(discoverySituation(candidate))}<KeywordTableRowResizeHandle rowId={candidate.candidateId} enabled onStart={rowResize.startResize} /></td></tr>;
          })}
          {!organizedCandidates.length && <tr><td colSpan={tableColumns.length + 2} className="p-0"><KeywordTableEmptyState>{candidates.length ? <p className="text-sm text-text-muted">{seoHiddenCount === candidatesWithImportState.length ? "Nenhuma candidata corresponde aos filtros Resultado e KD." : "Nenhuma candidata corresponde à organização local."}</p> : <DiscoveryEmptyState />}</KeywordTableEmptyState></td></tr>}
        </tbody>
      </table>
    </KeywordTableShell>
    {selection.selectedIds.size > 0 && <KeywordTableBulkBarShell className="font-sans"><div className="flex min-w-0 shrink-0 items-center gap-2" data-discovery-bulk-context><strong className="shrink-0 rounded border border-module-accent/50 bg-selected px-1.5 py-1 text-xs font-bold text-foreground sm:px-2.5 sm:text-sm">{selection.selectedIds.size} {selectedCountLabel}</strong><span className="hidden shrink-0 text-xs text-text-muted xl:inline">{selectedNewCount} {selectedNewCountLabel} · {selectedExistingCount} {selectedExistingCountLabel}</span></div><div className="flex min-w-0 items-center gap-0.5" data-discovery-bulk-workflow><MineradorProcessAction title="Atualizar demanda de busca" description="Consulta opcionalmente no Google Ads as métricas disponíveis para as candidatas selecionadas, como volume, CPC, tendência e concorrência." label={volumeMeasuring ? "Atualizando métricas..." : "Atualizar métricas"} ariaLabel="Atualizar métricas" labelClassName="hidden xl:inline" icon={volumeMeasuring ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => void measureVolume()} disabled={importing || volumeMeasuring || allintitleMeasuring} /><MineradorProcessAction title="Medir concorrência orgânica" description={serpMeasurementEnabled ? "Consulta opcionalmente no DataForSEO Resultado, KD e outras evidências orgânicas para as candidatas selecionadas." : DISCOVERY_SERP_GATE_MESSAGE} label={allintitleMeasuring ? "Medindo resultados..." : "Medir resultados"} ariaLabel={serpMeasurementEnabled ? "Medir resultados" : `Medir resultados. ${DISCOVERY_SERP_GATE_MESSAGE}`} labelClassName="hidden xl:inline" icon={allintitleMeasuring ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => void measureAllintitle()} disabled={importing || volumeMeasuring || allintitleMeasuring || !serpMeasurementEnabled} /><MineradorProcessAction title="Transformar candidatas em keywords do Minerador" description="Envia somente as keywords selecionadas para o Processador, preservando a origem da Descoberta. Métricas da Descoberta não substituem as medições oficiais do Processador." label={importing ? "Enviando..." : "Enviar selecionadas ao Processador"} ariaLabel="Enviar selecionadas ao Processador" labelClassName="hidden xl:inline" icon={importing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => void importSelected()} disabled={importing} buttonClassName="text-action-accent" /></div>{!serpMeasurementEnabled && <span data-discovery-serp-gate className="hidden min-w-0 truncate text-sm text-text-muted md:inline" title={DISCOVERY_SERP_GATE_MESSAGE}>{DISCOVERY_SERP_GATE_MESSAGE}</span>}<button type="button" onClick={() => selection.setSelectedIds(new Set())} disabled={importing || volumeMeasuring || allintitleMeasuring} data-discovery-bulk-clear aria-label="Limpar seleção" title="Limpar seleção" className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded border border-divider px-2 py-1 text-xs font-semibold text-foreground/80 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground sm:px-2.5 sm:text-sm"><X className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden xl:inline">Limpar seleção</span></button></KeywordTableBulkBarShell>}
  </section>;
}

function DiscoveryMetricCell({ display }: { display: DiscoveryCellDisplay }) {
  const described = display.tone !== "value" && Boolean(display.hint);
  return <td data-discovery-cell-tone={display.tone} title={display.hint} className={`${auxiliaryCell} ${cellToneClass[display.tone]}`.trim()}>
    {described ? <><span aria-hidden="true">{display.text}</span><span className="sr-only">{`${display.text} · ${display.hint}`}</span></> : display.text}
  </td>;
}

function SortableHeader({ column, sort, onClick, onResize }: { column: { label: string; field: DiscoverySortField }; sort: DiscoverySort | null; onClick: () => void; onResize: (columnId: string, event: KeywordTableResizeStartEvent) => void }) {
  const active = sort?.field === column.field;
  const state = active ? sort.direction : "none";
  const hint = discoveryColumnHints[column.field];
  const sortIcon = state === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : state === "desc" ? <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />;
  return <th
    aria-sort={state === "none" ? "none" : state === "asc" ? "ascending" : "descending"}
    aria-label={`Ordenar por ${column.label}`}
    title={`Ordenar por ${column.label}`}
    tabIndex={0}
    onClick={onClick}
    onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    }}
    className="relative border-r border-divider/70 px-3 py-2 text-sm font-medium text-text-muted outline-none last:border-r-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-module-accent/40"
  >
    <InlineLabelCluster
      label={hint && !hint.glyph ? <InfoHint title={hint.title} description={hint.description}><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">{column.label}</span></InfoHint> : column.label}
      info={hint?.glyph ? <span onClick={(event) => event.stopPropagation()}><InfoHint title={hint.title} description={hint.description} /></span> : undefined}
      trailing={sortIcon}
    />
    <KeywordTableColumnResizeHandle columnId={column.field} label={column.label} onStart={onResize} />
  </th>;
}

function OrganizationPanel({ columns: availableColumns, filters, setFilters, orderMode, setOrderMode, primarySort, secondarySort, setPrimarySort, setSecondarySort }: { columns: Array<{ label: string; field: DiscoverySortField }>; filters: DiscoveryOrganizationFilters; setFilters: (value: DiscoveryOrganizationFilters) => void; orderMode: KeywordTableOrderMode; setOrderMode: (value: KeywordTableOrderMode) => void; primarySort: DiscoverySort | null; secondarySort: DiscoverySort | null; setPrimarySort: (value: DiscoverySort | null) => void; setSecondarySort: (value: DiscoverySort | null) => void }) {
  const update = (key: keyof DiscoveryOrganizationFilters, value: string) => setFilters({ ...filters, [key]: value } as DiscoveryOrganizationFilters);
  const fields = availableColumns;
  const options = [
    ["situation", "Situação", [["all", "Todas"], ["new", "Somente novas"], ["existing", "Já existentes"], ["unavailable", "Sem volume oficial"], ["partial", "Métrica parcial"]]],
    ["volume", "Métricas", [["all", "Todas"], ["has", "Com volume"], ["unavailable", "Sem média disponível"]]],
    ["cpc", "CPC", [["all", "Todos"], ["has", "Com CPC"], ["missing", "Sem CPC"]]],
    ["competition", "Concorrência Ads", [["all", "Todas"], ["low", "Baixa"], ["medium", "Média"], ["high", "Alta"], ["missing", "Sem dado"]]],
    ["relation", "Relação", [["all", "Todas"], ["exact", "Exata"], ["phrase", "Frase"], ["broad", "Ampla"], ["related", "Relacionada"]]],
    ["selection", "Seleção", [["all", "Todas"], ["selected", "Somente selecionadas"], ["unselected", "Somente não selecionadas"]]],
  ] as const;
  return <div className="grid gap-3"><p className="text-sm font-medium text-foreground">Organização local</p><KeywordTableOrderModeSelect value={orderMode} onChange={setOrderMode} />{options.map(([key, label, values]) => <label key={key} className="text-sm text-foreground/80">{label}<select value={filters[key]} onChange={event => update(key, event.target.value)} className={`${control} mt-1 w-full`}>{values.map(([value, text]) => <option key={value} className={optionClass} value={value}>{text}</option>)}</select></label>)}<div className="grid gap-2 border-t border-divider pt-3 sm:grid-cols-2"><label className="text-sm text-foreground/80">Ordenação principal<select value={orderMode === "manual" ? "" : primarySort?.field || ""} onChange={event => { setOrderMode("auto"); setPrimarySort(event.target.value ? { field: event.target.value as DiscoverySortField, direction: primarySort?.direction || "asc" } : null); }} className={`${control} mt-1 w-full`}><option className={optionClass} value="">Nenhuma</option>{fields.map(field => <option key={field.field} className={optionClass} value={field.field}>{field.label}</option>)}</select></label><label className="text-sm text-foreground/80">Direção<select value={primarySort?.direction || "asc"} onChange={event => { if (primarySort) { setOrderMode("auto"); setPrimarySort({ ...primarySort, direction: event.target.value as DiscoverySortDirection }); } }} className={`${control} mt-1 w-full`}><option className={optionClass} value="asc">Crescente</option><option className={optionClass} value="desc">Decrescente</option></select></label><label className="text-sm text-foreground/80">Ordenação secundária<select value={orderMode === "manual" ? "" : secondarySort?.field || ""} onChange={event => { setOrderMode("auto"); setSecondarySort(event.target.value ? { field: event.target.value as DiscoverySortField, direction: secondarySort?.direction || "asc" } : null); }} className={`${control} mt-1 w-full`}><option className={optionClass} value="">Nenhuma</option>{fields.filter(field => field.field !== primarySort?.field).map(field => <option key={field.field} className={optionClass} value={field.field}>{field.label}</option>)}</select></label><label className="text-sm text-foreground/80">Direção secundária<select value={secondarySort?.direction || "asc"} onChange={event => { if (secondarySort) { setOrderMode("auto"); setSecondarySort({ ...secondarySort, direction: event.target.value as DiscoverySortDirection }); } }} className={`${control} mt-1 w-full`}><option className={optionClass} value="asc">Crescente</option><option className={optionClass} value="desc">Decrescente</option></select></label></div></div>;
}
