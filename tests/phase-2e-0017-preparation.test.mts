import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const executableSql = (sql: string) => sql.replace(/^--.*$/gm, "");

test("Fase 2E prepara 0017 como corte físico explícito e transacional", async () => {
  const migration = await read("supabase/migrations/0017_remove_legacy_identity_contracts.sql");
  const executable = executableSql(migration);

  assert.equal((migration.match(/\bBEGIN;/gi) ?? []).length, 1);
  assert.equal((migration.match(/\bCOMMIT;/gi) ?? []).length, 1);
  assert.match(migration, /DROP COLUMN user_key/);
  assert.match(migration, /DROP COLUMN marca_id/);
  assert.match(migration, /DROP COLUMN canonical_role/);
  assert.match(migration, /expected_dependency_count <> 6/);
  assert.match(migration, /PHASE_2E_0017_DROP_EXPECTED_CONSTRAINT/);
  assert.match(migration, /PHASE_2E_0017_DROP_EXPECTED_INDEX/);
  assert.match(migration, /SELECT DISTINCT constraint_row\.conrelid/);
  assert.match(migration, /SELECT DISTINCT index_relation\.oid/);
  assert.doesNotMatch(executable, /\bCASCADE\b/i);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(executable, /\bSET\s+(?:owner_user_id|member_user_id|role)\b/i);
});

test("Fase 2E inclui manifest, rollback honesto e pós-validação somente leitura", async () => {
  const [manifest, rollback, validation, documentation] = await Promise.all([
    read("supabase/scripts/fase-2e-0017-dependency-manifest-read-only.sql"),
    read("supabase/scripts/fase-2e-0017-rollback.sql"),
    read("supabase/scripts/fase-2e-legacy-contracts-post-validation-read-only.sql"),
    read("docs/compartilhado/auditorias/fase-2e-migration-0017-preparacao.md"),
  ]);

  assert.match(manifest, /expected_drop_dependencies/);
  assert.match(manifest, /READY_FOR_0017_REVIEW/);
  assert.doesNotMatch(executableSql(manifest), /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i);

  assert.match(rollback, /ADD COLUMN IF NOT EXISTS user_key text/);
  assert.match(rollback, /ADD COLUMN IF NOT EXISTS marca_id uuid/);
  assert.match(rollback, /ADD COLUMN IF NOT EXISTS canonical_role text/);
  assert.doesNotMatch(executableSql(rollback), /\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.match(rollback, /snapshot pre-0017/i);

  for (const gate of [
    "user_key_column",
    "perfis_marca_id_column",
    "canonical_role_column",
    "member_user_id_contract",
    "agency_role_contract",
    "canonical_identity_functions",
    "canonical_editorial_functions",
    "canonical_rls",
    "brand_owner_contract",
    "brand_memberships_contract",
    "agency_owner_contract",
    "agency_memberships_contract",
    "legacy_identity_columns_remaining",
    "post_migration_status",
  ]) assert.match(validation, new RegExp(gate));
  assert.match(validation, /PENDING_SEPARATE_HARDENING/);
  assert.doesNotMatch(executableSql(validation), /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i);

  assert.match(documentation, /PENDING_SEPARATE_HARDENING/);
  assert.match(documentation, /remote_operations: NONE/);
  assert.match(documentation, /migration_0017_execution: NOT_PERFORMED/);
});
