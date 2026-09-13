import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarInternalLinkResearch } from "../lib/radar/link-and-source-research.ts";
import { buildRadarInternalLinkPlan, radarLinkContextsAreDistinct } from "../lib/radar/internal-link-plan.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import type { RadarArticleResearchContext, RadarResearchInternalLinks } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * =======  GATE 10.2 · QUANTIDADE DE LINKS GUIADA POR EVIDÊNCIA  ========
 *
 * O Gate 10.1 introduziu `MAX_POR_DESTINO = 2` — e a Diretriz de Autoridade
 * Evidencial, escrita logo depois, tornou aquilo indefensável: uma constante
 * arbitrária descartando evidência real é heurística acima de observação, que
 * é precisamente a inversão que a diretriz proíbe.
 *
 * O teto saiu. O que segura repetição não é um número: é a exigência de que
 * cada ocorrência adicional traga um CONTEXTO SEMANTICAMENTE NOVO, com
 * evidência proporcionalmente mais forte.
 *
 * Nenhum teste chama rede, provider ou storage.
 */

/* ============================ o grafo mínimo ============================ */

const aresta = (outra: string, relationType: string, anchorConcepts: string[]) => ({
  sourceNodeId: "article:este", targetNodeId: outra, relationType, anchorConcepts,
  reason: "Relação aprovada", priority: "HIGH", direction: "outbound" as const,
});

const GRAFO: RadarResearchInternalLinks = {
  graphId: "g", graphVersionId: "graph-v9", graphContentHash: `sha256:${"c".repeat(64)}`,
  edges: [aresta("article:pilar", "SUPPORT_TO_PILLAR", ["skincare para pele oleosa"])],
};

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v9", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { intent: "informacional" }, normalizedIntent: "informacional" },
  }],
  editorialTopics: [],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "s", siloName: "Skincare", siloDnaVersionId: "sv", siloDnaContentHash: null, siloPageId: "silo-page:skincare", siloPageSlug: "/skincare", siloPageCanonical: null, siloPagePublicationStatus: "published", articleRole: "support", hierarchy: "Suporte" },
  formationSerp: null, internalLinks: GRAFO, limitations: [],
} as unknown as RadarArticleResearchContext);

/* ============================== a amostra =============================== */

const pagina = (id: string, headings: string[], internos = 4): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [],
  wordCount: 1600, internalLinkCount: internos, externalLinkCount: 2,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 3, italicCount: 0,
  paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Abertura.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
});

/**
 * As consultas que trouxeram cada página.
 *
 * A cobertura por consulta é exigida a partir da terceira ocorrência — e ela
 * só existe se a procedência for informada.
 */
const proveniencia = (paginas: RadarExtractionPage[]) => paginas.map((page, index) => ({
  url: page.url,
  appearances: [{
    keyword: index % 2 === 0 ? "skincare para pele oleosa" : "rotina para pele oleosa",
    keywordRole: index % 2 === 0 ? "principal" : "secundaria",
    sourceType: (index % 2 === 0 ? "canonical" : "auxiliary") as "canonical" | "auxiliary",
  }],
}));

function planejar(paginas: RadarExtractionPage[]) {
  const semantic = buildRadarSemanticConceptModel({
    pages: paginas,
    centralEntities: ["pele oleosa"],
    keywordTexts: ["skincare para pele oleosa"],
    provenance: proveniencia(paginas),
  });
  const research = buildRadarInternalLinkResearch({ context: contexto(), pages: paginas, semantic });
  return { semantic, research, plan: buildRadarInternalLinkPlan({ research, semantic }) };
}

const aoPilar = (plan: ReturnType<typeof planejar>["plan"]) => plan.outgoing.find(item => item.nodeId === "article:pilar")!;

/* ==================  A · UM CONTEXTO, UMA OCORRÊNCIA  ================= */

test("GATE 10.2 · A — um contexto real sustenta uma ocorrência", () => {
  const paginas = Array.from({ length: 8 }, (_, index) => pagina(`A${index}`, ["Causas da pele oleosa"]));
  const item = aoPilar(planejar(paginas).plan);

  assert.equal(item.recommendedOccurrences, 1);
  assert.equal(item.supportingContexts.length, 1, "toda ocorrência amarrada a um contexto");
  assert.ok(item.supportingContexts[0].evidence.length > 10);
  assert.match(item.occurrencesReason, /Um contexto sustenta a relação/);
});

/* ==============  B · DOIS CONTEXTOS DISTINTOS, DUAS  ================== */

test("GATE 10.2 · B — dois contextos semanticamente distintos justificam duas ocorrências", () => {
  const paginas = Array.from({ length: 8 }, (_, index) => pagina(`B${index}`, [
    "Causas da pele oleosa",
    "Rotina para pele oleosa",
  ]));
  const item = aoPilar(planejar(paginas).plan);

  assert.equal(item.recommendedOccurrences, 2);
  assert.deepEqual(item.supportingContexts.map(entry => entry.order), [1, 2]);
  assert.notEqual(item.supportingContexts[0].conceptType, item.supportingContexts[1].conceptType, "necessidades diferentes");
  assert.match(item.occurrencesReason, /2 contextos semanticamente distintos/);
});

/* ========  C · TRÊS CONTEXTOS FORTES NÃO SÃO TRUNCADOS EM DOIS  ====== */

test("GATE 10.2 · C — SERP_EVIDENCE_CAN_EXCEED_OLD_LIMIT: três contextos fortes viram três ocorrências", () => {
  /*
   * Causa, processo e comparação: três necessidades diferentes sobre a mesma
   * entidade, todas em 100% da amostra e todas encontradas por duas consultas.
   * Sob o teto antigo isso virava dois — evidência descartada por constante.
   */
  const paginas = Array.from({ length: 10 }, (_, index) => pagina(`C${index}`, [
    "Causas da pele oleosa",
    "Rotina para pele oleosa",
    "Diferença entre pele oleosa e mista",
  ]));
  const { plan } = planejar(paginas);
  const item = aoPilar(plan);

  assert.equal(item.recommendedOccurrences, 3, "FIXED_MAX_PER_DESTINATION = NO");
  assert.equal(item.supportingContexts.length, 3);
  assert.equal(new Set(item.supportingContexts.map(entry => entry.conceptType)).size, 3, "três necessidades distintas");
  assert.ok(item.supportingContexts.every(entry => entry.pages >= 5), "cada uma com evidência própria");
  assert.match(item.supportingContexts[2].evidence, /confiança alta, encontrado por 2 consultas/,
    "a terceira exige evidência mais forte — e ela existe aqui");

  /* Nada foi reduzido em silêncio: não há truncamento a registrar. */
  assert.equal(item.rejectedContexts.some(entry => /teto|máximo|limite/i.test(entry.reason)), false);
});

test("GATE 10.2 · C — a terceira ocorrência exige mais do que a segunda", () => {
  /* Mesmos três contextos, mas o terceiro só em duas páginas de dez. */
  const paginas = Array.from({ length: 10 }, (_, index) => pagina(`E${index}`, index < 2
    ? ["Causas da pele oleosa", "Rotina para pele oleosa", "Diferença entre pele oleosa e mista"]
    : ["Causas da pele oleosa", "Rotina para pele oleosa"]));
  const item = aoPilar(planejar(paginas).plan);

  assert.equal(item.recommendedOccurrences, 2, "o terceiro contexto não se sustenta");
  const recusado = item.rejectedContexts.find(entry => /Diferença/.test(entry.conceptLabel))!;
  assert.ok(recusado, "e a recusa fica registrada com motivo");
  assert.match(recusado.reason, /não é recorrente o bastante/);
});

/* ========  D · VARIAÇÃO LEXICAL NÃO MULTIPLICA OCORRÊNCIA  =========== */

test("GATE 10.2 · D — três formulações do mesmo contexto não viram três links", () => {
  /*
   * "Causas da pele oleosa", "Por que a pele fica oleosa" e "Motivos da
   * oleosidade" são a MESMA necessidade escrita de três maneiras. O
   * agrupamento do Gate 8 já as funde; o plano recebe um contexto, não três.
   */
  const paginas = Array.from({ length: 9 }, (_, index) => pagina(`D${index}`, [
    "Causas da pele oleosa",
    "Por que a pele fica oleosa",
    "Motivos da oleosidade",
  ]));
  const { semantic } = planejar(paginas);
  const item = aoPilar(planejar(paginas).plan);

  const doMesmoAssunto = semantic.concepts.filter(entry => entry.conceptType === "CAUSE");
  assert.equal(doMesmoAssunto.length, 1, "as três formulações são um conceito só");
  assert.equal(item.recommendedOccurrences, 1, "LEXICAL_VARIATION_DOES_NOT_MULTIPLY_LINKS");
  assert.equal(item.supportingContexts.length, 1);
});

test("GATE 10.2 · F — seções diferentes com o mesmo sentido não multiplicam", () => {
  /* A régua de distinção é semântica, não de string. */
  assert.equal(radarLinkContextsAreDistinct(
    { conceptType: "CAUSE", conceptLabel: "Causas da pele oleosa" },
    { conceptType: "CAUSE", conceptLabel: "Causas da oleosidade da pele" },
  ), false, "mesma necessidade, mesmo assunto: um contexto");

  assert.equal(radarLinkContextsAreDistinct(
    { conceptType: "CAUSE", conceptLabel: "Causas da pele oleosa" },
    { conceptType: "PROCESS", conceptLabel: "Rotina para pele oleosa" },
  ), true, "necessidades diferentes: contextos diferentes");

  assert.equal(radarLinkContextsAreDistinct(
    { conceptType: "PROCESS", conceptLabel: "Rotina para pele oleosa" },
    { conceptType: "PROCESS", conceptLabel: "Tratamento para acne" },
  ), true, "mesma necessidade sobre assuntos diferentes: contextos diferentes");
});

/* =========  E · ÂNCORA REPETIDA TEM GUARDA DECLARADA  =============== */

test("GATE 10.2 · E — mais ocorrências do que variantes de âncora vira guarda explícita", () => {
  const paginas = Array.from({ length: 10 }, (_, index) => pagina(`G${index}`, [
    "Causas da pele oleosa",
    "Rotina para pele oleosa",
    "Diferença entre pele oleosa e mista",
  ]));
  const { plan } = planejar(paginas);
  const item = aoPilar(plan);

  assert.equal(item.recommendedOccurrences, 3);
  if (item.anchor.anchorVariants.length < item.recommendedOccurrences - 1) {
    assert.ok(plan.guards.some(guarda => /menos variantes de âncora do que ocorrências/.test(guarda)),
      "repetir a mesma formulação três vezes precisa ser dito");
  }
  assert.ok(item.distribution.some(entry => /Não colocar duas delas em sequência nem na mesma seção/.test(entry)));
  assert.ok(plan.guards.some(guarda => /Cada ocorrência corresponde a um contexto semanticamente distinto/.test(guarda)));
});

/* =====  G · DENSIDADE DO CONCORRENTE SOZINHA NÃO BASTA  ============= */

test("GATE 10.2 · G — concorrentes ligarem muito não aumenta a quantidade", () => {
  const contextoUnico = ["Causas da pele oleosa"];
  const poucosLinks = Array.from({ length: 8 }, (_, index) => pagina(`H${index}`, contextoUnico, 1));
  const muitosLinks = Array.from({ length: 8 }, (_, index) => pagina(`I${index}`, contextoUnico, 30));

  const comPoucos = aoPilar(planejar(poucosLinks).plan);
  const comMuitos = aoPilar(planejar(muitosLinks).plan);

  assert.equal(comPoucos.recommendedOccurrences, comMuitos.recommendedOccurrences,
    "a densidade do mercado não decide quantos links o artigo recebe");
  assert.equal(comMuitos.recommendedOccurrences, 1, "um contexto, uma ocorrência, mesmo com trinta links por página");

  /* A densidade continua visível como observação, e como guarda quando destoa. */
  const fonte = readFileSync("lib/radar/internal-link-plan.ts", "utf8");
  assert.match(fonte, /Densidade acima do que o mercado pratica precisa de revisão humana/);
});

/* ======  H e I · A DECISÃO É SUSTENTADA E RASTREÁVEL  =============== */

test("GATE 10.2 · H e I — grafo, semântica e SERP sustentam a decisão, e cada ocorrência tem evidência", () => {
  const paginas = Array.from({ length: 8 }, (_, index) => pagina(`J${index}`, ["Causas da pele oleosa", "Rotina para pele oleosa"]));
  const item = aoPilar(planejar(paginas).plan);

  /* Grafo: a relação existe e é aprovada. */
  assert.ok(item.evidence.some(entry => /Grafo aprovado:/.test(entry)));
  assert.equal(item.relationTypes[0], "SUPPORT_TO_PILLAR");
  /* Semântica: os contextos vêm de conceitos, com tipo e cobertura. */
  assert.ok(item.supportingContexts.every(entry => entry.conceptId && entry.conceptType));
  /* SERP: cada contexto carrega quantas páginas o cobrem e por quantas consultas. */
  for (const entry of item.supportingContexts) {
    assert.ok(entry.pages >= 2 && entry.sampleSize >= entry.pages);
    assert.ok(entry.queryCoverage >= 1);
    assert.ok(entry.sections.length > 0, "e as seções em que a amostra o trata");
    assert.ok(entry.evidence.length > 10, "toda ocorrência responde por que existe");
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(entry.confidence));
  }
  assert.notEqual(item.recommendedOccurrences, undefined);
});

/* ========  J · O UPSTREAM CONTINUA INTOCADO  ======================== */

test("GATE 10.2 · J — decidir quantidade não escreve no grafo nem no ArticleDNA", () => {
  const paginas = Array.from({ length: 8 }, (_, index) => pagina(`K${index}`, ["Causas da pele oleosa", "Rotina para pele oleosa"]));
  const antes = JSON.stringify(contexto());
  planejar(paginas);
  assert.equal(JSON.stringify(contexto()), antes, "GRAPH_MUTATED = NO · ARTICLE_UPSTREAM_MUTATED = NO");

  const codigo = readFileSync("lib/radar/internal-link-plan.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch(", "supabase", "Repository", "process.env", "async ", "writeGraph"]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir aqui`);
  }
});

/* ======  8 · A INVARIANTE: EVIDÊNCIA NÃO É REDUZIDA EM SILÊNCIO  ==== */

test("GATE 10.2 · nenhuma constante reduz a evidência, e recusa nenhuma é silenciosa", () => {
  const codigo = readFileSync("lib/radar/internal-link-plan.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  assert.equal(/MAX_POR_DESTINO/.test(codigo), false, "a constante de teto não existe mais");
  assert.equal(/Math\.min\([^)]*,\s*\d+\)/.test(codigo), false, "nenhum truncamento numérico");
  assert.equal(/occurrences\s*=\s*\d/.test(codigo.replace(/occurrences: 1,/g, "")), false, "quantidade não é literal");

  /* Toda recusa carrega motivo — o plano nunca deixa cair sem dizer. */
  const paginas = Array.from({ length: 10 }, (_, index) => pagina(`L${index}`, index < 2
    ? ["Causas da pele oleosa", "Rotina para pele oleosa", "Diferença entre pele oleosa e mista"]
    : ["Causas da pele oleosa", "Rotina para pele oleosa"]));
  const item = aoPilar(planejar(paginas).plan);
  assert.ok(item.rejectedContexts.length > 0);
  for (const recusado of item.rejectedContexts) {
    assert.ok(recusado.conceptLabel.length > 0);
    assert.ok(recusado.reason.length > 20, "recusa sem motivo é redução silenciosa");
  }
});
