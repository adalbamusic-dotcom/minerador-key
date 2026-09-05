import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildArticleSiloViews } from "../lib/arquiteto/article-silo-view.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";

const SILO = "territory:11111111-1111-4111-8111-111111111111";

const kw = (id: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId: id, keyword, intent: "informacional", volume: 100, kgr: null,
  entity: null, problem: null, isPublished: false, ...overrides,
});

const universo = (keywords: ArticleFormationKeyword[], publicadas: { path: string; label: string }[] = []) =>
  buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Óleos corporais e banho",
    siloSlug: "/oleos-corporais-e-banho",
    keywords,
    publishedArticles: publicadas.map(item => ({
      normalizedUrl: `site.com.br${item.path}`,
      path: item.path,
      label: item.label,
      canonical: `site.com.br${item.path}`,
      matchedKeywordId: null,
    })),
  });

const views = (
  keywords: ArticleFormationKeyword[],
  publicadas: { path: string; label: string }[] = [],
  publishedKeywordIds: string[] = [],
) => buildArticleSiloViews({
  universes: [universo(keywords, publicadas)],
  materializedArticleIds: new Set(),
  publishedKeywordIds: new Set(publishedKeywordIds),
  keywordLabels: new Map(keywords.map(item => [item.keywordId, item.keyword])),
});

/* ------------- §1/§2 folha do sitemap NÃO é Article editorial ------------ */

test("página encontrada no sitemap não vira linha de Article", () => {
  const keywords = [kw("k1", "oleo corporal hidratante")];
  const resultado = views(keywords, [
    { path: "/oleos-corporais-e-banho/oleo-de-banho-nivea-preco", label: "Óleo de banho Nivea preço 2026" },
    { path: "/oleos-corporais-e-banho/qual-melhor-oleo-corporal", label: "Qual melhor óleo corporal" },
  ]);

  // O Site conhece duas páginas; nenhuma delas é Article editorial.
  assert.equal(resultado[0].nodes.filter(node => node.kind === "published").length, 0);
  assert.equal(resultado[0].counts.published, 0);
  // A evidência continua contada, separada.
  assert.equal(resultado[0].counts.publishedPages, 2);
});

test("a evidência do site é preservada para reconciliar", () => {
  const keywords = [kw("k1", "oleo corporal hidratante")];
  const resultado = universo(keywords, [
    { path: "/oleos-corporais-e-banho/oleo-de-banho-nivea-preco", label: "Óleo de banho Nivea preço" },
  ]);

  // O catálogo do site continua no read-model: ele serve para reconhecer
  // keyword equivalente e barrar endereço já publicado.
  assert.equal(resultado.publishedArticles.length, 1);
  assert.equal(resultado.publishedArticles[0].canonical, "site.com.br/oleos-corporais-e-banho/oleo-de-banho-nivea-preco");
});

test("o candidato continua sem propor endereço que já está no ar", () => {
  // O slug proposto para esta busca é `corporal-hidratante`; a página já
  // publicada ocupa exatamente esse endereço.
  const resultado = universo(
    [kw("k1", "oleo corporal hidratante")],
    [{ path: "/oleos-corporais-e-banho/corporal-hidratante", label: "Guia de hidratação corporal" }],
  );
  const candidato = resultado.candidates[0];
  // A proteção vem da reconciliação, não da promoção da URL a Article.
  assert.equal(candidato.suggestedSlug, null);
  assert.match(candidato.conflicts.join(" "), /já existe publicado/);
});

/* --------------- §4 a fonte do publicado editorial é o Minerador --------- */

test("publicado editorial vem da keyword publicada do Minerador", () => {
  const keywords = [
    kw("k1", "oleo de banho nivea preco", { isPublished: true }),
    kw("k2", "oleo corporal hidratante"),
  ];
  const resultado = views(keywords, [], ["k1"]);

  const publicado = resultado[0].nodes.find(node => node.kind === "published");
  assert.ok(publicado, "keyword publicada do Minerador precisa formar Article publicado");
  assert.equal(publicado!.keywords.some(item => item.keywordId === "k1"), true);
  // E o publicado nunca recebe sugestão de endereço.
  assert.equal(publicado!.slug, null);
});

test("sem keyword publicada, nenhum Article publicado existe", () => {
  const keywords = [kw("k1", "oleo corporal hidratante")];
  const resultado = views(keywords, [{ path: "/oleos-corporais-e-banho/qualquer", label: "Qualquer" }]);
  assert.equal(resultado[0].nodes.filter(node => node.kind === "published").length, 0);
});

/* ------------------- §13 sem detail pobre de publicado ------------------- */

test("o detail pobre de página publicada deixou de existir", () => {
  const rows = readFileSync("modules/arquiteto/article-silo-rows.tsx", "utf8");
  assert.doesNotMatch(rows, /ArticlePublishedRow/);
  assert.doesNotMatch(rows, /architect-published-row|architect-published-detail/);

  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.doesNotMatch(workspace, /<ArticlePublishedRow/);
  // Article publicado real usa a MESMA linha e o MESMO detalhe rico.
  assert.match(workspace, /<MemoizedArticleRow/);
});

test("a promoção automática da folha foi removida na origem", () => {
  const view = readFileSync("lib/arquiteto/article-silo-view.ts", "utf8");
  // O laço que criava um nó por página do sitemap não existe mais.
  assert.doesNotMatch(view, /ref: `published:\$\{published\.path\}`/);
  assert.match(view, /publishedKeywordIds/);
});
