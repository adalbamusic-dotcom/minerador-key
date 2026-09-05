import { resolveGoogleAdsAdvertiserAccount } from "./account.ts";
import { createGoogleAdsRestClient } from "./client.ts";
import { getGoogleAdsServerConfig, GOOGLE_ADS_SUPPORTED_API_VERSIONS, normalizeGoogleAdsCustomerId, type GoogleAdsEnvironment } from "./config.ts";
import type { GoogleAdsHistoricalMetricsResult, GoogleAdsTargeting } from "./contracts.ts";
import { GoogleAdsError, googleAdsSafeError } from "./errors.ts";
import { generateGoogleAdsHistoricalMetrics } from "./historical-metrics.ts";

export const GOOGLE_ADS_REQUIRED_CONFIGURATION = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_API_VERSION",
] as const;

export const GOOGLE_ADS_SMOKE_HELP = {
  smoke: "google_ads",
  purpose: "Consulta manual de uma keyword no Google Ads, sem persistência.",
  customerId: "Informe o ID numérico de 10 dígitos da conta anunciante, sem hífens.",
  loginCustomerId: "Use somente quando a hierarquia MCC exigir.",
  required: ["--customer-id", "--keyword", "--language", "--geo-target", "--network", "--include-adult-keywords"],
  example: "npm run google-ads:smoke -- --customer-id 1234567890 --keyword \"marketing para clínicas\" --language languageConstants/1014 --geo-target geoTargetConstants/2076 --network GOOGLE_SEARCH --include-adult-keywords false",
  persistence: false,
} as const;

export type GoogleAdsSmokeStage =
  | "argument_validation"
  | "environment_loading"
  | "configuration_validation"
  | "oauth_resolution"
  | "account_resolution"
  | "google_ads_request"
  | "response_normalization";

export type GoogleAdsSmokeInput = {
  customerId: string;
  loginCustomerId?: string;
  keyword: string;
  targeting: GoogleAdsTargeting;
};

export class GoogleAdsSmokeError extends Error {
  readonly code: "invalid_customer_id" | "google_ads_invalid_request" | "google_ads_configuration_missing" | "google_ads_configuration_invalid";
  readonly stage: GoogleAdsSmokeStage;
  readonly apiRequestStarted: boolean;
  readonly missingConfiguration?: string[];
  readonly invalidConfiguration?: string[];

  constructor(
    code: "invalid_customer_id" | "google_ads_invalid_request" | "google_ads_configuration_missing" | "google_ads_configuration_invalid",
    stage: GoogleAdsSmokeStage,
    apiRequestStarted: boolean,
    configuration?: string[],
  ) {
    super(code === "invalid_customer_id"
      ? "Informe o ID numérico real da conta Google Ads, sem hífens."
      : code === "google_ads_configuration_missing"
        ? "A configuração Google Ads está incompleta."
        : code === "google_ads_configuration_invalid"
          ? "A configuração Google Ads possui valores inválidos."
        : "Os argumentos do smoke Google Ads são inválidos.");
    this.name = "GoogleAdsSmokeError";
    this.code = code;
    this.stage = stage;
    this.apiRequestStarted = apiRequestStarted;
    this.missingConfiguration = code === "google_ads_configuration_missing" ? configuration : undefined;
    this.invalidConfiguration = code === "google_ads_configuration_invalid" ? configuration : undefined;
  }
}

type SanitizedGoogleAdsSmokeResult = {
  provider: "google_ads";
  providerVersion: string;
  customerId: string;
  hasLoginCustomerId: boolean;
  currencyCode: string;
  timeZone: string;
  targeting: GoogleAdsTargeting;
  keyword: string;
  canonicalKeyword: string;
  closeVariants: string[];
  averageMonthlySearches: number | null;
  monthlySearchVolumes: Array<{ year: number | null; month: string | null; searches: number | null }>;
  competition: string | null;
  competitionIndex: number | null;
  lowTopOfPageBidMicros: string | null;
  highTopOfPageBidMicros: string | null;
  measuredAt: string;
  unmatchedRequestedKeywords: string[];
  durationMs: number;
  apiRequestStarted: true;
};

function invalidArguments() {
  return new GoogleAdsSmokeError("google_ads_invalid_request", "argument_validation", false);
}

function requireSingle(values: Map<string, string[]>, flag: string) {
  const entries = values.get(flag) || [];
  if (entries.length !== 1 || !entries[0].trim()) throw invalidArguments();
  return entries[0].trim();
}

function requireCustomerId(values: Map<string, string[]>) {
  const entries = values.get("--customer-id") || [];
  if (entries.length !== 1 || !/^\d{10}$/.test(entries[0].trim())) {
    throw new GoogleAdsSmokeError("invalid_customer_id", "argument_validation", false);
  }
  return entries[0].trim();
}

export function parseGoogleAdsSmokeArguments(argv: string[]): GoogleAdsSmokeInput {
  const values = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag?.startsWith("--customer-id") && flag !== "--customer-id") throw new GoogleAdsSmokeError("invalid_customer_id", "argument_validation", false);
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw invalidArguments();
    const entries = values.get(flag) || [];
    entries.push(value);
    values.set(flag, entries);
  }
  const supportedFlags = new Set(["--customer-id", "--login-customer-id", "--keyword", "--language", "--geo-target", "--network", "--include-adult-keywords"]);
  if ([...values.keys()].some(flag => !supportedFlags.has(flag))) throw invalidArguments();
  const customerId = requireCustomerId(values);
  const includeAdultKeywords = requireSingle(values, "--include-adult-keywords");
  if (includeAdultKeywords !== "true" && includeAdultKeywords !== "false") throw invalidArguments();
  const network = requireSingle(values, "--network");
  if (network !== "GOOGLE_SEARCH" && network !== "GOOGLE_SEARCH_AND_PARTNERS") throw invalidArguments();
  const geoTargetConstants = values.get("--geo-target") || [];
  if (geoTargetConstants.length < 1 || geoTargetConstants.length > 10 || geoTargetConstants.some(value => !value.trim())) throw invalidArguments();
  const loginCustomerId = values.get("--login-customer-id");
  if (loginCustomerId && (loginCustomerId.length !== 1 || !/^\d{10}$/.test(loginCustomerId[0].trim()))) throw invalidArguments();
  return {
    customerId,
    ...(loginCustomerId ? { loginCustomerId: loginCustomerId[0].trim() } : {}),
    keyword: requireSingle(values, "--keyword"),
    targeting: {
      language: requireSingle(values, "--language"),
      geoTargetConstants: geoTargetConstants.map(value => value.trim()),
      keywordPlanNetwork: network as GoogleAdsTargeting["keywordPlanNetwork"],
      includeAdultKeywords: includeAdultKeywords === "true",
    },
  };
}

export function getMissingGoogleAdsConfiguration(environment: GoogleAdsEnvironment) {
  return GOOGLE_ADS_REQUIRED_CONFIGURATION.filter(name => !environment[name]?.trim());
}

export function getInvalidGoogleAdsConfiguration(environment: GoogleAdsEnvironment) {
  const invalidConfiguration: string[] = [];
  const apiVersion = environment.GOOGLE_ADS_API_VERSION?.trim();
  if (apiVersion && !GOOGLE_ADS_SUPPORTED_API_VERSIONS.includes(apiVersion as typeof GOOGLE_ADS_SUPPORTED_API_VERSIONS[number])) invalidConfiguration.push("GOOGLE_ADS_API_VERSION");
  const loginCustomerId = environment.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (loginCustomerId) {
    try { normalizeGoogleAdsCustomerId(loginCustomerId); } catch { invalidConfiguration.push("GOOGLE_ADS_LOGIN_CUSTOMER_ID"); }
  }
  return invalidConfiguration;
}

export function loadGoogleAdsSmokeEnvironment(loader: (directory: string) => unknown, directory = process.cwd()) {
  loader(directory);
  return { configurationLoaded: true as const };
}

export function validateGoogleAdsSmokeConfiguration(environment: GoogleAdsEnvironment) {
  const missingConfiguration = getMissingGoogleAdsConfiguration(environment);
  if (missingConfiguration.length) {
    throw new GoogleAdsSmokeError("google_ads_configuration_missing", "configuration_validation", false, missingConfiguration);
  }
  const invalidConfiguration = getInvalidGoogleAdsConfiguration(environment);
  if (invalidConfiguration.length) {
    throw new GoogleAdsSmokeError("google_ads_configuration_invalid", "configuration_validation", false, invalidConfiguration);
  }
  getGoogleAdsServerConfig(environment);
  return { configurationLoaded: true, configurationComplete: true, apiRequestStarted: false as const };
}

export function formatGoogleAdsSmokeError(error: unknown, stage: GoogleAdsSmokeStage, apiRequestStarted: boolean) {
  if (error instanceof GoogleAdsSmokeError) {
    return {
      code: error.code,
      stage: error.stage,
      message: error.message,
      ...(error.missingConfiguration ? { missingConfiguration: error.missingConfiguration } : {}),
      ...(error.invalidConfiguration ? { invalidConfiguration: error.invalidConfiguration } : {}),
      ...(error.stage === "configuration_validation" ? { configurationLoaded: true, configurationComplete: false } : {}),
      apiRequestStarted: error.apiRequestStarted,
    };
  }
  const safe = googleAdsSafeError(error);
  const inferredStage = safe.code === "google_ads_oauth" ? "oauth_resolution" : stage;
  return { ...safe, stage: inferredStage, apiRequestStarted };
}

export function maskGoogleAdsCustomerId(customerId: string) {
  return customerId.length <= 4 ? "****" : `${"*".repeat(customerId.length - 4)}${customerId.slice(-4)}`;
}

export function sanitizeGoogleAdsSmokeResult(input: {
  smoke: GoogleAdsSmokeInput;
  account: { customerId: string; loginCustomerId: string | null; currencyCode: string; timeZone: string };
  result: GoogleAdsHistoricalMetricsResult;
  durationMs: number;
}): SanitizedGoogleAdsSmokeResult {
  const metric = input.result.metrics[0];
  if (!metric) throw new GoogleAdsError("google_ads_no_data", { status: 404, requestId: input.result.requestId });
  return {
    provider: "google_ads",
    providerVersion: metric.providerVersion,
    customerId: maskGoogleAdsCustomerId(input.account.customerId),
    hasLoginCustomerId: Boolean(input.account.loginCustomerId),
    currencyCode: input.account.currencyCode,
    timeZone: input.account.timeZone,
    targeting: input.smoke.targeting,
    keyword: input.smoke.keyword,
    canonicalKeyword: metric.canonicalKeyword,
    closeVariants: metric.closeVariants,
    averageMonthlySearches: metric.averageMonthlySearches,
    monthlySearchVolumes: metric.monthlySearchVolumes,
    competition: metric.competition,
    competitionIndex: metric.competitionIndex,
    lowTopOfPageBidMicros: metric.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: metric.highTopOfPageBidMicros,
    measuredAt: metric.measuredAt,
    unmatchedRequestedKeywords: input.result.unmatchedRequestedKeywords,
    durationMs: input.durationMs,
    apiRequestStarted: true,
  };
}

export async function runGoogleAdsSmoke(input: GoogleAdsSmokeInput, onStage?: (stage: GoogleAdsSmokeStage) => void) {
  const startedAt = Date.now();
  // This is the explicitly invoked local CLI smoke path. Product routes use
  // resolveGoogleAdsPlatformConfig() and never fall back to this ENV reader.
  const config = getGoogleAdsServerConfig();
  const client = createGoogleAdsRestClient({ config });
  onStage?.("oauth_resolution");
  onStage?.("account_resolution");
  const account = await resolveGoogleAdsAdvertiserAccount(client, { customerId: input.customerId, ...(input.loginCustomerId ? { loginCustomerId: input.loginCustomerId } : {}) });
  onStage?.("google_ads_request");
  const result = await generateGoogleAdsHistoricalMetrics(client, {
    account: { customerId: account.customerId, ...(account.loginCustomerId ? { loginCustomerId: account.loginCustomerId } : {}) },
    targeting: input.targeting,
    keywords: [input.keyword],
    includeAverageCpc: true,
  }, account);
  onStage?.("response_normalization");
  return sanitizeGoogleAdsSmokeResult({ smoke: input, account, result, durationMs: Date.now() - startedAt });
}
