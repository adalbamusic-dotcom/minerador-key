import type { GoogleAdsRestClient } from "./client.ts";
import type { GoogleAdsKeywordAccount, GoogleAdsKeywordIdeasInput, GoogleAdsKeywordIdeasPage } from "./contracts.ts";
import { GoogleAdsKeywordIdeasInputSchema } from "./contracts.ts";
import { normalizeGoogleAdsCustomerId } from "./config.ts";
import { GoogleAdsError } from "./errors.ts";
import { normalizeGoogleAdsKeywordResult } from "./normalizers.ts";

type IdeasResponse = { results?: Array<{ text?: unknown; keywordIdeaMetrics?: unknown }>; nextPageToken?: unknown };

function seedBody(seed: GoogleAdsKeywordIdeasInput["seed"]) {
  if (seed.kind === "keyword") return { keywordSeed: { keywords: seed.keywords } };
  if (seed.kind === "url") return { urlSeed: { url: seed.url } };
  if (seed.kind === "keyword_and_url") return { keywordAndUrlSeed: { keywords: seed.keywords, url: seed.url } };
  return { siteSeed: { site: seed.site } };
}

export async function generateGoogleAdsKeywordIdeas(
  client: GoogleAdsRestClient,
  input: GoogleAdsKeywordIdeasInput,
  account: GoogleAdsKeywordAccount,
): Promise<GoogleAdsKeywordIdeasPage> {
  const parsed = GoogleAdsKeywordIdeasInputSchema.safeParse(input);
  if (!parsed.success) throw new GoogleAdsError("google_ads_invalid_request", { status: 400 });
  const value = parsed.data;
  const requestedCustomerId = normalizeGoogleAdsCustomerId(value.account.customerId);
  if (requestedCustomerId !== account.customerId) throw new GoogleAdsError("google_ads_invalid_request", { status: 400 });
  if (value.account.loginCustomerId && normalizeGoogleAdsCustomerId(value.account.loginCustomerId) !== account.loginCustomerId) throw new GoogleAdsError("google_ads_invalid_request", { status: 400 });
  const response = await client.generateKeywordIdeas<IdeasResponse>(account.customerId, {
    ...seedBody(value.seed),
    language: value.targeting.language,
    geoTargetConstants: value.targeting.geoTargetConstants,
    keywordPlanNetwork: value.targeting.keywordPlanNetwork,
    includeAdultKeywords: value.targeting.includeAdultKeywords,
    ...(value.pageToken ? { pageToken: value.pageToken } : {}),
    ...(value.pageSize ? { pageSize: value.pageSize } : {}),
  }, { loginCustomerId: account.loginCustomerId });
  if (!Array.isArray(response.data.results)) throw new GoogleAdsError("google_ads_invalid_response", { status: 502, requestId: response.requestId, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "response_validation" });
  return {
    ideas: response.data.results.map(result => normalizeGoogleAdsKeywordResult({
      keyword: result.text,
      metrics: result.keywordIdeaMetrics,
      account,
      targeting: value.targeting,
      providerVersion: response.providerVersion,
      requestId: response.requestId,
    })),
    nextPageToken: typeof response.data.nextPageToken === "string" && response.data.nextPageToken ? response.data.nextPageToken : null,
    requestId: response.requestId,
  };
}
