export type PublishedKeywordAlias = { alias: string; sourceId: string; canonicalUuid: string | null };

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isPublishedKeywordAlias(value: unknown): value is string {
  return typeof value === "string" && /^pub-k-.+/i.test(value);
}

export function parsePublishedKeywordAlias(value: unknown): PublishedKeywordAlias | null {
  if (!isPublishedKeywordAlias(value)) return null;
  const sourceId = value.slice("pub-k-".length);
  return { alias: value, sourceId, canonicalUuid: isCanonicalUuid(sourceId) ? sourceId : null };
}

export function canonicalUuidCandidates(values: unknown[]) {
  return [...new Set(values.filter(isCanonicalUuid))];
}
