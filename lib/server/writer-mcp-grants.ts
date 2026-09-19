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
import { requireAgencyAccessToBrand } from "./agency-context";
import type { CanonicalSessionProfile } from "./authz";
import { listCanonicalAccessibleBrands } from "./canonical-authorization";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
import { readMcpRuntimeConfig } from "./mcp-runtime-config";
import { WriterMcpAuthError } from "./writer-mcp-delegation";

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

  const consentId = randomUUID();
  for (const brand of brands) {
    const agencyId = agencyByBrand.get(brand.brandId) as string;
    const existingId = existingByBrand.get(brand.brandId);
    const result = existingId
      ? await client.from("writer_mcp_grants")
        .update({ scopes, client_name: clientName, agency_id: agencyId, consent_id: consentId })
        .eq("id", existingId).eq("status", "active").select("id")
      : await client.from("writer_mcp_grants").insert({
        consent_id: consentId, agency_id: agencyId, marca_id: brand.brandId, actor_user_id: input.profile.userId,
        oauth_client_id: input.oauthClientId, client_name: clientName, scopes, status: "active",
      }).select("id");
    if (result.error) mapPersistenceError(result.error);
  }

  // Sucesso só depois do readback: as linhas do consentimento têm de existir e estar ativas.
  const readback = await client.from("writer_mcp_grants").select(GRANT_COLUMNS)
    .eq("consent_id", consentId).eq("actor_user_id", input.profile.userId).eq("status", "active");
  if (readback.error) mapPersistenceError(readback.error);
  const records = (readback.data || []) as GrantRecord[];
  if (records.length !== brands.length) throw new WriterMcpAuthError("grant_readback_failed", 502);
  const names = new Map(brands.map((brand) => [brand.brandId, brand.brandName]));
  return records.map((record) => toRow(record, names));
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
