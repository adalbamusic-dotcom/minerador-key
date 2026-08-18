import { normalizeKeyword } from "./keyword-import-core.ts";
import type { DiscoverySource, DiscoverySourceData } from "./discovery-keywords.ts";

export type DiscoveryImportedMetrics = {
  averageMonthlySearches: number | null;
  cpc: string | null;
  competition: string | null;
  competitionIndex: number | null;
  resultsAllintitle: number | null;
};

export type DiscoverySourceEntryInput = {
  keyword: unknown;
  listaId?: unknown;
  listaReference?: unknown;
  location?: unknown;
  intent?: unknown;
  funnel?: unknown;
  importedMetrics?: Partial<DiscoveryImportedMetrics> | null;
  recognizedFields?: string[];
  ignoredFields?: string[];
};

export type NormalizedDiscoverySourceEntry = {
  keyword: string;
  canonicalKeyword: string;
  listaId: string | null;
  sourceData: DiscoverySourceData;
};

export type DiscoverySourceNormalization = {
  accepted: NormalizedDiscoverySourceEntry[];
  duplicateCount: number;
  rejectedCount: number;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/[^0-9,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.includes(",")
      ? raw.replace(",", ".")
      : /^\d{1,3}(?:\.\d{3})+$/.test(raw)
        ? raw.replace(/\./g, "")
        : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value) || null;
}

function parseInteger(value: unknown) {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function cleanMetricData(input: Partial<DiscoveryImportedMetrics> | null | undefined): DiscoveryImportedMetrics | null {
  if (!input) return null;
  const metrics: DiscoveryImportedMetrics = {
    averageMonthlySearches: parseInteger(input.averageMonthlySearches),
    cpc: metricText(input.cpc),
    competition: text(input.competition) || null,
    competitionIndex: parseInteger(input.competitionIndex),
    resultsAllintitle: parseInteger(input.resultsAllintitle),
  };
  return Object.values(metrics).some(value => value !== null) ? metrics : null;
}

function sourceDataFor(source: Exclude<DiscoverySource, "google_ads">, entry: DiscoverySourceEntryInput, listaId: string | null): DiscoverySourceData {
  return {
    imported: true,
    source,
    listaId,
    location: text(entry.location) || null,
    intent: text(entry.intent) || null,
    funnel: text(entry.funnel) || null,
    importedMetrics: cleanMetricData(entry.importedMetrics),
    recognizedFields: [...new Set((entry.recognizedFields || []).filter(value => typeof value === "string" && value.trim()).map(value => value.trim()))],
    ignoredFields: [...new Set((entry.ignoredFields || []).filter(value => typeof value === "string" && value.trim()).map(value => value.trim()))],
  };
}

export function normalizeDiscoverySourceEntries(input: { source: Exclude<DiscoverySource, "google_ads">; entries: DiscoverySourceEntryInput[] }): DiscoverySourceNormalization {
  const accepted: NormalizedDiscoverySourceEntry[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let rejectedCount = 0;
  for (const entry of input.entries) {
    const keyword = text(entry.keyword);
    const canonicalKeyword = normalizeKeyword(keyword);
    if (!keyword || !canonicalKeyword) {
      rejectedCount += 1;
      continue;
    }
    if (seen.has(canonicalKeyword)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(canonicalKeyword);
    accepted.push({
      keyword,
      canonicalKeyword,
      listaId: text(entry.listaId) || null,
      sourceData: sourceDataFor(input.source, entry, text(entry.listaId) || null),
    });
  }
  return { accepted, duplicateCount, rejectedCount };
}

export function parseManualKeywords(value: string): DiscoverySourceEntryInput[] {
  return value.split(/[\n,;]+/).map(keyword => ({ keyword, recognizedFields: ["keyword"] }));
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

const aliases = {
  keyword: ["keyword", "palavra chave", "termo", "query", "search term", "palavra"],
  lista: ["lista", "lista id", "lista destino", "silo", "silo categoria", "categoria"],
  location: ["location", "localizacao", "localização", "cidade", "estado", "uf"],
  intent: ["intent", "intencao", "intenção"],
  funnel: ["funnel", "funil"],
  volume: ["volume", "avg monthly searches", "average monthly searches", "media mensal", "média mensal", "volume busca"],
  cpc: ["cpc", "average cpc", "cpc medio", "cpc médio"],
  competition: ["competition", "concorrencia", "concorrência"],
  competitionIndex: ["competition index", "indice concorrencia", "índice concorrência"],
  results: ["results", "resultados", "allintitle", "resultados allintitle"],
} as const;

function findField(record: Record<string, unknown>, keys: readonly string[]) {
  const normalized = new Map(Object.keys(record).map(key => [normalizeHeader(key), key]));
  for (const alias of keys) {
    const key = normalized.get(normalizeHeader(alias));
    if (key) return { key, value: record[key] };
  }
  return null;
}

export function parseDiscoveryCsvRecords(records: Array<Record<string, unknown>>) {
  const entries: DiscoverySourceEntryInput[] = [];
  const recognized = new Set<string>();
  const ignored = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const keywordField = findField(record, aliases.keyword);
    const listField = findField(record, aliases.lista);
    const locationField = findField(record, aliases.location);
    const intentField = findField(record, aliases.intent);
    const funnelField = findField(record, aliases.funnel);
    const volumeField = findField(record, aliases.volume);
    const cpcField = findField(record, aliases.cpc);
    const competitionField = findField(record, aliases.competition);
    const competitionIndexField = findField(record, aliases.competitionIndex);
    const resultsField = findField(record, aliases.results);
    const fields = [keywordField, listField, locationField, intentField, funnelField, volumeField, cpcField, competitionField, competitionIndexField, resultsField].filter((field): field is { key: string; value: unknown } => Boolean(field));
    fields.forEach(field => recognized.add(field.key));
    Object.keys(record).filter(key => !fields.some(field => field.key === key)).forEach(key => ignored.add(key));
    entries.push({
      keyword: keywordField?.value,
      listaReference: listField?.value,
      location: locationField?.value,
      intent: intentField?.value,
      funnel: funnelField?.value,
      importedMetrics: {
        averageMonthlySearches: parseInteger(volumeField?.value),
        cpc: metricText(cpcField?.value),
        competition: text(competitionField?.value) || null,
        competitionIndex: parseInteger(competitionIndexField?.value),
        resultsAllintitle: parseInteger(resultsField?.value),
      },
      recognizedFields: fields.map(field => field.key),
      ignoredFields: Object.keys(record).filter(key => !fields.some(field => field.key === key)),
    });
  }
  return { entries, recognizedFields: [...recognized], ignoredFields: [...ignored] };
}

/**
 * Parses the two supported simple-list shapes without making Papa Parse's
 * header inference part of the import contract:
 *
 *   Keyword\nfoo\nbar
 *   foo\nbar
 *
 * Rich CSVs continue through the existing named-column parser. The first row
 * is treated as a header only when the file has more than one column, or when
 * the single column explicitly uses a recognized keyword header.
 */
export function parseDiscoveryCsvRows(rows: unknown[][]) {
  const nonEmptyRows = rows.filter(row => Array.isArray(row) && row.some(value => text(value)));
  if (!nonEmptyRows.length) return { entries: [], recognizedFields: [], ignoredFields: [], rowCount: 0 };

  const isSingleColumn = nonEmptyRows.every(row => row.length <= 1 || row.slice(1).every(value => !text(value)));
  if (isSingleColumn) {
    const firstValue = text(nonEmptyRows[0]?.[0]);
    const hasKeywordHeader = aliases.keyword.some(alias => normalizeHeader(alias) === normalizeHeader(firstValue));
    const dataRows = hasKeywordHeader ? nonEmptyRows.slice(1) : nonEmptyRows;
    const entries: DiscoverySourceEntryInput[] = dataRows.map(row => ({ keyword: row[0], recognizedFields: ["Keyword"] }));
    return {
      entries,
      recognizedFields: ["Keyword"],
      ignoredFields: [],
      rowCount: dataRows.length,
    };
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  const headers = headerRow.map((value, index) => text(value) || `Coluna ${index + 1}`);
  const records = dataRows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  const parsed = parseDiscoveryCsvRecords(records);
  return { ...parsed, rowCount: dataRows.length };
}

export function buildDiscoverySourceRunRow(input: {
  id: string;
  brandId: string;
  actorUserId: string;
  operationRequestId: string;
  source: "manual" | "csv";
  preliminaryIntent: string;
  preliminaryFunnel: string;
  receivedCount: number;
  normalizedCount: number;
  approvedCount: number;
  filteredCount: number;
  executedAt: string;
  sourceData?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    brand_id: input.brandId,
    actor_user_id: input.actorUserId,
    operation_request_id: input.operationRequestId,
    seed_original: null,
    seed_canonical: null,
    relationship_mode: null,
    preliminary_intent: input.preliminaryIntent || "Não definida",
    preliminary_funnel: input.preliminaryFunnel || "Não definido",
    language: null,
    country_code: null,
    country_label: null,
    language_constant: null,
    selected_states: null,
    state_labels: null,
    geo_target_constants: null,
    keyword_plan_network: null,
    include_adult_keywords: null,
    volume_filter: "Todos",
    cpc_filter: "Todos",
    include_terms: "",
    exclude_terms: "",
    source: input.source,
    provider: null,
    provider_version: null,
    currency_code: null,
    time_zone: null,
    status: "completed" as const,
    received_count: input.receivedCount,
    normalized_count: input.normalizedCount,
    approved_count: input.approvedCount,
    filtered_count: input.filteredCount,
    response_truncated: false,
    executed_at: input.executedAt,
    completed_at: input.executedAt,
    source_data: input.sourceData || null,
  };
}

export function buildDiscoverySourceCandidateRows(input: {
  brandId: string;
  runId: string;
  source: "manual" | "csv";
  preliminaryIntent: string;
  preliminaryFunnel: string;
  entries: NormalizedDiscoverySourceEntry[];
  existingByCanonical: Map<string, string>;
}) {
  return input.entries.map(entry => ({
    discovery_run_id: input.runId,
    brand_id: input.brandId,
    candidate_key: crypto.randomUUID(),
    keyword_original: entry.keyword,
    canonical_keyword: entry.canonicalKeyword,
    relation: null,
    average_monthly_searches: null,
    has_average_monthly_searches: false,
    monthly_search_volumes: [],
    competition: null,
    competition_index: null,
    low_top_of_page_bid_micros: null,
    high_top_of_page_bid_micros: null,
    average_cpc_micros: null,
    currency_code: null,
    time_zone: null,
    provider: null,
    provider_version: null,
    targeting: null,
    preliminary_intent: input.preliminaryIntent || "Não definida",
    preliminary_funnel: input.preliminaryFunnel || "Não definido",
    filter_outcome: "approved" as const,
    filter_reasons: [],
    existing_keyword_id: input.existingByCanonical.get(entry.canonicalKeyword) || null,
    import_status: input.existingByCanonical.has(entry.canonicalKeyword) ? "already_exists" : "available",
    measured_at: null,
    source: input.source,
    source_data: entry.sourceData,
  }));
}
