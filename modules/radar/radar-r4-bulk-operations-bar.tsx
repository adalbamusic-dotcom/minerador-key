import type { RadarR4BulkArticleSnapshot, RadarR4BulkOperation, RadarR4BulkEligibility, RadarR4SerpQueue } from "@/lib/radar/r4-queue";
import { availableBulkActions } from "@/lib/radar/r4-queue";
import { buildRadarR5QueueProgress } from "@/lib/radar/r5-sequential";

type RadarR4BulkOperationsBarProps = {
  selectedRows: RadarR4BulkArticleSnapshot[];
  onAction: (operation: RadarR4BulkOperation, articleIds: string[]) => void;
};

export type RadarR5QueueView = "pending" | "failed";

const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:border-divider";

const actionCopy: Array<{ operation: RadarR4BulkOperation; label: string }> = [
  { operation: "serp", label: "Iniciar lote SERP" },
  { operation: "refreshSerp", label: "Atualizar SERP selecionada" },
  { operation: "review", label: "Revisar SERP" },
  { operation: "approve", label: "Aprovar SERP" },
  { operation: "topics", label: "Preparar pautas" },
  { operation: "approveTopics", label: "Aprovar selecionadas" },
  { operation: "specialist", label: "Enviar ao especialista" },
  { operation: "reviewSpecialist", label: "Revisar contribuição" },
  { operation: "report", label: "Gerar relatório" },
  { operation: "planner", label: "Enviar ao Planejador" },
];

function Count({ label, value }: { label: string; value: number }) {
  return <span className="text-sm text-text-muted"><span className="font-semibold text-foreground">{value}</span> {label}</span>;
}

function EligibilityDetails({ operation, eligibility }: { operation: RadarR4BulkOperation; eligibility: RadarR4BulkEligibility }) {
  const label = actionCopy.find(item => item.operation === operation)?.label || operation;
  return <details className="min-w-56 rounded-md border border-divider bg-surface px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium text-foreground">{label}: detalhes</summary>
    <div className="mt-2 grid gap-1"><Count label="elegíveis" value={eligibility.eligible.length}/><Count label="já processados" value={eligibility.alreadyDone.length}/><Count label="refresh explícito" value={eligibility.requiresExplicitRefresh.length}/><Count label="bloqueados" value={eligibility.blocked.length}/><Count label="não aplicáveis" value={eligibility.notApplicable.length}/></div>
  </details>;
}

export function RadarR4BulkOperationsBar({ selectedRows, onAction }: RadarR4BulkOperationsBarProps) {
  const actions = availableBulkActions(selectedRows);
  const specialistBlocked = selectedRows.some(row => row.specialistState === "READY_TO_SEND") && actions.specialist.blocked.length > 0;
  const topicsReady = selectedRows.reduce((sum, row) => sum + (row.topicsTotal || 0), 0);
  const topicsReviewed = selectedRows.reduce((sum, row) => sum + (row.topicsReviewedCount || 0), 0);
  const topicsPending = Math.max(topicsReady - topicsReviewed, 0);
  return <div className="flex min-w-max flex-wrap items-center gap-2" data-testid="radar-r4-bulk-bar" aria-label="Operações em lote do Radar">
    <span className="mr-1 text-sm font-semibold text-foreground">{selectedRows.length} selecionados</span>
    {actionCopy.map(({ operation, label }) => {
      const eligibility = actions[operation];
      const blockedByTelegram = operation === "specialist" && specialistBlocked;
      const disabled = eligibility.eligible.length === 0;
      if (disabled && !blockedByTelegram) return null;
      const buttonLabel = blockedByTelegram ? `${label} · fundação Telegram bloqueada` : `${label} (${eligibility.eligible.length})`;
      return <button key={operation} type="button" className={button} disabled={disabled} title={blockedByTelegram ? "A migration/adapter remoto do Telegram não foi autorizado nesta rodada." : undefined} onClick={() => onAction(operation, eligibility.eligible)}>{buttonLabel}</button>;
    })}
    <div className="flex flex-wrap items-center gap-2" aria-label="Elegibilidade das operações"><Count label="Pautas prontas" value={topicsReady}/><Count label="Pautas revisadas" value={topicsReviewed}/><Count label="Pautas ainda pendentes" value={topicsPending}/><Count label="elegíveis SERP" value={actions.serp.eligible.length}/><Count label="bloqueados" value={actions.serp.blocked.length}/><Count label="não aplicáveis" value={actions.specialist.notApplicable.length}/>{(actions.serp.alreadyDone.length > 0 || actions.review.alreadyDone.length > 0) && <Count label="já processados" value={actions.serp.alreadyDone.length + actions.review.alreadyDone.length}/>}</div>
    <details className="rounded-md border border-divider bg-surface px-3 py-2"><summary className="cursor-pointer text-sm font-medium text-foreground">Elegibilidade por operação</summary><div className="mt-2 flex flex-wrap gap-2">{actionCopy.map(({ operation }) => <EligibilityDetails key={operation} operation={operation} eligibility={actions[operation]}/>)}</div></details>
  </div>;
}

export function RadarR5QueueProgress({ queue, onView }: { queue: RadarR4SerpQueue | null; onView?: (view: RadarR5QueueView) => void }) {
  const progress = buildRadarR5QueueProgress(queue);
  if (!progress.active) return null;
  return <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider bg-surface-subtle px-4 py-2 text-sm" data-testid="radar-r5-serp-progress" aria-label="Progresso do lote SERP"><strong className="text-foreground">SERP · {progress.total} artigo(s)</strong><span className="text-text-muted">{progress.completed} concluído(s) · {progress.running} processando · {progress.queued} na fila · {progress.waitingReview} aguardando revisão</span>{(progress.failedRetryable + progress.failedFinal) > 0 && <span className="text-warning">{progress.failedRetryable + progress.failedFinal} falha(s)</span>}<div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => onView?.("pending")} disabled={!onView || progress.queued + progress.running + progress.waitingReview === 0}>Ver pendentes</button><button type="button" className={button} onClick={() => onView?.("failed")} disabled={!onView || progress.failedRetryable + progress.failedFinal === 0}>Ver falhas</button></div></div>;
}
