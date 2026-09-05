import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

const migration = await read("supabase/migrations/20260824185700_dataforseo_serp_compatibility_operation.sql");
const oldMigration = await read("supabase/migrations/0024_integrations_resource_governance.sql");
const runtime = await read("lib/server/integrations-runtime.ts");
const admin = await read("lib/server/platform-integrations-admin.ts");
const panel = await read("modules/admin/platform-integrations-panel.tsx");

test("migration sucessora amplia somente o catálogo de operation_kind", () => {
  assert.match(migration, /integration_capabilities/);
  assert.match(migration, /serp_compatibility/);
  assert.match(migration, /ck_integration_capabilities_operation_kind_serp_compatibility/);
  assert.doesNotMatch(migration, /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i);
  assert.doesNotMatch(migration, /secret_ref\s*=|api[_-]?key|password|token_plaintext|credential/i);
  assert.doesNotMatch(migration, /AdalbaPro|Adalba|brand_id\s*=/i);
  assert.match(oldMigration, /operation_kind IN \('ai_generation', 'keyword_discovery', 'keyword_metrics', 'allintitle', 'transactional_email'\)/);
});

test("catálogo técnico identifica a operação SERP no recurso global DataForSEO", () => {
  assert.match(admin, /capabilityKey: "dataforseo\.serp_compatibility"/);
  assert.match(admin, /operationKind: "serp_compatibility"/);
  assert.match(admin, /unitName: "request"/);
  assert.match(panel, /"serp_compatibility"/);
  assert.match(runtime, /"serp_compatibility"/);

  const resourceMap = runtime.match(/INTEGRATION_RESOURCE_BY_OPERATION:[\s\S]*?\n};/)?.[0] || "";
  assert.match(resourceMap, /serp_compatibility:\s*"dataforseo"/);

  const providerRequirements = runtime.match(/INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS[\s\S]*?\n};/)?.[0] || "";
  assert.match(providerRequirements, /["']dataforseo\.serp_compatibility["']:\s*"dataforseo"/);

  const catalog = admin.match(/PLATFORM_CAPABILITY_CATALOG = \[[\s\S]*?\n\] as const;/)?.[0] || "";
  assert.doesNotMatch(catalog, /serper|rapidapi/i);
});

test("usage permanece no ledger compartilhado e a migration não cria credencial ou ledger paralelo", () => {
  assert.match(runtime, /integration_usage_events/);
  assert.match(runtime, /operation_kind: input\.operation/);
  assert.match(runtime, /input\.operation === "module_operation" && \(!input\.resource\.brandId/);
  assert.doesNotMatch(migration, /CREATE TABLE\s+public\.(?:dataforseo|serp|arquiteto|provider_usage|integration_usage)/i);
});
