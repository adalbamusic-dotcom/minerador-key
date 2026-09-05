import { classifyDiscoveryRelation, candidateMatchesCpc, candidateMatchesTerms, candidateMatchesVolume, type DiscoveryCandidate } from "./discovery-keywords.ts";
import { normalizeGoogleAdsKeyword } from "../google/ads/normalizers.ts";
import type { DiscoverySearchDraft } from "@/modules/minerador/discovery/discovery-types";
import { buildDiscoveryRunSourceData } from "./discovery-context.ts";

export type DiscoveryFilterReason = "out_of_relation" | "out_of_volume" | "out_of_cpc" | "missing_include_term" | "excluded_term";
export type DiscoveryFilterOutcome = "approved" | "out_of_relation" | "out_of_volume" | "out_of_cpc" | "missing_include_term" | "excluded_term" | "duplicate_consolidated" | "partial_normalization_failure";

export type DiscoveryFilterSummary = {
  relation: number;
  volume: number;
  cpc: number;
  include: number;
  exclude: number;
};

export type DiscoveryCandidateFilterDecision = {
  relation: ReturnType<typeof classifyDiscoveryRelation>;
  outcome: DiscoveryFilterOutcome;
  reasons: DiscoveryFilterReason[];
};

export type DiscoveryRunPersistenceInput = {
  id: string;
  brandId: string;
  actorUserId: string;
  operationRequestId: string;
  draft: DiscoverySearchDraft;
  targeting: {
    countryCode: "BR";
    countryLabel: string;
    selectedStates: string[];
    stateLabels: string[];
    geoTargetConstants: string[];
    language: string;
    keywordPlanNetwork: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
    includeAdultKeywords: boolean;
  };
  providerVersion: "v25";
  currencyCode: string | null;
  timeZone: string | null;
  status: "completed" | "partial" | "failed";
  receivedCount: number;
  normalizedCount: number;
  approvedCount: number;
  filteredCount: number;
  responseTruncated: boolean;
  executedAt: string;
};

function canonicalSeed(seed: string) {
  return normalizeGoogleAdsKeyword(seed);
}

export function evaluateDiscoveryCandidate(candidate: DiscoveryCandidate, draft: DiscoverySearchDraft): DiscoveryCandidateFilterDecision {
  const relation = classifyDiscoveryRelation(draft.seed, candidate.keyword);
  const reasons: DiscoveryFilterReason[] = [];
  const selectedRelation = draft.relationshipMode === "Concordância ampla" ? "broad" : draft.relationshipMode === "Concordância de frase" ? "phrase" : draft.relationshipMode === "Concordância exata" ? "exact" : draft.relationshipMode === "Relacionadas" ? "related" : "all";
  const selectedVolume = draft.volumeFilter === "Com volume" ? "has_volume" : draft.volumeFilter === "Sem média disponível" ? "unavailable" : draft.volumeFilter === "0–49" ? "0_49" : draft.volumeFilter === "50–99" ? "50_99" : draft.volumeFilter === "100–119" ? "100_119" : draft.volumeFilter === "120–499" ? "120_499" : draft.volumeFilter === "500–999" ? "500_999" : draft.volumeFilter === "1.000+" ? "1000_plus" : draft.volumeFilter === "Intervalo personalizado" ? "custom" : "all";

  if (selectedRelation !== "all" && relation !== selectedRelation) reasons.push("out_of_relation");
  if (!candidateMatchesVolume(candidate, selectedVolume, { min: null, max: null })) reasons.push("out_of_volume");
  if (!candidateMatchesCpc(candidate, draft.cpcFilter)) reasons.push("out_of_cpc");
  if (!candidateMatchesTerms(candidate, draft.includeTerms, "any")) reasons.push("missing_include_term");
  if (draft.excludeTerms.trim() && candidateMatchesTerms(candidate, draft.excludeTerms, "any")) reasons.push("excluded_term");

  return { relation, outcome: reasons[0] || "approved", reasons };
}

export function applyDiscoveryFilters(candidates: DiscoveryCandidate[], draft: DiscoverySearchDraft) {
  const summary: DiscoveryFilterSummary = { relation: 0, volume: 0, cpc: 0, include: 0, exclude: 0 };
  const acceptedCandidates: DiscoveryCandidate[] = [];
  const decisions = candidates.map(candidate => {
    const decision = evaluateDiscoveryCandidate(candidate, draft);
    const first = decision.reasons[0];
    if (!first) acceptedCandidates.push(candidate);
    else if (first === "out_of_relation") summary.relation += 1;
    else if (first === "out_of_volume") summary.volume += 1;
    else if (first === "out_of_cpc") summary.cpc += 1;
    else if (first === "missing_include_term") summary.include += 1;
    else if (first === "excluded_term") summary.exclude += 1;
    return { candidate, decision };
  });
  return { acceptedCandidates, summary, decisions };
}

function toJsonArray(values: string[]) { return values; }

export function buildDiscoveryRunRow(input: DiscoveryRunPersistenceInput) {
  return {
    id: input.id,
    brand_id: input.brandId,
    actor_user_id: input.actorUserId,
    operation_request_id: input.operationRequestId,
    seed_original: input.draft.seed.trim(),
    seed_canonical: canonicalSeed(input.draft.seed),
    relationship_mode: input.draft.relationshipMode,
    preliminary_intent: input.draft.preliminaryIntent,
    preliminary_funnel: input.draft.preliminaryFunnel,
    language: input.draft.language,
    country_code: input.targeting.countryCode,
    country_label: input.targeting.countryLabel,
    language_constant: input.targeting.language,
    selected_states: toJsonArray(input.targeting.selectedStates),
    state_labels: toJsonArray(input.targeting.stateLabels),
    geo_target_constants: toJsonArray(input.targeting.geoTargetConstants),
    keyword_plan_network: input.targeting.keywordPlanNetwork,
    include_adult_keywords: input.targeting.includeAdultKeywords,
    volume_filter: input.draft.volumeFilter,
    cpc_filter: input.draft.cpcFilter,
    include_terms: input.draft.includeTerms,
    exclude_terms: input.draft.excludeTerms,
    provider: "google_ads" as const,
    provider_version: input.providerVersion,
    currency_code: input.currencyCode,
    time_zone: input.timeZone,
    source: "google_ads" as const,
    source_data: buildDiscoveryRunSourceData(input.draft),
    status: input.status,
    received_count: input.receivedCount,
    normalized_count: input.normalizedCount,
    approved_count: input.approvedCount,
    filtered_count: input.filteredCount,
    response_truncated: input.responseTruncated,
    executed_at: input.executedAt,
    completed_at: input.executedAt,
  };
}

export function buildDiscoveryCandidateRows(input: { brandId: string; runId: string; draft: DiscoverySearchDraft; candidates: DiscoveryCandidate[]; decisions: ReturnType<typeof applyDiscoveryFilters>["decisions"] }) {
  return input.decisions.map(({ candidate, decision }) => ({
    discovery_run_id: input.runId,
    brand_id: input.brandId,
    candidate_key: candidate.candidateId,
    keyword_original: candidate.keyword,
    canonical_keyword: candidate.canonicalKeyword,
    relation: decision.relation,
    average_monthly_searches: candidate.averageMonthlySearches,
    has_average_monthly_searches: candidate.averageMonthlySearches !== null,
    monthly_search_volumes: candidate.monthlySearchVolumes,
    competition: candidate.competition,
    competition_index: candidate.competitionIndex,
    low_top_of_page_bid_micros: candidate.lowTopOfPageBidMicros,
    high_top_of_page_bid_micros: candidate.highTopOfPageBidMicros,
    average_cpc_micros: candidate.averageCpcMicros,
    currency_code: candidate.currencyCode,
    time_zone: candidate.timeZone,
    provider: candidate.provider,
    provider_version: candidate.providerVersion,
    targeting: candidate.targeting,
    preliminary_intent: input.draft.preliminaryIntent,
    preliminary_funnel: input.draft.preliminaryFunnel,
    filter_outcome: decision.outcome,
    filter_reasons: decision.reasons,
    existing_keyword_id: candidate.existingKeywordId,
    import_status: candidate.existingKeywordId ? "already_exists" : "available",
    measured_at: candidate.measuredAt,
    source: candidate.source || "google_ads",
    source_data: candidate.sourceData || null,
  }));
}
