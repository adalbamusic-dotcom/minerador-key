import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTenantId } from "@/lib/tenant-routing";
import { getGoogleAdsStaticConfigStatus, normalizeGoogleAdsCustomerId, normalizeGoogleAdsRefreshToken, GoogleAdsPlatformConfigError, type GoogleAdsStaticConfigStatus } from "@/lib/google/ads/config";
import { createIntegrationSecretStore, IntegrationSecretStoreError } from "@/lib/server/integration-secret-store";
import { PlatformHealthCheckError, runPlatformProviderHealthProbe, type PlatformHealthOperation, type PlatformHealthProviderKey } from "@/lib/server/platform-integrations-health";
import { DEEPSEEK_DEFAULT_MODEL } from "@/lib/server/deepseek-canonical";
import {
  GOOGLE_CLOUD_SERVICE_ACCOUNT_SECRET_DESCRIPTION,
  GOOGLE_CLOUD_SERVICE_ACCOUNT_SECRET_NAME,
  readGoogleCloudMediaBucketName,
  YOUTUBE_DATA_API_KEY_SECRET_DESCRIPTION,
  YOUTUBE_DATA_API_KEY_SECRET_NAME,
  normalizeGoogleCloudServiceAccountSecret,
  normalizeMediaBucketName,
  normalizeYouTubeDataApiSecret,
} from "@/lib/server/google-cloud/contracts";
import {
  INTEGRATION_CAPABILITY_OPERATIONS,
  INTEGRATION_ENVIRONMENTS,
  type IntegrationCapabilityOperation,
  type IntegrationEnvironment,
} from "@/lib/server/integrations-runtime";
import {
  GOOGLE_ADS_REFRESH_TOKEN_SECRET_DESCRIPTION,
  GOOGLE_ADS_REFRESH_TOKEN_SECRET_NAME,
  resolveGoogleAdsPlatformConfig,
} from "@/lib/server/google-ads-canonical";
import {
  TELEGRAM_BOT_TOKEN_SECRET_DESCRIPTION,
  TELEGRAM_BOT_TOKEN_SECRET_NAME,
  createTelegramWebhookSecret,
  normalizeTelegramSecret,
  parseTelegramConfigurationInput,
  parseTelegramSecret,
  type TelegramConfigurationInput,
} from "@/lib/server/telegram/contracts";
import type { StorageClientFactory } from "@/lib/server/google-cloud/storage-operation";

type QueryClient = Pick<SupabaseClient, "from">;
type SecretMutationClient = Pick<SupabaseClient, "from" | "rpc">;

export type SupportedPlatformProviderKey = "google_ads" | "dataforseo" | "deepseek" | "google_cloud" | "youtube_data" | "telegram";

export const PLATFORM_ACCESS_POLICY = "HOMOLOGATION_ALLOW_ALL" as const;
export type PlatformAccessPolicy = typeof PLATFORM_ACCESS_POLICY;

export const PLATFORM_CAPABILITY_CATALOG = [
  { capabilityKey: "dataforseo.allintitle", providerKey: "dataforseo", operationKind: "allintitle", unitName: "request" },
  { capabilityKey: "dataforseo.serp_compatibility", providerKey: "dataforseo", operationKind: "serp_compatibility", unitName: "request" },
  { capabilityKey: "google_ads_keyword_discovery", providerKey: "google_ads", operationKind: "keyword_discovery", unitName: "request" },
  { capabilityKey: "google_ads_keyword_metrics", providerKey: "google_ads", operationKind: "keyword_metrics", unitName: "request" },
  { capabilityKey: "ai_generation", providerKey: "deepseek", operationKind: "ai_generation", unitName: "request" },
  { capabilityKey: "google_cloud.speech_transcription", providerKey: "google_cloud", operationKind: "speech_transcription", unitName: "request" },
  { capabilityKey: "google_cloud.storage_media", providerKey: "google_cloud", operationKind: "storage_media", unitName: "request" },
  { capabilityKey: "youtube.video_metadata", providerKey: "youtube_data", operationKind: "youtube_video_metadata", unitName: "request" },
  { capabilityKey: "telegram.message_send", providerKey: "telegram", operationKind: "telegram_message_send", unitName: "request" },
  { capabilityKey: "telegram.file_fetch", providerKey: "telegram", operationKind: "telegram_file_fetch", unitName: "request" },
] as const;

export type PlatformCapabilityCatalogEntry = (typeof PLATFORM_CAPABILITY_CATALOG)[number];

const SUPPORTED_PLATFORM_PROVIDERS: Record<SupportedPlatformProviderKey, { displayName: string; secretName: string; secretDescription: string }> = {
  google_ads: { displayName: "Google Ads", secretName: "google_ads_platform", secretDescription: "Google Ads platform credential" },
  dataforseo: { displayName: "DataForSEO", secretName: "dataforseo_platform", secretDescription: "DataForSEO platform credential" },
  deepseek: { displayName: "DeepSeek", secretName: "deepseek_platform", secretDescription: "DeepSeek platform credential" },
  google_cloud: { displayName: "Google Cloud Media", secretName: GOOGLE_CLOUD_SERVICE_ACCOUNT_SECRET_NAME, secretDescription: GOOGLE_CLOUD_SERVICE_ACCOUNT_SECRET_DESCRIPTION },
  youtube_data: { displayName: "YouTube Data API", secretName: YOUTUBE_DATA_API_KEY_SECRET_NAME, secretDescription: YOUTUBE_DATA_API_KEY_SECRET_DESCRIPTION },
  telegram: { displayName: "Telegram Bot", secretName: TELEGRAM_BOT_TOKEN_SECRET_NAME, secretDescription: TELEGRAM_BOT_TOKEN_SECRET_DESCRIPTION },
};

function isSupportedPlatformProviderKey(value: string): value is SupportedPlatformProviderKey {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_PLATFORM_PROVIDERS, value);
}

export type IntegrationAdminProvider = {
  id: string;
  providerKey: string;
  displayName: string;
  status: "active" | "disabled" | "legacy";
};

export type IntegrationAdminCapability = {
  id: string;
  capabilityKey: string;
  operationKind: IntegrationCapabilityOperation;
  environment: IntegrationEnvironment;
  unitName: string;
  status: "active" | "disabled" | "legacy";
};

export type IntegrationAdminHealthCheck = {
  status: "ready" | "error" | null;
  checkedAt: string | null;
  code: string | null;
  message: string | null;
  providerRequestRef: string | null;
  stage: string | null;
  httpStatus: string | null;
  googleAdsCode: string | null;
  currentModel: string | null;
  currentModelAvailable: boolean | null;
  details: Record<string, string | null>;
};

export type IntegrationAdminConnection = {
  id: string;
  providerKey: string;
  providerName: string;
  label: string | null;
  ownerScope: "platform";
  environment: IntegrationEnvironment;
  lifecycleStatus: "draft" | "pending" | "ready" | "error" | "disabled" | "revoked";
  secretConfigured: boolean;
  configuredModel: string | null;
  managerCustomerIdConfigured: boolean;
  researchCustomerId: string | null;
  healthCheck: IntegrationAdminHealthCheck;
  googleCloudBucketName: string | null;
  googleCloudHealth: {
    speech: IntegrationAdminHealthCheck | null;
    storage: IntegrationAdminHealthCheck | null;
  } | null;
  telegramWebhookConfigured: boolean;
  telegramWebhookUrl: string | null;
};

export type IntegrationAdminGrant = {
  id: string;
  capabilityKey: string;
  targetScope: "agency" | "brand";
  targetId: string;
  targetName: string;
  sourceScope: "platform" | "agency";
  sourceAgencyName: string | null;
  environment: IntegrationEnvironment;
  lifecycleStatus: "active" | "revoked" | "expired";
  startsAt: string;
  endsAt: string | null;
};

export type IntegrationAdminQuota = {
  id: string;
  capabilityKey: string;
  scope: "platform" | "agency" | "brand";
  scopeName: string;
  environment: IntegrationEnvironment;
  windowKind: "none" | "calendar_day" | "calendar_month" | "rolling";
  limitUnits: number | null;
  status: "active" | "disabled";
  periodStartedAt: string | null;
  periodEndsAt: string | null;
};

export type IntegrationAdminUsage = {
  providerName: string;
  capabilityKey: string;
  agencyName: string | null;
  brandName: string | null;
  operationKind: string;
  environment: IntegrationEnvironment;
  units: number;
  unitName: string;
  costAmount: number | null;
  currencyCode: string | null;
  resultStatus: string;
  occurredAt: string;
};

export type IntegrationAdminAgency = {
  id: string;
  name: string;
};

export type PlatformIntegrationsSnapshot = {
  platformAccessPolicy: PlatformAccessPolicy;
  googleAdsStaticConfig: GoogleAdsStaticConfigStatus;
  providers: IntegrationAdminProvider[];
  capabilities: IntegrationAdminCapability[];
  platformConnections: IntegrationAdminConnection[];
  agencies: IntegrationAdminAgency[];
  grants: IntegrationAdminGrant[];
  quotas: IntegrationAdminQuota[];
  usageEvents: IntegrationAdminUsage[];
  summary: {
    agencyGrantCount: number;
    bindingCount: number;
    quotaPolicyCount: number;
    usageEventCount: number;
    succeededUsageUnits: number;
  };
};

/**
 * Capabilities remain provider-independent in the canonical schema. The
 * current catalog uses a provider prefix where a platform policy can safely
 * determine the compatible READY connection without adding a provider FK.
 */
export function providerKeyForPlatformCapability(capabilityKey: string): SupportedPlatformProviderKey | null {
  const normalized = capabilityKey.trim().toLowerCase();
  const catalogEntry = PLATFORM_CAPABILITY_CATALOG.find((entry) => entry.capabilityKey === normalized);
  if (catalogEntry) return catalogEntry.providerKey;
  if (normalized.startsWith("google_ads.") || normalized.startsWith("google_ads_")) return "google_ads";
  if (normalized.startsWith("dataforseo.") || normalized.startsWith("dataforseo_")) return "dataforseo";
  if (normalized.startsWith("deepseek.") || normalized.startsWith("deepseek_")) return "deepseek";
  if (normalized.startsWith("google_cloud.") || normalized.startsWith("google_cloud_")) return "google_cloud";
  if (normalized.startsWith("youtube.") || normalized.startsWith("youtube_")) return "youtube_data";
  if (normalized.startsWith("telegram.") || normalized.startsWith("telegram_")) return "telegram";
  return null;
}

export class PlatformIntegrationsAdminError extends Error {
  public readonly status: 400 | 404 | 409 | 502 | 503;
  public readonly code: string;
  public readonly diagnostics: Record<string, string | null>;
  public readonly providerRequestRef: string | null;

  constructor(status: 400 | 404 | 409 | 502 | 503, code: string, message: string, diagnostics: Record<string, string | null> = {}, providerRequestRef: string | null = null) {
    super(message);
    this.name = "PlatformIntegrationsAdminError";
    this.status = status;
    this.code = code;
    this.diagnostics = diagnostics;
    this.providerRequestRef = providerRequestRef;
  }
}

function failRemote(message: string): never {
  throw new PlatformIntegrationsAdminError(503, "INTEGRATIONS_REMOTE_UNAVAILABLE", message);
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", `${field} é obrigatório.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", `${field} é inválido.`);
  return normalized;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", `${field} é inválido.`);
  return value as T[number];
}

function key(value: unknown, field: string, pattern: RegExp) {
  const normalized = text(value, field, 160);
  if (normalized !== normalized.toLowerCase() || !pattern.test(normalized)) {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", `${field} deve usar o formato canônico.`);
  }
  return normalized;
}

function rejectLegacyProvider(providerKey: string) {
  if (providerKey === "serper" || providerKey === "rapidapi") {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_PROVIDER_NOT_ALLOWED", "Esse provider legado não pode ser cadastrado no novo contrato.");
  }
}

function resultError(result: { error: { code?: string; message?: string } | null }, message: string): never | void {
  if (!result.error) return;
  if (result.error.code === "23505") throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_DUPLICATE", "Já existe um registro com essa chave no catálogo.");
  const databaseCode = typeof result.error.code === "string" && /^[A-Z0-9_]{3,80}$/.test(result.error.code)
    ? result.error.code
    : null;
  const constraintMatch = typeof result.error.message === "string"
    ? result.error.message.match(/constraint\s+\"([A-Za-z0-9_]{1,120})\"/i)
    : null;
  const databaseConstraint = constraintMatch?.[1] && /^[A-Za-z0-9_]{1,120}$/.test(constraintMatch[1]) ? constraintMatch[1] : null;
  throw new PlatformIntegrationsAdminError(503, "INTEGRATIONS_REMOTE_UNAVAILABLE", message, { databaseCode, databaseConstraint });
}

function providerMap(rows: Array<{ id: string; provider_key: string; display_name: string; status: IntegrationAdminProvider["status"] }>) {
  return new Map(rows.map((row) => [row.id, row]));
}

function capabilityMap(rows: Array<{ id: string; capability_key: string; operation_kind: IntegrationCapabilityOperation; environment: IntegrationEnvironment; unit_name: string; status: IntegrationAdminCapability["status"] }>) {
  return new Map(rows.map((row) => [row.id, row]));
}

function hasGoogleAdsManagerCustomerId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const googleAds = (metadata as Record<string, unknown>).google_ads;
  if (!googleAds || typeof googleAds !== "object" || Array.isArray(googleAds)) return false;
  const managerCustomerId = (googleAds as Record<string, unknown>).manager_customer_id;
  return typeof managerCustomerId === "string" && /^\d{10}$/.test(managerCustomerId.trim());
}

function readGoogleAdsResearchCustomerId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).google_ads_research_customer_id;
  if (typeof value !== "string") return null;
  try {
    return normalizeGoogleAdsCustomerId(value);
  } catch {
    return null;
  }
}

function readDeepSeekConfiguredModel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return DEEPSEEK_DEFAULT_MODEL;
  const record = metadata as Record<string, unknown>;
  const value = record.deepseek_model ?? (record.deepseek && typeof record.deepseek === "object" && !Array.isArray(record.deepseek) ? (record.deepseek as Record<string, unknown>).model : null);
  return typeof value === "string" && value.trim() ? value.trim() : DEEPSEEK_DEFAULT_MODEL;
}

export async function readPlatformIntegrations(client: QueryClient): Promise<PlatformIntegrationsSnapshot> {
  const [providersResult, capabilitiesResult, connectionsResult, grantsResult, bindingsResult, quotasResult, usageResult, usageAggregateResult, agenciesResult, brandsResult] = await Promise.all([
    client.from("integration_providers").select("id,provider_key,display_name,status").order("display_name", { ascending: true }),
    client.from("integration_capabilities").select("id,capability_key,operation_kind,environment,unit_name,status").order("capability_key", { ascending: true }),
    client.from("integration_connections").select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref,metadata").eq("owner_scope_type", "platform").order("created_at", { ascending: false }),
    client.from("integration_grants").select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,source_scope_type,source_agency_id,environment,lifecycle_status,starts_at,ends_at").order("created_at", { ascending: false }),
    client.from("integration_bindings").select("id", { count: "exact", head: false }),
    client.from("integration_quota_policies").select("id,capability_id,scope_type,agency_id,brand_id,environment,window_kind,limit_units,status,period_started_at,period_ends_at").order("created_at", { ascending: false }),
    client.from("integration_usage_events").select("provider_id,capability_id,agency_id,brand_id,operation_kind,environment,units,unit_name,cost_amount,currency_code,result_status,occurred_at", { count: "exact" }).order("occurred_at", { ascending: false }).limit(100),
    client.from("integration_usage_events").select("units,result_status"),
    client.from("agencies").select("id,name"),
    client.from("marcas").select("id,nome"),
  ]);

  for (const [result, message] of [
    [providersResult, "Não foi possível consultar o catálogo de providers."],
    [capabilitiesResult, "Não foi possível consultar o catálogo de capabilities."],
    [connectionsResult, "Não foi possível consultar as connections da Plataforma."],
    [grantsResult, "Não foi possível consultar os grants de integração."],
    [bindingsResult, "Não foi possível consultar os bindings de integração."],
    [quotasResult, "Não foi possível consultar as policies de quota."],
    [usageResult, "Não foi possível consultar o ledger de usage."],
    [usageAggregateResult, "Não foi possível agregar o ledger de usage."],
    [agenciesResult, "Não foi possível consultar os nomes das Agencies."],
    [brandsResult, "Não foi possível consultar os nomes das Brands."],
  ] as const) {
    if (result.error) failRemote(message);
  }

  const providers = (providersResult.data || []) as Array<{ id: string; provider_key: string; display_name: string; status: IntegrationAdminProvider["status"] }>;
  const operationalProviders = providers.filter((provider) => isSupportedPlatformProviderKey(provider.provider_key));
  const capabilities = (capabilitiesResult.data || []) as Array<{ id: string; capability_key: string; operation_kind: IntegrationCapabilityOperation; environment: IntegrationEnvironment; unit_name: string; status: IntegrationAdminCapability["status"] }>;
  const providerById = providerMap(providers);
  const capabilityById = capabilityMap(capabilities);
  const agencyById = new Map((agenciesResult.data || []).map((row) => [row.id, row.name]));
  const brandById = new Map((brandsResult.data || []).map((row) => [row.id, row.nome]));

  const persistedPlatformConnections = ((connectionsResult.data || []) as Array<{ id: string; provider_id: string; owner_scope_type: "platform"; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; secret_ref: string | null; metadata: Record<string, unknown> | null }>).map((row) => {
    const providerKey = providerById.get(row.provider_id)?.provider_key || "Provider não encontrado";
    const telegramState = telegramWebhookState(row.metadata);
    const healthCheck = safeHealthCheck(safeMetadata(row.metadata).health_check);
    return {
      id: row.id,
      providerKey,
      providerName: providerById.get(row.provider_id)?.display_name || "Provider não encontrado",
      label: typeof row.metadata?.label === "string" ? row.metadata.label : null,
      ownerScope: "platform" as const,
      environment: row.environment,
      lifecycleStatus: row.lifecycle_status,
      secretConfigured: Boolean(row.secret_ref?.trim()),
      configuredModel: providerKey === "deepseek" ? readDeepSeekConfiguredModel(row.metadata) : null,
      managerCustomerIdConfigured: providerKey === "google_ads" && hasGoogleAdsManagerCustomerId(row.metadata),
      researchCustomerId: providerKey === "google_ads" ? readGoogleAdsResearchCustomerId(row.metadata) : null,
      healthCheck,
      googleCloudBucketName: providerKey === "google_cloud" ? readGoogleCloudMediaBucketName(row.metadata) : null,
      googleCloudHealth: providerKey === "google_cloud" ? safeGoogleCloudHealth(safeMetadata(row.metadata).google_cloud_health, healthCheck) : null,
      ...telegramState,
    };
  }).filter((connection) => isSupportedPlatformProviderKey(connection.providerKey));
  const googleAdsStaticConfig = getGoogleAdsStaticConfigStatus();
  const persistedGoogleAdsConnection = persistedPlatformConnections.find((connection) => connection.providerKey === "google_ads" && connection.environment === "production");
  const googleAdsPlatformConnection: IntegrationAdminConnection = persistedGoogleAdsConnection || {
    id: "google_ads_platform_connection",
    providerKey: "google_ads",
    providerName: "Google Ads",
    label: "Plataforma / infraestrutura",
    ownerScope: "platform",
    environment: "production",
    lifecycleStatus: "error",
    secretConfigured: false,
    configuredModel: null,
    managerCustomerIdConfigured: googleAdsStaticConfig.loginCustomerIdConfigured,
    researchCustomerId: null,
    healthCheck: {
      status: "error",
      checkedAt: null,
      code: "GOOGLE_ADS_REFRESH_TOKEN_SECRET_MISSING",
      message: "O OAuth Refresh Token Google Ads ainda não foi configurado no Secret Store.",
      providerRequestRef: null,
      stage: "configuration",
      httpStatus: null,
      googleAdsCode: null,
      currentModel: null,
    currentModelAvailable: null,
      details: {},
    },
    googleCloudBucketName: null,
    googleCloudHealth: null,
    telegramWebhookConfigured: false,
    telegramWebhookUrl: null,
  };
  const platformConnections = [googleAdsPlatformConnection, ...persistedPlatformConnections.filter((connection) => connection.providerKey !== "google_ads")];

  const grants = ((grantsResult.data || []) as Array<{ id: string; capability_id: string; target_scope_type: "agency" | "brand"; target_agency_id: string | null; target_brand_id: string | null; source_scope_type: "platform" | "agency"; source_agency_id: string | null; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminGrant["lifecycleStatus"]; starts_at: string; ends_at: string | null }>).map((row) => ({
    id: row.id,
    capabilityKey: capabilityById.get(row.capability_id)?.capability_key || "Capability não encontrada",
    targetScope: row.target_scope_type,
    targetId: row.target_scope_type === "agency" ? row.target_agency_id || "" : row.target_brand_id || "",
    targetName: row.target_scope_type === "agency" ? agencyById.get(row.target_agency_id || "") || "Agency não encontrada" : brandById.get(row.target_brand_id || "") || "Brand não encontrada",
    sourceScope: row.source_scope_type,
    sourceAgencyName: row.source_agency_id ? agencyById.get(row.source_agency_id) || "Agency não encontrada" : null,
    environment: row.environment,
    lifecycleStatus: row.lifecycle_status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));

  const quotas = ((quotasResult.data || []) as Array<{ id: string; capability_id: string; scope_type: IntegrationAdminQuota["scope"]; agency_id: string | null; brand_id: string | null; environment: IntegrationEnvironment; window_kind: IntegrationAdminQuota["windowKind"]; limit_units: number | string | null; status: IntegrationAdminQuota["status"]; period_started_at: string | null; period_ends_at: string | null }>).map((row) => ({
    id: row.id,
    capabilityKey: capabilityById.get(row.capability_id)?.capability_key || "Capability não encontrada",
    scope: row.scope_type,
    scopeName: row.scope_type === "platform" ? "Plataforma" : row.scope_type === "agency" ? agencyById.get(row.agency_id || "") || "Agency não encontrada" : brandById.get(row.brand_id || "") || "Brand não encontrada",
    environment: row.environment,
    windowKind: row.window_kind,
    limitUnits: row.limit_units === null ? null : Number(row.limit_units),
    status: row.status,
    periodStartedAt: row.period_started_at,
    periodEndsAt: row.period_ends_at,
  }));

  const usageEvents = ((usageResult.data || []) as Array<{ provider_id: string; capability_id: string; agency_id: string | null; brand_id: string | null; operation_kind: string; environment: IntegrationEnvironment; units: number | string; unit_name: string; cost_amount: number | string | null; currency_code: string | null; result_status: string; occurred_at: string }>).map((row) => ({
    providerName: providerById.get(row.provider_id)?.display_name || "Provider não encontrado",
    capabilityKey: capabilityById.get(row.capability_id)?.capability_key || "Capability não encontrada",
    agencyName: row.agency_id ? agencyById.get(row.agency_id) || "Agency não encontrada" : null,
    brandName: row.brand_id ? brandById.get(row.brand_id) || "Brand não encontrada" : null,
    operationKind: row.operation_kind,
    environment: row.environment,
    units: Number(row.units),
    unitName: row.unit_name,
    costAmount: row.cost_amount === null ? null : Number(row.cost_amount),
    currencyCode: row.currency_code,
    resultStatus: row.result_status,
    occurredAt: row.occurred_at,
  }));
  const usageAggregate = (usageAggregateResult.data || []) as Array<{ units: number | string; result_status: string }>;

  return {
    platformAccessPolicy: PLATFORM_ACCESS_POLICY,
    googleAdsStaticConfig,
    providers: operationalProviders.map((row) => ({ id: row.id, providerKey: row.provider_key, displayName: row.display_name, status: row.status })),
    capabilities: capabilities.map((row) => ({ id: row.id, capabilityKey: row.capability_key, operationKind: row.operation_kind, environment: row.environment, unitName: row.unit_name, status: row.status })),
    platformConnections,
    agencies: (agenciesResult.data || []).map((row) => ({ id: row.id, name: row.name })),
    grants,
    quotas,
    usageEvents,
    summary: {
      agencyGrantCount: new Set(grants.filter((row) => row.targetScope === "agency" && row.lifecycleStatus === "active").map((row) => row.targetId)).size,
      bindingCount: bindingsResult.count || 0,
      quotaPolicyCount: quotas.length,
      usageEventCount: usageResult.count || 0,
      succeededUsageUnits: usageAggregate.filter((row) => row.result_status === "succeeded").reduce((sum, row) => sum + Number(row.units), 0),
    },
  };
}

export async function createPlatformIntegrationProvider(client: QueryClient, input: { providerKey: unknown; displayName: unknown; status: unknown }) {
  const providerKey = key(input.providerKey, "providerKey", /^[a-z0-9][a-z0-9_]*$/);
  rejectLegacyProvider(providerKey);
  if (providerKey === "google_ads") {
    throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Google Ads possui provider canônico fixo e não aceita cadastro manual.");
  }
  const displayName = text(input.displayName, "displayName", 160);
  const status = enumValue(input.status ?? "active", ["active", "disabled", "legacy"] as const, "status");
  const result = await client.from("integration_providers").insert({ provider_key: providerKey, display_name: displayName, status }).select("id,provider_key,display_name,status").single();
  resultError(result, "Não foi possível cadastrar o provider.");
  return result.data;
}

export async function updatePlatformIntegrationProvider(client: QueryClient, input: { id: unknown; displayName?: unknown; status?: unknown }) {
  const id = text(input.id, "id", 80);
  if (!isTenantId(id)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "O provider solicitado é inválido.");
  const currentResult = await client.from("integration_providers").select("id,provider_key").eq("id", id).maybeSingle();
  if (currentResult.error) failRemote("Não foi possível validar o provider solicitado.");
  if (!currentResult.data) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Provider não encontrado.");
  if (currentResult.data.provider_key === "google_ads") {
    throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Google Ads possui provider canônico fixo e não aceita edição estrutural.");
  }
  const patch: Record<string, string> = {};
  if (typeof input.displayName !== "undefined") patch.display_name = text(input.displayName, "displayName", 160);
  if (typeof input.status !== "undefined") patch.status = enumValue(input.status, ["active", "disabled", "legacy"] as const, "status");
  if (!Object.keys(patch).length) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "Nenhuma alteração foi informada.");
  const result = await client.from("integration_providers").update(patch).eq("id", id).select("id,provider_key,display_name,status").maybeSingle();
  resultError(result, "Não foi possível alterar o provider.");
  if (!result.data) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Provider não encontrado.");
  return result.data;
}

export async function createPlatformIntegrationCapability(client: QueryClient, input: { capabilityKey: unknown; operationKind: unknown; environment: unknown; unitName: unknown; status: unknown }) {
  const capabilityKey = key(input.capabilityKey, "capabilityKey", /^[a-z0-9][a-z0-9_.-]*$/);
  if (providerKeyForPlatformCapability(capabilityKey) === "google_ads") {
    throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Capabilities Google Ads pertencem ao catálogo canônico e não aceitam cadastro manual.");
  }
  const operationKind = enumValue(input.operationKind, INTEGRATION_CAPABILITY_OPERATIONS, "operationKind");
  const environment = enumValue(input.environment, INTEGRATION_ENVIRONMENTS, "environment");
  const unitName = text(input.unitName, "unitName", 80);
  const status = enumValue(input.status ?? "active", ["active", "disabled", "legacy"] as const, "status");
  const result = await client.from("integration_capabilities").insert({ capability_key: capabilityKey, operation_kind: operationKind, environment, unit_name: unitName, status }).select("id,capability_key,operation_kind,environment,unit_name,status").single();
  resultError(result, "Não foi possível cadastrar a capability.");
  return result.data;
}

export async function updatePlatformIntegrationCapability(client: QueryClient, input: { id: unknown; unitName?: unknown; status?: unknown }) {
  const id = text(input.id, "id", 80);
  if (!isTenantId(id)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "A capability solicitada é inválida.");
  const currentResult = await client.from("integration_capabilities").select("id,capability_key").eq("id", id).maybeSingle();
  if (currentResult.error) failRemote("Não foi possível validar a capability solicitada.");
  if (!currentResult.data) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Capability não encontrada.");
  if (providerKeyForPlatformCapability(currentResult.data.capability_key) === "google_ads") {
    throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Capabilities Google Ads pertencem ao catálogo canônico e não aceitam edição estrutural.");
  }
  const patch: Record<string, string> = {};
  if (typeof input.unitName !== "undefined") patch.unit_name = text(input.unitName, "unitName", 80);
  if (typeof input.status !== "undefined") patch.status = enumValue(input.status, ["active", "disabled", "legacy"] as const, "status");
  if (!Object.keys(patch).length) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "Nenhuma alteração foi informada.");
  const result = await client.from("integration_capabilities").update(patch).eq("id", id).select("id,capability_key,operation_kind,environment,unit_name,status").maybeSingle();
  resultError(result, "Não foi possível alterar a capability.");
  if (!result.data) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Capability não encontrada.");
  return result.data;
}

export async function bootstrapPlatformCapabilityCatalog(client: QueryClient, actorUserId: string) {
  const existingResult = await client.from("integration_capabilities")
    .select("id,capability_key,operation_kind,environment,unit_name,status")
    .in("capability_key", PLATFORM_CAPABILITY_CATALOG.map((entry) => entry.capabilityKey));
  if (existingResult.error) failRemote("Não foi possível consultar o catálogo de capabilities para o bootstrap.");

  const existingByKey = new Map((existingResult.data || []).map((row) => [row.capability_key, row as { id: string; capability_key: string; operation_kind: string; environment: string; unit_name: string; status: string }]));
  const inserted: string[] = [];
  const alreadyPresent: string[] = [];
  const conflicts: Array<{ capabilityKey: string; reason: string }> = [];

  for (const entry of PLATFORM_CAPABILITY_CATALOG) {
    const existing = existingByKey.get(entry.capabilityKey);
    if (existing) {
      const contractMatches = existing.operation_kind === entry.operationKind && existing.environment === "production" && existing.unit_name === entry.unitName;
      if (!contractMatches) conflicts.push({ capabilityKey: entry.capabilityKey, reason: "existing_contract_mismatch" });
      else alreadyPresent.push(entry.capabilityKey);
      continue;
    }

    const insertResult = await client.from("integration_capabilities").insert({
      capability_key: entry.capabilityKey,
      operation_kind: entry.operationKind,
      environment: "production",
      unit_name: entry.unitName,
      status: "active",
    }).select("id,capability_key,operation_kind,environment,unit_name,status").single();
    if (insertResult.error) {
      if (insertResult.error.code === "23505") {
        const concurrentResult = await client.from("integration_capabilities").select("id,capability_key,operation_kind,environment,unit_name,status").eq("capability_key", entry.capabilityKey).maybeSingle();
        if (concurrentResult.error || !concurrentResult.data) failRemote("O bootstrap encontrou uma concorrência e não conseguiu confirmar a capability.");
        const concurrent = concurrentResult.data as { operation_kind: string; environment: string; unit_name: string };
        if (concurrent.operation_kind !== entry.operationKind || concurrent.environment !== "production" || concurrent.unit_name !== entry.unitName) conflicts.push({ capabilityKey: entry.capabilityKey, reason: "existing_contract_mismatch" });
        else alreadyPresent.push(entry.capabilityKey);
        continue;
      }
      failRemote("Não foi possível inserir uma capability do catálogo canônico.");
    }
    if (!insertResult.data) failRemote("Não foi possível confirmar uma capability do catálogo canônico.");
    inserted.push(entry.capabilityKey);
  }

  const finalResult = await client.from("integration_capabilities")
    .select("id,capability_key,operation_kind,environment,unit_name,status")
    .in("capability_key", PLATFORM_CAPABILITY_CATALOG.map((entry) => entry.capabilityKey));
  if (finalResult.error) failRemote("Não foi possível confirmar o readback do catálogo de capabilities.");
  const activeCanonical = (finalResult.data || []).filter((row) => row.status === "active" && row.environment === "production").length;
  return {
    success: conflicts.length === 0,
    bootstrap: "PLATFORM_CAPABILITY_CATALOG",
    actorUserId,
    catalogCount: activeCanonical,
    expectedCount: PLATFORM_CAPABILITY_CATALOG.length,
    inserted,
    alreadyPresent,
    conflicts,
    schemaChanged: false,
    connectionsCreated: 0,
    secretsCreated: 0,
  } as const;
}

export async function createPlatformIntegrationConnection(client: QueryClient, actorUserId: string, input: { providerId: unknown; environment: unknown; label: unknown }) {
  const providerId = text(input.providerId, "providerId", 80);
  if (!isTenantId(providerId)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "O provider selecionado é inválido.");
  const environment = enumValue(input.environment, INTEGRATION_ENVIRONMENTS, "environment");
  const label = text(input.label, "label", 160);
  const providerResult = await client.from("integration_providers").select("id,provider_key,status").eq("id", providerId).maybeSingle();
  if (providerResult.error) failRemote("Não foi possível validar o provider selecionado.");
  if (!providerResult.data) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Provider não encontrado.");
  if (!isSupportedPlatformProviderKey(providerResult.data.provider_key)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_PROVIDER_NOT_ALLOWED", "Esse provider não pertence ao contrato operacional atual.");
  if (providerResult.data.status === "legacy") throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_PROVIDER_NOT_ALLOWED", "Provider legado não pode receber connection operacional.");
  if (providerResult.data.provider_key === "google_ads") {
    throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Google Ads é infraestrutura fixa da Plataforma e não aceita Connection dinâmica.");
  }
  const result = await client.from("integration_connections").insert({
    provider_id: providerId,
    owner_scope_type: "platform",
    owner_agency_id: null,
    owner_brand_id: null,
    environment,
    lifecycle_status: "draft",
    secret_ref: null,
    metadata: { label },
    created_by_user_id: actorUserId,
  }).select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref,metadata").single();
  resultError(result, "Não foi possível criar a connection da Plataforma.");
  return result.data;
}

export async function grantPlatformIntegrationToAgency(client: QueryClient, actorUserId: string, input: { capabilityId: unknown; connectionId: unknown; agencyId: unknown; environment: unknown }) {
  const capabilityId = text(input.capabilityId, "capabilityId", 80);
  const connectionId = text(input.connectionId, "connectionId", 80);
  const agencyId = text(input.agencyId, "agencyId", 80);
  if (!isTenantId(capabilityId) || !isTenantId(connectionId) || !isTenantId(agencyId)) {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "A capability, connection ou Agency selecionada é inválida.");
  }
  const environment = enumValue(input.environment, INTEGRATION_ENVIRONMENTS, "environment");

  const [capabilityResult, connectionResult, agencyResult] = await Promise.all([
    client.from("integration_capabilities").select("id,capability_key,operation_kind,environment,status").eq("id", capabilityId).maybeSingle(),
    client.from("integration_connections").select("id,provider_id,owner_scope_type,owner_agency_id,owner_brand_id,environment,lifecycle_status,secret_ref").eq("id", connectionId).maybeSingle(),
    client.from("agencies").select("id,name,status").eq("id", agencyId).maybeSingle(),
  ]);
  if (capabilityResult.error || connectionResult.error || agencyResult.error) failRemote("Não foi possível validar o recurso Plataforma → Agência.");
  const capability = capabilityResult.data as { id: string; capability_key: string; operation_kind: IntegrationCapabilityOperation; environment: IntegrationEnvironment; status: IntegrationAdminCapability["status"] } | null;
  const connection = connectionResult.data as { id: string; provider_id: string; owner_scope_type: string; owner_agency_id: string | null; owner_brand_id: string | null; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; secret_ref: string | null } | null;
  const agency = agencyResult.data as { id: string; name: string; status: string } | null;
  if (!capability || capability.status !== "active" || capability.environment !== environment) throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_CAPABILITY_INVALID", "A capability não está ativa no ambiente selecionado.");
  if (providerKeyForPlatformCapability(capability.capability_key) === "google_ads") {
    throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Google Ads é infraestrutura fixa da Plataforma e não aceita grants ou bindings dinâmicos.");
  }
  if (!connection || connection.owner_scope_type !== "platform" || connection.owner_agency_id || connection.owner_brand_id || connection.environment !== environment || connection.lifecycle_status !== "ready" || !connection.secret_ref?.trim()) {
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_CONNECTION_NOT_READY", "A connection escolhida precisa ser global da Plataforma, READY e possuir credencial configurada.");
  }
  if (!agency || agency.status !== "active") throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_AGENCY_NOT_FOUND", "A Agency selecionada não está ativa.");

  const existingGrantResult = await client.from("integration_grants")
    .select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,source_scope_type,source_agency_id,environment,lifecycle_status")
    .eq("capability_id", capability.id)
    .eq("target_scope_type", "agency")
    .eq("target_agency_id", agency.id)
    .eq("environment", environment)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (existingGrantResult.error) failRemote("Não foi possível consultar a concessão atual da Agency.");
  const existingGrant = existingGrantResult.data as { id: string; source_scope_type: string; source_agency_id: string | null; target_brand_id: string | null } | null;
  let grantId = existingGrant?.id || null;
  if (existingGrant && (existingGrant.source_scope_type !== "platform" || existingGrant.source_agency_id !== null || existingGrant.target_brand_id !== null)) {
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_GRANT_CONFLICT", "A Agency já possui uma concessão incompatível para esta capability.");
  }
  if (!grantId) {
    const grantResult = await client.from("integration_grants").insert({
      capability_id: capability.id,
      target_scope_type: "agency",
      target_agency_id: agency.id,
      target_brand_id: null,
      source_scope_type: "platform",
      source_agency_id: null,
      environment,
      lifecycle_status: "active",
      starts_at: new Date().toISOString(),
      ends_at: null,
      reason: "Golden Path Minerador → DataForSEO",
      created_by_user_id: actorUserId,
    }).select("id").single();
    resultError(grantResult, "Não foi possível criar a concessão Plataforma → Agência.");
    if (!grantResult.data) failRemote("Não foi possível confirmar a concessão Plataforma → Agência.");
    grantId = grantResult.data.id;
  }

  const existingBindingResult = await client.from("integration_bindings")
    .select("id,source_kind,connection_id,grant_id,lifecycle_status")
    .eq("capability_id", capability.id)
    .eq("target_scope_type", "agency")
    .eq("target_agency_id", agency.id)
    .eq("environment", environment)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (existingBindingResult.error) failRemote("Não foi possível consultar o binding atual da Agency.");
  const existingBinding = existingBindingResult.data as { id: string; source_kind: string; connection_id: string | null; grant_id: string | null } | null;
  if (existingBinding) {
    if (existingBinding.source_kind !== "platform_granted" || existingBinding.connection_id !== connection.id || existingBinding.grant_id !== grantId) {
      throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_BINDING_CONFLICT", "A Agency já possui outro binding ativo para esta capability.");
    }
    return { success: true, changed: false, grantId, bindingId: existingBinding.id, agencyId: agency.id, agencyName: agency.name };
  }

  const bindingResult = await client.from("integration_bindings").insert({
    capability_id: capability.id,
    target_scope_type: "agency",
    target_agency_id: agency.id,
    target_brand_id: null,
    environment,
    source_kind: "platform_granted",
    connection_id: connection.id,
    grant_id: grantId,
    external_account_ref: null,
    lifecycle_status: "active",
    created_by_user_id: actorUserId,
  }).select("id").single();
  resultError(bindingResult, "Não foi possível criar o binding Plataforma → Agência.");
  if (!bindingResult.data) failRemote("Não foi possível confirmar o binding Plataforma → Agência.");
  return { success: true, changed: true, grantId, bindingId: bindingResult.data.id, agencyId: agency.id, agencyName: agency.name };
}

async function ensurePlatformQuota(client: QueryClient, actorUserId: string, input: { capabilityId: string; environment: IntegrationEnvironment }) {
  const existingResult = await client.from("integration_quota_policies")
    .select("id,window_kind,limit_units")
    .eq("capability_id", input.capabilityId)
    .eq("scope_type", "platform")
    .eq("environment", input.environment)
    .eq("status", "active");
  if (existingResult.error) failRemote("Não foi possível consultar a quota da política de homologação.");
  const existingRows = (existingResult.data || []) as Array<{ id: string; window_kind: string; limit_units: number | string | null }>;
  if (existingRows.length > 1) throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_QUOTA_CONFLICT", "Há mais de uma quota ativa para a capability na Plataforma.");
  const [existing] = existingRows;

  const payload = { window_kind: "none", limit_units: null, period_started_at: null, period_ends_at: null, updated_at: new Date().toISOString() };
  if (existing) {
    const alreadyUnlimited = existing.window_kind === "none" && existing.limit_units === null;
    if (alreadyUnlimited) return { quotaId: existing.id, changed: false };
    const updateResult = await client.from("integration_quota_policies").update(payload).eq("id", existing.id).select("id").single();
    resultError(updateResult, "Não foi possível configurar a quota ilimitada da Plataforma.");
    if (!updateResult.data) failRemote("Não foi possível confirmar a quota ilimitada da Plataforma.");
    return { quotaId: updateResult.data.id, changed: true };
  }

  const insertResult = await client.from("integration_quota_policies").insert({
    capability_id: input.capabilityId,
    scope_type: "platform",
    agency_id: null,
    brand_id: null,
    environment: input.environment,
    ...payload,
    status: "active",
    created_by_user_id: actorUserId,
  }).select("id").single();
  resultError(insertResult, "Não foi possível criar a quota ilimitada da Plataforma.");
  if (!insertResult.data) failRemote("Não foi possível confirmar a quota ilimitada da Plataforma.");
  return { quotaId: insertResult.data.id, changed: true };
}

/**
 * The current remote catalog still exposes the 0024 binding contract, where a
 * Brand grant from the Platform is the canonical representation available for
 * a global connection. Keep the Agency grant above for the policy chain, then
 * materialize a separate explicit Platform → Brand entitlement/binding. This
 * traverses the normal runtime checks and requires no schema feature flag.
 */
async function ensurePlatformGrantedBrandAccess(client: QueryClient, actorUserId: string, input: { capabilityId: string; brandId: string; connectionId: string; environment: IntegrationEnvironment }) {
  const grantResult = await client.from("integration_grants")
    .select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,source_scope_type,source_agency_id,environment,lifecycle_status")
    .eq("capability_id", input.capabilityId)
    .eq("target_scope_type", "brand")
    .eq("target_brand_id", input.brandId)
    .eq("environment", input.environment)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (grantResult.error) failRemote("Não foi possível consultar a concessão da Marca.");
  const existingGrant = grantResult.data as { id: string; capability_id: string; target_scope_type: string; target_agency_id: string | null; target_brand_id: string | null; source_scope_type: string; source_agency_id: string | null; environment: string; lifecycle_status: string } | null;
  if (existingGrant && (existingGrant.capability_id !== input.capabilityId || existingGrant.target_scope_type !== "brand" || existingGrant.target_brand_id !== input.brandId || existingGrant.source_scope_type !== "platform" || existingGrant.source_agency_id !== null || existingGrant.environment !== input.environment || existingGrant.lifecycle_status !== "active")) {
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_BRAND_GRANT_CONFLICT", "A Marca já possui uma concessão incompatível para esta capability; a política não a substitui.");
  }

  let grantId = existingGrant?.id || null;
  if (!grantId) {
    const createdGrant = await client.from("integration_grants").insert({
      capability_id: input.capabilityId,
      target_scope_type: "brand",
      target_agency_id: null,
      target_brand_id: input.brandId,
      source_scope_type: "platform",
      source_agency_id: null,
      environment: input.environment,
      lifecycle_status: "active",
      starts_at: new Date().toISOString(),
      ends_at: null,
      reason: "HOMOLOGATION_ALLOW_ALL · Brand autorizada pela Agência",
      created_by_user_id: actorUserId,
    }).select("id").single();
    resultError(createdGrant, "Não foi possível criar a concessão da Marca.");
    if (!createdGrant.data) failRemote("Não foi possível confirmar a concessão da Marca.");
    grantId = createdGrant.data.id;
  }

  const bindingResult = await client.from("integration_bindings")
    .select("id,source_kind,connection_id,grant_id")
    .eq("capability_id", input.capabilityId)
    .eq("target_scope_type", "brand")
    .eq("target_brand_id", input.brandId)
    .eq("environment", input.environment)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (bindingResult.error) failRemote("Não foi possível consultar o binding atual da Marca.");
  const existingBinding = bindingResult.data as { id: string; source_kind: string; connection_id: string | null; grant_id: string | null } | null;
  if (existingBinding) {
    if (existingBinding.source_kind === "platform_granted" && existingBinding.connection_id === input.connectionId && existingBinding.grant_id === grantId) return { bindingId: existingBinding.id, grantId, changed: false };
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_BRAND_BINDING_CONFLICT", "A Marca já possui outro binding ativo para esta capability; a política não o substitui.");
  }

  const createdBinding = await client.from("integration_bindings").insert({
    capability_id: input.capabilityId,
    target_scope_type: "brand",
    target_agency_id: null,
    target_brand_id: input.brandId,
    environment: input.environment,
    source_kind: "platform_granted",
    connection_id: input.connectionId,
    grant_id: grantId,
    external_account_ref: null,
    lifecycle_status: "active",
    created_by_user_id: actorUserId,
  }).select("id").single();
  resultError(createdBinding, "Não foi possível criar o binding da Marca.");
  if (!createdBinding.data) failRemote("Não foi possível confirmar o binding da Marca.");
  return { bindingId: createdBinding.data.id, grantId, changed: true };
}

export async function applyPlatformHomologationPolicy(client: QueryClient, actorUserId: string) {
  const [providersResult, connectionsResult, capabilitiesResult, agenciesResult, linksResult, brandsResult] = await Promise.all([
    client.from("integration_providers").select("id,provider_key,status"),
    client.from("integration_connections").select("id,provider_id,environment,lifecycle_status,secret_ref").eq("owner_scope_type", "platform").eq("environment", "production").eq("lifecycle_status", "ready"),
    client.from("integration_capabilities").select("id,capability_key,environment,status").eq("environment", "production").eq("status", "active"),
    client.from("agencies").select("id,name,status").eq("status", "active"),
    client.from("agency_brands").select("agency_id,brand_id,status").eq("status", "active"),
    client.from("marcas").select("id,nome,status").eq("status", "active"),
  ]);
  for (const [result, message] of [
    [providersResult, "Não foi possível consultar os providers da política de homologação."],
    [connectionsResult, "Não foi possível consultar as Connections READY da política de homologação."],
    [capabilitiesResult, "Não foi possível consultar o catálogo de capabilities."],
    [agenciesResult, "Não foi possível consultar as Agencies ativas."],
    [linksResult, "Não foi possível consultar os vínculos ativos entre Agencies e Brands."],
    [brandsResult, "Não foi possível consultar as Brands ativas."],
  ] as const) if (result.error) failRemote(message);

  const providers = (providersResult.data || []) as Array<{ id: string; provider_key: string; status: string }>;
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const readyConnections = ((connectionsResult.data || []) as Array<{ id: string; provider_id: string; environment: IntegrationEnvironment; lifecycle_status: string; secret_ref: string | null }>)
    .filter((connection) => connection.secret_ref?.trim() && providerById.get(connection.provider_id)?.status === "active")
    .map((connection) => ({ ...connection, providerKey: providerById.get(connection.provider_id)?.provider_key || null }));
  const capabilities = (capabilitiesResult.data || []) as Array<{ id: string; capability_key: string; environment: IntegrationEnvironment; status: string }>;
  if (!capabilities.length) throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_POLICY_CAPABILITY_CATALOG_EMPTY", "A política não foi aplicada: o catálogo de capabilities está vazio. Cadastre a capability canônica antes da distribuição.");

  const mappedCapabilities = capabilities.map((capability) => ({ capability, providerKey: providerKeyForPlatformCapability(capability.capability_key) }));
  const excludedCapabilities = mappedCapabilities
    .filter((item) => item.providerKey === "google_ads")
    .map((item) => item.capability.capability_key);
  const applicable = mappedCapabilities.filter((item): item is { capability: typeof capabilities[number]; providerKey: Exclude<SupportedPlatformProviderKey, "deepseek" | "google_ads"> } => Boolean(item.providerKey) && item.providerKey !== "google_ads");
  const unmappedCapabilities = capabilities.filter((capability) => !providerKeyForPlatformCapability(capability.capability_key)).map((capability) => capability.capability_key);
  if (!applicable.length) throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_POLICY_CAPABILITY_UNMAPPED", "A política não foi aplicada: nenhuma capability ativa possui prefixo de provider compatível.");

  const agencies = (agenciesResult.data || []) as Array<{ id: string; name: string; status: string }>;
  const activeBrandIds = new Set((brandsResult.data || []).map((brand) => brand.id));
  const links = ((linksResult.data || []) as Array<{ agency_id: string; brand_id: string; status: string }>).filter((link) => activeBrandIds.has(link.brand_id) && agencies.some((agency) => agency.id === link.agency_id));
  const agencyIdsByBrand = new Map<string, string[]>();
  for (const link of links) agencyIdsByBrand.set(link.brand_id, [...(agencyIdsByBrand.get(link.brand_id) || []), link.agency_id]);
  const ambiguousBrandIds = new Set([...agencyIdsByBrand.entries()].filter(([, agencyIds]) => new Set(agencyIds).size > 1).map(([brandId]) => brandId));
  const blockedBrands = [...ambiguousBrandIds];

  const applied: Array<{ capabilityKey: string; providerKey: string; connectionId: string; agencyCount: number; brandBindingCount: number; quotaId: string }> = [];
  const missingConnections: string[] = [];
  for (const item of applicable) {
    const candidates = readyConnections.filter((connection) => connection.providerKey === item.providerKey);
    if (candidates.length !== 1) {
      missingConnections.push(`${item.capability.capability_key}:${candidates.length === 0 ? "connection_ready_missing" : "connection_ambiguous"}`);
      continue;
    }
    const [connection] = candidates;
    const quota = await ensurePlatformQuota(client, actorUserId, { capabilityId: item.capability.id, environment: item.capability.environment });
    const grantByAgency = new Map<string, string>();
    for (const agency of agencies) {
      const grant = await grantPlatformIntegrationToAgency(client, actorUserId, { capabilityId: item.capability.id, connectionId: connection.id, agencyId: agency.id, environment: item.capability.environment });
      if (!grant.grantId) failRemote("Não foi possível confirmar o grant da política de homologação.");
      grantByAgency.set(agency.id, grant.grantId);
    }
    let brandBindingCount = 0;
    for (const link of links) {
      if (ambiguousBrandIds.has(link.brand_id)) continue;
      const grantId = grantByAgency.get(link.agency_id);
      if (!grantId) continue;
      await ensurePlatformGrantedBrandAccess(client, actorUserId, { capabilityId: item.capability.id, brandId: link.brand_id, connectionId: connection.id, environment: item.capability.environment });
      brandBindingCount += 1;
    }
    applied.push({ capabilityKey: item.capability.capability_key, providerKey: item.providerKey, connectionId: connection.id, agencyCount: agencies.length, brandBindingCount, quotaId: quota.quotaId });
  }

  return {
    success: true,
    policy: PLATFORM_ACCESS_POLICY,
    policyStatus: missingConnections.length || unmappedCapabilities.length || blockedBrands.length ? "partial" : "applied",
    schemaChanged: false,
    databaseChanged: true,
    applied,
    missingConnections,
    unmappedCapabilities,
    blockedBrands,
    excludedCapabilities,
    googleAdsPersistedDistribution: "excluded_platform_env_only",
    googleAdsBrandBinding: "required_for_account_operations",
  } as const;
}

export async function configurePlatformGoogleAdsConnection(client: SecretMutationClient, input: {
  connectionId: unknown;
  managerCustomerId: unknown;
  researchCustomerId: unknown;
  secretPayload: unknown;
  label?: unknown;
}) {
  void client;
  void input;
  throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Google Ads é infraestrutura fixa da Plataforma e só pode ser configurado por variáveis server-side.");
  /* legacy connection mutation retained below only for historical audit; unreachable by the active API.
  const connectionId = text(input.connectionId, "connectionId", 80);
  if (!isTenantId(connectionId)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "A connection solicitada é inválida.");
  if (typeof input.secretPayload !== "string" || !input.secretPayload.trim() || input.secretPayload.length > 200000) {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "O payload secreto Google Ads é inválido.");
  }

  let managerCustomerId: string;
  let researchCustomerId: string;
  try {
    managerCustomerId = normalizeGoogleAdsCustomerId(text(input.managerCustomerId, "managerCustomerId", 32));
    researchCustomerId = normalizeGoogleAdsCustomerId(text(input.researchCustomerId, "researchCustomerId", 32));
    parseGoogleAdsSecretPayload(input.secretPayload);
  } catch (error) {
    if (error instanceof GoogleAdsConfigurationBlocker) {
      throw new PlatformIntegrationsAdminError(400, "GOOGLE_ADS_SECRET_PAYLOAD_INVALID", "O payload secreto Google Ads não possui o contrato permitido.");
    }
    throw new PlatformIntegrationsAdminError(400, "GOOGLE_ADS_CUSTOMER_ID_INVALID", "O Login Customer ID e o Research Customer ID devem possuir dez dígitos.");
  }

  const connectionResult = await client.from("integration_connections")
    .select("id,provider_id,owner_scope_type,environment,lifecycle_status,metadata,secret_ref")
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionResult.error) failRemote("Não foi possível consultar a connection da Plataforma.");
  const connection = connectionResult.data as { id: string; provider_id: string; owner_scope_type: string; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; metadata: Record<string, unknown> | null; secret_ref: string | null } | null;
  if (!connection) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Connection não encontrada.");
  if (connection.owner_scope_type !== "platform") throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_CONNECTION_SCOPE_INVALID", "A connection Google Ads precisa pertencer à Plataforma.");

  const providerResult = await client.from("integration_providers").select("id,provider_key,status").eq("id", connection.provider_id).maybeSingle();
  if (providerResult.error) failRemote("Não foi possível validar o provider da connection.");
  if (!providerResult.data || providerResult.data.provider_key !== "google_ads" || providerResult.data.status !== "active") {
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_PROVIDER_MISMATCH", "A connection selecionada não é um provider Google Ads ativo.");
  }

  const currentLabel = typeof connection.metadata?.label === "string" ? connection.metadata.label : null;
  const nextLabel = typeof input.label === "undefined" ? currentLabel : text(input.label, "label", 160);
  const metadata = {
    ...(connection.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata) ? connection.metadata : {}),
    ...(nextLabel ? { label: nextLabel } : {}),
    google_ads: { manager_customer_id: managerCustomerId },
    google_ads_research_customer_id: researchCustomerId,
  };

  let secretRef: string;
  try {
    secretRef = await createIntegrationSecretStore(client).store({
      secretRef: connection.secret_ref,
      secret: input.secretPayload,
      name: "google_ads_platform",
      description: "Google Ads platform credential",
    });
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError) {
      throw new PlatformIntegrationsAdminError(503, error.code, "Não foi possível configurar o secret store compartilhado.");
    }
    throw error;
  }

  const updateResult = await client.from("integration_connections")
    .update({ secret_ref: secretRef, metadata, lifecycle_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .select("id,provider_id,owner_scope_type,environment,lifecycle_status,metadata,secret_ref")
    .single();
  if (updateResult.error) failRemote("Não foi possível persistir a configuração da connection Google Ads.");

  return {
    id: updateResult.data.id,
    providerId: updateResult.data.provider_id,
    ownerScope: updateResult.data.owner_scope_type,
    environment: updateResult.data.environment,
    lifecycleStatus: updateResult.data.lifecycle_status,
    label: typeof updateResult.data.metadata?.label === "string" ? updateResult.data.metadata.label : null,
    managerCustomerId,
    researchCustomerId,
    secretConfigured: Boolean(updateResult.data.secret_ref),
  };
  */
}

export async function updatePlatformGoogleAdsResearchCustomerId(client: SecretMutationClient, input: {
  connectionId: unknown;
  researchCustomerId: unknown;
}) {
  void client;
  void input;
  throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Google Ads é infraestrutura fixa da Plataforma e não aceita edição de Research Customer ID pela UI.");
  /* legacy connection mutation retained below only for historical audit; unreachable by the active API.
  const connectionId = text(input.connectionId, "connectionId", 80);
  if (!isTenantId(connectionId)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "A connection solicitada é inválida.");

  let researchCustomerId: string;
  try {
    researchCustomerId = normalizeGoogleAdsCustomerId(text(input.researchCustomerId, "researchCustomerId", 32));
  } catch {
    throw new PlatformIntegrationsAdminError(400, "GOOGLE_ADS_CUSTOMER_ID_INVALID", "O Research Customer ID deve possuir dez dígitos.");
  }

  const connectionResult = await client.from("integration_connections")
    .select("id,provider_id,owner_scope_type,lifecycle_status,metadata,secret_ref")
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionResult.error) failRemote("Não foi possível consultar a connection da Plataforma.");
  const connection = connectionResult.data as { id: string; provider_id: string; owner_scope_type: string; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; metadata: Record<string, unknown> | null; secret_ref: string | null } | null;
  if (!connection) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Connection não encontrada.");
  if (connection.owner_scope_type !== "platform") throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_CONNECTION_SCOPE_INVALID", "A connection Google Ads precisa pertencer à Plataforma.");

  const providerResult = await client.from("integration_providers").select("id,provider_key,status").eq("id", connection.provider_id).maybeSingle();
  if (providerResult.error) failRemote("Não foi possível validar o provider da connection.");
  if (!providerResult.data || providerResult.data.provider_key !== "google_ads" || providerResult.data.status !== "active") {
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_PROVIDER_MISMATCH", "A connection selecionada não é um provider Google Ads ativo.");
  }
  if (!connection.secret_ref?.trim()) throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_SECRET_REF_MISSING", "A Connection Google Ads ainda não possui credencial salva.");

  const metadata = {
    ...(connection.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata) ? connection.metadata : {}),
    google_ads_research_customer_id: researchCustomerId,
  };
  const updateResult = await client.from("integration_connections")
    .update({ metadata, lifecycle_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .select("id,lifecycle_status,metadata,secret_ref")
    .single();
  if (updateResult.error) failRemote("Não foi possível persistir o Research Customer ID da Connection Google Ads.");
  return {
    id: updateResult.data.id,
    lifecycleStatus: updateResult.data.lifecycle_status,
    researchCustomerId,
    secretConfigured: Boolean(updateResult.data.secret_ref),
  };
  */
}

function logGoogleAdsRefreshTokenRotation(actorUserId: string, success: boolean, code: string | null = null) {
  console.info("[integrations] google_ads_refresh_token_rotation", {
    credential: "google_ads_refresh_token",
    operation: "rotated",
    actorUserIdRef: actorUserId.slice(-8),
    timestamp: new Date().toISOString(),
    success,
    code,
  });
}

export async function rotatePlatformGoogleAdsRefreshToken(client: SecretMutationClient, actorUserId: string, input: {
  refreshToken: unknown;
  label?: unknown;
}) {
  let normalizedRefreshToken: string;
  try {
    normalizedRefreshToken = normalizeGoogleAdsRefreshToken(input.refreshToken);
  } catch (error) {
    const mapped = error instanceof Error ? error : new Error("GOOGLE_ADS_REFRESH_TOKEN_SECRET_INVALID");
    logGoogleAdsRefreshTokenRotation(actorUserId, false, "code" in mapped ? String((mapped as { code?: unknown }).code || "GOOGLE_ADS_REFRESH_TOKEN_SECRET_INVALID") : "GOOGLE_ADS_REFRESH_TOKEN_SECRET_INVALID");
    if (error instanceof PlatformIntegrationsAdminError) throw error;
    throw new PlatformIntegrationsAdminError(400, "GOOGLE_ADS_REFRESH_TOKEN_SECRET_INVALID", mapped.message);
  }

  try {
    const connection = await ensureSupportedPlatformConnection(client, actorUserId, {
      providerKey: "google_ads",
      environment: "production",
      label: typeof input.label === "undefined" ? "Plataforma / infraestrutura" : text(input.label, "label", 160),
    });
    let nextSecretRef: string;
    try {
      // Vault secret names are unique. On the first configuration there is
      // no reference yet, so the adapter creates the named secret. A later
      // rotation must update the existing reference instead of creating a
      // second secret with the same name.
      nextSecretRef = await createIntegrationSecretStore(client).store({
        secretRef: connection.secretRef,
        secret: normalizedRefreshToken,
        name: GOOGLE_ADS_REFRESH_TOKEN_SECRET_NAME,
        description: GOOGLE_ADS_REFRESH_TOKEN_SECRET_DESCRIPTION,
      });
    } catch (error) {
      const code = error instanceof IntegrationSecretStoreError ? error.code : "INTEGRATION_SECRET_STORE_UNAVAILABLE";
      throw new PlatformIntegrationsAdminError(503, code, "Não foi possível armazenar o OAuth Refresh Token no Secret Store.");
    }

    const rotatedAt = new Date().toISOString();
    const currentMetadata = connection.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata) ? connection.metadata : {};
    const currentGoogleAdsMetadata = currentMetadata.google_ads && typeof currentMetadata.google_ads === "object" && !Array.isArray(currentMetadata.google_ads)
      ? currentMetadata.google_ads as Record<string, unknown>
      : {};
    const metadata = {
      ...currentMetadata,
      label: typeof input.label === "undefined" ? (typeof currentMetadata.label === "string" ? currentMetadata.label : "Plataforma / infraestrutura") : text(input.label, "label", 160),
      google_ads: {
        ...currentGoogleAdsMetadata,
        static_config_source: "PLATFORM_ENV",
        refresh_token_source: "SECRET_STORE",
        refresh_token_rotated_at: rotatedAt,
        refresh_token_rotated_by_ref: actorUserId.slice(-8),
      },
    };
    const updateResult = await client.from("integration_connections")
      .update({ secret_ref: nextSecretRef, metadata, lifecycle_status: "pending", updated_at: rotatedAt })
      .eq("id", connection.id)
      .select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref")
      .single();
    if (updateResult.error || !updateResult.data) failRemote("Não foi possível atualizar a referência do OAuth Refresh Token Google Ads.");

    logGoogleAdsRefreshTokenRotation(actorUserId, true);
    return {
      id: updateResult.data.id,
      providerId: updateResult.data.provider_id,
      providerKey: "google_ads" as const,
      ownerScope: updateResult.data.owner_scope_type,
      environment: updateResult.data.environment,
      lifecycleStatus: updateResult.data.lifecycle_status,
      secretConfigured: Boolean(updateResult.data.secret_ref),
      tokenSaved: true as const,
      healthValidated: false as const,
      refreshTokenSource: "SECRET_STORE" as const,
      rotatedAt,
    };
  } catch (error) {
    const code = error instanceof PlatformIntegrationsAdminError ? error.code : "INTEGRATIONS_REMOTE_UNAVAILABLE";
    logGoogleAdsRefreshTokenRotation(actorUserId, false, code);
    throw error;
  }
}

const SUPPORTED_PLATFORM_PROVIDER_KEYS = ["google_ads", "dataforseo", "deepseek", "google_cloud", "youtube_data", "telegram"] as const;

type PreparedPlatformConnection = {
  id: string;
  providerId: string;
  providerKey: SupportedPlatformProviderKey;
  environment: IntegrationEnvironment;
  lifecycleStatus: IntegrationAdminConnection["lifecycleStatus"];
  metadata: Record<string, unknown>;
  secretRef: string | null;
};

async function ensureSupportedPlatformConnection(client: SecretMutationClient, actorUserId: string, input: {
  providerKey: SupportedPlatformProviderKey;
  environment: IntegrationEnvironment;
  label: string;
}): Promise<PreparedPlatformConnection> {
  const providerDefinition = SUPPORTED_PLATFORM_PROVIDERS[input.providerKey];
  const providerResult = await client.from("integration_providers")
    .select("id,provider_key,status")
    .eq("provider_key", input.providerKey)
    .maybeSingle();
  if (providerResult.error) failRemote("Não foi possível consultar o catálogo do provider.");

  let provider = providerResult.data as { id: string; provider_key: SupportedPlatformProviderKey; status: IntegrationAdminProvider["status"] } | null;
  if (!provider) {
    const createdProvider = await client.from("integration_providers")
      .insert({ provider_key: input.providerKey, display_name: providerDefinition.displayName, status: "active" })
      .select("id,provider_key,status")
      .single();
    resultError(createdProvider, "Não foi possível preparar o provider suportado.");
    provider = createdProvider.data as { id: string; provider_key: SupportedPlatformProviderKey; status: IntegrationAdminProvider["status"] };
  }
  if (provider.status !== "active") {
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_PROVIDER_DISABLED", "Este provider está desabilitado no catálogo técnico.");
  }

  const existingConnection = await client.from("integration_connections")
    .select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref,metadata")
    .eq("provider_id", provider.id)
    .eq("owner_scope_type", "platform")
    .eq("environment", input.environment)
    .neq("lifecycle_status", "revoked")
    .maybeSingle();
  if (existingConnection.error) failRemote("Não foi possível consultar a connection da Plataforma.");

  if (existingConnection.data) {
    const row = existingConnection.data as { id: string; provider_id: string; owner_scope_type: "platform"; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; secret_ref: string | null; metadata: Record<string, unknown> | null };
    return {
      id: row.id,
      providerId: row.provider_id,
      providerKey: input.providerKey,
      environment: row.environment,
      lifecycleStatus: row.lifecycle_status,
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
      secretRef: row.secret_ref,
    };
  }

  const createdConnection = await client.from("integration_connections")
    .insert({
      provider_id: provider.id,
      owner_scope_type: "platform",
      owner_agency_id: null,
      owner_brand_id: null,
      environment: input.environment,
      lifecycle_status: "draft",
      secret_ref: null,
      metadata: { label: input.label },
      created_by_user_id: actorUserId,
    })
    .select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref,metadata")
    .single();
  resultError(createdConnection, "Não foi possível criar a connection da Plataforma.");
  const row = createdConnection.data as { id: string; provider_id: string; owner_scope_type: "platform"; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; secret_ref: string | null; metadata: Record<string, unknown> | null };
  return {
    id: row.id,
    providerId: row.provider_id,
    providerKey: input.providerKey,
    environment: row.environment,
    lifecycleStatus: row.lifecycle_status,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    secretRef: row.secret_ref,
  };
}

function normalizeSupportedProviderSecret(providerKey: Exclude<SupportedPlatformProviderKey, "google_ads">, value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 200_000) {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A credencial informada é inválida.");
  }
  if (providerKey === "google_cloud") {
    try { return normalizeGoogleCloudServiceAccountSecret(value); }
    catch { throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A Service Account Google Cloud está incompleta ou possui campos não permitidos."); }
  }
  if (providerKey === "youtube_data") {
    try { return normalizeYouTubeDataApiSecret(value); }
    catch { throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A API key do YouTube Data está incompleta ou possui campos não permitidos."); }
  }
  if (providerKey === "telegram") {
    try {
      return parseTelegramConfigurationInput(value);
    } catch (error) {
      const code = error instanceof Error ? error.message : "TELEGRAM_CONFIGURATION_INVALID";
      if (code === "BOT_TOKEN_REQUIRED") throw new PlatformIntegrationsAdminError(400, "BOT_TOKEN_REQUIRED", "Informe o Bot Token do Telegram.");
      if (code === "TELEGRAM_BOT_TOKEN_INVALID") throw new PlatformIntegrationsAdminError(400, "BOT_TOKEN_INVALID", "O Bot Token do Telegram possui formato inválido.");
      if (code === "TELEGRAM_WEBHOOK_SECRET_INVALID") throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "O segredo do webhook Telegram possui formato inválido.");
      throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A configuração do Telegram possui formato inválido.");
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A credencial informada possui formato inválido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A credencial informada possui formato inválido.");
  }
  const allowedFields = providerKey === "dataforseo"
    ? ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]
    : ["DEEPSEEK_API_KEY"];
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((field) => !allowedFields.includes(field))) {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A credencial informada contém campos não permitidos.");
  }
  const normalized: Record<string, string> = {};
  for (const field of allowedFields) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_SECRET_PAYLOAD_INVALID", "A credencial informada está incompleta.");
    }
    normalized[field] = record[field].trim();
  }
  return JSON.stringify(normalized);
}

export async function configureSupportedPlatformProvider(client: SecretMutationClient, actorUserId: string, input: {
  providerKey: unknown;
  environment?: unknown;
  label?: unknown;
  managerCustomerId?: unknown;
  researchCustomerId?: unknown;
  bucketName?: unknown;
  youtubeHealthVideoId?: unknown;
  telegramWebhookUrl?: unknown;
  secretPayload: unknown;
}) {
  const providerKey = enumValue(input.providerKey, SUPPORTED_PLATFORM_PROVIDER_KEYS, "providerKey");
  if (providerKey === "google_ads") throw new PlatformIntegrationsAdminError(409, "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY", "Google Ads é infraestrutura fixa da Plataforma e só pode ser configurado por variáveis server-side.");
  const environment = enumValue(input.environment ?? "production", INTEGRATION_ENVIRONMENTS, "environment");
  const providerDefinition = SUPPORTED_PLATFORM_PROVIDERS[providerKey];
  const label = text(input.label ?? providerDefinition.displayName, "label", 160);
  const normalizedSecret = normalizeSupportedProviderSecret(providerKey, input.secretPayload);
  const connection = await ensureSupportedPlatformConnection(client, actorUserId, { providerKey, environment, label });

  const secretStore = createIntegrationSecretStore(client);
  let secretPayload: string;
  if (providerKey === "telegram") {
    const configuration = normalizedSecret as TelegramConfigurationInput;
    let webhookSecret = configuration.webhookSecret;
    if (!webhookSecret && connection.secretRef?.trim()) {
      let previousPayload: string | null = null;
      try {
        previousPayload = await secretStore.resolve(connection.secretRef);
      } catch (error) {
        if (error instanceof IntegrationSecretStoreError) {
          throw new PlatformIntegrationsAdminError(503, error.code, "Não foi possível recuperar o segredo Telegram existente do Secret Store.");
        }
        throw error;
      }
      if (previousPayload) {
        try { webhookSecret = parseTelegramSecret(previousPayload).TELEGRAM_WEBHOOK_SECRET; } catch { /* generate a safe replacement below */ }
      }
    }
    if (!webhookSecret) {
      try { webhookSecret = createTelegramWebhookSecret(); }
      catch { throw new PlatformIntegrationsAdminError(503, "WEBHOOK_SECRET_GENERATION_FAILED", "Não foi possível gerar automaticamente o segredo do webhook Telegram."); }
    }
    secretPayload = normalizeTelegramSecret({ TELEGRAM_BOT_TOKEN: configuration.botToken, TELEGRAM_WEBHOOK_SECRET: webhookSecret });
  } else {
    secretPayload = normalizedSecret as string;
  }

  let secretRef: string;
  try {
    secretRef = await secretStore.store({
      secretRef: connection.secretRef,
      secret: secretPayload,
      name: providerDefinition.secretName,
      description: providerDefinition.secretDescription,
    });
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError) {
      throw new PlatformIntegrationsAdminError(503, providerKey === "telegram" ? "BOT_TOKEN_SAVE_FAILED" : error.code, providerKey === "telegram" ? "Não foi possível salvar o Bot Token no Secret Store." : "Não foi possível configurar o secret store compartilhado.");
    }
    throw error;
  }

  const metadata = {
    ...connection.metadata,
    label,
    ...(providerKey === "deepseek" ? { deepseek_model: DEEPSEEK_DEFAULT_MODEL } : {}),
    ...(providerKey === "google_cloud" ? {
      google_cloud_media: {
        ...(connection.metadata.google_cloud_media && typeof connection.metadata.google_cloud_media === "object" && !Array.isArray(connection.metadata.google_cloud_media) ? connection.metadata.google_cloud_media as Record<string, unknown> : {}),
        ...(typeof input.bucketName === "undefined" || input.bucketName === null || input.bucketName === "" ? {} : (() => {
          const bucketName = normalizeMediaBucketName(input.bucketName);
          if (!bucketName) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "bucketName é inválido.");
          return { bucket_name: bucketName };
        })()),
      },
    } : {}),
    ...(providerKey === "youtube_data" ? {
      ...(typeof input.youtubeHealthVideoId === "undefined" || input.youtubeHealthVideoId === null || input.youtubeHealthVideoId === "" ? {} : (() => {
        const videoId = text(input.youtubeHealthVideoId, "youtubeHealthVideoId", 120);
        return { youtube_health_video_id: videoId };
      })()),
    } : {}),
    ...(providerKey === "telegram" ? {
      telegram: {
        ...(connection.metadata.telegram && typeof connection.metadata.telegram === "object" && !Array.isArray(connection.metadata.telegram) ? connection.metadata.telegram as Record<string, unknown> : {}),
        webhook_configured_at: null,
        ...(typeof input.telegramWebhookUrl === "undefined" || input.telegramWebhookUrl === null || input.telegramWebhookUrl === "" ? {} : { webhook_url: text(input.telegramWebhookUrl, "telegramWebhookUrl", 2_000) }),
      },
    } : {}),
  };
  const updateResult = await client.from("integration_connections")
    .update({ secret_ref: secretRef, metadata, lifecycle_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", connection.id)
    .select("id,provider_id,owner_scope_type,environment,lifecycle_status,metadata,secret_ref")
    .single();
  if (updateResult.error) {
    if (providerKey === "telegram") throw new PlatformIntegrationsAdminError(503, "BOT_TOKEN_SAVE_FAILED", "O Bot Token foi recebido, mas não foi possível persistir a configuração da Connection.");
    failRemote("Não foi possível persistir a configuração da connection da Plataforma.");
  }

  return {
    id: updateResult.data.id,
    providerId: updateResult.data.provider_id,
    providerKey,
    ownerScope: updateResult.data.owner_scope_type,
    environment: updateResult.data.environment,
    lifecycleStatus: updateResult.data.lifecycle_status,
    label: typeof updateResult.data.metadata?.label === "string" ? updateResult.data.metadata.label : null,
    secretConfigured: Boolean(updateResult.data.secret_ref),
  };
}

const PLATFORM_HEALTH_PROVIDER_KEYS = ["google_ads", "dataforseo", "deepseek", "google_cloud", "youtube_data", "telegram"] as const;

function isPlatformHealthProviderKey(value: string): value is PlatformHealthProviderKey {
  return PLATFORM_HEALTH_PROVIDER_KEYS.includes(value as PlatformHealthProviderKey);
}

function safeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function telegramWebhookState(value: unknown): { telegramWebhookConfigured: boolean; telegramWebhookUrl: string | null } {
  const telegram = safeMetadata(safeMetadata(value).telegram);
  const webhookUrl = typeof telegram.webhook_url === "string" && telegram.webhook_url.trim() ? telegram.webhook_url.trim() : null;
  const configuredAt = typeof telegram.webhook_configured_at === "string" && telegram.webhook_configured_at.trim() ? telegram.webhook_configured_at.trim() : null;
  return { telegramWebhookConfigured: Boolean(webhookUrl && configuredAt), telegramWebhookUrl: webhookUrl };
}

function safeHealthCheck(value: unknown): IntegrationAdminConnection["healthCheck"] {
  const health = safeMetadata(value);
  const diagnostics = safeMetadata(health.diagnostics);
  const rawDetails = safeMetadata(health.details);
  const details: Record<string, string | null> = {};
  for (const field of ["botId", "botName", "botUsername", "webhookConfigured", "webhookUrl", "pendingUpdateCount", "lastError", "bucketConfigured", "destructiveWrite", "apiCall"] as const) {
    const detail = rawDetails[field];
    if (typeof detail === "string") details[field] = detail;
  }
  return {
    status: health.status === "ready" || health.status === "error" ? health.status : null,
    checkedAt: typeof health.checked_at === "string" ? health.checked_at : null,
    code: typeof health.code === "string" ? health.code : null,
    message: typeof health.message === "string" ? health.message : null,
    providerRequestRef: typeof health.provider_request_ref === "string" ? health.provider_request_ref : null,
    stage: typeof health.stage === "string" ? health.stage : null,
    httpStatus: typeof diagnostics.httpStatus === "string" ? diagnostics.httpStatus : null,
    googleAdsCode: typeof diagnostics.googleAdsCode === "string" ? diagnostics.googleAdsCode : null,
    currentModel: typeof health.current_model === "string" ? health.current_model : null,
    currentModelAvailable: typeof health.current_model_available === "boolean" ? health.current_model_available : null,
    details,
  };
}

function safeGoogleCloudHealth(value: unknown, legacyHealth: IntegrationAdminHealthCheck) {
  const health = safeMetadata(value);
  const speechValue = health.speech ? safeHealthCheck(health.speech) : null;
  const storageValue = health.storage ? safeHealthCheck(health.storage) : null;
  if (speechValue || storageValue) return { speech: speechValue, storage: storageValue };
  if (legacyHealth.stage === "bucket_metadata" || legacyHealth.code?.startsWith("BUCKET_") || legacyHealth.code === "MEDIA_BUCKET_NOT_CONFIGURED" || legacyHealth.code === "STORAGE_API_DISABLED") {
    return { speech: null, storage: legacyHealth };
  }
  if (legacyHealth.stage === "credential_and_client" || legacyHealth.code === "CREDENTIAL_INVALID") {
    return { speech: legacyHealth, storage: null };
  }
  return { speech: null, storage: null };
}

function healthMetadata(value: unknown, health: Record<string, unknown>) {
  return { ...safeMetadata(value), health_check: health };
}

function operationHealthMetadata(value: unknown, health: Record<string, unknown>, providerKey: string, healthOperation: PlatformHealthOperation | undefined) {
  const metadata = healthMetadata(value, health);
  if (providerKey !== "google_cloud") return metadata;
  const current = safeMetadata(safeMetadata(value).google_cloud_health);
  const operation = healthOperation === "storage" ? "storage" : "speech";
  return { ...metadata, google_cloud_health: { ...current, [operation]: health } };
}

export async function healthCheckPlatformIntegrationConnection(client: SecretMutationClient, input: {
  connectionId: unknown;
  providerKey: unknown;
  healthOperation?: unknown;
  fetchImpl?: typeof fetch;
  storageClientFactory?: StorageClientFactory;
}) {
  const providerKey = text(input.providerKey, "providerKey", 80);
  if (!isPlatformHealthProviderKey(providerKey)) {
    throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_PROVIDER_NOT_ALLOWED", "Esse provider não possui health check global no contrato atual.");
  }
  const healthOperation = typeof input.healthOperation === "undefined" ? undefined : enumValue(input.healthOperation, ["speech", "storage", "youtube", "telegram_get_me", "telegram_webhook"] as const, "healthOperation") as PlatformHealthOperation;

  if (providerKey === "google_ads") {
    const connectionId = text(input.connectionId, "connectionId", 80);
    if (!isTenantId(connectionId)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "A connection Google Ads solicitada é inválida.");
    const connectionResult = await client.from("integration_connections")
      .select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref,metadata")
      .eq("id", connectionId)
      .maybeSingle();
    if (connectionResult.error) failRemote("Não foi possível consultar a connection Google Ads.");
    const connection = connectionResult.data as { id: string; provider_id: string; owner_scope_type: string; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; secret_ref: string | null; metadata: Record<string, unknown> | null } | null;
    if (!connection) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "A connection Google Ads ainda não foi criada. Substitua o token antes de testar.");
    if (connection.owner_scope_type !== "platform" || connection.environment !== "production") throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_CONNECTION_SCOPE_INVALID", "O health check Google Ads exige uma connection global de produção.");
    const providerResult = await client.from("integration_providers").select("id,provider_key,status").eq("id", connection.provider_id).maybeSingle();
    if (providerResult.error) failRemote("Não foi possível validar o provider Google Ads.");
    if (!providerResult.data || providerResult.data.provider_key !== "google_ads" || providerResult.data.status !== "active") throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_PROVIDER_MISMATCH", "A connection selecionada não corresponde a um provider Google Ads ativo.");

    const checkedAt = new Date().toISOString();
    const markFailure = async (code: string, message: string, providerRequestRef: string | null, diagnostics: Record<string, string | null> = {}) => {
      const updateResult = await client.from("integration_connections")
        .update({
          lifecycle_status: "error",
          metadata: healthMetadata(connection.metadata, { status: "error", checked_at: checkedAt, code, message, provider_request_ref: providerRequestRef, stage: diagnostics.stage || null, diagnostics }),
          updated_at: checkedAt,
        })
        .eq("id", connection.id);
      if (updateResult.error) failRemote("O health check Google Ads falhou e não foi possível persistir o estado sanitizado da connection.");
    };
    try {
      const config = await resolveGoogleAdsPlatformConfig(client, process.env, { requireReady: false });
      const probe = await runPlatformProviderHealthProbe({ providerKey, googleAdsConfig: config, fetchImpl: input.fetchImpl });
      const metadata = healthMetadata(connection.metadata, {
        status: "ready",
        checked_at: checkedAt,
        code: null,
        message: null,
        provider_request_ref: probe.providerRequestRef,
        cost_amount: probe.costAmount,
        details: probe.details,
      });
      const updateResult = await client.from("integration_connections")
        .update({ lifecycle_status: "ready", metadata, updated_at: checkedAt })
        .eq("id", connection.id)
        .select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref")
        .single();
      if (updateResult.error || !updateResult.data) failRemote("O Google Ads respondeu, mas não foi possível persistir o estado READY da connection.");
      return {
        id: updateResult.data.id,
        providerId: updateResult.data.provider_id,
        providerKey,
        ownerScope: "platform" as const,
        environment: updateResult.data.environment,
         lifecycleStatus: updateResult.data.lifecycle_status,
         secretConfigured: Boolean(updateResult.data.secret_ref),
         status: "ready" as const,
         checkedAt,
        providerRequestRef: probe.providerRequestRef,
        costAmount: probe.costAmount,
        details: probe.details,
        source: "PLATFORM_ENV_STATIC_PLUS_SECRET_STORE_REFRESH_TOKEN" as const,
      };
    } catch (error) {
      const mapped = error instanceof PlatformHealthCheckError
        ? error
        : error instanceof GoogleAdsPlatformConfigError
          ? new PlatformHealthCheckError(503, error.code, error.message, null, { stage: "configuration", httpStatus: null })
          : new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O provider não confirmou a infraestrutura Google Ads.");
      await markFailure(mapped.code, mapped.message, mapped.providerRequestRef, mapped.diagnostics);
      throw new PlatformIntegrationsAdminError(mapped.status, mapped.code, mapped.message, mapped.diagnostics, mapped.providerRequestRef);
    }
  }

  const connectionId = text(input.connectionId, "connectionId", 80);
  if (!isTenantId(connectionId)) throw new PlatformIntegrationsAdminError(400, "INTEGRATIONS_INVALID_INPUT", "A connection solicitada é inválida.");

  const connectionResult = await client.from("integration_connections")
    .select("id,provider_id,owner_scope_type,environment,lifecycle_status,secret_ref,metadata")
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionResult.error) failRemote("Não foi possível consultar a connection da Plataforma.");
  const connection = connectionResult.data as { id: string; provider_id: string; owner_scope_type: string; environment: IntegrationEnvironment; lifecycle_status: IntegrationAdminConnection["lifecycleStatus"]; secret_ref: string | null; metadata: Record<string, unknown> | null } | null;
  if (!connection) throw new PlatformIntegrationsAdminError(404, "INTEGRATIONS_NOT_FOUND", "Connection não encontrada.");
  if (connection.owner_scope_type !== "platform") throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_CONNECTION_SCOPE_INVALID", "O health check global exige uma connection da Plataforma.");

  const providerResult = await client.from("integration_providers").select("id,provider_key,status").eq("id", connection.provider_id).maybeSingle();
  if (providerResult.error) failRemote("Não foi possível validar o provider da connection.");
  if (!providerResult.data || providerResult.data.provider_key !== providerKey) {
    throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_PROVIDER_MISMATCH", "A connection selecionada não corresponde ao provider solicitado.");
  }
  if (providerResult.data.status !== "active") throw new PlatformIntegrationsAdminError(409, "INTEGRATIONS_PROVIDER_DISABLED", "O provider da connection está desabilitado no catálogo técnico.");

  const checkedAt = new Date().toISOString();
  const preserveConnectionOnStorageFailure = providerKey === "google_cloud" && healthOperation === "storage";
  const markFailure = async (code: string, message: string, providerRequestRef: string | null, diagnostics: Record<string, string | null> = {}) => {
    const health = { status: "error", checked_at: checkedAt, code, message, provider_request_ref: providerRequestRef, stage: diagnostics.stage || null, diagnostics };
    const updateResult = await client.from("integration_connections")
      .update({
        ...(preserveConnectionOnStorageFailure ? {} : { lifecycle_status: "error" }),
        metadata: operationHealthMetadata(connection.metadata, health, providerKey, healthOperation),
        updated_at: checkedAt,
      })
      .eq("id", connection.id);
    if (updateResult.error) failRemote("O health check falhou e não foi possível persistir o estado sanitizado da connection.");
  };

  if (!connection.secret_ref?.trim()) {
    const error = new PlatformHealthCheckError(409, "GLOBAL_CONNECTION_SECRET_NOT_CONFIGURED", `A Connection ${providerKey} não possui credencial configurada.`);
    await markFailure(error.code, error.message, null, error.diagnostics);
    throw new PlatformIntegrationsAdminError(error.status, error.code, error.message, error.diagnostics, error.providerRequestRef);
  }

  let secretPayload: string | null = null;
  try {
    secretPayload = await createIntegrationSecretStore(client).resolve(connection.secret_ref);
  } catch (error) {
    const code = error instanceof IntegrationSecretStoreError ? error.code : "INTEGRATION_SECRET_STORE_UNAVAILABLE";
    const message = "Não foi possível recuperar a credencial da connection no secret store.";
    await markFailure(code, message, null);
    throw new PlatformIntegrationsAdminError(503, code, message);
  }
  if (!secretPayload) {
    const error = new PlatformHealthCheckError(409, "GLOBAL_CONNECTION_SECRET_NOT_CONFIGURED", `A Connection ${providerKey} não possui uma credencial resolvível.`);
    await markFailure(error.code, error.message, null, error.diagnostics);
    throw new PlatformIntegrationsAdminError(error.status, error.code, error.message, error.diagnostics, error.providerRequestRef);
  }

  try {
    const probe = await runPlatformProviderHealthProbe({ providerKey, secretPayload, metadata: connection.metadata, healthOperation, fetchImpl: input.fetchImpl, storageClientFactory: input.storageClientFactory });
    const health = {
      status: "ready",
      checked_at: checkedAt,
      code: null,
      message: null,
      provider_request_ref: probe.providerRequestRef,
      cost_amount: probe.costAmount,
      details: probe.details,
      current_model: probe.currentModel ?? null,
      current_model_available: probe.currentModelAvailable ?? null,
    };
    const metadata = operationHealthMetadata(connection.metadata, health, providerKey, healthOperation);
    const updateResult = await client.from("integration_connections")
      .update({ lifecycle_status: "ready", metadata, updated_at: checkedAt })
      .eq("id", connection.id)
      .select("id,provider_id,owner_scope_type,environment,lifecycle_status,metadata,secret_ref")
      .single();
    if (updateResult.error) failRemote("O provider respondeu, mas não foi possível persistir o estado READY da connection.");
    return {
      id: updateResult.data.id,
      providerId: updateResult.data.provider_id,
      providerKey,
      ownerScope: updateResult.data.owner_scope_type,
      environment: updateResult.data.environment,
       lifecycleStatus: updateResult.data.lifecycle_status,
       secretConfigured: Boolean(updateResult.data.secret_ref),
       status: "ready" as const,
       checkedAt,
      providerRequestRef: probe.providerRequestRef,
      costAmount: probe.costAmount,
      currentModel: probe.currentModel ?? null,
      currentModelAvailable: probe.currentModelAvailable ?? null,
      details: probe.details,
    };
  } catch (error) {
    const mapped = error instanceof PlatformHealthCheckError
      ? error
      : new PlatformHealthCheckError(502, "PLATFORM_HEALTH_PROVIDER_FAILED", "O provider não confirmou a connection.");
    await markFailure(mapped.code, mapped.message, mapped.providerRequestRef, mapped.diagnostics);
    throw new PlatformIntegrationsAdminError(mapped.status, mapped.code, mapped.message, mapped.diagnostics, mapped.providerRequestRef);
  }
}
