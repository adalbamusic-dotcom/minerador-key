import assert from "node:assert/strict";
import test from "node:test";
import {
  DeepSeekCanonicalError,
  DEEPSEEK_API_URL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  readDeepSeekModel,
  readDeepSeekThinkingMode,
  resolveDeepSeekCanonicalConfig,
} from "../lib/server/deepseek-canonical.ts";
import { IntegrationRuntimeError } from "../lib/server/integrations-runtime.ts";
import type { CanonicalAuthorizationRepository } from "../lib/tenant/canonical-authorization.ts";
import type {
  IntegrationCapabilityRow,
  IntegrationConnectionRow,
  IntegrationGrantRow,
  IntegrationBindingRow,
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
const connection: IntegrationConnectionRow = { id: CONNECTION, provider_id: PROVIDER, owner_scope_type: "platform", owner_agency_id: null, owner_brand_id: null, environment: "test", lifecycle_status: "ready", secret_ref: "secret/deepseek" };
const quota: IntegrationQuotaPolicyRow = { id: QUOTA, capability_id: CAPABILITY, scope_type: "brand", agency_id: null, brand_id: BRAND, environment: "test", window_kind: "none", limit_units: null, status: "active", period_started_at: null, period_ends_at: null };

function authorizationRepository(): CanonicalAuthorizationRepository {
  return {
    getGlobalRole: async () => null,
    findBrandById: async (brandId) => brandId === BRAND ? { id: BRAND, name: "Adalba", status: "active", ownerUserId: ACTOR } : null,
    findBrandMembership: async () => null,
    findAgencyById: async (agencyId) => agencyId === AGENCY ? { id: AGENCY, name: "AdalbaPro", status: "active", ownerUserId: ACTOR } : null,
    findAgencyMembership: async () => null,
    findActiveAgencyIdsByBrandId: async () => [AGENCY],
  };
}

function dependencies(options: { providerKey?: string; connectionPresent?: boolean } = {}): IntegrationRuntimeDependencies {
  const providerKey = options.providerKey || "deepseek";
  const repository: IntegrationRuntimeRepository = {
    findCapability: async () => capability,
    findActiveGrants: async () => [grant],
    findActiveBindings: async () => [binding],
    findConnection: async () => connection,
    findProvider: async () => ({ id: PROVIDER, provider_key: providerKey, status: "active" as const }),
    findProviderByKey: async () => ({ id: PROVIDER, provider_key: providerKey, status: "active" as const }),
    findPlatformConnections: async ({ providerKey: requestedProvider, environment }) => options.connectionPresent === false || requestedProvider !== providerKey ? [] : [{ connection: { ...connection, environment }, provider: { id: PROVIDER, provider_key: providerKey, status: "active" as const } }],
    findActiveQuotaPolicies: async () => [quota],
    sumSucceededUsage: async () => 0,
    findUsageByIdempotency: async () => null,
    findInfrastructureUsageByIdempotency: async () => null,
    insertUsage: async () => { throw new Error("not used"); },
  };
  return { repository, authorizationRepository: authorizationRepository(), now: () => new Date("2026-08-15T12:00:00.000Z") };
}

function client(metadata: unknown = { deepseek_model: DEEPSEEK_DEFAULT_MODEL, operations: { ai_generation: { thinking_mode: "disabled" } } }) {
  return {
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        async maybeSingle() {
          return table === "integration_connections" ? { data: { id: CONNECTION, secret_ref: "secret/deepseek", metadata }, error: null } : { data: null, error: null };
        },
      };
      return builder;
    },
  } as never;
}

test("DeepSeek canônico exige Connection, capability, secret server-side e modelo permitido", async () => {
  const result = await resolveDeepSeekCanonicalConfig({
    actorUserId: ACTOR,
    agencyId: AGENCY,
    brandId: BRAND,
    environment: "test",
    client: client(),
    runtimeDependencies: dependencies(),
    secretStore: { resolve: async () => JSON.stringify({ DEEPSEEK_API_KEY: "connection-secret" }), store: async () => "unused" },
    technicalEnvironment: { NODE_ENV: "test", DEEPSEEK_API_KEY: "must-not-be-used" },
  });
  assert.equal(result.provider, "deepseek");
  assert.equal(result.apiUrl, DEEPSEEK_API_URL);
  assert.equal(result.baseUrl, DEEPSEEK_BASE_URL);
  assert.equal(result.model, DEEPSEEK_DEFAULT_MODEL);
  assert.equal(result.responseFormatMode, "json_object");
  assert.equal(result.jsonObjectCapability, "supported");
  assert.equal(result.thinkingMode, "disabled");
  assert.equal(result.credentialSource, "connection");
  assert.equal(result.apiKey, "connection-secret");
  assert.equal(result.resource.connection.providerKey, "deepseek");
});

test("modelo e thinking são lidos por operação e não por política global", () => {
  assert.equal(readDeepSeekModel({ deepseek_model: "deepseek-v4-flash" }), "deepseek-v4-flash");
  assert.equal(readDeepSeekThinkingMode({ operations: { ai_generation: { thinking_mode: "enabled" } } }), "enabled");
  assert.equal(readDeepSeekThinkingMode({}), "provider_default");
  assert.throws(() => readDeepSeekModel({ deepseek_model: "openrouter/model" }), (error: unknown) => error instanceof DeepSeekCanonicalError && error.code === "DEEPSEEK_MODEL_NOT_ALLOWED");
});

test("ausência de Connection DeepSeek falha explicitamente sem procurar outro provider", async () => {
  await assert.rejects(
    resolveDeepSeekCanonicalConfig({ actorUserId: ACTOR, agencyId: AGENCY, brandId: BRAND, environment: "test", client: client(), runtimeDependencies: dependencies({ connectionPresent: false }), secretStore: { resolve: async () => JSON.stringify({ DEEPSEEK_API_KEY: "unused" }), store: async () => "unused" } }),
    (error: unknown) => error instanceof IntegrationRuntimeError && error.code === "INTEGRATION_CONNECTION_MISSING",
  );
});

test("provider diferente de DeepSeek não satisfaz o resource canônico de IA", async () => {
  await assert.rejects(
    resolveDeepSeekCanonicalConfig({ actorUserId: ACTOR, agencyId: AGENCY, brandId: BRAND, environment: "test", client: client(), runtimeDependencies: dependencies({ providerKey: "google_ads" }), secretStore: { resolve: async () => JSON.stringify({ DEEPSEEK_API_KEY: "unused" }), store: async () => "unused" } }),
    (error: unknown) => error instanceof IntegrationRuntimeError && error.code === "INTEGRATION_CONNECTION_MISSING",
  );
});
