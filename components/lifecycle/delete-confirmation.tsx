"use client";

import { AlertTriangle, CheckCircle2, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { DeletionImpactEntry } from "@/lib/lifecycle";
import { checkDeleteConfirmation, typedConfirmationMatches, type DeleteConfirmationRequirement, type DeleteConfirmationTyped } from "@/lib/lifecycle/typed-confirmation";
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

/*
 * 2026-10-17 · A confirmação FORTE da regra única da exclusão
 * (`lib/lifecycle/typed-confirmation.ts`; SDD da linha única do Minerador, P-4):
 * o nome de cada cor cujo plano muda, "apaga de vez" quando há exclusão
 * definitiva e o nome de cada publicada. Opcional e aditiva: sem `requirement`
 * (ou com a confirmação simples), os diálogos são os de sempre — o nome digitado.
 */
const STRONG_FIELD = "min-h-10 w-full rounded-md border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-context-accent focus:ring-2 focus:ring-context-accent/25 disabled:cursor-wait disabled:opacity-60";

function StrongConfirmFields({ requirement, typed, onChange, onSubmit, disabled }: {
  requirement: DeleteConfirmationRequirement;
  typed: DeleteConfirmationTyped;
  onChange: (next: DeleteConfirmationTyped) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const baseId = useId();
  const valor = (value: unknown) => (typeof value === "string" ? value : "");
  const cores = typed.colors ?? {};
  const nomes = typed.publishedNames ?? {};
  const conferida = checkDeleteConfirmation(requirement, typed);
  const digitouAlgo = Object.values(cores).some(Boolean) || Boolean(valor(typed.phrase)) || Object.values(nomes).some(Boolean);
  const enter = (event: { key: string; preventDefault: () => void }) => { if (event.key === "Enter" && conferida.ok) { event.preventDefault(); onSubmit(); } };
  return <div className="space-y-3" data-delete-strong-confirmation>
    {requirement.colorWords.map((cor, indice) => <div key={cor} className="space-y-1">
      <label htmlFor={`${baseId}-cor-${indice}`} className="block text-sm leading-5 text-text-muted">Digite o nome da cor: <strong className="break-words font-semibold text-foreground">{cor}</strong></label>
      <input id={`${baseId}-cor-${indice}`} type="text" value={valor(cores[cor])} disabled={disabled} autoFocus={indice === 0} autoComplete="off" spellCheck={false} onKeyDown={enter} onChange={event => onChange({ ...typed, colors: { ...cores, [cor]: event.target.value } })} className={STRONG_FIELD} data-delete-strong-color={cor}/>
    </div>)}
    {requirement.hardPhrase ? <div className="space-y-1">
      <label htmlFor={`${baseId}-frase`} className="block text-sm leading-5 text-text-muted">Há exclusão definitiva. Digite: <strong className="font-semibold text-foreground">{requirement.hardPhrase}</strong></label>
      <input id={`${baseId}-frase`} type="text" value={valor(typed.phrase)} disabled={disabled} autoFocus={requirement.colorWords.length === 0} autoComplete="off" spellCheck={false} onKeyDown={enter} onChange={event => onChange({ ...typed, phrase: event.target.value })} className={STRONG_FIELD} data-delete-strong-phrase/>
    </div> : null}
    {requirement.publishedNames.map((publicada, indice) => <div key={publicada.id} className="space-y-1">
      <label htmlFor={`${baseId}-pub-${indice}`} className="block text-sm leading-5 text-text-muted">Publicada (lixeira de 24 h). Digite: <strong className="break-words font-semibold text-foreground">{publicada.keyword}</strong></label>
      <input id={`${baseId}-pub-${indice}`} type="text" value={valor(nomes[publicada.id])} disabled={disabled} autoFocus={!requirement.colorWords.length && !requirement.hardPhrase && indice === 0} autoComplete="off" spellCheck={false} onKeyDown={enter} onChange={event => onChange({ ...typed, publishedNames: { ...nomes, [publicada.id]: event.target.value } })} className={STRONG_FIELD} data-delete-strong-published={publicada.id}/>
    </div>)}
    {digitouAlgo && !conferida.ok ? <p className="text-sm leading-5 text-text-muted" role="status">Falta: {conferida.missing.join(", ")}.</p> : null}
  </div>;
}

/** O estado do que foi digitado: a confirmação simples (o nome) ou a forte (a regra única). */
function useDeleteTyped(confirmationName: string, requirement: DeleteConfirmationRequirement | null | undefined) {
  const forte = requirement && requirement.selectionName === null ? requirement : null;
  const [simples, setSimples] = useState("");
  const [digitado, setDigitado] = useState<DeleteConfirmationTyped>({});
  const matches = forte ? checkDeleteConfirmation(forte, digitado).ok : typedConfirmationMatches(simples, confirmationName);
  const reset = () => { setSimples(""); setDigitado({}); };
  const typed = (): DeleteConfirmationTyped => (forte ? digitado : { selection: simples });
  return { forte, simples, setSimples, digitado, setDigitado, matches, reset, typed };
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
  /** 2026-10-17 · a regra única: com a confirmação forte, os campos dela substituem o nome digitado. */
  requirement?: DeleteConfirmationRequirement | null;
  /** 2026-10-17 · o que a prévia diz além do impacto (ex.: o plano do Silo de cada cor). */
  details?: ReactNode;
  onCancel: () => void;
  /** Recebe o que foi digitado (a tela manda ao servidor, que confere pela mesma regra). */
  onConfirm: (typed: DeleteConfirmationTyped) => void | boolean | Promise<void | boolean>;
};

export function DeleteConfirmation(props: DeleteConfirmationProps) {
  if (!props.open) return null;
  return <DeleteConfirmationContent {...props}/>;
}

function DeleteConfirmationContent({ open, title, description, confirmationName, impact = [], confirmLabel = "Excluir", notice = "A exclusão é definitiva. Se a confirmação falhar, nada será apagado.", eyebrow = "Ciclo de vida", requirement, details, onCancel, onConfirm }: DeleteConfirmationProps) {
  const estado = useDeleteTyped(confirmationName, requirement);
  const [confirming, setConfirming] = useState(false);
  const matches = estado.matches;
  const close = () => { if (!confirming) { estado.reset(); onCancel(); } };
  const confirm = async () => {
    if (!matches) return;
    setConfirming(true);
    try { await onConfirm(estado.typed()); estado.reset(); } finally { setConfirming(false); }
  };
  return <LifecycleDialogShell open={open} title={title} description={description} onCancel={close} danger eyebrow={eyebrow}>
    {details ?? null}
    <DeletionImpactSummary entries={impact}/>
    {estado.forte
      ? <StrongConfirmFields requirement={estado.forte} typed={estado.digitado} onChange={estado.setDigitado} onSubmit={() => void confirm()} disabled={confirming}/>
      : <TypedConfirmField confirmationName={confirmationName} value={estado.simples} onChange={estado.setSimples} disabled={confirming} onKeyDown={event => { if (event.key === "Enter" && matches) { event.preventDefault(); void confirm(); } }}/>}
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
  /** 2026-10-17 · a regra única: com a confirmação forte, os campos dela substituem o nome digitado. */
  requirement?: DeleteConfirmationRequirement | null;
  /** 2026-10-17 · o que a prévia diz além do impacto (ex.: o plano do Silo de cada cor). */
  details?: ReactNode;
  onCancel: () => void;
  /** Recebe o que foi digitado (a tela manda ao servidor, que confere pela mesma regra). */
  onConfirm: (typed: DeleteConfirmationTyped) => void | boolean | Promise<void | boolean>;
};

export function PublishedDeleteConfirmation(props: PublishedDeleteConfirmationProps) {
  if (!props.open) return null;
  return <PublishedDeleteConfirmationContent {...props}/>;
}

function PublishedDeleteConfirmationContent({ open, title = "Remover item publicado?", description, confirmationName, impact = [], requirement, details, onCancel, onConfirm }: PublishedDeleteConfirmationProps) {
  const estado = useDeleteTyped(confirmationName, requirement);
  const [confirming, setConfirming] = useState(false);
  const matches = estado.matches;
  const close = () => { if (!confirming) { estado.reset(); onCancel(); } };
  const confirm = async () => {
    if (!matches) return;
    setConfirming(true);
    try { await onConfirm(estado.typed()); estado.reset(); } finally { setConfirming(false); }
  };
  return <LifecycleDialogShell open={open} title={title} description={description} onCancel={close}>
    <div className="rounded-md border border-warning/35 bg-warning-soft p-3 text-sm leading-5 text-text-muted"><p className="font-semibold text-foreground">O item sairá da operação normal e poderá ser restaurado por 24 horas.</p><p className="mt-1">A publicação, a URL, o canonical e a proveniência canônica não serão apagados nesta etapa.</p></div>
    {details ?? null}
    <DeletionImpactSummary entries={impact}/>
    {estado.forte
      ? <StrongConfirmFields requirement={estado.forte} typed={estado.digitado} onChange={estado.setDigitado} onSubmit={() => void confirm()} disabled={confirming}/>
      : <TypedConfirmField confirmationName={confirmationName} value={estado.simples} onChange={estado.setSimples} disabled={confirming} onKeyDown={event => { if (event.key === "Enter" && matches) { event.preventDefault(); void confirm(); } }}/>}
    <footer className="flex flex-wrap justify-end gap-2 border-t border-divider pt-3"><button type="button" onClick={close} className="min-h-10 rounded-md border border-divider px-3 text-sm font-medium text-text-muted hover:bg-surface hover:text-foreground">Cancelar</button><button type="button" onClick={() => void confirm()} disabled={!matches || confirming} className="min-h-10 rounded-md border border-warning/50 bg-warning-soft px-3 text-sm font-semibold text-foreground hover:bg-warning-soft/80 disabled:cursor-not-allowed disabled:opacity-50">{confirming ? "Confirmando…" : "Remover por 24 horas"}</button></footer>
  </LifecycleDialogShell>;
}

export function RecoveryAction({ onRestore, disabled = false, label = "Restaurar" }: { onRestore: () => void | Promise<void>; disabled?: boolean; label?: string }) {
  return <button type="button" onClick={() => void onRestore()} disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-success/40 bg-success-soft px-3 text-sm font-semibold text-foreground hover:bg-success-soft/80 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="h-4 w-4" aria-hidden="true"/>{label}<CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true"/></button>;
}
