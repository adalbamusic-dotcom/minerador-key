import { buildGoogleAdsProviderDiagnostic, buildGoogleAdsUnknownFailureDiagnostic } from "../google/ads/diagnostics.ts";
import { GoogleAdsError } from "../google/ads/errors.ts";

export const GOOGLE_ADS_HISTORICAL_METRICS_ENDPOINT = "/v25/customers/:customerId:generateKeywordHistoricalMetrics";

export type GoogleAdsMetricsStage =
  | "request_validation"
  | "context_resolution"
  | "provider_request"
  | "provider_response"
  | "persist_current_metrics"
  | "persist_metric_history"
  | "persist_measurements"
  | "project_keywords"
  | "completed";

export type GoogleAdsMetricsExecutionState = {
  apiRequestStarted: boolean;
  providerResponseReceived: boolean;
  internalStage: GoogleAdsMetricsStage;
  providerRequestIds: string[];
  persistenceWriteCount: number;
  persistedCount: number;
};

export type GoogleAdsMetricsRouteFailure = {
  code: string;
  stage: string;
  message: string;
  status: number;
  diagnostic: Record<string, unknown>;
};

type SafeInternalError = { code: string; message: string };

const sensitiveValuePattern = /\b(developer[\s_-]*token|access[\s_-]*token|refresh[\s_-]*token|client[\s_-]*secret|authorization|password|secret)\b\s*[:=]?\s*(?:bearer\s+)?[^\s,;]+/gi;

function safeInternalError(error: unknown): SafeInternalError {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof value.code === "string" && /^[A-Z0-9_ -]{1,40}$/i.test(value.code)
    ? value.code
    : "internal_error";
  const rawMessage = typeof value.message === "string"
    ? value.message
    : error instanceof Error
      ? error.message
      : "A persistência retornou um erro sem mensagem.";
  return {
    code,
    message: rawMessage.replace(sensitiveValuePattern, "$1=[redacted]").slice(0, 240),
  };
}

function failure(code: string, stage: string, message: string, status: number, diagnostic: Record<string, unknown>): GoogleAdsMetricsRouteFailure {
  return { code, stage, message, status, diagnostic };
}

export function buildGoogleAdsMetricsFailure(
  error: unknown,
  state: GoogleAdsMetricsExecutionState,
  customerDiagnostic: Record<string, unknown> = {},
  extra: { apiVersion: string; requestedKeywordCount: number } = { apiVersion: "v25", requestedKeywordCount: 0 },
): GoogleAdsMetricsRouteFailure {
  const providerRequestId = state.providerRequestIds.at(-1) || null;
  const baseDiagnostic = {
    ...customerDiagnostic,
    apiVersion: extra.apiVersion,
    requestedKeywordCount: extra.requestedKeywordCount,
    googleAdsRequestIds: state.providerRequestIds,
    persistenceWriteCount: state.persistenceWriteCount,
    persistedCount: state.persistedCount,
    partialPersistence: state.providerResponseReceived && state.persistenceWriteCount > 0,
  };

  if (error instanceof GoogleAdsError) {
    const diagnostic = buildGoogleAdsProviderDiagnostic(error, state.apiRequestStarted, baseDiagnostic);
    if (error.code === "google_ads_quota" || error.code === "google_ads_rate_limited") {
      return failure("GOOGLE_ADS_QUOTA", "provider_request", "O limite temporário da Google Ads API foi atingido.", 429, diagnostic);
    }
    if (error.code === "google_ads_configuration") {
      return failure("GOOGLE_ADS_CONFIGURATION", "configuration_validation", "A integração Google Ads não está configurada para esta operação.", 503, diagnostic);
    }
    return failure("GOOGLE_ADS_PROVIDER_ERROR", "provider_request", error.providerMessage || error.message, error.status || 502, diagnostic);
  }

  const internal = safeInternalError(error);
  const persistenceStage = ["persist_current_metrics", "persist_metric_history", "persist_measurements", "project_keywords"].includes(state.internalStage);
  const diagnostic = {
    ...buildGoogleAdsUnknownFailureDiagnostic({
      apiRequestStarted: state.apiRequestStarted,
      providerResponseReceived: state.providerResponseReceived,
      internalStage: state.internalStage,
      extra: baseDiagnostic,
    }),
    providerRequestId,
    googleAdsRequestId: providerRequestId,
    endpoint: state.apiRequestStarted ? GOOGLE_ADS_HISTORICAL_METRICS_ENDPOINT : null,
    internalErrorCode: internal.code,
    internalErrorMessage: internal.message,
  };
  if (state.apiRequestStarted && !state.providerResponseReceived && state.internalStage === "provider_request") {
    return failure("GOOGLE_ADS_PROVIDER_ERROR", "provider_request", "Google Ads não concluiu a operação.", 502, diagnostic);
  }
  return persistenceStage
    ? failure("GOOGLE_ADS_METRICS_PERSISTENCE_ERROR", state.internalStage, "Atualização de métricas não foi concluída.", 503, diagnostic)
    : failure("GOOGLE_ADS_METRICS_INTERNAL_ERROR", state.internalStage, "Atualização de métricas não foi concluída.", 500, diagnostic);
}
