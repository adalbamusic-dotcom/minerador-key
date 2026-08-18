import { createGoogleAdsRestClient } from "@/lib/google/ads/client";
import { GoogleAdsError } from "@/lib/google/ads/errors";
import { getGoogleAdsPlatformConfig, GoogleAdsPlatformConfigError } from "@/lib/google/ads/config";
import {
  DATAFORSEO_DEFAULT_DEPTH,
  DATAFORSEO_DEFAULT_LANGUAGE_CODE,
  DATAFORSEO_DEFAULT_LOCATION_CODE,
  measureDataForSeoAllintitle,
  type DataForSeoSerpConfig,
} from "@/lib/minerador/dataforseo-serp-core";

export type PlatformHealthProviderKey = "google_ads" | "dataforseo" | "openrouter";

export type PlatformHealthProbeResult = {
  providerKey: PlatformHealthProviderKey;
  providerRequestRef: string | null;
  costAmount: number | null;
  details: Record<string, string>;
  currentModel?: string | null;
  currentModelAvailable?: boolean | null;
};

export type PlatformHealthDiagnostic = Record<string, string | null>;

export class PlatformHealthCheckError extends Error {
  public readonly status: 409 | 502 | 503;
  public readonly code: string;
  public readonly providerRequestRef: string | null;
  public readonly diagnostics: PlatformHealthDiagnostic;

  constructor(status: 409 | 502 | 503, code: string, message: string, providerRequestRef: string | null = null, diagnostics: PlatformHealthDiagnostic = {}) {
    super(message);
    this.name = "PlatformHealthCheckError";
    this.status = status;
    this.code = code;
    this.providerRequestRef = providerRequestRef;
    this.diagnostics = diagnostics;
  }
}

const OPENROUTER_HEALTH_MODEL = "deepseek/deepseek-v4-flash-0731";
const DATAFORSEO_HEALTH_KEYWORD = "minerador key health check";

function parseSecretObject(payload: string, fields: readonly string[], providerKey: PlatformHealthProviderKey) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new PlatformHealthCheckError(409, "PLATFORM_HEALTH_SECRET_INVALID", `A credencial salva de ${providerKey} possui formato inválido.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlatformHealthCheckError(409, "PLATFORM_HEALTH_SECRET_INVALID", `A credencial salva de ${providerKey} possui formato inválido.`);
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((field) => !fields.includes(field)) || fields.some((field) => typeof record[field] !== "string" || !record[field].trim())) {
    throw new PlatformHealthCheckError(409, "PLATFORM_HEALTH_SECRET_INVALID", `A credencial salva de ${providerKey} está incompleta.`);
  }
  return record as Record<string, string>;
}

function parseDataForSeoSecret(payload: string) {
  const secret = parseSecretObject(payload, ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"], "dataforseo");
  const config: DataForSeoSerpConfig = {
    login: secret.DATAFORSEO_LOGIN,
    password: secret.DATAFORSEO_PASSWORD,
    baseUrl: "https://api.dataforseo.com",
    timeoutMs: 30_000,
    locationCode: DATAFORSEO_DEFAULT_LOCATION_CODE,
    languageCode: DATAFORSEO_DEFAULT_LANGUAGE_CODE,
  };
  return config;
}

function parseOpenRouterSecret(payload: string) {
  const secret = parseSecretObject(payload, ["OPENROUTER_API_KEY"], "openrouter");
  return secret.OPENROUTER_API_KEY;
}

async function probeGoogleAds(fetchImpl: typeof fetch): Promise<PlatformHealthProbeResult> {
  let config: ReturnType<typeof getGoogleAdsPlatformConfig>;
  try {
    config = getGoogleAdsPlatformConfig();
  } catch (error) {
    if (error instanceof GoogleAdsPlatformConfigError) {
      const status = error.code === "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING" || error.code === "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_INVALID" ? 409 : 503;
      throw new PlatformHealthCheckError(status, error.code, error.message, null, { stage: "configuration", httpStatus: null });
    }
    throw error;
  }
  const client = createGoogleAdsRestClient({ config, fetchFn: fetchImpl });
  const accessibleCustomers = await client.listAccessibleCustomers();
  const accessibleIds = (Array.isArray(accessibleCustomers.data.resourceNames) ? accessibleCustomers.data.resourceNames : [])
    .flatMap((resourceName) => {
      if (typeof resourceName !== "string") return [];
      const match = /^customers\/(\d{10})$/.exec(resourceName.trim());
      return match ? [match[1]] : [];
    });
  if (!accessibleIds.includes(config.loginCustomerId || "")) {
    throw new PlatformHealthCheckError(
      409,
      "GOOGLE_ADS_LOGIN_CUSTOMER_NOT_ACCESSIBLE",
      "O Login Customer ID (MCC) não está acessível para esta credencial.",
      accessibleCustomers.requestId,
      { stage: "login_customer", httpStatus: "200", googleAdsCode: "GOOGLE_ADS_LOGIN_CUSTOMER_NOT_ACCESSIBLE" },
    );
  }
  if (!accessibleIds.includes(config.researchCustomerId)) {
    throw new PlatformHealthCheckError(
      409,
      "GOOGLE_ADS_RESEARCH_CUSTOMER_NOT_ACCESSIBLE",
      "O Research Customer ID da Plataforma não está acessível para esta credencial.",
      accessibleCustomers.requestId,
      { stage: "research_customer", httpStatus: "200", googleAdsCode: "GOOGLE_ADS_RESEARCH_CUSTOMER_NOT_ACCESSIBLE" },
    );
  }
  return {
    providerKey: "google_ads",
    providerRequestRef: accessibleCustomers.requestId,
    costAmount: null,
    details: { stage: "api_request", httpStatus: "200", accessibleCustomerCount: String(accessibleIds.length), researchCustomerAvailable: "true", configSource: "PLATFORM_ENV" },
  };
}

async function probeDataForSeo(secretPayload: string, fetchImpl: typeof fetch): Promise<PlatformHealthProbeResult> {
  const config = parseDataForSeoSecret(secretPayload);
  try {
    const measurement = await measureDataForSeoAllintitle({
      keyword: DATAFORSEO_HEALTH_KEYWORD,
      locationCode: config.locationCode,
      languageCode: config.languageCode,
      operationRequestId: "platform-health-check",
      depth: DATAFORSEO_DEFAULT_DEPTH,
    }, { config, fetchImpl });
    return {
      providerKey: "dataforseo",
      providerRequestRef: measurement.providerRequestId,
      costAmount: measurement.cost,
      details: { endpoint: measurement.endpoint, providerVersion: measurement.providerVersion },
    };
  } catch (error) {
    if (error instanceof PlatformHealthCheckError) throw error;
    if (error && typeof error === "object" && "providerRequestId" in error && error instanceof Error) {
      const providerRequestRef = typeof error.providerRequestId === "string" ? error.providerRequestId : null;
      throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", error.message, providerRequestRef);
    }
    throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "A DataForSEO não confirmou a conexão.");
  }
}

async function probeOpenRouter(secretPayload: string, fetchImpl: typeof fetch): Promise<PlatformHealthProbeResult> {
  const apiKey = parseOpenRouterSecret(secretPayload);
  let response: Response;
  try {
    response = await fetchImpl("https://openrouter.ai/api/v1/models/user", {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O OpenRouter está indisponível.", null, { stage: "models_endpoint", httpStatus: null });
    throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O OpenRouter está indisponível.", null, { stage: "models_endpoint", httpStatus: null });
  }
  const requestId = response.headers.get("x-request-id") || response.headers.get("request-id");
  let parsed: unknown = null;
  try { parsed = await response.json(); } catch { /* mapped below */ }
  if (!response.ok) {
    const authenticatedFailure = response.status === 401 || response.status === 403;
    throw new PlatformHealthCheckError(
      authenticatedFailure ? 502 : 503,
      authenticatedFailure ? "PLATFORM_HEALTH_AUTHENTICATION_FAILED" : "PLATFORM_HEALTH_PROVIDER_FAILED",
      authenticatedFailure ? "A chave OpenRouter não foi autorizada." : "O OpenRouter está indisponível.",
      requestId,
      { stage: "models_endpoint", httpStatus: String(response.status) },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray((parsed as { data?: unknown }).data)) {
    throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_INVALID_RESPONSE", "O OpenRouter retornou uma resposta inválida para o health check.", requestId, { stage: "models_endpoint", httpStatus: String(response.status) });
  }
  const currentModelAvailable = ((parsed as { data: unknown[] }).data).some((model) => model && typeof model === "object" && !Array.isArray(model) && (model as { id?: unknown }).id === OPENROUTER_HEALTH_MODEL);
  return {
    providerKey: "openrouter",
    providerRequestRef: requestId,
    costAmount: null,
    currentModel: OPENROUTER_HEALTH_MODEL,
    currentModelAvailable,
    details: { stage: "models_endpoint", httpStatus: String(response.status), currentModel: OPENROUTER_HEALTH_MODEL, currentModelAvailable: String(currentModelAvailable) },
  };
}

export async function runPlatformProviderHealthProbe(input: {
  providerKey: PlatformHealthProviderKey;
  secretPayload?: string;
  metadata?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<PlatformHealthProbeResult> {
  const fetchImpl = input.fetchImpl || fetch;
  try {
    if (input.providerKey === "google_ads") return await probeGoogleAds(fetchImpl);
    if (!input.secretPayload) throw new PlatformHealthCheckError(409, "PLATFORM_HEALTH_SECRET_INVALID", `A credencial salva de ${input.providerKey} está incompleta.`);
    if (input.providerKey === "dataforseo") return await probeDataForSeo(input.secretPayload, fetchImpl);
    return await probeOpenRouter(input.secretPayload, fetchImpl);
  } catch (error) {
    if (error instanceof PlatformHealthCheckError) throw error;
    if (error instanceof GoogleAdsPlatformConfigError) {
      throw new PlatformHealthCheckError(503, error.code, "A configuração server-side Google Ads está incompleta.", null, { stage: "configuration", httpStatus: null });
    }
    if (error instanceof GoogleAdsError) {
      const stage = error.code === "google_ads_oauth" ? "oauth_token"
        : error.code === "google_ads_developer_token" ? "developer_token"
          : error.code === "google_ads_account_not_authorized" ? "login_customer"
            : "api_request";
      const message = stage === "oauth_token" ? "OAuth não autorizado."
        : stage === "developer_token" ? "Developer Token rejeitado."
          : stage === "login_customer" ? "MCC não acessível."
            : "Google Ads está indisponível.";
      throw new PlatformHealthCheckError(
        stage === "login_customer" ? 409 : 502,
        stage === "login_customer" ? "GOOGLE_ADS_LOGIN_CUSTOMER_NOT_ACCESSIBLE" : "PLATFORM_HEALTH_AUTHENTICATION_FAILED",
        message,
        error.requestId || null,
        { stage, httpStatus: String(error.status), googleAdsCode: error.providerCode || error.code, googleAdsField: error.providerField },
      );
    }
    throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O provider não confirmou a conexão.");
  }
}
