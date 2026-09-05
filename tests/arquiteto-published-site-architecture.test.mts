import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPublishedSiteArchitecture,
  getPublishedParentStructure,
  nearestPublishedAncestor,
  parentPathOf,
  publishedPathOf,
} from "../lib/arquiteto/published-site-architecture.ts";

const entry = (path: string, extra: Record<string, unknown> = {}) => ({
  normalizedUrl: `site.com.br${path === "/" ? "" : path}`,
  discoveredUrl: `https://site.com.br${path === "/" ? "" : path}`,
  resolvedUrl: `https://site.com.br${path === "/" ? "" : path}`,
  normalizedCanonicalUrl: `site.com.br${path === "/" ? "" : path}`,
  title: null,
  h1: null,
  pageType: "unknown",
  verificationStatus: "canonical_confirmed",
  ...extra,
});

const build = (paths: string[], overrides: Record<string, Record<string, unknown>> = {}) =>
  buildPublishedSiteArchitecture({ catalog: paths.map(path => entry(path, overrides[path] || {})) });

const roleOf = (arq: ReturnType<typeof build>, path: string) => arq.nodes.find(node => node.path === path)?.role;

/* ------------------------------ caminho puro ----------------------------- */

test("caminho e pai saem da URL, sem semântica", () => {
  assert.equal(publishedPathOf("site.com.br/a/b/"), "/a/b");
  assert.equal(publishedPathOf("https://site.com.br"), "/");
  assert.equal(parentPathOf("/a/b/c"), "/a/b");
  assert.equal(parentPathOf("/a"), "/");
  assert.equal(parentPathOf("/"), null);
});

test("o ancestral publicado sobe a cadeia inteira", () => {
  const publicados = new Set(["/silo", "/silo/subtema/artigo"]);
  // `/silo/subtema` não existe: o artigo continua ligado a `/silo`.
  assert.equal(nearestPublishedAncestor("/silo/subtema/artigo", publicados), "/silo");
  assert.equal(nearestPublishedAncestor("/solto", publicados), null);
});

/* ------------------------------ A · raiz + filhos ------------------------ */

test("A · raiz com quatro filhos vira raiz editorial e os filhos viram folhas", () => {
  const arq = build([
    "/anti-idade-e-retinol",
    "/anti-idade-e-retinol/pomada-retinol-para-o-rosto-preco",
    "/anti-idade-e-retinol/preco-do-retinol-para-o-rosto",
    "/anti-idade-e-retinol/qual-melhor-creme-para-rugas",
    "/anti-idade-e-retinol/qual-o-valor-do-retinol",
  ]);

  assert.equal(arq.counts.editorialRoots, 1);
  assert.equal(arq.counts.leaves, 4);
  const raiz = arq.editorialRoots[0];
  assert.equal(raiz.path, "/anti-idade-e-retinol");
  assert.equal(raiz.confidence, "strong");
  assert.equal(raiz.childPaths.length, 4);
  for (const folha of arq.leaves) {
    assert.equal(folha.structuralRootPath, "/anti-idade-e-retinol");
    assert.match(folha.evidence.join(" "), /é página filha, não raiz de universo/);
  }
});

/* --------------------------- B · home não é silo ------------------------- */

test("B · a home tem todos os descendentes e mesmo assim NÃO é silo", () => {
  const arq = build(["/", "/tema-a", "/tema-a/artigo", "/tema-b", "/tema-b/artigo"]);

  assert.equal(arq.home?.path, "/");
  assert.equal(arq.home?.role, "site_home");
  // Contagem de filhos sozinha promoveria a home — e é justamente o que não pode.
  assert.equal(arq.editorialRoots.some(node => node.path === "/"), false);
  assert.match(arq.home!.evidence.join(" "), /não um universo editorial/);
});

/* ------------------------- C · institucional fora ------------------------ */

test("C · institucional e técnico ficam fora da arquitetura editorial", () => {
  const arq = build(["/afiliados", "/sobre", "/contato", "/politica-de-privacidade", "/tag/skincare", "/tema", "/tema/artigo"]);

  for (const path of ["/afiliados", "/sobre", "/contato", "/politica-de-privacidade", "/tag/skincare"]) {
    assert.equal(roleOf(arq, path), "institutional", `${path} deveria ser institucional`);
  }
  assert.equal(roleOf(arq, "/tema"), "editorial_root");
  assert.equal(arq.editorialRoots.some(node => node.path === "/afiliados"), false);
});

/* ---------------------------- D · órfão sem pai -------------------------- */

test("D · artigo solto na raiz não vira silo nem folha inventada", () => {
  const arq = build(["/artigo-a", "/artigo-b"]);

  assert.equal(arq.counts.editorialRoots, 0);
  assert.equal(arq.counts.leaves, 0);
  assert.equal(arq.counts.unresolved, 2);
  assert.match(arq.unresolved[0].evidence.join(" "), /não há relação estrutural segura/);
  assert.equal(arq.unresolved[0].confidence, "weak");
});

/* --------------------------- E · hierarquia funda ------------------------ */

test("E · a cadeia inteira é preservada e o subtema não vira silo sozinho", () => {
  const arq = build(["/silo", "/silo/subtema", "/silo/subtema/artigo"]);

  assert.equal(roleOf(arq, "/silo"), "editorial_root");
  // Subtema tem ancestral publicado: é folha, não uma segunda raiz.
  assert.equal(roleOf(arq, "/silo/subtema"), "leaf");
  assert.equal(roleOf(arq, "/silo/subtema/artigo"), "leaf");
  const artigo = arq.nodes.find(node => node.path === "/silo/subtema/artigo")!;
  assert.equal(artigo.parentPath, "/silo/subtema");
  assert.equal(artigo.structuralRootPath, "/silo", "o Silo publicado é a raiz, não o subtema");
});

/* ----------------------- F/G · publicado permanece ----------------------- */

test("F · raiz já reconciliada não duplica: cada URL é um nó só", () => {
  const arq = build(["/tema", "/tema/artigo", "/tema/artigo"]);

  const nos = arq.nodes.filter(node => node.path === "/tema");
  assert.equal(nos.length, 1);
});

test("G · canonical publicado atravessa intacto", () => {
  const arq = build(["/tema", "/tema/artigo"], {
    "/tema/artigo": { normalizedCanonicalUrl: "site.com.br/tema/artigo", h1: "Artigo publicado" },
  });

  const artigo = arq.nodes.find(node => node.path === "/tema/artigo")!;
  assert.equal(artigo.canonical, "site.com.br/tema/artigo");
  assert.equal(artigo.label, "Artigo publicado");
  // Nada no read-model propõe alterar identidade publicada.
  const source = readFileSync("lib/arquiteto/published-site-architecture.ts", "utf8");
  assert.doesNotMatch(source, /setCanonical|rewriteUrl|newSlug|redirect/i);
});

/* ------------------------- elo para a fase Artigos ----------------------- */

test("o Silo publicado de um artigo é recuperável pela URL", () => {
  const arq = build([
    "/oleos-corporais-e-banho",
    "/oleos-corporais-e-banho/oleo-de-banho-nivea-preco",
  ]);

  const resultado = getPublishedParentStructure(arq, "site.com.br/oleos-corporais-e-banho/oleo-de-banho-nivea-preco")!;
  assert.equal(resultado.node.role, "leaf");
  assert.equal(resultado.root!.path, "/oleos-corporais-e-banho");
  assert.equal(resultado.root!.role, "editorial_root");
});

test("URL fora do catálogo devolve nulo em vez de inventar pai", () => {
  const arq = build(["/tema"]);
  assert.equal(getPublishedParentStructure(arq, "site.com.br/inexistente"), null);
});

/* ------------------------------ contrato duro ---------------------------- */

test("a reconstrução é determinística e de primeira parte", () => {
  const source = readFileSync("lib/arquiteto/published-site-architecture.ts", "utf8")
    .split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");

  // Relação de URL é observável: nenhum provider participa disso.
  assert.doesNotMatch(source, /fetch\(|supabase|dataforseo|deepseek|serp/i);
  assert.doesNotMatch(source, /localStorage|subject_type|CREATE TABLE/);
  // Nenhum nome de marca vira regra do algoritmo.
  assert.doesNotMatch(source, /careglow|skincare|retinol/i);
});

test("mesmo catálogo, mesma árvore — a ordem de entrada não muda o resultado", () => {
  const caminhos = ["/b/x", "/a", "/a/y", "/b"];
  const direta = build(caminhos);
  const invertida = build([...caminhos].reverse());

  assert.deepEqual(
    direta.nodes.map(node => [node.path, node.role]),
    invertida.nodes.map(node => [node.path, node.role]),
  );
});
