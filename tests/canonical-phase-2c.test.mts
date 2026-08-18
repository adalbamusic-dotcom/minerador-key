import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("seletor canônico lista Admin, agências e marcas sem escolher primeiro contexto", async () => {
  const [selector, route, shell] = await Promise.all([read("app/selecionar-marca/select-brand-client.tsx"), read("app/api/contexts/route.ts"), read("components/product-shell.tsx")]);
  assert.match(selector, /Administração global/);
  assert.match(selector, /Minha Agência/);
  assert.match(selector, /Marcas/);
  assert.match(selector, /fetch\("\/api\/contexts"/);
  assert.doesNotMatch(selector, /tenants\.length === 1|router\.replace|localStorage|BRAND_ACCESS_DENIED/);
  assert.match(route, /listCanonicalAccessibleAgencies/);
  assert.match(route, /listCanonicalAccessibleBrands\("marca"\)/);
  assert.match(shell, /Minha Agência/);
});

test("autorização editorial exige owner ou membership UUID explícito", async () => {
  const [authz, tenant, editorial] = await Promise.all([read("lib/server/authz.ts"), read("lib/server/tenant-context.ts"), read("lib/server/editorial-authorization.ts")]);
  for (const source of [authz, tenant, editorial]) assert.doesNotMatch(source, /\.eq\("user_key"|profile\.marcaId|bootstrapPlatformAdmin/);
  assert.match(authz, /owner_user_id/);
  assert.match(authz, /member_user_id/);
  assert.match(editorial, /member_user_id", profile\.userId/);
  assert.doesNotMatch(tenant, /profile\.isAdmin\) return|isGlobalAdmin \|\|/);
});

test("Admin global persiste somente em perfis.role e não fica preso a ADMIN_EMAIL", async () => {
  const source = await read("lib/server/global-user-admin.ts");
  assert.match(source, /GLOBAL_USER_LAST_ADMIN/);
  assert.doesNotMatch(source, /ADMIN_EMAIL|configuredAdminEmail|GLOBAL_USER_CONFIGURED_ADMIN/);
});

test("bootstrap inicial é parametrizado, auditável e preserva owners de marcas", async () => {
  const [preflight, bootstrap, validation] = await Promise.all([read("supabase/scripts/fase-2c-initial-identity-preflight-read-only.sql"), read("supabase/scripts/fase-2c-initial-identity-bootstrap.sql"), read("supabase/scripts/fase-2c-initial-identity-post-bootstrap-validation-read-only.sql")]);
  assert.match(preflight, /__BOOTSTRAP_EMAIL__/);
  assert.match(preflight, /READY_FOR_MANUAL_BOOTSTRAP/);
  assert.match(preflight, /ABSENT_WILL_BE_CREATED/);
  assert.match(preflight, /BRAND_OWNER_MISSING_OR_INVALID/);
  assert.doesNotMatch(preflight, /REQUIRED_AGENCY_BRAND_LINKS_INCOMPLETE/);
  assert.doesNotMatch(preflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|BEGIN|COMMIT)\b/i);
  assert.match(bootstrap, /^--[\s\S]*BEGIN;/);
  assert.match(bootstrap, /COMMIT;\s*$/);
  assert.match(bootstrap, /FASE_2C_BOOTSTRAP_ACTOR_NOT_UNIQUE_OR_MISSING/);
  assert.match(bootstrap, /FASE_2C_BOOTSTRAP_BRAND_OWNER_CHANGED/);
  assert.match(bootstrap, /INSERT INTO public\.agencies/);
  assert.match(bootstrap, /INSERT INTO public\.agency_brands/);
  assert.match(bootstrap, /FASE_2C_BOOTSTRAP_ACTIVE_AGENCY_LINK_CONFLICT/);
  assert.match(bootstrap, /member_user_id/);
  assert.doesNotMatch(bootstrap, /SET owner_user_id.*public\.marcas|INSERT INTO public\.marcas/i);
  assert.match(validation, /global_admin_role/);
  assert.match(validation, /agency_count/);
  assert.match(validation, /brand_owners_preserved/);
  assert.match(validation, /post_bootstrap_status/);
  assert.doesNotMatch(validation, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|BEGIN|COMMIT)\b/i);
});
