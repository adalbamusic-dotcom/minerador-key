import type { DiscoveryCandidate, DiscoverySourceData, DiscoveryTargeting } from "./discovery-keywords.ts";

function asNumberOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asTargeting(value: unknown): DiscoveryTargeting | null {
  const object = asObject(value);
  if (!object || typeof object.language !== "string" || !Array.isArray(object.geoTargetConstants)) return null;
  const network = object.keywordPlanNetwork === "GOOGLE_SEARCH_AND_PARTNERS" ? "GOOGLE_SEARCH_AND_PARTNERS" : "GOOGLE_SEARCH";
  return {
    language: object.language,
    geoTargetConstants: object.geoTargetConstants.filter((item): item is string => typeof item === "string"),
    keywordPlanNetwork: network,
    includeAdultKeywords: object.includeAdultKeywords === true,
  };
}

function asSourceData(value: unknown): DiscoverySourceData | null {
  const object = asObject(value);
  if (!object || (object.source !== "manual" && object.source !== "csv")) return null;
  const importedMetrics = asObject(object.importedMetrics);
  return {
    imported: object.imported === true,
    source: object.source,
    listaId: typeof object.listaId === "string" ? object.listaId : null,
    location: typeof object.location === "string" ? object.location : null,
    intent: typeof object.intent === "string" ? object.intent : null,
    funnel: typeof object.funnel === "string" ? object.funnel : null,
    importedMetrics: importedMetrics ? {
      averageMonthlySearches: asNumberOrNull(importedMetrics.averageMonthlySearches),
      cpc: typeof importedMetrics.cpc === "string" ? importedMetrics.cpc : null,
      competition: typeof importedMetrics.competition === "string" ? importedMetrics.competition : null,
      competitionIndex: asNumberOrNull(importedMetrics.competitionIndex),
      resultsAllintitle: asNumberOrNull(importedMetrics.resultsAllintitle),
    } : null,
    recognizedFields: Array.isArray(object.recognizedFields) ? object.recognizedFields.filter((item): item is string => typeof item === "string") : [],
    ignoredFields: Array.isArray(object.ignoredFields) ? object.ignoredFields.filter((item): item is string => typeof item === "string") : [],
  };
}

export function mapDiscoveryCandidateRow(row: Record<string, unknown>): DiscoveryCandidate {
  const source = row.source === "manual" || row.source === "csv" ? row.source : "google_ads";
  const provider = row.provider === "google_ads" ? "google_ads" : null;
  const providerVersion = row.provider_version === "v25" ? "v25" : null;
  const monthly = Array.isArray(row.monthly_search_volumes) ? row.monthly_search_volumes as DiscoveryCandidate["monthlySearchVolumes"] : [];
  return {
    candidateId: String(row.id || row.candidate_key || ""),
    keyword: String(row.keyword_original || ""),
    canonicalKeyword: String(row.canonical_keyword || row.keyword_original || ""),
    averageMonthlySearches: asNumberOrNull(row.average_monthly_searches),
    monthlySearchVolumes: monthly,
    competition: typeof row.competition === "string" ? row.competition : null,
    competitionIndex: asNumberOrNull(row.competition_index),
    lowTopOfPageBidMicros: typeof row.low_top_of_page_bid_micros === "string" ? row.low_top_of_page_bid_micros : null,
    highTopOfPageBidMicros: typeof row.high_top_of_page_bid_micros === "string" ? row.high_top_of_page_bid_micros : null,
    averageCpcMicros: typeof row.average_cpc_micros === "string" ? row.average_cpc_micros : null,
    currencyCode: typeof row.currency_code === "string" ? row.currency_code : null,
    timeZone: typeof row.time_zone === "string" ? row.time_zone : null,
    targeting: asTargeting(row.targeting),
    source,
    provider,
    providerVersion,
    measuredAt: typeof row.measured_at === "string" ? row.measured_at : null,
    sourceData: asSourceData(row.source_data),
    existingKeywordId: typeof row.existing_keyword_id === "string" ? row.existing_keyword_id : null,
    importStatus: row.import_status === "already_exists" || row.import_status === "selected" || row.import_status === "imported" || row.import_status === "import_failed" ? row.import_status : "available",
    importedKeywordId: typeof row.imported_keyword_id === "string" ? row.imported_keyword_id : null,
  };
}

