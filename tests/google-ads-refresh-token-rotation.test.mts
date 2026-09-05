import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { rotatePlatformGoogleAdsRefreshToken } from "../lib/server/platform-integrations-admin.ts";
import { resolveGoogleAdsPlatformConfig } from "../lib/server/google-ads-canonical.ts";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const PROVIDER_ID = "10000000-0000-4000-8000-000000000002";
const CONNECTION_ID = "10000000-0000-4000-8000-000000000003";
const OLD_SECRET_REF = "10000000-0000-4000-8000-000000000004";
const CREATED_SECRET_REF = "10000000-0000-4000-8000-000000000005";
const NEW_TOKEN = "new-refresh-token-fixture";

type Connection = {
  id: string;
  provider_id: string;
  owner_scope_type: "platform";
  environment: "production";
  lifecycle_status: string;
  secret_ref: string | null;
  metadata: Record<string, unknown>;
};

function fakeClient(options: { connection?: Connection | null; updateError?: boolean; secretError?: boolean } = {}) {
  let provider: { id: string; provider_key: "google_ads"; status: "active" } | null = { id: PROVIDER_ID, provider_key: "google_ads", status: "active" };
  let connection = options.connection === undefined ? null : options.connection;
  const writes: Array<{ table: string; operation: string; payload: Record<string, unknown> }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      let operation = "select";
      let payload: Record<string, unknown> = {};
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        neq() { return builder; },
        insert(value: Record<string, unknown>) { operation = "insert"; payload = value; writes.push({ table, operation, payload }); return builder; },
        update(value: Record<string, unknown>) { operation = "update"; payload = value; writes.push({ table, operation, payload }); return builder; },
        async maybeSingle() {
          if (table === "integration_providers") return { data: provider, error: null };
          if (table === "integration_connections") return { data: connection, error: null };
          return { data: null, error: null };
        },
        async single() {
          if (table === "integration_providers" && operation === "insert") {
            provider = { id: PROVIDER_ID, provider_key: "google_ads", status: "active" };
            return { data: provider, error: null };
          }
          if (table === "integration_connections" && operation === "insert") {
            connection = {
              id: CONNECTION_ID,
              provider_id: PROVIDER_ID,
              owner_scope_type: "platform",
              environment: "production",
              lifecycle_status: "draft",
              secret_ref: null,
              metadata: payload.metadata as Record<string, unknown>,
            };
            return { data: connection, error: null };
          }
          if (table === "integration_connections" && operation === "update") {
            if (options.updateError) return { data: null, error: { code: "UPDATE_FAILED" } };
            if (!connection) return { data: null, error: { code: "CONNECTION_MISSING" } };
            connection = {
              ...connection,
              lifecycle_status: String(payload.lifecycle_status),
              secret_ref: String(payload.secret_ref),
              metadata: payload.metadata as Record<string, unknown>,
            };
            return { data: connection, error: null };
          }
          return { data: null, error: { code: "UNEXPECTED_QUERY" } };
        },
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (options.secretError) return { data: null, error: { code: "SECRET_STORE_FAILED" } };
      return { data: typeof args.p_secret_ref === "string" ? args.p_secret_ref : CREATED_SECRET_REF, error: null };
    },
  };

  return { client, writes, rpcCalls, get connection() { return connection; } };
}

function fakeResolverClient() {
  const filters: string[] = [];
  const builderFor = (table: string) => {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      neq(field: string, value: string) { filters.push(`${table}.${field}=${value}`); return builder; },
      async maybeSingle() {
        if (table === "integration_providers") return { data: { id: PROVIDER_ID, status: "active" }, error: null };
        return { data: { id: CONNECTION_ID, owner_scope_type: "platform", environment: "production", lifecycle_status: "ready", secret_ref: OLD_SECRET_REF }, error: null };
      },
    };
    return builder;
  };
  return {
    from(table: string) { return builderFor(table); },
    async rpc(name: string) {
      return { data: name === "integration_secret_resolve" ? "stored-refresh-token" : CREATED_SECRET_REF, error: null };
    },
    filters,
  };
}

test("operational resolver never falls back to the refresh token in ENV", async () => {
  const fake = fakeResolverClient();
  const config = await resolveGoogleAdsPlatformConfig(fake as never, {
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
    GOOGLE_ADS_CLIENT_ID: "client-id",
    GOOGLE_ADS_CLIENT_SECRET: "client-secret",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "1112223333",
    GOOGLE_ADS_RESEARCH_CUSTOMER_ID: "4445556666",
    GOOGLE_ADS_REFRESH_TOKEN: "env-refresh-token-must-not-win",
  } as never);
  assert.equal(config.refreshToken, "stored-refresh-token");
  assert.notEqual(config.refreshToken, "env-refresh-token-must-not-win");
  assert.deepEqual(fake.filters, ["integration_connections.lifecycle_status=revoked"]);
});

test("global Admin rotation updates the existing Secret Store reference, resets health and returns no token", async () => {
  const fake = fakeClient({
    connection: {
      id: CONNECTION_ID,
      provider_id: PROVIDER_ID,
      owner_scope_type: "platform",
      environment: "production",
      lifecycle_status: "ready",
      secret_ref: OLD_SECRET_REF,
      metadata: { label: "Google Ads", untouched: "preserve" },
    },
  });
  const logs: unknown[] = [];
  const previousInfo = console.info;
  console.info = (...args: unknown[]) => logs.push(args);
  try {
    const result = await rotatePlatformGoogleAdsRefreshToken(fake.client as never, ACTOR_ID, { refreshToken: NEW_TOKEN });
    assert.equal(result.tokenSaved, true);
    assert.equal(result.healthValidated, false);
    assert.equal(result.refreshTokenSource, "SECRET_STORE");
    assert.equal(result.lifecycleStatus, "pending");
    assert.doesNotMatch(JSON.stringify(result), /new-refresh-token|old-refresh-token/i);
    assert.equal(fake.rpcCalls[0]?.name, "integration_secret_store_upsert");
    assert.equal(fake.rpcCalls[0]?.args.p_secret_ref, OLD_SECRET_REF);
    assert.equal(fake.rpcCalls[0]?.args.p_secret, NEW_TOKEN);
    assert.equal(fake.rpcCalls[0]?.args.p_name, "google_ads_refresh_token");
    assert.equal(fake.connection?.secret_ref, OLD_SECRET_REF);
    assert.equal(fake.connection?.metadata.untouched, "preserve");
    assert.doesNotMatch(JSON.stringify(fake.connection?.metadata), /new-refresh-token|old-refresh-token/i);
    assert.doesNotMatch(JSON.stringify(logs), /new-refresh-token|old-refresh-token/i);
  } finally {
    console.info = previousInfo;
  }
});

test("primeira configuração cria o segredo nomeado sem referência anterior", async () => {
  const fake = fakeClient();
  const result = await rotatePlatformGoogleAdsRefreshToken(fake.client as never, ACTOR_ID, { refreshToken: NEW_TOKEN });
  assert.equal(result.tokenSaved, true);
  assert.equal(fake.rpcCalls[0]?.args.p_secret_ref, null);
  assert.equal(fake.connection?.secret_ref, CREATED_SECRET_REF);
});

test("falha ao atualizar a Connection preserva a referência antiga", async () => {
  const fake = fakeClient({
    updateError: true,
    connection: {
      id: CONNECTION_ID,
      provider_id: PROVIDER_ID,
      owner_scope_type: "platform",
      environment: "production",
      lifecycle_status: "ready",
      secret_ref: OLD_SECRET_REF,
      metadata: { label: "Google Ads" },
    },
  });
  await assert.rejects(
    rotatePlatformGoogleAdsRefreshToken(fake.client as never, ACTOR_ID, { refreshToken: NEW_TOKEN }),
    /referência.*OAuth Refresh Token/i,
  );
  assert.equal(fake.connection?.secret_ref, OLD_SECRET_REF);
  assert.equal(fake.rpcCalls[0]?.args.p_secret_ref, OLD_SECRET_REF);
});

test("falha no Secret Store não altera a Connection", async () => {
  const fake = fakeClient({
    secretError: true,
    connection: {
      id: CONNECTION_ID,
      provider_id: PROVIDER_ID,
      owner_scope_type: "platform",
      environment: "production",
      lifecycle_status: "ready",
      secret_ref: OLD_SECRET_REF,
      metadata: { label: "Google Ads" },
    },
  });
  await assert.rejects(
    rotatePlatformGoogleAdsRefreshToken(fake.client as never, ACTOR_ID, { refreshToken: NEW_TOKEN }),
    /Secret Store/i,
  );
  assert.equal(fake.connection?.secret_ref, OLD_SECRET_REF);
  assert.equal(fake.writes.filter((write) => write.operation === "update").length, 0);
});

test("a rota protege todas as operações com Admin global e não oferece mutação dos campos estáticos", async () => {
  const route = await readFile(new URL("../app/api/admin/integrations/route.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../modules/admin/platform-integrations-panel.tsx", import.meta.url), "utf8");
  assert.match(route, /requireCanonicalPlatformAdmin/);
  assert.match(route, /rotate_google_ads_refresh_token/);
  assert.match(panel, /OAuth Refresh Token/);
  assert.match(panel, /type="password"/);
  assert.match(panel, /Atualizar token/);
  assert.match(panel, /developerTokenConfigured/);
  assert.doesNotMatch(panel, /GOOGLE_ADS_(?:DEVELOPER_TOKEN|CLIENT_ID|CLIENT_SECRET|LOGIN_CUSTOMER_ID|RESEARCH_CUSTOMER_ID)\s*=/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});
