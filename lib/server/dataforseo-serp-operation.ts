import { DATAFORSEO_SERP_ADVANCED_ENDPOINT, DATAFORSEO_SERP_ENDPOINT, DataForSeoSerpError, type DataForSeoSerpConfig } from "../minerador/dataforseo-serp-core.ts";
import type { SerpResearchSnapshot, SerpSearchInput } from "../radar/serp/contracts";
import { normalizeDataForSeoSerpResponse } from "./dataforseo-serp-normalizer.ts";

export type DataForSeoSerpOperationInput = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: "desktop" | "mobile";
  resultLimit: number;
  operationRequestId: string;
  /** `regular` continua o padrão; `advanced` é opt-in por operação. */
  payloadDepth?: "regular" | "advanced";
};

export type DataForSeoSerpProviderDiagnostic = {
  httpStatus: number | null;
  rootStatusCode: number | null;
  rootStatusMessage: string | null;
  taskStatusCode: number | null;
  taskStatusMessage: string | null;
  taskCount: number;
  resultCount: number;
  itemsCount: number;
  providerRequestId: string | null;
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

/** Sanitized response shape only: never forwards raw provider payload or credentials. */
export function inspectDataForSeoSerpResponse(body: unknown, httpStatus: number | null, providerRequestId: string | null = null): DataForSeoSerpProviderDiagnostic {
  const root = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const task = tasks[0] && typeof tasks[0] === "object" && !Array.isArray(tasks[0]) ? tasks[0] as Record<string, unknown> : null;
  const results = Array.isArray(task?.result) ? task.result : [];
  const items = results.reduce<number>((total, result) => total + (result && typeof result === "object" && !Array.isArray(result) && Array.isArray((result as Record<string, unknown>).items)
    ? ((result as Record<string, unknown>).items as unknown[]).length
    : 0), 0);
  return {
    httpStatus,
    rootStatusCode: numberOrNull(root?.status_code),
    rootStatusMessage: textOrNull(root?.status_message),
    taskStatusCode: numberOrNull(task?.status_code),
    taskStatusMessage: textOrNull(task?.status_message),
    taskCount: tasks.length,
    resultCount: results.length,
    itemsCount: items,
    providerRequestId: textOrNull(task?.id) || providerRequestId,
  };
}

export function buildDataForSeoSerpOperationRequest(input: DataForSeoSerpOperationInput) {
  const keyword = input.keyword.trim();
  if (!keyword) throw new DataForSeoSerpError("dataforseo_invalid_response", "A keyword da consulta SERP é inválida.", 400);
  if (!Number.isSafeInteger(input.locationCode) || input.locationCode < 1) throw new DataForSeoSerpError("dataforseo_invalid_response", "A localidade da consulta SERP é inválida.", 400);
  if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(input.languageCode.trim())) throw new DataForSeoSerpError("dataforseo_invalid_response", "O idioma da consulta SERP é inválido.", 400);
  if (!Number.isSafeInteger(input.resultLimit) || input.resultLimit < 1 || input.resultLimit > 100) throw new DataForSeoSerpError("dataforseo_invalid_response", "O limite da consulta SERP é inválido.", 400);
  if (!input.operationRequestId.trim()) throw new DataForSeoSerpError("dataforseo_invalid_response", "A operação SERP não possui identificador válido.", 400);
  return {
    query: keyword,
    body: [{
      keyword,
      location_code: input.locationCode,
      language_code: input.languageCode.trim().toLowerCase(),
      device: input.device,
      depth: input.resultLimit,
      tag: input.operationRequestId.trim(),
    }],
  };
}

export async function executeDataForSeoSerpOperation(
  input: DataForSeoSerpOperationInput,
  options: { config: DataForSeoSerpConfig; fetchImpl?: typeof fetch; onRequestBuilt?: () => void; onRequestStarted?: () => void; onHttpResponse?: (status: number) => void } ,
): Promise<{ body: unknown; providerRequestId: string | null; diagnostic: DataForSeoSerpProviderDiagnostic }> {
  const config = options.config;
  const fetchImpl = options.fetchImpl ?? fetch;
  const built = buildDataForSeoSerpOperationRequest(input);
  options.onRequestBuilt?.();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    const credentials = Buffer.from(`${config.login}:${config.password}`, "utf8").toString("base64");
    options.onRequestStarted?.();
    const endpoint = input.payloadDepth === "advanced" ? DATAFORSEO_SERP_ADVANCED_ENDPOINT : DATAFORSEO_SERP_ENDPOINT;
    response = await fetchImpl(`${config.baseUrl}${endpoint}`, {
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
  options.onHttpResponse?.(response.status);
  if (!response.ok) throw new DataForSeoSerpError("dataforseo_http", `A DataForSEO retornou HTTP ${response.status}.`, response.status >= 500 ? 502 : response.status);
  let body: unknown;
  try { body = await response.json(); } catch { throw new DataForSeoSerpError("dataforseo_invalid_response", "A resposta da DataForSEO não é um JSON válido."); }
  const firstTask = body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as { tasks?: unknown }).tasks)
    ? (body as { tasks: unknown[] }).tasks[0]
    : null;
  const providerRequestId = firstTask && typeof firstTask === "object" && !Array.isArray(firstTask) && typeof (firstTask as { id?: unknown }).id === "string"
    ? (firstTask as { id: string }).id
    : null;
  return { body, providerRequestId, diagnostic: inspectDataForSeoSerpResponse(body, response.status, providerRequestId) };
}

export async function collectDataForSeoSerpSnapshot(
  input: SerpSearchInput,
  options: { config: DataForSeoSerpConfig; operationRequestId: string; fetchImpl?: typeof fetch; onRequestBuilt?: () => void; onRequestStarted?: () => void; onHttpResponse?: (status: number) => void; onProviderResponse?: (diagnostic: DataForSeoSerpProviderDiagnostic) => void; onNormalizationSucceeded?: () => void },
): Promise<SerpResearchSnapshot> {
  const result = await executeDataForSeoSerpOperation({
    keyword: input.keyword,
    locationCode: options.config.locationCode,
    languageCode: options.config.languageCode,
    device: input.device,
    resultLimit: input.resultLimit,
    operationRequestId: options.operationRequestId,
  }, options);
  options.onProviderResponse?.(result.diagnostic);
  const snapshot = normalizeDataForSeoSerpResponse(result.body, input, options.config, new Date().toISOString(), result.providerRequestId);
  options.onNormalizationSucceeded?.();
  return snapshot;
}
