import { readKgrApplicability, type KgrApplicability } from "./kgr-applicability.ts";

export const ALLINTITLE_DEFAULT_BATCH_SIZE = 5;
export const ALLINTITLE_MAX_BATCH_SIZE = 10;
export const ALLINTITLE_INTERVAL_MS = 3500;
export const ALLINTITLE_ITEM_TIMEOUT_MS = 45000;
export const ALLINTITLE_TOTAL_TIMEOUT_MS = 70000;

export type AllintitleStatus = "success" | "zero_results" | "unavailable" | "captcha" | "blocked" | "error" | "timeout" | "cancelled" | "no_change";

export type AllintitleStage = "checking_extension" | "sending_request" | "opening_google_tab" | "loading_query" | "injecting_reader" | "reading_page" | "google_result_extraction" | "returning_result" | "validating_result" | "persisting" | "completed" | "failed" | "timeout" | "paused_captcha" | "cancelled";

export const allintitleStageLabel: Record<AllintitleStage, string> = {
  checking_extension: "Verificando extensão",
  sending_request: "Enviando solicitação",
  opening_google_tab: "Abrindo aba do Google",
  loading_query: "Carregando consulta",
  injecting_reader: "Preparando leitor da página",
  reading_page: "Lendo a página",
  google_result_extraction: "Extraindo contador do Google",
  returning_result: "Retornando resultado",
  validating_result: "Validando resultado",
  persisting: "Salvando resultado",
  completed: "Concluído",
  failed: "Falhou",
  timeout: "Tempo limite excedido",
  paused_captcha: "Pausado por CAPTCHA",
  cancelled: "Cancelado",
};

export type AllintitleTarget =
  | { targetKind?: "keyword"; keywordId: string; candidateId?: never }
  | { targetKind: "discovery_candidate"; candidateId: string; keywordId?: never };

export type AllintitleRequestItem = AllintitleTarget & {
  keyword: string;
  currentResultsAllintitle: number | null;
};

export function partitionAllintitleItems<T>(items: readonly T[], batchSize = ALLINTITLE_MAX_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("O tamanho do sublote allintitle precisa ser positivo.");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) batches.push([...items.slice(index, index + batchSize)]);
  return batches;
}

const ALLINTITLE_KEYWORD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AllintitleBatchValidationError = {
  code: "invalid_keyword_id" | "keyword_brand_mismatch" | "keyword_not_persisted" | "invalid_keyword_text";
  stage: "batch_validation" | "authorization";
  message: string;
  diagnostic: Record<string, unknown>;
};

export function validateAllintitleBatchItems(
  items: Array<Pick<AllintitleRequestItem, "keywordId" | "keyword"> & { brandId?: string | null }>,
  activeBrandId: string,
): AllintitleBatchValidationError | null {
  for (const item of items) {
    const keywordId = typeof item?.keywordId === "string" ? item.keywordId.trim() : "";
    if (!ALLINTITLE_KEYWORD_ID_PATTERN.test(keywordId)) {
      return {
        code: "invalid_keyword_id",
        stage: "batch_validation",
        message: "Uma das keywords selecionadas não possui um ID válido.",
        diagnostic: { keywordId: keywordId || null },
      };
    }
    if (typeof item?.keyword !== "string" || !item.keyword.trim()) {
      return {
        code: "invalid_keyword_text",
        stage: "batch_validation",
        message: "Uma das keywords selecionadas não possui texto válido.",
        diagnostic: { keywordId },
      };
    }
    if (!item.brandId) {
      return {
        code: "keyword_not_persisted",
        stage: "batch_validation",
        message: "Uma das keywords ainda não foi persistida no Minerador.",
        diagnostic: { keywordId, reason: "brand_id_missing" },
      };
    }
    if (item.brandId !== activeBrandId) {
      return {
        code: "keyword_brand_mismatch",
        stage: "authorization",
        message: "Uma das keywords selecionadas não pertence à marca ativa.",
        diagnostic: { keywordId, expectedBrandId: activeBrandId, actualBrandId: item.brandId },
      };
    }
  }
  return null;
}

export type AllintitleMeasurementRequest = {
  type: "minerador.allintitle.measure.v1" | "minerador.allintitle.measure.v2";
  batchId: string;
  requestId: string;
  operationRequestId?: string;
  actorUserId?: string | null;
  brandId: string;
  brandRef?: string | null;
  origin?: string;
  pathname?: string;
  protocolVersion?: number;
  requestedAt: string;
  options: { intervalMs: number; maxItems: number };
  items: AllintitleRequestItem[];
};

export type AllintitleMeasurementResult = {
  type: "minerador.allintitle.result.v1";
  batchId: string;
  requestId: string;
  keywordId: string;
  targetKind?: "keyword" | "discovery_candidate";
  candidateId?: string;
  brandId: string;
  keyword: string;
  query: string;
  resultsAllintitle?: number;
  status: AllintitleStatus;
  source: "google_search_extension";
  measuredAt: string;
  stage?: AllintitleStage;
  protocolVersion?: number;
  diagnosticUrl?: string;
  diagnostic?: Record<string, unknown>;
  persistenceOutcome?: "persisted" | "preserved" | "rejected" | "failed";
  errorCode?: string;
  message?: string;
  operationBatchId?: string;
  operationRequestId?: string;
  operationIndex?: number;
  completedKeywords?: number;
  totalKeywords?: number;
  batchIndex?: number;
  batchItemIndex?: number;
};

export type AllintitleSemantic = Record<string, unknown> & {
  allintitle_measurement?: Record<string, unknown>;
  allintitle_measurement_history?: Array<Record<string, unknown>>;
};

export function normalizeAllintitleKeyword(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

export function buildAllintitleQuery(keyword: string): string {
  return `allintitle:"${keyword.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`;
}

export function isPersistableAllintitleResult(result: AllintitleMeasurementResult): boolean {
  return (result.status === "success" && Number.isInteger(result.resultsAllintitle) && (result.resultsAllintitle ?? -1) > 0)
    || (result.status === "zero_results" && result.resultsAllintitle === 0);
}

const ALLINTITLE_COUNT_PATTERN = /\b(?:(?:about|approximately|aproximadamente|cerca de)\s*)?([0-9]{1,3}(?:(?:[.,\s])[0-9]{3})*|[0-9]+)\s+(?:resultado|resultados|result|results)\b/i;
const ALLINTITLE_COUNT_UNAVAILABLE_MESSAGE = "A consulta foi conclu\u00edda, mas o contador de resultados n\u00e3o p\u00f4de ser identificado.";

export function parseAllintitleCountText(text: string): number | null {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const match = normalized.match(ALLINTITLE_COUNT_PATTERN);
  if (!match) return null;
  const value = Number(match[1].replace(/[.,\s]/g, ""));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function classifyAllintitleText(text: string, expectedQuery: string): Pick<AllintitleMeasurementResult, "status" | "resultsAllintitle" | "errorCode" | "message" | "stage"> {
  const normalized = text.replace(/\s+/g, " ").trim();
  const normalizedForMatching = normalizeAllintitleKeyword(normalized);
  if (/recaptcha|unusual traffic|not a robot|detected unusual traffic/i.test(normalized)) return { status: "captcha", errorCode: "captcha_detected", message: "CAPTCHA ou desafio humano detectado." };
  if (/before you continue|consent\.google|consentimento|consent to/i.test(normalized)) return { status: "blocked", errorCode: "consent_required", message: "Consentimento do Google é necessário." };
  if (/access denied|temporarily blocked|automated queries|sorry\/?index/i.test(normalized)) return { status: "blocked", errorCode: "google_blocked", message: "O Google bloqueou ou recusou a consulta." };
  const expected = normalizeAllintitleKeyword(expectedQuery);
  const foundQuery = normalizeAllintitleKeyword(normalized.match(/(?:allintitle\s*:\s*["“]?[^"”]+["”]?)/i)?.[0]);
  if (foundQuery && expected && foundQuery !== expected) return { status: "unavailable", errorCode: "query_mismatch", message: "A página não confirmou a consulta solicitada." };
  if (/no results(?: found)?|nenhum resultado(?: encontrado)?|nao foram encontrados resultados|sem resultados/i.test(normalizedForMatching)) return { status: "zero_results", resultsAllintitle: 0 };
  const value = parseAllintitleCountText(normalized);
  if (value === null) return { status: "unavailable", errorCode: "result_count_not_found", message: ALLINTITLE_COUNT_UNAVAILABLE_MESSAGE, stage: "google_result_extraction" };
  if (value === 0) return { status: "zero_results", resultsAllintitle: 0 };
  return { status: "success", resultsAllintitle: value };
}

export function buildAllintitleMetricPatch(existing: {
  results_allintitle: number | null;
  volume_search: number | null;
  kgr_score: number | null;
  analise_semantica?: AllintitleSemantic | null;
}, result: AllintitleMeasurementResult, applicability: KgrApplicability) {
  if (!isPersistableAllintitleResult(result)) return {};
  const previous = existing.analise_semantica?.allintitle_measurement;
  const measurement = {
    source: result.source,
    measuredAt: result.measuredAt,
    batchId: result.batchId,
    query: result.query,
    status: result.status,
    previousResultsAllintitle: existing.results_allintitle,
    resultsAllintitle: result.resultsAllintitle,
  };
  const history = Array.isArray(existing.analise_semantica?.allintitle_measurement_history)
    ? existing.analise_semantica!.allintitle_measurement_history!
    : [];
  const semantic: AllintitleSemantic = {
    ...(existing.analise_semantica || {}),
    allintitle_measurement: measurement,
    allintitle_measurement_history: previous && previous.resultsAllintitle !== result.resultsAllintitle
      ? [...history, previous].slice(-10)
      : history,
  };
  const patch: { results_allintitle: number; analise_semantica: AllintitleSemantic; kgr_score?: number | null } = {
    results_allintitle: result.resultsAllintitle!,
    analise_semantica: semantic,
  };
  if (applicability !== "not_applicable" && typeof existing.volume_search === "number" && Number.isFinite(existing.volume_search)) {
    patch.kgr_score = existing.volume_search > 0 ? Number((result.resultsAllintitle! / existing.volume_search).toFixed(4)) : null;
  }
  return patch;
}

export function currentKgrApplicability(semantic: Record<string, unknown> | null | undefined): KgrApplicability {
  return readKgrApplicability(semantic || null);
}
