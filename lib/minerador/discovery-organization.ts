import { normalizeGoogleAdsKeyword } from "../google/ads/normalizers.ts";
import { classifyDiscoveryRelation, type DiscoveryCandidate } from "./discovery-keywords.ts";
import { candidateDiscoveryPerspective, discoveryPerspectivePriority } from "./discovery-perspective.ts";
import type { DiscoveryCustomerFocus } from "../../modules/minerador/discovery/discovery-types.ts";

export type DiscoverySortField = "keyword" | "relation" | "perspective" | "volume" | "trend" | "cpc" | "competition" | "intent" | "funnel" | "targeting" | "situation" | "results";
export type DiscoverySortDirection = "asc" | "desc";
export type DiscoverySort = { field: DiscoverySortField; direction: DiscoverySortDirection };
export type DiscoveryOrganizationFilters = { situation: "all" | "new" | "existing" | "imported" | "unavailable" | "partial"; volume: "all" | "has" | "unavailable"; results: "all" | "has" | "missing"; cpc: "all" | "has" | "missing"; competition: "all" | "low" | "medium" | "high" | "missing"; relation: "all" | "exact" | "phrase" | "broad" | "related"; trend: "all" | "available" | "partial" | "missing"; selection: "all" | "selected" | "unselected" };
export const EMPTY_DISCOVERY_ORGANIZATION: DiscoveryOrganizationFilters = { situation: "all", volume: "all", results: "all", cpc: "all", competition: "all", relation: "all", trend: "all", selection: "all" };

export function discoverySituation(candidate: DiscoveryCandidate) { return candidate.importStatus === "imported" ? "imported" : candidate.existingKeywordId || candidate.importStatus === "already_exists" ? "existing" : candidate.averageMonthlySearches === null ? "unavailable" : candidate.monthlySearchVolumes.length === 0 ? "partial" : "new" as const; }
export function discoveryTrend(candidate: DiscoveryCandidate) { return candidate.monthlySearchVolumes.length ? "available" : candidate.averageMonthlySearches === null ? "missing" : "partial" as const; }
export function candidateMatchesDiscoveryOrganization(candidate: DiscoveryCandidate, seed: string, intent: string, funnel: string, selectedIds: Set<string>, query: string, filters: DiscoveryOrganizationFilters) {
  const relation = classifyDiscoveryRelation(seed, candidate.keyword); const situation = discoverySituation(candidate); const trend = discoveryTrend(candidate);
  const searchable = [candidate.keyword, relation, intent, funnel, situation].join(" ");
  if (query.trim() && !normalizeGoogleAdsKeyword(searchable).includes(normalizeGoogleAdsKeyword(query))) return false;
  if (filters.situation !== "all" && situation !== filters.situation) return false;
  if (filters.volume === "has" && candidate.averageMonthlySearches === null) return false;
  if (filters.volume === "unavailable" && candidate.averageMonthlySearches !== null) return false;
  const hasResults = candidate.currentMetrics?.resultsAllintitle !== null && candidate.currentMetrics?.resultsAllintitle !== undefined;
  if (filters.results === "has" && !hasResults) return false;
  if (filters.results === "missing" && hasResults) return false;
  if (filters.cpc === "has" && candidate.averageCpcMicros === null) return false;
  if (filters.cpc === "missing" && candidate.averageCpcMicros !== null) return false;
  if (filters.competition === "missing" && candidate.competition !== null) return false;
  if (["low", "medium", "high"].includes(filters.competition) && candidate.competition?.toLowerCase() !== filters.competition) return false;
  if (filters.relation !== "all" && relation !== filters.relation) return false;
  if (filters.trend !== "all" && trend !== filters.trend) return false;
  if (filters.selection === "selected" && !selectedIds.has(candidate.candidateId)) return false;
  if (filters.selection === "unselected" && selectedIds.has(candidate.candidateId)) return false;
  return true;
}

const ranks = { relation: { exact: 0, phrase: 1, broad: 2, related: 3 }, trend: { available: 0, partial: 1, missing: 2 }, funnel: { TOFU: 0, MOFU: 1, BOFU: 2, "Não aplicável": 3, "Não definido": 4 }, situation: { new: 0, existing: 1, imported: 2, unavailable: 3, partial: 4 }, competition: { LOW: 0, MEDIUM: 1, HIGH: 2 } } as const;
function compareNullableNumber(left: number | null, right: number | null) { if (left === null && right === null) return 0; if (left === null) return 1; if (right === null) return -1; return left - right; }
function compareText(left: string, right: string) { return left.localeCompare(right, "pt-BR", { sensitivity: "base" }); }
export function compareDiscoveryCandidates(left: DiscoveryCandidate, right: DiscoveryCandidate, seed: string, intent: string, funnel: string, sort: DiscoverySort, focus: DiscoveryCustomerFocus = "all_customer") {
  const direction = sort.direction === "asc" ? 1 : -1;
  const relationLeft = classifyDiscoveryRelation(seed, left.keyword); const relationRight = classifyDiscoveryRelation(seed, right.keyword);
  let result = 0;
  if (sort.field === "keyword") result = compareText(left.keyword, right.keyword);
  if (sort.field === "relation") result = ranks.relation[relationLeft] - ranks.relation[relationRight];
  if (sort.field === "perspective") result = discoveryPerspectivePriority(candidateDiscoveryPerspective(left, seed, focus)) - discoveryPerspectivePriority(candidateDiscoveryPerspective(right, seed, focus));
  if (sort.field === "volume") result = compareNullableNumber(left.averageMonthlySearches, right.averageMonthlySearches);
  if (sort.field === "trend") result = ranks.trend[discoveryTrend(left)] - ranks.trend[discoveryTrend(right)];
  if (sort.field === "cpc") result = compareNullableNumber(left.averageCpcMicros === null ? null : Number(left.averageCpcMicros), right.averageCpcMicros === null ? null : Number(right.averageCpcMicros));
  if (sort.field === "competition") result = left.competitionIndex !== null && right.competitionIndex !== null ? left.competitionIndex - right.competitionIndex : left.competitionIndex !== null ? -1 : right.competitionIndex !== null ? 1 : (ranks.competition[left.competition as keyof typeof ranks.competition] ?? 3) - (ranks.competition[right.competition as keyof typeof ranks.competition] ?? 3);
  if (sort.field === "intent") result = compareText(intent, intent);
  if (sort.field === "funnel") result = (ranks.funnel[funnel as keyof typeof ranks.funnel] ?? 5) - (ranks.funnel[funnel as keyof typeof ranks.funnel] ?? 5);
  if (sort.field === "targeting") result = compareText(left.targeting?.geoTargetConstants.join(", ") || "", right.targeting?.geoTargetConstants.join(", ") || "");
  if (sort.field === "situation") result = ranks.situation[discoverySituation(left)] - ranks.situation[discoverySituation(right)];
  if (sort.field === "results") result = compareNullableNumber(left.currentMetrics?.resultsAllintitle ?? null, right.currentMetrics?.resultsAllintitle ?? null);
  const preserveNullAtEnd = (sort.field === "volume" && (left.averageMonthlySearches === null || right.averageMonthlySearches === null)) || (sort.field === "cpc" && (left.averageCpcMicros === null || right.averageCpcMicros === null)) || (sort.field === "competition" && (left.competitionIndex === null || right.competitionIndex === null));
  return preserveNullAtEnd ? result : result * direction;
}

export function sortDiscoveryCandidates(candidates: DiscoveryCandidate[], seed: string, intent: string, funnel: string, primary: DiscoverySort | null, secondary: DiscoverySort | null, focus: DiscoveryCustomerFocus = "all_customer") { return [...candidates].sort((left, right) => (primary ? compareDiscoveryCandidates(left, right, seed, intent, funnel, primary, focus) : 0) || (secondary ? compareDiscoveryCandidates(left, right, seed, intent, funnel, secondary, focus) : 0)); }
