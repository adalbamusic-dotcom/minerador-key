import "server-only";
import { writerMcpConsentUrl, type WriterMcpScope } from "@/lib/redator/mcp-consent-domain";
import { canonicalProfileForVerifiedUser, type CanonicalSessionProfile } from "./authz";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
import { verifyMcpOAuthToken, type McpOAuthVerifyDeps } from "./mcp-oauth";
import { readMcpRuntimeConfig, type McpRuntimeConfig } from "./mcp-runtime-config";
import { verifyWriterMcpBearer, WriterMcpAuthError } from "./writer-mcp-delegation";
import { countRecentWriterMcpGrantCalls, resolveActiveWriterMcpGrants, touchWriterMcpGrants } from "./writer-mcp-grants";

/*
 * UM PRINCIPAL, DOIS CAMINHOS.
 *
 * O servidor MCP não sabe se o cliente chegou por OAuth (ChatGPT, Claude) ou
 * pelo bearer interno de diagnóstico. Os dois viram o mesmo objeto: quem é o
 * ator, por qual cliente, e em quais Marcas com quais escopos. As ferramentas
 * decidem tudo a partir dele.
 */

export type WriterMcpBrandAccess = {
  brandId: string;
  brandName: string;
  agencyId: string;
  scopes: WriterMcpScope[];
  grantId: string | null;
  delegationId: string | null;
};

export type WriterMcpPrincipal = {
  authMode: "oauth_supabase" | "delegated_bearer";
  actorId: string;
  profile: CanonicalSessionProfile;
  oauthClientId: string | null;
  clientName: string | null;
  brands: WriterMcpBrandAccess[];
  /** Presente só quando o token OAuth é válido mas não há Marca autorizada. */
  consentUrl: string | null;
};

const RATE_LIMIT_PER_MINUTE = 60;

async function brandName(brandId: string): Promise<string> {
  const { data, error } = await getOperationalClient().from("marcas").select("nome").eq("id", brandId).maybeSingle();
  if (error) mapPersistenceError(error);
  return (data as { nome?: string } | null)?.nome || "Marca";
}

export async function resolveWriterMcpPrincipal(
  authorization: string | null,
  runtime: McpRuntimeConfig = readMcpRuntimeConfig(),
  deps: { oauth?: McpOAuthVerifyDeps } = {},
): Promise<WriterMcpPrincipal> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new WriterMcpAuthError("bearer_required");

  if (token.startsWith("mk_mcp_")) {
    // Diagnóstico interno: em produção só com opt-in explícito, nunca como fallback do OAuth.
    if (runtime.production && !runtime.remoteBearerAllowed) throw new WriterMcpAuthError("bearer_disabled");
    const delegation = await verifyWriterMcpBearer(authorization);
    return {
      authMode: "delegated_bearer",
      actorId: delegation.actorId,
      profile: delegation.profile,
      oauthClientId: null,
      clientName: null,
      brands: [{
        brandId: delegation.brandId,
        brandName: await brandName(delegation.brandId),
        agencyId: delegation.agencyId,
        scopes: delegation.scopes,
        grantId: null,
        delegationId: delegation.id,
      }],
      consentUrl: null,
    };
  }

  if (!runtime.oauthEnabled) throw new WriterMcpAuthError("bearer_required");
  const identity = await verifyMcpOAuthToken(token, deps.oauth);
  const profile = await canonicalProfileForVerifiedUser(identity.actorId);
  const grants = await resolveActiveWriterMcpGrants({ actorId: identity.actorId, oauthClientId: identity.oauthClientId });
  const grantIds = grants.map((grant) => grant.id);
  if (grantIds.length) {
    if (await countRecentWriterMcpGrantCalls(grantIds) >= RATE_LIMIT_PER_MINUTE) throw new WriterMcpAuthError("rate_limited", 429);
    await touchWriterMcpGrants(grantIds);
  }
  return {
    authMode: "oauth_supabase",
    actorId: identity.actorId,
    profile,
    oauthClientId: identity.oauthClientId,
    clientName: grants[0]?.clientName || null,
    brands: grants.map((grant) => ({
      brandId: grant.brandId,
      brandName: grant.brandName,
      agencyId: grant.agencyId,
      scopes: grant.scopes,
      grantId: grant.id,
      delegationId: null,
    })),
    consentUrl: grants.length ? null : writerMcpConsentUrl(runtime.publicBaseUrl, identity.oauthClientId),
  };
}
