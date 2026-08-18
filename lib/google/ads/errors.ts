export type GoogleAdsErrorCode =
  | "google_ads_configuration"
  | "google_ads_oauth"
  | "google_ads_account_not_authorized"
  | "google_ads_invalid_customer_id"
  | "google_ads_developer_token"
  | "google_ads_quota"
  | "google_ads_rate_limited"
  | "google_ads_timeout"
  | "google_ads_invalid_request"
  | "google_ads_invalid_response"
  | "google_ads_no_data"
  | "google_ads_provider_error";

export type GoogleAdsProviderErrorDetail = {
  errorCode: string | null;
  message: string | null;
  fieldPath: string | null;
  trigger: string | null;
};

export type GoogleAdsFailureType =
  | "PROVIDER_SUCCESS"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_TRANSPORT_ERROR"
  | "OAUTH_TOKEN_ERROR"
  | "INTERNAL_POST_REQUEST_ERROR";

const messages: Record<GoogleAdsErrorCode, string> = {
  google_ads_configuration: "A integração Google Ads não está configurada para esta operação.",
  google_ads_oauth: "Não foi possível autorizar a integração Google Ads.",
  google_ads_account_not_authorized: "A conta anunciante não está autorizada para esta operação.",
  google_ads_invalid_customer_id: "A conta anunciante informada é inválida.",
  google_ads_developer_token: "O acesso da integração Google Ads foi recusado.",
  google_ads_quota: "A quota da integração Google Ads foi atingida.",
  google_ads_rate_limited: "A integração Google Ads limitou temporariamente esta operação.",
  google_ads_timeout: "A integração Google Ads demorou mais do que o esperado.",
  google_ads_invalid_request: "A solicitação para Google Ads é inválida.",
  google_ads_invalid_response: "Google Ads retornou uma resposta incompatível.",
  google_ads_no_data: "Google Ads não retornou dados para a keyword informada.",
  google_ads_provider_error: "Google Ads não concluiu a operação.",
};

export class GoogleAdsError extends Error {
  readonly code: GoogleAdsErrorCode;
  readonly status: number;
  readonly requestId: string | null;
  readonly providerCode: string | null;
  readonly providerField: string | null;
  readonly providerStatus: string | null;
  readonly providerMessage: string | null;
  readonly providerTrigger: string | null;
  readonly providerErrors: GoogleAdsProviderErrorDetail[];
  readonly endpoint: string | null;
  readonly providerResponseReceived: boolean;
  readonly providerHttpStatus: number | null;
  readonly failureType: GoogleAdsFailureType;
  readonly internalStage: string | null;

  constructor(code: GoogleAdsErrorCode, options: { status?: number; requestId?: string | null; providerCode?: string | null; providerField?: string | null; providerStatus?: string | null; providerMessage?: string | null; providerTrigger?: string | null; providerErrors?: GoogleAdsProviderErrorDetail[]; endpoint?: string | null; providerResponseReceived?: boolean; providerHttpStatus?: number | null; failureType?: GoogleAdsFailureType; internalStage?: string | null; cause?: unknown } = {}) {
    super(messages[code], { cause: options.cause });
    this.name = "GoogleAdsError";
    this.code = code;
    this.status = options.status ?? 500;
    this.requestId = options.requestId ?? null;
    this.providerCode = options.providerCode ?? null;
    this.providerField = options.providerField ?? null;
    this.providerStatus = options.providerStatus ?? null;
    this.providerMessage = options.providerMessage ?? null;
    this.providerTrigger = options.providerTrigger ?? null;
    this.providerErrors = options.providerErrors || [];
    this.endpoint = options.endpoint ?? null;
    this.providerResponseReceived = options.providerResponseReceived ?? false;
    this.failureType = options.failureType || (code === "google_ads_oauth"
      ? "OAUTH_TOKEN_ERROR"
      : options.providerResponseReceived
        ? "INTERNAL_POST_REQUEST_ERROR"
        : "PROVIDER_TRANSPORT_ERROR");
    this.providerHttpStatus = options.providerHttpStatus ?? (this.providerResponseReceived && (this.failureType === "PROVIDER_HTTP_ERROR" || this.failureType === "OAUTH_TOKEN_ERROR") ? options.status ?? null : null);
    this.internalStage = options.internalStage ?? null;
  }
}

export type GoogleAdsFailureClassification =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "DEVELOPER_TOKEN_ACCESS"
  | "CUSTOMER_ACCESS/HIERARCHY"
  | "CUSTOMER_CONFIGURATION"
  | "KEYWORD_PLAN_PERMISSION"
  | "INVALID_REQUEST"
  | "QUOTA"
  | "OTHER_PROVIDER_ERROR";

export function classifyGoogleAdsProviderFailure(error: GoogleAdsError): GoogleAdsFailureClassification {
  const code = `${error.providerCode || ""} ${error.providerStatus || ""}`.toUpperCase();
  if (/AUTHENTICATION|UNAUTHENTICATED|OAUTH|INVALID_GRANT/.test(code) || error.code === "google_ads_oauth") return "AUTHENTICATION";
  if (/DEVELOPER_TOKEN|DEVELOPER_ACCESS|DEVELOPER_TOKEN_PROHIBITED/.test(code)) return "DEVELOPER_TOKEN_ACCESS";
  if (/CUSTOMER_NOT_FOUND|CUSTOMER_NOT_ENABLED|CUSTOMER_MANAGER_LINK|GOOGLE_ADS_FAILURE|LOGIN_CUSTOMER/.test(code)) return "CUSTOMER_ACCESS/HIERARCHY";
  if (/CUSTOMER_CONFIGURATION|CUSTOMER_STATUS|CUSTOMER_ID/.test(code) || error.code === "google_ads_invalid_customer_id") return "CUSTOMER_CONFIGURATION";
  if (/KEYWORD_PLAN|CUSTOMER_NOT_WHITELISTED|ACTION_NOT_PERMITTED/.test(code)) return "KEYWORD_PLAN_PERMISSION";
  if (/QUOTA|RESOURCE_EXHAUSTED|RATE_LIMIT/.test(code) || error.code === "google_ads_quota" || error.code === "google_ads_rate_limited") return "QUOTA";
  if (/INVALID_ARGUMENT|INVALID_REQUEST|REQUEST_ERROR/.test(code) || error.code === "google_ads_invalid_request") return "INVALID_REQUEST";
  if (/PERMISSION_DENIED|ACCESS_DENIED|AUTHORIZATION/.test(code) || error.code === "google_ads_account_not_authorized") return "AUTHORIZATION";
  return "OTHER_PROVIDER_ERROR";
}

export function toGoogleAdsError(error: unknown): GoogleAdsError {
  if (error instanceof GoogleAdsError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") return new GoogleAdsError("google_ads_timeout", { cause: error });
  return new GoogleAdsError("google_ads_provider_error", { cause: error });
}

export function googleAdsSafeError(error: unknown) {
  const normalized = toGoogleAdsError(error);
  return {
    code: normalized.code,
    message: normalized.message,
    requestId: normalized.requestId,
    providerCode: normalized.providerCode,
    providerField: normalized.providerField,
    providerStatus: normalized.providerStatus,
    providerMessage: normalized.providerMessage,
    providerTrigger: normalized.providerTrigger,
    providerErrors: normalized.providerErrors,
    httpStatus: normalized.providerHttpStatus,
    endpoint: normalized.endpoint,
    providerResponseReceived: normalized.providerResponseReceived,
    failureType: normalized.failureType,
    internalStage: normalized.internalStage,
    classification: classifyGoogleAdsProviderFailure(normalized),
  };
}
