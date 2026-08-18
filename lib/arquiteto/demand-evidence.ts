import { GoogleAdsDemandEvidenceSchema, HistoricalKgrEvidenceSchema, KeywordDemandEvidenceSchema, type ArchitectKeyword, type KeywordDemandEvidence } from "./contracts.ts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
function nullableNumber(value: unknown, integer = false): number | null {
  const parsed = value === null ? null : typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 && (!integer || Number.isInteger(parsed)) ? parsed : null;
}
const nullableString = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const isoDate = (value: unknown) => typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
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

function googleAdsEvidence(keyword: ArchitectKeyword): KeywordDemandEvidence["googleAds"] {
  const source = record(record(keyword.analise_semantica)?.google_ads_measurement);
  if (!source || source.source !== "google_ads") return undefined;
  return GoogleAdsDemandEvidenceSchema.parse({
    source: "google_ads", ...(nullableString(source.providerVersion) ? { providerVersion: nullableString(source.providerVersion)! } : {}), ...(isoDate(source.measuredAt) ? { measuredAt: isoDate(source.measuredAt)! } : {}),
    averageMonthlySearches: nullableNumber(source.averageMonthlySearches, true), monthlySearchVolumes: monthlyVolumes(source.monthlySearchVolumes),
    ...(nullableNumber(source.trend) !== null ? { trend: nullableNumber(source.trend) } : {}),
    ...(record(source.seasonality) ? { seasonality: record(source.seasonality) } : {}),
    competitionAds: nullableString(source.competition), competitionIndexAds: nullableNumber(source.competitionIndex, true),
    lowTopOfPageBidMicros: nullableString(source.lowTopOfPageBidMicros), highTopOfPageBidMicros: nullableString(source.highTopOfPageBidMicros), averageCpcMicros: nullableString(source.averageCpcMicros),
    closeVariants: Array.isArray(source.closeVariants) ? source.closeVariants.filter((value): value is string => typeof value === "string") : [], normalizedCloseVariants: Array.isArray(source.normalizedCloseVariants) ? source.normalizedCloseVariants.filter((value): value is string => typeof value === "string") : [],
    ...(nullableString(source.snapshotRef) ? { snapshotRef: nullableString(source.snapshotRef)! } : {}),
  });
}

export function normalizeKeywordDemandEvidence(keyword: ArchitectKeyword): KeywordDemandEvidence {
  const googleAds = googleAdsEvidence(keyword);
  return KeywordDemandEvidenceSchema.parse({ historicalKgr: historicalKgrEvidence(keyword), ...(googleAds ? { googleAds } : {}) });
}

const privateKeys = new Set(["customerId", "loginCustomerId", "accountId", "accountRef", "mcc", "credentials", "rawResponse", "raw_response"]);
export function sanitizeKeywordProvenanceSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeKeywordProvenanceSnapshot);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !privateKeys.has(key))
    .map(([key, entry]) => [key, sanitizeKeywordProvenanceSnapshot(entry)]));
}
