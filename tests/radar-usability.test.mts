import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarBenchmark, type RadarExtractionPage, type RadarSemanticTerm } from "../lib/radar/analysis-contracts.ts";
import { classifyRadarSemanticTerm, isComparableRadarExtraction, isPrimaryRadarSemanticTerm, summarizeRadarExtractionFormats, summarizeRadarSemantics } from "../lib/radar/analysis-insights.ts";
import { deriveRadarInvestigationState, deriveRadarTransferState } from "../lib/radar/workflow-insights.ts";

const basePage = (overrides: Partial<RadarExtractionPage> = {}): RadarExtractionPage => ({
  id: "page-1", url: "https://example.com/blog/guia", status: "success", fetchedAt: "2026-07-21T12:00:00.000Z", title: "Guia editorial", metaDescription: "Meta", canonical: null, h1: ["Guia"], h2: [], h3: [], wordCount: 1000, internalLinkCount: 2, externalLinkCount: 1, listCount: 1, tableCount: 0, faqCount: 0, imageCount: 1, blockquoteCount: 0, comparisonCount: 0, hasDates: false, author: null, structuredDataTypes: ["Article"], recurringTerms: [], boldCount: 0, italicCount: 0, error: null, ...overrides,
});

test("benchmark exclui vídeo e extração parcial da amostra editorial", () => {
  const article = basePage();
  const video = basePage({ id: "video-1", url: "https://www.youtube.com/watch?v=abc", title: "Vídeo", h1: [], status: "partial", wordCount: 44 });
  assert.equal(isComparableRadarExtraction(article), true);
  assert.equal(isComparableRadarExtraction(video), false);
  const summary = summarizeRadarExtractionFormats([article, video]);
  assert.equal(summary.comparable, 1);
  assert.equal(summary.partial, 1);
  assert.equal(summary.counts.video, 1);
  assert.equal(buildRadarBenchmark("competitive_full", [article, video]).validPageCount, 1);
});

test("semântica separa ruído e mantém recuperação humana", () => {
  const terms = [
    { term: "privacidade", frequency: 4, pageCount: 1, pageIds: ["p"], sources: ["body"], relation: "observado", decision: "pending", note: "" },
    { term: "menu", frequency: 3, pageCount: 1, pageIds: ["p"], sources: ["body"], relation: "observado", decision: "pending", note: "" },
    { term: "estrategia", frequency: 8, pageCount: 1, pageIds: ["p"], sources: ["h2"], relation: "observado", decision: "pending", note: "" },
  ] as RadarSemanticTerm[];
  assert.equal(classifyRadarSemanticTerm(terms[0]), "legal");
  assert.equal(classifyRadarSemanticTerm(terms[1]), "navigation");
  assert.equal(isPrimaryRadarSemanticTerm(terms[0]), false);
  assert.equal(isPrimaryRadarSemanticTerm({ ...terms[0], decision: "include_topic" }), true);
  assert.deepEqual(summarizeRadarSemantics(terms), { relevant: 1, navigation: 1, legal: 1, platform: 0, otherIgnored: 0 });
});

test("progresso separa investigação, aprovação e transferência", () => {
  assert.equal(deriveRadarInvestigationState({ analysis: null, organicCount: 0, pendingOrganicCount: 0, conflictCount: 0 }), "not_started");
  assert.equal(deriveRadarInvestigationState({ analysis: { payload: { status: "draft" } } as never, organicCount: 9, pendingOrganicCount: 4, conflictCount: 0 }), "in_progress");
  assert.equal(deriveRadarInvestigationState({ analysis: { payload: { status: "draft" } } as never, organicCount: 9, pendingOrganicCount: 0, conflictCount: 0 }), "awaiting_approval");
  assert.equal(deriveRadarInvestigationState({ analysis: { payload: { status: "approved" } } as never, organicCount: 9, pendingOrganicCount: 0, conflictCount: 0 }), "approved");
  assert.equal(deriveRadarTransferState({ currentVersionNumber: 8, analysisStatus: "draft", transfer: { sourceAnalysisVersionId: "v7", sourceAnalysisVersionNumber: 7, sentAt: "2026-07-21T12:00:00.000Z", sentBy: "human" } }).state, "update_available");
  assert.equal(deriveRadarTransferState({ currentVersionNumber: 8, analysisStatus: "approved", transfer: { sourceAnalysisVersionId: "v7", sourceAnalysisVersionNumber: 7, sentAt: "2026-07-21T12:00:00.000Z", sentBy: "human" } }).state, "sent");
});
