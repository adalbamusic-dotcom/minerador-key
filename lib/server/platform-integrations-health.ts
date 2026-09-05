import { createGoogleAdsRestClient } from "@/lib/google/ads/client";
import { GoogleAdsError } from "@/lib/google/ads/errors";
import { GoogleAdsPlatformConfigError, type GoogleAdsPlatformConfig } from "@/lib/google/ads/config";
import {
  DATAFORSEO_DEFAULT_DEPTH,
  DATAFORSEO_DEFAULT_LANGUAGE_CODE,
  DATAFORSEO_DEFAULT_LOCATION_CODE,
  measureDataForSeoAllintitle,
  type DataForSeoSerpConfig,
} from "@/lib/minerador/dataforseo-serp-core";
import { DEEPSEEK_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from "@/lib/server/deepseek-canonical";
import { GoogleCloudMediaError } from "@/lib/server/google-cloud/contracts";
import { probeGoogleCloudSpeech, probeGoogleCloudStorage, probeYouTubeData } from "@/lib/server/google-cloud/health";
import type { StorageClientFactory } from "@/lib/server/google-cloud/storage-operation";
import { parseTelegramBotToken, parseTelegramSecret } from "@/lib/server/telegram/contracts";
import { getTelegramBot, TelegramApiError } from "@/lib/server/telegram/adapter";

export type PlatformHealthProviderKey = "google_ads" | "dataforseo" | "deepseek" | "google_cloud" | "youtube_data" | "telegram";
export type PlatformHealthOperation = "speech" | "storage" | "youtube" | "telegram_get_me" | "telegram_webhook";

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

function parseDeepSeekSecret(payload: string) {
  const secret = parseSecretObject(payload, ["DEEPSEEK_API_KEY"], "deepseek");
  return secret.DEEPSEEK_API_KEY;
}

async function probeGoogleAds(fetchImpl: typeof fetch, config?: GoogleAdsPlatformConfig): Promise<PlatformHealthProbeResult> {
  if (!config) {
    throw new PlatformHealthCheckError(503, "GOOGLE_ADS_REFRESH_TOKEN_SECRET_MISSING", "O OAuth Refresh Token Google Ads não foi resolvido pelo Secret Store.", null, { stage: "configuration", httpStatus: null });
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
    details: { stage: "api_request", httpStatus: "200", accessibleCustomerCount: String(accessibleIds.length), researchCustomerAvailable: "true", configSource: "PLATFORM_ENV_STATIC_PLUS_SECRET_STORE_REFRESH_TOKEN" },
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

async function probeDeepSeek(secretPayload: string, metadata: unknown, fetchImpl: typeof fetch): Promise<PlatformHealthProbeResult> {
  const apiKey = parseDeepSeekSecret(secretPayload);
  let response: Response;
  try {
    response = await fetchImpl(`${DEEPSEEK_BASE_URL}/models`, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O DeepSeek está indisponível.", null, { stage: "models_endpoint", httpStatus: null });
    throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O DeepSeek está indisponível.", null, { stage: "models_endpoint", httpStatus: null });
  }
  const requestId = response.headers.get("x-request-id") || response.headers.get("request-id");
  let parsed: unknown = null;
  try { parsed = await response.json(); } catch { /* mapped below */ }
  if (!response.ok) {
    const authenticatedFailure = response.status === 401 || response.status === 403;
    throw new PlatformHealthCheckError(
      authenticatedFailure ? 502 : 503,
      authenticatedFailure ? "PLATFORM_HEALTH_AUTHENTICATION_FAILED" : "PLATFORM_HEALTH_PROVIDER_FAILED",
      authenticatedFailure ? "A chave DeepSeek não foi autorizada." : "O DeepSeek está indisponível.",
      requestId,
      { stage: "models_endpoint", httpStatus: String(response.status) },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray((parsed as { data?: unknown }).data)) {
    throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_INVALID_RESPONSE", "O DeepSeek retornou uma resposta inválida para o health check.", requestId, { stage: "models_endpoint", httpStatus: String(response.status) });
  }
  const metadataRecord = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const currentModel = typeof metadataRecord.deepseek_model === "string" && metadataRecord.deepseek_model.trim() ? metadataRecord.deepseek_model.trim() : DEEPSEEK_DEFAULT_MODEL;
  const currentModelAvailable = ((parsed as { data: unknown[] }).data).some((model) => model && typeof model === "object" && !Array.isArray(model) && (model as { id?: unknown }).id === currentModel);
  return {
    providerKey: "deepseek",
    providerRequestRef: requestId,
    costAmount: null,
    currentModel,
    currentModelAvailable,
    details: { stage: "models_endpoint", httpStatus: String(response.status), currentModel, currentModelAvailable: String(currentModelAvailable) },
  };
}

async function probeTelegram(secretPayload: string, operation: "telegram_get_me" | "telegram_webhook" | undefined, fetchImpl: typeof fetch): Promise<PlatformHealthProbeResult> {
  let botToken: string;
  try {
    if (operation === "telegram_webhook") {
      const secret = parseTelegramSecret(secretPayload);
      botToken = secret.TELEGRAM_BOT_TOKEN;
    } else {
      botToken = parseTelegramBotToken(secretPayload);
    }
  } catch {
    throw new PlatformHealthCheckError(409, "TELEGRAM_SECRET_INVALID", "A credencial Telegram está incompleta ou inválida.", null, { stage: "configuration", httpStatus: null });
  }
  try {
    const bot = getTelegramBot(botToken, fetchImpl);
    if (operation === "telegram_webhook") {
      const webhook = await bot.getWebhookInfo();
      return {
        providerKey: "telegram",
        providerRequestRef: null,
        costAmount: null,
        details: {
          stage: "get_webhook_info",
          webhookConfigured: String(Boolean(webhook.url)),
          webhookUrl: webhook.url || "",
          pendingUpdateCount: String(webhook.pending_update_count),
          lastError: webhook.last_error_message || "",
        },
      };
    }
    const me = await bot.getMe();
    return {
      providerKey: "telegram",
      providerRequestRef: null,
      costAmount: null,
      details: { stage: "get_me", botId: String(me.id), botUsername: me.username || "", botName: me.first_name },
    };
  } catch (error) {
    if (error instanceof TelegramApiError) {
      const isWebhookCheck = operation === "telegram_webhook";
      throw new PlatformHealthCheckError(
        502,
        isWebhookCheck ? "GET_WEBHOOK_INFO_FAILED" : "BOT_GETME_FAILED",
        isWebhookCheck ? "Não foi possível consultar o estado do webhook Telegram." : "Não foi possível validar o Bot Telegram via getMe.",
        error.providerRequestRef,
        { stage: isWebhookCheck ? "get_webhook_info" : "get_me", httpStatus: error.errorCode === null ? null : String(error.errorCode) },
      );
    }
    throw error;
  }
}

export async function runPlatformProviderHealthProbe(input: {
  providerKey: PlatformHealthProviderKey;
  secretPayload?: string;
  metadata?: unknown;
  googleAdsConfig?: GoogleAdsPlatformConfig;
  healthOperation?: PlatformHealthOperation;
  fetchImpl?: typeof fetch;
  storageClientFactory?: StorageClientFactory;
}): Promise<PlatformHealthProbeResult> {
  const fetchImpl = input.fetchImpl || fetch;
  try {
    if (input.providerKey === "google_ads") return await probeGoogleAds(fetchImpl, input.googleAdsConfig);
    if (!input.secretPayload) throw new PlatformHealthCheckError(409, "PLATFORM_HEALTH_SECRET_INVALID", `A credencial salva de ${input.providerKey} está incompleta.`);
    if (input.providerKey === "dataforseo") return await probeDataForSeo(input.secretPayload, fetchImpl);
    if (input.providerKey === "deepseek") return await probeDeepSeek(input.secretPayload, input.metadata, fetchImpl);
    if (input.providerKey === "google_cloud") {
      const probe = input.healthOperation === "storage"
        ? await probeGoogleCloudStorage({ secretPayload: input.secretPayload, metadata: input.metadata, clientFactory: input.storageClientFactory })
        : await probeGoogleCloudSpeech({ secretPayload: input.secretPayload });
      return { providerKey: input.providerKey, providerRequestRef: probe.providerRequestRef, costAmount: null, details: probe.details };
    }
    if (input.providerKey === "telegram") return await probeTelegram(input.secretPayload, input.healthOperation === "telegram_webhook" ? "telegram_webhook" : "telegram_get_me", fetchImpl);
    const probe = await probeYouTubeData({ secretPayload: input.secretPayload, metadata: input.metadata, fetchImpl });
    return { providerKey: input.providerKey, providerRequestRef: probe.providerRequestRef, costAmount: null, details: probe.details };
  } catch (error) {
    if (error instanceof PlatformHealthCheckError) throw error;
    if (error instanceof GoogleAdsPlatformConfigError) throw new PlatformHealthCheckError(503, error.code, error.message, null, { stage: "configuration", httpStatus: null });
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
    if (error instanceof GoogleCloudMediaError) {
      const authenticationFailure = error.code === "GOOGLE_CLOUD_SECRET_INVALID" || error.code === "CREDENTIAL_INVALID" || error.code === "YOUTUBE_SECRET_INVALID";
      const stage = error.code === "MEDIA_BUCKET_NOT_CONFIGURED" ? "configuration"
        : error.code === "BUCKET_NOT_FOUND" || error.code === "BUCKET_ACCESS_DENIED" || error.code === "STORAGE_API_DISABLED" || error.code === "PROVIDER_ERROR" ? "bucket_metadata"
          : "credential";
      throw new PlatformHealthCheckError(authenticationFailure || error.code === "MEDIA_BUCKET_NOT_CONFIGURED" ? 409 : 502, error.code, error.message, null, { stage, httpStatus: null });
    }
    throw new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O provider não confirmou a conexão.");
  }
}
