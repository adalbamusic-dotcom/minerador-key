import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const factoryPath = new URL("../lib/supabase/browser-authenticated-client.ts", import.meta.url);
const mineradorPath = new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url);
const arquitetoPath = new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url);
const routePath = new URL("../app/(brand)/[brandRef]/layout.tsx", import.meta.url);

test("factory browser envia o bearer da sessão e nunca usa service_role", async () => {
  const source = await readFile(factoryPath, "utf8");
  assert.match(source, /accessToken: getCurrentSupabaseToken/);
  assert.doesNotMatch(source, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /persistSession: false/);
  assert.match(source, /autoRefreshToken: false/);
});

test("Minerador aguarda sessão, usa cliente autenticado e filtra listas e keywords", async () => {
  const source = await readFile(mineradorPath, "utf8");
  assert.match(source, /createAuthenticatedBrowserClient\(\)/);
  assert.doesNotMatch(source, /supabase\.auth\.setSession/);
  assert.match(source, /await getCurrentSupabaseToken\(\)/);
  assert.match(source, /from\("listas_kgr"\)[\s\S]*?eq\("marca_id", selectedBrandId\)/);
  assert.match(source, /from\("keywords_kgr"\)[\s\S]*?eq\("brand_id", selectedBrandId\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Arquiteto aguarda sessão, filtra o tenant e não mascara erro de listas", async () => {
  const source = await readFile(arquitetoPath, "utf8");
  assert.match(source, /createAuthenticatedBrowserClient\(\)/);
  assert.doesNotMatch(source, /supabase\.auth\.setSession/);
  assert.doesNotMatch(source, /sessionAccessToken/);
  assert.match(source, /await getCurrentSupabaseToken\(\)/);
  assert.match(source, /from\("listas_kgr"\)[\s\S]*?eq\("marca_id", selectedBrandId\)/);
  assert.match(source, /from\("keywords_kgr"\)\.select\("\*"\)\.eq\("brand_id", selectedBrandId\)/);
  assert.match(source, /table: "listas_kgr"/);
  assert.match(source, /operation: "select"/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("rotas canônicas exigem sessão e autorização de módulo antes do browser", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /requireSessionProfile\(\)/);
  assert.match(source, /resolveTenantContext/);
  assert.match(source, /canAccessTenantModule/);
});

test("nenhum cliente browser dos módulos envia service_role ou consulta sem brand", async () => {
  const [minerador, arquiteto] = await Promise.all([
    readFile(mineradorPath, "utf8"),
    readFile(arquitetoPath, "utf8"),
  ]);
  for (const source of [minerador, arquiteto]) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /createClient\(supabaseUrl, supabaseKey\)/);
  }
  assert.match(arquiteto, /keywordQuery = allowedIds\.length/);
});
