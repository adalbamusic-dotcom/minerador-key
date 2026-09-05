import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleFlowSelection, buildArticleFlowProjection } from "../lib/arquiteto/article-flow.ts";
import { buildArticleSiloViews } from "../lib/arquiteto/article-silo-view.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";

const SILO_A = "territory:11111111-1111-4111-8111-111111111111";
const SILO_B = "territory:22222222-2222-4222-8222-222222222222";

const kw = (id: string, keyword: string): ArticleFormationKeyword => ({
  keywordId: id, keyword, intent: "informacional", volume: 100, kgr: null,
  entity: null, problem: null, isPublished: false,
});

const universo = (
  siloRef: string,
  label: string,
  slug: string,
  keywords: ArticleFormationKeyword[],
  publicados: { path: string; label: string }[] = [],
) => buildArticleFormationUniverse({
  siloRef, siloLabel: label, siloSlug: slug, keywords,
  publishedArticles: publicados.map(item => ({
    normalizedUrl: `site.com.br${item.path}`, path: item.path, label: item.label,
    canonical: `site.com.br${item.path}`, matchedKeywordId: null,
  })),
});

const viewsDe = (
  universes: ReturnType<typeof universo>[],
  keywords: ArticleFormationKeyword[],
  materializados: string[] = [],
) => buildArticleSiloViews({
  universes,
  materializedArticleIds: new Set(materializados),
  keywordLabels: new Map(keywords.map(item => [item.keywordId, item.keyword])),
});

/* --------------------------- §13 hierarquia ------------------------------ */

test("o mapa desenha SiloPage no topo, Article no meio e keyword embaixo", () => {
  const keywords = [kw("k1", "creme skin care"), kw("k2", "cremes skin care")];
  const flow = buildArticleFlowProjection({ views: viewsDe([universo(SILO_A, "Skin care", "/skin-care", keywords)], keywords) });

  const silo = flow.nodes.find(node => node.kind === "silo_page")!;
  const article = flow.nodes.find(node => node.kind === "candidate")!;
  const keyword = flow.nodes.find(node => node.kind === "keyword")!;

  assert.ok(silo.position.y < article.position.y);
  assert.ok(article.position.y < keyword.position.y);
  assert.equal(silo.meta, "/skin-care");
  assert.equal(article.meta, "2 keywords");
});

test("cada SiloPage forma um cluster separado, sem mistura", () => {
  const a = [kw("k1", "creme skin care")];
  const b = [kw("k2", "protetor solar toque seco")];
  const flow = buildArticleFlowProjection({
    views: viewsDe([universo(SILO_A, "Skin care", "/skin-care", a), universo(SILO_B, "Proteção", "/protecao", b)], [...a, ...b]),
  });

  const silos = flow.nodes.filter(node => node.kind === "silo_page");
  assert.equal(silos.length, 2);
  assert.notEqual(silos[0].position.y, silos[1].position.y, "bandas separadas: clusters não se encostam");

  // Nenhuma aresta cruza Silos.
  const siloDoNo = new Map(flow.nodes.map(node => [node.id, node.siloRef]));
  for (const edge of flow.edges) {
    assert.equal(siloDoNo.get(edge.source), siloDoNo.get(edge.target), "aresta não pode cruzar Silo");
  }
});

/* ------------------------- §14 nó de Article ----------------------------- */

test("página do sitemap não vira nó do mapa", () => {
  const keywords = [kw("k1", "creme skin care")];
  const flow = buildArticleFlowProjection({
    views: viewsDe([universo(SILO_A, "Skin care", "/skin-care", keywords, [{ path: "/skin-care/guia", label: "Guia" }])], keywords),
  });
  // O Site conhece a URL; ele não conhece o DNA editorial dela.
  assert.equal(flow.nodes.filter(node => node.kind === "published").length, 0);
});

test("article materializado e candidato são nós de tipos diferentes", () => {
  const keywords = [kw("k1", "creme skin care"), kw("k2", "mascara facial argila")];
  const universeA = universo(SILO_A, "Skin care", "/skin-care", keywords);
  const primeiro = universeA.candidates[0].candidateRef;
  const flow = buildArticleFlowProjection({
    views: viewsDe([universeA], keywords, [primeiro]),
    materializedArticleIds: new Set([primeiro]),
  });

  assert.equal(flow.nodes.filter(node => node.kind === "article").length, 1);
  assert.equal(flow.nodes.filter(node => node.kind === "candidate").length, 1);
});

/* ------------------------------ §19 arestas ------------------------------ */

test("antes da confirmação a aresta é sugestão; depois, composição", () => {
  const keywords = [kw("k1", "creme skin care"), kw("k2", "cremes skin care")];
  const universeA = universo(SILO_A, "Skin care", "/skin-care", keywords);
  const ref = universeA.candidates[0].candidateRef;

  const proposto = buildArticleFlowProjection({ views: viewsDe([universeA], keywords) });
  const arestasKw = proposto.edges.filter(edge => edge.target.startsWith("keyword:"));
  assert.ok(arestasKw.length > 0);
  assert.ok(arestasKw.every(edge => edge.suggested));

  const confirmado = buildArticleFlowProjection({
    views: viewsDe([universeA], keywords, [ref]),
    materializedArticleIds: new Set([ref]),
  });
  assert.ok(confirmado.edges.filter(edge => edge.target.startsWith("keyword:")).every(edge => !edge.suggested));
});

/* ------------------------- §15 papel na keyword -------------------------- */

test("a keyword mostra o papel em uma letra", () => {
  const keywords = [kw("k1", "creme skin care"), kw("k2", "cremes skin care")];
  const flow = buildArticleFlowProjection({ views: viewsDe([universo(SILO_A, "Skin care", "/skin-care", keywords)], keywords) });
  const papeis = flow.nodes.filter(node => node.kind === "keyword").map(node => node.meta);
  assert.ok(papeis.includes("P"));
  assert.ok(papeis.every(papel => papel !== null && papel.length === 1));
});

/* ------------------------- §16 seleção → painel -------------------------- */

test("clicar em cada tipo de nó abre a leitura certa", () => {
  const keywords = [kw("k1", "creme skin care")];
  const flow = buildArticleFlowProjection({ views: viewsDe([universo(SILO_A, "Skin care", "/skin-care", keywords)], keywords) });

  const silo = articleFlowSelection(flow.nodes.find(node => node.kind === "silo_page")!);
  assert.equal(silo.kind, "silo");
  assert.equal(silo.articleRef, null);

  const article = articleFlowSelection(flow.nodes.find(node => node.kind === "candidate")!);
  assert.equal(article.kind, "article");
  assert.ok(article.articleRef);

  const keyword = articleFlowSelection(flow.nodes.find(node => node.kind === "keyword")!);
  assert.equal(keyword.kind, "keyword");
  assert.equal(keyword.keywordId, "k1");
  // A keyword conhece o Article e o Silo a que pertence.
  assert.ok(keyword.articleRef);
  assert.equal(keyword.siloRef, SILO_A);
});

/* ---------------------------- contabilidade ------------------------------ */

test("a conta de keywords desenhadas e escondidas fecha", () => {
  const muitas = Array.from({ length: 7 }, (_, i) =>
    kw(`k${i}`, `creme skin care ${["", "bom", "top", "novo", "ideal", "leve", "puro"][i]}`.trim()));
  const universeA = universo(SILO_A, "Skin care", "/skin-care", muitas);
  const views = viewsDe([universeA], muitas);
  const flow = buildArticleFlowProjection({ views });

  const total = views[0].nodes
    .filter(node => node.kind !== "published")
    .reduce((soma, node) => soma + node.keywords.length, 0);
  assert.equal(flow.visibleKeywords + flow.hiddenKeywords, total);
  assert.equal(flow.nodes.filter(node => node.kind === "keyword").length, flow.visibleKeywords);
});

/* --------------------------- §20 não persiste ---------------------------- */

test("o mapa é projeção: não persiste posição nem chama nada", () => {
  const source = readFileSync("lib/arquiteto/article-flow.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");

  assert.doesNotMatch(source, /fetch\(|supabase|localStorage|persist/);
  assert.doesNotMatch(source, /useState|useMemo/);
});
