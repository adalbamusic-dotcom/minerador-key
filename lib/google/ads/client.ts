import { getGoogleAdsAccessToken } from "./auth.ts";
import { normalizeGoogleAdsCustomerId, type GoogleAdsServerConfig } from "./config.ts";
import { GoogleAdsError, type GoogleAdsProviderErrorDetail } from "./errors.ts";

type FetchLike = typeof fetch;
type GoogleAdsCallOptions = { loginCustomerId?: string | null };

export type GoogleAdsRestResponse<T> = {
  data: T;
  requestId: string | null;
  providerVersion: GoogleAdsServerConfig["apiVersion"];
  customerId: string;
  loginCustomerId: string | null;
};

export type GoogleAdsRestClient = {
  listAccessibleCustomers(): Promise<GoogleAdsRestResponse<{ resourceNames?: unknown[] }>>;
  generateKeywordIdeas<T>(customerId: string, body: unknown, options?: GoogleAdsCallOptions): Promise<GoogleAdsRestResponse<T>>;
  generateKeywordHistoricalMetrics<T>(customerId: string, body: unknown, options?: GoogleAdsCallOptions): Promise<GoogleAdsRestResponse<T>>;
  searchStream<T>(customerId: string, body: unknown, options?: GoogleAdsCallOptions): Promise<GoogleAdsRestResponse<T>>;
};

function responseErrorCode(status: number, payload: unknown) {
  const providerStatus = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: { status?: unknown } }).error?.status
    : null;
  if (providerStatus === "RESOURCE_EXHAUSTED") return "google_ads_quota" as const;
  if (status === 429) return "google_ads_rate_limited" as const;
  if (status === 401 || providerStatus === "UNAUTHENTICATED") return "google_ads_oauth" as const;
  if (status === 403 && providerStatus === "PERMISSION_DENIED") return "google_ads_account_not_authorized" as const;
  if (status === 403) return "google_ads_developer_token" as const;
  if (status === 400 || providerStatus === "INVALID_ARGUMENT") return "google_ads_invalid_request" as const;
  return "google_ads_provider_error" as const;
}

function sanitizeProviderText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const sanitized = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").replace(/(developer-token|refresh-token|client-secret|client_id|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]").replace(/\b\d{10,}\b/g, "[redacted-id]").trim();
  return sanitized ? sanitized.slice(0, maxLength) : null;
}

function safeErrorCode(errorCode: unknown) {
  if (!errorCode || typeof errorCode !== "object" || Array.isArray(errorCode)) return null;
  const entry = Object.entries(errorCode as Record<string, unknown>).find(([, value]) => typeof value === "string" && value !== "UNSPECIFIED");
  const value = entry?.[1];
  if (!entry || typeof value !== "string" || !/^[a-zA-Z0-9_]+$/.test(entry[0]) || !/^[a-zA-Z0-9_]+$/.test(value)) return null;
  return `${entry[0]}:${value}`;
}

function safeFieldPath(location: unknown) {
  if (!location || typeof location !== "object" || Array.isArray(location) || !("fieldPathElements" in location)) return null;
  const fieldPathElements = (location as { fieldPathElements?: unknown }).fieldPathElements;
  if (!Array.isArray(fieldPathElements)) return null;
  return fieldPathElements.map(element => {
    if (!element || typeof element !== "object" || Array.isArray(element)) return null;
    const fieldName = (element as { fieldName?: unknown }).fieldName;
    const index = (element as { index?: unknown }).index;
    if (typeof fieldName !== "string" || !/^[a-zA-Z0-9_]+$/.test(fieldName)) return null;
    return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < 100_000 ? `${fieldName}[${index}]` : fieldName;
  }).filter((value): value is string => Boolean(value)).join(".").slice(0, 240) || null;
}

function providerErrorDetails(payload: unknown) {
  const empty = { providerCode: null, providerField: null, providerStatus: null, providerMessage: null, providerTrigger: null, providerErrors: [] as GoogleAdsProviderErrorDetail[] };
  if (!payload || typeof payload !== "object" || !("error" in payload)) return empty;
  const providerError = (payload as { error?: unknown }).error;
  if (!providerError || typeof providerError !== "object" || Array.isArray(providerError)) return empty;
  const providerStatus = sanitizeProviderText((providerError as { status?: unknown }).status, 120);
  const providerMessage = sanitizeProviderText((providerError as { message?: unknown }).message);
  const details = (providerError as { details?: unknown }).details;
  if (!Array.isArray(details)) return { ...empty, providerStatus, providerMessage };
  const providerErrors = details.flatMap(detail => {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return [];
    const errors = (detail as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) return [];
    return errors.flatMap(error => {
      if (!error || typeof error !== "object" || Array.isArray(error)) return [];
      const item = error as Record<string, unknown>;
      return [{ errorCode: safeErrorCode(item.errorCode), message: sanitizeProviderText(item.message), fieldPath: safeFieldPath(item.location), trigger: sanitizeProviderText(item.trigger && typeof item.trigger === "object" ? (item.trigger as { stringValue?: unknown }).stringValue : item.trigger, 240) }];
    });
  }).slice(0, 25);
  const firstError = providerErrors[0];
  return { providerCode: firstError?.errorCode || null, providerField: firstError?.fieldPath || null, providerStatus, providerMessage: firstError?.message || providerMessage, providerTrigger: firstError?.trigger || null, providerErrors };
}

export function createGoogleAdsRestClient(options: {
  config: GoogleAdsServerConfig;
  fetchFn?: FetchLike;
  getAccessToken?: () => Promise<string>;
}): GoogleAdsRestClient {
  const fetchFn = options.fetchFn || fetch;
  const getAccessToken = options.getAccessToken || (() => getGoogleAdsAccessToken({ config: options.config, fetchFn }));

  async function post<T>(customerIdInput: string, operation: ":generateKeywordIdeas" | ":generateKeywordHistoricalMetrics" | "/googleAds:searchStream", body: unknown, requestOptions: GoogleAdsCallOptions = {}): Promise<GoogleAdsRestResponse<T>> {
    const customerId = normalizeGoogleAdsCustomerId(customerIdInput);
    const loginCustomerId = requestOptions.loginCustomerId ?? options.config.loginCustomerId;
    const effectiveLoginCustomerId = loginCustomerId ? normalizeGoogleAdsCustomerId(loginCustomerId) : null;
    const endpoint = `/${options.config.apiVersion}/customers/:customerId${operation}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${await getAccessToken()}`,
      "developer-token": options.config.developerToken,
      "content-type": "application/json",
    };
    if (effectiveLoginCustomerId) headers["login-customer-id"] = effectiveLoginCustomerId;

    let response: Response;
    try {
      response = await fetchFn(`https://googleads.googleapis.com/${options.config.apiVersion}/customers/${customerId}${operation}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof GoogleAdsError) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new GoogleAdsError("google_ads_timeout", { cause: error, endpoint, providerResponseReceived: false, failureType: "PROVIDER_TRANSPORT_ERROR", internalStage: "google_ads_request" });
      throw new GoogleAdsError("google_ads_provider_error", { cause: error, endpoint, providerResponseReceived: false, failureType: "PROVIDER_TRANSPORT_ERROR", internalStage: "google_ads_request" });
    }

    const requestId = response.headers.get("request-id") || response.headers.get("google-ads-request-id");
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* mapped below */ }
    if (!response.ok) throw new GoogleAdsError(responseErrorCode(response.status, payload), { status: response.status, providerHttpStatus: response.status, requestId, endpoint, providerResponseReceived: true, failureType: "PROVIDER_HTTP_ERROR", internalStage: "google_ads_response", ...providerErrorDetails(payload) });
    if (!payload || typeof payload !== "object") throw new GoogleAdsError("google_ads_invalid_response", { status: 502, providerHttpStatus: response.status, requestId, endpoint, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_validation" });
    return { data: payload as T, requestId, providerVersion: options.config.apiVersion, customerId, loginCustomerId: effectiveLoginCustomerId };
  }

  async function listAccessibleCustomers(): Promise<GoogleAdsRestResponse<{ resourceNames?: unknown[] }>> {
    const endpoint = `/${options.config.apiVersion}/customers:listAccessibleCustomers`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${await getAccessToken()}`,
      "developer-token": options.config.developerToken,
      accept: "application/json",
    };

    let response: Response;
    try {
      response = await fetchFn(`https://googleads.googleapis.com/${options.config.apiVersion}/customers:listAccessibleCustomers`, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof GoogleAdsError) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new GoogleAdsError("google_ads_timeout", { cause: error, endpoint, providerResponseReceived: false, failureType: "PROVIDER_TRANSPORT_ERROR", internalStage: "google_ads_request" });
      throw new GoogleAdsError("google_ads_provider_error", { cause: error, endpoint, providerResponseReceived: false, failureType: "PROVIDER_TRANSPORT_ERROR", internalStage: "google_ads_request" });
    }

    const requestId = response.headers.get("request-id") || response.headers.get("google-ads-request-id");
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* mapped below */ }
    if (!response.ok) throw new GoogleAdsError(responseErrorCode(response.status, payload), { status: response.status, providerHttpStatus: response.status, requestId, endpoint, providerResponseReceived: true, failureType: "PROVIDER_HTTP_ERROR", internalStage: "google_ads_response", ...providerErrorDetails(payload) });
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, providerHttpStatus: response.status, requestId, endpoint, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_validation" });
    return { data: payload as { resourceNames?: unknown[] }, requestId, providerVersion: options.config.apiVersion, customerId: "", loginCustomerId: null };
  }

  return {
    listAccessibleCustomers,
    generateKeywordIdeas: (customerId, body, callOptions) => post(customerId, ":generateKeywordIdeas", body, callOptions),
    generateKeywordHistoricalMetrics: (customerId, body, callOptions) => post(customerId, ":generateKeywordHistoricalMetrics", body, callOptions),
    searchStream: (customerId, body, callOptions) => post(customerId, "/googleAds:searchStream", body, callOptions),
  };
}
