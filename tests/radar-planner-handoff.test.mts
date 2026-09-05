import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRadarEvidencePackage } from "../lib/radar/evidence-package.ts";
import { buildRadarPlannerHandoff, radarHandoffToContentPlanInput } from "../lib/radar/planner-handoff.ts";

const payload = {
  brandId: "brand-1", articleId: "article-1", mode: "kgr_light", modeHumanReason: "fixture", serpSnapshotId: "serp-1", serpSnapshotVersion: 1, serpSnapshotHash: "a".repeat(64),
  serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [], humanNotes: [],
};

async function packageFor(provider: "dataforseo" | "serper") {
  return buildRadarEvidencePackage(payload as never, {
    radarItemId: "radar-1", analysisVersionId: "analysis-1", analysisVersionNumber: 1, selectedBy: "human",
    research: {
      id: "serp-1", articleDnaVersionId: "article-dna-1", version: 1, contentHash: "a".repeat(64), provider, query: "keyword", collectedAt: "2026-08-26T12:00:00.000Z", organicResults: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
      diagnostic: { frequentEntities: [], questions: [], possibleConflicts: [] },
    } as never,
  });
}

function report() {
  return {
    id: "report-1", version: 1, brandId: "brand-1", radarItemId: "radar-1", articleId: "article-1", articleDnaVersionId: "article-dna-1", status: "approved", approvedBy: "human", approvedAt: "2026-08-26T12:00:00.000Z",
    summary: { text: "Relatório aprovado em fixture.", limitations: ["Amostra pequena."] }, needs: [{ id: "need-1", title: "Cobrir a intenção observada", humanDecision: "send_planner", note: "Decisão humana." }], competitors: [], contentHash: `sha256:${"b".repeat(64)}`,
  } as never;
}

test("novo snapshot DataForSEO gera handoff e preserva identidade, aprovação e proveniência", async () => {
  const handoff = await buildRadarPlannerHandoff({ packageData: await packageFor("dataforseo"), approvedReport: report(), brandId: "brand-1", radarItemId: "radar-1", articleId: "article-1", articleDnaVersionId: "article-dna-1", siloDnaVersionId: "silo-v1", sourceAnalysisVersionId: "analysis-1", sourceAnalysisVersionNumber: 1, selectedBy: "human", now: "2026-08-26T12:00:00.000Z" });
  assert.equal(handoff.status, "APPROVED");
  assert.equal(handoff.serp.provider, "dataforseo");
  assert.equal(handoff.provenance.provider, "dataforseo");
  assert.equal(handoff.provenance.articleDnaVersionId, "article-dna-1");
  assert.equal(handoff.expertEvidence.length, 0);
  assert.equal(handoff.productEvidence.length, 0);
  assert.match(handoff.hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(radarHandoffToContentPlanInput(handoff).evidencePackage, handoff);
});

test("pacote histórico Serper válido e aprovado gera handoff sem perder a provenance", async () => {
  const handoff = await buildRadarPlannerHandoff({ packageData: await packageFor("serper"), approvedReport: report(), brandId: "brand-1", radarItemId: "radar-1", articleId: "article-1", articleDnaVersionId: "article-dna-1", sourceAnalysisVersionId: "analysis-1", sourceAnalysisVersionNumber: 1, selectedBy: "human" });
  assert.equal(handoff.status, "APPROVED");
  assert.equal(handoff.serp.provider, "serper");
  assert.equal(handoff.evidencePackage.serp.provider, "serper");
  assert.equal(handoff.provenance.provider, "serper");
});

test("nova coleta SERP não expõe chamada Serper", async () => {
  const route = await readFile(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");
  assert.match(route, /collectDataForSeoSerpSnapshot/);
  assert.doesNotMatch(route, /collectSerperSnapshot|SERPER_API_KEY|\bSerper\b|RapidAPI/i);
});
