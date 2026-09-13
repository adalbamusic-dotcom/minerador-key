import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarInternalLinkResearch } from "../lib/radar/link-and-source-research.ts";
import { buildRadarInternalLinkPlan, radarAnchorStaysWithinConcept } from "../lib/radar/internal-link-plan.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel, radarObservedNarrative } from "../lib/radar/competitive-observed-model.ts";
import type { RadarArticleResearchContext, RadarResearchInternalLinks } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * ==========  GATE 10.1 · PLANO DE LINKAGEM INTERNA  =====================
 *
 * FRONTEIRA CORRIGIDA. Durante os Gates 10 e 11 o código dizia que
 * quantidade, âncora final, seção e posição eram decisão do Planejador. Estava
 * errado, e o erro tinha consequência: o Planejador receberia a rede crua do
 * Arquiteto e teria de adivinhar como aplicá-la — sem a SERP na mão, que é
 * exatamente o que a investigação existe para trazer.
 *
 *   ARQUITETO   quais páginas se relacionam, direção, tipo, conceito de âncora
 *   RADAR       quantas vezes, em que contexto, com que âncora, como distribuir
 *   PLANEJADOR  recebe o plano fundamentado e o compõe com o resto do artigo
 *
 * O que NÃO mudou: o grafo continua sendo do Arquiteto. O plano descreve a
 * aplicação de relações aprovadas; oportunidade fora do grafo é registro, não
 * arquitetura.
 *
 * Nenhum teste chama rede, provider ou storage.
 */

/* ======================= o Article é um SUPORTE ========================= */

const GRAFO: RadarResearchInternalLinks = {
  graphId: "graph-1", graphVersionId: "graph-v4", graphContentHash: `sha256:${"b".repeat(64)}`,
  edges: [
    /* Recebe do Pilar e da raiz do silo; devolve ao Pilar e à raiz. */
    { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["skincare para pele oleosa", "rotina para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
    { sourceNodeId: "silo-page:skincare", targetNodeId: "article:este", relationType: "SILO_PAGE_TO_ARTICLE", anchorConcepts: ["cuidados com acne"], reason: "A raiz abre pelo recorte", priority: "MEDIUM", direction: "inbound" },
    { sourceNodeId: "article:este", targetNodeId: "silo-page:skincare", relationType: "ARTICLE_TO_SILO_PAGE", anchorConcepts: ["guia de skincare"], reason: "O suporte devolve à raiz do Silo", priority: "MEDIUM", direction: "outbound" },
    /* Uma malha lateral cujo assunto a amostra não trata. */
    { sourceNodeId: "article:protetor", targetNodeId: "article:este", relationType: "SUPPORT_TO_SUPPORT", anchorConcepts: ["protetor solar mineral"], reason: "Malha entre suportes", priority: "LOW", direction: "inbound" },
    { sourceNodeId: "article:este", targetNodeId: "article:esfoliacao", relationType: "SUPPORT_TO_SUPPORT", anchorConcepts: ["esfoliação química"], reason: "Malha entre suportes", priority: "LOW", direction: "outbound" },
  ],
};

const contexto = (grafo: RadarResearchInternalLinks | null = GRAFO): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v7", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", text: "pele oleosa e acne", role: "principal" },
    strategy: { keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { intent: "informacional" }, normalizedIntent: "informacional" },
  }],
  editorialTopics: ["relação entre oleosidade e acne"],
  resolvedKeywordTexts: ["pele oleosa e acne", "rotina para pele oleosa"],
  silo: {
    siloId: "silo-1", siloName: "Skincare", siloDnaVersionId: "silo-v2", siloDnaContentHash: null,
    siloPageId: "silo-page:skincare", siloPageSlug: "/skincare", siloPageCanonical: "https://marca.com.br/skincare",
    siloPagePublicationStatus: "published", articleRole: "support", hierarchy: "Suporte",
  },
  formationSerp: null, internalLinks: grafo, limitations: [],
} as unknown as RadarArticleResearchContext);

/* ========================== a amostra da SERP =========================== */

const pagina = (id: string, headings: string[], internos: number): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa e acne"], h2: headings, h3: [],
  wordCount: 1500, internalLinkCount: internos, externalLinkCount: 2,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 3, italicCount: 0,
  paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa e acne" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Abertura.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
});

/*
 * Duas necessidades DIFERENTES sobre a mesma entidade: causa e processo.
 *
 * É isso que justifica duas ocorrências — dois momentos do texto, não a mesma
 * coisa repetida. Se as duas famílias pedissem a mesma coisa, o agrupamento
 * conceitual as fundiria (corretamente) e o plano recomendaria uma só.
 */
const ACNE = ["Causas da acne em pele oleosa", "Por que a pele oleosa causa acne", "Motivos da acne na pele oleosa", "O que provoca acne na pele oleosa"];
const ROTINA = ["Rotina para pele oleosa", "Como montar uma rotina para pele oleosa", "Rotina de skincare para pele oleosa"];

/** Catorze comparáveis: acne em todas, rotina em oito, densidade de links real. */
const PAGINAS = Array.from({ length: 14 }, (_, index) => pagina(
  String.fromCharCode(65 + index),
  index < 8 ? [ACNE[index % ACNE.length], ROTINA[index % ROTINA.length]] : [ACNE[index % ACNE.length]],
  index < 11 ? 3 + (index % 4) : 0,
));

const semantico = () => buildRadarSemanticConceptModel({
  pages: PAGINAS, centralEntities: ["pele oleosa"],
  keywordTexts: ["pele oleosa e acne", "rotina para pele oleosa"],
  editorialTopics: ["relação entre oleosidade e acne"],
});

const planejar = (grafo: RadarResearchInternalLinks | null = GRAFO) => {
  const research = buildRadarInternalLinkResearch({ context: contexto(grafo), pages: PAGINAS, semantic: semantico() });
  return { research, plan: buildRadarInternalLinkPlan({ research, semantic: semantico() }) };
};

/* =========  1 · O GRAFO É FUNDAMENTO; O PLANO É DO RADAR  ============== */

test("GATE 10.1 · o grafo entrega a rede e o Radar entrega a aplicação", () => {
  const { research, plan } = planejar();

  /* FUNDAMENTO: o que o Arquiteto decidiu, intacto. */
  assert.equal(research.relatedInternalPages.length, 4, "pilar, silopage, protetor e esfoliação");
  assert.ok(research.anchorConcepts.includes("pele oleosa e acne"));

  /* PLANO: o que o Radar decidiu com a SERP na mão. */
  assert.ok(plan.outgoing.length > 0, "RADAR_DECIDES_APPLICATION");
  assert.ok(plan.siloPage, "SILOPAGE_PLAN — a raiz tem tratamento próprio");
  assert.equal(plan.articleRole, "support");
  assert.ok(plan.totalRecommendedLinks > 0);

  /* As duas coisas convivem sem se misturar. */
  assert.equal(plan.outgoing.some(item => item.targetRole === "SILOPAGE"), false, "a raiz não é listada como suporte comum");
});

/* ==============  2 · QUANTIDADE FUNDAMENTADA, NÃO FIXA  =============== */

test("GATE 10.1 · A — a quantidade vem da evidência, e destinos diferentes recebem números diferentes", () => {
  const { plan } = planejar();
  const aoPilar = plan.outgoing.find(item => item.nodeId === "article:pilar")!;
  const aEsfoliacao = plan.outgoing.find(item => item.nodeId === "article:esfoliacao")!;

  assert.ok(aoPilar, "a relação com o Pilar tem plano");
  assert.equal(aoPilar.recommendedOccurrences, 2, "dois conceitos recorrentes sustentam dois momentos do texto");
  assert.match(aoPilar.occurrencesReason, /2 contextos semanticamente distintos sustentam a relação/);
  assert.equal(aoPilar.supportingContexts.length, 2, "uma ocorrência por contexto");

  /*
   * ATUALIZADO NO GATE 10.3 — sem contexto fundamentado, zero.
   *
   * Antes isto devolvia "1 ocorrência estrutural, lugar a definir": o Radar
   * fabricando uma aplicação que não conseguiu sustentar, com cara de decisão
   * do Arquiteto. A relação continua exigida; a aplicação é que fica sem
   * resolução, e isso é dito.
   */
  assert.equal(aEsfoliacao.recommendedOccurrences, 0, "ZERO_CONTEXT_FORCES_ONE_LINK = NO");
  assert.equal(aEsfoliacao.structuralRequirement, "REQUIRED", "a relação permanece no grafo");
  assert.equal(aEsfoliacao.applicationStatus, "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
  assert.equal(aEsfoliacao.applicationConfidence, "LOW");
  assert.match(aEsfoliacao.occurrencesReason, /não encontrou contexto suficientemente fundamentado/);

  /* Nada de número fixo global. */
  const quantidades = new Set([...plan.outgoing, plan.siloPage!].map(item => item.recommendedOccurrences));
  assert.ok(quantidades.size > 1, "destinos diferentes, quantidades diferentes");

  /*
   * ATUALIZADO NO GATE 10.2 — o teto de duas ocorrências saiu.
   *
   * Ele era uma constante limitando uma decisão que deve nascer da evidência.
   * O que segura repetição agora é a exigência de CONTEXTO NOVO: a quantidade
   * é exatamente o número de contextos distintos sustentados.
   */
  for (const item of [...plan.outgoing, plan.siloPage!]) {
    assert.equal(item.recommendedOccurrences, item.supportingContexts.length,
      "a quantidade é exatamente o número de contextos sustentados — zero inclusive");
    assert.equal(item.applicationStatus, item.supportingContexts.length ? "RESOLVED" : "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
    assert.equal(item.structuralRequirement, "REQUIRED", "GRAPH_RELATION_PRESERVED");
  }
});

/* ===============  3 · ÂNCORA DENTRO DO CONCEITO APROVADO  ============= */

test("GATE 10.1 · B — o Radar recomenda âncora e variantes, sempre dentro do conceito aprovado", () => {
  const { plan } = planejar();
  const aoPilar = plan.outgoing.find(item => item.nodeId === "article:pilar")!;

  assert.ok(aoPilar.anchor.recommendedAnchor.length > 0, "RECOMMENDED_ANCHOR");
  assert.ok(aoPilar.approvedAnchorConcepts.includes(aoPilar.anchor.approvedAnchorConcept),
    "a âncora recomendada nasce de um conceito que o Arquiteto aprovou");
  assert.equal(aoPilar.anchor.recommendedAnchor, aoPilar.anchor.approvedAnchorConcept,
    "o conceito aprovado é a recomendação mais segura");

  assert.ok(aoPilar.anchor.anchorVariants.length > 0, "ANCHOR_VARIANTS");
  assert.equal(aoPilar.anchor.withinApprovedConcept, true, "ANCHOR_CONCEPT_RESPECTED");
  for (const variante of aoPilar.anchor.anchorVariants) {
    assert.ok(radarAnchorStaysWithinConcept(aoPilar.anchor.approvedAnchorConcept, variante),
      `"${variante}" precisa continuar significando "${aoPilar.anchor.approvedAnchorConcept}"`);
  }
  assert.match(aoPilar.anchor.reason, /formulações que a própria amostra usa/);
});

test("GATE 10.1 · B — variante que muda o significado é recusada", () => {
  assert.equal(radarAnchorStaysWithinConcept("pele oleosa e acne", "cuidados para pele oleosa e acne"), true);
  assert.equal(radarAnchorStaysWithinConcept("pele oleosa e acne", "melhores sabonetes"), false);
  assert.equal(radarAnchorStaysWithinConcept("rotina para pele oleosa", "rotina de skincare para pele oleosa"), true);
  assert.equal(radarAnchorStaysWithinConcept("rotina para pele oleosa", "protetor solar"), false);

  /*
   * Sobreposição não é reformulação.
   *
   * "Causas da acne em pele oleosa" carrega dois terços de "skincare para pele
   * oleosa" e fala de outro assunto: como âncora, prometeria causas e levaria
   * ao Pilar de skincare. Uma reformulação acrescenta qualificador, não tema.
   */
  assert.equal(radarAnchorStaysWithinConcept("skincare para pele oleosa", "Causas da acne em pele oleosa"), false);
  assert.equal(radarAnchorStaysWithinConcept("skincare para pele oleosa", "Rotina de skincare para pele oleosa"), true);

  /* E o plano nunca propõe variante que não passe na régua — nem pergunta. */
  const { plan } = planejar();
  for (const item of [...plan.outgoing, ...(plan.siloPage ? [plan.siloPage] : [])]) {
    for (const variante of item.anchor.anchorVariants) {
      assert.ok(radarAnchorStaysWithinConcept(item.anchor.approvedAnchorConcept, variante));
      assert.equal(/^(como|o que|por que|qual|quando|onde)\b/i.test(variante), false, `"${variante}" é pergunta, não âncora`);
    }
  }
});

/* ==============  4 e 5 · CONTEXTO, SEÇÃO E DISTRIBUIÇÃO  ============== */

test("GATE 10.1 · C — cada link diz em que contexto cabe, com a evidência atrás", () => {
  const { plan } = planejar();
  const aoPilar = plan.outgoing.find(item => item.nodeId === "article:pilar")!;

  assert.ok(aoPilar.preferredContexts.length > 0, "LINK_CONTEXT_RECOMMENDED");
  assert.match(aoPilar.preferredContexts[0], /Seção que desenvolve ".+" — \d+ de \d+ página\(s\)/);
  assert.ok(aoPilar.preferredConcepts.length > 0, "com os conceitos que o justificam");
  assert.ok(aoPilar.sectionAffinity.length > 0, "LINK_SECTION_AFFINITY — as seções da amostra");
  assert.ok(aoPilar.sectionAffinity.every(item => PAGINAS.some(page => page.h2.includes(item))),
    "e elas existem mesmo nas páginas extraídas");
});

test("GATE 10.1 · D — a distribuição é orientada, e fundamentada no que a amostra faz", () => {
  const { plan } = planejar();
  const aoPilar = plan.outgoing.find(item => item.nodeId === "article:pilar")!;

  assert.ok(aoPilar.distribution.length >= 2, "LINK_DISTRIBUTION_RECOMMENDED");
  assert.ok(aoPilar.distribution.some(item => /Distribuir as \d+ ocorrências em contextos diferentes/.test(item)),
    "duas ocorrências não são a mesma coisa duas vezes");
  assert.ok(aoPilar.distribution.some(item => /Não colocar duas delas em sequência nem na mesma seção/.test(item)),
    "links seguidos para o mesmo destino leem como repetição");
  assert.ok(aoPilar.distribution.some(item => /Não repetir na abertura nem no fechamento/.test(item)));
  assert.ok(aoPilar.distribution.some(item => /A amostra faz assim/.test(item)), "COMPETITOR_LINK_EVIDENCE_USED");

  /* A raiz do silo recebe orientação própria, não a de um suporte. */
  assert.ok(plan.siloPage!.distribution.some(item => /raiz do silo cabe onde o texto situa o assunto no todo/.test(item)));
});

/* =====================  6 · A EVIDÊNCIA DE CADA ITEM  ================= */

test("GATE 10.1 · G — toda recomendação responde por que este link, aqui, tantas vezes, com esta âncora", () => {
  const { plan } = planejar();

  for (const item of [...plan.outgoing, ...(plan.siloPage ? [plan.siloPage] : [])]) {
    assert.ok(item.evidence.length >= 2, "SERP_EVIDENCE_USED");
    assert.ok(item.evidence.some(linha => /Grafo aprovado:/.test(linha)), "por que este link");
    assert.ok(item.evidence.some(linha => /mediana de \d+ link|não permitiu observar densidade/.test(linha)), "por que esta quantidade");
    assert.ok(item.occurrencesReason.length > 20);
    assert.ok(item.anchor.reason.length > 20, "por que esta âncora");
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(item.applicationConfidence));
  }

  const aoPilar = plan.outgoing.find(entry => entry.nodeId === "article:pilar")!;
  assert.ok(aoPilar.evidence.some(linha => /cobre \d+ de \d+ página\(s\) comparáveis/.test(linha)), "por que neste contexto");
});

/* ==================  7 · ENTRADA, SAÍDA E AS DUAS  =================== */

test("GATE 10.1 · as entradas viram requisito para a página de origem, não edição dela", () => {
  const { plan } = planejar();

  assert.ok(plan.incoming.length >= 2, "INCOMING_REQUIREMENTS");
  const doPilar = plan.incoming.find(item => item.sourceNodeId === "article:pilar")!;
  assert.equal(doPilar.sourceRole, "PILAR");
  assert.ok(doPilar.anchor.recommendedAnchor.length > 0);
  assert.equal(doPilar.structuralRequirement, "REQUIRED", "a relação de entrada existe no grafo");

  /*
   * ATUALIZADO NO GATE 10.3 — o requisito estrutural e a aplicação são coisas
   * separadas. Com contexto fundamentado, o Radar diz onde o link cabe na
   * origem; sem ele, diz que não encontrou, em vez de uma frase genérica.
   */
  if (doPilar.applicationStatus === "RESOLVED") {
    assert.ok((doPilar.recommendedContext || "").length > 10);
    assert.equal(doPilar.recommendedOccurrences, 1);
    assert.match(doPilar.reason, /não edita a página de origem/);
  } else {
    assert.equal(doPilar.recommendedContext, null, "contexto não fundamentado não vira frase genérica");
    assert.equal(doPilar.recommendedOccurrences, 0);
    assert.match(doPilar.reason, /O requisito permanece/);
  }

  /* BOTH preserva as duas direções: o Pilar aparece nos dois lados. */
  assert.ok(plan.outgoing.some(item => item.nodeId === "article:pilar"), "OUTGOING_PLAN");
  assert.ok(plan.incoming.some(item => item.sourceNodeId === "article:pilar"));
  const relacao = plan.outgoing.find(item => item.nodeId === "article:pilar")!;
  assert.equal(relacao.direction, "BOTH", "não condensar");
});

/* ============  8 · OPORTUNIDADE FORA DO GRAFO NÃO É ARQUITETURA  ===== */

test("GATE 10.1 · F — oportunidade encontrada pela pesquisa não vira relação aprovada", () => {
  const { plan } = planejar();

  for (const oportunidade of plan.opportunities) {
    assert.equal(oportunidade.status, "NOT_IN_GRAPH_REQUIRES_ARCHITECT_DECISION", "OUT_OF_GRAPH_RELATION_AUTO_APPROVED = NO");
    assert.ok(oportunidade.pages >= 2, "e só entra o que tem evidência");
  }
  /* Elas não contaminam o plano de aplicação. */
  const nosDoPlano = new Set([...plan.outgoing, ...(plan.siloPage ? [plan.siloPage] : [])].map(item => item.nodeId));
  for (const oportunidade of plan.opportunities) {
    assert.equal(nosDoPlano.has(oportunidade.conceptId), false);
  }
  if (plan.opportunities.length) {
    assert.ok(plan.limitations.some(item => /não existem no grafo aprovado/.test(item)));
  }
});

/* ====================  9 · O PLANO NÃO CRIA SPAM  ==================== */

test("GATE 10.1 · as guardas contra repetição artificial estão escritas e ativas", () => {
  const { plan } = planejar();

  assert.ok(plan.guards.length > 0);
  assert.ok(plan.guards.some(item => /Cada ocorrência corresponde a um contexto semanticamente distinto/.test(item)));
  assert.ok(plan.guards.some(item => /ficaram sem aplicação fundamentada nesta rodada/.test(item)), "e a falta de contexto é dita");
  assert.ok(plan.guards.some(item => /Zero ocorrências não remove a relação/.test(item)), "e zero não é lido como remoção");

  /* Duas ocorrências exigem variantes: repetir a mesma âncora soa artificial. */
  const comDuas = [...plan.outgoing, ...(plan.siloPage ? [plan.siloPage] : [])].filter(item => item.recommendedOccurrences >= 2);
  for (const item of comDuas) {
    assert.ok(item.anchor.anchorVariants.length > 0 || plan.guards.some(guarda => /menos variantes de âncora do que ocorrências/.test(guarda)));
  }

  /*
   * ATUALIZADO NO GATE 10.2 — a constante de teto foi removida.
   *
   * Ela era heurística sobrepondo evidência. A proteção não sumiu: passou a
   * ser a exigência de contexto novo com evidência crescente, e o teste agora
   * guarda a AUSÊNCIA da constante.
   */
  const fonte = readFileSync("lib/radar/internal-link-plan.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/MAX_POR_DESTINO/.test(codigo), false, "FIXED_MAX_PER_DESTINATION = NO");
  assert.equal(/Math\.min\([^)]*,\s*\d+\)/.test(codigo), false, "nenhum truncamento por constante");
  assert.match(fonte, /A QUANTIDADE NASCE DE CONTEXTOS, NÃO DE UMA CONSTANTE/);
});

/* ==============  10 · O GRAFO E O UPSTREAM CONTINUAM INTACTOS  ======= */

test("GATE 10.1 · E — planejar não escreve no grafo nem no ArticleDNA", () => {
  const antes = contexto();
  const copia = JSON.stringify(antes);
  const research = buildRadarInternalLinkResearch({ context: antes, pages: PAGINAS, semantic: semantico() });
  buildRadarInternalLinkPlan({ research, semantic: semantico() });
  assert.equal(JSON.stringify(antes), copia, "GRAPH_MUTATED = NO · ARTICLE_UPSTREAM_MUTATED = NO");

  const fonte = readFileSync("lib/radar/internal-link-plan.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch(", "supabase", "Repository", "process.env", "async ", "createRelation", "approveRelation", "writeGraph"]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir aqui`);
  }
  assert.equal(/from "\.\.\/(minerador|arquiteto|planejador)/.test(codigo), false);
});

test("GATE 10.1 · sem grafo, não há plano — e a ausência é declarada", () => {
  const { plan } = planejar(null);

  assert.equal(plan.outgoing.length, 0);
  assert.equal(plan.incoming.length, 0);
  assert.equal(plan.siloPage, null);
  assert.equal(plan.totalRecommendedLinks, 0);
  assert.match(plan.limitations[0], /Sem relação aprovada no grafo/);
});

/* =============  11 · MODELO E PROJEÇÃO HUMANA  ====================== */

function observado() {
  const context = contexto();
  const structural = buildRadarCompetitiveModel({
    pages: PAGINAS, query: "pele oleosa e acne", principal: "pele oleosa e acne",
    editorialTopics: context.editorialTopics, keywordTexts: context.resolvedKeywordTexts, centralEntities: ["pele oleosa"],
  });
  const comparison = buildRadarEditorialComparison({ context, model: structural, observedIntent: "informacional" });
  return buildRadarCompetitiveObservedModel({
    context, references: [], selectedUrls: [], pages: PAGINAS, structural, comparison,
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
    observedAt: "2026-09-10T12:00:00.000Z",
  });
}

test("GATE 10.1 · o modelo competitivo distingue fundamento, observação e plano", () => {
  const modelo = observado();

  /* FOUNDATION + OBSERVATION continuam onde estavam. */
  assert.ok(modelo.internalLinks.relatedInternalPages.length > 0, "fundamento");
  assert.ok(modelo.internalLinks.competitorPatterns.length > 0, "observação");
  /* PLAN é a camada nova, e é uma só. */
  assert.ok(modelo.internalLinkPlan, "COMPETITIVE_MODEL_INTEGRATED");
  assert.ok(modelo.internalLinkPlan.outgoing.length > 0);

  const view = readFileSync("lib/radar/deep-research-view.ts", "utf8");
  assert.equal(/buildRadarInternalLinkPlan/.test(view), false, "nenhum relatório paralelo: a view lê do modelo");
});

test("GATE 10.1 · a projeção humana entrega o plano legível, com evidência", () => {
  const modelo = observado();
  const secao = radarObservedNarrative(modelo).find(item => item.title === "Plano de links internos")!;

  assert.ok(secao, "a seção existe na primeira camada");
  assert.match(secao.lines[0], /relação\(ões\) de saída aplicáveis · \d+ link\(s\) recomendados no total/);
  assert.ok(secao.lines.some(linha => /Recomendação: \d+ ocorrência\(s\)/.test(linha)));
  assert.ok(secao.lines.some(linha => /Âncora: ".+"/.test(linha)));
  assert.ok(secao.lines.some(linha => /Distribuição: /.test(linha)));

  /* Sem ID técnico na primeira camada. */
  assert.equal(/article:|silo-page:|graph-v|sha256:/.test(secao.lines.join(" ")), false);
  assert.deepEqual(radarObservedNarrative(modelo).find(item => item.title === "Plano de links internos"), secao);
});
