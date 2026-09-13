import assert from "node:assert/strict";
import test from "node:test";
import { analysisApprovalIssues, buildRadarBenchmark, buildRadarPlannerPackage, RadarExtractionPageSchema, suggestRadarAnalysisMode } from "../lib/radar/analysis-contracts.ts";
import { buildRadarEvidencePackage } from "../lib/radar/evidence-package.ts";

test("sugestao de modo usa somente a regra KGR estrita existente", () => {
  const strict = suggestRadarAnalysisMode({ kgr: 0.2, volume: 250, resultCount: 10, keywordDnaConfidence: 0.9, format: "Pilar", intent: "informacional" });
  assert.equal(strict.suggestedMode, "kgr_light");
  const broad = suggestRadarAnalysisMode({ kgr: 0.26, volume: 250, resultCount: 10, keywordDnaConfidence: 0.9, format: "Pilar", intent: "informacional" });
  assert.equal(broad.suggestedMode, "competitive_full");
});

test("benchmark preserva media, mediana, faixa e outlier sem impor meta editorial", () => {
  const pages = [1, 2, 3, 4].map((index) => RadarExtractionPageSchema.parse({ id: `p${index}`, url: `https://example.com/${index}`, status: "success" as const, fetchedAt: "2026-07-20T12:00:00.000Z", title: "Titulo", metaDescription: "Meta", canonical: null, h1: ["H1"], h2: Array(index).fill("H2"), h3: [], wordCount: index * 100, internalLinkCount: index, externalLinkCount: 1, listCount: 0, tableCount: 0, faqCount: 0, imageCount: 0, blockquoteCount: 0, comparisonCount: 0, hasDates: false, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 0, italicCount: 0, error: null }));
  const benchmark = buildRadarBenchmark("competitive_full", pages);
  assert.equal(benchmark?.metrics.words.mean, 250);
  assert.equal(benchmark?.metrics.words.median, 250);
  assert.deepEqual(benchmark?.metrics.words.typicalRange, [200, 300]);
  assert.equal(benchmark?.outliers.length, 0);
  const packageData = buildRadarPlannerPackage({ mode: "kgr_light", benchmark, serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], structuralDecisions: [], semanticTerms: [], keywordDecisions: [], serpSnapshotId: "s", serpSnapshotVersion: 1, serpSnapshotHash: "h" } as never);
  assert.equal(packageData && "enforcement" in packageData ? packageData.enforcement : "advisory", "advisory");
  assert.deepEqual(packageData && "requirements" in packageData ? packageData.requirements : [], []);
});

test("gate bloqueia SERP pendente e exige justificativa humana de conflito", () => {
  const analysis = { payload: { mode: "kgr_light", serpDecisions: [{ decision: "pending" }], selectedCompetitorIds: [], extractions: [], structuralDecisions: [], keywordDecisions: [{ decision: "return_to_architect_review", note: "" }] } } as never;
  const issues = analysisApprovalIssues(analysis);
  assert.equal(issues.length >= 2, true);
});

test("keywords sem conflito nÃ£o bloqueiam o pacote por falta de nota", () => {
  const analysis = { payload: { mode: "kgr_light", serpDecisions: [], selectedCompetitorIds: [], extractions: [], structuralDecisions: [], keywordDecisions: [{ decision: "keep", note: "" }] } } as never;
  assert.deepEqual(analysisApprovalIssues(analysis), []);
});

test("RadarEvidencePackage leva observações e não metas finais", async () => {
  const packageData = await buildRadarEvidencePackage({ brandId: "brand-1", articleId: "article-1", mode: "kgr_light", modeHumanReason: "amostra inicial", serpSnapshotId: "serp-1", serpSnapshotVersion: 1, serpSnapshotHash: "aaaaaaaa", benchmark: null, serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [], humanNotes: [] } as never, { radarItemId: "radar-item-1", analysisVersionId: "analysis-v1", analysisVersionNumber: 1, selectedBy: "human", research: { id: "serp-1", articleDnaVersionId: "article-dna-v1", version: 1, contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", provider: "serper", query: "keyword", collectedAt: "2026-07-20T12:00:00.000Z", peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, diagnostic: { frequentEntities: [], questions: [], possibleConflicts: [] } } as never });
  assert.equal(packageData.packageType, "radar_evidence");
  assert.equal(packageData.observedCompetitiveness.level, "insufficient_evidence");
  assert.equal("requiredWordCount" in packageData, false);
  assert.equal("requiredStructure" in packageData, false);
});
