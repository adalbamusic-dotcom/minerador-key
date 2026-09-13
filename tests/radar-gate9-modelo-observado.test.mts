import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarCompetitorUniverse, type RadarExecutedQuery } from "../lib/radar/competitor-universe.ts";
import { buildRadarResearchReferences } from "../lib/radar/research-reference.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel, radarObservedNarrative, radarObservedSufficiencyLabel } from "../lib/radar/competitive-observed-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * ==============  GATE 9 · MODELO COMPETITIVO OBSERVADO  =================
 *
 * A pergunta que este gate precisa responder é do USER, não do sistema:
 * "o que caracteriza os conteúdos que competem por este tema?"
 *
 * A fixture é a do smoke real: skincare para pele oleosa, 4 consultas, 18
 * referências, 14 páginas comparáveis, algumas falhas definitivas. O modelo
 * precisa continuar utilizável, declarar o que não observou, e nunca voltar a
 * descrever a investigação como se fosse a SERP canônica de 7 resultados.
 *
 * Nenhum teste chama rede, provider ou storage.
 */

/* ============================ a composição ============================== */

const keyword = (id: string, text: string, role: string, centralEntity: string | null) => ({
  identity: { keywordId: id, text, role },
  strategy: {
    keywordDnaSnapshot: centralEntity ? { payload: { centralEntity } } : null,
    semanticQualification: { intent: "informacional" },
    normalizedIntent: "informacional",
  },
});

const contexto = (extra: Partial<{ mainIntent: string; editorialTopics: string[] }> = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "brand-1", articleId: "article-1",
    articleDnaVersionId: "dna-v7", articleDnaContentHash: `sha256:${"a".repeat(64)}`,
    promise: null, mainIntent: extra.mainIntent ?? "informacional", hierarchy: "Pilar",
  },
  keywords: [
    keyword("kw1", "skincare para pele oleosa", "principal", "pele oleosa"),
    keyword("kw2", "rotina para pele oleosa", "secundaria", null),
    keyword("kw3", "controle de oleosidade", "secundaria", null),
    keyword("kw4", "cuidados com a pele", "reforco_narrativo", null),
  ],
  editorialTopics: extra.editorialTopics ?? ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "rotina para pele oleosa", "controle de oleosidade", "cuidados com a pele"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

/* =============================== a amostra ============================== */

/** 14 comparáveis + 2 de formato não editorial + 2 que falharam = 18. */
const URL_EDITORIAL = (n: number) => `https://dominio${n}.com.br/artigo/pele-oleosa-${n}`;
const URL_CATEGORIA = "https://loja.com.br/categoria/protetor-solar";
const URL_MARKETPLACE = "https://mercadolivre.com.br/produto/sabonete";
const URL_FALHA_A = "https://bloqueado1.com.br/artigo/pele-oleosa-x";
const URL_FALHA_B = "https://bloqueado2.com.br/artigo/pele-oleosa-y";

const IDENTIFICACAO = [
  "Como identificar a pele oleosa?",
  "Características da pele oleosa",
  "Sinais de uma pele oleosa",
  "Como saber se a pele é oleosa?",
  "Como reconhecer a oleosidade",
  "Tipos de pele oleosa",
];
const CAUSAS = [
  "Causas da pele oleosa",
  "Por que a pele produz sebo?",
  "Motivos da oleosidade excessiva",
  "O que provoca o brilho na pele",
];
const PROCESSO = [
  "Como montar uma rotina para pele oleosa",
  "Cuidados diários com a pele oleosa",
  "Tratamento para controlar a oleosidade",
];

const pagina = (id: string, url: string, headings: string[], words: number, status: RadarExtractionPage["status"] = "success"): RadarExtractionPage => ({
  id: `page:${id}`, url, status, fetchedAt: "2026-09-10T10:00:00.000Z",
  title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [],
  wordCount: words, internalLinkCount: 5, externalLinkCount: 2,
  listCount: id.charCodeAt(0) % 2 === 0 ? 2 : 0, tableCount: 0, faqCount: 0,
  imageCount: 2, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
  structuredDataTypes: [], recurringTerms: [], boldCount: 3, italicCount: 0,
  paragraphCount: 12, paragraphWordCounts: [70, 90],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 70, introText: "Abertura editorial.", closingWordCount: 45, closingText: "Fechamento editorial.",
  hasClosing: true, emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
});

/**
 * As 13 encontradas pelas consultas, com 2 seções cada — mais a que só a
 * auxiliar trouxe, somando 14 comparáveis.
 *
 * Identificação em todas; causas nas 10 primeiras; processo nas 3 últimas. É o
 * formato de uma amostra real: o mesmo assunto escrito de muitas maneiras, e
 * nem todo mundo cobrindo tudo.
 */
const comparaveis = Array.from({ length: 13 }, (_, index) => pagina(
  String.fromCharCode(65 + index),
  URL_EDITORIAL(index + 1),
  index < 10
    ? [IDENTIFICACAO[index % IDENTIFICACAO.length], CAUSAS[index % CAUSAS.length]]
    : [IDENTIFICACAO[index % IDENTIFICACAO.length], PROCESSO[(index - 10) % PROCESSO.length]],
  1000 + (index + 1) * 100,
));

/** A página só encontrada pela secundária B, com um conceito que só ela traz. */
const SO_DA_AUXILIAR = pagina("S", URL_EDITORIAL(15), ["Melhores sabonetes para pele oleosa"], 1500);

const naoEditoriais = [
  pagina("X", URL_CATEGORIA, ["Protetor solar"], 180),
  pagina("Y", URL_MARKETPLACE, ["Sabonete facial"], 90),
];

const PAGINAS = [...comparaveis, SO_DA_AUXILIAR, ...naoEditoriais];

/* =============================== as consultas =========================== */

const item = (position: number, url: string, title: string, inferredType = "article") =>
  ({ position, url, title, domain: new URL(url).hostname, inferredType });

const CANONICA: RadarExecutedQuery = {
  queryId: "q:principal", keyword: "skincare para pele oleosa", keywordId: "kw1", role: "principal", serpClass: "canonical",
  results: [
    ...comparaveis.slice(0, 5).map((page, index) => item(index + 1, page.url, page.title)),
    item(6, URL_CATEGORIA, "Protetor solar", "category"),
    item(7, URL_FALHA_A, "Guia bloqueado"),
  ],
};

const SECUNDARIA_A: RadarExecutedQuery = {
  queryId: "q:sec-a", keyword: "rotina para pele oleosa", keywordId: "kw2", role: "secundaria", serpClass: "auxiliary",
  results: [
    /* Quatro recorrentes: já tinham aparecido na canônica. */
    ...comparaveis.slice(0, 4).map((page, index) => item(index + 1, page.url, page.title)),
    ...comparaveis.slice(5, 10).map((page, index) => item(index + 5, page.url, page.title)),
  ],
};

const SECUNDARIA_B: RadarExecutedQuery = {
  queryId: "q:sec-b", keyword: "controle de oleosidade", keywordId: "kw3", role: "secundaria", serpClass: "auxiliary",
  results: [
    ...comparaveis.slice(10, 13).map((page, index) => item(index + 1, page.url, page.title)),
    item(4, SO_DA_AUXILIAR.url, SO_DA_AUXILIAR.title),
    item(5, URL_FALHA_B, "Artigo indisponível"),
  ],
};

/* O reforço traz um comercial e repete a primeira: ela chega a três consultas. */
const REFORCO: RadarExecutedQuery = {
  queryId: "q:ref", keyword: "cuidados com a pele", keywordId: "kw4", role: "reforco_narrativo", serpClass: "auxiliary",
  results: [item(1, URL_MARKETPLACE, "Sabonete facial", "product"), item(2, comparaveis[0].url, comparaveis[0].title)],
};

const QUERIES = [CANONICA, SECUNDARIA_A, SECUNDARIA_B, REFORCO];

/* ============================== a montagem ============================== */

function montar(extra: {
  pages?: RadarExtractionPage[];
  queries?: RadarExecutedQuery[];
  context?: RadarArticleResearchContext;
  diagnostic?: { dominantIntent: string | null; dominantFormats: string[] } | null;
} = {}) {
  const context = extra.context || contexto();
  const queries = extra.queries || QUERIES;
  const pages = extra.pages || PAGINAS;

  const universe = buildRadarCompetitorUniverse({ queries, context });
  const references = buildRadarResearchReferences({ queries, universe, context });
  const provenance = references.map(reference => ({
    url: reference.url,
    appearances: reference.appearances.map(aparicao => ({ keyword: aparicao.keyword, keywordRole: aparicao.keywordRole, sourceType: aparicao.sourceType })),
  }));
  const structural = buildRadarCompetitiveModel({
    pages,
    query: "skincare para pele oleosa",
    principal: "skincare para pele oleosa",
    observedIntent: extra.diagnostic?.dominantIntent ?? "informacional",
    editorialTopics: context.editorialTopics,
    keywordTexts: context.resolvedKeywordTexts,
    centralEntities: ["pele oleosa"],
    provenance,
  });
  const comparison = buildRadarEditorialComparison({
    context, model: structural,
    observedIntent: extra.diagnostic?.dominantIntent ?? "informacional",
    observedFormats: extra.diagnostic?.dominantFormats ?? ["article"],
  });

  return {
    context, universe, references, structural, comparison,
    observed: buildRadarCompetitiveObservedModel({
      context, universe, references,
      selectedUrls: references.map(reference => reference.url),
      pages,
      failedUrls: [URL_FALHA_A, URL_FALHA_B],
      structural, comparison,
      diagnostic: extra.diagnostic ?? { dominantIntent: "informacional", dominantFormats: ["article"] },
      canonicalSerpResults: CANONICA.results.length,
      observedAt: "2026-09-10T12:00:00.000Z",
    }),
  };
}

/* ==================  25 · A FIXTURE REALISTA FECHA  ===================== */

test("GATE 9 · a amostra real é declarada, e a canônica de 7 não é confundida com ela", () => {
  const { observed } = montar();

  assert.equal(observed.sample.queriesExecuted, 4, "quatro consultas executadas");
  assert.equal(observed.sample.canonicalSerpResults, 7, "a SERP canônica devolveu sete");
  assert.equal(observed.sample.uniqueReferences, 18, "e a pesquisa reuniu dezoito referências distintas");
  assert.notEqual(observed.sample.uniqueReferences, observed.sample.canonicalSerpResults, "CANONICAL_7_LEAK = NO");
  assert.equal(observed.sample.comparablePages, 14, "catorze páginas editoriais extraídas com sucesso");
  assert.equal(observed.sample.failedFinal, 2, "duas falhas definitivas");
  assert.equal(observed.sample.recurrentReferences > 0, true, "há referências vistas em mais de uma consulta");

  /* E a diferença entre os dois números é dita em voz alta. */
  assert.ok(observed.limitations.some(item => /A SERP canônica devolveu 7 resultado\(s\); a pesquisa multi-query reuniu 18/.test(item)));
});

/* ============  A · O MODELO USA CONCEITOS, NÃO HEADINGS CRUS  =========== */

test("GATE 9 · A — a leitura de cobertura vem da camada conceitual", () => {
  const { observed, structural } = montar();

  assert.ok(observed.evidence.semantic, "a camada semântica alimenta o modelo");
  assert.equal(observed.concepts.all.length, observed.evidence.semantic!.concepts.length);
  assert.ok(observed.concepts.all.length < structural.classifiedTopics.length,
    "há mais headings literais do que conceitos — é exatamente o agrupamento acontecendo");

  /* Nenhum conceito do modelo é um heading solto reaproveitado. */
  for (const conceito of observed.concepts.all) {
    assert.ok(conceito.variants.length >= 1);
    assert.ok(conceito.supportingPages.length >= 1, "todo conceito carrega a observação que o formou");
  }
});

/* ==========  B e C · AGRUPAR O IGUAL, SEPARAR O DIFERENTE  ============== */

test("GATE 9 · B — formulações equivalentes viram um conceito recorrente", () => {
  const { observed } = montar();
  const identificacao = observed.concepts.all.find(item => item.conceptType === "ATTRIBUTE")!;

  assert.ok(identificacao, "o assunto de identificação existe como conceito");
  assert.equal(identificacao.variants.length >= 4, true, "escrito de pelo menos quatro maneiras na amostra");
  assert.equal(identificacao.sourceCount, 13, "e coberto por treze páginas — não treze assuntos");
  assert.ok(observed.concepts.recurrent.some(item => item.id === identificacao.id), "RECURRENT_CONCEPT");
});

test("GATE 9 · C — necessidades diferentes sobre a mesma entidade continuam distintas", () => {
  const { observed } = montar();
  const tipos = observed.concepts.all.map(item => item.conceptType);

  assert.ok(tipos.includes("ATTRIBUTE"), "identificação");
  assert.ok(tipos.includes("CAUSE"), "causas");
  assert.ok(tipos.includes("PROCESS"), "rotina e tratamento");
  assert.equal(new Set(observed.concepts.all.map(item => item.id)).size, observed.concepts.all.length, "nenhum id repetido");

  const identificacao = observed.concepts.all.find(item => item.conceptType === "ATTRIBUTE")!;
  const causas = observed.concepts.all.find(item => item.conceptType === "CAUSE")!;
  assert.notEqual(identificacao.id, causas.id, "compartilham a entidade e NÃO compartilham a necessidade");
});

/* ============  D e E · O QUE SÓ A AUXILIAR TROUXE PERMANECE  ============ */

test("GATE 9 · D — concorrente descoberto só pela secundária entra no modelo em pé de igualdade", () => {
  const { observed } = montar();
  const soDaAuxiliar = observed.competitors.find(item => item.url === SO_DA_AUXILIAR.url)!;

  assert.ok(soDaAuxiliar, "a referência existe");
  assert.equal(soDaAuxiliar.origin, "AUXILIARY");
  assert.equal(soDaAuxiliar.comparable, true, "e é comparável como qualquer outra");
  assert.deepEqual(soDaAuxiliar.queries, ["controle de oleosidade"]);
  assert.ok(soDaAuxiliar.conceptsCovered.length > 0, "com os conceitos que ela cobre registrados");
  assert.ok(observed.sample.auxiliaryOnlyReferences > 0, "AUXILIARY_ONLY_PRESERVED");
});

test("GATE 9 · E — conceito trazido só pela pesquisa auxiliar não é relegado", () => {
  const { observed } = montar();
  const produto = observed.concepts.all.find(item => item.conceptType === "PRODUCT")!;

  assert.ok(produto, "o conceito existe no modelo");
  assert.equal(produto.auxiliaryOnly, true);
  assert.deepEqual(produto.queries, ["controle de oleosidade"]);
  assert.ok(observed.concepts.all.includes(produto), "e está na lista principal, não numa seção técnica");
});

/* ==============  F · A RECORRÊNCIA MULTI-QUERY APARECE  ================= */

test("GATE 9 · F — o concorrente visto em três consultas carrega a recorrência e as posições", () => {
  const { observed } = montar();
  const recorrentes = observed.competitors.filter(item => item.queryRecurrence > 1);

  assert.ok(recorrentes.length >= 4, "a fixture tem repetição entre consultas");
  const exemplo = recorrentes.find(item => item.url === comparaveis[0].url)!;
  assert.equal(exemplo.queryRecurrence, 3, "principal, secundária A e reforço");
  assert.equal(exemplo.origin, "CANONICAL_AND_AUXILIARY");
  assert.equal(exemplo.ranks.length, 3, "com a posição em cada uma");
  assert.ok(exemplo.ranks.every(rank => typeof rank.rank === "number" && rank.role));

  /* E a cobertura por consulta chega aos conceitos, não só aos concorrentes. */
  assert.ok(observed.concepts.all.some(item => item.queryCoverage >= 3), "conceito achado por três consultas ou mais");
});

/* ================  G · A ESTRUTURA É OBSERVAÇÃO, NÃO META  ============== */

test("GATE 9 · G — mediana, faixa central e faixa cheia descrevem a amostra", () => {
  const { observed } = montar();
  const palavras = observed.structure.measures.find(item => item.key === "words")!;

  assert.equal(palavras.kind, "distribution");
  assert.equal(palavras.sampleSize, 14);
  assert.equal(palavras.median, 1650, "mediana das catorze comparáveis");
  assert.deepEqual(palavras.fullRange, [1100, 2300]);
  assert.ok(palavras.centralRange, "faixa central existe com amostra suficiente");
  assert.ok(palavras.sources.length === 14, "cada valor rastreável até a página");

  const h2 = observed.structure.measures.find(item => item.key === "h2")!;
  assert.equal(h2.kind, "distribution");
  assert.ok(h2.median !== null);
});

/* ==========  H · FORMATO INCOMPARÁVEL NÃO CONTAMINA A MEDIDA  ========== */

test("GATE 9 · H — categoria e marketplace ficam visíveis e fora do benchmark estrutural", () => {
  const { observed } = montar();

  assert.equal(observed.formats.dominant?.format, "article_editorial");
  const categoria = observed.formats.distribution.find(item => item.format === "category")!;
  const marketplace = observed.formats.distribution.find(item => item.format === "marketplace")!;
  assert.ok(categoria && marketplace, "os dois formatos continuam visíveis");
  assert.equal(categoria.comparable, false);
  assert.equal(marketplace.comparable, false);

  /* As 90 e as 180 palavras deles não entram na faixa. */
  const palavras = observed.structure.measures.find(item => item.key === "words")!;
  assert.equal(palavras.sources.some(source => source.value === 90 || source.value === 180), false);
  assert.ok(observed.limitations.some(item => /formato não editorial/.test(item)));
});

/* ===================  I e J · LACUNA EXIGE EVIDÊNCIA  ================== */

test("GATE 9 · I — toda lacuna diz o que falta, contra o quê, em quantas páginas e com que confiança", () => {
  const { observed } = montar();

  assert.ok(observed.gaps.length > 0, "há lacuna nesta amostra");
  for (const lacuna of observed.gaps) {
    assert.equal(lacuna.against, "ARTICLE_DNA", "em relação ao que o artigo declara");
    assert.ok(lacuna.sources.length > 0, "com as páginas que a sustentam");
    assert.ok(lacuna.pagesCovering > 0);
    assert.ok(lacuna.sampleSize > 0);
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(lacuna.confidence));
    assert.ok(lacuna.evidence.length > 10);
  }
});

test("GATE 9 · J — assunto isolado, sem relação com o artigo, não vira lacuna", () => {
  const comRuido = [...PAGINAS, pagina("Z", URL_EDITORIAL(90), ["História da perfumaria francesa"], 1400)];
  const { observed } = montar({ pages: comRuido });

  const isolado = observed.concepts.all.find(item => item.canonicalLabel === "História da perfumaria francesa");
  assert.ok(isolado, "o assunto continua visível como conceito observado");
  assert.equal(isolado!.status, "ISOLATED", "mas classificado como isolado");
  assert.equal(observed.gaps.some(lacuna => lacuna.subject === "História da perfumaria francesa"), false,
    "e não é promovido a lacuna competitiva");
});

/* ===============  K · DIFERENCIAÇÃO COM FUNDAMENTAÇÃO  ================= */

test("GATE 9 · K — cada diferenciação diz o que a sustenta e mostra a evidência", () => {
  const { observed } = montar();

  assert.ok(observed.differentiations.length > 0);
  for (const diferencial of observed.differentiations) {
    assert.ok(["ARTICLE_DECLARES", "SERP_EVIDENCE"].includes(diferencial.basis), "diferenciação não é invenção");
    assert.ok(diferencial.evidence.length > 10);
    assert.ok(diferencial.sampleSize > 0);
    if (diferencial.basis === "SERP_EVIDENCE") {
      assert.ok(diferencial.sources.length > 0, "a busca evidenciou: as páginas estão aqui");
    }
  }
});

/* =====================  L · CONFLITO CONTINUA CONFLITO  ================= */

test("GATE 9 · L — a contradição de intenção fica escrita, com evidência e impacto", () => {
  const { observed } = montar({ diagnostic: { dominantIntent: "transacional", dominantFormats: ["product"] } });

  assert.equal(observed.intent.declared, "informacional");
  assert.equal(observed.intent.observedInSerp, "transacional");
  assert.equal(observed.intent.alignment, "DIVERGENT");

  const conflito = observed.conflicts.find(item => item.dimension === "intent")!;
  assert.ok(conflito, "o conflito não foi resolvido em silêncio");
  assert.ok(conflito.evidence.length > 10);
  assert.ok(conflito.impact.length > 10, "e diz o que muda para quem for planejar");
  assert.equal(conflito.articleSide, "informacional");
});

test("GATE 9 · L — mas SERP comercial não é falha quando a composição é comercial", () => {
  const comercial = contexto({ mainIntent: "transacional" });
  const { observed } = montar({
    context: comercial,
    diagnostic: { dominantIntent: "transacional", dominantFormats: ["product"] },
  });

  assert.notEqual(observed.intent.alignment, "DIVERGENT");
  assert.equal(observed.conflicts.some(item => item.dimension === "intent"), false, "as duas leituras concordam");
});

/* ==========  M · LIMITAÇÃO INFORMA, NÃO BLOQUEIA O MODELO  ============= */

test("GATE 9 · M — as falhas viram limitação declarada e o modelo continua utilizável", () => {
  const { observed } = montar();

  assert.ok(observed.limitations.some(item => /2 página\(s\) selecionada\(s\) não puderam ser extraídas/.test(item)));
  assert.ok(observed.limitations.length >= 2);

  /* E nada disso impede a leitura de existir. */
  assert.ok(observed.concepts.recurrent.length > 0);
  assert.ok(observed.structure.measures.some(item => item.kind === "distribution"));
  assert.notEqual(observed.sufficiency.level, "INSUFFICIENT");

  /* A falha aparece também no concorrente que a sofreu. */
  const falhou = observed.competitors.find(item => item.url === URL_FALHA_A)!;
  assert.equal(falhou.extractionStatus, "not_extracted");
  assert.ok(falhou.limitations.some(item => /falha definitiva/.test(item)));
});

/* ==============  N e O · FUNDAMENTOS: LIDOS, NUNCA ESCRITOS  =========== */

test("GATE 9 · N — o ArticleDNA entra como leitura e volta idêntico", () => {
  const antes = contexto();
  const copia = JSON.stringify(antes);
  montar({ context: antes });
  assert.equal(JSON.stringify(antes), copia, "ARTICLE_UPSTREAM_MUTATED = NO");

  const fonte = readFileSync("lib/radar/competitive-observed-model.ts", "utf8");
  for (const proibido of ["fetch(", "supabase", "Repository", "createClient", "process.env"]) {
    assert.equal(fonte.includes(proibido), false, `${proibido} não pode existir num módulo de domínio puro`);
  }
});

test("GATE 9 · O — o modelo sabe de que versão do ArticleDNA ele é fotografia", () => {
  const { observed } = montar();

  assert.equal(observed.identity.articleId, "article-1");
  assert.equal(observed.identity.articleDnaVersionId, "dna-v7");
  assert.equal(observed.identity.articleDnaContentHash, `sha256:${"a".repeat(64)}`);
  assert.equal(observed.identity.brandId, "brand-1");
  assert.equal(observed.identity.principal, "skincare para pele oleosa");
  assert.equal(observed.identity.observedAt, "2026-09-10T12:00:00.000Z");
});

/* =========  P · NENHUM CAMPO DE DECISÃO DO PLANEJADOR VAZA  ============ */

test("GATE 9 · P — o Radar descreve o mercado; ele não decide o artigo", () => {
  const fonte = readFileSync("lib/radar/competitive-observed-model.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const proibido of [
    "targetWordCount", "TARGET_WORD_COUNT", "finalOutline", "FINAL_OUTLINE",
    "finalH2", "FINAL_H2", "finalH3", "finalAnchor", "FINAL_ANCHOR",
    "repeatCount", "REPEAT_COUNT", "insertSection", "INSERT_SECTION",
    "insertPosition", "INSERT_POSITION", "finalCta", "FINAL_CTA",
    "publicationSchedule", "PUBLICATION_SCHEDULE", "recommendedWordCount", "shouldHave",
  ]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} pertence ao Planejador`);
  }

  const { observed } = montar();
  const serializado = JSON.stringify(observed);
  for (const proibido of ["targetWordCount", "finalOutline", "recommendedWordCount", "insertPosition"]) {
    assert.equal(serializado.includes(proibido), false, `PLANNER_DECISIONS_EMITTED = NO — ${proibido}`);
  }

  /* A estrutura sai como observação e diz isso na própria frase. */
  const narrativa = radarObservedNarrative(observed);
  const texto = narrativa.flatMap(secao => secao.lines).join(" ");
  assert.equal(/dev(e|erá)\s+ter|precisa ter|use\s+\d+\s+H2|escreva/i.test(texto), false, "nada de prescrição na projeção humana");
  assert.match(texto, /Mediana|página\(s\) comparável\(is\)/, "e sim de observação com amostra");
});

/* ===============  Q · A EVIDÊNCIA BRUTA CONTINUA ALCANÇÁVEL  =========== */

test("GATE 9 · Q — do modelo se chega ao heading original sem recalcular nada", () => {
  const { observed } = montar();

  assert.ok(observed.evidence.semantic, "camada semântica");
  assert.ok(observed.evidence.structural, "camada estrutural");
  assert.ok(observed.evidence.comparison, "confronto com o ArticleDNA");
  assert.ok(observed.evidence.semantic!.rawObservations.length > 0, "as observações originais");

  const conceito = observed.concepts.recurrent[0];
  const apoio = conceito.supportingPages[0];
  assert.ok(apoio.heading.length > 0, "o texto ORIGINAL do heading");
  assert.ok(apoio.url.startsWith("https://"));
  assert.ok(apoio.pageId.startsWith("page:"));
  assert.ok(PAGINAS.some(page => page.h2.includes(apoio.heading)), "e ele existe mesmo na página extraída");
});

/* =================  R · O MODELO SABE QUANDO ESTÁ FRACO  =============== */

test("GATE 9 · R — a suficiência reage à amostra: boa, parcial e insuficiente", () => {
  const boa = montar().observed.sufficiency;
  assert.equal(boa.level, "GOOD");
  assert.ok(boa.signals.domainDiversity >= 3);
  assert.ok(boa.reasons.length > 0);

  /* Duas páginas comparáveis não descrevem mercado. */
  const insuficiente = montar({ pages: comparaveis.slice(0, 2) }).observed.sufficiency;
  assert.equal(insuficiente.level, "INSUFFICIENT");
  assert.ok(insuficiente.reasons.some(item => /abaixo de 3/.test(item)));

  /* Quatro páginas do MESMO domínio: comparável o bastante, diverso não. */
  const mesmoDominio = Array.from({ length: 4 }, (_, index) =>
    pagina(`M${index}`, `https://unico.com.br/artigo/pele-${index}`, ["Características da pele oleosa"], 1200));
  const parcial = montar({ pages: mesmoDominio }).observed.sufficiency;
  assert.equal(parcial.level, "PARTIAL");
  assert.ok(parcial.reasons.some(item => /domínio\(s\) distinto\(s\)/.test(item)));

  assert.equal(radarObservedSufficiencyLabel("GOOD"), "Leitura sustentada pela amostra");
});

/* ==========  S · A PROJEÇÃO HUMANA SAI DA MESMA AUTORIDADE  =========== */

test("GATE 9 · S — a leitura humana é derivada do modelo, não de um segundo cálculo", () => {
  const { observed } = montar();
  const narrativa = radarObservedNarrative(observed);
  const titulos = narrativa.map(secao => secao.title);

  for (const esperado of ["Amostra", "Intenção", "Formato", "Estrutura", "Conceitos recorrentes", "Perguntas recorrentes", "O artigo já cobre", "O mercado cobre e o artigo não declara", "Pouco coberto pelo mercado", "Diferenciação possível", "Conflitos", "Limitações"]) {
    assert.ok(titulos.includes(esperado), `a seção "${esperado}" precisa existir`);
  }

  /*
   * As duas faltas são leituras diferentes e ficam em seções diferentes.
   * Um assunto coberto por 10 de 14 páginas não é "pouco coberto pelo mercado".
   */
  const doArtigo = narrativa.find(secao => secao.title === "O mercado cobre e o artigo não declara")!;
  const doMercado = narrativa.find(secao => secao.title === "Pouco coberto pelo mercado")!;
  assert.notDeepEqual(doArtigo.lines, doMercado.lines, "as duas listas não podem ser a mesma");
  assert.ok(doMercado.lines.every(linha => /apenas \d+ de \d+/.test(linha) || /Nenhum assunto/.test(linha)),
    "pouco coberto significa poucas páginas cobrindo");
  assert.ok(narrativa.every(secao => secao.lines.length > 0), "nenhuma seção vazia: ausência também é dita");

  /* Os números da narrativa são os do modelo — conferidos, não reescritos. */
  const amostra = narrativa.find(secao => secao.title === "Amostra")!;
  assert.match(amostra.lines[0], new RegExp(`${observed.sample.comparablePages} página\\(s\\) comparável\\(is\\) em ${observed.sample.queriesExecuted} consulta\\(s\\)`));
  assert.match(amostra.lines[1], new RegExp(`${observed.sample.uniqueReferences} referência\\(s\\) distinta\\(s\\)`));

  /* Primeira camada sem detalhe técnico. */
  const texto = narrativa.flatMap(secao => secao.lines).join(" ");
  assert.equal(/page:|sha256:|referenceId|fingerprint/.test(texto), false, "id, hash e fingerprint ficam no modelo");

  /* Determinística: a mesma entrada produz a mesma leitura. */
  assert.deepEqual(radarObservedNarrative(observed), narrativa);
});

test("GATE 9 · S — a aba lê o modelo da view, não monta um por conta própria", () => {
  const view = readFileSync("lib/radar/deep-research-view.ts", "utf8");
  assert.match(view, /buildRadarCompetitiveObservedModel\(\{/, "a view é quem monta");
  assert.match(view, /narrative: radarObservedNarrative\(observed\)/, "e a narrativa sai do mesmo objeto");

  const workbench = readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8");
  assert.match(workbench, /view\.narrative\.map/, "a tela renderiza a projeção pronta");
  assert.equal(/buildRadarCompetitiveObservedModel/.test(workbench), false, "SINGLE_MODEL_AUTHORITY: a tela não recalcula");
});

test("GATE 9 · SINGLE_MODEL_AUTHORITY — nenhum componente monta o próprio modelo estrutural", () => {
  /*
   * A aba calculava um modelo e o relatório gravava outro. Dois cálculos sobre
   * a mesma investigação é uma discordância esperando acontecer — e ela chega
   * quando o relatório envelhece e a tela não.
   */
  const view = readFileSync("lib/radar/deep-research-view.ts", "utf8");
  assert.match(view, /const structural = extractions\.length/, "a view monta o estrutural a partir das extrações correntes");
  assert.match(view, /: input\.model \|\| null;/, "e só cai no gravado quando não há extração nesta versão");
  assert.match(view, /model: structural,/, "a comparação usa o mesmo objeto");
  assert.match(view, /structural,\r?\n\s+comparison,/, "e o modelo observado também");

  for (const componente of ["modules/radar/radar-r3-serp-panel.tsx", "modules/radar/radar-r3-workbench.tsx", "modules/radar/radar-page.tsx"]) {
    const fonte = readFileSync(componente, "utf8");
    assert.equal(/buildRadarCompetitiveModel\(\{/.test(fonte), false, `${componente} não pode montar o próprio modelo`);
  }
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /deepResearch\?\.observed\.evidence\.structural/, "o painel lê o modelo da leitura única");
  assert.match(painel, /suficiencia\.canBuildCompetitiveModel && analysis\?\.payload\.extractions\.length/,
    "e o portão continua: sem extração acionada pelo USER, não há modelo");
});

/* ==============  T · NENHUMA CHAMADA EXTERNA NOS TESTES  ============== */

test("GATE 9 · T — o modelo é domínio puro e não conhece provider nem transporte", () => {
  const fonte = readFileSync("lib/radar/competitive-observed-model.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  assert.equal(/dataforseo|serper|deepseek|openai|axios|node-fetch/i.test(codigo), false, "PROVIDER_CALLS = 0");
  assert.equal(codigo.includes("async "), false, "nenhuma operação assíncrona: não há o que esperar aqui");
  assert.equal(/from "\.\.\/(minerador|arquiteto|planejador)/.test(codigo), false, "o Radar não alcança os módulos vizinhos");

  /* E o módulo declara de quem ele depende — todas camadas do próprio Radar. */
  const imports = [...codigo.matchAll(/from "\.\/([a-z0-9-]+)\.ts"/g)].map(match => match[1]);
  for (const esperado of ["analysis-insights", "competitive-model", "research-reference", "investigation-sufficiency"]) {
    assert.ok(imports.includes(esperado), `${esperado} é fonte declarada do modelo`);
  }
});

/* ===================  2 · NENHUMA CAMADA É IGNORADA  ================== */

test("GATE 9 · o modelo consome todas as camadas, e nenhuma fica pelo caminho", () => {
  const { observed } = montar();

  assert.ok(observed.identity.articleDnaVersionId, "USES_ARTICLE_FOUNDATIONS");
  assert.ok(observed.sample.queriesExecuted > 1 && observed.sample.recurrentReferences > 0, "USES_MULTI_QUERY_RESEARCH");
  assert.ok(observed.structure.measures.length > 0, "USES_STRUCTURAL_EXTRACTION");
  assert.ok(observed.concepts.all.length > 0, "USES_SEMANTIC_CONCEPTS");
  assert.ok(observed.questions.length > 0, "USES_QUESTIONS");
  assert.ok(observed.entities.shared.length + observed.entities.related.length > 0, "USES_ENTITIES");

  /* O verbo que nomeia a necessidade não entra na lista de entidades. */
  const rotulos = [...observed.entities.shared, ...observed.entities.related, ...observed.entities.marketOnly].map(item => item.label);
  for (const verbo of ["produz", "identificar", "provoca", "reconhecer"]) {
    assert.equal(rotulos.includes(verbo), false, `"${verbo}" descreve a necessidade, não o assunto`);
  }
  assert.ok(rotulos.includes("sebo"), "e a entidade de verdade continua lá, relacionada e distinta");

  /* Pergunta declarada pelo artigo exige a MESMA necessidade, não só palavras em comum. */
  const rotina = observed.questions.find(item => /rotina/.test(item.canonicalQuestion));
  if (rotina) assert.equal(rotina.declaredByArticle, false, "\"identificação\" não declara \"como montar uma rotina\"");
  assert.ok(observed.evidence.comparison.rows.length > 0, "USES_EDITORIAL_COMPARISON");
  assert.ok(observed.competitors.length === observed.sample.uniqueReferences, "cada referência tem ficha própria");

  /* As perguntas trazem o estado de cada uma, não só o texto. */
  for (const pergunta of observed.questions) {
    assert.ok(["RECURRENT_QUESTION", "ARTICLE_QUESTION_CONFIRMED", "MARKET_QUESTION_UNDERCOVERED", "ISOLATED_QUESTION"].includes(pergunta.status));
    assert.ok(pergunta.evidence.length > 10);
  }
});
