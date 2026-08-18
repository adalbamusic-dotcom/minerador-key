import { normalizeGoogleAdsCustomerId } from "./config.ts";
import type { GoogleAdsRestClient } from "./client.ts";
import type { GoogleAdsAdvertiserAccount, GoogleAdsAdvertiserAccountInput, GoogleAdsKeywordAccount } from "./contracts.ts";
import { GoogleAdsError } from "./errors.ts";

type CustomerSearchStreamResponse = Array<{ results?: Array<{ customer?: { id?: unknown; currencyCode?: unknown; timeZone?: unknown } }> }>;

export async function resolveGoogleAdsAdvertiserAccount(
  client: GoogleAdsRestClient,
  input: GoogleAdsAdvertiserAccountInput,
): Promise<GoogleAdsAdvertiserAccount> {
  const customerId = normalizeGoogleAdsCustomerId(input.customerId);
  const loginCustomerId = input.loginCustomerId ? normalizeGoogleAdsCustomerId(input.loginCustomerId) : undefined;
  const response = await client.searchStream<CustomerSearchStreamResponse>(
    customerId,
    { query: "SELECT customer.id, customer.currency_code, customer.time_zone FROM customer LIMIT 1" },
    { loginCustomerId },
  );
  if (!Array.isArray(response.data)) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: response.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
  const customer = response.data
    .flatMap((chunk) => {
      if (!chunk || typeof chunk !== "object") throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: response.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
      if ("results" in chunk && chunk.results !== undefined && !Array.isArray(chunk.results)) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: response.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
      return chunk.results || [];
    })
    .map((result) => {
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: response.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
      return result.customer;
    })
    .find(Boolean);
  if (!customer || String(customer.id || "") !== customerId || typeof customer.currencyCode !== "string" || !customer.currencyCode || typeof customer.timeZone !== "string" || !customer.timeZone) {
    throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: response.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_normalization" });
  }
  return { customerId, loginCustomerId: response.loginCustomerId, currencyCode: customer.currencyCode, timeZone: customer.timeZone };
}

/**
 * Builds the platform Research Customer context without performing the
 * optional Customer metadata SearchStream lookup.
 */
export function createGoogleAdsKeywordAccount(input: { customerId: string; loginCustomerId?: string | null }): GoogleAdsKeywordAccount {
  return {
    customerId: normalizeGoogleAdsCustomerId(input.customerId),
    loginCustomerId: input.loginCustomerId ? normalizeGoogleAdsCustomerId(input.loginCustomerId) : null,
    currencyCode: null,
    timeZone: null,
  };
}
