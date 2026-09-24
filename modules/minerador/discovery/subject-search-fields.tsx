"use client";

import { LoaderCircle, Search } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";
import { KEYWORD_SUBJECT_NOTE_MAX } from "@/lib/minerador/keyword-subject";
import {
  SUBJECT_SEARCH_DECLARED_HELP,
  SUBJECT_SEARCH_DESTINATION_HELP,
  SUBJECT_SEARCH_ENTER_HELP,
  SUBJECT_SEARCH_LANGUAGE_TEXT,
  SUBJECT_SEARCH_LOCALE_TEXT,
  SUBJECT_SEARCH_NOTE_HELP,
  SUBJECT_SEARCH_RULE_TEXT,
} from "./subject-search-model";
import type { SubjectSearchController } from "./use-subject-search";

/**
 * Campos da Pesquisa por Assunto (SDD 2026-09-24, F1b.1). Ficam no lugar da
 * semente quando o radiogroup está em "Por Assunto". Enter ou Pesquisar só
 * montam o plano: nada é pago antes de o humano confirmar o custo.
 */

const control = "mt-1 h-10 w-full rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40 read-only:text-text-muted disabled:cursor-not-allowed disabled:opacity-60";
const primarySearchControl = "mt-1 h-10 w-full rounded border border-action-accent/35 bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors hover:border-action-accent/50 focus:border-action-accent/65 focus-visible:ring-2 focus-visible:ring-action-accent/20 read-only:text-text-muted";
const primaryButton = "inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-action-accent bg-action-accent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-action-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-accent/50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const helpText = "mt-1 block text-sm font-normal leading-5 text-text-muted";

export function SubjectSearchFields({ controller }: { controller: SubjectSearchController }) {
  const declared = Boolean(controller.subjectKeywordId);
  // Com o diálogo de custo aberto, Enter no campo de trás não remonta o plano.
  const busy = controller.planning || controller.executing || Boolean(controller.planState);
  const submit = () => { void controller.requestPlan(); };
  return <div className="min-w-0 max-w-full" data-subject-search-fields>
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] xl:items-start">
      <label className="block min-w-0 text-sm font-medium text-foreground/85" htmlFor="subject-search-declared">
        Usar um Assunto declarado
        <select
          id="subject-search-declared"
          value={controller.subjectKeywordId || ""}
          onChange={event => controller.chooseDeclaredSubject(event.target.value || null)}
          disabled={busy || controller.declaredState === "loading"}
          className={control}
        >
          <option value="">Escrever um Assunto</option>
          {controller.declaredSubjects.map(option => <option key={option.id} value={option.id}>{option.keyword}</option>)}
        </select>
        <span className={helpText}>
          {controller.declaredState === "loading"
            ? "Lendo os Assuntos declarados desta marca…"
            : controller.declaredState === "failed"
              ? "Os Assuntos declarados não puderam ser lidos agora. Você ainda pode escrever o Assunto."
              : declared
                ? SUBJECT_SEARCH_DECLARED_HELP
                : controller.declaredSubjects.length
                  ? "Escolher um Assunto preenche a frase, a nota e a página."
                  : "Nenhum Assunto declarado nesta marca ainda."}
        </span>
      </label>
      <div className="block min-w-0 text-sm font-semibold text-foreground">
        <InlineLabelCluster label={<label htmlFor="subject-search-phrase"><InfoHint title="Assunto da pesquisa" description={SUBJECT_SEARCH_RULE_TEXT}><span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Assunto</span></InfoHint></label>} />
        <input
          id="subject-search-phrase"
          value={controller.phrase}
          onChange={event => controller.setPhrase(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy) submit(); } }}
          readOnly={declared}
          required
          maxLength={200}
          aria-describedby="subject-search-phrase-help"
          className={primarySearchControl}
          placeholder="Ex.: SEO para clínicas"
        />
        <span id="subject-search-phrase-help" className={helpText}>{SUBJECT_SEARCH_ENTER_HELP}</span>
      </div>
      <label className="block min-w-0 text-sm font-medium text-foreground/85" htmlFor="subject-search-note">
        Nota (opcional)
        <input
          id="subject-search-note"
          value={controller.note}
          onChange={event => controller.setNote(event.target.value)}
          readOnly={declared}
          maxLength={KEYWORD_SUBJECT_NOTE_MAX}
          aria-describedby="subject-search-note-help"
          className={control}
          placeholder="O que é, para quem"
        />
        <span id="subject-search-note-help" className={helpText}>{SUBJECT_SEARCH_NOTE_HELP}</span>
      </label>
      <label className="block min-w-0 text-sm font-medium text-foreground/85" htmlFor="subject-search-destination">
        Página de destino (opcional)
        <input
          id="subject-search-destination"
          type="url"
          inputMode="url"
          value={controller.destinationUrl}
          onChange={event => controller.setDestinationUrl(event.target.value)}
          readOnly={declared}
          maxLength={2048}
          aria-describedby="subject-search-destination-help"
          className={control}
          placeholder="https://"
        />
        <span id="subject-search-destination-help" className={helpText}>{SUBJECT_SEARCH_DESTINATION_HELP}</span>
      </label>
    </div>
    <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p data-subject-search-rule className="max-w-[80ch] text-sm leading-6 text-foreground/85">{SUBJECT_SEARCH_RULE_TEXT}</p>
        <p className="max-w-[80ch] text-sm leading-6 text-text-muted">{SUBJECT_SEARCH_LOCALE_TEXT} {SUBJECT_SEARCH_LANGUAGE_TEXT}</p>
      </div>
      <button type="button" onClick={submit} disabled={busy} aria-busy={controller.planning} className={primaryButton}>
        {controller.planning ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
        {controller.planning ? "Montando o plano..." : "Pesquisar"}
      </button>
    </div>
    {controller.fieldError && <p className="mt-3 rounded border border-danger/45 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger" role="alert">{controller.fieldError}</p>}
  </div>;
}
