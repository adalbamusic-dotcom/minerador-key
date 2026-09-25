import { classifyKgrMeasurement, compareKgrRows } from "./kgr-applicability.ts";
import { normalizeIntentKey } from "./intent-taxonomy.ts";
import { isOperationallyEligible, readVolumeEligibility, type VolumeEligibilityStatus } from "./volume-eligibility.ts";
import { applyManualOrder, type KeywordTableOrderMode } from "./manual-order.ts";
import { readGoogleAdsCpcEvidence } from "./google-ads-demand.ts";
import { readDataForSeoKeywordDifficultyEvidence } from "./dataforseo-keyword-overview-core.ts";
import { resolveCanonicalKeywordSnapshot } from "./canonical-keyword-snapshot.ts";
import { readPublicationLink, readSiteOrigin } from "./publication-link.ts";
import { matchesProcessorRunFilter, type ProcessorRunFilter } from "./processor-table-cells.ts";

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
  /** "Com processo / Sem processo" (pedido do dono, 2026-09-24). Opcional: ausente vale "Todos". */
  processRun?: ProcessorRunFilter;
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

  /*
   * FILTRO LÊ O MESMO ESTADO QUE A COLUNA MOSTRA.
   *
   * Lia `item.status` — a coluna crua, que guarda a última escolha humana.
   * Mas a tela mostra o status EFETIVO: uma keyword aprovada e depois mexida
   * aparece como "Em revisão" sem que ninguém grave isso. Resultado: filtrar
   * por "Em revisão" não devolvia nada nunca, e "Aprovado" trazia keywords
   * que a própria tela mostrava em revisão.
   */
  if (filters.status !== "Todos") result = result.filter(item => resolveCanonicalKeywordSnapshot(item).status.status === filters.status);
  if (filters.intent !== "Todos") result = result.filter(item => {
    const canonical = resolveCanonicalKeywordSnapshot(item).semantic;
    return filters.intent === "unknown"
      ? !canonical.intent || normalizeIntentKey(canonical.intent) === "unknown"
      : normalizeIntentKey(canonical.intent) === filters.intent;
  });
  if (filters.listId !== "Todos") result = result.filter(item => item.lista_id === filters.listId);
  if (filters.siteRelation !== "Todos") result = result.filter(item => siteField(item, "keywordUrlRelation") === filters.siteRelation);
  if (filters.siteArchitecture !== "Todos") result = result.filter(item => siteField(item, "architectureStatus") === filters.siteArchitecture);
  // Mesmo motivo: a coluna Vínculo mostra Livre/Candidata/Verificada/
  // Publicada, derivados de URL + verificação técnica + confirmação humana.
  // O filtro oferecia os valores crus de `publicationStatus` e discordava da
  // própria linha.
  if (filters.sitePublication !== "Todos") {
    result = result.filter(item => readPublicationLink({ status: item.status, evidence: readSiteOrigin(item.analise_semantica) }).state === filters.sitePublication);
  }
  if (filters.kgrApplicability !== "Todos") result = result.filter(item => resolveCanonicalKeywordSnapshot(item).metrics.kgr.applicability === filters.kgrApplicability);
  if (filters.kgrMeasurement !== "Todos") result = result.filter(item => {
    const snapshot = resolveCanonicalKeywordSnapshot(item);
    return classifyKgrMeasurement({ kgrScore: snapshot.metrics.kgr.score, volume: snapshot.metrics.volume.value, results: snapshot.metrics.result.value }) === filters.kgrMeasurement;
  });
  const volumeEligibility = filters.volumeEligibility || "Todos";
  if (volumeEligibility === "operational") result = result.filter(isOperationallyEligible);
  else if (volumeEligibility !== "Todos") result = result.filter(item => readVolumeEligibility(item) === volumeEligibility);
  const processRun = filters.processRun || "Todos";
  if (processRun !== "Todos") result = result.filter(item => matchesProcessorRunFilter(item, processRun));

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

/*
 * FILTROS COMBINADOS DO PAINEL ORGANIZAR (pedido do dono, 2026-09-24).
 *
 * "Aplicabilidade KGR" e "Estado do cálculo KGR" viraram um seletor só, KGR.
 * "Relação com URL" entrou dentro de Vínculo. Os dois campos de filtro de
 * antes continuam existindo (a preferência salva no navegador não muda de
 * formato); o seletor único escolhe UM deles e zera o outro, para nunca ficar
 * um filtro ativo que a tela não mostra.
 */
export type CombinedFilterOption = { value: string; label: string };
export type CombinedFilterGroup = { label: string; options: readonly CombinedFilterOption[] };

const KGR_APPLICABILITY_PREFIX = "aplicabilidade:";
const KGR_MEASUREMENT_PREFIX = "calculo:";
const VINCULO_PUBLICATION_PREFIX = "vinculo:";
const VINCULO_RELATION_PREFIX = "relacao:";

export const KGR_FILTER_GROUPS: readonly CombinedFilterGroup[] = [
  { label: "Aplicabilidade", options: [
    { value: `${KGR_APPLICABILITY_PREFIX}applicable`, label: "Aplicável" },
    { value: `${KGR_APPLICABILITY_PREFIX}not_applicable`, label: "Não aplicável" },
    { value: `${KGR_APPLICABILITY_PREFIX}pending`, label: "Pendente" },
  ] },
  { label: "Cálculo", options: [
    { value: `${KGR_MEASUREMENT_PREFIX}without_data`, label: "Sem medição" },
    { value: `${KGR_MEASUREMENT_PREFIX}partial`, label: "Cálculo parcial" },
    { value: `${KGR_MEASUREMENT_PREFIX}complete`, label: "Cálculo completo" },
    { value: `${KGR_MEASUREMENT_PREFIX}invalid`, label: "Cálculo inválido" },
  ] },
];

export const VINCULO_FILTER_GROUPS: readonly CombinedFilterGroup[] = [
  { label: "Vínculo", options: [
    { value: `${VINCULO_PUBLICATION_PREFIX}free`, label: "Livre" },
    { value: `${VINCULO_PUBLICATION_PREFIX}candidate`, label: "Candidata" },
    { value: `${VINCULO_PUBLICATION_PREFIX}verified`, label: "Verificada" },
    { value: `${VINCULO_PUBLICATION_PREFIX}published`, label: "Publicada" },
    { value: `${VINCULO_PUBLICATION_PREFIX}legacy_unverified`, label: "Publicação não verificada" },
  ] },
  { label: "Relação com URL", options: [
    { value: `${VINCULO_RELATION_PREFIX}confirmed_primary`, label: "Principal confirmada" },
    { value: `${VINCULO_RELATION_PREFIX}candidate_primary`, label: "Principal candidata" },
    { value: `${VINCULO_RELATION_PREFIX}supporting`, label: "Apoio provável" },
    { value: `${VINCULO_RELATION_PREFIX}mentioned`, label: "Mencionada" },
    { value: `${VINCULO_RELATION_PREFIX}undefined`, label: "Sem relação" },
  ] },
];

export const PROCESS_RUN_FILTER_OPTIONS: readonly CombinedFilterOption[] = [
  { value: "with_process", label: "Com processo" },
  { value: "without_process", label: "Sem processo" },
];

function knownCombined(value: string, groups: readonly CombinedFilterGroup[]): boolean {
  return groups.some(group => group.options.some(option => option.value === value));
}

export function combinedKgrFilterValue(applicability: string, measurement: string): string {
  if (applicability && applicability !== "Todos") return `${KGR_APPLICABILITY_PREFIX}${applicability}`;
  if (measurement && measurement !== "Todos") return `${KGR_MEASUREMENT_PREFIX}${measurement}`;
  return "Todos";
}

export function parseCombinedKgrFilter(value: string): { kgrApplicability: string; kgrMeasurement: string } {
  if (!knownCombined(value, KGR_FILTER_GROUPS)) return { kgrApplicability: "Todos", kgrMeasurement: "Todos" };
  if (value.startsWith(KGR_APPLICABILITY_PREFIX)) return { kgrApplicability: value.slice(KGR_APPLICABILITY_PREFIX.length), kgrMeasurement: "Todos" };
  return { kgrApplicability: "Todos", kgrMeasurement: value.slice(KGR_MEASUREMENT_PREFIX.length) };
}

export function combinedVinculoFilterValue(publication: string, relation: string): string {
  if (publication && publication !== "Todos") return `${VINCULO_PUBLICATION_PREFIX}${publication}`;
  if (relation && relation !== "Todos") return `${VINCULO_RELATION_PREFIX}${relation}`;
  return "Todos";
}

export function parseCombinedVinculoFilter(value: string): { sitePublication: string; siteRelation: string } {
  if (!knownCombined(value, VINCULO_FILTER_GROUPS)) return { sitePublication: "Todos", siteRelation: "Todos" };
  if (value.startsWith(VINCULO_PUBLICATION_PREFIX)) return { sitePublication: value.slice(VINCULO_PUBLICATION_PREFIX.length), siteRelation: "Todos" };
  return { sitePublication: "Todos", siteRelation: value.slice(VINCULO_RELATION_PREFIX.length) };
}
