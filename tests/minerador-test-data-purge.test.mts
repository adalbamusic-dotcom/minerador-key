import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dryRun = readFileSync(new URL("../supabase/scripts/minerador-test-data-purge-dry-run-read-only.sql", import.meta.url), "utf8");
const purge = readFileSync(new URL("../supabase/scripts/minerador-test-data-purge.sql", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

test("dry-run e estritamente read-only e nao e exposto no Minerador", () => {
  const sql = stripSqlComments(dryRun);
  assert.match(sql, /WITH\s+requested_targets/i);
  assert.match(sql, /PURGE_PLAN/);
  assert.match(sql, /dependency_graph/);
  assert.match(sql, /incoming_keyword_fks/);
  const withoutLiterals = sql.replace(/'(?:''|[^'])*'/g, "''");
  assert.doesNotMatch(withoutLiterals, /^\s*(INSERT|UPDATE|DELETE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|BEGIN|COMMIT|DO)\b/im);
  assert.doesNotMatch(workspace, /test-data-purge|TEST_DATA_PURGE/i);
});

test("helper administrativo exige contexto exato, Admin global, homologacao e plano aprovado", () => {
  assert.match(purge, /set_config\('minerador\.test_purge_enabled'/);
  assert.match(purge, /set_config\('minerador\.test_purge_environment'/);
  assert.match(purge, /PURGE_TEST_DATA_CONFIRMED/);
  assert.match(purge, /brandId/);
  assert.match(purge, /actorUserId/);
  assert.match(purge, /executionRequestId/);
  assert.match(purge, /approvedPlanHash/);
  assert.match(purge, /keywordIds/);
  assert.match(purge, /auth\.users/);
  assert.match(purge, /public\.perfis[\s\S]*role = 'admin'/);
  assert.match(purge, /current_setting\('app\.environment', true\)/);
  assert.match(purge, /FOR UPDATE/);
});

test("plano cobre dependencias reais, publicacao e FKs recebidas", () => {
  for (const dependency of [
    "minerador_keyword_metric_measurements",
    "minerador_discovery_candidates",
    "minerador_discovery_keyword_origins",
    "minerador_discovery_candidate_current_metrics",
    "minerador_discovery_candidate_metric_history",
    "minerador_discovery_import_batches",
    "brand_site_keyword_candidates",
    "brand_site_import_items",
    "brand_site_events",
    "editorial_workflow_items",
    "editorial_artifact_versions",
    "editorial_decision_events",
    "publication_records",
    "brand_site_import_batches",
    "editorial_serp_snapshots",
    "editorial_serp_reviews",
    "content_documents",
    "content_document_versions",
    "content_document_comments",
    "editorial_version_status_events",
  ]) {
    assert.match(dryRun, new RegExp(dependency));
    assert.match(purge, new RegExp(dependency));
  }
  assert.match(dryRun, /publication_link_state/);
  assert.match(dryRun, /publication_link/);
  assert.match(dryRun, /published/);
  assert.match(dryRun, /legacy_unverified/);
  assert.match(dryRun, /confrelid = 'public\.minerador_keywords'::regclass/);
  assert.match(purge, /TEST_DATA_PURGE_UNKNOWN_KEYWORD_FK/);
});

test("purge tem ordem explícita de filhos para keyword e readback obrigatório", () => {
  const order = [
    "DELETE FROM public.brand_site_import_items",
    "DELETE FROM public.brand_site_keyword_candidates",
    "DELETE FROM public.minerador_discovery_keyword_origins",
    "DELETE FROM public.minerador_discovery_candidate_current_metrics",
    "DELETE FROM public.minerador_discovery_candidate_metric_history",
    "DELETE FROM public.minerador_discovery_import_batches",
    "DELETE FROM public.minerador_discovery_candidates",
    "DELETE FROM public.minerador_keyword_metric_measurements",
    "DELETE FROM public.minerador_keywords",
  ];
  let previous = -1;
  for (const statement of order) {
    const current = purge.indexOf(statement);
    assert.ok(current > previous, `${statement} deve seguir a ordem de dependências`);
    previous = current;
  }
  assert.match(purge, /TEST_DATA_PURGE_READBACK_FAILED/);
  assert.match(purge, /readback_residual_count/);
  assert.match(purge, /COMMIT/);
});

test("falha de filho fica dentro de subtransação e nao vira sucesso parcial", () => {
  assert.match(purge, /BEGIN[\s\S]*?EXCEPTION WHEN OTHERS/);
  assert.match(purge, /GET STACKED DIAGNOSTICS/);
  assert.match(purge, /status, error_code, error_message/);
  assert.match(purge, /TEST_DATA_PURGE_PLAN_STALE/);
  assert.match(purge, /TEST_DATA_PURGE_PROTECTED_REFERENCE_GUARD/);
});

test("publication, outra Brand e keyword ausente possuem resultados fail-closed", () => {
  assert.match(purge, /TEST_DATA_PURGE_PUBLICATION_GUARD/);
  assert.match(purge, /TEST_DATA_PURGE_PROTECTED_REFERENCE_GUARD/);
  assert.match(purge, /TEST_DATA_PURGE_CROSS_BRAND_BLOCKED/);
  assert.match(purge, /already_absent/);
  assert.match(purge, /purge_status <> 'ready'/);
  assert.match(purge, /plan\.purge_status <> 'already_absent'/);
});

test("nenhuma regra destrutiva proibida ou mudança estrutural foi adicionada", () => {
  const sql = stripSqlComments(purge);
  assert.doesNotMatch(sql, /ON\s+DELETE\s+CASCADE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
  assert.doesNotMatch(sql, /DISABLE\s+TRIGGER/i);
  assert.doesNotMatch(sql, /ALTER\s+TABLE/i);
  assert.doesNotMatch(purge, /supabase[\\/]migrations[\\/]/i);
  assert.doesNotMatch(purge, /minerador-workspace\.tsx/i);
});

test("caminho normal Excluir continua sendo a autoridade do produto", () => {
  assert.match(workspace, /requestKeywordDeletePreview/);
  assert.match(workspace, /keywords\/delete\/preview/);
  assert.match(workspace, /keywords\/delete/);
  assert.doesNotMatch(workspace, /test-data-purge|TEST_DATA_PURGE/i);
});
