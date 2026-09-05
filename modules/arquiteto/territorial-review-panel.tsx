"use client";

import React from "react";
import type { TerritorialReviewAction, TerritorialReviewView } from "@/lib/arquiteto/territorial-review";
import { HIGH_IMPACT_ACTIONS } from "@/lib/arquiteto/territorial-review";

/**
 * Painel da Revisão humana.
 *
 * Mostra as quatro leituras lado a lado e oferece as ações que já têm writer
 * canônico. Não existe "Aplicar IA" nem "Aplicar SERP": a evidência aparece no
 * comparativo e a ação é sempre nomeada no objeto real.
 */

const PRESENCE_LABELS: Record<string, string> = {
  current: "vigente",
  stale: "desatualizada",
  not_required: "não necessária",
  not_executed: "não executada",
  failed: "falhou",
};

const STATUS_LABELS: Record<TerritorialReviewView["status"], string> = {
  pending: "Pendente",
  conflict: "Com conflito",
  ready_for_decision: "Pronta para decisão",
  decision_recorded: "Decisão registrada",
  stale: "Desatualizada",
};

function SourceBlock({
  title,
  presence,
  highlighted,
  children,
}: {
  title: string;
  presence: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={`architect-review-${title.toLowerCase()}`}
      className={`rounded border p-2 ${highlighted ? "border-module-accent/50 bg-module-accent/5" : "border-divider bg-surface-subtle"}`}
    >
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
        {title} · {PRESENCE_LABELS[presence] || presence}
        {/* Destaque é precedência de LEITURA; nenhuma fonte aplica decisão. */}
        {highlighted && <span className="ml-1 text-module-accent">· evidência principal</span>}
      </p>
      <div className="mt-1 text-sm leading-6 text-foreground">{children}</div>
    </section>
  );
}

export function TerritorialReviewPanel({
  view,
  busyAction,
  onAction,
}: {
  view: TerritorialReviewView;
  busyAction: string | null;
  onAction: (action: TerritorialReviewAction) => void;
}) {
  const [confirming, setConfirming] = React.useState<TerritorialReviewAction | null>(null);

  return (
    <section className="rounded-lg border border-divider bg-surface-subtle p-3" data-testid="architect-review-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{view.subject.label}</p>
        <span className="text-sm text-text-muted" data-testid="architect-review-status">
          {STATUS_LABELS[view.status]}
        </span>
      </div>

      <div className="mt-2 grid gap-2">
        <SourceBlock title="Atual" presence="current">
          <p>
            {view.current.lifecycleStatus === "confirmed" ? "Silo confirmado" : "Silo candidato"}
            {view.current.isPublished ? " · página publicada protegida" : ""}
          </p>
          {view.current.slug && <p className="text-text-muted">{view.current.slug}</p>}
          {view.current.decision && (
            <p className="text-text-muted">
              Decisão humana: {view.current.decision.reason}
            </p>
          )}
        </SourceBlock>

        <SourceBlock title="Lógica" presence={view.logic.presence} highlighted={view.evidencePrecedence === "logic"}>
          {view.logic.reason || "Nenhuma hipótese registrada para este silo."}
        </SourceBlock>

        <SourceBlock title="SERP" presence={view.serp.presence} highlighted={view.evidencePrecedence === "serp"}>
          {view.serp.assessment ? (
            <>
              <p>{view.serp.assessment.reason}</p>
              <p className="text-text-muted">
                compatibilidade {view.serp.assessment.compatibility} · amplitude {view.serp.assessment.breadth}
                {view.serp.assessment.overlap ? ` · sobreposição ${view.serp.assessment.overlap}` : ""}
              </p>
            </>
          ) : (
            <p className="text-text-muted">Sem parecer de SERP para esta dúvida.</p>
          )}
        </SourceBlock>

        <SourceBlock title="IA" presence={view.ai.presence} highlighted={view.evidencePrecedence === "ai"}>
          {view.ai.proposal ? (
            <>
              <p>{view.ai.proposal.reason}</p>
              <p className="text-text-muted">proposta: {view.ai.proposal.recommendation}</p>
            </>
          ) : (
            <p className="text-text-muted">Revisão com IA é opcional e não foi executada para esta dúvida.</p>
          )}
        </SourceBlock>
      </div>

      {view.conflicts.length > 0 && (
        <div className="mt-2 rounded border border-warning/40 bg-warning/10 p-2" data-testid="architect-review-conflicts">
          <p className="text-sm font-semibold text-warning">Conflito estrutural</p>
          <ul className="mt-1 space-y-0.5 text-sm leading-6 text-text-muted">
            {view.conflicts.map(conflict => <li key={conflict}>· {conflict}</li>)}
          </ul>
        </div>
      )}

      {view.blockers.length > 0 && (
        <p className="mt-2 text-sm leading-6 text-text-muted" data-testid="architect-review-blockers">
          Falta para confirmar: {view.blockers.join(" ")}
        </p>
      )}

      <div className="mt-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-text-muted">Decisão humana</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {view.availableHumanActions.map(action => (
            <button
              key={`${action.kind}:${action.label}`}
              type="button"
              data-testid={`architect-review-action-${action.kind}`}
              disabled={Boolean(busyAction)}
              title={action.impact}
              onClick={() => {
                // Alto impacto pede antes/depois; o resto age direto.
                if (HIGH_IMPACT_ACTIONS.includes(action.kind)) setConfirming(action);
                else onAction(action);
              }}
              className="min-h-8 rounded border border-divider px-2.5 text-sm font-medium text-foreground transition-colors hover:border-module-accent/40 disabled:opacity-40"
            >
              {busyAction === action.label ? "Registrando…" : action.label}
            </button>
          ))}
        </div>
      </div>

      {confirming && (
        <div className="mt-2 rounded border border-module-accent/40 bg-surface p-2" data-testid="architect-review-impact">
          <p className="text-sm font-semibold text-foreground">{confirming.label}</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">{confirming.impact}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="architect-review-impact-confirm"
              onClick={() => { const acao = confirming; setConfirming(null); onAction(acao); }}
              className="min-h-8 rounded border border-positive-soft/45 px-2.5 text-sm font-semibold text-positive-soft"
            >
              Registrar decisão
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="min-h-8 rounded border border-divider px-2.5 text-sm text-text-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
