import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260817231313_master_refresh_batch_2_security_hardening.sql", "utf8");
const preflight = readFileSync("supabase/scripts/master-refresh-batch-2-security-preflight-bound-read-only.sql", "utf8");
const preservation = readFileSync("supabase/scripts/master-refresh-batch-2-preservation-baseline-bound-read-only.sql", "utf8");
const post = readFileSync("supabase/scripts/master-refresh-batch-2-security-post-verifier-bound-read-only.sql", "utf8");
const rollback = readFileSync("supabase/scripts/master-refresh-batch-2-security-rollback.sql", "utf8");

test("briefings_artigos becomes service-role-only without changing RLS", () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.briefings_artigos FROM anon, authenticated/);
  assert.doesNotMatch(migration, /ALTER TABLE public\.briefings_artigos (?:DISABLE|ENABLE|FORCE|NO FORCE) ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*briefings_artigos/i);
});

test("canonical RPCs preserve authenticated and service_role exposure only", () => {
  const rpcNames = ["canonical_apply_brand_agency_capability_restriction", "canonical_assign_agency_owner", "canonical_revoke_brand_agency_capability_restriction", "canonical_set_agency_brand_link", "canonical_set_agency_membership_status", "canonical_upsert_agency_membership"];
  for (const name of rpcNames) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+ FROM PUBLIC, anon;`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+ TO authenticated, service_role;`));
  }
});

test("trigger functions lose direct role execution and six functions fix search_path", () => {
  const triggerNames = ["canonical_validate_single_operational_agency_actor", "minerador_discovery_candidate_brand_guard", "minerador_discovery_import_brand_guard", "minerador_discovery_run_immutable", "tenant_0005_protect_last_owner", "tenant_0005_protect_owner_change", "protect_marca_with_published", "protect_published_briefing", "protect_published_keyword", "protect_published_lista"];
  for (const name of triggerNames) assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]*\\) FROM PUBLIC, anon, authenticated, service_role;`));
  assert.equal((migration.match(/SET search_path TO pg_catalog, public, pg_temp/g) || []).length, 6);
});

test("policy changes are limited to three non-editorial equivalent init-plan fixes", () => {
  assert.equal((migration.match(/ALTER POLICY/g) || []).length, 3);
  assert.match(migration, /tenant_0005_memberships_select/);
  assert.match(migration, /tenant_0005_marcas_insert/);
  assert.match(migration, /minerador_discovery_runs_insert/);
  assert.doesNotMatch(migration, /editorial_(?:artifact|workflow|serp|saved)/);
  assert.doesNotMatch(migration, /content_documents|publication_records/);
});

test("package is bound, read-only where required, and rollback is guarded", () => {
  assert.match(preflight, /f8ba0c721502551a5ed6706c304efe30/);
  assert.match(preservation, /a544a58d954b7ba10bde6d5f4db3492b/);
  assert.match(post, /DANGEROUS_ANON_ACL/);
  assert.match(post, /UNINTENDED_PUBLIC_FUNCTION_EXECUTE/);
  assert.doesNotMatch(`${preflight}\n${preservation}\n${post}`, /^\s*(?:ALTER|DROP|DELETE|UPDATE|INSERT|TRUNCATE|GRANT|REVOKE)\b/gmi);
  assert.match(rollback, /BATCH_2_ROLLBACK_POST_STATE_NOT_CONFIRMED/);
  assert.match(rollback, /^BEGIN;/m);
  assert.match(rollback, /^COMMIT;/m);
});
