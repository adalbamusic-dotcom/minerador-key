import assert from "node:assert/strict";
import test from "node:test";
import { GET as rootMetadata } from "../app/api/oauth/protected-resource/route.ts";
import { GET as resourceMetadata } from "../app/api/oauth/protected-resource/api/mcp/redator/route.ts";
import { buildProtectedResourceMetadata, looksLikeJwt, mcpBearerChallenge, protectedResourceMetadataResponse } from "../lib/server/mcp-oauth.ts";
import { readMcpRuntimeConfig } from "../lib/server/mcp-runtime-config.ts";

const enabled = readMcpRuntimeConfig({
  NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://mcp.example.test", MCP_OAUTH_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test",
});
const disabled = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://mcp.example.test", MCP_ALLOW_REMOTE_BEARER: "true" });

async function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("metadata do recurso protegido aponta o issuer do Supabase e só anuncia escopos OIDC", () => {
  const metadata = buildProtectedResourceMetadata(enabled);
  assert.ok(metadata);
  assert.equal(metadata.resource, "https://mcp.example.test/api/mcp/redator");
  assert.deepEqual(metadata.authorization_servers, ["https://project.supabase.test/auth/v1"]);
  assert.deepEqual(metadata.scopes_supported, ["openid", "email", "profile"]);
  assert.deepEqual(metadata.bearer_methods_supported, ["header"]);
  assert.equal(JSON.stringify(metadata).includes("writer."), false);
});

test("com OAuth desligado o metadata não existe e o 401 mantém o realm legado", async () => {
  assert.equal(buildProtectedResourceMetadata(disabled), null);
  const response = protectedResourceMetadataResponse(disabled);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "oauth_disabled" });
  assert.equal(mcpBearerChallenge(disabled), 'Bearer realm="minerador-key-redator"');
});

test("com OAuth ligado o 401 aponta o metadata no mesmo host do MCP", async () => {
  assert.equal(mcpBearerChallenge(enabled), 'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/api/mcp/redator"');
  const response = protectedResourceMetadataResponse(enabled);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.json();
  assert.equal(body.resource, "https://mcp.example.test/api/mcp/redator");
});

test("as duas rotas .well-known servem o mesmo metadata a partir do ambiente", async () => {
  await withEnv({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://mcp.example.test", MCP_OAUTH_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test", MCP_OAUTH_ISSUER: undefined }, async () => {
    for (const handler of [rootMetadata, resourceMetadata]) {
      const response = handler();
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.authorization_servers, ["https://project.supabase.test/auth/v1"]);
    }
  });
  await withEnv({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://mcp.example.test", MCP_OAUTH_ENABLED: "false", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test" }, async () => {
    assert.equal(rootMetadata().status, 404);
    assert.equal(resourceMetadata().status, 404);
  });
});

test("looksLikeJwt distingue o formato sem validar nada", () => {
  assert.equal(looksLikeJwt("aaa.bbb.ccc"), true);
  assert.equal(looksLikeJwt("mk_mcp_abc"), false);
  assert.equal(looksLikeJwt("a.b"), false);
  assert.equal(looksLikeJwt("a.b.c.d"), false);
});
