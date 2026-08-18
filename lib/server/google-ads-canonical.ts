import "server-only";

import { GoogleAdsError } from "@/lib/google/ads/errors";
import { createGoogleAdsRestClient, type GoogleAdsRestClient } from "@/lib/google/ads/client";
import {
  getGoogleAdsPlatformConfig,
  type GoogleAdsPlatformConfig,
} from "@/lib/google/ads/config";
import { GoogleAdsTargetingSchema, type GoogleAdsAdvertiserAccount, type GoogleAdsTargeting } from "@/lib/google/ads/contracts";
import { GOOGLE_ADS_DISCOVERY_COUNTRY, GOOGLE_ADS_DISCOVERY_LANGUAGES, GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS } from "@/lib/minerador/google-ads-discovery-catalog";

export const GOOGLE_ADS_CAPABILITY_KEYS = {
  discovery: "google_ads_keyword_discovery",
  metrics: "google_ads_keyword_metrics",
} as const;

export function resolveGoogleAdsIntegrationEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.GOOGLE_ADS_INTEGRATION_ENVIRONMENT?.trim().toLowerCase();
  if (configured === "development" || configured === "test" || configured === "staging" || configured === "production") return configured;
  return "production" as const;
}

export type GoogleAdsCanonicalOperation = "discovery" | "metrics";

export type GoogleAdsCanonicalTargeting = {
  languageConstant: string;
  geoTargetConstants: string[];
  keywordPlanNetwork: GoogleAdsTargeting["keywordPlanNetwork"];
  includeAdultKeywords: boolean;
};

export type GoogleAdsCanonicalAccountState = {
  currencyCode: string;
  timeZone: string;
  validationStatus: "validated" | "invalid" | "pending" | "disabled";
  validatedAt: string | null;
};

export type GoogleAdsCanonicalContext = {
  actorUserId: string;
  agencyId: string | null;
  brandId: string;
  operation: GoogleAdsCanonicalOperation;
  config: GoogleAdsPlatformConfig;
  customerId: string;
  managerCustomerId: string;
  targeting: GoogleAdsCanonicalTargeting | null;
  accountState: GoogleAdsCanonicalAccountState | null;
};

export class GoogleAdsConfigurationBlocker extends Error {
  public readonly status: 409 | 503;
  public readonly code:
    | "GOOGLE_ADS_PLATFORM_ENV_MISSING"
    | "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING"
    | "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_INVALID"
    | "GOOGLE_ADS_MCC_MISSING"
    | "GOOGLE_ADS_CUSTOMER_MISSING"
    | "GOOGLE_ADS_TARGETING_NOT_CONFIGURED"
    | "GOOGLE_ADS_ACCOUNT_STATE_NOT_CONFIGURED"
    | "GOOGLE_ADS_ACCOUNT_STATE_INVALID"
    | "GOOGLE_ADS_PROVIDER_MISMATCH"
    | "GOOGLE_ADS_TARGETING_MISMATCH"
    | "GOOGLE_ADS_TARGETING_INVALID"
    | "GOOGLE_ADS_PLATFORM_READ_ONLY";

  constructor(code: GoogleAdsConfigurationBlocker["code"], message: string, status: 409 | 503 = 503) {
    super(message);
    this.name = "GoogleAdsConfigurationBlocker";
    this.code = code;
    this.status = status;
  }
}

export function defaultGoogleAdsCanonicalTargeting(): GoogleAdsCanonicalTargeting {
  return {
    languageConstant: GOOGLE_ADS_DISCOVERY_LANGUAGES["Português"],
    geoTargetConstants: [GOOGLE_ADS_DISCOVERY_COUNTRY.geoTargetConstant],
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false,
  };
}

function isSupportedCanonicalTargeting(targeting: GoogleAdsTargeting) {
  const supportedLanguages = new Set<string>(Object.values(GOOGLE_ADS_DISCOVERY_LANGUAGES));
  const supportedGeoTargets = new Set<string>([
    GOOGLE_ADS_DISCOVERY_COUNTRY.geoTargetConstant,
    ...Object.values(GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS),
  ]);
  const includesCountry = targeting.geoTargetConstants.includes(GOOGLE_ADS_DISCOVERY_COUNTRY.geoTargetConstant);
  return supportedLanguages.has(targeting.language)
    && targeting.geoTargetConstants.length >= 1
    && new Set(targeting.geoTargetConstants).size === targeting.geoTargetConstants.length
    && (!includesCountry || targeting.geoTargetConstants.length === 1)
    && targeting.geoTargetConstants.every(value => supportedGeoTargets.has(value));
}

export function canonicalTargetingFromInput(input: GoogleAdsTargeting): GoogleAdsCanonicalTargeting {
  const parsed = GoogleAdsTargetingSchema.parse(input);
  if (!isSupportedCanonicalTargeting(parsed)) {
    throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_TARGETING_INVALID", "O targeting Google Ads informado não pertence ao catálogo canônico ou contém localidades inválidas.", 409);
  }
  return {
    languageConstant: parsed.language,
    geoTargetConstants: parsed.geoTargetConstants,
    keywordPlanNetwork: parsed.keywordPlanNetwork,
    includeAdultKeywords: parsed.includeAdultKeywords,
  };
}

export function targetingToProviderInput(targeting: GoogleAdsCanonicalTargeting): GoogleAdsTargeting {
  return {
    language: targeting.languageConstant,
    geoTargetConstants: targeting.geoTargetConstants,
    keywordPlanNetwork: targeting.keywordPlanNetwork,
    includeAdultKeywords: targeting.includeAdultKeywords,
  };
}

export function canonicalTargetingEquals(left: GoogleAdsCanonicalTargeting, right: GoogleAdsCanonicalTargeting) {
  return left.languageConstant === right.languageConstant
    && left.keywordPlanNetwork === right.keywordPlanNetwork
    && left.includeAdultKeywords === right.includeAdultKeywords
    && left.geoTargetConstants.length === right.geoTargetConstants.length
    && left.geoTargetConstants.every((value, index) => value === right.geoTargetConstants[index]);
}

export function assertCanonicalTargeting(input: GoogleAdsTargeting, canonical: GoogleAdsCanonicalTargeting) {
  const requested = canonicalTargetingFromInput(input);
  if (!canonicalTargetingEquals(requested, canonical)) {
    throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_TARGETING_MISMATCH", "O targeting solicitado diverge da configuração canônica Google Ads.", 409);
  }
}

export function assertCanonicalAccountState(account: GoogleAdsAdvertiserAccount, state: GoogleAdsCanonicalAccountState) {
  if (state.validationStatus !== "validated" || !state.validatedAt) {
    throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_ACCOUNT_STATE_INVALID", "A conta Google Ads não possui validação canônica vigente.", 409);
  }
  if (account.currencyCode !== state.currencyCode || account.timeZone !== state.timeZone) {
    throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_ACCOUNT_STATE_INVALID", "A moeda ou o timezone retornado divergiram do estado canônico da conta.", 409);
  }
}

function configBlocker(error: unknown): never {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: string }).code);
    if (code === "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING") {
      throw new GoogleAdsConfigurationBlocker(code, "O Research Customer ID Google Ads não foi configurado.", 409);
    }
    if (code === "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_INVALID") {
      throw new GoogleAdsConfigurationBlocker(code, "O Research Customer ID Google Ads é inválido.", 409);
    }
  }
  if (error instanceof GoogleAdsError && error.code === "google_ads_invalid_customer_id") {
    throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_MCC_MISSING", "O Login Customer ID Google Ads é inválido.", 409);
  }
  throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_PLATFORM_ENV_MISSING", "A configuração server-side Google Ads está incompleta.", 503);
}

/** Resolves only platform environment variables; no database or secret store is consulted. */
export async function resolveGoogleAdsCanonicalContext(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  environment?: "development" | "test" | "staging" | "production";
  operation: GoogleAdsCanonicalOperation;
}): Promise<GoogleAdsCanonicalContext> {
  let config: GoogleAdsPlatformConfig;
  try {
    config = getGoogleAdsPlatformConfig();
  } catch (error) {
    return configBlocker(error);
  }
  return {
    actorUserId: input.actorUserId,
    agencyId: input.agencyId || null,
    brandId: input.brandId,
    operation: input.operation,
    config,
    customerId: config.researchCustomerId,
    managerCustomerId: config.loginCustomerId || "",
    targeting: null,
    accountState: null,
  };
}

export async function createGoogleAdsCanonicalClient(input: {
  context: GoogleAdsCanonicalContext;
  fetchFn?: typeof fetch;
}): Promise<{ client: GoogleAdsRestClient; config: GoogleAdsPlatformConfig }> {
  return {
    client: createGoogleAdsRestClient({ config: input.context.config, fetchFn: input.fetchFn }),
    config: input.context.config,
  };
}

/** Brand account binding is reserved for future account-management operations. */
export async function ensureGoogleAdsExternalAccountBinding() {
  throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_PLATFORM_READ_ONLY", "Google Ads usa infraestrutura fixa da Plataforma; Customer ID de Brand não é necessário para esta operação.", 409);
}

/** Account configuration is derived from platform env and is not persisted by this path. */
export async function persistGoogleAdsCanonicalConfiguration() {
  throw new GoogleAdsConfigurationBlocker("GOOGLE_ADS_PLATFORM_READ_ONLY", "A configuração Google Ads é somente leitura no runtime da Plataforma.", 409);
}
