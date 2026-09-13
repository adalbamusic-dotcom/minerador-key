import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RadarAnalysisVersion } from "../lib/radar/analysis-contracts.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";
import { buildRadarSerpCurationSummary, buildRadarSerpSelectionProjection, radarAnalysisCandidates, radarAnalysisMatchesSerp, radarOrganicRenderKey, radarOrganicSelectionFor, radarSerpApprovalBlockReason, radarSerpApprovalIssues, selectedRadarOrganicDecisionKeys, selectedRadarOrganicResults } from "../lib/radar/serp-curation.ts";

const organic = (position: number, url = `https://example.com/result-${position}`) => ({ position, title: `Resultado ${position}`, url, domain: "example.com", snippet: "Evidência observada", sitelinks: [], date: null, inferredType: "article" as const, confidence: "medium" as const, manualType: null, notes: "" });
const view = (snapshotId = "snapshot-1", results = [organic(1), organic(2), organic(3), organic(4)]): RadarSerpView => ({ record: { id: snapshotId, research: {} } as never, query: "keyword", version: 1, capturedAt: "2026-08-26T12:00:00.000Z", hash: `sha256:${snapshotId}`, provider: "dataforseo", origin: "real", persistenceMode: "remote", organicResults: results, peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, diagnostic: { dominantIntent: "informational", secondaryIntents: [], confidence: "medium", dominantFormats: ["article"], resultTypeCounts: {}, pageTypes: [], recurringTitlePatterns: [], recurringSnippetPatterns: [], frequentEntities: [], frequentDomains: [], localSignals: [], questions: [], relatedSearches: [], possibleConflicts: [], opportunities: [], limitations: [], verdict: "coerente", rawItemTypeCounts: {} }, partial: false, source: "research" });
const analysis = (currentView: RadarSerpView, included: number[]): RadarAnalysisVersion => ({ versionId: "analysis-1", entityId: "analysis:article-1", versionNumber: 1, previousVersionId: null, contentHash: "sha256:analysis", origin: "human", changeReason: "fixture", createdAt: "2026-08-26T12:00:00.000Z", createdBy: "human", payload: { schemaVersion: 1, brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-dna-1", serpSnapshotId: currentView.record.id, serpSnapshotVersion: currentView.version, serpSnapshotHash: currentView.hash || "", serpDecisions: currentView.organicResults.map(result => ({ key: `organic:${result.position}`, itemType: "organic" as const, decision: included.includes(result.position) ? "included" as const : "excluded" as const, reason: included.includes(result.position) ? "Concorrente selecionado pelo usuário." : "Resultado SERP excluído pelo usuário.", note: "", ownDomain: false })), selectedCompetitorIds: included.map(position => `organic:${position}`), extractionIds: [], extractions: [], extractionFailures: [], verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [], competitiveReport: null, plannerPackage: null, plannerTransfer: null, mode: "kgr_light", modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" }, modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null, analysisCompletedAt: null } });

test("resultado SERP tem chave visual ligada ao snapshot, posição e URL, sem índice de array", () => {
  const result = organic(4, "https://other.example/changed");
  assert.equal(radarOrganicRenderKey("snapshot-1", result), "snapshot-1:organic:4:https://other.example/changed");
  assert.notEqual(radarOrganicRenderKey("snapshot-2", result), radarOrganicRenderKey("snapshot-1", result));
});

test("análise antiga não projeta decisões sobre snapshot novo", () => {
  const oldView = view("snapshot-old");
  const currentView = view("snapshot-new");
  const oldAnalysis = analysis(oldView, [1, 3]);
  assert.equal(radarAnalysisMatchesSerp({ analysis: oldAnalysis, brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-dna-1", view: currentView }), false);
  assert.deepEqual(selectedRadarOrganicResults(currentView, oldAnalysis), []);
});

test("projeção com escopo rejeita análise do artigo, marca ou ArticleDNA incorretos", () => {
  const currentView = view();
  const currentAnalysis = analysis(currentView, [1, 3]);
  const scope = { brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-dna-1" };
  assert.equal(buildRadarSerpSelectionProjection(currentView, currentAnalysis, scope).compatible, true);
  assert.deepEqual(buildRadarSerpSelectionProjection(currentView, currentAnalysis, { ...scope, articleId: "article-2" }).selectedKeys, []);
  assert.deepEqual(buildRadarSerpSelectionProjection(currentView, currentAnalysis, { ...scope, brandId: "brand-2" }).selectedKeys, []);
  assert.deepEqual(buildRadarSerpSelectionProjection(currentView, currentAnalysis, { ...scope, articleDnaVersionId: "article-dna-2" }).selectedKeys, []);
});

test("seleção canônica permanece estável em rerender e análise recebe somente as referências marcadas", () => {
  const currentView = view();
  const currentAnalysis = analysis(currentView, [1, 3]);
  assert.deepEqual(selectedRadarOrganicDecisionKeys(currentView, currentAnalysis), ["organic:1", "organic:3"]);
  assert.deepEqual(radarAnalysisCandidates(currentView, currentAnalysis).map(candidate => candidate.key), ["organic:1", "organic:3"]);
  assert.deepEqual(selectedRadarOrganicDecisionKeys(currentView, currentAnalysis), ["organic:1", "organic:3"]);
  const swappedAnalysis = analysis(currentView, [2, 3]);
  assert.deepEqual(selectedRadarOrganicDecisionKeys(currentView, swappedAnalysis), ["organic:2", "organic:3"]);
  assert.deepEqual(radarAnalysisCandidates(currentView, swappedAnalysis).map(candidate => candidate.key), ["organic:2", "organic:3"]);
  const summary = buildRadarSerpCurationSummary({ view: currentView, analysis: currentAnalysis });
  assert.equal(summary.selectedCompetitors, 2);
  // Aprovadas passou a significar aprovação CORRENTE; sem revisão atual, zero.
  assert.equal(summary.includedReferences, 2);
  assert.equal(summary.approvedReferences, 0);
  const aprovado = buildRadarSerpCurationSummary({ view: currentView, analysis: currentAnalysis, review: { status: "approved", currentness: "current" } });
  assert.equal(aprovado.approvedReferences, 2);
  const reaberto = buildRadarSerpCurationSummary({ view: currentView, analysis: currentAnalysis, review: { status: "approved", currentness: "reopened" } });
  assert.equal(reaberto.approvedReferences, 0);
  assert.equal(summary.pendingDecisions, 0);
});

test("checkbox, contador e eligibility usam a mesma projeção da working copy", () => {
  const currentView = view();
  const currentAnalysis = analysis(currentView, [1, 3]);
  const projection = buildRadarSerpSelectionProjection(currentView, currentAnalysis);

  assert.equal(projection.compatible, true);
  assert.equal(projection.rows.length, 4);
  assert.equal(projection.selectedRows.length, 2);
  assert.deepEqual(projection.selectedKeys, ["organic:1", "organic:3"]);
  assert.equal(selectedRadarOrganicResults(currentView, currentAnalysis).length, projection.selectedRows.length);
  assert.equal(radarAnalysisCandidates(currentView, currentAnalysis).length, projection.selectedRows.length);
  assert.equal(projection.rows.find(row => row.key === "organic:1")?.selected, true);
  assert.equal(projection.rows.find(row => row.key === "organic:2")?.selected, false);

  const formatDecision = { ...currentAnalysis.payload.serpDecisions[1], decision: "included" as const, reason: "Referência de formato selecionada pelo usuário." };
  const formatAnalysis = { ...currentAnalysis, payload: { ...currentAnalysis.payload, serpDecisions: currentAnalysis.payload.serpDecisions.map(decision => decision.key === "organic:2" ? formatDecision : decision) } };
  const formatProjection = buildRadarSerpSelectionProjection(currentView, formatAnalysis);
  assert.equal(formatProjection.rows.find(row => row.key === "organic:2")?.role, "format");
  assert.equal(formatProjection.rows.find(row => row.key === "organic:2")?.selected, false);
  assert.equal(radarOrganicSelectionFor(formatAnalysis, currentView.organicResults[1]).selected, false);
});

test("dez ciclos de seleção mantêm referências imutáveis e não carregam decisão entre artigos ou snapshots", () => {
  const currentView = view("snapshot-cycle");
  let currentAnalysis = analysis(currentView, []);
  const originalDecisions = currentAnalysis.payload.serpDecisions;

  for (let cycle = 0; cycle < 10; cycle += 1) {
    const position = (cycle % 3) + 1;
    const nextDecisions = currentAnalysis.payload.serpDecisions.map(decision => ({
      ...decision,
      decision: decision.key === `organic:${position}` ? "included" as const : "excluded" as const,
      reason: decision.key === `organic:${position}` ? "Concorrente selecionado pelo usuário." : "Resultado SERP excluído pelo usuário.",
    }));
    const nextAnalysis = {
      ...currentAnalysis,
      versionId: `analysis-cycle-${cycle + 2}`,
      versionNumber: cycle + 2,
      payload: { ...currentAnalysis.payload, serpDecisions: nextDecisions, selectedCompetitorIds: [`organic:${position}`] },
    } as RadarAnalysisVersion;
    const projection = buildRadarSerpSelectionProjection(currentView, nextAnalysis);
    assert.deepEqual(projection.selectedKeys, [`organic:${position}`]);
    assert.equal(projection.selectedRows.length, 1);
    assert.notEqual(nextAnalysis.payload.serpDecisions, currentAnalysis.payload.serpDecisions);
    currentAnalysis = nextAnalysis;
  }

  assert.equal(originalDecisions[0].decision, "excluded");
  assert.deepEqual(buildRadarSerpSelectionProjection(view("snapshot-other"), currentAnalysis).selectedKeys, []);
});

test("evidências complementares não bloqueiam a aprovação da SERP quando os orgânicos foram decididos", () => {
  const currentView = view();
  const complementaryView: RadarSerpView = {
    ...currentView,
    peopleAlsoAsk: [{ position: 1, question: "Como escolher?", answer: null, sourceTitle: null, sourceUrl: null, classification: null, notes: "" }],
    relatedSearches: [{ term: "escolha relacionada", classification: null, notes: "" }],
    knowledgeGraph: { title: "Entidade", type: null, description: null, attributes: {}, website: null, sources: [] },
  };
  const baseAnalysis = analysis(complementaryView, [1, 3]);
  const currentAnalysis: RadarAnalysisVersion = {
    ...baseAnalysis,
    payload: {
      ...baseAnalysis.payload,
      serpDecisions: [
        ...baseAnalysis.payload.serpDecisions,
        { key: "paa:1", itemType: "people_also_ask", decision: "pending", reason: "", note: "", ownDomain: false },
        { key: "related:1", itemType: "related_search", decision: "pending", reason: "", note: "", ownDomain: false },
        { key: "knowledge_graph:1", itemType: "knowledge_graph", decision: "pending", reason: "", note: "", ownDomain: false },
      ],
    },
  };
  assert.equal(buildRadarSerpCurationSummary({ view: complementaryView, analysis: currentAnalysis }).pendingDecisions, 0);
  assert.equal(radarSerpApprovalBlockReason({ brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-dna-1", view: complementaryView, analysis: currentAnalysis }), null);
  assert.deepEqual(radarSerpApprovalIssues({ view: complementaryView, analysis: currentAnalysis }), []);
});

test("fluxo normal não depende mais da curadoria detalhada nem limita a lista aos dez primeiros", () => {
  const panel = readFileSync(new URL("../modules/radar/radar-r3-serp-panel.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /Curadoria detalhada/);
  assert.doesNotMatch(panel, /slice\(0,\s*10\)/);
  assert.match(panel, /Seleção de concorrentes e referências/);
  assert.match(panel, />Formato</);
  assert.match(panel, /Análise das referências selecionadas/);
  assert.match(panel, /Revisão e aprovação da SERP/);
  assert.match(panel, /buildRadarSerpSelectionProjection/);
  assert.doesNotMatch(panel, /model\.references\.find/);
  assert.match(page, /serpActionRef/);
  assert.match(page, /buildRadarSerpSelectionProjection/);
  assert.doesNotMatch(page, /const decisions = new Map/);
  assert.match(page, /selectionAtStart/);
  /*
   * GATE 15.3 · a confirmação de curadoria manual saiu da superfície da Fase 1.
   *
   * A função continua na página (§17), com o motivo viajando junto da alteração
   * confirmada — o que o teste abaixo continua verificando. O que não existe
   * mais é o caminho pelo qual o Workbench a acionava.
   */
  assert.match(page, /const confirmSerpCuration = async/, "a função segue íntegra");
  assert.doesNotMatch(page, /onConfirmSerpCuration=\{/, "MANUAL_COMPETITOR_CURATION_VISIBLE = NO");
  // O motivo viaja junto com a alteração confirmada, não em um write próprio.
  assert.match(page, /change.reason\?.trim\(\) \|\| valores.reason/);
  assert.match(panel, /reasonInputRefs/);
  assert.match(panel, /row\?\.contains\(next\)/);
  /*
   * GATE 18.10 · o item aplicado no fallback é `itemLocal`, e ele É `nextItem`
   * menos as afirmações que só o servidor pode fazer (`analysisCompletedAt` e
   * `finalizedBundle`). A garantia aqui — a versão com as decisões de curadoria
   * entra no workspace mesmo sem confirmação remota — continua inteira; o que
   * saiu foi o carimbo que fazia a tela dizer "Finalizado" sem banco.
   */
  assert.match(pipeline, /const itemLocal = \{ \.\.\.nextItem, analysisVersions: nextItem\.analysisVersions\.map\(/, "a versão local nasce de nextItem");
  assert.match(pipeline, /radarItems: current\.radarItems\.map\(item => item\.articleId === articleId \? itemLocal : item\)/);
  assert.match(pipeline, /serpDecisions\) !== JSON\.stringify\(parsed\.payload\.serpDecisions\)/);
  assert.match(pipeline, /selectedCompetitorIds\) !== JSON\.stringify\(parsed\.payload\.selectedCompetitorIds\)/);
});
