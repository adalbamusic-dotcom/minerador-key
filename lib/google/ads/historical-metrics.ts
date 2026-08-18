import type { GoogleAdsRestClient } from "./client.ts";
import type { GoogleAdsKeywordAccount, GoogleAdsHistoricalMetricsInput, GoogleAdsHistoricalMetricsResult } from "./contracts.ts";
import { GoogleAdsHistoricalMetricsInputSchema } from "./contracts.ts";
import { normalizeGoogleAdsCustomerId } from "./config.ts";
import { GoogleAdsError } from "./errors.ts";
import { normalizeGoogleAdsKeyword, normalizeGoogleAdsKeywordResult } from "./normalizers.ts";

type HistoricalMetricsResponse = { results?: Array<{ text?: unknown; closeVariants?: unknown; keywordMetrics?: unknown }> };

export async function generateGoogleAdsHistoricalMetrics(
  client: GoogleAdsRestClient,
  input: GoogleAdsHistoricalMetricsInput,
  account: GoogleAdsKeywordAccount,
): Promise<GoogleAdsHistoricalMetricsResult> {
  const parsed = GoogleAdsHistoricalMetricsInputSchema.safeParse(input);
  if (!parsed.success) throw new GoogleAdsError("google_ads_invalid_request", { status: 400 });
  const value = parsed.data;
  const requestedCustomerId = normalizeGoogleAdsCustomerId(value.account.customerId);
  if (requestedCustomerId !== account.customerId) throw new GoogleAdsError("google_ads_invalid_request", { status: 400 });
  if (value.account.loginCustomerId && normalizeGoogleAdsCustomerId(value.account.loginCustomerId) !== account.loginCustomerId) throw new GoogleAdsError("google_ads_invalid_request", { status: 400 });
  const response = await client.generateKeywordHistoricalMetrics<HistoricalMetricsResponse>(account.customerId, {
    keywords: value.keywords,
    language: value.targeting.language,
    geoTargetConstants: value.targeting.geoTargetConstants,
    keywordPlanNetwork: value.targeting.keywordPlanNetwork,
    includeAdultKeywords: value.targeting.includeAdultKeywords,
    // A representação JSON REST preserva a intenção do campo
    // historical_metrics_options.include_average_cpc do contrato Google Ads.
    ...(value.includeAverageCpc ? { historicalMetricsOptions: { includeAverageCpc: true } } : {}),
  }, { loginCustomerId: account.loginCustomerId });
  if (typeof response.data.results !== "undefined" && !Array.isArray(response.data.results)) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: response.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_validation" });
  const results = response.data.results || [];
  const matchedRequestedKeywords = new Set<string>();
  const metrics = results.map(result => {
    const normalized = normalizeGoogleAdsKeywordResult({
      keyword: result.text,
      metrics: result.keywordMetrics,
      account,
      targeting: value.targeting,
      providerVersion: response.providerVersion,
      requestId: response.requestId,
    });
    const closeVariants = Array.isArray(result.closeVariants) ? result.closeVariants.filter((variant): variant is string => typeof variant === "string") : [];
    const normalizedCloseVariants = closeVariants.map(normalizeGoogleAdsKeyword);
    const matchingKeys = new Set([normalized.normalizedKeyword, ...normalizedCloseVariants]);
    const resultMatches = value.keywords.filter(keyword => matchingKeys.has(normalizeGoogleAdsKeyword(keyword)));
    resultMatches.forEach(keyword => matchedRequestedKeywords.add(keyword));
    return {
      ...normalized,
      canonicalKeyword: normalized.keyword,
      closeVariants,
      normalizedCloseVariants,
      matchedRequestedKeywords: resultMatches,
    };
  });
  return {
    metrics,
    requestId: response.requestId,
    requestedKeywords: [...value.keywords],
    unmatchedRequestedKeywords: value.keywords.filter(keyword => !matchedRequestedKeywords.has(keyword)),
  };
}
