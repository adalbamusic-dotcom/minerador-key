import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const platformInternalScripts = [
  "supabase/scripts/agency-adalba-platform-internal-preflight-read-only.sql",
  "supabase/scripts/agency-adalba-platform-internal-bootstrap.sql",
  "supabase/scripts/agency-adalba-platform-internal-post-verification-read-only.sql",
  "supabase/scripts/agency-adalba-platform-internal-bootstrap.rollback.sql",
] as const;
const allowedRelations = new Set([
  "auth.users",
  "public.perfis",
  "public.agencies",
  "public.agency_memberships",
  "public.agency_access_periods",
]);
const requiredProcedures = new Set([
  "public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)",
  "public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)",
]);

function executableSql(source: string) {
  return source
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

function relationReferences(source: string) {
  const withoutComments = source
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const references = new Set<string>();
  const patterns = [
    /\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|LOCK\s+TABLE)\s+(?:ONLY\s+)?((?:public|auth)\.[A-Za-z_][A-Za-z0-9_]*)/gi,
    /\bto_regclass\(\s*'((?:public|auth)\.[A-Za-z_][A-Za-z0-9_]*)'\s*\)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of withoutComments.matchAll(pattern)) references.add(match[1].toLowerCase());
  }
  return references;
}

function procedureReferences(source: string) {
  const withoutComments = source
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const references = new Set<string>();
  const pattern = /\bto_regprocedure\(\s*'([^']+)'\s*\)/gi;
  for (const match of withoutComments.matchAll(pattern)) references.add(match[1].toLowerCase());
  return references;
}

test("platform-internal package has only approved relation and RPC dependencies", async () => {
  const relations = new Set<string>();
  const procedures = new Set<string>();

  for (const path of platformInternalScripts) {
    const sql = await read(path);
    for (const relation of relationReferences(sql)) relations.add(relation);
    for (const procedure of procedureReferences(sql)) procedures.add(procedure);
  }

  assert.deepEqual([...relations].sort(), [...allowedRelations].sort());
  assert.deepEqual([...procedures].sort(), [...requiredProcedures].sort());
});

test("platform-internal preflight is one read-only result set", async () => {
  const sql = await read("supabase/scripts/agency-adalba-platform-internal-preflight-read-only.sql");
  const executable = executableSql(sql);

  assert.equal((executable.match(/;/g) || []).length, 1);
  assert.match(sql, /adalbapro@gmail\.com/);
  assert.match(sql, /AdalbaPro/);
  assert.match(sql, /adalbapro/);
  assert.match(sql, /PLATFORM_INTERNAL/);
  assert.match(sql, /global_admin_independent/);
  assert.match(sql, /no_platform_internal_duplicate/);
  assert.match(sql, /bootstrap:ready/);
  assert.match(sql, /platform-internal-preflight-v2/);
  assert.doesNotMatch(executable, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|CALL|DO|RAISE)\b/i);
  assert.match(sql, /SELECT check_name, expected, observed, verdict/);
});

test("platform-internal bootstrap inserts only an idempotent access period", async () => {
  const sql = await read("supabase/scripts/agency-adalba-platform-internal-bootstrap.sql");

  assert.match(sql, /^--[\s\S]*BEGIN;/);
  assert.match(sql, /COMMIT;\s*WITH\s+params\s+AS\s*\(/);
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(sql, /INSERT INTO public\.agency_access_periods/);
  assert.match(sql, /'FREE'/);
  assert.match(sql, /'PLATFORM_INTERNAL'/);
  assert.match(sql, /v_bootstrap_starts_at timestamptz := statement_timestamp\(\)/);
  assert.match(sql, /v_access_period_id/);
  assert.match(sql, /ADALBAPRO_PLATFORM_INTERNAL_ALREADY_PRESENT/);
  assert.match(sql, /ADALBAPRO_PLATFORM_INTERNAL_DUPLICATE/);
  assert.match(sql, /ADALBAPRO_PLATFORM_INTERNAL_ACCESS_CONFLICT/);
  assert.match(sql, /ADALBAPRO_PLATFORM_INTERNAL_POSTCONDITION_FAILED/);
  assert.match(sql, /activated_by_actor_user_id/);
  assert.ok(sql.indexOf("v_access_periods_before") < sql.indexOf("INSERT INTO public.agency_access_periods"));
  assert.doesNotMatch(sql, /INSERT INTO public\.(agencies|agency_memberships|marcas|brand_memberships|agency_brands|minerador_keyword_lists|minerador_keywords)/i);
  assert.doesNotMatch(sql, /UPDATE\s+public\./i);
});

test("platform-internal READY path reaches INSERT and cannot report success empty", async () => {
  const sql = await read("supabase/scripts/agency-adalba-platform-internal-bootstrap.sql");
  const duplicateGuardIndex = sql.indexOf("IF v_platform_internal_active_count > 1 THEN");
  const branchIndex = sql.indexOf("IF v_platform_internal_active_count = 1 THEN");
  const insertIndex = sql.indexOf("INSERT INTO public.agency_access_periods");
  const createdFlagIndex = sql.indexOf("v_access_period_created := true;");
  const postconditionIndex = sql.indexOf("ADALBAPRO_PLATFORM_INTERNAL_POSTCONDITION_FAILED");
  const noticeIndex = sql.indexOf("ADALBAPRO_PLATFORM_INTERNAL_CREATED");

  assert.ok(duplicateGuardIndex >= 0);
  assert.ok(branchIndex > duplicateGuardIndex);
  assert.ok(insertIndex > branchIndex);
  assert.ok(createdFlagIndex > insertIndex);
  assert.ok(postconditionIndex > createdFlagIndex);
  assert.ok(noticeIndex > postconditionIndex);

  const branch = sql.slice(branchIndex, postconditionIndex);
  assert.match(branch, /IF v_platform_internal_active_count = 1 THEN/);
  assert.match(branch, /ELSE[\s\S]*INSERT INTO public\.agency_access_periods/);
  assert.match(sql, /ADALBAPRO_PLATFORM_INTERNAL_ALREADY_PRESENT/);

  assert.equal((sql.match(/INSERT INTO public\.agency_access_periods/g) || []).length, 1);
  assert.doesNotMatch(sql.slice(insertIndex), /\bROLLBACK\b/i);
  assert.doesNotMatch(sql, /EXCEPTION\s+WHEN/i);
  assert.doesNotMatch(sql, /\bDRY[-_ ]RUN\b/i);
  assert.match(sql, /v_access_periods_after[\s\S]*ADALBAPRO_PLATFORM_INTERNAL_SCOPE_CHANGED/);
});

test("platform-internal bootstrap has closed PL/pgSQL and post-COMMIT SQL boundaries", async () => {
  const sql = await read("supabase/scripts/agency-adalba-platform-internal-bootstrap.sql");
  const executable = executableSql(sql);
  const doStart = sql.indexOf("DO $$");
  const doEnd = sql.indexOf("$$;", doStart);
  const commitIndex = sql.indexOf("\nCOMMIT;");
  const resultIndex = sql.indexOf("WITH\nparams AS", commitIndex);
  const ifCount = (sql.match(/^\s*IF\b/gm) || []).length;
  const endIfCount = (sql.match(/^\s*END IF;/gm) || []).length;
  let parenthesisDepth = 0;

  for (const character of executable) {
    if (character === "(") parenthesisDepth += 1;
    if (character === ")") parenthesisDepth -= 1;
    assert.ok(parenthesisDepth >= 0, "bootstrap has an unmatched closing parenthesis");
  }

  assert.ok(doStart > 0);
  assert.ok(doEnd > doStart);
  assert.ok(commitIndex > doEnd);
  assert.ok(resultIndex > commitIndex);
  assert.equal(parenthesisDepth, 0);
  assert.equal(ifCount, endIfCount);
  assert.equal((sql.match(/^DO \$\$/gm) || []).length, 1);
  assert.equal((sql.match(/^\$\$;/gm) || []).length, 1);
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(
    sql,
    /OR v_access_periods_after IS DISTINCT FROM\s+\(\s*v_access_periods_before\s+\+ \(CASE WHEN v_access_period_created THEN 1 ELSE 0 END\)\s+\)\s+THEN/s,
  );
  assert.match(sql, /CROSS JOIN selected_period;\s*$/);
});

test("platform-internal bootstrap returns a post-COMMIT persisted-state result set", async () => {
  const sql = await read("supabase/scripts/agency-adalba-platform-internal-bootstrap.sql");
  const commitIndex = sql.lastIndexOf("\nCOMMIT;");
  const resultIndex = sql.indexOf("WITH\nparams AS", commitIndex);
  const resultSql = sql.slice(resultIndex);

  assert.ok(commitIndex >= 0);
  assert.ok(resultIndex > commitIndex);
  assert.match(resultSql, /2026-08-13-platform-internal-bootstrap-v3-observable/);
  for (const field of [
    "actor_user_id",
    "agency_id",
    "agency_name",
    "agency_slug",
    "access_period_count",
    "platform_internal_active_count",
    "access_period_id",
    "plan_code",
    "origin",
    "status",
    "starts_at",
    "ends_at",
    "source_application_id",
    "source_invitation_id",
    "final_state",
  ]) {
    assert.match(resultSql, new RegExp(`\\b${field}\\b`));
  }
  assert.match(resultSql, /CASE\s+WHEN period_state\.access_period_count = 0\s+THEN 'MISSING_AFTER_COMMIT'\s+ELSE 'PRESENT_AFTER_COMMIT'/s);
  assert.match(resultSql, /FROM identity_state[\s\S]*CROSS JOIN target_agency[\s\S]*CROSS JOIN period_state/s);
  assert.doesNotMatch(resultSql, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|ROLLBACK)\b/i);
});

test("platform-internal post-verifier is read-only and checks exact provenance", async () => {
  const sql = await read("supabase/scripts/agency-adalba-platform-internal-post-verification-read-only.sql");
  const executable = executableSql(sql);

  assert.equal((executable.match(/;/g) || []).length, 1);
  assert.match(sql, /platform_internal_exactly_one/);
  assert.match(sql, /no_other_agency_platform_internal/);
  assert.doesNotMatch(sql, /protected_scope_readback/);
  assert.match(sql, /final_classification/);
  assert.match(sql, /platform-internal-post-v2/);
  assert.doesNotMatch(executable, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|CALL|DO|RAISE)\b/i);
  assert.match(sql, /SELECT check_name, expected, observed, verdict/);
});

test("platform-internal rollback requires the exact access period id", async () => {
  const sql = await read("supabase/scripts/agency-adalba-platform-internal-bootstrap.rollback.sql");

  assert.match(sql, /v_access_period_id constant uuid := NULL/);
  assert.match(sql, /ADALBAPRO_PLATFORM_INTERNAL_ROLLBACK_ID_REQUIRED/);
  assert.match(sql, /DELETE FROM public\.agency_access_periods\s+WHERE id = v_access_period_id/);
  assert.doesNotMatch(sql, /DELETE FROM public\.agency_access_periods\s+WHERE[\s\S]*(origin|agency|slug)/i);
  assert.doesNotMatch(sql, /CASCADE/i);
});
