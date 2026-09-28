"use client";

import React, { useId, useRef, useState } from "react";
import { useSubjectDialogFocus } from "./subject-panels";
import { SERP_SUBJECT_TONE_CLASSES, type SerpSubjectCardView } from "./serp-subject-model";
import {
  PUBLISHED_REINFORCEMENT_ACTION_LABEL,
  PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX,
  PUBLISHED_REINFORCEMENT_COST_LINE,
  reinforcementBarSummary,
  reinforcementPreviewView,
  searchActionLabel,
  searchConfirmLines,
  searchSuggestionViews,
  type NoPairLineView,
} from "./published-reinforcement-model";
import type { PublishedReinforcementController } from "./use-published-reinforcement";
import type { ReinforcementPageResult } from "@/lib/arquiteto/published-reinforcement-search";

/**
 * REFORÇAR PUBLICADOS — A TELA (SDD docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md).
 *
 *   a barra        "Reforçar publicados": abre a confirmação com a prévia do
 *                  servidor — por artigo, o que será gravado (ArticleDNA novo
 *                  ou versão, troca, reforços, keywords novas que você aprova
 *                  no Minerador) e o custo (zero para gravar). O desfecho diz o
 *                  que foi gravado e o que não foi.
 *   a linha        os "Sem par no lote" numa linha só, com "Buscar keywords
 *                  para os publicados sem par (até US$ 1,00)": prévia grátis,
 *                  UMA confirmação do custo, progresso e o resultado nos cartões.
 *   a lista        no cartão do publicado, as keywords que a busca trouxe
 *                  (Forte marcada, Provável desmarcada), para o "Reforçar".
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
function ReinforcementDialog({ controller, cards, buttonClassName, primaryButtonClassName }: { controller: PublishedReinforcementController; cards: readonly SerpSubjectCardView[] } & ButtonClasses) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [aprovadoPara, setAprovadoPara] = useState<string | null>(null);
  const aprovoId = useId();
  const { dialog } = controller;
  const busy = controller.busy || dialog.status === "loading" || dialog.status === "applying";
  useSubjectDialogFocus(dialog.open, dialogRef, controller.closeReinforcement, !busy);
  if (!dialog.open) return null;
  const view = dialog.data ? reinforcementPreviewView(dialog.data) : null;
  const trocaDe = new Map(cards.filter(card => card.swapSubstitute).map(card => [card.anchorKeywordId, card.swapSubstitute!]));
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
        <h2 id="architect-reinforcement-title" className="text-base font-semibold text-foreground">{`${PUBLISHED_REINFORCEMENT_ACTION_LABEL}?`}</h2>
        <div className="grid gap-3 overflow-y-auto text-sm leading-6">
          {dialog.status === "loading" && <p className="text-text-muted">Montando a prévia (grátis, nada é gravado)…</p>}
          {dialog.notices.map(aviso => <p key={aviso} className="text-text-muted" data-testid="architect-reinforcement-reassigned">{aviso}</p>)}
          {dialog.error && <p className="text-warning">{dialog.error}</p>}
          {view && <p className="text-foreground" data-testid="architect-reinforcement-headline">{view.headline}</p>}
          {view && (
            <ul className="grid gap-2">
              {view.pages.map(page => {
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

/** A barra do "Reforçar publicados": o botão, a frase do que ele faz e o desfecho. */
export function PublishedReinforcementBar({ controller, cards, buttonClassName, primaryButtonClassName }: { controller: PublishedReinforcementController; cards: readonly SerpSubjectCardView[] } & ButtonClasses) {
  const publicados = cards.filter(card => card.kind === "published");
  if (!publicados.length) return null;
  const resumo = reinforcementBarSummary(publicados);
  return (
    <div className="mt-3 rounded-md border border-divider bg-surface p-3" data-testid="architect-reinforcement-bar">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={controller.busy} onClick={() => void controller.openReinforcement(cards)} className={primaryButtonClassName} data-testid="architect-reinforcement-open">
          {PUBLISHED_REINFORCEMENT_ACTION_LABEL}
        </button>
        <span className="text-sm leading-6 text-text-muted">
          {`Grava nos publicados, numa confirmação só, o ArticleDNA, a troca aceita e os reforços marcados. ${resumo ? `${resumo}. ` : ""}${PUBLISHED_REINFORCEMENT_COST_LINE}`}
        </span>
      </div>
      <OutcomeBlock controller={controller} buttonClassName={buttonClassName} />
      <ReinforcementDialog controller={controller} cards={cards} buttonClassName={buttonClassName} primaryButtonClassName={primaryButtonClassName} />
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
    <div className="rounded-md border border-divider border-l-4 border-l-warning/60 bg-surface p-3 text-sm leading-6 lg:col-span-2" data-testid="architect-reinforcement-no-pair">
      {view.headline && <p className="text-foreground">{view.headline}</p>}
      {view.names && <p className="break-words text-text-muted">{view.names}</p>}
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
      {view.without.length > 0 && (
        <ul className="mt-1 grid gap-0.5 text-text-muted">
          {view.without.map(item => <li key={item.keyword}><span className="text-keyword">{item.keyword}</span>{` · ${item.reason}`}</li>)}
        </ul>
      )}
      <SearchConfirmDialog controller={controller} buttonClassName={buttonClassName} primaryButtonClassName={primaryButtonClassName} />
    </div>
  );
}
