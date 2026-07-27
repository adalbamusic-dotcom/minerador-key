import type { RadarItem } from "../editorial/operational-flow.ts";

export function mergeRadarItemsPreservingLocalState(remoteItems: RadarItem[], localItems: RadarItem[]) {
  const localByKey = new Map(localItems.map(item => [item.id, item]));
  localItems.forEach(item => localByKey.set(item.articleId, item));
  const seen = new Set<string>();
  const merged = remoteItems.map(remote => {
    const local = localByKey.get(remote.id) || localByKey.get(remote.articleId);
    if (!local) { seen.add(remote.id); return remote; }
    seen.add(local.id); seen.add(remote.id);
    const byVersion = new Map([...local.analysisVersions, ...remote.analysisVersions].map(version => [version.versionId, version]));
    return { ...remote, analysisVersions: [...byVersion.values()].sort((a, b) => a.versionNumber - b.versionNumber) };
  });
  return [...merged, ...localItems.filter(item => !seen.has(item.id) && !remoteItems.some(remote => remote.articleId === item.articleId))];
}
