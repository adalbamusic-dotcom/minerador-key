import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarCurrentStateChain, radarCurationFingerprint } from "../lib/radar/current-state-chain.ts";
import { buildRadarAnalysisMembership, radarMembershipLabel } from "../lib/radar/analysis-membership.ts";
import { buildRadarSerpCurationSummary, radarAnalysisMatchesSerp, radarSelectionFingerprint } from "../lib/radar/serp-curation.ts";
import type { RadarAnalysisVersion, RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";
import { RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";
import type { SerpReviewRecord } from "../lib/editorial/contracts.ts";

/*
 * TRÊS NÚMEROS NA MESMA TELA, DE VERSÕES DIFERENTES.
 *
 * O smoke mostrou "Resultados SERP 8 · Concorrentes selecionados 7 ·
 * Referências aprovadas 8" — e depois "Seleção confirmada: 7" seguido de
 * "Nenhuma das 1 página(s) selecionada(s) pôde ser analisada." Nenhum dos dois
 * era corrupção de dado: eram contadores lendo fontes diferentes com o mesmo
 * nome, e cache técnico sendo confundido com pertencimento à amostra.
 *
 * Estes testes fixam a cadeia: cada entidade CURRENT declara a que snapshot e a
 * que impressão digital de curadoria pertence.
 */
const escopo = { brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-dna-1" };
const RESULTADOS = 8;
const SELECIONADAS = 7;

const organic = (position: number) => ({
  position, title: `Resultado ${position}`, url: `https://exemplo-${position}.com.br/pagina`,
  domain: `exemplo-${position}.com.br`, snippet: "trecho", sitelinks: [], date: null,
  inferredType: "article" as const, confidence: "medium" as const, manualType: null, notes: "",
});

const view = (snapshotId: string, versao: number, quantos = RESULTADOS): RadarSerpView => ({
  record: { id: snapshotId, research: {} } as never,
  query: "mascara de skincare", version: versao, capturedAt: "2026-09-07T15:29:51.000Z",
  hash: `sha256:${snapshotId}`, provider: "dataforseo", origin: "real", persistenceMode: "remote",
  organicResults: Array.from({ length: quantos }, (_, index) => organic(index + 1)),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", secondaryIntents: [], confidence: "medium", dominantFormats: ["article"], resultTypeCounts: {}, pageTypes: [], recurringTitlePatterns: [], recurringSnippetPatterns: [], frequentEntities: [], frequentDomains: [], localSignals: [], questions: [], relatedSearches: [], possibleConflicts: [], opportunities: [], limitations: [], verdict: "coerente", rawItemTypeCounts: {} },
  partial: false, source: "research",
});

const pagina = (position: number): RadarExtractionPage => RadarExtractionPageSchema.parse({
  id: `page-${position}`, url: organic(position).url, status: "success", fetchedAt: "2026-09-07T16:00:00.000Z",
  title: `Página ${position}`, metaDescription: "", canonical: null, h1: ["H1"], h2: ["Como usar"], h3: [],
  wordCount: 1000, internalLinkCount: 5, externalLinkCount: 2, listCount: 3, tableCount: 0, faqCount: 0,
  imageCount: 4, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
  structuredDataTypes: ["Article"], recurringTerms: [], boldCount: 10, italicCount: 0, error: "",
});

const analysis = (currentView: RadarSerpView, incluidas: number[], extraidas: number[] = []): RadarAnalysisVersion => ({
  versionId: `analysis-${currentView.record.id}`, entityId: "radar-analysis:article-1", versionNumber: 1,
  previousVersionId: null, contentHash: "sha256:analysis", origin: "human", changeReason: "fixture",
  createdAt: "2026-09-07T15:40:00.000Z", createdBy: "ator-1",
  payload: {
    schemaVersion: 1, ...escopo,
    serpSnapshotId: currentView.record.id, serpSnapshotVersion: currentView.version, serpSnapshotHash: currentView.hash || "",
    serpDecisions: currentView.organicResults.map(result => ({
      key: `organic:${result.position}`, itemType: "organic" as const,
      decision: incluidas.includes(result.position) ? "included" as const : "excluded" as const,
      reason: incluidas.includes(result.position) ? "Concorrente selecionado pelo usuário." : "Resultado SERP excluído pelo usuário.",
      note: "", ownDomain: false,
    })),
    selectedCompetitorIds: incluidas.map(position => `organic:${position}`),
    extractionIds: extraidas.map(position => `page-${position}`),
    extractions: extraidas.map(pagina), extractionFailures: [], verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, finalizedBundle: null,
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    competitiveReport: null, plannerPackage: null, plannerTransfer: null,
    mode: "competitive_full", modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null, analysisCompletedAt: null,
  },
} as RadarAnalysisVersion);

const review = (snapshotId: string): SerpReviewRecord => ({
  id: `review-${snapshotId}`, articleId: "article-1", snapshotId, status: "approved",
  reviewedAt: "2026-09-07T15:45:00.000Z", reviewedBy: "ator-1", notes: "aprovação preservada",
} as unknown as SerpReviewRecord);

const setePrimeiras = Array.from({ length: SELECIONADAS }, (_, index) => index + 1);

/* ---------------------------------- A ------------------------------------ */

test("A · snapshot com 8 e curadoria com 7: a aprovação antiga não é a aprovação corrente", () => {
  const atual = view("snapshot-v1", 1);
  const curada = analysis(atual, setePrimeiras);

  // A aprovação existe, mas foi dada sobre outra curadoria.
  const cadeia = buildRadarCurrentStateChain({ view: atual, analysis: curada, review: review("snapshot-v1"), reviewCurrentness: "reopened", scope: escopo });
  assert.equal(cadeia.snapshot?.organicResultIds.length, RESULTADOS);
  assert.equal(cadeia.curation?.selectedResultIds.length, SELECIONADAS);
  assert.equal(cadeia.approval, null, "aprovação reaberta não é corrente");
  assert.equal(cadeia.consistent, false);
  assert.ok(cadeia.breaks.some(item => /aprovação preservada/i.test(item)));

  // E o contador da tela deixa de somar oito onde a seleção é sete.
  const resumo = buildRadarSerpCurationSummary({ view: atual, analysis: curada, scope: escopo, review: { status: "approved", currentness: "reopened" } });
  assert.equal(resumo.selectedCompetitors, SELECIONADAS);
  assert.equal(resumo.approvedReferences, 0);
});

/* ---------------------------------- B ------------------------------------ */

test("B · mudar a curadoria de 8 para 7 muda a impressão digital, e a aprovação anterior fica defasada", () => {
  const atual = view("snapshot-v1", 1);
  const oito = analysis(atual, [1, 2, 3, 4, 5, 6, 7, 8]);
  const sete = analysis(atual, setePrimeiras);

  const antes = radarSelectionFingerprint(atual, oito, escopo);
  const depois = radarSelectionFingerprint(atual, sete, escopo);
  assert.notEqual(antes, depois);
  assert.equal(radarCurationFingerprint(["organic:2", "organic:1"]), "organic:1|organic:2");

  const cadeia = buildRadarCurrentStateChain({ view: atual, analysis: sete, review: review("snapshot-v1"), reviewCurrentness: "reopened", scope: escopo });
  assert.equal(cadeia.approval, null);
  assert.equal(cadeia.curation?.fingerprint, depois);
});

/* -------------------------------- C e D ---------------------------------- */

test("C · snapshot novo zera curadoria, análise, relatório e aprovação correntes", () => {
  const antigo = view("snapshot-v1", 1);
  const novo = view("snapshot-v2", 2);
  const curadaNoAntigo = analysis(antigo, setePrimeiras, [1, 2, 3]);

  const cadeia = buildRadarCurrentStateChain({ view: novo, analysis: curadaNoAntigo, review: review("snapshot-v1"), reviewCurrentness: "current", scope: escopo });
  assert.equal(cadeia.snapshot?.snapshotId, "snapshot-v2");
  assert.equal(cadeia.curation, null);
  assert.equal(cadeia.analysis, null);
  assert.equal(cadeia.report, null);
  assert.equal(cadeia.approval, null, "aprovação do snapshot anterior não migra");
  assert.ok(cadeia.breaks.some(item => /outro snapshot/i.test(item)));

  // E nenhuma seleção anterior vaza para os contadores do snapshot novo.
  const resumo = buildRadarSerpCurationSummary({ view: novo, analysis: curadaNoAntigo, scope: escopo, review: { status: "approved", currentness: "current" } });
  assert.equal(resumo.selectedCompetitors, 0);
  assert.equal(resumo.curationStarted, false);
  assert.equal(resumo.awaitingCuration, RESULTADOS);

  const membership = buildRadarAnalysisMembership({ view: novo, analysis: curadaNoAntigo, scope: escopo });
  assert.equal(membership.selected, 0);
  assert.equal(membership.reused, 0);
});

test("D · o histórico continua inteiro: a versão anterior não é apagada nem alterada", () => {
  const antigo = view("snapshot-v1", 1);
  const novo = view("snapshot-v2", 2);
  const curadaNoAntigo = analysis(antigo, setePrimeiras, [1, 2, 3]);
  const registro = review("snapshot-v1");

  buildRadarCurrentStateChain({ view: novo, analysis: curadaNoAntigo, review: registro, reviewCurrentness: "current", scope: escopo });

  assert.equal(curadaNoAntigo.payload.selectedCompetitorIds.length, SELECIONADAS, "a curadoria antiga permanece");
  assert.equal(curadaNoAntigo.payload.extractions.length, 3, "as extrações antigas permanecem");
  assert.equal(registro.status, "approved", "a aprovação antiga permanece registrada");

  // Ela simplesmente deixa de ser corrente para o snapshot novo.
  assert.equal(radarAnalysisMatchesSerp({ analysis: curadaNoAntigo, ...escopo, view: novo }), false);
  assert.equal(radarAnalysisMatchesSerp({ analysis: curadaNoAntigo, ...escopo, view: antigo }), true);
});

/* -------------------------------- E e F ---------------------------------- */

test("E · sete selecionadas com seis extraídas mostram 6 reutilizadas e 1 pendente, nunca 1 selecionada", () => {
  const atual = view("snapshot-v1", 1);
  const parcial = analysis(atual, setePrimeiras, [1, 2, 3, 4, 5, 6]);
  const membership = buildRadarAnalysisMembership({ view: atual, analysis: parcial, scope: escopo });

  assert.equal(membership.selected, SELECIONADAS);
  assert.equal(membership.reused, 6);
  assert.equal(membership.pending, 1);
  assert.equal(membership.analyzed, 6);

  const rotulo = radarMembershipLabel(membership);
  assert.match(rotulo, /7 selecionada\(s\)/);
  assert.match(rotulo, /6 já analisada\(s\)/);
  assert.match(rotulo, /1 pendente\(s\)/);
  assert.equal(/1 selecionada/.test(rotulo), false, "pendente nunca é apresentado como seleção");
});

test("F · a conta fecha: selecionadas = reutilizadas + pendentes, e cache fora da seleção não entra", () => {
  const atual = view("snapshot-v1", 1);
  const parcial = analysis(atual, setePrimeiras, [1, 2, 3, 4, 5, 6]);
  const membership = buildRadarAnalysisMembership({ view: atual, analysis: parcial, scope: escopo });
  assert.equal(membership.reused + membership.pending, membership.selected);

  /*
   * A oitava página foi extraída em uma curadoria anterior e não está mais
   * selecionada. Ela continua como cache técnico e não conta como amostra.
   */
  const comOrfa = analysis(atual, setePrimeiras, [1, 2, 3, 4, 5, 6, 8]);
  const comCache = buildRadarAnalysisMembership({ view: atual, analysis: comOrfa, scope: escopo });
  assert.equal(comCache.selected, SELECIONADAS);
  assert.equal(comCache.analyzed, 6, "a extração órfã não entra na amostra");
  assert.equal(comCache.orphanExtractions, 1);
  assert.deepEqual(comCache.orphanUrls, [organic(8).url]);
  assert.equal(comCache.reused + comCache.pending, comCache.selected);
});

/* -------------------------------- G e H ---------------------------------- */

test("G · Referências aprovadas conta a aprovação corrente, e nada além dela", () => {
  const atual = view("snapshot-v1", 1);
  const curada = analysis(atual, setePrimeiras);
  const base = { view: atual, analysis: curada, scope: escopo };

  assert.equal(buildRadarSerpCurationSummary({ ...base }).approvedReferences, 0, "sem revisão, zero");
  assert.equal(buildRadarSerpCurationSummary({ ...base, review: { status: null } }).approvedReferences, 0);
  assert.equal(buildRadarSerpCurationSummary({ ...base, review: { status: "rejected", currentness: "current" } }).approvedReferences, 0);
  assert.equal(buildRadarSerpCurationSummary({ ...base, review: { status: "approved", currentness: "unknown" } }).approvedReferences, 0);
  assert.equal(buildRadarSerpCurationSummary({ ...base, review: { status: "approved", currentness: "current" } }).approvedReferences, SELECIONADAS);

  // O total de decisões incluídas continua disponível — com o nome certo.
  assert.equal(buildRadarSerpCurationSummary({ ...base }).includedReferences, SELECIONADAS);
});

test("H · a cadeia é determinística: os mesmos dados reproduzem a mesma leitura", () => {
  const atual = view("snapshot-v1", 1);
  const curada = analysis(atual, setePrimeiras, [1, 2, 3]);
  const entrada = { view: atual, analysis: curada, review: review("snapshot-v1"), reviewCurrentness: "current" as const, scope: escopo };

  const primeira = buildRadarCurrentStateChain(entrada);
  const segunda = buildRadarCurrentStateChain(entrada);
  assert.deepEqual(primeira, segunda, "nada depende de estado de sessão");

  assert.equal(primeira.consistent, true);
  assert.deepEqual(primeira.breaks, []);
  assert.equal(primeira.analysis?.attemptedResultIds.length, SELECIONADAS);
  assert.equal(primeira.analysis?.successfulResultIds.length, 3);
  assert.equal(primeira.analysis?.failedResultIds.length, SELECIONADAS - 3);
  assert.equal(primeira.approval?.curationFingerprint, primeira.curation?.fingerprint);
});
