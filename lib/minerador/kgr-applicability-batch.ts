import { applyHumanReviewKgrApplicability } from "./human-review.ts";
import { kgrApplicabilityLabel, readKgrApplicability, type KgrApplicability } from "./kgr-applicability.ts";

export type KgrApplicabilityBatchKeyword = {
  id: string;
  keyword: string;
  analise_semantica?: Record<string, unknown> | null;
};

export type KgrApplicabilityBatchUpdate = {
  id: string;
  keyword: string;
  previous: KgrApplicability;
  semantic: Record<string, unknown>;
};

export type KgrApplicabilityBatchPlan = {
  applicability: KgrApplicability;
  updates: KgrApplicabilityBatchUpdate[];
  unchangedIds: string[];
  draftIds: string[];
};

/**
 * Plans one human KGR applicability decision over a selection. Every keyword
 * goes through the same human-review contract used by the per-keyword flow,
 * so origin, actor, date, version and history stay identical. Keywords that
 * already carry the target decision are left untouched: repeating a decision
 * never reopens a completed review nor bumps the decision version. Keywords
 * with an open review draft are skipped, because their pending edits live only
 * in the draft until it is completed or cancelled.
 */
export function planKgrApplicabilityBatch(
  keywords: readonly KgrApplicabilityBatchKeyword[],
  applicability: KgrApplicability,
  context: { actorId: string; decidedAt: string; openDraftIds?: Iterable<string> },
): KgrApplicabilityBatchPlan {
  const drafts = new Set(context.openDraftIds || []);
  const seen = new Set<string>();
  const plan: KgrApplicabilityBatchPlan = { applicability, updates: [], unchangedIds: [], draftIds: [] };
  for (const keyword of keywords) {
    if (seen.has(keyword.id)) continue;
    seen.add(keyword.id);
    if (drafts.has(keyword.id)) {
      plan.draftIds.push(keyword.id);
      continue;
    }
    const previous = readKgrApplicability(keyword.analise_semantica);
    if (previous === applicability) {
      plan.unchangedIds.push(keyword.id);
      continue;
    }
    const semantic = applyHumanReviewKgrApplicability({
      semantic: keyword.analise_semantica || {},
      applicability,
      actorId: context.actorId,
      decidedAt: context.decidedAt,
    });
    plan.updates.push({ id: keyword.id, keyword: keyword.keyword, previous, semantic });
  }
  return plan;
}

/** User-facing summary of a batch decision; counts only what actually happened. */
export function describeKgrApplicabilityBatch(plan: KgrApplicabilityBatchPlan, persistedCount = plan.updates.length): string {
  const label = kgrApplicabilityLabel(plan.applicability);
  const parts: string[] = [];
  if (persistedCount > 0) parts.push(`Aplicabilidade do KGR definida como ${label} para ${persistedCount} keyword(s).`);
  if (plan.unchangedIds.length > 0) parts.push(`${plan.unchangedIds.length} já estava(m) como ${label}.`);
  if (plan.draftIds.length > 0) parts.push(`${plan.draftIds.length} com revisão em edição foi(ram) ignorada(s); conclua ou cancele a edição antes.`);
  return parts.join(" ") || `Nenhuma keyword precisou mudar para ${label}.`;
}
