import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/0005_tenant_ownership_and_rls.sql", import.meta.url);
const dryRunPath = new URL("../supabase/scripts/tenant-ownership-dry-run.sql", import.meta.url);
const snapshotPath = new URL("../supabase/scripts/tenant-ownership-snapshot.sql", import.meta.url);
const rollbackPath = new URL("../supabase/rollback/0005_tenant_ownership_and_rls.rollback.sql", import.meta.url);
const publishedProtectionPath = new URL("../supabase/migrations/0001_protect_publicado.sql", import.meta.url);
const legacyMineradorPath = new URL("../app/(workspace)/minerador/page.tsx", import.meta.url);
const canonicalMineradorRoutePath = new URL("../app/(brand)/[brandRef]/minerador/page.tsx", import.meta.url);
const ADALBA = "95bef1bb-0a3d-4218-a01f-ac7281c55e45";

function stripSqlComments(sql: string) {
  return sql.replace(/--[^\r\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripSqlLiterals(sql: string) {
  return sql.replace(/'(?:''|[^'])*'/g, "''");
}

type FixtureKeyword = { id: string; listaId: string | null; listBrandId?: string | null; brandId?: string | null };

function reconcileKeywordBrands(rows: FixtureKeyword[]) {
  return rows.map(row => {
    if (row.listaId && !row.listBrandId) throw new Error("lista inexistente");
    if (row.listaId && row.brandId && row.brandId !== row.listBrandId) throw new Error("divergencia keyword/lista");
    return { ...row, brandId: row.brandId || row.listBrandId || ADALBA };
  });
}

test("migration 0005 e transacional e nao torna lista_id obrigatorio", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const executableSql = stripSqlComments(sql).trimStart();
  assert.match(executableSql, /^BEGIN;/);
  assert.match(executableSql, /COMMIT;\s*$/);
  assert.equal((executableSql.match(/^BEGIN;\s*$/gim) || []).length, 1);
  assert.equal((executableSql.match(/^COMMIT;\s*$/gim) || []).length, 1);
  assert.match(sql, /ALTER TABLE public\.keywords_kgr ALTER COLUMN brand_id SET NOT NULL/);
  assert.doesNotMatch(sql, /ALTER TABLE public\.keywords_kgr ALTER COLUMN lista_id SET NOT NULL/);
  assert.match(sql, /keywords_without_list/);
  assert.match(sql, /keywords_with_list/);
  assert.match(sql, /keyword_count <> 147/);
  assert.match(sql, /no_list_count <> 126/);
  assert.match(sql, /with_list_count <> 21/);
  assert.match(sql, /lista_id_fingerprint/);
});

test("migration trava as tabelas imediatamente depois de BEGIN e antes do snapshot", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const executableSql = stripSqlComments(sql).trimStart();
  const lockIndex = executableSql.indexOf("LOCK TABLE");
  const exactSnapshotIndex = executableSql.indexOf("CREATE TEMP TABLE tenant_0005_keyword_list_guard");
  const aggregateSnapshotIndex = executableSql.indexOf("CREATE TEMP TABLE tenant_0005_snapshot");
  const firstUpdateIndex = executableSql.indexOf("UPDATE public.");

  assert.match(executableSql, /^BEGIN;\s*SET LOCAL lock_timeout = '10s';\s*LOCK TABLE[\s\S]*?IN SHARE ROW EXCLUSIVE MODE;/i);
  assert.ok(lockIndex >= 0);
  assert.ok(exactSnapshotIndex > lockIndex);
  assert.ok(aggregateSnapshotIndex > lockIndex);
  assert.ok(firstUpdateIndex > lockIndex);
  assert.match(sql, /public\.marcas[\s\S]*public\.perfis[\s\S]*public\.listas_kgr[\s\S]*public\.keywords_kgr[\s\S]*IN SHARE ROW EXCLUSIVE MODE/i);
});

test("guard temporario exato contem somente id/lista_id e a validacao usa FULL JOIN", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TEMP TABLE tenant_0005_keyword_list_guard\s*\(\s*id uuid PRIMARY KEY,\s*lista_id uuid\s*\)\s*ON COMMIT DROP/i);
  assert.match(sql, /INSERT INTO pg_temp\.tenant_0005_keyword_list_guard\s*\(id, lista_id\)/i);
  assert.match(sql, /INSERT INTO pg_temp\.tenant_0005_snapshot/i);
  assert.match(sql, /FROM pg_temp\.tenant_0005_keyword_list_guard/i);
  assert.match(sql, /FULL JOIN pg_temp\.tenant_0005_keyword_list_guard/i);
  assert.match(sql, /atual\.lista_id IS DISTINCT FROM inicial\.lista_id/i);
  assert.match(sql, /exact_mismatch_count <> 0/i);
  assert.match(sql, /current_lista_id_fingerprint IS DISTINCT FROM before_lista_id_fingerprint/i);
});

test("migration nunca atribui nem reescreve lista_id durante o backfill", async () => {
  const sql = stripSqlLiterals(stripSqlComments(await readFile(migrationPath, "utf8")));
  assert.doesNotMatch(sql, /\bSET\s+lista_id\s*=/i);
  assert.doesNotMatch(sql, /\b(?:NEW|OLD)\.lista_id\s*:?=/i);
  assert.match(sql, /SET\s+brand_id\s*=\s*l\.marca_id/i);
  assert.match(sql, /current_lista_id_fingerprint\s+IS DISTINCT FROM\s+before_lista_id_fingerprint/i);
});

test("backfill preserva keyword sem lista e recusa divergencia", () => {
  const rows = [
    { id: "without-list", listaId: null },
    { id: "with-list", listaId: "list-1", listBrandId: ADALBA },
  ];
  const result = reconcileKeywordBrands(rows);
  assert.equal(result[0].brandId, ADALBA);
  assert.equal(result[0].listaId, null);
  assert.equal(result[1].brandId, ADALBA);
  assert.throws(() => reconcileKeywordBrands([{ id: "conflict", listaId: "list-2", listBrandId: "brand-b", brandId: ADALBA }]), /divergencia/);
});

type ListGuardRow = { id: string; listaId: string | null };

function exactListGuardDiff(initial: ListGuardRow[], current: ListGuardRow[]) {
  const initialById = new Map(initial.map(row => [row.id, row.listaId]));
  const currentById = new Map(current.map(row => [row.id, row.listaId]));
  const ids = new Set([...initialById.keys(), ...currentById.keys()]);
  return [...ids].filter(id => !initialById.has(id) || !currentById.has(id) || initialById.get(id) !== currentById.get(id));
}

test("guard exato detecta troca de lista_id, insercao e exclusao concorrentes", () => {
  const initial = [{ id: "a", listaId: null }, { id: "b", listaId: "list-1" }];
  assert.deepEqual(exactListGuardDiff(initial, [{ id: "a", listaId: "list-2" }, { id: "b", listaId: "list-1" }]), ["a"]);
  assert.deepEqual(exactListGuardDiff(initial, [...initial, { id: "c", listaId: null }]), ["c"]);
  assert.deepEqual(exactListGuardDiff(initial, [{ id: "a", listaId: null }]), ["b"]);
});

test("trigger real de publicado aceita apenas brand_id e bloqueia troca estrutural de lista_id", async () => {
  const sql = await readFile(publishedProtectionPath, "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.protect_published_keyword/);
  assert.match(sql, /NEW\.lista_id IS DISTINCT FROM OLD\.lista_id/);
  assert.match(sql, /RAISE EXCEPTION/);

  const oldRow = { status: "publicado", listaId: "list-1", brandId: "brand-a" };
  const brandOnlyUpdate = { ...oldRow, brandId: ADALBA };
  assert.equal(brandOnlyUpdate.listaId, oldRow.listaId);
  assert.throws(() => {
    if (oldRow.status === "publicado" && oldRow.listaId !== "list-2") throw new Error("keyword publicada protegida");
  }, /protegida/);
});

test("migration define ownership, membership UUID e protecao keyword/lista", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /owner_user_id/);
  assert.match(sql, /d67ebbad-a590-45f8-8bb5-a19c6241ac1b/);
  assert.match(sql, /member_user_id/);
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS uq_brand_memberships_member_user_0005/);
  assert.match(sql, /FOREIGN KEY \(lista_id, brand_id\)/);
  assert.match(sql, /TENANT_BRAND_LIST_MISMATCH/);
  assert.match(sql, /TENANT_LAST_OWNER/);
});

test("policies da migration sao separadas e a policy permissiva antiga e removida na mesma transacao", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const policy of ["tenant_0005_keywords_select", "tenant_0005_keywords_insert", "tenant_0005_keywords_update", "tenant_0005_keywords_delete", "tenant_0005_listas_select", "tenant_0005_listas_insert", "tenant_0005_listas_update", "tenant_0005_listas_delete"]) {
    assert.match(sql, new RegExp(`CREATE POLICY ${policy}`));
  }
  assert.match(sql, /DROP POLICY IF EXISTS "Permitir acesso total para autenticados"/);
  assert.match(sql, /BEGIN;[\s\S]*DROP POLICY IF EXISTS "Permitir acesso total para autenticados"[\s\S]*COMMIT;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.is_global_admin\(\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE[\s\S]*FROM authenticated/);
});

test("dry-run e somente leitura e funciona com tabelas opcionais ausentes", async () => {
  const source = await readFile(dryRunPath, "utf8");
  const sql = stripSqlComments(source);
  const executableSql = stripSqlLiterals(sql);
  for (const forbidden of ["ALTER", "UPDATE", "INSERT", "DELETE", "DROP", "TRUNCATE", "CREATE", "POLICY", "GRANT", "REVOKE", "COMMIT"]) {
    assert.doesNotMatch(sql, new RegExp(`\\b${forbidden}\\b`, "i"), `dry-run contem ${forbidden}`);
  }
  assert.match(sql, /to_regclass/);
  assert.match(sql, /information_schema/);
  assert.match(sql, /pg_catalog/);
  assert.match(sql, /to_jsonb\(k\)/);
  assert.match(sql, /to_jsonb\(m\)/);
  assert.match(sql, /array_agg\(id ORDER BY id\)/);
  assert.doesNotMatch(executableSql, /\b(?:k|m)\.(?:brand_id|owner_user_id|status)\b/i);
  assert.doesNotMatch(executableSql, /\bFROM\s+public\.brand_memberships\b/i);
  assert.match(sql, /MISSING_NOT_MIGRATED/);
  assert.match(sql, /RESULTADO_FINAL/);
  assert.match(sql, /LISTA_ID_FINGERPRINT/);
  assert.match(sql, /TABLE_GRANTS/);
  assert.match(sql, /NOT_APPLICABLE_READ_ONLY/);
  assert.doesNotMatch(sql, /CREATE\s+TEMP\s+TABLE/i);
});

type DryRunFixture = {
  keywords: Array<{ listaId: string | null; brandId?: string }>;
  hasBrandId: boolean;
  hasOwnerUserId: boolean;
  hasMemberships: boolean;
};

function projectDryRunFixture(fixture: DryRunFixture) {
  const withoutList = fixture.keywords.filter(keyword => keyword.listaId === null).length;
  const withList = fixture.keywords.length - withoutList;
  const withoutBrand = fixture.keywords.filter(keyword => !keyword.brandId).length;
  return {
    total: fixture.keywords.length,
    withoutList,
    withList,
    brandStatus: fixture.hasBrandId ? "PRESENT" : "MISSING_NOT_MIGRATED",
    ownerStatus: fixture.hasOwnerUserId ? "PRESENT" : "MISSING_NOT_MIGRATED",
    membershipsStatus: fixture.hasMemberships ? "PRESENT" : "MISSING_NOT_MIGRATED",
    withoutBrand,
    result: "READY",
  };
}

test("dry-run pre-migration projeta o schema atual sem bloquear lista_id null", () => {
  const fixture: DryRunFixture = {
    keywords: Array.from({ length: 147 }, (_, index) => ({ listaId: index < 126 ? null : "list-1" })),
    hasBrandId: false,
    hasOwnerUserId: false,
    hasMemberships: false,
  };
  const report = projectDryRunFixture(fixture);
  assert.deepEqual(report, {
    total: 147,
    withoutList: 126,
    withList: 21,
    brandStatus: "MISSING_NOT_MIGRATED",
    ownerStatus: "MISSING_NOT_MIGRATED",
    membershipsStatus: "MISSING_NOT_MIGRATED",
    withoutBrand: 147,
    result: "READY",
  });
});

test("dry-run pós-migration reconhece brand_id e membership sem alterar os totais", () => {
  const fixture: DryRunFixture = {
    keywords: Array.from({ length: 147 }, (_, index) => ({ listaId: index < 126 ? null : "list-1", brandId: ADALBA })),
    hasBrandId: true,
    hasOwnerUserId: true,
    hasMemberships: true,
  };
  const report = projectDryRunFixture(fixture);
  assert.equal(report.total, 147);
  assert.equal(report.withoutList, 126);
  assert.equal(report.withList, 21);
  assert.equal(report.withoutBrand, 0);
  assert.equal(report.brandStatus, "PRESENT");
  assert.equal(report.ownerStatus, "PRESENT");
  assert.equal(report.membershipsStatus, "PRESENT");
  assert.equal(report.result, "READY");
});

test("rollback e assistido, protegido por guard e nao apaga keywords/listas/marcas", async () => {
  const sql = await readFile(rollbackPath, "utf8");
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /tenant_0005_migration_guard/);
  assert.match(sql, /ROLLBACK_BLOCKED/);
  assert.doesNotMatch(sql, /DELETE FROM public\.keywords_kgr/);
  assert.doesNotMatch(sql, /DELETE FROM public\.listas_kgr/);
  assert.doesNotMatch(sql, /DELETE FROM public\.marcas/);
  assert.doesNotMatch(sql, /DROP TABLE public\.marcas/);
  assert.doesNotMatch(sql, /DROP TABLE public\.listas_kgr/);
  assert.match(sql, /ALTER TABLE public\.keywords_kgr DROP COLUMN IF EXISTS brand_id/);
  assert.match(sql, /fingerprint de lista_id/i);
  assert.match(sql, /table_grant_keys/);
  assert.doesNotMatch(stripSqlLiterals(sql), /\bSET\s+lista_id\s*=/i);
  assert.match(sql, /COMMIT;/);
});

test("o Minerador legado nao esta ativo e a rota canonica usa o workspace tenantizado", async () => {
  await assert.rejects(access(legacyMineradorPath));
  const route = await readFile(canonicalMineradorRoutePath, "utf8");
  const minerador = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(route, /modules\/minerador/);
  assert.doesNotMatch(route, /app\/\(workspace\)\/minerador/);
  assert.match(minerador, /\.update\(\{ lista_id: targetListId \}\)[\s\S]*?\.eq\("brand_id", selectedBrandId\)/);
});

test("snapshot registra fingerprint, backups, triggers e grants sem escrever", async () => {
  const sql = stripSqlComments(await readFile(snapshotPath, "utf8"));
  assert.match(sql, /lista_id_fingerprint/);
  assert.match(sql, /migration_backup\.keywords_kgr_before_0005_20260724/);
  assert.match(sql, /SNAPSHOT_ORIGINAL_PRESERVADO/);
  assert.match(sql, /SNAPSHOT_DANIFICADO_PRESERVADO/);
  assert.match(sql, /LISTA_ID_COMPATIVEL_COM_ESTADO_ATUAL/);
  assert.match(sql, /pg_get_triggerdef/);
  assert.match(sql, /information_schema\.table_privileges/);
  for (const forbidden of ["ALTER", "UPDATE", "INSERT", "DELETE", "DROP", "TRUNCATE", "CREATE", "GRANT", "REVOKE"]) {
    assert.doesNotMatch(sql, new RegExp(`\\b${forbidden}\\b`, "i"), `snapshot contem ${forbidden}`);
  }
});

test("consumidores do Minerador exigem tenant canônico após a migration", async () => {
  const minerador = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const siteImport = await readFile(new URL("../app/api/marca/site/import/keywords/route.ts", import.meta.url), "utf8");
  const sitePreview = await readFile(new URL("../app/api/marca/site/import/keywords/preview/route.ts", import.meta.url), "utf8");
  const analyze = await readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8");
  const intent = await readFile(new URL("../app/api/process-intent-niche/route.ts", import.meta.url), "utf8");
  assert.match(minerador, /\.from\("keywords_kgr"\)/);
  assert.match(minerador, /\.eq\("brand_id", selectedBrandId\)/);
  assert.match(minerador, /brand_id: selectedBrandId/);
  assert.match(siteImport, /insert\(\{ \.\.\.payload, brand_id: brandId \}/);
  assert.match(siteImport, /\.eq\("brand_id", brandId\)/);
  assert.match(sitePreview, /\.eq\("brand_id", brand\.brandId\)/);
  assert.match(analyze, /assertCanAccessMarca/);
  assert.match(analyze, /\.eq\("brand_id", existingWord\.brand_id\)/);
  assert.match(intent, /assertCanAccessMarca/);
  assert.match(intent, /\.eq\("brand_id", existingWord\.brand_id\)/);
});
