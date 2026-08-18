import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const runtimeRoots = ["app", "components", "lib", "modules"];
const sourceExtension = /\.(?:ts|tsx|js|mjs)$/;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(new URL(`${directory}/`, root), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : sourceExtension.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test("Fase 2D elimina contratos legados do runtime, nao apenas de imports diretos", async () => {
  const files = (await Promise.all(runtimeRoots.map(sourceFiles))).flat();
  const sources = await Promise.all(files.map(async (path) => [path, await read(path)] as const));
  const banned = /requireSessionProfile|safe-auth-next|safeAuthNext|ADMIN_EMAIL|getServerSession|next-auth|brandUserId|profile\.email|profile\.marcaId|\.eq\("user_key"|canonical_role/;
  const offender = sources.find(([, source]) => banned.test(source));
  assert.equal(offender, undefined, offender ? `contrato legado em ${offender[0]}` : "");
});

test("sessao e preferencias pessoais usam UUID Supabase do ator", async () => {
  const [authz, workspace, documents, views, repositories, canonical] = await Promise.all([
    read("lib/server/authz.ts"), read("app/api/editorial/workspace/route.ts"), read("app/api/editorial/documents/route.ts"),
    read("app/api/editorial/views/route.ts"), read("lib/server/editorial-repositories.ts"), read("lib/server/canonical-authorization.ts"),
  ]);
  assert.match(authz, /requireSupabaseUser/);
  assert.match(authz, /CanonicalSessionProfile/);
  const sessionProfile = authz.slice(authz.indexOf("export interface CanonicalSessionProfile"), authz.indexOf("async function buildCanonicalSessionProfile"));
  assert.doesNotMatch(sessionProfile, /\bemail\s*:|\bmarcaId\s*:/);
  for (const source of [workspace, documents, views, repositories]) assert.match(source, /userId|user_id/);
  assert.doesNotMatch(repositories, /user_key/);
  assert.match(canonical, /select\("id,agency_id,user_id,role,status"\)/);
  assert.doesNotMatch(canonical, /canonical_role/);
});

test("a ponte 0016 preserva dados, exige UUID comprovado e prepara o papel final", async () => {
  const [migration, validation, rollback] = await Promise.all([
    read("supabase/migrations/0016_legacy_identity_runtime_bridge.sql"),
    read("supabase/scripts/fase-2d-legacy-identity-post-bridge-validation-read-only.sql"),
    read("supabase/scripts/fase-2d-0016-rollback.sql"),
  ]);
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /PHASE_2D_0016_CONFLICT/);
  assert.match(migration, /member_user_id/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS user_id uuid/);
  assert.match(migration, /EDITORIAL_TABLES|grupo editorial legado parcial/);
  assert.match(migration, /role IN \('agency_admin', 'agency_member'\)/);
  assert.doesNotMatch(migration, /DROP COLUMN/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(validation, /SOMENTE LEITURA/);
  assert.match(validation, /EDITORIAL_TABLES_ABSENT_NOT_MIGRATED/);
  assert.match(validation, /p\.proname = 'editorial_has_permission' AND p\.prosecdef IS NOT TRUE/);
  assert.match(validation, /p\.proname = 'editorial_current_actor_id' AND p\.prosecdef IS TRUE/);
  assert.match(rollback, /tenant_0016_agency_role_rollback/);
});
