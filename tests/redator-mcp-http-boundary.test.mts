import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { GET as mcpGet, POST as mcpPost } from "../app/api/mcp/redator/route.ts";
import { GET as healthGet } from "../app/api/mcp/redator/health/route.ts";
import { PLATFORM_CATALOG_HASH } from "../lib/agent/catalog-hash.ts";
import { PLATFORM_GUIDE_TOPICS, catalogToolNames } from "../lib/agent/platform-catalog.ts";

const publicHost = "mcp.example.test";
const publicBaseUrl = `https://${publicHost}`;
const supabaseUrl = "https://project.supabase.test";
const metadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource/api/mcp/redator`;

async function withRuntime(
  context: TestContext,
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const values: Record<string, string | undefined> = {
    NODE_ENV: "production",
    MCP_PUBLIC_BASE_URL: publicBaseUrl,
    NEXT_PUBLIC_APP_URL: undefined,
    MCP_ALLOWED_HOSTS: publicHost,
    MCP_ALLOW_REMOTE_BEARER: "true",
    MCP_OAUTH_ENABLED: undefined,
    MCP_OAUTH_ISSUER: undefined,
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    ...overrides,
  };
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  const network = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("HTTP boundary regression must not access the network or database.");
  });
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
    assert.equal(network.mock.callCount(), 0, "Requests must stop before any external access.");
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    network.mock.restore();
  }
}

function request(method: "GET" | "POST", host = publicHost, path = "/api/mcp/redator", authorization?: string) {
  return new Request(`${publicBaseUrl}${path}`, {
    method,
    headers: {
      host,
      Accept: "application/json, text/event-stream",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? {
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "http-boundary-test", version: "1" },
      } }),
    } : {}),
  }) as Parameters<typeof mcpGet>[0];
}

const oauthRuntime = { MCP_OAUTH_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, MCP_ALLOW_REMOTE_BEARER: "false" };

for (const [method, handler] of [["GET", mcpGet], ["POST", mcpPost]] as const) {
  test(`MCP HTTP ${method} sem bearer retorna 401 e declara somente o challenge legado`, async context => {
    await withRuntime(context, {}, async () => {
      const response = await handler(request(method));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "bearer_required" });
      assert.equal(response.headers.get("www-authenticate"), 'Bearer realm="minerador-key-redator"');
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  });

  test(`MCP HTTP ${method} recusa Host externo antes de autenticar`, async context => {
    await withRuntime(context, {}, async () => {
      const response = await handler(request(method, "untrusted.example.test"));
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "host_not_allowed" });
    });
  });

  test(`MCP HTTP ${method} recusa produção sem OAuth e sem bearer remoto`, async context => {
    await withRuntime(context, { MCP_ALLOW_REMOTE_BEARER: "false" }, async () => {
      const response = await handler(request(method));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "mcp_remote_bearer_disabled" });
    });
  });

  test(`MCP HTTP ${method} com OAuth ligado aponta o metadata do recurso no 401`, async context => {
    await withRuntime(context, oauthRuntime, async () => {
      const response = await handler(request(method));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "bearer_required" });
      assert.equal(response.headers.get("www-authenticate"), `Bearer resource_metadata="${metadataUrl}"`);
    });
  });

  test(`MCP HTTP ${method} com OAuth ligado recusa o bearer de diagnóstico sem opt-in`, async context => {
    await withRuntime(context, oauthRuntime, async () => {
      const response = await handler(request(method, publicHost, "/api/mcp/redator", `Bearer mk_mcp_${"a".repeat(43)}`));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "bearer_disabled" });
    });
  });

  test(`MCP HTTP ${method} com OAuth ligado recusa token malformado antes de qualquer acesso externo`, async context => {
    await withRuntime(context, oauthRuntime, async () => {
      const response = await handler(request(method, publicHost, "/api/mcp/redator", "Bearer not.a.jwt"));
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.ok(["invalid_token", "token_verification_failed"].includes(body.error), body.error);
      assert.equal(response.headers.get("www-authenticate"), `Bearer resource_metadata="${metadataUrl}"`);
    });
  });
}

test("health preserva HTTP 200 e ok legado sem afirmar login ChatGPT ou round-trip autenticado", async context => {
  await withRuntime(context, {}, async () => {
    const response = await healthGet(request("GET", publicHost, "/api/mcp/redator/health"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.transport, "streamable_http");
    assert.equal(payload.authMode, "delegated_bearer");
    assert.equal(payload.endpoint, `${publicBaseUrl}/api/mcp/redator`);
    assert.deepEqual(payload.catalog, {
      hash: PLATFORM_CATALOG_HASH,
      guideTopicCount: PLATFORM_GUIDE_TOPICS.length,
      toolCount: catalogToolNames().length,
    });
    assert.equal(payload.oauth.configured, false);
    assert.equal(payload.oauth.requiredForPublicClient, true);
    assert.equal(payload.oauth.protectedResourceMetadataUrl, null);
    assert.equal(payload.readiness.bearerTransportConfigured, true);
    assert.equal(payload.readiness.oauthImplemented, true);
    assert.equal(payload.readiness.oauthEnabled, false);
    assert.equal(payload.readiness.chatgptLoginReady, false);
    assert.equal(payload.readiness.authenticatedRoundTrip, "not_verified");
    assert.deepEqual(payload.readiness.blockers, ["oauth_disabled"]);
    assert.equal(payload.readiness.verificationScope, "runtime_configuration_only");
  });
});

test("health com OAuth ligado expõe issuer e metadata e reflete a homologação do login do ChatGPT", async context => {
  await withRuntime(context, oauthRuntime, async () => {
    const response = await healthGet(request("GET", publicHost, "/api/mcp/redator/health"));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.authMode, "oauth_supabase");
    assert.equal(payload.remoteBearerAllowed, false);
    assert.equal(payload.oauth.configured, true);
    assert.equal(payload.oauth.issuer, `${supabaseUrl}/auth/v1`);
    assert.equal(payload.oauth.protectedResourceMetadataUrl, metadataUrl);
    assert.equal(payload.readiness.chatgptLoginReady, true);
    assert.equal(payload.readiness.authenticatedRoundTrip, "homologated_2026-09-19");
    assert.deepEqual(payload.readiness.blockers, []);
  });
});

test("health mantém 503 e transporte indisponível quando nenhum modo remoto está ativo", async context => {
  await withRuntime(context, { MCP_ALLOW_REMOTE_BEARER: "false" }, async () => {
    const response = await healthGet(request("GET", publicHost, "/api/mcp/redator/health"));
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "mcp_remote_bearer_disabled");
    assert.equal(payload.readiness.bearerTransportConfigured, false);
    assert.equal(payload.readiness.chatgptLoginReady, false);
  });
});

test("health mantém a allowlist de Host", async context => {
  await withRuntime(context, {}, async () => {
    const response = await healthGet(request("GET", "untrusted.example.test", "/api/mcp/redator/health"));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, code: "host_not_allowed" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
