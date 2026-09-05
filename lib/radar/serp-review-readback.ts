import type { RadarItem } from "../editorial/operational-flow.ts";
import type { SerpCollectionRecord } from "../editorial/contracts.ts";

export type RadarSerpReviewSyncState = {
  revision: number;
  writesInFlight: number;
};

export type RadarSerpReviewReadbackToken = {
  revision: number;
};

export const EMPTY_RADAR_SERP_REVIEW_SYNC_STATE: RadarSerpReviewSyncState = { revision: 0, writesInFlight: 0 };

export function beginRadarSerpReviewReadback(current: RadarSerpReviewSyncState): { state: RadarSerpReviewSyncState; token: RadarSerpReviewReadbackToken } {
  const revision = current.revision + 1;
  return { state: { revision, writesInFlight: current.writesInFlight }, token: { revision } };
}

export function beginRadarSerpReviewWrite(current: RadarSerpReviewSyncState): RadarSerpReviewSyncState {
  return { revision: current.revision + 1, writesInFlight: current.writesInFlight + 1 };
}

export function finishRadarSerpReviewWrite(current: RadarSerpReviewSyncState): RadarSerpReviewSyncState {
  return { revision: current.revision + 1, writesInFlight: Math.max(0, current.writesInFlight - 1) };
}

export function canApplyRadarSerpReviewReadback(current: RadarSerpReviewSyncState, token: RadarSerpReviewReadbackToken) {
  return current.revision === token.revision && current.writesInFlight === 0;
}

/** The narrow review readback may only hydrate the same article/version/snapshot identity it requested. */
export function radarSerpReviewReadbackFingerprint(input: {
  item: Pick<RadarItem, "id" | "brandId" | "articleId" | "articleDnaVersionId" | "lockVersion">;
  record: Pick<SerpCollectionRecord, "id"> & { research?: Pick<NonNullable<SerpCollectionRecord["research"]>, "version" | "contentHash"> | null };
}) {
  return JSON.stringify({
    id: input.item.id,
    brandId: input.item.brandId,
    articleId: input.item.articleId,
    articleDnaVersionId: input.item.articleDnaVersionId,
    lockVersion: input.item.lockVersion,
    snapshotId: input.record.id,
    snapshotVersion: input.record.research?.version || null,
    snapshotHash: input.record.research?.contentHash || null,
  });
}
