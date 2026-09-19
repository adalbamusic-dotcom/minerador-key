/**
 * Estado das conexões MCP do Redator, em funções puras.
 *
 * Três coisas diferentes que a interface precisa distinguir com clareza:
 *   1. a Plataforma está pronta para OAuth? (discovery do servidor de autorização)
 *   2. um cliente registrado pela Agência já tem usuário conectado? (grant ativo)
 *   3. qual provider um nome de cliente OAuth representa? (ChatGPT, Claude...)
 */

export const MCP_PROVIDER_KEYS = ["chatgpt", "claude", "gemini", "custom_mcp"] as const;
export type McpProviderKey = typeof MCP_PROVIDER_KEYS[number];

/** O cliente OAuth se registra com o nome que quiser; o provider é inferido do nome. */
export function matchMcpProviderKey(clientName: string | null | undefined): McpProviderKey {
  const name = (clientName || "").toLowerCase();
  if (/chatgpt|openai|gpt/.test(name)) return "chatgpt";
  if (/claude|anthropic/.test(name)) return "claude";
  if (/gemini|google/.test(name)) return "gemini";
  return "custom_mcp";
}

export type McpOAuthReadinessReason =
  | "oauth_disabled"
  | "issuer_missing"
  | "discovery_unreachable"
  | "authorization_server_disabled"
  | "authorization_endpoints_missing"
  | "pkce_missing"
  | "dynamic_registration_missing";

export type McpOAuthReadiness = {
  status: "ready" | "pending" | "disabled";
  reason: McpOAuthReadinessReason | null;
  issuer: string | null;
  metadataUrl: string | null;
  authorizationEndpoint: string | null;
  registrationEndpoint: string | null;
  checkedAt: string | null;
};

export const MCP_OAUTH_REASON_LABELS: Record<McpOAuthReadinessReason, string> = {
  oauth_disabled: "OAuth desativado nesta plataforma (MCP_OAUTH_ENABLED).",
  issuer_missing: "Servidor de autorização não configurado (URL do Supabase ausente).",
  discovery_unreachable: "Servidor de autorização não respondeu; tente de novo em instantes.",
  authorization_server_disabled: "OAuth Server do Supabase desligado. Ative em Authentication → OAuth Server.",
  authorization_endpoints_missing: "Servidor de autorização sem endpoints de autorização e token.",
  pkce_missing: "Servidor de autorização sem PKCE S256, exigido pelos clientes.",
  dynamic_registration_missing: "Registro dinâmico de cliente desligado no Supabase; ChatGPT e Claude precisam dele.",
};

function httpsString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function resolveMcpOAuthReadiness(input: {
  oauthEnabled: boolean;
  issuer: string | null;
  metadataUrl: string | null;
  discoveryStatus: number | null;
  discovery: unknown;
  checkedAt?: string | null;
}): McpOAuthReadiness {
  const base = { issuer: input.issuer, metadataUrl: input.metadataUrl, authorizationEndpoint: null, registrationEndpoint: null, checkedAt: input.checkedAt ?? null };
  if (!input.oauthEnabled) return { ...base, status: "disabled", reason: "oauth_disabled" };
  if (!input.issuer) return { ...base, status: "pending", reason: "issuer_missing" };
  const body = input.discovery && typeof input.discovery === "object" ? input.discovery as Record<string, unknown> : null;
  if (input.discoveryStatus === 404 && body?.error_code === "feature_disabled") return { ...base, status: "pending", reason: "authorization_server_disabled" };
  if (input.discoveryStatus !== 200 || !body) return { ...base, status: "pending", reason: "discovery_unreachable" };
  const authorizationEndpoint = httpsString(body.authorization_endpoint);
  const tokenEndpoint = httpsString(body.token_endpoint);
  const registrationEndpoint = httpsString(body.registration_endpoint);
  if (!authorizationEndpoint || !tokenEndpoint) return { ...base, status: "pending", reason: "authorization_endpoints_missing" };
  const methods = Array.isArray(body.code_challenge_methods_supported) ? body.code_challenge_methods_supported : [];
  if (!methods.includes("S256")) return { ...base, status: "pending", reason: "pkce_missing", authorizationEndpoint };
  const cimd = body.client_id_metadata_document_supported === true;
  if (!registrationEndpoint && !cimd) return { ...base, status: "pending", reason: "dynamic_registration_missing", authorizationEndpoint };
  return { ...base, status: "ready", reason: null, authorizationEndpoint, registrationEndpoint };
}

export type McpConnectionDisplayStatus = "connected" | "awaiting_login" | "pending_oauth" | "revoked";

export const MCP_CONNECTION_STATUS_LABELS: Record<McpConnectionDisplayStatus, string> = {
  connected: "Conectado",
  awaiting_login: "Aguardando login do usuário",
  pending_oauth: "Aguardando OAuth da plataforma",
  revoked: "Revogado",
};

/** O cliente registrado só é "Conectado" quando existe grant ativo daquele provider. */
export function resolveMcpConnectionDisplayStatus(input: {
  lifecycleStatus: string;
  oauthStatus: McpOAuthReadiness["status"];
  hasActiveGrant: boolean;
}): McpConnectionDisplayStatus {
  if (input.lifecycleStatus === "revoked") return "revoked";
  if (input.hasActiveGrant) return "connected";
  if (input.oauthStatus === "ready") return "awaiting_login";
  return "pending_oauth";
}
