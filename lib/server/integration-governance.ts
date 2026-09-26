import "server-only";
import { WRITER_MCP_SCOPES } from "@/lib/redator/mcp-consent-domain";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTenantId } from "@/lib/tenant-routing";
import { getAgencyWorkspaceData } from "@/lib/server/agency-workspace";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { matchMcpProviderKey, resolveMcpConnectionDisplayStatus, type McpConnectionDisplayStatus, type McpOAuthReadiness } from "@/lib/redator/mcp-connection-status";
import { readMcpOAuthReadiness } from "@/lib/server/mcp-oauth";
import { readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";
import { listWriterMcpGrantsForAgency, reactivateWriterMcpGrantForAgency, revokeWriterMcpGrantForAgency, type AgencyWriterMcpGrantRow } from "@/lib/server/writer-mcp-grants";

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

export const AGENCY_MCP_PROVIDER_KEYS = ["chatgpt", "claude", "gemini", "custom_mcp"] as const;
export type AgencyMcpProviderKey = typeof AGENCY_MCP_PROVIDER_KEYS[number];
/** Uma lista só: a do consentimento. Duplicada à mão, o painel oferecia escopo que o servidor recusava. */
export const AGENCY_MCP_SCOPES = WRITER_MCP_SCOPES;
export type AgencyMcpScope = typeof AGENCY_MCP_SCOPES[number];

export type AgencyMcpConnection = {
  id: string;
  providerKey: AgencyMcpProviderKey;
  providerName: string;
  clientName: string;
  lifecycleStatus: "draft" | "pending" | "ready" | "error" | "disabled" | "revoked";
  environment: typeof ENVIRONMENT;
  endpoint: string;
  transport: "streamable_http";
  authMode: "delegated_bearer" | "oauth_supabase";
  /** Estado que a Agência vê: conectado só com grant ativo do provider. */
  displayStatus: McpConnectionDisplayStatus;
  activeGrantCount: number;
  scopes: AgencyMcpScope[];
  createdAt: string;
  updatedAt: string;
};

export type AgencyWriterMcpGrant = AgencyWriterMcpGrantRow;

export type AgencyWriterMcpDelegation = {
  id: string;
  brandId: string;
  brandName: string;
  clientName: string;
  tokenPrefix: string;
  scopes: AgencyMcpScope[];
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type AgencyWriterMcpCallEvent = {
  id: string;
  brandId: string;
  brandName: string;
  documentId: string | null;
  toolName: string;
  resultCode: string;
  requestId: string;
  occurredAt: string;
  principal: "grant" | "delegation";
};

export type AgencyIntegrationWorkspace = {
  agency: { id: string; name: string; agencyRef: string };
  canManage: boolean;
  brands: Array<{ id: string; name: string; status: string }>;
  capabilities: AgencyIntegrationCapability[];
  platformGrants: AgencyIntegrationGrant[];
  brandBindings: AgencyIntegrationBrandBinding[];
  quotas: AgencyIntegrationQuota[];
  mcpEndpoint: string;
  mcpMetadataUrl: string | null;
  mcpConsentPath: string;
  mcpOAuth: McpOAuthReadiness;
  bearerDiagnosticsAllowed: boolean;
  mcpConnections: AgencyMcpConnection[];
  writerMcpGrants: AgencyWriterMcpGrant[];
  writerMcpDelegations: AgencyWriterMcpDelegation[];
  writerMcpAuditEvents: AgencyWriterMcpCallEvent[];
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

function publicMcpEndpoint() {
  return readMcpRuntimeConfig().endpoint || "/api/mcp/redator";
}

function requiredMcpClientName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new IntegrationGovernanceError(400, "INTEGRATION_GOVERNANCE_INVALID_INPUT", "O nome do cliente MCP é obrigatório.");
  }
  return value.trim();
}

function mcpScopes(value: unknown): AgencyMcpScope[] {
  const values = value === undefined ? ["writer.read"] : value;
  if (!Array.isArray(values) || !values.length) {
    throw new IntegrationGovernanceError(400, "INTEGRATION_GOVERNANCE_INVALID_INPUT", "Escolha pelo menos um escopo MCP.");
  }
  const unique = [...new Set(values.filter((item): item is string => typeof item === "string"))];
  if (!unique.length || unique.some((item) => !(AGENCY_MCP_SCOPES as readonly string[]).includes(item))) {
    throw new IntegrationGovernanceError(400, "INTEGRATION_GOVERNANCE_INVALID_INPUT", "Escopo MCP inválido.");
  }
  return unique as AgencyMcpScope[];
}

async function readAgencyMcpState(client: GovernanceClient, agencyId: string, brands: Array<{ id: string; name: string }>) {
  const providersResult = await client.from("integration_providers")
    .select("id,provider_key,display_name,status")
    .in("provider_key", [...AGENCY_MCP_PROVIDER_KEYS]);
  if (providersResult.error) remoteFailure("Não foi possível consultar o catálogo de clientes MCP.");

  const providers = (providersResult.data || []) as Array<{ id: string; provider_key: string; display_name: string; status: string }>;
  const providerIds = providers.map((provider) => provider.id);
  const connectionsResult = providerIds.length
    ? await client.from("integration_connections")
      .select("id,provider_id,environment,lifecycle_status,metadata,created_at,updated_at")
      .eq("owner_scope_type", "agency")
      .eq("owner_agency_id", agencyId)
      .eq("environment", ENVIRONMENT)
      .in("provider_id", providerIds)
      .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (connectionsResult.error) remoteFailure("Não foi possível consultar as conexões MCP da Agência.");

  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const runtime = readMcpRuntimeConfig();
  const mcpOAuth = await readMcpOAuthReadiness(runtime);
  // Grants são a prova de conexão. Uma falha de leitura não derruba o painel: vira lista vazia.
  let writerMcpGrants: AgencyWriterMcpGrant[] = [];
  try { writerMcpGrants = await listWriterMcpGrantsForAgency(agencyId, brands); } catch { writerMcpGrants = []; }
  const activeGrants = writerMcpGrants.filter((grant) => grant.status === "active");
  const connections: AgencyMcpConnection[] = ((connectionsResult.data || []) as Array<{ id: string; provider_id: string; environment: typeof ENVIRONMENT; lifecycle_status: AgencyMcpConnection["lifecycleStatus"]; metadata: Record<string, unknown>; created_at: string; updated_at: string }>).map((connection) => {
    const provider = providerById.get(connection.provider_id);
    const metadata = connection.metadata || {};
    const scopes = mcpScopes(metadata.scopes);
    const providerKey = (provider?.provider_key || "custom_mcp") as AgencyMcpProviderKey;
    const activeGrantCount = activeGrants.filter((grant) => grant.providerConnectionId === connection.id || (!grant.providerConnectionId && matchMcpProviderKey(grant.clientName) === providerKey)).length;
    return {
      id: connection.id,
      providerKey: (provider?.provider_key || "custom_mcp") as AgencyMcpProviderKey,
      providerName: provider?.display_name || "Cliente MCP",
      clientName: typeof metadata.client_name === "string" ? metadata.client_name : "Cliente MCP do Redator",
      lifecycleStatus: connection.lifecycle_status,
      environment: connection.environment,
      endpoint: typeof metadata.endpoint === "string" && metadata.endpoint ? metadata.endpoint : publicMcpEndpoint(),
      transport: "streamable_http",
      authMode: runtime.oauthEnabled ? "oauth_supabase" : "delegated_bearer",
      displayStatus: resolveMcpConnectionDisplayStatus({ lifecycleStatus: connection.lifecycle_status, oauthStatus: mcpOAuth.status, hasActiveGrant: activeGrantCount > 0 }),
      activeGrantCount,
      scopes,
      createdAt: connection.created_at,
      updatedAt: connection.updated_at,
    };
  });

  const delegationsResult = await client.from("writer_mcp_delegations")
    .select("id,marca_id,client_name,token_prefix,scopes,expires_at,revoked_at,last_used_at,created_at")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (delegationsResult.error) remoteFailure("Não foi possível consultar as delegações MCP do Redator.");
  const brandNameById = new Map(brands.map((brand) => [brand.id, brand.name]));
  const writerMcpDelegations: AgencyWriterMcpDelegation[] = ((delegationsResult.data || []) as Array<{ id: string; marca_id: string; client_name: string; token_prefix: string; scopes: unknown; expires_at: string; revoked_at: string | null; last_used_at: string | null; created_at: string }>).map((delegation) => ({
    id: delegation.id,
    brandId: delegation.marca_id,
    brandName: brandNameById.get(delegation.marca_id) || "Marca não encontrada",
    clientName: delegation.client_name,
    tokenPrefix: delegation.token_prefix,
    scopes: mcpScopes(delegation.scopes),
    expiresAt: delegation.expires_at,
    revokedAt: delegation.revoked_at,
    lastUsedAt: delegation.last_used_at,
    createdAt: delegation.created_at,
  }));
  const auditResult = brands.length
    ? await client.from("writer_mcp_call_events")
      .select("id,marca_id,document_id,tool_name,result_code,request_id,occurred_at,grant_id,delegation_id")
      .in("marca_id", brands.map((brand) => brand.id))
      .order("occurred_at", { ascending: false })
      .limit(40)
    : { data: [], error: null };
  if (auditResult.error) remoteFailure("Não foi possível consultar a auditoria de chamadas MCP.");
  const writerMcpAuditEvents: AgencyWriterMcpCallEvent[] = ((auditResult.data || []) as Array<{ id: string; marca_id: string; document_id: string | null; tool_name: string; result_code: string; request_id: string; occurred_at: string; grant_id?: string | null; delegation_id?: string | null }>).map((event) => ({
    principal: event.grant_id ? "grant" as const : "delegation" as const,
    id: event.id,
    brandId: event.marca_id,
    brandName: brandNameById.get(event.marca_id) || "Marca não encontrada",
    documentId: event.document_id,
    toolName: event.tool_name,
    resultCode: event.result_code,
    requestId: event.request_id,
    occurredAt: event.occurred_at,
  }));
  return {
    mcpEndpoint: publicMcpEndpoint(),
    mcpMetadataUrl: runtime.oauthEnabled ? runtime.protectedResourceMetadataUrl : null,
    mcpConsentPath: "/oauth/consent",
    mcpOAuth,
    bearerDiagnosticsAllowed: !runtime.production || runtime.remoteBearerAllowed,
    mcpConnections: connections,
    writerMcpGrants,
    writerMcpDelegations,
    writerMcpAuditEvents,
  };
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
  const mcpState = await readAgencyMcpState(client, workspace.agency.id, brands);

  if (!capability) {
    return {
      agency: { id: workspace.agency.id, name: workspace.agency.name, agencyRef: workspace.agency.agencyRef },
      canManage: workspace.canManage,
      brands,
      capabilities: [],
      platformGrants: [],
      brandBindings: [],
      quotas: [],
      ...mcpState,
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
    ...mcpState,
  };
}

export async function registerAgencyMcpClient(input: {
  agencyRef: string;
  providerKey: unknown;
  clientName: unknown;
  scopes?: unknown;
}) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) {
    throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Somente o owner ou um administrador da Agência pode registrar clientes MCP.");
  }
  const providerKey = requiredEnum(input.providerKey, AGENCY_MCP_PROVIDER_KEYS, "providerKey");
  const clientName = requiredMcpClientName(input.clientName);
  const scopes = mcpScopes(input.scopes);
  if (process.env.NODE_ENV === "production" && !(process.env.MCP_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL)?.trim()) {
    throw new IntegrationGovernanceError(409, "MCP_PUBLIC_ENDPOINT_NOT_CONFIGURED", "Configure MCP_PUBLIC_BASE_URL ou NEXT_PUBLIC_APP_URL antes de registrar um cliente MCP em produção.");
  }
  const client = createGovernanceClient();
  const providerResult = await client.from("integration_providers")
    .select("id,provider_key,display_name,status")
    .eq("provider_key", providerKey)
    .maybeSingle();
  if (providerResult.error) remoteFailure("Não foi possível consultar o provider MCP.");
  const provider = providerResult.data as { id: string; provider_key: AgencyMcpProviderKey; display_name: string; status: string } | null;
  if (!provider || provider.status !== "active") {
    throw new IntegrationGovernanceError(409, "MCP_PROVIDER_NOT_CONFIGURED", "Este cliente MCP ainda não foi habilitado no catálogo da plataforma. Aplique a migration do catálogo antes de registrar a conexão.");
  }

  const metadata = {
    kind: "writer_mcp_client",
    client_name: clientName,
    endpoint: publicMcpEndpoint(),
    transport: "streamable_http",
    auth_mode: readMcpRuntimeConfig().oauthEnabled ? "oauth_supabase" : "delegated_bearer",
    scopes,
    module: "redator",
  };
  const existingResult = await client.from("integration_connections")
    .select("id,lifecycle_status")
    .eq("provider_id", provider.id)
    .eq("owner_scope_type", "agency")
    .eq("owner_agency_id", workspace.agency.id)
    .eq("environment", ENVIRONMENT)
    .neq("lifecycle_status", "revoked")
    .maybeSingle();
  if (existingResult.error) remoteFailure("Não foi possível consultar a conexão MCP existente.");
  const existing = existingResult.data as { id: string; lifecycle_status: AgencyMcpConnection["lifecycleStatus"] } | null;
  if (existing) {
    const updateResult = await client.from("integration_connections")
      .update({ lifecycle_status: "pending", metadata, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id,lifecycle_status,metadata,created_at,updated_at")
      .single();
    if (updateResult.error || !updateResult.data) remoteFailure("Não foi possível atualizar a conexão MCP da Agência.");
    return { success: true, changed: true, connectionId: existing.id, endpoint: publicMcpEndpoint(), providerKey, status: "pending" as const };
  }

  const insertResult = await client.from("integration_connections").insert({
    provider_id: provider.id,
    owner_scope_type: "agency",
    owner_agency_id: workspace.agency.id,
    owner_brand_id: null,
    environment: ENVIRONMENT,
    lifecycle_status: "pending",
    secret_ref: null,
    metadata,
    created_by_user_id: workspace.actorUserId,
  }).select("id,lifecycle_status,metadata,created_at,updated_at").single();
  resultError(insertResult, "Não foi possível registrar o cliente MCP da Agência.");
  if (!insertResult.data) remoteFailure("Não foi possível confirmar a conexão MCP da Agência.");
  return { success: true, changed: true, connectionId: insertResult.data.id, endpoint: publicMcpEndpoint(), providerKey, status: "pending" as const };
}

export async function revokeAgencyWriterMcpDelegation(input: { agencyRef: string; delegationId: unknown; brandId: unknown }) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) {
    throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Somente o owner ou um administrador da Agência pode revogar delegações MCP.");
  }
  const delegationId = requiredId(input.delegationId, "delegationId");
  const brandId = requiredId(input.brandId, "brandId");
  if (!workspace.brands.some((brand) => brand.id === brandId)) {
    throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_BRAND_SCOPE", "A Marca não pertence a esta Agência ativa.");
  }
  const client = createGovernanceClient();
  const result = await client.from("writer_mcp_delegations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", delegationId)
    .eq("agency_id", workspace.agency.id)
    .eq("marca_id", brandId)
    .is("revoked_at", null)
    .select("id,revoked_at")
    .maybeSingle();
  if (result.error) remoteFailure("Não foi possível revogar a delegação MCP.");
  if (!result.data) throw new IntegrationGovernanceError(404, "MCP_DELEGATION_NOT_FOUND", "A delegação MCP não foi encontrada ou já foi revogada.");
  return { success: true, delegation: result.data };
}

export async function revokeAgencyWriterMcpGrant(input: { agencyRef: string; grantId: unknown }) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) {
    throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Somente o owner ou um administrador da Agência pode revogar acessos MCP.");
  }
  const grantId = requiredId(input.grantId, "grantId");
  try {
    const revoked = await revokeWriterMcpGrantForAgency({ agencyId: workspace.agency.id, grantId, revokedByUserId: workspace.actorUserId });
    return { success: true, grant: revoked };
  } catch (error) {
    if (error instanceof Error && error.message === "grant_not_found") throw new IntegrationGovernanceError(404, "MCP_GRANT_NOT_FOUND", "O acesso não foi encontrado ou já está revogado.");
    remoteFailure("Não foi possível revogar o acesso MCP.");
  }
}

export async function reactivateAgencyWriterMcpGrant(input: { agencyRef: string; grantId: unknown }) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) {
    throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Somente o owner ou um administrador da Agência pode reativar acessos MCP.");
  }
  const grantId = requiredId(input.grantId, "grantId");
  try {
    const reactivated = await reactivateWriterMcpGrantForAgency({ agencyId: workspace.agency.id, grantId });
    return { success: true, grant: reactivated };
  } catch (error) {
    if (error instanceof Error && error.message === "grant_not_found") throw new IntegrationGovernanceError(404, "MCP_GRANT_NOT_FOUND", "O acesso não foi encontrado ou não está revogado.");
    if (error instanceof Error && error.message === "grant_conflict") throw new IntegrationGovernanceError(409, "MCP_GRANT_CONFLICT", "Já existe um acesso ativo deste usuário para o mesmo aplicativo e Marca.");
    remoteFailure("Não foi possível reativar o acesso MCP.");
  }
}

export async function revokeAgencyMcpClient(input: { agencyRef: string; connectionId: unknown }) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) {
    throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Somente o owner ou um administrador da Agência pode revogar clientes MCP.");
  }
  const connectionId = requiredId(input.connectionId, "connectionId");
  const client = createGovernanceClient();
  const result = await client.from("integration_connections")
    .update({ lifecycle_status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("owner_scope_type", "agency")
    .eq("owner_agency_id", workspace.agency.id)
    .eq("environment", ENVIRONMENT)
    .neq("lifecycle_status", "revoked")
    .select("id,lifecycle_status")
    .maybeSingle();
  if (result.error) remoteFailure("Não foi possível revogar o cliente MCP da Agência.");
  if (!result.data) throw new IntegrationGovernanceError(404, "MCP_CONNECTION_NOT_FOUND", "O cliente MCP não foi encontrado ou já foi revogado.");
  return { success: true, connection: result.data };
}

export async function assertAgencyMcpBrand(input: { agencyRef: string; brandId: unknown }) {
  const workspace = await getAgencyWorkspaceData(input.agencyRef);
  if (!workspace.canManage) throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_FORBIDDEN", "Apenas administradores da Agência podem criar delegações MCP.");
  const brandId = requiredId(input.brandId, "brandId");
  if (!workspace.brands.some((brand) => brand.id === brandId)) throw new IntegrationGovernanceError(403, "INTEGRATION_GOVERNANCE_BRAND_SCOPE", "A Marca não pertence a esta Agência ativa.");
  return { workspace, brandId };
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
