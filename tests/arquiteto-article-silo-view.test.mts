import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTICLE_NODE_LABELS,
  SILO_ORIGIN_LABELS,
  SLUG_REVIEW_LABELS,
  buildArticleSiloViews,
  filterArticleSiloViews,
  reviewSlugQuality,
  summarizeArticleSiloViews,
} from "../lib/arquiteto/article-silo-view.ts";
import { auditArticleSiloScope } from "../lib/arquiteto/article-silo-scope.ts";
import {
  buildArticleFormationUniverse,
  type ArticleFormationKeyword,
} from "../lib/arquiteto/article-formation.ts";

const SILO_A = "territory:11111111-1111-4111-8111-111111111111";
const SILO_B = "territory:22222222-2222-4222-8222-222222222222";

const kw = (id: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId: id,
  keyword,
  intent: "informacional",
  volume: 100,
  kgr: null,
  entity: null,
  problem: null,
  isPublished: false,
  ...overrides,
});

const universo = (
  siloRef: string,
  siloLabel: string,
  siloSlug: string,
  keywords: ArticleFormationKeyword[],
  publicados: { path: string; label: string }[] = [],
) => buildArticleFormationUniverse({
  siloRef,
  siloLabel,
  siloSlug,
  keywords,
  publishedArticles: publicados.map(item => ({
    normalizedUrl: `site.com.br${item.path}`,
    path: item.path,
    label: item.label,
    canonical: `site.com.br${item.path}`,
    matchedKeywordId: null,
  })),
});

const rotulos = (keywords: ArticleFormationKeyword[]) =>
  new Map(keywords.map(item => [item.keywordId, item.keyword]));

/* ------------------- §1 escopo de Silo (gate do lote) -------------------- */

test("article com keywords de dois Silos é declarado CROSS_SILO", () => {
  const audit = auditArticleSiloScope({
    subjects: [{ ref: "a1", label: "misturado", siloRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1", "k2"] }],
    siloRefByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_B]]),
    confirmedSiloRefs: new Set([SILO_A, SILO_B]),
  });

  assert.equal(audit.crossSilo, 1);
  assert.equal(audit.ok, false);
  assert.ok(audit.verdicts[0].issues.includes("CROSS_SILO"));
});

test("article coerente passa sem apontamento", () => {
  const audit = auditArticleSiloScope({
    subjects: [{ ref: "a1", label: "ok", siloRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1", "k2"] }],
    siloRefByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_A]]),
    confirmedSiloRefs: new Set([SILO_A]),
  });

  assert.equal(audit.crossSilo, 0);
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.verdicts[0].issues, []);
});

test("silo não confirmado e keyword sem silo são apontamentos distintos", () => {
  const audit = auditArticleSiloScope({
    subjects: [
      { ref: "a1", label: "sem silo", siloRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1", "k2"] },
      { ref: "a2", label: "nao confirmado", siloRef: SILO_B, principalKeywordId: "k3", keywordIds: ["k3"] },
    ],
    siloRefByKeywordId: new Map([["k1", SILO_A], ["k2", null], ["k3", SILO_B]]),
    confirmedSiloRefs: new Set([SILO_A]),
  });

  assert.equal(audit.withoutSilo, 1);
  assert.equal(audit.notConfirmed, 1);
  assert.equal(audit.crossSilo, 0, "faltar Silo não é o mesmo que misturar Silos");
});

test("principal fora da composição é apontada", () => {
  const audit = auditArticleSiloScope({
    subjects: [{ ref: "a1", label: "x", siloRef: SILO_A, principalKeywordId: "kX", keywordIds: ["k1"] }],
    siloRefByKeywordId: new Map([["k1", SILO_A]]),
    confirmedSiloRefs: new Set([SILO_A]),
  });
  assert.ok(audit.verdicts[0].issues.includes("PRINCIPAL_OUTSIDE_ARTICLE"));
});

test("a formação não consegue produzir candidato cross-silo", () => {
  // O universo é construído POR Silo: as keywords de um nunca entram no outro.
  const keywordsA = [kw("k1", "creme skin care"), kw("k2", "cremes skin care")];
  const keywordsB = [kw("k3", "protetor solar toque seco")];
  const a = universo(SILO_A, "Skin care", "/skin-care", keywordsA);
  const b = universo(SILO_B, "Proteção solar", "/protecao-solar", keywordsB);

  const audit = auditArticleSiloScope({
    subjects: [...a.candidates, ...b.candidates].map(candidate => ({
      ref: candidate.candidateRef,
      label: candidate.principalKeywordId,
      siloRef: candidate.siloRef,
      principalKeywordId: candidate.principalKeywordId,
      keywordIds: candidate.keywords.map(item => item.keywordId),
    })),
    siloRefByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_A], ["k3", SILO_B]]),
    confirmedSiloRefs: new Set([SILO_A, SILO_B]),
  });

  assert.equal(audit.crossSilo, 0);
  assert.equal(audit.ok, true);
});

/* ----------------------- §2/§4 hierarquia por Silo ----------------------- */

test("a raiz é a SiloPage e ela não conta como Article", () => {
  const keywords = [kw("k1", "creme skin care"), kw("k2", "cremes skin care"), kw("k3", "mascara facial argila")];
  const views = buildArticleSiloViews({
    universes: [universo(SILO_A, "Skin care", "/skin-care", keywords)],
    materializedArticleIds: new Set(),
    keywordLabels: rotulos(keywords),
  });

  assert.equal(views.length, 1);
  assert.equal(views[0].siloLabel, "Skin care");
  const resumo = summarizeArticleSiloViews(views);
  assert.equal(resumo.siloPages, 1);
  // A SiloPage não aparece entre os nós de conteúdo.
  assert.equal(views[0].nodes.some(node => node.ref === SILO_A), false);
  assert.equal(resumo.articles + resumo.candidates + resumo.published, views[0].nodes.length);
});

test("cada Silo forma seu próprio universo, sem mistura", () => {
  const a = [kw("k1", "creme skin care")];
  const b = [kw("k2", "protetor solar toque seco")];
  const views = buildArticleSiloViews({
    universes: [universo(SILO_A, "Skin care", "/skin-care", a), universo(SILO_B, "Proteção", "/protecao", b)],
    materializedArticleIds: new Set(),
    keywordLabels: new Map([...rotulos(a), ...rotulos(b)]),
  });

  assert.equal(views.length, 2);
  assert.equal(views[0].nodes.length, 1);
  assert.equal(views[1].nodes.length, 1);
  assert.notEqual(views[0].nodes[0].ref, views[1].nodes[0].ref);
});

/* ------------------------------ §5 rótulos ------------------------------- */

test("os rótulos distinguem as três unidades e não dizem 'em formação'", () => {
  const keywords = [kw("k1", "creme skin care"), kw("k2", "mascara facial argila")];
  const base = universo(SILO_A, "Skin care", "/skin-care", keywords);
  const primeiro = base.candidates[0].candidateRef;

  const views = buildArticleSiloViews({
    universes: [base],
    materializedArticleIds: new Set([primeiro]),
    keywordLabels: rotulos(keywords),
  });

  const kinds = views[0].nodes.map(node => node.kind);
  assert.ok(kinds.includes("article"));
  assert.ok(kinds.includes("candidate"));
  assert.equal(views[0].nodes.find(node => node.ref === primeiro)?.kind, "article");
  assert.equal(ARTICLE_NODE_LABELS.article, "ARTICLE");
  assert.equal(ARTICLE_NODE_LABELS.candidate, "CANDIDATO");
  assert.equal(ARTICLE_NODE_LABELS.published, "ARTICLE · PUBLICADO");
  // "Artigo em formação" não é mais rótulo de nada.
  assert.equal(Object.values(ARTICLE_NODE_LABELS).some(label => /forma/i.test(label)), false);
});

/* ------------- §11 a página do site é evidência, não Article ------------- */

test("página do site fica como evidência sob o Silo, sem virar linha", () => {
  const keywords = [kw("k1", "oleo corporal hidratante")];
  const views = buildArticleSiloViews({
    universes: [universo(SILO_A, "Óleos corporais e banho", "/oleos-corporais-e-banho", keywords,
      [{ path: "/oleos-corporais-e-banho/oleo-de-banho-nivea-preco", label: "Óleo de banho Nivea preço 2026" }])],
    materializedArticleIds: new Set(),
    keywordLabels: rotulos(keywords),
  });

  assert.equal(views[0].counts.published, 0, "o Site não tem autoridade para afirmar um Article");
  assert.equal(views[0].counts.publishedPages, 1, "a evidência do site continua contada");
  assert.equal(views[0].counts.candidates, 1);
});

/* ------------------------- §18/§19 slug pobre ---------------------------- */

test("slug que é sobra da frase é marcado para revisão", () => {
  assert.deepEqual(reviewSlugQuality("mascara-de"), ["SLUG_ENDS_IN_CONNECTOR"]);
  assert.deepEqual(reviewSlugQuality("da-creamy"), ["SLUG_STARTS_WITH_CONNECTOR"]);
  assert.ok(reviewSlugQuality("abc").includes("SLUG_TOO_SHORT"));
  assert.deepEqual(reviewSlugQuality("neutrogena"), ["SLUG_SINGLE_TOKEN"]);
  assert.deepEqual(reviewSlugQuality("skin-care-caseiro"), []);
  assert.deepEqual(reviewSlugQuality(null), []);
  assert.equal(Object.keys(SLUG_REVIEW_LABELS).length, 4);
});

/* ------------------------------- §24 busca ------------------------------- */

test("a busca alcança Silo, artigo, keyword e slug mantendo o pai visível", () => {
  const keywords = [kw("k1", "creme skin care"), kw("k2", "mascara facial argila")];
  const views = buildArticleSiloViews({
    universes: [universo(SILO_A, "Skin care", "/skin-care", keywords,
      [{ path: "/skin-care/guia-de-hidratacao", label: "Guia de hidratação" }])],
    materializedArticleIds: new Set(),
    keywordLabels: rotulos(keywords),
  });

  // Keyword: o Silo continua sendo o pai do resultado.
  const porKeyword = filterArticleSiloViews(views, "mascara");
  assert.equal(porKeyword.length, 1);
  assert.equal(porKeyword[0].siloLabel, "Skin care");
  assert.equal(porKeyword[0].nodes.length, 1);

  // Silo: traz o universo inteiro, porque o contexto é a resposta.
  assert.equal(filterArticleSiloViews(views, "skin care")[0].nodes.length, views[0].nodes.length);

  // Publicado, por título e por caminho.
  // A página do site não é linha da mesa; a busca alcança o que existe nela.
  assert.equal(filterArticleSiloViews(views, "hidratação").length, 0);

  // Sem correspondência, o Silo some em vez de aparecer vazio.
  assert.equal(filterArticleSiloViews(views, "zzz-nao-casa").length, 0);
});

/* -------------------------- §8/§20 contagem por Silo --------------------- */

test("as contagens por Silo somam a síntese global", () => {
  const a = [kw("k1", "creme skin care"), kw("k2", "cremes skin care"), kw("k3", "mascara facial argila")];
  const b = [kw("k4", "protetor solar toque seco")];
  const views = buildArticleSiloViews({
    universes: [
      universo(SILO_A, "Skin care", "/skin-care", a, [{ path: "/skin-care/guia", label: "Guia" }]),
      universo(SILO_B, "Proteção", "/protecao", b),
    ],
    materializedArticleIds: new Set(),
    keywordLabels: new Map([...rotulos(a), ...rotulos(b)]),
  });

  const resumo = summarizeArticleSiloViews(views);
  assert.equal(resumo.siloPages, 2);
  // A folha do site é evidência, não Article editorial.
  assert.equal(resumo.published, 0);
  assert.equal(resumo.keywords, 4);
  assert.equal(resumo.candidates, views.reduce((t, v) => t + v.counts.candidates, 0));
  assert.equal(resumo.singletons + resumo.grouped, resumo.candidates + resumo.articles);
});

/* --------------------------- §9 fragmentação ----------------------------- */

test("singleton carrega a auditoria que explica a solidão", () => {
  const keywords = [
    kw("k1", "mascara facial argila"),
    kw("k2", "protetor solar toque seco"),
  ];
  const views = buildArticleSiloViews({
    universes: [universo(SILO_A, "Skin care", "/skin-care", keywords)],
    materializedArticleIds: new Set(),
    keywordLabels: rotulos(keywords),
  });

  assert.equal(views[0].counts.singletons, 2);
  for (const node of views[0].nodes) {
    assert.ok(node.singletonAudit, "cada singleton precisa dizer por que ficou só");
    assert.ok(node.singletonAudit!.reasons.length > 0);
  }
});

/* ------------- §5 projetar a unidade não é inventar o artefato ----------- */

test("sem SiloPage canônica gravada, a view não alega que ela existe", () => {
  const keywords = [kw("k1", "creme skin care")];
  const views = buildArticleSiloViews({
    universes: [universo(SILO_A, "Skin care", "/skin-care", keywords)],
    materializedArticleIds: new Set(),
    keywordLabels: rotulos(keywords),
  });

  // Silêncio não pode virar promessa de artefato publicável.
  assert.equal(views[0].identity.canonical, false);
  assert.equal(views[0].identity.origin, "unknown");
  assert.equal(views[0].identity.published, false);
});

test("a identidade declarada chega inteira à view", () => {
  const keywords = [kw("k1", "creme skin care")];
  const views = buildArticleSiloViews({
    universes: [universo(SILO_A, "Skin care", "/skin-care", keywords)],
    siloIdentities: new Map([[SILO_A, { origin: "site", canonical: true, published: true, protected: true }]]),
    materializedArticleIds: new Set(),
    keywordLabels: rotulos(keywords),
  });

  assert.deepEqual(views[0].identity, { origin: "site", canonical: true, published: true, protected: true });
  assert.equal(SILO_ORIGIN_LABELS.site, "Site");
  assert.equal(SILO_ORIGIN_LABELS.manual, "Manual");
});
