import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/0026_public_default_acl_baseline.sql", "utf8");
const diagnostic = await readFile("supabase/scripts/default-acl-role-diagnostic-read-only.sql", "utf8");
const preflight = await readFile("supabase/scripts/default-acl-preflight-read-only.sql", "utf8");
const verifier = await readFile("supabase/scripts/default-acl-post-verifier-read-only.sql", "utf8");
const rollbackTemplate = await readFile("docs/compartilhado/rollback-template-0026-default-acl.md", "utf8");

const stripSqlCommentsAndLiterals = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*\n/g, "\n")
  .replace(/'(?:''|[^'])*'/g, "''");

const executableMigration = stripSqlCommentsAndLiterals(migration);
const readOnlyScripts = [diagnostic, preflight, verifier];

test("0026 restringe defaults somente a postgres/public", () => {
  assert.equal((migration.match(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/gi) ?? []).length, 3);
  assert.match(executableMigration, /REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(executableMigration, /REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(executableMigration, /REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role/i);
  assert.doesNotMatch(executableMigration, /ALTER DEFAULT PRIVILEGES FOR ROLE\s+supabase_admin/i);
  assert.doesNotMatch(executableMigration, /ON TYPES/i);
  assert.doesNotMatch(executableMigration, /CREATE TABLE|CREATE INDEX|CREATE FUNCTION|INSERT INTO|UPDATE\s+|DELETE\s+|DROP\s+/i);
});

test("0026 não altera objetos existentes, ownership ou escopos externos", () => {
  assert.doesNotMatch(executableMigration, /ALTER TABLE|OWNER TO|GRANT\s/i);
  for (const forbidden of ["supabase_admin", "auth", "storage", "graphql", "realtime", "extensions"]) {
    assert.doesNotMatch(migration, new RegExp(`\\b${forbidden}\\b`, "i"));
  }
});

test("diagnóstico separa owner do schema, owner de objeto e target role", () => {
  assert.match(diagnostic, /object_owner_roles/);
  assert.match(diagnostic, /classification:SCHEMA_OWNER/);
  assert.match(diagnostic, /classification:OBJECT_OWNER/);
  assert.match(diagnostic, /classification:DEFAULT_ACL_TARGET_ROLE/);
  assert.match(diagnostic, /FROM object_owner_summary/);
  assert.doesNotMatch(diagnostic, /owner_roles AS \([\s\S]*nspowner/);
});

test("preflight e post-verifier cobrem identidade, fingerprints e escopo", () => {
  for (const script of readOnlyScripts) {
    const executableSql = stripSqlCommentsAndLiterals(script);
    assert.match(script, /WITH\b/i);
    assert.match(script.trim(), /SELECT[\s\S]*FROM checks[\s\S]*;\s*$/i);
    assert.doesNotMatch(executableSql, /(?:^|[;\n]\s*)(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  }
  assert.match(preflight, /2026-08-11-default-acl-preflight-v2/);
  assert.match(preflight, /postgres-public-default-acl-fingerprint/);
  assert.match(preflight, /existing-public-object-acl-fingerprint/);
  assert.match(verifier, /2026-08-11-default-acl-post-verifier-v1/);
  assert.match(verifier, /effective_postgres_public_defaults/);
  assert.match(verifier, /acldefault/);
  for (const marker of [
    "target:default_acl_role",
    "future:' || object_type_name || ':prohibited_grants",
    "default_acl:supabase_admin:unchanged",
    "schemas:outside_public:unchanged",
    "existing_objects:acl:unchanged",
    "data:mutation",
  ]) assert.match(verifier, new RegExp(marker));
});

test("rollback é somente template baseado no snapshot real", () => {
  assert.match(rollbackTemplate, /default-acl-preflight-read-only\.sql/);
  for (const marker of ["role alvo", "schema", "object type", "grantee", "privilege", "grantability"]) {
    assert.match(rollbackTemplate, new RegExp(marker, "i"));
  }
  assert.doesNotMatch(rollbackTemplate, /```sql[\s\S]*\b(GRANT|REVOKE|ALTER)\b/i);
});
