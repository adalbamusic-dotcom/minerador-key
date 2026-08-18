import { z } from "zod";
import type { GoogleAdsServerConfig } from "./config.ts";

export const GoogleAdsTargetingSchema = z.object({
  language: z.string().min(1),
  geoTargetConstants: z.array(z.string().min(1)).max(10).default([]),
  keywordPlanNetwork: z.enum(["GOOGLE_SEARCH", "GOOGLE_SEARCH_AND_PARTNERS"]),
  includeAdultKeywords: z.boolean().default(false),
});

const CustomerIdSchema = z.string().min(1);
const KeywordSeedKeywordsSchema = z.array(z.string().trim().min(1)).min(1).max(20);
const HistoricalMetricsKeywordsSchema = z.array(z.string().trim().min(1)).min(1).max(10_000);

export const GoogleAdsAdvertiserAccountInputSchema = z.object({
  customerId: CustomerIdSchema,
  loginCustomerId: CustomerIdSchema.optional(),
});

export const GoogleAdsKeywordIdeasInputSchema = z.object({
  account: GoogleAdsAdvertiserAccountInputSchema,
  targeting: GoogleAdsTargetingSchema,
  pageToken: z.string().min(1).optional(),
  pageSize: z.number().int().min(1).max(10_000).optional(),
  seed: z.union([
    z.object({ kind: z.literal("keyword"), keywords: KeywordSeedKeywordsSchema }),
    z.object({ kind: z.literal("url"), url: z.string().url() }),
    z.object({ kind: z.literal("keyword_and_url"), keywords: KeywordSeedKeywordsSchema, url: z.string().url() }),
    z.object({ kind: z.literal("site"), site: z.string().min(1) }),
  ]),
});

export const GoogleAdsHistoricalMetricsInputSchema = z.object({
  account: GoogleAdsAdvertiserAccountInputSchema,
  targeting: GoogleAdsTargetingSchema,
  keywords: HistoricalMetricsKeywordsSchema,
  includeAverageCpc: z.boolean().default(false),
});

export type GoogleAdsTargeting = z.infer<typeof GoogleAdsTargetingSchema>;
export type GoogleAdsAdvertiserAccountInput = z.infer<typeof GoogleAdsAdvertiserAccountInputSchema>;
export type GoogleAdsKeywordIdeasInput = z.infer<typeof GoogleAdsKeywordIdeasInputSchema>;
export type GoogleAdsHistoricalMetricsInput = z.infer<typeof GoogleAdsHistoricalMetricsInputSchema>;

export type GoogleAdsAdvertiserAccount = {
  customerId: string;
  loginCustomerId: string | null;
  currencyCode: string;
  timeZone: string;
};

/**
 * Account context used by Keyword Planner operations. Customer metadata is
 * optional because account lookup must not gate a valid provider response.
 */
export type GoogleAdsKeywordAccount = {
  customerId: string;
  loginCustomerId: string | null;
  currencyCode: string | null;
  timeZone: string | null;
};

export type GoogleAdsMonthlySearchVolume = { year: number | null; month: string | null; searches: number | null };

export type GoogleAdsKeywordMetrics = {
  averageMonthlySearches: number | null;
  monthlySearchVolumes: GoogleAdsMonthlySearchVolume[];
  competition: string | null;
  competitionIndex: number | null;
  lowTopOfPageBidMicros: string | null;
  highTopOfPageBidMicros: string | null;
  averageCpcMicros: string | null;
};

export type GoogleAdsNormalizedKeyword = GoogleAdsKeywordMetrics & {
  keyword: string;
  normalizedKeyword: string;
  currencyCode: string | null;
  timeZone: string | null;
  targeting: GoogleAdsTargeting;
  customerId: string;
  provider: "google_ads";
  providerVersion: GoogleAdsServerConfig["apiVersion"];
  measuredAt: string;
};

export type GoogleAdsHistoricalMetric = GoogleAdsNormalizedKeyword & {
  canonicalKeyword: string;
  closeVariants: string[];
  normalizedCloseVariants: string[];
  matchedRequestedKeywords: string[];
};

export type GoogleAdsKeywordIdeasPage = {
  ideas: GoogleAdsNormalizedKeyword[];
  nextPageToken: string | null;
  requestId: string | null;
};

export type GoogleAdsHistoricalMetricsResult = {
  metrics: GoogleAdsHistoricalMetric[];
  requestId: string | null;
  requestedKeywords: string[];
  unmatchedRequestedKeywords: string[];
};
