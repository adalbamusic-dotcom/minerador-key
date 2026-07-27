import { autoDetectNiche } from "../arquiteto/keyword-dna-engine.ts";
import { classifyKgrMeasurement, compareKgrRows, readKgrApplicability } from "./kgr-applicability.ts";
import { normalizeIntentKey } from "./intent-taxonomy.ts";

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
  sortColumn: "keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "nicho" | "lista";
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
  if (filters.intent !== "Todos") result = result.filter(item => filters.intent === "unknown"
    ? !item.intent || normalizeIntentKey(item.intent) === "unknown"
    : normalizeIntentKey(item.intent) === filters.intent);
  if (filters.listId !== "Todos") result = result.filter(item => item.lista_id === filters.listId);
  if (filters.siteRelation !== "Todos") result = result.filter(item => siteField(item, "keywordUrlRelation") === filters.siteRelation);
  if (filters.siteArchitecture !== "Todos") result = result.filter(item => siteField(item, "architectureStatus") === filters.siteArchitecture);
  if (filters.sitePublication !== "Todos") result = result.filter(item => siteField(item, "publicationStatus") === filters.sitePublication);
  if (filters.kgrApplicability !== "Todos") result = result.filter(item => readKgrApplicability(item.analise_semantica) === filters.kgrApplicability);
  if (filters.kgrMeasurement !== "Todos") result = result.filter(item => classifyKgrMeasurement({ kgrScore: item.kgr_score, volume: item.volume_search, results: item.results_allintitle }) === filters.kgrMeasurement);

  const query = filters.searchQuery.trim().toLowerCase();
  if (query) result = result.filter(item => item.keyword.toLowerCase().includes(query) || Boolean(item.location?.toLowerCase().includes(query)));

  return result.sort((a, b) => {
    if (filters.sortColumn === "kgr_score") {
      const kgrOrder = compareKgrRows(a, b, filters.sortDirection);
      if (kgrOrder !== 0) return kgrOrder;
    }
    const value = (item: MineradorTableRow): string | number => {
      if (filters.sortColumn === "keyword" || filters.sortColumn === "kgr_score") return item.keyword.toLowerCase();
      if (filters.sortColumn === "results_allintitle") return item.results_allintitle ?? -1;
      if (filters.sortColumn === "volume_search") return item.volume_search ?? -1;
      if (filters.sortColumn === "nicho") return String(item.analise_semantica?.nicho_override || autoDetectNiche(item.keyword)).toLowerCase();
      return (lists.find(list => list.id === item.lista_id)?.nome || "").toLowerCase();
    };
    const [valueA, valueB] = [value(a), value(b)];
    if (valueA < valueB) return filters.sortDirection === "asc" ? -1 : 1;
    if (valueA > valueB) return filters.sortDirection === "asc" ? 1 : -1;
    return 0;
  });
}
