"use client";

import React, { Fragment, useId, useRef, useState } from "react";
import { useSubjectDialogFocus } from "./subject-panels";
import { SERP_SUBJECT_TONE_CLASSES, type SerpSubjectCardView } from "./serp-subject-model";
import {
  PUBLISHED_REINFORCEMENT_ACTION_LABEL,
  PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX,
  PUBLISHED_REINFORCEMENT_COST_LINE,
  PUBLISHED_REINFORCEMENT_SAVE_LABEL,
  PUBLISHED_REINFORCEMENT_TABLE_LINE,
  reinforcementPreviewView,
  reinforcementTableSummary,
  searchActionLabel,
  searchConfirmLines,
  searchSuggestionViews,
  type NoPairLineView,
  type ReinforcementTableRow,
} from "./published-reinforcement-model";
import type { PublishedReinforcementController } from "./use-published-reinforcement";
import type { ReinforcementPageResult } from "@/lib/arquiteto/published-reinforcement-search";

/**
 * REFORÇAR PUBLICADOS — A TELA (SDD docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md).
 *
 *   a tabela       UMA tabela (pedido do dono, 2026-09-28): uma linha por
 *                  publicado e Assunto, a principal atual com o volume, as
 *                  sugeridas com caixinha (Forte de qualquer Silo marcada,
 *                  Provável desmarcada; cada keyword num publicado só), o
 *                  volume somado antes → depois e o estado. "Gravar reforços"
 *                  abre a confirmação com a prévia do servidor — por artigo, o
 *                  que será gravado, a mudança de Silo e o total depois — e o
 *                  custo (zero). O cartão antigo virou o detalhe da linha
 *                  ("Ver a evidência").
 *   a linha        os "Sem par no lote" numa linha só, com "Buscar keywords
 *                  para os publicados sem par (até US$ 1,00)": prévia grátis,
 *                  UMA confirmação do custo, progresso e o resultado na tabela.
 *   a lista        no cartão da Revisão do artigo, as keywords que a busca
 *                  trouxe (Forte marcada, Provável desmarcada).
 *
 * Nada aqui chama rede: as chamadas moram no hook. As classes de botão chegam
 * por prop, como nos outros painéis do Arquiteto.
 */

type ButtonClasses = { buttonClassName: string; primaryButtonClassName: string };

const badgeBase = "inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-sm font-medium";

const NIVEL_CLASSE = {
  strong: SERP_SUBJECT_TONE_CLASSES.success.badge,
  probable: SERP_SUBJECT_TONE_CLASSES.info.badge,
} as const;

/** As keywords que a busca em lote trouxe para este publicado, com a marcação para o "Reforçar". */
export function SearchSuggestionList({ controller, pageId, result }: { controller: PublishedReinforcementController; pageId: string; result: ReinforcementPageResult }) {
  const listaId = useId();
  const marcadas = new Set(controller.searchPicksOf(pageId));
  const itens = searchSuggestionViews(result);
  return (
    <div className="mt-2 grid gap-2 border-t border-divider pt-2" data-testid="architect-reinforcement-search-suggestions">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={listaId} className="text-sm font-semibold text-foreground">{`Keywords da busca em lote · ${itens.length} com volume do Google Ads`}</h3>
        <span className="text-sm text-text-muted">{result.slotsLeft ? `Cabem ${result.slotsLeft}` : "Artigo no teto de 6"}</span>
      </div>
      <ul className="grid gap-1.5" aria-labelledby={listaId}>
        {itens.map(item => {
          const id = `${listaId}-${item.key}`;
          return (
            <li key={item.key} className="flex items-start gap-2 text-sm leading-6">
              <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0" disabled={controller.busy} checked={marcadas.has(item.keyword)} onChange={() => controller.toggleSearchPick(pageId, item.keyword)} />
              <label htmlFor={id} className="min-w-0">
                <span className="font-medium text-keyword">{item.keyword}</span>
                <span className={`${badgeBase} ml-2 ${NIVEL_CLASSE[item.level]}`}>{item.levelLabel}</span>
                <span className="block text-text-muted">{item.detail}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-sm leading-6 text-text-muted">{`As marcadas entram em "${PUBLISHED_REINFORCEMENT_ACTION_LABEL}". As novas são importadas e aprovadas por você no Minerador na mesma confirmação.`}</p>
    </div>
  );
}

function OutcomeBlock({ controller, buttonClassName }: { controller: PublishedReinforcementController; buttonClassName: string }) {
  const desfecho = controller.outcome;
  if (!desfecho) return null;
  const cor = desfecho.tone === "success" ? "text-success" : desfecho.tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="mt-2 grid gap-1 rounded-md border border-divider bg-surface p-3 text-sm leading-6" data-testid="architect-reinforcement-outcome" aria-live="polite">
      <p className={cor}>{desfecho.message}</p>
      {desfecho.lines.map(line => <p key={line} className="text-text-muted">{line}</p>)}
      <div>
        <button type="button" onClick={controller.dismissOutcome} className={buttonClassName}>Fechar</button>
      </div>
    </div>
  );
}

/** A confirmação única do "Reforçar publicados", montada da prévia do servidor. */
function ReinforcementDialog({ controller, cards, rows = [], buttonClassName, primaryButtonClassName }: { controller: PublishedReinforcementController; cards: readonly SerpSubjectCardView[]; rows?: readonly ReinforcementTableRow[] } & ButtonClasses) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [aprovadoPara, setAprovadoPara] = useState<string | null>(null);
  const aprovoId = useId();
  const { dialog } = controller;
  const busy = controller.busy || dialog.status === "loading" || dialog.status === "applying";
  useSubjectDialogFocus(dialog.open, dialogRef, controller.closeReinforcement, !busy);
  if (!dialog.open) return null;
  const view = dialog.data ? reinforcementPreviewView(dialog.data) : null;
  const trocaDe = new Map(cards.filter(card => card.swapSubstitute).map(card => [card.anchorKeywordId, card.swapSubstitute!]));
  // A tabela acrescenta, por artigo, a mudança de Silo e o total depois de gravar.
  const daTabela = new Map(rows.map(row => [row.anchorKeywordId, row.confirmLines]));
  const depoisPelaTabela = new Map(rows.map(row => [row.anchorKeywordId, row.after.keywords]));
  // O total que o servidor vai gravar: a página, quem fica, as marcadas aceitas e as novas.
  const doServidor = new Map((dialog.data?.pages || []).map(plano => [plano.publishedKeywordId, { total: 1 + plano.keep.length + plano.add.length + plano.create.length, recusadas: plano.refused.length }]));
  const precisaAceite = Boolean(view?.approvalText);
  // O aceite vale para a prévia vista: prévia nova (outro hash) pede o aceite de novo.
  const aprovo = Boolean(dialog.data && aprovadoPara === dialog.data.decisionHash);
  const podeGravar = Boolean(view && view.ready > 0 && !busy && (!precisaAceite || aprovo));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="architect-reinforcement-title"
        data-testid="architect-reinforcement-dialog"
        className="flex max-h-[86vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none"
      >
        <h2 id="architect-reinforcement-title" className="text-base font-semibold text-foreground">{`${PUBLISHED_REINFORCEMENT_ACTION_LABEL}: ${PUBLISHED_REINFORCEMENT_SAVE_LABEL.toLocaleLowerCase("pt-BR")}?`}</h2>
        <div className="grid gap-3 overflow-y-auto text-sm leading-6">
          {dialog.status === "loading" && <p className="text-text-muted">Montando a prévia (grátis, nada é gravado)…</p>}
          {dialog.notices.map(aviso => <p key={aviso} className="text-text-muted" data-testid="architect-reinforcement-reassigned">{aviso}</p>)}
          {dialog.error && <p className="text-warning">{dialog.error}</p>}
          {view && <p className="text-foreground" data-testid="architect-reinforcement-headline">{view.headline}</p>}
          {view && (
            <ul className="grid gap-2">
              {view.pages.filter(page => page.status !== "unchanged").map(page => {
                const id = `architect-reinforcement-page-${page.keywordId}`;
                const troca = trocaDe.get(page.keywordId);
                return (
                  <li key={page.keywordId} className={`border-l-2 pl-2 ${SERP_SUBJECT_TONE_CLASSES[page.tone].accent}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input id={id} type="checkbox" className="h-4 w-4 shrink-0" checked disabled={busy} onChange={() => void controller.toggleDialogPage(page.keywordId)} />
                      <label htmlFor={id} className="min-w-0 font-medium text-keyword">{page.keyword}</label>
                      <span className={`${badgeBase} ${SERP_SUBJECT_TONE_CLASSES[page.tone].badge}`}>{page.statusLabel}</span>
                    </div>
                    <ul className="mt-1 grid gap-0.5 text-foreground/85">
                      {page.lines.map(line => <li key={line}>{line}</li>)}
                      {page.status === "ready" && (daTabela.get(page.keywordId) || []).map(line => <li key={`tabela:${line}`} className="text-foreground" data-testid="architect-reinforcement-table-line">{line}</li>)}
                      {page.status === "ready" && doServidor.get(page.keywordId) && doServidor.get(page.keywordId)!.total !== depoisPelaTabela.get(page.keywordId) && (
                        <li className="text-warning" data-testid="architect-reinforcement-server-total">{`Pelo servidor, o artigo fica com ${doServidor.get(page.keywordId)!.total} keywords${doServidor.get(page.keywordId)!.recusadas ? ` (${doServidor.get(page.keywordId)!.recusadas} recusada(s) acima, com o motivo)` : ""}.`}</li>
                      )}
                    </ul>
                    {troca && (
                      <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-foreground/85">
                        <input type="checkbox" className="h-4 w-4 shrink-0" checked={controller.swapAccepted(page.keywordId)} disabled={busy} onChange={() => void controller.toggleDialogSwap(cards, page.keywordId)} />
                        {`Aceitar a troca: "${troca.keyword}" assume a principal (a atual fica como secundária)`}
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {view && view.pages.some(page => page.status === "unchanged") && (
            <p className="text-text-muted" data-testid="architect-reinforcement-unchanged">
              {`Sem mudança (${view.pages.filter(page => page.status === "unchanged").length}): ${view.pages.filter(page => page.status === "unchanged").map(page => `"${page.keyword}"`).join(", ")}. Nada será gravado neles.`}
            </p>
          )}
          {dialog.excluded.length > 0 && (
            <ul className="grid gap-1" data-testid="architect-reinforcement-excluded">
              {dialog.excluded.map(pageId => {
                const id = `architect-reinforcement-excluded-${pageId}`;
                return (
                  <li key={pageId} className="flex flex-wrap items-center gap-2 text-text-muted">
                    <input id={id} type="checkbox" className="h-4 w-4 shrink-0" checked={false} disabled={busy} onChange={() => void controller.toggleDialogPage(pageId)} />
                    <label htmlFor={id} className="min-w-0 text-keyword">{cards.find(card => card.anchorKeywordId === pageId)?.anchorLabel ?? pageId}</label>
                    <span>· fora desta confirmação (nada será gravado nele)</span>
                  </li>
                );
              })}
            </ul>
          )}
          {dialog.left.length > 0 && <p className="text-text-muted">{`Mais ${dialog.left.length} publicado(s) ficam para a próxima confirmação (até 30 por vez).`}</p>}
          {view?.approvalText && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2">
              <p className="text-foreground">{view.approvalText}</p>
              <span className="mt-1 inline-flex items-center gap-2">
                <input id={aprovoId} type="checkbox" className="h-4 w-4 shrink-0" checked={aprovo} disabled={busy} onChange={event => setAprovadoPara(event.target.checked && dialog.data ? dialog.data.decisionHash : null)} data-testid="architect-reinforcement-approve" />
                <label htmlFor={aprovoId} className="cursor-pointer font-medium text-foreground">{PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX}</label>
              </span>
            </div>
          )}
          <p className="text-text-muted">{`${PUBLISHED_REINFORCEMENT_COST_LINE} Nada é gravado sem esta confirmação, e o resultado só é anunciado depois da releitura.`}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={dialog.status === "applying"} onClick={controller.closeReinforcement} className={buttonClassName}>Cancelar</button>
          <button type="button" disabled={!podeGravar} onClick={() => void controller.applyReinforcement(precisaAceite && aprovo)} className={primaryButtonClassName} data-testid="architect-reinforcement-confirm">
            {dialog.status === "applying" ? "Gravando e relendo…" : view?.confirmLabel ?? "Gravar e reler"}
          </button>
        </div>
      </section>
    </div>
  );
}

export const APPLY_TO_SUBJECT_LABEL = "Aplicar no Assunto";

const celula = "px-2 py-2 align-top";

/** Estados do cartão que a coluna "Estado" já diz: repetir o selo seria ruído. */
const ESTADOS_SEM_SELO: ReadonlySet<SerpSubjectCardView["state"]> = new Set(["suggestions_available", "reinforced", "no_pair_in_batch", "no_demand"]);

/** Uma linha da tabela: o publicado (ou Assunto), a principal, as sugeridas com caixinha, o volume e o estado. */
function ReinforcementTableLine({ row, controller, open, highlighted, busy, onToggleOpen, renderDetail, onApplySubject, buttonClassName }: {
  row: ReinforcementTableRow;
  controller: PublishedReinforcementController;
  open: boolean;
  highlighted: boolean;
  busy: boolean;
  onToggleOpen: () => void;
  renderDetail: (card: SerpSubjectCardView) => React.ReactNode;
  onApplySubject: (card: SerpSubjectCardView, keywordIds: readonly string[]) => void;
  buttonClassName: string;
}) {
  const baseId = useId();
  const detalheId = `${baseId}-detalhe`;
  const trocaId = `${baseId}-troca`;
  const tom = SERP_SUBJECT_TONE_CLASSES[row.status.tone];
  const fundo = open ? "border-l-2 border-l-module-accent bg-surface-elevated" : highlighted ? "bg-selected" : "hover:bg-surface-subtle";
  return (
    <Fragment>
      <tr className={`border-b border-divider ${fundo}`} data-testid="architect-reinforcement-row" data-kind={row.kind} data-pending={row.pending ? "true" : "false"}>
        <td className={celula}>
          <span className="block break-words font-medium text-keyword">{row.anchorLabel}</span>
          <span className="block text-text-muted">{`${row.kindLabel} · Silo "${row.siloLabel}"`}</span>
          <button type="button" aria-expanded={open} aria-controls={detalheId} onClick={onToggleOpen} className={`${buttonClassName} mt-1`} data-testid="architect-reinforcement-row-detail">
            {open ? "Esconder a evidência" : "Ver a evidência"}
          </button>
        </td>
        <td className={celula}>
          <span className="block break-words text-keyword">{row.principal.keyword}</span>
          <span className="block text-text-muted">{row.principal.volumeLabel}</span>
          {row.pageNote && <span className="block text-text-muted">{row.pageNote}</span>}
          {row.swap && (
            <span className="mt-1 flex items-start gap-2">
              <input id={trocaId} type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={row.swap.accepted} disabled={busy} onChange={() => controller.toggleSwap(row.anchorKeywordId)} data-testid="architect-reinforcement-row-swap" />
              <label htmlFor={trocaId} className="min-w-0 cursor-pointer text-foreground">
                {`Aceitar a troca: "${row.swap.keyword}" (${row.swap.detail}) vira a principal; a atual fica como secundária`}
              </label>
            </span>
          )}
        </td>
        <td className={celula}>
          {row.suggestions.length ? (
            <ul className="grid gap-1.5" aria-label={`Keywords sugeridas para ${row.anchorLabel}`}>
              {row.suggestions.map(item => {
                const id = `${baseId}-${item.key}`;
                const alternar = () => item.source === "busca" ? controller.toggleSearchPick(row.anchorKeywordId, item.keyword) : controller.toggleSuggestion(row.card, item.keywordId!);
                return (
                  <li key={item.key} className="flex items-start gap-2">
                    <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0" disabled={busy} checked={item.checked} onChange={alternar} />
                    <label htmlFor={id} className="min-w-0 cursor-pointer">
                      <span className="font-medium text-keyword">{item.keyword}</span>
                      <span className={`${badgeBase} ml-2 ${NIVEL_CLASSE[item.level]}`}>{item.levelLabel}</span>
                      <span className={`block ${item.changesSilo ? "text-context-accent" : "text-text-muted"}`}>{item.detail}</span>
                      {item.warning && <span className="block text-warning">{item.warning}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={row.emptyIsError ? "text-warning" : "text-text-muted"}>{row.emptyReason}</p>
          )}
        </td>
        <td className={`${celula} whitespace-nowrap`}>
          <span className="block text-foreground">{row.keywordsChangeLabel}</span>
          <span className="block text-text-muted">{row.volumeChangeLabel}</span>
          {row.capWarning && <span className="block whitespace-normal text-warning">{row.capWarning}</span>}
        </td>
        <td className={celula}>
          <span className={`${badgeBase} ${tom.badge}`}>{row.status.label}</span>
          {row.statusNote && <span className="mt-1 block text-warning" data-testid="architect-reinforcement-row-note">{row.statusNote}</span>}
          {/* O selo do cartão só quando diz algo que o estado não diz (dilema, troca). */}
          {!ESTADOS_SEM_SELO.has(row.card.state) && row.card.stateLabel !== row.status.label && <span className="mt-1 block text-text-muted">{row.card.stateLabel}</span>}
          {row.kind === "subject" && row.suggestions.length > 0 && (
            <button type="button" disabled={busy || !row.subjectPicks.length} onClick={() => onApplySubject(row.card, row.subjectPicks)} className={`${buttonClassName} mt-1`} data-testid="architect-reinforcement-subject-apply">
              {`${APPLY_TO_SUBJECT_LABEL} (${row.subjectPicks.length})`}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td id={detalheId} colSpan={5} className="border-b border-l-2 border-divider border-l-module-accent bg-surface px-2 py-2">
            {renderDetail(row.card)}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * A TABELA ÚNICA do reforço: a frase da regra, "Gravar reforços" com a conta
 * do que ele grava, o desfecho e as linhas. Gravar só pela confirmação.
 */
export function PublishedReinforcementTable({ controller, cards, rows, allRows, busy, highlightedKey = null, renderDetail, onApplySubject, buttonClassName, primaryButtonClassName }: {
  controller: PublishedReinforcementController;
  /** Todos os cartões: o pedido do "Gravar reforços" sai deles. */
  cards: readonly SerpSubjectCardView[];
  /** As linhas visíveis (filtro e ordem da mesa). */
  rows: readonly ReinforcementTableRow[];
  /** Todas as linhas: a conta do botão e as frases da confirmação. */
  allRows: readonly ReinforcementTableRow[];
  busy: boolean;
  highlightedKey?: string | null;
  renderDetail: (card: SerpSubjectCardView) => React.ReactNode;
  onApplySubject: (card: SerpSubjectCardView, keywordIds: readonly string[]) => void;
} & ButtonClasses) {
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => new Set());
  const tituloId = useId();
  const pendentes = allRows.filter(row => row.pending).length;
  const temPublicado = allRows.some(row => row.kind === "published");
  const ocupado = busy || controller.busy;
  const alternar = (key: string) => setAbertas(atual => {
    const proximo = new Set(atual);
    if (proximo.has(key)) proximo.delete(key); else proximo.add(key);
    return proximo;
  });
  return (
    <div className="mt-3 grid gap-2" data-testid="architect-reinforcement-table-section">
      <h3 id={tituloId} className="text-sm font-semibold text-foreground">{PUBLISHED_REINFORCEMENT_ACTION_LABEL}</h3>
      <p className="text-sm leading-6 text-foreground" data-testid="architect-reinforcement-rule">{PUBLISHED_REINFORCEMENT_TABLE_LINE}</p>
      {temPublicado && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={ocupado} onClick={() => void controller.openReinforcement(cards, { includeRecorded: true })} className={primaryButtonClassName} data-testid="architect-reinforcement-open" title="Mostra, por artigo, o que será gravado antes de gravar; o servidor também confere o que falta nos já gravados. Custo: zero.">
            {pendentes ? `${PUBLISHED_REINFORCEMENT_SAVE_LABEL} (${pendentes})` : PUBLISHED_REINFORCEMENT_SAVE_LABEL}
          </button>
          <span className="text-sm leading-6 text-text-muted" data-testid="architect-reinforcement-summary">{reinforcementTableSummary(allRows)}</span>
        </div>
      )}
      <OutcomeBlock controller={controller} buttonClassName={buttonClassName} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm leading-6" aria-labelledby={tituloId} data-testid="architect-reinforcement-table">
          <thead>
            <tr className="border-b border-divider bg-surface-subtle text-text-muted">
              <th scope="col" className="px-2 py-2 font-medium">Publicado ou Assunto</th>
              <th scope="col" className="px-2 py-2 font-medium">Principal atual</th>
              <th scope="col" className="px-2 py-2 font-medium">Keywords sugeridas</th>
              <th scope="col" className="px-2 py-2 font-medium">Volume somado</th>
              <th scope="col" className="px-2 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <ReinforcementTableLine
                key={row.key}
                row={row}
                controller={controller}
                open={abertas.has(row.key)}
                highlighted={row.key === highlightedKey}
                busy={ocupado}
                onToggleOpen={() => alternar(row.key)}
                renderDetail={renderDetail}
                onApplySubject={onApplySubject}
                buttonClassName={buttonClassName}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="text-sm leading-6 text-text-muted">Nenhum publicado ou Assunto neste filtro.</p>}
      <ReinforcementDialog controller={controller} cards={cards} rows={allRows} buttonClassName={buttonClassName} primaryButtonClassName={primaryButtonClassName} />
    </div>
  );
}

/** A confirmação única do custo da busca em lote. */
function SearchConfirmDialog({ controller, buttonClassName, primaryButtonClassName }: { controller: PublishedReinforcementController } & ButtonClasses) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const aberto = controller.search.status === "confirming" && Boolean(controller.search.plan);
  useSubjectDialogFocus(aberto, dialogRef, controller.cancelSearch, !controller.busy);
  if (!aberto || !controller.search.plan) return null;
  const confirmacao = searchConfirmLines(controller.search.plan);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="architect-reinforcement-search-title"
        data-testid="architect-reinforcement-search-dialog"
        className="flex max-h-[86vh] w-full max-w-xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none"
      >
        <h2 id="architect-reinforcement-search-title" className="text-base font-semibold text-foreground">{`${searchActionLabel()}?`}</h2>
        <ul className="grid gap-1 overflow-y-auto text-sm leading-6 text-foreground/85">
          {confirmacao.lines.map(line => <li key={line}>{line}</li>)}
        </ul>
        {confirmacao.blockedReason && <p className="text-sm text-warning">{confirmacao.blockedReason}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={controller.busy} onClick={controller.cancelSearch} className={buttonClassName}>Cancelar (nada é pago)</button>
          <button type="button" disabled={controller.busy || Boolean(confirmacao.blockedReason)} onClick={() => void controller.runSearchConfirmed()} className={primaryButtonClassName} data-testid="architect-reinforcement-search-confirm">
            {confirmacao.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Os "Sem par no lote" numa linha só, com a busca em lote. */
export function NoPairPublishedLine({ controller, view, buttonClassName, primaryButtonClassName }: { controller: PublishedReinforcementController; view: NoPairLineView } & ButtonClasses) {
  const { search } = controller;
  if (!view.pageIds.length) return null;
  const rodando = search.status === "running" || search.status === "planning";
  return (
    <div className="mt-3 rounded-md border border-divider border-l-4 border-l-warning/60 bg-surface p-3 text-sm leading-6" data-testid="architect-reinforcement-no-pair">
      {view.headline && <p className="text-foreground">{view.headline}</p>}
      <p className="text-text-muted">O resultado da busca aparece na tabela, na linha de cada publicado.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={controller.busy || rodando}
          onClick={() => void controller.planSearch(view.pageIds)}
          className={primaryButtonClassName}
          title="Mostra os publicados e o custo antes; nada é pago sem a sua confirmação."
          data-testid="architect-reinforcement-search-open"
        >
          {searchActionLabel()}
        </button>
        {search.run && !rodando && (
          <button type="button" disabled={controller.busy} onClick={() => void controller.planSearch(view.pageIds, "replace")} className={buttonClassName} data-testid="architect-reinforcement-search-replan">
            Nova busca (outra rodada paga, com prévia)
          </button>
        )}
      </div>
      {rodando && (
        <p className="mt-1 text-text-muted" aria-live="polite">
          {search.status === "planning" ? "Montando a prévia da busca (grátis)…" : `Buscando keywords para ${view.pageIds.length} publicado(s): Google Ads e SERP das melhores candidatas…`}
        </p>
      )}
      {search.error && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-warning">{search.error}</span>
          {search.retryOperationId && <button type="button" disabled={controller.busy} onClick={() => void controller.retrySearch()} className={buttonClassName}>Tentar de novo (a mesma rodada, sem pagar de novo)</button>}
        </div>
      )}
      {search.message && !rodando && <p className="mt-1 text-foreground/85" aria-live="polite">{search.message}</p>}
      {search.plan?.differentiation.map(grupo => <p key={grupo.groupId} className="mt-1 text-text-muted">{grupo.message}</p>)}
      <SearchConfirmDialog controller={controller} buttonClassName={buttonClassName} primaryButtonClassName={primaryButtonClassName} />
    </div>
  );
}
