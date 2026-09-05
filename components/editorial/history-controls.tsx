"use client";

import { useEffect, useRef, useState } from "react";
import { History, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import type { EditorialHistoryEntry } from "@/lib/editorial/history";
import { AnchoredPopover } from "./anchored-popover";

const legacyCompactControl = "inline-flex h-7 items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 text-[9px] text-slate-400 hover:border-module-accent/40 hover:text-white disabled:opacity-30";
const legacyComfortableControl = "inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35 disabled:cursor-not-allowed disabled:opacity-40";
const semanticCompactControl = "inline-flex min-h-8 items-center gap-1 rounded border border-divider bg-surface-subtle px-2 text-sm text-text-muted transition-colors hover:border-module-accent/40 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-30";
const semanticComfortableControl = "inline-flex min-h-9 items-center gap-2 rounded-lg border border-divider bg-surface px-3 text-sm text-foreground/85 transition-colors hover:border-module-accent/45 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35 disabled:cursor-not-allowed disabled:opacity-40";
const semanticPanel = {
  drawer: "bg-background/60",
  drawerAside: "border-divider bg-surface",
  popover: "border-divider bg-surface-elevated",
  header: "border-divider",
  title: "text-context-accent",
  heading: "text-foreground",
  description: "text-text-muted",
  entry: "border-divider bg-surface-subtle",
  entryLabel: "text-foreground",
  entryMeta: "text-text-muted",
  empty: "text-text-muted",
};

export function HistoryControls<T>({ entries, canUndo, canRedo, onUndo, onRedo, onRestore, compact = false, density = "compact", presentation = "drawer", moduleId, showHistory = true, showUndoRedo = true, visualVariant = "legacy" }: {
  entries: Array<EditorialHistoryEntry<T>>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRestore: (id: string) => void;
  compact?: boolean;
  density?: "compact" | "comfortable";
  presentation?: "drawer" | "popover";
  moduleId?: string;
  showHistory?: boolean;
  showUndoRedo?: boolean;
  visualVariant?: "legacy" | "semantic";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverTriggerRef = useRef<HTMLElement | null>(null);
  const control = visualVariant === "semantic"
    ? density === "comfortable" ? semanticComfortableControl : semanticCompactControl
    : density === "comfortable" ? legacyComfortableControl : legacyCompactControl;
  const panel = <HistoryPanel entries={entries} onRestore={onRestore} onClose={() => setOpen(false)} control={control} visualVariant={visualVariant}/>;

  useEffect(() => {
    if (!moduleId) return;
    const onGlobalHistoryRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ module?: string }>).detail;
      if (detail?.module !== moduleId) return;
      popoverTriggerRef.current = document.querySelector(`[data-global-topbar-history-button="${moduleId}"]`);
      setOpen(true);
    };
    window.addEventListener("global-topbar-history", onGlobalHistoryRequest);
    return () => window.removeEventListener("global-topbar-history", onGlobalHistoryRequest);
  }, [moduleId]);

  return <div ref={triggerRef}>
    <div className="flex items-center gap-1">
      {showUndoRedo && <>
        <button className={control} onClick={onUndo} disabled={!canUndo} title="Desfazer última alteração"><Undo2 className="h-3 w-3"/>{!compact && "Desfazer"}</button>
        <button className={control} onClick={onRedo} disabled={!canRedo} title="Refazer alteração"><Redo2 className="h-3 w-3"/>{!compact && "Refazer"}</button>
      </>}
      {showHistory && <button className={control} onClick={() => { popoverTriggerRef.current = triggerRef.current; setOpen(value => !value); }} title="Ver histórico da sessão" aria-expanded={open}><History className="h-3 w-3"/>Histórico da sessão ({entries.length})</button>}
    </div>
    {open && presentation === "drawer" && <div className={`fixed inset-0 z-[120] flex justify-end ${visualVariant === "semantic" ? semanticPanel.drawer : "bg-black/60"}`} role="dialog" aria-modal="true" aria-label="Histórico da sessão"><aside className={`flex h-full w-[min(430px,100vw)] flex-col border-l shadow-2xl ${visualVariant === "semantic" ? semanticPanel.drawerAside : "border-slate-800 bg-[#090a0e]"}`}>{panel}</aside></div>}
    <AnchoredPopover open={open && presentation === "popover"} onClose={() => setOpen(false)} triggerRef={popoverTriggerRef} ariaLabel="Histórico da sessão" className={`flex w-[min(430px,calc(100vw-1rem))] flex-col p-0 ${visualVariant === "semantic" ? semanticPanel.popover : "border-slate-800 bg-[#090a0e]"}`}>{panel}</AnchoredPopover>
  </div>;
}

function HistoryPanel<T>({ entries, onRestore, onClose, control, visualVariant }: { entries: Array<EditorialHistoryEntry<T>>; onRestore: (id: string) => void; onClose: () => void; control: string; visualVariant: "legacy" | "semantic" }) {
  const panel = visualVariant === "semantic" ? semanticPanel : {
    header: "border-slate-800",
    title: "text-context-accent",
    heading: "text-white",
    description: "text-slate-500",
    entry: "border-slate-800 bg-[#0b0c10]",
    entryLabel: "text-slate-200",
    entryMeta: "text-slate-600",
    empty: "text-slate-600",
  };
  return <>
    <header className={`flex items-start justify-between border-b p-4 ${panel.header}`}><div><p className={`text-xs font-bold uppercase tracking-widest ${panel.title}`}>Histórico da sessão</p><h2 className={`mt-1 text-sm font-bold ${panel.heading}`}>Alterações desta sessão</h2><p className={`mt-1 text-sm leading-5 ${panel.description}`}>Este histórico é temporário da sessão; versões e auditoria canônicas permanecem separadas.</p></div><button className={control} onClick={onClose} aria-label="Fechar histórico"><X className="h-3 w-3"/></button></header>
    <div className="flex-1 space-y-2 overflow-y-auto p-3">{[...entries].reverse().map(entry => <article key={entry.id} className={`rounded border p-3 ${panel.entry}`}><div className="flex items-start justify-between gap-3"><div><p className={`text-sm font-semibold ${panel.entryLabel}`}>{entry.label}</p><p className={`mt-1 text-xs uppercase tracking-wider ${panel.entryMeta}`}>{entry.module} · {new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div><button className={control} onClick={() => onRestore(entry.id)}><RotateCcw className="h-3 w-3"/>Restaurar</button></div></article>)}{entries.length === 0 && <p className={`py-12 text-center text-sm ${panel.empty}`}>Nenhuma alteração registrada nesta sessão.</p>}</div>
  </>;
}
