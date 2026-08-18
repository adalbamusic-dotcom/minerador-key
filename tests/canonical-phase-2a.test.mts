import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Fase 2A preserva brandRef estrito e a Fase 2C remove a revalidação intermediária", async () => {
  const [layout, selector, authorization] = await Promise.all([
    read("app/(brand)/[brandRef]/layout.tsx"), read("app/selecionar-marca/select-brand-client.tsx"), read("lib/server/canonical-authorization.ts"),
  ]);
  assert.match(layout, /resolveCanonicalBrandTenantContext\(brandRef\)/);
  assert.match(layout, /requireCanonicalTenantRouteModule/);
  assert.doesNotMatch(layout, /revalidar", "brand_access"|estado=BRAND_ACCESS_DENIED/);
  assert.match(selector, /Contextos autorizados/);
  assert.doesNotMatch(selector, /router\.replace|tenants\.length === 1|localStorage|BRAND_ACCESS_DENIED/);
  assert.match(authorization, /listCanonicalAccessibleBrands/);
  assert.match(authorization, /brand_member_permissions/);
});

test("Admin global depende somente de perfis.role e não há fallback de contexto", async () => {
  const [layout, users, globalUsers] = await Promise.all([
    read("app/(admin)/layout.tsx"), read("app/api/admin/users/route.ts"), read("lib/server/global-user-admin.ts"),
  ]);
  for (const source of [layout, users]) assert.match(source, /requireCanonicalPlatformAdmin/);
  assert.match(globalUsers, /GLOBAL_USER_LAST_ADMIN/);
  assert.doesNotMatch(globalUsers, /ADMIN_EMAIL|configuredAdminEmail/);
});
