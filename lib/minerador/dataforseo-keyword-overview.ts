import "server-only";
import {
  DATAFORSEO_KEYWORD_OVERVIEW_ENDPOINT,
  buildDataForSeoKeywordOverviewRequest,
  DataForSeoKeywordOverviewError,
  normalizeDataForSeoKeywordOverviewResponse,
  type DataForSeoKeywordOverviewMeasurement,
  type DataForSeoKeywordOverviewRequest,
} from "./dataforseo-keyword-overview-core.ts";
import type { DataForSeoSerpConfig } from "./dataforseo-serp-core.ts";

export * from "./dataforseo-keyword-overview-core.ts";

export async function measureDataForSeoKeywordOverview(
  request: DataForSeoKeywordOverviewRequest,
  options: { config: DataForSeoSerpConfig; fetchImpl?: typeof fetch; onRequestStarted?: () => void },
): Promise<DataForSeoKeywordOverviewMeasurement> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const built = buildDataForSeoKeywordOverviewRequest(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.config.timeoutMs);
  let response: Response;
  try {
    const credentials = Buffer.from(`${options.config.login}:${options.config.password}`, "utf8").toString("base64");
    options.onRequestStarted?.();
    response = await fetchImpl(`${options.config.baseUrl}${DATAFORSEO_KEYWORD_OVERVIEW_ENDPOINT}`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new DataForSeoKeywordOverviewError("dataforseo_timeout", "A DataForSEO não respondeu dentro do limite configurado.", 504);
    throw new DataForSeoKeywordOverviewError("dataforseo_http", "Não foi possível conectar à DataForSEO.", 502);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new DataForSeoKeywordOverviewError("dataforseo_http", `A DataForSEO retornou HTTP ${response.status}.`, response.status >= 500 ? 502 : response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DataForSeoKeywordOverviewError("dataforseo_invalid_response", "A resposta Keyword Overview da DataForSEO não é um JSON válido.");
  }
  return normalizeDataForSeoKeywordOverviewResponse(body, request);
}
