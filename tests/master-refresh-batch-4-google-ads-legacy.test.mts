import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPlatformIntegrationConnection,
  grantPlatformIntegrationToAgency,
} from "../lib/server/platform-integrations-admin.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

function readOnlyClient(rows: Record<string, unknown>) {
  const touched: string[] = [];
  const writes: string[] = [];
  const client = {
    from(table: string) {
      touched.push(table);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        insert() { writes.push(`${table}:insert`); throw new Error("write must not be reached"); },
        update() { writes.push(`${table}:update`); throw new Error("write must not be reached"); },
        delete() { writes.push(`${table}:delete`); throw new Error("write must not be reached"); },
      };
      return chain;
    },
  };
  return { client: client as never, touched, writes };
}

test("Google Ads Connection writer rejects before touching integration_connections", async () => {
  const providerId = "10000000-0000-4000-8000-000000000401";
  const fixture = readOnlyClient({
    integration_providers: { id: providerId, provider_key: "google_ads", status: "active" },
  });
  await assert.rejects(
    () => createPlatformIntegrationConnection(fixture.client, "10000000-0000-4000-8000-000000000499", { providerId, environment: "production", label: "legacy" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY",
  );
  assert.deepEqual(fixture.touched, ["integration_providers"]);
  assert.deepEqual(fixture.writes, []);
});

test("Google Ads grant/binding writer rejects before materialization", async () => {
  const capabilityId = "10000000-0000-4000-8000-000000000402";
  const connectionId = "10000000-0000-4000-8000-000000000403";
  const agencyId = "10000000-0000-4000-8000-000000000404";
  const fixture = readOnlyClient({
    integration_capabilities: { id: capabilityId, capability_key: "google_ads_keyword_metrics", operation_kind: "keyword_metrics", environment: "production", status: "active" },
    integration_connections: { id: connectionId, provider_id: "10000000-0000-4000-8000-000000000405", owner_scope_type: "platform", owner_agency_id: null, owner_brand_id: null, environment: "production", lifecycle_status: "ready", secret_ref: "legacy/google" },
    agencies: { id: agencyId, name: "Homologação", status: "active" },
  });
  await assert.rejects(
    () => grantPlatformIntegrationToAgency(fixture.client, "10000000-0000-4000-8000-000000000499", { capabilityId, connectionId, agencyId, environment: "production" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY",
  );
  assert.deepEqual(new Set(fixture.touched), new Set(["integration_capabilities", "integration_connections", "agencies"]));
  assert.deepEqual(fixture.writes, []);
});

test("generic admin writers fail closed for the PLATFORM_ENV Google Ads provider", async () => {
  const source = await read("lib/server/platform-integrations-admin.ts");
  const createWriter = source.slice(source.indexOf("export async function createPlatformIntegrationConnection"), source.indexOf("export async function grantPlatformIntegrationToAgency"));
  const grantWriter = source.slice(source.indexOf("export async function grantPlatformIntegrationToAgency"), source.indexOf("async function ensurePlatformQuota"));
  assert.match(createWriter, /select\("id,provider_key,status"\)/);
  assert.match(createWriter, /provider_key === "google_ads"/);
  assert.match(createWriter, /GOOGLE_ADS_PLATFORM_ENV_READ_ONLY/);
  assert.match(grantWriter, /providerKeyForPlatformCapability\(capability\.capability_key\) === "google_ads"/);
  assert.match(grantWriter, /GOOGLE_ADS_PLATFORM_ENV_READ_ONLY/);
});

test("homologation writer excludes Google Ads while technical catalog stays available", async () => {
  const source = await read("lib/server/platform-integrations-admin.ts");
  assert.match(source, /capabilityKey: "google_ads_keyword_discovery"/);
  assert.match(source, /capabilityKey: "google_ads_keyword_metrics"/);
  assert.match(source, /mappedCapabilities\.filter\(\(item\).*item\.providerKey !== "google_ads"/);
  assert.match(source, /googleAdsPersistedDistribution: "excluded_platform_env_only"/);
});

test("Batch 4 migration removes only dynamic legacy and preserves catalog and Usage", async () => {
  const migration = await read("supabase/migrations/20260818000454_master_refresh_batch_4_google_ads_legacy_removal.sql");
  for (const object of ["minerador_google_ads_connections", "google_ads_binding_targeting", "google_ads_binding_account_state"]) {
    assert.match(migration, new RegExp(`DROP TABLE public\\.${object}`));
  }
  assert.match(migration, /DROP FUNCTION public\.google_ads_binding_configuration_validate\(\)/);
  assert.match(migration, /DELETE FROM public\.integration_bindings/);
  assert.match(migration, /DELETE FROM public\.integration_grants/);
  assert.match(migration, /DELETE FROM public\.integration_quota_policies/);
  assert.match(migration, /lifecycle_status = 'revoked'/);
  assert.doesNotMatch(migration, /DELETE FROM public\.integration_usage_events/);
  assert.doesNotMatch(migration, /DELETE FROM public\.integration_connections/);
  assert.doesNotMatch(migration, /DROP TABLE public\.integration_/);
});

test("bound verifier preserves Google history plus DataForSEO and OpenRouter", async () => {
  const verifier = await read("supabase/scripts/master-refresh-batch-4-google-ads-legacy-post-verifier-bound-read-only.sql");
  assert.match(verifier, /usage_fp_preserved/);
  assert.match(verifier, /historical_connection_payload_preserved/);
  assert.match(verifier, /dataforseo_connection_preserved/);
  assert.match(verifier, /openrouter_connection_preserved/);
  assert.match(verifier, /GOOGLE_ADS_DYNAMIC_CONNECTION_LEGACY_NOT_ZERO/);
});
