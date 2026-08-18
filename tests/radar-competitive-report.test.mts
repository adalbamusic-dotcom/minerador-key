import assert from "node:assert/strict";
import test from "node:test";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { buildRadarBenchmark, createRadarAnalysisSuccessor, createRadarAnalysisVersion, suggestRadarAnalysisMode } from "../lib/radar/analysis-contracts.ts";
import { buildRadarCompetitiveReport, competitiveReportApprovalIssues } from "../lib/radar/competitive-report.ts";
import { buildRadarEvidencePackage } from "../lib/radar/evidence-package.ts";
import { SerpResearchSnapshotSchema } from "../lib/radar/serp/contracts.ts";

const article: ArticleDNA = {
  schemaVersion: 1, articleId: "article-report", brandId: "brand-report", principalKeywordId: "kw-principal", secondaryKeywordIds: ["kw-secondary"], narrativeReinforcementIds: [],
  keywordReferences: [
    { keywordId: "kw-principal", keywordDnaVersionId: "kw-v1", keywordDnaContentHash: "legacy:kw-principal", role: "principal", strategicContribution: "foco", coveredIntentions: ["informacional"], requiredTopics: ["estrutura"], excludedTopics: [], classificationOrigin: "human", confidence: 0.9, humanConfirmed: true },
    { keywordId: "kw-secondary", keywordDnaVersionId: "kw2-v1", keywordDnaContentHash: "legacy:kw-secondary", role: "secundaria", strategicContribution: "apoio", coveredIntentions: ["informacional"], requiredTopics: ["perguntas"], excludedTopics: [], classificationOrigin: "human", confidence: 0.8, humanConfirmed: true },
  ],
  siloId: "silo-report", hierarchy: "Pilar", suggestedSlug: "relatorio-competitivo", canonical: null, mainIntent: "informacional", auxiliaryIntents: [], audience: "Editores", problem: "Falta de evidência", desiredResult: "Decisão rastreável", journeyStage: "consideracao", brandObjective: "Crescer", promise: "Investigar a SERP", angle: "Evidência observada", cta: "Revisar o próximo passo", coverage: ["estrutura"], excludedSubjects: [], antiCannibalizationBoundary: "Não duplicar o artigo vizinho", nearbyArticleIds: [], differentiation: [], entities: ["SERP"], requiredTopics: ["estrutura"], questions: ["Como revisar?"], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.9, humanPendingDecisions: [],
};

const page = (id: string, url: string, overrides: Record<string, unknown> = {}) => ({ id, url, status: "success", fetchedAt: "2026-07-28T12:00:00.000Z", title: "Guia editorial", metaDescription: "Descrição", canonical: url, h1: ["Guia editorial"], h2: ["Estrutura"], h3: ["Perguntas"], wordCount: 1200, internalLinkCount: 4, externalLinkCount: 2, listCount: 2, tableCount: 1, faqCount: 0, imageCount: 3, blockquoteCount: 1, comparisonCount: 0, hasDates: false, author: "Autor", structuredDataTypes: ["Article"], recurringTerms: [{ term: "estrutura", frequency: 8, pageCount: 1, sources: ["body"], pageIds: [id] }], boldCount: 2, italicCount: 1, error: null, ...overrides });

const research = SerpResearchSnapshotSchema.parse({
  id: "serp-report", brandId: article.brandId, articleId: article.articleId, articleDnaVersionId: "article-v1", keywordId: article.principalKeywordId, keywordDnaVersionId: "kw-v1", query: "investigar a SERP", country: "br", language: "pt-br", location: "Brasil", device: "desktop", resultLimit: 10, provider: "serper", providerEndpoint: "/search", origin: "mock", isMock: true, collectedAt: "2026-07-28T12:00:00.000Z", version: 1, previousSnapshotId: null, contentHash: "a".repeat(64), persistenceMode: "local", resolutionMode: "local_recovery", canonicalRemoteVerified: false, status: "approved",
  organicResults: [1, 2, 3].map(position => ({ position, title: `Resultado ${position}`, url: `https://example.com/article-${position}`, domain: "example.com", snippet: "Resumo observado", sitelinks: [], date: null, inferredType: "article", confidence: "medium", manualType: null, notes: "" })),
  peopleAlsoAsk: [{ position: 1, question: "Como revisar a SERP?", answer: "Revisando evidências e limitações.", sourceTitle: "Resultado 1", sourceUrl: "https://example.com/article-1", classification: null, notes: "" }],
  relatedSearches: [{ term: "análise de concorrentes", classification: null, notes: "" }], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informational", secondaryIntents: [], confidence: "medium", dominantFormats: ["article"], resultTypeCounts: { article: 3 }, pageTypes: ["article"], recurringTitlePatterns: [], recurringSnippetPatterns: [], frequentEntities: ["SERP"], frequentDomains: ["example.com"], localSignals: [], questions: ["Como revisar a SERP?"], relatedSearches: ["análise de concorrentes"], possibleConflicts: [], opportunities: [], limitations: ["Fixture"] , verdict: "coerente" },
});

async function fixture() {
  const articleVersion = await createVersionEnvelope({ entityId: article.articleId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: "human", payload: article }) as VersionEnvelope<ArticleDNA>;
  const initial = await createRadarAnalysisVersion({ brandId: article.brandId, article: articleVersion, research, mode: "competitive_full", modeRecommendation: suggestRadarAnalysisMode({ kgr: null, volume: null, resultCount: 3, keywordDnaConfidence: null, format: "article", intent: "informational" }), actorId: "human" });
  const pages = [page("page-1", "https://example.com/article-1"), page("page-2", "https://example.com/article-2", { title: "Vídeo", structuredDataTypes: ["VideoObject"] }), page("page-3", "https://example.com/article-3", { status: "partial", h1: [], wordCount: 100 })];
  const benchmark = buildRadarBenchmark("competitive_full", pages as never);
  const analysis = await createRadarAnalysisSuccessor(initial, { selectedCompetitorIds: ["organic:1", "organic:2", "organic:3"], extractionIds: pages.map(item => item.id), extractions: pages as never, benchmark, semanticTerms: [{ term: "estrutura", frequency: 8, pageCount: 1, pageIds: ["page-1"], sources: ["body"], relation: "Tópico observado", decision: "include_topic", note: "" }], structuralDecisions: [], competitiveness: { classification: "medium", dimensions: { sample: 0.4 }, reasons: ["Amostra observada"], score: 0.4 } }, "human");
  return { articleVersion, analysis };
}

test("gera relatório competitivo completo sem incluir vídeo ou página parcial no benchmark", async () => {
  const { analysis } = await fixture();
  const report = await buildRadarCompetitiveReport({ payload: analysis.payload, article, research, radarItemId: "radar-report", analysisVersionId: analysis.versionId, analysisVersionNumber: analysis.versionNumber, generatedBy: "human", siloDnaVersionId: "silo-v1", status: "approved", approvedAt: "2026-07-28T12:00:00.000Z", approvedBy: "human" });
  assert.equal(report.profile.comparableCount, 1);
  assert.equal(report.profile.smallSample, true);
  assert.equal(report.competitors.find(item => item.serpPosition === 1)?.includedInBenchmark, true);
  assert.equal(report.competitors.find(item => item.serpPosition === 2)?.classification, "format");
  assert.equal(report.competitors.find(item => item.serpPosition === 3)?.classification, "partial");
  assert.equal(report.observedResponses[0]?.humanDecision, "pending");
  assert.equal(report.keywordObservations[0]?.sourceCoverage, "body_only");
  assert.match(report.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(competitiveReportApprovalIssues(report), ["A resposta observada ainda está pendente: Como revisar a SERP?", "A resposta observada ainda está pendente: análise de concorrentes"]);
});

test("pacote aprovado carrega o relatório como contexto aditivo e hashado", async () => {
  const { analysis } = await fixture();
  const report = await buildRadarCompetitiveReport({ payload: analysis.payload, article, research, radarItemId: "radar-report", analysisVersionId: analysis.versionId, analysisVersionNumber: analysis.versionNumber, generatedBy: "human", status: "approved", approvedAt: "2026-07-28T12:00:00.000Z", approvedBy: "human" });
  const pkg = await buildRadarEvidencePackage({ ...analysis.payload, serpDecisions: analysis.payload.serpDecisions.map(item => ({ ...item, decision: "included" as const })) }, { radarItemId: "radar-report", analysisVersionId: analysis.versionId, analysisVersionNumber: analysis.versionNumber, selectedBy: "human", research, competitiveReport: report });
  assert.equal(pkg.competitiveReport?.id, report.id);
  assert.equal(pkg.provenance.analysisVersionId, analysis.versionId);
  assert.match(pkg.hash, /^sha256:[a-f0-9]{64}$/);
});
