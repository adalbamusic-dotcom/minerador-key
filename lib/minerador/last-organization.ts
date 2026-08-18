import { normalizeIntentKey } from "./intent-taxonomy.ts";
import type { VolumeEligibilityStatus } from "./volume-eligibility.ts";

export type MineradorOrganizationValues = {
  searchQuery: string;
  filterStatus: string;
  filterIntent: string;
  filterListId: string;
  filterSiteRelation: string;
  filterSiteArchitecture: string;
  filterSitePublication: string;
  filterKgrApplicability: string;
  filterKgrMeasurement: string;
  filterVolumeEligibility: "Todos" | "operational" | VolumeEligibilityStatus;
  sortColumn: "keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "nicho" | "lista";
  sortDirection: "asc" | "desc";
};

export type MineradorOrganizationList = { id: string; nome: string };

const all = "Todos";
const sortColumns = new Set<MineradorOrganizationValues["sortColumn"]>(["keyword", "results_allintitle", "volume_search", "kgr_score", "nicho", "lista"]);
const siteRelations = new Set([all, "confirmed_primary", "candidate_primary", "supporting", "mentioned", "undefined"]);
const siteArchitectures = new Set([all, "awaiting_architecture", "architectural_review_required", "architecture_confirmed", "conflict"]);
const sitePublications = new Set([all, "published", "not_confirmed", "not_found", "redirected", "canonical_conflict"]);
const kgrApplicability = new Set([all, "applicable", "not_applicable", "pending"]);
const kgrMeasurements = new Set([all, "without_data", "partial", "complete", "invalid"]);
const volumeEligibility = new Set([all, "operational", "pending", "eligible", "below_threshold", "unavailable", "measurement_failed"]);

/** Versiona a preferência local para distinguir o antigo default de uma escolha explícita. */
export const MINERADOR_ORGANIZATION_STORAGE_VERSION = 2;

export const defaultMineradorOrganization: MineradorOrganizationValues = {
  searchQuery: "", filterStatus: all, filterIntent: all, filterListId: all,
  filterSiteRelation: all, filterSiteArchitecture: all, filterSitePublication: all,
  filterKgrApplicability: all, filterKgrMeasurement: all, filterVolumeEligibility: all, sortColumn: "keyword", sortDirection: "asc",
};

export function mineradorLastOrganizationKey(userId: string, brandId: string) {
  return `minerador-pro:last-view:${userId}:${brandId}:minerador`;
}

function textValue(value: unknown) { return typeof value === "string" ? value : ""; }
function knownOrAll(value: unknown, known: Set<string>) { const text = textValue(value); return known.has(text) ? text : all; }

function normalizeStatus(value: unknown) {
  const text = textValue(value).trim().toLowerCase();
  const aliases: Record<string, string> = { todos: all, bruto: "bruto", bruta: "bruto", aprovado: "aprovado", aprovada: "aprovado", rejeitado: "rejeitado", rejeitada: "rejeitado", publicado: "publicado", publicada: "publicado" };
  return aliases[text] || all;
}

export function parseMineradorLastOrganization(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function normalizeMineradorLastOrganization(
  value: Record<string, unknown> | null,
  knownListIds?: readonly string[],
): MineradorOrganizationValues {
  if (!value) return { ...defaultMineradorOrganization };
  const requestedListId = textValue(value.filterListId);
  const listId = requestedListId === all || !requestedListId || (knownListIds && !knownListIds.includes(requestedListId)) ? all : requestedListId;
  const requestedIntent = textValue(value.filterIntent);
  const intent = requestedIntent && requestedIntent !== all ? normalizeIntentKey(requestedIntent) : all;
  const normalizedVolumeEligibility = knownOrAll(value.filterVolumeEligibility, volumeEligibility) as MineradorOrganizationValues["filterVolumeEligibility"];
  const hasCurrentStorageVersion = value.organizationStorageVersion === MINERADOR_ORGANIZATION_STORAGE_VERSION;
  // Antes desta versão, "operational" era gravado automaticamente ao abrir o
  // Processador. Não tratar esse valor histórico como escolha do usuário.
  const volumeFilter = normalizedVolumeEligibility === "operational" && !hasCurrentStorageVersion
    ? all
    : normalizedVolumeEligibility;
  return {
    searchQuery: textValue(value.searchQuery),
    filterStatus: normalizeStatus(value.filterStatus),
    filterIntent: intent,
    filterListId: listId,
    filterSiteRelation: knownOrAll(value.filterSiteRelation, siteRelations),
    filterSiteArchitecture: knownOrAll(value.filterSiteArchitecture, siteArchitectures),
    filterSitePublication: knownOrAll(value.filterSitePublication, sitePublications),
    filterKgrApplicability: knownOrAll(value.filterKgrApplicability, kgrApplicability),
    filterKgrMeasurement: value.filterKgrMeasurement === "with_score" ? "complete" : value.filterKgrMeasurement === "without_data" ? all : knownOrAll(value.filterKgrMeasurement, kgrMeasurements),
    filterVolumeEligibility: volumeFilter,
    sortColumn: sortColumns.has(textValue(value.sortColumn) as MineradorOrganizationValues["sortColumn"]) ? textValue(value.sortColumn) as MineradorOrganizationValues["sortColumn"] : "keyword",
    sortDirection: textValue(value.sortDirection) === "desc" ? "desc" : "asc",
  };
}

export function mineradorOrganizationLabels(values: MineradorOrganizationValues, lists: readonly MineradorOrganizationList[]): string[] {
  const labels: string[] = [];
  const status = ({ bruto: "Brutas", aprovado: "Aprovadas", rejeitado: "Rejeitadas", publicado: "Publicados" } as Record<string, string>)[values.filterStatus];
  if (status) labels.push(status);
  const publication = ({ published: "Publicação publicada", not_confirmed: "Publicação não confirmada", not_found: "Publicação não localizada", redirected: "Publicação redirecionada", canonical_conflict: "Conflito de canonical" } as Record<string, string>)[values.filterSitePublication];
  if (publication) labels.push(publication);
  const intent = ({ informational: "Informativa", commercial_investigation: "Comercial investigativa", transactional: "Transacional", navigational: "Navegacional", local: "Local", mixed: "Mista", unknown: "Pendente" } as Record<string, string>)[values.filterIntent];
  if (intent) labels.push(intent);
  if (values.filterListId !== all) labels.push(`Silo: ${lists.find(list => list.id === values.filterListId)?.nome || "não encontrado"}`);
  const relation = ({ confirmed_primary: "Principal confirmada", candidate_primary: "Principal candidata", supporting: "Apoio provável", mentioned: "Mencionada", undefined: "Sem relação" } as Record<string, string>)[values.filterSiteRelation];
  if (relation) labels.push(`URL: ${relation}`);
  const architecture = ({ awaiting_architecture: "Aguardando", architectural_review_required: "Revisão necessária", architecture_confirmed: "Confirmada", conflict: "Conflito" } as Record<string, string>)[values.filterSiteArchitecture];
  if (architecture) labels.push(`Arquitetura: ${architecture}`);
  const applicability = ({ applicable: "KGR aplicável", not_applicable: "KGR não aplicável", pending: "KGR pendente" } as Record<string, string>)[values.filterKgrApplicability];
  if (applicability) labels.push(applicability);
  const measurement = ({ without_data: "Sem medição", partial: "Parcial", complete: "Completa", invalid: "Inválida" } as Record<string, string>)[values.filterKgrMeasurement];
  if (measurement) labels.push(`Métricas: ${measurement}`);
  const volume = ({ operational: "Elegíveis por volume", pending: "Pendente de medição", eligible: "Elegível por volume", below_threshold: "Abaixo do corte", unavailable: "Sem volume oficial", measurement_failed: "Medição falhou" } as Record<string, string>)[values.filterVolumeEligibility];
  if (volume) labels.push(`Volume: ${volume}`);
  if (values.searchQuery.trim()) labels.push(`Busca: ${values.searchQuery.trim()}`);
  return labels;
}

export function mineradorOrganizationButtonSummary(labels: readonly string[]): string {
  if (labels.length === 0) return "Organizar";
  const visible = labels.slice(0, 3).join(" · ");
  return labels.length > 3 ? `${visible} +${labels.length - 3}` : visible;
}
