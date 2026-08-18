import { buildAllintitleQuery } from "./allintitle.ts";

export const DATAFORSEO_SERP_PROVIDER = "dataforseo" as const;
export const DATAFORSEO_SERP_PROVIDER_VERSION = "v3" as const;
export const DATAFORSEO_SERP_ENDPOINT = "/v3/serp/google/organic/live/regular" as const;
export const DATAFORSEO_DEFAULT_LOCATION_CODE = 2076;
export const DATAFORSEO_DEFAULT_LANGUAGE_CODE = "pt";
export const DATAFORSEO_DEFAULT_DEPTH = 10;

export type DataForSeoSerpConfig = {
  login: string;
  password: string;
  baseUrl: string;
  timeoutMs: number;
  locationCode: number;
  languageCode: string;
};

export type DataForSeoSerpCredentials = Pick<DataForSeoSerpConfig, "login" | "password">;

export type DataForSeoAllintitleRequest = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  operationRequestId: string;
  depth?: number;
};

export type DataForSeoAllintitleMeasurement = {
  keyword: string;
  query: string;
  resultsAllintitle: number;
  locationCode: number;
  languageCode: string;
  measuredAt: string;
  provider: typeof DATAFORSEO_SERP_PROVIDER;
  providerVersion: typeof DATAFORSEO_SERP_PROVIDER_VERSION;
  endpoint: typeof DATAFORSEO_SERP_ENDPOINT;
  providerRequestId: string | null;
  cost: number | null;
  checkUrl: string | null;
};

export type DataForSeoErrorCode =
  | "dataforseo_configuration"
  | "dataforseo_timeout"
  | "dataforseo_http"
  | "dataforseo_invalid_response"
  | "dataforseo_task_failed"
  | "dataforseo_result_mismatch"
  | "dataforseo_total_missing";

export class DataForSeoSerpError extends Error {
  readonly code: DataForSeoErrorCode;
  readonly status: number;
  readonly providerRequestId: string | null;

  constructor(code: DataForSeoErrorCode, message: string, status = 502, providerRequestId: string | null = null) {
    super(message);
    this.name = "DataForSeoSerpError";
    this.code = code;
    this.status = status;
    this.providerRequestId = providerRequestId;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readPositiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function readFiniteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeQuery(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseMeasuredAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function buildDataForSeoSerpConfig(credentials: DataForSeoSerpCredentials, env: NodeJS.ProcessEnv = process.env): DataForSeoSerpConfig {
  const login = credentials.login.trim();
  const password = credentials.password.trim();
  if (!login || !password) throw new DataForSeoSerpError("dataforseo_configuration", "A integração DataForSEO não está configurada para esta operação.", 503);

  const rawBaseUrl = env.DATAFORSEO_BASE_URL?.trim() || "https://api.dataforseo.com";
  let baseUrl: URL;
  try { baseUrl = new URL(rawBaseUrl); } catch { throw new DataForSeoSerpError("dataforseo_configuration", "A URL-base da DataForSEO é inválida.", 503); }
  const locationCode = readPositiveInteger(env.DATAFORSEO_LOCATION_CODE || String(DATAFORSEO_DEFAULT_LOCATION_CODE));
  if (locationCode === null || locationCode < 1) throw new DataForSeoSerpError("dataforseo_configuration", "O código de localidade da DataForSEO é inválido.", 503);
  const languageCode = env.DATAFORSEO_LANGUAGE_CODE?.trim().toLowerCase() || DATAFORSEO_DEFAULT_LANGUAGE_CODE;
  if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(languageCode)) throw new DataForSeoSerpError("dataforseo_configuration", "O código de idioma da DataForSEO é inválido.", 503);
  const parsedTimeout = readPositiveInteger(env.DATAFORSEO_TIMEOUT_MS || "30000");
  const timeoutMs = Math.min(120_000, Math.max(1_000, parsedTimeout ?? 30_000));
  return { login, password, baseUrl: baseUrl.toString().replace(/\/$/, ""), timeoutMs, locationCode, languageCode };
}

/** Transitional reader for consumers that have not moved to Connections yet. */
export function readDataForSeoSerpConfig(env: NodeJS.ProcessEnv = process.env): DataForSeoSerpConfig {
  return buildDataForSeoSerpConfig({ login: env.DATAFORSEO_LOGIN?.trim() || "", password: env.DATAFORSEO_PASSWORD?.trim() || "" }, env);
}

export function buildDataForSeoAllintitleRequest(input: DataForSeoAllintitleRequest) {
  const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
  if (!keyword) throw new DataForSeoSerpError("dataforseo_invalid_response", "A keyword da medição DataForSEO é inválida.", 400);
  const query = buildAllintitleQuery(keyword);
  return {
    query,
    body: [{
      keyword: query,
      location_code: input.locationCode,
      language_code: input.languageCode,
      device: "desktop" as const,
      depth: input.depth ?? DATAFORSEO_DEFAULT_DEPTH,
      tag: input.operationRequestId,
    }],
  };
}

export function normalizeDataForSeoAllintitleResponse(
  body: unknown,
  request: DataForSeoAllintitleRequest,
): DataForSeoAllintitleMeasurement {
  const root = asRecord(body);
  const tasks = root?.tasks;
  if (!Array.isArray(tasks) || tasks.length !== 1) throw new DataForSeoSerpError("dataforseo_invalid_response", "A DataForSEO retornou uma resposta sem uma task única.");
  const task = asRecord(tasks[0]);
  const providerRequestId = typeof task?.id === "string" ? task.id : null;
  if (!task) throw new DataForSeoSerpError("dataforseo_invalid_response", "A task retornada pela DataForSEO é inválida.", 502, providerRequestId);
  const taskStatus = readPositiveInteger(task.status_code);
  if (taskStatus !== 20000) throw new DataForSeoSerpError("dataforseo_task_failed", "A task DataForSEO não foi concluída com sucesso.", 502, providerRequestId);
  const results = task.result;
  if (!Array.isArray(results) || results.length !== 1) throw new DataForSeoSerpError("dataforseo_invalid_response", "A DataForSEO não retornou um resultado único para a task.", 502, providerRequestId);
  const result = asRecord(results[0]);
  if (!result) throw new DataForSeoSerpError("dataforseo_invalid_response", "O resultado da DataForSEO é inválido.", 502, providerRequestId);
  const query = buildAllintitleQuery(request.keyword);
  const responseKeyword = typeof result.keyword === "string" ? result.keyword : "";
  const locationCode = readPositiveInteger(result.location_code);
  const languageCode = typeof result.language_code === "string" ? result.language_code.trim().toLowerCase() : "";
  const measuredAt = parseMeasuredAt(result.datetime);
  if (!responseKeyword || normalizeQuery(responseKeyword) !== normalizeQuery(query) || locationCode !== request.locationCode || languageCode !== request.languageCode.toLowerCase() || !measuredAt) {
    throw new DataForSeoSerpError("dataforseo_result_mismatch", "O resultado da DataForSEO não corresponde à consulta, localidade ou idioma solicitados.", 502, providerRequestId);
  }
  const resultsCount = readPositiveInteger(result.se_results_count);
  if (resultsCount === null) throw new DataForSeoSerpError("dataforseo_total_missing", "A DataForSEO não retornou se_results_count; nenhum total foi inferido.", 502, providerRequestId);
  return {
    keyword: request.keyword,
    query,
    resultsAllintitle: resultsCount,
    locationCode,
    languageCode,
    measuredAt,
    provider: DATAFORSEO_SERP_PROVIDER,
    providerVersion: DATAFORSEO_SERP_PROVIDER_VERSION,
    endpoint: DATAFORSEO_SERP_ENDPOINT,
    providerRequestId,
    cost: readFiniteNumber(task.cost) ?? readFiniteNumber(root?.cost),
    checkUrl: typeof result.check_url === "string" && result.check_url.trim() ? result.check_url : null,
  };
}

export async function measureDataForSeoAllintitle(
  request: DataForSeoAllintitleRequest,
  options: { config?: DataForSeoSerpConfig; fetchImpl?: typeof fetch; onRequestStarted?: () => void } = {},
): Promise<DataForSeoAllintitleMeasurement> {
  const config = options.config ?? readDataForSeoSerpConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const built = buildDataForSeoAllintitleRequest(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    const credentials = Buffer.from(`${config.login}:${config.password}`, "utf8").toString("base64");
    options.onRequestStarted?.();
    response = await fetchImpl(`${config.baseUrl}${DATAFORSEO_SERP_ENDPOINT}`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new DataForSeoSerpError("dataforseo_timeout", "A DataForSEO não respondeu dentro do limite configurado.", 504);
    throw new DataForSeoSerpError("dataforseo_http", "Não foi possível conectar à DataForSEO.", 502);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new DataForSeoSerpError("dataforseo_http", `A DataForSEO retornou HTTP ${response.status}.`, response.status >= 500 ? 502 : response.status);
  let body: unknown;
  try { body = await response.json(); } catch { throw new DataForSeoSerpError("dataforseo_invalid_response", "A resposta da DataForSEO não é um JSON válido."); }
  return normalizeDataForSeoAllintitleResponse(body, request);
}
