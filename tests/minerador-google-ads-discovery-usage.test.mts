import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  recordGoogleAdsDiscoveryUsage,
  googleAdsDiscoveryUsageKey,
} from "../lib/minerador/google-ads-discovery-usage.ts";
import type { CanonicalAuthorizationRepository } from "../lib/tenant/canonical-authorization.ts";
import type {
  IntegrationCapabilityRow,
  IntegrationRuntimeDependencies,
  IntegrationRuntimeRepository,
  IntegrationUsageEvent,
} from "../lib/server/integrations-runtime.ts";

const ACTOR = "20000000-0000-4000-8000-000000000001";
const AGENCY = "20000000-0000-4000-8000-000000000002";
const BRAND = "20000000-0000-4000-8000-000000000003";
const PROVIDER = "20000000-0000-4000-8000-000000000004";
const CAPABILITY = "20000000-0000-4000-8000-000000000006";

const capability: IntegrationCapabilityRow = {
  id: CAPABILITY,
  capability_key: "google_ads_keyword_discovery",
  operation_kind: "keyword_discovery",
  environment: "test",
  unit_name: "request",
  status: "active",
};

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

function dependencies() {
  const usage: IntegrationUsageEvent[] = [];
  const calls = { connection: 0, grants: 0, bindings: 0, quota: 0, infrastructureIdempotency: 0 };
  const repository: IntegrationRuntimeRepository = {
    findCapability: async () => capability,
    findActiveGrants: async () => { calls.grants += 1; return []; },
    findActiveBindings: async () => { calls.bindings += 1; return []; },
    findConnection: async () => { calls.connection += 1; throw new Error("Connection must not be resolved for Google Ads Usage"); },
    findProvider: async (id) => id === PROVIDER ? { id: PROVIDER, provider_key: "google_ads", status: "active" as const } : null,
    findProviderByKey: async (providerKey) => providerKey === "google_ads" ? { id: PROVIDER, provider_key: "google_ads", status: "active" as const } : null,
    findPlatformConnections: async () => { calls.connection += 1; throw new Error("Connection must not be resolved for Google Ads Usage"); },
    findActiveQuotaPolicies: async () => { calls.quota += 1; return []; },
    sumSucceededUsage: async () => 0,
    findUsageByIdempotency: async (connectionId, idempotencyKey) => usage.find((row) => row.connection_id === connectionId && row.idempotency_key === idempotencyKey) || null,
    findInfrastructureUsageByIdempotency: async ({ providerId, environment, idempotencyKey }) => {
      calls.infrastructureIdempotency += 1;
      return usage.find((row) => row.connection_id === null && row.provider_id === providerId && row.environment === environment && row.idempotency_key === idempotencyKey) || null;
    },
    insertUsage: async (input) => {
      const existing = usage.find((row) => row.connection_id === input.connection_id && row.provider_id === input.provider_id && row.environment === input.environment && row.idempotency_key === input.idempotency_key);
      if (existing) throw Object.assign(new Error("duplicate"), { code: "23505" });
      const row: IntegrationUsageEvent = { ...input, id: `usage-${usage.length + 1}`, created_at: "2026-08-16T23:45:14.346Z" };
      usage.push(row);
      return row;
    },
  };
  return {
    dependencies: { repository, authorizationRepository: authorizationRepository() } satisfies IntegrationRuntimeDependencies,
    usage, calls,
  };
}

function input(overrides: Partial<Parameters<typeof recordGoogleAdsDiscoveryUsage>[0]> = {}) {
  const { dependencies: runtimeDependencies } = dependencies();
  return {
    actorUserId: ACTOR,
    agencyId: AGENCY,
    brandId: BRAND,
    operationRequestId: "20000000-0000-4000-8000-000000000010",
    resultStatus: "succeeded" as const,
    providerReference: "google-request-1",
    discoveryRunId: "20000000-0000-4000-8000-000000000011",
    receivedCount: 97,
    normalizedCount: 97,
    approvedCount: 12,
    filteredCount: 85,
    environment: "test" as const,
    dependencies: runtimeDependencies,
    ...overrides,
  };
}

test("Google Ads Discovery registra exatamente um Usage e retry idempotente não duplica", async () => {
  const fixture = dependencies();
  const firstInput = input({ dependencies: fixture.dependencies });
  const first = await recordGoogleAdsDiscoveryUsage(firstInput);
  const second = await recordGoogleAdsDiscoveryUsage(firstInput);

  assert.equal(googleAdsDiscoveryUsageKey(firstInput.operationRequestId), first.idempotency_key);
  assert.equal(second.id, first.id);
  assert.equal(fixture.usage.length, 1);
  assert.equal(first.result_status, "succeeded");
  assert.equal(first.actor_user_id, ACTOR);
  assert.equal(first.agency_id, AGENCY);
  assert.equal(first.brand_id, BRAND);
  assert.equal(first.provider_id, PROVIDER);
  assert.equal(first.connection_id, null);
  assert.equal(first.capability_id, CAPABILITY);
  assert.equal(first.units, 1);
  assert.equal(first.metadata.operationRequestId, firstInput.operationRequestId);
  assert.equal(first.metadata.discoveryRunId, firstInput.discoveryRunId);
  assert.equal(fixture.calls.connection, 0);
  assert.equal(fixture.calls.grants, 0);
  assert.equal(fixture.calls.bindings, 0);
  assert.equal(fixture.calls.quota, 0);
  assert.equal(fixture.calls.infrastructureIdempotency, 1);
});

test("provider chamado com erro registra Usage failed sem expor segredo", async () => {
  const fixture = dependencies();
  const event = await recordGoogleAdsDiscoveryUsage(input({
    dependencies: fixture.dependencies,
    operationRequestId: "20000000-0000-4000-8000-000000000012",
    resultStatus: "failed",
    errorCode: "GOOGLE_ADS_PROVIDER_ERROR",
    providerReference: "request-safe-ref",
  }));

  assert.equal(event.result_status, "failed");
  assert.equal(event.error_code, "GOOGLE_ADS_PROVIDER_ERROR");
  assert.equal(event.provider_request_ref, "request-safe-ref");
  assert.doesNotMatch(JSON.stringify(event), /secret|token|password|authorization/i);
});

test("F1b.8: sem sufixo, a chave e o evento são os de hoje", async () => {
  const operationRequestId = "20000000-0000-4000-8000-000000000020";
  assert.equal(googleAdsDiscoveryUsageKey(operationRequestId), `google_ads:${operationRequestId}:keyword_discovery`);
  assert.equal(googleAdsDiscoveryUsageKey(operationRequestId, null), `google_ads:${operationRequestId}:keyword_discovery`);
  assert.equal(googleAdsDiscoveryUsageKey(operationRequestId, undefined), `google_ads:${operationRequestId}:keyword_discovery`);

  const fixture = dependencies();
  const event = await recordGoogleAdsDiscoveryUsage(input({ dependencies: fixture.dependencies, operationRequestId }));
  assert.equal(event.idempotency_key, `google_ads:${operationRequestId}:keyword_discovery`);
  assert.deepEqual(Object.keys(event.metadata).sort(), ["approvedCount", "discoveryRunId", "filteredCount", "normalizedCount", "operationRequestId", "provider", "providerVersion", "receivedCount"]);
});

test("F1b.8: com sufixo, as duas chamadas da mesma operação têm chaves distintas e não colidem", async () => {
  const operationRequestId = "20000000-0000-4000-8000-000000000021";
  const keywordKey = googleAdsDiscoveryUsageKey(operationRequestId, "keyword_seed");
  const urlKey = googleAdsDiscoveryUsageKey(operationRequestId, "url_seed");
  assert.equal(keywordKey, `google_ads:${operationRequestId}:keyword_discovery:keyword_seed`);
  assert.equal(urlKey, `google_ads:${operationRequestId}:keyword_discovery:url_seed`);
  assert.notEqual(keywordKey, urlKey);

  const fixture = dependencies();
  const keywordEvent = await recordGoogleAdsDiscoveryUsage(input({ dependencies: fixture.dependencies, operationRequestId, discoveryRunId: null, usageKeySuffix: "keyword_seed", providerReference: "req-a" }));
  const urlEvent = await recordGoogleAdsDiscoveryUsage(input({ dependencies: fixture.dependencies, operationRequestId, discoveryRunId: null, usageKeySuffix: "url_seed", providerReference: "req-b" }));
  assert.equal(keywordEvent.idempotency_key, keywordKey);
  assert.equal(urlEvent.idempotency_key, urlKey);
  assert.equal(fixture.usage.length, 2);
  assert.equal(keywordEvent.metadata.discoveryRunId, null);
  assert.equal(keywordEvent.metadata.seedKind, "keyword_seed");
  assert.equal(urlEvent.metadata.seedKind, "url_seed");
});

test("Discovery só tenta Usage após chamada iniciada e separa provider, persistência e Usage", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url), "utf8");
  assert.match(route, /apiRequestStarted && canonicalContext && operationRequestId && !usageAttempted/);
  assert.match(route, /resultStatus: "failed"/);
  assert.match(route, /resultStatus: "succeeded"/);
  assert.ok(route.indexOf('internalStage = "usage"') > route.indexOf("persistResult"));
  assert.match(route, /usageRecorded/);
});
