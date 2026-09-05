import { type SupabaseClient } from "@supabase/supabase-js";
import { isTenantId } from "../tenant-routing";
import {
  CanonicalAuthorizationError,
  requireAgencyOperationalAccess,
  requireBrandEditorialAccess,
  type CanonicalAgency,
  type CanonicalAuthorizationRepository,
  type CanonicalBrand,
} from "../tenant/canonical-authorization";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient, requireCanonicalActorUserId } from "./canonical-authorization";

export const INTEGRATION_CAPABILITY_OPERATIONS = [
  "ai_generation",
  "keyword_discovery",
  "keyword_metrics",
  "allintitle",
  "serp_compatibility",
  "transactional_email",
  "speech_transcription",
  "storage_media",
  "youtube_video_metadata",
  "telegram_message_send",
  "telegram_file_fetch",
] as const;
export type IntegrationCapabilityOperation = typeof INTEGRATION_CAPABILITY_OPERATIONS[number];

export const PLATFORM_ACCESS_POLICY = "HOMOLOGATION_ALLOW_ALL" as const;
export type IntegrationResourceProviderKey = "google_ads" | "dataforseo" | "deepseek" | "google_cloud" | "youtube_data" | "telegram";

/** Provider identity is enforced after the canonical capability resolves. */
export const INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS: Record<string, IntegrationResourceProviderKey> = {
  google_ads_keyword_discovery: "google_ads",
  google_ads_keyword_metrics: "google_ads",
  "dataforseo.allintitle": "dataforseo",
  "dataforseo.serp_compatibility": "dataforseo",
  ai_generation: "deepseek",
  "google_cloud.speech_transcription": "google_cloud",
  "google_cloud.storage_media": "google_cloud",
  "youtube.video_metadata": "youtube_data",
  "telegram.message_send": "telegram",
  "telegram.file_fetch": "telegram",
};

/**
 * Capabilities describe the technical operation that will be recorded in the
 * usage ledger. They are deliberately not an authorization boundary.
 */
export const INTEGRATION_RESOURCE_BY_OPERATION: Partial<Record<IntegrationCapabilityOperation, IntegrationResourceProviderKey>> = {
  ai_generation: "deepseek",
  keyword_discovery: "google_ads",
  keyword_metrics: "google_ads",
  allintitle: "dataforseo",
  // SERP consumes the same global DataForSEO resource. The capability row is
  // technical ledger metadata; it is not a module/Brand entitlement gate.
  serp_compatibility: "dataforseo",
  speech_transcription: "google_cloud",
  storage_media: "google_cloud",
  youtube_video_metadata: "youtube_data",
  telegram_message_send: "telegram",
  telegram_file_fetch: "telegram",
};

function resourceProviderForOperation(operation: IntegrationCapabilityOperation) {
  return INTEGRATION_RESOURCE_BY_OPERATION[operation] || null;
}

export const INTEGRATION_USAGE_OPERATIONS = [
  "connection_test",
  "health_check",
  "administrative_validation",
  "module_operation",
] as const;
export type IntegrationUsageOperation = typeof INTEGRATION_USAGE_OPERATIONS[number];

export const INTEGRATION_ENVIRONMENTS = ["development", "test", "staging", "production"] as const;
export type IntegrationEnvironment = typeof INTEGRATION_ENVIRONMENTS[number];

function parseIntegrationEnvironment(value: string | undefined): IntegrationEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && INTEGRATION_ENVIRONMENTS.includes(normalized as IntegrationEnvironment)
    ? normalized as IntegrationEnvironment
    : null;
}

/**
 * The integration catalog is administered in production unless a consumer
 * explicitly selects another supported environment. NODE_ENV describes the
 * Next.js process, not the environment of the integration catalog.
 */
export function resolveIntegrationEnvironment(environment: NodeJS.ProcessEnv = process.env): IntegrationEnvironment {
  return parseIntegrationEnvironment(environment.INTEGRATION_ENVIRONMENT) || "production";
}

export type IntegrationRuntimeErrorCode =
  | "INTEGRATION_NOT_AUTHORIZED"
  | "INTEGRATION_NOT_ENTITLED"
  | "INTEGRATION_BINDING_MISSING"
  | "INTEGRATION_CONNECTION_MISSING"
  | "INTEGRATION_CONNECTION_DISABLED"
  | "INTEGRATION_QUOTA_EXHAUSTED"
  | "INTEGRATION_QUOTA_POLICY_MISSING"
  | "INTEGRATION_CONTEXT_INVALID"
  | "INTEGRATION_IDEMPOTENCY_CONFLICT"
  | "INTEGRATION_REMOTE_UNAVAILABLE";

export type IntegrationRuntimeDiagnosticStage =
  | "authorization"
  | "capability"
  | "grant"
  | "binding"
  | "connection"
  | "provider"
  | "quota";

export type IntegrationRuntimeDiagnostic = {
  environment: IntegrationEnvironment;
  capabilityKey: string;
  operation: IntegrationCapabilityOperation;
  actorUserIdRef: string;
  agencyIdRef: string | null;
  brandIdRef: string | null;
  stage: IntegrationRuntimeDiagnosticStage;
  brandAvailability: "not_checked" | "available" | "missing";
  agencyAvailability: "not_checked" | "available" | "missing";
  agencyBrandLink: "not_checked" | "active" | "missing" | "ambiguous";
  capability: {
    status: "not_checked" | "missing" | "inactive" | "active";
    idRef: string | null;
  };
  grant: {
    status: "not_checked" | "missing" | "available" | "ambiguous";
    activeCount: number | null;
    sourceScopes: string[];
    targetScopes: string[];
  };
  binding: {
    status: "not_checked" | "missing" | "present" | "available" | "ambiguous" | "restricted";
    activeCount: number | null;
    idRef: string | null;
    sourceKind: string | null;
    targetScope: string | null;
    connectionIdRef: string | null;
    grantIdRef: string | null;
    externalAccountRef: string | null;
  };
  connection: {
    status: "not_checked" | "missing" | "disabled" | "ready" | "invalid";
    idRef: string | null;
    ownerScope: string | null;
    providerKey: string | null;
    secretConfigured: boolean | null;
  };
  quota: {
    status: "not_checked" | "missing" | "available" | "near_limit" | "exhausted" | "unlimited";
    activePolicyCount: number | null;
    policyIdRef: string | null;
    remainingUnits: number | null;
  };
};

export class IntegrationRuntimeError extends Error {
  public readonly status: 400 | 403 | 409 | 503;
  public readonly code: IntegrationRuntimeErrorCode;
  public diagnostic: IntegrationRuntimeDiagnostic | null;

  constructor(
    status: 400 | 403 | 409 | 503,
    code: IntegrationRuntimeErrorCode,
    message: string,
    diagnostic: IntegrationRuntimeDiagnostic | null = null,
  ) {
    super(message);
    this.name = "IntegrationRuntimeError";
    this.status = status;
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

export type IntegrationContextInput = {
  actorUserId?: string;
  agencyId?: string | null;
  brandId?: string | null;
  capabilityKey: string;
  operation: IntegrationCapabilityOperation;
  environment: IntegrationEnvironment;
  /** Number of external units that the operation intends to consume. */
  quotaUnits?: number;
};

type ActorIntegrationContext = {
  actorUserId: string;
  agencyId: string | null;
  brandId: string | null;
};

function maskedIntegrationReference(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  return normalized ? `******${normalized.slice(-4)}` : null;
}

function createIntegrationRuntimeDiagnostic(input: IntegrationContextInput & { actorUserId: string }): IntegrationRuntimeDiagnostic {
  return {
    environment: input.environment,
    capabilityKey: input.capabilityKey.trim().toLowerCase(),
    operation: input.operation,
    actorUserIdRef: maskedIntegrationReference(input.actorUserId) || "******",
    agencyIdRef: maskedIntegrationReference(input.agencyId),
    brandIdRef: maskedIntegrationReference(input.brandId),
    stage: "authorization",
    brandAvailability: "not_checked",
    agencyAvailability: "not_checked",
    agencyBrandLink: "not_checked",
    capability: { status: "not_checked", idRef: null },
    grant: { status: "not_checked", activeCount: null, sourceScopes: [], targetScopes: [] },
    binding: { status: "not_checked", activeCount: null, idRef: null, sourceKind: null, targetScope: null, connectionIdRef: null, grantIdRef: null, externalAccountRef: null },
    connection: { status: "not_checked", idRef: null, ownerScope: null, providerKey: null, secretConfigured: null },
    quota: { status: "not_checked", activePolicyCount: null, policyIdRef: null, remainingUnits: null },
  };
}

export type IntegrationCapabilityRow = {
  id: string;
  capability_key: string;
  operation_kind: IntegrationCapabilityOperation;
  environment: IntegrationEnvironment;
  unit_name: string;
  status: "active" | "disabled" | "legacy";
};

export type IntegrationGrantRow = {
  id: string;
  capability_id: string;
  target_scope_type: "agency" | "brand";
  target_agency_id: string | null;
  target_brand_id: string | null;
  source_scope_type: "platform" | "agency";
  source_agency_id: string | null;
  environment: IntegrationEnvironment;
  lifecycle_status: "active" | "revoked" | "expired";
  starts_at: string;
  ends_at: string | null;
};

export type IntegrationBindingRow = {
  id: string;
  capability_id: string;
  target_scope_type: "agency" | "brand";
  target_agency_id: string | null;
  target_brand_id: string | null;
  environment: IntegrationEnvironment;
  source_kind: "platform_granted" | "agency_owned" | "agency_granted" | "agency_distributed" | "brand_owned" | "unavailable";
  connection_id: string | null;
  grant_id: string | null;
  external_account_ref: string | null;
  lifecycle_status: "active" | "disabled" | "revoked";
};

export type IntegrationConnectionRow = {
  id: string;
  provider_id: string;
  owner_scope_type: "platform" | "agency" | "brand";
  owner_agency_id: string | null;
  owner_brand_id: string | null;
  environment: IntegrationEnvironment;
  lifecycle_status: "draft" | "pending" | "ready" | "error" | "disabled" | "revoked";
  secret_ref: string | null;
};

export type IntegrationProviderRow = {
  id: string;
  provider_key: string;
  status: "active" | "disabled" | "legacy";
};

export type IntegrationQuotaPolicyRow = {
  id: string;
  capability_id: string;
  scope_type: "platform" | "agency" | "brand";
  agency_id: string | null;
  brand_id: string | null;
  environment: IntegrationEnvironment;
  window_kind: "none" | "calendar_day" | "calendar_month" | "rolling";
  limit_units: number | string | null;
  status: "active" | "disabled";
  period_started_at: string | null;
  period_ends_at: string | null;
};

export type IntegrationUsageEvent = {
  id: string;
  actor_user_id: string;
  provider_id: string;
  /** Null only for an approved fixed Platform infrastructure resource. */
  connection_id: string | null;
  capability_id: string;
  agency_id: string | null;
  brand_id: string | null;
  operation_kind: IntegrationUsageOperation;
  module: string | null;
  environment: IntegrationEnvironment;
  units: number | string;
  unit_name: string;
  cost_amount: number | string | null;
  currency_code: string | null;
  result_status: "started" | "succeeded" | "failed" | "blocked";
  error_code: string | null;
  provider_request_ref: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type IntegrationRuntimeRepository = {
  findCapability(input: { capabilityKey: string; operation: IntegrationCapabilityOperation; environment: IntegrationEnvironment }): Promise<IntegrationCapabilityRow | null>;
  findActiveGrants(input: { capabilityId: string; agencyId: string | null; brandId: string | null; environment: IntegrationEnvironment }): Promise<IntegrationGrantRow[]>;
  findActiveBindings(input: { capabilityId: string; agencyId: string | null; brandId: string | null; environment: IntegrationEnvironment }): Promise<IntegrationBindingRow[]>;
  findConnection(connectionId: string): Promise<IntegrationConnectionRow | null>;
  findProvider(providerId: string): Promise<IntegrationProviderRow | null>;
  findProviderByKey(providerKey: IntegrationResourceProviderKey): Promise<IntegrationProviderRow | null>;
  findPlatformConnections(input: { providerKey: IntegrationResourceProviderKey; environment: IntegrationEnvironment }): Promise<Array<{ connection: IntegrationConnectionRow; provider: IntegrationProviderRow }>>;
  findActiveQuotaPolicies(input: { capabilityId: string; agencyId: string | null; brandId: string | null; environment: IntegrationEnvironment }): Promise<IntegrationQuotaPolicyRow[]>;
  sumSucceededUsage(input: { capabilityId: string; scopeType: "platform" | "agency" | "brand"; agencyId: string | null; brandId: string | null; environment: IntegrationEnvironment; periodStartedAt: string | null; periodEndsAt: string | null }): Promise<number>;
  findUsageByIdempotency(connectionId: string, idempotencyKey: string): Promise<IntegrationUsageEvent | null>;
  findInfrastructureUsageByIdempotency(input: { providerId: string; environment: IntegrationEnvironment; idempotencyKey: string }): Promise<IntegrationUsageEvent | null>;
  insertUsage(input: Omit<IntegrationUsageEvent, "id" | "created_at">): Promise<IntegrationUsageEvent>;
};

export type IntegrationRuntimeDependencies = {
  repository: IntegrationRuntimeRepository;
  authorizationRepository: CanonicalAuthorizationRepository;
  now?: () => Date;
};

export type IntegrationEntitlement = {
  allowed: boolean;
  grantId: string | null;
  sourceScope: "platform" | "agency" | "brand" | null;
  sourceAgencyId: string | null;
  targetScope: "agency" | "brand";
  targetAgencyId: string | null;
  targetBrandId: string | null;
  status: "AVAILABLE" | "NOT_AVAILABLE" | "SUSPENDED";
  reason: string;
};

export type IntegrationBinding = {
  bindingId: string;
  sourceKind: IntegrationBindingRow["source_kind"];
  targetScope: "agency" | "brand";
  targetAgencyId: string | null;
  targetBrandId: string | null;
  connectionId: string | null;
  grantId: string | null;
  externalAccountRef: string | null;
  status: IntegrationBindingRow["lifecycle_status"];
};

export type IntegrationConnection = {
  connectionId: string;
  providerId: string;
  providerKey: string;
  ownerScope: IntegrationConnectionRow["owner_scope_type"];
  ownerAgencyId: string | null;
  ownerBrandId: string | null;
  status: IntegrationConnectionRow["lifecycle_status"];
  secretConfigured: boolean;
};

export type IntegrationQuota = {
  limited: boolean;
  limitUnits: number | null;
  usedUnits: number;
  remainingUnits: number | null;
  period: { kind: IntegrationQuotaPolicyRow["window_kind"]; startsAt: string | null; endsAt: string | null } | null;
  allowed: boolean;
  status: "AVAILABLE" | "NEAR_LIMIT" | "EXHAUSTED" | "UNLIMITED" | "NOT_CONFIGURED";
  reason: string;
  policyId: string | null;
};

export type IntegrationResolvedResource = {
  allowed: true;
  actorUserId: string;
  agencyId: string | null;
  brandId: string | null;
  resourceKey: IntegrationResourceProviderKey | null;
  capability: Pick<IntegrationCapabilityRow, "id" | "capability_key" | "operation_kind" | "environment" | "unit_name"> | null;
  entitlement: IntegrationEntitlement;
  /** Only populated by legacy resource resolution. A resource-level policy does not invent a DB binding. */
  binding: IntegrationBinding | null;
  connection: IntegrationConnection;
  quota: IntegrationQuota;
};

/**
 * Usage classification for an approved fixed Platform resource. It carries
 * no Connection, credential, entitlement, binding or quota decision.
 */
export type GoogleAdsInfrastructureUsageContext = {
  sourceKind: "platform_infrastructure";
  actorUserId: string;
  agencyId: string | null;
  brandId: string | null;
  provider: Pick<IntegrationProviderRow, "id" | "provider_key">;
  capability: Pick<IntegrationCapabilityRow, "id" | "capability_key" | "operation_kind" | "environment" | "unit_name">;
};

export type RecordIntegrationUsageInput = {
  resource: IntegrationResolvedResource;
  operation: IntegrationUsageOperation;
  resultStatus: IntegrationUsageEvent["result_status"];
  units: number;
  idempotencyKey: string;
  module?: string | null;
  costAmount?: number | null;
  currencyCode?: string | null;
  errorCode?: string | null;
  providerReference?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export type RecordGoogleAdsInfrastructureUsageInput = {
  usage: GoogleAdsInfrastructureUsageContext;
  operation: IntegrationUsageOperation;
  resultStatus: IntegrationUsageEvent["result_status"];
  units: number;
  idempotencyKey: string;
  module?: string | null;
  costAmount?: number | null;
  currencyCode?: string | null;
  errorCode?: string | null;
  providerReference?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

function runtimeError(code: IntegrationRuntimeErrorCode, message: string, status: 400 | 403 | 409 | 503 = 409): never {
  throw new IntegrationRuntimeError(status, code, message);
}

function remoteError(message: string): never {
  return runtimeError("INTEGRATION_REMOTE_UNAVAILABLE", message, 503);
}

function validateContextInput(input: IntegrationContextInput) {
  const capabilityKey = input.capabilityKey.trim().toLowerCase();
  if (!capabilityKey || !/^[a-z0-9][a-z0-9_.-]*$/.test(capabilityKey)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A capability solicitada é inválida.", 400);
  if (!INTEGRATION_CAPABILITY_OPERATIONS.includes(input.operation)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A operação solicitada é inválida.", 400);
  if (!INTEGRATION_ENVIRONMENTS.includes(input.environment)) runtimeError("INTEGRATION_CONTEXT_INVALID", "O ambiente solicitado é inválido.", 400);
  for (const value of [input.actorUserId, input.agencyId, input.brandId].filter((item): item is string => Boolean(item))) {
    if (!isTenantId(value)) runtimeError("INTEGRATION_CONTEXT_INVALID", "O contexto solicitado é inválido.", 400);
  }
  if (input.agencyId && input.brandId === null) return { ...input, capabilityKey, agencyId: input.agencyId, brandId: null };
  return { ...input, capabilityKey, agencyId: input.agencyId || null, brandId: input.brandId || null };
}

function mapAuthorizationError(error: unknown): never {
  if (error instanceof IntegrationRuntimeError) throw error;
  if (error instanceof CanonicalAuthorizationError) {
    if (error.code === "REMOTE_UNAVAILABLE") return remoteError("Não foi possível validar a autorização da integração.");
    const status = error.status === 409 ? 409 : 403;
    return runtimeError("INTEGRATION_NOT_AUTHORIZED", "O ator não está autorizado para o contexto solicitado.", status);
  }
  throw error;
}

async function resolveActorContext(input: IntegrationContextInput & { actorUserId: string }, deps: IntegrationRuntimeDependencies, diagnostic?: IntegrationRuntimeDiagnostic): Promise<ActorIntegrationContext> {
  const normalized = validateContextInput(input);
  if (!isTenantId(input.actorUserId)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A identidade do ator é inválida.", 400);
  if (!normalized.agencyId && !normalized.brandId) runtimeError("INTEGRATION_CONTEXT_INVALID", "Agency ou Brand explícita é obrigatória.", 400);

  try {
    if (normalized.brandId) {
      const brand = await deps.authorizationRepository.findBrandById(normalized.brandId);
      if (diagnostic) diagnostic.brandAvailability = brand ? "available" : "missing";
      if (!brand) runtimeError("INTEGRATION_NOT_AUTHORIZED", "A Brand solicitada não está disponível.", 403);
      await requireBrandEditorialAccess({ repository: deps.authorizationRepository, brand: brand as CanonicalBrand, actorUserId: input.actorUserId });

      if (normalized.agencyId) {
        const agency = await deps.authorizationRepository.findAgencyById(normalized.agencyId);
        if (diagnostic) diagnostic.agencyAvailability = agency ? "available" : "missing";
        if (!agency) runtimeError("INTEGRATION_NOT_AUTHORIZED", "A Agency solicitada não está disponível.", 403);
        await requireAgencyOperationalAccess({ repository: deps.authorizationRepository, agency: agency as CanonicalAgency, actorUserId: input.actorUserId });
        const activeAgencyIds = await deps.authorizationRepository.findActiveAgencyIdsByBrandId(normalized.brandId);
        if (!activeAgencyIds.includes(normalized.agencyId)) {
          if (diagnostic) diagnostic.agencyBrandLink = "missing";
          runtimeError("INTEGRATION_CONTEXT_INVALID", "O vínculo Agency-Brand não está ativo.", 409);
        }
        if (diagnostic) diagnostic.agencyBrandLink = "active";
        return { actorUserId: input.actorUserId, agencyId: normalized.agencyId, brandId: normalized.brandId };
      }

      const activeAgencyIds = [...new Set(await deps.authorizationRepository.findActiveAgencyIdsByBrandId(normalized.brandId))];
      if (diagnostic) diagnostic.agencyBrandLink = activeAgencyIds.length > 1 ? "ambiguous" : activeAgencyIds.length === 1 ? "active" : "missing";
      if (activeAgencyIds.length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "A Brand possui mais de uma Agency operacional ativa.", 409);
      return { actorUserId: input.actorUserId, agencyId: activeAgencyIds[0] || null, brandId: normalized.brandId };
    }

    const agency = await deps.authorizationRepository.findAgencyById(normalized.agencyId as string);
    if (diagnostic) diagnostic.agencyAvailability = agency ? "available" : "missing";
    if (!agency) runtimeError("INTEGRATION_NOT_AUTHORIZED", "A Agency solicitada não está disponível.", 403);
    await requireAgencyOperationalAccess({ repository: deps.authorizationRepository, agency: agency as CanonicalAgency, actorUserId: input.actorUserId });
    return { actorUserId: input.actorUserId, agencyId: normalized.agencyId as string, brandId: null };
  } catch (error) {
    return mapAuthorizationError(error);
  }
}

function targetInput(context: ActorIntegrationContext) {
  return { agencyId: context.agencyId, brandId: context.brandId };
}

function homologationEntitlement(context: ActorIntegrationContext): IntegrationEntitlement {
  return {
    allowed: true,
    grantId: null,
    sourceScope: "platform",
    sourceAgencyId: null,
    targetScope: context.brandId ? "brand" : "agency",
    targetAgencyId: context.agencyId,
    targetBrandId: context.brandId,
    status: "AVAILABLE",
    reason: `${PLATFORM_ACCESS_POLICY}_RESOURCE_AVAILABLE`,
  };
}

function capabilityProjection(capability: IntegrationCapabilityRow | null) {
  if (!capability) return null;
  return {
    id: capability.id,
    capability_key: capability.capability_key,
    operation_kind: capability.operation_kind,
    environment: capability.environment,
    unit_name: capability.unit_name,
  } satisfies Pick<IntegrationCapabilityRow, "id" | "capability_key" | "operation_kind" | "environment" | "unit_name">;
}

/**
 * Resolves only the actor/tenant context and the immutable catalog identity
 * needed to append Google Ads Usage. Google Ads credentials are Platform ENV
 * infrastructure: this deliberately does not read Connections, secret_ref,
 * Vault, grants, bindings, entitlements or quota.
 */
export async function resolveGoogleAdsInfrastructureUsageForActor(
  input: IntegrationContextInput & { actorUserId: string },
  deps: IntegrationRuntimeDependencies,
): Promise<GoogleAdsInfrastructureUsageContext> {
  if (resourceProviderForOperation(input.operation) !== "google_ads") {
    runtimeError("INTEGRATION_CONTEXT_INVALID", "A classificação de Usage solicitada não pertence ao Google Ads.", 400);
  }

  const actorContext = await resolveActorContext(input, deps);
  const capability = await deps.repository.findCapability({
    capabilityKey: input.capabilityKey.trim().toLowerCase(),
    operation: input.operation,
    environment: input.environment,
  });
  if (!capability) {
    runtimeError("INTEGRATION_CONTEXT_INVALID", "A capability técnica Google Ads necessária ao ledger não está cadastrada.", 409);
  }

  const provider = await deps.repository.findProviderByKey("google_ads");
  if (!provider || provider.provider_key !== "google_ads") {
    runtimeError("INTEGRATION_CONTEXT_INVALID", "O provider técnico Google Ads necessário ao ledger não está cadastrado.", 409);
  }

  return {
    sourceKind: "platform_infrastructure",
    actorUserId: actorContext.actorUserId,
    agencyId: actorContext.agencyId,
    brandId: actorContext.brandId,
    provider: { id: provider.id, provider_key: provider.provider_key },
    capability: capabilityProjection(capability) as NonNullable<ReturnType<typeof capabilityProjection>>,
  };
}

function grantMatchesContext(grant: IntegrationGrantRow, context: ActorIntegrationContext) {
  const targetMatches = context.brandId
    ? (grant.target_scope_type === "brand" && grant.target_brand_id === context.brandId)
      || (grant.target_scope_type === "agency" && grant.target_agency_id === context.agencyId)
    : grant.target_scope_type === "agency" && grant.target_agency_id === context.agencyId;
  if (!targetMatches) return false;
  if (grant.source_scope_type === "platform") return grant.source_agency_id === null;
  return Boolean(context.agencyId && grant.source_scope_type === "agency" && grant.source_agency_id === context.agencyId);
}

function grantIsCurrent(grant: IntegrationGrantRow, now: Date) {
  const starts = Date.parse(grant.starts_at);
  const ends = grant.ends_at ? Date.parse(grant.ends_at) : null;
  return grant.lifecycle_status === "active" && Number.isFinite(starts) && starts <= now.getTime() && (ends === null || (Number.isFinite(ends) && ends > now.getTime()));
}

function directOwnedBinding(binding: IntegrationBindingRow, context: ActorIntegrationContext) {
  return context.brandId
    ? binding.source_kind === "brand_owned" && binding.target_scope_type === "brand" && binding.target_brand_id === context.brandId
    : binding.source_kind === "agency_owned" && binding.target_scope_type === "agency" && binding.target_agency_id === context.agencyId;
}

async function resolveHomologationResourceForActor(input: IntegrationContextInput & { actorUserId: string }, deps: IntegrationRuntimeDependencies, diagnostic: IntegrationRuntimeDiagnostic): Promise<IntegrationResolvedResource> {
  const actorContext = await resolveActorContext(input, deps, diagnostic);
  const resourceKey = resourceProviderForOperation(input.operation);
  if (!resourceKey) runtimeError("INTEGRATION_CONTEXT_INVALID", "A operação não possui um resource provider canônico.", 400);

  if (diagnostic) {
    diagnostic.agencyIdRef = maskedIntegrationReference(actorContext.agencyId);
    diagnostic.brandIdRef = maskedIntegrationReference(actorContext.brandId);
    diagnostic.stage = "capability";
  }
  // The catalog remains the technical operation/usage metadata source. Its
  // absence must not become an entitlement, grant or binding denial.
  const capability = await deps.repository.findCapability({ capabilityKey: input.capabilityKey.trim().toLowerCase(), operation: input.operation, environment: input.environment });
  if (diagnostic) {
    diagnostic.capability = {
      status: !capability ? "missing" : capability.status === "active" ? "active" : "inactive",
      idRef: maskedIntegrationReference(capability?.id),
    };
  }

  if (diagnostic) {
    diagnostic.stage = "connection";
    diagnostic.grant = { status: "not_checked", activeCount: null, sourceScopes: [], targetScopes: [] };
    diagnostic.binding = { ...diagnostic.binding, status: "not_checked", activeCount: null };
  }
  const candidates = await deps.repository.findPlatformConnections({ providerKey: resourceKey, environment: input.environment });
  const eligible = candidates.filter(({ connection, provider }) => connection.owner_scope_type === "platform" && connection.environment === input.environment && provider.provider_key === resourceKey && provider.status === "active" && connection.lifecycle_status === "ready" && Boolean(connection.secret_ref?.trim()));
  if (eligible.length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "Há mais de uma Connection global READY para o mesmo resource provider.", 409);
  const selected = eligible[0];
  if (!selected) {
    const hasConfiguredCandidate = candidates.some(({ connection, provider }) => provider.status === "active" && connection.owner_scope_type === "platform" && connection.environment === input.environment);
    if (diagnostic) {
      const candidate = candidates[0];
      diagnostic.connection = {
        status: hasConfiguredCandidate ? "disabled" : "missing",
        idRef: maskedIntegrationReference(candidate?.connection.id),
        ownerScope: candidate?.connection.owner_scope_type || null,
        providerKey: candidate?.provider.provider_key || resourceKey,
        secretConfigured: candidate ? Boolean(candidate.connection.secret_ref?.trim()) : false,
      };
    }
    if (hasConfiguredCandidate) runtimeError("INTEGRATION_CONNECTION_DISABLED", "A Connection global do resource não está READY ou não possui credencial configurada.", 403);
    runtimeError("INTEGRATION_CONNECTION_MISSING", "Nenhuma Connection global configurada foi encontrada para o resource.", 403);
  }

  if (diagnostic) {
    diagnostic.stage = "provider";
    diagnostic.connection = {
      status: "ready",
      idRef: maskedIntegrationReference(selected.connection.id),
      ownerScope: selected.connection.owner_scope_type,
      providerKey: selected.provider.provider_key,
      secretConfigured: true,
    };
    diagnostic.stage = "quota";
    diagnostic.quota = { status: "unlimited", activePolicyCount: 0, policyIdRef: null, remainingUnits: null };
  }
  if (input.quotaUnits !== undefined && (!Number.isFinite(input.quotaUnits) || input.quotaUnits <= 0)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A unidade de quota deve ser positiva.", 400);

  return {
    allowed: true,
    actorUserId: input.actorUserId,
    agencyId: actorContext.agencyId,
    brandId: actorContext.brandId,
    resourceKey,
    capability: capabilityProjection(capability),
    entitlement: homologationEntitlement(actorContext),
    binding: null,
    connection: {
      connectionId: selected.connection.id,
      providerId: selected.connection.provider_id,
      providerKey: selected.provider.provider_key,
      ownerScope: selected.connection.owner_scope_type,
      ownerAgencyId: selected.connection.owner_agency_id,
      ownerBrandId: selected.connection.owner_brand_id,
      status: selected.connection.lifecycle_status,
      secretConfigured: true,
    },
    quota: {
      limited: false,
      limitUnits: null,
      usedUnits: 0,
      remainingUnits: null,
      period: null,
      allowed: true,
      status: "UNLIMITED",
      reason: `${PLATFORM_ACCESS_POLICY}_UNLIMITED`,
      policyId: null,
    },
  };
}

async function resolveEntitlementForActor(input: IntegrationContextInput & { actorUserId: string }, deps: IntegrationRuntimeDependencies, context?: ActorIntegrationContext, diagnostic?: IntegrationRuntimeDiagnostic) {
  const actorContext = context || await resolveActorContext(input, deps, diagnostic);
  if (diagnostic) {
    diagnostic.agencyIdRef = maskedIntegrationReference(actorContext.agencyId);
    diagnostic.brandIdRef = maskedIntegrationReference(actorContext.brandId);
    diagnostic.stage = "capability";
  }
  const capability = await deps.repository.findCapability({ capabilityKey: input.capabilityKey.trim().toLowerCase(), operation: input.operation, environment: input.environment });
  if (diagnostic) {
    diagnostic.capability = {
      status: !capability ? "missing" : capability.status === "active" ? "active" : "inactive",
      idRef: maskedIntegrationReference(capability?.id),
    };
  }
  if (!capability || capability.status !== "active") runtimeError("INTEGRATION_NOT_ENTITLED", "A capability solicitada não está disponível.", 403);

  const now = (deps.now || (() => new Date()))();
  if (diagnostic) diagnostic.stage = "grant";
  const matchingGrants = (await deps.repository.findActiveGrants({ capabilityId: capability.id, ...targetInput(actorContext), environment: input.environment })).filter((grant) => grantMatchesContext(grant, actorContext) && grantIsCurrent(grant, now));
  // A Brand-targeted grant is more specific than an Agency grant. Prefer it
  // when both explicit paths exist; otherwise a permissive policy that
  // materializes Platform → Agency and Platform → Brand would look ambiguous
  // even though the Brand path is the canonical one for this request.
  const brandGrants = actorContext.brandId ? matchingGrants.filter((grant) => grant.target_scope_type === "brand" && grant.target_brand_id === actorContext.brandId) : [];
  const grants = brandGrants.length ? brandGrants : matchingGrants;
  if (diagnostic) {
    diagnostic.grant = {
      status: grants.length > 1 ? "ambiguous" : grants.length === 1 ? "available" : "missing",
      activeCount: grants.length,
      sourceScopes: [...new Set(grants.map((grant) => grant.source_scope_type))],
      targetScopes: [...new Set(grants.map((grant) => grant.target_scope_type))],
    };
  }
  if (grants.length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "O entitlement da capability é ambíguo.", 409);
  if (grants.length === 1) {
    const grant = grants[0];
    return {
      actorContext,
      capability,
      entitlement: {
        allowed: true,
        grantId: grant.id,
        sourceScope: grant.source_scope_type,
        sourceAgencyId: grant.source_agency_id,
        targetScope: grant.target_scope_type,
        targetAgencyId: grant.target_agency_id,
        targetBrandId: grant.target_brand_id,
        status: "AVAILABLE" as const,
        reason: "EXPLICIT_GRANT",
      },
    };
  }

  if (diagnostic) diagnostic.stage = "binding";
  const bindings = (await deps.repository.findActiveBindings({ capabilityId: capability.id, ...targetInput(actorContext), environment: input.environment })).filter((binding) => binding.lifecycle_status === "active");
  const owned = bindings.filter((binding) => directOwnedBinding(binding, actorContext));
  if (diagnostic) {
    const inspectedBinding = owned[0] || bindings[0];
    diagnostic.binding = {
      status: owned.length > 1 ? "ambiguous" : owned.length === 1 ? "available" : bindings.length ? "present" : "missing",
      activeCount: bindings.length,
      idRef: maskedIntegrationReference(inspectedBinding?.id),
      sourceKind: inspectedBinding?.source_kind || null,
      targetScope: inspectedBinding?.target_scope_type || null,
      connectionIdRef: maskedIntegrationReference(inspectedBinding?.connection_id),
      grantIdRef: maskedIntegrationReference(inspectedBinding?.grant_id),
      externalAccountRef: maskedIntegrationReference(inspectedBinding?.external_account_ref),
    };
  }
  if (owned.length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "O binding de ownership da capability é ambíguo.", 409);
  if (owned.length === 1) {
    const binding = owned[0];
    return {
      actorContext,
      capability,
      entitlement: {
        allowed: true,
        grantId: null,
        sourceScope: actorContext.brandId ? "brand" as const : "agency" as const,
        sourceAgencyId: actorContext.brandId ? null : actorContext.agencyId,
        targetScope: binding.target_scope_type,
        targetAgencyId: binding.target_agency_id,
        targetBrandId: binding.target_brand_id,
        status: "AVAILABLE" as const,
        reason: "EXPLICIT_OWNER_BINDING",
      },
    };
  }

  runtimeError("INTEGRATION_NOT_ENTITLED", "Nenhum entitlement explícito foi encontrado para a capability.", 403);
}

function bindingMatchesEntitlement(binding: IntegrationBindingRow, entitlement: IntegrationEntitlement, context: ActorIntegrationContext) {
  if (binding.source_kind === "unavailable") return true;
  if (entitlement.grantId) {
    const expectedSource = entitlement.targetScope === "agency" && entitlement.sourceScope === "platform" && context.brandId
      ? "agency_distributed"
      : entitlement.sourceScope === "platform" ? "platform_granted" : "agency_granted";
    return binding.source_kind === expectedSource && binding.grant_id === entitlement.grantId;
  }
  return directOwnedBinding(binding, context) && binding.grant_id === null;
}

async function resolveBindingForEntitlement(input: IntegrationContextInput & { actorUserId: string }, resolved: Awaited<ReturnType<typeof resolveEntitlementForActor>>, deps: IntegrationRuntimeDependencies, diagnostic?: IntegrationRuntimeDiagnostic): Promise<IntegrationBinding> {
  if (diagnostic) diagnostic.stage = "binding";
  const rows = (await deps.repository.findActiveBindings({ capabilityId: resolved.capability.id, ...targetInput(resolved.actorContext), environment: input.environment })).filter((binding) => binding.lifecycle_status === "active");
  if (diagnostic) {
    diagnostic.binding = {
      ...diagnostic.binding,
      status: rows.length > 1 ? "ambiguous" : rows.length === 1 ? "available" : "missing",
      activeCount: rows.length,
      idRef: maskedIntegrationReference(rows[0]?.id),
      sourceKind: rows[0]?.source_kind || null,
      targetScope: rows[0]?.target_scope_type || null,
      connectionIdRef: maskedIntegrationReference(rows[0]?.connection_id),
      grantIdRef: maskedIntegrationReference(rows[0]?.grant_id),
      externalAccountRef: maskedIntegrationReference(rows[0]?.external_account_ref),
    };
  }
  if (rows.length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "Existe mais de um binding ativo para o mesmo contexto.", 409);
  if (!rows.length) runtimeError("INTEGRATION_BINDING_MISSING", "Nenhum binding explícito foi encontrado.", 403);
  const binding = rows[0];
  const targetMatches = resolved.actorContext.brandId
    ? binding.target_scope_type === "brand" && binding.target_brand_id === resolved.actorContext.brandId
    : binding.target_scope_type === "agency" && binding.target_agency_id === resolved.actorContext.agencyId;
  if (!targetMatches || binding.capability_id !== resolved.capability.id || binding.environment !== input.environment) runtimeError("INTEGRATION_BINDING_MISSING", "O binding não corresponde ao contexto resolvido.", 403);
  if (!bindingMatchesEntitlement(binding, resolved.entitlement, resolved.actorContext)) runtimeError("INTEGRATION_BINDING_MISSING", "O binding não corresponde ao entitlement resolvido.", 403);
  if (binding.source_kind === "unavailable") {
    if (diagnostic) diagnostic.binding.status = "restricted";
    runtimeError("INTEGRATION_BINDING_MISSING", "A capability foi explicitamente restringida neste contexto.", 403);
  }
  if (!binding.connection_id) runtimeError("INTEGRATION_BINDING_MISSING", "O binding não possui connection utilizável.", 403);
  return {
    bindingId: binding.id,
    sourceKind: binding.source_kind,
    targetScope: binding.target_scope_type,
    targetAgencyId: binding.target_agency_id,
    targetBrandId: binding.target_brand_id,
    connectionId: binding.connection_id,
    grantId: binding.grant_id,
    externalAccountRef: binding.external_account_ref,
    status: binding.lifecycle_status,
  };
}

async function resolveConnectionForBinding(input: IntegrationContextInput & { actorUserId: string }, resolved: Awaited<ReturnType<typeof resolveEntitlementForActor>>, binding: IntegrationBinding, deps: IntegrationRuntimeDependencies, diagnostic?: IntegrationRuntimeDiagnostic): Promise<IntegrationConnection> {
  if (diagnostic) {
    diagnostic.stage = "connection";
    diagnostic.connection = { ...diagnostic.connection, idRef: maskedIntegrationReference(binding.connectionId), status: "not_checked" };
  }
  if (!binding.connectionId) runtimeError("INTEGRATION_CONNECTION_MISSING", "O binding não possui connection.", 403);
  const connection = await deps.repository.findConnection(binding.connectionId);
  if (diagnostic && connection) {
    diagnostic.connection = { ...diagnostic.connection, idRef: maskedIntegrationReference(connection.id), ownerScope: connection.owner_scope_type, status: connection.lifecycle_status === "ready" ? "ready" : "disabled", secretConfigured: Boolean(connection.secret_ref?.trim()) };
  }
  if (!connection) runtimeError("INTEGRATION_CONNECTION_MISSING", "A connection do binding não foi encontrada.", 403);
  if (connection.environment !== input.environment) runtimeError("INTEGRATION_CONNECTION_MISSING", "A connection não pertence ao ambiente solicitado.", 409);
  if (connection.lifecycle_status !== "ready") runtimeError("INTEGRATION_CONNECTION_DISABLED", "A connection não está READY para a operação.", 403);
  if (!connection.secret_ref?.trim()) runtimeError("INTEGRATION_CONNECTION_MISSING", "A connection não possui credencial configurada.", 403);

  const expectedOwner = binding.sourceKind === "platform_granted" ? connection.owner_scope_type === "platform"
    : binding.sourceKind === "agency_granted" ? connection.owner_scope_type === "agency" && connection.owner_agency_id === resolved.entitlement.sourceAgencyId
      : binding.sourceKind === "agency_distributed" ? (connection.owner_scope_type === "platform"
        || (connection.owner_scope_type === "agency" && connection.owner_agency_id === resolved.entitlement.targetAgencyId))
        : binding.sourceKind === "agency_owned" ? connection.owner_scope_type === "agency" && connection.owner_agency_id === resolved.actorContext.agencyId
          : binding.sourceKind === "brand_owned" ? connection.owner_scope_type === "brand" && connection.owner_brand_id === resolved.actorContext.brandId
            : false;
  if (!expectedOwner) runtimeError("INTEGRATION_CONNECTION_MISSING", "A connection não corresponde à origem explícita do binding.", 403);

  if (diagnostic) diagnostic.stage = "provider";
  const provider = await deps.repository.findProvider(connection.provider_id);
  if (diagnostic) diagnostic.connection = { ...diagnostic.connection, providerKey: provider?.provider_key || null };
  if (!provider || provider.status !== "active") runtimeError("INTEGRATION_CONNECTION_DISABLED", "O provider da connection não está disponível.", 403);
  const expectedProvider = INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS[resolved.capability.capability_key];
  if (expectedProvider && provider.provider_key !== expectedProvider) {
    runtimeError("INTEGRATION_CONNECTION_MISSING", "A connection não corresponde ao provider canônico da capability.", 403);
  }
  return {
    connectionId: connection.id,
    providerId: connection.provider_id,
    providerKey: provider.provider_key,
    ownerScope: connection.owner_scope_type,
    ownerAgencyId: connection.owner_agency_id,
    ownerBrandId: connection.owner_brand_id,
    status: connection.lifecycle_status,
    secretConfigured: true,
  };
}

function numeric(value: number | string | null | undefined, label: string) {
  if (value === null || typeof value === "undefined") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) runtimeError("INTEGRATION_CONTEXT_INVALID", `O valor ${label} é inválido.`, 400);
  return parsed;
}

async function evaluateQuotaForResource(input: IntegrationContextInput & { actorUserId: string }, resolved: Awaited<ReturnType<typeof resolveEntitlementForActor>>, units: number, deps: IntegrationRuntimeDependencies, diagnostic?: IntegrationRuntimeDiagnostic): Promise<IntegrationQuota> {
  if (!Number.isFinite(units) || units <= 0) runtimeError("INTEGRATION_CONTEXT_INVALID", "A unidade de quota deve ser positiva.", 400);
  if (diagnostic) diagnostic.stage = "quota";
  const policies = (await deps.repository.findActiveQuotaPolicies({ capabilityId: resolved.capability.id, ...targetInput(resolved.actorContext), environment: input.environment })).filter((policy) => policy.status === "active");
  if (diagnostic) diagnostic.quota = { ...diagnostic.quota, activePolicyCount: policies.length, status: policies.length ? "available" : "missing" };
  const rank = (policy: IntegrationQuotaPolicyRow) => policy.scope_type === "brand" && resolved.actorContext.brandId === policy.brand_id ? 3 : policy.scope_type === "agency" && resolved.actorContext.agencyId === policy.agency_id ? 2 : policy.scope_type === "platform" && !policy.agency_id && !policy.brand_id ? 1 : 0;
  const ranked = policies.map((policy) => ({ policy, rank: rank(policy) })).filter((item) => item.rank > 0).sort((left, right) => right.rank - left.rank);
  if (!ranked.length) return { limited: false, limitUnits: null, usedUnits: 0, remainingUnits: null, period: null, allowed: false, status: "NOT_CONFIGURED", reason: "QUOTA_POLICY_MISSING", policyId: null };
  const highestRank = ranked[0].rank;
  const selected = ranked.filter((item) => item.rank === highestRank).map((item) => item.policy);
  if (selected.length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "Há mais de uma quota ativa no mesmo escopo.", 409);
  const policy = selected[0];
  const limitUnits = numeric(policy.limit_units, "limit_units");
  if (limitUnits === null) {
    if (diagnostic) diagnostic.quota = { ...diagnostic.quota, status: "unlimited", policyIdRef: maskedIntegrationReference(policy.id), remainingUnits: null };
    return { limited: false, limitUnits: null, usedUnits: 0, remainingUnits: null, period: { kind: policy.window_kind, startsAt: policy.period_started_at, endsAt: policy.period_ends_at }, allowed: true, status: "UNLIMITED", reason: "QUOTA_UNLIMITED", policyId: policy.id };
  }
  const usedUnits = await deps.repository.sumSucceededUsage({ capabilityId: resolved.capability.id, scopeType: policy.scope_type, agencyId: policy.agency_id, brandId: policy.brand_id, environment: input.environment, periodStartedAt: policy.period_started_at, periodEndsAt: policy.period_ends_at });
  const remainingUnits = Math.max(0, limitUnits - usedUnits);
  const allowed = usedUnits + units <= limitUnits;
  if (diagnostic) diagnostic.quota = { ...diagnostic.quota, status: allowed ? remainingUnits <= limitUnits * 0.1 ? "near_limit" : "available" : "exhausted", policyIdRef: maskedIntegrationReference(policy.id), remainingUnits };
  return { limited: true, limitUnits, usedUnits, remainingUnits, period: { kind: policy.window_kind, startsAt: policy.period_started_at, endsAt: policy.period_ends_at }, allowed, status: allowed ? remainingUnits <= limitUnits * 0.1 ? "NEAR_LIMIT" : "AVAILABLE" : "EXHAUSTED", reason: allowed ? "QUOTA_AVAILABLE" : "QUOTA_EXHAUSTED", policyId: policy.id };
}

async function resolveResourceForActor(input: IntegrationContextInput & { actorUserId: string }, deps: IntegrationRuntimeDependencies): Promise<IntegrationResolvedResource> {
  const diagnostic = createIntegrationRuntimeDiagnostic(input);
  try {
    if (resourceProviderForOperation(input.operation)) return await resolveHomologationResourceForActor(input, deps, diagnostic);
    const resolved = await resolveEntitlementForActor(input, deps, undefined, diagnostic);
    const binding = await resolveBindingForEntitlement(input, resolved, deps, diagnostic);
    const connection = await resolveConnectionForBinding(input, resolved, binding, deps, diagnostic);
    const quota = await evaluateQuotaForResource(input, resolved, input.quotaUnits ?? 1, deps, diagnostic);
    if (!quota.allowed) {
      if (quota.status === "NOT_CONFIGURED") runtimeError("INTEGRATION_QUOTA_POLICY_MISSING", "Nenhuma policy de quota foi configurada para a capability.", 409);
      runtimeError("INTEGRATION_QUOTA_EXHAUSTED", "A quota da capability está esgotada.", 409);
    }
    return { allowed: true, actorUserId: input.actorUserId, agencyId: resolved.actorContext.agencyId, brandId: resolved.actorContext.brandId, resourceKey: null, capability: capabilityProjection(resolved.capability), entitlement: resolved.entitlement, binding, connection, quota };
  } catch (error) {
    if (error instanceof IntegrationRuntimeError) error.diagnostic = diagnostic;
    throw error;
  }
}

function defaultDependencies(): IntegrationRuntimeDependencies {
  const client = createCanonicalServiceClient();
  return { repository: createIntegrationRuntimeRepository(client), authorizationRepository: createCanonicalAuthorizationRepository(client) };
}

export async function resolveIntegrationResource(input: IntegrationContextInput): Promise<IntegrationResolvedResource> {
  const actorUserId = await requireCanonicalActorUserId();
  if (input.actorUserId && input.actorUserId !== actorUserId) runtimeError("INTEGRATION_CONTEXT_INVALID", "actorUserId não corresponde à sessão autenticada.", 403);
  return resolveResourceForActor({ ...input, actorUserId }, defaultDependencies());
}

export async function resolveIntegrationResourceForActor(input: IntegrationContextInput & { actorUserId: string }, deps: IntegrationRuntimeDependencies): Promise<IntegrationResolvedResource> {
  return resolveResourceForActor(input, deps);
}

export async function resolveIntegrationEntitlement(input: IntegrationContextInput): Promise<IntegrationEntitlement> {
  const actorUserId = await requireCanonicalActorUserId();
  if (input.actorUserId && input.actorUserId !== actorUserId) runtimeError("INTEGRATION_CONTEXT_INVALID", "actorUserId não corresponde à sessão autenticada.", 403);
  const deps = defaultDependencies();
  if (resourceProviderForOperation(input.operation)) return homologationEntitlement(await resolveActorContext({ ...input, actorUserId }, deps));
  return (await resolveEntitlementForActor({ ...input, actorUserId }, deps)).entitlement;
}

export async function resolveIntegrationEntitlementForActor(input: IntegrationContextInput & { actorUserId: string }, deps: IntegrationRuntimeDependencies): Promise<IntegrationEntitlement> {
  if (resourceProviderForOperation(input.operation)) return homologationEntitlement(await resolveActorContext(input, deps));
  return (await resolveEntitlementForActor(input, deps)).entitlement;
}

export async function evaluateIntegrationQuota(input: { resource: IntegrationResolvedResource; units: number }): Promise<IntegrationQuota> {
  const actorUserId = await requireCanonicalActorUserId();
  if (input.resource.actorUserId !== actorUserId) runtimeError("INTEGRATION_CONTEXT_INVALID", "A resource não pertence à sessão autenticada.", 403);
  if (input.resource.resourceKey) {
    if (!Number.isFinite(input.units) || input.units <= 0) runtimeError("INTEGRATION_CONTEXT_INVALID", "A unidade de quota deve ser positiva.", 400);
    return input.resource.quota;
  }
  if (!input.resource.capability) runtimeError("INTEGRATION_CONTEXT_INVALID", "O resource não possui metadados técnicos de quota.", 409);
  const deps = defaultDependencies();
  const resolved = await resolveEntitlementForActor({ actorUserId, agencyId: input.resource.agencyId, brandId: input.resource.brandId, capabilityKey: input.resource.capability.capability_key, operation: input.resource.capability.operation_kind, environment: input.resource.capability.environment }, deps);
  return evaluateQuotaForResource({ actorUserId, agencyId: input.resource.agencyId, brandId: input.resource.brandId, capabilityKey: input.resource.capability.capability_key, operation: input.resource.capability.operation_kind, environment: input.resource.capability.environment }, resolved, input.units, deps);
}

function sanitizeText(value: string | null | undefined, max: number) {
  if (value === null || typeof value === "undefined") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function sanitizeCorrelation(value: string | null | undefined) {
  const normalized = sanitizeText(value, 256);
  if (!normalized || /secret|token|password|authorization|api[_-]?key|credential|bearer/i.test(normalized) || (normalized.match(/\./g) || []).length >= 2) return null;
  return normalized.replace(/[^A-Za-z0-9._:/-]/g, "").slice(0, 256) || null;
}

function sanitizeMetadata(value: Record<string, unknown> | undefined) {
  if (!value) return {};
  const blocked = /secret|token|password|authorization|api[_-]?key|credential/i;
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 24)) {
    if (blocked.test(key)) continue;
    if (typeof raw === "string") output[key.slice(0, 80)] = raw.slice(0, 256);
    else if (typeof raw === "number" && Number.isFinite(raw)) output[key.slice(0, 80)] = raw;
    else if (typeof raw === "boolean" || raw === null) output[key.slice(0, 80)] = raw;
  }
  return output;
}

function usageEquivalent(existing: IntegrationUsageEvent, input: Omit<IntegrationUsageEvent, "id" | "created_at">) {
  return existing.actor_user_id === input.actor_user_id
    && existing.provider_id === input.provider_id
    && existing.connection_id === input.connection_id
    && existing.capability_id === input.capability_id
    && existing.agency_id === input.agency_id
    && existing.brand_id === input.brand_id
    && existing.operation_kind === input.operation_kind
    && existing.module === input.module
    && existing.environment === input.environment
    && Number(existing.units) === Number(input.units)
    && existing.unit_name === input.unit_name
    && existing.result_status === input.result_status
    && existing.error_code === input.error_code
    && existing.provider_request_ref === input.provider_request_ref
    && JSON.stringify(existing.metadata) === JSON.stringify(input.metadata);
}

export async function recordIntegrationUsage(input: RecordIntegrationUsageInput): Promise<IntegrationUsageEvent | null> {
  const actorUserId = await requireCanonicalActorUserId();
  if (input.resource.actorUserId !== actorUserId) runtimeError("INTEGRATION_CONTEXT_INVALID", "A resource não pertence à sessão autenticada.", 403);
  return recordIntegrationUsageForResource(input, defaultDependencies());
}

export async function recordIntegrationUsageForResource(input: RecordIntegrationUsageInput, deps: IntegrationRuntimeDependencies): Promise<IntegrationUsageEvent | null> {
  if (!input.resource.connection.connectionId) runtimeError("INTEGRATION_CONTEXT_INVALID", "Usage vinculado a Connection exige uma Connection válida.", 400);
  if (!Number.isFinite(input.units) || input.units < 0) runtimeError("INTEGRATION_CONTEXT_INVALID", "As unidades de usage são inválidas.", 400);
  if (!input.idempotencyKey.trim() || input.idempotencyKey.trim().length > 256) runtimeError("INTEGRATION_CONTEXT_INVALID", "A idempotency key é inválida.", 400);
  if (!INTEGRATION_USAGE_OPERATIONS.includes(input.operation)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A operação de usage é inválida.", 400);
  if (input.operation === "module_operation" && (!input.resource.brandId || !input.module?.trim())) runtimeError("INTEGRATION_CONTEXT_INVALID", "Uma operação de módulo exige Brand e módulo.", 400);
  // A catalog row is metadata for the append-only ledger, never an access
  // gate. If an operation has no catalog row, the provider request may still
  // proceed, but there is no safe capability_id to persist in this schema.
  if (!input.resource.capability) return null;
  const costAmount = input.costAmount === null || typeof input.costAmount === "undefined" ? null : numeric(input.costAmount, "cost_amount");
  const currencyCode = sanitizeText(input.currencyCode, 3)?.toUpperCase() || null;
  if (currencyCode && !/^[A-Z]{3}$/.test(currencyCode)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A moeda do usage é inválida.", 400);
  const occurredAt = input.occurredAt || new Date();
  const row: Omit<IntegrationUsageEvent, "id" | "created_at"> = {
    actor_user_id: input.resource.actorUserId,
    provider_id: input.resource.connection.providerId,
    connection_id: input.resource.connection.connectionId,
    capability_id: input.resource.capability.id,
    agency_id: input.resource.agencyId,
    brand_id: input.resource.brandId,
    operation_kind: input.operation,
    module: sanitizeText(input.module, 80),
    environment: input.resource.capability.environment,
    units: input.units,
    unit_name: input.resource.capability.unit_name,
    cost_amount: costAmount,
    currency_code: currencyCode,
    result_status: input.resultStatus,
    error_code: sanitizeText(input.errorCode, 160),
    provider_request_ref: sanitizeCorrelation(input.providerReference),
    idempotency_key: input.idempotencyKey.trim().slice(0, 256),
    metadata: sanitizeMetadata(input.metadata),
    occurred_at: occurredAt.toISOString(),
  };
  try {
    return await deps.repository.insertUsage(row);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code !== "23505") throw error;
    const existing = await deps.repository.findUsageByIdempotency(input.resource.connection.connectionId, row.idempotency_key);
    if (!existing) remoteError("Não foi possível confirmar o evento idempotente.");
    if (!usageEquivalent(existing, row)) runtimeError("INTEGRATION_IDEMPOTENCY_CONFLICT", "A idempotency key já foi usada por outra operação.", 409);
    return existing;
  }
}

export async function recordGoogleAdsInfrastructureUsage(input: RecordGoogleAdsInfrastructureUsageInput, deps: IntegrationRuntimeDependencies): Promise<IntegrationUsageEvent> {
  if (input.usage.sourceKind !== "platform_infrastructure" || input.usage.provider.provider_key !== "google_ads") {
    runtimeError("INTEGRATION_CONTEXT_INVALID", "O Usage de infraestrutura precisa identificar Google Ads sem Connection.", 400);
  }
  if (!Number.isFinite(input.units) || input.units < 0) runtimeError("INTEGRATION_CONTEXT_INVALID", "As unidades de usage são inválidas.", 400);
  if (!input.idempotencyKey.trim() || input.idempotencyKey.trim().length > 256) runtimeError("INTEGRATION_CONTEXT_INVALID", "A idempotency key é inválida.", 400);
  if (!INTEGRATION_USAGE_OPERATIONS.includes(input.operation)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A operação de usage é inválida.", 400);
  if (input.operation === "module_operation" && (!input.usage.brandId || !input.module?.trim())) runtimeError("INTEGRATION_CONTEXT_INVALID", "Uma operação de módulo exige Brand e módulo.", 400);

  const costAmount = input.costAmount === null || typeof input.costAmount === "undefined" ? null : numeric(input.costAmount, "cost_amount");
  const currencyCode = sanitizeText(input.currencyCode, 3)?.toUpperCase() || null;
  if (currencyCode && !/^[A-Z]{3}$/.test(currencyCode)) runtimeError("INTEGRATION_CONTEXT_INVALID", "A moeda do usage é inválida.", 400);
  const occurredAt = input.occurredAt || new Date();
  const row: Omit<IntegrationUsageEvent, "id" | "created_at"> = {
    actor_user_id: input.usage.actorUserId,
    provider_id: input.usage.provider.id,
    connection_id: null,
    capability_id: input.usage.capability.id,
    agency_id: input.usage.agencyId,
    brand_id: input.usage.brandId,
    operation_kind: input.operation,
    module: sanitizeText(input.module, 80),
    environment: input.usage.capability.environment,
    units: input.units,
    unit_name: input.usage.capability.unit_name,
    cost_amount: costAmount,
    currency_code: currencyCode,
    result_status: input.resultStatus,
    error_code: sanitizeText(input.errorCode, 160),
    provider_request_ref: sanitizeCorrelation(input.providerReference),
    idempotency_key: input.idempotencyKey.trim().slice(0, 256),
    metadata: sanitizeMetadata(input.metadata),
    occurred_at: occurredAt.toISOString(),
  };
  try {
    return await deps.repository.insertUsage(row);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code !== "23505") throw error;
    const existing = await deps.repository.findInfrastructureUsageByIdempotency({
      providerId: row.provider_id,
      environment: row.environment,
      idempotencyKey: row.idempotency_key,
    });
    if (!existing) remoteError("Não foi possível confirmar o evento idempotente de infraestrutura.");
    if (!usageEquivalent(existing, row)) runtimeError("INTEGRATION_IDEMPOTENCY_CONFLICT", "A idempotency key já foi usada por outra operação.", 409);
    return existing;
  }
}

export function integrationRuntimeErrorResponse(error: unknown) {
  if (error instanceof IntegrationRuntimeError) return { status: error.status, code: error.code, message: error.message };
  return { status: 503 as const, code: "INTEGRATION_REMOTE_UNAVAILABLE" as const, message: "Não foi possível concluir a operação de integração." };
}

function queryError(message: string, error: { message?: string } | null) {
  if (error) remoteError(message);
}

export function createIntegrationRuntimeRepository(client: Pick<SupabaseClient, "from">): IntegrationRuntimeRepository {
  return {
    async findCapability(input) {
      const result = await client.from("integration_capabilities").select("id,capability_key,operation_kind,environment,unit_name,status").eq("capability_key", input.capabilityKey).eq("operation_kind", input.operation).eq("environment", input.environment).limit(2);
      queryError("Não foi possível consultar a capability da integração.", result.error);
      if ((result.data || []).length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "A capability possui definições ambíguas.", 409);
      return ((result.data || [])[0] as IntegrationCapabilityRow | undefined) || null;
    },
    async findActiveGrants(input) {
      let query = client.from("integration_grants").select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,source_scope_type,source_agency_id,environment,lifecycle_status,starts_at,ends_at").eq("capability_id", input.capabilityId).eq("environment", input.environment).eq("lifecycle_status", "active");
      if (input.brandId && input.agencyId) {
        // Read both possible target scopes. A target-Agency grant can only be
        // consumed through an explicit agency_distributed Brand binding;
        // grantMatchesContext plus bindingMatchesEntitlement enforce that
        // distinction without inferring access from the grant alone.
        query = query.or(`and(target_scope_type.eq.brand,target_brand_id.eq.${input.brandId}),and(target_scope_type.eq.agency,target_agency_id.eq.${input.agencyId})`);
      } else {
        query = input.brandId ? query.eq("target_scope_type", "brand").eq("target_brand_id", input.brandId) : query.eq("target_scope_type", "agency").eq("target_agency_id", input.agencyId as string);
      }
      const result = await query.limit(3);
      queryError("Não foi possível consultar o entitlement da integração.", result.error);
      return (result.data || []) as IntegrationGrantRow[];
    },
    async findActiveBindings(input) {
      let query = client.from("integration_bindings").select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,environment,source_kind,connection_id,grant_id,external_account_ref,lifecycle_status").eq("capability_id", input.capabilityId).eq("environment", input.environment).eq("lifecycle_status", "active");
      query = input.brandId ? query.eq("target_scope_type", "brand").eq("target_brand_id", input.brandId) : query.eq("target_scope_type", "agency").eq("target_agency_id", input.agencyId as string);
      const result = await query.limit(3);
      queryError("Não foi possível consultar o binding da integração.", result.error);
      return (result.data || []) as IntegrationBindingRow[];
    },
    async findConnection(connectionId) {
      const result = await client.from("integration_connections").select("id,provider_id,owner_scope_type,owner_agency_id,owner_brand_id,environment,lifecycle_status,secret_ref").eq("id", connectionId).maybeSingle();
      queryError("Não foi possível consultar a connection da integração.", result.error);
      return (result.data as IntegrationConnectionRow | null) || null;
    },
    async findProvider(providerId) {
      const result = await client.from("integration_providers").select("id,provider_key,status").eq("id", providerId).maybeSingle();
      queryError("Não foi possível consultar o provider da integração.", result.error);
      return (result.data as IntegrationProviderRow | null) || null;
    },
    async findProviderByKey(providerKey) {
      const result = await client.from("integration_providers").select("id,provider_key,status").eq("provider_key", providerKey).limit(2);
      queryError("Não foi possível consultar o provider da integração.", result.error);
      if ((result.data || []).length > 1) runtimeError("INTEGRATION_CONTEXT_INVALID", "O provider da integração possui definições ambíguas.", 409);
      return ((result.data || [])[0] as IntegrationProviderRow | undefined) || null;
    },
    async findPlatformConnections(input) {
      const providersResult = await client.from("integration_providers").select("id,provider_key,status").eq("provider_key", input.providerKey).limit(3);
      queryError("Não foi possível consultar o provider da integração.", providersResult.error);
      const providers = (providersResult.data || []) as IntegrationProviderRow[];
      if (!providers.length) return [];
      const providerIds = providers.map((provider) => provider.id);
      const connectionsResult = await client.from("integration_connections").select("id,provider_id,owner_scope_type,owner_agency_id,owner_brand_id,environment,lifecycle_status,secret_ref").in("provider_id", providerIds).eq("owner_scope_type", "platform").eq("environment", input.environment).limit(10);
      queryError("Não foi possível consultar as connections da Plataforma.", connectionsResult.error);
      return ((connectionsResult.data || []) as IntegrationConnectionRow[]).map((connection) => ({
        connection,
        provider: providers.find((provider) => provider.id === connection.provider_id) as IntegrationProviderRow,
      }));
    },
    async findActiveQuotaPolicies(input) {
      const result = await client.from("integration_quota_policies").select("id,capability_id,scope_type,agency_id,brand_id,environment,window_kind,limit_units,status,period_started_at,period_ends_at").eq("capability_id", input.capabilityId).eq("environment", input.environment).eq("status", "active");
      queryError("Não foi possível consultar a quota da integração.", result.error);
      return (result.data || []) as IntegrationQuotaPolicyRow[];
    },
    async sumSucceededUsage(input) {
      let query = client.from("integration_usage_events").select("units").eq("capability_id", input.capabilityId).eq("environment", input.environment).eq("result_status", "succeeded");
      if (input.scopeType === "brand" && input.brandId) query = query.eq("brand_id", input.brandId);
      else if (input.scopeType === "agency" && input.agencyId) query = query.eq("agency_id", input.agencyId);
      if (input.periodStartedAt) query = query.gte("occurred_at", input.periodStartedAt);
      if (input.periodEndsAt) query = query.lt("occurred_at", input.periodEndsAt);
      const result = await query;
      queryError("Não foi possível consultar o consumo da integração.", result.error);
      return (result.data || []).reduce((sum, row) => {
        const units = Number((row as { units: number | string }).units);
        return Number.isFinite(units) && units >= 0 ? sum + units : sum;
      }, 0);
    },
    async findUsageByIdempotency(connectionId, idempotencyKey) {
      const result = await client.from("integration_usage_events").select("id,actor_user_id,provider_id,connection_id,capability_id,agency_id,brand_id,operation_kind,module,environment,units,unit_name,cost_amount,currency_code,result_status,error_code,provider_request_ref,idempotency_key,metadata,occurred_at,created_at").eq("connection_id", connectionId).eq("idempotency_key", idempotencyKey).maybeSingle();
      queryError("Não foi possível confirmar o usage idempotente.", result.error);
      return (result.data as IntegrationUsageEvent | null) || null;
    },
    async findInfrastructureUsageByIdempotency(input) {
      const result = await client.from("integration_usage_events").select("id,actor_user_id,provider_id,connection_id,capability_id,agency_id,brand_id,operation_kind,module,environment,units,unit_name,cost_amount,currency_code,result_status,error_code,provider_request_ref,idempotency_key,metadata,occurred_at,created_at").is("connection_id", null).eq("provider_id", input.providerId).eq("environment", input.environment).eq("idempotency_key", input.idempotencyKey).maybeSingle();
      queryError("Não foi possível confirmar o usage idempotente de infraestrutura.", result.error);
      return (result.data as IntegrationUsageEvent | null) || null;
    },
    async insertUsage(input) {
      const result = await client.from("integration_usage_events").insert(input).select("id,actor_user_id,provider_id,connection_id,capability_id,agency_id,brand_id,operation_kind,module,environment,units,unit_name,cost_amount,currency_code,result_status,error_code,provider_request_ref,idempotency_key,metadata,occurred_at,created_at").single();
      if (result.error) throw result.error;
      return result.data as IntegrationUsageEvent;
    },
  };
}
