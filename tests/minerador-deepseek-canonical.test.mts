import assert from "node:assert/strict";
import test from "node:test";
import {
  DeepSeekCanonicalError,
  OPENROUTER_API_URL,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
  openRouterAttributionHeaders,
  readDeepSeekModel,
  readDeepSeekThinkingMode,
  readOpenRouterModel,
  resolveAICanonicalConfig,
  resolveDeepSeekCanonicalConfig,
} from "../lib/server/deepseek-canonical.ts";
import { INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS, INTEGRATION_RESOURCE_BY_OPERATION, IntegrationRuntimeError } from "../lib/server/integrations-runtime.ts";
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
import type { IntegrationSecretStore } from "../lib/server/integration-secret-store.ts";

/*
 * Resolvedor canônico da IA. Desde 2026-10-11 a capability `ai_generation`
 * resolve a Connection OpenRouter; a DeepSeek ficou só como reserva de
 * rollback e não satisfaz mais o resource.
 */

const ACTOR = "10000000-0000-4000-8000-000000000101";
const AGENCY = "10000000-0000-4000-8000-000000000102";
const BRAND = "10000000-0000-4000-8000-000000000103";
const CAPABILITY = "10000000-0000-4000-8000-000000000104";
const PROVIDER = "10000000-0000-4000-8000-000000000105";
const CONNECTION = "10000000-0000-4000-8000-000000000106";
const GRANT = "10000000-0000-4000-8000-000000000107";
const BINDING = "10000000-0000-4000-8000-000000000108";
const QUOTA = "10000000-0000-4000-8000-000000000109";

/** O modelo DeepSeek que ainda está na metadata da Connection OpenRouter remota (2026-08). */
const LEGACY_METADATA = { label: "OpenRouter", openrouter_model: "deepseek/deepseek-v4-pro-0813" };

const capability: IntegrationCapabilityRow = { id: CAPABILITY, capability_key: "ai_generation", operation_kind: "ai_generation", environment: "test", unit_name: "request", status: "active" };
const grant: IntegrationGrantRow = { id: GRANT, capability_id: CAPABILITY, target_scope_type: "brand", target_agency_id: null, target_brand_id: BRAND, source_scope_type: "platform", source_agency_id: null, environment: "test", lifecycle_status: "active", starts_at: "2026-01-01T00:00:00.000Z", ends_at: null };
const binding: IntegrationBindingRow = { id: BINDING, capability_id: CAPABILITY, target_scope_type: "brand", target_agency_id: null, target_brand_id: BRAND, environment: "test", source_kind: "platform_granted", connection_id: CONNECTION, grant_id: GRANT, external_account_ref: null, lifecycle_status: "active" };
const connection: IntegrationConnectionRow = { id: CONNECTION, provider_id: PROVIDER, owner_scope_type: "platform", owner_agency_id: null, owner_brand_id: null, environment: "test", lifecycle_status: "ready", secret_ref: "secret/openrouter" };
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
  const providerKey = options.providerKey || "openrouter";
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
  return { repository, authorizationRepository: authorizationRepository(), now: () => new Date("2026-10-11T12:00:00.000Z") };
}

function client(metadata: unknown = LEGACY_METADATA) {
  return {
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        async maybeSingle() {
          return table === "integration_connections" ? { data: { id: CONNECTION, secret_ref: "secret/openrouter", metadata }, error: null } : { data: null, error: null };
        },
      };
      return builder;
    },
  } as never;
}

function secretStore(payload: string | null, calls: { count: number } = { count: 0 }): IntegrationSecretStore {
  return { resolve: async () => { calls.count += 1; return payload; }, store: async () => "unused" } as unknown as IntegrationSecretStore;
}

const base = { actorUserId: ACTOR, agencyId: AGENCY, brandId: BRAND, environment: "test" as const };

test("ai_generation aponta para a OpenRouter nos dois mapas do runtime", () => {
  assert.equal(INTEGRATION_RESOURCE_BY_OPERATION.ai_generation, "openrouter");
  assert.equal(INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS.ai_generation, "openrouter");
  assert.equal(resolveAICanonicalConfig, resolveDeepSeekCanonicalConfig);
});

test("com OPENROUTER_API_KEY na env, a chave vem da env e o Secret Store não é lido", async () => {
  const calls = { count: 0 };
  const result = await resolveDeepSeekCanonicalConfig({
    ...base,
    client: client(),
    runtimeDependencies: dependencies(),
    secretStore: secretStore(JSON.stringify({ OPENROUTER_API_KEY: "vault-key" }), calls),
    technicalEnvironment: { NODE_ENV: "test", OPENROUTER_API_KEY: "env-key", APP_BASE_URL: "https://minerador.example/caminho" },
  });
  assert.equal(result.provider, "openrouter");
  assert.equal(result.apiKey, "env-key");
  assert.equal(result.credentialSource, "environment");
  assert.equal(calls.count, 0);
  assert.equal(result.apiUrl, OPENROUTER_API_URL);
  assert.equal(result.baseUrl, OPENROUTER_BASE_URL);
  assert.equal(result.resource.connection.providerKey, "openrouter");
  assert.deepEqual(result.extraHeaders, { "X-Title": "Minerador Key", "HTTP-Referer": "https://minerador.example" });
  // A metadata remota ainda aponta para um modelo DeepSeek: ela é ignorada e vale o padrão.
  assert.equal(result.model, OPENROUTER_DEFAULT_MODEL);
  assert.equal(result.modelSource, "default");
  assert.equal(result.model, "anthropic/claude-haiku-5.5");
});

test("sem a env, a chave sai do Secret Store da Connection no formato { OPENROUTER_API_KEY }", async () => {
  const result = await resolveDeepSeekCanonicalConfig({
    ...base,
    client: client(),
    runtimeDependencies: dependencies(),
    secretStore: secretStore(JSON.stringify({ OPENROUTER_API_KEY: "vault-key" })),
    technicalEnvironment: { NODE_ENV: "test", DEEPSEEK_API_KEY: "must-not-be-used" },
  });
  assert.equal(result.apiKey, "vault-key");
  assert.equal(result.credentialSource, "connection");
});

test("credencial ausente ou fora do formato falha com código OpenRouter, sem procurar outra chave", async () => {
  await assert.rejects(
    resolveDeepSeekCanonicalConfig({ ...base, client: client(), runtimeDependencies: dependencies(), secretStore: secretStore(null), technicalEnvironment: { NODE_ENV: "test" } }),
    (error: unknown) => error instanceof DeepSeekCanonicalError && error.code === "OPENROUTER_SECRET_NOT_FOUND",
  );
  await assert.rejects(
    resolveDeepSeekCanonicalConfig({ ...base, client: client(), runtimeDependencies: dependencies(), secretStore: secretStore(JSON.stringify({ OPENROUTER_API_KEY: "k", extra: "x" })), technicalEnvironment: { NODE_ENV: "test" } }),
    (error: unknown) => error instanceof DeepSeekCanonicalError && error.code === "OPENROUTER_SECRET_INVALID" && error.status === 409,
  );
});

test("modelo: OPENROUTER_MODEL vence, a metadata só vale com modelo conhecido e slug inválido é recusado", () => {
  assert.deepEqual(readOpenRouterModel(LEGACY_METADATA, { OPENROUTER_MODEL: "openai/gpt-6-luna-pro" }), { model: "openai/gpt-6-luna-pro", modelSource: "environment" });
  assert.deepEqual(readOpenRouterModel({ openrouter_model: "openai/gpt-6.1-sol" }, {}), { model: "openai/gpt-6.1-sol", modelSource: "connection" });
  // Metadata com a variante batch não é modelo conhecido: cai no padrão.
  assert.deepEqual(readOpenRouterModel({ openrouter_model: "openai/gpt-6-luna-pro:batch" }, {}), { model: OPENROUTER_DEFAULT_MODEL, modelSource: "default" });
  assert.deepEqual(readOpenRouterModel({ openrouter: { model: "openai/gpt-6-luna" } }, {}), { model: "openai/gpt-6-luna", modelSource: "connection" });
  assert.deepEqual(readOpenRouterModel(LEGACY_METADATA, {}), { model: OPENROUTER_DEFAULT_MODEL, modelSource: "default" });
  assert.deepEqual(readOpenRouterModel(null, { OPENROUTER_MODEL: "   " }), { model: OPENROUTER_DEFAULT_MODEL, modelSource: "default" });
  assert.throws(() => readOpenRouterModel(null, { OPENROUTER_MODEL: "gpt 6 luna" }), (error: unknown) => error instanceof DeepSeekCanonicalError && error.code === "OPENROUTER_MODEL_NOT_ALLOWED" && error.status === 409);
});

// 2026-10-12: a OpenRouter respondeu 404 "cannot be used with the chat/completions endpoint (adapter OpenAIBatchAdapter)".
test("a variante :batch na env é recusada com instrução, em vez de virar um 404 mudo do provider", () => {
  assert.throws(
    () => readOpenRouterModel(null, { OPENROUTER_MODEL: "openai/gpt-6-luna-pro:batch" }),
    (error: unknown) => error instanceof DeepSeekCanonicalError && error.code === "OPENROUTER_MODEL_NOT_ALLOWED" && error.status === 409 && /sem :batch/.test(error.message),
  );
  assert.equal(OPENROUTER_DEFAULT_MODEL.endsWith(":batch"), false);
  // Sem o prefixo do fornecedor não é um ID da OpenRouter.
  assert.throws(
    () => readOpenRouterModel(null, { OPENROUTER_MODEL: "claude-haiku-5.5" }),
    (error: unknown) => error instanceof DeepSeekCanonicalError && error.code === "OPENROUTER_MODEL_NOT_ALLOWED",
  );
});

test("cabeçalho HTTP-Referer só usa URL http(s) válida; X-Title vai sempre", () => {
  assert.deepEqual(openRouterAttributionHeaders({}), { "X-Title": "Minerador Key" });
  assert.deepEqual(openRouterAttributionHeaders({ APP_BASE_URL: "nao-e-url", NEXT_PUBLIC_APP_URL: "http://localhost:3000/x" }), { "X-Title": "Minerador Key", "HTTP-Referer": "http://localhost:3000" });
});

test("a env com a chave não dispensa a Connection: sem Connection OpenRouter READY não há IA", async () => {
  await assert.rejects(
    resolveDeepSeekCanonicalConfig({ ...base, client: client(), runtimeDependencies: dependencies({ connectionPresent: false }), secretStore: secretStore(null), technicalEnvironment: { NODE_ENV: "test", OPENROUTER_API_KEY: "env-key" } }),
    (error: unknown) => error instanceof IntegrationRuntimeError && error.code === "INTEGRATION_CONNECTION_MISSING",
  );
});

test("a Connection DeepSeek não satisfaz mais o resource de IA: não existe fallback para ela", async () => {
  await assert.rejects(
    resolveDeepSeekCanonicalConfig({ ...base, client: client({ deepseek_model: "deepseek-v4-pro" }), runtimeDependencies: dependencies({ providerKey: "deepseek" }), secretStore: secretStore(JSON.stringify({ DEEPSEEK_API_KEY: "unused" })), technicalEnvironment: { NODE_ENV: "test", OPENROUTER_API_KEY: "env-key" } }),
    (error: unknown) => error instanceof IntegrationRuntimeError && error.code === "INTEGRATION_CONNECTION_MISSING",
  );
});

test("provider estranho também não satisfaz o resource canônico de IA", async () => {
  await assert.rejects(
    resolveDeepSeekCanonicalConfig({ ...base, client: client(), runtimeDependencies: dependencies({ providerKey: "google_ads" }), secretStore: secretStore(null), technicalEnvironment: { NODE_ENV: "test", OPENROUTER_API_KEY: "env-key" } }),
    (error: unknown) => error instanceof IntegrationRuntimeError && error.code === "INTEGRATION_CONNECTION_MISSING",
  );
});

test("leitores da reserva DeepSeek continuam estáveis para o rollback", () => {
  assert.equal(readDeepSeekModel({ deepseek_model: "deepseek-v4-flash" }), "deepseek-v4-flash");
  assert.equal(readDeepSeekThinkingMode({ operations: { ai_generation: { thinking_mode: "enabled" } } }), "enabled");
  assert.equal(readDeepSeekThinkingMode({}), "provider_default");
  assert.throws(() => readDeepSeekModel({ deepseek_model: "openrouter/model" }), (error: unknown) => error instanceof DeepSeekCanonicalError && error.code === "DEEPSEEK_MODEL_NOT_ALLOWED");
});
