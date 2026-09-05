import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath: string) {
  return readFile(new URL(relativePath, root), "utf8");
}

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

function executableSql(source: string) {
  return withoutComments(source).replace(/'(?:''|[^'])*'/g, "''");
}

test("re-preflight do par SiloDNA/SiloPage preserva o gate pré-apply e é read-only", async () => {
  const source = await read("supabase/scripts/silo-pair-atomicity-preflight-read-only.sql");
  const sql = executableSql(source);

  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|GRANT|REVOKE|CALL|TEMP)\b/i);
  assert.equal((source.match(/SELECT\s+\n?\s*check_name::text/g) || []).length, 1);
  assert.match(source, /object_name::text/);
  assert.match(source, /observed::text/);
  assert.match(source, /verdict::text/);

  for (const check of [
    "MIGRATION_ALREADY_APPLIED",
    "SILO_PAIR_RPC_ALREADY_EXISTS",
    "SILO_PAIR_FUNCTION_COLLISION",
    "SILO_DNA_PREREQUISITES",
    "SILO_PAGE_PREREQUISITES",
    "BRAND_PREREQUISITES",
    "SILO_REFERENCES",
    "VERSION_PREREQUISITES",
    "AUTH_PREREQUISITES",
    "GRAPH_TO_SILO_PAIR_CONFLICT",
    "SILO_PAIR_TO_GRAPH_DEPENDENCY",
    "SILO_PAIR_REMOTE_SCHEMA_CONFLICT",
    "SILO_PAIR_REMOTE_FUNCTION_CONFLICT",
    "SILO_PAIR_REMOTE_GRANT_CONFLICT",
    "SILO_PAIR_MIGRATION_PRECONDITIONS",
    "REMOTE_DDL",
    "REMOTE_DML",
    "TEMP_OBJECTS",
  ]) {
    assert.match(source, new RegExp(check));
  }

  assert.match(source, /to_regprocedure\(f\.function_identity\)/);
  assert.match(source, /same_name_count/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /graph_function_refs/);
  assert.match(source, /target_dependents/);
});

test("migration do par mantém segurança, atomicidade e ausência de dependência com o Graph", async () => {
  const migration = await read("supabase/migrations/20260826225154_silo_pair_atomicity.sql");

  assert.match(migration, /CREATE FUNCTION public\.persist_silo_pair_atomic\(/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.persist_silo_pair_atomic\([\s\S]*TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.persist_silo_pair_atomic/);
  assert.match(migration, /canonical_assert_rpc_actor\(p_actor_user_id\)/);
  assert.match(migration, /canonical_actor_can_access_brand/);
  assert.match(migration, /canonical_actor_can_use_brand_action/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.equal((migration.match(/INSERT INTO public\.editorial_artifact_versions/g) || []).length, 2);
  assert.match(migration, /p_silo_page_status NOT IN \('draft', 'proposed', 'approved', 'rejected', 'superseded'\)/);
  assert.match(migration, /page_previous_version_id IS DISTINCT FROM latest_page_version_id/);
  assert.doesNotMatch(migration, /internal_link_graph/i);
});
