import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminPath } from "../lib/admin-routing.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
test("rota canônica de usuários é exposta no Admin", async () => {
  const consoleSource = await read("modules/admin/admin-console.tsx");
  assert.equal(buildAdminPath("usuarios"), "/admin?tab=usuarios");
  assert.match(consoleSource, /UsersAdminPanel/);
  assert.match(consoleSource, /tab === "usuarios"/);
});

test("concessão e remoção usam somente o contrato perfis.role", async () => {
  const service = await read("lib/server/global-user-admin.ts");
  assert.match(service, /\.from\("perfis"\)\.insert\(\{ id: user\.id, role: "admin" \}\)/);
  assert.match(service, /\.from\("perfis"\)\.update\(\{ role: "admin" \}\)/);
  assert.match(service, /\.from\("perfis"\)\.update\(\{ role: "cliente" \}\)/);
  assert.match(service, /requireAuthUser/);
  assert.match(service, /auth\.admin\.getUserById/);
});

test("remoção protege o último admin e a identidade configurada", async () => {
  const service = await read("lib/server/global-user-admin.ts");
  assert.match(service, /activeAdmins\.size <= 1/);
  assert.match(service, /GLOBAL_USER_LAST_ADMIN/);
  assert.doesNotMatch(service, /configuredAdminEmail|GLOBAL_USER_CONFIGURED_ADMIN/);
});

test("contratos não expõem service role ao navegador e bloqueiam chamadas diretas", async () => {
  const route = await read("app/api/admin/users/route.ts");
  const service = await read("lib/server/global-user-admin.ts");
  const panel = await read("modules/admin/users-admin-panel.tsx");
  assert.match(route, /requireCanonicalPlatformAdmin/);
  assert.doesNotMatch(route, /requireCanonicalSessionProfile|profile\.isAdmin/);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(service, /GLOBAL_USER_LAST_ADMIN/);
  assert.doesNotMatch(service, /GLOBAL_USER_CONFIGURED_ADMIN/);
  assert.doesNotMatch(service, /owner_user_id/);
  assert.doesNotMatch(service, /\.from\("brand_memberships"\)\.insert|\.from\("brand_memberships"\)\.update|\.from\("brand_memberships"\)\.delete/);
  assert.doesNotMatch(service, /\.from\("agency_memberships"\)\.insert|\.from\("agency_memberships"\)\.update|\.from\("agency_memberships"\)\.delete/);
  assert.doesNotMatch(panel, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /Confirmar remoção/);
});
