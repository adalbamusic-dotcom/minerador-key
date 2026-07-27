import assert from "node:assert/strict";
import test from "node:test";
import type { RadarItem } from "../lib/editorial/operational-flow.ts";
import { mergeRadarItemsPreservingLocalState } from "../lib/radar/workspace-merge.ts";

const base = (id: string, versions: unknown[]) => ({ id, articleId: "article-1", analysisVersions: versions }) as unknown as RadarItem;

test("item remoto sem análise não apaga RadarAnalysis válida do recovery local", () => {
  const merged = mergeRadarItemsPreservingLocalState([base("radar:article-1", [])], [base("radar:article-1", [{ versionId: "analysis-v1", versionNumber: 1 }])]);
  assert.deepEqual(merged[0]?.analysisVersions, [{ versionId: "analysis-v1", versionNumber: 1 }]);
});

test("snapshot remoto e item local não relacionado coexistem sem limpeza", () => {
  const merged = mergeRadarItemsPreservingLocalState([base("radar:article-1", [])], [base("radar:article-1", []), { ...base("radar:article-2", []), articleId: "article-2" } as unknown as RadarItem]);
  assert.equal(merged.length, 2);
});
