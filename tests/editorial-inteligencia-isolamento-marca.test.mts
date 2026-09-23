import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// /api/inteligencia lê minerador_keywords com service role: a RLS não filtra, então o isolamento por marca
// depende inteiramente do .eq("brand_id", marcaId) na própria consulta. Antes da correção de 2026-09-23 a rota
// devolvia keywords sem lista de todas as marcas (267 linhas de 3 marcas para uma marca com 39).
// Os comentários são removidos antes de casar, senão o teste casaria com o próprio comentário da rota.
async function routeSourceWithoutComments() {
  const source = await readFile(new URL("../app/api/inteligencia/route.ts", import.meta.url), "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function keywordQueries(source: string) {
  const chains: string[] = [];
  const marker = 'from("minerador_keywords")';
  let index = source.indexOf(marker);
  while (index !== -1) {
    const rest = source.slice(index);
    const next = rest.slice(marker.length).search(/\.from\(|\n\s*\]\)/);
    chains.push(next === -1 ? rest : rest.slice(0, marker.length + next));
    index = source.indexOf(marker, index + marker.length);
  }
  return chains;
}

test("consulta de minerador_keywords em /api/inteligencia filtra pela marca pedida", async () => {
  const chains = keywordQueries(await routeSourceWithoutComments());
  assert.ok(chains.length >= 1, "a rota deve consultar minerador_keywords");
  for (const chain of chains) {
    assert.match(chain, /\.eq\(\s*"brand_id"\s*,\s*marcaId\s*\)/, "toda consulta de keywords precisa de .eq(\"brand_id\", marcaId)");
  }
});

test("a correção mantém o .or() de lista e o gate de siloIds", async () => {
  const source = await routeSourceWithoutComments();
  const [chain] = keywordQueries(source);
  assert.match(chain, /\.or\(`lista_id\.is\.null,\$\{siloIds\.map\(/, "o .or() de lista (sem lista ou lista da marca) continua");
  assert.match(chain, /\.is\(\s*"deleted_at"\s*,\s*null\s*\)/, "keywords excluídas continuam fora");
  assert.match(source, /siloIds\.length\s*\?\s*await Promise\.all\(\[\s*profile\.supabase\.from\("minerador_keywords"\)/,
    "marca sem listas continua sem consultar keywords aqui");
});

test("a rota continua exigindo acesso à marca antes de ler dados", async () => {
  const source = await routeSourceWithoutComments();
  const authz = source.indexOf("assertCanAccessMarca(profile.userId, marcaId, profile)");
  const firstRead = source.indexOf('.from("');
  assert.ok(authz !== -1 && firstRead !== -1 && authz < firstRead, "assertCanAccessMarca vem antes da primeira leitura");
});
