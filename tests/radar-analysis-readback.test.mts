import assert from "node:assert/strict";
import test from "node:test";
import { beginRadarAnalysisReadback, beginRadarAnalysisWrite, canApplyRadarAnalysisReadback, EMPTY_RADAR_ANALYSIS_SYNC_STATE, finishRadarAnalysisWrite, radarAnalysisReadbackFingerprint } from "../lib/radar/analysis-readback.ts";

const item = (overrides: Record<string, unknown> = {}) => ({
  id: "radar:article-1",
  brandId: "brand-1",
  articleId: "article-1",
  articleDnaVersionId: "article-dna-1",
  lockVersion: 1,
  analysisVersions: [{ versionId: "analysis-1", versionNumber: 1, contentHash: "hash-1" }],
  ...overrides,
});

test("readback antigo não pode aplicar depois que uma escrita começou ou terminou", () => {
  const readback = beginRadarAnalysisReadback(EMPTY_RADAR_ANALYSIS_SYNC_STATE);
  const duringWrite = beginRadarAnalysisWrite(readback.state);

  assert.equal(canApplyRadarAnalysisReadback(duringWrite, readback.token), false);

  const afterWrite = finishRadarAnalysisWrite(duringWrite);
  assert.equal(canApplyRadarAnalysisReadback(afterWrite, readback.token), false);

  const nextReadback = beginRadarAnalysisReadback(afterWrite);
  assert.equal(canApplyRadarAnalysisReadback(nextReadback.state, nextReadback.token), true);
});

test("readbacks concorrentes só aplicam a revisão mais nova", () => {
  const first = beginRadarAnalysisReadback(EMPTY_RADAR_ANALYSIS_SYNC_STATE);
  const second = beginRadarAnalysisReadback(first.state);

  assert.equal(canApplyRadarAnalysisReadback(second.state, first.token), false);
  assert.equal(canApplyRadarAnalysisReadback(second.state, second.token), true);
});

test("fingerprint inclui identidade da linha, lock, snapshot e versões da análise", () => {
  const base = radarAnalysisReadbackFingerprint({ item: item(), snapshotId: "snapshot-1" });
  assert.notEqual(base, radarAnalysisReadbackFingerprint({ item: item({ id: "radar:article-2" }), snapshotId: "snapshot-1" }));
  assert.notEqual(base, radarAnalysisReadbackFingerprint({ item: item({ articleDnaVersionId: "article-dna-2" }), snapshotId: "snapshot-1" }));
  assert.notEqual(base, radarAnalysisReadbackFingerprint({ item: item({ lockVersion: 2 }), snapshotId: "snapshot-1" }));
  assert.notEqual(base, radarAnalysisReadbackFingerprint({ item: item(), snapshotId: "snapshot-2" }));
  assert.notEqual(base, radarAnalysisReadbackFingerprint({ item: item({ analysisVersions: [{ versionId: "analysis-2", versionNumber: 2, contentHash: "hash-2" }] }), snapshotId: "snapshot-1" }));
});
