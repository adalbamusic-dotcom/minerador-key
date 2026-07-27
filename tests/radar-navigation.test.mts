import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveArchitectDeepLink, sameStringSet } from "../lib/arquiteto/deep-link.ts";

const article = { id: "pub-k-principal", provisionalGroupId: "pub-b-artigo", clusterId: "cluster-1" };

test("deep-link encontra artigo publicado e produz a linha correta", () => {
  assert.deepEqual(resolveArchitectDeepLink([article], "pub-b-artigo", "brand-1", null), { requestKey: "brand-1:pub-b-artigo", articleRowId: "art-cluster-1" });
  assert.deepEqual(resolveArchitectDeepLink([article], "pub-k-principal", "brand-1", null)?.articleRowId, "art-cluster-1");
});

test("deep-link consumido não processa o mesmo ID novamente e ID ausente não atualiza estado", () => {
  assert.equal(resolveArchitectDeepLink([article], "pub-b-artigo", "brand-1", "brand-1:pub-b-artigo"), null);
  assert.equal(resolveArchitectDeepLink([article], "missing", "brand-1", null), null);
  assert.equal(resolveArchitectDeepLink([{ id: "no-cluster" }], "no-cluster", "brand-1", null), null);
});

test("comparação de Set evita setter quando expansão e seleção já estão corretas", () => {
  const current = new Set(["art-cluster-1"]);
  assert.equal(sameStringSet(current, ["art-cluster-1"]), true);
  assert.equal(sameStringSet(current, ["art-cluster-2"]), false);
  assert.equal(sameStringSet(new Set(["art-cluster-1", "other"]), ["art-cluster-1"]), false);
});

test("Radar mantém Abrir no próprio módulo e separa a navegação para o Arquiteto", () => {
  const source = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(source, /Abrir no Radar/);
  assert.match(source, /Ver no Arquiteto/);
  assert.doesNotMatch(source, /<Link className=\{btn\} href=\{`\/arquiteto\?articleId=\$\{row\.articleId\}`\}>Abrir<\/Link>/);
});

test("pagina propria do Radar declara as sete abas e navega por articleId", () => {
  const page = readFileSync(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
  assert.match(page, /Resumo[\s\S]*SERP[\s\S]*Concorrentes[\s\S]*Estrutura observada[\s\S]*Semântica observada[\s\S]*Curadoria[\s\S]*Histórico/);
  assert.match(page, /\/api\/editorial\/radar-analysis\/extract/);
  assert.match(page, /site_url.*article\.payload\.canonical/);
  assert.match(page, /tab === "serp" && renderSerp\(\)/);
  assert.match(page, /Snapshot não encontrado|Resultados:/);
  assert.doesNotMatch(page, /adalbapro\.com\.br/);
});

test("listas de semântica e entidades usam chaves únicas quando os valores se repetem", () => {
  const page = readFileSync(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /frequentEntities\.map\(entity =>/);
  assert.doesNotMatch(page, /semanticTerms\.map\(term =>/);
  assert.match(page, /frequentEntities\.map\(\(entity, index\) =>[\s\S]*key=\{entity \+ ":" \+ index\}/);
  assert.match(page, /terms\.map\(\(term, index\) =>[\s\S]*key=\{term\.term \+ ":" \+ index\}/);
});
