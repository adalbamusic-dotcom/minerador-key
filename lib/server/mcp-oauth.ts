import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isUuid, WRITER_MCP_OIDC_SCOPES } from "@/lib/redator/mcp-consent-domain";
import { readMcpRuntimeConfig, type McpRuntimeConfig } from "./mcp-runtime-config";
import { WriterMcpAuthError } from "./writer-mcp-delegation";

/*
 * SERVIDOR DE RECURSO, NÃO DE AUTORIZAÇÃO.
 *
 * Quem emite o token é o OAuth 2.1 Server do Supabase. Aqui só se publica o
 * metadata do recurso protegido (RFC 9728) e se verifica o JWT recebido:
 * assinatura, expiração, issuer e a presença de `client_id`. A decisão de
 * acesso por Marca e escopo vem de `writer_mcp_grants`, nunca do token.
 */

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function looksLikeJwt(token: string): boolean {
  return JWT_PATTERN.test(token);
}

export function buildProtectedResourceMetadata(config: McpRuntimeConfig = readMcpRuntimeConfig()) {
  if (!config.oauthEnabled || !config.oauthIssuer || !config.endpoint) return null;
  return {
    resource: config.endpoint,
    authorization_servers: [config.oauthIssuer],
    scopes_supported: [...WRITER_MCP_OIDC_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Minerador Key — Redator",
  } as const;
}

export function protectedResourceMetadataResponse(config: McpRuntimeConfig = readMcpRuntimeConfig()) {
  const metadata = buildProtectedResourceMetadata(config);
  if (!metadata) {
    return Response.json({ error: "oauth_disabled" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(metadata, { status: 200, headers: { "Cache-Control": "public, max-age=300" } });
}

/** O 401 aponta o metadata quando o OAuth está ligado; senão mantém o realm legado. */
export function mcpBearerChallenge(config: McpRuntimeConfig = readMcpRuntimeConfig()) {
  if (config.oauthEnabled && config.oauthIssuer && config.protectedResourceMetadataUrl) {
    return `Bearer resource_metadata="${config.protectedResourceMetadataUrl}"`;
  }
  return "Bearer realm=\"minerador-key-redator\"";
}

export type McpOAuthIdentity = {
  actorId: string;
  oauthClientId: string;
  issuer: string;
  expiresAt: string | null;
};

type Jwk = { kid?: string; kty: string; [key: string]: unknown };

export type McpOAuthVerifyDeps = {
  issuer?: string | null;
  /** Chaves públicas conhecidas; evita a busca em `/.well-known/jwks.json` (testes). */
  jwks?: { keys: Jwk[] };
  client?: SupabaseClient;
};

function verificationClient(issuer: string, anonKey: string | undefined) {
  const projectUrl = issuer.replace(/\/auth\/v1\/?$/, "");
  return createClient(projectUrl, anonKey || "public-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Verifica um access token OAuth emitido pelo Supabase. Com chave assimétrica a
 * assinatura é conferida localmente pelo JWKS; com HS256 o cliente consulta o
 * Auth. Qualquer falha vira 401 sem detalhes do token.
 */
export async function verifyMcpOAuthToken(token: string, deps: McpOAuthVerifyDeps = {}): Promise<McpOAuthIdentity> {
  const issuer = deps.issuer ?? readMcpRuntimeConfig().oauthIssuer;
  if (!issuer) throw new WriterMcpAuthError("mcp_oauth_issuer_missing", 503);
  if (!looksLikeJwt(token)) throw new WriterMcpAuthError("invalid_token");

  const client = deps.client ?? verificationClient(issuer, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  let claims: Record<string, unknown>;
  try {
    const result = await client.auth.getClaims(token, deps.jwks ? { jwks: deps.jwks as { keys: never[] } } : undefined);
    if (result.error || !result.data?.claims) throw new WriterMcpAuthError("invalid_token");
    claims = result.data.claims as Record<string, unknown>;
  } catch (error) {
    if (error instanceof WriterMcpAuthError) throw error;
    throw new WriterMcpAuthError("token_verification_failed");
  }

  if (claims.iss !== issuer) throw new WriterMcpAuthError("token_issuer_mismatch");
  if (!isUuid(claims.sub)) throw new WriterMcpAuthError("invalid_token");
  const clientId = typeof claims.client_id === "string" ? claims.client_id.trim() : "";
  if (!clientId) throw new WriterMcpAuthError("oauth_client_required");

  return {
    actorId: claims.sub,
    oauthClientId: clientId,
    issuer,
    expiresAt: typeof claims.exp === "number" ? new Date(claims.exp * 1000).toISOString() : null,
  };
}
