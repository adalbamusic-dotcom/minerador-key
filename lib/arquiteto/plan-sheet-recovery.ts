import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";

export type RecoveryCursor = { created_at: string; id: string };
/** Keyset paging: never treat a short page as the last one. */
export async function readAllPlanSheetRecoveryPages<T extends RecoveryCursor>(read: (cursor: RecoveryCursor | null) => Promise<readonly T[]>, pageLimit = 1000): Promise<T[]> {
  const result: T[] = [];
  let cursor: RecoveryCursor | null = null;
  for (let page = 0; page < pageLimit; page += 1) {
    const rows = await read(cursor);
    if (!rows.length) return result;
    result.push(...rows);
    const last = rows[rows.length - 1];
    const next = { created_at: String(last.created_at), id: String(last.id) };
    if (!/^[0-9T:.+Z -]+$/.test(next.created_at) || !/^[0-9a-f-]{36}$/i.test(next.id) || (cursor && cursor.created_at === next.created_at && cursor.id === next.id)) throw new Error("A leitura das execuções da planilha não avançou com segurança.");
    cursor = next;
  }
  throw new Error("A leitura das execuções da planilha ultrapassou o limite de páginas; nenhuma recuperação parcial foi apresentada.");
}

/** Runs are ordered newest first by the server. No editorial write is made here. */
export function recoverPlanSheetRuns(runs: readonly ImprovementRun[]) {
  const interrupted = runs.filter(run => run.state === "applying" && Boolean(run.acceptedIds?.length));
  // An accepted but unfinished write takes priority even if a later draft was
  // prepared while it was in progress; it must be resumed before new work.
  const claimed = new Set(interrupted.flatMap(run => run.acceptedIds ?? []));
  const drafts: ImprovementRun[] = [];
  let collecting = false;
  for (const run of runs) {
    const isProcessing = run.discovery?.requested === true && Boolean(run.groupScope?.groupId);
    // A concluded or accepted operation invalidates older work for its accepted
    // targets, including a free preview that was subsequently confirmed.
    for (const id of run.acceptedIds ?? []) claimed.add(id);
    if (!isProcessing) continue;

    if (run.state === "collecting") collecting = true;
    const proposals = run.proposals.filter(item => !claimed.has(item.targetId));
    const refusedTargets = (run.refusedTargets ?? []).filter(item => !claimed.has(item.id));
    for (const item of run.proposals) claimed.add(item.targetId);
    for (const item of run.refusedTargets ?? []) claimed.add(item.id);
    if (run.state === "prepared" && !run.acceptedIds && (proposals.length || refusedTargets.length)) {
      // Keep runId and decisionHash from the original execution; filtering is
      // only for display. The server reloads the complete run before applying.
      drafts.push({ ...run, proposals, ...(run.refusedTargets ? { refusedTargets } : {}) });
    }
  }
  return { drafts: drafts.reverse(), interrupted, collecting };
}
