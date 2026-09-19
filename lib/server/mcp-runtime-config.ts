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
  const validProductionConfig = !production || Boolean(publicBaseUrl && httpsConfigured && remoteBearerAllowed);

  return {
    production,
    publicBaseUrl,
    endpoint,
    allowedHosts,
    remoteBearerAllowed,
    httpsConfigured,
    validProductionConfig,
  } as const;
}

export function mcpRuntimeFailure(config = readMcpRuntimeConfig()) {
  if (config.production && !config.publicBaseUrl) {
    return { code: "mcp_public_endpoint_not_configured", message: "Configure MCP_PUBLIC_BASE_URL (HTTPS) antes de expor o MCP em produção." } as const;
  }
  if (config.production && !config.httpsConfigured) {
    return { code: "mcp_https_required", message: "O endpoint MCP de produção precisa usar HTTPS." } as const;
  }
  if (config.production && !config.remoteBearerAllowed) {
    return { code: "mcp_remote_bearer_disabled", message: "A autenticação bearer remota está desativada. Habilite-a apenas para o smoke test privado ou configure OAuth antes de conectar um cliente remoto." } as const;
  }
  return null;
}
