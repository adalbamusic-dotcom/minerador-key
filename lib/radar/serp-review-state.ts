import type { SerpReviewRecord } from "../editorial/contracts.ts";

export type RadarSerpReviewCurrentness = "none" | "current" | "reopened" | "unknown";

export type RadarSerpReviewState = {
  review: SerpReviewRecord | null;
  currentness: RadarSerpReviewCurrentness;
  selectionFingerprint: string | null;
};

function normalizedSelection(ids: string[]) {
  return [...new Set(ids)].sort().join("|");
}

/** Reads the explicit human-selection fingerprint that the existing review write records in its notes. */
export function radarSerpReviewSelectionFingerprint(notes: string | null | undefined) {
  const match = notes?.match(/seleção humana:\s*([^.;\n]+)/i);
  if (!match) return null;
  const values = match[1].split("|").map(value => value.trim()).filter(Boolean);
  return values.length ? normalizedSelection(values) : null;
}

/**
 * A historical approval remains evidence, but only an approval whose recorded selection
 * matches the current selection can close the current review gate.
 */
export function deriveRadarSerpReviewState(input: {
  reviews: SerpReviewRecord[];
  snapshotId: string | null | undefined;
  selectedCompetitorIds: string[];
}): RadarSerpReviewState {
  if (!input.snapshotId) return { review: null, currentness: "none", selectionFingerprint: null };
  const review = [...input.reviews.filter(candidate => candidate.snapshotId === input.snapshotId)]
    .sort((left, right) => Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt) || left.id.localeCompare(right.id))
    .at(-1) || null;
  if (!review) return { review: null, currentness: "none", selectionFingerprint: null };
  if (review.status !== "approved") return { review, currentness: "current", selectionFingerprint: null };
  const selectionFingerprint = radarSerpReviewSelectionFingerprint(review.notes);
  if (!selectionFingerprint) return { review, currentness: "unknown", selectionFingerprint: null };
  return {
    review,
    currentness: selectionFingerprint === normalizedSelection(input.selectedCompetitorIds) ? "current" : "reopened",
    selectionFingerprint,
  };
}
