"use client";

import { AlertTriangle, CheckCircle2, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { DeletionImpactEntry } from "@/lib/lifecycle";
import { typedConfirmationMatches } from "@/lib/lifecycle/typed-confirmation";
import { TypedConfirmField } from "./typed-confirm-field";

export type DeletionImpactSummaryEntry = Pick<DeletionImpactEntry, "key" | "label"> & { count?: number };

export function DeletionImpactSummary({ entries }: { entries: readonly DeletionImpactSummaryEntry[] }) {
  const visible = entries.filter(entry => entry.count === undefined || entry.count > 0);
  if (!visible.length) return null;
  const preview = visible.slice(0, 4);
  const remainder = visible.slice(4);
  const renderEntry = (entry: DeletionImpactSummaryEntry) => <li key={entry.key} className="flex items-start gap-2"><span className="mt-0.5 text-context-accent" aria-hidden="true">•</span><span>{typeof entry.count === "number" ? <strong className="font-semibold text-foreground">{entry.count}</strong> : null}{typeof entry.count === "number" ? " " : null}{entry.label}</span></li>;
  return <div className="rounded-md border border-divider bg-surface-subtle p-3 text-sm text-text-muted">
    <p className="mb-2 font-semibold text-foreground">Impacto resumido</p>
    <ul className="space-y-1">
      {preview.map(renderEntry)}
    </ul>
    {remainder.length > 0 ? <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/40">Ver mais {remainder.length} impactos</summary>
      <ul className="mt-2 space-y-1">
        {remainder.map(renderEntry)}
      </ul>
    </details> : null}
  </div>;
}

function useEscape(onCancel: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, open]);
}

function LifecycleDialogShell({ open, title, description, children, onCancel, danger = false, eyebrow = "Ciclo de vida" }: {
  open: boolean;
  title: string;
  description: string;
  children: ReactNode;
  onCancel: () => void;
  danger?: boolean;
  eyebrow?: string;
}) {
  const titleId = useId();
  useEscape(onCancel, open);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-divider bg-surface-elevated text-foreground shadow-lg">
      <header className="flex items-start justify-between gap-3 border-b border-divider p-4">
        <div className="flex min-w-0 items-start gap-3"><AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${danger ? "text-danger" : "text-warning"}`} aria-hidden="true"/><div className="min-w-0"><p className={`text-xs font-semibold uppercase tracking-wider ${danger ? "text-danger" : "text-warning"}`}>{eyebrow}</p><h2 id={titleId} className="mt-1 text-base font-semibold">{title}</h2></div></div>
        <button type="button" onClick={onCancel} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label="Cancelar ação"><X className="h-4 w-4" aria-hidden="true"/></button>
      </header>
      <div className="space-y-4 p-4"><p className="text-sm leading-5 text-text-muted">{description}</p>{children}</div>
    </section>
  </div>;
}

export type DeleteConfirmationProps = {
  open: boolean;
  title: string;
  description: string;
  confirmationName: string;
  impact?: readonly DeletionImpactSummaryEntry[];
  confirmLabel?: string;
  notice?: string | null;
  eyebrow?: string;
  onCancel: () => void;
  onConfirm: () => void | boolean | Promise<void | boolean>;
};

export function DeleteConfirmation(props: DeleteConfirmationProps) {
  if (!props.open) return null;
  return <DeleteConfirmationContent {...props}/>;
}

function DeleteConfirmationContent({ open, title, description, confirmationName, impact = [], confirmLabel = "Excluir", notice = "A exclusão é definitiva. Se a confirmação falhar, nada será apagado.", eyebrow = "Ciclo de vida", onCancel, onConfirm }: DeleteConfirmationProps) {
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const matches = typedConfirmationMatches(typed, confirmationName);
  const close = () => { if (!confirming) { setTyped(""); onCancel(); } };
  const confirm = async () => {
    if (!matches) return;
    setConfirming(true);
    try { await onConfirm(); setTyped(""); } finally { setConfirming(false); }
  };
  return <LifecycleDialogShell open={open} title={title} description={description} onCancel={close} danger eyebrow={eyebrow}>
    <DeletionImpactSummary entries={impact}/>
    <TypedConfirmField confirmationName={confirmationName} value={typed} onChange={setTyped} disabled={confirming} onKeyDown={event => { if (event.key === "Enter" && matches) { event.preventDefault(); void confirm(); } }}/>
    {notice === null ? null : <p className="text-sm leading-5 text-text-muted">{notice}</p>}
    <footer className="flex flex-wrap justify-end gap-2 border-t border-divider pt-3"><button type="button" onClick={close} className="min-h-10 rounded-md border border-divider px-3 text-sm font-medium text-text-muted hover:bg-surface hover:text-foreground">Cancelar</button><button type="button" onClick={() => void confirm()} disabled={!matches || confirming} className="min-h-10 rounded-md border border-danger/50 bg-danger-soft px-3 text-sm font-semibold text-danger hover:bg-danger-soft/80 disabled:cursor-not-allowed disabled:opacity-50">{confirming ? "Excluindo…" : confirmLabel}</button></footer>
    </LifecycleDialogShell>;
}

export type PublishedDeleteConfirmationProps = {
  open: boolean;
  title?: string;
  description: string;
  confirmationName: string;
  impact?: readonly DeletionImpactSummaryEntry[];
  onCancel: () => void;
  onConfirm: () => void | boolean | Promise<void | boolean>;
};

export function PublishedDeleteConfirmation(props: PublishedDeleteConfirmationProps) {
  if (!props.open) return null;
  return <PublishedDeleteConfirmationContent {...props}/>;
}

function PublishedDeleteConfirmationContent({ open, title = "Remover item publicado?", description, confirmationName, impact = [], onCancel, onConfirm }: PublishedDeleteConfirmationProps) {
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const matches = typedConfirmationMatches(typed, confirmationName);
  const close = () => { if (!confirming) { setTyped(""); onCancel(); } };
  const confirm = async () => {
    if (!matches) return;
    setConfirming(true);
    try { await onConfirm(); setTyped(""); } finally { setConfirming(false); }
  };
  return <LifecycleDialogShell open={open} title={title} description={description} onCancel={close}>
    <div className="rounded-md border border-warning/35 bg-warning-soft p-3 text-sm leading-5 text-text-muted"><p className="font-semibold text-foreground">O item sairá da operação normal e poderá ser restaurado por 24 horas.</p><p className="mt-1">A publicação, a URL, o canonical e a proveniência canônica não serão apagados nesta etapa.</p></div>
    <DeletionImpactSummary entries={impact}/>
    <TypedConfirmField confirmationName={confirmationName} value={typed} onChange={setTyped} disabled={confirming} onKeyDown={event => { if (event.key === "Enter" && matches) { event.preventDefault(); void confirm(); } }}/>
    <footer className="flex flex-wrap justify-end gap-2 border-t border-divider pt-3"><button type="button" onClick={close} className="min-h-10 rounded-md border border-divider px-3 text-sm font-medium text-text-muted hover:bg-surface hover:text-foreground">Cancelar</button><button type="button" onClick={() => void confirm()} disabled={!matches || confirming} className="min-h-10 rounded-md border border-warning/50 bg-warning-soft px-3 text-sm font-semibold text-foreground hover:bg-warning-soft/80 disabled:cursor-not-allowed disabled:opacity-50">{confirming ? "Confirmando…" : "Remover por 24 horas"}</button></footer>
  </LifecycleDialogShell>;
}

export function RecoveryAction({ onRestore, disabled = false, label = "Restaurar" }: { onRestore: () => void | Promise<void>; disabled?: boolean; label?: string }) {
  return <button type="button" onClick={() => void onRestore()} disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-success/40 bg-success-soft px-3 text-sm font-semibold text-foreground hover:bg-success-soft/80 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="h-4 w-4" aria-hidden="true"/>{label}<CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true"/></button>;
}
