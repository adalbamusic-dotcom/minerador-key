import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/0034_google_ads_platform_distribution_secret_store.sql", import.meta.url);
const preflightPath = new URL("../supabase/scripts/google-ads-0034-preflight-read-only.sql", import.meta.url);
const postVerifierPath = new URL("../supabase/scripts/google-ads-0034-post-verification-read-only.sql", import.meta.url);
const rollbackPath = new URL("../supabase/scripts/google-ads-0034-rollback.sql", import.meta.url);
const canonicalPath = new URL("../lib/server/google-ads-canonical.ts", import.meta.url);

async function read(url: URL) {
  return readFile(url, "utf8");
}

function assertReadOnly(sql: string) {
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\b(?:TEMP\s+TABLE|CASCADE)\b/i);
  assert.equal((sql.match(/;\s*$/gm) || []).length, 1);
}

test("0034 representa Platform → Agency → Brand sem duplicar connection", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /agency_distributed/);
  assert.match(sql, /selected_grant\.target_scope_type = 'agency'/);
  assert.match(sql, /selected_grant\.source_scope_type = 'platform'/);
  assert.match(sql, /selected_grant\.capability_id IS DISTINCT FROM NEW\.capability_id/);
  assert.match(sql, /selected_connection\.owner_scope_type = 'platform'/);
  assert.match(sql, /public\.agency_brands/);
  assert.match(sql, /DROP CONSTRAINT ck_integration_bindings_source_0024/);
  assert.match(sql, /ADD CONSTRAINT ck_integration_bindings_source_0034/);
  assert.doesNotMatch(sql, /CREATE TABLE public\.integration_/);
  assert.doesNotMatch(sql, /minerador_google_ads_connections/);
  assert.doesNotMatch(sql, /manager_customer_id|external_account_ref/);
});

test("0034 cria somente o adapter compartilhado server-side do Vault", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.integration_secret_resolve\(p_secret_ref text\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.integration_secret_store_upsert\(/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog, public, vault, pg_temp/);
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.match(sql, /vault\.create_secret/);
  assert.match(sql, /vault\.update_secret/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON FUNCTION public\.integration_secret_resolve/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.integration_secret_resolve[\s\S]*TO service_role/);
  assert.doesNotMatch(sql, /GOOGLE_ADS_(?:DEVELOPER_TOKEN|CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN).*process\.env/i);
});

test("preflight e post-verifier são read-only, versionados e têm um único result set", async () => {
  const [preflight, postVerifier] = await Promise.all([read(preflightPath), read(postVerifierPath)]);
  assertReadOnly(preflight);
  assertReadOnly(postVerifier);
  assert.match(preflight, /2026-08-13-google-ads-0034-preflight-v1/);
  assert.match(postVerifier, /2026-08-13-google-ads-0034-post-v1/);
  assert.match(preflight, /agency_distributed/);
  assert.match(postVerifier, /agency_distributed/);
  assert.match(postVerifier, /integration_secret_resolve/);
  assert.match(postVerifier, /service_role_execute/);
  assert.match(postVerifier, /shared_append_only_consumers/);
  assert.doesNotMatch(preflight, /\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i);
  assert.doesNotMatch(postVerifier, /\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i);
});

test("rollback é explícito, condicionado e não usa CASCADE", async () => {
  const sql = await read(rollbackPath);
  assert.match(sql, /\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /INTEGRATIONS_0034_ROLLBACK_BLOCKED_BY_DISTRIBUTED_BINDINGS/);
  assert.match(sql, /DROP FUNCTION public\.integration_secret_store_upsert/);
  assert.match(sql, /DROP FUNCTION public\.integration_secret_resolve/);
  assert.doesNotMatch(sql, /CASCADE/i);
  assert.doesNotMatch(sql, /DROP TABLE/i);
});

test("Google Ads usa exclusivamente o resolver de infraestrutura env da Plataforma", async () => {
  const source = await read(canonicalPath);
  assert.match(source, /getGoogleAdsPlatformConfig/);
  assert.match(source, /GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING/);
  assert.doesNotMatch(source, /createIntegrationSecretStore|integration_connections|secret_ref|Vault/);
});
