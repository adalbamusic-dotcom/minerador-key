/*
 * LOTE PROGRESSIVO — helper puro, sem React, sem rede e sem banco.
 *
 * Pedido do dono (2026-09-24): processo em grupo grande não pode travar nem
 * "só mostrar o começo e o fim". Ele anda em blocos, com concorrência
 * limitada, conta cada item que volta ("Processando 5 de 30 · faltam 25"),
 * segue depois de uma falha individual e fecha com "Concluído: X ok, Y com
 * falha" e a lista das falhas.
 *
 * Contrato pensado para virar o padrão da plataforma (SDD
 * docs/compartilhado/sdd-padrao-planilha-progresso-notificacoes-2026-09-24.md,
 * seção 5.5): os nomes dos estados de item (`succeeded`, `empty`, `failed`,
 * `skipped`) e o formato do texto são os da SDD. O que fica fora daqui, de
 * propósito: provider global, caixa de saída entre áreas e reconciliação de
 * timeout (F3 da SDD, que depende de aprovação). Este helper não aborta
 * requisição por tempo: abortar o fetch no navegador não para o servidor, e
 * uma rota paga seguiria cobrando.
 *
 * Regras:
 * - cada item é contado uma única vez; item do bloco sem resposta vira falha
 *   "sem resposta para este item";
 * - exceção lançada por um bloco conta o bloco inteiro como falha e o lote
 *   continua (nunca repete o bloco: rota paga não pode cobrar duas vezes);
 * - `stop` devolvido por um bloco, ou `shouldStop()`, para antes do próximo
 *   bloco; o que já voltou continua contado e o resto fica "não iniciado";
 * - entre blocos o helper devolve a vez ao navegador (`yieldToUi`), para a
 *   tela pintar o andamento.
 */

export type BatchItemStatus = "succeeded" | "empty" | "failed" | "skipped";

export type BatchItemOutcome = {
  id: string;
  status: BatchItemStatus;
  reason?: string;
};

export type BatchRunStatus = "running" | "completed" | "partial" | "failed" | "stopped";

export type BatchFailure = {
  id: string;
  reason: string;
};

export type BatchProgressSnapshot = {
  label: string;
  status: BatchRunStatus;
  total: number;
  /** succeeded + empty + failed + skipped */
  done: number;
  succeeded: number;
  empty: number;
  failed: number;
  skipped: number;
  /** total − done */
  remaining: number;
  /** Itens em blocos já iniciados que ainda não voltaram. */
  inFlight: number;
  chunkCount: number;
  /** Blocos já iniciados (1 = o primeiro). */
  chunksStarted: number;
  failures: readonly BatchFailure[];
  stoppedReason: string | null;
  /**
   * Quando o bloco mais recente começou (ms). Opcional e aditivo: a tela usa
   * para dizer "há 40s" enquanto um bloco lento (SERP) não volta, e assim
   * mostrar que o lote segue vivo.
   */
  chunkStartedAtMs?: number;
};

export type BatchChunkContext = {
  chunkIndex: number;
  chunkCount: number;
};

export type BatchChunkResult = readonly BatchItemOutcome[] | {
  outcomes: readonly BatchItemOutcome[];
  /** Falha que vale para o lote inteiro (sem crédito, sem permissão): para antes do próximo bloco. */
  stop?: string | null;
};

export type ProgressiveBatchInput<Item> = {
  label: string;
  items: readonly Item[];
  itemId: (item: Item) => string;
  /** Itens por chamada. Mínimo 1. */
  chunkSize: number;
  /** Blocos rodando ao mesmo tempo. Rota paga usa 1. Padrão 1. */
  concurrency?: number;
  runChunk: (chunk: readonly Item[], context: BatchChunkContext) => Promise<BatchChunkResult>;
  onProgress?: (snapshot: BatchProgressSnapshot) => void;
  /** Devolve o motivo para parar (ex.: "Parado por você") ou null para seguir. */
  shouldStop?: () => string | null;
  /** Motivo exibido quando o bloco lança exceção. */
  describeError?: (error: unknown) => string;
  yieldToUi?: () => Promise<void>;
  /** Relógio injetável para testes. Padrão Date.now. */
  now?: () => number;
};

export const BATCH_NO_RESPONSE_REASON = "sem resposta para este item";
export const BATCH_STOPPED_BY_USER_REASON = "Parado por você";

export function chunkBatchItems<Item>(items: readonly Item[], chunkSize: number): Item[][] {
  const size = Number.isFinite(chunkSize) && chunkSize >= 1 ? Math.floor(chunkSize) : 1;
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

export function createBatchProgress(label: string, total: number, chunkCount = 0): BatchProgressSnapshot {
  const safeTotal = Math.max(0, Math.floor(total));
  return {
    label,
    status: "running",
    total: safeTotal,
    done: 0,
    succeeded: 0,
    empty: 0,
    failed: 0,
    skipped: 0,
    remaining: safeTotal,
    inFlight: 0,
    chunkCount: Math.max(0, Math.floor(chunkCount)),
    chunksStarted: 0,
    failures: [],
    stoppedReason: null,
  };
}

function defaultDescribeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "erro sem mensagem";
}

/**
 * Soma as respostas de um bloco. Só conta ids do bloco (`chunkIds`) e cada id
 * uma vez; id do bloco sem resposta vira falha.
 */
export function applyBatchOutcomes(
  snapshot: BatchProgressSnapshot,
  chunkIds: readonly string[],
  outcomes: readonly BatchItemOutcome[],
): BatchProgressSnapshot {
  const pending = new Set(chunkIds);
  let { succeeded, empty, failed, skipped } = snapshot;
  const failures = [...snapshot.failures];
  for (const outcome of outcomes) {
    if (!outcome || !pending.has(outcome.id)) continue;
    pending.delete(outcome.id);
    if (outcome.status === "succeeded") succeeded += 1;
    else if (outcome.status === "empty") empty += 1;
    else if (outcome.status === "skipped") skipped += 1;
    else {
      failed += 1;
      failures.push({ id: outcome.id, reason: outcome.reason?.trim() || "falha sem motivo informado" });
    }
  }
  for (const id of pending) {
    failed += 1;
    failures.push({ id, reason: BATCH_NO_RESPONSE_REASON });
  }
  const done = succeeded + empty + failed + skipped;
  return {
    ...snapshot,
    succeeded,
    empty,
    failed,
    skipped,
    done,
    remaining: Math.max(0, snapshot.total - done),
    inFlight: Math.max(0, snapshot.inFlight - chunkIds.length),
    failures,
  };
}

/**
 * Conferência depois do lote (readback): item que o bloco deu como
 * `succeeded` mas não foi confirmado passa a falha, com o motivo. Id que já
 * é falha, ou que não é do lote, não conta de novo.
 */
export function reclassifyBatchItemsAsFailed(
  snapshot: BatchProgressSnapshot,
  ids: readonly string[],
  reason: string,
): BatchProgressSnapshot {
  const alreadyFailed = new Set(snapshot.failures.map(failure => failure.id));
  const unique = [...new Set(ids)].filter(id => !alreadyFailed.has(id));
  const moved = Math.min(unique.length, snapshot.succeeded);
  if (moved === 0) return snapshot;
  const accepted = unique.slice(0, moved);
  const failed = snapshot.failed + moved;
  const succeeded = snapshot.succeeded - moved;
  const next = {
    ...snapshot,
    succeeded,
    failed,
    failures: [...snapshot.failures, ...accepted.map(id => ({ id, reason }))],
  };
  if (snapshot.status === "running") return next;
  return finalizeBatchProgress(next, snapshot.stoppedReason);
}

/** Resumo final a partir de contagens, para processos que não passam pelo runner. */
export function formatBatchSummary(counts: {
  label?: string;
  total: number;
  succeeded: number;
  failed: number;
  empty?: number;
  skipped?: number;
  stoppedReason?: string | null;
}): string {
  const empty = counts.empty || 0;
  const skipped = counts.skipped || 0;
  const done = counts.succeeded + counts.failed + empty + skipped;
  const snapshot = finalizeBatchProgress({
    ...createBatchProgress(counts.label || "", counts.total),
    succeeded: counts.succeeded,
    failed: counts.failed,
    empty,
    skipped,
    done,
    remaining: Math.max(0, counts.total - done),
  }, counts.stoppedReason || null);
  return formatBatchProgress(snapshot);
}

export function finalizeBatchProgress(snapshot: BatchProgressSnapshot, stoppedReason: string | null = null): BatchProgressSnapshot {
  const ok = snapshot.succeeded + snapshot.empty + snapshot.skipped;
  const status: BatchRunStatus = stoppedReason
    ? "stopped"
    : snapshot.failed === 0
      ? "completed"
      : ok === 0
        ? "failed"
        : "partial";
  return { ...snapshot, status, inFlight: 0, stoppedReason };
}

export async function runProgressiveBatch<Item>(input: ProgressiveBatchInput<Item>): Promise<BatchProgressSnapshot> {
  const chunks = chunkBatchItems(input.items, input.chunkSize);
  const concurrency = Math.max(1, Math.min(chunks.length || 1, Math.floor(input.concurrency ?? 1)));
  const describeError = input.describeError || defaultDescribeError;
  const yieldToUi = input.yieldToUi || (() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  let snapshot = createBatchProgress(input.label, input.items.length, chunks.length);
  let nextChunk = 0;
  let stopReason: string | null = null;
  const emit = () => input.onProgress?.(snapshot);
  emit();

  const worker = async () => {
    while (!stopReason && nextChunk < chunks.length) {
      const requested = input.shouldStop?.() || null;
      if (requested) {
        stopReason = requested;
        break;
      }
      const chunkIndex = nextChunk;
      nextChunk += 1;
      const chunk = chunks[chunkIndex];
      const chunkIds = chunk.map(item => input.itemId(item));
      snapshot = { ...snapshot, inFlight: snapshot.inFlight + chunk.length, chunksStarted: snapshot.chunksStarted + 1, chunkStartedAtMs: (input.now || Date.now)() };
      emit();
      let outcomes: readonly BatchItemOutcome[];
      try {
        const result = await input.runChunk(chunk, { chunkIndex, chunkCount: chunks.length });
        if (Array.isArray(result)) outcomes = result;
        else {
          const withStop = result as { outcomes: readonly BatchItemOutcome[]; stop?: string | null };
          outcomes = withStop.outcomes || [];
          if (withStop.stop && !stopReason) stopReason = withStop.stop;
        }
      } catch (error) {
        const reason = describeError(error);
        outcomes = chunkIds.map(id => ({ id, status: "failed" as const, reason }));
      }
      snapshot = applyBatchOutcomes(snapshot, chunkIds, outcomes);
      emit();
      await yieldToUi();
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  snapshot = finalizeBatchProgress(snapshot, stopReason);
  emit();
  return snapshot;
}

function plural(count: number, singular: string, pluralForm: string) {
  return count === 1 ? singular : pluralForm;
}

/** Texto vivo do andamento, ou o resumo final quando o lote fechou. */
export function formatBatchProgress(snapshot: BatchProgressSnapshot): string {
  const ok = snapshot.succeeded + snapshot.empty;
  if (snapshot.status === "running") {
    const failures = snapshot.failed > 0 ? ` · ${snapshot.failed} com falha` : "";
    return `Processando ${snapshot.done} de ${snapshot.total} · faltam ${snapshot.remaining}${failures}`;
  }
  const empty = snapshot.empty > 0 ? ` (${snapshot.empty} sem dado)` : "";
  const skipped = snapshot.skipped > 0 ? `, ${snapshot.skipped} ${plural(snapshot.skipped, "pulada", "puladas")}` : "";
  if (snapshot.status === "stopped") {
    const notStarted = snapshot.remaining > 0 ? `, ${snapshot.remaining} não ${plural(snapshot.remaining, "iniciada", "iniciadas")}` : "";
    return `Parado: ${ok} ok${empty}, ${snapshot.failed} com falha${skipped}${notStarted}${snapshot.stoppedReason ? ` · ${snapshot.stoppedReason}` : ""}`;
  }
  return `Concluído: ${ok} ok${empty}, ${snapshot.failed} com falha${skipped}`;
}

/**
 * Primeira linha do cartão do rodapé, curta para caber sem cortar o que
 * importa: "5 de 30 · faltam 25". A etapa e as falhas vão para a linha de
 * contexto. Fora do andamento, é o mesmo resumo de formatBatchProgress.
 */
export function formatBatchProgressCompact(snapshot: BatchProgressSnapshot): string {
  if (snapshot.status !== "running") return formatBatchProgress(snapshot);
  return `${snapshot.done} de ${snapshot.total} · faltam ${snapshot.remaining}`;
}

/** "há 12s", "há 2 min": tempo do bloco em curso. */
export function formatBatchElapsed(startedAtMs: number | null | undefined, nowMs: number): string | null {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) return null;
  const seconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  if (seconds < 60) return `há ${seconds}s`;
  return `há ${Math.floor(seconds / 60)} min`;
}

/** Linha de contexto: etapa, falhas e bloco em curso. */
export function formatBatchProgressDetail(snapshot: BatchProgressSnapshot): string {
  const parts = [snapshot.label];
  // Bloco de um item só (gravações) não vira "bloco 7 de 30": seria ruído.
  if (snapshot.status === "running" && snapshot.chunkCount > 1 && snapshot.chunkCount < snapshot.total) {
    parts.push(`bloco ${Math.max(1, snapshot.chunksStarted)} de ${snapshot.chunkCount}`);
  }
  if (snapshot.failed > 0) parts.push(`${snapshot.failed} com falha`);
  return parts.join(" · ");
}

export function batchProgressPercent(snapshot: BatchProgressSnapshot): number | null {
  if (!snapshot.total) return null;
  return Math.min(100, Math.round((snapshot.done / snapshot.total) * 100));
}

/** Lista das falhas para o aviso final, com nome legível quando houver. */
export function formatBatchFailures(
  snapshot: Pick<BatchProgressSnapshot, "failures">,
  nameById?: ReadonlyMap<string, string> | null,
  limit = 20,
): string[] {
  const lines = snapshot.failures.slice(0, Math.max(0, limit)).map(failure => `${nameById?.get(failure.id) || failure.id}: ${failure.reason}`);
  const rest = snapshot.failures.length - lines.length;
  if (rest > 0) lines.push(`e mais ${rest} ${plural(rest, "falha", "falhas")}.`);
  return lines;
}
