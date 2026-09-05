import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Batch 6 migration drops exactly six backup tables and the empty schema", async () => {
  const sql = await read("supabase/migrations/20260818011009_master_refresh_batch_6_drop_migration_backup.sql");
  const executableSql = sql.replace(/^--.*$/gm, "");
  const drops = sql.match(/DROP TABLE migration_backup\.[a-z0-9_]+;/g) ?? [];
  assert.equal(drops.length, 6);
  assert.match(sql, /DROP SCHEMA migration_backup;/);
  assert.match(sql, /BATCH_6_CANONICAL_TOTAL_DRIFT/);
  assert.match(sql, /\(147 \+ 147 \+ 5 \+ 1 \+ 1 \+ 2\) <> 303/);
  assert.doesNotMatch(executableSql, /CASCADE|DROP TABLE public\.|DELETE|TRUNCATE|ALTER TABLE/i);
  for (const fp of ["4ee7ae2d493302b1c931d61ce507cf84","f40807bb165f26961ecd43766d1b4d01","528c7c497898a3356b054728ffbf857d","2581e097fc9433204dfe990032518ce6","adad261679f64bd820ba9dfab3fdeae2","f95208610ded30018af00f5db9340eac"])
    assert.match(sql,new RegExp(fp));
});

test("Batch 6 preflight is read-only and dependency-bound", async () => {
  const sql = await read("supabase/scripts/master-refresh-batch-6-preflight-bound-read-only.sql");
  assert.match(sql,/BEGIN TRANSACTION READ ONLY/);
  assert.match(sql,/fk_count/);
  assert.match(sql,/trigger_count/);
  assert.match(sql,/function_deps/);
  assert.match(sql,/view_deps/);
  assert.match(sql,/sum\(row_count\)=303/);
  assert.doesNotMatch(sql,/\b(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER)\b/i);
});

test("Batch 6 post-verifier preserves canonical schema, integrations, Auth and Vault", async () => {
  const sql = await read("supabase/scripts/master-refresh-batch-6-post-verifier-bound-read-only.sql");
  assert.match(sql,/migration_backup_tables_zero/);
  assert.match(sql,/public_catalog_preserved/);
  assert.match(sql,/auth_users_preserved/);
  assert.match(sql,/connections_preserved/);
  assert.match(sql,/vault_preserved/);
  assert.match(sql,/briefings_compatibility_preserved/);
  assert.doesNotMatch(sql,/\b(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER)\b/i);
});
