"use client";

import { useMemo, useState } from "react";
import { Check, CircleDot, Clock3, Loader2, Lock, Plus, Search, Send, X } from "lucide-react";

const STATUS_META: Record<string, { label: string; tone: string; group: "process" | "review" | "approved" | "sent" | "published" | "blocked" }> = {
  bruto: { label: "Em processo", tone: "border-slate-700 text-slate-300", group: "process" },
  draft: { label: "Em processo", tone: "border-slate-700 text-slate-300", group: "process" },
  imported: { label: "Importado · em processo", tone: "border-blue-900 text-blue-300", group: "process" },
  analyzing: { label: "Em análise", tone: "border-blue-900 text-blue-300", group: "process" },
  research_pending: { label: "Pesquisa pendente", tone: "border-slate-700 text-slate-300", group: "process" },
  researching: { label: "Em pesquisa", tone: "border-blue-900 text-blue-300", group: "process" },
  needs_review: { label: "Ajustes necessários", tone: "border-amber-900 text-amber-300", group: "review" },
  conflicts: { label: "Com conflitos", tone: "border-red-900 text-red-300", group: "blocked" },
  planning: { label: "Em planejamento", tone: "border-blue-900 text-blue-300", group: "process" },
  pending: { label: "Com pendências", tone: "border-amber-900 text-amber-300", group: "review" },
  planejado: { label: "Planejado", tone: "border-slate-700 text-slate-300", group: "process" },
  escrevendo: { label: "Em redação", tone: "border-blue-900 text-blue-300", group: "process" },
  writing: { label: "Em redação", tone: "border-blue-900 text-blue-300", group: "process" },
  awaiting_review: { label: "Aguardando aprovação", tone: "border-amber-900 text-amber-300", group: "review" },
  em_revisao: { label: "Aguardando aprovação", tone: "border-amber-900 text-amber-300", group: "review" },
  in_review: { label: "Em revisão", tone: "border-amber-900 text-amber-300", group: "review" },
  awaiting_approval: { label: "Aguardando aprovação", tone: "border-amber-900 text-amber-300", group: "review" },
  aprovado: { label: "Aprovado", tone: "border-emerald-900 text-emerald-300", group: "approved" },
  approved: { label: "Aprovado", tone: "border-emerald-900 text-emerald-300", group: "approved" },
  sent_architect: { label: "Importado no Arquiteto", tone: "border-cyan-900 text-cyan-300", group: "sent" },
  sent_radar: { label: "Importado no Radar", tone: "border-cyan-900 text-cyan-300", group: "sent" },
  sent_planner: { label: "Importado no Planejador", tone: "border-cyan-900 text-cyan-300", group: "sent" },
  sent_writer: { label: "Importado no Redator", tone: "border-cyan-900 text-cyan-300", group: "sent" },
  ready_to_export: { label: "Importado em Publicações", tone: "border-cyan-900 text-cyan-300", group: "sent" },
  queued: { label: "Na fila", tone: "border-violet-900 text-violet-300", group: "sent" },
  exported: { label: "Exportado", tone: "border-violet-900 text-violet-300", group: "sent" },
  publicado: { label: "Publicado", tone: "border-emerald-800 text-emerald-200", group: "published" },
  published: { label: "Publicado", tone: "border-emerald-800 text-emerald-200", group: "published" },
  update_due: { label: "Atualização pendente", tone: "border-amber-900 text-amber-300", group: "review" },
  blocked: { label: "Bloqueado", tone: "border-red-900 text-red-300", group: "blocked" },
  rejected: { label: "Rejeitado", tone: "border-red-900 text-red-300", group: "blocked" },
  rejeitado: { label: "Rejeitado", tone: "border-red-900 text-red-300", group: "blocked" },
  archived: { label: "Arquivado", tone: "border-slate-800 text-slate-500", group: "blocked" },
};

export function workflowStatusMeta(status: string) {
  return STATUS_META[status.toLowerCase()] || { label: status.replaceAll("_", " "), tone: "border-slate-700 text-slate-300", group: "process" as const };
}

export function WorkflowStatusBadge({ status, density = "compact" }: { status: string; density?: "compact" | "comfortable" }) {
  const meta = workflowStatusMeta(status);
  const Icon = meta.group === "approved" ? Check : meta.group === "published" ? Lock : meta.group === "sent" ? Send : meta.group === "process" ? CircleDot : Clock3;
  const densityClass = density === "comfortable" ? "min-h-8 rounded-md px-2 py-1 text-[13px]" : "rounded border px-1.5 py-0.5 text-[9px]";
  const iconClass = density === "comfortable" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  return <span className={`inline-flex items-center gap-2 whitespace-nowrap font-semibold ${densityClass} ${meta.tone}`} title={`Estado editorial: ${status}. Este indicador nao representa uma tarefa em execucao.`}><Icon className={iconClass}/>{meta.label}</span>;
}

export function WorkflowStatusSummary({ statuses }: { statuses: string[] }) {
  const counts = useMemo(() => statuses.reduce<Record<string, number>>((result, status) => { const group = workflowStatusMeta(status).group; result[group] = (result[group] || 0) + 1; return result; }, {}), [statuses]);
  return <div className="flex flex-wrap items-center gap-2 border-b border-slate-900 bg-[#090a0e] px-3 py-1.5 text-[9px] text-slate-500"><span>Em processo: {counts.process || 0}</span><span>Aguardando aprovação: {counts.review || 0}</span><span className="text-emerald-400">Aprovados: {counts.approved || 0}</span><span>Importados adiante: {counts.sent || 0}</span><span>Publicados: {counts.published || 0}</span>{Boolean(counts.blocked) && <span className="text-red-400">Bloqueados: {counts.blocked}</span>}</div>;
}

export function WorkflowImportDialog<T extends { id: string }>({ open, title, description, rows, label, details, disabled = () => false, disabledReason, status, loading = false, error = null, emptyMessage, onRetry, onClose, onImport }: {
  open: boolean; title: string; description: string; rows: T[]; label: (row: T) => React.ReactNode; details?: (row: T) => React.ReactNode;
  disabled?: (row: T) => boolean; disabledReason?: (row: T) => React.ReactNode; status?: (row: T) => string; loading?: boolean; error?: string | null; emptyMessage?: React.ReactNode; onRetry?: () => void | Promise<void>;
  onClose: () => void; onImport: (ids: string[]) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const filtered = rows.filter(row => String(label(row)).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const selectable = filtered.filter(row => !disabled(row));
  if (!open) return null;
  const importSelected = async () => { setImporting(true); try { await onImport([...selected]); setSelected(new Set()); } finally { setImporting(false); } };
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="workflow-import-title" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-800 bg-[#090a0e] shadow-2xl">
      <header className="flex items-start gap-3 border-b border-slate-850 p-4"><div><h2 id="workflow-import-title" className="text-sm font-bold text-white">{title}</h2><p className="mt-1 text-[10px] text-slate-500">{description}</p></div><button type="button" className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-900 hover:text-white" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4"/></button></header>
      <div className="p-3"><label className="flex h-8 items-center gap-2 rounded border border-slate-800 bg-black px-2 text-slate-500"><Search className="h-3 w-3"/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-200 outline-none" placeholder="Buscar itens da etapa anterior…"/></label><div className="mt-2 flex justify-between text-[9px] text-slate-500"><label className="flex items-center gap-1"><input type="checkbox" checked={selectable.length > 0 && selectable.every(row => selected.has(row.id))} onChange={event => setSelected(event.target.checked ? new Set(selectable.map(row => row.id)) : new Set())}/>Selecionar todos ainda não importados</label><span>{selected.size} selecionado(s) · {rows.length} item(ns)</span></div></div>
      <div className="min-h-0 flex-1 overflow-auto border-y border-slate-900">{filtered.map(row => { const rowDisabled = disabled(row); return <label key={row.id} className={`flex items-start gap-3 border-b border-slate-900 p-3 ${rowDisabled ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-slate-950"}`}><input className="mt-0.5" type="checkbox" disabled={rowDisabled} checked={selected.has(row.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })}/><span className="min-w-0 flex-1 text-[10px] text-slate-300"><strong className="block text-slate-100">{label(row)}</strong>{details?.(row)}{rowDisabled && <span className="mt-1 block text-cyan-400">{disabledReason?.(row) || "Já importado na etapa atual"}</span>}</span><WorkflowStatusBadge status={status?.(row) || (rowDisabled ? "sent_writer" : "approved")}/></label>; })}{loading && !filtered.length && <div className="flex items-center justify-center gap-2 p-8 text-[10px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin"/>Atualizando itens da etapa anterior…</div>}{error && !loading && !filtered.length && <div className="p-8 text-center text-[10px] text-red-300"><p>Não foi possível atualizar os itens: {error}</p>{onRetry && <button type="button" className="mt-3 rounded border border-red-900 px-3 py-1 text-red-200" onClick={() => void onRetry()}>Tentar novamente</button>}</div>}{!loading && !error && !filtered.length && <div className="p-8 text-center text-[10px] text-slate-600">{emptyMessage || "Nenhum item disponível. Conclua a aprovação na etapa anterior primeiro."}</div>}</div>
      <footer className="flex items-center justify-between p-3"><p className="text-[9px] text-slate-600">A importação não altera o conteúdo aprovado na etapa anterior.</p><button type="button" disabled={!selected.size || importing} onClick={() => void importSelected()} className="inline-flex h-8 items-center rounded border border-emerald-800 bg-emerald-950/20 px-3 text-[10px] font-bold text-emerald-300 disabled:opacity-40"><Plus className="mr-1 h-3 w-3"/>{importing ? "Importando…" : `Importar ${selected.size || ""}`}</button></footer>
    </section>
  </div>;
}
