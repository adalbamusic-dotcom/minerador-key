import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

function executableSql(source: string) {
  return source
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

test("0037 cria o periodo de acesso separado da validade tecnica do convite", async () => {
  const migration = await read("supabase/migrations/0037_agency_access_periods.sql");
  assert.match(migration, /CREATE TABLE public\.agency_access_periods/);
  assert.match(migration, /access_expires_at timestamptz/);
  assert.match(migration, /origin IN \('PUBLIC_FREE_TRIAL', 'ADMIN_TRUSTED_INVITE', 'PLATFORM_INTERNAL'\)/);
  assert.match(migration, /access_ends_at_value := activation_at \+ interval '30 days'/);
  assert.match(migration, /access_ends_at_value := invitation\.access_expires_at/);
  assert.match(migration, /NOT VALID/);
  assert.match(migration, /ON DELETE RESTRICT/g);
  assert.match(migration, /ALTER TABLE public\.agency_access_periods ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON public\.agency_access_periods TO service_role/);
  assert.doesNotMatch(migration, /GRANT DELETE ON public\.agency_access_periods/);
  assert.doesNotMatch(migration, /0031/);
  assert.doesNotMatch(migration, /CASCADE/i);
});

test("0037 usa RPCs sucessoras para concluir Agency, owner, membership e acesso", async () => {
  const [migration, service, route, panel] = await Promise.all([
    read("supabase/migrations/0037_agency_access_periods.sql"),
    read("lib/server/agency-onboarding.ts"),
    read("app/api/admin/agency-invitations/route.ts"),
    read("modules/admin/agencies-admin-panel.tsx"),
  ]);
  assert.match(migration, /complete_agency_onboarding_with_access/);
  assert.match(migration, /complete_agency_onboarding_authenticated_with_access/);
  assert.match(migration, /INSERT INTO public\.agency_memberships/);
  assert.match(migration, /INSERT INTO public\.agency_access_periods/);
  assert.match(migration, /agency_onboardings/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_idempotency_key::text, 37038\)\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_owner_user_id::text, 37037\)\)/);
  assert.match(service, /rpc\("complete_agency_onboarding_with_access"/);
  assert.match(service, /rpc\("complete_agency_onboarding_authenticated_with_access"/);
  assert.match(service, /access_expires_at: accessExpiresAt\.toISOString\(\)/);
  assert.match(route, /accessExpiresAt: body\?\.accessExpiresAt/);
  assert.match(panel, /Validade do acesso/);
  assert.match(panel, /accessExpiresAt/);
  assert.doesNotMatch(panel, /value=\{form\.expiresAt\}/);
});

test("preflight e post-verifier 0037 sao um unico result set read-only", async () => {
  const [preflight, post, rollback] = await Promise.all([
    read("supabase/scripts/agency-access-period-0037-preflight-read-only.sql"),
    read("supabase/scripts/agency-access-period-0037-post-verification-read-only.sql"),
    read("supabase/scripts/agency-access-period-0037-rollback.sql"),
  ]);
  for (const script of [preflight, post]) {
    const executable = executableSql(script);
    assert.equal((executable.match(/;/g) || []).length, 1);
    for (const keyword of ["INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "GRANT", "REVOKE", "TRUNCATE", "CALL"]) {
      assert.doesNotMatch(executable, new RegExp(`\\b${keyword}\\b`, "i"), keyword);
    }
    assert.match(script, /SELECT check_name, expected, observed, verdict/);
    assert.match(script, /UNION ALL/);
    assert.doesNotMatch(script, /CREATE TEMP/i);
  }
  assert.match(preflight, /2026-08-13-v2/);
  assert.match(post, /93e7e0f556ed1ae7a37fd11f4ae84db2/);
  assert.match(post, /5ca6a32605ce5bf4f37486496edef3de/);
  assert.match(post, /2026-08-13-v4/);
  assert.match(post, /access_expires_at/);
  assert.match(post, /ck_agency_invitations_trusted_access_expiry_0037/);
  assert.match(post, /264f4672ef5d32b9d39de2e6e75ac174/);
  assert.match(post, /FULLY_EXPECTED_POST_APPLY/);
  assert.match(post, /PARTIAL_APPLY/);
  assert.match(post, /NOT_APPLIED/);
  assert.match(rollback, /DROP TABLE public\.agency_access_periods/);
  assert.doesNotMatch(rollback, /CASCADE/i);
  assert.match(rollback, /ROLLBACK_BLOCKED_BY_ACCESS_PERIOD_DATA/);
});
