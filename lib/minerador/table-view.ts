import { classifyKgrMeasurement, compareKgrRows } from "./kgr-applicability.ts";
import { normalizeIntentKey } from "./intent-taxonomy.ts";
import { isOperationallyEligible, readVolumeEligibility, type VolumeEligibilityStatus } from "./volume-eligibility.ts";
import { applyManualOrder, type KeywordTableOrderMode } from "./manual-order.ts";
import { readGoogleAdsCpcEvidence } from "./google-ads-demand.ts";
import { readDataForSeoKeywordDifficultyEvidence } from "./dataforseo-keyword-overview-core.ts";
import { resolveCanonicalKeywordSnapshot } from "./canonical-keyword-snapshot.ts";

export type MineradorTableRow = {
  id: string;
  brand_id?: string;
  keyword: string;
  location: string | null;
  results_allintitle: number | null;
  volume_search: number | null;
  kgr_score: number | null;
  intent: string | null;
  status: string;
  lista_id: string | null;
  analise_semantica?: Record<string, unknown> & { nicho_override?: string } | null;
  volume_source?: string | null;
};

export type MineradorTableList = { id: string; nome: string };

export type MineradorTableFilters = {
  searchQuery: string;
  status: string;
  intent: string;
  listId: string;
  siteRelation: string;
  siteArchitecture: string;
  sitePublication: string;
  kgrApplicability: string;
  kgrMeasurement: string;
  volumeEligibility?: "Todos" | "operational" | VolumeEligibilityStatus;
  orderMode?: KeywordTableOrderMode;
  manualOrderIds?: readonly string[];
  sortColumn: "keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "cpc" | "keyword_difficulty" | "nicho" | "lista";
  sortDirection: "asc" | "desc";
};

function siteField(row: MineradorTableRow, field: string): string | undefined {
  const evidence = row.analise_semantica?.site_origin;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>)[field] as string | undefined
    : undefined;
}

/** Pure display projection: it never mutates or caches the loaded collection. */
export function deriveMineradorTableRows(
  keywords: readonly MineradorTableRow[],
  lists: readonly MineradorTableList[],
  filters: MineradorTableFilters,
): MineradorTableRow[] {
  let result = [...keywords];

  if (filters.status !== "Todos") result = result.filter(item => (item.status || "").toLowerCase() === filters.status.toLowerCase());
  if (filters.intent !== "Todos") result = result.filter(item => {
    const canonical = resolveCanonicalKeywordSnapshot(item).semantic;
    return filters.intent === "unknown"
      ? !canonical.intent || normalizeIntentKey(canonical.intent) === "unknown"
      : normalizeIntentKey(canonical.intent) === filters.intent;
  });
  if (filters.listId !== "Todos") result = result.filter(item => item.lista_id === filters.listId);
  if (filters.siteRelation !== "Todos") result = result.filter(item => siteField(item, "keywordUrlRelation") === filters.siteRelation);
  if (filters.siteArchitecture !== "Todos") result = result.filter(item => siteField(item, "architectureStatus") === filters.siteArchitecture);
  if (filters.sitePublication !== "Todos") result = result.filter(item => siteField(item, "publicationStatus") === filters.sitePublication);
  if (filters.kgrApplicability !== "Todos") result = result.filter(item => resolveCanonicalKeywordSnapshot(item).metrics.kgr.applicability === filters.kgrApplicability);
  if (filters.kgrMeasurement !== "Todos") result = result.filter(item => {
    const snapshot = resolveCanonicalKeywordSnapshot(item);
    return classifyKgrMeasurement({ kgrScore: snapshot.metrics.kgr.score, volume: snapshot.metrics.volume.value, results: snapshot.metrics.result.value }) === filters.kgrMeasurement;
  });
  const volumeEligibility = filters.volumeEligibility || "Todos";
  if (volumeEligibility === "operational") result = result.filter(isOperationallyEligible);
  else if (volumeEligibility !== "Todos") result = result.filter(item => readVolumeEligibility(item) === volumeEligibility);

  const query = filters.searchQuery.trim().toLowerCase();
  if (query) result = result.filter(item => item.keyword.toLowerCase().includes(query) || Boolean(item.location?.toLowerCase().includes(query)));

  if (filters.orderMode === "manual") return applyManualOrder(result, filters.manualOrderIds || [], item => item.id);

  const compareNullableNumbers = (left: number | null, right: number | null): number => {
    // A missing metric is unknown, not zero, and remains after measured values in
    // both directions so sorting never makes an unmeasured keyword look cheap.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return 0;
    return filters.sortDirection === "asc" ? left - right : right - left;
  };

  return result.sort((a, b) => {
    if (filters.sortColumn === "cpc") {
      return compareNullableNumbers(
        readGoogleAdsCpcEvidence(a.analise_semantica).sortValue,
        readGoogleAdsCpcEvidence(b.analise_semantica).sortValue,
      );
    }
    if (filters.sortColumn === "keyword_difficulty") {
      return compareNullableNumbers(
        readDataForSeoKeywordDifficultyEvidence(a.analise_semantica).sortValue,
        readDataForSeoKeywordDifficultyEvidence(b.analise_semantica).sortValue,
      );
    }
    if (filters.sortColumn === "kgr_score") {
      const snapshotA = resolveCanonicalKeywordSnapshot(a);
      const snapshotB = resolveCanonicalKeywordSnapshot(b);
      const kgrOrder = compareKgrRows(
        { ...a, kgr_score: snapshotA.metrics.kgr.score, volume_search: snapshotA.metrics.volume.value, results_allintitle: snapshotA.metrics.result.value, currentKgrReady: snapshotA.metrics.kgr.score !== null },
        { ...b, kgr_score: snapshotB.metrics.kgr.score, volume_search: snapshotB.metrics.volume.value, results_allintitle: snapshotB.metrics.result.value, currentKgrReady: snapshotB.metrics.kgr.score !== null },
        filters.sortDirection,
      );
      if (kgrOrder !== 0) return kgrOrder;
    }
    const value = (item: MineradorTableRow): string | number => {
      if (filters.sortColumn === "keyword" || filters.sortColumn === "kgr_score") return item.keyword.toLowerCase();
      if (filters.sortColumn === "results_allintitle") return resolveCanonicalKeywordSnapshot(item).metrics.result.value ?? -1;
      if (filters.sortColumn === "volume_search") return resolveCanonicalKeywordSnapshot(item).metrics.volume.value ?? -1;
      if (filters.sortColumn === "nicho") return String(resolveCanonicalKeywordSnapshot(item).semantic.niche || "").toLowerCase();
      return (lists.find(list => list.id === item.lista_id)?.nome || "").toLowerCase();
    };
    const [valueA, valueB] = [value(a), value(b)];
    if (valueA < valueB) return filters.sortDirection === "asc" ? -1 : 1;
    if (valueA > valueB) return filters.sortDirection === "asc" ? 1 : -1;
    return 0;
  });
}
