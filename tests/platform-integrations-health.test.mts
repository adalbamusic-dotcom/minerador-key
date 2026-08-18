import assert from "node:assert/strict";
import test from "node:test";
import {
  healthCheckPlatformIntegrationConnection,
} from "../lib/server/platform-integrations-admin.ts";
import { runPlatformProviderHealthProbe } from "../lib/server/platform-integrations-health.ts";

const SECRET = "never-return-this-secret";
const CONNECTION_ID = "10000000-0000-4000-8000-000000000001";
const PROVIDER_ID = "10000000-0000-4000-8000-000000000002";
const GOOGLE_ENV = {
  GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
  GOOGLE_ADS_CLIENT_ID: "client-id",
  GOOGLE_ADS_CLIENT_SECRET: "client-secret",
  GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: "1234567890",
  GOOGLE_ADS_RESEARCH_CUSTOMER_ID: "9876543210",
};

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function withGoogleEnv<T>(callback: () => Promise<T>) {
  const previous = { ...process.env };
  Object.assign(process.env, GOOGLE_ENV);
  try {
    return await callback();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}

function fakeAdminClient(secretPayload: string, providerKey: string, fetchImpl: typeof fetch) {
  const updates: Array<Record<string, unknown>> = [];
  let currentMetadata: Record<string, unknown> = { label: "Global", ...(providerKey === "google_ads" ? { google_ads: { manager_customer_id: "1234567890" } } : {}) };
  let lifecycleStatus = "pending";
  const client = {
    rpc: async () => ({ data: secretPayload, error: null }),
    from(table: string) {
      let mode: "select" | "update" = "select";
      let updatePayload: Record<string, unknown> = {};
      const builder = {
        select() { return builder; },
        update(payload: Record<string, unknown>) { mode = "update"; updatePayload = payload; return builder; },
        eq() { return builder; },
        async maybeSingle() {
          if (table === "integration_connections") return { data: { id: CONNECTION_ID, provider_id: PROVIDER_ID, owner_scope_type: "platform", environment: "production", lifecycle_status: lifecycleStatus, secret_ref: "10000000-0000-4000-8000-000000000003", metadata: currentMetadata }, error: null };
          return { data: { id: PROVIDER_ID, provider_key: providerKey, status: "active" }, error: null };
        },
        async single() {
          updates.push(updatePayload);
          lifecycleStatus = String(updatePayload.lifecycle_status);
          currentMetadata = updatePayload.metadata as Record<string, unknown>;
          return { data: { id: CONNECTION_ID, provider_id: PROVIDER_ID, owner_scope_type: "platform", environment: "production", lifecycle_status: lifecycleStatus, metadata: currentMetadata, secret_ref: "10000000-0000-4000-8000-000000000003" }, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          if (mode === "update") {
            updates.push(updatePayload);
            lifecycleStatus = String(updatePayload.lifecycle_status);
            currentMetadata = updatePayload.metadata as Record<string, unknown>;
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client, updates, get lifecycleStatus() { return lifecycleStatus; }, fetchImpl };
}

test("Google Ads probe uses only platform env and validates MCC plus Research Customer through accessible customers", async () => {
  const calls: string[] = [];
  const result = await withGoogleEnv(() => runPlatformProviderHealthProbe({
    providerKey: "google_ads",
    fetchImpl: async (url, init) => {
        calls.push(String(url));
        if (String(url).includes("oauth2.googleapis.com")) return response({ access_token: "access-token", expires_in: 3600 });
        assert.equal(init?.method, "GET");
        assert.match(String((init?.headers as Record<string, string>)?.authorization), /^Bearer /);
        return response({ resourceNames: ["customers/1234567890", "customers/9876543210"] }, 200, { "request-id": "google-request" });
      },
  }));
  assert.equal(result.providerKey, "google_ads");
  assert.equal(result.details.stage, "api_request");
  assert.equal(result.providerRequestRef, "google-request");
  assert.deepEqual(calls.map((url) => new URL(url).hostname), ["oauth2.googleapis.com", "googleads.googleapis.com"]);
  assert.doesNotMatch(JSON.stringify(result), /access-token|client-secret|refresh-token/i);
});

test("DataForSEO probe makes one minimal mocked request and sanitizes failures", async () => {
  let calls = 0;
  const result = await runPlatformProviderHealthProbe({
    providerKey: "dataforseo",
    secretPayload: JSON.stringify({ DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "password" }),
    fetchImpl: async (_url, init) => {
      calls += 1;
      assert.equal(init?.method, "POST");
      return response({ tasks: [{ id: "dfs-request", status_code: 20000, cost: 0.001, result: [{ keyword: 'allintitle:"minerador key health check"', location_code: 2076, language_code: "pt", datetime: "2026-08-15T12:00:00Z", se_results_count: 1 }] }] });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.providerRequestRef, "dfs-request");
  assert.equal(result.costAmount, 0.001);
  await assert.rejects(
    runPlatformProviderHealthProbe({ providerKey: "dataforseo", secretPayload: JSON.stringify({ DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "password" }), fetchImpl: async () => response({ error: "password" }, 401) }),
    (error: unknown) => error instanceof Error && !error.message.includes("password"),
  );
});

test("OpenRouter connection health authenticates against the user models endpoint without requiring chat completion", async () => {
  const result = await runPlatformProviderHealthProbe({
    providerKey: "openrouter",
    secretPayload: JSON.stringify({ OPENROUTER_API_KEY: SECRET }),
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://openrouter.ai/api/v1/models/user");
      assert.equal(init?.method, "GET");
      assert.equal((init?.headers as Record<string, string>).authorization, `Bearer ${SECRET}`);
      return response({ data: [{ id: "deepseek/deepseek-v4-flash-0731" }] }, 200, { "x-request-id": "openrouter-request" });
    },
  });
  assert.equal(result.currentModel, "deepseek/deepseek-v4-flash-0731");
  assert.equal(result.currentModelAvailable, true);
  assert.equal(result.providerRequestRef, "openrouter-request");
  await assert.rejects(
    runPlatformProviderHealthProbe({ providerKey: "openrouter", secretPayload: JSON.stringify({ OPENROUTER_API_KEY: SECRET }), fetchImpl: async () => response({ error: SECRET }, 401) }),
    (error: unknown) => error instanceof Error && !error.message.includes(SECRET),
  );
});

test("OpenRouter remains READY when the separately configured model is unavailable", async () => {
  const result = await runPlatformProviderHealthProbe({
    providerKey: "openrouter",
    secretPayload: JSON.stringify({ OPENROUTER_API_KEY: SECRET }),
    fetchImpl: async () => response({ data: [{ id: "another/provider-model" }] }),
  });
  assert.equal(result.currentModel, "deepseek/deepseek-v4-flash-0731");
  assert.equal(result.currentModelAvailable, false);
});

test("Google Ads health exposes only safe stage, HTTP status, provider code and request id", async () => {
  await withGoogleEnv(() => assert.rejects(
    runPlatformProviderHealthProbe({
      providerKey: "google_ads",
      fetchImpl: async (url) => String(url).includes("oauth2.googleapis.com")
        ? response({ access_token: "access-token", expires_in: 3600 })
        : response({ error: { status: "PERMISSION_DENIED" } }, 403, { "google-ads-request-id": "google-error-request" }),
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "GOOGLE_ADS_LOGIN_CUSTOMER_NOT_ACCESSIBLE");
      assert.equal((error as { providerRequestRef?: string | null }).providerRequestRef, "google-error-request");
      assert.deepEqual((error as { diagnostics?: unknown }).diagnostics, { stage: "login_customer", httpStatus: "403", googleAdsCode: "google_ads_account_not_authorized", googleAdsField: null });
      return true;
    },
  ));
});

test("global health check promotes pending to ready without grant, binding or quota", async () => {
  const fake = fakeAdminClient(JSON.stringify({ OPENROUTER_API_KEY: SECRET }), "openrouter", async () => response({ data: [{ id: "deepseek/deepseek-v4-flash-0731" }] }));
  const adminClient = fake.client as unknown as Parameters<typeof healthCheckPlatformIntegrationConnection>[0];
  const result = await healthCheckPlatformIntegrationConnection(adminClient, { connectionId: CONNECTION_ID, providerKey: "openrouter", fetchImpl: fake.fetchImpl });
  assert.equal(result.lifecycleStatus, "ready");
  assert.equal(fake.lifecycleStatus, "ready");
  assert.equal((fake.updates.at(-1)?.lifecycle_status), "ready");
  assert.match(JSON.stringify(fake.updates.at(-1)), /checked_at/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET));
});

test("Google Ads global health uses platform env without reading or writing an integration connection", async () => {
  const result = await withGoogleEnv(() => healthCheckPlatformIntegrationConnection({ from() { throw new Error("Google Ads health must not access the database"); } } as never, {
    connectionId: "google_ads_platform_env",
    providerKey: "google_ads",
    fetchImpl: async (url) => String(url).includes("oauth2.googleapis.com")
      ? response({ access_token: "access-token", expires_in: 3600 })
      : response({ resourceNames: ["customers/1234567890", "customers/9876543210"] }, 200, { "request-id": "google-request" }),
  }));
  assert.equal(result.lifecycleStatus, "ready");
  assert.equal(result.source, "PLATFORM_ENV");
  assert.equal(result.providerRequestRef, "google-request");
  assert.doesNotMatch(JSON.stringify(result), /developer-token|client-secret|refresh-token/i);
});

test("failed global health check marks error and never returns ready or a secret", async () => {
  const fake = fakeAdminClient(JSON.stringify({ OPENROUTER_API_KEY: SECRET }), "openrouter", async () => response({ error: "unauthorized" }, 401));
  const adminClient = fake.client as unknown as Parameters<typeof healthCheckPlatformIntegrationConnection>[0];
  await assert.rejects(
    healthCheckPlatformIntegrationConnection(adminClient, { connectionId: CONNECTION_ID, providerKey: "openrouter", fetchImpl: fake.fetchImpl }),
    (error: unknown) => error instanceof Error && !error.message.includes(SECRET),
  );
  assert.equal(fake.lifecycleStatus, "error");
  assert.equal((fake.updates.at(-1)?.lifecycle_status), "error");
  assert.doesNotMatch(JSON.stringify(fake.updates.at(-1)), new RegExp(SECRET));
});
