import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const factoryPath = new URL("../lib/supabase/browser-authenticated-client.ts", import.meta.url);
const browserClientPath = new URL("../lib/supabase/browser-client.ts", import.meta.url);
const mineradorPath = new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url);
const arquitetoPath = new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url);
const routePath = new URL("../app/(brand)/[brandRef]/layout.tsx", import.meta.url);
const personalRoutePath = new URL("../app/(personal)/conta/page.tsx", import.meta.url);
const selectorRoutePath = new URL("../app/selecionar-marca/page.tsx", import.meta.url);
const authzPath = new URL("../lib/server/authz.ts", import.meta.url);

test("factory browser envia o bearer da sessão e nunca usa service_role", async () => {
  const [source, browserClient] = await Promise.all([readFile(factoryPath, "utf8"), readFile(browserClientPath, "utf8")]);
  assert.match(source, /createAuthenticatedBrowserClient\(\): SupabaseClient \{ return getBrowserSupabaseClient\(\); \}/);
  assert.doesNotMatch(source, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(browserClient, /createBrowserClient/);
  assert.doesNotMatch(`${source}\n${browserClient}`, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Minerador aguarda sessão, usa cliente autenticado e filtra listas e keywords", async () => {
  const source = await readFile(mineradorPath, "utf8");
  assert.match(source, /createAuthenticatedBrowserClient\(\)/);
  assert.doesNotMatch(source, /supabase\.auth\.setSession/);
  assert.match(source, /await getCurrentSupabaseToken\(\)/);
  assert.match(source, /from\("minerador_keyword_lists"\)[\s\S]*?eq\("marca_id", selectedBrandId\)/);
  assert.match(source, /from\("minerador_keywords"\)[\s\S]*?eq\("brand_id", selectedBrandId\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Arquiteto aguarda sessão, filtra o tenant e não mascara erro de listas", async () => {
  const source = await readFile(arquitetoPath, "utf8");
  assert.match(source, /createAuthenticatedBrowserClient\(\)/);
  assert.doesNotMatch(source, /supabase\.auth\.setSession/);
  assert.doesNotMatch(source, /sessionAccessToken/);
  assert.match(source, /await getCurrentSupabaseToken\(\)/);
  assert.match(source, /from\("minerador_keyword_lists"\)[\s\S]*?eq\("marca_id", selectedBrandId\)/);
  assert.match(source, /from\("minerador_keywords"\)\.select\("\*"\)\.eq\("brand_id", selectedBrandId\)/);
  assert.match(source, /table: "minerador_keyword_lists"/);
  assert.match(source, /operation: "select"/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("rotas canônicas exigem sessão e autorização de módulo antes do browser", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /resolveCanonicalBrandTenantContext/);
  assert.match(source, /requireCanonicalTenantModule/);
  assert.doesNotMatch(source, /first brand|localStorage|profile\.marcaId/);
});

test("entradas globais protegidas redirecionam também quando o guard lança erro de sessão Supabase", async () => {
  const [personal, selector] = await Promise.all([
    readFile(personalRoutePath, "utf8"),
    readFile(selectorRoutePath, "utf8"),
  ]);
  for (const source of [personal, selector]) {
    assert.match(source, /SupabaseSessionError/);
    assert.match(source, /callbackUrl=%2Fconta/);
  }
});

test("APIs privadas convertem sessão Supabase ausente ou inválida em 401", async () => {
  const source = await readFile(authzPath, "utf8");
  assert.match(source, /err instanceof SupabaseSessionError/);
  assert.match(source, /status: 401/);
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
