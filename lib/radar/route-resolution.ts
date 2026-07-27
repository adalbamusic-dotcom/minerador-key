import type { RadarItem } from "../editorial/operational-flow.ts";

function routeAliases(item: RadarItem) {
  const principal = item.hydration?.principalKeyword;
  return new Set([
    item.articleDnaVersionId,
    item.id,
    item.articleId,
    item.principalKeywordId,
    item.hydration?.principalKeywordId,
    principal?.referenceKeywordId,
    principal?.canonicalKeywordId,
    principal?.sourceKeywordId,
    principal?.originalKeywordId,
    ...(principal?.aliases || []),
    ...(item.hydration?.keywordSnapshots || []).flatMap(snapshot => [snapshot.referenceKeywordId, snapshot.canonicalKeywordId, snapshot.sourceKeywordId, snapshot.originalKeywordId, ...snapshot.aliases]),
  ].filter((value): value is string => Boolean(value)));
}

export function resolveRadarRouteItem(items: RadarItem[], routeKey: string) {
  const direct = items.filter(item => item.articleDnaVersionId === routeKey);
  if (direct.length === 1) return direct[0];
  const matches = items.filter(item => routeAliases(item).has(routeKey));
  return matches.length === 1 ? matches[0] : null;
}

export function radarCanonicalRouteKey(item: RadarItem) {
  return item.articleDnaVersionId;
}
