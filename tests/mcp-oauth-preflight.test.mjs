import test from "node:test";
import assert from "node:assert/strict";
import { runMcpOAuthPreflight } from "../scripts/mcp-oauth-preflight.mjs";

const endpoint = "https://mcp.example.test/api/mcp/redator";
const issuer = "https://auth.example.test/auth/v1";
const metadataUrl = "https://mcp.example.test/.well-known/oauth-protected-resource/api/mcp/redator";
const discoveryUrl = "https://auth.example.test/.well-known/oauth-authorization-server/auth/v1";
const oauth = {
  issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`,
  registration_endpoint: `${issuer}/oauth/register`, code_challenge_methods_supported: ["S256"],
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["none"],
};
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
function fixture({ ready = false, challenge = `Bearer resource_metadata="${metadataUrl}"`, metadata, authorizationServer = oauth } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url === endpoint) return json({ error: "bearer_required" }, 401, { "WWW-Authenticate": ready ? challenge : "Bearer realm=\"minerador-key-redator\"" });
    if (url === `${endpoint}/health`) return json({ ok: true, oauth: { configured: ready } });
    if (url === metadataUrl && ready) return json(metadata ?? { resource: endpoint, authorization_servers: [issuer] });
    if (url === discoveryUrl) return ready ? json(authorizationServer) : json({ error_code: "feature_disabled" }, 404);
    return new Response("Not found", { status: 404 });
  } };
}

test("reproduz incidente: health 200 e protocolo bearer não comprovam OAuth", async () => {
  const f = fixture();
  const result = await runMcpOAuthPreflight({ endpoint, issuer, fetchImpl: f.fetchImpl });
  assert.equal(result.observed.healthOk, true);
  assert.equal(result.observed.authorizationServerDisabled, true);
  assert.equal(result.oauthDiscovery, "BLOCKED");
  assert.ok(result.blockers.includes("protectedResourceMetadata"));
  assert.ok(result.blockers.includes("authorizationServerDiscovery"));
  assert.ok(result.blockers.includes("challengeLinksToMetadata"));
});

test("discovery completo passa sem afirmar login nem escrita e sem registrar cliente", async () => {
  const f = fixture({ ready: true });
  const result = await runMcpOAuthPreflight({ endpoint, issuer, fetchImpl: f.fetchImpl });
  assert.equal(result.oauthDiscovery, "PASS");
  assert.equal(result.chatgptConnection, "NOT_TESTED");
  assert.equal(result.authenticatedReadWrite, "NOT_TESTED");
  assert.deepEqual(result.blockers, []);
  for (const { url, options } of f.calls) {
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, "manual");
    if (options.method === "POST") {
      assert.equal(url, endpoint);
      assert.equal(JSON.parse(options.body).method, "initialize");
    }
    assert.ok(!url.includes("/oauth/register") && !url.includes("/oauth/token") && !url.includes("/oauth/authorize"));
  }
});

test("discovery recusa outro recurso ou issuer e PKCE ausente", async () => {
  const f = fixture({ ready: true, metadata: { resource: `${endpoint}/outro`, authorization_servers: [issuer] },
    authorizationServer: { ...oauth, issuer: "https://another.example.test", code_challenge_methods_supported: ["plain"] } });
  const result = await runMcpOAuthPreflight({ endpoint, issuer, fetchImpl: f.fetchImpl });
  assert.equal(result.oauthDiscovery, "BLOCKED");
  for (const check of ["protectedResourceMetadata", "authorizationServerDiscovery", "pkceS256"]) assert.ok(result.blockers.includes(check));
});

test("challenge não pode redirecionar a auditoria a host arbitrário", async () => {
  const f = fixture({ ready: true, challenge: 'Bearer resource_metadata="https://another.example.test/private"' });
  const result = await runMcpOAuthPreflight({ endpoint, issuer, fetchImpl: f.fetchImpl });
  assert.equal(result.oauthDiscovery, "BLOCKED");
  assert.equal(result.checks.challengeLinksToMetadata, false);
  assert.ok(f.calls.every(c => !c.url.includes("another.example.test")));
});

test("falha de rede bloqueia discovery com saída sanitizada", async () => {
  const result = await runMcpOAuthPreflight({ endpoint, issuer, fetchImpl: async () => { throw new Error("sensitive_response"); } });
  assert.equal(result.oauthDiscovery, "BLOCKED");
  assert.ok(!JSON.stringify(result).includes("sensitive_response"));
});

test("URL com bearer ou credenciais é rejeitada antes da rede", async () => {
  for (const invalid of [`${endpoint}?token=secret`, "https://user:secret@mcp.example.test/api/mcp/redator", endpoint.replace("https:", "http:")]) {
    await assert.rejects(runMcpOAuthPreflight({ endpoint: invalid, issuer, fetchImpl: () => assert.fail("não deve chamar rede") }));
  }
});
