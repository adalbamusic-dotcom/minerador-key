import { normalizeGoogleAdsKeyword } from "../google/ads/normalizers.ts";
import type { DiscoveryCandidateCurrentMetrics } from "./discovery-current-metrics.ts";

export type DiscoveryRelationKind = "all" | "broad" | "phrase" | "exact" | "related";
export type DiscoverySource = "google_ads" | "manual" | "csv";
export type DiscoveryProvider = "google_ads" | null;
export type DiscoveryTargeting = { language: string; geoTargetConstants: string[]; keywordPlanNetwork: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS"; includeAdultKeywords: boolean };
export type DiscoverySourceData = {
  imported: boolean;
  source: "manual" | "csv";
  listaId: string | null;
  location: string | null;
  intent: string | null;
  funnel: string | null;
  importedMetrics: { averageMonthlySearches: number | null; cpc: string | null; competition: string | null; competitionIndex: number | null; resultsAllintitle: number | null } | null;
  recognizedFields: string[];
  ignoredFields: string[];
};
export type DiscoveryVolumeFilter = "all" | "has_volume" | "unavailable" | "0_49" | "50_99" | "100_119" | "120_499" | "500_999" | "1000_plus" | "custom";
export type DiscoveryTermMode = "any" | "all";
export type DiscoveryCpcFilter = "Todos" | "Com CPC" | "Sem CPC";

export type DiscoveryCandidate = {
  candidateId: string;
  keyword: string;
  canonicalKeyword: string;
  averageMonthlySearches: number | null;
  monthlySearchVolumes: Array<{ year: number | null; month: string | null; searches: number | null }>;
  competition: string | null;
  competitionIndex: number | null;
  lowTopOfPageBidMicros: string | null;
  highTopOfPageBidMicros: string | null;
  averageCpcMicros: string | null;
  currencyCode: string | null;
  timeZone: string | null;
  targeting: DiscoveryTargeting | null;
  /** Persisted rows always include this; optional keeps legacy in-memory fixtures compatible. */
  source?: DiscoverySource;
  provider: DiscoveryProvider;
  providerVersion: "v25" | null;
  measuredAt: string | null;
  sourceData?: DiscoverySourceData | null;
  existingKeywordId: string | null;
  importStatus?: "available" | "already_exists" | "selected" | "imported" | "import_failed";
  importedKeywordId?: string | null;
  currentMetrics?: DiscoveryCandidateCurrentMetrics | null;
};

export function classifyDiscoveryRelation(seed: string, keyword: string): Exclude<DiscoveryRelationKind, "all"> {
  const normalizedSeed = normalizeGoogleAdsKeyword(seed);
  const normalizedKeyword = normalizeGoogleAdsKeyword(keyword);
  if (normalizedKeyword === normalizedSeed) return "exact";
  if (normalizedSeed && normalizedKeyword.includes(normalizedSeed)) return "phrase";
  const seedTerms = normalizedSeed.split(/\s+/).filter(Boolean);
  if (seedTerms.length && seedTerms.every(term => normalizedKeyword.split(/\s+/).includes(term))) return "broad";
  return "related";
}

export function parseDiscoveryTerms(value: string) {
  return value.split(/[\n,]+/).map(term => term.trim()).filter(Boolean).map(term => ({ text: term.replace(/^\[|\]$/g, "").trim(), exact: /^\[.*\]$/.test(term) })).filter(term => term.text).map(term => ({ ...term, normalized: normalizeGoogleAdsKeyword(term.text) }));
}

function matchesTerm(keyword: string, term: { normalized: string; exact: boolean }) {
  return term.exact ? keyword === term.normalized : keyword.includes(term.normalized);
}

export function candidateMatchesTerms(candidate: DiscoveryCandidate, rawTerms: string, mode: DiscoveryTermMode) {
  const terms = parseDiscoveryTerms(rawTerms);
  if (!terms.length) return true;
  const keyword = candidate.canonicalKeyword;
  return mode === "all" ? terms.every(term => matchesTerm(keyword, term)) : terms.some(term => matchesTerm(keyword, term));
}

export function candidateMatchesVolume(candidate: DiscoveryCandidate, filter: DiscoveryVolumeFilter, custom: { min: number | null; max: number | null }) {
  const volume = candidate.averageMonthlySearches;
  if (filter === "all") return true;
  if (filter === "unavailable") return volume === null;
  if (volume === null) return false;
  if (filter === "has_volume") return true;
  if (filter === "0_49") return volume <= 49;
  if (filter === "50_99") return volume >= 50 && volume <= 99;
  if (filter === "100_119") return volume >= 100 && volume <= 119;
  if (filter === "120_499") return volume >= 120 && volume <= 499;
  if (filter === "500_999") return volume >= 500 && volume <= 999;
  if (filter === "1000_plus") return volume >= 1000;
  return (custom.min === null || volume >= custom.min) && (custom.max === null || volume <= custom.max);
}

export function candidateMatchesCpc(candidate: DiscoveryCandidate, filter: DiscoveryCpcFilter) {
  if (filter === "Com CPC") return candidate.averageCpcMicros !== null;
  if (filter === "Sem CPC") return candidate.averageCpcMicros === null;
  return true;
}

export function formatDiscoveryMoney(micros: string | null, currencyCode: string | null) {
  if (micros === null) return "—";
  if (!currencyCode) return "—";
  const value = Number(micros) / 1_000_000;
  if (!Number.isFinite(value)) return "—";
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(value); } catch { return `${value.toFixed(2)} ${currencyCode}`; }
}
