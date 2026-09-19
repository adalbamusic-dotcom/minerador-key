import test from "node:test";
import assert from "node:assert/strict";
import { mcpRuntimeFailure, readMcpRuntimeConfig, resolveMcpOAuthIssuer } from "../lib/server/mcp-runtime-config.ts";

test("MCP local has a stable endpoint and local host allowlist", () => {
  const config = readMcpRuntimeConfig({ NODE_ENV: "development" });
  assert.equal(config.endpoint, "http://localhost:3000/api/mcp/redator");
  assert.deepEqual(config.allowedHosts, ["localhost:3000", "127.0.0.1:3000"]);
  assert.equal(config.oauthEnabled, false);
  assert.equal(mcpRuntimeFailure(config), null);
});

test("MCP production requires HTTPS and an explicit remote bearer opt-in", () => {
  const missing = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://example.vercel.app" });
  assert.equal(missing.endpoint, "https://example.vercel.app/api/mcp/redator");
  assert.equal(mcpRuntimeFailure(missing)?.code, "mcp_remote_bearer_disabled");

  const ready = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://example.vercel.app", MCP_ALLOW_REMOTE_BEARER: "true" });
  assert.equal(mcpRuntimeFailure(ready), null);
  assert.ok(ready.allowedHosts.includes("example.vercel.app"));
});

test("MCP production rejects an HTTP public endpoint", () => {
  const config = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "http://example.vercel.app", MCP_ALLOW_REMOTE_BEARER: "true" });
  assert.equal(mcpRuntimeFailure(config)?.code, "mcp_https_required");
});

test("OAuth derives the issuer from the Supabase URL and satisfies production without the bearer opt-in", () => {
  assert.equal(resolveMcpOAuthIssuer({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test/" }), "https://project.supabase.test/auth/v1");
  assert.equal(resolveMcpOAuthIssuer({ MCP_OAUTH_ISSUER: "https://issuer.example.test/auth/v1", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test" }), "https://issuer.example.test/auth/v1");
  assert.equal(resolveMcpOAuthIssuer({}), null);

  const config = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://example.vercel.app", MCP_OAUTH_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test" });
  assert.equal(config.oauthEnabled, true);
  assert.equal(config.oauthReady, true);
  assert.equal(config.remoteBearerAllowed, false);
  assert.equal(config.protectedResourceMetadataUrl, "https://example.vercel.app/.well-known/oauth-protected-resource/api/mcp/redator");
  assert.equal(mcpRuntimeFailure(config), null);
  assert.equal(config.validProductionConfig, true);
});

test("OAuth enabled without a Supabase URL is a configuration failure", () => {
  const config = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://example.vercel.app", MCP_OAUTH_ENABLED: "true" });
  assert.equal(config.oauthReady, false);
  assert.equal(mcpRuntimeFailure(config)?.code, "mcp_oauth_issuer_missing");
  assert.equal(config.validProductionConfig, false);
});
