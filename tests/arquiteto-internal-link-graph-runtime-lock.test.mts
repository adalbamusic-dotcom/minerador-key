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

function graphFunctionDefinition(source: string) {
  const start = source.search(/CREATE(?: OR REPLACE)? FUNCTION public\.persist_internal_link_graph\(/);
  assert.notEqual(start, -1, "a definição da RPC deve existir");
  const end = source.indexOf("$$;", start);
  assert.notEqual(end, -1, "a definição da RPC deve terminar com $$;");
  return source.slice(start, end + 3);
}

function normalizeDefinition(source: string) {
  return graphFunctionDefinition(source)
    .replace(/CREATE OR REPLACE FUNCTION/i, "CREATE FUNCTION")
    .replace(/\s+FOR UPDATE;/i, ";")
    .replace(/\s+/g, " ")
    .trim();
}

test("sucessora remove somente o FOR UPDATE redundante e preserva o contrato da RPC", async () => {
  const [foundation, successor, rollback] = await Promise.all([
    read("supabase/migrations/20260826225145_internal_link_graph_foundation.sql"),
    read("supabase/migrations/20260827032222_internal_link_graph_runtime_advisory_lock.sql"),
    read("supabase/rollback/20260827032222_internal_link_graph_runtime_advisory_lock.rollback.sql"),
  ]);

  assert.match(successor, /CREATE OR REPLACE FUNCTION public\.persist_internal_link_graph\(/);
  assert.match(successor, /SECURITY INVOKER/);
  assert.match(successor, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(successor, /pg_advisory_xact_lock\(hashtextextended\(p_marca_id::text \|\| ':' \|\| graph_id, 0\)\)/);
  assert.doesNotMatch(executableSql(successor), /\bFOR\s+UPDATE\b/i);
  assert.equal((successor.match(/pg_advisory_xact_lock\(/g) || []).length, 1);
  assert.equal((successor.match(/INSERT INTO public\.internal_link_graphs\s*\(/g) || []).length, 1);
  assert.equal((successor.match(/INSERT INTO public\.internal_link_graph_nodes\s*\(/g) || []).length, 1);
  assert.equal((successor.match(/INSERT INTO public\.internal_link_graph_edges\s*\(/g) || []).length, 1);
  assert.doesNotMatch(executableSql(successor), /\b(?:CREATE|ALTER|DROP)\s+TABLE\b|\b(?:GRANT|REVOKE)\b/i);
  assert.doesNotMatch(executableSql(successor), /\b(?:UPDATE|DELETE|TRUNCATE|MERGE)\s+public\./i);

  const expectedDefinition = normalizeDefinition(foundation);
  const actualDefinition = normalizeDefinition(successor);
  assert.equal(actualDefinition, expectedDefinition, "a sucessora deve diferir somente pela remoção do FOR UPDATE");

  assert.match(foundation, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.internal_link_graph_working_copies\s+TO service_role/i);
  assert.match(foundation, /FROM public\.internal_link_graph_working_copies AS wc[\s\S]*?FOR UPDATE/);
  assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.persist_internal_link_graph\(/);
  assert.match(rollback, /FOR UPDATE/);
  assert.doesNotMatch(withoutComments(rollback), /CASCADE/i);
  assert.doesNotMatch(executableSql(rollback), /\bDROP\s+(?:TABLE|FUNCTION)\b|\b(?:GRANT|REVOKE)\b/i);
});

test("preflight remoto da sucessora é catalog-only e verifica o pre-state exato", async () => {
  const preflight = await read("supabase/scripts/internal-link-graph-runtime-lock-successor-preflight-read-only.sql");
  const executable = executableSql(preflight);

  assert.doesNotMatch(executable, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|GRANT|REVOKE|CALL)\b/i);
  assert.match(preflight, /CURRENT_RPC_FOR_UPDATE_PRESENT/);
  assert.match(preflight, /SUCCESSOR_REMOTE_CONFLICT/);
  assert.match(preflight, /supabase_migrations\.schema_migrations/);
  assert.match(preflight, /has_table_privilege\('service_role'/);
  assert.match(preflight, /pg_get_triggerdef/);
  assert.match(preflight, /pg_advisory_xact_lock/);
  assert.match(preflight, /SELECT\s+\n?\s*'CURRENT_RPC'/);
});

test("a correção não relaxa os guards server-side nem a autorização da RPC", async () => {
  const [runtime, graphRoute, workingCopyRoute, successor] = await Promise.all([
    read("lib/server/pipeline-runtime.ts"),
    read("app/api/arquiteto/internal-link-graph/route.ts"),
    read("app/api/arquiteto/internal-link-graph/working-copy/route.ts"),
    read("supabase/migrations/20260827032222_internal_link_graph_runtime_advisory_lock.sql"),
  ]);

  assert.match(runtime, /requireCanonicalActorUserId/);
  assert.match(runtime, /canonical_actor_can_access_brand/);
  assert.match(runtime, /canonical_actor_can_use_brand_action/);
  assert.match(runtime, /createCanonicalServiceClient/);
  assert.match(graphRoute, /resolvePipelineContext/);
  assert.match(workingCopyRoute, /resolvePipelineContext/);
  assert.match(successor, /SECURITY INVOKER/);
  assert.doesNotMatch(successor, /SECURITY DEFINER/);
  assert.match(successor, /canonical_assert_rpc_actor\(p_actor_user_id\)/);
  assert.match(successor, /canonical_actor_can_access_brand/);
  assert.match(successor, /canonical_actor_can_use_brand_action/);
});
