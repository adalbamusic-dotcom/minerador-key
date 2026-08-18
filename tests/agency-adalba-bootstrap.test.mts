import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

const readOnlyStatement = /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/im;
const forbiddenDomainWrite = /(?:^|\n)\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?:perfis|marcas|brand_memberships|agency_brands|listas_kgr|keywords_kgr)\b/im;

test("preflight resolves the canonical identity and target Agency without writes", async () => {
  const sql = await read("supabase/scripts/agency-adalba-bootstrap-dry-run.sql");

  assert.match(sql, /adalbapro@gmail\.com/);
  assert.match(sql, /AdalbaPro/);
  assert.match(sql, /adalbapro/);
  assert.match(sql, /auth\.users/);
  assert.match(sql, /email_confirmed_at IS NOT NULL/);
  assert.match(sql, /canonical_actor_is_global_admin\(uuid\)/);
  assert.match(sql, /canonical_actor_can_manage_agency\(uuid,uuid\)/);
  assert.match(sql, /scope:preexisting_data/);
  assert.match(sql, /bootstrap:ready/);
  assert.doesNotMatch(sql, readOnlyStatement);
  assert.doesNotMatch(sql, /scalbeto|lindisse|canonical_role|perfis\.marca_id/i);
});

test("bootstrap is transactional, idempotent, and writes only Agency ownership", async () => {
  const sql = await read("supabase/scripts/agency-adalba-bootstrap.sql");

  assert.match(sql, /^--[\s\S]*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /AGENCY_BOOTSTRAP_IDENTITY_CONFLICT/);
  assert.match(sql, /AGENCY_BOOTSTRAP_AGENCY_CONFLICT/);
  assert.match(sql, /AGENCY_BOOTSTRAP_MEMBERSHIP_CONFLICT/);
  assert.match(sql, /ADALBAPRO_BOOTSTRAP_PARTIAL_STATE_DETECTED/);
  assert.match(sql, /AGENCY_BOOTSTRAP_SCOPE_CHANGED/);
  assert.match(sql, /v_expected_agencies_after/);
  assert.match(sql, /v_expected_memberships_after/);
  assert.doesNotMatch(sql, /IF[\s\S]*CASE WHEN v_agency_created/);
  assert.equal([...sql.matchAll(/^\s*IF\b/gm)].length, [...sql.matchAll(/^\s*END IF;/gm)].length);
  assert.equal([...sql.matchAll(/^DO \$\$/gm)].length, 1);
  assert.equal([...sql.matchAll(/^END;$/gm)].length, 1);
  assert.equal([...sql.matchAll(/^\$\$;$/gm)].length, 1);
  assert.equal([...sql.matchAll(/^COMMIT;$/gm)].length, 1);
  assert.match(sql, /INSERT INTO public\.agencies/);
  assert.match(sql, /INSERT INTO public\.agency_memberships/);
  assert.doesNotMatch(sql, forbiddenDomainWrite);
  assert.doesNotMatch(sql, /UPDATE\s+public\./i);
  assert.doesNotMatch(sql, /scalbeto|lindisse|canonical_role|perfis\.marca_id/i);
});

test("postcheck is read-only and verifies the two identity facets and clean scope", async () => {
  const sql = await read("supabase/scripts/agency-adalba-post-bootstrap-validation.sql");

  assert.match(sql, /post:global_admin_preserved/);
  assert.match(sql, /post:agency_exactly_one/);
  assert.match(sql, /post:owner_membership/);
  assert.match(sql, /post:no_second_operational_agency/);
  assert.match(sql, /post:no_brand_or_minerador_bootstrap_data/);
  assert.match(sql, /post:verdict/);
  assert.doesNotMatch(sql, readOnlyStatement);
  assert.doesNotMatch(sql, /scalbeto|lindisse|canonical_role|perfis\.marca_id/i);
});

test("rollback is guarded and cannot remove Brand or Minerador data", async () => {
  const sql = await read("supabase/scripts/agency-adalba-bootstrap.rollback.sql");

  assert.match(sql, /^--[\s\S]*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /AGENCY_BOOTSTRAP_ROLLBACK_MEMBERSHIP_CONFLICT/);
  assert.match(sql, /AGENCY_BOOTSTRAP_ROLLBACK_BRAND_LINK_EXISTS/);
  assert.match(sql, /DELETE FROM public\.agency_memberships/);
  assert.match(sql, /DELETE FROM public\.agencies/);
  assert.doesNotMatch(sql, forbiddenDomainWrite);
  assert.doesNotMatch(sql, /scalbeto|lindisse|canonical_role|perfis\.marca_id/i);
});
