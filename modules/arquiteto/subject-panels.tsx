"use client";

import React, { useEffect, useRef, useState, type RefObject } from "react";
import {
  SUBJECT_ATTACH_ACTION_LABEL,
  SUBJECT_DETACH_ACTION_LABEL,
  SUBJECT_FILTER_LABEL,
  SUBJECT_SILO_SUGGESTION_ACTION_LABEL,
  SUBJECT_SUGGESTION_SIGNAL_LABELS,
  type SubjectSupportSuggestion,
} from "@/lib/arquiteto/declared-subject";
import {
  SUBJECT_PHRASE_SERP_HINT,
  SUBJECT_SILO_SCOPE_NOTE,
  SUBJECT_SUPPORT_PRINCIPAL_HINT,
  SUBJECT_SUPPORT_WITHOUT_SILO,
  SUBJECT_VERSION_NOTE,
  SUBJECT_WORKING_ANCHOR_NOTE,
  type SubjectAttachOption,
  type SubjectFilterEntry,
} from "./subject-workspace-model";

/**
 * O ASSUNTO NA MESA DO ARQUITETO (SDD 2026-09-24, F2.2 a F2.4).
 *
 * Um painel com o filtro "Assuntos" e dois diálogos: prender o Assunto numa
 * unidade (artigo, landing, página de serviço ou Silo) e marcar as keywords
 * de sustentação. A tela não decide nada: as recusas e as sugestões chegam
 * prontas do domínio, e toda gravação é ato humano confirmado pelo remoto.
 *
 * Superfície e botões são os do Arquiteto; as classes chegam por prop, como
 * no plano de chamadas pagas, para não haver um segundo estilo de botão.
 */

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Foco do diálogo: entra nele ao abrir, o Tab fica contido, Escape fecha e,
 * ao fechar, o foco volta ao botão que abriu.
 */
function useSubjectDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>, onClose: () => void, closeEnabled: boolean) {
  const onCloseRef = useRef(onClose);
  const closeEnabledRef = useRef(closeEnabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeEnabledRef.current = closeEnabled;
  });
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const current = dialogRef.current;
      if (!current) return;
      if (event.key === "Escape") {
        if (closeEnabledRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const active = document.activeElement;
      if (!focusable.length) { event.preventDefault(); current.focus(); return; }
      const head = focusable[0];
      const tail = focusable[focusable.length - 1];
      const outside = !(active instanceof Node) || !current.contains(active);
      if (event.shiftKey && (outside || active === head || active === current)) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && (outside || active === tail)) { event.preventDefault(); head.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, dialogRef]);
}

const badgeBase = "inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-sm font-medium";

/** Selo de conservação: tronco, aguardando sustentação ou retirado. */
export function SubjectConservationBadge({ label, tone, testId }: { label: string; tone: "trunk" | "awaiting" | "withdrawn"; testId?: string }) {
  const toneClass = tone === "trunk"
    ? "border-context-accent/40 bg-context-accent/10 text-context-accent"
    : tone === "awaiting"
      ? "border-pending/40 bg-pending-soft text-pending"
      : "border-warning/40 bg-warning-soft text-warning";
  return <span className={`${badgeBase} ${toneClass}`} data-testid={testId}>{label}</span>;
}

export type SubjectAnchorView = {
  ref: string;
  kind: "article" | "silo";
  label: string;
  unitLabel: string;
  /** Definição gravada; sem ela, é a formação desta sessão. */
  persisted: boolean;
  warning: string | null;
};

export type SubjectSiloSuggestionView = { ref: string; label: string; reason: string };

export function SubjectFilterPanel({
  entries,
  selectedKeywordId,
  anchors,
  siloSuggestions,
  busy,
  buttonClassName,
  primaryButtonClassName,
  onSelect,
  onOpenAttach,
  onOpenSupport,
  onDetach,
  onConfirmSiloSuggestion,
}: {
  entries: readonly SubjectFilterEntry[];
  selectedKeywordId: string | null;
  anchors: readonly SubjectAnchorView[];
  siloSuggestions: readonly SubjectSiloSuggestionView[];
  busy: boolean;
  buttonClassName: string;
  primaryButtonClassName: string;
  onSelect: (keywordId: string | null) => void;
  onOpenAttach: () => void;
  onOpenSupport: () => void;
  onDetach: (anchor: SubjectAnchorView) => void;
  onConfirmSiloSuggestion: (ref: string) => void;
}) {
  const selected = entries.find(entry => entry.keywordId === selectedKeywordId) ?? null;
  const pressed = (active: boolean) => active
    ? "border-module-accent/60 bg-module-accent/10 text-foreground"
    : "border-divider bg-surface-subtle text-foreground/80 hover:border-module-accent/30 hover:bg-surface-elevated";
  return (
    <section className="border-b border-context-accent/30 bg-surface-subtle px-4 py-4" data-testid="architect-subject-panel" aria-labelledby="architect-subject-panel-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="architect-subject-panel-title" className="text-sm font-bold uppercase tracking-widest text-context-accent">
          {SUBJECT_FILTER_LABEL} · {entries.length}
        </h2>
        <span className="text-sm text-text-muted">Frases declaradas no Minerador como tronco de um ou mais artigos</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Filtro ${SUBJECT_FILTER_LABEL}`} data-testid="architect-subject-filter">
        <button
          type="button"
          aria-pressed={selectedKeywordId === null}
          onClick={() => onSelect(null)}
          className={`inline-flex min-h-8 items-center rounded border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 ${pressed(selectedKeywordId === null)}`}
        >
          Todos os artigos
        </button>
        {entries.map(entry => (
          <button
            key={entry.keywordId}
            type="button"
            aria-pressed={selectedKeywordId === entry.keywordId}
            onClick={() => onSelect(selectedKeywordId === entry.keywordId ? null : entry.keywordId)}
            data-testid="architect-subject-filter-option"
            className={`inline-flex min-h-8 items-center gap-2 rounded border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 ${pressed(selectedKeywordId === entry.keywordId)}`}
          >
            <span className="font-medium text-keyword">{entry.phrase}</span>
            <span className="text-text-muted">{entry.label}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-3 grid gap-3 rounded-md border border-divider bg-surface p-3" data-testid="architect-subject-detail">
          <div className="min-w-0">
            <p className="text-sm leading-6">
              <span className="text-text-muted">Assunto: </span>
              <span className="font-semibold text-keyword">{selected.phrase}</span>
              <span className="text-text-muted"> · {selected.volumeValidated ? "Volume validado no pacote" : "sem Volume validado: fica como tronco, nunca como principal"}</span>
            </p>
            {selected.note && <p className="text-sm leading-6 text-foreground/85">Nota: {selected.note}</p>}
            {selected.destinationUrl && <p className="break-all text-sm leading-6 text-text-muted">Página de destino declarada: {selected.destinationUrl}</p>}
            {selected.withdrawn && (
              <p className="mt-1 text-sm leading-6 text-warning" role="status" data-testid="architect-subject-withdrawn">
                O Minerador retirou esta declaração. Os artigos continuam com o Assunto até alguém soltá-lo: nada foi trocado sozinho.
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground/80">Preso em</p>
            {anchors.length === 0 ? (
              <p className="text-sm leading-6 text-text-muted">Nenhuma unidade ainda. O Assunto fica em Keywords não agrupadas até ter sustentação.</p>
            ) : (
              <ul className="mt-1 grid gap-1.5" data-testid="architect-subject-anchors">
                {anchors.map(anchor => (
                  <li key={`${anchor.kind}:${anchor.ref}`} className="flex flex-wrap items-start justify-between gap-2 rounded border border-divider bg-surface-subtle px-3 py-2">
                    <div className="min-w-0 text-sm leading-6">
                      <span className="text-text-muted">{anchor.unitLabel}: </span>
                      <span className="font-medium text-foreground">{anchor.label}</span>
                      {!anchor.persisted && <span className="block text-text-muted">{SUBJECT_WORKING_ANCHOR_NOTE}</span>}
                      {anchor.warning && <span className="block text-warning" role="status" data-testid="architect-subject-warning">{anchor.warning}</span>}
                    </div>
                    <button type="button" disabled={busy} onClick={() => onDetach(anchor)} className={buttonClassName} data-testid="architect-subject-detach" aria-label={`${SUBJECT_DETACH_ACTION_LABEL} de ${anchor.unitLabel} ${anchor.label}`}>
                      {SUBJECT_DETACH_ACTION_LABEL}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {siloSuggestions.length > 0 && (
            <div data-testid="architect-subject-silo-suggestions">
              <p className="text-sm font-semibold text-foreground/80">Sugestão do Silo</p>
              <ul className="mt-1 grid gap-1.5">
                {siloSuggestions.map(suggestion => (
                  <li key={suggestion.ref} className="flex flex-wrap items-start justify-between gap-2 rounded border border-pending/35 bg-pending-soft px-3 py-2">
                    <span className="min-w-0 text-sm leading-6 text-foreground/85">{suggestion.reason}</span>
                    <button type="button" disabled={busy} onClick={() => onConfirmSiloSuggestion(suggestion.ref)} className={buttonClassName} aria-label={`${SUBJECT_SILO_SUGGESTION_ACTION_LABEL} em ${suggestion.label}`}>
                      {SUBJECT_SILO_SUGGESTION_ACTION_LABEL}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !selected.attachable} onClick={onOpenAttach} className={primaryButtonClassName} data-testid="architect-subject-attach-open">
              {SUBJECT_ATTACH_ACTION_LABEL}
            </button>
            <button type="button" disabled={busy || !selected.attachable} onClick={onOpenSupport} className={buttonClassName} data-testid="architect-subject-support-open">
              Sugestões de sustentação
            </button>
          </div>
          <p className="text-sm leading-6 text-text-muted" data-testid="architect-subject-serp-hint">{SUBJECT_PHRASE_SERP_HINT}</p>
        </div>
      )}
    </section>
  );
}

export function SubjectAttachDialog({
  open,
  subjectPhrase,
  options,
  busy,
  buttonClassName,
  primaryButtonClassName,
  onAttach,
  onClose,
}: {
  open: boolean;
  subjectPhrase: string;
  options: readonly SubjectAttachOption[];
  busy: boolean;
  buttonClassName: string;
  primaryButtonClassName: string;
  onAttach: (option: SubjectAttachOption) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useSubjectDialogFocus(open, dialogRef, onClose, !busy);
  if (!open) return null;
  const artigos = options.filter(option => option.kind === "article");
  const silos = options.filter(option => option.kind === "silo");
  const grupo = (titulo: string, lista: readonly SubjectAttachOption[]) => lista.length > 0 && (
    <div>
      <h3 className="text-sm font-semibold text-foreground/80">{titulo}</h3>
      <ul className="mt-1 grid gap-1.5">
        {lista.map(option => (
          <li key={`${option.kind}:${option.ref}`} className="flex flex-wrap items-start justify-between gap-2 rounded border border-divider bg-surface-subtle px-3 py-2" data-testid="architect-subject-attach-option">
            <div className="min-w-0 text-sm leading-6">
              <span className="text-text-muted">{option.unitLabel}: </span>
              <span className="font-medium text-foreground">{option.label}</span>
              {option.alreadyAttached && <span className="block text-success">Já está preso aqui.</span>}
              {option.refusal && <span className="block text-warning">{option.refusal}</span>}
              {!option.refusal && !option.alreadyAttached && !option.persisted && <span className="block text-text-muted">{SUBJECT_WORKING_ANCHOR_NOTE}</span>}
            </div>
            <button
              type="button"
              disabled={busy || option.alreadyAttached || Boolean(option.refusal)}
              onClick={() => onAttach(option)}
              className={primaryButtonClassName}
              aria-label={`${SUBJECT_ATTACH_ACTION_LABEL} em ${option.label}`}
            >
              {SUBJECT_ATTACH_ACTION_LABEL}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="architect-subject-attach-title"
        data-testid="architect-subject-attach-dialog"
        className="flex max-h-[86vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none"
      >
        <div className="min-w-0">
          <h2 id="architect-subject-attach-title" className="text-base font-semibold text-foreground">
            {SUBJECT_ATTACH_ACTION_LABEL}: <span className="text-keyword">{subjectPhrase}</span>
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            O Assunto fica como tronco da unidade, fora das keywords do artigo e do limite de seis. Uma unidade tem um Assunto só; o mesmo Assunto pode sustentar vários artigos.
          </p>
          <p className="text-sm leading-6 text-text-muted">{SUBJECT_VERSION_NOTE}</p>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto">
          {grupo("Artigos, landings e páginas de serviço", artigos)}
          {silos.length > 0 && <p className="text-sm leading-6 text-text-muted" data-testid="architect-subject-silo-scope">{SUBJECT_SILO_SCOPE_NOTE}</p>}
          {grupo("Silos", silos)}
          {!options.length && <p className="text-sm leading-6 text-text-muted">Nenhuma unidade no cenário atual. Forme os artigos antes de prender o Assunto.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={buttonClassName} data-testid="architect-subject-attach-close">
            Fechar
          </button>
        </div>
      </section>
    </div>
  );
}

export function SubjectSupportDialog({
  open,
  subjectPhrase,
  subjectNote,
  suggestions,
  siloLabels,
  busy,
  buttonClassName,
  primaryButtonClassName,
  onConfirm,
  onClose,
}: {
  open: boolean;
  subjectPhrase: string;
  subjectNote: string | null;
  suggestions: readonly SubjectSupportSuggestion[];
  /** Silo confirmado de cada sugestão; `null` ou ausente = sem Silo, não pode ser marcada. */
  siloLabels: ReadonlyMap<string, string | null>;
  busy: boolean;
  buttonClassName: string;
  primaryButtonClassName: string;
  onConfirm: (keywordIds: string[]) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  useSubjectDialogFocus(open, dialogRef, onClose, !busy);
  if (!open) return null;
  const alternar = (keywordId: string) => setMarcadas(anterior => {
    const proximo = new Set(anterior);
    if (proximo.has(keywordId)) proximo.delete(keywordId); else proximo.add(keywordId);
    return proximo;
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="architect-subject-support-title"
        aria-describedby="architect-subject-support-principal"
        data-testid="architect-subject-support-dialog"
        className="flex max-h-[86vh] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none"
      >
        <div className="min-w-0">
          <h2 id="architect-subject-support-title" className="text-base font-semibold text-foreground">
            Sugestões de sustentação: <span className="text-keyword">{subjectPhrase}</span>
          </h2>
          {subjectNote && <p className="mt-1 text-sm leading-6 text-foreground/85">Nota do Assunto: {subjectNote}</p>}
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Só keywords que já chegaram ao Arquiteto, ordenadas pelo que o pacote aprovado de cada uma já diz. Nada é gravado até você confirmar; a sugestão não prende nada.
          </p>
          <p id="architect-subject-support-principal" className="text-sm leading-6 text-text-muted">{SUBJECT_SUPPORT_PRINCIPAL_HINT}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded border border-divider">
          {suggestions.length === 0 ? (
            <p className="p-3 text-sm leading-6 text-text-muted" data-testid="architect-subject-support-empty">
              Nenhuma keyword recebida tem sinal em comum com este Assunto. Envie as keywords de sustentação pelo Minerador ou use a Pesquisa por Assunto.
            </p>
          ) : (
            <ul className="divide-y divide-divider/70">
              {suggestions.map(suggestion => {
                const id = `architect-subject-support-${suggestion.keywordId}`;
                const silo = siloLabels.get(suggestion.keywordId) ?? null;
                return (
                  <li key={suggestion.keywordId} className="flex items-start gap-3 px-3 py-2" data-testid="architect-subject-support-option">
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-module-accent"
                      checked={marcadas.has(suggestion.keywordId)}
                      disabled={busy || suggestion.alreadyInArticle || !silo}
                      onChange={() => alternar(suggestion.keywordId)}
                    />
                    <label htmlFor={id} className="min-w-0 flex-1 text-sm leading-6">
                      <span className="font-medium text-keyword">{suggestion.keyword}</span>
                      {suggestion.alreadyInArticle && <span className="text-text-muted"> · já está em artigo decidido (só informação)</span>}
                      {silo
                        ? <span className="block text-text-muted" data-testid="architect-subject-support-silo">Silo: {silo}</span>
                        : <span className="block text-warning" data-testid="architect-subject-support-without-silo">{SUBJECT_SUPPORT_WITHOUT_SILO}</span>}
                      <span className="block text-foreground/85">{suggestion.reason}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {suggestion.signals.map(signal => (
                          <span key={signal} className={`${badgeBase} border-divider bg-surface-subtle text-text-muted`}>{SUBJECT_SUGGESTION_SIGNAL_LABELS[signal]}</span>
                        ))}
                      </span>
                      {suggestion.discoveryEvidence.length > 0 && (
                        <span className="mt-1 block text-text-muted">Evidência da Pesquisa por Assunto: {suggestion.discoveryEvidence.join(" · ")}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-sm leading-6 text-text-muted">{SUBJECT_PHRASE_SERP_HINT}</p>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={buttonClassName} data-testid="architect-subject-support-close">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || marcadas.size === 0}
            onClick={() => onConfirm([...marcadas])}
            className={primaryButtonClassName}
            data-testid="architect-subject-support-confirm"
          >
            {busy ? "Gravando…" : `Formar artigo com ${marcadas.size} keyword(s)`}
          </button>
        </div>
      </section>
    </div>
  );
}
