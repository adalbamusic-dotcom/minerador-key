export const LOCAL_MCP_HOSTS = ["localhost:3000", "127.0.0.1:3000"] as const;

type RuntimeEnv = Record<string, string | undefined>;

function truthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value || "").trim().toLowerCase());
}

export function normalizeMcpBaseUrl(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * O issuer OAuth é o Auth do próprio projeto Supabase: `<url>/auth/v1`.
 * Deriva de `NEXT_PUBLIC_SUPABASE_URL`; `MCP_OAUTH_ISSUER` só existe para
 * apontar um issuer diferente em ambiente de teste.
 */
export function resolveMcpOAuthIssuer(env: RuntimeEnv = process.env) {
  const explicit = normalizeMcpBaseUrl(env.MCP_OAUTH_ISSUER);
  if (explicit) return explicit;
  const supabase = normalizeMcpBaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  return supabase ? `${supabase}/auth/v1` : null;
}

export function readMcpRuntimeConfig(env: RuntimeEnv = process.env) {
  const publicBaseUrl = normalizeMcpBaseUrl(env.MCP_PUBLIC_BASE_URL || env.NEXT_PUBLIC_APP_URL);
  const explicitHosts = (env.MCP_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const publicHost = publicBaseUrl ? new URL(publicBaseUrl).host : null;
  const allowedHosts = [...new Set([
    ...(explicitHosts.length ? explicitHosts : LOCAL_MCP_HOSTS),
    ...(publicHost ? [publicHost] : []),
  ])];
  const production = env.NODE_ENV === "production";
  const endpointBase = publicBaseUrl || (!production ? "http://localhost:3000" : null);
  const endpoint = endpointBase ? `${endpointBase}/api/mcp/redator` : null;
  const remoteBearerAllowed = truthy(env.MCP_ALLOW_REMOTE_BEARER);
  const httpsConfigured = publicBaseUrl ? new URL(publicBaseUrl).protocol === "https:" : false;
  const oauthEnabled = truthy(env.MCP_OAUTH_ENABLED);
  const oauthIssuer = resolveMcpOAuthIssuer(env);
  // O metadata do recurso protegido vive no mesmo host do MCP, no caminho RFC 9728.
  const protectedResourceMetadataUrl = endpointBase ? `${endpointBase}/.well-known/oauth-protected-resource/api/mcp/redator` : null;
  const oauthReady = oauthEnabled && Boolean(oauthIssuer) && Boolean(endpoint);
  const validProductionConfig = !production
    || Boolean(publicBaseUrl && httpsConfigured && (oauthEnabled ? oauthReady : remoteBearerAllowed));

  return {
    production,
    publicBaseUrl,
    endpoint,
    allowedHosts,
    remoteBearerAllowed,
    httpsConfigured,
    oauthEnabled,
    oauthIssuer,
    oauthReady,
    protectedResourceMetadataUrl,
    validProductionConfig,
  } as const;
}

export type McpRuntimeConfig = ReturnType<typeof readMcpRuntimeConfig>;

export function mcpRuntimeFailure(config = readMcpRuntimeConfig()) {
  if (config.production && !config.publicBaseUrl) {
    return { code: "mcp_public_endpoint_not_configured", message: "Configure MCP_PUBLIC_BASE_URL (HTTPS) antes de expor o MCP em produção." } as const;
  }
  if (config.production && !config.httpsConfigured) {
    return { code: "mcp_https_required", message: "O endpoint MCP de produção precisa usar HTTPS." } as const;
  }
  if (config.oauthEnabled && !config.oauthIssuer) {
    return { code: "mcp_oauth_issuer_missing", message: "MCP_OAUTH_ENABLED exige NEXT_PUBLIC_SUPABASE_URL (ou MCP_OAUTH_ISSUER) para derivar o issuer OAuth." } as const;
  }
  if (config.production && !config.oauthEnabled && !config.remoteBearerAllowed) {
    return { code: "mcp_remote_bearer_disabled", message: "Nenhum modo de autenticação remota está ativo. Habilite MCP_OAUTH_ENABLED para clientes como ChatGPT ou, somente para diagnóstico privado, MCP_ALLOW_REMOTE_BEARER." } as const;
  }
  return null;
}
