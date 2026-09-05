import type { RadarItem } from "../editorial/operational-flow.ts";

export type RadarAnalysisSyncState = {
  revision: number;
  writesInFlight: number;
};

export type RadarAnalysisReadbackToken = {
  revision: number;
};

export const EMPTY_RADAR_ANALYSIS_SYNC_STATE: RadarAnalysisSyncState = { revision: 0, writesInFlight: 0 };

export function beginRadarAnalysisReadback(current: RadarAnalysisSyncState): { state: RadarAnalysisSyncState; token: RadarAnalysisReadbackToken } {
  const revision = current.revision + 1;
  return { state: { revision, writesInFlight: current.writesInFlight }, token: { revision } };
}

export function beginRadarAnalysisWrite(current: RadarAnalysisSyncState): RadarAnalysisSyncState {
  return { revision: current.revision + 1, writesInFlight: current.writesInFlight + 1 };
}

export function finishRadarAnalysisWrite(current: RadarAnalysisSyncState): RadarAnalysisSyncState {
  return { revision: current.revision + 1, writesInFlight: Math.max(0, current.writesInFlight - 1) };
}

export function canApplyRadarAnalysisReadback(current: RadarAnalysisSyncState, token: RadarAnalysisReadbackToken) {
  return current.revision === token.revision && current.writesInFlight === 0;
}

/**
 * Captures the local state that a broad readback is allowed to hydrate. The
 * snapshot id keeps a response tied to the SERP currently visible for the
 * article, while version ids detect a newer local working copy.
 */
export function radarAnalysisReadbackFingerprint(input: {
  item: Pick<RadarItem, "id" | "brandId" | "articleId" | "articleDnaVersionId" | "lockVersion"> & {
    analysisVersions: Array<Pick<RadarItem["analysisVersions"][number], "versionId" | "versionNumber" | "contentHash">>;
  };
  snapshotId?: string | null;
}) {
  return JSON.stringify({
    id: input.item.id,
    brandId: input.item.brandId,
    articleId: input.item.articleId,
    articleDnaVersionId: input.item.articleDnaVersionId,
    lockVersion: input.item.lockVersion,
    snapshotId: input.snapshotId || null,
    analysisVersions: input.item.analysisVersions
      .map(version => ({ versionId: version.versionId, versionNumber: version.versionNumber, contentHash: version.contentHash }))
      .sort((left, right) => left.versionNumber - right.versionNumber || left.versionId.localeCompare(right.versionId)),
  });
}
