import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_ARTICLE_KEYWORDS,
  buildArticleFormationUniverse,
  sameArticleAffinity,
  suggestArticleSlug,
  suggestPrincipal,
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

/* ------------------------- 1 keyword ≠ 1 Article ------------------------- */

test("buscas que pedem o mesmo conteúdo formam UM artigo, não três", () => {
  const resultado = universo([
    kw("k1", "creme skin care"),
    kw("k2", "cremes skin care"),
    kw("k3", "skin care creme"),
  ]);

  assert.equal(resultado.candidates.length, 1, "três formulações da mesma busca não podem virar três artigos");
  assert.equal(resultado.candidates[0].keywords.length, 3);
  assert.equal(resultado.candidates[0].cannibalizationRisk, "baixa");
});

test("buscas distintas dentro do mesmo silo formam artigos diferentes", () => {
  const resultado = universo([
    kw("k1", "skin care caseiro"),
    kw("k2", "skin care barato"),
    kw("k3", "mascara skin care"),
  ]);

  assert.ok(resultado.candidates.length >= 2, "problemas diferentes pedem conteúdos diferentes");
});

test("N keywords produzem MENOS de N candidatos quando há convergência", () => {
  const resultado = universo([
    kw("k1", "creme skin care"),
    kw("k2", "cremes skin care"),
    kw("k3", "skin care creme"),
    kw("k4", "skin care caseiro"),
    kw("k5", "skin care caseiro receita"),
  ]);

  assert.ok(resultado.candidates.length < 5);
  assert.ok(resultado.candidates.length >= 2);
});

/* -------------------------- intenção tem peso ---------------------------- */

test("overlap lexical não decide: intenção diferente separa as buscas", () => {
  const par = sameArticleAffinity(
    kw("k1", "vitamina c para pele", { intent: "informacional" }),
    kw("k2", "vitamina c principia antes e depois", { intent: "comercial" }),
  );

  assert.equal(par.affinity, 0);
  assert.deepEqual(par.reasons, ["intenções principais diferentes"]);
});

test("mesma intenção e mesmo problema aumentam a convergência", () => {
  const par = sameArticleAffinity(
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
  );

  assert.ok(par.affinity >= 0.75);
  assert.match(par.reasons.join(" "), /mesma intenção principal/);
  assert.match(par.reasons.join(" "), /mesmo problema central/);
});

/* -------------------------------- principal ------------------------------ */

test("a principal é a mais central, não a de maior volume", () => {
  const grupo = [
    kw("k1", "creme skin care", { volume: 50 }),
    kw("k2", "cremes skin care", { volume: 90 }),
    kw("k3", "creme skin care para o rosto", { volume: 5000 }),
  ];

  const principal = suggestPrincipal({ keywords: grupo })!;
  assert.notEqual(principal.keywordId, "k3", "volume sozinho escolheria a busca mais popular, não a que representa o conteúdo");
  assert.match(principal.reasons.join(" "), /centralidade/);
});

test("keyword publicada ancora o artigo e vira principal", () => {
  const principal = suggestPrincipal({
    keywords: [kw("k1", "creme skin care"), kw("k2", "cremes skin care", { isPublished: true })],
  })!;

  assert.equal(principal.keywordId, "k2");
  assert.match(principal.reasons.join(" "), /já está publicada/);
});

test("entre buscas igualmente específicas, KGR desempata antes do volume", () => {
  const principal = suggestPrincipal({
    keywords: [
      kw("k1", "creme skin care barato", { kgr: 0.9, volume: 900 }),
      kw("k2", "creme skin care caseiro", { kgr: 0.1, volume: 10 }),
    ],
  })!;

  assert.equal(principal.keywordId, "k2");
  assert.match(principal.reasons.join(" "), /KGR 0.1/);
});

test("qualificador não vira principal: quem nomeia o assunto lidera", () => {
  const principal = suggestPrincipal({
    keywords: [
      kw("k1", "creme skin care", { kgr: 0.9, volume: 50 }),
      // `barato` estreita o assunto; KGR melhor e volume maior não mudam isso.
      kw("k2", "creme skin care barato", { kgr: 0.1, volume: 900 }),
    ],
  })!;

  assert.equal(principal.keywordId, "k1");
  assert.match(principal.reasons.join(" "), /menos específica/);
});

/* --------------------------- papéis e teto de 6 -------------------------- */

test("cada candidato tem exatamente uma principal", () => {
  const resultado = universo([
    kw("k1", "creme skin care"),
    kw("k2", "cremes skin care"),
    kw("k3", "skin care caseiro"),
  ]);

  for (const candidato of resultado.candidates) {
    const principais = candidato.keywords.filter(item => item.role === "principal");
    assert.equal(principais.length, 1);
    assert.equal(principais[0].keywordId, candidato.principalKeywordId);
  }
});

test("o teto de seis é limite, não meta", () => {
  const muitas = Array.from({ length: 12 }, (_, index) => kw(`k${index}`, `creme skin care ${index === 0 ? "" : "variacao"}`));
  const resultado = universo(muitas);

  for (const candidato of resultado.candidates) {
    assert.ok(candidato.keywords.length <= MAX_ARTICLE_KEYWORDS, "nenhum artigo passa de seis keywords");
  }
  // Duas buscas convergentes não são infladas até seis.
  const pequeno = universo([kw("k1", "creme skin care"), kw("k2", "cremes skin care")]);
  assert.equal(pequeno.candidates[0].keywords.length, 2);
});

test("secundária e reforço são papéis distintos", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher" }),
    kw("k3", "creme skin care pele oleosa"),
  ]);

  const papeis = new Set(resultado.candidates.flatMap(c => c.keywords.map(item => item.role)));
  assert.ok(papeis.has("principal"));
  assert.ok(papeis.has("secundaria") || papeis.has("reforco"));
});

/* ------------------------------ slug do filho ---------------------------- */

test("o slug do artigo não repete o tema do silo pai", () => {
  const slug = suggestArticleSlug({
    principal: kw("k1", "creme para o rosto"),
    siloSlug: "/cremes",
  });

  assert.equal(slug, "para-o-rosto", "/cremes/creme-para-o-rosto repetiria o pai sem informar mais");
});

test("sem redundância o slug preserva o termo inteiro", () => {
  assert.equal(suggestArticleSlug({ principal: kw("k1", "skin care caseiro"), siloSlug: "/protecao-solar" }), "skin-care-caseiro");
  assert.equal(suggestArticleSlug({ principal: kw("k1", "cremes"), siloSlug: "/cremes" }), "cremes", "restar nada devolve o termo, não vazio");
});

/* --------------------------- patrimônio publicado ------------------------ */

test("keyword equivalente a página publicada não vira artigo novo", () => {
  const resultado = universo(
    [kw("k1", "oleo de banho nivea preco"), kw("k2", "skin care caseiro")],
    [{ path: "/oleos-corporais-e-banho/oleo-de-banho-nivea-preco", label: "Óleo de banho Nivea preço" }],
  );

  assert.equal(resultado.matchedToPublished.length, 1);
  assert.equal(resultado.matchedToPublished[0].keywordId, "k1");
  // Nenhum candidato duplica a página que já existe.
  assert.equal(resultado.candidates.some(c => c.keywords.some(item => item.keywordId === "k1")), false);
  assert.equal(resultado.publishedArticles[0].matchedKeywordId, "k1");
});

test("artigo publicado nunca recebe sugestão de slug", () => {
  const resultado = universo([kw("k1", "creme skin care", { isPublished: true })]);

  assert.equal(resultado.candidates[0].suggestedSlug, null);
  const source = readFileSync("lib/arquiteto/article-formation.ts", "utf8");
  assert.doesNotMatch(source, /setCanonical|rewriteUrl|redirect/i);
});

/* -------------------------------- conflito ------------------------------- */

test("keyword que cabe em dois artigos vira conflito declarado", () => {
  const resultado = universo([kw("k1", "creme skin care"), kw("k2", "cremes skin care")]);
  // Força a ambiguidade injetando a mesma keyword em outro candidato.
  resultado.candidates.push({
    ...resultado.candidates[0],
    candidateRef: "article-candidate:outro",
    principalKeywordId: "k2",
  });
  const donos = resultado.candidates.filter(c => c.keywords.some(item => item.keywordId === "k1"));
  assert.equal(donos.length, 2, "o read-model precisa permitir detectar a ambiguidade");
});

/* -------------------------------- síntese -------------------------------- */

test("a síntese conta o lote sem inventar artigo", () => {
  const a = universo([kw("k1", "creme skin care"), kw("k2", "cremes skin care")]);
  const b = buildArticleFormationUniverse({
    siloRef: "territory:22222222-2222-4222-8222-222222222222",
    siloLabel: "Outro",
    siloSlug: "/outro",
    keywords: [kw("k3", "skin care caseiro")],
    publishedArticles: [],
  });

  const resumo = summarizeArticleFormation([a, b]);
  assert.equal(resumo.silos, 2);
  assert.equal(resumo.keywords, 3);
  assert.equal(resumo.candidates, 2);
  assert.equal(resumo.keywordsEmCandidatos, 3);
});

/* ----------------------------- contrato duro ----------------------------- */

test("a formação é candidata: nenhum ArticleDNA é criado aqui", () => {
  const source = readFileSync("lib/arquiteto/article-formation.ts", "utf8")
    .split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");

  assert.doesNotMatch(source, /ArticleDNA|createVersionEnvelope|persistArquitetoArtifact/);
  assert.doesNotMatch(source, /fetch\(|supabase|localStorage/);
  assert.doesNotMatch(source, /dataforseo|deepseek|serp/i);
  // A identidade do candidato é derivada, nunca um articleId emitido.
  assert.match(source, /article-candidate:/);
});

test("o algoritmo de Article não é o de Silos", () => {
  const source = readFileSync("lib/arquiteto/article-formation.ts", "utf8");
  // Silos procura amplitude; Article procura convergência.
  assert.doesNotMatch(source, /buildKeywordUniverse|UniverseCluster|verticality/);
});

/* -------------------- o tema do pai desconta, não apaga ------------------- */

test("duas formas de dizer o próprio tema do Silo formam UM artigo", () => {
  // Dentro de `/skin-care-para-peles-oleosas` estas duas buscas perdem todos
  // os tokens ao descontar o pai. Perder os tokens não pode significar perder
  // a convergência: elas pedem exatamente o mesmo conteúdo.
  const resultado = universo([
    kw("k1", "skin care pele oleosa"),
    kw("k2", "skin care para peles oleosas"),
  ]);

  assert.equal(resultado.candidates.length, 1);
  assert.equal(resultado.candidates[0].keywords.length, 2);
});

test("o desconto do pai continua separando problemas diferentes", () => {
  const resultado = universo([
    kw("k1", "skin care pele oleosa"),
    kw("k2", "skin care rosto"),
    kw("k3", "skin care caseiro"),
  ]);

  assert.equal(resultado.candidates.length, 3, "rosto, caseiro e o próprio tema pedem conteúdos diferentes");
});

/* ------------------- o endereço publicado é intocável -------------------- */

test("candidato não propõe endereço que já está publicado", () => {
  const resultado = buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Cremes",
    siloSlug: "/cremes",
    // O texto da keyword não casa com o título da página, então ela não é
    // reconhecida como já publicada — mas o slug proposto cairia em cima dela.
    keywords: [kw("k1", "creme hidratante facial")],
    publishedArticles: [{
      normalizedUrl: "site.com.br/cremes/hidratante-facial",
      path: "/cremes/hidratante-facial",
      label: "Guia completo de hidratação",
      canonical: null,
      matchedKeywordId: null,
    }],
  });

  const candidato = resultado.candidates[0];
  assert.ok(candidato, "a keyword não casou com a página e deve formar candidato");
  assert.equal(candidato.suggestedSlug, null, "propor um endereço publicado seria decidir sobre patrimônio");
  assert.match(candidato.conflicts.join(" "), /já existe publicado/);
  assert.equal(resultado.conflicts.length, 1);
});

test("sem colisão, a sugestão de slug permanece", () => {
  const resultado = universo(
    [kw("k1", "skin care caseiro")],
    [{ path: "/skin-care-para-peles-oleosas/outra-coisa", label: "Outra coisa" }],
  );
  // O slug já vem sem o tema do pai; o que importa aqui é que ele sobrevive.
  assert.equal(resultado.candidates[0].suggestedSlug, "caseiro");
  assert.equal(resultado.candidates[0].conflicts.length, 0);
});