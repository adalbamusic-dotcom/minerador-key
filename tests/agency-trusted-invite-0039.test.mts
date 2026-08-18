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

function block(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `missing block start: ${start}`);
  assert.ok(endIndex > startIndex, `missing block end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("0039 escolhe o proximo numero livre e preserva 0037", async () => {
  const [successor, historical] = await Promise.all([
    read("supabase/migrations/0039_trusted_invite_confirmed_agency_name.sql"),
    read("supabase/migrations/0037_agency_access_periods.sql"),
  ]);

  assert.match(successor, /CREATE FUNCTION public\.complete_agency_onboarding_with_confirmed_agency_name\(/);
  assert.match(successor, /p_token_hash text,[\s\S]+p_confirmed_agency_name text/);
  assert.match(successor, /RETURNS TABLE \(/);
  assert.match(successor, /ALTER FUNCTION public\.complete_agency_onboarding_with_confirmed_agency_name/);
  assert.match(successor, /OWNER TO postgres/);
  assert.match(successor, /SECURITY DEFINER/);
  assert.match(successor, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(successor, /GRANT EXECUTE[\s\S]+TO service_role/);
  assert.match(successor, /REVOKE ALL[\s\S]+FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(successor, /0031/);
  assert.doesNotMatch(successor, /CASCADE/i);
  assert.doesNotMatch(historical, /complete_agency_onboarding_with_confirmed_agency_name/);
});

test("0039 atualiza o nome sob lock e delega a unidade atomica da 0037", async () => {
  const migration = await read("supabase/migrations/0039_trusted_invite_confirmed_agency_name.sql");

  assert.match(migration, /canonical_assert_rpc_actor\(p_owner_user_id\)/);
  assert.match(migration, /hashtextextended\(p_idempotency_key::text, 37038\)/);
  assert.match(migration, /FROM public\.agency_invitations AS ai[\s\S]+FOR UPDATE/);
  assert.match(migration, /invitation\.source <> 'ADMIN_INVITE'/);
  assert.match(migration, /invitation\.status <> 'PENDING'/);
  assert.match(migration, /invitation\.access_expires_at IS NULL/);
  assert.match(migration, /confirmed_name := btrim\(coalesce\(p_confirmed_agency_name, ''\)\)/);
  assert.match(migration, /char_length\(confirmed_name\) NOT BETWEEN 1 AND 160/);
  assert.match(migration, /SET proposed_agency_name = confirmed_name/);
  assert.match(migration, /FROM public\.complete_agency_onboarding_with_access\(/g);
  assert.match(migration, /existing\.invitation_id IS DISTINCT FROM p_invitation_id/);
  assert.match(migration, /existing\.onboarding_source <> 'ADMIN_INVITE'/);
  assert.equal((migration.match(/\bCOMMIT;/g) || []).length, 1);
  assert.equal((migration.match(/\bBEGIN;/g) || []).length, 1);
  assert.doesNotMatch(executableSql(migration), /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});

test("trusted invite confirma nome editavel pela RPC 0039 sem separar a escrita", async () => {
  const [route, service, page] = await Promise.all([
    read("app/api/onboarding/agency/route.ts"),
    read("lib/server/agency-onboarding.ts"),
    read("app/onboarding/agencia/page.tsx"),
  ]);

  assert.match(service, /completeAgencyOnboardingWithConfirmedAgencyName/);
  assert.match(service, /client\.rpc\("complete_agency_onboarding_with_confirmed_agency_name"/);
  assert.match(service, /p_confirmed_agency_name: confirmedAgencyName/);
  assert.match(service, /p_token_hash: hashToken\(token\)/);
  const helperStart = service.indexOf("export async function completeAgencyOnboardingWithConfirmedAgencyName");
  const helperEnd = service.indexOf("/**", helperStart);
  assert.ok(helperStart >= 0);
  assert.ok(helperEnd > helperStart);
  assert.doesNotMatch(service.slice(helperStart, helperEnd), /\.from\("agency_invitations"\)\.update/);

  const adminBranchStart = route.indexOf('if (invitation.source === "ADMIN_INVITE")');
  const adminBranchEnd = route.indexOf("} else {", adminBranchStart);
  assert.ok(adminBranchStart >= 0);
  assert.ok(adminBranchEnd > adminBranchStart);
  const adminBranch = route.slice(adminBranchStart, adminBranchEnd);
  assert.match(adminBranch, /completeAgencyOnboardingWithConfirmedAgencyName/);
  assert.match(adminBranch, /confirmedAgencyName: body\?\.confirmedAgencyName/);
  assert.doesNotMatch(adminBranch, /completeAgencyOnboarding\(client/);
  assert.match(route, /completeAgencyOnboarding\(client/);

  assert.match(page, /value=\{confirmedAgencyName\}/);
  assert.match(page, /setConfirmedAgencyName\(body\.invitation\.proposed_agency_name\)/);
  assert.match(page, /name="confirmedAgencyName"/);
  assert.match(page, /confirmedAgencyName \}/);
  assert.match(page, /Responsável/);
  assert.match(page, /E-mail de acesso/);
  assert.match(page, /Acesso de teste até/);
  assert.match(page, /!response\.ok\) throw new Error/);
});

test("preflight e post-verifier 0039 possuem um unico result set read-only e fingerprint identico", async () => {
  const [preflight, post, rollback] = await Promise.all([
    read("supabase/scripts/agency-trusted-invite-0039-preflight-read-only.sql"),
    read("supabase/scripts/agency-trusted-invite-0039-post-verification-read-only.sql"),
    read("supabase/scripts/agency-trusted-invite-0039-rollback.sql"),
  ]);

  for (const script of [preflight, post]) {
    const executable = executableSql(script);
    assert.equal((executable.match(/;/g) || []).length, 1);
    for (const keyword of ["INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "GRANT", "REVOKE", "TRUNCATE", "CALL"]) {
      assert.doesNotMatch(executable, new RegExp(`\\b${keyword}\\b`, "i"), keyword);
    }
    assert.match(script, /SELECT check_name, expected, observed, verdict/);
    assert.match(script, /UNION ALL/);
    assert.doesNotMatch(script, /CREATE TEMP|pg_temp\._/i);
  }

  assert.match(preflight, /PRE_0039_PRESERVED_CATALOG_FINGERPRINT/);
  assert.match(preflight, /PRE_0039_DEFAULT_ACL_FINGERPRINT/);
  assert.match(preflight, /PRE_0039_BUSINESS_ROW_COUNTS/);
  assert.match(post, /914c51d5f93f843a06e7f99ad765e681/);
  assert.match(post, /6514acb46db2e6ac8001c8cbd56ebfc1/);
  assert.match(post, /agencies=3\|agency_access_periods=2\|agency_applications=1\|agency_invitations=3\|agency_memberships=3\|agency_onboardings=2/);
  assert.doesNotMatch(post, /PASTE_PRE_0039/);
  assert.match(post, /2026-08-13-v2/);
  assert.match(post, /volatility = 'v'/);
  assert.match(post, /FULLY_EXPECTED_POST_APPLY/);
  assert.match(post, /PARTIAL_APPLY/);
  assert.match(post, /NOT_APPLIED/);
  assert.doesNotMatch(post, /FROM public\.complete_agency_onboarding_with_confirmed_agency_name/);
  assert.doesNotMatch(post, /JOIN public\.complete_agency_onboarding_with_confirmed_agency_name/);

  assert.equal(
    block(preflight, "catalog_relation_rows AS (", "business_row_counts AS (")
      .replace(/\r\n/g, "\n"),
    block(post, "catalog_relation_rows AS (", "business_row_counts AS (")
      .replace(/\r\n/g, "\n"),
  );
  assert.equal(
    block(preflight, "default_acl_rows AS (", "business_row_counts AS (")
      .replace(/\r\n/g, "\n"),
    block(post, "default_acl_rows AS (", "business_row_counts AS (")
      .replace(/\r\n/g, "\n"),
  );

  assert.match(rollback, /DROP FUNCTION public\.complete_agency_onboarding_with_confirmed_agency_name/);
  assert.doesNotMatch(rollback, /CASCADE/i);
  assert.doesNotMatch(rollback, /DELETE FROM|UPDATE public\.|TRUNCATE/i);
});
