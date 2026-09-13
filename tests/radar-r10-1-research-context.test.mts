import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarArticleResearchContext, radarKeywordsByRole } from "../lib/radar/article-research-context.ts";
import { buildRadarCompetitiveReport } from "../lib/radar/competitive-report.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { classifyRadarTopic } from "../lib/radar/topic-classification.ts";
import { buildRadarFoundationSections, buildRadarKeywordProfile, radarDeclaredCommercialSignal, radarFieldStateLabel } from "../lib/radar/foundation-profiles.ts";
import { importArticlesToRadar, RadarItemSchema, type RadarItem } from "../lib/editorial/operational-flow.ts";
import { RadarAnalysisPayloadSchema, RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { SerpResearchSnapshot } from "../lib/radar/serp/contracts.ts";

/*
 * O CONTEXTO QUE JÁ CHEGAVA, AGORA RESOLVIDO.
 *
 * A referência do Arquiteto tem os números e não tem o texto; a hidratação tem
 * o texto e não tem os números; e a hidratação descartava em silêncio qualquer
 * keyword sem linha do Minerador. Estes testes fixam a junção — e a regra de
 * que nenhuma keyword some.
 */
const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const outraMarca = "22222222-2222-4222-8222-222222222222";
const articleId = "article-skin-care-principia";
const articleDnaVersionId = "4bfca609-0e2e-4d50-8797-5d387adb4849";
const HASH = "sha256:" + "c".repeat(64);

const KEYWORDS = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", texto: "skin care principia", role: "principal" as const, volume: 2400 },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", texto: "skin care loreal", role: "secundaria" as const, volume: 880 },
  { id: "aaaaaaaa-0000-4000-8000-000000000003", texto: "rotina de skin care", role: "secundaria" as const, volume: 720 },
  { id: "aaaaaaaa-0000-4000-8000-000000000004", texto: "skin care para pele oleosa", role: "secundaria" as const, volume: 590 },
  { id: "aaaaaaaa-0000-4000-8000-000000000005", texto: "creme hidratante facial", role: "reforco_narrativo" as const, volume: 320 },
];
const principal = KEYWORDS[0];

const referencia = (kw: typeof KEYWORDS[number]) => ({
  keywordId: kw.id, keywordDnaVersionId: `kwdna-${kw.id}`, keywordDnaContentHash: HASH, role: kw.role,
  strategicContribution: `Contribuição de ${kw.texto}`, coveredIntentions: ["informacional"],
  requiredTopics: [kw.texto], excludedTopics: [], classificationOrigin: "human" as const, confidence: 0.8,
  humanConfirmed: true, normalizedIntent: "informational" as const,
  volume: kw.volume, resultCount: 190, kgrScore: 0.08,
  incrementalVolume: kw.role === "principal" ? null : kw.volume,
  contribution: kw.role === "principal" ? "central" as const : "incremental_volume" as const,
  purpose: "Cobrir a intenção declarada", overlapRisk: "low" as const,
});

const snapshotHidratado = (kw: typeof KEYWORDS[number]) => ({
  referenceKeywordId: kw.id, canonicalKeywordId: kw.id, sourceKeywordId: kw.id, originalKeywordId: kw.id,
  aliases: [], keywordDnaVersionId: `kwdna-${kw.id}`, keyword: kw.texto, role: kw.role,
  brandId, siloId: "silo-skincare-oleosa", siloName: "Skin care para peles oleosas", isPublished: false,
});

const silo = {
  id: "silo-skincare-oleosa", name: "Skin care para peles oleosas", siloDnaVersionId: "silodna-v3",
  siloDnaContentHash: HASH, territoryRef: "territorio-1", siloPageId: "silopage-1",
  siloPageVersionId: "silopage-v2", siloPageSlug: "/skin-care-peles-oleosas",
  siloPageCanonical: "https://exemplo.com.br/skin-care-peles-oleosas",
  siloPagePublicationStatus: "published", articleRole: "pillar" as const,
};

const radarItem = (patch: Record<string, unknown> = {}, hidratadas = KEYWORDS): RadarItem => RadarItemSchema.parse({
  id: `radar:${articleId}`, brandId, articleId, articleDnaVersionId, articleDnaContentHash: HASH,
  title: "Cobrir com clareza o tema skin care principia", slug: "skin-care-principia",
  siloId: "silo-skincare-oleosa", hierarchy: "Pilar", principalKeywordId: principal.id, format: "Pilar",
  intent: "informacional", state: "research_pending", importedAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z", origin: "local", lockVersion: 1,
  hydration: {
    schemaVersion: 1, brandId, articleId, articleDnaVersionId, source: "arquiteto_import",
    capturedAt: "2026-09-07T10:00:00.000Z", principalKeywordId: principal.id,
    principalKeyword: snapshotHidratado(principal),
    keywordSnapshots: hidratadas.map(snapshotHidratado), silo,
  },
  arquitetoKeywordDnaReferences: KEYWORDS.map(referencia),
  arquitetoKeywordUrlRelations: { [principal.id]: "confirmed_primary" },
  arquitetoSerpProvenance: {
    assessmentId: "assessment-1", formationBaseHash: HASH, verdict: "DIVERGENCE",
    humanResolution: { decision: "seguir", reason: "a divergência foi avaliada e aceita", decidedBy: "ator-1", decidedAt: "2026-09-07T09:30:00.000Z" },
  },
  arquitetoInternalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v4", graphContentHash: HASH,
    edges: [{ sourceNodeId: "n-pilar", targetNodeId: "n-suporte", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["rotina de skincare"], reason: "silo", priority: "HIGH", direction: "outbound" }],
  },
  ...patch,
});

const articleDna = (marca = brandId): ArticleDNA => ({
  schemaVersion: 1, articleId, brandId: marca, principalKeywordId: principal.id,
  secondaryKeywordIds: KEYWORDS.filter(kw => kw.role === "secundaria").map(kw => kw.id),
  narrativeReinforcementIds: KEYWORDS.filter(kw => kw.role === "reforco_narrativo").map(kw => kw.id),
  keywordReferences: KEYWORDS.map(referencia), siloId: "silo-skincare-oleosa", hierarchy: "Pilar",
  suggestedSlug: "skin-care-principia", canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
  audience: "Pele oleosa", problem: "Rotina indefinida", desiredResult: "Rotina clara", journeyStage: "consideracao",
  brandObjective: "Autoridade", promise: "Cobrir com clareza o tema skin care principia", angle: "Prático",
  cta: "Conhecer", coverage: ["rotina de skincare", "pele oleosa"], excludedSubjects: [],
  antiCannibalizationBoundary: "Sem maquiagem", nearbyArticleIds: [], differentiation: ["Passo a passo"],
  entities: ["Principia"], requiredTopics: ["rotina de skincare"], questions: ["quantas vezes usar?"],
  objections: ["preço"], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [],
  confidence: 0.7, humanPendingDecisions: [],
} as unknown as ArticleDNA);

const envelope = (marca = brandId): VersionEnvelope<ArticleDNA> => ({
  versionId: articleDnaVersionId, entityId: articleId, versionNumber: 7, previousVersionId: null,
  contentHash: HASH, origin: "human", changeReason: "fixture", createdAt: "2026-09-07T09:00:00.000Z",
  createdBy: "auditor", payload: articleDna(marca),
} as VersionEnvelope<ArticleDNA>);

/* ------------------------------- A, B, C, R ------------------------------ */

test("A e R · cinco referências com cinco hidratações resolvem cinco keywords", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });
  assert.equal(context.keywords.length, KEYWORDS.length);
  assert.equal(context.keywords.length, radarItem().arquitetoKeywordDnaReferences?.length, "a conta fecha com as referências");
  assert.ok(context.keywords.every(keyword => keyword.resolution === "FULL"));
  assert.deepEqual(context.resolvedKeywordTexts.sort(), KEYWORDS.map(kw => kw.texto).sort());
});

test("B e C · com uma hidratação só, as cinco permanecem — quatro como PARTIAL", () => {
  const context = buildRadarArticleResearchContext({
    item: radarItem({}, [principal]), article: envelope(),
  });

  assert.equal(context.keywords.length, KEYWORDS.length, "nenhuma keyword some");
  assert.equal(context.keywords.filter(keyword => keyword.resolution === "FULL").length, 1);
  assert.equal(context.keywords.filter(keyword => keyword.resolution === "PARTIAL").length, KEYWORDS.length - 1);
  assert.equal(context.keywords.filter(keyword => keyword.resolution === "UNRESOLVED").length, 0);

  // O texto ausente não vira id, e a ausência é declarada.
  for (const keyword of context.keywords.filter(item => item.resolution === "PARTIAL")) {
    assert.equal(keyword.identity.text, null);
    assert.notEqual(keyword.identity.text, keyword.identity.keywordId);
  }
  assert.ok(context.limitations.some(item => /não teve o texto resolvido/.test(item)));
  assert.equal(context.state, "PARTIAL");
});

/* ---------------------------------- D ------------------------------------ */

test("D · a principal é única, e o Radar não escolhe outra", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });
  assert.equal(radarKeywordsByRole(context, "principal").length, 1);

  const semPrincipal = radarItem({ arquitetoKeywordDnaReferences: KEYWORDS.slice(1).map(referencia) });
  const contextoSemPrincipal = buildRadarArticleResearchContext({ item: semPrincipal, article: envelope() });
  assert.equal(radarKeywordsByRole(contextoSemPrincipal, "principal").length, 0);
  assert.ok(contextoSemPrincipal.limitations.some(item => /não declara nenhuma keyword principal/.test(item)));

  const duasPrincipais = radarItem({
    arquitetoKeywordDnaReferences: [referencia(principal), { ...referencia(KEYWORDS[1]), role: "principal" as const }],
  });
  const contextoDuas = buildRadarArticleResearchContext({ item: duasPrincipais, article: envelope() });
  assert.ok(contextoDuas.limitations.some(item => /2 keywords principais/.test(item)));
});

/* -------------------------------- E e F ---------------------------------- */

test("E e F · secundárias e reforços têm o MESMO envelope estratégico da principal", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });

  for (const papel of ["secundaria", "reforco_narrativo"] as const) {
    const keywords = radarKeywordsByRole(context, papel);
    assert.ok(keywords.length > 0, `existem keywords com papel ${papel}`);
    for (const keyword of keywords) {
      assert.equal(typeof keyword.identity.text, "string");
      assert.equal(typeof keyword.strategy.volume, "number");
      assert.equal(typeof keyword.strategy.resultCount, "number");
      assert.equal(typeof keyword.strategy.kgrScore, "number");
      assert.equal(keyword.strategy.normalizedIntent, "informational");
      assert.ok(keyword.strategy.coveredIntentions.length);
      assert.ok(keyword.strategy.strategicContribution);
      assert.equal(keyword.provenance.strategySource, "article_reference");
      // O campo é projetado sempre; nesta fixture o Arquiteto não anexou o snapshot.
      assert.ok("keywordDnaSnapshot" in keyword.strategy, "o snapshot do KeywordDNA é projetado quando existe");
    }
  }
});

/* -------------------------------- G e H ---------------------------------- */

const pagina = (position: number) => RadarExtractionPageSchema.parse({
  id: `page-${position}`, url: `https://exemplo-${position}.com.br/artigo`, status: "success",
  fetchedAt: "2026-09-07T11:00:00.000Z", title: `Artigo ${position}`, metaDescription: "", canonical: null,
  h1: ["Skin care"], h2: ["Como montar a rotina"], h3: [], wordCount: 1400, internalLinkCount: 8,
  externalLinkCount: 2, listCount: 3, tableCount: 0, faqCount: 0, imageCount: 5, blockquoteCount: 0,
  comparisonCount: 0, hasDates: true, author: null, structuredDataTypes: ["Article"], boldCount: 9,
  italicCount: 0, error: "", headingOutline: [{ level: 2, text: "Como montar a rotina" }],
  paragraphCount: 14, paragraphWordCounts: [90, 70], introWordCount: 90, closingWordCount: 70, hasClosing: true,
  recurringTerms: KEYWORDS.map(kw => ({ term: kw.texto, frequency: 6, pageCount: 3, pageIds: [`page-${position}`], sources: ["body" as const] })),
});

const research = (): SerpResearchSnapshot => ({
  id: "serp:audit:v1", brandId, articleId, articleDnaVersionId, keywordId: principal.id,
  keywordDnaVersionId: `kwdna-${principal.id}`, query: principal.texto, location: "Brasil", language: "pt",
  device: "desktop", provider: "dataforseo", version: 1, previousSnapshotId: null,
  contentHash: "sha256:" + "a".repeat(64), collectedAt: "2026-09-07T10:00:00.000Z", origin: "real",
  isMock: false,
  // Três resultados orgânicos que casam com as três páginas extraídas: sem eles
  // nenhuma página é "principal" e o benchmark fica vazio.
  organicResults: [1, 2, 3].map(position => ({
    position, title: `Artigo ${position}`, url: `https://exemplo-${position}.com.br/artigo`,
    domain: `exemplo-${position}.com.br`, snippet: "trecho", sitelinks: [], date: null,
    inferredType: "article", confidence: "medium", manualType: null, notes: "",
  })),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], recurringTitlePatterns: [], questions: [], possibleConflicts: [], opportunities: [], verdict: "coerente", confidence: "high" },
  humanDecisionRequired: true,
} as unknown as SerpResearchSnapshot);

test("G e H · o relatório observa os TEXTOS resolvidos, e nenhum id vira termo", async () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId, articleId, articleDnaVersionId, serpSnapshotId: "serp:audit:v1",
    serpSnapshotVersion: 1, serpSnapshotHash: "sha256:" + "a".repeat(64), mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "",
    serpDecisions: [1, 2, 3].map(position => ({ key: `organic:${position}`, itemType: "organic" as const, decision: "included" as const, reason: "Concorrente selecionado pelo usuário.", note: "", ownDomain: false })),
    selectedCompetitorIds: ["organic:1", "organic:2", "organic:3"],
    extractionIds: ["page-1", "page-2", "page-3"], extractions: [1, 2, 3].map(pagina),
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    competitiveReport: null, plannerPackage: null, plannerTransfer: null, status: "draft",
    humanNotes: [], approvedAt: null, approvedBy: null,
  });

  const report = await buildRadarCompetitiveReport({
    payload, article: articleDna(), research: research(), researchContext: context,
    radarItemId: "radar:audit", analysisVersionId: "analysis-v1", analysisVersionNumber: 1,
    generatedBy: "auditor", status: "draft",
  });

  assert.ok(report.profile.comparableCount > 0, `comparaveis=${report.profile.comparableCount} excluidas=${report.profile.excludedCount} limites=${JSON.stringify(report.profile.limitations)}`);
  const observados = [...new Set(report.keywordObservations.map(item => item.term))];
  for (const kw of KEYWORDS) {
    assert.ok(observados.includes(kw.texto), `${kw.texto} é observado pelo texto`);
    assert.equal(observados.includes(kw.id), false, `o id de ${kw.texto} nunca aparece`);
  }
});

/* -------------------------------- I e J ---------------------------------- */

test("I e J · editorialTopics chega ao modelo e muda a classificação", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });
  assert.ok(context.editorialTopics.includes("rotina de skincare"), "vem de requiredTopics e coverage do ArticleDNA");
  assert.ok(context.editorialTopics.includes("pele oleosa"));

  const semContexto = classifyRadarTopic({ topic: "Camadas de hidratação da pele", pages: 1, sampleSize: 7, context: { query: principal.texto } });
  const comContexto = classifyRadarTopic({ topic: "Camadas de hidratação da pele", pages: 1, sampleSize: 7, context: { query: principal.texto, editorialTopics: ["rotina de hidratação da pele"] } });
  assert.equal(semContexto.classification, "ISOLATED_TOPIC");
  assert.equal(comContexto.classification, "COMPETITIVE_GAP");

  const model = buildRadarCompetitiveModel({ pages: [1, 2, 3].map(pagina), query: principal.texto, editorialTopics: context.editorialTopics });
  assert.ok(model.classifiedTopics.length > 0);

  /* Desde o Gate 9 quem fornece é a view — autoridade única do modelo. */
  const leitura = readFileSync(new URL("../lib/radar/deep-research-view.ts", import.meta.url), "utf8");
  assert.ok(leitura.includes("editorialTopics: context.editorialTopics"), "a leitura única fornece o parâmetro");
});

/* ------------------------------ K, L, M, N ------------------------------- */

test("K e L · a SERP de formação e a decisão humana chegam ao contexto", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });

  assert.equal(context.formationSerp?.assessmentId, "assessment-1");
  assert.equal(context.formationSerp?.verdict, "DIVERGENCE");
  assert.equal(context.formationSerp?.formationBaseHash, HASH);
  assert.equal(context.formationSerp?.humanResolution?.decision, "seguir");
  assert.match(String(context.formationSerp?.humanResolution?.reason), /avaliada e aceita/);
  assert.equal(context.formationSerp?.keywordUrls.length, 1, "as relações keyword→URL da formação chegam");
});

test("M e N · Silo, SiloPage e grafo de links chegam ao contexto", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });

  assert.equal(context.silo?.siloDnaVersionId, "silodna-v3");
  assert.equal(context.silo?.siloPageSlug, "/skin-care-peles-oleosas");
  assert.equal(context.silo?.siloPagePublicationStatus, "published");
  assert.equal(context.silo?.articleRole, "pillar");
  assert.equal(context.silo?.hierarchy, "Pilar");

  assert.equal(context.internalLinks?.graphVersionId, "graph-v4");
  assert.equal(context.internalLinks?.edges.length, 1);
  assert.deepEqual(context.internalLinks?.edges[0].anchorConcepts, ["rotina de skincare"]);
  assert.equal(context.internalLinks?.edges[0].relationType, "PILLAR_TO_SUPPORT");
});

/* -------------------------------- O e P ---------------------------------- */

test("O · o contexto é leitura: não altera principal, silo, slug nem grafo", () => {
  const item = radarItem();
  const antes = JSON.stringify(item);
  const context = buildRadarArticleResearchContext({ item, article: envelope() });

  assert.equal(JSON.stringify(item), antes, "a linha do Radar não é mutada");
  assert.equal(context.article.articleDnaVersionId, item.articleDnaVersionId);
  assert.equal(context.silo?.siloId, item.siloId);
  assert.equal(radarKeywordsByRole(context, "principal")[0].identity.keywordId, item.principalKeywordId);

  // O grafo é copiado, não referenciado: mexer no contexto não mexe na origem.
  context.internalLinks!.edges[0].anchorConcepts.push("intruso");
  assert.deepEqual(item.arquitetoInternalLinks?.edges[0].anchorConcepts, ["rotina de skincare"]);

  const fonte = readFileSync(new URL("../lib/radar/article-research-context.ts", import.meta.url), "utf8");
  assert.equal(/fetch\(|localStorage|supabase/i.test(fonte), false, "projeção pura: sem transporte nem storage");
});

test("P · cross-brand continua bloqueado no import", () => {
  assert.deepEqual(importArticlesToRadar([], [envelope(outraMarca)], brandId, "2026-09-07T10:00:00.000Z"), []);
});

/* ---------------------------------- Q ------------------------------------ */

test("Q · linha legada sem os blocos do Arquiteto continua parseando, como PARTIAL", () => {
  const legado = RadarItemSchema.parse({
    id: `radar:${articleId}`, brandId, articleId, articleDnaVersionId, articleDnaContentHash: HASH,
    title: "Artigo legado", slug: "artigo-legado", siloId: "silo-legado", hierarchy: "Suporte",
    principalKeywordId: principal.id, format: "Suporte", intent: "informacional", state: "research_pending",
    importedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z", origin: "local", lockVersion: 1,
  });

  const context = buildRadarArticleResearchContext({ item: legado, article: envelope() });
  assert.equal(context.state, "PARTIAL");
  // Sem referências na linha, o ArticleDNA carregado sustenta a composição.
  assert.equal(context.keywords.length, KEYWORDS.length);
  assert.ok(context.limitations.some(item => /anterior ao transporte das referências/.test(item)));
  assert.equal(context.formationSerp, null);
  assert.equal(context.internalLinks, null);
  assert.ok(context.limitations.some(item => /não recebeu a SERP de formação/.test(item)));
  assert.ok(context.limitations.some(item => /não recebeu o grafo de links internos/.test(item)));
});

/* ------------------- 15 · contrato de consumo do motor ------------------- */

test("CONTRATO · os blocos do Arquiteto deixaram de ter o painel de diagnóstico como único consumidor", () => {
  const contexto = readFileSync(new URL("../lib/radar/article-research-context.ts", import.meta.url), "utf8");
  for (const campo of ["arquitetoKeywordDnaReferences", "arquitetoSerpProvenance", "arquitetoInternalLinks", "arquitetoSerpAssessment", "arquitetoKeywordUrlRelations"]) {
    assert.ok(contexto.includes(campo), `${campo} é consumido pela camada de contexto`);
  }

  // E a camada de contexto alimenta o motor, não só a tela.
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("buildRadarArticleResearchContext({ item: row, article: article || null })"));
  assert.ok(page.includes("researchContext: data.researchContext"), "o relatório recebe o contexto");

  const relatorio = readFileSync(new URL("../lib/radar/competitive-report.ts", import.meta.url), "utf8");
  assert.ok(relatorio.includes("input.researchContext?.resolvedKeywordTexts"));
});

/* ================= FUNDAMENTOS · engine e UI fecham ====================== */

test("UI e ENGINE fecham: cada keyword do contexto tem perfil renderizável", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });

  const ARTICLE_KEYWORD_COUNT = KEYWORDS.length;
  const ENGINE_KEYWORD_COUNT = context.keywords.length;
  const UI_KEYWORD_COUNT = context.keywords.filter(keyword => buildRadarKeywordProfile(keyword).length > 0).length;

  assert.equal(ENGINE_KEYWORD_COUNT, ARTICLE_KEYWORD_COUNT);
  assert.equal(UI_KEYWORD_COUNT, ARTICLE_KEYWORD_COUNT);

  for (const keyword of context.keywords) {
    const perfil = buildRadarKeywordProfile(keyword);
    assert.deepEqual(perfil.map(secao => secao.title), [
      "Identidade", "Leitura lógica", "Demanda", "Competição SEO", "Qualificação semântica", "Proveniência e publicação",
    ], "todo papel recebe o mesmo envelope de leitura");
    assert.ok(perfil.every(secao => secao.fields.length > 0));
  }
});

test("FUNDAMENTOS · keyword parcial continua visível, com a ausência nomeada", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem({}, [principal]), article: envelope() });
  const parcial = context.keywords.find(keyword => keyword.resolution === "PARTIAL")!;
  const identidade = buildRadarKeywordProfile(parcial)[0];

  const keywordField = identidade.fields.find(field => field.label === "Keyword")!;
  assert.equal(keywordField.value, null);
  assert.equal(keywordField.state, "NOT_INFORMED");
  assert.equal(radarFieldStateLabel(keywordField.state), "Não informado");

  // O id continua visível como id — e nunca ocupa o lugar do texto.
  assert.equal(identidade.fields.find(field => field.label === "ID")?.value, parcial.identity.keywordId);
});

test("FUNDAMENTOS · ausência tem tipo: pendente, não informado e não disponível são distintos", () => {
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: envelope() });
  const perfil = buildRadarKeywordProfile(context.keywords[0]);
  const leituraLogica = perfil.find(secao => secao.title === "Leitura lógica")!;

  // Sem snapshot da KeywordDNA incorporado, funil e entidade não existem NESTA versão.
  assert.equal(leituraLogica.fields.find(field => field.label === "Funil")?.state, "NOT_IN_THIS_VERSION");
  assert.equal(radarFieldStateLabel("NOT_IN_THIS_VERSION"), "Não disponível nesta versão");
  assert.equal(radarFieldStateLabel("PENDING"), "Pendente");
  assert.equal(radarFieldStateLabel("NOT_APPLICABLE"), "Não aplicável");

  // Volume incremental não se aplica à principal — e isso é dito, não escondido.
  const demanda = perfil.find(secao => secao.title === "Demanda")!;
  assert.equal(demanda.fields.find(field => field.label === "Volume incremental")?.state, "NOT_APPLICABLE");
});

test("FUNDAMENTOS · as quatro seções de leitura do artigo existem e nomeiam o que falta", () => {
  const secoes = buildRadarFoundationSections(buildRadarArticleResearchContext({ item: radarItem(), article: envelope() }));
  assert.deepEqual(secoes.map(secao => secao.title), ["Article", "Silo", "Formação do artigo", "Arquitetura interna"]);

  const silo = secoes.find(secao => secao.title === "Silo")!;
  assert.equal(silo.fields.find(field => field.label === "SiloPage")?.value, "/skin-care-peles-oleosas");
  const formacao = secoes.find(secao => secao.title === "Formação do artigo")!;
  assert.equal(formacao.fields.find(field => field.label === "Veredito")?.value, "DIVERGENCE");
  assert.equal(formacao.fields.find(field => field.label === "Decisão humana")?.value, "seguir");

  // Linha legada: nada é inventado, tudo é nomeado como ausente.
  const legado = buildRadarFoundationSections(buildRadarArticleResearchContext({
    item: RadarItemSchema.parse({
      id: "radar:legado", brandId, articleId, articleDnaVersionId, articleDnaContentHash: HASH,
      title: "Legado", slug: "legado", siloId: "silo-legado", hierarchy: "Suporte",
      principalKeywordId: principal.id, format: "Suporte", intent: "informacional", state: "research_pending",
      importedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z", origin: "local", lockVersion: 1,
    }),
    article: envelope(),
  }));
  const formacaoLegada = legado.find(secao => secao.title === "Formação do artigo")!;
  assert.ok(formacaoLegada.fields.every(field => field.value === null || field.label === "Relações keyword para URL"));
  assert.equal(formacaoLegada.fields.find(field => field.label === "Veredito")?.state, "NOT_IN_THIS_VERSION");
});

test("ENGINE · a intenção declarada das keywords é consumida na leitura da SERP", () => {
  const comercial = buildRadarArticleResearchContext({
    item: radarItem({ arquitetoKeywordDnaReferences: KEYWORDS.map(kw => ({ ...referencia(kw), normalizedIntent: "transactional" as const })) }),
    article: envelope(),
  });
  const sinal = radarDeclaredCommercialSignal(comercial);
  assert.equal(sinal.expectsCommercialSerp, true);
  assert.equal(sinal.commercialKeywords > 0, true);

  const informacional = radarDeclaredCommercialSignal(buildRadarArticleResearchContext({ item: radarItem(), article: envelope() }));
  assert.equal(informacional.expectsCommercialSerp, false);

  const painel = readFileSync(new URL("../modules/radar/radar-r3-serp-panel.tsx", import.meta.url), "utf8");
  assert.ok(painel.includes("radarDeclaredCommercialSignal(researchContext)"));
  assert.ok(painel.includes('data-testid="radar-commercial-signal"'));
});

test("UI · os fundamentos vivem no card Conteúdo, com resumo e perfil expansível", () => {
  const dossie = readFileSync(new URL("../modules/radar/radar-r3-content-dossier.tsx", import.meta.url), "utf8");
  assert.ok(dossie.includes('data-testid="radar-article-foundations"'));
  assert.ok(dossie.includes("Ver perfil completo"));
  assert.ok(dossie.includes("Ver Silo, hierarquia, links internos"));
  assert.ok(dossie.includes("buildRadarKeywordProfile"));
  assert.ok(dossie.includes("buildRadarFoundationSections"));
  // A mesma projeção alimenta a leitura e o motor: nenhuma segunda interpretação.
  assert.ok(dossie.includes("RadarArticleResearchContext"));
  /*
   * GATE 14 · o resumo vem antes do perfil, e vem de uma projeção só.
   *
   * O Radar lê o Article; ele não o forma. Por isso a primeira camada é um
   * resumo de dez fatos, e o contrato inteiro fica um clique atrás.
   */
  assert.ok(dossie.includes('data-testid="radar-article-dna-summary"'));
  assert.ok(dossie.includes("buildRadarArticleDnaSummary"));
  assert.ok(dossie.includes("radarKeywordLines"));
});
