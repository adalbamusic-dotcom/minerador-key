import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTenantId } from "@/lib/tenant-routing";
import { getAgencyWorkspaceData } from "@/lib/server/agency-workspace";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";

type GovernanceClient = Pick<SupabaseClient, "from">;

const DATAFORSEO_CAPABILITY = "dataforseo.allintitle" as const;
const OPERATION = "allintitle" as const;
const ENVIRONMENT = "production" as const;

export type AgencyIntegrationCapability = {
  id: string;
  capabilityKey: typeof DATAFORSEO_CAPABILITY;
  operationKind: typeof OPERATION;
  environment: typeof ENVIRONMENT;
  unitName: string;
  status: "active" | "disabled" | "legacy";
};

export type AgencyIntegrationGrant = {
  id: string;
  capabilityId: string;
  capabilityKey: typeof DATAFORSEO_CAPABILITY;
  targetAgencyId: string;
  environment: typeof ENVIRONMENT;
  lifecycleStatus: "active" | "revoked" | "expired";
  sourceScope: "platform";
  bindingReady: boolean;
  connectionReady: boolean;
  providerKey: string | null;
};

export type AgencyIntegrationBrandBinding = {
  id: string;
  brandId: string;
  brandName: string;
  capabilityId: string;
  capabilityKey: typeof DATAFORSEO_CAPABILITY;
  environment: typeof ENVIRONMENT;
  sourceKind: "agency_distributed" | "platform_granted" | "agency_granted" | "brand_owned" | "unavailable";
  lifecycleStatus: "active" | "disabled" | "revoked";
  providerKey: string | null;
};

export type AgencyIntegrationQuota = {
  id: string;
  capabilityId: string;
  capabilityKey: typeof DATAFORSEO_CAPABILITY;
  scopeType: "agency" | "brand";
  scopeId: string;
  scopeName: string;
  environment: typeof ENVIRONMENT;
  windowKind: "none" | "calendar_day";
  limitUnits: number | null;
  status: "active" | "disabled";
  periodStartedAt: string | null;
  periodEndsAt: string | null;
};

export type AgencyIntegrationWorkspace = {
  agency: { id: string; name: string; agencyRef: string };
  canManage: boolean;
  brands: Array<{ id: string; name: string; status: string }>;
  capabilities: AgencyIntegrationCapability[];
  platformGrants: AgencyIntegrationGrant[];
  brandBindings: AgencyIntegrationBrandBinding[];
  quotas: AgencyIntegrationQuota[];
};

export class IntegrationGovernanceError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 503;
  readonly code: string;

  constructor(status: 400 | 403 | 404 | 409 | 503, code: string, message: string) {
    super(message);
    this.name = "IntegrationGovernanceError";
    this.status = status;
    this.code = code;
  }
}

function remoteFailure(message: string): never {
  throw new IntegrationGovernanceError(503, "INTEGRATION_GOVERNANCE_REMOTE_UNAVAILABLE", message);
}

function requiredId(value: unknown, field: string) {
  if (typeof value !== "string" || !isTenantId(value.trim())) {
    throw new IntegrationGovernanceError(400, "INTEGRATION_GOVERNANCE_INVALID_INPUT", `${field} inválido.`);
  }
  return value.trim();
}

function requiredEnum<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new IntegrationGovernanceError(400, "INTEGRATION_GOVERNANCE_INVALID_INPUT", `${field} inválido.`);
  }
  return value as T[number];
}

function resultError(result: { error: { code?: string; message?: string } | null }, message: string): never | void {
  if (!result.error) return;
  if (result.error.code === "23505") {
    throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_DUPLICATE", message);
  }
  remoteFailure(message);
}

function connectionReady(row: { lifecycle_status: string; secret_ref: string | null } | null) {
  return Boolean(row && row.lifecycle_status === "ready" && row.secret_ref?.trim());
}

async function readDataForSeoCapability(client: GovernanceClient) {
  const result = await client.from("integration_capabilities")
    .select("id,capability_key,operation_kind,environment,unit_name,status")
    .eq("capability_key", DATAFORSEO_CAPABILITY)
    .eq("operation_kind", OPERATION)
    .eq("environment", ENVIRONMENT)
    .limit(2);
  if (result.error) remoteFailure("Não foi possível consultar a capability DataForSEO.");
  if ((result.data || []).length > 1) throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_AMBIGUOUS_CAPABILITY", "A capability DataForSEO possui definições ambíguas.");
  const row = (result.data || [])[0] as { id: string; capability_key: typeof DATAFORSEO_CAPABILITY; operation_kind: typeof OPERATION; environment: typeof ENVIRONMENT; unit_name: string; status: AgencyIntegrationCapability["status"] } | undefined;
  return row ? { id: row.id, capabilityKey: row.capability_key, operationKind: row.operation_kind, environment: row.environment, unitName: row.unit_name, status: row.status } : null;
}

export async function readAgencyIntegrationWorkspace(agencyRef: string): Promise<AgencyIntegrationWorkspace> {
  const workspace = await getAgencyWorkspaceData(agencyRef);
  const client = createGovernanceClient();
  const capability = await readDataForSeoCapability(client);
  const brands = workspace.brands.map((brand) => ({ id: brand.id, name: brand.name, status: brand.status }));

  if (!capability) {
    return {
      agency: { id: workspace.agency.id, name: workspace.agency.name, agencyRef: workspace.agency.agencyRef },
      canManage: workspace.canManage,
      brands,
      capabilities: [],
      platformGrants: [],
      brandBindings: [],
      quotas: [],
    };
  }

  const [grantsResult, agencyBindingsResult, brandBindingsResult, quotasResult] = await Promise.all([
    client.from("integration_grants")
      .select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,source_scope_type,source_agency_id,environment,lifecycle_status")
      .eq("capability_id", capability.id)
      .eq("target_scope_type", "agency")
      .eq("target_agency_id", workspace.agency.id)
      .eq("source_scope_type", "platform")
      .eq("environment", ENVIRONMENT)
      .eq("lifecycle_status", "active"),
    client.from("integration_bindings")
      .select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,environment,source_kind,connection_id,grant_id,lifecycle_status")
      .eq("capability_id", capability.id)
      .eq("target_scope_type", "agency")
      .eq("target_agency_id", workspace.agency.id)
      .eq("environment", ENVIRONMENT)
      .eq("lifecycle_status", "active"),
    brands.length
      ? client.from("integration_bindings")
        .select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,environment,source_kind,connection_id,grant_id,lifecycle_status")
        .eq("capability_id", capability.id)
        .eq("target_scope_type", "brand")
        .in("target_brand_id", brands.map((brand) => brand.id))
        .eq("environment", ENVIRONMENT)
        .eq("lifecycle_status", "active")
      : Promise.resolve({ data: [], error: null }),
    client.from("integration_quota_policies")
      .select("id,capability_id,scope_type,agency_id,brand_id,environment,window_kind,limit_units,status,period_started_at,period_ends_at")
      .eq("capability_id", capability.id)
      .eq("environment", ENVIRONMENT)
      .in("scope_type", ["agency", "brand"]),
  ]);
  if (grantsResult.error || agencyBindingsResult.error || brandBindingsResult.error || quotasResult.error) {
    remoteFailure("Não foi possível consultar a governança DataForSEO da Agência.");
  }

  const grants = (grantsResult.data || []) as Array<{ id: string; capability_id: string; target_agency_id: string; lifecycle_status: AgencyIntegrationGrant["lifecycleStatus"] }>;
  const agencyBindings = (agencyBindingsResult.data || []) as Array<{ id: string; grant_id: string | null; connection_id: string | null; source_kind: string; lifecycle_status: string }>;
  if (grants.length > 1 || agencyBindings.length > 1) {
    throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_AMBIGUOUS_RESOURCE", "A Agência possui mais de uma concessão ou binding DataForSEO ativo.");
  }

  const brandBindingRows = (brandBindingsResult.data || []) as Array<{ id: string; target_brand_id: string | null; source_kind: AgencyIntegrationBrandBinding["sourceKind"]; lifecycle_status: AgencyIntegrationBrandBinding["lifecycleStatus"]; connection_id: string | null }>;
  const connectionIds = [...new Set([...agencyBindings, ...brandBindingRows].map((binding) => binding.connection_id).filter((value): value is string => Boolean(value)))];
  const connectionsResult = connectionIds.length
    ? await client.from("integration_connections").select("id,provider_id,owner_scope_type,owner_agency_id,owner_brand_id,environment,lifecycle_status,secret_ref,metadata").in("id", connectionIds)
    : { data: [], error: null };
  if (connectionsResult.error) remoteFailure("Não foi possível consultar a connection DataForSEO da Agência.");
  const connectionRows = (connectionsResult.data || []) as Array<{ id: string; provider_id: string; owner_scope_type: string; lifecycle_status: string; secret_ref: string | null }>;
  const providerIds = [...new Set(connectionRows.map((connection) => connection.provider_id))];
  const providersResult = providerIds.length ? await client.from("integration_providers").select("id,provider_key,status").in("id", providerIds) : { data: [], error: null };
  if (providersResult.error) remoteFailure("Não foi possível consultar o provider DataForSEO da Agência.");
  const connections = new Map(connectionRows.map((connection) => [connection.id, connection]));
  const providers = new Map((providersResult.data || []).map((provider) => [provider.id, provider]));
  const agencyBinding = agencyBindings[0] || null;
  const agencyConnection = agencyBinding?.connection_id ? connections.get(agencyBinding.connection_id) || null : null;
  const agencyProvider = agencyConnection ? providers.get(agencyConnection.provider_id) || null : null;
  const grant = grants[0] || null;

  const brandNameById = new Map(brands.map((brand) => [brand.id, brand.name]));
  const brandBindings = brandBindingRows.map((binding) => {
    const connection = binding.connection_id ? connections.get(binding.connection_id) || null : null;
    const provider = connection ? providers.get(connection.provider_id) || null : null;
    return {
      id: binding.id,
      brandId: binding.target_brand_id || "",
      brandName: brandNameById.get(binding.target_brand_id || "") || "Marca não encontrada",
      capabilityId: capability.id,
      capabilityKey: DATAFORSEO_CAPABILITY,
      environment: ENVIRONMENT,
      sourceKind: binding.source_kind,
      lifecycleStatus: binding.lifecycle_status,
      providerKey: provider?.provider_key || null,
    };
  });

  return {
    agency: { id: workspace.agency.id, name: workspace.agency.name, agencyRef: workspace.agency.agencyRef },
    canManage: workspace.canManage,
    brands,
    capabilities: [capability],
    platformGrants: grant ? [{
      id: grant.id,
      capabilityId: capability.id,
      capabilityKey: DATAFORSEO_CAPABILITY,
      targetAgencyId: workspace.agency.id,
      environment: ENVIRONMENT,
      lifecycleStatus: grant.lifecycle_status,
      sourceScope: "platform",
      bindingReady: Boolean(agencyBinding && agencyBinding.source_kind === "platform_granted" && agencyBinding.grant_id === grant.id),
      connectionReady: connectionReady(agencyConnection),
      providerKey: agencyProvider?.provider_key || null,
    }] : [],
    brandBindings,
    quotas: ((quotasResult.data || []) as Array<{ id: string; capability_id: string; scope_type: "agency" | "brand"; agency_id: string | null; brand_id: string | null; environment: typeof ENVIRONMENT; window_kind: AgencyIntegrationQuota["windowKind"]; limit_units: number | string | null; status: AgencyIntegrationQuota["status"]; period_started_at: string | null; period_ends_at: string | null }>).filter((quota) => quota.scope_type === "agency" ? quota.agency_id === workspace.agency.id : brandNameById.has(quota.brand_id || "")).map((quota) => ({
      id: quota.id,
      capabilityId: capability.id,
      capabilityKey: DATAFORSEO_CAPABILITY,
      scopeType: quota.scope_type,
      scopeId: quota.scope_type === "agency" ? quota.agency_id || workspace.agency.id : quota.brand_id || "",
      scopeName: quota.scope_type === "agency" ? workspace.agency.name : brandNameById.get(quota.brand_id || "") || "Marca não encontrada",
      environment: ENVIRONMENT,
      windowKind: quota.window_kind,
      limitUnits: quota.limit_units === null ? null : Number(quota.limit_units),
      status: quota.status,
      periodStartedAt: quota.period_started_at,
      periodEndsAt: quota.period_ends_at,
    })),
  };
}

export async function createAgencyBrandDistribution(input: { agencyRef: string; brandId: unknown; grantId: unknown }) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Somente o owner ou um administrador da Agência pode distribuir integrações.");
  const brandId = requiredId(input.brandId, "brandId");
  const grantId = requiredId(input.grantId, "grantId");
  if (!workspace.brands.some((brand) => brand.id === brandId)) throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_BRAND_SCOPE", "A Marca não pertence a esta Agência ativa.");

  const client = createGovernanceClient();
  const capability = await readDataForSeoCapability(client);
  if (!capability) throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_CAPABILITY_MISSING", "A capability DataForSEO ainda não está cadastrada no catálogo.");
  const grantResult = await client.from("integration_grants")
    .select("id,capability_id,target_scope_type,target_agency_id,target_brand_id,source_scope_type,source_agency_id,environment,lifecycle_status")
    .eq("id", grantId)
    .maybeSingle();
  if (grantResult.error) remoteFailure("Não foi possível consultar a concessão DataForSEO.");
  const grant = grantResult.data as { id: string; capability_id: string; target_scope_type: string; target_agency_id: string | null; target_brand_id: string | null; source_scope_type: string; source_agency_id: string | null; environment: string; lifecycle_status: string } | null;
  if (!grant || grant.capability_id !== capability.id || grant.target_scope_type !== "agency" || grant.target_agency_id !== workspace.agency.id || grant.target_brand_id !== null || grant.source_scope_type !== "platform" || grant.source_agency_id !== null || grant.environment !== ENVIRONMENT || grant.lifecycle_status !== "active") {
    throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_GRANT_INVALID", "A concessão selecionada não pertence ao Golden Path da Agência.");
  }

  const agencyBindingResult = await client.from("integration_bindings")
    .select("id,target_scope_type,target_agency_id,target_brand_id,source_kind,connection_id,grant_id,lifecycle_status")
    .eq("capability_id", capability.id)
    .eq("target_scope_type", "agency")
    .eq("target_agency_id", workspace.agency.id)
    .eq("environment", ENVIRONMENT)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (agencyBindingResult.error) remoteFailure("Não foi possível consultar o binding da Agência.");
  const agencyBinding = agencyBindingResult.data as { id: string; source_kind: string; connection_id: string | null; grant_id: string | null } | null;
  if (!agencyBinding || agencyBinding.source_kind !== "platform_granted" || agencyBinding.grant_id !== grant.id || !agencyBinding.connection_id) {
    throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_AGENCY_BINDING_INVALID", "A Agência ainda não possui um binding Plataforma → Agência utilizável.");
  }

  const connectionResult = await client.from("integration_connections")
    .select("id,owner_scope_type,owner_agency_id,environment,lifecycle_status,secret_ref")
    .eq("id", agencyBinding.connection_id)
    .maybeSingle();
  if (connectionResult.error) remoteFailure("Não foi possível consultar a connection distribuída.");
  const connection = connectionResult.data as { id: string; owner_scope_type: string; owner_agency_id: string | null; environment: string; lifecycle_status: string; secret_ref: string | null } | null;
  if (!connection || connection.environment !== ENVIRONMENT || connection.lifecycle_status !== "ready" || !connection.secret_ref?.trim() || !((connection.owner_scope_type === "platform") || (connection.owner_scope_type === "agency" && connection.owner_agency_id === workspace.agency.id))) {
    throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_CONNECTION_INVALID", "A connection do binding da Agência não está READY ou não pertence à origem permitida.");
  }

  const existingResult = await client.from("integration_bindings")
    .select("id,source_kind,connection_id,grant_id,lifecycle_status")
    .eq("capability_id", capability.id)
    .eq("target_scope_type", "brand")
    .eq("target_brand_id", brandId)
    .eq("environment", ENVIRONMENT)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (existingResult.error) remoteFailure("Não foi possível consultar o binding atual da Marca.");
  const existing = existingResult.data as { id: string; source_kind: string; connection_id: string | null; grant_id: string | null; lifecycle_status: string } | null;
  if (existing) {
    if (existing.source_kind === "agency_distributed" && existing.connection_id === connection.id && existing.grant_id === grant.id) return { success: true, changed: false, bindingId: existing.id };
    throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_BRAND_BINDING_CONFLICT", "A Marca já possui outro binding ativo para esta capability.");
  }

  const insertResult = await client.from("integration_bindings").insert({
    capability_id: capability.id,
    target_scope_type: "brand",
    target_agency_id: null,
    target_brand_id: brandId,
    environment: ENVIRONMENT,
    source_kind: "agency_distributed",
    connection_id: connection.id,
    grant_id: grant.id,
    external_account_ref: null,
    lifecycle_status: "active",
    created_by_user_id: workspace.actorUserId,
  }).select("id").single();
  resultError(insertResult, "Não foi possível criar o binding da Marca.");
  if (!insertResult.data) remoteFailure("Não foi possível confirmar o binding da Marca.");
  return { success: true, changed: true, bindingId: insertResult.data.id };
}

export async function saveAgencyIntegrationQuota(input: { agencyRef: string; scopeType: unknown; brandId?: unknown; limitUnits: unknown; windowKind: unknown }) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Somente o owner ou um administrador da Agência pode configurar quota.");
  const scopeType = requiredEnum(input.scopeType, ["agency", "brand"] as const, "scopeType");
  const brandId = scopeType === "brand" ? requiredId(input.brandId, "brandId") : null;
  if (brandId && !workspace.brands.some((brand) => brand.id === brandId)) throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_BRAND_SCOPE", "A Marca não pertence a esta Agência ativa.");
  const windowKind = requiredEnum(input.windowKind, ["none", "calendar_day"] as const, "windowKind");
  const rawLimit = typeof input.limitUnits === "string" ? input.limitUnits.trim() : input.limitUnits;
  const limitUnits = rawLimit === "" || rawLimit === null || typeof rawLimit === "undefined" ? null : Number(rawLimit);
  if (limitUnits !== null && (!Number.isFinite(limitUnits) || limitUnits < 0)) throw new IntegrationGovernanceError(400, "INTEGRATION_GOVERNANCE_INVALID_INPUT", "A quantidade da quota deve ser um número não negativo.");
  if (limitUnits === null && windowKind !== "none") throw new IntegrationGovernanceError(400, "INTEGRATION_GOVERNANCE_INVALID_INPUT", "Quota ilimitada exige janela sem período.");

  const client = createGovernanceClient();
  const capability = await readDataForSeoCapability(client);
  if (!capability) throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_CAPABILITY_MISSING", "A capability DataForSEO ainda não está cadastrada no catálogo.");
  const existingResult = await client.from("integration_quota_policies")
    .select("id,scope_type,agency_id,brand_id,window_kind,limit_units,status")
    .eq("capability_id", capability.id)
    .eq("environment", ENVIRONMENT)
    .eq("scope_type", scopeType)
    .eq(scopeType === "agency" ? "agency_id" : "brand_id", scopeType === "agency" ? workspace.agency.id : brandId)
    .eq("status", "active");
  if (existingResult.error) remoteFailure("Não foi possível consultar a quota DataForSEO.");
  const existingRows = (existingResult.data || []) as Array<{ id: string; window_kind: string; limit_units: number | string | null }>;
  if (existingRows.length > 1) throw new IntegrationGovernanceError(409, "INTEGRATION_GOVERNANCE_AMBIGUOUS_QUOTA", "Há mais de uma quota ativa no mesmo escopo.");
  const now = new Date();
  const periodStartedAt = windowKind === "calendar_day" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString() : null;
  const periodEndsAt = windowKind === "calendar_day" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString() : null;
  const payload = { limit_units: limitUnits, window_kind: windowKind, period_started_at: periodStartedAt, period_ends_at: periodEndsAt, updated_at: now.toISOString() };
  if (existingRows[0]) {
    const updateResult = await client.from("integration_quota_policies").update(payload).eq("id", existingRows[0].id).select("id").single();
    resultError(updateResult, "Não foi possível atualizar a quota DataForSEO.");
    if (!updateResult.data) remoteFailure("Não foi possível confirmar a quota DataForSEO.");
    return { success: true, changed: true, quotaId: updateResult.data.id };
  }
  const insertResult = await client.from("integration_quota_policies").insert({
    capability_id: capability.id,
    scope_type: scopeType,
    agency_id: scopeType === "agency" ? workspace.agency.id : null,
    brand_id: scopeType === "brand" ? brandId : null,
    environment: ENVIRONMENT,
    ...payload,
    status: "active",
    created_by_user_id: workspace.actorUserId,
  }).select("id").single();
  resultError(insertResult, "Não foi possível criar a quota DataForSEO.");
  if (!insertResult.data) remoteFailure("Não foi possível confirmar a quota DataForSEO.");
  return { success: true, changed: true, quotaId: insertResult.data.id };
}

function createGovernanceClient() {
  // Kept in a server-only module so the service role never reaches browser code.
  return createCanonicalServiceClient();
}
