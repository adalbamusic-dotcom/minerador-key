"use client";

import { useState } from "react";
import { History, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import type { EditorialHistoryEntry } from "@/lib/editorial/history";

const control = "inline-flex h-7 items-center gap-1 rounded border border-slate-800 bg-[#0b0c10] px-2 text-[9px] text-slate-400 hover:border-indigo-700 hover:text-white disabled:opacity-30";

export function HistoryControls<T>({ entries, canUndo, canRedo, onUndo, onRedo, onRestore, compact = false }: {
  entries: Array<EditorialHistoryEntry<T>>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRestore: (id: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="flex items-center gap-1">
      <button className={control} onClick={onUndo} disabled={!canUndo} title="Desfazer última alteração"><Undo2 className="h-3 w-3"/>{!compact && "Desfazer"}</button>
      <button className={control} onClick={onRedo} disabled={!canRedo} title="Refazer alteração"><Redo2 className="h-3 w-3"/>{!compact && "Refazer"}</button>
      <button className={control} onClick={() => setOpen(true)} title="Ver histórico de segurança"><History className="h-3 w-3"/>Histórico ({entries.length})</button>
    </div>
    {open && <div className="fixed inset-0 z-[120] flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Histórico de segurança">
      <aside className="flex h-full w-[min(430px,100vw)] flex-col border-l border-slate-800 bg-[#090a0e] shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-800 p-4"><div><p className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">Histórico de segurança</p><h2 className="mt-1 text-sm font-bold text-white">Alterações desta sessão</h2><p className="mt-1 text-[9px] text-slate-500">Restaurar cria antes um ponto de retorno. Nenhuma restauração altera publicados protegidos no banco.</p></div><button className={control} onClick={() => setOpen(false)} aria-label="Fechar histórico"><X className="h-3 w-3"/></button></header>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">{[...entries].reverse().map(entry => <article key={entry.id} className="rounded border border-slate-800 bg-[#0b0c10] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold text-slate-200">{entry.label}</p><p className="mt-1 text-[8px] uppercase tracking-wider text-slate-600">{entry.module} · {new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div><button className={control} onClick={() => onRestore(entry.id)}><RotateCcw className="h-3 w-3"/>Restaurar</button></div></article>)}{entries.length === 0 && <p className="py-12 text-center text-[10px] text-slate-600">Nenhuma alteração registrada nesta sessão.</p>}</div>
      </aside>
    </div>}
  </>;
}
