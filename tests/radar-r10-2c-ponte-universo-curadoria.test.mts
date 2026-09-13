import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarCompetitorUniverse, type RadarExecutedQuery } from "../lib/radar/competitor-universe.ts";
import { buildRadarSerpSelectionProjection, radarAnalysisCandidates, radarOrganicDecisionKey } from "../lib/radar/serp-curation.ts";
import { buildRadarAnalysisMembership } from "../lib/radar/analysis-membership.ts";
import { radarExtractionRefusal, RADAR_EXTRACTION_ERROR } from "../lib/radar/extraction-request.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { RadarExtractionPageSchema, type RadarAnalysisVersion } from "../lib/radar/analysis-contracts.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ================  R10.2C · A PONTE, MEDIDA HOP A HOP  ==================
 *
 * A pergunta do lote: uma URL descoberta APENAS por uma consulta auxiliar
 * consegue atravessar até o relatório?
 *
 * O cenário da seção 4, ao pé da letra:
 *
 *   Principal   → A B C        (SERP canônica do Article)
 *   Secundária1 → B D E        (SERP auxiliar de pesquisa)
 *   Secundária2 → D F          (SERP auxiliar de pesquisa)
 *
 *   CompetitorUniverse → A B C D E F
 *   D não aparece na Principal e é EDITORIAL_COMPETITOR.
 *
 * Cada hop abaixo chama a MESMA função que a tela chama. Nada é simulado.
 *
 * Este arquivo é diagnóstico: ele descreve o comportamento vigente, incluindo
 * o ponto onde a ponte termina. Nenhuma correção foi aplicada neste lote.
 */

const brandId = "b-10-2c";
const articleId = "article-10-2c";
const articleDnaVersionId = "dna-10-2c";
const snapshotId = "serp:canonica:v1";
const snapshotHash = "sha256:" + "e".repeat(58);
const scope = { brandId, articleId, articleDnaVersionId };

const URLS = {
  A: "https://a-editorial.com.br/skincare-pele-oleosa",
  B: "https://b-editorial.com.br/rotina-pele-oleosa",
  C: "https://c-editorial.com.br/limpeza-facial",
  D: "https://d-editorial.com.br/sabonete-pele-oleosa",
  E: "https://e-editorial.com.br/acido-salicilico",
  F: "https://f-editorial.com.br/protetor-solar-oleosa",
};

const resultado = (position: number, url: string) => ({
  position, url, title: `Página ${url}`, domain: new URL(url).hostname, snippet: "trecho", inferredType: "article",
});

/* --------------------------- o universo real ---------------------------- */

const consultas = (): RadarExecutedQuery[] => [
  { queryId: "query:principal", keyword: "skincare para pele oleosa", role: "principal", results: [resultado(1, URLS.A), resultado(2, URLS.B), resultado(3, URLS.C)] },
  { queryId: "query:secundaria-1", keyword: "melhor sabonete para pele oleosa", role: "secundaria", results: [resultado(1, URLS.B), resultado(2, URLS.D), resultado(3, URLS.E)] },
  { queryId: "query:secundaria-2", keyword: "protetor solar para pele oleosa", role: "secundaria", results: [resultado(1, URLS.D), resultado(2, URLS.F)] },
];

const contexto = () => ({
  state: "COMPLETE",
  article: { brandId, articleId, articleDnaVersionId, articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [], editorialTopics: [], resolvedKeywordTexts: [],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const universo = () => buildRadarCompetitorUniverse({ queries: consultas(), context: contexto() });

/* ------------------------ a SERP canônica do Article --------------------- */

const view = (): RadarSerpView => ({
  record: { id: snapshotId },
  version: 1,
  provider: "dataforseo",
  hash: snapshotHash,
  capturedAt: "2026-09-09T10:00:00.000Z",
  source: "merged",
  partial: false,
  /* A canônica contém A, B, C — e só. Isto NÃO deve mudar. */
  organicResults: [resultado(1, URLS.A), resultado(2, URLS.B), resultado(3, URLS.C)].map(item => ({ ...item, isOwnDomain: false })),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], possibleConflicts: [], limitations: [], questions: [], opportunities: [], recurringTitlePatterns: [] },
} as unknown as RadarSerpView);

const analysis = (): RadarAnalysisVersion => ({
  versionId: "analysis-10-2c", entityId: `radar-analysis:${articleId}`, versionNumber: 2, previousVersionId: "analysis-10-2c-v1",
  contentHash: "sha256:analysis", origin: "human", changeReason: "fixture", createdAt: "2026-09-09T10:05:00.000Z", createdBy: "humano",
  payload: {
    schemaVersion: 1, brandId, articleId, articleDnaVersionId,
    serpSnapshotId: snapshotId, serpSnapshotVersion: 1, serpSnapshotHash: snapshotHash,
    mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "",
    /*
     * As decisões nascem de `research.organicResults` — a SERP canônica.
     * Três resultados, três chaves: `organic:1`, `organic:2`, `organic:3`.
     */
    serpDecisions: [1, 2, 3].map(position => ({ key: `organic:${position}`, itemType: "organic" as const, decision: "included" as const, reason: "Concorrente selecionado pelo usuário.", note: "", ownDomain: false })),
    selectedCompetitorIds: ["organic:1", "organic:2", "organic:3"],
    extractionIds: [], extractions: [], extractionFailures: [], deepResearch: null,
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    competitiveReport: null, plannerPackage: null, plannerTransfer: null,
    status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  },
} as unknown as RadarAnalysisVersion);

/*
 * ===================  HOP 1 · DESCOBERTA MULTI-QUERY  ===================
 */

test("HOP 1 · o universo enxerga as seis URLs e promove D a concorrente editorial", () => {
  const resultadoUniverso = universo();
  const urls = resultadoUniverso.candidates.map(item => item.url).sort();
  assert.deepEqual(urls, Object.values(URLS).sort(), "A B C D E F entram no universo");
  assert.equal(resultadoUniverso.uniqueDomains, 6);
  assert.equal(resultadoUniverso.queriesUsed.length, 3);

  const d = resultadoUniverso.candidates.find(item => item.url === URLS.D)!;
  assert.equal(d.classification, "EDITORIAL_COMPETITOR", "D é concorrente editorial");
  assert.equal(d.principalRank, null, "e NÃO aparece na Principal");
  assert.equal(d.queryCount, 2, "aparece em duas consultas auxiliares");
  assert.deepEqual(d.secondaryRanks, [2, 1]);

  const b = resultadoUniverso.candidates.find(item => item.url === URLS.B)!;
  assert.equal(b.principalRank, 2, "B recorre entre a canônica e a auxiliar");
  assert.equal(b.queryCount, 2);

  // MULTI_QUERY_DISCOVERY = YES.
});

/*
 * =====================  HOP 2 · CURADORIA  ==============================
 */

test("HOP 2 · a aba Concorrentes projeta apenas a SERP canônica: D não tem linha", () => {
  const projecao = buildRadarSerpSelectionProjection(view(), analysis(), scope);
  assert.equal(projecao.compatible, true);
  assert.equal(projecao.rows.length, 3, "três linhas — o tamanho da canônica, não do universo");
  assert.deepEqual(projecao.rows.map(row => row.result.url).sort(), [URLS.A, URLS.B, URLS.C].sort());
  assert.equal(projecao.rows.some(row => row.result.url === URLS.D), false, "D não é renderizável na curadoria");

  /*
   * A CAUSA, NA CÉLULA EXATA.
   *
   * `buildRadarSerpSelectionProjection` mapeia `view.organicResults` — e a
   * identidade da decisão é a POSIÇÃO dentro daquele snapshot
   * (`organic:${position}`). Não existe nome para uma URL de outra consulta.
   */
  const fonte = readFileSync("lib/radar/serp-curation.ts", "utf8");
  assert.match(fonte, /const rows = compatible \? view!\.organicResults\.map/);
  assert.match(fonte, /return `organic:\$\{result\.position\}`/);

});

/*
 * ESTE TESTE FOI INVERTIDO PELO R10.2D.
 *
 * Ele nasceu provando a desconexão: a aba de curadoria não conhecia o universo.
 * O lote seguinte construiu a ponte, então o que ele guarda agora é a
 * correção — se a aba voltar a ignorar o universo, ele falha de novo.
 */
test("HOP 2 · a superfície de curadoria passou a enxergar o universo (corrigido no R10.2D)", () => {
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /research-curation/, "a aba lê a curadoria da pesquisa");
  assert.match(painel, /research-reference/, "e as referências do universo");
  assert.match(painel, /data-testid="radar-research-curation"/);

  // E a curadoria canônica continua existindo, na mesma aba, intocada.
  assert.match(painel, /data-testid="radar-canonical-curation"/);
  assert.match(readFileSync("lib/radar/serp-curation.ts", "utf8"), /const rows = compatible \? view!\.organicResults\.map/,
    "a projeção canônica continua sendo a da SERP do artigo");
});

/*
 * =====================  HOP 3 · SELEÇÃO  ================================
 */

test("HOP 3 · a identidade canônica continua posicional e não nomeia D", () => {
  const decisoes = analysis().payload.serpDecisions;
  const chaves = new Set(decisoes.map(decision => decision.key));
  assert.deepEqual([...chaves].sort(), ["organic:1", "organic:2", "organic:3"]);

  // A chave que D teria na SUA consulta colide com a de outra URL na canônica.
  const chaveDeD = radarOrganicDecisionKey({ position: 2 });
  assert.equal(chaveDeD, "organic:2");
  const projecao = buildRadarSerpSelectionProjection(view(), analysis(), scope);
  assert.equal(projecao.rows.find(row => row.key === chaveDeD)?.result.url, URLS.B,
    "a posição 2 já pertence a B na canônica: a identidade é posicional, não por URL");

  const membership = buildRadarAnalysisMembership({ view: view(), analysis: analysis(), scope });
  assert.equal(membership.selected, 3);
  assert.equal(membership.selectedUrls.includes(URLS.D), false);

});

/*
 * =====================  HOP 4 · EXTRAÇÃO  ===============================
 */

test("HOP 4 · a extração recusa uma chave canônica forjada", () => {
  const candidatos = radarAnalysisCandidates(view(), analysis(), scope);
  assert.equal(candidatos.length, 3);
  assert.equal(candidatos.some(candidate => candidate.url === URLS.D), false, "D não é candidato");

  // Forjando um pedido com uma chave que não existe na curadoria:
  const recusa = radarExtractionRefusal({
    brandId, articleId, analysis: analysis(),
    candidates: [{ key: "universe:d", url: URLS.D, itemType: "organic", decision: "included" }],
    snapshotId, snapshotHash,
  } as Parameters<typeof radarExtractionRefusal>[0]);
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.CURATION_STALE);
  assert.match(recusa!.message, /Somente URLs orgânicas já incluídas na curadoria podem ser extraídas/);

});

/*
 * =================  HOP 5 · MODELO COMPETITIVO E RELATÓRIO  =============
 */

/* HOP 5 mede o que continua verdadeiro: o modelo lê extrações. Que D possa
 * virar uma extração é o que o R10.2D acrescenta, e está provado no arquivo
 * daquele lote. */
test("HOP 5 · o modelo competitivo lê extrações — a amostra é que define quem entra", () => {
  const pagina = (id: string, url: string) => RadarExtractionPageSchema.parse({
    id, url, status: "success", fetchedAt: "2026-09-09T11:00:00.000Z", title: `Página ${id}`,
    metaDescription: "", canonical: null, h1: ["h1"], h2: ["Limpeza", "Hidratação"], h3: [],
    wordCount: 1200, internalLinkCount: 8, externalLinkCount: 2, listCount: 2, tableCount: 0,
    faqCount: 1, imageCount: 3, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
    structuredDataTypes: [], recurringTerms: [], boldCount: 4, italicCount: 0, error: null,
  });

  /* A amostra só pode ser formada pelo que a curadoria selecionou: A, B, C. */
  const modelo = buildRadarCompetitiveModel({
    pages: [pagina("p-a", URLS.A), pagina("p-b", URLS.B), pagina("p-c", URLS.C)],
    query: "skincare para pele oleosa",
    observedIntent: "informacional",
    principal: "skincare para pele oleosa",
    editorialTopics: [],
  });

  const urlsNoModelo = new Set([
    ...modelo.structure.flatMap(measure => measure.sources.map(source => source.url)),
    ...modelo.organization.flatMap(topic => topic.occurrences.map(occurrence => occurrence.url)),
  ]);
  assert.equal(urlsNoModelo.has(URLS.D), false, "D não está nesta amostra, então não está no modelo");
  assert.equal(modelo.sample.comparable, 3);

});

/*
 * ==============  A LINHA DE CORTE, EM UMA ASSERÇÃO SÓ  ==================
 */

/*
 * TAMBÉM INVERTIDO PELO R10.2D.
 *
 * A medida do corte continua a mesma — a canônica cura 3, o universo tem 6 — mas
 * as três que sobravam deixaram de ficar sem porta: elas passam pela curadoria
 * da pesquisa. O que este teste guarda hoje é a separação entre as duas listas.
 */
test("as duas listas continuam separadas: a canônica cura 3, o universo oferece 6", () => {
  const resultadoUniverso = universo();
  const projecao = buildRadarSerpSelectionProjection(view(), analysis(), scope);

  assert.equal(resultadoUniverso.candidates.length, 6, "o universo enxerga A B C D E F");
  assert.equal(projecao.rows.length, 3, "a SERP canônica do artigo continua com A B C");

  const somenteAuxiliares = resultadoUniverso.candidates
    .filter(item => item.principalRank === null)
    .map(item => item.url)
    .sort();
  assert.deepEqual(somenteAuxiliares, [URLS.D, URLS.E, URLS.F].sort());
  for (const url of somenteAuxiliares) {
    assert.equal(projecao.rows.some(row => row.result.url === url), false, `${url} não vira resultado canônico`);
  }
});
