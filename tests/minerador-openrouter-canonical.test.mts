import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveOpenRouterCanonicalConfig, OpenRouterCanonicalError } from "../lib/minerador/openrouter-canonical.ts";
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

const ACTOR = "10000000-0000-4000-8000-000000000101";
const AGENCY = "10000000-0000-4000-8000-000000000102";
const BRAND = "10000000-0000-4000-8000-000000000103";
const CAPABILITY = "10000000-0000-4000-8000-000000000104";
const PROVIDER = "10000000-0000-4000-8000-000000000105";
const CONNECTION = "10000000-0000-4000-8000-000000000106";
const GRANT = "10000000-0000-4000-8000-000000000107";
const BINDING = "10000000-0000-4000-8000-000000000108";
const QUOTA = "10000000-0000-4000-8000-000000000109";

const capability: IntegrationCapabilityRow = { id: CAPABILITY, capability_key: "ai_generation", operation_kind: "ai_generation", environment: "test", unit_name: "request", status: "active" };
const grant: IntegrationGrantRow = { id: GRANT, capability_id: CAPABILITY, target_scope_type: "brand", target_agency_id: null, target_brand_id: BRAND, source_scope_type: "platform", source_agency_id: null, environment: "test", lifecycle_status: "active", starts_at: "2026-01-01T00:00:00.000Z", ends_at: null };
const binding: IntegrationBindingRow = { id: BINDING, capability_id: CAPABILITY, target_scope_type: "brand", target_agency_id: null, target_brand_id: BRAND, environment: "test", source_kind: "platform_granted", connection_id: CONNECTION, grant_id: GRANT, external_account_ref: null, lifecycle_status: "active" };
const connection: IntegrationConnectionRow = { id: CONNECTION, provider_id: PROVIDER, owner_scope_type: "platform", owner_agency_id: null, owner_brand_id: null, environment: "test", lifecycle_status: "ready", secret_ref: "secret/openrouter" };
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

function dependencies(providerKey = "openrouter"): IntegrationRuntimeDependencies {
  const repository: IntegrationRuntimeRepository = {
    findCapability: async () => capability,
    findActiveGrants: async () => [grant],
    findActiveBindings: async () => [binding],
    findConnection: async () => connection,
    findProvider: async () => ({ id: PROVIDER, provider_key: providerKey, status: "active" as const }),
    findProviderByKey: async () => ({ id: PROVIDER, provider_key: providerKey, status: "active" as const }),
    findPlatformConnections: async ({ providerKey: requestedProvider, environment }) => requestedProvider === providerKey ? [{ connection: { ...connection, environment }, provider: { id: PROVIDER, provider_key: providerKey, status: "active" as const } }] : [],
    findActiveQuotaPolicies: async () => [quota],
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
            ? { data: { id: CONNECTION, secret_ref: "secret/openrouter", metadata: { openrouter_model: "persisted/model" } }, error: null }
            : { data: null, error: null };
        },
      };
      return builder;
    },
  } as never;
}

test("Minerador OpenRouter resolve somente Connection READY e segredo da Connection", async () => {
  const result = await resolveOpenRouterCanonicalConfig({
    actorUserId: ACTOR,
    agencyId: AGENCY,
    brandId: BRAND,
    environment: "test",
    client: client(),
    runtimeDependencies: dependencies(),
    secretStore: { resolve: async () => JSON.stringify({ OPENROUTER_API_KEY: "connection-secret" }), store: async () => "unused" },
    technicalEnvironment: { NODE_ENV: "test", OPENROUTER_MODEL: "legacy/model" },
  });
  assert.equal(result.resource.brandId, BRAND);
  assert.equal(result.resource.connection.providerKey, "openrouter");
  assert.equal(result.credentialSource, "connection");
  assert.equal(result.model, "persisted/model");
  assert.equal(result.apiKey, "connection-secret");
});

test("OpenRouter blocks the canonical consumer when no operational model is persisted", async () => {
  const noModelClient = {
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        async maybeSingle() {
          return table === "integration_connections"
            ? { data: { id: CONNECTION, secret_ref: "secret/openrouter", metadata: {} }, error: null }
            : { data: null, error: null };
        },
      };
      return builder;
    },
  } as never;
  await assert.rejects(
    () => resolveOpenRouterCanonicalConfig({ actorUserId: ACTOR, agencyId: AGENCY, brandId: BRAND, environment: "test", client: noModelClient, runtimeDependencies: dependencies(), secretStore: { resolve: async () => JSON.stringify({ OPENROUTER_API_KEY: "connection-secret" }), store: async () => "unused" }, technicalEnvironment: { NODE_ENV: "test", OPENROUTER_MODEL: "legacy/model" } }),
    (error: unknown) => error instanceof OpenRouterCanonicalError && error.code === "OPENROUTER_MODEL_NOT_CONFIGURED",
  );
});

test("OpenRouter reports its global resource as unavailable without fallback", async () => {
  await assert.rejects(
    () => resolveOpenRouterCanonicalConfig({ actorUserId: ACTOR, agencyId: AGENCY, brandId: BRAND, environment: "test", client: client(), runtimeDependencies: dependencies("google_ads"), secretStore: { resolve: async () => "{}", store: async () => "unused" } }),
    (error: unknown) => error instanceof IntegrationRuntimeError && error.code === "INTEGRATION_CONNECTION_MISSING",
  );
});

test("rota de IA não usa AI_PROVIDER nem credencial OpenRouter do ambiente", async () => {
  const route = await readFile(new URL("../app/api/process-intent-niche/route.ts", import.meta.url), "utf8");
  assert.match(route, /resolveOpenRouterCanonicalConfig/);
  assert.doesNotMatch(route, /resolveAIProvider/);
  assert.doesNotMatch(route, /process\.env\.OPENROUTER_API_KEY/);
});
