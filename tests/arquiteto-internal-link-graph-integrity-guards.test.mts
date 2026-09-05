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

test("sucessora troca FOR SHARE pelo advisory lock sem ampliar grants ou schema", async () => {
  const migration = await read("supabase/migrations/20260827044408_internal_link_graph_integrity_guards.sql");
  const sql = executableSql(migration);

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.internal_link_graph_validate_version_chain\(\)/);
  assert.doesNotMatch(migration, /\bFOR\s+SHARE\b/i);
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(NEW\.marca_id::text \|\| ':' \|\| NEW\.graph_id, 0\)\)/);
  assert.match(migration, /WHERE graph_version_id = NEW\.previous_graph_version_id/);
  assert.match(migration, /previous_graph\.marca_id IS DISTINCT FROM NEW\.marca_id/);
  assert.match(migration, /previous_graph\.graph_id IS DISTINCT FROM NEW\.graph_id/);
  assert.match(migration, /previous_graph\.version_number <> NEW\.version_number - 1/);
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bGRANT\s+UPDATE\b/i);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|MERGE)\s+public\./i);
});

test("sucessora protege todos os refs editoriais da working copy no banco", async () => {
  const migration = await read("supabase/migrations/20260827044408_internal_link_graph_integrity_guards.sql");

  assert.match(migration, /CREATE FUNCTION public\.internal_link_graph_validate_working_copy_references\(\)/);
  assert.match(migration, /internal_link_graph_working_copies_validate_references_trg/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.internal_link_graph_working_copies/);
  assert.match(migration, /e\.artifact_type = 'silo_dna'/);
  assert.match(migration, /e\.artifact_type = 'silo_page'/);
  assert.match(migration, /e\.artifact_type = 'article_dna'/);
  assert.match(migration, /e\.marca_id = NEW\.marca_id/g);
  assert.match(migration, /e\.content_hash = dna_ref ->> 'contentHash'/);
  assert.match(migration, /e\.content_hash = page_ref ->> 'contentHash'/);
  assert.match(migration, /jsonb_array_elements\(NEW\.working_copy_payload -> 'participatingArticleDnaVersionRefs'\)/);
  assert.match(migration, /jsonb_array_elements\(NEW\.working_copy_payload -> 'nodes'\)/);
  assert.match(migration, /node ->> 'brandId' IS DISTINCT FROM NEW\.marca_id::text/);
  assert.match(migration, /e\.source_version_id = dna_ref ->> 'versionId'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.internal_link_graph_validate_working_copy_references\(\)/);
});

test("rollback remove somente o guard novo e restaura o validator anterior", async () => {
  const rollback = await read("supabase/rollback/20260827044408_internal_link_graph_integrity_guards.rollback.sql");
  const sql = executableSql(rollback);

  assert.match(rollback, /DROP TRIGGER IF EXISTS internal_link_graph_working_copies_validate_references_trg/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.internal_link_graph_validate_working_copy_references\(\)/);
  assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.internal_link_graph_validate_version_chain\(\)/);
  assert.match(rollback, /FOR SHARE/);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bCASCADE\b/i);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|MERGE)\s+public\./i);
});

test("preflight da sucessora é catalog-only e possui gate único", async () => {
  const preflight = await read("supabase/scripts/internal-link-graph-integrity-guards-preflight-read-only.sql");
  const sql = executableSql(preflight);

  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|GRANT|REVOKE|CALL)\b/i);
  assert.match(preflight, /CURRENT_VERSION_CHAIN_FOR_SHARE/);
  assert.match(preflight, /CURRENT_SERVICE_ROLE_UPDATE/);
  assert.match(preflight, /CURRENT_WORKING_COPY_CROSS_BRAND_DB_GUARD/);
  assert.match(preflight, /SUCCESSOR_COLLISION/);
  assert.match(preflight, /REMOTE_PREFLIGHT_GATE/);
  assert.match(preflight, /SELECT check_name::text, object_name::text, observed::text, verdict::text/);
  assert.match(preflight, /UNION ALL/);
  assert.match(preflight, /pg_get_functiondef/);
  assert.match(preflight, /has_table_privilege\('service_role'/);
});

test("post-verifier dos guards permanece read-only e cobre o estado instalado", async () => {
  const postApply = await read("supabase/scripts/internal-link-graph-integrity-guards-post-apply-read-only.sql");
  const sql = executableSql(postApply);

  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|GRANT|REVOKE|CALL)\b/i);
  assert.match(postApply, /VERSION_CHAIN_FOR_SHARE/);
  assert.match(postApply, /VERSION_CHAIN_SEARCH_PATH/);
  assert.match(postApply, /WORKING_COPY_DB_GUARD_PRESENT/);
  assert.match(postApply, /WORKING_COPY_DB_GUARD_TRIGGER/);
  assert.match(postApply, /WORKING_COPY_DB_GUARD_EVENTS/);
  assert.match(postApply, /SERVICE_ROLE_UPDATE/);
  assert.match(postApply, /SERVICE_ROLE_DELETE/);
  assert.match(postApply, /POST_APPLY_GATE/);
  assert.match(postApply, /SELECT check_name::text, object_name::text, observed::text, verdict::text/);
});

test("server-side persistence valida referencias antes da RPC privilegiada", async () => {
  const persistence = await read("lib/server/internal-link-graph-persistence.ts");

  assert.match(persistence, /assertWorkingCopyArtifactReferences/);
  assert.match(persistence, /editorial_artifact_versions/);
  assert.match(persistence, /artifact_type/);
  assert.match(persistence, /source_version_id/);
  assert.match(persistence, /await assertWorkingCopyArtifactReferences\(context, parsed\)/);
  assert.match(persistence, /context\.supabase\.rpc\("persist_internal_link_graph_working_copy"/);
});
