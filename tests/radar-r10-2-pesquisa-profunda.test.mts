import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { buildRadarCompetitorUniverse, type RadarExecutedQuery } from "../lib/radar/competitor-universe.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarExternalEvidenceCandidates, buildRadarInternalLinkResearch } from "../lib/radar/link-and-source-research.ts";
import { RADAR_FOUNDATION_USAGE_MAP, radarUnmappedFoundationFields } from "../lib/radar/foundation-usage-map.ts";
import { resolveRadarInvestigationSufficiency } from "../lib/radar/investigation-sufficiency.ts";
import {
  buildRadarResearchFingerprint,
  finalizeRadarDeepResearch,
  radarDeepResearchAction,
  radarDeepResearchState,
  radarResearchIsStale,
  radarQueryEvidenceFrom,
  settleRadarDeepResearchQuery,
  startRadarDeepResearch,
} from "../lib/radar/deep-research.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { RadarItemSchema, type RadarItem } from "../lib/editorial/operational-flow.ts";
import { RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { RadarClassifiedTopic } from "../lib/radar/topic-classification.ts";
import type { RadarCompetitiveModel } from "../lib/radar/competitive-model.ts";

/*
 * ==========================  21 · O CENÁRIO  ==============================
 *
 * "skincare para pele oleosa": quatro keywords com papéis diferentes, Silo de
 * skincare com SiloPage publicada, SERP de formação com divergência já
 * resolvida por uma pessoa, e grafo de links aprovado com entrada e saída.
 *
 * É a unidade editorial inteira — exatamente o que o Radar ignorava ao
 * pesquisar só a principal.
 */
const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const articleId = "article-skincare-pele-oleosa";
const articleDnaVersionId = "8f2b1c44-1111-4d50-8797-5d387adb4849";
const HASH = "sha256:" + "d".repeat(64);

type Fixture = {
  id: string;
  texto: string;
  role: "principal" | "secundaria" | "reforco_narrativo";
  volume: number;
  kgr: number;
  intent: "informational" | "commercial_investigation" | "transactional";
  entidade: string;
  modificadores: string[];
  funil: string;
};

const KEYWORDS: Fixture[] = [
  { id: "bbbbbbbb-0000-4000-8000-000000000001", texto: "skincare para pele oleosa", role: "principal", volume: 3600, kgr: 0.12, intent: "informational", entidade: "skincare", modificadores: ["pele oleosa"], funil: "consideracao" },
  { id: "bbbbbbbb-0000-4000-8000-000000000002", texto: "melhor sabonete para pele oleosa", role: "secundaria", volume: 1900, kgr: 0.31, intent: "commercial_investigation", entidade: "sabonete facial", modificadores: ["melhor", "pele oleosa"], funil: "decisao" },
  { id: "bbbbbbbb-0000-4000-8000-000000000003", texto: "skincare pele oleosa", role: "secundaria", volume: 880, kgr: 0.09, intent: "informational", entidade: "skincare", modificadores: ["pele oleosa"], funil: "consideracao" },
  { id: "bbbbbbbb-0000-4000-8000-000000000004", texto: "ácido salicílico", role: "reforco_narrativo", volume: 5400, kgr: 0.04, intent: "informational", entidade: "ácido salicílico", modificadores: [], funil: "descoberta" },
];
const principal = KEYWORDS[0];

const keywordDna = (kw: Fixture) => ({
  brandId, keywordId: kw.id, capturedAt: "2026-09-07T10:00:00.000Z",
  versionReference: { entityId: kw.id, versionId: `kwdna-${kw.id}`, contentHash: HASH },
  payload: {
    schemaVersion: 1, keywordId: kw.id, searchIntent: kw.intent, likelyEditorialType: "guide",
    centralEntity: kw.entidade, modifiers: kw.modificadores, audience: "Pele oleosa",
    perceivedProblem: "Oleosidade e brilho", desiredResult: "Rotina que controla a oleosidade",
    awarenessLevel: "problem_aware", journeyStage: kw.funil, objections: ["preço"],
    dominantEmotion: "frustração", commercialPotential: "medium", affiliatePotential: "medium",
    reviewCandidate: false, productResearchRequired: false, stampOrigin: "human",
    confidence: 0.8, humanConfirmed: true, volumeSearch: kw.volume, resultCount: 210, kgrScore: kw.kgr,
  },
  sourceKeywordSnapshot: { volume_search: kw.volume, kgr_score: kw.kgr },
});

const referencia = (kw: Fixture) => ({
  keywordId: kw.id, keywordDnaVersionId: `kwdna-${kw.id}`, keywordDnaContentHash: HASH, role: kw.role,
  strategicContribution: `Contribuição de ${kw.texto}`, coveredIntentions: [kw.intent],
  requiredTopics: [kw.texto], excludedTopics: [], classificationOrigin: "human" as const, confidence: 0.8,
  humanConfirmed: true,
  normalizedIntent: kw.intent === "informational" ? "informational" as const : kw.intent === "transactional" ? "transactional" as const : "commercial_investigation" as const,
  volume: kw.volume, resultCount: 210, kgrScore: kw.kgr,
  incrementalVolume: kw.role === "principal" ? null : kw.volume,
  contribution: kw.role === "principal" ? "central" as const : "incremental_volume" as const,
  purpose: "Cobrir a intenção declarada", overlapRisk: "low" as const,
  semanticQualificationRef: {
    versionId: `semqual-${kw.id}`, versionNumber: 2, contentHash: HASH,
    intent: kw.intent === "informational" ? "informacional" : "transacional",
    funnel: kw.funil, semanticState: "conclusive" as const, collectedAt: "2026-09-06T12:00:00.000Z",
  },
  keywordDnaSnapshot: keywordDna(kw),
});

const hidratada = (kw: Fixture) => ({
  referenceKeywordId: kw.id, canonicalKeywordId: kw.id, sourceKeywordId: kw.id, originalKeywordId: kw.id,
  aliases: [], keywordDnaVersionId: `kwdna-${kw.id}`, keyword: kw.texto, role: kw.role,
  brandId, siloId: "silo-skincare", siloName: "Skincare", isPublished: false,
});

const silo = {
  id: "silo-skincare", name: "Skincare", siloDnaVersionId: "silodna-skincare-v2",
  siloDnaContentHash: HASH, territoryRef: "territorio-skincare", siloPageId: "silopage-skincare",
  siloPageVersionId: "silopage-skincare-v1", siloPageSlug: "/skincare",
  siloPageCanonical: "https://marca-exemplo.com.br/skincare",
  siloPagePublicationStatus: "published", articleRole: "pillar" as const,
};

const radarItem = (patch: Record<string, unknown> = {}, hidratadas = KEYWORDS): RadarItem => RadarItemSchema.parse({
  id: `radar:${articleId}`, brandId, articleId, articleDnaVersionId, articleDnaContentHash: HASH,
  title: "Skincare para pele oleosa: rotina que controla o brilho", slug: "skincare-para-pele-oleosa",
  siloId: "silo-skincare", hierarchy: "Pilar", principalKeywordId: principal.id, format: "Pilar",
  intent: "informacional", state: "research_pending", importedAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z", origin: "local", lockVersion: 1,
  hydration: {
    schemaVersion: 1, brandId, articleId, articleDnaVersionId, source: "arquiteto_import",
    capturedAt: "2026-09-07T10:00:00.000Z", principalKeywordId: principal.id,
    principalKeyword: hidratada(principal), keywordSnapshots: hidratadas.map(hidratada), silo,
  },
  arquitetoKeywordDnaReferences: KEYWORDS.map(referencia),
  arquitetoKeywordUrlRelations: { [principal.id]: "confirmed_primary" },
  arquitetoSerpProvenance: {
    assessmentId: "assessment-skincare", formationBaseHash: HASH, verdict: "DIVERGENCE",
    humanResolution: { decision: "seguir", reason: "a divergência foi avaliada e aceita", decidedBy: "ator-1", decidedAt: "2026-09-07T09:30:00.000Z" },
  },
  /* Entrada E saída: o grafo aprovado descreve as duas direções. */
  arquitetoInternalLinks: {
    graphId: "graph-skincare", graphVersionId: "graph-skincare-v4", graphContentHash: HASH,
    edges: [
      { sourceNodeId: "n-pilar-skincare", targetNodeId: "n-acido-salicilico", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["ácido salicílico"], reason: "aprofunda o ativo citado", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "n-sabonete-pele-oleosa", targetNodeId: "n-pilar-skincare", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["rotina para pele oleosa"], reason: "devolve autoridade ao pilar", priority: "MEDIUM", direction: "inbound" },
    ],
  },
  ...patch,
});

const articleDna = (): ArticleDNA => ({
  schemaVersion: 1, articleId, brandId, principalKeywordId: principal.id,
  secondaryKeywordIds: KEYWORDS.filter(kw => kw.role === "secundaria").map(kw => kw.id),
  narrativeReinforcementIds: KEYWORDS.filter(kw => kw.role === "reforco_narrativo").map(kw => kw.id),
  keywordReferences: KEYWORDS.map(referencia), siloId: "silo-skincare", hierarchy: "Pilar",
  suggestedSlug: "skincare-para-pele-oleosa", canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
  audience: "Pele oleosa", problem: "Brilho e poros", desiredResult: "Rotina estável",
  journeyStage: "consideracao", brandObjective: "Autoridade",
  promise: "Rotina de skincare que controla a oleosidade sem ressecar", angle: "Prático", cta: "Conhecer",
  coverage: ["limpeza facial", "hidratação para pele oleosa"], excludedSubjects: [],
  antiCannibalizationBoundary: "Sem maquiagem", nearbyArticleIds: [], differentiation: ["Passo a passo"],
  entities: ["skincare"], requiredTopics: ["protetor solar para pele oleosa"], questions: ["quantas vezes lavar o rosto?"],
  objections: ["preço"], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [],
  confidence: 0.75, humanPendingDecisions: [],
} as unknown as ArticleDNA);

const envelope = (): VersionEnvelope<ArticleDNA> => ({
  versionId: articleDnaVersionId, entityId: articleId, versionNumber: 4, previousVersionId: null,
  contentHash: HASH, origin: "human", changeReason: "fixture", createdAt: "2026-09-07T09:00:00.000Z",
  createdBy: "auditor", payload: articleDna(),
} as VersionEnvelope<ArticleDNA>);

const contexto = (patch: Record<string, unknown> = {}, hidratadas = KEYWORDS) =>
  buildRadarArticleResearchContext({ item: radarItem(patch, hidratadas), article: envelope() });

const plano = (patch: Record<string, unknown> = {}) => buildRadarResearchQueryPlan(contexto(patch));

const candidataDe = (texto: string, patch: Record<string, unknown> = {}) => {
  const item = plano(patch).queries.find(query => query.keyword === texto);
  assert.ok(item, `a candidata "${texto}" deveria existir no plano`);
  return item;
};

/*
 * ======================  22 · A · O PLANO DA UNIDADE  =====================
 */

test("A · o plano nasce da unidade editorial inteira, não da principal", () => {
  const resultado = plano();
  assert.equal(resultado.queries.length, KEYWORDS.length, "uma candidata por keyword recebida");
  assert.equal(resultado.primary?.keyword, principal.texto);
  assert.deepEqual(resultado.queries.map(query => query.rolePriority), [1, 2, 2, 3], "papel ordena o plano");
  // O fundamento viaja junto: volume, KGR, intenção, funil, entidade, modificadores.
  const central = resultado.primary!;
  assert.equal(central.volume, principal.volume);
  assert.equal(central.kgr, principal.kgr);
  assert.equal(central.entity, "skincare");
  assert.deepEqual(central.modifiers, ["pele oleosa"]);
  assert.equal(central.funnel, "consideracao");
  assert.equal(central.semanticQualification?.versionId, `semqual-${principal.id}`);
});

test("B · a principal é a consulta central e sempre executa", () => {
  const central = plano().primary!;
  assert.equal(central.disposition, "EXECUTE");
  assert.match(central.reason, /Consulta central/);
});

test("C · secundária com intenção própria amplia o universo", () => {
  const comercial = candidataDe("melhor sabonete para pele oleosa");
  assert.equal(comercial.disposition, "EXECUTE");
  assert.match(comercial.reason, /intenção própria|recorte próprio/);
  assert.notEqual(comercial.intent, plano().primary!.intent);
});

test("D · secundária que repete a principal fica como contexto, sem gastar coleta", () => {
  const repetida = candidataDe("skincare pele oleosa");
  assert.equal(repetida.disposition, "CONTEXT_ONLY");
  assert.match(repetida.reason, /Repete a principal/);
});

test("E · reforço só vira consulta quando tem entidade própria", () => {
  const comEntidade = candidataDe("ácido salicílico");
  assert.equal(comEntidade.disposition, "EXECUTE");
  assert.match(comEntidade.reason, /Reforço com entidade própria/);

  // Mesmo reforço, agora sem entidade distinta: contexto, não consulta.
  const referencias = KEYWORDS.map(kw => kw.id === KEYWORDS[3].id
    ? { ...referencia(kw), keywordDnaSnapshot: keywordDna({ ...kw, entidade: "skincare" }) }
    : referencia(kw));
  const semEntidade = buildRadarResearchQueryPlan(buildRadarArticleResearchContext({
    item: radarItem({ arquitetoKeywordDnaReferences: referencias }), article: envelope(),
  })).queries.find(query => query.keyword === "ácido salicílico");
  assert.equal(semEntidade?.disposition, "CONTEXT_ONLY");
  assert.match(semEntidade!.reason, /Reforço narrativo/);
});

test("F · KGR e volume não promovem papel: o reforço com mais volume continua reforço", () => {
  const reforco = candidataDe("ácido salicílico");
  const central = plano().primary!;
  assert.ok(reforco.volume! > central.volume!, "o reforço tem MAIS volume que a principal nesta fixture");
  assert.ok(reforco.kgr! < central.kgr!, "e KGR melhor");
  assert.equal(reforco.rolePriority, 3);
  assert.equal(central.keyword, principal.texto, "e ainda assim a consulta central é a principal");
});

test("G · keyword sem texto não vira consulta, não vira id e não some do plano", () => {
  const resultado = plano({}, );
  assert.equal(resultado.queries.length, 4);

  const semTexto = buildRadarResearchQueryPlan(buildRadarArticleResearchContext({
    item: radarItem({}, [principal, KEYWORDS[1]]), article: envelope(),
  }));
  assert.equal(semTexto.queries.length, KEYWORDS.length, "as quatro continuam no plano");
  const orfas = semTexto.queries.filter(query => query.disposition === "NOT_EXECUTABLE");
  assert.equal(orfas.length, 2);
  for (const orfa of orfas) {
    assert.equal(orfa.keyword, null, "id nunca vira texto de consulta");
    assert.match(orfa.reason, /não teve o texto resolvido/);
  }
  assert.ok(semTexto.limitations.some(item => /sem texto resolvido/.test(item)));
});

test("H · evidência da formação com decisão humana é reaproveitada, não redescoberta", () => {
  const comercial = candidataDe("melhor sabonete para pele oleosa", {
    arquitetoKeywordUrlRelations: { [principal.id]: "confirmed_primary", [KEYWORDS[1].id]: "confirmed_primary" },
  });
  assert.equal(comercial.disposition, "REUSE_FORMATION_EVIDENCE");
  assert.match(comercial.reason, /SERP de formação/);
  assert.equal(comercial.formationSerpContext.humanDecision, "seguir");
});

/*
 * ====================  22 · I a K · O UNIVERSO  ==========================
 */

const resultado = (position: number, url: string, title: string, tipo = "article") => ({
  position, url, title, domain: new URL(url).hostname.replace(/^www\./, ""), snippet: "trecho", inferredType: tipo,
});

const consultas = (): RadarExecutedQuery[] => [
  {
    queryId: "query:principal", keyword: principal.texto, role: "principal",
    results: [
      resultado(1, "https://revista-pele.com.br/skincare-pele-oleosa", "Skincare para pele oleosa"),
      resultado(2, "https://loja-cosmeticos.com.br/produto/sabonete-facial", "Comprar sabonete facial", "product"),
      resultado(3, "https://www.youtube.com/watch?v=abc", "Rotina em vídeo", "video"),
      resultado(4, "https://www.gov.br/anvisa/cosmeticos", "Regras de cosméticos"),
      resultado(5, "https://marca-exemplo.com.br/skincare", "Nossa página de skincare"),
    ],
  },
  {
    queryId: "query:secundaria", keyword: "melhor sabonete para pele oleosa", role: "secundaria",
    results: [
      resultado(1, "https://revista-pele.com.br/skincare-pele-oleosa", "Skincare para pele oleosa"),
      resultado(2, "https://loja-cosmeticos.com.br/produto/sabonete-facial", "Comprar sabonete facial", "product"),
      resultado(3, "https://outro-blog.com.br/limpeza-facial", "Limpeza facial passo a passo"),
    ],
  },
  {
    queryId: "query:reforco", keyword: "ácido salicílico", role: "reforco_narrativo",
    results: [resultado(1, "https://blog-lateral.com.br/acido-salicilico", "Tudo sobre ácido salicílico")],
  },
];

const universo = () => buildRadarCompetitorUniverse({ queries: consultas(), context: contexto() });

test("I · recorrência entre consultas é o sinal, e ela classifica concorrente editorial", () => {
  const editorial = universo().candidates.find(item => item.domain === "revista-pele.com.br");
  assert.equal(editorial?.classification, "EDITORIAL_COMPETITOR");
  assert.equal(editorial?.queryCount, 2, "apareceu na principal e na secundária");
  assert.equal(editorial?.principalRank, 1);
  assert.deepEqual(editorial?.secondaryRanks, [1]);
  assert.match(editorial!.candidateReason, /Recorrente em 2 consulta/);
});

test("J · ficha de produto recorrente é concorrente comercial, não benchmark editorial", () => {
  const comercial = universo().candidates.find(item => item.domain === "loja-cosmeticos.com.br");
  assert.equal(comercial?.classification, "COMMERCIAL_COMPETITOR");
  assert.equal(comercial?.queryCount, 2);
  assert.match(comercial!.candidateReason, /disputa a intenção, sem ser benchmark editorial/);
});

test("K · formato, autoridade, domínio próprio e lateral têm cada um o seu nome", () => {
  const universoAtual = universo();
  const porDominio = (domain: string) => universoAtual.candidates.find(item => item.domain === domain);

  assert.equal(porDominio("youtube.com")?.classification, "FORMAT_REFERENCE");
  assert.equal(porDominio("gov.br")?.classification, "AUTHORITY_SOURCE");
  assert.equal(porDominio("marca-exemplo.com.br")?.siloCompatibility, "own_domain");
  assert.equal(porDominio("blog-lateral.com.br")?.classification, "LATERAL_REFERENCE");
  assert.match(porDominio("blog-lateral.com.br")!.candidateReason, /reforço narrativo/);

  // Nada é eliminado em silêncio: todo candidato tem classe e motivo legível.
  for (const candidato of universoAtual.candidates) {
    assert.ok(candidato.classification, "toda URL observada recebe classe");
    assert.ok(candidato.candidateReason.length > 0, "e um motivo em linguagem de quem opera");
  }
});

/*
 * ==================  22 · L a N · COMPARAÇÃO E LINKS  ====================
 */

const topico = (nome: string, pages: number, relevante = true): RadarClassifiedTopic => ({
  topic: nome, classification: "RECURRENT_TOPIC", pages, sampleSize: 4,
  reason: `Aparece em ${pages} de 4 páginas comparáveis.`,
  relevance: { query: relevante, principal: relevante, editorial: relevante },
  occurrences: Array.from({ length: pages }, (_, index) => ({ pageId: `p${index + 1}`, url: `https://exemplo-${index + 1}.com`, title: `Página ${index + 1}`, level: 2 as const })),
});

const modelo = (topicos: RadarClassifiedTopic[]): RadarCompetitiveModel => ({
  identity: { query: principal.texto, observedIntent: "transacional", dominantFormat: "artigo editorial" },
  sample: { analyzed: 4, comparable: 4, excluded: [] },
  structure: [], opening: { measures: [], patterns: [] }, organization: [],
  closing: { measures: [], patterns: [] },
  semantics: { recurringTopics: [], recurringTerms: [], emphasizedTerms: [] },
  formatting: [], keyword: null, links: [], classifiedTopics: topicos,
  gaps: [], opportunities: [], limitations: [],
} as unknown as RadarCompetitiveModel);

test("L · a comparação separa confirmado, lacuna, diferencial e conflito", () => {
  const comparacao = buildRadarEditorialComparison({
    context: contexto(),
    model: modelo([topico("protetor solar para pele oleosa", 3), topico("esfoliação química", 3)]),
    observedIntent: "transacional",
  });

  const porAssunto = (assunto: string) => comparacao.rows.find(row => row.subject === assunto);
  assert.equal(porAssunto("protetor solar para pele oleosa")?.status, "CONFIRMED", "declarado e coberto");
  assert.equal(porAssunto("esfoliação química")?.status, "GAP", "coberto e não declarado");
  assert.equal(porAssunto("limpeza facial")?.status, "DIFFERENTIATION", "declarado e não coberto");

  const intencao = comparacao.rows.find(row => row.dimension === "intent");
  assert.equal(intencao?.status, "CONFLICT");
  assert.equal(intencao?.articleDeclares, "informacional");
  assert.equal(intencao?.serpShows, "transacional");
  assert.ok(comparacao.conflicts >= 1);

  // Toda linha carrega evidência; nenhuma conclusão sem lastro.
  for (const row of comparacao.rows) assert.ok(row.evidence.length > 0, `linha "${row.subject}" sem evidência`);
});

test("M · lacuna exige relevância: tópico irrelevante não vira oportunidade", () => {
  const comparacao = buildRadarEditorialComparison({
    context: contexto(),
    model: modelo([topico("política de trocas e devoluções", 3, false)]),
  });
  assert.equal(comparacao.rows.some(row => row.subject === "política de trocas e devoluções"), false);
  assert.equal(comparacao.gaps, 0);
});

test("N · o grafo aprovado é lido como fato, e este módulo continua sendo fundamento", () => {
  const paginas = [1, 2, 3].map(index => RadarExtractionPageSchema.parse({
    id: `p${index}`, url: `https://exemplo-${index}.com/artigo`, status: "success",
    fetchedAt: "2026-09-07T11:00:00.000Z", title: `Página ${index}`, metaDescription: "", canonical: null,
    h1: ["h1"], h2: ["h2"], h3: [], wordCount: 1200 + index * 100,
    internalLinkCount: 8 + index, externalLinkCount: index, listCount: 2, tableCount: 0, faqCount: 1,
    imageCount: 3, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
    structuredDataTypes: [], recurringTerms: [], boldCount: 4, italicCount: 0, error: null,
  }));

  const pesquisa = buildRadarInternalLinkResearch({ context: contexto(), pages: paginas });
  assert.equal(pesquisa.graphVersionId, "graph-skincare-v4");
  assert.equal(pesquisa.relatedInternalPages.length, 2);
  assert.equal(pesquisa.inboundCount, 1);
  assert.equal(pesquisa.outboundCount, 1);
  assert.deepEqual(pesquisa.anchorConcepts.sort(), ["rotina para pele oleosa", "ácido salicílico"].sort());
  assert.equal(pesquisa.competitorInternalLinkPattern.median, 10);
  assert.deepEqual(pesquisa.competitorInternalLinkPattern.range, [9, 11]);
  assert.equal(pesquisa.articleRole, "pillar");

  /*
   * A FRONTEIRA MUDOU NO GATE 10.1 — e a proteção mudou com ela.
   *
   * Este teste guardava a regra "o Radar não decide âncora, quantidade nem
   * posição". Essa regra estava errada para o produto: quem tem a evidência
   * competitiva para decidir isso é o Radar, e o Planejador receberia a rede
   * crua para adivinhar. A regra foi revogada.
   *
   * A proteção não foi apagada, foi trocada pela correta: ESTE módulo é
   * fundamento e observação — a decisão de aplicação vive em
   * `internal-link-plan.ts`, separada de propósito. Misturar as duas faria a
   * leitura do grafo depender de julgamento, que é como a arquitetura começa
   * a ser reescrita sem ninguém perceber.
   */
  const fonte = readFileSync("lib/radar/link-and-source-research.ts", "utf8");
  assert.equal(/recommendedOccurrences|recommendedAnchor|anchorVariants|distribution:/.test(fonte), false,
    "a aplicação não mora no módulo de fundamento");
  assert.match(fonte, /este arquivo é fundamento e observação/i);
  assert.match(fonte, /O texto ORIGINAL da âncora|as âncoras ORIGINAIS/i, "a âncora observada é declarada como do concorrente");

  /* E o grafo continua intocado: fundamento é leitura. */
  const antes = JSON.stringify(contexto().internalLinks);
  buildRadarInternalLinkResearch({ context: contexto(), pages: paginas });
  assert.equal(JSON.stringify(contexto().internalLinks), antes, "GRAPH_MUTATED = NO");
});

test("O · fontes externas declaram a limitação da extração em vez de inventar domínio", () => {
  const paginas = [RadarExtractionPageSchema.parse({
    id: "p1", url: "https://exemplo-1.com/artigo", status: "success",
    fetchedAt: "2026-09-07T11:00:00.000Z", title: "Página 1", metaDescription: "", canonical: null,
    h1: ["h1"], h2: [], h3: [], wordCount: 900, internalLinkCount: 5, externalLinkCount: 4,
    listCount: 1, tableCount: 0, faqCount: 0, imageCount: 1, blockquoteCount: 0, comparisonCount: 0,
    hasDates: false, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 0, italicCount: 0, error: null,
  })];

  const semDominios = buildRadarExternalEvidenceCandidates({ pages: paginas });
  assert.equal(semDominios.candidates.length, 0, "nenhum domínio é inventado a partir da contagem");
  assert.match(semDominios.limitations[0], /apenas a CONTAGEM de links/);

  const comDominios = buildRadarExternalEvidenceCandidates({
    pages: paginas,
    observedDomains: [{ domain: "www.gov.br", pageIds: ["p1"] }, { domain: "pubmed.ncbi.nlm.nih.gov", pageIds: ["p1"] }],
  });
  assert.equal(comDominios.candidates[0].sourceType, "official");
  assert.equal(comDominios.candidates[1].sourceType, "study");
  assert.equal(comDominios.candidates[0].sampleSize, 1);
});

/*
 * =====================  22 · P · SUFICIÊNCIA  ============================
 */

test("P · busca comercial coerente conclui a investigação em vez de acusar amostra falha", () => {
  const comercial = resolveRadarInvestigationSufficiency({
    hasSnapshot: true, curationConfirmed: true, selected: 7, analyzed: 4, failed: 3, comparable: 0,
    intentEvidence: { declaredIntent: "transacional", observedIntent: "transacional", commercialResults: 7, observedResults: 8 },
  });
  assert.equal(comercial.level, "CONFLICTING_SEARCH_INTENT");
  assert.equal(comercial.canBuildCompetitiveModel, false, "sem benchmark editorial não existe modelo");
  assert.equal(comercial.canDeriveCompetitiveNeeds, false, "nem necessidade competitiva");
  assert.equal(comercial.canApprove, true, "mas existe conclusão para registrar");
  assert.match(comercial.intentReading!.note, /confirma a intenção declarada/);

  const divergente = resolveRadarInvestigationSufficiency({
    hasSnapshot: true, curationConfirmed: true, selected: 7, analyzed: 4, failed: 0, comparable: 0,
    intentEvidence: { declaredIntent: "informacional", observedIntent: "transacional", commercialResults: 7, observedResults: 8 },
  });
  assert.equal(divergente.level, "CONFLICTING_SEARCH_INTENT");
  assert.equal(divergente.intentReading?.verdict, "DIVERGENT");
  assert.match(divergente.headline, /diverge/);

  // Sem explicação observada, zero comparáveis continua sendo insuficiência.
  const semExplicacao = resolveRadarInvestigationSufficiency({
    hasSnapshot: true, curationConfirmed: true, selected: 7, analyzed: 4, failed: 3, comparable: 0,
  });
  assert.equal(semExplicacao.level, "INSUFFICIENT");
  assert.equal(semExplicacao.canApprove, false);
});

/*
 * ============  22 · Q · COMEÇA E TERMINA POR AÇÃO HUMANA  ================
 */

test("Q · a investigação começa por ação humana, congela o fundamento e não finaliza sozinha", () => {
  const context = contexto();
  const resultado = plano();
  const registro = startRadarDeepResearch({ context, plan: resultado, startedBy: "ator-1", now: "2026-09-08T10:00:00.000Z" });

  assert.equal(registro.queries.length, KEYWORDS.length, "nenhuma consulta some do registro");
  assert.equal(registro.finalizedAt, null, "iniciar não finaliza");
  assert.equal(registro.fingerprint.articleDnaVersionId, articleDnaVersionId);
  assert.equal(registro.fingerprint.siloDnaVersionId, "silodna-skincare-v2");
  assert.equal(registro.fingerprint.formationAssessmentId, "assessment-skincare");
  assert.equal(registro.fingerprint.internalLinkGraphVersionId, "graph-skincare-v4");
  assert.equal(registro.fingerprint.keywordRefs.length, KEYWORDS.length);
  assert.ok(registro.fingerprint.keywordRefs.every(ref => ref.semanticQualificationVersionId));

  // Principal e secundária entram executáveis — em classes diferentes.
  const secundaria = registro.queries.find(query => query.keyword === "melhor sabonete para pele oleosa");
  assert.equal(secundaria?.execution, "PLANNED");
  assert.equal(secundaria?.serpClass, "auxiliary");

  const central = registro.queries.find(query => query.keyword === principal.texto);
  assert.equal(central?.execution, "PLANNED");
  assert.equal(central?.serpClass, "canonical");
  const executado = settleRadarDeepResearchQuery(registro, central!.queryId, { execution: "EXECUTED", reason: "8 resultado(s) observados." });
  assert.equal(executado.queries.find(query => query.queryId === central!.queryId)?.execution, "EXECUTED");

  // O fundamento congelado detecta versão nova em vez de atualizar em silêncio.
  const atual = buildRadarResearchFingerprint(context);
  assert.equal(radarResearchIsStale(executado.fingerprint, atual), false);
  const outraVersao = buildRadarResearchFingerprint({ ...context, article: { ...context.article, articleDnaVersionId: "outra-versao" } });
  assert.equal(radarResearchIsStale(executado.fingerprint, outraVersao), true);
  assert.equal(radarDeepResearchState({ record: executado, currentFingerprint: outraVersao, running: false }), "STALE");
});

test("Q · finalizar exige conclusão, é ação humana e não acontece duas vezes", () => {
  const context = contexto();
  const registro = startRadarDeepResearch({ context, plan: plano(), startedBy: "ator-1", now: "2026-09-08T10:00:00.000Z" });
  const fingerprint = buildRadarResearchFingerprint(context);
  const resumo = buildRadarDeepResearchView({ context }).summary;

  /*
   * GATE 15 · o que impede encerrar deixou de ser a insuficiência.
   *
   * Insuficiência com páginas lidas é leitura fraca, e o USER pode encerrá-la
   * assumindo a limitação. O que continua impedindo é não haver material: sem
   * uma única página analisada não existe investigação para congelar.
   */
  const semMaterial = finalizeRadarDeepResearch({
    record: registro, currentFingerprint: fingerprint, summary: resumo, finalizedBy: "ator-1", analyzed: 0,
    sufficiency: { level: "INSUFFICIENT", headline: "Amostra competitiva insuficiente", reasons: ["Não foi possível formar uma amostra editorial comparável."] },
  });
  assert.equal(semMaterial.ok, false);
  assert.match((semMaterial as { reason: string }).reason, /não existe investigação material/);

  const insuficienteComMaterial = finalizeRadarDeepResearch({
    record: registro, currentFingerprint: fingerprint, summary: resumo, finalizedBy: "ator-1", analyzed: 4, now: "2026-09-08T11:00:00.000Z",
    sufficiency: { level: "INSUFFICIENT", headline: "Amostra competitiva insuficiente", reasons: ["Apenas 1 página comparável."] },
  });
  assert.equal(insuficienteComMaterial.ok, true, "encerramento consciente é permitido");
  assert.equal((insuficienteComMaterial as { record: typeof registro }).record.conclusion, "INSUFFICIENT", "e a insuficiência fica registrada");

  const concluida = finalizeRadarDeepResearch({
    record: registro, currentFingerprint: fingerprint, summary: resumo, finalizedBy: "ator-1", analyzed: 4, now: "2026-09-08T12:00:00.000Z",
    sufficiency: { level: "PARTIAL_BUT_USABLE", headline: "Amostra competitiva parcial", reasons: ["Apenas 2 página(s) comparável(is)."] },
  });
  assert.equal(concluida.ok, true);
  const registroFinal = (concluida as { record: typeof registro }).record;
  assert.equal(registroFinal.finalizedAt, "2026-09-08T12:00:00.000Z");
  assert.equal(registroFinal.finalizedBy, "ator-1");
  assert.equal(registroFinal.conclusion, "PARTIAL_BUT_USABLE");
  assert.equal(registroFinal.summary?.articleKeywords, KEYWORDS.length);

  const denovo = finalizeRadarDeepResearch({
    record: registroFinal, currentFingerprint: fingerprint, summary: resumo, finalizedBy: "ator-2", analyzed: 4,
    sufficiency: { level: "SUFFICIENT", headline: "Amostra competitiva suficiente", reasons: [] },
  });
  assert.equal(denovo.ok, false);
  assert.match((denovo as { reason: string }).reason, /já foi finalizada/);
});

test("Q · as duas ações são as únicas, e nenhuma delas dispara sozinha", () => {
  const naoIniciada = radarDeepResearchAction({ state: "NOT_STARTED", contextReady: true, hasPrimaryQuery: true });
  assert.equal(naoIniciada.id, "START_DEEP_RESEARCH");
  assert.equal(naoIniciada.label, "Iniciar pesquisa profunda");

  const aguardando = radarDeepResearchAction({ state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, canConclude: true });
  assert.equal(aguardando.id, "FINALIZE_INVESTIGATION");
  assert.equal(aguardando.label, "Finalizar investigação");

  const semConclusao = radarDeepResearchAction({ state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, canConclude: false, concludeBlockedReason: "Amostra competitiva insuficiente." });
  assert.equal(semConclusao.enabled, false);
  assert.match(semConclusao.blockedReason!, /insuficiente/);

  assert.equal(radarDeepResearchAction({ state: "RUNNING", contextReady: true, hasPrimaryQuery: true }).enabled, false);
  assert.equal(radarDeepResearchAction({ state: "FINALIZED", contextReady: true, hasPrimaryQuery: true }).id, "NONE");
  assert.equal(radarDeepResearchAction({ state: "NOT_STARTED", contextReady: true, hasPrimaryQuery: false }).enabled, false);

  /* A tela: dois botões, nenhum efeito que os dispare ao abrir o artigo. */
  const workbench = readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8");
  assert.match(workbench, /data-testid="radar-deep-research-button"/);
  assert.match(workbench, /onStart\?\.\(\)/);
  assert.match(workbench, /onFinalize\?\.\(\)/);

  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(page, /onStartDeepResearch=\{\(\) => void startDeepResearch\(\)\}/);
  assert.match(page, /onFinalizeInvestigation=\{\(\) => void finalizeInvestigation\(\)\}/);
  assert.equal(/useEffect\([^)]*startDeepResearch/.test(page), false, "nada inicia a pesquisa ao montar a tela");
  assert.equal(/useEffect\([^)]*finalizeInvestigation/.test(page), false, "nada finaliza a investigação sozinho");
});

/*
 * ============  R · DUAS CLASSES DE SERP, E ELAS NÃO SE MISTURAM  =========
 *
 *   Principal  → SERP CANÔNICA DO ARTICLE (snapshot, revisão, aprovação)
 *   Secundária → SERP AUXILIAR DE PESQUISA
 *   Reforço    → SERP AUXILIAR, se necessária
 *              ↓
 *        CompetitorUniverse → Deep Research
 */

test("R · o papel decide a classe: só a principal produz a SERP do artigo", () => {
  const registro = startRadarDeepResearch({ context: contexto(), plan: plano(), startedBy: "ator-1" });
  const porTexto = (texto: string) => registro.queries.find(query => query.keyword === texto);

  assert.equal(porTexto(principal.texto)?.serpClass, "canonical");
  assert.equal(porTexto("melhor sabonete para pele oleosa")?.serpClass, "auxiliary");
  assert.equal(porTexto("skincare pele oleosa")?.serpClass, "auxiliary");
  assert.equal(porTexto("ácido salicílico")?.serpClass, "auxiliary");
  assert.equal(registro.queries.filter(query => query.serpClass === "canonical").length, 1, "existe UMA SERP canônica por artigo");

  // O reforço só é coletado quando o plano o marcou — "se necessária".
  assert.equal(porTexto("ácido salicílico")?.execution, "PLANNED", "tem entidade própria: vira consulta");
  assert.equal(porTexto("skincare pele oleosa")?.execution, "NOT_EXECUTED", "repete a principal: não gasta coleta");
});

test("R · a evidência auxiliar entra no universo sem virar snapshot do artigo", () => {
  const context = contexto();
  const inicial = startRadarDeepResearch({ context, plan: plano(), startedBy: "ator-1" });
  const auxiliar = inicial.queries.find(query => query.keyword === "melhor sabonete para pele oleosa")!;

  const pesquisaAuxiliar = {
    id: "serp-auxiliar-1", collectedAt: "2026-09-09T10:00:00.000Z", contentHash: "a".repeat(64),
    diagnostic: { dominantIntent: "transacional" },
    organicResults: [
      { position: 1, url: "https://revista-pele.com.br/skincare-pele-oleosa", title: "Skincare para pele oleosa", domain: "revista-pele.com.br", inferredType: "article" },
      { position: 2, url: "https://loja-cosmeticos.com.br/produto/sabonete-facial", title: "Comprar sabonete facial", domain: "loja-cosmeticos.com.br", inferredType: "product" },
    ],
  };

  const evidencia = radarQueryEvidenceFrom({ serpClass: "auxiliary", research: pesquisaAuxiliar });
  assert.equal(evidencia.serpClass, "auxiliary");
  assert.equal(evidencia.snapshotId, "serp-auxiliar-1");
  assert.equal(evidencia.resultCount, 2);
  assert.equal(evidencia.observedIntent, "transacional");

  const central = inicial.queries.find(query => query.serpClass === "canonical")!;
  const registro = settleRadarDeepResearchQuery(
    settleRadarDeepResearchQuery(inicial, central.queryId, { execution: "EXECUTED", reason: "SERP canônica do artigo: 1 resultado(s)." }),
    auxiliar.queryId,
    { execution: "EXECUTED", reason: "SERP auxiliar de pesquisa (secundária): 2 resultado(s).", evidence: evidencia },
  );

  const view = buildRadarDeepResearchView({
    context, record: registro,
    snapshot: {
      query: principal.texto,
      organicResults: [{
        position: 1, title: "Skincare para pele oleosa", url: "https://revista-pele.com.br/skincare-pele-oleosa",
        domain: "revista-pele.com.br", snippet: "trecho", sitelinks: [], date: null, inferredType: "article",
        confidence: "high", manualType: null, notes: "",
      }],
    },
    selectedReferences: 1,
  });

  // A recorrência entre a canônica e a auxiliar é o que forma o concorrente.
  const editorial = view.universe?.candidates.find(item => item.domain === "revista-pele.com.br");
  assert.equal(editorial?.queryCount, 2, "a mesma URL apareceu na canônica e na auxiliar");
  assert.equal(editorial?.classification, "EDITORIAL_COMPETITOR");
  assert.equal(view.summary.queriesExecuted, 2);
  assert.equal(view.summary.auxiliaryQueriesExecuted, 1);

  // E a evidência auxiliar continua sendo evidência: nunca snapshot do artigo.
  assert.equal(registro.queries.filter(query => query.evidence?.serpClass === "auxiliary").length, 1);
  assert.equal(registro.queries.find(query => query.serpClass === "canonical")?.evidence, null, "a canônica vive no snapshot do artigo, não aqui");
});

test("R · a rota recusa coletar a principal como auxiliar e nunca aceita texto do cliente", () => {
  const rota = readFileSync("app/api/editorial/serp/route.ts", "utf8");
  const inicio = rota.indexOf("if (input.action === \"collect_auxiliary\")");
  const bloco = rota.slice(inicio, rota.indexOf("const repository = new SerpSnapshotRepository(); const history", inicio));

  assert.match(bloco, /A keyword informada não pertence à composição deste artigo/);
  assert.match(bloco, /A keyword principal é coletada pela SERP canônica do artigo/);
  assert.equal(/repository\.save|SerpCollectionRecordSchema/.test(bloco), false, "a auxiliar não vira snapshot do artigo");
  assert.match(bloco, /not_persisted_as_article_snapshot/);
  assert.match(bloco, /version: 1, previousSnapshotId: null/, "a cadeia de versões pertence à SERP canônica");
  assert.match(bloco, /recordIntegrationUsage/, "chamada paga é contabilizada");

  // O texto da keyword é resolvido no servidor, a partir da composição.
  const contrato = readFileSync("lib/radar/serp/request.ts", "utf8");
  const auxiliar = contrato.slice(contrato.indexOf("export const CollectAuxiliaryRequestSchema"));
  assert.match(auxiliar, /keywordId: z\.string\(\)\.min\(1\)/);
  assert.equal(/keyword: z\.string/.test(auxiliar.slice(0, auxiliar.indexOf("});"))), false, "o cliente não manda texto de consulta");

  // E o transporte não contamina a cadeia canônica de snapshots.
  const pipeline = readFileSync("components/editorial-pipeline-context.tsx", "utf8");
  const corpo = pipeline.slice(pipeline.indexOf("collectAuxiliarySerp: async"), pipeline.indexOf("saveRadarAnalysis: async"));
  assert.equal(/updateWorkspace|saveLocalSerpRecovery/.test(corpo), false, "a pesquisa auxiliar não escreve na cadeia de snapshots do artigo");
  assert.equal(/SerpCollectionRecordSchema/.test(corpo), false, "e não vira registro de coleta do artigo");
  assert.match(corpo, /SerpResearchSnapshotSchema\.parse\(body\.research\)/);
});

/*
 * ==============  23 · NENHUM FUNDAMENTO É IGNORADO EM SILÊNCIO  ===========
 */

test("23 · todo fundamento resolvido tem uso declarado e consumidor nomeado", () => {
  const context = contexto();
  const observados = [
    ...Object.keys(context.keywords[0].strategy).map(chave => `keywords[].strategy.${chave}`),
    "keywords[].identity.text",
    "keywords[].identity.role",
    "keywords[].resolution",
    "article.articleDnaVersionId",
    "article.promise",
    "article.mainIntent",
    "article.hierarchy",
    "editorialTopics",
    "resolvedKeywordTexts",
    "limitations",
    "silo.siloDnaVersionId",
    "silo.siloPageCanonical",
    "silo.articleRole",
    "formationSerp.verdict",
    "formationSerp.humanResolution",
    "formationSerp.keywordUrls",
    "internalLinks.edges",
    "internalLinks.edges[].anchorConcepts",
  ];

  assert.deepEqual(radarUnmappedFoundationFields(observados), [], "todo campo observado precisa de categoria declarada");

  for (const entrada of RADAR_FOUNDATION_USAGE_MAP) {
    assert.ok(entrada.usage.length > 0, `${entrada.field} sem categoria de uso`);
    assert.ok(entrada.consumers.length > 0, `${entrada.field} sem consumidor nomeado`);
    assert.ok(entrada.note.length > 0, `${entrada.field} sem explicação`);
  }

  // "Disponível e ignorado em silêncio" não é uma categoria aceitável.
  const fonte = readFileSync("lib/radar/foundation-usage-map.ts", "utf8");
  assert.equal(/"AVAILABLE_BUT_SILENTLY_IGNORED"/.test(fonte), false);
});

/*
 * ==================  18 · O RESUMO DA INVESTIGAÇÃO  ======================
 */

test("18 · o resumo conta o que foi observado e declara o que não pôde afirmar", () => {
  const context = contexto();
  const view = buildRadarDeepResearchView({
    context,
    snapshot: { query: principal.texto, organicResults: [] },
    extractions: [],
    selectedReferences: 0,
  });

  assert.equal(view.summary.articleKeywords, KEYWORDS.length);
  assert.equal(view.summary.queriesPlanned, KEYWORDS.length);
  assert.equal(view.summary.relatedInternalPages, 2);
  assert.ok(view.summary.limitations.length > 0, "o que não pôde ser afirmado é dito, não escondido");
  assert.equal(view.state, "NOT_STARTED");
  assert.equal(view.action.id, "START_DEEP_RESEARCH");
  assert.equal(view.sufficiency.level, "BLOCKED", "sem curadoria confirmada não existe leitura competitiva");
});
