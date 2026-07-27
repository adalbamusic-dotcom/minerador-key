import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/0006_reconcile_tenant_security.sql", import.meta.url);
const dryRunPath = new URL("../supabase/scripts/tenant-security-0006-dry-run.sql", import.meta.url);
const validationPath = new URL("../supabase/scripts/tenant-security-0006-validation.sql", import.meta.url);
const rollbackPath = new URL("../supabase/rollback/0006_reconcile_tenant_security.rollback.sql", import.meta.url);

function stripSqlComments(sql: string) {
  return sql.replace(/--[^\r\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripSqlLiterals(sql: string) {
  return sql.replace(/'(?:''|[^'])*'/g, "''");
}

type AccessFixture = { authenticated: boolean; owner: boolean; admin: boolean; membership: boolean; email?: string | null; userKey?: string | null };

function canAccessFixture(input: AccessFixture) {
  if (!input.authenticated) return false;
  if (input.admin || input.owner || input.membership) return true;
  const email = input.email?.trim().toLowerCase();
  const userKey = input.userKey?.trim().toLowerCase();
  return Boolean(email && userKey && email === userKey);
}

test("0006 e transacional, trava a janela e nao possui DML de dados", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const executable = stripSqlComments(sql).trimStart();
  assert.match(executable, /^BEGIN;\s*SET LOCAL lock_timeout = '10s';\s*LOCK TABLE[\s\S]*?IN SHARE ROW EXCLUSIVE MODE;/i);
  assert.equal((executable.match(/^BEGIN;\s*$/gim) || []).length, 1);
  assert.equal((executable.match(/^COMMIT;\s*$/gim) || []).length, 1);
  assert.doesNotMatch(stripSqlLiterals(executable), /\b(?:INSERT\s+INTO\s+public\.|UPDATE\s+public\.|DELETE\s+FROM\s+public\.)/i);
  assert.doesNotMatch(executable, /\bSET\s+lista_id\s*=/i);
});

test("epilogo da migration termina no COMMIT e nao acessa snapshot depois", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const commitMarker = "COMMIT;";
  const commitIndex = sql.lastIndexOf(commitMarker);
  assert.ok(commitIndex > 0);
  assert.equal(sql.slice(commitIndex + commitMarker.length).trim(), "");
  assert.equal((stripSqlComments(sql).match(/^BEGIN;\s*$/gim) || []).length, 1);
  assert.equal((stripSqlComments(sql).match(/^COMMIT;\s*$/gim) || []).length, 1);

  for (const reference of ["pg_temp.tenant_0006_snapshot", "tenant_0006_snapshot"]) {
    const referenceIndex = sql.indexOf(reference);
    assert.ok(referenceIndex >= 0);
    assert.ok(referenceIndex < commitIndex, `${reference} deve estar antes do COMMIT`);
  }

  const executableAfterCommit = stripSqlComments(sql.slice(commitIndex + commitMarker.length)).trim();
  assert.equal(executableAfterCommit, "");
  for (const criticalCheck of [
    "lista_id_fingerprint",
    "brand_id_fingerprint",
    "keywords_without_list",
    "keywords_with_list",
    "TENANT_0006_READY",
    "REVOKE EXECUTE",
    "GRANT EXECUTE",
    "tenant_0005_listas_delete",
    "fk_keywords_kgr_lista_0005",
    "keywords_kgr_lista_id_fkey",
  ]) {
    assert.ok(sql.lastIndexOf(criticalCheck) < commitIndex, `${criticalCheck} deve ser validado antes do COMMIT`);
  }
});

test("0006 endurece as cinco funcoes e os grants", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const signatures = [
    "public.is_global_admin()",
    "public.can_access_brand(uuid)",
    "public.can_manage_brand(uuid)",
    "public.can_access_list(uuid)",
    "public.tenant_actor_has_permission(uuid, text, text)",
  ];
  for (const signature of signatures) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(sql, new RegExp(`public\\.${escaped.replace(/^public\\./, "")}`));
    assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION ${escaped} FROM PUBLIC`));
    assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION ${escaped} FROM anon`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped} TO authenticated`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped} TO service_role`));
  }
  for (const name of ["is_global_admin", "can_access_brand", "can_manage_brand", "can_access_list", "tenant_actor_has_permission"]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}`));
  }
  assert.equal((sql.match(/SET search_path = pg_catalog, public, pg_temp/g) || []).length, 5);
  assert.doesNotMatch(sql, /SET search_path = [^;]*, auth/i);
});

test("search_path separa precondicao aceita e pos-condicao obrigatoria", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const dryRun = await readFile(dryRunPath, "utf8");
  const validation = await readFile(validationPath, "utf8");
  const rollback = await readFile(rollbackPath, "utf8");
  const precondition = migration.slice(0, migration.indexOf("CREATE OR REPLACE FUNCTION public.is_global_admin"));
  const postcondition = migration.slice(migration.indexOf("DO $$\nDECLARE\n  function_def text"));
  const createFunctionsIndex = migration.indexOf("CREATE OR REPLACE FUNCTION public.is_global_admin");
  const postconditionIndex = migration.indexOf("DO $$\nDECLARE\n  function_def text");

  assert.match(precondition, /tenant_0006_function_snapshot/);
  assert.match(precondition, /public,pg_temp/);
  assert.match(precondition, /pg_catalog,public,pg_temp/);
  assert.match(precondition, /search_path_normalized NOT IN/);
  assert.equal(precondition.includes("search_path inseguro"), false);
  assert.ok(createFunctionsIndex > precondition.indexOf("tenant_0006_function_snapshot"));
  assert.ok(postconditionIndex > createFunctionsIndex);
  assert.match(postcondition, /search_path_normalized IS DISTINCT FROM 'pg_catalog,public,pg_temp'/);
  assert.match(dryRun, /SEARCH_PATH_RECONCILIATION_REQUIRED/);
  assert.match(dryRun, /SEARCH_PATH_OK/);
  assert.match(validation, /SEARCH_PATH_RECONCILIATION_REQUIRED/);
  assert.match(validation, /search_path_normalized = 'pg_catalog,public,pg_temp'/);
  assert.match(rollback, /public,pg_temp/);
  assert.match(rollback, /ROLLBACK_FUNCTION_SECURITY/);
  assert.doesNotMatch(rollback, /search_path_normalized IS DISTINCT FROM 'pg_catalog,public,pg_temp'/);
});

test("can_access_brand exige autenticacao e nao compara vazios", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const body = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.can_access_brand"), sql.indexOf("CREATE OR REPLACE FUNCTION public.can_manage_brand"));
  assert.match(body, /auth\.uid\(\) IS NOT NULL/);
  assert.match(body, /nullif\(btrim\(m\.user_key\), ''\) IS NOT NULL/);
  assert.match(body, /nullif\(btrim\(auth\.jwt\(\) ->> 'email'\), ''\) IS NOT NULL/);
  assert.doesNotMatch(body, /coalesce\(m\.user_key/);
  assert.doesNotMatch(body, /coalesce\(auth\.jwt/);
});

test("fixture preserva owner, admin, membership e compatibilidade de email valido", () => {
  assert.equal(canAccessFixture({ authenticated: false, owner: true, admin: true, membership: true }), false);
  assert.equal(canAccessFixture({ authenticated: true, owner: true, admin: false, membership: false }), true);
  assert.equal(canAccessFixture({ authenticated: true, owner: false, admin: true, membership: false }), true);
  assert.equal(canAccessFixture({ authenticated: true, owner: false, admin: false, membership: true }), true);
  assert.equal(canAccessFixture({ authenticated: true, owner: false, admin: false, membership: false, email: "adalbapro@gmail.com", userKey: "ADALBAPRO@GMAIL.COM" }), true);
  assert.equal(canAccessFixture({ authenticated: true, owner: false, admin: false, membership: false, email: null, userKey: null }), false);
  assert.equal(canAccessFixture({ authenticated: true, owner: false, admin: false, membership: false, email: "", userKey: "" }), false);
  assert.equal(canAccessFixture({ authenticated: true, owner: false, admin: false, membership: false, email: "other@example.com", userKey: "adalbapro@gmail.com" }), false);
});

test("policies de listas usam Minerador e nao Marca", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /tenant_0005_listas_insert[\s\S]*minerador', 'create/);
  assert.match(sql, /tenant_0005_listas_update[\s\S]*minerador', 'edit/);
  assert.match(sql, /tenant_0005_listas_delete[\s\S]*minerador', 'manage/);
  const policyBlock = sql.slice(sql.indexOf("DROP POLICY IF EXISTS tenant_0005_listas_insert"), sql.indexOf("DO $$\nDECLARE\n  pair record"));
  assert.doesNotMatch(policyBlock, /tenant_actor_has_permission\(marca_id, 'marca'/);
});

test("FK lista_id valida CASCADE/RESTRICT antes de remover somente a legada", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const field of ["conrelid", "confrelid", "conkey", "confkey", "confdeltype", "confupdtype", "condeferrable", "condeferred", "convalidated"]) {
    assert.match(sql, new RegExp(`(?:legacy|canonical)\\.${field}`));
  }
  assert.match(sql, /pg_get_constraintdef\(legacy_oid, true\)/);
  assert.match(sql, /TENANT_0006_DIAGNOSTIC/);
  assert.match(sql, /fk_keywords_kgr_lista_0005/);
  assert.match(sql, /legacy\.confdeltype = 'c'/);
  assert.match(sql, /canonical\.confdeltype = 'r'/);
  assert.match(sql, /legacy\.confupdtype = 'a'/);
  assert.match(sql, /canonical\.confupdtype = 'a'/);
  assert.match(sql, /pg_catalog\.pg_attribute/);
  assert.match(sql, /TENANT_0006_CONFLICT: FK lista_id nao corresponde ao catalogo CASCADE\/RESTRICT esperado/);
  assert.match(sql, /ALTER TABLE public\.%I DROP CONSTRAINT %I/);
  assert.match(sql, /pair\.legacy_name/);
  assert.doesNotMatch(sql, /DROP CONSTRAINT fk_keywords_kgr_brand_0005/);
  assert.doesNotMatch(sql, /DROP CONSTRAINT fk_keywords_kgr_lista_brand_0005/);
  assert.doesNotMatch(sql, /DROP CONSTRAINT uq_listas_kgr_id_marca_0005/);
});

test("dry-run e validacao sao somente leitura", async () => {
  const dryRun = stripSqlComments(await readFile(dryRunPath, "utf8"));
  const validation = stripSqlComments(await readFile(validationPath, "utf8"));
  for (const source of [dryRun, validation]) {
    assert.doesNotMatch(source, /^\s*(?:ALTER|UPDATE|INSERT|DELETE|DROP|TRUNCATE|CREATE|GRANT|REVOKE)\b/gim);
  }
  assert.match(dryRun, /anon_can_execute/);
  assert.match(dryRun, /public_can_execute/);
  assert.match(dryRun, /authenticated_can_execute/);
  assert.match(dryRun, /service_role_can_execute/);
  assert.match(dryRun, /grant_state/);
  assert.match(dryRun, /target_fk_state/);
  assert.match(dryRun, /CASCADE/);
  assert.match(dryRun, /RESTRICT/);
  assert.match(dryRun, /lista_id_fingerprint/);
  assert.match(dryRun, /brand_id_fingerprint/);
  assert.match(dryRun, /APPLICATION_CONSUMERS/);
  assert.match(dryRun, /EQUIVALENT/);
  assert.match(dryRun, /DIFFERENT/);
  assert.match(dryRun, /pg_get_constraintdef/);
  assert.match(dryRun, /RESULTADO_FINAL/);
  assert.match(validation, /FUNCTION_SECURITY/);
  assert.match(validation, /FUNCTION_FALLBACK_AUDIT/);
  assert.match(validation, /required_search_path/);
  assert.match(validation, /CONSTRAINT_RECONCILIATION/);
  assert.match(validation, /select_ok/);
  assert.match(validation, /NOT EXISTS \([\s\S]*canonical\.oid IS NULL/);
});

test("constraints diferentes sao preservadas, geram NOTICE e nao interrompem a reconciliacao", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const constraintBlock = sql.slice(sql.indexOf("DO $$\nDECLARE\n  pair record"), sql.indexOf("DO $$\nDECLARE\n  function_def text"));
  assert.match(constraintBlock, /IF NOT equivalent THEN/);
  assert.match(constraintBlock, /RAISE NOTICE[\s\S]*TENANT_0006_NOTICE/);
  assert.match(constraintBlock, /CONTINUE;/);
  const differentBranch = constraintBlock.slice(constraintBlock.indexOf("IF NOT equivalent THEN"), constraintBlock.indexOf("END IF;", constraintBlock.indexOf("IF NOT equivalent THEN")));
  assert.doesNotMatch(differentBranch, /RAISE EXCEPTION/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_global_admin/);
  assert.match(sql, /DROP POLICY IF EXISTS tenant_0005_listas_insert/);
});

test("nenhum dos artefatos 0006 contem placeholder de funcao ou SQL pseudocodigo", async () => {
  const sources = await Promise.all([migrationPath, dryRunPath, validationPath, rollbackPath].map(path => readFile(path, "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /grant\s+execute\s+on\s+function\s+\.\.\./i);
    assert.doesNotMatch(source, /<function>|assinatura genérica/i);
  }
});

test("fixture de reconciliacao remove apenas equivalente e preserva diferente", () => {
  function reconcileConstraint(classification: "EQUIVALENT" | "DIFFERENT") {
    return classification === "EQUIVALENT" ? "remove_legacy" : "preserve_both";
  }
  assert.equal(reconcileConstraint("EQUIVALENT"), "remove_legacy");
  assert.equal(reconcileConstraint("DIFFERENT"), "preserve_both");
});

test("rollback nao toca em dados e restaura somente seguranca catalogada", async () => {
  const sql = await readFile(rollbackPath, "utf8");
  const executable = stripSqlComments(sql);
  assert.match(executable, /^\s*BEGIN;/);
  assert.match(executable, /COMMIT;\s*$/);
  assert.doesNotMatch(executable, /\b(?:INSERT\s+INTO\s+public\.|UPDATE\s+public\.|DELETE\s+FROM\s+public\.)/i);
  assert.doesNotMatch(executable, /DROP TABLE public\.(?:keywords_kgr|listas_kgr|marcas|brand_memberships)/i);
  assert.doesNotMatch(stripSqlLiterals(executable), /\bSET\s+(?:lista_id|brand_id)\s*=/i);
  assert.match(executable, /tenant_0006_rollback_snapshot/);
  assert.match(executable, /ADD CONSTRAINT keywords_kgr_lista_id_fkey[\s\S]*ON DELETE CASCADE/);
  assert.match(executable, /TENANT_0006_ROLLBACK_BLOCKED/);
  assert.doesNotMatch(executable, /DROP CONSTRAINT/);
  assert.match(executable, /tenant_0005_listas_insert[\s\S]*marca', 'edit/);
});

test("consumidores ativos nao dependem de CASCADE para excluir listas", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const minerador = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const marcaApi = await readFile(new URL("../app/api/marcas/route.ts", import.meta.url), "utf8");
  const publishedProtection = await readFile(new URL("../supabase/migrations/0001_protect_publicado.sql", import.meta.url), "utf8");
  assert.match(architect, /remove-silo/);
  assert.match(architect, /siloId: null/);
  assert.doesNotMatch(architect, /from\(["']listas_kgr["']\)\s*\.delete\(\)/);
  assert.doesNotMatch(minerador, /from\(["']listas_kgr["']\)\s*\.delete\(\)/);
  assert.match(marcaApi, /from\(["']marcas["']\)\.delete\(\)/);
  assert.match(publishedProtection, /trg_protect_published_lista/);
  assert.match(publishedProtection, /esta lista\/silo possui keywords publicadas/);
});
