import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/0024_integrations_resource_governance.sql";
const snapshotPath = "supabase/scripts/integrations-0024-pre-apply-snapshot-read-only.sql";
const preflightPath = "supabase/scripts/integrations-0024-preflight-read-only.sql";
const verifierPath = "supabase/scripts/integrations-0024-post-verification-read-only.sql";
const aclDiagnosticPath = "supabase/scripts/integrations-0024-acl-diagnostic-read-only.sql";

const migration = await readFile(migrationPath, "utf8");
const snapshot = await readFile(snapshotPath, "utf8");
const preflight = await readFile(preflightPath, "utf8");
const verifier = await readFile(verifierPath, "utf8");
const aclDiagnostic = await readFile(aclDiagnosticPath, "utf8");

const tables = [
  "integration_providers",
  "integration_capabilities",
  "integration_connections",
  "integration_grants",
  "integration_bindings",
  "integration_quota_policies",
  "integration_usage_events",
];

test("0024 cria o conjunto mínimo de governança sem duplicar tabelas legadas", () => {
  for (const table of tables) assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\b`));
  assert.doesNotMatch(migration, /CREATE TABLE public\.(agency_provider_connections|provider_usage_events)\b/);
  assert.doesNotMatch(migration, /minerador_google_ads_connections|DATAFORSEO_LOGIN|OPENROUTER_API_KEY|DEEPSEEK_API_KEY/i);
});

test("0024 separa authorization, grant, connection, binding, quota e usage", () => {
  assert.match(migration, /integration_grants/);
  assert.match(migration, /integration_connections/);
  assert.match(migration, /integration_bindings/);
  assert.match(migration, /integration_quota_policies/);
  assert.match(migration, /integration_usage_events/);
  assert.match(migration, /source_kind IN \('platform_granted', 'agency_owned', 'agency_granted', 'brand_owned', 'unavailable'\)/);
  assert.match(migration, /UNIQUE INDEX uq_integration_quota_active_scope_0024/);
  const grantsTable = migration.match(/CREATE TABLE public\.integration_grants[\s\S]*?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(grantsTable, /quota/i);
});

test("connections suportam Platform, Agency e Brand com referência protegida", () => {
  assert.match(migration, /owner_scope_type text NOT NULL CHECK \(owner_scope_type IN \('platform', 'agency', 'brand'\)\)/);
  assert.match(migration, /secret_ref text/);
  assert.match(migration, /COMMENT ON COLUMN public\.integration_connections\.secret_ref/);
  assert.match(migration, /owner_agency_id uuid REFERENCES public\.agencies\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /owner_brand_id uuid REFERENCES public\.marcas\(id\) ON DELETE RESTRICT/);
});

test("capability é independente de provider", () => {
  const capabilityTable = migration.match(/CREATE TABLE public\.integration_capabilities[\s\S]*?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(capabilityTable, /provider_id/);
  assert.doesNotMatch(migration, /uq_integration_capabilities_provider_env_0024/);
  assert.match(migration, /trg_integration_grants_validate_scope_0024/);
  assert.match(migration, /trg_integration_bindings_validate_scope_0024/);
});

test("Google Ads/DataForSEO podem ser modelados sem adaptar o comportamento atual", () => {
  assert.match(migration, /external_account_ref text/);
  assert.match(migration, /operation_kind IN \('ai_generation', 'keyword_discovery', 'keyword_metrics', 'allintitle', 'transactional_email'\)/);
  assert.doesNotMatch(migration, /serper/i);
});

test("usage possui ator, scopes, provider/connection, capability, custo, resultado e idempotência", () => {
  for (const column of ["actor_user_id", "provider_id", "connection_id", "capability_id", "agency_id", "brand_id", "units", "cost_amount", "result_status", "occurred_at", "idempotency_key"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /CONSTRAINT uq_integration_usage_events_idempotency_0024 UNIQUE \(connection_id, idempotency_key\)/);
  assert.match(migration, /trg_integration_usage_events_append_only_0024/);
});

test("schema não possui coluna para segredo bruto ou token bruto", () => {
  assert.match(migration, /secret_ref text/);
  assert.doesNotMatch(migration, /\b(api_key|password|raw_token|token_plaintext|credential_plaintext|private_key)\s+(text|varchar|bytea|jsonb)/i);
  assert.doesNotMatch(migration, /CREATE TABLE public\.(communication_|agency_invitation_)/i);
});

test("RLS e ACL mantêm mutações no server-side", () => {
  for (const table of tables) assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(migration, /TO authenticated/);
  assert.match(migration, /TO service_role/);
  assert.doesNotMatch(migration, /CREATE POLICY [^\n]+ FOR (INSERT|UPDATE|DELETE|ALL)/i);
});

test("preflight, pós-verificador e diagnóstico ACL são SQL somente leitura com um result set final", () => {
  for (const script of [snapshot, preflight, verifier, aclDiagnostic]) {
    assert.match(script, /^(?:\s*--[^\n]*\n)*\s*WITH\b/i);
    assert.match(script.trim(), /SELECT check_name, expected, observed, verdict[\s\S]*;\s*$/i);
    assert.doesNotMatch(script, /(?:^|[;\n]\s*)(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
    assert.match(script, /SELECT check_name, expected, observed, verdict/);
  }
  assert.match(verifier, /2026-08-11-integrations-0024-post-v1/);
  assert.match(snapshot, /2026-08-11-integrations-0024-pre-apply-snapshot-v1/);
  assert.match(aclDiagnostic, /2026-08-11-integrations-0024-acl-diagnostic-v1/);
  for (const table of tables) assert.match(verifier, new RegExp(table));
});

test("diagnóstico ACL separa catálogo de ledger e trata MAINTAIN por versão", () => {
  assert.match(aclDiagnostic, /integration_usage_events[\s\S]*ledger/);
  assert.match(aclDiagnostic, /table_kind = 'catalog'/);
  assert.match(aclDiagnostic, /table_kind = 'ledger'/);
  assert.match(aclDiagnostic, /server_version_num/);
  assert.match(aclDiagnostic, /default_acl/);
});

test("verificador cobre RLS, policies, grants, FKs, índices, checks, append-only e contagens sanitizadas", () => {
  for (const marker of [
    "relrowsecurity",
    "pg_policies",
    "has_table_privilege",
    "on_delete_restrict",
    "expected_constraints",
    "expected_indexes",
    "no_raw_secret_columns",
    "append_only",
    "external_account_ref_policy",
    "count:integration_usage_events",
  ]) assert.match(verifier, new RegExp(marker));
});
