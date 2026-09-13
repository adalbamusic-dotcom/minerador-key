import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildRadarSemanticConceptModel, buildRadarSemanticScope, radarSemanticEntityReading,
  radarSemanticIsNoise, radarSemanticIsQuestion, radarSemanticStem, radarSemanticType,
  RadarSemanticConceptModelSchema, type RadarPageProvenance, type RadarSemanticEnricher,
} from "../lib/radar/semantic-concept-model.ts";
import { buildRadarCompetitiveModel, RadarCompetitiveModelSchema } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ==================  GATE 8 · ANÁLISE SEMÂNTICA  ========================
 *
 * A régua deste gate é uma pergunta só: quatro páginas escrevendo o mesmo
 * assunto de quatro maneiras produzem UM conceito coberto ou QUATRO lacunas?
 *
 * Nenhum teste aqui chama rede, provider ou storage. As fixtures são páginas
 * já extraídas — o gate opera sobre evidência, não sobre coleta.
 */

/* ----------------------------- fixtures ---------------------------------- */

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`,
  url: `https://concorrente-${id.toLowerCase()}.com.br/artigo`,
  status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z",
  title: `Página ${id}`,
  metaDescription: "",
  canonical: null,
  h1: ["Skincare"],
  h2: headings,
  h3: [],
  wordCount: 1200,
  internalLinkCount: 4,
  externalLinkCount: 1,
  listCount: 2,
  tableCount: 0,
  faqCount: 0,
  imageCount: 2,
  blockquoteCount: 0,
  comparisonCount: 0,
  hasDates: true,
  author: null,
  structuredDataTypes: [],
  recurringTerms: [],
  boldCount: 3,
  italicCount: 0,
  paragraphCount: 10,
  paragraphWordCounts: [60, 80],
  headingOutline: [{ level: 1, text: "Skincare" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60,
  introText: "Abertura da página.",
  closingWordCount: 40,
  closingText: "Fechamento da página.",
  hasClosing: true,
  emphasizedTerms: [],
  keywordPlacement: null,
  observedLinks: [],
  error: null,
});

/** A fixture de aceitação do gate: pele oleosa, sete páginas, três conceitos. */
const PELE_OLEOSA = [
  pagina("A", ["Como identificar a pele oleosa?"]),
  pagina("B", ["Características da pele oleosa"]),
  pagina("C", ["Sinais de uma pele oleosa"]),
  pagina("D", ["Como saber se a pele é oleosa?"]),
  pagina("E", ["Causas internas da pele oleosa"]),
  pagina("F", ["Por que a pele produz muito sebo?"]),
  pagina("G", ["Melhores sabonetes para pele oleosa"]),
];

const ARTIGO = { keywordTexts: ["skincare para pele oleosa"], centralEntities: ["pele oleosa"] };

const modeloDe = (pages: RadarExtractionPage[], extra: Partial<Parameters<typeof buildRadarSemanticConceptModel>[0]> = {}) =>
  buildRadarSemanticConceptModel({ pages, ...ARTIGO, ...extra });

const conceitoDe = (model: ReturnType<typeof buildRadarSemanticConceptModel>, pageId: string) =>
  model.concepts.find(concept => concept.supportingObservations.some(item => item.pageId === `page:${pageId}`));

/* ==================  17 · EXEMPLO DE ACEITAÇÃO  ========================= */

test("GATE 8 · pele oleosa: sete páginas, três conceitos — não sete", () => {
  const model = modeloDe(PELE_OLEOSA);

  assert.equal(model.concepts.length, 3, "sete formulações, três necessidades distintas");
  assert.notEqual(model.concepts.length, 7, "o agrupamento não pode ser identidade");

  const identificacao = conceitoDe(model, "A")!;
  assert.deepEqual(
    identificacao.supportingObservations.map(item => item.pageId).sort(),
    ["page:A", "page:B", "page:C", "page:D"],
    "identificação e características: A, B, C, D",
  );
  assert.equal(identificacao.recurrence, 4);
  assert.equal(identificacao.conceptType, "ATTRIBUTE");

  const causas = conceitoDe(model, "E")!;
  assert.deepEqual(causas.supportingObservations.map(item => item.pageId).sort(), ["page:E", "page:F"], "causas/produção: E e F");
  assert.equal(causas.recurrence, 2);
  assert.equal(causas.conceptType, "CAUSE");

  const produtos = conceitoDe(model, "G")!;
  assert.deepEqual(produtos.supportingObservations.map(item => item.pageId), ["page:G"]);
  assert.equal(produtos.recurrence, 1);
  assert.equal(produtos.conceptType, "PRODUCT");
});

/* ==============  A · VARIANTES LEXICAIS → UM CONCEITO  ================== */

test("GATE 8 · A — quatro formulações do mesmo assunto viram um conceito, com as quatro preservadas", () => {
  const model = modeloDe(PELE_OLEOSA);
  const identificacao = conceitoDe(model, "A")!;

  assert.equal(identificacao.variants.length, 4, "as quatro formulações continuam listadas");
  for (const texto of ["Como identificar a pele oleosa?", "Características da pele oleosa", "Sinais de uma pele oleosa", "Como saber se a pele é oleosa?"]) {
    assert.ok(identificacao.variants.includes(texto), `${texto} precisa continuar visível como variante`);
  }
  /* O rótulo é uma formulação REAL da amostra, não uma frase inventada. */
  assert.ok(identificacao.variants.includes(identificacao.canonicalLabel));
});

/* =============  B · INTENÇÕES DISTINTAS → CONCEITOS SEPARADOS  ========== */

test("GATE 8 · B — palavras compartilhadas não bastam: necessidades diferentes ficam separadas", () => {
  const pages = [
    pagina("A", ["Como identificar pele oleosa"]),
    pagina("B", ["Causas da pele oleosa"]),
    pagina("C", ["Tratamento da acne"]),
    pagina("D", ["Protetor solar para pele oleosa"]),
  ];
  const model = modeloDe(pages);

  assert.equal(model.concepts.length, 4, "quatro necessidades, quatro conceitos");
  const ids = new Set(model.concepts.map(concept => concept.id));
  assert.equal(ids.size, 4, "nenhum id repetido");

  /* Três delas contêm "pele oleosa" e mesmo assim não se juntam. */
  const tipos = model.concepts.map(concept => concept.conceptType).sort();
  assert.deepEqual(tipos, ["ATTRIBUTE", "CAUSE", "PROCESS", "TOPIC"]);

  /* E o acne, que não é o assunto do artigo, não é ancorado. */
  assert.equal(conceitoDe(model, "C")!.anchored, false);
  assert.equal(conceitoDe(model, "D")!.anchored, true);
});

/* ==================  C · RECORRÊNCIA POR CONCEITO  ====================== */

test("GATE 8 · C — a recorrência é do conceito, não do heading literal", () => {
  const pages = [
    pagina("A", ["Características da pele oleosa"]),
    pagina("B", ["Como identificar pele oleosa"]),
    pagina("C", ["Sinais de pele oleosa"]),
    pagina("D", ["Como saber se minha pele é oleosa"]),
    pagina("E", ["Como reconhecer a oleosidade"]),
  ];
  const model = modeloDe(pages);
  const conceito = model.concepts[0];

  assert.equal(model.concepts.length, 1, "cinco formulações, uma necessidade");
  assert.equal(conceito.recurrence, 5, "CONCEPT_RECURRENCE = 5");
  assert.notEqual(conceito.recurrence, 1, "e não cinco tópicos isolados com recorrência 1");
  assert.equal(conceito.classification, "RECURRENT_TOPIC");
  assert.match(conceito.classificationReason, /5 de 5 páginas comparáveis/);

  /* A régua crua continua disponível e continua dizendo outra coisa — de propósito. */
  assert.equal(new Set(model.rawObservations.map(item => item.normalized)).size, 5, "cinco headings literais distintos");
});

/* ====================  D · PROCEDÊNCIA POR CONSULTA  ==================== */

const procedencia = (id: string, appearances: RadarPageProvenance["appearances"]): RadarPageProvenance => ({
  url: `https://concorrente-${id.toLowerCase()}.com.br/artigo`,
  appearances,
});

test("GATE 8 · D — o mesmo conceito achado por três consultas preserva queryCoverage = 3", () => {
  const pages = [
    pagina("A", ["Características da pele oleosa"]),
    pagina("B", ["Como identificar pele oleosa"]),
    pagina("C", ["Sinais de pele oleosa"]),
  ];
  const model = modeloDe(pages, {
    provenance: [
      procedencia("A", [{ keyword: "skincare para pele oleosa", keywordRole: "principal", sourceType: "canonical" }]),
      procedencia("B", [{ keyword: "rotina para pele oleosa", keywordRole: "secundaria", sourceType: "auxiliary" }]),
      procedencia("C", [{ keyword: "controlar oleosidade", keywordRole: "secundaria", sourceType: "auxiliary" }]),
    ],
  });

  const conceito = model.concepts[0];
  assert.equal(conceito.recurrence, 3);
  assert.equal(conceito.queryCoverage, 3, "QUERY_COVERAGE = 3");
  assert.deepEqual(conceito.queries.sort(), ["controlar oleosidade", "rotina para pele oleosa", "skincare para pele oleosa"]);
  assert.deepEqual(conceito.keywordRoles.sort(), ["principal", "secundaria"], "o papel de cada keyword é preservado");
  assert.deepEqual(conceito.origins, { canonical: 1, auxiliary: 2, formation: 0 });
  assert.equal(conceito.auxiliaryOnly, false, "a canônica também o trouxe");
});

/* ================  E · CONCEITO SÓ DA AUXILIAR NÃO SOME  ================ */

test("GATE 8 · E — conceito trazido só por uma secundária permanece no modelo e é dito como tal", () => {
  const pages = [
    pagina("A", ["Características da pele oleosa"]),
    pagina("B", ["Como identificar pele oleosa"]),
    pagina("C", ["Causas da oleosidade excessiva"]),
  ];
  const model = modeloDe(pages, {
    provenance: [
      procedencia("A", [{ keyword: "skincare para pele oleosa", keywordRole: "principal", sourceType: "canonical" }]),
      procedencia("B", [{ keyword: "skincare para pele oleosa", keywordRole: "principal", sourceType: "canonical" }]),
      procedencia("C", [{ keyword: "controlar oleosidade", keywordRole: "secundaria", sourceType: "auxiliary" }]),
    ],
  });

  const soDaAuxiliar = conceitoDe(model, "C")!;
  assert.equal(soDaAuxiliar.conceptType, "CAUSE");
  assert.equal(soDaAuxiliar.auxiliaryOnly, true, "AUXILIARY_ONLY_CONCEPT_PRESERVED");
  assert.deepEqual(soDaAuxiliar.origins, { canonical: 0, auxiliary: 1, formation: 0 });
  assert.ok(model.concepts.includes(soDaAuxiliar), "e ele continua no modelo, não é descartado");
  assert.equal(model.coverage.auxiliaryOnlyConcepts, 1);
});

/* ======================  F · AGRUPAMENTO DE PERGUNTAS  ================== */

test("GATE 8 · F — perguntas equivalentes clusterizam; a pergunta causal permanece distinta", () => {
  const pages = [
    pagina("A", ["Como saber se a pele é oleosa?"]),
    pagina("B", ["Como identificar pele oleosa?"]),
    pagina("C", ["Por que minha pele fica oleosa?"]),
  ];
  const model = modeloDe(pages);

  assert.equal(model.questionClusters.length, 2, "duas necessidades, dois clusters de pergunta");

  const identificacao = model.questionClusters.find(cluster => cluster.variants.some(item => item.includes("saber")))!;
  assert.equal(identificacao.pages, 2, "as duas formulações de identificação caem no mesmo cluster");
  assert.equal(identificacao.variants.length, 2);

  const causal = model.questionClusters.find(cluster => cluster.canonicalQuestion.startsWith("Por que"))!;
  assert.equal(causal.pages, 1);
  assert.notEqual(causal.conceptId, identificacao.conceptId, "pergunta causal é outra necessidade");

  /* Toda pergunta continua apontando para o conceito que a contém. */
  for (const cluster of model.questionClusters) {
    assert.ok(model.concepts.some(concept => concept.id === cluster.conceptId));
  }
  assert.ok(radarSemanticIsQuestion("Como saber se a pele é oleosa?"));
  assert.equal(radarSemanticIsQuestion("Características da pele oleosa"), false);
});

/* ========================  G · RELAÇÕES DE ENTIDADE  ==================== */

test("GATE 8 · G — entidade relacionada não é colapsada na entidade central", () => {
  const pages = [
    pagina("A", ["Como controlar a oleosidade"]),
    pagina("B", ["Por que a pele produz muito sebo?"]),
    pagina("C", ["Características da pele oleosa"]),
  ];
  const model = modeloDe(pages);
  const porRotulo = new Map(model.entities.map(item => [item.label, item]));

  /* "oleosidade" e "oleosa" partilham raiz: a mesma entidade escrita de dois jeitos. */
  const oleosidade = model.entities.find(item => item.stem === "oleos")!;
  assert.equal(oleosidade.relation, "same_as");
  assert.equal(oleosidade.origin, "both");

  /* "sebo" convive com o assunto sem ser o assunto. */
  const sebo = porRotulo.get("sebo")!;
  assert.ok(sebo, "sebo precisa aparecer como entidade observada");
  assert.equal(sebo.relation, "related_to", "relacionada, NÃO a mesma");
  assert.notEqual(sebo.relation, "same_as");
  assert.equal(sebo.stem !== oleosidade.stem, true, "raízes distintas continuam distintas");
  assert.equal(sebo.origin, "competitors");

  /* O verbo que nomeia a necessidade não vira entidade. */
  assert.equal(porRotulo.has("controlar"), false, "\"controlar\" descreve a necessidade, não o assunto");
});

test("GATE 8 · G — o adaptador de enriquecimento entra sem apagar a leitura determinística", () => {
  const enricher: RadarSemanticEnricher = {
    source: "fixture",
    relateEntities: () => [{ label: "sebo", relatedTo: "oleos", relation: "related_to" }],
  };
  const semAdaptador = modeloDe([pagina("A", ["Por que a pele produz muito sebo?"])]);
  const comAdaptador = modeloDe([pagina("A", ["Por que a pele produz muito sebo?"])], { enricher });

  assert.equal(semAdaptador.enrichment.applied, false);
  assert.equal(comAdaptador.enrichment.applied, true);
  assert.equal(comAdaptador.enrichment.source, "fixture");
  /* Os conceitos são os mesmos: o adaptador enriquece relação, não reescreve evidência. */
  assert.deepEqual(
    comAdaptador.concepts.map(item => item.canonicalLabel),
    semAdaptador.concepts.map(item => item.canonicalLabel),
  );
  assert.ok(semAdaptador.limitations.some(item => /adaptador de enriquecimento/.test(item)),
    "sem adaptador, a limitação é declarada em vez de a relação ser inventada");
});

/* =========================  H · RUÍDO DE PÁGINA  ======================== */

test("GATE 8 · H — navegação editorial não vira conceito nem lacuna", () => {
  const pages = [
    pagina("A", ["Características da pele oleosa", "Veja também", "Conclusão"]),
    pagina("B", ["Como identificar pele oleosa", "Compartilhe", "Leia mais"]),
    pagina("C", ["Sinais de pele oleosa", "Sobre o autor", "Referências"]),
  ];
  const model = modeloDe(pages);

  assert.equal(model.concepts.length, 1, "só o assunto editorial sobrevive ao agrupamento");
  for (const ruido of ["Veja também", "Conclusão", "Compartilhe", "Leia mais", "Sobre o autor", "Referências"]) {
    assert.ok(radarSemanticIsNoise(ruido).noise, `"${ruido}" precisa ser lido como ruído`);
    assert.equal(
      model.concepts.some(concept => concept.variants.includes(ruido)), false,
      `"${ruido}" não pode virar conceito`,
    );
  }
  assert.equal(model.coverage.noiseFiltered, 6, "seis blocos de navegação filtrados");

  /* Mas o ruído continua RASTREÁVEL: filtrado não é apagado. */
  const conclusao = model.rawObservations.find(item => item.text === "Conclusão")!;
  assert.equal(conclusao.noise, true);
  assert.match(conclusao.noiseReason || "", /navega(ç|c)(ã|a)o editorial/);
});

/* ==============  I · LACUNA SÓ DEPOIS DO AGRUPAMENTO  ================== */

const contexto = (editorialTopics: string[]): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [],
  editorialTopics,
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

test("GATE 8 · I — o assunto que o mercado cobre em quatro formulações é UM confirmado, não quatro lacunas", () => {
  const model = buildRadarCompetitiveModel({
    pages: PELE_OLEOSA,
    query: "skincare para pele oleosa",
    principal: "skincare para pele oleosa",
    editorialTopics: ["identificação da pele oleosa"],
    keywordTexts: ARTIGO.keywordTexts,
    centralEntities: ARTIGO.centralEntities,
  });
  const comparison = buildRadarEditorialComparison({ context: contexto(["identificação da pele oleosa"]), model });

  const linhasDeTopico = comparison.rows.filter(row => row.dimension === "topic");
  const confirmados = linhasDeTopico.filter(row => row.status === "CONFIRMED");

  assert.equal(confirmados.length, 1, "um assunto declarado, uma linha");
  assert.match(confirmados[0].evidence, /4 de 7 página\(s\) comparável\(is\)/, "com a recorrência do CONCEITO");
  assert.match(confirmados[0].evidence, /sob 4 formulações diferentes/);
  assert.equal(confirmados[0].sources.length, 4, "e as quatro páginas rastreáveis");

  /* Nenhuma das quatro formulações vira lacuna independente. */
  for (const texto of ["Como identificar a pele oleosa?", "Sinais de uma pele oleosa", "Como saber se a pele é oleosa?"]) {
    assert.equal(linhasDeTopico.some(row => row.status === "GAP" && row.subject === texto), false, `"${texto}" não pode ser lacuna`);
  }
});

test("GATE 8 · I — o que o mercado cobre e o artigo não declara continua saindo como lacuna", () => {
  const model = buildRadarCompetitiveModel({
    pages: PELE_OLEOSA,
    query: "skincare para pele oleosa",
    principal: "skincare para pele oleosa",
    editorialTopics: ["identificação da pele oleosa"],
    keywordTexts: ARTIGO.keywordTexts,
    centralEntities: ARTIGO.centralEntities,
  });
  const comparison = buildRadarEditorialComparison({ context: contexto(["identificação da pele oleosa"]), model });
  const lacunas = comparison.rows.filter(row => row.status === "GAP");

  assert.ok(lacunas.length >= 1, "causas continua sendo lacuna: a amostra cobre, o ArticleDNA não declara");
  assert.ok(lacunas.every(row => row.sources.length > 0), "toda lacuna carrega a página que a sustenta");
  assert.ok(lacunas.some(row => /Causas|sebo/i.test(row.subject)));
});

/* ====================  J · PROCEDÊNCIA DA EVIDÊNCIA  =================== */

test("GATE 8 · J — todo conceito responde \"de onde isso veio?\" sem sair da estrutura", () => {
  const model = modeloDe(PELE_OLEOSA, {
    provenance: PELE_OLEOSA.map((page, index) => ({
      url: page.url,
      appearances: [{ keyword: index < 4 ? "skincare para pele oleosa" : "controlar oleosidade", keywordRole: index < 4 ? "principal" : "secundaria", sourceType: index < 4 ? "canonical" as const : "auxiliary" as const }],
    })),
  });

  for (const concept of model.concepts) {
    assert.ok(concept.supportingObservations.length > 0, "nenhuma conclusão sem observação que a sustente");
    assert.equal(concept.sourceUrls.length > 0, true);
    assert.equal(concept.sourceCount, new Set(concept.supportingObservations.map(item => item.pageId)).size);
    for (const observation of concept.supportingObservations) {
      assert.ok(observation.text.length > 0, "o texto ORIGINAL do heading");
      assert.ok(observation.pageId.startsWith("page:"));
      assert.ok(observation.url.startsWith("https://"));
      assert.ok([2, 3].includes(observation.level), "o nível do heading");
      assert.ok(observation.position >= 0 && observation.position <= 1, "e a posição no documento");
    }
    assert.ok(concept.classificationReason.length > 10, "a classe vem com motivo legível");
    assert.ok(concept.confidenceReason.length > 10, "e a confiança também");
  }
});

test("GATE 8 · J — a confiança sai de sinais observáveis, sem precisão falsa", () => {
  const model = modeloDe(PELE_OLEOSA, {
    provenance: PELE_OLEOSA.map((page, index) => ({
      url: page.url,
      appearances: [{ keyword: index < 4 ? "principal" : "secundaria", keywordRole: "principal", sourceType: "canonical" as const }],
    })),
  });

  const identificacao = conceitoDe(model, "A")!;
  const produtos = conceitoDe(model, "G")!;

  assert.equal(identificacao.confidence, "HIGH", "4 de 7 páginas, 2 consultas, ancorado, 4 formulações");
  assert.ok(["LOW", "MEDIUM"].includes(produtos.confidence), "uma página só não sustenta confiança alta");
  for (const concept of model.concepts) {
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(concept.confidence));
    assert.equal(/\d+[.,]\d{2}\s*%/.test(concept.confidenceReason), false, "nada de 87,43% de confiança");
  }
});

/* ==================  K · NADA A MONTANTE É ESCRITO  ==================== */

test("GATE 8 · K — a camada semântica não escreve em nada a montante", () => {
  const fonte = readFileSync("lib/radar/semantic-concept-model.ts", "utf8");

  for (const proibido of ["fetch(", "supabase", "Repository", "createClient", "process.env", "await "]) {
    assert.equal(fonte.includes(proibido), false, `${proibido} não pode existir num módulo de domínio puro`);
  }

  /* E a entrada é lida sem ser mutada: as páginas voltam idênticas. */
  const pages = PELE_OLEOSA.map(page => ({ ...page }));
  const antes = JSON.stringify(pages);
  buildRadarSemanticConceptModel({ pages, ...ARTIGO });
  assert.equal(JSON.stringify(pages), antes, "ARTICLE_UPSTREAM_MUTATED = NO");

  /* Nenhuma importação de Minerador, Arquiteto ou Planejador. */
  assert.equal(/from "\.\.\/(minerador|arquiteto|planejador)/.test(fonte), false, "o Radar não alcança os módulos vizinhos");
});

/* =============  L · NENHUMA CHAMADA SEM AÇÃO DO USUÁRIO  =============== */

test("GATE 8 · L — o enriquecimento é adaptador, não integração: nada chama provider sozinho", () => {
  const fonte = readFileSync("lib/radar/semantic-concept-model.ts", "utf8");

  /* O contrato do adaptador é síncrono e recebido por parâmetro. */
  assert.match(fonte, /export type RadarSemanticEnricher = \{/);
  assert.match(fonte, /relateEntities: \(input: \{ entities: readonly string\[\]; scope: readonly string\[\] \}\)/);
  assert.equal(/import .*(provider|deepseek|openai|dataforseo)/i.test(fonte), false, "nenhuma integração externa nasceu neste gate");

  /* Sem adaptador o modelo é inteiro — e é assim que a suíte roda. */
  const model = modeloDe(PELE_OLEOSA);
  assert.equal(model.enrichment.applied, false);
  assert.equal(model.concepts.length, 3, "PROVIDER_CALLS = 0 e a leitura continua completa");

  /* E o modelo competitivo só é montado quando a análise é acionada pela pessoa. */
  const panel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(panel, /suficiencia\.canBuildCompetitiveModel && analysis\?\.payload\.extractions\.length/,
    "sem extração acionada pelo USER não há modelo — e sem modelo não há camada semântica");
});

/* ==============  M · A EVIDÊNCIA BRUTA CONTINUA INTEIRA  =============== */

test("GATE 8 · M — o agrupamento é camada SOBRE a evidência, nunca substituição dela", () => {
  const model = buildRadarCompetitiveModel({
    pages: PELE_OLEOSA,
    query: "skincare para pele oleosa",
    principal: "skincare para pele oleosa",
    keywordTexts: ARTIGO.keywordTexts,
    centralEntities: ARTIGO.centralEntities,
  });

  /* As leituras cruas por heading literal continuam ali, e continuam cruas. */
  assert.equal(model.classifiedTopics.length, 7, "os sete headings literais permanecem classificados um a um");
  assert.ok(model.semantic, "e a camada conceitual existe ao lado deles");
  assert.equal(model.semantic!.concepts.length, 3);
  assert.equal(model.semantic!.rawObservations.length, 7, "as sete observações originais permanecem");

  /* Cada observação guarda o texto exatamente como a página o escreveu. */
  const textos = model.semantic!.rawObservations.map(item => item.text).sort();
  assert.deepEqual(textos, PELE_OLEOSA.map(page => page.h2[0]).sort());

  /* Normalizar é para comparar; o original nunca é sobrescrito por ela. */
  const comAcento = model.semantic!.rawObservations.find(item => item.text.includes("Características"))!;
  assert.equal(comAcento.text, "Características da pele oleosa");
  assert.equal(comAcento.normalized, "caracteristicas da pele oleosa");
  assert.notEqual(comAcento.text, comAcento.normalized);
});

/* ==========  N · O MODELO COMPETITIVO CONSOME A CAMADA  =============== */

test("GATE 8 · N — a lacuna do modelo nasce do conceito, não do heading cru", () => {
  const model = buildRadarCompetitiveModel({
    pages: PELE_OLEOSA,
    query: "skincare para pele oleosa",
    principal: "skincare para pele oleosa",
    keywordTexts: ARTIGO.keywordTexts,
    centralEntities: ARTIGO.centralEntities,
  });

  const semanticas = model.gaps.filter(gap => gap.kind === "semantic");
  assert.ok(semanticas.length > 0, "há lacuna semântica nesta amostra");
  const rotulos = new Set(model.semantic!.concepts.map(concept => concept.canonicalLabel));
  for (const gap of semanticas) {
    const rotulo = gap.description.replace(/^"/, "").replace(/" — .*$/, "");
    assert.ok(rotulos.has(rotulo), `a lacuna "${rotulo}" precisa ser um conceito, não um heading solto`);
  }
  assert.ok(semanticas.length <= 3, "no máximo tantas lacunas quanto conceitos — não uma por formulação");

  const fonte = readFileSync("lib/radar/competitive-model.ts", "utf8");
  const corpo = fonte.slice(fonte.indexOf("const gaps: RadarCompetitiveModel[\"gaps\"] = []"), fonte.indexOf("/* -------------------------- oportunidades"));
  assert.match(corpo, /radarConceptsOfClass\(semantic, "COMPETITIVE_GAP"\)/, "o conceito tem precedência");
  assert.ok(corpo.indexOf("radarConceptsOfClass") < corpo.indexOf("radarTopicsOfClass"), "e a leitura crua é o fallback, não o caminho");
});

test("GATE 8 · N — a camada sobrevive ao reload: o schema aceita o que o construtor produz", () => {
  const model = buildRadarCompetitiveModel({
    pages: PELE_OLEOSA,
    query: "skincare para pele oleosa",
    keywordTexts: ARTIGO.keywordTexts,
    centralEntities: ARTIGO.centralEntities,
    provenance: [procedencia("A", [{ keyword: "skincare para pele oleosa", keywordRole: "principal", sourceType: "canonical" }])],
  });

  const gravado = RadarCompetitiveModelSchema.parse(JSON.parse(JSON.stringify(model)));
  assert.equal(gravado.semantic?.concepts.length, 3, "os conceitos voltam do dado gravado");
  assert.equal(gravado.semantic?.rawObservations.length, 7, "e a evidência bruta junto");

  /* Relatório gravado antes deste corte continua parseando — com ausência declarada. */
  const legado = JSON.parse(JSON.stringify(model)) as Record<string, unknown>;
  delete legado.semantic;
  assert.equal(RadarCompetitiveModelSchema.parse(legado).semantic, null, "campo aditivo, nunca conceito inventado");

  /* E a camada tem contrato próprio, verificável isoladamente. */
  assert.equal(RadarSemanticConceptModelSchema.parse(JSON.parse(JSON.stringify(model.semantic))).concepts.length, 3);
});

/* ============  8 · ENTIDADE: LEITURA MELHOR SEM QUEBRAR O GATE 5  ====== */

test("GATE 8 · entidade — ausência de string deixou de ser incompatibilidade", () => {
  const escopo = buildRadarSemanticScope({ centralEntities: ["pele oleosa"], keywordTexts: ["skincare para pele oleosa", "rotina para controlar oleosidade"] });

  /* Flexão e derivação deixaram de barrar: era isto que o literal perdia. */
  assert.equal(radarSemanticEntityReading({ text: "Cuidados com peles oleosas", scope: escopo }), "compatible");
  assert.equal(radarSemanticEntityReading({ text: "Como controlar a oleosidade", scope: escopo }), "compatible");
  assert.equal(radarSemanticEntityReading({ text: "rotina noturna para pele oleosa", scope: escopo }), "compatible");

  /* Sem evidência positiva de outro assunto, a resposta é "não sei" — nunca veto. */
  assert.equal(radarSemanticEntityReading({ text: "Protetor solar para cachorro", scope: escopo }), "unknown");
  assert.equal(radarSemanticEntityReading({ text: "Protetor solar para cachorro", scope: escopo, divergenceEvidence: true }), "divergent");

  /* Sem escopo declarado a resposta é "não deu para observar" — nunca um veto. */
  const semEscopo = buildRadarSemanticScope({});
  assert.equal(semEscopo.source, "empty");
  assert.equal(radarSemanticEntityReading({ text: "qualquer coisa", scope: semEscopo }), "unknown");

  /* A raiz é conservadora de propósito: sebo e sebáceas NÃO são a mesma entidade. */
  assert.equal(radarSemanticStem("oleosa"), radarSemanticStem("oleosidade"));
  assert.notEqual(radarSemanticStem("sebo"), radarSemanticStem("sebaceas"));
});

test("GATE 8 · o tipo de necessidade é legível e o termo que o produziu fica registrado", () => {
  assert.deepEqual(radarSemanticType("Causas da pele oleosa"), { type: "CAUSE", faceted: true, term: "causas" });
  assert.deepEqual(radarSemanticType("Como identificar pele oleosa"), { type: "ATTRIBUTE", faceted: true, term: "identificar" });
  assert.deepEqual(radarSemanticType("Melhores sabonetes"), { type: "PRODUCT", faceted: true, term: "melhores" });
  assert.deepEqual(radarSemanticType("Protetor solar para pele oleosa"), { type: "TOPIC", faceted: false, term: null });
  assert.equal(radarSemanticType("O que é pele oleosa").type, "ENTITY");
  assert.equal(radarSemanticType("Riscos de ressecar a pele").type, "PROBLEM");
  assert.equal(radarSemanticType("Benefícios do ácido salicílico").type, "BENEFIT");
});
