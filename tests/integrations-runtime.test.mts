import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalAuthorizationRepository } from "../lib/tenant/canonical-authorization.ts";
import {
  IntegrationRuntimeError,
  recordGoogleAdsInfrastructureUsage,
  recordIntegrationUsageForResource,
  resolveGoogleAdsInfrastructureUsageForActor,
  resolveIntegrationEnvironment,
  resolveIntegrationResourceForActor,
  type IntegrationCapabilityRow,
  type IntegrationConnectionRow,
  type IntegrationRuntimeDependencies,
  type IntegrationRuntimeRepository,
  type IntegrationUsageEvent,
} from "../lib/server/integrations-runtime.ts";

const ACTOR_A = "10000000-0000-4000-8000-0000000000a1";
const ACTOR_B = "10000000-0000-4000-8000-0000000000b1";
const BRAND_A = "10000000-0000-4000-8000-0000000000a2";
const AGENCY_A = "10000000-0000-4000-8000-0000000000a3";
const PROVIDER = "00000000-0000-0000-0000-0000000000d1";
const PLATFORM_CONNECTION = "00000000-0000-0000-0000-0000000000e1";
const PLATFORM_CONNECTION_ALT = "00000000-0000-0000-0000-0000000000e2";
const NOW = new Date("2026-08-11T12:00:00.000Z");

function capability(overrides: Partial<IntegrationCapabilityRow> = {}): IntegrationCapabilityRow {
  return {
    id: "00000000-0000-0000-0000-0000000000c1",
    capability_key: "google_ads_keyword_discovery",
    operation_kind: "keyword_discovery",
    environment: "test",
    unit_name: "request",
    status: "active",
    ...overrides,
  };
}

function connection(overrides: Partial<IntegrationConnectionRow> = {}): IntegrationConnectionRow {
  return {
    id: PLATFORM_CONNECTION,
    provider_id: PROVIDER,
    owner_scope_type: "platform",
    owner_agency_id: null,
    owner_brand_id: null,
    environment: "test",
    lifecycle_status: "ready",
    secret_ref: "vault://integration-test",
    ...overrides,
  };
}

function authorizationRepository(activeAgencyIds: string[] = [AGENCY_A]): CanonicalAuthorizationRepository {
  const agencies = new Map([[AGENCY_A, { id: AGENCY_A, name: "Agency A", status: "active" as const, ownerUserId: ACTOR_A }]]);
  const brands = new Map([[BRAND_A, { id: BRAND_A, name: "Brand A", status: "active" as const, ownerUserId: ACTOR_A }]]);
  return {
    getGlobalRole: async () => null,
    findBrandById: async (brandId) => brands.get(brandId) || null,
    findBrandMembership: async () => null,
    findAgencyById: async (agencyId) => agencies.get(agencyId) || null,
    findAgencyMembership: async (agencyId, userId) => userId === ACTOR_A && agencyId === AGENCY_A
      ? { id: "00000000-0000-0000-0000-0000000000f4", agencyId, userId, role: "agency_admin" as const, status: "active" as const }
      : null,
    findActiveAgencyIdsByBrandId: async () => activeAgencyIds,
  };
}

function dependencies(input: {
  activeAgencyIds?: string[];
  capability?: IntegrationCapabilityRow | null;
  providerKey?: "google_ads" | "dataforseo" | "openrouter";
  connections?: IntegrationConnectionRow[];
} = {}): IntegrationRuntimeDependencies & { usage: IntegrationUsageEvent[]; calls: Record<string, number> } {
  const technicalCapability = input.capability === undefined ? capability() : input.capability;
  const providerKey = input.providerKey || "google_ads";
  const connections = input.connections || [connection()];
  const usage: IntegrationUsageEvent[] = [];
  const calls = { grants: 0, bindings: 0, quotas: 0, usageInsert: 0 };
  const repository: IntegrationRuntimeRepository = {
    async findCapability(query) {
      if (!technicalCapability) return null;
      return query.capabilityKey === technicalCapability.capability_key && query.operation === technicalCapability.operation_kind && query.environment === technicalCapability.environment ? technicalCapability : null;
    },
    async findActiveGrants() { calls.grants += 1; return []; },
    async findActiveBindings() { calls.bindings += 1; return []; },
    async findConnection(connectionId) { return connections.find((row) => row.id === connectionId) || null; },
    async findProvider(providerId) { return providerId === PROVIDER ? { id: PROVIDER, provider_key: providerKey, status: "active" as const } : null; },
    async findProviderByKey(requestedProviderKey) { return requestedProviderKey === providerKey ? { id: PROVIDER, provider_key: providerKey, status: "active" as const } : null; },
    async findPlatformConnections(query) {
      return query.providerKey === providerKey
        ? connections.filter((row) => row.environment === query.environment).map((row) => ({ connection: row, provider: { id: PROVIDER, provider_key: providerKey, status: "active" as const } }))
        : [];
    },
    async findActiveQuotaPolicies() { calls.quotas += 1; return []; },
    async sumSucceededUsage() { return 0; },
    async findUsageByIdempotency(connectionId, idempotencyKey) { return usage.find((row) => row.connection_id === connectionId && row.idempotency_key === idempotencyKey) || null; },
    async findInfrastructureUsageByIdempotency({ providerId, environment, idempotencyKey }) {
      return usage.find((row) => row.connection_id === null && row.provider_id === providerId && row.environment === environment && row.idempotency_key === idempotencyKey) || null;
    },
    async insertUsage(input) {
      calls.usageInsert += 1;
      const existing = usage.find((row) => row.connection_id === input.connection_id && row.idempotency_key === input.idempotency_key);
      if (existing) throw Object.assign(new Error("duplicate"), { code: "23505" });
      const row: IntegrationUsageEvent = { ...input, id: `usage-${usage.length + 1}`, created_at: NOW.toISOString() };
      usage.push(row);
      return row;
    },
  };
  return { repository, authorizationRepository: authorizationRepository(input.activeAgencyIds), now: () => NOW, usage, calls };
}

function input(context: { agencyId?: string | null; brandId?: string | null; actorUserId?: string; operation?: "keyword_discovery" | "keyword_metrics" | "allintitle" | "ai_generation" } = {}) {
  const operation = context.operation || "keyword_discovery";
  const capabilityKey = operation === "allintitle" ? "dataforseo.allintitle" : operation === "ai_generation" ? "ai_generation" : operation === "keyword_metrics" ? "google_ads_keyword_metrics" : "google_ads_keyword_discovery";
  return {
    actorUserId: context.actorUserId || ACTOR_A,
    agencyId: context.agencyId === undefined ? AGENCY_A : context.agencyId,
    brandId: context.brandId === undefined ? null : context.brandId,
    capabilityKey,
    operation,
    environment: "test" as const,
  };
}

async function expectCode(action: () => Promise<unknown>, code: IntegrationRuntimeError["code"]) {
  await assert.rejects(action, (error: unknown) => error instanceof IntegrationRuntimeError && error.code === code);
}

test("resource global READY resolves for an active Agency without grant, binding or quota", async () => {
  const deps = dependencies();
  const resource = await resolveIntegrationResourceForActor(input(), deps);
  assert.equal(resource.resourceKey, "google_ads");
  assert.equal(resource.entitlement.reason, "HOMOLOGATION_ALLOW_ALL_RESOURCE_AVAILABLE");
  assert.equal(resource.entitlement.sourceScope, "platform");
  assert.equal(resource.binding, null);
  assert.equal(resource.connection.ownerScope, "platform");
  assert.equal(resource.quota.status, "UNLIMITED");
  assert.deepEqual(deps.calls, { grants: 0, bindings: 0, quotas: 0, usageInsert: 0 });
});

test("the same global resource resolves for an authorized Brand and preserves Agency context", async () => {
  const resource = await resolveIntegrationResourceForActor(input({ brandId: BRAND_A }), dependencies());
  assert.equal(resource.agencyId, AGENCY_A);
  assert.equal(resource.brandId, BRAND_A);
  assert.equal(resource.entitlement.targetScope, "brand");
  assert.equal(resource.entitlement.targetAgencyId, AGENCY_A);
  assert.equal(resource.binding, null);
});

test("a missing technical catalog row does not become an entitlement denial", async () => {
  const deps = dependencies({ capability: null });
  const resource = await resolveIntegrationResourceForActor(input(), deps);
  assert.equal(resource.capability, null);
  assert.equal(resource.connection.connectionId, PLATFORM_CONNECTION);
  assert.equal(resource.quota.status, "UNLIMITED");
});

test("DataForSEO and OpenRouter map to their provider resources", async (t) => {
  await t.test("DataForSEO", async () => {
    const resource = await resolveIntegrationResourceForActor(input({ operation: "allintitle" }), dependencies({ providerKey: "dataforseo", capability: capability({ capability_key: "dataforseo.allintitle", operation_kind: "allintitle" }) }));
    assert.equal(resource.resourceKey, "dataforseo");
    assert.equal(resource.connection.providerKey, "dataforseo");
  });
  await t.test("OpenRouter", async () => {
    const resource = await resolveIntegrationResourceForActor(input({ operation: "ai_generation" }), dependencies({ providerKey: "openrouter", capability: capability({ capability_key: "ai_generation", operation_kind: "ai_generation" }) }));
    assert.equal(resource.resourceKey, "openrouter");
    assert.equal(resource.connection.providerKey, "openrouter");
  });
});

test("a non-READY global Connection blocks the resource without consulting grants", async () => {
  const deps = dependencies({ connections: [connection({ lifecycle_status: "error" })] });
  await expectCode(() => resolveIntegrationResourceForActor(input(), deps), "INTEGRATION_CONNECTION_DISABLED");
  assert.equal(deps.calls.grants, 0);
  assert.equal(deps.calls.bindings, 0);
  assert.equal(deps.calls.quotas, 0);
});

test("a global Connection without secret_ref is not usable", async () => {
  await expectCode(() => resolveIntegrationResourceForActor(input(), dependencies({ connections: [connection({ secret_ref: null })] })), "INTEGRATION_CONNECTION_DISABLED");
});

test("multiple global READY Connections are rejected as ambiguous", async () => {
  await expectCode(() => resolveIntegrationResourceForActor(input(), dependencies({ connections: [connection(), connection({ id: PLATFORM_CONNECTION_ALT })] })), "INTEGRATION_CONTEXT_INVALID");
});

test("an Agency-owned Connection cannot satisfy the global resource policy", async () => {
  await expectCode(() => resolveIntegrationResourceForActor(input(), dependencies({ connections: [connection({ owner_scope_type: "agency", owner_agency_id: AGENCY_A })] })), "INTEGRATION_CONNECTION_MISSING");
});

test("inactive Agency-Brand link still blocks tenant authorization", async () => {
  await expectCode(() => resolveIntegrationResourceForActor(input({ brandId: BRAND_A }), dependencies({ activeAgencyIds: [] })), "INTEGRATION_CONTEXT_INVALID");
});

test("usage keeps technical capability metadata and sanitizes secrets", async () => {
  const deps = dependencies();
  const resource = await resolveIntegrationResourceForActor(input({ brandId: BRAND_A }), deps);
  const event = await recordIntegrationUsageForResource({ resource, operation: "module_operation", resultStatus: "succeeded", units: 2, idempotencyKey: "brand-discovery-1", module: "minerador", metadata: { trace: "safe", model: "deepseek/deepseek-v4-flash-0731", token: "must-not-persist" } }, deps);
  assert.ok(event);
  assert.equal(event.actor_user_id, ACTOR_A);
  assert.equal(event.agency_id, AGENCY_A);
  assert.equal(event.brand_id, BRAND_A);
  assert.deepEqual(event.metadata, { trace: "safe", model: "deepseek/deepseek-v4-flash-0731" });
  assert.equal("secret_ref" in resource.connection, false);
});

test("missing technical capability does not write an invalid usage foreign key", async () => {
  const deps = dependencies({ capability: null });
  const resource = await resolveIntegrationResourceForActor(input(), deps);
  const event = await recordIntegrationUsageForResource({ resource, operation: "connection_test", resultStatus: "succeeded", units: 1, idempotencyKey: "without-capability" }, deps);
  assert.equal(event, null);
  assert.equal(deps.calls.usageInsert, 0);
});

test("Connection-backed Usage rejects a missing Connection", async () => {
  const deps = dependencies();
  const resource = await resolveIntegrationResourceForActor(input(), deps);
  await expectCode(
    () => recordIntegrationUsageForResource({
      resource: { ...resource, connection: { ...resource.connection, connectionId: "" } },
      operation: "connection_test",
      resultStatus: "succeeded",
      units: 1,
      idempotencyKey: "connection-required",
    }, deps),
    "INTEGRATION_CONTEXT_INVALID",
  );
  assert.equal(deps.calls.usageInsert, 0);
});

test("Google Ads infrastructure Usage never resolves a Connection, grant, binding or quota", async () => {
  const deps = dependencies({ connections: [] });
  const usage = await resolveGoogleAdsInfrastructureUsageForActor(input({ brandId: BRAND_A }), deps);
  const event = await recordGoogleAdsInfrastructureUsage({
    usage,
    operation: "module_operation",
    module: "minerador",
    resultStatus: "succeeded",
    units: 1,
    idempotencyKey: "google-infrastructure-usage-1",
  }, deps);

  assert.equal(event.connection_id, null);
  assert.equal(event.provider_id, PROVIDER);
  assert.equal(event.capability_id, capability().id);
  assert.equal(event.actor_user_id, ACTOR_A);
  assert.equal(event.agency_id, AGENCY_A);
  assert.equal(event.brand_id, BRAND_A);
  assert.equal(deps.calls.grants, 0);
  assert.equal(deps.calls.bindings, 0);
  assert.equal(deps.calls.quotas, 0);
});

test("a disabled Google Ads catalog capability remains technical classification, not authorization", async () => {
  const deps = dependencies({ capability: capability({ status: "disabled" }), connections: [] });
  const usage = await resolveGoogleAdsInfrastructureUsageForActor(input({ brandId: BRAND_A }), deps);
  assert.equal(usage.capability.id, capability().id);
  assert.equal(deps.calls.grants, 0);
  assert.equal(deps.calls.bindings, 0);
  assert.equal(deps.calls.quotas, 0);
});

test("infrastructure Usage preserves provider/environment idempotency and rejects a divergent retry", async () => {
  const deps = dependencies({ connections: [] });
  const usage = await resolveGoogleAdsInfrastructureUsageForActor(input({ brandId: BRAND_A }), deps);
  const base = {
    usage,
    operation: "module_operation" as const,
    module: "minerador",
    resultStatus: "succeeded" as const,
    units: 1,
    idempotencyKey: "google-infrastructure-idempotency",
  };
  const first = await recordGoogleAdsInfrastructureUsage(base, deps);
  const retry = await recordGoogleAdsInfrastructureUsage(base, deps);
  assert.equal(first.id, retry.id);
  assert.equal(deps.usage.length, 1);
  await expectCode(
    () => recordGoogleAdsInfrastructureUsage({ ...base, resultStatus: "failed", errorCode: "GOOGLE_ADS_PROVIDER_ERROR" }, deps),
    "INTEGRATION_IDEMPOTENCY_CONFLICT",
  );
});

test("usage idempotency returns the original event", async () => {
  const deps = dependencies();
  const resource = await resolveIntegrationResourceForActor(input(), deps);
  const eventInput = { resource, operation: "connection_test" as const, resultStatus: "succeeded" as const, units: 1, idempotencyKey: "same-operation" };
  const first = await recordIntegrationUsageForResource(eventInput, deps);
  const second = await recordIntegrationUsageForResource(eventInput, deps);
  assert.ok(first && second);
  assert.equal(second.id, first.id);
  assert.equal(deps.usage.length, 1);
});

test("invalid actor context remains blocked even when the resource is globally available", async () => {
  await expectCode(() => resolveIntegrationResourceForActor(input({ actorUserId: ACTOR_B }), dependencies()), "INTEGRATION_NOT_AUTHORIZED");
});

test("integration catalog defaults to production and accepts an explicit supported environment", () => {
  assert.equal(resolveIntegrationEnvironment({ NODE_ENV: "development" }), "production");
  assert.equal(resolveIntegrationEnvironment({ NODE_ENV: "development", INTEGRATION_ENVIRONMENT: " test " }), "test");
  assert.equal(resolveIntegrationEnvironment({ NODE_ENV: "development", INTEGRATION_ENVIRONMENT: "unsupported" }), "production");
});
