// Public discovery only. Never accepts a token or calls registration, consent or tools.
import { pathToFileURL } from "node:url";

function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Use uma URL HTTPS pública, sem credenciais, query ou fragmento.");
  }
  return url;
}

export async function runMcpOAuthPreflight({ endpoint, issuer, fetchImpl = fetch, timeoutMs = 10000 }) {
  const resource = publicUrl(endpoint).href.replace(/\/$/, "");
  const authority = publicUrl(issuer).href.replace(/\/$/, "");
  const origin = new URL(resource).origin;
  const authorityUrl = new URL(authority);
  const discoveryUrl = `${authorityUrl.origin}/.well-known/oauth-authorization-server${authorityUrl.pathname.replace(/\/$/, "")}`;
  const probes = [];

  async function probe(url, method = "GET") {
    try {
      const response = await fetchImpl(url, {
        method, redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json, text/event-stream", "Cache-Control": "no-store",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(method === "POST" ? { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "oauth-public-preflight", version: "1" } } }) } : {}),
      });
      const data = response.headers.get("content-type")?.includes("application/json")
        ? await response.json().catch(() => null) : null;
      const result = { status: response.status, challenge: response.headers.get("www-authenticate"), data };
      // Do not serialize bodies, cookies, challenges or redirects into the report.
      probes.push({ url, method, status: response.status });
      return result;
    } catch {
      probes.push({ url, method, status: null, error: "request_failed" });
      return { status: null, challenge: null, data: null };
    }
  }

  const [get, post, health, discovery] = await Promise.all([
    probe(resource), probe(resource, "POST"), probe(`${resource}/health`), probe(discoveryUrl),
  ]);
  const metadataUrls = new Set([
    `${origin}/.well-known/oauth-protected-resource${new URL(resource).pathname}`,
    `${origin}/.well-known/oauth-protected-resource`,
  ]);
  const metadataChallenge = post.challenge?.match(/resource_metadata="([^"]+)"/i)?.[1];
  // A server response cannot make this CLI probe an arbitrary host with local network access.
  if (metadataChallenge) {
    try {
      const advertised = publicUrl(metadataChallenge);
      if (advertised.origin === origin) metadataUrls.add(advertised.href);
    } catch { /* Invalid discovery URL is reported below, not followed. */ }
  }
  const metadataProbes = await Promise.all([...metadataUrls].map(async url => ({ url, ...await probe(url) })));
  const validMetadata = (probeResult) => probeResult.status === 200
    && probeResult.data?.resource === resource
    && Array.isArray(probeResult.data?.authorization_servers)
    && probeResult.data.authorization_servers.includes(authority);
  const protectedResource = metadataProbes.find(validMetadata);
  const challengeValid = Boolean(metadataChallenge && metadataProbes.some(p => p.url === metadataChallenge && validMetadata(p)));
  const oauth = discovery.status === 200 ? discovery.data : null;
  const isHttpsUrl = value => {
    try { return typeof value === "string" && Boolean(publicUrl(value)); } catch { return false; }
  };
  const checks = {
    unauthenticatedPostDenied: post.status === 401,
    protectedResourceMetadata: Boolean(protectedResource),
    challengeLinksToMetadata: challengeValid,
    authorizationServerDiscovery: Boolean(oauth && oauth.issuer === authority),
    authorizationEndpoint: isHttpsUrl(oauth?.authorization_endpoint),
    tokenEndpoint: isHttpsUrl(oauth?.token_endpoint),
    pkceS256: Array.isArray(oauth?.code_challenge_methods_supported) && oauth.code_challenge_methods_supported.includes("S256"),
    authorizationCodeFlow: Array.isArray(oauth?.response_types_supported) && oauth.response_types_supported.includes("code")
      && (!oauth.grant_types_supported || (Array.isArray(oauth.grant_types_supported) && oauth.grant_types_supported.includes("authorization_code"))),
    automaticClientRegistration: oauth?.client_id_metadata_document_supported === true || isHttpsUrl(oauth?.registration_endpoint),
    tokenAuthMethod: Array.isArray(oauth?.token_endpoint_auth_methods_supported)
      && oauth.token_endpoint_auth_methods_supported.some(method => ["none", "client_secret_post", "client_secret_basic", "private_key_jwt"].includes(method)),
  };
  const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    checkedAt: new Date().toISOString(), endpoint: resource, issuer: authority,
    oauthDiscovery: blockers.length ? "BLOCKED" : "PASS",
    // Passing discovery never proves a token exchange or the ChatGPT account connection.
    chatgptConnection: "NOT_TESTED", authenticatedReadWrite: "NOT_TESTED",
    observed: {
      getStatus: get.status, postStatus: post.status, healthStatus: health.status,
      healthOk: health.data?.ok === true, healthOAuthConfigured: health.data?.oauth?.configured === true,
      authorizationServerDisabled: discovery.data?.error_code === "feature_disabled",
    }, checks, blockers, probes,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  if (args.length !== 2) {
    console.error("Uso: pnpm run check:mcp:oauth -- <URL HTTPS do MCP> <issuer HTTPS do OAuth>");
    process.exitCode = 2;
  } else {
    try {
      const report = await runMcpOAuthPreflight({ endpoint: args[0], issuer: args[1] });
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.oauthDiscovery === "PASS" ? 0 : 1;
    } catch {
      console.error("Configuração inválida. Use URLs HTTPS públicas sem tokens, credenciais ou parâmetros.");
      process.exitCode = 2;
    }
  }
}
