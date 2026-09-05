import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleAdsError } from "@/lib/google/ads/errors";
import { createGoogleAdsRestClient, type GoogleAdsRestClient } from "@/lib/google/ads/client";
import {
  createGoogleAdsPlatformConfig,
  getGoogleAdsStaticPlatformConfig,
  GoogleAdsPlatformConfigError,
  type GoogleAdsPlatformConfig,
} from "@/lib/google/ads/config";
import { GoogleAdsTargetingSchema, type GoogleAdsAdvertiserAccount, type GoogleAdsTargeting } from "@/lib/google/ads/contracts";
import { GOOGLE_ADS_DISCOVERY_COUNTRY, GOOGLE_ADS_DISCOVERY_LANGUAGES, GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS } from "@/lib/minerador/google-ads-discovery-catalog";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationSecretStore, IntegrationSecretStoreError } from "@/lib/server/integration-secret-store";

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

type GoogleAdsSecretResolverClient = Pick<SupabaseClient, "from" | "rpc">;

export const GOOGLE_ADS_REFRESH_TOKEN_SECRET_NAME = "google_ads_refresh_token";
export const GOOGLE_ADS_REFRESH_TOKEN_SECRET_DESCRIPTION = "Google Ads OAuth refresh token; rotacionado pelo Admin global";

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
    | "GOOGLE_ADS_REFRESH_TOKEN_SECRET_MISSING"
    | "GOOGLE_ADS_REFRESH_TOKEN_SECRET_INVALID"
    | "GOOGLE_ADS_REFRESH_TOKEN_SECRET_UNAVAILABLE"
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
  if (error instanceof GoogleAdsPlatformConfigError) {
    if (error.code === "GOOGLE_ADS_REFRESH_TOKEN_SECRET_MISSING" || error.code === "GOOGLE_ADS_REFRESH_TOKEN_SECRET_INVALID" || error.code === "GOOGLE_ADS_REFRESH_TOKEN_SECRET_UNAVAILABLE") {
      throw new GoogleAdsConfigurationBlocker(error.code, error.message, 503);
    }
  }
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

/**
 * Resolves the only operational Google Ads credential authority. Static
 * configuration remains in ENV; the OAuth refresh token is read by reference
 * from the server-side Secret Store and never falls back to ENV.
 */
export async function resolveGoogleAdsPlatformConfig(
  client: GoogleAdsSecretResolverClient,
  environment: NodeJS.ProcessEnv = process.env,
  options: { requireReady?: boolean } = {},
): Promise<GoogleAdsPlatformConfig> {
  const staticConfig = getGoogleAdsStaticPlatformConfig(environment);
  const providerResult = await client.from("integration_providers")
    .select("id,status")
    .eq("provider_key", "google_ads")
    .maybeSingle();
  if (providerResult.error) {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_REFRESH_TOKEN_SECRET_UNAVAILABLE", "Não foi possível consultar a Connection canônica do Google Ads.");
  }
  const provider = providerResult.data as { id: string; status: string } | null;
  if (!provider || provider.status !== "active") {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_REFRESH_TOKEN_SECRET_MISSING", "A Connection canônica do Google Ads ainda não está configurada.");
  }

  let connectionQuery = client.from("integration_connections")
    .select("id,owner_scope_type,environment,lifecycle_status,secret_ref")
    .eq("provider_id", provider.id)
    .eq("owner_scope_type", "platform")
    .eq("environment", "production")
    .neq("lifecycle_status", "revoked");
  if (options.requireReady !== false) connectionQuery = connectionQuery.eq("lifecycle_status", "ready");
  const connectionResult = await connectionQuery.maybeSingle();
  if (connectionResult.error) {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_REFRESH_TOKEN_SECRET_UNAVAILABLE", "Não foi possível consultar a Connection canônica do Google Ads.");
  }
  const connection = connectionResult.data as { id: string; owner_scope_type: string; environment: string; lifecycle_status: string; secret_ref: string | null } | null;
  if (!connection?.secret_ref?.trim()) {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_REFRESH_TOKEN_SECRET_MISSING", "O OAuth Refresh Token Google Ads ainda não foi configurado no Secret Store.");
  }

  let refreshToken: string | null = null;
  try {
    refreshToken = await createIntegrationSecretStore(client).resolve(connection.secret_ref);
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError && error.code === "INTEGRATION_SECRET_REF_INVALID") {
      throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_REFRESH_TOKEN_SECRET_INVALID", "A referência do OAuth Refresh Token Google Ads é inválida.");
    }
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_REFRESH_TOKEN_SECRET_UNAVAILABLE", "O Secret Store do Google Ads não está disponível.");
  }
  return createGoogleAdsPlatformConfig(staticConfig, refreshToken);
}

export async function resolveGoogleAdsCanonicalContext(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  environment?: "development" | "test" | "staging" | "production";
  operation: GoogleAdsCanonicalOperation;
  config?: GoogleAdsPlatformConfig;
  secretResolverClient?: GoogleAdsSecretResolverClient;
}): Promise<GoogleAdsCanonicalContext> {
  let config: GoogleAdsPlatformConfig;
  try {
    config = input.config || await resolveGoogleAdsPlatformConfig(input.secretResolverClient || createCanonicalServiceClient());
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
