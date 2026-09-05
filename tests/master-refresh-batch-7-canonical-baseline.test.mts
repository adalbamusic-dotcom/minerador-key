import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sqlUrl = new URL("../supabase/scripts/master-refresh-batch-7-canonical-baseline-read-only.sql", import.meta.url);

test("Batch 7 baseline is read-only and excludes the migration ledger", async () => {
  const sql = await readFile(sqlUrl, "utf8");
  assert.match(sql, /BEGIN TRANSACTION READ ONLY/);
  assert.match(sql, /ROLLBACK;/);
  assert.match(sql, /'ledger_in_proof_contract',false/);
  assert.doesNotMatch(sql, /supabase_migrations\.schema_migrations/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/im);
});

test("Batch 7 binds all global foundation gates", async () => {
  const sql = await readFile(sqlUrl, "utf8");
  for (const gate of [
    "canonical_public_catalog",
    "auth_users_preserved",
    "global_admin_preserved",
    "all_public_tables_rls",
    "dangerous_anon_acl",
    "unintended_public_function_execute",
    "security_definer_anon_public_exposure",
    "google_ads_dynamic_legacy_absent",
    "dataforseo_connection_preserved",
    "openrouter_connection_preserved",
    "vault_preserved",
    "currency_code_contract_preserved",
    "brand_dna_contract_preserved",
    "editorial_event_ledgers_preserved",
    "migration_backup_absent",
  ]) assert.match(sql, new RegExp(gate));
});

test("Batch 7 captures deterministic structure and sanitized table fingerprints", async () => {
  const sql = await readFile(sqlUrl, "utf8");
  assert.match(sql, /structure_categories/);
  assert.match(sql, /public_table_data/);
  assert.match(sql, /row_fingerprint/);
  assert.match(sql, /DATABASE_CANONICAL_BASELINE_DATE = 2026-08-17/);
  assert.match(sql, /4d8f5ff2f83600c9cb6e0c8c26b7de07/);
  assert.match(sql, /11e8455d68e5c9eb87a85570b165295d/);
});
