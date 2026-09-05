"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Columns3, Download, GripVertical, Search, Settings2 } from "lucide-react";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import { applyGridQuery, gridViewStorageKey, reorderIds, selectionState, selectAllVisible } from "@/lib/editorial/data-grid";
import { CompactSavedViews } from "./compact-saved-views";

export interface OperationalGridColumn<T> {
  id: string;
  header: string;
  value: (row: T) => unknown;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  filterOptions?: Array<{ label: string; value: string }>;
  width?: number;
  minWidth?: number;
  pinned?: "left" | "right";
}

interface BulkAction<T> { label: string; onClick: (rows: T[]) => void | Promise<void>; disabled?: boolean }

export type OperationalGridPageSize = 25 | 50 | 100 | 200 | "all";
export type OperationalGridOrderMode = "automatic" | "manual";
export type OperationalGridBulkSelectionChange =
  | { kind: "row"; rowId: string; checked: boolean }
  | { kind: "visible"; rowIds: string[]; checked: boolean }
  | { kind: "clear" };

export interface OperationalDataGridTopbarApi<T extends { id: string }> {
  search: string;
  setSearch: (value: string) => void;
  filters: Record<string, string>;
  setFilter: (columnId: string, value: string) => void;
  columns: OperationalGridColumn<T>[];
  hidden: Set<string>;
  showColumns: boolean;
  toggleColumns: () => void;
  toggleColumn: (columnId: string) => void;
  orderMode: OperationalGridOrderMode;
  setOrderMode: (value: OperationalGridOrderMode) => void;
  pageSize: OperationalGridPageSize;
  setPageSize: (value: OperationalGridPageSize) => void;
  queriedRows: T[];
  exportRows: (rows: T[], suffix: string) => void;
  reset: () => void;
}

export interface OperationalDataGridTopbar<T extends { id: string }> {
  moduleId: string;
  history?: NonNullable<GlobalTopbarModuleControls["history"]>;
  renderActions: (api: OperationalDataGridTopbarApi<T>) => React.ReactNode;
}

export interface OperationalDataGridProps<T extends { id: string }> {
  module: string;
  userId: string;
  brandId: string;
  rows: T[];
  columns: OperationalGridColumn<T>[];
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  searchPlaceholder?: string;
  bulkActions?: BulkAction<T>[];
  renderBulkBar?: (selectedRows: T[]) => React.ReactNode;
  renderActions?: (row: T) => React.ReactNode;
  renderExpanded?: (row: T) => React.ReactNode;
  onRowOrderChange?: (ids: string[]) => void;
  initialPageSize?: 25 | 50 | 100 | 200 | "all";
  toolbar?: React.ReactNode;
  title?: string;
  description?: string;
  expandedRowId?: string | null;
  onExpandedRowChange?: (rowId: string | null) => void;
  onSelectionChange?: (rowIds: string[]) => void;
  bulkSelectedRowIds?: ReadonlySet<string>;
  onBulkSelectionChange?: (rowIds: string[], change: OperationalGridBulkSelectionChange) => void;
  activeRowId?: string | null;
  activeRowClassName?: string;
  bulkSelectedRowClassName?: string;
  onRowActivate?: (row: T) => void;
  topbar?: OperationalDataGridTopbar<T>;
}

const control = "h-7 rounded border border-divider bg-surface-subtle px-2 text-[10px] text-foreground/85 outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/45";

export function OperationalDataGrid<T extends { id: string }>({ module, userId, brandId, rows, columns, loading = false, error = null,
  emptyTitle = "Nenhum item encontrado", searchPlaceholder = "Buscar…", bulkActions = [], renderBulkBar, renderActions, renderExpanded,
  onRowOrderChange, initialPageSize = 25, toolbar, title, description, expandedRowId, onExpandedRowChange, onSelectionChange, bulkSelectedRowIds, onBulkSelectionChange, activeRowId,
  activeRowClassName = "bg-selected", bulkSelectedRowClassName = "bg-selected", onRowActivate, topbar }: OperationalDataGridProps<T>) {
  const [search, setSearch] = useState(""); const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null);
  const [uncontrolledBulkSelected, setUncontrolledBulkSelected] = useState<Set<string>>(new Set()); const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set()); const [widths, setWidths] = useState<Record<string, number>>({});
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | 200 | "all">(initialPageSize); const [page, setPage] = useState(1);
  const [orderMode, setOrderMode] = useState<"automatic" | "manual">("automatic"); const [manualOrder, setManualOrder] = useState<string[]>(rows.map(row => row.id));
  const [showColumns, setShowColumns] = useState(false); const [draggedId, setDraggedId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null); const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = gridViewStorageKey(userId || "anonymous", brandId || "no-brand", module);

  useEffect(() => { const timer = window.setTimeout(() => setManualOrder(current => [...current.filter(id => rows.some(row => row.id === id)), ...rows.map(row => row.id).filter(id => !current.includes(id))]), 0); return () => window.clearTimeout(timer); }, [rows]);
  useEffect(() => { const timer = window.setTimeout(() => { const scroll = Number(window.localStorage.getItem(`${storageKey}:scroll`) || 0); scrollRef.current?.scrollTo({ top: scroll }); }, 0); return () => window.clearTimeout(timer); }, [storageKey]);
  const visibleColumns = columns.filter(column => !hidden.has(column.id));
  const queried = useMemo(() => applyGridQuery(rows, { search, searchText: row => columns.map(column => String(column.value(row) ?? "")).join(" "), filters,
    filterValue: (row, columnId) => columns.find(column => column.id === columnId)?.value(row), sort, manualOrder }), [rows, columns, search, filters, sort, manualOrder]);
  const safePageSize = pageSize === "all" ? (queried.length <= 1000 ? Math.max(queried.length, 1) : 200) : pageSize;
  const pages = Math.max(1, Math.ceil(queried.length / safePageSize)); const currentPage = Math.min(page, pages);
  const pageRows = queried.slice((currentPage - 1) * safePageSize, currentPage * safePageSize);
  const bulkSelected = bulkSelectedRowIds || uncontrolledBulkSelected;
  const commitBulkSelection = (next: Set<string>, change: OperationalGridBulkSelectionChange) => {
    if (bulkSelectedRowIds === undefined) setUncontrolledBulkSelected(next);
    onBulkSelectionChange?.([...next], change);
  };
  const visibleIds = pageRows.map(row => row.id); const bulkSelection = selectionState(bulkSelected, visibleIds);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = bulkSelection.indeterminate; }, [bulkSelection.indeterminate]);
  useEffect(() => { onSelectionChange?.([...bulkSelected]); }, [onSelectionChange, bulkSelected]);

  function applyLastConfiguration(values: Record<string, string>) {
    try {
      setSearch(values.search || ""); setFilters(JSON.parse(values.filters || "{}")); setSort(JSON.parse(values.sort || "null"));
      setHidden(new Set(JSON.parse(values.hidden || "[]"))); setWidths(JSON.parse(values.widths || "{}"));
      setPageSize(values.pageSize === "all" ? "all" : Number(values.pageSize || initialPageSize) as 25 | 50 | 100 | 200);
      setOrderMode(values.orderMode === "manual" ? "manual" : "automatic"); setManualOrder(JSON.parse(values.manualOrder || "[]")); setPage(1);
    } catch { resetSystem(); }
  }
  function resetSystem() { setSearch(""); setFilters({}); setSort(null); setHidden(new Set()); setWidths({}); setPageSize(initialPageSize); setOrderMode("automatic"); setManualOrder(rows.map(row => row.id)); setPage(1); }
  function resizeColumn(columnId: string, startX: number, startWidth: number) {
    const move = (event: MouseEvent) => setWidths(current => ({ ...current, [columnId]: Math.max(64, Math.min(800, startWidth + event.clientX - startX)) }));
    const end = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", end); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", end);
  }
  function exportRows(chosen: T[], suffix: string) {
    if (!chosen.length) return;
    const csv = [visibleColumns.map(column => column.header), ...chosen.map(row => visibleColumns.map(column => String(column.value(row) ?? "")))].map(line => line.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${module}-${suffix}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  const setSearchValue = (value: string) => { setSearch(value); setPage(1); };
  const setFilterValue = (columnId: string, value: string) => { setFilters(current => ({ ...current, [columnId]: value })); setPage(1); };
  const setOrderModeValue = (value: OperationalGridOrderMode) => { setOrderMode(value); if (value === "manual") setSort(null); };
  const setPageSizeValue = (value: OperationalGridPageSize) => { setPageSize(value); setPage(1); };
  const toggleColumn = (columnId: string) => setHidden(current => { const next = new Set(current); if (next.has(columnId)) next.delete(columnId); else next.add(columnId); return next; });
  const topbarApi: OperationalDataGridTopbarApi<T> = {
    search,
    setSearch: setSearchValue,
    filters,
    setFilter: setFilterValue,
    columns,
    hidden,
    showColumns,
    toggleColumns: () => setShowColumns(value => !value),
    toggleColumn,
    orderMode,
    setOrderMode: setOrderModeValue,
    pageSize,
    setPageSize: setPageSizeValue,
    queriedRows: queried,
    exportRows,
    reset: resetSystem,
  };
  const topbarActions = topbar?.renderActions(topbarApi);

  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-y border-slate-850 bg-[#08090c]" aria-label={`Planilha ${module}`}>
    {topbar ? <OperationalDataGridTopbarBridge moduleId={topbar.moduleId} search={search} setSearch={setSearchValue} history={topbar.history} actions={topbarActions} /> : null}
    <CompactSavedViews userId={userId} brandId={brandId} module={module} values={{ search, filters: JSON.stringify(filters), sort: JSON.stringify(sort), hidden: JSON.stringify([...hidden]), widths: JSON.stringify(widths), pageSize: String(pageSize), orderMode, manualOrder: JSON.stringify(manualOrder) }} onApply={applyLastConfiguration}/>
    {!topbar ? <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-850 bg-[#0a0b0f] p-2">
      {title && <div className="mr-2 min-w-36 shrink-0"><h1 className="text-[11px] font-bold uppercase tracking-wider text-white">{title}</h1>{description && <p className="max-w-56 truncate text-[8px] text-slate-600">{description}</p>}</div>}
      <label className="relative min-w-44 flex-1 max-w-sm shrink-0"><Search className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-slate-600"/><input value={search} onChange={event => setSearchValue(event.target.value)} placeholder={searchPlaceholder} className={`${control} w-full pl-7`}/></label>
      {columns.filter(column => column.filterOptions).map(column => <select key={column.id} value={filters[column.id] || ""} onChange={event => setFilterValue(column.id, event.target.value)} className={control}><option value="">{column.header}: todos</option>{column.filterOptions!.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
      {toolbar}
      <button className={control} onClick={() => exportRows(queried, "planilha")}><Download className="mr-1 inline h-3 w-3"/>Exportar</button>
      <div className="relative"><button className={control} onClick={() => setShowColumns(value => !value)} title="Exibir ou ocultar colunas"><Columns3 className="h-3 w-3"/></button>{showColumns && <div className="absolute right-0 z-50 mt-1 w-52 rounded border border-slate-800 bg-[#0b0c10] p-2 shadow-xl">{columns.map(column => <label key={column.id} className="flex items-center gap-2 py-1 text-[10px]"><input type="checkbox" checked={!hidden.has(column.id)} onChange={() => toggleColumn(column.id)}/>{column.header}</label>)}</div>}</div>
      <select value={orderMode} onChange={event => setOrderModeValue(event.target.value as OperationalGridOrderMode)} className={control}><option value="automatic">Ordem automática</option><option value="manual">Ordem manual</option></select>
      <select value={String(pageSize)} onChange={event => setPageSizeValue(event.target.value === "all" ? "all" : Number(event.target.value) as 25 | 50 | 100 | 200)} className={control}>{[25, 50, 100, 200].map(size => <option key={size}>{size}</option>)}<option value="all">Todos</option></select>
    </div> : null}
    {error ? <div className="m-4 rounded border border-red-900/50 bg-red-950/20 p-4 text-xs text-red-300">{error}</div> : loading ? <div className="flex min-h-44 items-center justify-center text-xs text-slate-500">Carregando planilha…</div> : !queried.length ? <div className="flex min-h-44 items-center justify-center text-xs text-slate-500">{emptyTitle}</div> : <div ref={scrollRef} onScroll={event => window.localStorage.setItem(`${storageKey}:scroll`, String(event.currentTarget.scrollTop))} className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse text-[10px]" style={{ minWidth: Math.max(960, visibleColumns.reduce((total, column) => total + (widths[column.id] || column.width || 140), 150)) }}>
        <thead className="sticky top-0 z-30 bg-[#101116] text-slate-500"><tr><th className="sticky left-0 z-40 w-10 border-b border-r border-slate-800 bg-[#101116] p-1 text-center">#</th><th className="sticky left-10 z-40 w-9 border-b border-r border-slate-800 bg-[#101116] p-1"><input ref={selectAllRef} type="checkbox" checked={bulkSelection.checked} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onChange={event => { const checked = event.target.checked; commitBulkSelection(selectAllVisible(bulkSelected, visibleIds, checked), { kind: "visible", rowIds: visibleIds, checked }); }}/></th><th className="w-7 border-b border-slate-800" title={sort ? "A ordenação manual está bloqueada pela ordenação automática." : "Arrastar para reordenar"}><GripVertical className="mx-auto h-3 w-3"/></th>
          {visibleColumns.map((column, index) => { const sticky = column.pinned === "left" || index === 0; return <th key={column.id} style={{ width: widths[column.id] || column.width || 140, left: sticky ? 79 : undefined }} className={`${sticky ? "sticky z-30 bg-[#101116]" : ""} relative border-b border-r border-slate-850 p-2 text-left`}><button disabled={!column.sortable || orderMode === "manual"} onClick={() => setSort(current => current?.columnId === column.id ? current.direction === "asc" ? { columnId: column.id, direction: "desc" } : null : { columnId: column.id, direction: "asc" })} className="w-full truncate text-left disabled:cursor-default">{column.header}{sort?.columnId === column.id ? sort.direction === "asc" ? " ↑" : " ↓" : ""}</button><span onMouseDown={event => resizeColumn(column.id, event.clientX, widths[column.id] || column.width || 140)} className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-context-accent"/></th>; })}
          {renderActions && <th className="sticky right-0 z-40 w-40 border-b border-l border-slate-800 bg-[#101116] p-2 text-right">Ações</th>}
        </tr></thead>
        <tbody>{pageRows.map((row, index) => <React.Fragment key={row.id}><tr draggable={orderMode === "manual" && !sort} tabIndex={onRowActivate ? 0 : undefined} aria-current={activeRowId !== undefined && activeRowId === row.id ? "true" : undefined} data-focused-row={activeRowId === row.id ? "true" : undefined} data-bulk-selected={bulkSelected.has(row.id) ? "true" : undefined} onClick={onRowActivate ? event => { const target = event.target as HTMLElement; if (target.closest("button, input, a, select, textarea, [role=\"button\"]")) return; onRowActivate(row); } : undefined} onKeyDown={onRowActivate ? event => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); onRowActivate(row); } } : undefined} onDragStart={() => setDraggedId(row.id)} onDragOver={event => event.preventDefault()} onDrop={() => { if (!draggedId) return; const next = reorderIds(manualOrder, draggedId, row.id, Boolean(sort)); setManualOrder(next); onRowOrderChange?.(next); setDraggedId(null); }} className={`border-b border-slate-900 ${onRowActivate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" : "hover:bg-slate-900/40"} ${activeRowId === row.id ? activeRowClassName : ""} ${bulkSelected.has(row.id) ? bulkSelectedRowClassName : ""}`}>
          <td className="sticky left-0 z-20 border-r border-slate-850 bg-[#0b0c10] p-2 text-center text-slate-600">{(currentPage - 1) * safePageSize + index + 1}</td><td className="sticky left-10 z-20 border-r border-slate-850 bg-[#0b0c10] p-2 text-center"><input type="checkbox" checked={bulkSelected.has(row.id)} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onChange={event => { const checked = event.target.checked; const next = new Set(bulkSelected); if (checked) next.add(row.id); else next.delete(row.id); commitBulkSelection(next, { kind: "row", rowId: row.id, checked }); }}/></td><td className="p-1 text-center text-slate-700">{renderExpanded ? <button type="button" aria-label={`${(expandedRowId !== undefined ? expandedRowId === row.id : expanded.has(row.id)) ? "Fechar" : "Abrir"} detalhes`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); const isOpen = expandedRowId !== undefined ? expandedRowId === row.id : expanded.has(row.id); const nextId = isOpen ? null : row.id; if (onExpandedRowChange) onExpandedRowChange(nextId); else setExpanded(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; }); }}>{(expandedRowId !== undefined ? expandedRowId === row.id : expanded.has(row.id)) ? <ChevronDown className="h-3 w-3"/> : <ChevronRight className="h-3 w-3"/>}</button> : orderMode === "manual" ? <GripVertical className="mx-auto h-3 w-3 cursor-grab"/> : null}</td>
          {visibleColumns.map((column, columnIndex) => { const sticky = column.pinned === "left" || columnIndex === 0; return <td key={column.id} style={{ left: sticky ? 79 : undefined }} className={`${sticky ? "sticky z-10 bg-[#0b0c10]" : ""} truncate border-r border-slate-900 p-2 align-top`}>{column.render ? column.render(row) : String(column.value(row) ?? "—")}</td>; })}
          {renderActions && <td className="sticky right-0 z-20 border-l border-slate-850 bg-[#0b0c10] p-1.5 text-right">{renderActions(row)}</td>}
        </tr>{(expandedRowId !== undefined ? expandedRowId === row.id : expanded.has(row.id)) && renderExpanded && <tr className="border-b border-slate-850"><td colSpan={visibleColumns.length + (renderActions ? 4 : 3)} className="bg-[#07080b] p-4">{renderExpanded(row)}</td></tr>}</React.Fragment>)}</tbody>
      </table>
    </div>}
    <footer className={`flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-t px-3 py-1.5 text-[9px] ${bulkSelected.size > 0 ? "border-divider bg-selected text-context-accent" : "border-slate-850 text-slate-600"}`}><div className="flex shrink-0 items-center gap-2"><strong>{queried.length} item(ns) · {bulkSelected.size} selecionado(s)</strong>{bulkSelected.size > 0 && <>{renderBulkBar ? renderBulkBar(rows.filter(row => bulkSelected.has(row.id))) : bulkActions.map(action => <button key={action.label} disabled={action.disabled} className={control} onClick={() => void action.onClick(rows.filter(row => bulkSelected.has(row.id)))}>{action.label}</button>)}<button className={control} onClick={() => exportRows(rows.filter(row => bulkSelected.has(row.id)), "selecionados")}><Download className="mr-1 inline h-3 w-3"/>Exportar selecionados</button><button className={control} onClick={() => commitBulkSelection(new Set(), { kind: "clear" })}>Limpar seleção</button></>}</div><div className="flex shrink-0 items-center gap-1"><button className={control} disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</button><span>{currentPage}/{pages}</span><button className={control} disabled={currentPage >= pages} onClick={() => setPage(value => Math.min(pages, value + 1))}>Próxima</button><button className={control} onClick={resetSystem}><Settings2 className="mr-1 inline h-3 w-3"/>Restaurar</button></div></footer>
  </section>;
}

function OperationalDataGridTopbarBridge({ moduleId, search, setSearch, history, actions }: {
  moduleId: string;
  search: string;
  setSearch: (value: string) => void;
  history?: NonNullable<GlobalTopbarModuleControls["history"]>;
  actions: React.ReactNode;
}) {
  const { registerControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  const controls = useMemo<GlobalTopbarModuleControls>(() => ({
    moduleId,
    search: { getValue: () => search, setValue: setSearch },
    ...(history ? { history } : {}),
    actions: <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto xl:overflow-visible" data-operational-topbar-actions>{actions}</div>,
  }), [actions, history, moduleId, search, setSearch]);

  useEffect(() => {
    registerControls(controls);
    return () => unregisterControls(controls.moduleId);
  }, [controls, registerControls, unregisterControls]);
  return null;
}
