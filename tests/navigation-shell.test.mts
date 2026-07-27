import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ProductShell mantém o fluxo operacional também no Admin", async () => {
  const shell = await readFile(new URL("../components/product-shell.tsx", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../lib/editorial/navigation.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../modules/admin/admin-console.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /adminEntries/);
  assert.match(shell, /PRODUCT_FLOW/);
  assert.match(shell, /buildTenantPath/);
  assert.match(shell, /selecionar-marca\?destino=/);
  assert.match(navigation, /PRODUCT_FLOW/);
  assert.match(admin, /Seções administrativas/);
  assert.match(admin, /buildAdminPath\(item\.id\)/);
});

test("troca de marca no Admin atualiza somente os atalhos", async () => {
  const shell = await readFile(new URL("../components/product-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /if \(isAdminSurface\) return/);
  assert.match(shell, /setSelectedBrandId\(brandId\)/);
  assert.match(shell, /moduleHref\("conta"\)/);
});

test("selecionar-marca usa Server Component com Suspense e Client Component para query", async () => {
  const page = await readFile(new URL("../app/selecionar-marca/page.tsx", import.meta.url), "utf8");
  const client = await readFile(new URL("../app/selecionar-marca/select-brand-client.tsx", import.meta.url), "utf8");
  assert.match(page, /Suspense/);
  assert.doesNotMatch(page, /useSearchParams/);
  assert.match(client, /useSearchParams/);
  assert.match(client, /buildTenantPath/);
  assert.match(client, /destino/);
});

test("ESLint ignora artefatos gerados sem ocultar o codigo-fonte", async () => {
  const config = await readFile(new URL("../eslint.config.mjs", import.meta.url), "utf8");
  for (const ignored of [".next-codex-verify/**", "**/generated/**", "**/dumps/**", "**/artifacts/**"]) assert.match(config, new RegExp(ignored.replaceAll("*", "\\*")));
  assert.doesNotMatch(config, /modules\/\*\*/);
});
