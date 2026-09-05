"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CircleHelp, Search, X } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { CONTEXT_HELP_AREA_LABELS, filterContextHelpTopics, type ContextHelpArea, type ContextHelpTopic } from "@/lib/context-help";
import { getContextHelpDefinition } from "@/lib/context-help-registry";

const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

function ContextHelpTopicDetail({ topic, onBack }: { topic: ContextHelpTopic; onBack: () => void }) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-5" data-context-help-detail>
      <button type="button" onClick={onBack} className="inline-flex min-h-9 items-center gap-2 rounded-md px-1 text-sm font-semibold text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        Voltar aos tópicos
      </button>
      <article className="mt-4 min-w-0">
        <h3 className="text-lg font-semibold leading-6 text-foreground">{topic.title}</h3>
        <p className="mt-2 text-sm leading-6 text-foreground/80">{topic.summary}</p>
        <p className="mt-3 text-sm leading-6 text-foreground/75">{topic.description}</p>

        {topic.sections?.filter(section => section.heading.trim() && section.body.trim()).map(section => (
          <section key={section.heading} className="mt-5">
            <h4 className="text-sm font-semibold text-foreground">{section.heading}</h4>
            <p className="mt-1 text-sm leading-6 text-foreground/75">{section.body}</p>
          </section>
        ))}

        {topic.howToUse?.length ? (
          <section className="mt-5">
            <h4 className="text-sm font-semibold text-foreground">Como usar</h4>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground/75">
              {topic.howToUse.map(step => <li key={step}>{step}</li>)}
            </ol>
          </section>
        ) : null}
      </article>
    </div>
  );
}

export function ContextHelpCenter({ area }: { area: ContextHelpArea | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef(false);
  const searchId = useId();
  const definition = useMemo(() => area ? getContextHelpDefinition(area) : null, [area]);
  const visibleTopics = useMemo(() => definition ? filterContextHelpTopics(definition, query) : [], [definition, query]);
  const selectedTopic = definition?.topics.find(topic => topic.id === selectedTopicId) || null;

  const close = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
    setSelectedTopicId(null);
  }, []);

  useEffect(() => {
    if (!open) {
      if (restoreFocusRef.current) {
        restoreFocusRef.current = false;
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
      return;
    }

    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [close, open]);

  if (!area || !definition) return null;

  const title = CONTEXT_HELP_AREA_LABELS[area];
  const dialogTitleId = `context-help-title-${searchId}`;
  const hasSearchResults = Boolean(query.trim()) && visibleTopics.length === 0;

  const drawerLayer = open ? (
    <div className="fixed inset-y-0 left-0 right-auto z-50 w-screen" data-context-help-layer>
      <button type="button" onClick={close} className="absolute inset-0 h-full w-full bg-background/45" aria-label="Fechar ajuda" />
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} data-context-help-drawer className="absolute inset-y-0 right-0 flex w-full max-w-sm min-w-0 flex-col border-l border-divider bg-surface-elevated text-foreground shadow-xl outline-none sm:w-96">
        <div className="flex min-h-16 shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <h2 id={dialogTitleId} className="min-w-0 pt-1 text-base font-semibold leading-6 text-foreground">Ajuda — {title}</h2>
          <button ref={closeRef} type="button" onClick={close} aria-label="Fechar ajuda" data-context-help-close className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {selectedTopic ? <ContextHelpTopicDetail topic={selectedTopic} onBack={() => setSelectedTopicId(null)} /> : (
          <>
            <div className="shrink-0 px-4 pb-3 pt-4">
              <label htmlFor={searchId} className="sr-only">Buscar nesta área</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nesta área..." autoComplete="off" data-context-help-search className="min-h-10 w-full rounded-md border border-divider bg-surface-subtle pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted hover:border-context-accent/35 focus:border-context-accent/60 focus:ring-2 focus:ring-context-accent/25" />
              </div>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-5" data-context-help-topic-list>
              {definition.topics.length === 0 && !query.trim() ? <p className="py-5 text-sm leading-6 text-foreground/70" data-context-help-empty>Ajuda desta área ainda não disponível.</p> : null}
              {hasSearchResults ? <p className="py-5 text-sm leading-6 text-foreground/70" data-context-help-no-results>Nenhum tópico encontrado nesta área.</p> : null}
              {!hasSearchResults ? visibleTopics.map(topic => (
                <button key={topic.id} type="button" onClick={() => setSelectedTopicId(topic.id)} data-context-help-topic={topic.id} className="block w-full border-b border-divider py-3 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-context-accent">
                  <span className="block text-sm font-semibold leading-5 text-foreground">{topic.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-foreground/70">{topic.summary}</span>
                </button>
              )) : null}
            </div>
          </>
        )}
      </aside>
    </div>
  ) : null;

  return (
    <div className="relative shrink-0" data-context-help-center data-context-help-area={area}>
      <InfoHint title="Ajuda desta área" description={`Orientações rápidas sobre ${title}.`}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir ajuda desta área"
          aria-expanded={open}
          aria-haspopup="dialog"
          data-context-help-trigger
          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent"
        >
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
        </button>
      </InfoHint>

      {drawerLayer && typeof document !== "undefined" ? createPortal(drawerLayer, document.body) : null}
    </div>
  );
}
