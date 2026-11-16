import test from "node:test";
import assert from "node:assert/strict";
import { planDeletedArticleMarkerEntries, type ArticleFormationMarkerPayload } from "../lib/arquiteto/article-formation-marker.ts";

const entry = (candidateRef: string, materializedArticleId: string | null) => ({
  candidateRef, materializedArticleId, territoryRef: "same-silo", principalKeywordId: "same-keyword",
  members: [{ keywordId: "same-keyword", role: "principal" as const }], formationBaseHash: "base",
  slug: null, fullPath: null, concludedAt: "now", concludedBy: "user",
});
const marker = (concludedFormations: ReturnType<typeof entry>[]): ArticleFormationMarkerPayload => ({
  contractVersion: "article-formation-marker-v1", baseHash: "base", processedAt: "now",
  confirmation: { status: "confirmed", confirmedAt: "now", confirmedArticleCount: concludedFormations.length, coveredKeywordCount: 1, pendingSiloCount: 0, failedCount: 0 },
  concludedFormations,
});

test("o plano alcança somente identidades selecionadas, inclusive várias versões de formação, sem tocar o marcador", () => {
  const original = marker([entry("old-1", "old"), entry("old-2", "old"), entry("current", "current"), entry("draft", null)]);
  const before = JSON.stringify(original);
  const plan = planDeletedArticleMarkerEntries(original, ["old"]);
  assert.deepEqual(plan.removed.map(item => item.candidateRef), ["old-1", "old-2"]);
  assert.deepEqual(plan.retained.map(item => item.candidateRef), ["current", "draft"]);
  assert.equal(JSON.stringify(original), before);
});

test("a exclusão não deduz artigo por keyword, território ou campo não materializado", () => {
  const original = marker([entry("current", "current"), entry("draft", null)]);
  const plan = planDeletedArticleMarkerEntries(original, ["same-keyword"]);
  assert.deepEqual(plan.removed, []);
  assert.deepEqual(plan.retained, original.concludedFormations);
});

test("referência compartilhada com artigo preservado recusa e seleção vazia recusa", () => {
  const original = marker([entry("same", "old"), entry("same", "current")]);
  assert.throws(() => planDeletedArticleMarkerEntries(original, ["old"]), /compartilha/);
  assert.throws(() => planDeletedArticleMarkerEntries(original, []), /seleção/);
  assert.throws(() => planDeletedArticleMarkerEntries(original, [" "]), /seleção/);
});
