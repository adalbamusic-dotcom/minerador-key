export const googleAdsAccountFixture = [{
  results: [{ customer: { id: "1234567890", currencyCode: "BRL", timeZone: "America/Sao_Paulo" } }],
}];

export const googleAdsMalformedSearchStreamFixture = { results: [] };
export const googleAdsMalformedSearchResultsFixture = [{ results: {} }];
export const googleAdsMalformedSearchEntryFixture = [{ results: [null] }];

export const googleAdsKeywordIdeasKeywordSeedFixture = {
  results: [{
    text: "marketing para clínicas",
    keywordIdeaMetrics: {
      avgMonthlySearches: "720",
      monthlySearchVolumes: [{ year: "2026", month: "JULY", monthlySearches: "590" }],
      competition: "MEDIUM",
      competitionIndex: "42",
      lowTopOfPageBidMicros: "1200000",
      highTopOfPageBidMicros: "3500000",
    },
  }],
  nextPageToken: "next-page",
};

export const googleAdsKeywordIdeasUrlSeedFixture = {
  results: [{
    text: "captação de pacientes",
    keywordIdeaMetrics: { avgMonthlySearches: "260", monthlySearchVolumes: [] },
  }],
};

export const googleAdsHistoricalMetricsFixture = {
  results: [{
    text: "marketing para clínicas",
    closeVariants: ["marketing clinicas", "marketing para clínica"],
    keywordMetrics: {
      avgMonthlySearches: "720",
      monthlySearchVolumes: [
        { year: "2026", month: "JULY", monthlySearches: "590" },
        { year: "2026", month: "JUNE", monthlySearches: "720" },
        { year: "2026", month: "MAY", monthlySearches: "680" },
        { year: "2026", month: "APRIL", monthlySearches: "700" },
        { year: "2026", month: "MARCH", monthlySearches: "690" },
        { year: "2026", month: "FEBRUARY", monthlySearches: "710" },
        { year: "2026", month: "JANUARY", monthlySearches: "650" },
        { year: "2025", month: "DECEMBER", monthlySearches: "620" },
        { year: "2025", month: "NOVEMBER", monthlySearches: "610" },
        { year: "2025", month: "OCTOBER", monthlySearches: "630" },
        { year: "2025", month: "SEPTEMBER", monthlySearches: "640" },
        { year: "2025", month: "AUGUST", monthlySearches: "600" },
      ],
      competition: "HIGH",
      competitionIndex: "78",
      lowTopOfPageBidMicros: "1500000",
      highTopOfPageBidMicros: "4700000",
      averageCpcMicros: "2200000",
    },
  }],
};

export const googleAdsHistoricalMetricsWithoutCpcFixture = {
  results: [{ text: "keyword sem volume", closeVariants: ["keyword sem volumes", "keyword sem o volume"], keywordMetrics: { monthlySearchVolumes: [], competition: "UNSPECIFIED" } }],
};

export const googleAdsHistoricalPartialFixture = {
  results: [{
    text: "keyword parcial",
    closeVariants: [],
    keywordMetrics: {
      avgMonthlySearches: "12",
      monthlySearchVolumes: [{ year: "2026", month: "JULY", monthlySearches: "8" }],
      competition: "LOW",
      competitionIndex: "4",
    },
  }],
};

export const googleAdsOauthErrorFixture = { error: "invalid_grant" };
export const googleAdsAccountErrorFixture = { error: { status: "PERMISSION_DENIED" } };
export const googleAdsQuotaErrorFixture = { error: { status: "RESOURCE_EXHAUSTED" } };

export const googleAdsFailureErrorFixture = {
  error: {
    code: 400,
    status: "INVALID_ARGUMENT",
    message: "Request rejected for customer 1234567890.",
    details: [{
      "@type": "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
      errors: [
        { errorCode: { keywordPlanError: "KEYWORD_PLAN_NOT_ENABLED" }, message: "Keyword Planner is not enabled.", location: { fieldPathElements: [{ fieldName: "keywordSeed", index: 0 }] }, trigger: { stringValue: "Bearer very-secret-token" } },
        { errorCode: { requestError: "INVALID_VALUE" }, message: "Second provider error.", location: { fieldPathElements: [{ fieldName: "geoTargetConstants", index: 1 }] } },
      ],
    }],
  },
};
