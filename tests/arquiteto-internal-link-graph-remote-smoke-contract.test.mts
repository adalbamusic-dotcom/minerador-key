import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath: string) {
  return readFile(new URL(relativePath, root), "utf8");
}

function executableSql(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

function sourceWithoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

test("readback pós-apply cobre a fundação remota inteira e permanece SELECT-only", async () => {
  const source = await read("supabase/scripts/internal-link-graph-foundation-post-apply-read-only.sql");
  const sql = executableSql(source);
  const documentedSql = sourceWithoutComments(source);

  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|GRANT|REVOKE|CALL)\b/i);
  assert.match(documentedSql, /FROM public\.internal_link_graphs/);
  assert.match(documentedSql, /FROM public\.internal_link_graph_working_copies/);
  assert.match(documentedSql, /FROM public\.internal_link_graph_nodes/);
  assert.match(documentedSql, /FROM public\.internal_link_graph_edges/);
  assert.match(documentedSql, /FROM public\.internal_link_graph_proposals/);
  assert.match(documentedSql, /REMOTE_GRAPH_RELATIONS/);
  assert.match(documentedSql, /REMOTE_GRAPH_COLUMNS/);
  assert.match(documentedSql, /REMOTE_GRAPH_PRIMARY_KEYS/);
  assert.match(documentedSql, /REMOTE_GRAPH_UNIQUE_CONSTRAINTS/);
  assert.match(documentedSql, /REMOTE_GRAPH_FOREIGN_KEYS/);
  assert.match(documentedSql, /REMOTE_GRAPH_CHECKS/);
  assert.match(documentedSql, /REMOTE_GRAPH_INDEXES/);
  assert.match(documentedSql, /REMOTE_GRAPH_DEFAULTS/);
  assert.match(documentedSql, /GRAPH_RLS/);
  assert.match(documentedSql, /GRAPH_POLICIES/);
  assert.match(documentedSql, /GRAPH_GRANTS/);
  assert.match(documentedSql, /REMOTE_GRAPH_FUNCTIONS/);
  assert.match(documentedSql, /REMOTE_GRAPH_TRIGGERS/);
  assert.match(documentedSql, /REMOTE_GRAPH_READBACK_GATE/);
  assert.match(documentedSql, /16 canonical indexes/);
  assert.match(documentedSql, /20 canonical foreign keys/);
  assert.match(documentedSql, /45 canonical CHECK constraints/);
  assert.match(documentedSql, /matching=%s\/8/);
  assert.match(documentedSql, /matching=%s\/9/);
  assert.match(documentedSql, /SELECT\s+\n?\s*check_name::text/);
  assert.match(documentedSql, /object_name::text/);
  assert.match(documentedSql, /observed::text/);
  assert.match(documentedSql, /verdict::text/);
});

test("smoke remoto não escreve sem Brand, bases e ArticleDNAs reais compatíveis", async () => {
  const source = await read("supabase/scripts/internal-link-graph-foundation-smoke-preflight-read-only.sql");
  const sql = executableSql(source);
  const documentedSql = sourceWithoutComments(source);

  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|MERGE|GRANT|REVOKE|CALL)\b/i);
  assert.match(documentedSql, /CROSS_BRAND_GRAPH_SMOKE/);
  assert.match(documentedSql, /TEMPORARY_SMOKE_BRAND_REQUIRED/);
  assert.match(documentedSql, /GRAPH_SMOKE_DML_GATE/);
  assert.match(documentedSql, /silo_dna/);
  assert.match(documentedSql, /silo_page/);
  assert.match(documentedSql, /article_dna/);
  assert.match(documentedSql, /BLOCKED_PRECONDITION/);
  assert.match(documentedSql, /SELECT\s+\n?\s*check_name::text/);
  assert.match(documentedSql, /object_name::text/);
  assert.match(documentedSql, /observed::text/);
  assert.match(documentedSql, /verdict::text/);
});

test("o caminho de escrita continua protegido por contexto canônico antes do service_role", async () => {
  const [runtime, graphRoute, workingCopyRoute] = await Promise.all([
    read("lib/server/pipeline-runtime.ts"),
    read("app/api/arquiteto/internal-link-graph/route.ts"),
    read("app/api/arquiteto/internal-link-graph/working-copy/route.ts"),
  ]);

  assert.match(runtime, /requireCanonicalActorUserId/);
  assert.match(runtime, /canonical_actor_can_access_brand/);
  assert.match(runtime, /canonical_actor_can_use_brand_action/);
  assert.match(runtime, /createCanonicalServiceClient/);
  assert.match(graphRoute, /resolvePipelineContext/);
  assert.match(workingCopyRoute, /resolvePipelineContext/);
  assert.match(graphRoute, /persistInternalLinkGraph\(context/);
  assert.match(workingCopyRoute, /persistInternalLinkGraphWorkingCopy\(context/);
});
