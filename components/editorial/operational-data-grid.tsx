"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Columns3, Download, GripVertical, Search, Settings2 } from "lucide-react";
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
  renderActions?: (row: T) => React.ReactNode;
  renderExpanded?: (row: T) => React.ReactNode;
  onRowOrderChange?: (ids: string[]) => void;
  initialPageSize?: 25 | 50 | 100 | 200 | "all";
  toolbar?: React.ReactNode;
  title?: string;
  description?: string;
}

const control = "h-7 rounded border border-slate-800 bg-[#090a0e] px-2 text-[10px] text-slate-300 outline-none focus:border-indigo-600";

export function OperationalDataGrid<T extends { id: string }>({ module, userId, brandId, rows, columns, loading = false, error = null,
  emptyTitle = "Nenhum item encontrado", searchPlaceholder = "Buscar…", bulkActions = [], renderActions, renderExpanded,
  onRowOrderChange, initialPageSize = 25, toolbar, title, description }: OperationalDataGridProps<T>) {
  const [search, setSearch] = useState(""); const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  const visibleIds = pageRows.map(row => row.id); const selection = selectionState(selected, visibleIds);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = selection.indeterminate; }, [selection.indeterminate]);

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

  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-y border-slate-850 bg-[#08090c]" aria-label={`Planilha ${module}`}>
    <CompactSavedViews userId={userId} brandId={brandId} module={module} values={{ search, filters: JSON.stringify(filters), sort: JSON.stringify(sort), hidden: JSON.stringify([...hidden]), widths: JSON.stringify(widths), pageSize: String(pageSize), orderMode, manualOrder: JSON.stringify(manualOrder) }} onApply={applyLastConfiguration}/>
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-850 bg-[#0a0b0f] p-2">
      {title && <div className="mr-2 min-w-36 shrink-0"><h1 className="text-[11px] font-bold uppercase tracking-wider text-white">{title}</h1>{description && <p className="max-w-56 truncate text-[8px] text-slate-600">{description}</p>}</div>}
      <label className="relative min-w-44 flex-1 max-w-sm shrink-0"><Search className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-slate-600"/><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={searchPlaceholder} className={`${control} w-full pl-7`}/></label>
      {columns.filter(column => column.filterOptions).map(column => <select key={column.id} value={filters[column.id] || ""} onChange={event => { setFilters(current => ({ ...current, [column.id]: event.target.value })); setPage(1); }} className={control}><option value="">{column.header}: todos</option>{column.filterOptions!.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
      {toolbar}
      <button className={control} onClick={() => exportRows(queried, "planilha")}><Download className="mr-1 inline h-3 w-3"/>Exportar</button>
      <div className="relative"><button className={control} onClick={() => setShowColumns(value => !value)} title="Exibir ou ocultar colunas"><Columns3 className="h-3 w-3"/></button>{showColumns && <div className="absolute right-0 z-50 mt-1 w-52 rounded border border-slate-800 bg-[#0b0c10] p-2 shadow-xl">{columns.map(column => <label key={column.id} className="flex items-center gap-2 py-1 text-[10px]"><input type="checkbox" checked={!hidden.has(column.id)} onChange={() => setHidden(current => { const next = new Set(current); if (next.has(column.id)) next.delete(column.id); else next.add(column.id); return next; })}/>{column.header}</label>)}</div>}</div>
      <select value={orderMode} onChange={event => { setOrderMode(event.target.value as "automatic" | "manual"); if (event.target.value === "manual") setSort(null); }} className={control}><option value="automatic">Ordem automática</option><option value="manual">Ordem manual</option></select>
      <select value={String(pageSize)} onChange={event => { setPageSize(event.target.value === "all" ? "all" : Number(event.target.value) as 25 | 50 | 100 | 200); setPage(1); }} className={control}>{[25, 50, 100, 200].map(size => <option key={size}>{size}</option>)}<option value="all">Todos</option></select>
    </div>
    {error ? <div className="m-4 rounded border border-red-900/50 bg-red-950/20 p-4 text-xs text-red-300">{error}</div> : loading ? <div className="flex min-h-44 items-center justify-center text-xs text-slate-500">Carregando planilha…</div> : !queried.length ? <div className="flex min-h-44 items-center justify-center text-xs text-slate-500">{emptyTitle}</div> : <div ref={scrollRef} onScroll={event => window.localStorage.setItem(`${storageKey}:scroll`, String(event.currentTarget.scrollTop))} className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse text-[10px]" style={{ minWidth: Math.max(960, visibleColumns.reduce((total, column) => total + (widths[column.id] || column.width || 140), 150)) }}>
        <thead className="sticky top-0 z-30 bg-[#101116] text-slate-500"><tr><th className="sticky left-0 z-40 w-10 border-b border-r border-slate-800 bg-[#101116] p-1 text-center">#</th><th className="sticky left-10 z-40 w-9 border-b border-r border-slate-800 bg-[#101116] p-1"><input ref={selectAllRef} type="checkbox" checked={selection.checked} onChange={event => setSelected(current => selectAllVisible(current, visibleIds, event.target.checked))}/></th><th className="w-7 border-b border-slate-800" title={sort ? "A ordenação manual está bloqueada pela ordenação automática." : "Arrastar para reordenar"}><GripVertical className="mx-auto h-3 w-3"/></th>
          {visibleColumns.map((column, index) => { const sticky = column.pinned === "left" || index === 0; return <th key={column.id} style={{ width: widths[column.id] || column.width || 140, left: sticky ? 79 : undefined }} className={`${sticky ? "sticky z-30 bg-[#101116]" : ""} relative border-b border-r border-slate-850 p-2 text-left`}><button disabled={!column.sortable || orderMode === "manual"} onClick={() => setSort(current => current?.columnId === column.id ? current.direction === "asc" ? { columnId: column.id, direction: "desc" } : null : { columnId: column.id, direction: "asc" })} className="w-full truncate text-left disabled:cursor-default">{column.header}{sort?.columnId === column.id ? sort.direction === "asc" ? " ↑" : " ↓" : ""}</button><span onMouseDown={event => resizeColumn(column.id, event.clientX, widths[column.id] || column.width || 140)} className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-indigo-500"/></th>; })}
          {renderActions && <th className="sticky right-0 z-40 w-40 border-b border-l border-slate-800 bg-[#101116] p-2 text-right">Ações</th>}
        </tr></thead>
        <tbody>{pageRows.map((row, index) => <React.Fragment key={row.id}><tr draggable={orderMode === "manual" && !sort} onDragStart={() => setDraggedId(row.id)} onDragOver={event => event.preventDefault()} onDrop={() => { if (!draggedId) return; const next = reorderIds(manualOrder, draggedId, row.id, Boolean(sort)); setManualOrder(next); onRowOrderChange?.(next); setDraggedId(null); }} className={`border-b border-slate-900 hover:bg-slate-900/40 ${selected.has(row.id) ? "bg-indigo-950/15" : ""}`}>
          <td className="sticky left-0 z-20 border-r border-slate-850 bg-[#0b0c10] p-2 text-center text-slate-600">{(currentPage - 1) * safePageSize + index + 1}</td><td className="sticky left-10 z-20 border-r border-slate-850 bg-[#0b0c10] p-2 text-center"><input type="checkbox" checked={selected.has(row.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })}/></td><td className="p-1 text-center text-slate-700">{renderExpanded ? <button onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })}>{expanded.has(row.id) ? <ChevronDown className="h-3 w-3"/> : <ChevronRight className="h-3 w-3"/>}</button> : orderMode === "manual" ? <GripVertical className="mx-auto h-3 w-3 cursor-grab"/> : null}</td>
          {visibleColumns.map((column, columnIndex) => { const sticky = column.pinned === "left" || columnIndex === 0; return <td key={column.id} style={{ left: sticky ? 79 : undefined }} className={`${sticky ? "sticky z-10 bg-[#0b0c10]" : ""} truncate border-r border-slate-900 p-2 align-top`}>{column.render ? column.render(row) : String(column.value(row) ?? "—")}</td>; })}
          {renderActions && <td className="sticky right-0 z-20 border-l border-slate-850 bg-[#0b0c10] p-1.5 text-right">{renderActions(row)}</td>}
        </tr>{expanded.has(row.id) && renderExpanded && <tr className="border-b border-slate-850"><td colSpan={visibleColumns.length + (renderActions ? 4 : 3)} className="bg-[#07080b] p-4">{renderExpanded(row)}</td></tr>}</React.Fragment>)}</tbody>
      </table>
    </div>}
    <footer className={`flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-t px-3 py-1.5 text-[9px] ${selected.size > 0 ? "border-indigo-900 bg-indigo-950/25 text-indigo-200" : "border-slate-850 text-slate-600"}`}><div className="flex shrink-0 items-center gap-2"><strong>{queried.length} item(ns) · {selected.size} selecionado(s)</strong>{selected.size > 0 && <>{bulkActions.map(action => <button key={action.label} disabled={action.disabled} className={control} onClick={() => void action.onClick(rows.filter(row => selected.has(row.id)))}>{action.label}</button>)}<button className={control} onClick={() => exportRows(rows.filter(row => selected.has(row.id)), "selecionados")}><Download className="mr-1 inline h-3 w-3"/>Exportar selecionados</button><button className={control} onClick={() => setSelected(new Set())}>Limpar seleção</button></>}</div><div className="flex shrink-0 items-center gap-1"><button className={control} disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</button><span>{currentPage}/{pages}</span><button className={control} disabled={currentPage >= pages} onClick={() => setPage(value => Math.min(pages, value + 1))}>Próxima</button><button className={control} onClick={resetSystem}><Settings2 className="mr-1 inline h-3 w-3"/>Restaurar</button></div></footer>
  </section>;
}
