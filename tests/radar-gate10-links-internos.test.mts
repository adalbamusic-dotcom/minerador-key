import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildRadarInternalLinkResearch, radarConceptSupportsLinkRelation,
} from "../lib/radar/link-and-source-research.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel, radarObservedNarrative } from "../lib/radar/competitive-observed-model.ts";
import type { RadarArticleResearchContext, RadarResearchInternalLinks } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * ============  GATE 10 · PESQUISA E CONTEXTO DE LINKS INTERNOS  =========
 *
 * O Arquiteto já decidiu quem se liga a quem, sob quais conceitos de âncora.
 * Isso é fato da arquitetura. O que faltava era o Radar LER esse grafo e
 * cruzá-lo com o que a amostra competitiva mostrou — sem tocar nele, e sem
 * atravessar a fronteira que separa observar de decidir.
 *
 * A régua deste gate: o Radar diz "o mercado cobre este assunto e a sua
 * arquitetura já relaciona esta página". Ele nunca diz "use esta âncora duas
 * vezes no H2 4". Quantidade, repetição, texto final, seção e posição são do
 * Planejador — há teste varrendo o módulo por cada um desses campos.
 *
 * Nenhum teste chama rede, provider ou storage.
 */

/* ============================ o grafo aprovado ========================== */

const GRAFO_ID = "graph-1";
const GRAFO_VERSAO = "graph-v4";
const GRAFO_HASH = `sha256:${"b".repeat(64)}`;

const aresta = (
  outra: string,
  relationType: string,
  direction: "inbound" | "outbound",
  anchorConcepts: string[],
  reason: string,
  priority = "MEDIUM",
) => ({
  sourceNodeId: direction === "outbound" ? "article:este" : outra,
  targetNodeId: direction === "outbound" ? outra : "article:este",
  relationType, anchorConcepts, reason, priority, direction,
});

/**
 * O grafo do Article "skincare para pele oleosa": dez páginas relacionadas,
 * cinco relações de saída, cinco de entrada, uma SiloPage, dezesseis conceitos
 * de âncora.
 */
const GRAFO: RadarResearchInternalLinks = {
  graphId: GRAFO_ID, graphVersionId: GRAFO_VERSAO, graphContentHash: GRAFO_HASH,
  edges: [
    aresta("silo-page:skincare", "ARTICLE_TO_SILO_PAGE", "outbound", ["skincare"], "O artigo devolve à raiz do silo", "HIGH"),
    aresta("silo-page:skincare", "SILO_PAGE_TO_ARTICLE", "inbound", ["skincare para pele oleosa"], "A raiz abre pelo artigo", "HIGH"),
    aresta("article:noturno", "PILLAR_TO_SUPPORT", "outbound", ["rotina noturna", "skincare noturno"], "Pilar aponta o suporte de rotina noturna"),
    aresta("article:noturno", "SUPPORT_TO_PILLAR", "inbound", ["pele oleosa"], "O suporte devolve ao pilar"),
    aresta("article:mascara", "PILLAR_TO_SUPPORT", "outbound", ["máscara facial", "máscara de argila"], "Pilar aponta o suporte de máscara"),
    aresta("article:acne", "PILLAR_TO_SUPPORT", "outbound", ["acne"], "Pilar aponta o suporte de acne"),
    aresta("article:esfoliacao", "PILLAR_TO_SUPPORT", "outbound", ["esfoliação facial"], "Pilar aponta o suporte de esfoliação"),
    aresta("article:protetor", "SUPPORT_TO_PILLAR", "inbound", ["protetor solar"], "Suporte de protetor devolve ao pilar"),
    aresta("article:hidratacao", "SUPPORT_TO_PILLAR", "inbound", ["hidratação facial"], "Suporte de hidratação devolve ao pilar"),
    aresta("article:causas", "SUPPORT_TO_PILLAR", "inbound", ["causas da oleosidade", "controle de oleosidade"], "Suporte de causas devolve ao pilar"),
    aresta("article:tonico", "SUPPORT_TO_SUPPORT", "outbound", ["tônico adstringente"], "Malha entre suportes"),
    aresta("article:sabonete", "SUPPORT_TO_SUPPORT", "inbound", ["sabonete facial", "limpeza facial"], "Malha entre suportes"),
  ],
};

const contexto = (grafo: RadarResearchInternalLinks | null = GRAFO): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "brand-1", articleId: "article-1",
    articleDnaVersionId: "dna-v7", articleDnaContentHash: `sha256:${"a".repeat(64)}`,
    promise: null, mainIntent: "informacional", hierarchy: "Pilar",
  },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { intent: "informacional" }, normalizedIntent: "informacional" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "controle de oleosidade"],
  silo: {
    siloId: "silo-1", siloName: "Skincare", siloDnaVersionId: "silo-v2", siloDnaContentHash: null,
    siloPageId: "silo-page:skincare", siloPageSlug: "/skincare", siloPageCanonical: "https://marca.com.br/skincare",
    siloPagePublicationStatus: "published", articleRole: "pillar", hierarchy: "Pilar",
  },
  formationSerp: null,
  internalLinks: grafo,
  limitations: [],
} as unknown as RadarArticleResearchContext);

/* =========================== a amostra competitiva ====================== */

const pagina = (id: string, headings: string[], internos: number, externos = 2): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [],
  wordCount: 1400, internalLinkCount: internos, externalLinkCount: externos,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 3, italicCount: 0,
  paragraphCount: 11, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Abertura.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
});

const IDENTIFICACAO = ["Como identificar a pele oleosa?", "Características da pele oleosa", "Sinais de uma pele oleosa", "Como saber se a pele é oleosa?"];
const NOTURNO = ["Como montar uma rotina noturna", "Cuidados noturnos com a pele", "Rotina noturna para pele oleosa"];
const MASCARA = ["Como usar máscara facial de argila", "Máscara facial na rotina"];

/** 14 comparáveis: identificação em todas, rotina noturna e máscara em partes. */
const PAGINAS: RadarExtractionPage[] = Array.from({ length: 14 }, (_, index) => pagina(
  String.fromCharCode(65 + index),
  index < 5
    ? [IDENTIFICACAO[index % IDENTIFICACAO.length], NOTURNO[index % NOTURNO.length]]
    : index < 9
      ? [IDENTIFICACAO[index % IDENTIFICACAO.length], MASCARA[index % MASCARA.length]]
      : [IDENTIFICACAO[index % IDENTIFICACAO.length]],
  index < 9 ? index + 1 : 0,
));

/** A que só a secundária trouxe — ela também conta para os padrões. */
const SO_DA_AUXILIAR = pagina("S", ["Sinais de uma pele oleosa"], 12);

const TODAS = [...PAGINAS, SO_DA_AUXILIAR];

const semantico = (pages = TODAS) => buildRadarSemanticConceptModel({
  pages,
  centralEntities: ["pele oleosa"],
  keywordTexts: ["skincare para pele oleosa", "controle de oleosidade"],
});

const pesquisa = (extra: Partial<Parameters<typeof buildRadarInternalLinkResearch>[0]> = {}) =>
  buildRadarInternalLinkResearch({ context: contexto(), pages: TODAS, semantic: semantico(), ...extra });

/* =====================  A e B · O QUE VEM DE CIMA FICA  ================= */

test("GATE 10 · A — as dez páginas relacionadas do grafo permanecem na projeção", () => {
  const pesquisado = pesquisa();

  assert.equal(pesquisado.relatedInternalPages.length, 10, "dez nós distintos, ainda que doze arestas");
  assert.equal(pesquisado.graphVersionId, GRAFO_VERSAO, "com a versão do grafo que as originou");
  assert.equal(pesquisado.graphContentHash, GRAFO_HASH);
  for (const pagina of pesquisado.relatedInternalPages) {
    assert.equal(pagina.provenance.graphVersionId, GRAFO_VERSAO, "cada relação responde de onde veio");
    assert.ok(pagina.relations.length > 0, "e carrega as arestas que a sustentam");
    assert.ok(pagina.reasons.every(motivo => motivo.length > 5), "com o motivo que o Arquiteto registrou");
  }
});

test("GATE 10 · B — entrada e saída não se misturam, e quem faz as duas vira BOTH", () => {
  const pesquisado = pesquisa();

  assert.equal(pesquisado.outboundCount, 6, "seis relações de saída");
  assert.equal(pesquisado.inboundCount, 6, "seis de entrada");

  const noturno = pesquisado.relatedInternalPages.find(item => item.nodeId === "article:noturno")!;
  assert.equal(noturno.direction, "BOTH", "o artigo aponta E recebe deste suporte");
  assert.equal(noturno.incoming, 1);
  assert.equal(noturno.outgoing, 1);

  const mascara = pesquisado.relatedInternalPages.find(item => item.nodeId === "article:mascara")!;
  assert.equal(mascara.direction, "OUTGOING");
  const protetor = pesquisado.relatedInternalPages.find(item => item.nodeId === "article:protetor")!;
  assert.equal(protetor.direction, "INCOMING");

  /* Nada de condensar tudo em "10 páginas relacionadas". */
  assert.notEqual(pesquisado.outboundCount + pesquisado.inboundCount, pesquisado.relatedInternalPages.length);
});

/* ===================  C · A SILOPAGE NÃO É SUPORTE COMUM  ============== */

test("GATE 10 · C — a SiloPage permanece distinguível, com endereço próprio", () => {
  const pesquisado = pesquisa();

  const raiz = pesquisado.siloPage!;
  assert.ok(raiz, "a SiloPage é alcançável por nome próprio no modelo");
  assert.equal(raiz.role, "SILOPAGE");
  assert.equal(raiz.slug, "/skincare", "o endereço da raiz o contexto conhece");
  assert.equal(raiz.direction, "BOTH", "o artigo devolve à raiz e a raiz abre pelo artigo");

  const suportes = pesquisado.relatedInternalPages.filter(item => item.role === "SUPORTE");
  assert.ok(suportes.length > 0);
  assert.equal(suportes.some(item => item.role === "SILOPAGE"), false, "SiloPage não é lida como suporte");

  /* O papel da outra ponta sai do vocabulário do grafo, não de palpite. */
  const pilar = pesquisado.relatedInternalPages.find(item => item.nodeId === "article:causas")!;
  assert.equal(pilar.role, "SUPORTE", "SUPPORT_TO_PILLAR recebido: a outra ponta é o suporte");
});

/* ==========  D · ANCHOR CONCEPT É CONCEITO, NÃO TEXTO FINAL  =========== */

test("GATE 10 · D — os conceitos de âncora sobrevivem como conceito", () => {
  const pesquisado = pesquisa();

  assert.equal(pesquisado.anchorConcepts.length, 16, "dezesseis conceitos disponíveis");
  for (const esperado of ["rotina noturna", "máscara facial", "controle de oleosidade", "protetor solar", "skincare"]) {
    assert.ok(pesquisado.anchorConcepts.includes(esperado), `${esperado} precisa continuar disponível`);
  }

  const serializado = JSON.stringify(pesquisado);
  for (const proibido of ["finalAnchor", "anchorText", "finalAnchorText"]) {
    assert.equal(serializado.includes(proibido), false, `FINAL_ANCHOR_EMITTED = NO — ${proibido}`);
  }
});

/* ============  E, F e G · O MERCADO ENCONTRA A ARQUITETURA  ============ */

test("GATE 10 · E — conceito recorrente do mercado encontra a página do grafo", () => {
  const pesquisado = pesquisa();

  const noturno = pesquisado.conceptAlignments.find(item => item.nodeId === "article:noturno");
  assert.ok(noturno, "\"rotina noturna\" do mercado encontra o suporte de rotina noturna");
  assert.equal(noturno!.relationship, "SUPPORTED_BY_GRAPH");
  assert.ok(noturno!.matchedAnchorConcepts.length > 0, "com o conceito de âncora que casou");
  assert.ok(noturno!.sourcePages.length > 0, "e as páginas da amostra que o sustentam");
  assert.ok(noturno!.sourcePages.every(item => item.heading.length > 0), "com o heading ORIGINAL");
  assert.ok(noturno!.evidence.includes("página(s) da amostra"));

  /* Nenhum alinhamento decide âncora, quantidade ou posição. */
  assert.equal(Object.keys(noturno!).some(campo => /final|repeat|insert|count$/i.test(campo)), false);
});

test("GATE 10 · F — o encontro não exige formulação idêntica", () => {
  const pesquisado = pesquisa();

  /*
   * O conceito do mercado é "Como identificar a pele oleosa?"; o conceito de
   * âncora aprovado é "pele oleosa". Nenhum dos dois escreve o outro, e os
   * dois falam do mesmo assunto.
   */
  const porRaiz = pesquisado.conceptAlignments.filter(item => item.matchKind === "SEMANTICALLY_RELATED");
  const porPalavra = pesquisado.conceptAlignments.filter(item => item.matchKind === "LEXICAL");
  assert.ok(porRaiz.length + porPalavra.length === pesquisado.conceptAlignments.length);
  assert.ok(porRaiz.length > 0, "há alinhamento que só existe por proximidade de raiz");

  /* E a relação mais fraca é declarada como mais fraca. */
  assert.ok(porRaiz.every(item => item.confidence === "LOW"), "proximidade não vale o mesmo que formulação");
});

test("GATE 10 · G — proximidade não colapsa entidades diferentes", () => {
  const modelo = semantico();
  const sebo = modelo.entities.find(item => item.label === "sebo");
  const alinhamentos = pesquisa().conceptAlignments;

  if (sebo) {
    assert.notEqual(sebo.relation, "same_as", "relacionada não é a mesma");
  }
  /* O alinhamento registra a ponte sem fundir os dois lados. */
  for (const item of alinhamentos.filter(entrada => entrada.matchKind === "SEMANTICALLY_RELATED")) {
    assert.notEqual(item.conceptLabel, item.matchedAnchorConcepts[0], "conceito e âncora continuam textos distintos");
  }
});

/* ==============  H e I · PADRÕES DOS CONCORRENTES  ==================== */

test("GATE 10 · H — todo padrão competitivo carrega quem o sustenta", () => {
  const pesquisado = pesquisa();

  assert.ok(pesquisado.competitorPatterns.length > 0);
  for (const padrao of pesquisado.competitorPatterns) {
    assert.ok(padrao.observation.length > 10);
    assert.equal(padrao.sourceCount, padrao.competitors.length, "a contagem é a lista");
    assert.ok(padrao.competitors.every(item => item.url.startsWith("https://")), "com a URL de cada concorrente");
    assert.ok(padrao.provenance.includes("extração"), "e de onde a observação saiu");
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(padrao.confidence));
  }

  const usam = pesquisado.competitorPatterns.find(item => item.key === "USES_CONTEXTUAL_INTERNAL_LINKS")!;
  assert.equal(usam.sourceCount, 10, "dez das quinze usam links internos");
  assert.equal(usam.sampleSize, 15);
  const nenhum = pesquisado.competitorPatterns.find(item => item.key === "NO_INTERNAL_LINKS_OBSERVED")!;
  assert.equal(nenhum.sourceCount, 5);

  /* A extração guarda contagem, não destino — e isso é dito, não escondido. */
  assert.ok(pesquisado.limitations.some(item => /apenas a CONTAGEM/.test(item)));
  assert.equal(JSON.stringify(pesquisado).includes("destination"), false, "nenhum destino inventado");
});

test("GATE 10 · I — a página vinda só da auxiliar também sustenta padrão", () => {
  const pesquisado = pesquisa();
  const usam = pesquisado.competitorPatterns.find(item => item.key === "USES_CONTEXTUAL_INTERNAL_LINKS")!;

  assert.ok(usam.competitors.some(item => item.url === SO_DA_AUXILIAR.url),
    "AUXILIARY_COMPETITORS_INCLUDED — descoberta multi-query não é cidadã de segunda");
  assert.equal(usam.competitors.find(item => item.url === SO_DA_AUXILIAR.url)!.internalLinks, 12);
});

/* ==========  J e K · OS DOIS LADOS DA FALTA DE ENCONTRO  ============== */

test("GATE 10 · J — relação aprovada sem eco no mercado permanece, com o fato dito", () => {
  const pesquisado = pesquisa();

  const semSinal = pesquisado.graphRelationsWithLowMarketSignal;
  assert.ok(semSinal.length > 0, "há relações que a amostra não confirma");
  assert.ok(semSinal.some(item => item.nodeId === "article:esfoliacao"), "esfoliação não aparece na amostra");

  /* Permanecer é o ponto: quem aprovou foi o Arquiteto. */
  for (const item of semSinal) {
    assert.ok(pesquisado.relatedInternalPages.some(pagina => pagina.nodeId === item.nodeId), "continua entre as relacionadas");
    assert.match(item.evidence, /permanece|Arquiteto|não houve como confrontar/);
    assert.ok(item.anchorConcepts.length > 0, "com os conceitos de âncora preservados");
  }
  assert.equal(JSON.stringify(pesquisado).includes("removeLink"), false);
});

test("GATE 10 · K — assunto do mercado sem relação aprovada é observação, não ordem", () => {
  const pesquisado = pesquisa();

  const sem = pesquisado.conceptsWithoutGraphRelation;
  for (const item of sem) {
    assert.ok(item.pages >= 2, "só entra quem tem evidência");
    assert.match(item.evidence, /Observação para o Arquiteto, não instrução de criar página/);
    assert.equal(/criar artigo|criar página nova|crie /i.test(item.evidence.replace("não instrução de criar página", "")), false);
  }
  assert.equal(JSON.stringify(sem).includes("createArticle"), false);
});

/* ================  L · RUÍDO NÃO CRIA RELAÇÃO NENHUMA  ================ */

test("GATE 10 · L — conceito de baixa evidência não cria alinhamento nem lacuna de link", () => {
  /* Uma página só, com um assunto que ninguém repete. */
  const comRuido = [...TODAS, pagina("Z", ["Curiosidades sobre a rotina noturna dos astronautas"], 3)];
  const modelo = semantico(comRuido);
  const pesquisado = buildRadarInternalLinkResearch({ context: contexto(), pages: comRuido, semantic: modelo });

  const solitario = modelo.concepts.find(item => item.canonicalLabel.includes("astronautas"));
  if (solitario) {
    assert.equal(radarConceptSupportsLinkRelation(solitario), false, "uma página e confiança baixa não sustentam relação");
    assert.equal(pesquisado.conceptAlignments.some(item => item.conceptId === solitario.id), false);
    assert.equal(pesquisado.conceptsWithoutGraphRelation.some(item => item.conceptId === solitario.id), false);
  }

  /* A regra é por sinal observável, não por lista de palavras. */
  assert.equal(radarConceptSupportsLinkRelation({ sourceCount: 1, confidence: "HIGH" }), false);
  assert.equal(radarConceptSupportsLinkRelation({ sourceCount: 5, confidence: "LOW" }), false);
  assert.equal(radarConceptSupportsLinkRelation({ sourceCount: 2, confidence: "MEDIUM" }), true);

  const fonte = readFileSync("lib/radar/link-and-source-research.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const termo of ["excessiva", "diarios", "diários", "oleosidade", "sebo"]) {
    assert.equal(new RegExp(termo, "i").test(codigo), false, `"${termo}" não pode estar hardcoded`);
  }
});

/* ===========  M · NENHUM CAMPO DO PLANEJADOR É EMITIDO  =============== */

test("GATE 10 · M — este módulo é fundamento e observação; a aplicação mora em outro lugar", () => {
  /*
   * REVOGADO E SUBSTITUÍDO NO GATE 10.1.
   *
   * Este teste guardava "o Radar organiza links; ele não os decide". A regra
   * estava errada: decidir quantidade, contexto e âncora exige a evidência
   * competitiva, e quem a tem é o Radar. O que a proteção passou a guardar é a
   * SEPARAÇÃO — fundamento aqui, aplicação em `internal-link-plan.ts` — para
   * que a leitura do grafo nunca dependa de julgamento.
   */
  const fonte = readFileSync("lib/radar/link-and-source-research.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const daAplicacao of ["recommendedOccurrences", "recommendedAnchor", "anchorVariants", "preferredContexts", "applicationConfidence"]) {
    assert.equal(codigo.includes(daAplicacao), false, `${daAplicacao} é do plano, não do fundamento`);
  }

  const serializado = JSON.stringify(pesquisa());
  for (const daAplicacao of ["recommendedOccurrences", "recommendedAnchor", "anchorVariants"]) {
    assert.equal(serializado.includes(daAplicacao), false, "o fundamento não carrega decisão de aplicação");
  }

  /* O que continua proibido em toda parte: reescrever a arquitetura. */
  for (const proibido of ["createRelation", "approveRelation", "writeGraph", "updateGraph", "mutateGraph"]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} reescreveria a decisão do Arquiteto`);
  }

  const pesquisado = pesquisa();
  assert.ok(pesquisado.competitorInternalLinkPattern.median !== null, "a mediana observada existe");
  assert.equal(/use\s+\d+|utilize\s+\d+|insira\s+\d+/i.test(pesquisado.competitorPatterns.map(item => item.observation).join(" ")), false,
    "observação do mercado é observação, mesmo agora que o plano existe");
});

/* =========  N e Q · UPSTREAM INTACTO, NENHUMA CHAMADA EXTERNA  ======== */

test("GATE 10 · N — o grafo entra como leitura e volta byte a byte idêntico", () => {
  const antes = contexto();
  const copia = JSON.stringify(antes);
  buildRadarInternalLinkResearch({ context: antes, pages: TODAS, semantic: semantico() });
  assert.equal(JSON.stringify(antes), copia, "GRAPH_MUTATED = NO");

  /* E as arestas devolvidas são cópias: mexer na projeção não mexe no grafo. */
  const pesquisado = pesquisa();
  pesquisado.relatedInternalPages[0].anchorConcepts.push("contaminação");
  assert.equal(GRAFO.edges[0].anchorConcepts.includes("contaminação"), false);
});

test("GATE 10 · Q — o módulo é domínio puro e não conhece transporte", () => {
  const fonte = readFileSync("lib/radar/link-and-source-research.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const proibido of ["fetch(", "supabase", "Repository", "createClient", "process.env", "async "]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir aqui`);
  }
  assert.equal(/from "\.\.\/(minerador|arquiteto|planejador)/.test(codigo), false,
    "o Radar lê o grafo pelo contexto resolvido, não indo ao Arquiteto");
});

/* ======  O e P · O MODELO OBSERVADO E A PROJEÇÃO HUMANA  ============= */

function observado() {
  const context = contexto();
  const structural = buildRadarCompetitiveModel({
    pages: TODAS, query: "skincare para pele oleosa", principal: "skincare para pele oleosa",
    editorialTopics: context.editorialTopics, keywordTexts: context.resolvedKeywordTexts,
    centralEntities: ["pele oleosa"],
  });
  const comparison = buildRadarEditorialComparison({ context, model: structural, observedIntent: "informacional" });
  return buildRadarCompetitiveObservedModel({
    context, references: [], selectedUrls: [], pages: TODAS,
    structural, comparison,
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
    observedAt: "2026-09-10T12:00:00.000Z",
  });
}

test("GATE 10 · O — o modelo competitivo observado consome a pesquisa de links", () => {
  const modelo = observado();

  assert.ok(modelo.internalLinks, "COMPETITIVE_MODEL_INTEGRATED");
  assert.equal(modelo.internalLinks.relatedInternalPages.length, 10);
  assert.equal(modelo.internalLinks.siloPage?.slug, "/skincare");
  assert.ok(modelo.internalLinks.conceptAlignments.length > 0, "com o cruzamento semântico feito");
  assert.ok(modelo.limitations.some(item => /apenas a CONTAGEM/.test(item)), "e as limitações sobem ao modelo");

  /* Nenhum relatório paralelo: a autoridade continua sendo uma. */
  const view = readFileSync("lib/radar/deep-research-view.ts", "utf8");
  assert.match(view, /const internalLinks = observed\.internalLinks;/, "a view lê do modelo, não recalcula");
});

test("GATE 10 · P — a projeção humana da arquitetura sai da mesma autoridade", () => {
  const modelo = observado();
  const narrativa = radarObservedNarrative(modelo);
  const secao = narrativa.find(item => item.title === "Arquitetura interna")!;

  assert.ok(secao, "a seção existe na primeira camada");
  assert.match(secao.lines[0], /10 página\(s\) relacionada\(s\) no grafo aprovado/);
  assert.match(secao.lines[1], /6 relação\(ões\) de saída · 6 de entrada · 1 SiloPage relacionada/);
  assert.match(secao.lines[2], /16 conceito\(s\) de âncora/);
  assert.match(secao.lines[2], /decisão do Planejador/, "a fronteira é dita a quem lê");
  assert.ok(secao.lines.some(linha => /Conceitos do mercado que a arquitetura já relaciona/.test(linha)));

  /* Sem ID técnico na primeira camada. */
  const texto = secao.lines.join(" ");
  assert.equal(/article:|silo-page:|graph-v|sha256:/.test(texto), false, "nodeId, versão e hash ficam no modelo");

  /* Determinística: mesma entrada, mesma leitura. */
  assert.deepEqual(radarObservedNarrative(modelo).find(item => item.title === "Arquitetura interna"), secao);
});

test("GATE 10 · sem grafo recebido, a ausência é declarada e nada é inventado", () => {
  const semGrafo = buildRadarInternalLinkResearch({ context: contexto(null), pages: TODAS, semantic: semantico() });

  assert.equal(semGrafo.relatedInternalPages.length, 0);
  assert.equal(semGrafo.anchorConcepts.length, 0);
  assert.equal(semGrafo.conceptAlignments.length, 0);
  assert.equal(semGrafo.siloPage, null);
  assert.ok(semGrafo.limitations.some(item => /não recebeu o grafo de links internos/.test(item)));

  /* Sem grafo, "conceito sem relação" também não faz sentido como acusação. */
  assert.ok(semGrafo.conceptsWithoutGraphRelation.every(item => item.evidence.includes("Observação para o Arquiteto")));
});
