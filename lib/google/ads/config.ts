import { GoogleAdsError } from "./errors.ts";

export type GoogleAdsServerConfig = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId: string | null;
  apiVersion: GoogleAdsSupportedApiVersion;
};

export type GoogleAdsPlatformConfig = GoogleAdsServerConfig & {
  researchCustomerId: string;
};

export type GoogleAdsEnvironment = Record<string, string | undefined>;

const CUSTOMER_ID_PATTERN = /^\d{10}$/;
export const GOOGLE_ADS_SUPPORTED_API_VERSIONS = ["v25"] as const;
export type GoogleAdsSupportedApiVersion = typeof GOOGLE_ADS_SUPPORTED_API_VERSIONS[number];

export type GoogleAdsPlatformConfigErrorCode =
  | "GOOGLE_ADS_PLATFORM_ENV_MISSING"
  | "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING"
  | "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_INVALID";

export class GoogleAdsPlatformConfigError extends Error {
  readonly code: GoogleAdsPlatformConfigErrorCode;

  constructor(code: GoogleAdsPlatformConfigErrorCode, message: string) {
    super(message);
    this.name = "GoogleAdsPlatformConfigError";
    this.code = code;
  }
}

export function normalizeGoogleAdsCustomerId(value: string): string {
  const normalized = value.replace(/[\s-]/g, "");
  if (!CUSTOMER_ID_PATTERN.test(normalized)) throw new GoogleAdsError("google_ads_invalid_customer_id", { status: 400 });
  return normalized;
}

export function getGoogleAdsServerConfig(env: GoogleAdsEnvironment = process.env): GoogleAdsServerConfig {
  const required = [
    ["GOOGLE_ADS_DEVELOPER_TOKEN", env.GOOGLE_ADS_DEVELOPER_TOKEN],
    ["GOOGLE_ADS_CLIENT_ID", env.GOOGLE_ADS_CLIENT_ID],
    ["GOOGLE_ADS_CLIENT_SECRET", env.GOOGLE_ADS_CLIENT_SECRET],
    ["GOOGLE_ADS_REFRESH_TOKEN", env.GOOGLE_ADS_REFRESH_TOKEN],
    ["GOOGLE_ADS_API_VERSION", env.GOOGLE_ADS_API_VERSION],
  ] as const;
  if (required.some(([, value]) => !value?.trim())) throw new GoogleAdsError("google_ads_configuration", { status: 503 });

  const apiVersion = env.GOOGLE_ADS_API_VERSION!.trim();
  if (!GOOGLE_ADS_SUPPORTED_API_VERSIONS.includes(apiVersion as GoogleAdsSupportedApiVersion)) throw new GoogleAdsError("google_ads_configuration", { status: 503 });

  const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim()
    ? normalizeGoogleAdsCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    : null;

  return {
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN!.trim(),
    clientId: env.GOOGLE_ADS_CLIENT_ID!.trim(),
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!.trim(),
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN!.trim(),
    loginCustomerId,
    apiVersion: apiVersion as GoogleAdsSupportedApiVersion,
  };
}

/**
 * Google Ads is platform infrastructure. This resolver intentionally has no
 * database, Connection, Vault, binding, grant or quota dependency.
 */
export function getGoogleAdsPlatformConfig(env: GoogleAdsEnvironment = process.env): GoogleAdsPlatformConfig {
  const required = [
    env.GOOGLE_ADS_DEVELOPER_TOKEN,
    env.GOOGLE_ADS_CLIENT_ID,
    env.GOOGLE_ADS_CLIENT_SECRET,
    env.GOOGLE_ADS_REFRESH_TOKEN,
    env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  ];
  if (required.some((value) => !value?.trim())) {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_PLATFORM_ENV_MISSING", "A configuração server-side Google Ads está incompleta.");
  }

  let loginCustomerId: string;
  try {
    loginCustomerId = normalizeGoogleAdsCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!);
  } catch {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_PLATFORM_ENV_MISSING", "O Login Customer ID Google Ads é inválido.");
  }

  const researchValue = env.GOOGLE_ADS_RESEARCH_CUSTOMER_ID?.trim();
  if (!researchValue) {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING", "O Research Customer ID Google Ads não foi configurado.");
  }

  let researchCustomerId: string;
  try {
    researchCustomerId = normalizeGoogleAdsCustomerId(researchValue);
  } catch {
    throw new GoogleAdsPlatformConfigError("GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_INVALID", "O Research Customer ID Google Ads é inválido.");
  }

  return {
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN!.trim(),
    clientId: env.GOOGLE_ADS_CLIENT_ID!.trim(),
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!.trim(),
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN!.trim(),
    loginCustomerId,
    researchCustomerId,
    apiVersion: GOOGLE_ADS_SUPPORTED_API_VERSIONS[0],
  };
}
