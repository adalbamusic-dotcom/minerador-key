import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ARTICLE_KEYWORDS,
  SINGLETON_CLASSIFICATION_LABELS,
  buildArticleFormationUniverse,
  summarizeArticleFormation,
  type ArticleFormationKeyword,
} from "../lib/arquiteto/article-formation.ts";

const SILO = "territory:11111111-1111-4111-8111-111111111111";

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

const universo = (keywords: ArticleFormationKeyword[], publicados: { path: string; label: string }[] = []) =>
  buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Skin care para peles oleosas",
    siloSlug: "/skin-care-para-peles-oleosas",
    keywords,
    publishedArticles: publicados.map(item => ({
      normalizedUrl: `site.com.br${item.path}`,
      path: item.path,
      label: item.label,
      canonical: `site.com.br${item.path}`,
      matchedKeywordId: null,
    })),
  });

const auditOf = (resultado: ReturnType<typeof universo>, keywordId: string) =>
  resultado.singletonAudits.find(item => item.keywordId === keywordId);

/* --------------------- §3 singleton não é erro --------------------------- */

test("singleton com intenção própria é preservado e explicado", () => {
  const resultado = universo([
    kw("k1", "skin care caseiro", { intent: "transacional", problem: "fazer em casa" }),
    kw("k2", "skin care neutrogena", { intent: "comercial" }),
    kw("k3", "skin care loreal", { intent: "comercial" }),
  ]);

  const audit = auditOf(resultado, "k1")!;
  assert.equal(audit.classification, "UNIQUE_INTENT");
  assert.match(audit.reasons.join(" "), /transacional/);
  assert.match(audit.reasons.join(" "), /fazer em casa/);
  // A explicação não pode ser só "1 keyword".
  assert.ok(audit.reasons.every(reason => reason !== "1 keyword"));
});

test("singleton sem fatos do Minerador é evidência insuficiente, não intenção própria", () => {
  const resultado = universo([
    kw("k1", "produto xyz", { intent: null }),
    kw("k2", "skin care neutrogena"),
    kw("k3", "skin care loreal"),
  ]);

  assert.equal(auditOf(resultado, "k1")!.classification, "INSUFFICIENT_EVIDENCE");
});

test("singleton que ninguém alcança é baixa similaridade", () => {
  const resultado = universo([
    kw("k1", "mascara facial argila"),
    kw("k2", "skin care neutrogena"),
    kw("k3", "skin care loreal"),
  ]);

  const audit = auditOf(resultado, "k1")!;
  assert.equal(audit.classification, "LOW_SIMILARITY");
  assert.match(audit.reasons.join(" "), /nenhuma outra busca/);
});

test("todas as classificações têm rótulo legível", () => {
  assert.equal(Object.keys(SINGLETON_CLASSIFICATION_LABELS).length, 5);
  for (const rotulo of Object.values(SINGLETON_CLASSIFICATION_LABELS)) assert.ok(rotulo.length > 3);
});

/* ------------------ §4 canibalização entre candidatos -------------------- */

test("candidatos separados por teto continuam declarados como sobrepostos", () => {
  // Sete buscas convergentes: seis cabem, e a relação entre o que sobrou
  // precisa aparecer em vez de virar um segundo assunto silencioso.
  const muitas = ["creme", "cremes", "creme bom", "creme top", "creme novo", "creme ideal", "creme barato"]
    .map((termo, index) => kw(`k${index}`, `${termo} skin care`, { entity: "creme", problem: "escolher creme" }));
  const resultado = universo(muitas);

  assert.equal(resultado.candidates.length, 1, "sete buscas do mesmo assunto não viram dois artigos");
  assert.equal(resultado.candidates[0].keywords.length, MAX_ARTICLE_KEYWORDS);
  assert.equal(resultado.candidates[0].overflowKeywordIds.length, 1);
  assert.match(resultado.candidates[0].conflicts.join(" "), /além do teto/);
});

test("candidatos realmente distintos são declarados distintos", () => {
  const resultado = universo([
    kw("k1", "mascara facial argila", { intent: "informacional" }),
    kw("k2", "protetor solar toque seco", { intent: "comercial" }),
  ]);

  assert.equal(resultado.relations.length, 1);
  assert.equal(resultado.relations[0].relation, "distinct");
  assert.match(resultado.relations[0].reasons.join(" "), /problemas diferentes/);
});

test("relação cita os dois candidatos pelo ref, nunca por índice", () => {
  const resultado = universo([kw("k1", "mascara facial argila"), kw("k2", "protetor solar toque seco")]);
  const relacao = resultado.relations[0];
  const refs = resultado.candidates.map(candidate => candidate.candidateRef);
  assert.ok(refs.includes(relacao.leftCandidateRef));
  assert.ok(refs.includes(relacao.rightCandidateRef));
  assert.notEqual(relacao.leftCandidateRef, relacao.rightCandidateRef);
});

/* ------------------ §6 intenção acima da diferença lexical --------------- */

test("mesma intenção junta buscas sem igualdade lexical", () => {
  const resultado = buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Cremes",
    siloSlug: "/cremes",
    keywords: [
      kw("k1", "melhor creme para pele oleosa", { intent: "comercial", entity: "creme", problem: "escolher creme" }),
      kw("k2", "qual o melhor creme para pele oleosa", { intent: "comercial", entity: "creme", problem: "escolher creme" }),
      kw("k3", "creme ideal para pele oleosa", { intent: "comercial", entity: "creme", problem: "escolher creme" }),
    ],
    publishedArticles: [],
  });

  assert.equal(resultado.candidates.length, 1, "três formas de perguntar a mesma coisa pedem uma página");
  assert.equal(resultado.candidates[0].keywords.length, 3);
});

/* --------------------- §7 KGR não fragmenta Article ---------------------- */

test("duas KGR fortes com a mesma intenção continuam no mesmo artigo", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { kgr: 0.12, volume: 900, entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { kgr: 0.08, volume: 40, entity: "creme", problem: "escolher creme" }),
  ]);

  assert.equal(resultado.candidates.length, 1, "KGR é oportunidade de ranking, não definição de assunto");
  assert.equal(resultado.candidates[0].keywords.length, 2);
});

/* ---------------------------- §8 teto de seis ---------------------------- */

test("nove buscas da mesma intenção não viram dois artigos automaticamente", () => {
  const nove = Array.from({ length: 9 }, (_, index) =>
    kw(`k${index}`, `creme skin care ${["", "bom", "top", "novo", "ideal", "barato", "leve", "forte", "puro"][index]}`.trim(),
      { entity: "creme", problem: "escolher creme" }));
  const resultado = universo(nove);

  assert.equal(resultado.candidates.length, 1, "o teto não pode fabricar um segundo assunto");
  assert.equal(resultado.candidates[0].keywords.length, MAX_ARTICLE_KEYWORDS);
  assert.equal(resultado.candidates[0].overflowKeywordIds.length, 3);
  // O excesso não some da mesa: ele é do artigo, esperando decisão.
  const todas = new Set([
    ...resultado.candidates[0].keywords.map(item => item.keywordId),
    ...resultado.candidates[0].overflowKeywordIds,
  ]);
  assert.equal(todas.size, 9);
});

/* ------------------------------ §9 síntese ------------------------------- */

test("a síntese separa individuais de agrupamentos e conta sobreposições", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k3", "mascara facial argila"),
    kw("k4", "protetor solar toque seco"),
  ]);

  const resumo = summarizeArticleFormation([resultado]);
  assert.equal(resumo.candidates, 3);
  assert.equal(resumo.singles, 2);
  assert.equal(resumo.grouped, 1);
  assert.equal(resumo.composition.um, 2);
  assert.equal(resumo.composition.dois, 1);
  assert.equal(resumo.composition.tresASeis, 0);
  assert.equal(resumo.overflowKeywords, 0);
  assert.equal(resumo.singles + resumo.grouped, resumo.candidates);
});

/* --------------------------- contrato do corte --------------------------- */

test("a auditoria é leitura: nenhum candidato é reagrupado sozinho", () => {
  const semAuditoria = universo([kw("k1", "mascara facial argila"), kw("k2", "protetor solar toque seco")]);
  // Rodar de novo sobre a mesma entrada dá exatamente o mesmo resultado.
  const denovo = universo([kw("k1", "mascara facial argila"), kw("k2", "protetor solar toque seco")]);
  assert.deepEqual(
    semAuditoria.candidates.map(candidate => candidate.keywords.map(item => item.keywordId)),
    denovo.candidates.map(candidate => candidate.keywords.map(item => item.keywordId)),
  );
  assert.equal(semAuditoria.candidates.length, 2);
});
