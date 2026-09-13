import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importArticlesToRadar } from "../lib/editorial/operational-flow.ts";
import { createRadarHydrationSnapshot } from "../lib/radar/hydration.ts";
import { buildRadarCompetitiveReport } from "../lib/radar/competitive-report.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { classifyRadarTopic } from "../lib/radar/topic-classification.ts";
import { RadarAnalysisPayloadSchema, RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { SerpResearchSnapshot } from "../lib/radar/serp/contracts.ts";

/*
 * R10 · DIAGNÓSTICO. NÃO CORRIGE NADA.
 *
 * Estes testes existem para transformar inferência em prova: eles descrevem o
 * comportamento ATUAL, inclusive onde ele está errado. Quando a correção vier,
 * é aqui que a mudança de comportamento aparece.
 */
const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const outraMarca = "11111111-1111-4111-8111-111111111111";
const articleId = "article-skin-care-principia";
const articleDnaVersionId = "4bfca609-0e2e-4d50-8797-5d387adb4849";

/** Cinco keywords, como a UI mostra para "skin care principia". */
const KEYWORDS = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", texto: "skin care principia", role: "principal" as const },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", texto: "skin care loreal", role: "secundaria" as const },
  { id: "aaaaaaaa-0000-4000-8000-000000000003", texto: "rotina de skin care", role: "secundaria" as const },
  { id: "aaaaaaaa-0000-4000-8000-000000000004", texto: "skin care para pele oleosa", role: "secundaria" as const },
  { id: "aaaaaaaa-0000-4000-8000-000000000005", texto: "creme hidratante facial", role: "reforco_narrativo" as const },
];

const principal = KEYWORDS[0];
const secundarias = KEYWORDS.filter(item => item.role === "secundaria");
const reforcos = KEYWORDS.filter(item => item.role === "reforco_narrativo");

const articleDna = (marca = brandId): ArticleDNA => ({
  schemaVersion: 1, articleId, brandId: marca,
  principalKeywordId: principal.id,
  secondaryKeywordIds: secundarias.map(item => item.id),
  narrativeReinforcementIds: reforcos.map(item => item.id),
  keywordReferences: KEYWORDS.map(item => ({
    keywordId: item.id, keywordDnaVersionId: `kwdna-${item.id}`, keywordDnaContentHash: "sha256:" + "c".repeat(64),
    role: item.role, strategicContribution: `Contribuição de ${item.texto}`, coveredIntentions: ["informacional"],
    requiredTopics: [item.texto], excludedTopics: [], classificationOrigin: "human" as const, confidence: 0.8,
    humanConfirmed: true, normalizedIntent: "informational" as const,
    // As MÉTRICAS por keyword existem no contrato da referência.
    volume: item.role === "principal" ? 2400 : 880, resultCount: 190, kgrScore: 0.08,
    incrementalVolume: item.role === "principal" ? null : 880,
    contribution: item.role === "principal" ? "central" as const : "incremental_volume" as const,
    purpose: "Cobrir a intenção declarada", overlapRisk: "low" as const,
  })),
  siloId: "silo-skincare-oleosa", hierarchy: "Pilar", suggestedSlug: "skin-care-principia", canonical: null,
  mainIntent: "informacional", auxiliaryIntents: [], audience: "Quem tem pele oleosa",
  problem: "Não saber montar a rotina", desiredResult: "Rotina definida", journeyStage: "consideracao",
  brandObjective: "Autoridade em skincare", promise: "Cobrir com clareza o tema skin care principia",
  angle: "Prático", cta: "Conhecer a linha", coverage: ["rotina de skincare", "pele oleosa"],
  excludedSubjects: [], antiCannibalizationBoundary: "Não cobrir maquiagem", nearbyArticleIds: [],
  differentiation: ["Passo a passo"], entities: ["Principia"], requiredTopics: ["rotina de skincare"],
  questions: ["quantas vezes usar?"], objections: ["preço"], evidenceNeeded: [], sourcesNeeded: [],
  internalLinks: [], alerts: [], confidence: 0.7, humanPendingDecisions: [],
} as unknown as ArticleDNA);

/*
 * O TEXTO DA KEYWORD SÓ EXISTE SE A LINHA DO MINERADOR VIER JUNTO.
 *
 * `snapshotForReference` devolve null quando não encontra a keyword em
 * `sourceKeywords` — a referência é descartada em silêncio.
 */
const fonteMinerador = (ids: string[]) => KEYWORDS
  .filter(item => ids.includes(item.id))
  .map(item => ({ id: item.id, keywordId: item.id, keyword: item.texto, brandId, siloId: "silo-skincare-oleosa", siloName: "Skin care para peles oleosas", status: "ativo" }));

const todasAsFontes = fonteMinerador(KEYWORDS.map(item => item.id));

const envelope = (marca = brandId): VersionEnvelope<ArticleDNA> => ({
  versionId: articleDnaVersionId, entityId: articleId, versionNumber: 7, previousVersionId: null,
  contentHash: "sha256:" + "b".repeat(64), origin: "human", changeReason: "auditoria",
  createdAt: "2026-09-07T09:00:00.000Z", createdBy: "auditor", payload: articleDna(marca),
} as VersionEnvelope<ArticleDNA>);

/* ===================== FASE 3 · o que atravessa o handoff ================= */

test("U · as cinco keywords do ArticleDNA fecham com as cinco transportadas", () => {
  const [item] = importArticlesToRadar([], [envelope()], brandId, "2026-09-07T10:00:00.000Z", todasAsFontes);

  assert.equal(item.hydration?.keywordSnapshots.length, KEYWORDS.length, "nenhuma keyword some no transporte");
  assert.equal(item.arquitetoKeywordDnaReferences?.length, KEYWORDS.length);
  assert.deepEqual(
    item.hydration?.keywordSnapshots.map(snap => snap.role).sort(),
    KEYWORDS.map(kw => kw.role).sort(),
    "os papéis chegam preservados",
  );
});

test("C e D · a principal aparece uma vez; secundárias e reforços não desaparecem", () => {
  const [item] = importArticlesToRadar([], [envelope()], brandId, "2026-09-07T10:00:00.000Z", todasAsFontes);
  const papeis = item.hydration!.keywordSnapshots.map(snap => snap.role);

  assert.equal(papeis.filter(role => role === "principal").length, 1);
  assert.equal(papeis.filter(role => role === "secundaria").length, secundarias.length);
  assert.equal(papeis.filter(role => role === "reforco_narrativo").length, reforcos.length);
  assert.equal(item.principalKeywordId, principal.id);
});

test("TRANSPORTE · o snapshot de keyword carrega identidade, e nenhuma métrica", () => {
  const snapshot = createRadarHydrationSnapshot({
    brandId, article: envelope(), sourceKeywords: todasAsFontes, source: "arquiteto_import", capturedAt: "2026-09-07T10:00:00.000Z",
  })!;
  const chaves = Object.keys(snapshot.keywordSnapshots[0] || {}).sort();

  assert.deepEqual(chaves, [
    "aliases", "brandId", "canonicalKeywordId", "isPublished", "keyword", "keywordDnaVersionId",
    "originalKeywordId", "referenceKeywordId", "role", "siloId", "siloName", "sourceKeywordId",
  ], "doze campos, todos de identificação");

  /*
   * A prova do R9.5, agora mecânica: nenhuma métrica, nenhuma classificação e
   * nenhuma evidência de SERP atravessa este contrato — nem para a principal.
   */
  for (const metrica of [
    "volumeSearch", "resultCount", "kgrScore", "kgrIdentity", "searchIntent", "likelyEditorialType",
    "centralEntity", "modifiers", "demandEvidence", "siteEvidence", "cpc", "kd", "trend",
    "audience", "journeyStage", "commercialPotential", "keywordUrlRelation",
  ]) {
    assert.equal(chaves.includes(metrica), false, `${metrica} não atravessa o handoff`);
  }
});

test("TRANSPORTE · referência sem linha do Minerador é DESCARTADA em silêncio", () => {
  /*
   * O achado mais duro desta auditoria.
   *
   * Sem NENHUMA fonte, a hidratação inteira vira null: a linha do Radar fica
   * sem contexto de keyword algum, nem identidade.
   */
  assert.equal(createRadarHydrationSnapshot({
    brandId, article: envelope(), sourceKeywords: [], source: "arquiteto_import", capturedAt: "2026-09-07T10:00:00.000Z",
  }), null, "sem fonte do Minerador não existe hidratação");

  /*
   * Com a fonte de UMA keyword, as outras quatro somem da hidratação — e
   * continuam contadas em arquitetoKeywordDnaReferences. As duas contagens
   * deixam de fechar, sem erro e sem aviso.
   */
  const [item] = importArticlesToRadar([], [envelope()], brandId, "2026-09-07T10:00:00.000Z", fonteMinerador([principal.id]));
  assert.equal(item.hydration?.keywordSnapshots.length, 1);
  assert.equal(item.arquitetoKeywordDnaReferences?.length, KEYWORDS.length);
  assert.notEqual(item.hydration?.keywordSnapshots.length, item.arquitetoKeywordDnaReferences?.length,
    "referência sobrevive; contexto da keyword não");
});

test("O · artigo de outra marca não é importado para esta marca", () => {
  const importados = importArticlesToRadar([], [envelope(outraMarca)], brandId, "2026-09-07T10:00:00.000Z");
  assert.deepEqual(importados, [], "cross-brand é bloqueado como esperado");
});

test("CORREÇÃO R9.5 · a referência de keyword transporta métricas, não só identidade", () => {
  const [item] = importArticlesToRadar([], [envelope()], brandId, "2026-09-07T10:00:00.000Z", todasAsFontes);
  const referencias = item.arquitetoKeywordDnaReferences || [];

  /*
   * O R9.5 afirmou que arquitetoKeywordDnaReferences era
   * { keywordId, keywordDnaVersionId, role }. Está errado: o contrato carrega
   * volume, resultCount, kgrScore, intenção normalizada, contribuição
   * estratégica, tópicos e — opcionalmente — o KeywordDNA inteiro em
   * keywordDnaSnapshot. A inteligência ATRAVESSA e É PERSISTIDA.
   */
  assert.equal(referencias.length, KEYWORDS.length);
  for (const referencia of referencias) {
    assert.equal(typeof referencia.volume, "number", "volume atravessa por keyword");
    assert.equal(typeof referencia.resultCount, "number", "resultCount atravessa por keyword");
    assert.equal(typeof referencia.kgrScore, "number", "kgrScore atravessa por keyword");
    assert.ok(referencia.coveredIntentions.length, "intenções cobertas atravessam");
    assert.ok(referencia.strategicContribution, "a contribuição estratégica atravessa");
  }

  // E o contrato ainda admite o KeywordDNA completo por referência.
  const contrato = readFileSync(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  const bloco = contrato.slice(contrato.indexOf("export const ArticleKeywordReferenceSchema"), contrato.indexOf("export type ArticleKeywordReference"));
  for (const campo of ["volume", "resultCount", "kgrScore", "keywordDnaSnapshot", "demandEvidence", "keywordUrlRelation", "normalizedIntent"]) {
    assert.ok(bloco.includes(campo), `${campo} está no contrato da referência`);
  }
});

test("M · o RadarItem emitido preserva os blocos do Arquiteto que o handoff monta", () => {
  const [item] = importArticlesToRadar([], [envelope()], brandId, "2026-09-07T10:00:00.000Z", todasAsFontes);

  assert.ok(item.arquitetoKeywordDnaReferences, "referências de KeywordDNA persistem");
  assert.ok(item.arquitetoStrategyContext, "contexto estratégico persiste");
  // Sem handoffContext, estes três chegam vazios — a origem é o emissor, não o schema.
  assert.equal(item.arquitetoSerpProvenance ?? null, null);
  assert.equal(item.arquitetoInternalLinks ?? null, null);
  assert.equal(item.arquitetoSerpAssessment ?? null, null);
});

/* =============== FASE 10 · keywordId tratado como texto ================== */

const research = (): SerpResearchSnapshot => ({
  id: "serp:audit:v1", brandId, articleId, articleDnaVersionId,
  keywordId: principal.id, keywordDnaVersionId: `kwdna-${principal.id}`, query: principal.texto,
  location: "Brasil", language: "pt", device: "desktop", provider: "dataforseo",
  version: 1, previousSnapshotId: null, contentHash: "sha256:" + "a".repeat(64),
  collectedAt: "2026-09-07T10:00:00.000Z", origin: "real", isMock: false,
  organicResults: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], recurringTitlePatterns: [], questions: [], possibleConflicts: [], opportunities: [], verdict: "coerente", confidence: "high" },
  humanDecisionRequired: true,
} as unknown as SerpResearchSnapshot);

const paginaComTermos = (position: number) => RadarExtractionPageSchema.parse({
  id: `page-${position}`, url: `https://exemplo-${position}.com.br/artigo`, status: "success",
  fetchedAt: "2026-09-07T11:00:00.000Z", title: `Artigo ${position}`, metaDescription: "", canonical: null,
  h1: ["Skin care"], h2: ["Como montar a rotina", "Benefícios"], h3: [], wordCount: 1400,
  internalLinkCount: 8, externalLinkCount: 2, listCount: 3, tableCount: 0, faqCount: 0, imageCount: 5,
  blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null, structuredDataTypes: ["Article"],
  boldCount: 9, italicCount: 0, error: "",
  headingOutline: [{ level: 2, text: "Como montar a rotina" }, { level: 2, text: "Benefícios" }],
  paragraphCount: 14, paragraphWordCounts: [90, 70], introWordCount: 90, closingWordCount: 70, hasClosing: true,
  // Os TEXTOS reais das keywords aparecem no corpo das páginas.
  recurringTerms: KEYWORDS.map(kw => ({
    term: kw.texto, frequency: 6, pageCount: 3, pageIds: [`page-${position}`], sources: ["body" as const],
  })),
});

test("R · o relatório compara termos extraídos contra IDs, não contra o texto das keywords", async () => {
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId, articleId, articleDnaVersionId,
    serpSnapshotId: "serp:audit:v1", serpSnapshotVersion: 1, serpSnapshotHash: "sha256:" + "a".repeat(64),
    mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["auditoria"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", serpDecisions: [], selectedCompetitorIds: [],
    extractionIds: ["page-1", "page-2", "page-3"], extractions: [1, 2, 3].map(paginaComTermos),
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    competitiveReport: null, plannerPackage: null, plannerTransfer: null, status: "draft",
    humanNotes: [], approvedAt: null, approvedBy: null,
  });

  const report = await buildRadarCompetitiveReport({
    payload, article: articleDna(), research: research(), radarItemId: "radar:audit",
    analysisVersionId: "analysis-v1", analysisVersionNumber: 1, generatedBy: "auditor", status: "draft",
  });

  const observados = report.keywordObservations.map(item => item.term);

  /*
  /*
   * CORRIGIDO NO R10.1.
   *
   * Sem contexto resolvido, o relatório não observa keyword nenhuma — e é
   * isso que este caso descreve. O ID NUNCA é usado como texto.
   */
  for (const kw of [...secundarias, ...reforcos, principal]) {
    assert.equal(observados.includes(kw.id), false, `o id de ${kw.texto} nunca aparece como termo`);
  }

  const fonte = readFileSync(new URL("../lib/radar/competitive-report.ts", import.meta.url), "utf8");
  assert.equal(fonte.includes("keywordReferences.map(reference => reference.keywordId)"), false, "o id deixou de alimentar keywordTerms");
  assert.ok(fonte.includes("const textosResolvidos = input.researchContext?.resolvedKeywordTexts"), "os textos resolvidos entraram no lugar");
  assert.ok(report.summary.limitations.some(item => /contexto resolvido do artigo não foi fornecido/i.test(item)), "sem contexto, a limitação é declarada");
});

/* ============ FASE 10 · editorialTopics existe e não é ligado ============= */

test("S · editorialTopics existe, muda a classificação, e nenhum chamador o fornece", () => {
  const semContexto = classifyRadarTopic({
    topic: "Camadas de hidratação", pages: 1, sampleSize: 7,
    context: { query: "skin care principia" },
  });
  const comContexto = classifyRadarTopic({
    topic: "Camadas de hidratação", pages: 1, sampleSize: 7,
    context: { query: "skin care principia", editorialTopics: ["rotina de hidratação da pele"] },
  });

  assert.equal(semContexto.classification, "ISOLATED_TOPIC");
  assert.equal(comContexto.classification, "COMPETITIVE_GAP", "o parâmetro muda o resultado de verdade");

  // O parâmetro existe no builder…
  const modelo = readFileSync(new URL("../lib/radar/competitive-model.ts", import.meta.url), "utf8");
  assert.match(modelo, /editorialTopics\?: readonly string\[\]/);

  // …e no R10.1 passou a ser fornecido pelo painel, a partir do ArticleDNA.
  /* Desde o Gate 9 quem liga é a view — autoridade única do modelo. */
  const leitura = readFileSync(new URL("../lib/radar/deep-research-view.ts", import.meta.url), "utf8");
  assert.ok(leitura.includes("editorialTopics: context.editorialTopics"), "a leitura única liga o parâmetro");

  const comTopicos = buildRadarCompetitiveModel({
    pages: [1, 2, 3].map(paginaComTermos), query: principal.texto,
    editorialTopics: ["rotina de skincare"],
  });
  assert.ok(comTopicos.classifiedTopics.some(item => item.relevance.editorial), "a relevância editorial passou a ser alcançável");
});

/* ======== FASE 9 · censo de consumidores: motor, UI ou diagnóstico ======== */

const leitores = (campo: string) => {
  const alvos: Record<string, string[]> = {};
  for (const caminho of [
    "../lib/radar/editorial-context.ts", "../lib/radar/competitive-model.ts", "../lib/radar/competitive-report.ts",
    "../lib/radar/serp-curation.ts", "../lib/radar/analysis-contracts.ts", "../lib/radar/topic-classification.ts",
    "../lib/radar/serp-synthesis.ts", "../lib/radar/investigation-sufficiency.ts",
    "../modules/radar/radar-page.tsx", "../modules/radar/radar-r3-serp-panel.tsx",
    "../app/api/editorial/serp/route.ts", "../app/api/editorial/radar-analysis/extract/route.ts",
  ]) {
    const fonte = readFileSync(new URL(caminho, import.meta.url), "utf8");
    if (fonte.includes(campo)) (alvos[campo] ||= []).push(caminho.replace("../", ""));
  }
  return alvos[campo] || [];
};

test("CENSO · os blocos do Arquiteto têm leitor de diagnóstico, não de motor", () => {
  for (const campo of ["arquitetoSerpProvenance", "arquitetoSerpAssessment", "arquitetoInternalLinks", "arquitetoKeywordDnaReferences"]) {
    const encontrados = leitores(campo);
    assert.deepEqual(encontrados, ["lib/radar/editorial-context.ts"], `${campo} só é lido pelo painel de diagnóstico`);
  }

  // Zero leitores em qualquer camada.
  assert.deepEqual(leitores("arquitetoKeywordUrlRelations"), [], "nenhuma camada do Radar lê as relações keyword→URL");
});

test("CENSO · a coleta usa quatro campos do ArticleDNA, e a análise só a principal", () => {
  const rota = readFileSync(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");
  /*
   * GATE 18.5 · A INTENÇÃO CONTINUA SENDO USADA — já não crua.
   *
   * `expectedIntent: article.payload.mainIntent` passava o sentinela "unknown"
   * ao provider e gravava uma lacuna falsa no diagnóstico do snapshot. O campo
   * continua alimentando a coleta; ele agora passa por `radarConclusiveIntent`
   * junto da classificação terminal do Arquiteto.
   */
  assert.match(rota, /radarDeclaredArticleIntent\(article\.payload\)/, "a coleta usa a intenção do ArticleDNA, pela autoridade");
  assert.match(rota, /expectedIntent: intencaoCanonica/, "e a envia ao provider");
  for (const campo of ["requiredTopics: article.payload.requiredTopics", "articleEntities: article.payload.entities", "expectedFormat: article.payload.hierarchy"]) {
    assert.ok(rota.includes(campo), `a coleta usa ${campo}`);
  }
  // A consulta é UMA: a principal resolvida. Secundárias não viram consulta.
  assert.match(rota, /keyword: queryInput\.keyword/);
  assert.equal(/secondaryKeywordIds|narrativeReinforcementIds/.test(rota), false, "nenhuma secundária alimenta a coleta");

  const extracao = readFileSync(new URL("../app/api/editorial/radar-analysis/extract/route.ts", import.meta.url), "utf8");
  assert.match(extracao, /keyword: input\.keyword/);
});

test("CENSO · expectedFormat é transportado e ignorado pelo provider canônico", () => {
  const dataforseo = readFileSync(new URL("../lib/server/dataforseo-serp-normalizer.ts", import.meta.url), "utf8");
  const serper = readFileSync(new URL("../lib/radar/serper-provider-core.ts", import.meta.url), "utf8");

  assert.match(dataforseo, /input\.expectedIntent/);
  assert.equal(/input\.expectedFormat/.test(dataforseo), false, "o provider canônico não lê expectedFormat");
  assert.match(serper, /input\.expectedFormat/);
});

test("ORIGEM · KeywordDNA é derivado em runtime, não é artefato persistido", () => {
  const engine = readFileSync(new URL("../lib/arquiteto/keyword-dna-engine.ts", import.meta.url), "utf8");
  assert.match(engine, /KeywordDNASchema\.parse\(\{/, "o DNA nasce aqui");

  // O CHECK vigente de artifact_type não inclui keyword_dna.
  const migracao = readFileSync(new URL("../supabase/migrations/20260829120000_article_architecture_ai_review_artifact.sql", import.meta.url), "utf8");
  const lista = migracao.slice(migracao.indexOf("check (artifact_type = any (array["), migracao.indexOf("]));"));
  assert.equal(lista.includes("'keyword_dna'"), false, "keyword_dna não é um artifact_type");
  for (const tipo of ["'article_dna'", "'silo_dna'", "'silo_page'"]) {
    assert.ok(lista.includes(tipo), `${tipo} é artefato persistido`);
  }
});
