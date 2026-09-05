import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/0046_minerador_keyword_delete_lifecycle.sql");
const preflight = read("../supabase/scripts/0046-minerador-keyword-delete-lifecycle-preflight-read-only.sql");
const postVerifier = read("../supabase/scripts/0046-minerador-keyword-delete-lifecycle-post-verifier-read-only.sql");
const workspace = read("../modules/minerador/minerador-workspace.tsx");
const deleteRoute = read("../app/api/minerador/marcas/[brandId]/keywords/delete/route.ts");
const previewRoute = read("../app/api/minerador/marcas/[brandId]/keywords/delete/preview/route.ts");

function executableSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\r\n]*/g, "");
}

test("preflight e post-verifier são estritamente read-only", () => {
  for (const script of [preflight, postVerifier]) {
    const executable = executableSql(script);
    assert.doesNotMatch(executable, /^\s*(?:BEGIN|COMMIT|ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|DO|SET)\b/im);
    assert.doesNotMatch(executable, /CREATE\s+TEMP|CREATE\s+TEMPORARY|INTO\s+TEMP/i);
    assert.match(script, /SELECT check_name, object_name, observed, verdict/);
  }
});

test("cada verifier mantém o contrato UNION ALL de quatro colunas", () => {
  assert.equal((preflight.match(/UNION ALL/g) || []).length, 8);
  assert.equal((postVerifier.match(/UNION ALL/g) || []).length, 11);
  assert.match(preflight, /SELECT check_name, object_name, observed, verdict/);
  assert.match(postVerifier, /SELECT check_name, object_name, observed, verdict/);
  assert.doesNotMatch(`${preflight}\n${postVerifier}`, /placeholder|PASTE_|REPLACE_WITH/i);
});

test("migration usa RPC server-side, bloqueia delete direto e não toca publicação", () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /canonical_actor_can_use_brand_action\(p_brand_id, p_actor_user_id, 'minerador', 'manage'\)/);
  assert.match(migration, /REVOKE DELETE ON TABLE public\.minerador_keywords FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.delete_minerador_keywords/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.recover_minerador_keywords/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.purge_minerador_keywords/);
  assert.doesNotMatch(migration, /publication_records/);
  assert.doesNotMatch(migration, /DELETE FROM public\.editorial_artifact_versions/);
  assert.doesNotMatch(migration, /DELETE FROM public\.editorial_version_status_events/);
  assert.doesNotMatch(migration, /DELETE FROM public\.editorial_decision_events/);
});

test("a UI não faz delete client-side e a publicação é revalidada no servidor", () => {
  assert.doesNotMatch(workspace, /\.from\(["']minerador_keywords["']\)[\s\S]{0,180}\.delete\(\)/);
  assert.match(workspace, /keywords\/delete\/preview/);
  assert.match(workspace, /keywords\/delete/);
  assert.match(previewRoute, /rpc\("lifecycle_preview_minerador_keywords"/);
  assert.match(deleteRoute, /rpc\("lifecycle_delete_minerador_keywords"/);
  assert.match(deleteRoute, /p_actor_user_id: profile\.userId/);
});

test("a trigger impede novos processamentos durante a janela recuperável", () => {
  assert.match(migration, /OLD\.deleted_at IS NOT NULL[\s\S]{0,220}KEYWORD_RECOVERABLE_DELETE_FAILED/);
  assert.match(workspace, /\.is\("deleted_at", null\)/);
});

test("delete, restore e purge mantêm os gates temporais e a atomicidade", () => {
  assert.match(migration, /IF current_keyword\.deleted_at IS NOT NULL[\s\S]{0,260}KEYWORD_DELETE_TRANSACTION_FAILED/);
  assert.match(migration, /IF current_keyword\.deleted_at IS NULL AND is_published AND NOT p_allow_recoverable[\s\S]{0,120}KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW/);
  assert.match(migration, /SET deleted_at = current_timestamp,[\s\S]{0,100}purge_after = current_timestamp \+ interval '24 hours'/);
  assert.match(migration, /KEYWORD_RESTORE_WINDOW_EXPIRED/);
  assert.match(migration, /IF current_keyword\.deleted_at IS NULL OR current_keyword\.purge_after IS NULL[\s\S]{0,160}KEYWORD_PURGE_NOT_YET_ALLOWED/);
  assert.match(migration, /current_keyword\.purge_after > current_timestamp[\s\S]{0,100}KEYWORD_PURGE_NOT_YET_ALLOWED/);
  assert.equal((migration.match(/'partialDelete', false/g) || []).length, 3);
});
