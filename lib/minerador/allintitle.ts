import { readKgrApplicability, type KgrApplicability } from "./kgr-applicability.ts";

export const ALLINTITLE_DEFAULT_BATCH_SIZE = 5;
export const ALLINTITLE_MAX_BATCH_SIZE = 10;
export const ALLINTITLE_INTERVAL_MS = 3500;
export const ALLINTITLE_ITEM_TIMEOUT_MS = 45000;
export const ALLINTITLE_TOTAL_TIMEOUT_MS = 70000;

export type AllintitleStatus = "success" | "zero_results" | "unavailable" | "captcha" | "blocked" | "error" | "timeout" | "cancelled" | "no_change";

export type AllintitleStage = "checking_extension" | "sending_request" | "opening_google_tab" | "loading_query" | "injecting_reader" | "reading_page" | "returning_result" | "validating_result" | "persisting" | "completed" | "failed" | "timeout" | "paused_captcha" | "cancelled";

export const allintitleStageLabel: Record<AllintitleStage, string> = {
  checking_extension: "Verificando extensão",
  sending_request: "Enviando solicitação",
  opening_google_tab: "Abrindo aba do Google",
  loading_query: "Carregando consulta",
  injecting_reader: "Preparando leitor da página",
  reading_page: "Lendo a página",
  returning_result: "Retornando resultado",
  validating_result: "Validando resultado",
  persisting: "Salvando resultado",
  completed: "Concluído",
  failed: "Falhou",
  timeout: "Tempo limite excedido",
  paused_captcha: "Pausado por CAPTCHA",
  cancelled: "Cancelado",
};

export type AllintitleRequestItem = {
  keywordId: string;
  keyword: string;
  currentResultsAllintitle: number | null;
};

export type AllintitleMeasurementRequest = {
  type: "minerador.allintitle.measure.v1";
  batchId: string;
  requestId: string;
  userId?: string;
  brandId: string;
  requestedAt: string;
  options: { intervalMs: number; maxItems: number };
  items: AllintitleRequestItem[];
};

export type AllintitleMeasurementResult = {
  type: "minerador.allintitle.result.v1";
  batchId: string;
  requestId: string;
  keywordId: string;
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
  errorCode?: string;
  message?: string;
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

export function classifyAllintitleText(text: string, expectedQuery: string): Pick<AllintitleMeasurementResult, "status" | "resultsAllintitle" | "errorCode" | "message"> {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/recaptcha|unusual traffic|not a robot|detected unusual traffic/i.test(normalized)) return { status: "captcha", errorCode: "captcha_detected", message: "CAPTCHA ou desafio humano detectado." };
  if (/before you continue|consent\.google|consentimento|consent to/i.test(normalized)) return { status: "blocked", errorCode: "consent_required", message: "Consentimento do Google é necessário." };
  if (/access denied|temporarily blocked|automated queries|sorry\/?index/i.test(normalized)) return { status: "blocked", errorCode: "google_blocked", message: "O Google bloqueou ou recusou a consulta." };
  const expected = normalizeAllintitleKeyword(expectedQuery);
  const foundQuery = normalizeAllintitleKeyword(normalized.match(/(?:allintitle\s*:\s*["“]?[^"”]+["”]?)/i)?.[0]);
  if (foundQuery && expected && foundQuery !== expected) return { status: "unavailable", errorCode: "query_mismatch", message: "A página não confirmou a consulta solicitada." };
  if (/no results found|nenhum resultado encontrado|não foram encontrados resultados/i.test(normalized)) return { status: "zero_results", resultsAllintitle: 0 };
  const match = normalized.match(/(?:about|aproximadamente)?\s*([\d.,\s]+)\s+(?:results?|resultados?)/i);
  if (!match) return { status: "unavailable", errorCode: "count_unavailable", message: "A página não apresentou contagem confiável." };
  const value = Number(match[1].replace(/[^\d]/g, ""));
  if (!Number.isSafeInteger(value) || value < 0) return { status: "unavailable", errorCode: "count_invalid", message: "A contagem encontrada não é numérica válida." };
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
  const patch: { results_allintitle: number; analise_semantica: AllintitleSemantic; kgr_score?: number } = {
    results_allintitle: result.resultsAllintitle!,
    analise_semantica: semantic,
  };
  if (applicability !== "not_applicable" && typeof existing.volume_search === "number" && Number.isFinite(existing.volume_search) && existing.volume_search > 0) {
    patch.kgr_score = Number((result.resultsAllintitle! / existing.volume_search).toFixed(4));
  }
  return patch;
}

export function currentKgrApplicability(semantic: Record<string, unknown> | null | undefined): KgrApplicability {
  return readKgrApplicability(semantic || null);
}
