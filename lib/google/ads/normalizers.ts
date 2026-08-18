import type {
  GoogleAdsKeywordAccount,
  GoogleAdsKeywordMetrics,
  GoogleAdsMonthlySearchVolume,
  GoogleAdsNormalizedKeyword,
  GoogleAdsTargeting,
} from "./contracts.ts";
import type { GoogleAdsServerConfig } from "./config.ts";
import { GoogleAdsError } from "./errors.ts";

function int64(value: unknown): number | null {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function micros(value: unknown): string | null {
  if (typeof value === "string" && /^-?\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return null;
}

export function normalizeGoogleAdsKeyword(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

export function normalizeGoogleAdsKeywordMetrics(value: unknown, requestId?: string | null): GoogleAdsKeywordMetrics {
  if (value === undefined || value === null) return { averageMonthlySearches: null, monthlySearchVolumes: [], competition: null, competitionIndex: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null };
  if (typeof value !== "object" || Array.isArray(value)) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
  const record = value as Record<string, unknown>;
  const monthlySearchVolumes = Array.isArray(record.monthlySearchVolumes)
    ? record.monthlySearchVolumes.map((entry): GoogleAdsMonthlySearchVolume => {
      if (!entry || typeof entry !== "object") throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
      const volume = entry as Record<string, unknown>;
      return {
        year: int64(volume.year),
        month: typeof volume.month === "string" ? volume.month : null,
        searches: int64(volume.monthlySearches),
      };
    })
    : [];
  return {
    averageMonthlySearches: int64(record.avgMonthlySearches),
    monthlySearchVolumes,
    competition: typeof record.competition === "string" ? record.competition : null,
    competitionIndex: int64(record.competitionIndex),
    lowTopOfPageBidMicros: micros(record.lowTopOfPageBidMicros),
    highTopOfPageBidMicros: micros(record.highTopOfPageBidMicros),
    averageCpcMicros: micros(record.averageCpcMicros),
  };
}

export function normalizeGoogleAdsKeywordResult(input: {
  keyword: unknown;
  metrics: unknown;
  account: GoogleAdsKeywordAccount;
  targeting: GoogleAdsTargeting;
  providerVersion: GoogleAdsServerConfig["apiVersion"];
  measuredAt?: string;
  requestId?: string | null;
}): GoogleAdsNormalizedKeyword {
  if (typeof input.keyword !== "string" || !input.keyword.trim()) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: input.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
  return {
    keyword: input.keyword,
    normalizedKeyword: normalizeGoogleAdsKeyword(input.keyword),
    ...normalizeGoogleAdsKeywordMetrics(input.metrics, input.requestId),
    currencyCode: input.account.currencyCode,
    timeZone: input.account.timeZone,
    targeting: input.targeting,
    customerId: input.account.customerId,
    provider: "google_ads",
    providerVersion: input.providerVersion,
    measuredAt: input.measuredAt || new Date().toISOString(),
  };
}
