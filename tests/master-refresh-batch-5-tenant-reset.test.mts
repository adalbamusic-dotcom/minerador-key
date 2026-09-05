import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Batch 5 reset is allowlisted, transactional, and never truncates or disables protection", async () => {
  const sql = await read("supabase/scripts/master-refresh-batch-5-tenant-reset.sql");
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(sql, /TRUNCATE|DISABLE\s+TRIGGER|DISABLE\s+ROW\s+LEVEL\s+SECURITY|DROP\s+TABLE/i);
  for (const id of [
    "1febb431-4e44-49e9-b8cd-12115f4ad999", "3cc14013-3296-4094-80de-712abc4ceae8",
    "cd84f5ee-b939-4b05-afa4-52aabb8c9aa4", "ae851a64-5bff-449b-865c-ec6aa950be38",
    "f514a553-ce4a-472e-9aec-c3fecff375f1", "033b0cde-6e00-472c-b9d6-3c10ad33ae61",
  ]) assert.match(sql, new RegExp(id));
});

test("Batch 5 never deletes Auth, Connections, Vault, providers, capabilities, or platform quotas", async () => {
  const sql = await read("supabase/scripts/master-refresh-batch-5-tenant-reset.sql");
  for (const protectedObject of ["auth.users", "integration_connections", "vault.secrets", "integration_providers", "integration_capabilities", "integration_quota_policies"])
    assert.doesNotMatch(sql, new RegExp(`DELETE\\s+FROM\\s+(?:public\\.)?${protectedObject.replace(".", "\\.")}`, "i"));
});

test("immutable exceptions are transaction-scoped and original guards are restored", async () => {
  const sql = await read("supabase/scripts/master-refresh-batch-5-tenant-reset.sql");
  assert.match(sql, /set_config\('app\.master_refresh_batch_5'.*true\)/);
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\.integration_usage_events_prevent_mutation/g) ?? []).length, 2);
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\.minerador_discovery_run_immutable/g) ?? []).length, 2);
  assert.match(sql, /BATCH_5_GUARD_RESTORE_FAILED/);
});

test("preflight and post-verifier are read-only and bound to preservation fingerprints", async () => {
  const pre = await read("supabase/scripts/master-refresh-batch-5-tenant-reset-preflight-bound-read-only.sql");
  const post = await read("supabase/scripts/master-refresh-batch-5-tenant-reset-post-verifier-bound-read-only.sql");
  for (const sql of [pre, post]) {
    assert.match(sql, /BEGIN TRANSACTION READ ONLY/);
    assert.match(sql, /ROLLBACK/);
    assert.doesNotMatch(sql, /\b(?:DELETE|UPDATE|INSERT|TRUNCATE|ALTER|DROP)\b/i);
  }
  assert.match(pre, /ce3174ca2afe39b352ae704c6f96153c/);
  assert.match(post, /dataforseo_preserved/);
  assert.match(post, /openrouter_preserved/);
  assert.match(post, /vault_preserved/);
  assert.match(post, /canonical_schema_preserved/);
});
