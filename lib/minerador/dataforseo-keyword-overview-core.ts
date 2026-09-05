export const DATAFORSEO_KEYWORD_OVERVIEW_PROVIDER = "dataforseo" as const;
export const DATAFORSEO_KEYWORD_OVERVIEW_PROVIDER_VERSION = "v3" as const;
export const DATAFORSEO_KEYWORD_OVERVIEW_ENDPOINT = "/v3/dataforseo_labs/google/keyword_overview/live" as const;

type JsonObject = Record<string, unknown>;

export type DataForSeoKeywordOverviewRequest = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  operationRequestId: string;
};

export type DataForSeoKeywordOverviewMeasurement = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  measuredAt: string;
  provider: typeof DATAFORSEO_KEYWORD_OVERVIEW_PROVIDER;
  providerVersion: typeof DATAFORSEO_KEYWORD_OVERVIEW_PROVIDER_VERSION;
  endpoint: typeof DATAFORSEO_KEYWORD_OVERVIEW_ENDPOINT;
  providerRequestId: string | null;
  cost: number | null;
  keywordDifficulty: number | null;
  coreKeyword: string | null;
  detectedLanguage: string | null;
  isAnotherLanguage: boolean | null;
  externalIntent: string | null;
  externalForeignIntents: string[];
  avgBacklinks: number | null;
  avgReferringDomains: number | null;
  avgMainDomainRank: number | null;
  keywordInfoUpdatedAt: string | null;
  backlinksInfoUpdatedAt: string | null;
  searchIntentUpdatedAt: string | null;
};

export type DataForSeoKeywordOverviewErrorCode =
  | "dataforseo_configuration"
  | "dataforseo_timeout"
  | "dataforseo_http"
  | "dataforseo_invalid_response"
  | "dataforseo_task_failed"
  | "dataforseo_result_mismatch";

export class DataForSeoKeywordOverviewError extends Error {
  readonly code: DataForSeoKeywordOverviewErrorCode;
  readonly status: number;
  readonly providerRequestId: string | null;

  constructor(code: DataForSeoKeywordOverviewErrorCode, message: string, status = 502, providerRequestId: string | null = null) {
    super(message);
    this.name = "DataForSeoKeywordOverviewError";
    this.code = code;
    this.status = status;
    this.providerRequestId = providerRequestId;
  }
}

function asRecord(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function keywordDifficultyValue(value: unknown): number | null {
  const parsed = nonNegativeNumber(value);
  return parsed !== null && parsed <= 100 ? parsed : null;
}

function readInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeKeyword(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim()).slice(0, 8)
    : [];
}

export function buildDataForSeoKeywordOverviewRequest(input: DataForSeoKeywordOverviewRequest) {
  const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
  if (!keyword) throw new DataForSeoKeywordOverviewError("dataforseo_invalid_response", "A keyword da medição Keyword Overview é inválida.", 400);
  return {
    body: [{
      keywords: [keyword],
      location_code: input.locationCode,
      language_code: input.languageCode,
      include_serp_info: false,
      include_clickstream_data: false,
      tag: input.operationRequestId,
    }],
  };
}

function emptyMeasurement(input: DataForSeoKeywordOverviewRequest, providerRequestId: string | null, cost: number | null, measuredAt: string): DataForSeoKeywordOverviewMeasurement {
  return {
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode.toLowerCase(),
    measuredAt,
    provider: DATAFORSEO_KEYWORD_OVERVIEW_PROVIDER,
    providerVersion: DATAFORSEO_KEYWORD_OVERVIEW_PROVIDER_VERSION,
    endpoint: DATAFORSEO_KEYWORD_OVERVIEW_ENDPOINT,
    providerRequestId,
    cost,
    keywordDifficulty: null,
    coreKeyword: null,
    detectedLanguage: null,
    isAnotherLanguage: null,
    externalIntent: null,
    externalForeignIntents: [],
    avgBacklinks: null,
    avgReferringDomains: null,
    avgMainDomainRank: null,
    keywordInfoUpdatedAt: null,
    backlinksInfoUpdatedAt: null,
    searchIntentUpdatedAt: null,
  };
}

export function normalizeDataForSeoKeywordOverviewResponse(
  body: unknown,
  request: DataForSeoKeywordOverviewRequest,
  measuredAt = new Date().toISOString(),
): DataForSeoKeywordOverviewMeasurement {
  const root = asRecord(body);
  const tasks = root?.tasks;
  if (!Array.isArray(tasks) || tasks.length !== 1) throw new DataForSeoKeywordOverviewError("dataforseo_invalid_response", "A DataForSEO retornou uma resposta Keyword Overview sem uma task única.");
  const task = asRecord(tasks[0]);
  const providerRequestId = typeof task?.id === "string" ? task.id : null;
  if (!task) throw new DataForSeoKeywordOverviewError("dataforseo_invalid_response", "A task Keyword Overview retornada pela DataForSEO é inválida.", 502, providerRequestId);
  const taskStatus = readInteger(task.status_code);
  if (taskStatus !== 20000) throw new DataForSeoKeywordOverviewError("dataforseo_task_failed", "A task Keyword Overview da DataForSEO não foi concluída com sucesso.", 502, providerRequestId);
  const results = task.result;
  if (!Array.isArray(results) || results.length !== 1) throw new DataForSeoKeywordOverviewError("dataforseo_invalid_response", "A DataForSEO não retornou um resultado único para Keyword Overview.", 502, providerRequestId);
  const result = asRecord(results[0]);
  if (!result) throw new DataForSeoKeywordOverviewError("dataforseo_invalid_response", "O resultado Keyword Overview da DataForSEO é inválido.", 502, providerRequestId);
  const resultLocation = readInteger(result.location_code);
  const resultLanguage = text(result.language_code)?.toLowerCase() || "";
  if ((resultLocation !== null && resultLocation !== request.locationCode) || (resultLanguage && resultLanguage !== request.languageCode.toLowerCase())) {
    throw new DataForSeoKeywordOverviewError("dataforseo_result_mismatch", "O resultado Keyword Overview não corresponde à localidade ou idioma solicitados.", 502, providerRequestId);
  }
  const items = Array.isArray(result.items) ? result.items : [];
  const item = asRecord(items[0]);
  const cost = nonNegativeNumber(task.cost) ?? nonNegativeNumber(root?.cost);
  if (!item) return emptyMeasurement(request, providerRequestId, cost, measuredAt);
  const responseKeyword = text(item.keyword);
  const locationCode = readInteger(item.location_code);
  const languageCode = text(item.language_code)?.toLowerCase() || "";
  if (!responseKeyword || normalizeKeyword(responseKeyword) !== normalizeKeyword(request.keyword) || locationCode !== request.locationCode || languageCode !== request.languageCode.toLowerCase()) {
    throw new DataForSeoKeywordOverviewError("dataforseo_result_mismatch", "O resultado Keyword Overview não corresponde à keyword, localidade ou idioma solicitados.", 502, providerRequestId);
  }
  const properties = asRecord(item.keyword_properties);
  const backlinks = asRecord(item.avg_backlinks_info);
  const intent = asRecord(item.search_intent_info);
  return {
    ...emptyMeasurement(request, providerRequestId, cost, measuredAt),
    locationCode,
    languageCode,
    keywordDifficulty: keywordDifficultyValue(properties?.keyword_difficulty),
    coreKeyword: text(properties?.core_keyword),
    detectedLanguage: text(properties?.detected_language),
    isAnotherLanguage: typeof properties?.is_another_language === "boolean" ? properties.is_another_language : null,
    externalIntent: text(intent?.main_intent),
    externalForeignIntents: stringArray(intent?.foreign_intent),
    avgBacklinks: nonNegativeNumber(backlinks?.backlinks),
    avgReferringDomains: nonNegativeNumber(backlinks?.referring_domains),
    avgMainDomainRank: nonNegativeNumber(backlinks?.main_domain_rank),
    keywordInfoUpdatedAt: timestamp(asRecord(item.keyword_info)?.last_updated_time),
    backlinksInfoUpdatedAt: timestamp(backlinks?.last_updated_time),
    searchIntentUpdatedAt: timestamp(intent?.last_updated_time),
  };
}

export function readDataForSeoKeywordOverview(value: unknown): JsonObject | null {
  const record = asRecord(value);
  return record && (Object.prototype.hasOwnProperty.call(record, "keywordDifficulty") || Object.prototype.hasOwnProperty.call(record, "keyword_difficulty") || Object.prototype.hasOwnProperty.call(record, "provider") || Object.prototype.hasOwnProperty.call(record, "endpoint")) ? record : null;
}

export function readDataForSeoKeywordDifficulty(value: unknown): number | null {
  const record = asRecord(value);
  return keywordDifficultyValue(record?.keywordDifficulty ?? record?.keyword_difficulty);
}

export type DataForSeoKeywordDifficultyEvidence = {
  value: number | null;
  sortValue: number | null;
  source: "processor" | "imported" | "previous" | "none";
  state: "validated" | "imported" | "previous" | "pending";
  measurement: JsonObject | null;
};

function firstRecord(...values: unknown[]): JsonObject | null {
  for (const value of values) {
    const record = readDataForSeoKeywordOverview(value);
    if (record) return record;
  }
  return null;
}

export function isProcessorValidatedDataForSeoKeywordOverview(value: unknown): boolean {
  const record = readDataForSeoKeywordOverview(value);
  return Boolean(record && record.provider === DATAFORSEO_KEYWORD_OVERVIEW_PROVIDER && record.executor === "minerador_server" && typeof record.operationRequestId === "string" && record.operationRequestId.trim());
}

export function readDataForSeoKeywordDifficultyEvidence(semantic?: Record<string, unknown> | null): DataForSeoKeywordDifficultyEvidence {
  const source = semantic || {};
  const discovery = asRecord(source.discovery_import);
  const snapshot = asRecord(discovery?.sourceSnapshot) || asRecord(discovery?.snapshot) || asRecord(discovery?.sourceData);
  const importedMetrics = asRecord(snapshot?.importedMetrics) || asRecord(discovery?.importedMetrics);
  const processor = firstRecord(source.dataforseo_keyword_overview, source.dataforseo_keyword_overview_measurement, source.keyword_overview_measurement);
  const imported = firstRecord(
    discovery?.dataforseo_keyword_overview,
    discovery?.dataforseo_keyword_overview_measurement,
    discovery?.keywordOverview,
    discovery?.lastMeasurement,
    discovery?.metrics,
    snapshot?.dataforseo_keyword_overview,
    snapshot?.dataforseo_keyword_overview_measurement,
    snapshot?.metrics,
    importedMetrics?.dataforseo_keyword_overview,
    importedMetrics?.keywordOverview,
  ) || (importedMetrics && (Object.prototype.hasOwnProperty.call(importedMetrics, "keywordDifficulty") || Object.prototype.hasOwnProperty.call(importedMetrics, "keyword_difficulty")) ? importedMetrics : null);
  if (processor && isProcessorValidatedDataForSeoKeywordOverview(processor)) {
    const value = readDataForSeoKeywordDifficulty(processor);
    return { value, sortValue: value, source: "processor", state: "validated", measurement: processor };
  }
  const importedValue = readDataForSeoKeywordDifficulty(imported);
  if (imported && importedValue !== null) return { value: importedValue, sortValue: importedValue, source: "imported", state: "imported", measurement: imported };
  if (processor) {
    const value = readDataForSeoKeywordDifficulty(processor);
    return { value, sortValue: value, source: "previous", state: "previous", measurement: processor };
  }
  return { value: null, sortValue: null, source: "none", state: "pending", measurement: imported || null };
}

export function dataForSeoKeywordDifficultyStateLabel(state: DataForSeoKeywordDifficultyEvidence["state"], value: number | null): string {
  if (state === "validated") return value === null ? "Validado · sem KD" : "Validado no Processador";
  if (state === "imported") return "Dado anterior · aguarda revalidação";
  if (state === "previous") return "Medição anterior";
  return "Pendente";
}
