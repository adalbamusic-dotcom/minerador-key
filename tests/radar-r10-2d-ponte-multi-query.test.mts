import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarCompetitorUniverse, type RadarExecutedQuery } from "../lib/radar/competitor-universe.ts";
import { buildRadarResearchReferences, radarNormalizedUrl, radarReferenceAppearanceSummary, radarReferenceOrigin, radarResearchReferenceId } from "../lib/radar/research-reference.ts";
import { buildRadarResearchCuration, buildRadarResearchCurationView, radarResearchUniverseFingerprint, resolveRadarResearchReferenceUrl } from "../lib/radar/research-curation.ts";
import { RADAR_EXTRACTION_ERROR, RadarExtractionRequestSchema, RadarResearchExtractionCandidateSchema, radarExtractionRefusal, radarExtractionTargets } from "../lib/radar/extraction-request.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarCompetitiveReport } from "../lib/radar/competitive-report.ts";
import { validateExternalUrl, CompetitorExtractionError } from "../lib/radar/competitor-extractor.ts";
import { RadarExtractionPageSchema, type RadarAnalysisPayload, type RadarAnalysisVersion } from "../lib/radar/analysis-contracts.ts";
import { SerpResearchSnapshotSchema } from "../lib/radar/serp/contracts.ts";
import { buildRadarSerpSelectionProjection } from "../lib/radar/serp-curation.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";

/*
 * ==========  R10.2D · A PONTE COMPLETA, DA DESCOBERTA AO RELATÓRIO  ========
 *
 *   Principal   → A B C     (SERP canônica do Article)
 *   Secundária1 → B D E     (SERP auxiliar de pesquisa)
 *   Secundária2 → D F       (SERP auxiliar de pesquisa)
 *
 * D não aparece na Principal, é EDITORIAL_COMPETITOR, e precisa atravessar:
 *
 *   CompetitorUniverse → ResearchCuration → ConfirmedSelection
 *     → Extraction → CompetitiveModel → CompetitiveReport
 *
 * E a SERP canônica precisa continuar sendo A B C. As duas coisas ao mesmo
 * tempo — é isso que este arquivo mede.
 */

const brandId = "b-10-2d";
const outraMarca = "b-outra-marca";
const articleId = "article-10-2d";
const articleDnaVersionId = "dna-10-2d";
const snapshotId = "serp-canonica-10-2d";
const snapshotHash = "f".repeat(64);
const scope = { brandId, articleId, articleDnaVersionId };

const URLS = {
  A: "https://a-editorial.com.br/skincare-pele-oleosa",
  B: "https://b-editorial.com.br/rotina-pele-oleosa",
  C: "https://c-editorial.com.br/limpeza-facial",
  D: "https://d-editorial.com.br/sabonete-pele-oleosa",
  E: "https://e-editorial.com.br/acido-salicilico",
  F: "https://f-editorial.com.br/protetor-solar-oleosa",
};

const resultado = (position: number, url: string, inferredType = "article") => ({
  position, url, title: `Página ${new URL(url).hostname}`, domain: new URL(url).hostname, snippet: "trecho", inferredType,
});

const consultas = (): RadarExecutedQuery[] => [
  { queryId: "query:principal", keyword: "skincare para pele oleosa", role: "principal", keywordId: "kw-principal", serpClass: "canonical", results: [resultado(1, URLS.A), resultado(2, URLS.B), resultado(3, URLS.C)] },
  { queryId: "query:sec-1", keyword: "melhor sabonete para pele oleosa", role: "secundaria", keywordId: "kw-sec-1", serpClass: "auxiliary", results: [resultado(1, URLS.B), resultado(2, URLS.D), resultado(3, URLS.E)] },
  { queryId: "query:sec-2", keyword: "protetor solar para pele oleosa", role: "secundaria", keywordId: "kw-sec-2", serpClass: "auxiliary", results: [resultado(1, URLS.D), resultado(2, URLS.F)] },
];

const contexto = () => ({
  state: "COMPLETE",
  article: { brandId, articleId, articleDnaVersionId, articleDnaContentHash: null, promise: "Rotina para pele oleosa", mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [], editorialTopics: [], resolvedKeywordTexts: [],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const referencias = (queries = consultas()) => buildRadarResearchReferences({
  queries,
  universe: buildRadarCompetitorUniverse({ queries, context: contexto() }),
  context: contexto(),
});

const refDe = (url: string, lista = referencias()) => {
  const item = lista.find(reference => reference.normalizedUrl === radarNormalizedUrl(url));
  assert.ok(item, `a referência de ${url} deveria existir`);
  return item;
};

/*
 * ==================  22 · TESTES DE IDENTIDADE (A–D)  ====================
 */

test("A · Principal pos2 = B e Auxiliar pos2 = D produzem referenceIds diferentes", () => {
  const lista = referencias();
  const b = refDe(URLS.B, lista);
  const d = refDe(URLS.D, lista);

  /* A colisão que motivou o lote: as duas seriam `organic:2`. */
  assert.equal(b.appearances.find(item => item.keywordRole === "principal")?.rank, 2);
  assert.equal(d.appearances.find(item => item.queryExecutionId === "query:sec-1")?.rank, 2);
  assert.notEqual(b.referenceId, d.referenceId, "posições iguais em SERPs diferentes não colidem mais");
  assert.equal(radarResearchReferenceId(radarNormalizedUrl(URLS.B)), b.referenceId, "o id é derivado da URL normalizada");
});

test("B · B na Principal e na Auxiliar é UMA referência com DUAS aparições", () => {
  const b = refDe(URLS.B);
  assert.equal(b.queryCount, 2);
  assert.equal(b.appearances.length, 2);
  assert.deepEqual(b.appearances.map(item => item.sourceType).sort(), ["auxiliary", "canonical"]);
  assert.deepEqual(b.appearances.map(item => item.rank).sort(), [1, 2]);
  assert.equal(radarReferenceOrigin(b), "CANONICAL_AND_AUXILIARY");
  assert.match(radarReferenceAppearanceSummary(b), /Encontrada em 2 consulta\(s\)/);
});

test("C · a mesma URL normalizada em três consultas dá queryCount = 3", () => {
  const tres = consultas();
  /* Mesma página, escrita de três jeitos: protocolo, www e barra final. */
  tres[2].results.push({ position: 3, url: "http://www.b-editorial.com.br/rotina-pele-oleosa/", title: "B de novo", domain: "www.b-editorial.com.br", snippet: "", inferredType: "article" });
  const b = refDe(URLS.B, referencias(tres));
  assert.equal(b.queryCount, 3);
  assert.equal(b.appearances.length, 3);
});

test("D · URLs distintas no mesmo domínio são referências distintas", () => {
  const duas = consultas();
  duas[1].results = [
    { position: 1, url: "https://mesmo-dominio.com.br/artigo-a", title: "Artigo A", domain: "mesmo-dominio.com.br", snippet: "", inferredType: "article" },
    { position: 2, url: "https://mesmo-dominio.com.br/artigo-b", title: "Artigo B", domain: "mesmo-dominio.com.br", snippet: "", inferredType: "article" },
  ];
  const lista = referencias(duas);
  const doDominio = lista.filter(reference => reference.domain === "mesmo-dominio.com.br");
  assert.equal(doDominio.length, 2, "a página é a unidade, não o site");
  assert.notEqual(doDominio[0].referenceId, doDominio[1].referenceId);
});

/*
 * ==================  23 · TESTES DE CURADORIA (E–J)  =====================
 */

test("E · a curadoria da pesquisa oferece as SEIS referências, não as três da canônica", () => {
  const view = buildRadarResearchCurationView({ references: referencias() });
  assert.equal(view.availableCount, 6, "CURATION_AVAILABLE = 6");
  assert.equal(view.selectedCount, 0, "e nada vem selecionado de fábrica");
  assert.equal(view.pendingCount, 6);
});

test("F · D aparece na projeção da curadoria, classificada e com motivo", () => {
  const view = buildRadarResearchCurationView({ references: referencias() });
  const linha = view.rows.find(row => row.reference.normalizedUrl === radarNormalizedUrl(URLS.D));
  assert.ok(linha, "D tem linha na curadoria da pesquisa");
  assert.equal(linha.reference.classification, "EDITORIAL_COMPETITOR");
  assert.equal(linha.reference.principalRank, null, "sem aparecer na Principal");
  assert.equal(linha.decision, "pending", "recorrência não aprova nada sozinha");
  assert.equal(linha.suggestedDecision, "primary", "vem pré-classificada, e só");
  assert.ok(linha.reference.classificationReason.length > 0);
});

test("G · D pode ser selecionada por decisão humana", () => {
  const lista = referencias();
  const d = refDe(URLS.D, lista);
  const view = buildRadarResearchCurationView({ references: lista, draft: { [d.referenceId]: { decision: "primary" } } });
  const linha = view.rows.find(row => row.reference.referenceId === d.referenceId)!;
  assert.equal(linha.decision, "primary");
  assert.equal(linha.analyzable, true);
  assert.equal(linha.dirty, true, "marcação é rascunho até confirmar");
  assert.equal(view.selectedCount, 1);
  assert.equal(view.dirtyCount, 1);
});

test("H · a confirmação persiste D com a URL que o servidor vai resolver", () => {
  const lista = referencias();
  const d = refDe(URLS.D, lista);
  const view = buildRadarResearchCurationView({ references: lista, draft: { [d.referenceId]: { decision: "primary", reason: "recorrente nas secundárias" } } });
  const curadoria = buildRadarResearchCuration({ view, confirmedBy: "humano", now: "2026-09-09T12:00:00.000Z" });

  assert.equal(curadoria.confirmedBy, "humano");
  assert.equal(curadoria.universeFingerprint, radarResearchUniverseFingerprint(lista));
  const entrada = curadoria.references.find(item => item.referenceId === d.referenceId);
  assert.ok(entrada);
  assert.equal(entrada.url, URLS.D);
  assert.equal(entrada.normalizedUrl, radarNormalizedUrl(URLS.D));
  assert.equal(entrada.decision, "primary");
  assert.equal(curadoria.references.length, 1, "só o que foi decidido é gravado");
});

test("I · recarregar preserva D: a curadoria confirmada volta como decisão vigente", () => {
  const lista = referencias();
  const d = refDe(URLS.D, lista);
  const curadoria = buildRadarResearchCuration({
    view: buildRadarResearchCurationView({ references: lista, draft: { [d.referenceId]: { decision: "primary" } } }),
    confirmedBy: "humano",
  });

  /* F5: sem rascunho nenhum, só o que está gravado. */
  const depois = buildRadarResearchCurationView({ references: referencias(), curation: curadoria });
  const linha = depois.rows.find(row => row.reference.referenceId === d.referenceId)!;
  assert.equal(depois.confirmed, true);
  assert.equal(depois.stale, false);
  assert.equal(linha.confirmedDecision, "primary");
  assert.equal(linha.decision, "primary");
  assert.equal(linha.dirty, false);
  assert.equal(depois.selectedCount, 1);
});

test("J · universo diferente torna a curadoria anterior STALE, sem reaplicar decisão", () => {
  const lista = referencias();
  const d = refDe(URLS.D, lista);
  const curadoria = buildRadarResearchCuration({
    view: buildRadarResearchCurationView({ references: lista, draft: { [d.referenceId]: { decision: "primary" } } }),
    confirmedBy: "humano",
  });

  /* Uma consulta a mais muda o universo. */
  const novasConsultas = [...consultas(), {
    queryId: "query:reforco", keyword: "ácido salicílico", role: "reforco_narrativo" as const, keywordId: "kw-reforco", serpClass: "auxiliary" as const,
    results: [resultado(1, "https://g-editorial.com.br/acido-salicilico-guia")],
  }];
  const depois = buildRadarResearchCurationView({ references: referencias(novasConsultas), curation: curadoria });

  assert.equal(depois.stale, true);
  assert.equal(depois.confirmed, false, "curadoria de outro universo não vale para este");
  assert.equal(depois.selectedCount, 0, "e nenhuma decisão é reaplicada em silêncio");
  assert.equal(depois.confirmedFingerprint, curadoria.universeFingerprint, "o histórico continua legível");
});

/*
 * ==================  24 · TESTES DE EXTRAÇÃO (K–Q)  ======================
 */

const curadoriaComD = () => {
  const lista = referencias();
  const d = refDe(URLS.D, lista);
  return {
    d,
    curation: buildRadarResearchCuration({
      view: buildRadarResearchCurationView({ references: lista, draft: { [d.referenceId]: { decision: "primary" }, [refDe(URLS.E, lista).referenceId]: { decision: "excluded" } } }),
      confirmedBy: "humano",
    }),
    fingerprint: radarResearchUniverseFingerprint(lista),
  };
};

const payload = (curation: ReturnType<typeof curadoriaComD>["curation"] | null, marca = brandId): RadarAnalysisPayload => ({
  schemaVersion: 1, brandId: marca, articleId, articleDnaVersionId,
  serpSnapshotId: snapshotId, serpSnapshotVersion: 1, serpSnapshotHash: snapshotHash,
  mode: "kgr_light",
  modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
  modeHumanReason: "",
  serpDecisions: [URLS.A, URLS.B, URLS.C].map((url, index) => ({ key: `organic:${index + 1}`, itemType: "organic" as const, decision: "included" as const, reason: "", note: "", ownDomain: false, url })),
  selectedCompetitorIds: ["organic:1", "organic:2", "organic:3"],
  extractionIds: [], extractions: [], extractionFailures: [],
  deepResearch: curation ? ({
    startedAt: "2026-09-09T11:00:00.000Z", startedBy: "humano", primarySearchMode: "WEB",
    fingerprint: { articleDnaVersionId, articleDnaContentHash: null, keywordRefs: [], siloDnaVersionId: null, siloPageId: null, formationAssessmentId: null, formationBaseHash: null, internalLinkGraphVersionId: null, value: "fixture" },
    queries: [], summary: null, researchCuration: curation, finalizedAt: null, finalizedBy: null, conclusion: null,
  } as RadarAnalysisPayload["deepResearch"]) : null,
  benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
  competitiveReport: null, plannerPackage: null, plannerTransfer: null,
  status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
} as unknown as RadarAnalysisPayload);

const analysisCom = (curation: ReturnType<typeof curadoriaComD>["curation"] | null, marca = brandId): RadarAnalysisVersion => ({
  versionId: "analysis-10-2d", entityId: `radar-analysis:${articleId}`, versionNumber: 3, previousVersionId: null,
  contentHash: "sha256:" + "a".repeat(64), origin: "human", changeReason: "fixture", createdAt: "2026-09-09T11:30:00.000Z", createdBy: "humano",
  payload: payload(curation, marca),
} as unknown as RadarAnalysisVersion);

const pedido = (candidates: unknown[], curation: ReturnType<typeof curadoriaComD>["curation"] | null, extra: Record<string, unknown> = {}) =>
  RadarExtractionRequestSchema.parse({ brandId, articleId, analysis: analysisCom(curation), candidates, snapshotId, snapshotHash, ...extra });

test("K · D selecionada: a extração aceita o referenceId e resolve a URL no servidor", () => {
  const { d, curation, fingerprint } = curadoriaComD();
  const input = pedido([{ source: "research", referenceId: d.referenceId }], curation, { universeFingerprint: fingerprint });

  assert.equal(radarExtractionRefusal(input), null, "nenhuma recusa");
  const alvos = radarExtractionTargets(input);
  assert.equal(alvos.length, 1);
  assert.equal(alvos[0].url, URLS.D, "a URL veio da curadoria persistida");
  assert.equal(alvos[0].origin, "research");
  assert.equal(alvos[0].key, d.referenceId);
});

test("L · D não está na SERP canônica e ainda assim é extraível", () => {
  const { d, curation } = curadoriaComD();
  const canonicas = payload(curation).serpDecisions.map(decision => decision.url);
  assert.equal(canonicas.includes(URLS.D), false, "D não é resultado canônico");

  const input = pedido([{ source: "research", referenceId: d.referenceId }], curation);
  assert.equal(radarExtractionRefusal(input), null);
  assert.equal(radarExtractionTargets(input)[0].url, URLS.D);
});

test("M · referenceId legítimo com URL manipulada é impossível de expressar e de executar", () => {
  const { d, curation } = curadoriaComD();

  /* 1. O contrato não tem onde colocar a URL. */
  const comUrl = RadarResearchExtractionCandidateSchema.safeParse({ source: "research", referenceId: d.referenceId, url: "https://atacante.example/payload" });
  assert.equal(comUrl.success, false, "o candidato da pesquisa não aceita URL");

  /* 2. E mesmo aceita no envelope, o destino não vem do pedido. */
  const input = pedido([{ source: "research", referenceId: d.referenceId }], curation);
  const alvos = radarExtractionTargets(input);
  assert.equal(alvos[0].url, URLS.D);
  assert.equal(alvos.some(alvo => alvo.url.includes("atacante")), false);

  /* 3. No caminho canônico, a chave legítima com URL trocada é recusada. */
  const forjado = pedido([{ key: "organic:2", url: "https://atacante.example/payload", itemType: "organic", decision: "included" }], curation);
  const recusa = radarExtractionRefusal(forjado);
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.URL_MISMATCH);
  assert.match(recusa!.message, /não corresponde à referência incluída na curadoria/);
});

test("N · referenceId inexistente é recusado", () => {
  const { curation } = curadoriaComD();
  const recusa = radarExtractionRefusal(pedido([{ source: "research", referenceId: "research:00000000deadbeef" }], curation));
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.REFERENCE_UNKNOWN);
});

test("O · referência conhecida mas não selecionada é recusada", () => {
  const lista = referencias();
  const { curation } = curadoriaComD();
  const e = refDe(URLS.E, lista);
  const recusa = radarExtractionRefusal(pedido([{ source: "research", referenceId: e.referenceId }], curation));
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.REFERENCE_NOT_SELECTED);
  assert.match(recusa!.message, /concorrente ou apoio/);
});

test("O · sem curadoria confirmada, nenhuma referência é extraível", () => {
  const { d } = curadoriaComD();
  const recusa = radarExtractionRefusal(pedido([{ source: "research", referenceId: d.referenceId }], null));
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.REFERENCE_UNKNOWN);
});

test("P · análise de outra marca é recusada antes de qualquer resolução", () => {
  const { d, curation } = curadoriaComD();
  const input = RadarExtractionRequestSchema.parse({
    brandId, articleId, analysis: analysisCom(curation, outraMarca),
    candidates: [{ source: "research", referenceId: d.referenceId }], snapshotId, snapshotHash,
  });
  const recusa = radarExtractionRefusal(input);
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.ARTICLE_MISMATCH);
});

test("P · universo diferente do curado é recusado", () => {
  const { d, curation } = curadoriaComD();
  const recusa = radarExtractionRefusal(pedido([{ source: "research", referenceId: d.referenceId }], curation, { universeFingerprint: "outro-universo" }));
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.CURATION_STALE);
});

test("Q · os guardas de SSRF continuam ativos e não foram substituídos", () => {
  for (const destino of ["http://localhost:3000/x", "http://127.0.0.1/x", "https://algo.local/x", "http://169.254.169.254/latest", "http://metadata.google.internal/", "http://10.0.0.5/x", "file:///etc/passwd"]) {
    assert.throws(() => validateExternalUrl(destino), CompetitorExtractionError, `${destino} deveria ser recusado`);
  }
  assert.equal(validateExternalUrl(URLS.D).hostname, "d-editorial.com.br");

  /* E a rota continua resolvendo o destino pela autoridade, não pelo pedido. */
  const rota = readFileSync("app/api/editorial/radar-analysis/extract/route.ts", "utf8");
  assert.match(rota, /radarExtractionTargets\(autoridade, canonicalUrlByKey\)/);
  assert.match(rota, /new WorkflowRepository\(\)\.findByArticle/);
  assert.match(rota, /new SerpSnapshotRepository\(\)\.list/, "o destino canônico também vem do snapshot persistido");
  assert.match(rota, /extractCompetitorPage\(target\.url/);
});

/*
 * ==================  25 · TESTES DO MODELO (R–U)  ========================
 */

const pagina = (id: string, url: string, h2: string[]) => RadarExtractionPageSchema.parse({
  id, url, status: "success", fetchedAt: "2026-09-09T12:00:00.000Z", title: `Página ${id}`,
  metaDescription: "resumo", canonical: null, h1: ["Título"], h2, h3: [],
  wordCount: 1400, internalLinkCount: 9, externalLinkCount: 2, listCount: 2, tableCount: 0,
  faqCount: 1, imageCount: 3, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
  structuredDataTypes: [], recurringTerms: [], boldCount: 4, italicCount: 0, error: null,
});

const amostra = () => [
  pagina("p-a", URLS.A, ["Limpeza facial", "Hidratação"]),
  pagina("p-b", URLS.B, ["Limpeza facial", "Protetor solar"]),
  pagina("p-d", URLS.D, ["Limpeza facial", "Sabonete indicado"]),
];

test("R · D extraída entra no CompetitiveModel como página da amostra", () => {
  const modelo = buildRadarCompetitiveModel({
    pages: amostra(), query: "skincare para pele oleosa", observedIntent: "informacional",
    principal: "skincare para pele oleosa", editorialTopics: ["limpeza facial"],
  });

  const urlsNoModelo = new Set([
    ...modelo.structure.flatMap(measure => measure.sources.map(source => source.url)),
    ...modelo.organization.flatMap(topic => topic.occurrences.map(occurrence => occurrence.url)),
  ]);
  assert.equal(urlsNoModelo.has(URLS.D), true, "AUXILIARY_ONLY_PAGE_IN_MODEL = YES");
  assert.equal(modelo.sample.comparable, 3);
});

test("S e T · D entra no relatório com procedência das consultas auxiliares", async () => {
  const lista = referencias();
  const paginas = amostra();
  const research = SerpResearchSnapshotSchema.parse({
    id: snapshotId, brandId, articleId, articleDnaVersionId, keywordId: "kw-principal", keywordDnaVersionId: "kwdna-principal",
    query: "skincare para pele oleosa", country: "BR", language: "pt-BR", location: "Brasil", device: "desktop",
    resultLimit: 10, provider: "dataforseo", providerEndpoint: "/search", origin: "real", isMock: false,
    collectedAt: "2026-09-09T10:00:00.000Z", version: 1, previousSnapshotId: null, contentHash: snapshotHash,
    persistenceMode: "remote", status: "needs_review",
    organicResults: [URLS.A, URLS.B, URLS.C].map((url, index) => ({
      position: index + 1, title: `Página ${index + 1}`, url, domain: new URL(url).hostname, snippet: "trecho",
      sitelinks: [], date: null, inferredType: "article", confidence: "high", manualType: null, notes: "",
    })),
    peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
    diagnostic: {
      dominantIntent: "informacional", secondaryIntents: [], confidence: "medium", dominantFormats: ["article"],
      resultTypeCounts: { article: 3 }, pageTypes: ["article"], recurringTitlePatterns: [], recurringSnippetPatterns: [],
      frequentEntities: [], frequentDomains: [], localSignals: [], questions: [], relatedSearches: [],
      possibleConflicts: [], opportunities: [], limitations: [], verdict: "coerente",
    },
  });

  const relatorio = await buildRadarCompetitiveReport({
    payload: { ...payload(curadoriaComD().curation), extractions: paginas, extractionIds: paginas.map(page => page.id) },
    article: { articleId, brandId, promise: "Rotina para pele oleosa", mainIntent: "informacional", requiredTopics: ["limpeza facial"], coverage: [], entities: [], keywordReferences: [], hierarchy: "Pilar" } as unknown as ArticleDNA,
    research,
    references: lista,
    radarItemId: "radar-10-2d",
    analysisVersionId: "analysis-10-2d-next",
    analysisVersionNumber: 4,
    generatedBy: "humano",
  });

  /* S · D está no relatório. */
  const procedenciaDeD = relatorio.referenceProvenance.find(item => item.url === URLS.D);
  assert.ok(procedenciaDeD, "D consta na procedência do relatório");
  assert.equal(relatorio.profile.comparablePageIds.includes("p-d"), true, "e é página comparável do perfil");

  /* T · e a procedência diz que ela veio das auxiliares. */
  assert.equal(procedenciaDeD.origin, "AUXILIARY");
  assert.equal(procedenciaDeD.queryCount, 2);
  assert.equal(procedenciaDeD.classification, "EDITORIAL_COMPETITOR");
  assert.deepEqual(procedenciaDeD.appearances.map(item => item.keyword).sort(), ["melhor sabonete para pele oleosa", "protetor solar para pele oleosa"]);
  assert.ok(procedenciaDeD.appearances.every(item => item.sourceType === "auxiliary"));

  const procedenciaDeB = relatorio.referenceProvenance.find(item => item.url === URLS.B);
  assert.equal(procedenciaDeB?.origin, "CANONICAL_AND_AUXILIARY", "B veio das duas");
});

test("U · a SERP canônica do artigo continua sendo A B C", () => {
  const view = ({
    record: { id: snapshotId }, version: 1, provider: "dataforseo", hash: snapshotHash,
    capturedAt: "2026-09-09T10:00:00.000Z", source: "merged", partial: false,
    organicResults: [URLS.A, URLS.B, URLS.C].map((url, index) => ({ ...resultado(index + 1, url), isOwnDomain: false })),
    peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
    diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], possibleConflicts: [], limitations: [], questions: [], opportunities: [], recurringTitlePatterns: [] },
  } as unknown as RadarSerpView);

  const projecao = buildRadarSerpSelectionProjection(view, analysisCom(curadoriaComD().curation), scope);
  assert.equal(projecao.rows.length, 3, "CANONICAL_SERP_RESULTS = 3");
  assert.deepEqual(projecao.rows.map(row => row.result.url).sort(), [URLS.A, URLS.B, URLS.C].sort());
  for (const url of [URLS.D, URLS.E, URLS.F]) {
    assert.equal(projecao.rows.some(row => row.result.url === url), false, `${url} nunca vira resultado canônico`);
  }

  /* E a identidade canônica continua sendo a posicional, sem migração. */
  const curadoriaCanonica = readFileSync("lib/radar/serp-curation.ts", "utf8");
  assert.match(curadoriaCanonica, /return `organic:\$\{result\.position\}`/);
  assert.equal(/research:/.test(curadoriaCanonica), false, "o namespace da pesquisa não invadiu a curadoria canônica");
});

/*
 * ====================  26 · COMPATIBILIDADE  =============================
 */

test("26 · item antigo sem researchCuration parseia e mantém o fluxo canônico", () => {
  const antigo = pedido([{ key: "organic:1", url: URLS.A, itemType: "organic", decision: "included" }], null);
  assert.equal(antigo.analysis.payload.deepResearch, null);
  assert.equal(radarExtractionRefusal(antigo), null, "o caminho canônico segue funcionando");
  assert.equal(radarExtractionTargets(antigo)[0].url, URLS.A);

  /* Decisão gravada antes deste lote — sem `url` — continua válida pela chave. */
  const semUrl = RadarExtractionRequestSchema.parse({
    brandId, articleId,
    analysis: { ...analysisCom(null), payload: { ...payload(null), serpDecisions: [{ key: "organic:1", itemType: "organic", decision: "included", reason: "", note: "", ownDomain: false }] } },
    candidates: [{ key: "organic:1", url: URLS.A, itemType: "organic", decision: "included" }],
  });
  assert.equal(radarExtractionRefusal(semUrl), null, "histórico não é reescrito");
  assert.equal(radarExtractionTargets(semUrl)[0].url, URLS.A);
});

/*
 * O PAINEL É UMA FUNÇÃO SÓ, COM DEZENAS DE `const` DE JSX.
 *
 * Elas são avaliadas na ordem em que aparecem. Uma variável lida por um bloco
 * declarado antes dela quebra a aba inteira em runtime — e nem o typecheck nem
 * teste de texto percebem, porque a referência existe: só existe tarde demais.
 *
 * Foi assim que `busy`, declarada no fim, derrubou a tabela do universo. Este
 * guarda a ordem para todo o arquivo, não só para ela.
 */
test("o painel não lê nenhuma const antes de declará-la (TDZ)", () => {
  const fonte = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  const corpo = fonte.slice(fonte.indexOf("export function RadarR3SerpPanel"));
  assert.ok(corpo.length > 0, "o componente precisa existir para ser verificado");

  /*
   * Comentários, strings e texto de JSX são apagados antes da varredura — sem
   * isso a prosa em português ("a pesquisa auxiliar…") viraria falso positivo.
   * O comprimento é preservado para os índices continuarem valendo, e um nome
   * seguido de `=>` é parâmetro de lambda, não leitura da const.
   */
  const mascarado = corpo
    .replace(/\/\*[\s\S]*?\*\//g, trecho => " ".repeat(trecho.length))
    .replace(/\/\/[^\n]*/g, trecho => " ".repeat(trecho.length))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, trecho => " ".repeat(trecho.length))
    .replace(/>[^<>{}]+</g, trecho => `>${" ".repeat(trecho.length - 2)}<`);

  const usadasCedo = [...mascarado.matchAll(/^ {2}const ([A-Za-z][A-Za-z0-9_]*)/gm)]
    /* `(?<!\.)` descarta acesso a propriedade — `model.collection` não é a const. */
    .filter(declaracao => new RegExp(`(?<![.\\w])${declaracao[1]}\\b(?!\\s*=>)`).test(mascarado.slice(0, declaracao.index)))
    .map(declaracao => declaracao[1]);

  assert.deepEqual(usadasCedo, [], "estas const são lidas antes da própria declaração");

  // E a que causou a falha continua no topo, antes de qualquer bloco de JSX.
  assert.ok(corpo.indexOf("const busy = refreshing") < corpo.indexOf("const researchTable"),
    "`busy` precisa ser declarada antes da tabela do universo");
});

test("26 · curadoria vazia e universo vazio não quebram a leitura", () => {
  const vazio = buildRadarResearchCurationView({ references: [] });
  assert.equal(vazio.availableCount, 0);
  assert.equal(vazio.confirmed, false);
  assert.equal(vazio.stale, false);
  assert.equal(radarResearchUniverseFingerprint([]), "universo-vazio");
  assert.equal(resolveRadarResearchReferenceUrl(null, "research:qualquer"), null);
});
