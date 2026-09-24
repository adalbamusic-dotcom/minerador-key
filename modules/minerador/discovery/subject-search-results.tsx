"use client";

import { useMemo } from "react";
import { Search, Send, Trash2, X } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";
import { formatDiscoveryMoney } from "@/lib/minerador/discovery-keywords";
import { SUBJECT_DISCOVERY_SOURCES } from "@/lib/minerador/subject-discovery-plan";
import type { SubjectDiscoveryCandidate } from "@/lib/minerador/subject-discovery-search";
import { KeywordTableBulkBarShell } from "../keyword-table/keyword-table-bulk-bar-shell";
import { KeywordTableEmptyState } from "../keyword-table/keyword-table-empty-state";
import { KeywordTableHeader } from "../keyword-table/keyword-table-header";
import { KeywordSelectionCell, KeywordSelectionHeader } from "../keyword-table/keyword-table-selection";
import { KeywordTableShell } from "../keyword-table/keyword-table-shell";
import { useKeywordTableSelection } from "../keyword-table/use-keyword-table-selection";
import { MineradorProcessAction } from "../minerador-process-action";
import {
  SUBJECT_SEARCH_ESTIMATE_COLUMN,
  SUBJECT_SEARCH_LOCAL_LIST_TEXT,
  SUBJECT_SEARCH_LOCAL_POLICY_TEXT,
  SUBJECT_SEARCH_MEMORY_ONLY_TEXT,
  SUBJECT_SEARCH_VOLUME_FILTERS,
  formatSubjectSearchUsd,
  subjectCandidateGoogleAdsVolume,
  subjectSearchLensName,
  subjectSearchOriginLabel,
  subjectSearchSerpLensLabel,
  subjectSearchSourceStatusLabel,
  subjectSearchSummary,
  type SubjectSearchImportMark,
  type SubjectSearchVolumeFilter,
} from "./subject-search-model";
import { SubjectSearchImportDialog, SubjectSearchPlanDialog } from "./subject-search-dialogs";
import type { SubjectSearchController } from "./use-subject-search";

/**
 * Resultado da Pesquisa por Assunto (SDD 2026-09-24, F1b.2, F1b.5 e F1b.6).
 *
 * Tabela própria, porque a candidata guarda TODAS as origens, mas com os
 * componentes compartilhados do Minerador: shell, seleção e barra inferior.
 * Volume é só o do Google Ads; a estimativa do Labs tem coluna própria,
 * rotulada, e nunca entra no filtro "Com volume" nem no envio.
 */

const control = "h-9 rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40";
const neutralButton = "inline-flex min-h-9 items-center gap-1 rounded border border-divider px-2.5 py-1 text-sm font-semibold text-text-muted transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";
const auxiliaryCell = "border-r border-divider/70 px-2 py-1";
// Origens e evidência são o "por quê" da candidata: legíveis sem hover, uma por linha.
const multiLineCell = "whitespace-normal break-words border-r border-divider/70 px-2 py-1 leading-6";
const keywordCell = "max-w-[340px] truncate border-r border-divider/70 px-3 py-1 font-medium text-keyword select-text";
const columnWidths = { selection: 34, keyword: 340, origins: 280, evidence: 300, volume: 120, cpc: 110, competition: 150, estimate: 170, situation: 220 };
const tableMinimumWidth = Object.values(columnWidths).reduce((total, width) => total + width, 0);

const competitionText = (value: string | null) => value === "LOW" ? "Baixa" : value === "MEDIUM" ? "Média" : value === "HIGH" ? "Alta" : "Sem dado";

const MARK_LABELS: Record<string, string> = {
  created: "Enviada ao Processador",
  recorded: "Já existia · origem gravada",
  already_recorded: "Já tinha esta busca",
  not_recorded_approval: "Aprovada · origem não gravada",
  not_recorded_limit: "Acima do limite de 50 · origem não gravada",
  not_recorded_changed: "Alterada no envio · origem não gravada",
  not_recorded_concurrent: "Criada ao mesmo tempo · origem não gravada",
  skipped_subject: "É o Assunto",
  declared_subject: "Declarada como Assunto",
  duplicate: "Repetida no envio",
  invalid: "Inválida",
  failed: "Falhou no envio",
};

function situation(candidate: SubjectDiscoveryCandidate, mark: SubjectSearchImportMark | undefined): { label: string; title: string | undefined } {
  if (mark) return { label: MARK_LABELS[mark.outcome] ?? mark.outcome, title: mark.reason || undefined };
  if (candidate.isSubjectPhrase) return { label: "É o Assunto", title: "A própria frase do Assunto apareceu entre as candidatas." };
  if (candidate.existingKeywordId) return { label: "Já existe na marca", title: "Indicativo, lido na pesquisa. Quem decide é o envio ao Processador." };
  return { label: "Nova", title: undefined };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : value;
}

export function SubjectSearchResults({ controller }: { controller: SubjectSearchController }) {
  const record = controller.activeRecord;
  const candidates = controller.visibleCandidates;
  const visibleIds = useMemo(() => candidates.map(candidate => candidate.normalizedKeyword), [candidates]);
  const selection = useKeywordTableSelection(visibleIds);
  const allKeys = useMemo(() => new Set(record?.result.candidates.map(candidate => candidate.normalizedKeyword) || []), [record]);
  // A seleção nunca sobrevive à troca de busca: só vale o que existe nesta lista.
  const selectedKeys = useMemo(() => new Set([...selection.selectedIds].filter(key => allKeys.has(key))), [selection.selectedIds, allKeys]);
  const visibleSelected = visibleIds.filter(id => selectedKeys.has(id)).length;
  const selectedCandidates = record ? record.result.candidates.filter(candidate => selectedKeys.has(candidate.normalizedKeyword)) : [];
  const subjectPhraseSelected = selectedCandidates.some(candidate => candidate.isSubjectPhrase);
  const selectedItemCount = selectedCandidates.filter(candidate => !candidate.isSubjectPhrase).length;
  const busy = controller.executing || Boolean(controller.importDialog?.submitting);

  return <section className="mt-5 flex min-h-0 w-full flex-1 flex-col" aria-label="Resultados da Pesquisa por Assunto" data-subject-search-results>
    <div className="space-y-3 px-3 sm:px-4 xl:px-6">
      <div className="space-y-1 text-sm leading-6 text-text-muted">
        <p data-subject-search-local-text>{SUBJECT_SEARCH_LOCAL_LIST_TEXT}</p>
        <p>{SUBJECT_SEARCH_LOCAL_POLICY_TEXT}</p>
        {controller.storageAvailable === false && <p className="text-warning" role="status">{SUBJECT_SEARCH_MEMORY_ONLY_TEXT}</p>}
      </div>

      {controller.records.length > 0 && <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="block min-w-0 text-sm font-medium text-foreground/85" htmlFor="subject-search-saved">
          Buscas guardadas neste navegador
          <select id="subject-search-saved" value={record?.searchId || ""} onChange={event => { selection.setSelectedIds(new Set()); controller.chooseSearch(event.target.value); }} disabled={busy} className={`${control} mt-1 block w-full min-w-0 sm:w-auto sm:max-w-md`}>
            {controller.records.map(item => <option key={item.searchId} value={item.searchId}>{item.result.subject.phrase} · {formatDate(item.savedAt)}</option>)}
          </select>
        </label>
        {record && <button type="button" onClick={() => { selection.setSelectedIds(new Set()); void controller.discardSearch(record.searchId); }} disabled={busy} className={neutralButton}><Trash2 className="h-4 w-4" aria-hidden="true" />Descartar esta busca</button>}
      </div>}

      {record && <div className="space-y-3" data-subject-search-summary>
        <div className="space-y-1 text-sm leading-6">
          <p className="text-foreground">Assunto <span className="font-semibold">{record.result.subject.phrase}</span> · pesquisado em {formatDate(record.result.executedAt)} · {subjectSearchSummary(record.result)}</p>
          <p className="text-foreground/85">Custo informado pelo provider: {formatSubjectSearchUsd(record.result.reportedCostUsd)} · máximo confirmado {formatSubjectSearchUsd(record.result.plan.maxCostUsd)}</p>
          {record.result.subject.destination.reason && <p className="text-text-muted">{record.result.subject.destination.reason}</p>}
          {!record.result.ledgerRecording && <p className="text-warning">O uso desta pesquisa não foi registrado no controle de gastos.</p>}
          {record.result.ledgerWarning && <p className="text-warning">{record.result.ledgerWarning}</p>}
          {record.result.existingCheckFailed && <p className="text-warning">A conferência de keywords que já existem na marca falhou: a coluna Situação não mostra quais já existem.</p>}
          {record.result.notices.filter(notice => !notice.startsWith("Este custo não será registrado")).map(notice => <p key={notice} className="text-text-muted">{notice}</p>)}
        </div>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <div className="min-w-0 rounded border border-divider bg-surface-subtle p-3">
            <p className="text-sm font-semibold text-foreground">Fontes</p>
            <ul className="mt-1 space-y-1 text-sm leading-6">
              {record.result.sources.map(source => <li key={source.source} className="text-foreground/85">
                <span className="text-foreground">{subjectSearchOriginLabel(source.source)}</span>: <span className={source.status === "failed" ? "text-danger" : source.status === "skipped_budget" ? "text-warning" : undefined}>{subjectSearchSourceStatusLabel(source.status)}</span>
                {source.received ? ` · ${source.received} recebida(s)` : ""}{typeof source.costUsd === "number" && source.costUsd > 0 ? ` · ${formatSubjectSearchUsd(source.costUsd)}` : ""}
                {source.reason && <span className="block text-text-muted">{source.reason}</span>}
              </li>)}
            </ul>
          </div>
          <div className="min-w-0 rounded border border-divider bg-surface-subtle p-3">
            <p className="text-sm font-semibold text-foreground">Resultados do Google para a frase</p>
            <ul className="mt-1 space-y-1 text-sm leading-6">
              {record.result.serp.lenses.map(lens => <li key={lens.lens} className="text-foreground/85">
                <span className="text-foreground">{subjectSearchLensName(lens.lens)}</span>:{subjectSearchSerpLensLabel(lens.source)}{lens.urls ? ` · ${lens.urls} página(s)` : ""}
                {lens.reason && <span className="block text-text-muted">{lens.reason}</span>}
              </li>)}
            </ul>
            {record.result.serp.topUrls.length > 0 && <p className="mt-1 text-sm leading-6 text-text-muted">Páginas do topo consultadas: {record.result.serp.topUrls.map(top => `#${top.bestRankGroup} ${top.url}`).join(" · ")}</p>}
          </div>
        </div>
      </div>}

      {record && <div className="flex min-w-0 flex-wrap items-center gap-2" data-subject-search-filters>
        <label className="relative min-w-0 flex-1 sm:max-w-md"><span className="sr-only">Buscar nas candidatas</span><Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" /><input value={controller.filters.text} onChange={event => controller.setFilters(current => ({ ...current, text: event.target.value }))} placeholder="Buscar nas candidatas..." className="w-full rounded border border-divider bg-surface-subtle py-1.5 pl-7 pr-2 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40" /></label>
        <label className="inline-flex min-h-9 items-center gap-2 text-sm text-foreground/80">
          <InlineLabelCluster label={<InfoHint title="Volume do Google Ads" description="Filtra só pela média mensal do Google Ads. A estimativa DataForSEO não conta como volume. Filtrar não chama provider."><span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Volume</span></InfoHint>} />
          <select value={controller.filters.volume} onChange={event => controller.setFilters(current => ({ ...current, volume: event.target.value as SubjectSearchVolumeFilter }))} aria-label="Filtrar pelo volume do Google Ads" className={control}>{SUBJECT_SEARCH_VOLUME_FILTERS.map(option => <option key={option} value={option}>{option}</option>)}</select>
        </label>
        <label className="inline-flex min-h-9 items-center gap-2 text-sm text-foreground/80">Origem
          <select value={controller.filters.origin} onChange={event => controller.setFilters(current => ({ ...current, origin: event.target.value as typeof current.origin }))} aria-label="Filtrar pela origem" className={control}>
            <option value="all">Todas</option>
            {SUBJECT_DISCOVERY_SOURCES.map(source => <option key={source} value={source}>{subjectSearchOriginLabel(source)}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-9 items-center gap-2 rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground/80">
          <input type="checkbox" checked={controller.filters.hideExisting} onChange={event => controller.setFilters(current => ({ ...current, hideExisting: event.target.checked }))} />
          Esconder as que já existem
        </label>
      </div>}
    </div>

    {record ? <KeywordTableShell scroll="x" className={`mt-3 ${selectedKeys.size ? "pb-14" : ""}`}>
      <table data-keyword-table="subject-search" style={{ minWidth: tableMinimumWidth }} className="w-full table-fixed border-collapse text-left text-sm font-sans">
        <colgroup>{Object.entries(columnWidths).map(([id, width]) => <col key={id} style={{ width }} />)}</colgroup>
        <KeywordTableHeader className="sticky top-0 z-20 border-b border-divider bg-surface-subtle">
          <tr className="text-text-muted">
            <KeywordSelectionHeader allSelected={visibleIds.length > 0 && visibleSelected === visibleIds.length} someSelected={visibleSelected > 0 && visibleSelected < visibleIds.length} onToggle={selection.toggleVisible} />
            <th scope="col" className="border-r border-divider/70 px-3 py-2 font-medium">Keyword</th>
            <th scope="col" className="border-r border-divider/70 px-2 py-2 font-medium">Origens</th>
            <th scope="col" className="border-r border-divider/70 px-2 py-2 font-medium">Evidência</th>
            <th scope="col" className="border-r border-divider/70 px-2 py-2 font-medium">Volume (Google Ads)</th>
            <th scope="col" className="border-r border-divider/70 px-2 py-2 font-medium">CPC</th>
            <th scope="col" className="border-r border-divider/70 px-2 py-2 font-medium">Concorrência Ads</th>
            <th scope="col" className="border-r border-divider/70 px-2 py-2 font-medium">
              <InlineLabelCluster label={SUBJECT_SEARCH_ESTIMATE_COLUMN} info={<InfoHint title={SUBJECT_SEARCH_ESTIMATE_COLUMN} description="Estimativa de busca do DataForSEO Labs, só para leitura. Não é volume, não entra no filtro Com volume e não vai ao Processador." />} />
            </th>
            <th scope="col" className="px-2 py-2 font-medium">Situação</th>
          </tr>
        </KeywordTableHeader>
        <tbody className="divide-y divide-divider/70 bg-background">
          {candidates.map(candidate => {
            const key = candidate.normalizedKeyword;
            const mark = record.marks[key];
            const state = situation(candidate, mark);
            const volume = subjectCandidateGoogleAdsVolume(candidate);
            const origins = candidate.origins.map(origin => subjectSearchOriginLabel(origin));
            return <tr key={key} data-keyword-table-row-id={key} className={`h-9 transition-colors ${selectedKeys.has(key) ? "bg-selected hover:bg-surface-elevated" : "hover:bg-surface-subtle"}`}>
              <KeywordSelectionCell id={key} keyword={candidate.keyword} selected={selectedKeys.has(key)} onPointerDown={event => selection.onSelectionPointerDown(key, event)} onClick={event => selection.onSelectionClick(key, event)} />
              <td className={keywordCell} title={candidate.keyword}>{candidate.keyword}</td>
              <td className={multiLineCell}><ul className="space-y-0.5">{origins.map(origin => <li key={origin}>{origin}</li>)}</ul></td>
              <td className={`${multiLineCell} text-text-muted`}>{candidate.evidence.length ? <ul className="space-y-0.5">{candidate.evidence.map(text => <li key={text}>{text}</li>)}</ul> : "—"}</td>
              <td className={auxiliaryCell}>{volume === null ? "Sem média do Google Ads" : new Intl.NumberFormat("pt-BR").format(volume)}</td>
              <td className={auxiliaryCell}>{candidate.googleAds ? formatDiscoveryMoney(candidate.googleAds.averageCpcMicros, candidate.googleAds.currencyCode) : "—"}</td>
              <td className={auxiliaryCell}>{candidate.googleAds ? `${competitionText(candidate.googleAds.competition)}${candidate.googleAds.competitionIndex === null ? "" : ` · ${candidate.googleAds.competitionIndex}`}` : "—"}</td>
              <td className={`${auxiliaryCell} text-text-muted`}>{candidate.dataForSeoEstimate?.searchVolume === null || candidate.dataForSeoEstimate?.searchVolume === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(candidate.dataForSeoEstimate.searchVolume)}</td>
              <td className="whitespace-normal break-words px-2 py-1 leading-6" title={state.title}>{state.label}</td>
            </tr>;
          })}
          {!candidates.length && <tr><td colSpan={9} className="p-0"><KeywordTableEmptyState><p className="text-sm text-text-muted">{record.result.candidates.length ? "Nenhuma candidata corresponde aos filtros locais." : "Nenhuma fonte devolveu candidatas para este Assunto. Confira o estado de cada fonte acima."}</p></KeywordTableEmptyState></td></tr>}
        </tbody>
      </table>
    </KeywordTableShell> : <KeywordTableEmptyState><div className="max-w-xl space-y-2"><p className="text-base font-semibold text-foreground">Nenhuma Pesquisa por Assunto neste navegador.</p><p className="text-sm leading-6 text-text-muted">Escreva o Assunto ou escolha um declarado e aperte Pesquisar. O custo aparece antes de qualquer consulta paga.</p></div></KeywordTableEmptyState>}

    {record && selectedKeys.size > 0 && <KeywordTableBulkBarShell className="font-sans">
      <div className="flex min-w-0 shrink-0 items-center gap-2" data-subject-search-bulk-context>
        <strong className="shrink-0 rounded border border-module-accent/50 bg-selected px-2.5 py-1 text-sm font-bold text-foreground">{selectedKeys.size} {selectedKeys.size === 1 ? "selecionada" : "selecionadas"}</strong>
      </div>
      <div className="flex min-w-0 items-center gap-0.5">
        <MineradorProcessAction title="Enviar ao Processador" description="Leva ao Processador só as keywords selecionadas, sem métrica. O volume é medido de novo lá, pelo Google Ads, sem custo." label={controller.importDialog?.submitting ? "Enviando..." : "Enviar ao Processador"} ariaLabel="Enviar selecionadas ao Processador" labelClassName="hidden sm:inline" icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => controller.openImport(selectedKeys.size)} disabled={busy || !selectedItemCount} buttonClassName="text-action-accent" />
      </div>
      <button type="button" onClick={() => selection.setSelectedIds(new Set())} disabled={busy} aria-label="Limpar seleção" title="Limpar seleção" className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded border border-divider px-2.5 py-1 text-sm font-semibold text-foreground/80 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground"><X className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden xl:inline">Limpar seleção</span></button>
    </KeywordTableBulkBarShell>}

    <SubjectSearchPlanDialog controller={controller} />
    <SubjectSearchImportDialog controller={controller} selectedKeys={selectedKeys} selectedItemCount={selectedItemCount} subjectPhraseSelected={subjectPhraseSelected} />
  </section>;
}
