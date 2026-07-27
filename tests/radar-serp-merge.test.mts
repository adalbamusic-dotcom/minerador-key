import assert from "node:assert/strict";
import test from "node:test";
import type { SerpCollectionRecord } from "../lib/editorial/contracts.ts";
import { mergeSerpRecordsPreservingPayload } from "../lib/radar/serp-merge.ts";
import { buildRadarSerpView } from "../lib/radar/snapshot-view.ts";

const research = {
  id: "serp:article:1", brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-dna-v1", keywordId: "keyword-1", keywordDnaVersionId: "keyword-dna-v1", query: "tráfego pago vs orgânico para clínica de estética", country: "br", language: "pt-br", location: "Brasil", device: "desktop" as const, resultLimit: 10, provider: "serper", providerEndpoint: "/search" as const, origin: "real" as const, isMock: false, collectedAt: "2026-07-20T12:00:00.000Z", version: 1, previousSnapshotId: null, contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", persistenceMode: "local" as const, resolutionMode: "local_recovery" as const, canonicalRemoteVerified: false, status: "needs_review" as const,
  organicResults: Array.from({ length: 9 }, (_, index) => ({ position: index + 1, title: "Resultado " + (index + 1), url: "https://example.com/" + (index + 1), domain: "example.com", snippet: "Snippet", sitelinks: [], date: null, inferredType: "article" as const, confidence: "medium" as const, manualType: null, notes: "" })),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, diagnostic: { dominantIntent: "informacional", secondaryIntents: [], confidence: "medium" as const, dominantFormats: ["article"], resultTypeCounts: { article: 9 }, pageTypes: ["article"], recurringTitlePatterns: [], recurringSnippetPatterns: [], frequentEntities: [], frequentDomains: ["example.com"], localSignals: [], questions: [], relatedSearches: [], possibleConflicts: [], opportunities: [], limitations: [], verdict: "coerente" as const },
};

function record(nextResearch: unknown): SerpCollectionRecord { return { id: "serp:article:1", input: { keyword: "tráfego pago vs orgânico para clínica de estética", articleId: "article-1", location: "Brasil", language: "pt-br", device: "desktop" }, status: "needs_review", provider: "serper", origin: "real", isMock: false, snapshot: null, cost: null, error: null, dnaIntent: null, conflictReason: null, humanDecisionRequired: true, research: nextResearch as SerpCollectionRecord["research"], persistenceMode: "local", resolutionMode: "local_recovery", canonicalRemoteVerified: false }; }

test("preserva payload local completo quando o remoto chega parcial", () => {
  const local = record(research);
  const remote = record({ ...research, organicResults: [], diagnostic: { ...research.diagnostic, frequentDomains: [] } });
  const merged = mergeSerpRecordsPreservingPayload([remote], [local]);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].research?.organicResults.length, 9);
});

test("bloqueia conflito de hash na mesma versão", () => {
  const local = record(research);
  const remote = record({ ...research, contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
  const merged = mergeSerpRecordsPreservingPayload([remote], [local]);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.records.length, 2);
  assert.match(merged.conflicts[0].reason, /hash/);
});

test("hidrata resultados do snapshot legado quando research não contém o payload", () => {
  const legacy = { ...record(null), research: null, snapshot: { schemaVersion: 1 as const, keyword: "tráfego pago vs orgânico para clínica de estética", location: "Brasil", capturedAt: "2026-07-20T12:00:00.000Z", results: Array.from({ length: 9 }, (_, index) => ({ position: index + 1, title: "Legado " + (index + 1), url: "https://example.com/legacy/" + (index + 1), pageType: "article", format: "guia", entities: [] })), dominantIntent: "informacional", formats: ["guia"], entities: [], questions: [], patterns: [], gaps: [], opportunities: [] } } as SerpCollectionRecord;
  const view = buildRadarSerpView(legacy);
  assert.equal(view.organicResults.length, 9);
  assert.equal(view.source, "legacy_snapshot");
});
