export const MINIMUM_OFFICIAL_MONTHLY_VOLUME = 120;

export type VolumeEligibilityStatus =
  | "pending"
  | "eligible"
  | "below_threshold"
  | "unavailable"
  | "measurement_failed";

type VolumeEligibilitySemantic = Record<string, unknown> & {
  volume_eligibility?: Record<string, unknown>;
};

export type VolumeEligibilityRow = {
  status: string;
  volume_search: number | null;
  analise_semantica?: VolumeEligibilitySemantic | null;
};

const knownStatuses = new Set<VolumeEligibilityStatus>([
  "pending", "eligible", "below_threshold", "unavailable", "measurement_failed",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readVolumeEligibility(row: VolumeEligibilityRow): VolumeEligibilityStatus {
  if (row.status === "publicado") return "eligible";
  const eligibility = record(row.analise_semantica?.volume_eligibility);
  const explicit = eligibility?.status;
  if (typeof explicit === "string" && knownStatuses.has(explicit as VolumeEligibilityStatus)) return explicit as VolumeEligibilityStatus;
  return "pending";
}

export function volumeEligibilityLabel(status: VolumeEligibilityStatus): string {
  return ({
    pending: "Pendente de medição",
    eligible: "Elegível por volume",
    below_threshold: "Inelegível · abaixo do corte",
    unavailable: "Inelegível · sem volume oficial",
    measurement_failed: "Medição falhou",
  } as const)[status];
}

export function volumeEligibilityFromOfficialMeasurement(averageMonthlySearches: number | null): VolumeEligibilityStatus {
  if (averageMonthlySearches === null) return "unavailable";
  return averageMonthlySearches >= MINIMUM_OFFICIAL_MONTHLY_VOLUME ? "eligible" : "below_threshold";
}

export function setVolumeEligibility(
  semantic: VolumeEligibilitySemantic | null | undefined,
  input: {
    status: VolumeEligibilityStatus;
    measuredAt: string;
    provider: "google_ads";
    providerVersion: "v25";
    averageMonthlySearches: number | null;
    googleAdsRequestId: string | null;
  },
): VolumeEligibilitySemantic {
  return {
    ...(semantic || {}),
    volume_eligibility: {
      status: input.status,
      threshold: MINIMUM_OFFICIAL_MONTHLY_VOLUME,
      provider: input.provider,
      providerVersion: input.providerVersion,
      measuredAt: input.measuredAt,
      averageMonthlySearches: input.averageMonthlySearches,
      googleAdsRequestId: input.googleAdsRequestId,
    },
  };
}

export function isOperationallyEligible(row: VolumeEligibilityRow): boolean {
  return row.status === "publicado" || readVolumeEligibility(row) === "eligible";
}
