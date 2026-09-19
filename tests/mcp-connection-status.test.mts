import assert from "node:assert/strict";
import test from "node:test";
import {
  matchMcpProviderKey,
  MCP_OAUTH_REASON_LABELS,
  resolveMcpConnectionDisplayStatus,
  resolveMcpOAuthReadiness,
} from "../lib/redator/mcp-connection-status.ts";

const issuer = "https://project.supabase.test/auth/v1";
const metadataUrl = "https://mcp.example.test/.well-known/oauth-protected-resource/api/mcp/redator";
const discovery = {
  issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`,
  registration_endpoint: `${issuer}/oauth/clients/register`, code_challenge_methods_supported: ["S256"],
};

test("o provider é inferido do nome que o cliente OAuth se dá", () => {
  assert.equal(matchMcpProviderKey("ChatGPT"), "chatgpt");
  assert.equal(matchMcpProviderKey("OpenAI ChatGPT connector"), "chatgpt");
  assert.equal(matchMcpProviderKey("Claude"), "claude");
  assert.equal(matchMcpProviderKey("Anthropic Claude Desktop"), "claude");
  assert.equal(matchMcpProviderKey("Gemini CLI"), "gemini");
  assert.equal(matchMcpProviderKey("mcp-inspector"), "custom_mcp");
  assert.equal(matchMcpProviderKey(null), "custom_mcp");
});

test("prontidão OAuth distingue desligado, Supabase desligado, discovery fora e pronto", () => {
  const disabled = resolveMcpOAuthReadiness({ oauthEnabled: false, issuer, metadataUrl: null, discoveryStatus: null, discovery: null });
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.reason, "oauth_disabled");

  const supabaseOff = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer, metadataUrl, discoveryStatus: 404, discovery: { code: 404, error_code: "feature_disabled", msg: "OAuth server is disabled" } });
  assert.equal(supabaseOff.status, "pending");
  assert.equal(supabaseOff.reason, "authorization_server_disabled");
  assert.match(MCP_OAUTH_REASON_LABELS[supabaseOff.reason as "authorization_server_disabled"], /OAuth Server/);

  const unreachable = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer, metadataUrl, discoveryStatus: null, discovery: null });
  assert.equal(unreachable.reason, "discovery_unreachable");

  const noIssuer = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer: null, metadataUrl, discoveryStatus: null, discovery: null });
  assert.equal(noIssuer.reason, "issuer_missing");

  const ready = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer, metadataUrl, discoveryStatus: 200, discovery, checkedAt: "2026-09-19T10:00:00.000Z" });
  assert.equal(ready.status, "ready");
  assert.equal(ready.reason, null);
  assert.equal(ready.authorizationEndpoint, `${issuer}/oauth/authorize`);
  assert.equal(ready.registrationEndpoint, `${issuer}/oauth/clients/register`);
  assert.equal(ready.checkedAt, "2026-09-19T10:00:00.000Z");
});

test("discovery sem PKCE S256 ou sem registro dinâmico fica pendente com o motivo certo", () => {
  const noPkce = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer, metadataUrl, discoveryStatus: 200, discovery: { ...discovery, code_challenge_methods_supported: ["plain"] } });
  assert.equal(noPkce.reason, "pkce_missing");
  const noDcr = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer, metadataUrl, discoveryStatus: 200, discovery: { ...discovery, registration_endpoint: undefined } });
  assert.equal(noDcr.reason, "dynamic_registration_missing");
  const cimd = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer, metadataUrl, discoveryStatus: 200, discovery: { ...discovery, registration_endpoint: undefined, client_id_metadata_document_supported: true } });
  assert.equal(cimd.status, "ready");
  const httpEndpoint = resolveMcpOAuthReadiness({ oauthEnabled: true, issuer, metadataUrl, discoveryStatus: 200, discovery: { ...discovery, token_endpoint: "http://insecure.test/token" } });
  assert.equal(httpEndpoint.reason, "authorization_endpoints_missing");
});

test("o cliente registrado só aparece conectado com grant ativo", () => {
  assert.equal(resolveMcpConnectionDisplayStatus({ lifecycleStatus: "pending", oauthStatus: "pending", hasActiveGrant: false }), "pending_oauth");
  assert.equal(resolveMcpConnectionDisplayStatus({ lifecycleStatus: "pending", oauthStatus: "ready", hasActiveGrant: false }), "awaiting_login");
  assert.equal(resolveMcpConnectionDisplayStatus({ lifecycleStatus: "pending", oauthStatus: "ready", hasActiveGrant: true }), "connected");
  assert.equal(resolveMcpConnectionDisplayStatus({ lifecycleStatus: "ready", oauthStatus: "pending", hasActiveGrant: true }), "connected");
  assert.equal(resolveMcpConnectionDisplayStatus({ lifecycleStatus: "revoked", oauthStatus: "ready", hasActiveGrant: true }), "revoked");
});
