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

test("migrations do InternalLinkGraph permanecem separadas, tenantizadas e sem cascades", async () => {
  const migration = await read("supabase/migrations/20260826225145_internal_link_graph_foundation.sql");
  for (const table of ["internal_link_graphs", "internal_link_graph_nodes", "internal_link_graph_edges", "internal_link_graph_proposals", "internal_link_graph_working_copies"]) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`));
  }
  assert.equal((migration.match(/REFERENCES /g) || []).length, (migration.match(/ON DELETE RESTRICT/g) || []).length);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/i);
  assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 5);
  assert.equal((migration.match(/CREATE POLICY /g) || []).length, 5);
  assert.match(migration, /CREATE FUNCTION public\.persist_internal_link_graph\(\s*p_marca_id uuid/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.persist_internal_link_graph\(uuid, uuid, text, jsonb\)\s*TO service_role/);
  assert.match(migration, /CREATE FUNCTION public\.persist_internal_link_graph_working_copy\(\s*p_marca_id uuid/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.persist_internal_link_graph_working_copy\(uuid, uuid, text, bigint, jsonb\)\s*TO service_role/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.persist_internal_link_graph\([\s\S]*TO (?:PUBLIC|anon|authenticated)/i);
  assert.match(migration, /internal_link_graph_edges_no_self_link_ck/);
  assert.match(migration, /internal_link_graph_edges_directed_unique/);
  assert.match(migration, /internal_link_graph_validate_version_chain/);
  assert.match(migration, /internal_link_graph_proposal_review_guard/);
  assert.match(migration, /internal_link_graph_proposal_validate_base/);
  assert.equal((migration.match(/CREATE TRIGGER /g) || []).length, 9);
  assert.match(migration, /internal_link_graphs_append_only_trg\s+\n?\s*BEFORE UPDATE OR DELETE ON public\.internal_link_graphs/);
  assert.match(migration, /internal_link_graph_nodes_append_only_trg\s+\n?\s*BEFORE UPDATE OR DELETE ON public\.internal_link_graph_nodes/);
  assert.match(migration, /internal_link_graph_edges_append_only_trg\s+\n?\s*BEFORE UPDATE OR DELETE ON public\.internal_link_graph_edges/);
  assert.match(migration, /internal_link_graph_working_copies_graph_unique/);
  assert.match(migration, /lock_version bigint NOT NULL DEFAULT 1/);
  assert.match(migration, /internal_link_graph_working_copies_payload_ck/);
  assert.match(migration, /working_copy_payload = stored_payload/);
  assert.match(migration, /current_row\.lock_version <> p_expected_lock_version/);
});

test("migration de atomicidade pareada usa uma única função transacional e preserva entidades distintas", async () => {
  const migration = await read("supabase/migrations/20260826225154_silo_pair_atomicity.sql");
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(migration, /CREATE FUNCTION public\.persist_silo_pair_atomic\(/);
  assert.equal((migration.match(/INSERT INTO public\.editorial_artifact_versions/g) || []).length, 2);
  assert.match(migration, /pg_advisory_xact_lock\(/);
  assert.match(migration, /canonical_assert_rpc_actor\(p_actor_user_id\)/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /p_silo_dna_status NOT IN \('draft', 'proposed', 'approved', 'rejected', 'superseded'\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.persist_silo_pair_atomic\([\s\S]*TO service_role/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP FUNCTION|ALTER TABLE|UPDATE public\.|DELETE FROM public\./i);
});

test("rollback local não apaga objetos fora do escopo nem usa CASCADE", async () => {
  const [graphRollback, pairRollback] = await Promise.all([
    read("supabase/rollback/20260826225145_internal_link_graph_foundation.rollback.sql"),
    read("supabase/rollback/20260826225154_silo_pair_atomicity.rollback.sql"),
  ]);
  assert.doesNotMatch(withoutComments(graphRollback), /CASCADE/i);
  assert.doesNotMatch(withoutComments(pairRollback), /CASCADE/i);
  assert.match(graphRollback, /DROP FUNCTION IF EXISTS public\.persist_internal_link_graph_working_copy\(uuid, uuid, text, bigint, jsonb\)/);
  assert.match(graphRollback, /DROP TABLE IF EXISTS public\.internal_link_graph_working_copies/);
  assert.match(graphRollback, /DROP TABLE IF EXISTS public\.internal_link_graph_proposals/);
  assert.match(graphRollback, /DROP TABLE IF EXISTS public\.internal_link_graphs/);
  assert.match(pairRollback, /DROP FUNCTION IF EXISTS public\.persist_silo_pair_atomic\(uuid, uuid, text, jsonb, jsonb, text, text\)/);
});

test("preflights são SELECT-only e o caminho de consolidação usa o par atômico", async () => {
  const [graphPreflight, pairPreflight, workspace] = await Promise.all([
    read("supabase/scripts/internal-link-graph-foundation-preflight-read-only.sql"),
    read("supabase/scripts/silo-pair-atomicity-preflight-read-only.sql"),
    read("modules/arquiteto/arquiteto-workspace.tsx"),
  ]);
  for (const preflight of [graphPreflight, pairPreflight]) {
    const executable = withoutComments(preflight);
    assert.doesNotMatch(executable, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|GRANT|REVOKE|CALL)\b/i);
    assert.match(executable, /SELECT\s+\n?\s*check_name::text/);
    assert.match(executable, /object_name::text/);
    assert.match(executable, /observed::text/);
    assert.match(executable, /verdict::text/);
  }
  const consolidation = workspace.slice(workspace.indexOf("const consolidateSilos"), workspace.indexOf("const articleEntityIdFor"));
  // A 2C.4.7 trocou o caminho: a consolidação passa pela rota canônica, que
  // executa `persist_silo_from_working_copy_atomic`. O par legado ficou
  // restrito a rascunho e não finaliza mais nada.
  assert.match(consolidation, /consolidateRemoteSiloFromWorkingCopy/);
  assert.ok(!consolidation.includes("persistArquitetoSiloPair"), "o caminho legado do par saiu da consolidação");
  assert.doesNotMatch(consolidation, /persistArquitetoArtifact/);
});

test("working copy da fundação é persistente, editável e separada das versões append-only", async () => {
  const [migration, route, serverPersistence, clientPersistence] = await Promise.all([
    read("supabase/migrations/20260826225145_internal_link_graph_foundation.sql"),
    read("app/api/arquiteto/internal-link-graph/working-copy/route.ts"),
    read("lib/server/internal-link-graph-persistence.ts"),
    read("lib/arquiteto/internal-link-graph-persistence.ts"),
  ]);
  assert.match(migration, /CREATE TABLE public\.internal_link_graph_working_copies/);
  assert.match(migration, /UPDATE public\.internal_link_graph_working_copies/);
  assert.match(migration, /lock_version = next_lock_version/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.match(serverPersistence, /readInternalLinkGraphWorkingCopy/);
  assert.match(serverPersistence, /persist_internal_link_graph_working_copy/);
  assert.match(clientPersistence, /internal-link-graph\/working-copy/);
});
