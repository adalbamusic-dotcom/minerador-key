"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { SERP_SUBJECT_THRESHOLDS } from "@/lib/arquiteto/serp-subject-overlap";
import { REINFORCEMENT_SEARCH_ACTION_LABEL } from "@/lib/arquiteto/serp-subject-diagnosis";
import type { CrossSiloReinforcementProposal } from "@/lib/arquiteto/article-formation-priority";
import { useSubjectDialogFocus } from "./subject-panels";
import {
  APPLY_SUGGESTIONS_ACTION_LABEL,
  SERP_SUBJECT_CARD_STATE_LABELS,
  SERP_SUBJECT_EVIDENCE_RELATION_LABELS,
  SERP_SUBJECT_TONE_CLASSES,
  initialSuggestionSelection,
  suggestionApplyPreview,
  type SerpSubjectBatchChoice,
  type SerpSubjectCardAction,
  type SerpSubjectCardState,
  type SerpSubjectCardView,
  type SerpSubjectEvidencePair,
  type SerpSubjectPanelSummary,
} from "./serp-subject-model";

/**
 * MESMO ASSUNTO NO GOOGLE — O PAINEL DA MESA (D2.1 e D2.2).
 *
 * Um cartão por publicado e por Assunto, com o dilema dito numa frase curta,
 * os botões dele e, ao expandir, a evidência: as páginas do top 10 em comum,
 * em que lente cada uma aparece. No topo, o resumo do lote e a ação em grupo
 * para aceitar as trocas e os reforços escolhidos — com confirmação e o
 * desfecho da releitura.
 *
 * A tela não decide nada: o estado vem do domínio (`serp-subject-diagnosis`)
 * e do modelo (`serp-subject-model`); toda gravação é ato humano confirmado
 * pelo remoto. As classes de botão chegam por prop, como nos painéis do
 * Assunto, para não haver um segundo estilo de botão.
 *
 * D2.3 — cada cartão traz as SUGESTÕES com volume, por volume: Forte vem
 * marcada, Provável desmarcada, cada uma com nível, volume e motivo curto. O
 * dono marca e aplica de uma vez ("Aplicar selecionadas"), até o teto de 6,
 * com confirmação que diz o que entra no artigo, o que sai de outro artigo e
 * o que muda de Silo antes. Só a releitura confirma.
 */

export type SerpSubjectReadStatus = {
  state: "idle" | "loading" | "ready" | "failed";
  error: string | null;
  egressLabel: string;
  /** Keywords pedidas e as que não têm SERP no cache. */
  requested: number;
  withoutSerp: number;
  targetingReadFailed: boolean;
};

type Handlers = {
  onApplySwap: (anchorKeywordId: string) => void;
  onKeepSwap: (anchorKeywordId: string) => void;
  onReviewSwap: (anchorKeywordId: string) => void;
  onBringPair: (proposals: readonly CrossSiloReinforcementProposal[]) => void;
  onSearch: (href: string) => void;
  onCollectSerp: (siloRef: string) => void;
  onOpenMinerador: (href: string) => void;
  /** Abre o artigo na mesa (o que ficou com o par, ou este, para liberar vaga). */
  onOpenArticle: (siloRef: string, principalKeywordId: string) => void;
  /** D2.3 — aplica as sugestões marcadas (só depois da confirmação). */
  onApplySuggestions: (cardKey: string, keywordIds: readonly string[]) => Promise<void> | void;
};

type ButtonClasses = { buttonClassName: string; primaryButtonClassName: string };

const badgeBase = "inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-sm font-medium";

const EVIDENCIA_ROTULO: Record<SerpSubjectCardView["serpEvidence"], string> = {
  complete: "SERP da âncora completa no cache (4 lentes)",
  partial: "SERP da âncora incompleta no cache: falta lente",
  missing: "Sem SERP da âncora no cache",
};

function ActionButton({ action, card, busy, handlers, buttonClassName, primaryButtonClassName }: { action: SerpSubjectCardAction; card: SerpSubjectCardView; busy: boolean; handlers: Handlers } & ButtonClasses) {
  const alvo = `${card.kindLabel} "${card.anchorLabel}"`;
  switch (action.kind) {
    case "apply_swap":
      return (
        <button
          type="button"
          disabled={busy || Boolean(action.disabledReason)}
          title={action.disabledReason ?? "Grava uma nova versão do ArticleDNA, em revisão. URL, slug e canonical não mudam."}
          aria-label={`${action.label} em ${alvo}`}
          onClick={() => handlers.onApplySwap(card.anchorKeywordId)}
          className={primaryButtonClassName}
          data-testid="architect-serp-subject-apply-swap"
        >
          {action.label}
        </button>
      );
    case "keep_swap":
      return <button type="button" disabled={busy} aria-label={`${action.label} a principal de ${alvo}`} onClick={() => handlers.onKeepSwap(card.anchorKeywordId)} className={buttonClassName} data-testid="architect-serp-subject-keep-swap">{action.label}</button>;
    case "review_swap":
      return <button type="button" disabled={busy} onClick={() => handlers.onReviewSwap(card.anchorKeywordId)} className={buttonClassName}>{action.label}</button>;
    case "bring_pair":
      return (
        <button type="button" disabled={busy} onClick={() => handlers.onBringPair(action.proposals)} className={primaryButtonClassName} aria-label={`${action.label}: ${alvo}`} data-testid="architect-serp-subject-bring-pair">
          {action.label}
        </button>
      );
    case "search_reinforcement":
      return (
        <button
          type="button"
          disabled={busy || !action.href}
          title={action.href ? "Abre a Pesquisa por Assunto do Minerador com o tema e a página de destino. A pesquisa mostra o custo antes de rodar." : "Marca ativa sem rota: recarregue a página."}
          onClick={() => action.href && handlers.onSearch(action.href)}
          className={buttonClassName}
          aria-label={`${action.label} para ${alvo}`}
          data-testid="architect-serp-subject-search"
        >
          {action.label}
        </button>
      );
    case "collect_serp":
      return <button type="button" disabled={busy} onClick={() => handlers.onCollectSerp(card.siloRef)} className={buttonClassName} title="Mostra o plano de chamadas pagas antes; nada é pago sem a sua confirmação.">{action.label}</button>;
    case "open_minerador":
      return <button type="button" disabled={busy || !action.href} onClick={() => action.href && handlers.onOpenMinerador(action.href)} className={buttonClassName}>{action.label}</button>;
    case "open_article":
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => handlers.onOpenArticle(action.siloRef, action.principalKeywordId)}
          className={buttonClassName}
          title={'Abre o artigo na mesa. Lá, "Mover para…" leva a keyword com prévia do efeito; nada muda sem a sua confirmação.'}
          data-testid="architect-serp-subject-open-article"
        >
          {action.label}
        </button>
      );
  }
}

function EvidenceList({ pairs }: { pairs: readonly SerpSubjectEvidencePair[] }) {
  if (!pairs.length) return <p className="text-sm leading-6 text-text-muted">Nenhuma keyword para comparar com esta âncora.</p>;
  return (
    <ul className="grid gap-2" data-testid="architect-serp-subject-evidence">
      {pairs.map(pair => (
        <li key={pair.keywordId} className="border-t border-divider/70 pt-2 text-sm leading-6">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-keyword">{pair.keyword}</span>
            <span className="text-text-muted">· {SERP_SUBJECT_EVIDENCE_RELATION_LABELS[pair.relation]}</span>
            <span className={pair.strength === "strong" ? "text-success" : pair.strength === "unknown" ? "text-warning" : "text-text-muted"}>
              · {pair.strength === "unknown" ? "sem SERP para medir" : `${pair.sharedPageCount} página(s) em comum`}
            </span>
          </div>
          <p className="text-text-muted">{pair.reason}</p>
          {pair.pages.length > 0 && (
            <ul className="mt-1 grid gap-0.5">
              {pair.pages.map(page => (
                <li key={page.page} className="min-w-0 break-words text-foreground/85">
                  <span className="text-foreground">{page.page}</span>
                  <span className="text-text-muted">{` — âncora: ${page.anchorLenses.join(", ") || "sem lente"} · esta: ${page.otherLenses.join(", ") || "sem lente"}`}</span>
                </li>
              ))}
            </ul>
          )}
          {(pair.missingLensesAnchor.length > 0 || pair.missingLensesOther.length > 0) && (
            <p className="text-warning">
              {pair.missingLensesAnchor.length > 0 ? `Falta no cache para a âncora: ${pair.missingLensesAnchor.join(", ")}. ` : ""}
              {pair.missingLensesOther.length > 0 ? `Falta para esta: ${pair.missingLensesOther.join(", ")}.` : ""}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Quantas linhas a lista mostra antes de "Ver todas". */
const SUGESTOES_VISIVEIS = 8;

const NIVEL_CLASSE: Record<SerpSubjectCardView["suggestions"][number]["level"], string> = {
  strong: "border-success/40 bg-success/10 text-success",
  probable: "border-context-accent/40 bg-context-accent/10 text-context-accent",
};

/** D2.3 — a confirmação de "Aplicar selecionadas": o que entra, o que sai de outro artigo, o que muda de Silo. */
function SuggestionConfirmDialog({ open, card, selected, busy, onConfirm, onClose, buttonClassName, primaryButtonClassName }: {
  open: boolean;
  card: SerpSubjectCardView;
  selected: ReadonlySet<string>;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
} & ButtonClasses) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useSubjectDialogFocus(open, dialogRef, onClose, !busy);
  if (!open) return null;
  const previa = suggestionApplyPreview(card, selected);
  const tituloId = `architect-suggestions-title-${card.anchorKeywordId}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        data-testid="architect-serp-subject-suggestions-dialog"
        className="flex max-h-[86vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none"
      >
        <h2 id={tituloId} className="text-base font-semibold text-foreground">{`${APPLY_SUGGESTIONS_ACTION_LABEL} em "${card.anchorLabel}"`}</h2>
        <div className="grid gap-3 overflow-y-auto text-sm leading-6">
          {previa.intoArticle.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground/80">{card.suggestionMode === "create" ? "Formam o artigo do Assunto" : "Entram no artigo"} · {previa.intoArticle.length}</h3>
              <ul className="mt-1 grid gap-1">{previa.intoArticle.map(item => <li key={item.keywordId} className="text-foreground">{`${item.keyword} · ${item.volumeLabel} · ${item.levelLabel}`}</li>)}</ul>
            </div>
          )}
          {previa.fromOtherArticle.length > 0 && (
            <p className="text-warning">{`Saem de outro artigo: ${previa.fromOtherArticle.map(item => `"${item.keyword}" (${item.whereLabel})`).join(", ")}. Aquele artigo fica sem elas.`}</p>
          )}
          {previa.changeSilo.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground/80">Mudam de Silo primeiro · {previa.changeSilo.length}</h3>
              <p className="text-text-muted">A mudança é a mesma decisão de Silo da aba Silos. Depois, elas aparecem nesta lista para entrar no artigo.</p>
              <ul className="mt-1 grid gap-1">{previa.changeSilo.map(item => <li key={item.keywordId} className="text-foreground">{`${item.keyword} · ${item.whereLabel}`}</li>)}</ul>
            </div>
          )}
          <p className="text-text-muted">{card.suggestionMode === "create" ? "A principal é a de maior volume. O Assunto fica como tronco e não entra no teto." : "URL, slug e canonical não mudam."} Nada é gravado sem esta confirmação, e só a releitura confirma.</p>
          {previa.blockedReason && <p className="text-warning">{previa.blockedReason}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={buttonClassName}>Cancelar</button>
          <button type="button" disabled={busy || Boolean(previa.blockedReason)} onClick={onConfirm} className={primaryButtonClassName} data-testid="architect-serp-subject-suggestions-confirm">
            {busy ? "Aplicando…" : `Aplicar ${selected.size}`}
          </button>
        </div>
      </section>
    </div>
  );
}

/** D2.3 — a lista de sugestões do cartão, por volume, com a seleção e o botão. */
function SuggestionList({ card, busy, handlers, buttonClassName, primaryButtonClassName }: { card: SerpSubjectCardView; busy: boolean; handlers: Handlers } & ButtonClasses) {
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(() => initialSuggestionSelection(card));
  const [todas, setTodas] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const listaId = useId();
  const visiveis = todas ? card.suggestions : card.suggestions.slice(0, SUGESTOES_VISIVEIS);
  const noArtigo = card.suggestions.filter(item => selecionadas.has(item.keywordId) && item.where !== "other_silo").length;
  const alternar = (keywordId: string) => setSelecionadas(atual => {
    const proximo = new Set(atual);
    if (proximo.has(keywordId)) proximo.delete(keywordId); else proximo.add(keywordId);
    return proximo;
  });
  return (
    <div className="mt-2 grid gap-2 border-t border-divider pt-2" data-testid="architect-serp-subject-suggestions">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={listaId} className="text-sm font-semibold text-foreground">{`Sugestões de reforço · ${card.suggestions.length} com volume`}</h3>
        <span className="text-sm text-text-muted">{card.suggestionLimit ? `Cabem ${card.suggestionLimit}` : "Artigo no teto de 6"}</span>
      </div>
      <ul className="grid gap-1.5" aria-labelledby={listaId}>
        {visiveis.map(item => {
          const id = `${listaId}-${item.keywordId}`;
          return (
            <li key={item.keywordId} className="flex items-start gap-2 text-sm leading-6">
              <input
                id={id}
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                disabled={busy}
                checked={selecionadas.has(item.keywordId)}
                onChange={() => alternar(item.keywordId)}
              />
              <label htmlFor={id} className="min-w-0">
                <span className="font-medium text-keyword">{item.keyword}</span>
                <span className={`${badgeBase} ml-2 ${NIVEL_CLASSE[item.level]}`}>{item.levelLabel}</span>
                <span className="block text-text-muted">{`${item.volumeLabel} · ${item.reason}${item.where === "leftover" ? "" : ` · ${item.whereLabel}`}`}</span>
                {item.warning && <span className="block text-warning">{item.warning}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {card.suggestions.length > SUGESTOES_VISIVEIS && (
          <button type="button" onClick={() => setTodas(atual => !atual)} className={buttonClassName} aria-expanded={todas}>
            {todas ? "Ver menos" : `Ver todas (${card.suggestions.length})`}
          </button>
        )}
        <button
          type="button"
          disabled={busy || !selecionadas.size}
          onClick={() => setConfirmando(true)}
          className={primaryButtonClassName}
          title={noArtigo > card.suggestionLimit ? `Cabem ${card.suggestionLimit} neste artigo.` : "Mostra o que muda antes de gravar."}
          data-testid="architect-serp-subject-suggestions-open"
        >
          {`${APPLY_SUGGESTIONS_ACTION_LABEL} (${selecionadas.size})`}
        </button>
      </div>
      <SuggestionConfirmDialog
        open={confirmando}
        card={card}
        selected={selecionadas}
        busy={busy}
        onClose={() => setConfirmando(false)}
        onConfirm={() => {
          void (async () => {
            await handlers.onApplySuggestions(card.key, [...selecionadas]);
            setConfirmando(false);
          })();
        }}
        buttonClassName={buttonClassName}
        primaryButtonClassName={primaryButtonClassName}
      />
    </div>
  );
}

/** Um publicado ou Assunto: o dilema, os botões e a evidência ao expandir. */
export function SerpSubjectCard({
  card,
  busy,
  evidenceOf,
  handlers,
  buttonClassName,
  primaryButtonClassName,
  highlighted = false,
}: {
  card: SerpSubjectCardView;
  busy: boolean;
  evidenceOf: (card: SerpSubjectCardView) => SerpSubjectEvidencePair[];
  handlers: Handlers;
  highlighted?: boolean;
} & ButtonClasses) {
  const [open, setOpen] = useState(false);
  const detalheId = useId();
  const tom = SERP_SUBJECT_TONE_CLASSES[card.tone];
  const evidencia = useMemo(() => open ? evidenceOf(card) : [], [open, evidenceOf, card]);
  return (
    <article
      className={`rounded-md border border-divider border-l-4 ${tom.accent} bg-surface p-3 ${highlighted ? "ring-2 ring-module-accent/30" : ""}`}
      data-testid="architect-serp-subject-card"
      data-state={card.state}
      aria-label={`${card.kindLabel} ${card.anchorLabel}: ${card.stateLabel}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${badgeBase} ${tom.badge}`}>{card.stateLabel}</span>
        <span className="text-sm text-text-muted">{`${card.kindLabel} · Silo "${card.siloLabel}"`}</span>
      </div>
      <p className="mt-1 text-base font-semibold leading-6 text-keyword">{card.anchorLabel}</p>
      <p className="mt-1 text-sm leading-6 text-foreground">{card.headline}</p>
      {card.subline && <p className="mt-0.5 break-words text-sm leading-6 text-text-muted">{card.subline}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {card.actions.map(action => (
          <ActionButton key={`${action.kind}:${action.label}`} action={action} card={card} busy={busy} handlers={handlers} buttonClassName={buttonClassName} primaryButtonClassName={primaryButtonClassName} />
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detalheId}
          onClick={() => setOpen(current => !current)}
          className={buttonClassName}
          data-testid="architect-serp-subject-expand"
        >
          {open ? "Esconder a evidência" : "Ver a evidência"}
        </button>
      </div>
      {card.actions.filter(action => action.kind === "apply_swap" && action.disabledReason).map(action => (
        <p key="apply-swap-reason" className="mt-1 text-sm leading-6 text-warning">{action.kind === "apply_swap" ? action.disabledReason : null}</p>
      ))}
      {card.suggestions.length > 0 && (
        <SuggestionList
          key={card.suggestions.map(item => `${item.keywordId}:${item.preselected ? 1 : 0}`).join("|")}
          card={card}
          busy={busy}
          handlers={handlers}
          buttonClassName={buttonClassName}
          primaryButtonClassName={primaryButtonClassName}
        />
      )}
      {open && (
        <div id={detalheId} className="mt-2 grid gap-2 border-t border-divider pt-2">
          <p className="text-sm leading-6 text-text-muted">
            {EVIDENCIA_ROTULO[card.serpEvidence]}. Mesmo assunto = {SERP_SUBJECT_THRESHOLDS.strongPages} ou mais páginas em comum no top 10, somando as 4 lentes; {SERP_SUBJECT_THRESHOLDS.supportPages} só valem com palavras em comum.
          </p>
          {card.details.length > 0 && (
            <ul className="grid gap-1 text-sm leading-6 text-foreground/85">
              {card.details.map(detail => <li key={detail}>{detail}</li>)}
            </ul>
          )}
          <EvidenceList pairs={evidencia} />
        </div>
      )}
    </article>
  );
}

const FILTROS: ReadonlyArray<{ key: "all" | "attention" | SerpSubjectCardState; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "attention", label: "Pedem decisão" },
  { key: "swap_proposed", label: SERP_SUBJECT_CARD_STATE_LABELS.swap_proposed },
  { key: "reinforced", label: SERP_SUBJECT_CARD_STATE_LABELS.reinforced },
  { key: "suggestions_available", label: SERP_SUBJECT_CARD_STATE_LABELS.suggestions_available },
  { key: "pair_in_other_silo", label: SERP_SUBJECT_CARD_STATE_LABELS.pair_in_other_silo },
  { key: "pair_in_other_article", label: SERP_SUBJECT_CARD_STATE_LABELS.pair_in_other_article },
  { key: "no_pair_in_batch", label: SERP_SUBJECT_CARD_STATE_LABELS.no_pair_in_batch },
  { key: "no_demand", label: SERP_SUBJECT_CARD_STATE_LABELS.no_demand },
  { key: "serp_missing", label: SERP_SUBJECT_CARD_STATE_LABELS.serp_missing },
  { key: "pair_blocked_by_dna", label: SERP_SUBJECT_CARD_STATE_LABELS.pair_blocked_by_dna },
  { key: "pair_without_volume", label: SERP_SUBJECT_CARD_STATE_LABELS.pair_without_volume },
  { key: "swap_applied", label: SERP_SUBJECT_CARD_STATE_LABELS.swap_applied },
  { key: "swap_kept", label: SERP_SUBJECT_CARD_STATE_LABELS.swap_kept },
];

/** Estados que pedem uma decisão ou uma ação do dono. */
const PEDEM_DECISAO = new Set<SerpSubjectCardState>(["swap_proposed", "suggestions_available", "pair_in_other_silo", "pair_in_other_article", "pair_blocked_by_dna", "pair_without_volume", "no_pair_in_batch", "serp_missing"]);

function BatchConfirmDialog({ open, choices, busy, onConfirm, onClose, buttonClassName, primaryButtonClassName }: {
  open: boolean;
  choices: readonly SerpSubjectBatchChoice[];
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
} & ButtonClasses) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useSubjectDialogFocus(open, dialogRef, onClose, !busy);
  if (!open) return null;
  const trocas = choices.filter(choice => choice.kind === "swap");
  const movidas = choices.filter(choice => choice.kind === "cross_silo");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="architect-serp-subject-batch-title"
        data-testid="architect-serp-subject-batch-dialog"
        className="flex max-h-[86vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none"
      >
        <h2 id="architect-serp-subject-batch-title" className="text-base font-semibold text-foreground">Aplicar {choices.length} decisão(ões) escolhida(s)</h2>
        <div className="grid gap-3 overflow-y-auto text-sm leading-6">
          {trocas.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground/80">Trocas da principal · {trocas.length}</h3>
              <p className="text-text-muted">Cada troca grava uma nova versão do ArticleDNA, em revisão, com a decisão e o histórico. A principal antiga fica no artigo como secundária. URL, slug e canonical não mudam.</p>
              <ul className="mt-1 grid gap-1">{trocas.map(choice => <li key={choice.id} className="text-foreground">{choice.label}</li>)}</ul>
            </div>
          )}
          {movidas.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground/80">Reforços de outro Silo · {movidas.length}</h3>
              <p className="text-text-muted">Cada keyword muda de Silo pela mesma decisão da aba Silos, com lock por item. A formação do Silo de destino a oferece ao artigo.</p>
              <ul className="mt-1 grid gap-1">{movidas.map(choice => <li key={choice.id} className="text-foreground">{choice.label}</li>)}</ul>
            </div>
          )}
          <p className="text-text-muted">Só o que a releitura do servidor confirmar é anunciado como aplicado.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={buttonClassName}>Cancelar</button>
          <button type="button" disabled={busy || !choices.length} onClick={onConfirm} className={primaryButtonClassName} data-testid="architect-serp-subject-batch-confirm">
            {busy ? "Aplicando…" : `Aplicar ${choices.length} escolhida(s)`}
          </button>
        </div>
      </section>
    </div>
  );
}

/** O painel do lote: resumo, filtro, ação em grupo e um cartão por publicado e Assunto. */
export function SerpSubjectDiagnosisPanel({
  cards,
  summary,
  read,
  choices,
  busy,
  highlightedKey = null,
  evidenceOf,
  handlers,
  onReread,
  onApplyBatch,
  buttonClassName,
  primaryButtonClassName,
}: {
  cards: readonly SerpSubjectCardView[];
  summary: SerpSubjectPanelSummary;
  read: SerpSubjectReadStatus;
  choices: readonly SerpSubjectBatchChoice[];
  busy: boolean;
  highlightedKey?: string | null;
  evidenceOf: (card: SerpSubjectCardView) => SerpSubjectEvidencePair[];
  handlers: Handlers;
  onReread: () => void;
  onApplyBatch: (choices: readonly SerpSubjectBatchChoice[]) => Promise<void> | void;
} & ButtonClasses) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["key"]>("attention");
  const [escolhidas, setEscolhidas] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const grupoId = useId();

  const visiveis = cards.filter(card => filtro === "all" ? true : filtro === "attention" ? PEDEM_DECISAO.has(card.state) : card.state === filtro);
  const disponiveis = choices.filter(choice => !choice.disabledReason);
  const selecionadas = disponiveis.filter(choice => escolhidas.has(choice.id));
  const contagem = (key: (typeof FILTROS)[number]["key"]) => key === "all" ? cards.length : key === "attention" ? cards.filter(card => PEDEM_DECISAO.has(card.state)).length : cards.filter(card => card.state === key).length;

  const alternar = (id: string) => setEscolhidas(current => {
    const proximo = new Set(current);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });

  const numeros: Array<{ label: string; value: number; tone: string }> = [
    { label: "Reforçados", value: summary.reinforced, tone: "text-success" },
    { label: "Trocas sugeridas", value: summary.swapsSuggested, tone: "text-context-accent" },
    { label: "Com sugestões de reforço", value: summary.withSuggestions, tone: "text-context-accent" },
    { label: "Pares em outros Silos", value: summary.pairsInOtherSilos, tone: "text-context-accent" },
    { label: "Pares em outros artigos", value: summary.pairsInOtherArticles, tone: "text-context-accent" },
    { label: "Sem par no lote", value: summary.withoutPair, tone: "text-warning" },
    { label: "Sem demanda no Google", value: summary.withoutDemand, tone: "text-text-muted" },
  ];
  const outros = [
    summary.swapsApplied ? `${summary.swapsApplied} troca(s) aplicada(s)` : "",
    summary.swapsKept ? `${summary.swapsKept} principal(is) mantida(s)` : "",
    summary.withoutSerp ? `${summary.withoutSerp} sem SERP no cache` : "",
    summary.blockedByDna ? `${summary.blockedByDna} com intenção diferente` : "",
    summary.pairWithoutVolume ? `${summary.pairWithoutVolume} com par sem volume` : "",
  ].filter(Boolean);

  return (
    <section className="border-b border-divider bg-surface-subtle px-4 py-4" data-testid="architect-serp-subject-panel" aria-labelledby={`${grupoId}-titulo`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${grupoId}-titulo`} className="text-sm font-bold uppercase tracking-widest text-context-accent">Mesmo assunto no Google · publicados e Assuntos</h2>
          <p className="mt-1 text-sm leading-6 text-foreground">{summary.headline}</p>
          <p className="mt-0.5 text-sm leading-6 text-text-muted">
            {read.state === "loading"
              ? "Lendo a SERP do cache (sem custo)…"
              : read.state === "failed"
                ? `A leitura do cache falhou: ${read.error || "sem detalhe"}. A formação usou só palavras e DNA.`
                : read.state === "ready"
                  ? `${read.egressLabel}${read.withoutSerp ? ` ${read.withoutSerp} de ${read.requested} keyword(s) sem SERP no cache.` : ""}${read.targetingReadFailed ? " A localidade do Minerador não pôde ser lida; a leitura usou a do ambiente." : ""}`
                  : "A SERP do cache ainda não foi lida."}
          </p>
        </div>
        <button type="button" disabled={busy || read.state === "loading"} onClick={onReread} className={buttonClassName} data-testid="architect-serp-subject-reread" title="Relê o cache de SERP já pago. Não chama o provider.">
          {read.state === "loading" ? "Lendo o cache…" : "Reler o cache de SERP"}
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {numeros.map(numero => (
          <div key={numero.label} className="rounded-md border border-divider bg-surface px-3 py-2">
            <dt className="text-sm text-text-muted">{numero.label}</dt>
            <dd className={`text-base font-semibold ${numero.tone}`}>{numero.value}</dd>
          </div>
        ))}
      </dl>
      {outros.length > 0 && <p className="mt-2 text-sm leading-6 text-text-muted">Também: {outros.join(" · ")}.</p>}

      {choices.length > 0 && (
        <fieldset className="mt-3 rounded-md border border-divider bg-surface p-3" data-testid="architect-serp-subject-batch">
          <legend className="px-1 text-sm font-semibold text-foreground">Aceitar em grupo · {disponiveis.length} de {choices.length} disponível(is)</legend>
          <p className="text-sm leading-6 text-text-muted">Marque as trocas e os reforços que você aceita. Nada é aplicado antes da confirmação.</p>
          <ul className="mt-2 grid gap-1.5">
            {choices.map(choice => {
              const id = `${grupoId}-${choice.id}`;
              return (
                <li key={choice.id} className="flex items-start gap-2 text-sm leading-6">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    disabled={busy || Boolean(choice.disabledReason)}
                    checked={escolhidas.has(choice.id) && !choice.disabledReason}
                    onChange={() => alternar(choice.id)}
                  />
                  <label htmlFor={id} className="min-w-0">
                    <span className={choice.disabledReason ? "text-text-muted" : "text-foreground"}>{choice.label}</span>
                    {choice.disabledReason && <span className="block text-warning">{choice.disabledReason}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          {disponiveis.some(choice => choice.probable) && (
            <p className="mt-2 text-sm leading-6 text-text-muted">{"Troca Provável não entra em \"Marcar todas\": marque uma a uma."}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !disponiveis.length} onClick={() => setEscolhidas(new Set(disponiveis.filter(choice => !choice.probable).map(choice => choice.id)))} className={buttonClassName}>Marcar todas as disponíveis</button>
            <button type="button" disabled={busy || !selecionadas.length} onClick={() => setEscolhidas(new Set())} className={buttonClassName}>Limpar</button>
            <button type="button" disabled={busy || !selecionadas.length} onClick={() => setConfirmando(true)} className={primaryButtonClassName} data-testid="architect-serp-subject-batch-open">
              Aplicar escolhidas ({selecionadas.length})
            </button>
          </div>
        </fieldset>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar publicados e Assuntos pelo estado">
        {FILTROS.filter(item => item.key === "all" || item.key === "attention" || contagem(item.key) > 0).map(item => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filtro === item.key}
            onClick={() => setFiltro(item.key)}
            className={`${buttonClassName} ${filtro === item.key ? "border-module-accent/45 text-foreground" : ""}`}
          >
            {item.label} · {contagem(item.key)}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {visiveis.map(card => (
          <SerpSubjectCard
            key={card.key}
            card={card}
            busy={busy}
            evidenceOf={evidenceOf}
            handlers={handlers}
            highlighted={card.key === highlightedKey}
            buttonClassName={buttonClassName}
            primaryButtonClassName={primaryButtonClassName}
          />
        ))}
        {!visiveis.length && <p className="text-sm leading-6 text-text-muted">Nenhum publicado ou Assunto neste filtro.</p>}
      </div>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        {`"${REINFORCEMENT_SEARCH_ACTION_LABEL}" abre a Pesquisa por Assunto do Minerador com o tema e a página de destino; a pesquisa mostra o custo antes de rodar. Nenhuma keyword de outro assunto é colada para encher um artigo.`}
      </p>

      <BatchConfirmDialog
        open={confirmando}
        choices={selecionadas}
        busy={busy}
        onClose={() => setConfirmando(false)}
        onConfirm={() => {
          void (async () => {
            await onApplyBatch(selecionadas);
            setConfirmando(false);
            setEscolhidas(new Set());
          })();
        }}
        buttonClassName={buttonClassName}
        primaryButtonClassName={primaryButtonClassName}
      />
    </section>
  );
}
