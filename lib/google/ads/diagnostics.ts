import { googleAdsSafeError, type GoogleAdsFailureType } from "./errors.ts";

export function buildGoogleAdsProviderDiagnostic(error: unknown, apiRequestStarted: boolean, extra: Record<string, unknown> = {}) {
  const safe = googleAdsSafeError(error);
  return {
    ...extra,
    apiRequestStarted,
    providerResponseReceived: safe.providerResponseReceived,
    failureType: safe.failureType,
    internalStage: safe.internalStage || "provider_request",
    providerRequestId: safe.requestId,
    googleAdsRequestId: safe.requestId,
    providerErrorCode: safe.providerCode,
    providerErrorMessage: safe.providerMessage,
    failedField: safe.providerField,
    httpStatus: safe.httpStatus,
    googleStatus: safe.providerStatus,
    providerTrigger: safe.providerTrigger,
    providerErrors: safe.providerErrors,
    endpoint: safe.endpoint,
    classification: safe.classification,
  };
}

export function buildGoogleAdsUnknownFailureDiagnostic(input: {
  apiRequestStarted: boolean;
  providerResponseReceived: boolean;
  internalStage: string;
  extra?: Record<string, unknown>;
}) {
  const failureType: GoogleAdsFailureType = input.providerResponseReceived
    ? "INTERNAL_POST_REQUEST_ERROR"
    : input.apiRequestStarted
      ? "PROVIDER_TRANSPORT_ERROR"
      : "INTERNAL_POST_REQUEST_ERROR";
  return {
    ...(input.extra || {}),
    apiRequestStarted: input.apiRequestStarted,
    providerResponseReceived: input.providerResponseReceived,
    failureType,
    internalStage: input.internalStage,
    httpStatus: null,
    providerRequestId: null,
    providerErrorCode: null,
    providerErrorMessage: null,
    googleStatus: null,
    endpoint: null,
  };
}
