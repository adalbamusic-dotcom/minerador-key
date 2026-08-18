import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/0025_integrations_usage_acl_hardening.sql", "utf8");
const preflight = await readFile("supabase/scripts/integrations-0025-acl-hardening-preflight-read-only.sql", "utf8");
const verifier = await readFile("supabase/scripts/integrations-0025-acl-hardening-post-verification-read-only.sql", "utf8");
const stripSqlCommentsAndLiterals = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*\n/g, "\n")
  .replace(/'(?:''|[^'])*'/g, "''");
const executableMigration = stripSqlCommentsAndLiterals(migration);

const tables = [
  "integration_providers",
  "integration_capabilities",
  "integration_connections",
  "integration_grants",
  "integration_bindings",
  "integration_quota_policies",
  "integration_usage_events",
];

test("0025 depende das sete tabelas e não cria schema ou dados", () => {
  for (const table of tables) assert.match(migration, new RegExp(`public\\.${table}`));
  assert.doesNotMatch(executableMigration, /CREATE TABLE|CREATE INDEX|CREATE FUNCTION|INSERT INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER DEFAULT PRIVILEGES/i);
});

test("0025 remove ACL direta ampla do service_role antes dos grants mínimos", () => {
  assert.match(executableMigration, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM service_role/);
  const catalogGrant = executableMigration.match(/GRANT SELECT, INSERT, UPDATE ON TABLE[\s\S]*?TO service_role;/i)?.[0] ?? "";
  assert.match(catalogGrant, /integration_quota_policies/);
  assert.doesNotMatch(catalogGrant, /integration_usage_events/);
  assert.match(executableMigration, /GRANT SELECT, INSERT ON TABLE public\.integration_usage_events TO service_role/);
});

test("0025 preserva authenticated somente leitura e fecha anon/PUBLIC", () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE[\s\S]*integration_usage_events[\s\S]*TO authenticated/);
});

test("0025 não altera default ACL ou ownership", () => {
  assert.doesNotMatch(executableMigration, /ALTER DEFAULT PRIVILEGES/i);
  assert.doesNotMatch(executableMigration, /ALTER TABLE[\s\S]+OWNER TO/i);
});

test("preflight e verifier 0025 são read-only, versionados e têm um result set", () => {
  for (const script of [preflight, verifier]) {
    const executableSql = stripSqlCommentsAndLiterals(script);
    assert.match(script, /^(?:\s*--[^\n]*\n)*\s*WITH\b/i);
    assert.match(script.trim(), /SELECT check_name, expected, observed, verdict[\s\S]*;\s*$/i);
    assert.doesNotMatch(executableSql, /(?:^|[;\n]\s*)(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  }
  assert.match(preflight, /2026-08-11-integrations-0025-acl-hardening-preflight-v1/);
  assert.match(verifier, /2026-08-11-integrations-0025-acl-hardening-post-v1/);
});

test("verifier 0025 cobre ACL fina, RLS, policies, legado estrutural e DATA_DELTA", () => {
  for (const marker of [
    "service_role",
    "authenticated",
    "anon",
    "MAINTAIN",
    "relrowsecurity",
    "pg_policies",
    "on_delete_restrict",
    "constraints:0024_preserved",
    "indexes:0024_preserved",
    "trigger:usage_append_only",
    "data_delta:0025",
    "usage:idempotency_append_only",
  ]) assert.match(verifier, new RegExp(marker));
});
