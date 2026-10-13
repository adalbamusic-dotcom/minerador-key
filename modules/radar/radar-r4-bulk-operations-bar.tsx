import type { RadarR4BulkArticleSnapshot, RadarR4BulkOperation, RadarR4BulkEligibility, RadarR4SerpQueue } from "@/lib/radar/r4-queue";
import { availableBulkActions } from "@/lib/radar/r4-queue";
import { buildRadarR5QueueProgress } from "@/lib/radar/r5-sequential";
import { radarSerpBatchButtonLabel } from "./radar-serp-collect-notices";
import { useState } from "react";
import { RADAR_RESEARCH_BATCH_STEP_LABEL, radarResearchBatchButtonLabel, radarResearchBatchConfirmation, type RadarResearchBatchPlan, type RadarResearchBatchProgress } from "@/lib/radar/research-batch";

type RadarR4BulkOperationsBarProps = {
  selectedRows: RadarR4BulkArticleSnapshot[];
  onAction: (operation: RadarR4BulkOperation, articleIds: string[]) => void;
};

export type RadarR5QueueView = "pending" | "failed";

const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:border-divider";

const actionCopy: Array<{ operation: RadarR4BulkOperation; label: string }> = [
  { operation: "serp", label: "Iniciar lote SERP" },
  { operation: "refreshSerp", label: "Atualizar SERP selecionada (cache primeiro)" },
  { operation: "review", label: "Revisar SERP" },
  { operation: "approve", label: "Aprovar SERP" },
  { operation: "topics", label: "Preparar pautas" },
  { operation: "approveTopics", label: "Aprovar selecionadas" },
  { operation: "specialist", label: "Enviar ao especialista" },
  { operation: "reviewSpecialist", label: "Revisar contribuição" },
  { operation: "report", label: "Gerar relatório" },
  { operation: "writer", label: "Enviar ao Redator" },
];

const SERP_PAID_OPERATIONS: readonly RadarR4BulkOperation[] = ["serp", "refreshSerp"];

/*
 * 2026-10-13 · A BARRA OFERECE SÓ O CAMINHO DO PILOTO (regra do dono: um caminho só).
 *
 * "Iniciar lote SERP" e "Atualizar SERP selecionada" coletavam só a SERP e
 * deixavam o artigo aguardando revisão; revisar e aprovar SERP, preparar e
 * aprovar pautas, especialista por Telegram, revisar contribuição e o relatório
 * local eram etapas do processo antigo. O caminho do piloto em lote é
 * "Pesquisar e finalizar (N artigos)" (o botão do artigo, artigo por artigo),
 * "Organizar o artigo-modelo" e "Enviar ao Redator". As outras operações
 * continuam no código (handlers e testes que as usam), só não são oferecidas.
 */
export const RADAR_PILOT_BULK_OPERATIONS: readonly RadarR4BulkOperation[] = ["writer"];

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
  return <div className="flex min-w-max flex-wrap items-center gap-2" data-testid="radar-r4-bulk-bar" aria-label="Operações em lote do Radar">
    <span className="mr-1 text-sm font-semibold text-foreground">{selectedRows.length} selecionados</span>
    {actionCopy.filter(({ operation }) => RADAR_PILOT_BULK_OPERATIONS.includes(operation)).map(({ operation, label }) => {
      const eligibility = actions[operation];
      const blockedByTelegram = operation === "specialist" && specialistBlocked;
      const disabled = eligibility.eligible.length === 0;
      if (disabled && !blockedByTelegram) return null;
      const buttonLabel = blockedByTelegram
        ? `${label} · fundação Telegram bloqueada`
        : SERP_PAID_OPERATIONS.includes(operation) ? radarSerpBatchButtonLabel(label, eligibility.eligible.length) : `${label} (${eligibility.eligible.length})`;
      return <button key={operation} type="button" className={button} disabled={disabled} title={blockedByTelegram ? "A migration/adapter remoto do Telegram não foi autorizado nesta rodada." : undefined} onClick={() => onAction(operation, eligibility.eligible)}>{buttonLabel}</button>;
    })}
    <details className="rounded-md border border-divider bg-surface px-3 py-2"><summary className="cursor-pointer text-sm font-medium text-foreground">Elegibilidade por operação</summary><div className="mt-2 flex flex-wrap gap-2">{actionCopy.filter(({ operation }) => RADAR_PILOT_BULK_OPERATIONS.includes(operation)).map(({ operation }) => <EligibilityDetails key={operation} operation={operation} eligibility={actions[operation]}/>)}</div></details>
  </div>;
}

/*
 * ===== 2026-10-13 · "PESQUISAR E FINALIZAR (N ARTIGOS)" — a prévia e a confirmação =====
 *
 * Um clique abre a prévia (quem roda, quem é pulado por já estar finalizado,
 * quem fica fora e por quê, e o teto DataForSEO e de IA do lote); só o
 * "Confirmar e pesquisar" dispara. A prévia vem pronta de `planRadarResearchBatch`.
 */
export function RadarResearchBatchAction({ plan, busy, onConfirm }: { plan: RadarResearchBatchPlan; busy: boolean; onConfirm: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!plan.run.length) return null;
  if (confirmando) {
    return <div className="grid max-w-3xl gap-2 rounded-md border border-divider bg-surface-subtle p-3" data-testid="radar-pesquisa-lote-confirm">
      {radarResearchBatchConfirmation(plan).map((linha, indice) => <p key={indice} className="text-sm leading-6 text-foreground">{linha}</p>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => { setConfirmando(false); onConfirm(); }} data-testid="radar-pesquisa-lote-confirmar">Confirmar e pesquisar</button>
        <button type="button" className={button} onClick={() => setConfirmando(false)}>Cancelar</button>
      </div>
    </div>;
  }
  return <button type="button" className={button} disabled={busy} onClick={() => setConfirmando(true)} data-testid="radar-pesquisa-lote" title="Mostra o custo antes: nada roda sem a sua confirmação.">{radarResearchBatchButtonLabel(plan)}</button>;
}

const ROTULO_DO_STATUS: Record<RadarResearchBatchProgress["items"][number]["status"], string> = {
  QUEUED: "na fila",
  RUNNING: "em curso",
  FINALIZED: "finalizado",
  SKIPPED: "já finalizado (pulado)",
  REFUSED: "parado",
};

/** O progresso do lote, por artigo, e no fim o desfecho de cada um com o motivo de quem parou. */
export function RadarResearchBatchProgressStrip({ progress, onClose }: { progress: RadarResearchBatchProgress | null; onClose?: () => void }) {
  if (!progress) return null;
  const emCurso = progress.items.find(item => item.status === "RUNNING") || null;
  const finalizados = progress.items.filter(item => item.status === "FINALIZED").length;
  const parados = progress.items.filter(item => item.status === "REFUSED");
  return <div className="shrink-0 border-b border-divider bg-surface-subtle px-4 py-2 text-sm" data-testid="radar-pesquisa-lote-progresso" role="status" aria-label="Progresso do lote Pesquisar e finalizar">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <strong className="text-foreground">Pesquisar e finalizar · {progress.total} artigo(s)</strong>
      {progress.active && emCurso
        ? <span className="text-text-muted">Artigo {progress.position} de {progress.total} · “{emCurso.title}” · {emCurso.step ? RADAR_RESEARCH_BATCH_STEP_LABEL[emCurso.step] : "abrindo"}…</span>
        : <span className="text-text-muted">{progress.active ? "Conferindo no servidor…" : "Lote encerrado."}</span>}
      <span className="text-text-muted">{finalizados} finalizado(s){parados.length ? ` · ${parados.length} parado(s)` : ""}</span>
      {!progress.active && onClose && <button type="button" className={button} onClick={onClose}>Fechar</button>}
    </div>
    {!progress.active && progress.items.length > 0 && <ul className="mt-2 grid gap-1">
      {progress.items.map(item => <li key={item.articleId} className={item.status === "REFUSED" ? "text-warning" : "text-text-muted"}><span className="font-medium text-foreground">“{item.title}”</span> · {ROTULO_DO_STATUS[item.status]}{item.reason ? ` — ${item.reason}` : ""}</li>)}
    </ul>}
  </div>;
}

export function RadarR5QueueProgress({ queue, onView }: { queue: RadarR4SerpQueue | null; onView?: (view: RadarR5QueueView) => void }) {
  const progress = buildRadarR5QueueProgress(queue);
  if (!progress.active) return null;
  return <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider bg-surface-subtle px-4 py-2 text-sm" data-testid="radar-r5-serp-progress" aria-label="Progresso do lote SERP"><strong className="text-foreground">SERP · {progress.total} artigo(s)</strong><span className="text-text-muted">{progress.completed} concluído(s) · {progress.running} processando · {progress.queued} na fila · {progress.waitingReview} aguardando revisão</span>{(progress.failedRetryable + progress.failedFinal) > 0 && <span className="text-warning">{progress.failedRetryable + progress.failedFinal} falha(s)</span>}<div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => onView?.("pending")} disabled={!onView || progress.queued + progress.running + progress.waitingReview === 0}>Ver pendentes</button><button type="button" className={button} onClick={() => onView?.("failed")} disabled={!onView || progress.failedRetryable + progress.failedFinal === 0}>Ver falhas</button></div></div>;
}
