import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/0030_brand_exceptional_operation_grants.sql", "utf8");
const preflight = await readFile("supabase/scripts/brand-exceptional-operation-grants-preflight-read-only.sql", "utf8");
const verifier = await readFile("supabase/scripts/brand-exceptional-operation-grants-post-verification-read-only.sql", "utf8");

const stripSqlCommentsAndLiterals = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*\n/g, "\n")
  .replace(/'(?:''|[^'])*'/g, "''");

test("0030 cria grants excepcionais por Brand e eventos append-only", () => {
  for (const table of ["brand_exceptional_operation_grants", "brand_exceptional_operation_execution_events"]) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\b`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /workflow_item_id uuid NOT NULL REFERENCES public\.editorial_workflow_items\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /FOREIGN KEY \(grant_id, marca_id, actor_user_id, operation\)[\s\S]*ON DELETE RESTRICT/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.brand_exceptional_operation_execution_events/);
  assert.match(migration, /pipeline_editorial_protect_append_only/);
});

test("0030 fixa lifecycle, temporalidade, motivo e idempotência aprovados", () => {
  for (const status of ["active", "expired", "revoked"]) assert.match(migration, new RegExp(`'${status}'`));
  assert.match(migration, /CHECK \(expires_at > granted_at\)/);
  assert.match(migration, /reason = btrim\(reason\) AND char_length\(reason\) BETWEEN 1 AND 500/);
  assert.match(migration, /WHERE status = 'active'/);
  assert.match(migration, /UNIQUE \(execution_request_id, workflow_item_id\)/);
  assert.match(migration, /result IN \('created', 'already_protected'\)/);
});

test("0030 mantém ACL server-side mínima e não altera defaults", () => {
  const executable = stripSqlCommentsAndLiterals(migration);
  assert.match(executable, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(executable, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.brand_exceptional_operation_grants TO service_role/);
  assert.match(executable, /GRANT SELECT, INSERT ON TABLE public\.brand_exceptional_operation_execution_events TO service_role/);
  assert.doesNotMatch(executable, /GRANT[\s\S]*TO authenticated/);
  assert.doesNotMatch(executable, /ALTER DEFAULT PRIVILEGES|CREATE POLICY|INSERT INTO public\.brand_exceptional_operation|DELETE FROM public\.brand_exceptional_operation/);
});

test("helper exige acesso canônico atual e grant ativo sem bypass", () => {
  assert.match(migration, /canonical_actor_can_execute_brand_exceptional_operation\([\s\S]*target_brand_id uuid,[\s\S]*target_actor_user_id uuid,[\s\S]*target_operation text/);
  assert.match(migration, /public\.canonical_actor_can_access_brand\(target_brand_id, target_actor_user_id\)/);
  for (const condition of ["grant_record.status = 'active'", "grant_record.revoked_at IS NULL", "grant_record.expires_at > now()", "target_operation = 'historical_import_recovery:execute'"]) {
    assert.match(migration, new RegExp(condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(migration, /canonical_actor_can_use_brand_action\(|canonical_actor_is_global_admin\(|canonical_actor_has_agency_capability\(/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.canonical_actor_can_execute_brand_exceptional_operation[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.canonical_actor_can_execute_brand_exceptional_operation[\s\S]*TO service_role/);
});

test("preflight e verifier 0030 são read-only e usam um único result set", () => {
  for (const script of [preflight, verifier]) {
    const executable = stripSqlCommentsAndLiterals(script);
    assert.match(script, /^(?:\s*--[^\n]*\n)*\s*WITH\b/i);
    assert.match(script.trim(), /SELECT check_name, expected, observed, verdict[\s\S]*;\s*$/i);
    assert.doesNotMatch(executable, /(?:^|[;\n]\s*)(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  }
  assert.match(preflight, /2026-08-12-exceptional-operation-grants-preflight-v1/);
  assert.match(verifier, /2026-08-12-exceptional-operation-grants-post-v1/);
  for (const script of [preflight, verifier]) assert.match(script, /d\.defaclobjtype::text/);
  assert.match(verifier, /h\.provolatile::text/);
  for (const marker of ["owner_role", "service_role_execute", "public_execute", "anon_execute", "authenticated_execute", "unapproved_execute"]) assert.match(verifier, new RegExp(marker));
  assert.match(verifier, /h\.owner_role = 'postgres'/);
});

test("0030 não cria writer, guard, handoff ou workflow downstream", () => {
  const executable = stripSqlCommentsAndLiterals(migration);
  assert.doesNotMatch(executable, /historical_import_protected|POST \/api\/arquiteto\/handoff|CREATE FUNCTION public\..*recovery/i);
  assert.doesNotMatch(executable, /radar|planner|writer|publications/i);
});
