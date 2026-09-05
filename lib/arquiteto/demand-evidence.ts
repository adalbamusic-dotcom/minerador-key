import { GoogleAdsDemandEvidenceSchema, HistoricalKgrEvidenceSchema, KeywordDemandEvidenceSchema, type ArchitectKeyword, type KeywordDemandEvidence } from "./contracts.ts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const hasOwn = (source: RecordValue, key: string) => Object.prototype.hasOwnProperty.call(source, key);
function firstOwn(source: RecordValue | null, keys: string[]): unknown {
  if (!source) return undefined;
  for (const key of keys) if (hasOwn(source, key) && source[key] !== undefined) return source[key];
  return undefined;
}
function nullableNumber(value: unknown, integer = false): number | null {
  const parsed = value === null ? null : typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 && (!integer || Number.isInteger(parsed)) ? parsed : null;
}
const nullableString = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const isoDate = (value: unknown) => typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
function optionalNullableNumber(value: unknown, integer = false): number | null | undefined {
  return value === undefined ? undefined : nullableNumber(value, integer);
}
function optionalNullableString(value: unknown): string | null | undefined {
  return value === undefined ? undefined : nullableString(value);
}
function evidenceScalar(value: unknown): number | string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value.trim();
  }
  return null;
}
function stringList(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
function evidenceList(value: unknown): unknown[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return Array.isArray(value) ? value : [];
}
function monthlyVolumes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => { const item = record(entry); return { year: nullableNumber(item?.year, true), month: nullableString(item?.month), searches: nullableNumber(item?.searches ?? item?.monthlySearches, true) }; });
}

function historicalKgrEvidence(keyword: ArchitectKeyword): KeywordDemandEvidence["historicalKgr"] {
  const semantic = record(keyword.analise_semantica); const measurement = record(semantic?.allintitle_measurement);
  const history = Array.isArray(semantic?.allintitle_measurement_history) ? semantic.allintitle_measurement_history : [];
  const previous = record(history.at(-1)); const results = nullableNumber(keyword.results_allintitle, true); const kgr = nullableNumber(keyword.kgr_score);
  const statusValue = String(measurement?.status ?? "").toLowerCase();
  const decisionValue = String(semantic?.kgr_decisao ?? semantic?.kgrDecision ?? "").toLowerCase();
  const status = results !== null || kgr !== null ? measurement ? "available" : "historical" : ["nao", "não", "not_applicable"].includes(decisionValue) || statusValue === "not_applicable" ? "not_applicable" : ["error", "unavailable"].includes(statusValue) ? statusValue : "not_measured";
  return HistoricalKgrEvidenceSchema.parse({
    resultsAllintitle: results, kgr, status,
    ...(isoDate(measurement?.measuredAt ?? previous?.measuredAt) ? { measuredAt: isoDate(measurement?.measuredAt ?? previous?.measuredAt)! } : {}),
    ...(nullableString(measurement?.source ?? previous?.source) ? { source: nullableString(measurement?.source ?? previous?.source)! } : {}),
    ...(nullableString(measurement?.calculationVersion ?? previous?.calculationVersion) ? { calculationVersion: nullableString(measurement?.calculationVersion ?? previous?.calculationVersion)! } : {}),
  });
}

function isGoogleAdsMeasurement(value: unknown): value is RecordValue {
  const source = record(value);
  if (!source || firstOwn(source, ["provider", "source"]) !== "google_ads") return false;
  return ["averageMonthlySearches", "avgMonthlySearches", "rawVolume", "monthlySearchVolumes", "measuredAt", "metricStatus", "status"].some(key => hasOwn(source, key));
}

/** Current Minerador evidence wins; the old envelope remains a read-only fallback. */
export function selectGoogleAdsMeasurement(keyword: ArchitectKeyword): RecordValue | undefined {
  const semantic = record(keyword.analise_semantica);
  const current = record(semantic?.volume_measurement);
  if (isGoogleAdsMeasurement(current)) return current;
  const legacy = record(semantic?.google_ads_measurement);
  return isGoogleAdsMeasurement(legacy) ? legacy : undefined;
}

function googleAdsEvidence(keyword: ArchitectKeyword): KeywordDemandEvidence["googleAds"] {
  const semantic = record(keyword.analise_semantica);
  const source = selectGoogleAdsMeasurement(keyword);
  if (!source) return undefined;
  const eligibility = record(semantic?.volume_eligibility) || record(semantic?.google_ads_eligibility);
  const monthly = firstOwn(source, ["monthlySearchVolumes", "monthly_search_volumes"]);
  const average = firstOwn(source, ["averageMonthlySearches", "avgMonthlySearches", "rawVolume"]);
  const bids = record(firstOwn(source, ["bids"]));
  const measuredAt = isoDate(firstOwn(source, ["measuredAt", "measured_at"])) || isoDate(firstOwn(eligibility, ["measuredAt", "measured_at"]));
  const providerVersion = nullableString(firstOwn(source, ["providerVersion", "provider_version", "version"])) || nullableString(firstOwn(eligibility, ["providerVersion", "provider_version"]));
  const metricStatus = optionalNullableString(firstOwn(source, ["metricStatus", "metric_status", "status"]) ?? firstOwn(eligibility, ["metricStatus", "metric_status", "status"]));
  const currencyCode = optionalNullableString(firstOwn(source, ["currencyCode", "currency_code"]));
  const timeZone = optionalNullableString(firstOwn(source, ["timeZone", "time_zone"]));
  const targeting = firstOwn(source, ["targeting"]) ?? firstOwn(eligibility, ["targeting"]);
  const providerCanonicalKeyword = optionalNullableString(firstOwn(source, ["providerCanonicalKeyword", "provider_canonical_keyword", "canonicalKeyword"]));
  const matchedRequestedKeywords = stringList(firstOwn(source, ["matchedRequestedKeywords", "matched_requested_keywords"]));
  const unmatchedRequestedKeywords = stringList(firstOwn(source, ["unmatchedRequestedKeywords", "unmatched_requested_keywords"]));
  const trend = evidenceScalar(firstOwn(source, ["trend"]));
  const recentGrowth = evidenceScalar(firstOwn(source, ["recentGrowth", "recent_growth"]));
  const historyCoverageMonths = optionalNullableNumber(firstOwn(source, ["historyCoverageMonths", "history_coverage_months"]), true);
  const peakMonths = evidenceList(firstOwn(source, ["peakMonths", "peak_months"]));
  const snapshotRef = optionalNullableString(firstOwn(source, ["snapshotRef", "snapshot_ref", "measurementRef", "measurement_ref", "googleAdsRequestId"]));
  const lowTopOfPageBidMicros = firstOwn(source, ["lowTopOfPageBidMicros", "low_top_of_page_bid_micros"]) ?? firstOwn(bids, ["lowTopOfPageBidMicros", "low_top_of_page_bid_micros"]);
  const highTopOfPageBidMicros = firstOwn(source, ["highTopOfPageBidMicros", "high_top_of_page_bid_micros"]) ?? firstOwn(bids, ["highTopOfPageBidMicros", "high_top_of_page_bid_micros"]);
  const averageCpcMicros = firstOwn(source, ["averageCpcMicros", "average_cpc_micros", "cpc"]) ?? firstOwn(bids, ["averageCpcMicros", "average_cpc_micros", "cpc"]);
  const competition = firstOwn(source, ["competition", "adsCompetition", "ads_competition"]);
  const competitionIndex = firstOwn(source, ["competitionIndex", "competitionIndexAds", "adsCompetitionIndex", "competition_index", "ads_competition_index"]);
  return GoogleAdsDemandEvidenceSchema.parse({
    source: "google_ads", ...(providerVersion ? { providerVersion } : {}), ...(measuredAt ? { measuredAt } : {}),
    averageMonthlySearches: nullableNumber(average, true), monthlySearchVolumes: monthlyVolumes(monthly),
    ...(metricStatus !== undefined ? { metricStatus } : {}), ...(currencyCode !== undefined ? { currencyCode } : {}), ...(timeZone !== undefined ? { timeZone } : {}),
    ...(record(targeting) ? { targeting: record(targeting) } : targeting === null ? { targeting: null } : {}),
    ...(providerCanonicalKeyword !== undefined ? { providerCanonicalKeyword } : {}), ...(matchedRequestedKeywords !== undefined ? { matchedRequestedKeywords } : {}), ...(unmatchedRequestedKeywords !== undefined ? { unmatchedRequestedKeywords } : {}),
    ...(trend !== undefined ? { trend } : {}), ...(record(source.seasonality) ? { seasonality: record(source.seasonality) } : source.seasonality === null ? { seasonality: null } : {}),
    ...(peakMonths !== undefined ? { peakMonths } : {}), ...(recentGrowth !== undefined ? { recentGrowth } : {}), ...(historyCoverageMonths !== undefined ? { historyCoverageMonths } : {}),
    competitionAds: nullableString(competition), competitionIndexAds: nullableNumber(competitionIndex, true),
    lowTopOfPageBidMicros: nullableString(lowTopOfPageBidMicros), highTopOfPageBidMicros: nullableString(highTopOfPageBidMicros), averageCpcMicros: nullableString(averageCpcMicros),
    closeVariants: Array.isArray(source.closeVariants) ? source.closeVariants.filter((value): value is string => typeof value === "string") : [], normalizedCloseVariants: Array.isArray(source.normalizedCloseVariants) ? source.normalizedCloseVariants.filter((value): value is string => typeof value === "string") : [],
    ...(snapshotRef !== undefined ? { snapshotRef } : {}),
  });
}

export function normalizeKeywordDemandEvidence(keyword: ArchitectKeyword): KeywordDemandEvidence {
  const existing = keyword.demandEvidence ? KeywordDemandEvidenceSchema.parse(keyword.demandEvidence) : undefined;
  const googleAds = googleAdsEvidence(keyword) || existing?.googleAds;
  const semantic = record(keyword.analise_semantica);
  const hasMeasuredKgrValue = ["results_allintitle", "kgr_score"].some(key => {
    const value = (keyword as RecordValue)[key];
    return value !== null && value !== undefined;
  });
  const hasKgrSource = hasMeasuredKgrValue || ["allintitle_measurement", "allintitle_measurement_history"].some(key => hasOwn(semantic || {}, key));
  const historicalKgr = hasKgrSource || !existing?.historicalKgr ? historicalKgrEvidence(keyword) : existing.historicalKgr;
  return KeywordDemandEvidenceSchema.parse({ historicalKgr, ...(googleAds ? { googleAds } : {}) });
}

const privateKeys = new Set(["customerId", "loginCustomerId", "accountId", "accountRef", "mcc", "credentials", "rawResponse", "raw_response"]);
export function sanitizeKeywordProvenanceSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeKeywordProvenanceSnapshot);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !privateKeys.has(key))
    .map(([key, entry]) => [key, sanitizeKeywordProvenanceSnapshot(entry)]));
}
