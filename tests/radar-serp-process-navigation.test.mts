import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RADAR_SERP_PROCESS_TABS, buildRadarSerpProcessTabs, nextSerpStep, type RadarSerpProcessState } from "../lib/radar/serp-process-navigation.ts";

const base: RadarSerpProcessState = {
  hasSnapshot: true, resultCount: 8, hasAnalysis: true, pendingDecisions: 0, selectedCompetitors: 3,
  pendingAnalysisCount: 0, analyzedCount: 3, evidenceCount: 0, needsCount: 0, reviewStatus: null, historyCount: 2,
};

test("a subnavegação SERP expõe as seis áreas canônicas e status compactos", () => {
  assert.deepEqual(RADAR_SERP_PROCESS_TABS, ["collection", "competitors", "analysis", "evidence", "review", "history"]);
  assert.deepEqual(buildRadarSerpProcessTabs(base).map(tab => tab.label), ["Coleta", "Concorrentes", "Análise", "Evidências", "Revisão", "Histórico"]);
  assert.equal(buildRadarSerpProcessTabs({ ...base, pendingAnalysisCount: 2 }).find(tab => tab.id === "analysis")?.status, "Reaberta");
  assert.equal(buildRadarSerpProcessTabs({ ...base, needsCount: 2 }).find(tab => tab.id === "evidence")?.status, "2 pend.");
});

test("nextSerpStep é determinístico e não impõe um wizard rígido", () => {
  assert.equal(nextSerpStep({ ...base, hasSnapshot: false, hasAnalysis: false }), "collection");
  assert.equal(nextSerpStep({ ...base, hasAnalysis: false }), "competitors");
  assert.equal(nextSerpStep({ ...base, pendingDecisions: 1 }), "competitors");
  assert.equal(nextSerpStep({ ...base, pendingAnalysisCount: 1 }), "analysis");
  assert.equal(nextSerpStep({ ...base, evidenceCount: 1 }), "evidence");
  assert.equal(nextSerpStep(base), "review");
  assert.equal(nextSerpStep({ ...base, reviewStatus: "approved" }), "history");
});

test("as subabas reorganizam o painel sem criar rota, provider ou aprovação por navegação", () => {
  const panel = readFileSync(new URL("../modules/radar/radar-r3-serp-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /role="tablist"/);
  assert.match(panel, /nextSerpStep\(processState\)/);
  assert.match(panel, /onClick=\{\(\) => onSelect\(tab\.id\)\}/);
  assert.match(panel, /ExternalEvidence/);
  assert.match(panel, /ExpertEvidence e ProductEvidence/);
  assert.match(panel, /onFocusAdjacent && pendingReviewCount > 0/);
  assert.match(panel, /Aprovar SERP/);
  assert.doesNotMatch(panel, /Curadoria detalhada/);
  assert.doesNotMatch(panel, /router\.push|router\.replace|window\.location/);
});
