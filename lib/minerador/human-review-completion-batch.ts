import { canCompleteHumanReview, completeHumanReview, humanReviewRecord } from "./human-review.ts";

export type HumanReviewCompletionBatchKeyword = {
  id: string;
  keyword: string;
  intent?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

export type HumanReviewCompletionBatchUpdate = {
  id: string;
  keyword: string;
  semantic: Record<string, unknown>;
};

export type HumanReviewCompletionBatchPlan = {
  updates: HumanReviewCompletionBatchUpdate[];
  alreadyCompletedIds: string[];
  pendingKgrIds: string[];
  draftIds: string[];
  blocked: Array<{ id: string; keyword: string; reason: string }>;
};

/**
 * Plans the explicit completion of the human review over a selection, with the
 * same contract as the per-keyword command: conservative defaults for items
 * without a decision and a mandatory KGR applicability decision whenever the
 * calculation is real. Nothing here touches status, approval or metrics.
 * Reviews already completed are left as they are (no artificial version), and
 * keywords with an open review draft stay out until the draft is concluded or
 * cancelled in the panel, because their edits live only in the draft.
 */
export function planHumanReviewCompletionBatch(
  keywords: readonly HumanReviewCompletionBatchKeyword[],
  context: { actorId: string; completedAt: string; openDraftIds?: Iterable<string> },
): HumanReviewCompletionBatchPlan {
  const drafts = new Set(context.openDraftIds || []);
  const seen = new Set<string>();
  const plan: HumanReviewCompletionBatchPlan = { updates: [], alreadyCompletedIds: [], pendingKgrIds: [], draftIds: [], blocked: [] };
  for (const keyword of keywords) {
    if (seen.has(keyword.id)) continue;
    seen.add(keyword.id);
    if (drafts.has(keyword.id)) {
      plan.draftIds.push(keyword.id);
      continue;
    }
    const semantic = keyword.analise_semantica || {};
    if (humanReviewRecord(semantic).status === "completed") {
      plan.alreadyCompletedIds.push(keyword.id);
      continue;
    }
    const intent = keyword.intent ?? null;
    const completion = canCompleteHumanReview(semantic, { intent });
    if (!completion.ok) {
      plan.blocked.push({ id: keyword.id, keyword: keyword.keyword, reason: completion.reason || "Há pendências na revisão humana." });
      continue;
    }
    if (completion.pendingKgrDecision) {
      plan.pendingKgrIds.push(keyword.id);
      continue;
    }
    try {
      plan.updates.push({ id: keyword.id, keyword: keyword.keyword, semantic: completeHumanReview({ semantic, intent, actorId: context.actorId, completedAt: context.completedAt }) });
    } catch (error) {
      plan.blocked.push({ id: keyword.id, keyword: keyword.keyword, reason: error instanceof Error ? error.message : "Não foi possível concluir a revisão humana." });
    }
  }
  return plan;
}

/** User-facing summary of a batch completion; counts only what actually happened. */
export function describeHumanReviewCompletionBatch(plan: HumanReviewCompletionBatchPlan, persistedCount = plan.updates.length): string {
  const parts: string[] = [];
  if (persistedCount > 0) parts.push(`Revisão humana concluída para ${persistedCount} keyword(s); o DNA foi confirmado.`);
  if (plan.alreadyCompletedIds.length > 0) parts.push(`${plan.alreadyCompletedIds.length} já estava(m) concluída(s).`);
  if (plan.pendingKgrIds.length > 0) parts.push(`${plan.pendingKgrIds.length} aguarda(m) a Aplicabilidade do KGR antes de concluir.`);
  if (plan.draftIds.length > 0) parts.push(`${plan.draftIds.length} com revisão em edição foi(ram) ignorada(s); conclua ou cancele a edição no painel.`);
  if (plan.blocked.length > 0) parts.push(`${plan.blocked.length} bloqueada(s): ${plan.blocked[0].reason}`);
  return parts.join(" ") || "Nenhuma revisão humana precisou ser concluída.";
}
