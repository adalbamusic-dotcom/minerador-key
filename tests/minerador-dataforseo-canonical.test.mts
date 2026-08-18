import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  resolveDataForSeoCanonicalConfig,
  resolveDataForSeoIntegrationEnvironment,
  DataForSeoCanonicalError,
} from "../lib/minerador/dataforseo-canonical.ts";
import { IntegrationRuntimeError } from "../lib/server/integrations-runtime.ts";
import type { CanonicalAuthorizationRepository } from "../lib/tenant/canonical-authorization.ts";
import type {
  IntegrationBindingRow,
  IntegrationCapabilityRow,
  IntegrationConnectionRow,
  IntegrationGrantRow,
  IntegrationQuotaPolicyRow,
  IntegrationRuntimeDependencies,
  IntegrationRuntimeRepository,
} from "../lib/server/integrations-runtime.ts";

const ACTOR = "10000000-0000-4000-8000-000000000001";
const AGENCY = "10000000-0000-4000-8000-000000000002";
const BRAND = "10000000-0000-4000-8000-000000000003";
const CAPABILITY = "10000000-0000-4000-8000-000000000004";
const PROVIDER = "10000000-0000-4000-8000-000000000005";
const CONNECTION = "10000000-0000-4000-8000-000000000006";
const GRANT = "10000000-0000-4000-8000-000000000007";
const BINDING = "10000000-0000-4000-8000-000000000008";
const QUOTA = "10000000-0000-4000-8000-000000000009";

const capability: IntegrationCapabilityRow = { id: CAPABILITY, capability_key: "dataforseo.allintitle", operation_kind: "allintitle", environment: "test", unit_name: "request", status: "active" };
const grant: IntegrationGrantRow = { id: GRANT, capability_id: CAPABILITY, target_scope_type: "brand", target_agency_id: null, target_brand_id: BRAND, source_scope_type: "platform", source_agency_id: null, environment: "test", lifecycle_status: "active", starts_at: "2026-01-01T00:00:00.000Z", ends_at: null };
const binding: IntegrationBindingRow = { id: BINDING, capability_id: CAPABILITY, target_scope_type: "brand", target_agency_id: null, target_brand_id: BRAND, environment: "test", source_kind: "platform_granted", connection_id: CONNECTION, grant_id: GRANT, external_account_ref: null, lifecycle_status: "active" };
const connection: IntegrationConnectionRow = { id: CONNECTION, provider_id: PROVIDER, owner_scope_type: "platform", owner_agency_id: null, owner_brand_id: null, environment: "test", lifecycle_status: "ready", secret_ref: "secret/dataforseo" };
const quota: IntegrationQuotaPolicyRow = { id: QUOTA, capability_id: CAPABILITY, scope_type: "brand", agency_id: null, brand_id: BRAND, environment: "test", window_kind: "none", limit_units: null, status: "active", period_started_at: null, period_ends_at: null };

function authRepository(): CanonicalAuthorizationRepository {
  return {
    getGlobalRole: async () => null,
    findBrandById: async (brandId) => brandId === BRAND ? { id: BRAND, name: "Adalba", status: "active", ownerUserId: ACTOR } : null,
    findBrandMembership: async () => null,
    findAgencyById: async (agencyId) => agencyId === AGENCY ? { id: AGENCY, name: "AdalbaPro", status: "active", ownerUserId: ACTOR } : null,
    findAgencyMembership: async () => null,
    findActiveAgencyIdsByBrandId: async () => [AGENCY],
  };
}

function dependencies(overrides: Partial<{ grants: IntegrationGrantRow[]; bindings: IntegrationBindingRow[]; connections: IntegrationConnectionRow[]; quotas: IntegrationQuotaPolicyRow[]; providerKey: string }> = {}): IntegrationRuntimeDependencies {
  const grants = overrides.grants || [grant];
  const bindings = overrides.bindings || [binding];
  const connections = overrides.connections || [connection];
  const quotas = overrides.quotas || [quota];
  const repository: IntegrationRuntimeRepository = {
    findCapability: async () => capability,
    findActiveGrants: async () => grants,
    findActiveBindings: async () => bindings,
    findConnection: async (id) => connections.find((row) => row.id === id) || null,
    findProvider: async () => ({ id: PROVIDER, provider_key: overrides.providerKey || "dataforseo", status: "active" as const }),
    findProviderByKey: async () => ({ id: PROVIDER, provider_key: overrides.providerKey || "dataforseo", status: "active" as const }),
    findPlatformConnections: async ({ providerKey, environment }) => providerKey === (overrides.providerKey || "dataforseo") ? connections.filter((row) => row.environment === environment).map((row) => ({ connection: row, provider: { id: PROVIDER, provider_key: providerKey, status: "active" as const } })) : [],
    findActiveQuotaPolicies: async () => quotas,
    sumSucceededUsage: async () => 0,
    findUsageByIdempotency: async () => null,
    findInfrastructureUsageByIdempotency: async () => null,
    insertUsage: async () => { throw new Error("not used"); },
  };
  return { repository, authorizationRepository: authRepository(), now: () => new Date("2026-08-15T12:00:00.000Z") };
}

function client() {
  return {
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        async maybeSingle() {
          return table === "integration_connections"
            ? { data: { id: CONNECTION, provider_id: PROVIDER, secret_ref: "secret/dataforseo" }, error: null }
            : { data: null, error: null };
        },
      };
      return builder;
    },
  } as never;
}

test("resolve DataForSEO uses the canonical Brand/Agency resource and Vault secret", async () => {
  let resolvedRef = "";
  const result = await resolveDataForSeoCanonicalConfig({
    actorUserId: ACTOR,
    agencyId: AGENCY,
    brandId: BRAND,
    environment: "test",
    client: client(),
    runtimeDependencies: dependencies(),
    secretStore: { resolve: async (secretRef) => { resolvedRef = secretRef; return JSON.stringify({ DATAFORSEO_LOGIN: "vault-login", DATAFORSEO_PASSWORD: "vault-password" }); }, store: async () => "unused" },
    technicalEnvironment: { NODE_ENV: "test", DATAFORSEO_LOCATION_CODE: "2076", DATAFORSEO_LANGUAGE_CODE: "pt", DATAFORSEO_TIMEOUT_MS: "30000" },
  });
  assert.equal(result.credentialSource, "connection");
  assert.equal(result.resource.actorUserId, ACTOR);
  assert.equal(result.resource.agencyId, AGENCY);
  assert.equal(result.resource.brandId, BRAND);
  assert.equal(result.resource.connection.connectionId, CONNECTION);
  assert.equal(resolvedRef, "secret/dataforseo");
  assert.equal(result.config.login, "vault-login");
  assert.equal(result.config.password, "vault-password");
  assert.doesNotMatch(JSON.stringify(result.resource), /vault-(?:login|password)/);
});

test("canonical DataForSEO rejects missing Vault secret without env fallback", async () => {
  await assert.rejects(
    () => resolveDataForSeoCanonicalConfig({ actorUserId: ACTOR, agencyId: AGENCY, brandId: BRAND, environment: "test", client: client(), runtimeDependencies: dependencies(), secretStore: { resolve: async () => null, store: async () => "unused" } }),
    (error: unknown) => error instanceof DataForSeoCanonicalError && error.code === "DATAFORSEO_SECRET_NOT_FOUND",
  );
});

test("canonical DataForSEO reports the resource provider as unavailable without fallback", async () => {
  await assert.rejects(
    () => resolveDataForSeoCanonicalConfig({ actorUserId: ACTOR, agencyId: AGENCY, brandId: BRAND, environment: "test", client: client(), runtimeDependencies: dependencies({ providerKey: "openrouter" }), secretStore: { resolve: async () => "{}", store: async () => "unused" } }),
    (error: unknown) => error instanceof IntegrationRuntimeError && error.code === "INTEGRATION_CONNECTION_MISSING",
  );
});

test("DataForSEO keeps its canonical capability and resolves the shared catalog environment", () => {
  assert.equal(resolveDataForSeoIntegrationEnvironment({ NODE_ENV: "development" }), "production");
  assert.equal(resolveDataForSeoIntegrationEnvironment({ NODE_ENV: "development", DATAFORSEO_INTEGRATION_ENVIRONMENT: "test" }), "test");
});

test("Minerador DataForSEO route no longer reads credential env directly", async () => {
  const source = await readFile(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
  assert.match(source, /resolveDataForSeoCanonicalConfig/);
  assert.doesNotMatch(source, /readDataForSeoSerpConfig/);
  assert.doesNotMatch(source, /process\.env\.DATAFORSEO_(?:LOGIN|PASSWORD)/);
});
