import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { WRITER_MCP_SCOPES, type WriterMcpScope } from "@/lib/redator/mcp-consent-domain";
import { canonicalProfileForVerifiedUser, type CanonicalSessionProfile } from "./authz";
import { requireAgencyAccessToBrand } from "./agency-context";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";

export type { WriterMcpScope };
const allowedScopes: readonly WriterMcpScope[] = WRITER_MCP_SCOPES;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export class WriterMcpAuthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 401) { super(code); this.code = code; this.status = status; }
}

export async function issueWriterMcpDelegation(input: { profile: CanonicalSessionProfile; brandId: string; clientName: string; scopes: WriterMcpScope[]; days: number }) {
  if (!input.scopes.length || input.scopes.some(scope => !allowedScopes.includes(scope))) throw new WriterMcpAuthError("invalid_scopes", 400);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 30) throw new WriterMcpAuthError("invalid_expiry", 400);
  const access = await requireAgencyAccessToBrand({ brandId: input.brandId, module: "redator", action: input.scopes.includes("writer.draft.write") || input.scopes.includes("writer.media.brief") ? "edit" : "view", profile: input.profile });
  const token = `mk_mcp_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + input.days * 86400000).toISOString();
  const { data, error } = await getOperationalClient().from("writer_mcp_delegations").insert({
    agency_id: access.agency.agencyId, marca_id: input.brandId, actor_user_id: input.profile.userId,
    client_name: input.clientName.trim(), token_prefix: token.slice(0, 16), token_hash: tokenHash(token),
    scopes: [...new Set(input.scopes)], expires_at: expiresAt,
  }).select("id,client_name,token_prefix,scopes,expires_at").single();
  if (error) mapPersistenceError(error);
  if (!data) throw new WriterMcpAuthError("delegation_readback_failed", 502);
  return { ...data, token };
}

export async function listWriterMcpDelegations(profile: CanonicalSessionProfile, brandId: string) {
  await requireAgencyAccessToBrand({ brandId, module: "redator", action: "view", profile });
  const { data, error } = await getOperationalClient().from("writer_mcp_delegations")
    .select("id,client_name,token_prefix,scopes,expires_at,revoked_at,last_used_at,created_at")
    .eq("marca_id", brandId).eq("actor_user_id", profile.userId).order("created_at", { ascending: false });
  if (error) mapPersistenceError(error);
  return data || [];
}

export async function revokeWriterMcpDelegation(profile: CanonicalSessionProfile, brandId: string, delegationId: string) {
  await requireAgencyAccessToBrand({ brandId, module: "redator", action: "view", profile });
  const { data, error } = await getOperationalClient().from("writer_mcp_delegations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", delegationId).eq("marca_id", brandId).eq("actor_user_id", profile.userId).is("revoked_at", null)
    .select("id,revoked_at").maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new WriterMcpAuthError("delegation_not_found", 404);
  return data;
}

export async function verifyWriterMcpBearer(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!/^mk_mcp_[A-Za-z0-9_-]{40,}$/.test(token)) throw new WriterMcpAuthError("bearer_required");
  const { data, error } = await getOperationalClient().from("writer_mcp_delegations")
    .select("id,agency_id,marca_id,actor_user_id,scopes,expires_at,revoked_at")
    .eq("token_hash", tokenHash(token)).maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data || data.revoked_at || Date.parse(data.expires_at) <= Date.now()) throw new WriterMcpAuthError("delegation_invalid");
  const profile = await canonicalProfileForVerifiedUser(data.actor_user_id);
  const access = await requireAgencyAccessToBrand({ brandId: data.marca_id, module: "redator", action: "view", profile });
  if (access.agency.agencyId !== data.agency_id) throw new WriterMcpAuthError("agency_changed", 403);
  const recent = await getOperationalClient().from("writer_mcp_call_events")
    .select("id", { count: "exact", head: true }).eq("delegation_id", data.id)
    .gte("occurred_at", new Date(Date.now() - 60000).toISOString());
  if (recent.error) mapPersistenceError(recent.error);
  if ((recent.count || 0) >= 60) throw new WriterMcpAuthError("rate_limited", 429);
  const used = await getOperationalClient().from("writer_mcp_delegations").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).is("revoked_at", null).select("id").maybeSingle();
  if (used.error) mapPersistenceError(used.error);
  if (!used.data) throw new WriterMcpAuthError("delegation_invalid");
  return { id: data.id as string, brandId: data.marca_id as string, agencyId: data.agency_id as string,
    actorId: data.actor_user_id as string, scopes: data.scopes as WriterMcpScope[], profile };
}

/**
 * Trilha de chamadas. Exatamente um principal por evento: a delegação bearer
 * ou o grant OAuth. `grant_id` só entra no insert quando existe, para que o
 * caminho bearer continue gravando num banco anterior à migration M7.
 */
export async function recordWriterMcpCall(input: {
  delegationId?: string | null;
  grantId?: string | null;
  brandId: string;
  documentId?: string;
  toolName: string;
  resultCode: string;
  requestId: string;
  /**
   * As palavras do usuário aceitando a ação (SDD da plataforma para agentes).
   * Só as ferramentas que dependem dos escopos da migration m8 mandam; por isso
   * a coluna só é escrita quando há valor — antes da m8 ninguém chega aqui com ele.
   */
  humanConfirmation?: string | null;
}) {
  if (!input.delegationId && !input.grantId) throw new WriterMcpAuthError("audit_principal_missing", 500);
  const { error } = await getOperationalClient().from("writer_mcp_call_events").insert({
    delegation_id: input.delegationId || null,
    ...(input.grantId ? { grant_id: input.grantId } : {}),
    marca_id: input.brandId, document_id: input.documentId || null,
    tool_name: input.toolName, result_code: input.resultCode, request_id: input.requestId,
    ...(input.humanConfirmation ? { human_confirmation: input.humanConfirmation.slice(0, 500) } : {}),
  });
  if (error) mapPersistenceError(error);
}
