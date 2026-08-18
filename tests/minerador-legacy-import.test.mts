import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { manualImportListaId, resolveLegacyCsvSilo } from "../lib/minerador/legacy-import.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const brandA = "11111111-1111-4111-8111-111111111111";
const brandB = "22222222-2222-4222-8222-222222222222";
const lists = [{ id: "33333333-3333-4333-8333-333333333333", nome: "Captação de Pacientes", marca_id: brandA }];

test("manual e CSV aceitam ausência real de silo", () => {
  assert.deepEqual(resolveLegacyCsvSilo({ rawReference: undefined, brandId: brandA, lists }), { listaId: null, issue: null });
  assert.deepEqual(resolveLegacyCsvSilo({ rawReference: "", brandId: brandA, lists }), { listaId: null, issue: null });
  assert.equal(manualImportListaId({ selectedListId: "", brandId: brandA, lists }), null);
});

test("CSV misto preserva vínculo existente e bloqueia somente referência explícita inexistente", () => {
  assert.deepEqual(resolveLegacyCsvSilo({ rawReference: "captação de pacientes", brandId: brandA, lists }), { listaId: lists[0].id, issue: null });
  assert.deepEqual(resolveLegacyCsvSilo({ rawReference: lists[0].id, brandId: brandA, lists }), { listaId: lists[0].id, issue: null });
  assert.deepEqual(resolveLegacyCsvSilo({ rawReference: "Silo inexistente", brandId: brandA, lists }), { listaId: null, issue: "silo_reference_not_found" });
});

test("lista opcional não cruza marcas", () => {
  assert.equal(manualImportListaId({ selectedListId: lists[0].id, brandId: brandB, lists }), null);
  assert.deepEqual(resolveLegacyCsvSilo({ rawReference: "Captação de Pacientes", brandId: brandB, lists }), { listaId: null, issue: "silo_reference_not_found" });
});

test("workspace não descarta keyword sem silo nem cria silo automaticamente", async () => {
  const source = await read("modules/minerador/minerador-workspace.tsx");
  assert.match(source, /resolveLegacyCsvSilo/);
  assert.match(source, /lista_id: matchedListId/);
  assert.match(source, /lista_id: resolvedManualListId/);
  assert.match(source, /<option value="">Sem silo<\/option>/);
  assert.match(source, /Nenhum silo disponível\. As keywords serão importadas sem silo\./);
  assert.match(source, /const openManualModal = \(\) => \{\s*setManualListId\(""\);/);
  assert.doesNotMatch(source, /Erro ao auto-criar silo do CSV/);
  assert.doesNotMatch(source, /Nenhuma palavra-chave válida associada a um Silo/);
  assert.doesNotMatch(source, /Selecione uma Categoria\/Silo para associar os novos termos/);
});

test("schema canônico mantém lista opcional e FK somente quando houver referência", async () => {
  const migration = await read("supabase/migrations/0005_tenant_ownership_and_rls.sql");
  assert.match(migration, /WHERE lista_id IS NULL AND brand_id IS NULL/);
  assert.match(migration, /IF NEW\.lista_id IS NOT NULL AND NOT EXISTS/);
  assert.doesNotMatch(migration, /ALTER TABLE public\.keywords_kgr ALTER COLUMN lista_id SET NOT NULL/);
});
