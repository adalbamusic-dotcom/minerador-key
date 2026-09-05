import type { DeletionImpactEntry } from "../lifecycle/contracts.ts";

export type SelectedArticleKeywordSource = {
  id: string;
  mainKeywordObj: { id: string } | null;
  supportKeywords: readonly { id: string }[];
};

export type ArchitectKeywordDeleteReview = {
  ids: string[];
  publishedIds: string[];
  hardDeleteIds: string[];
  impact: DeletionImpactEntry[];
  confirmationName: string;
};

export type ArchitectKeywordDeleteResult = {
  hardDeletedIds: string[];
  recoverableIds: string[];
};

type DeletePreviewItem = {
  id?: unknown;
  keyword?: unknown;
  impact?: Record<string, unknown>;
};

type DeletePreviewPayload = {
  success?: unknown;
  items?: unknown;
  publishedIds?: unknown;
  hardDeleteIds?: unknown;
};

type DeleteExecutionPayload = {
  success?: unknown;
  hardDeletedIds?: unknown;
  recoverableIds?: unknown;
};

function stringIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))]
    : [];
}

function sameIds(left: readonly string[], right: readonly string[]) {
  const expected = new Set(left);
  return expected.size === right.length && right.every(id => expected.has(id));
}

function isDeletionImpactEntry(value: unknown): value is DeletionImpactEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.key === "string"
    && typeof entry.label === "string"
    && typeof entry.count === "number"
    && typeof entry.classification === "string"
    && typeof entry.behavior === "string";
}

export function selectedArticleKeywordIds(
  selectedArticleIds: ReadonlySet<string>,
  articles: readonly SelectedArticleKeywordSource[],
) {
  const ids = new Set<string>();
  for (const article of articles) {
    if (!selectedArticleIds.has(article.id)) continue;
    if (article.mainKeywordObj?.id) ids.add(article.mainKeywordObj.id);
    for (const keyword of article.supportKeywords) if (keyword.id) ids.add(keyword.id);
  }
  return [...ids];
}

export function parseArchitectKeywordDeletePreview(
  requestedIds: readonly string[],
  payload: DeletePreviewPayload,
): ArchitectKeywordDeleteReview {
  if (payload.success !== true) throw new Error("Não foi possível confirmar o estado de publicação da seleção.");
  const requested = [...new Set(requestedIds)];
  const items = Array.isArray(payload.items) ? payload.items as DeletePreviewItem[] : [];
  const resolvedIds = stringIds(items.map(item => item.id));
  if (!requested.length || !sameIds(requested, resolvedIds)) {
    throw new Error("A prévia não confirmou exatamente as KeywordDNAs selecionadas; nenhuma exclusão foi iniciada.");
  }
  const names = items
    .map(item => typeof item.keyword === "string" ? item.keyword.trim() : "")
    .filter(Boolean);
  const impact = items.flatMap(item => {
    const nested = item.impact || {};
    return ["ownedChildren", "downstreamDrafts", "sharedReferences", "publishedReferences"]
      .flatMap(key => Array.isArray(nested[key]) ? nested[key] : []);
  }).filter(isDeletionImpactEntry);
  const publishedIds = stringIds(payload.publishedIds);
  const hardDeleteIds = stringIds(payload.hardDeleteIds);
  if (!publishedIds.every(id => requested.includes(id)) || !hardDeleteIds.every(id => requested.includes(id))) {
    throw new Error("A prévia retornou uma KeywordDNA fora da seleção; nenhuma exclusão foi iniciada.");
  }
  return {
    ids: resolvedIds,
    publishedIds,
    hardDeleteIds,
    impact,
    confirmationName: names.length === 1 ? names[0] : `${resolvedIds.length} keywords selecionadas`,
  };
}

export function parseArchitectKeywordDeleteResult(
  review: Pick<ArchitectKeywordDeleteReview, "ids">,
  payload: DeleteExecutionPayload,
): ArchitectKeywordDeleteResult {
  if (payload.success !== true) throw new Error("A exclusão não foi concluída.");
  const hardDeletedIds = stringIds(payload.hardDeletedIds);
  const recoverableIds = stringIds(payload.recoverableIds);
  const completedIds = [...new Set([...hardDeletedIds, ...recoverableIds])];
  if (!sameIds(review.ids, completedIds)) {
    throw new Error("A transação não confirmou toda a seleção; a projeção local foi preservada.");
  }
  return { hardDeletedIds, recoverableIds };
}

export function assertArchitectKeywordDeleteReadback(
  review: Pick<ArchitectKeywordDeleteReview, "ids">,
  activeKeywordIds: readonly string[],
) {
  const active = new Set(activeKeywordIds);
  const remaining = review.ids.filter(id => active.has(id));
  if (remaining.length) {
    throw new Error("O readback canônico ainda contém KeywordDNAs excluídas; a projeção local foi preservada.");
  }
}
