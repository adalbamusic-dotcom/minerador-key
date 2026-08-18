import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("0036 renomeia as relações existentes sem recriar ou apagar dados", async () => {
  const sql = await read("supabase/migrations/0036_rename_minerador_keyword_entities.sql");
  assert.match(sql, /ALTER TABLE public\.keywords_kgr RENAME TO minerador_keywords/);
  assert.match(sql, /ALTER TABLE public\.listas_kgr RENAME TO minerador_keyword_lists/);
  assert.match(sql, /LOCK TABLE[\s\S]*public\.keywords_kgr[\s\S]*public\.listas_kgr/);
  assert.doesNotMatch(sql, /\b(?:CREATE TABLE|DROP TABLE|INSERT INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(sql, /\bCASCADE\b/i);
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /pg_proc/);
  assert.match(sql, /ALTER POLICY/);
  assert.match(sql, /ALTER TRIGGER/);
});

test("0036 usa o próximo número livre após 0035 e tem preflight/verifier/rollback locais", async () => {
  const migrations = await readdir(new URL("../supabase/migrations/", import.meta.url));
  const numbers = migrations
    .map(name => /^(\d+)_/.exec(name)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  assert.equal(numbers.includes(36), true);
  assert.equal(numbers.filter(value => value === 36).length, 1);

  const [preflight, postVerifier, rollback, touchedScopeAudit] = await Promise.all([
    read("supabase/scripts/0036-minerador-keyword-entities-preflight-read-only.sql"),
    read("supabase/scripts/0036-minerador-keyword-entities-post-verifier-read-only.sql"),
    read("supabase/scripts/0036-minerador-keyword-entities-rollback.sql"),
    read("supabase/scripts/0036-touched-scope-audit-read-only.sql"),
  ]);
  assert.match(preflight, /ROW_COUNT/);
  assert.match(preflight, /PRESERVED_CATALOG_FINGERPRINT/);
  assert.match(preflight, /STOP_REMOTE_APPLY/);
  assert.match(postVerifier, /b0e37afd4f93e0727bda633a834f3ea2/);
  assert.match(postVerifier, /ff287ace547da5adaa424e5558fa1df2/);
  assert.match(postVerifier, /597ca96caf90b89df561bc73ac43f8f1/);
  assert.match(postVerifier, /target_shape_expected_delta/);
  assert.match(postVerifier, /LEGACY_DATABASE_REFERENCES/);
  assert.match(touchedScopeAudit, /TOUCHED_FUNCTION/);
  assert.match(touchedScopeAudit, /TOUCHED_EXTERNAL_OBJECTS_PRESENT/);
  assert.match(touchedScopeAudit, /LEGACY_REFERENCES_IN_TOUCHED_OBJECTS/);
  assert.match(touchedScopeAudit, /TARGET_CONTRACT/);
  assert.match(touchedScopeAudit, /FK_INTEGRITY/);
  assert.match(touchedScopeAudit, /POLICY_INTEGRITY/);
  assert.match(touchedScopeAudit, /EXTERNAL_CATALOG_DELTA_EXPLAINED/);
  assert.match(touchedScopeAudit, /FINAL_CLASSIFICATION/);
  assert.doesNotMatch(touchedScopeAudit, /^\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/im);
  assert.match(rollback, /ALTER TABLE public\.minerador_keywords RENAME TO keywords_kgr/);
  assert.match(rollback, /ALTER TABLE public\.minerador_keyword_lists RENAME TO listas_kgr/);
  assert.doesNotMatch(rollback, /\b(?:CREATE TABLE|DROP TABLE|INSERT INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});

test("consumidores ativos usam a nomenclatura canônica e preservam KGR como atributo", async () => {
  const paths = [
    "app/api/analyze/route.ts",
    "app/api/editorial/serp/route.ts",
    "app/api/inteligencia/route.ts",
    "app/api/marca/site/import/keywords/preview/route.ts",
    "app/api/marca/site/import/keywords/route.ts",
    "app/api/marca/site/lists/route.ts",
    "app/api/marcas/route.ts",
    "app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts",
    "app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts",
    "app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts",
    "app/api/process-intent-niche/route.ts",
    "lib/minerador/keyword-import-core.ts",
    "lib/server/authz.ts",
    "lib/server/arquiteto-workspace.ts",
    "modules/minerador/minerador-workspace.tsx",
    "modules/arquiteto/arquiteto-workspace.tsx",
  ];
  const sources = await Promise.all(paths.map(read));
  assert.doesNotMatch(sources.join("\n"), /keywords_kgr|listas_kgr/);
  assert.match(sources.join("\n"), /minerador_keywords/);
  assert.match(sources.join("\n"), /minerador_keyword_lists/);
  assert.match(sources.join("\n"), /kgr_score/);
});
