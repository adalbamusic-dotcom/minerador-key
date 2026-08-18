import type { DiscoveryCandidate } from "./discovery-keywords.ts";

export const DISCOVERY_CURRENT_ALLINTITLE_STATUSES = ["not_measured", "queued", "measuring", "paused", "captcha", "measured", "failed"] as const;
export type DiscoveryCurrentAllintitleStatus = typeof DISCOVERY_CURRENT_ALLINTITLE_STATUSES[number];

export type DiscoveryCandidateCurrentMetrics = {
  candidateId: string;
  brandId: string;
  keywordId: string | null;
  resultsAllintitle: number | null;
  allintitleStatus: DiscoveryCurrentAllintitleStatus;
  allintitleMeasuredAt: string | null;
  allintitleProvider: string | null;
  allintitleExecutor: string | null;
  allintitleErrorCode: string | null;
  allintitleErrorMessage: string | null;
  averageMonthlySearches: number | null;
  monthlySearchVolumes: DiscoveryCandidate["monthlySearchVolumes"];
  lowTopOfPageBidMicros: string | null;
  highTopOfPageBidMicros: string | null;
  averageCpcMicros: string | null;
  competition: string | null;
  competitionIndex: number | null;
  currencyCode: string | null;
  targeting: DiscoveryCandidate["targeting"] | null;
  metricsMeasuredAt: string | null;
  metricsProvider: string | null;
  metricsProviderVersion: string | null;
  updatedAt: string | null;
};

const asNumberOrNull = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const asObject = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function mapDiscoveryCandidateCurrentMetrics(row: Record<string, unknown>): DiscoveryCandidateCurrentMetrics {
  const targeting = asObject(row.targeting);
  const status = DISCOVERY_CURRENT_ALLINTITLE_STATUSES.includes(row.allintitle_status as DiscoveryCurrentAllintitleStatus) ? row.allintitle_status as DiscoveryCurrentAllintitleStatus : "not_measured";
  return {
    candidateId: String(row.candidate_id || ""),
    brandId: String(row.brand_id || ""),
    keywordId: typeof row.keyword_id === "string" ? row.keyword_id : null,
    resultsAllintitle: asNumberOrNull(row.results_allintitle),
    allintitleStatus: status,
    allintitleMeasuredAt: typeof row.allintitle_measured_at === "string" ? row.allintitle_measured_at : null,
    allintitleProvider: typeof row.allintitle_provider === "string" ? row.allintitle_provider : null,
    allintitleExecutor: typeof row.allintitle_executor === "string" ? row.allintitle_executor : null,
    allintitleErrorCode: typeof row.allintitle_error_code === "string" ? row.allintitle_error_code : null,
    allintitleErrorMessage: typeof row.allintitle_error_message === "string" ? row.allintitle_error_message : null,
    averageMonthlySearches: asNumberOrNull(row.volume_search),
    monthlySearchVolumes: Array.isArray(row.monthly_search_volumes) ? row.monthly_search_volumes as DiscoveryCandidate["monthlySearchVolumes"] : [],
    lowTopOfPageBidMicros: typeof row.low_top_of_page_bid_micros === "string" ? row.low_top_of_page_bid_micros : null,
    highTopOfPageBidMicros: typeof row.high_top_of_page_bid_micros === "string" ? row.high_top_of_page_bid_micros : null,
    averageCpcMicros: typeof row.average_cpc_micros === "string" ? row.average_cpc_micros : null,
    competition: typeof row.competition === "string" ? row.competition : null,
    competitionIndex: asNumberOrNull(row.competition_index),
    currencyCode: typeof row.currency_code === "string" ? row.currency_code : null,
    targeting: targeting ? targeting as DiscoveryCandidate["targeting"] : null,
    metricsMeasuredAt: typeof row.metrics_measured_at === "string" ? row.metrics_measured_at : null,
    metricsProvider: typeof row.metrics_provider === "string" ? row.metrics_provider : null,
    metricsProviderVersion: typeof row.metrics_provider_version === "string" ? row.metrics_provider_version : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export function currentMetricsSeedFromCandidate(candidate: DiscoveryCandidate, actorUserId?: string | null) {
  return {
    candidate_id: candidate.candidateId,
    brand_id: "",
    keyword_id: candidate.existingKeywordId || null,
    results_allintitle: null,
    allintitle_status: "not_measured" as const,
    allintitle_measured_at: null,
    allintitle_provider: null,
    allintitle_executor: null,
    allintitle_error_code: null,
    allintitle_error_message: null,
    volume_search: candidate.averageMonthlySearches,
    monthly_search_volumes: candidate.monthlySearchVolumes,
    low_top_of_page_bid_micros: candidate.lowTopOfPageBidMicros,
    high_top_of_page_bid_micros: candidate.highTopOfPageBidMicros,
    average_cpc_micros: candidate.averageCpcMicros,
    competition: candidate.competition,
    competition_index: candidate.competitionIndex,
    currency_code: candidate.currencyCode,
    targeting: candidate.targeting,
    metrics_measured_at: candidate.measuredAt,
    metrics_provider: candidate.provider,
    metrics_provider_version: candidate.providerVersion,
    updated_by: actorUserId || null,
  };
}

export function mergeDiscoveryCandidateCurrentMetrics(candidate: DiscoveryCandidate, current: DiscoveryCandidateCurrentMetrics | null | undefined): DiscoveryCandidate {
  if (!current) return candidate;
  return {
    ...candidate,
    averageMonthlySearches: current.averageMonthlySearches,
    monthlySearchVolumes: current.monthlySearchVolumes,
    lowTopOfPageBidMicros: current.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: current.highTopOfPageBidMicros,
    averageCpcMicros: current.averageCpcMicros,
    competition: current.competition,
    competitionIndex: current.competitionIndex,
    currencyCode: current.currencyCode || candidate.currencyCode,
    targeting: current.targeting || candidate.targeting,
    measuredAt: current.metricsMeasuredAt || candidate.measuredAt,
    currentMetrics: current,
  };
}

export function buildDiscoveryAllintitleCurrentPatch(value: number, measuredAt: string, operationRequestId: string, batchId: string, actorUserId: string, executor = "minerador_extension") {
  return {
    results_allintitle: value,
    allintitle_status: "measured" as const,
    allintitle_measured_at: measuredAt,
    allintitle_provider: "google_search",
    allintitle_executor: executor,
    allintitle_error_code: null,
    allintitle_error_message: null,
    allintitle_operation_request_id: operationRequestId,
    allintitle_batch_id: batchId,
    updated_by: actorUserId,
    updated_at: measuredAt,
  };
}
