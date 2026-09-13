import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarCompetitorUniverse, type RadarExecutedQuery } from "../lib/radar/competitor-universe.ts";
import { buildRadarResearchReferences } from "../lib/radar/research-reference.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { buildRadarSemanticConceptModel, buildRadarSemanticScope, radarSemanticEntityReading } from "../lib/radar/semantic-concept-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * ============  GATE 8.1 · ENTIDADE CONSERVADORA ANTES DA EXTRAÇÃO  ======
 *
 * A régua deste gate é uma assimetria de custo.
 *
 * Preservar uma página errada custa uma extração — e a extração resolve a
 * dúvida, porque o texto diz o que o título não dizia. Descartar uma página
 * certa custa a evidência inteira, e custa em silêncio: a página nunca é
 * extraída, o modelo semântico nunca a recebe, e ninguém descobre que a
 * leitura ficou pobre.
 *
 * Por isso: ausência de match léxico responde UNKNOWN, e UNKNOWN preserva.
 * DIVERGENT exige evidência positiva de que a página trata de outro assunto.
 *
 * Nenhum teste aqui chama rede, provider ou storage.
 */

/* ------------------------------ o artigo --------------------------------- */

/**
 * Article: "skincare para pele oleosa".
 * Secundária válida do ArticleDNA: "controle de oleosidade".
 *
 * Nenhuma fixture aqui ensina ao código que "sebo" tem relação com
 * "oleosidade" — é justamente o que ele NÃO sabe que está sendo testado.
 */
const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { intent: "informacional" }, normalizedIntent: "informacional" },
  }],
  editorialTopics: [],
  resolvedKeywordTexts: ["skincare para pele oleosa", "controle de oleosidade"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const resultado = (position: number, url: string, title: string, inferredType = "article") =>
  ({ position, url, title, domain: new URL(url).hostname, inferredType });

const consultaSecundaria = (results: ReturnType<typeof resultado>[]): RadarExecutedQuery => ({
  queryId: "q:sec", keyword: "controle de oleosidade", keywordId: "kw2", role: "secundaria", serpClass: "auxiliary", results,
});

const consultaReforco = (results: ReturnType<typeof resultado>[]): RadarExecutedQuery => ({
  queryId: "q:ref", keyword: "cuidados diários com a pele", keywordId: "kw3", role: "reforco_narrativo", serpClass: "auxiliary", results,
});

function ler(queries: RadarExecutedQuery[]) {
  const universe = buildRadarCompetitorUniverse({ queries, context: contexto() });
  const references = buildRadarResearchReferences({ queries, universe, context: contexto() });
  return {
    universe,
    references,
    porUrl: new Map(references.map(reference => [reference.url, reference])),
    decisao: (url: string) => autoDecideRadarReference(references.find(item => item.url === url)!),
  };
}

const SEBO = "https://dermato.com.br/producao-de-sebo";
const CACHORRO = "https://petshop.com.br/protetor-solar-para-cachorro";
const ROTINA = "https://beleza.com.br/rotina-peles-oleosas";

/* =====================  A · O QUE NÃO SE SABE, PRESERVA  ================ */

test("GATE 8.1 · A — \"produção de sebo\" vinda de secundária válida é preservada, não descartada", () => {
  const { porUrl, decisao } = ler([consultaSecundaria([resultado(1, SEBO, "Como reduzir a produção de sebo")])]);
  const referencia = porUrl.get(SEBO)!;

  /* O matcher não conhece a relação entre "sebo" e "oleosidade" — e admite isso. */
  assert.ok(["unknown", "related"].includes(referencia.entityCompatibility),
    `ENTITY_COMPATIBILITY precisa ser unknown ou related, veio "${referencia.entityCompatibility}"`);
  assert.notEqual(referencia.entityCompatibility, "divergent", "LEXICAL_ABSENCE_MEANS_DIVERGENT = NO");

  /* E a página segue para a extração. */
  assert.equal(referencia.classification, "EDITORIAL_COMPETITOR", "NOT_RELEVANT = NO");
  assert.equal(decisao(SEBO).decision, "primary", "AUTO_SELECTED = YES");
  assert.match(referencia.classificationReason, /keyword secundária/);
});

/* ================  B · DIVERGÊNCIA EXIGE EVIDÊNCIA POSITIVA  ============ */

test("GATE 8.1 · B — outro assunto com contradição observada sai como divergente e não é selecionado", () => {
  /*
   * A evidência positiva disponível antes da extração é a contradição que a
   * própria consulta expõe: composição informacional devolvendo ficha de
   * produto. Não é o nosso matcher dizendo "não reconheço" — é a SERP dizendo
   * "isto aqui é outra coisa".
   */
  const { porUrl, decisao } = ler([consultaSecundaria([resultado(1, CACHORRO, "Protetor solar para cachorro", "product")])]);
  const referencia = porUrl.get(CACHORRO)!;

  assert.equal(referencia.entityCompatibility, "divergent", "EXPLICIT_DIVERGENCE_EXCLUDED");
  assert.equal(referencia.intentCompatibility, "divergent", "e a contradição observada é a origem da leitura");
  assert.notEqual(referencia.classification, "EDITORIAL_COMPETITOR");
  assert.notEqual(decisao(CACHORRO).decision, "primary", "AUTO_SELECTED = NO");
});

/* =========================  C · MATCH DIRETO  =========================== */

test("GATE 8.1 · C — \"rotina para peles oleosas\" casa com o núcleo do artigo", () => {
  const { porUrl, decisao } = ler([consultaSecundaria([resultado(1, ROTINA, "Rotina para peles oleosas")])]);
  const referencia = porUrl.get(ROTINA)!;

  assert.equal(referencia.entityCompatibility, "compatible", "flexão não é barreira: peles oleosas = pele oleosa");
  assert.equal(referencia.classification, "EDITORIAL_COMPETITOR");
  assert.equal(decisao(ROTINA).decision, "primary", "AUTO_SELECTED = YES");
});

/* ============  D · SECUNDÁRIA VÁLIDA + EDITORIAL + UNKNOWN  ============= */

test("GATE 8.1 · D — a SERP é evidência externa: secundária válida + editorial + unknown preserva", () => {
  const desconhecidas = [
    resultado(1, SEBO, "Como reduzir a produção de sebo"),
    resultado(2, "https://saude.com.br/glandulas-sebaceas", "O papel das glândulas sebáceas"),
    resultado(3, "https://blog.com.br/brilho-excessivo", "Brilho excessivo ao longo do dia"),
  ];
  const { references, decisao } = ler([consultaSecundaria(desconhecidas)]);

  assert.equal(references.length, 3);
  assert.equal(references.every(item => item.entityCompatibility !== "divergent"), true,
    "nenhuma tem evidência de outro assunto — só falta de evidência");
  assert.equal(references.every(item => item.classification === "EDITORIAL_COMPETITOR"), true);
  for (const item of references) {
    assert.equal(decisao(item.url).decision, "primary", `${item.title} precisa ser preservada`);
  }
  assert.equal(references.filter(item => item.entityCompatibility === "unknown").length >= 1, true,
    "UNKNOWN_ENTITY_REFERENCE_PRESERVED = YES");
});

/* ==============  E · REFORÇO CONTINUA MAIS CONSERVADOR  ================= */

test("GATE 8.1 · E — reforço único com unknown NÃO é promovido ao peso de secundária", () => {
  /* Nada em comum com o assunto NEM com a consulta de reforço que a trouxe. */
  const url = "https://blog.com.br/autoestima-no-trabalho";
  const { porUrl, decisao } = ler([consultaReforco([resultado(1, url, "Autoestima e produtividade no escritório")])]);
  const referencia = porUrl.get(url)!;

  assert.equal(referencia.entityCompatibility, "unknown", "mesmo estado da secundária do teste A");
  assert.equal(referencia.classification, "LATERAL_REFERENCE", "REINFORCEMENT_UNKNOWN_AUTO_PROMOTED = NO");
  assert.notEqual(referencia.classification, "EDITORIAL_COMPETITOR");
  assert.equal(decisao(url).decision, "excluded");

  /* A hierarquia Principal > Secundária > Reforço sobreviveu à leitura mais generosa. */
  const daSecundaria = ler([consultaSecundaria([resultado(1, SEBO, "Como reduzir a produção de sebo")])]).porUrl.get(SEBO)!;
  assert.equal(daSecundaria.entityCompatibility, referencia.entityCompatibility, "mesmo desconhecimento");
  assert.notEqual(daSecundaria.classification, referencia.classification, "papéis diferentes, pesos diferentes");
});

test("GATE 8.1 · E — mas o reforço com relação OBSERVADA continua entrando como apoio", () => {
  const url = "https://blog.com.br/pele-oleosa-no-verao";
  const { porUrl } = ler([consultaReforco([resultado(1, url, "Pele oleosa no verão")])]);
  const referencia = porUrl.get(url)!;

  assert.ok(["compatible", "related"].includes(referencia.entityCompatibility));
  assert.equal(autoDecideRadarReference({ ...referencia, classification: "LATERAL_REFERENCE" }).decision, "support",
    "relação observada promove; falta de informação não");
});

/* =============  F · DEPOIS DA EXTRAÇÃO, A RELAÇÃO APARECE  ============== */

const paginaExtraida = (id: string, heading: string): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://concorrente-${id}.com.br/artigo`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Página ${id}`, metaDescription: "", canonical: null,
  h1: ["Skincare"], h2: [heading], h3: [], wordCount: 1100, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 1, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 2, italicCount: 0,
  paragraphCount: 9, paragraphWordCounts: [50], headingOutline: [{ level: 1, text: "Skincare" }, { level: 2, text: heading }],
  introWordCount: 55, introText: "Abertura.", closingWordCount: 30, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
});

test("GATE 8.1 · F — extraída, a página revela a relação que o título escondia", () => {
  /*
   * O que o título não dava, o conteúdo dá: o heading fala de sebo E de pele.
   * A relação nasce da evidência observada, não de uma tabela de sinônimos.
   */
  const model = buildRadarSemanticConceptModel({
    pages: [paginaExtraida("a", "Por que a pele produz muito sebo?"), paginaExtraida("b", "Características da pele oleosa")],
    centralEntities: ["pele oleosa"],
    keywordTexts: ["skincare para pele oleosa", "controle de oleosidade"],
  });

  const sebo = model.entities.find(item => item.label === "sebo")!;
  assert.ok(sebo, "\"sebo\" precisa aparecer como entidade observada depois da extração");
  assert.equal(sebo.relation, "related_to", "relacionada ao contexto de oleosidade");
  assert.notEqual(sebo.relation, "same_as", "e continua sendo outra entidade");
  assert.equal(sebo.origin, "competitors");

  /* Preservar a página no Gate 5 é o que permitiu esta leitura existir. */
  assert.ok(model.concepts.some(concept => concept.conceptType === "CAUSE"));
});

/* ==========  G · NENHUM CONHECIMENTO ESPECÍFICO HARDCODED  ============== */

test("GATE 8.1 · G — nenhuma decisão usa conhecimento hardcoded de \"pele oleosa\"", () => {
  for (const arquivo of ["lib/radar/semantic-concept-model.ts", "lib/radar/competitor-universe.ts", "lib/radar/research-auto-selection.ts"]) {
    const fonte = readFileSync(arquivo, "utf8");
    const codigo = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const termo of ["sebo", "oleosidade", "oleosa", "skincare", "sebácea", "cachorro", "acne"]) {
      assert.equal(new RegExp(termo, "i").test(codigo), false,
        `${arquivo} não pode conhecer "${termo}" fora de comentário`);
    }
  }

  /* A leitura funciona igual para um artigo de outro assunto qualquer. */
  const outroEscopo = buildRadarSemanticScope({ centralEntities: ["adubação de orquídeas"], keywordTexts: ["como adubar orquídeas"] });
  assert.equal(radarSemanticEntityReading({ text: "Guia de adubação para orquídeas", scope: outroEscopo }), "compatible");
  assert.equal(radarSemanticEntityReading({ text: "Preparo de substrato para vasos", scope: outroEscopo }), "unknown");
  assert.equal(radarSemanticEntityReading({ text: "Preparo de substrato para vasos", scope: outroEscopo, divergenceEvidence: true }), "divergent");
});

/* =====================  contrato dos quatro estados  ==================== */

test("GATE 8.1 · os quatro estados dizem coisas diferentes, e o silêncio não é veto", () => {
  const escopo = buildRadarSemanticScope({
    centralEntities: ["pele oleosa"],
    principal: "skincare para pele oleosa",
    keywordTexts: ["controle de oleosidade"],
  });

  assert.equal(radarSemanticEntityReading({ text: "Rotina para peles oleosas", scope: escopo }), "compatible", "núcleo do artigo");
  assert.equal(radarSemanticEntityReading({ text: "Como controlar a oleosidade", scope: escopo }), "compatible", "oleosidade partilha raiz com oleosa");
  assert.equal(radarSemanticEntityReading({ text: "Guia de dermocosméticos", scope: escopo }), "unknown", "sem relação e sem contradição");
  assert.equal(radarSemanticEntityReading({ text: "Guia de dermocosméticos", scope: escopo, divergenceEvidence: true }), "divergent");

  /* A consulta que trouxe a página é evidência, e ela sozinha basta para "related". */
  assert.equal(
    radarSemanticEntityReading({ text: "Dez rituais noturnos de beleza", scope: escopo, queryText: "rituais noturnos" }),
    "related",
    "a SERP devolveu para esta consulta: isso é observação, não palpite",
  );

  /* Sem escopo declarado não há o que afirmar — nem a favor nem contra. */
  const vazio = buildRadarSemanticScope({});
  assert.equal(radarSemanticEntityReading({ text: "qualquer coisa", scope: vazio, divergenceEvidence: true }), "unknown",
    "sem assunto declarado nem a contradição sustenta divergência");
});

test("GATE 8.1 · nada foi escrito a montante e nenhum provider foi chamado", () => {
  const universo = readFileSync("lib/radar/competitor-universe.ts", "utf8");
  const semantico = readFileSync("lib/radar/semantic-concept-model.ts", "utf8");

  for (const fonte of [universo, semantico]) {
    for (const proibido of ["fetch(", "supabase", "Repository", "process.env"]) {
      assert.equal(fonte.includes(proibido), false, `${proibido} não pode existir nestes módulos`);
    }
  }
  /* O universo é lido do que já foi coletado; nada aqui inicia coleta. */
  assert.equal(/dataforseo|serper|provider/i.test(universo.replace(/\/\*[\s\S]*?\*\//g, "")), false);

  /* E o ArticleDNA continua entrando como leitura. */
  const antes = JSON.stringify(contexto());
  ler([consultaSecundaria([resultado(1, SEBO, "Como reduzir a produção de sebo")])]);
  assert.equal(JSON.stringify(contexto()), antes, "ARTICLE_UPSTREAM_MUTATED = NO");
});
