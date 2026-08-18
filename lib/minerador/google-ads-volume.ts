import { z } from "zod";
import type { GoogleAdsHistoricalMetric, GoogleAdsTargeting } from "../google/ads/contracts.ts";
import { normalizeGoogleAdsKeyword } from "../google/ads/normalizers.ts";
import { buildVolumeMetricPatch, type ExistingVolumeMetrics, type VolumeMetricPatch } from "./volume-provider.ts";
import { setVolumeEligibility, volumeEligibilityFromOfficialMeasurement } from "./volume-eligibility.ts";

export const GOOGLE_ADS_VOLUME_BATCH_SIZE = 10_000;
export const GoogleAdsVolumeRequestSchema = z.object({
  keywordIds: z.array(z.string().uuid()).max(50_000).default([]).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "keywordIds contém duplicidades." });
  }),
  candidateIds: z.array(z.string().uuid()).max(50_000).default([]).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "candidateIds duplicados." });
  }),
  operationRequestId: z.string().uuid(),
}).superRefine((value, context) => {
  if (!value.keywordIds.length && !value.candidateIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Informe ao menos uma keyword ou candidata." });
});

export type GoogleAdsVolumeRequest = z.infer<typeof GoogleAdsVolumeRequestSchema>;

export type GoogleAdsBrandConnection = {
  brandId: string;
  customerId: string;
  loginCustomerId: string | null;
  languageConstant: string;
  geoTargetConstants: string[];
  keywordPlanNetwork: GoogleAdsTargeting["keywordPlanNetwork"];
  includeAdultKeywords: boolean;
  currencyCode: string;
  timeZone: string;
  status: "validated" | "invalid" | "pending" | "disabled";
  validatedAt: string | null;
};

export type GoogleAdsVolumeKeyword = ExistingVolumeMetrics & { id: string; brandId: string; keyword: string };

export type GoogleAdsVolumeMeasurement = GoogleAdsHistoricalMetric & {
  keywordId: string;
  operationRequestId: string;
  googleAdsRequestId: string | null;
};

export type GoogleAdsVolumeMetricPatch = VolumeMetricPatch & { volume_source: "google_ads" };

export function splitGoogleAdsVolumeKeywordIds(keywordIds: string[], batchSize = GOOGLE_ADS_VOLUME_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("O tamanho do lote Google Ads deve ser positivo.");
  return Array.from({ length: Math.ceil(keywordIds.length / batchSize) }, (_, index) => keywordIds.slice(index * batchSize, (index + 1) * batchSize));
}

export function matchGoogleAdsVolumeMetrics(keywords: GoogleAdsVolumeKeyword[], metrics: GoogleAdsHistoricalMetric[], operationRequestId: string, googleAdsRequestId: string | null) {
  const keywordByNormalizedText = new Map<string, GoogleAdsVolumeKeyword[]>();
  for (const keyword of keywords) {
    const normalized = normalizeGoogleAdsKeyword(keyword.keyword);
    keywordByNormalizedText.set(normalized, [...(keywordByNormalizedText.get(normalized) || []), keyword]);
  }

  const matches: GoogleAdsVolumeMeasurement[] = [];
  for (const metric of metrics) {
    for (const requestedKeyword of metric.matchedRequestedKeywords) {
      for (const keyword of keywordByNormalizedText.get(normalizeGoogleAdsKeyword(requestedKeyword)) || []) {
        matches.push({ ...metric, keywordId: keyword.id, operationRequestId, googleAdsRequestId });
      }
    }
  }
  const matchedIds = new Set(matches.map(item => item.keywordId));
  return { matches, unmatchedKeywordIds: keywords.filter(keyword => !matchedIds.has(keyword.id)).map(keyword => keyword.id) };
}

export function buildGoogleAdsVolumeMetricPatch(existing: ExistingVolumeMetrics, measurement: GoogleAdsVolumeMeasurement): GoogleAdsVolumeMetricPatch | null {
  if (measurement.averageMonthlySearches === null || measurement.averageMonthlySearches < 0) return null;
  const base = buildVolumeMetricPatch(existing, {
    keyword: measurement.keyword,
    status: "success",
    volume: measurement.averageMonthlySearches,
    source: "google_ads",
    measuredAt: measurement.measuredAt,
    match: "exact",
  });
  if (!base.volume_search && base.volume_search !== 0) return null;
  const semantic = existing.status === "publicado"
    ? { ...(base.analise_semantica || {}) }
    : setVolumeEligibility(base.analise_semantica, {
      status: volumeEligibilityFromOfficialMeasurement(measurement.averageMonthlySearches),
      measuredAt: measurement.measuredAt,
      provider: measurement.provider,
      providerVersion: measurement.providerVersion,
      averageMonthlySearches: measurement.averageMonthlySearches,
      googleAdsRequestId: measurement.googleAdsRequestId,
    });
  semantic.volume_measurement = {
    ...(semantic.volume_measurement as Record<string, unknown> || {}),
    provider: measurement.provider,
    providerVersion: measurement.providerVersion,
    measuredAt: measurement.measuredAt,
    averageMonthlySearches: measurement.averageMonthlySearches,
    monthlySearchVolumes: measurement.monthlySearchVolumes,
    competition: measurement.competition,
    competitionIndex: measurement.competitionIndex,
    lowTopOfPageBidMicros: measurement.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: measurement.highTopOfPageBidMicros,
    averageCpcMicros: measurement.averageCpcMicros,
    currencyCode: measurement.currencyCode,
    timeZone: measurement.timeZone,
    targeting: measurement.targeting,
    closeVariants: measurement.closeVariants,
    matchedRequestedKeywords: measurement.matchedRequestedKeywords,
    accountRef: measurement.customerId.slice(-4).padStart(measurement.customerId.length, "*"),
    googleAdsRequestId: measurement.googleAdsRequestId,
  };
  return { ...base, volume_source: "google_ads", analise_semantica: semantic };
}

/** Records an exact Google Ads response with no monthly average without overwriting volume or KGR. */
export function buildGoogleAdsUnavailableVolumePatch(existing: ExistingVolumeMetrics, measurement: GoogleAdsVolumeMeasurement) {
  if (measurement.averageMonthlySearches !== null || existing.status === "publicado") return null;
  return {
    analise_semantica: setVolumeEligibility(existing.analise_semantica, {
      status: "unavailable",
      measuredAt: measurement.measuredAt,
      provider: measurement.provider,
      providerVersion: measurement.providerVersion,
      averageMonthlySearches: null,
      googleAdsRequestId: measurement.googleAdsRequestId,
    }),
  };
}
