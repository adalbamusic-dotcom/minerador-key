import type { SerpCollectionRecord } from "../editorial/contracts.ts";
import type { RadarItem } from "../editorial/operational-flow.ts";

function articleKeys(item: RadarItem) {
  const principal = item.hydration?.principalKeyword;
  return new Set([
    item.articleId,
    item.principalKeywordId,
    item.hydration?.principalKeywordId,
    principal?.referenceKeywordId,
    principal?.canonicalKeywordId,
    principal?.sourceKeywordId,
    principal?.originalKeywordId,
    ...(principal?.aliases || []),
  ].filter((value): value is string => Boolean(value)));
}

export function selectLatestRadarSerpRecord(records: SerpCollectionRecord[], item: RadarItem) {
  const keys = articleKeys(item);
  const matching = records.filter(record => record.origin === "real" && (record.research || record.snapshot) && (keys.has(record.input.articleId) || keys.has(record.research?.articleId || "")));
  const withoutConflicts = matching.filter(record => !record.conflictReason);
  return [...(withoutConflicts.length ? withoutConflicts : matching)].sort((a, b) => (a.research?.version || 0) - (b.research?.version || 0)).at(-1) || null;
}
