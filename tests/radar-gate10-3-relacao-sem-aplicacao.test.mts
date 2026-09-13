import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarInternalLinkResearch } from "../lib/radar/link-and-source-research.ts";
import { buildRadarInternalLinkPlan } from "../lib/radar/internal-link-plan.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel, radarObservedNarrative } from "../lib/radar/competitive-observed-model.ts";
import type { RadarArticleResearchContext, RadarResearchInternalLinks } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 10.3 · RELAÇÃO ESTRUTURAL ≠ APLICAÇÃO ARTIFICIAL  ========
 *
 * Duas coisas estavam misturadas num número só:
 *
 *   1. a relação EXISTE no grafo aprovado        — decisão do Arquiteto, fato
 *   2. onde e quantas vezes ela cabe NESTE texto — evidência, e pode faltar
 *
 * O Gate 10.1 devolvia "1 ocorrência estrutural, lugar a definir" quando não
 * achava contexto. Aquilo era o Radar fabricando (2) e vestindo de (1). O
 * Arquiteto aprovou a relação; ele nunca determinou quantidade nem local.
 *
 * Agora `recommendedOccurrences = 0` é resposta legítima — e não significa
 * remover a relação, rejeitar o grafo nem dizer que o link é desnecessário.
 * Significa que esta rodada não encontrou onde aplicá-lo com fundamento.
 *
 * Nenhum teste chama rede, provider ou storage.
 */

/* ============================== o grafo ================================= */

const saida = (outra: string, relationType: string, anchorConcepts: string[]) => ({
  sourceNodeId: "article:este", targetNodeId: outra, relationType, anchorConcepts,
  reason: "Relação aprovada pelo Arquiteto", priority: "HIGH", direction: "outbound" as const,
});

const entrada = (outra: string, relationType: string, anchorConcepts: string[]) => ({
  sourceNodeId: outra, targetNodeId: "article:este", relationType, anchorConcepts,
  reason: "Relação aprovada pelo Arquiteto", priority: "HIGH", direction: "inbound" as const,
});

const GRAFO: RadarResearchInternalLinks = {
  graphId: "g", graphVersionId: "graph-v10", graphContentHash: `sha256:${"d".repeat(64)}`,
  edges: [
    /* Com contexto na amostra. */
    saida("article:pilar", "SUPPORT_TO_PILLAR", ["skincare para pele oleosa"]),
    /* Sem contexto nenhum: a amostra não fala de esfoliação. */
    saida("article:esfoliacao", "SUPPORT_TO_SUPPORT", ["esfoliação química"]),
    /* SiloPage, também sem contexto. */
    saida("silo-page:skincare", "ARTICLE_TO_SILO_PAGE", ["guia de skincare"]),
    /* Entrada sem contexto: a página de origem não foi analisada. */
    entrada("article:protetor", "SUPPORT_TO_SUPPORT", ["protetor solar mineral"]),
  ],
};

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v10", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Suporte" },
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

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [],
  wordCount: 1600, internalLinkCount: 4, externalLinkCount: 2,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 3, italicCount: 0,
  paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Abertura.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
});

const proveniencia = (paginas: RadarExtractionPage[]) => paginas.map((page, index) => ({
  url: page.url,
  appearances: [{
    keyword: index % 2 === 0 ? "skincare para pele oleosa" : "rotina para pele oleosa",
    keywordRole: index % 2 === 0 ? "principal" : "secundaria",
    sourceType: (index % 2 === 0 ? "canonical" : "auxiliary") as "canonical" | "auxiliary",
  }],
}));

function planejar(headingsPorPagina: string[][]) {
  const paginas = headingsPorPagina.map((headings, index) => pagina(`P${index}`, headings));
  const semantic = buildRadarSemanticConceptModel({
    pages: paginas, centralEntities: ["pele oleosa"],
    keywordTexts: ["skincare para pele oleosa"], provenance: proveniencia(paginas),
  });
  const research = buildRadarInternalLinkResearch({ context: contexto(), pages: paginas, semantic });
  return { paginas, semantic, plan: buildRadarInternalLinkPlan({ research, semantic }) };
}

/** A amostra fala de causas e de rotina; não fala de esfoliação nem do silo. */
const SEM_CONTEXTO_PARA_TODOS = Array.from({ length: 8 }, () => ["Causas da pele oleosa", "Rotina para pele oleosa"]);

const alvo = (plan: ReturnType<typeof planejar>["plan"], nodeId: string) =>
  [...plan.outgoing, ...(plan.siloPage ? [plan.siloPage] : [])].find(item => item.nodeId === nodeId)!;

/* ======  A, B, C e D · ZERO É RESPOSTA, NÃO REMOÇÃO  ================== */

test("GATE 10.3 · A — relação aprovada sem contexto natural devolve zero ocorrências", () => {
  const { plan } = planejar(SEM_CONTEXTO_PARA_TODOS);
  const esfoliacao = alvo(plan, "article:esfoliacao");

  assert.equal(esfoliacao.recommendedOccurrences, 0, "ZERO_CONTEXT_FORCES_ONE_LINK = NO");
  assert.deepEqual(esfoliacao.supportingContexts, [], "nenhum contexto fabricado");
  assert.equal(esfoliacao.preferredContexts.length, 0);
});

test("GATE 10.3 · B e C — o requisito estrutural permanece e a aplicação fica sem resolução", () => {
  const { plan } = planejar(SEM_CONTEXTO_PARA_TODOS);
  const esfoliacao = alvo(plan, "article:esfoliacao");

  assert.equal(esfoliacao.structuralRequirement, "REQUIRED", "STRUCTURAL_REQUIREMENT preservado");
  assert.equal(esfoliacao.applicationStatus, "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
  assert.equal(esfoliacao.applicationConfidence, "LOW");
  assert.match(esfoliacao.occurrencesReason, /A relação existe no grafo aprovado, mas a investigação atual não encontrou contexto suficientemente fundamentado/);
  assert.match(esfoliacao.occurrencesReason, /A relação permanece/);

  /* O conceito de âncora aprovado continua disponível para quando houver onde. */
  assert.ok(esfoliacao.approvedAnchorConcepts.includes("esfoliação química"));
  assert.equal(esfoliacao.anchor.recommendedAnchor, "esfoliação química");
});

test("GATE 10.3 · D — zero nunca é lido como remover, rejeitar ou dispensar o link", () => {
  const { plan } = planejar(SEM_CONTEXTO_PARA_TODOS);
  const esfoliacao = alvo(plan, "article:esfoliacao");

  /* A relação continua no plano e no fundamento — não é filtrada para fora. */
  assert.ok([...plan.outgoing, ...(plan.siloPage ? [plan.siloPage] : [])].some(item => item.nodeId === "article:esfoliacao"),
    "GRAPH_RELATION_PRESERVED");
  assert.equal(esfoliacao.relationTypes[0], "SUPPORT_TO_SUPPORT");

  const serializado = JSON.stringify(plan);
  for (const proibido of ["REMOVE_RELATION", "REJECT_GRAPH", "LINK_NOT_NEEDED", "removeRelation", "linkNotNeeded"]) {
    assert.equal(serializado.includes(proibido), false, `${proibido} não pode nascer de uma ausência de contexto`);
  }
  assert.ok(plan.guards.some(item => /Zero ocorrências não remove a relação nem diz que o link é desnecessário/.test(item)),
    "e a leitura correta de zero é dita em voz alta");
});

/* ==========  E, F e G · COM EVIDÊNCIA, A QUANTIDADE SEGUE  =========== */

test("GATE 10.3 · E — um contexto continua valendo uma ocorrência", () => {
  const { plan } = planejar(Array.from({ length: 8 }, () => ["Causas da pele oleosa"]));
  const pilar = alvo(plan, "article:pilar");

  assert.equal(pilar.recommendedOccurrences, 1);
  assert.equal(pilar.applicationStatus, "RESOLVED");
  assert.equal(pilar.supportingContexts.length, 1);
});

test("GATE 10.3 · F — dois contextos distintos continuam valendo duas", () => {
  const { plan } = planejar(SEM_CONTEXTO_PARA_TODOS);
  const pilar = alvo(plan, "article:pilar");

  assert.equal(pilar.recommendedOccurrences, 2);
  assert.equal(pilar.applicationStatus, "RESOLVED");
  assert.equal(pilar.structuralRequirement, "REQUIRED", "o requisito é o mesmo, com ou sem evidência");
});

test("GATE 10.3 · G — três contextos fortes continuam valendo três, sem teto", () => {
  const { plan } = planejar(Array.from({ length: 10 }, () => [
    "Causas da pele oleosa",
    "Rotina para pele oleosa",
    "Diferença entre pele oleosa e mista",
  ]));
  const pilar = alvo(plan, "article:pilar");

  assert.equal(pilar.recommendedOccurrences, 3);
  assert.equal(pilar.supportingContexts.length, 3);
  assert.equal(pilar.applicationStatus, "RESOLVED");
});

/* ==============  H · A SILOPAGE SEGUE A MESMA REGRA  ================= */

test("GATE 10.3 · H — a SiloPage não ganha uma ocorrência automática", () => {
  const { plan } = planejar(SEM_CONTEXTO_PARA_TODOS);
  const raiz = plan.siloPage!;

  assert.ok(raiz, "a raiz continua no plano");
  assert.equal(raiz.targetRole, "SILOPAGE");
  assert.equal(raiz.recommendedOccurrences, 0, "sem contexto, zero — inclusive para a raiz");
  assert.equal(raiz.structuralRequirement, "REQUIRED");
  assert.equal(raiz.applicationStatus, "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
  assert.equal(raiz.slug, "/skincare", "e ela continua distinguível");
});

/* ============  I · A ENTRADA TAMBÉM SEPARA AS DUAS COISAS  ========== */

test("GATE 10.3 · I — entrada sem contexto preserva o requisito e não inventa lugar", () => {
  const { plan } = planejar(SEM_CONTEXTO_PARA_TODOS);
  const doProtetor = plan.incoming.find(item => item.sourceNodeId === "article:protetor")!;

  assert.ok(doProtetor, "INCOMING_STRUCTURAL_REQUIREMENT = YES");
  assert.equal(doProtetor.structuralRequirement, "REQUIRED");
  assert.equal(doProtetor.applicationStatus, "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
  assert.equal(doProtetor.recommendedOccurrences, 0);
  assert.equal(doProtetor.recommendedContext, null, "nada de frase genérica no lugar de contexto");
  assert.match(doProtetor.reason, /não analisou a página de origem/);
  assert.match(doProtetor.reason, /O requisito permanece/);
  assert.ok(doProtetor.approvedAnchorConcepts.includes("protetor solar mineral"));
});

/* ==================  J · UPSTREAM CONTINUA INTOCADO  ================ */

test("GATE 10.3 · J — separar requisito de aplicação não escreve no grafo nem no ArticleDNA", () => {
  const antes = JSON.stringify(contexto());
  planejar(SEM_CONTEXTO_PARA_TODOS);
  assert.equal(JSON.stringify(contexto()), antes, "GRAPH_MUTATED = NO · ARTICLE_UPSTREAM_MUTATED = NO");

  const codigo = readFileSync("lib/radar/internal-link-plan.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch(", "supabase", "Repository", "process.env", "async ", "writeGraph", "removeRelation"]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir aqui`);
  }
});

/* ===============  5 · A PROJEÇÃO HUMANA DIZ A VERDADE  ============== */

test("GATE 10.3 · a leitura humana troca a ocorrência fabricada pela frase verdadeira", () => {
  const context = contexto();
  const paginas = SEM_CONTEXTO_PARA_TODOS.map((headings, index) => pagina(`P${index}`, headings));
  const structural = buildRadarCompetitiveModel({
    pages: paginas, query: "skincare para pele oleosa", principal: "skincare para pele oleosa",
    editorialTopics: context.editorialTopics, keywordTexts: context.resolvedKeywordTexts, centralEntities: ["pele oleosa"],
  });
  const comparison = buildRadarEditorialComparison({ context, model: structural, observedIntent: "informacional" });
  const modelo = buildRadarCompetitiveObservedModel({
    context, references: [], selectedUrls: [], pages: paginas, structural, comparison,
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
    observedAt: "2026-09-10T12:00:00.000Z",
  });
  const secao = radarObservedNarrative(modelo).find(item => item.title === "Plano de links internos")!;
  const texto = secao.lines.join("\n");

  assert.match(texto, /Relação estrutural aprovada\. A investigação não encontrou nesta rodada um contexto natural suficientemente sustentado para aplicar o link\./);
  assert.equal(/ocorrência estrutural, com o lugar a definir/.test(texto), false, "a frase fabricada saiu");
  assert.match(texto, /Âncora aprovada, quando houver onde aplicá-la/);

  /* E o destino com evidência continua com plano completo. */
  assert.match(texto, /Recomendação: 2 ocorrência\(s\)/);
  assert.match(texto, /Distribuição: /);
});
