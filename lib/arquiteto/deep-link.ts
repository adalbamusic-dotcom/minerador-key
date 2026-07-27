export type ArchitectNavigationCandidate = {
  id?: unknown;
  provisionalGroupId?: unknown;
  clusterId?: unknown;
};

export function resolveArchitectDeepLink(candidates: ArchitectNavigationCandidate[], requested: string | null | undefined, brandId: string | null | undefined, consumedKey: string | null) {
  if (!requested || !candidates.length) return null;
  const requestKey = `${brandId || "no-brand"}:${requested}`;
  if (requestKey === consumedKey) return null;
  const match = candidates.find(item => item.provisionalGroupId === requested || item.id === requested);
  if (!match || match.clusterId === null || match.clusterId === undefined || match.clusterId === "") return null;
  return { requestKey, articleRowId: `art-${String(match.clusterId)}` };
}

export function sameStringSet(current: ReadonlySet<string>, expected: string[]) {
  return current.size === expected.length && expected.every(value => current.has(value));
}
