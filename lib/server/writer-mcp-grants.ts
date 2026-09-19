import "server-only";
import { randomUUID } from "node:crypto";
import {
  groupWriterMcpGrantsByClient,
  isOAuthClientId,
  normalizeClientName,
  normalizeWriterMcpScopes,
  WRITER_MCP_SCOPES,
  writerMcpScopesRequireEdit,
  type ConsentBrandOption,
  type WriterMcpClientSummary,
  type WriterMcpGrantRow,
  type WriterMcpScope,
} from "@/lib/redator/mcp-consent-domain";
import { matchMcpProviderKey, MCP_PROVIDER_KEYS, type McpProviderKey } from "@/lib/redator/mcp-connection-status";
import { requireAgencyAccessToBrand } from "./agency-context";
import type { CanonicalSessionProfile } from "./authz";
import { listCanonicalAccessibleBrands } from "./canonical-authorization";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
import { readMcpRuntimeConfig } from "./mcp-runtime-config";
import { WriterMcpAuthError } from "./writer-mcp-delegation";

type AgencyMcpConnectionMatch = { id: string; providerKey: McpProviderKey; scopes: WriterMcpScope[]; lifecycleStatus: string };

/**
 * Qual cliente registrado pela Agência este cliente OAuth representa. O nome
 * vem do registro dinâmico (ex.: "ChatGPT"); o provider é inferido dele. Sem
 * correspondência, o grant fica sem `provider_connection_id` e o painel
 * mostra o cliente como "Outro cliente MCP".
 */
async function matchAgencyMcpConnection(agencyId: string, clientName: string): Promise<AgencyMcpConnectionMatch | null> {
  const client = getOperationalClient();
  const providers = await client.from("integration_providers").select("id,provider_key").in("provider_key", [...MCP_PROVIDER_KEYS]);
  if (providers.error) mapPersistenceError(providers.error);
  const providerKeyById = new Map(((providers.data || []) as Array<{ id: string; provider_key: string }>).map((row) => [row.id, row.provider_key as McpProviderKey]));
  if (!providerKeyById.size) return null;
  const connections = await client.from("integration_connections").select("id,provider_id,lifecycle_status,metadata")
    .eq("owner_scope_type", "agency").eq("owner_agency_id", agencyId).eq("environment", "production")
    .in("provider_id", [...providerKeyById.keys()]).neq("lifecycle_status", "revoked").order("updated_at", { ascending: false });
  if (connections.error) mapPersistenceError(connections.error);
  const wanted = matchMcpProviderKey(clientName);
  for (const row of (connections.data || []) as Array<{ id: string; provider_id: string; lifecycle_status: string; metadata: Record<string, unknown> | null }>) {
    if (row.metadata?.kind !== "writer_mcp_client") continue;
    const providerKey = providerKeyById.get(row.provider_id);
    if (providerKey !== wanted) continue;
    let scopes: WriterMcpScope[] = [];
    try { scopes = normalizeWriterMcpScopes(row.metadata?.scopes); } catch { scopes = []; }
    return { id: row.id, providerKey, scopes, lifecycleStatus: row.lifecycle_status };
  }
  return null;
}

/** Escopos que a Agência sugeriu ao registrar o cliente; a tela de consentimento os pré-marca. */
export async function defaultWriterConsentScopes(agencyIds: readonly string[], clientName: string): Promise<WriterMcpScope[] | null> {
  for (const agencyId of [...new Set(agencyIds)]) {
    try {
      const match = await matchAgencyMcpConnection(agencyId, clientName);
      if (match?.scopes.length) return match.scopes;
    } catch {
      // Sugestão é conveniência; sem ela a tela oferece os três escopos.
    }
  }
  return null;
}

/*
 * O GRANT É A AUTORIDADE SOBRE MARCA E ESCOPO.
 *
 * O token OAuth diz quem é o usuário e qual cliente o carrega. Quais Marcas
 * esse cliente pode operar, e com quais escopos, está aqui — decidido pelo
 * usuário na tela de consentimento e revogável pela Agência ou por ele mesmo.
 * Toda escrita passa por `service_role` no servidor; nenhum cliente browser
 * lê ou grava esta tabela.
 */

const GRANT_COLUMNS = "id,consent_id,agency_id,marca_id,actor_user_id,oauth_client_id,client_name,scopes,status,created_at,revoked_at,last_used_at";

type GrantRecord = {
  id: string;
  consent_id: string;
  agency_id: string;
  marca_id: string;
  actor_user_id: string;
  oauth_client_id: string;
  client_name: string;
  scopes: string[];
  status: "active" | "revoked";
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

function toRow(record: GrantRecord, brandNames: ReadonlyMap<string, string>): WriterMcpGrantRow {
  return {
    id: record.id,
    consentId: record.consent_id,
    agencyId: record.agency_id,
    brandId: record.marca_id,
    brandName: brandNames.get(record.marca_id) || "Marca",
    actorUserId: record.actor_user_id,
    oauthClientId: record.oauth_client_id,
    clientName: record.client_name,
    scopes: record.scopes as WriterMcpScope[],
    status: record.status,
    createdAt: record.created_at,
    revokedAt: record.revoked_at,
    lastUsedAt: record.last_used_at,
  };
}

async function brandNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await getOperationalClient().from("marcas").select("id,nome").in("id", unique);
  if (error) mapPersistenceError(error);
  return new Map(((data || []) as Array<{ id: string; nome: string }>).map((brand) => [brand.id, brand.nome]));
}

/**
 * Marcas que este usuário pode oferecer a um cliente MCP: acesso ao Redator e
 * vínculo ativo com uma Agência. Sem Agência não há grant, porque o grant
 * registra `agency_id` e a Agência é quem audita e revoga.
 */
export async function listWriterConsentBrandOptions(profile: CanonicalSessionProfile): Promise<ConsentBrandOption[]> {
  const accessible = await listCanonicalAccessibleBrands("redator");
  const options: ConsentBrandOption[] = [];
  for (const brand of accessible.brands) {
    try {
      const access = await requireAgencyAccessToBrand({ brandId: brand.id, module: "redator", action: "view", profile });
      options.push({ brandId: brand.id, brandName: brand.nome, agencyId: access.agency.agencyId });
    } catch {
      // Marca sem Agência operacional ou sem permissão: não é elegível, sem erro.
    }
  }
  return options;
}

export async function createWriterMcpGrants(input: {
  profile: CanonicalSessionProfile;
  oauthClientId: string;
  clientName: unknown;
  brands: readonly ConsentBrandOption[];
  scopes: unknown;
}): Promise<WriterMcpGrantRow[]> {
  if (!isOAuthClientId(input.oauthClientId)) throw new WriterMcpAuthError("oauth_client_invalid", 400);
  const scopes = normalizeWriterMcpScopes(input.scopes);
  const clientName = normalizeClientName(input.clientName);
  const brands = [...new Map(input.brands.map((brand) => [brand.brandId, brand])).values()];
  if (!brands.length) throw new WriterMcpAuthError("brands_required", 400);
  const action = writerMcpScopesRequireEdit(scopes) ? "edit" : "view";

  // Cada Marca é conferida agora, com o perfil do usuário: o grant nunca
  // amplia o que ele já pode fazer no Redator.
  const agencyByBrand = new Map<string, string>();
  for (const brand of brands) {
    let access;
    try {
      access = await requireAgencyAccessToBrand({ brandId: brand.brandId, module: "redator", action, profile: input.profile });
    } catch {
      throw new WriterMcpAuthError("brand_not_authorized", 403);
    }
    agencyByBrand.set(brand.brandId, access.agency.agencyId);
  }

  const client = getOperationalClient();
  const existing = await client.from("writer_mcp_grants").select("id,marca_id")
    .eq("actor_user_id", input.profile.userId).eq("oauth_client_id", input.oauthClientId).eq("status", "active");
  if (existing.error) mapPersistenceError(existing.error);
  const existingByBrand = new Map(((existing.data || []) as Array<{ id: string; marca_id: string }>).map((row) => [row.marca_id, row.id]));

  // Liga o grant ao cliente registrado pela Agência, quando o nome permite inferir o provider.
  const connectionByAgency = new Map<string, AgencyMcpConnectionMatch | null>();
  for (const agencyId of new Set(agencyByBrand.values())) {
    try { connectionByAgency.set(agencyId, await matchAgencyMcpConnection(agencyId, clientName)); } catch { connectionByAgency.set(agencyId, null); }
  }

  const consentId = randomUUID();
  for (const brand of brands) {
    const agencyId = agencyByBrand.get(brand.brandId) as string;
    const providerConnectionId = connectionByAgency.get(agencyId)?.id || null;
    const existingId = existingByBrand.get(brand.brandId);
    const result = existingId
      ? await client.from("writer_mcp_grants")
        .update({ scopes, client_name: clientName, agency_id: agencyId, consent_id: consentId, provider_connection_id: providerConnectionId })
        .eq("id", existingId).eq("status", "active").select("id")
      : await client.from("writer_mcp_grants").insert({
        consent_id: consentId, agency_id: agencyId, marca_id: brand.brandId, actor_user_id: input.profile.userId,
        oauth_client_id: input.oauthClientId, client_name: clientName, scopes, status: "active", provider_connection_id: providerConnectionId,
      }).select("id");
    if (result.error) mapPersistenceError(result.error);
  }

  // Sucesso só depois do readback: as linhas do consentimento têm de existir e estar ativas.
  const readback = await client.from("writer_mcp_grants").select(GRANT_COLUMNS)
    .eq("consent_id", consentId).eq("actor_user_id", input.profile.userId).eq("status", "active");
  if (readback.error) mapPersistenceError(readback.error);
  const records = (readback.data || []) as GrantRecord[];
  if (records.length !== brands.length) throw new WriterMcpAuthError("grant_readback_failed", 502);

  // Primeiro consentimento real tira o cliente registrado de "pendente". Best-effort: não desfaz o grant.
  const pendingConnectionIds = [...connectionByAgency.values()].filter((match): match is AgencyMcpConnectionMatch => Boolean(match && match.lifecycleStatus === "pending")).map((match) => match.id);
  if (pendingConnectionIds.length) {
    await client.from("integration_connections").update({ lifecycle_status: "ready", updated_at: new Date().toISOString() })
      .in("id", pendingConnectionIds).eq("lifecycle_status", "pending");
  }

  const names = new Map(brands.map((brand) => [brand.brandId, brand.brandName]));
  return records.map((record) => toRow(record, names));
}

export type AgencyWriterMcpGrantRow = WriterMcpGrantRow & { actorEmail: string | null; providerConnectionId: string | null; providerKey: McpProviderKey };

/** Todos os grants da Agência, com e-mail do usuário quando o Auth o devolve. Nunca expõe token. */
export async function listWriterMcpGrantsForAgency(agencyId: string, brands: ReadonlyArray<{ id: string; name: string }>): Promise<AgencyWriterMcpGrantRow[]> {
  const client = getOperationalClient();
  const { data, error } = await client.from("writer_mcp_grants").select(`${GRANT_COLUMNS},provider_connection_id`)
    .eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(200);
  if (error) mapPersistenceError(error);
  const records = (data || []) as Array<GrantRecord & { provider_connection_id: string | null }>;
  const names = new Map(brands.map((brand) => [brand.id, brand.name]));
  const missing = records.map((record) => record.marca_id).filter((id) => !names.has(id));
  for (const [id, name] of await brandNames(missing)) names.set(id, name);
  const emails = new Map<string, string | null>();
  for (const actorId of new Set(records.map((record) => record.actor_user_id))) {
    try {
      const user = await client.auth.admin.getUserById(actorId);
      emails.set(actorId, user.data.user?.email || null);
    } catch {
      emails.set(actorId, null);
    }
  }
  return records.map((record) => ({
    ...toRow(record, names),
    actorEmail: emails.get(record.actor_user_id) ?? null,
    providerConnectionId: record.provider_connection_id,
    providerKey: matchMcpProviderKey(record.client_name),
  }));
}

export async function revokeWriterMcpGrantForAgency(input: { agencyId: string; grantId: string; revokedByUserId: string }) {
  const { data, error } = await getOperationalClient().from("writer_mcp_grants")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by_user_id: input.revokedByUserId })
    .eq("id", input.grantId).eq("agency_id", input.agencyId).eq("status", "active")
    .select("id,revoked_at").maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new WriterMcpAuthError("grant_not_found", 404);
  return data as { id: string; revoked_at: string };
}

/** Reativar não pede novo consentimento: a Agência devolve o que ela mesma retirou. */
export async function reactivateWriterMcpGrantForAgency(input: { agencyId: string; grantId: string }) {
  const { data, error } = await getOperationalClient().from("writer_mcp_grants")
    .update({ status: "active", revoked_at: null, revoked_by_user_id: null })
    .eq("id", input.grantId).eq("agency_id", input.agencyId).eq("status", "revoked")
    .select("id").maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new WriterMcpAuthError("grant_conflict", 409);
    mapPersistenceError(error);
  }
  if (!data) throw new WriterMcpAuthError("grant_not_found", 404);
  return data as { id: string };
}

export async function listWriterMcpGrantsForActor(profile: CanonicalSessionProfile): Promise<WriterMcpGrantRow[]> {
  const { data, error } = await getOperationalClient().from("writer_mcp_grants").select(GRANT_COLUMNS)
    .eq("actor_user_id", profile.userId).order("created_at", { ascending: false }).limit(200);
  if (error) mapPersistenceError(error);
  const records = (data || []) as GrantRecord[];
  const names = await brandNames(records.map((record) => record.marca_id));
  return records.map((record) => toRow(record, names));
}

export async function revokeWriterMcpGrantForActor(profile: CanonicalSessionProfile, grantId: string) {
  const { data, error } = await getOperationalClient().from("writer_mcp_grants")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by_user_id: profile.userId })
    .eq("id", grantId).eq("actor_user_id", profile.userId).eq("status", "active")
    .select("id,revoked_at").maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new WriterMcpAuthError("grant_not_found", 404);
  return data as { id: string; revoked_at: string };
}

/** Grants ativos do par (usuário, cliente) que um token OAuth representa. */
export async function resolveActiveWriterMcpGrants(input: { actorId: string; oauthClientId: string }): Promise<WriterMcpGrantRow[]> {
  const { data, error } = await getOperationalClient().from("writer_mcp_grants").select(GRANT_COLUMNS)
    .eq("actor_user_id", input.actorId).eq("oauth_client_id", input.oauthClientId).eq("status", "active");
  if (error) mapPersistenceError(error);
  const records = (data || []) as GrantRecord[];
  const names = await brandNames(records.map((record) => record.marca_id));
  return records.map((record) => toRow(record, names));
}

export async function countRecentWriterMcpGrantCalls(grantIds: readonly string[], windowMs = 60000): Promise<number> {
  if (!grantIds.length) return 0;
  const recent = await getOperationalClient().from("writer_mcp_call_events")
    .select("id", { count: "exact", head: true }).in("grant_id", [...grantIds])
    .gte("occurred_at", new Date(Date.now() - windowMs).toISOString());
  if (recent.error) mapPersistenceError(recent.error);
  return recent.count || 0;
}

export async function touchWriterMcpGrants(grantIds: readonly string[]) {
  if (!grantIds.length) return;
  const { error } = await getOperationalClient().from("writer_mcp_grants")
    .update({ last_used_at: new Date().toISOString() }).in("id", [...grantIds]).eq("status", "active");
  if (error) mapPersistenceError(error);
}

export type WriterMcpAccountConnections = {
  enabled: boolean;
  clients: WriterMcpClientSummary[];
  brands: ConsentBrandOption[];
  scopes: readonly WriterMcpScope[];
  /** Mensagem sanitizada quando a leitura remota falhou; a página continua renderizando. */
  unavailable: string | null;
};

/**
 * Estado inicial da seção "Conexões de IA" em /conta, lido no servidor. Uma
 * falha de leitura (ex.: migration M7 ainda não aplicada) não derruba a
 * página: vira `unavailable` e a lista fica vazia.
 */
export async function loadWriterMcpConnectionsForAccount(profile: CanonicalSessionProfile): Promise<WriterMcpAccountConnections> {
  if (!readMcpRuntimeConfig().oauthEnabled) return { enabled: false, clients: [], brands: [], scopes: WRITER_MCP_SCOPES, unavailable: null };
  try {
    const [grants, brands] = await Promise.all([listWriterMcpGrantsForActor(profile), listWriterConsentBrandOptions(profile)]);
    return { enabled: true, clients: groupWriterMcpGrantsByClient(grants), brands, scopes: WRITER_MCP_SCOPES, unavailable: null };
  } catch {
    return { enabled: true, clients: [], brands: [], scopes: WRITER_MCP_SCOPES, unavailable: "Não foi possível carregar as conexões agora. Tente de novo em instantes." };
  }
}
