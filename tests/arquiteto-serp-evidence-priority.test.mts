import assert from "node:assert/strict";
import test from "node:test";
import { resolveSerpEvidencePriority } from "../lib/arquiteto/serp-evidence-priority.ts";
import type { SerpFormationAssessment } from "../lib/arquiteto/serp-formation.ts";

function assessment(overrides: Record<string, unknown> = {}): SerpFormationAssessment {
  return {
    evaluationStatus: "active",
    queriedKeywordDnaIds: ["keyword-1"],
    keywordDnaReferences: [{ keywordId: "keyword-1" }],
    snapshots: [{ keywordId: "keyword-1", organicResults: [{ url: "https://example.com" }] }],
    recommendations: [{ keywordId: "keyword-1" }],
    formationEvidence: { keywordObservations: [{ keywordId: "keyword-1", insufficientEvidence: false }] },
    notes: [],
    ...overrides,
  } as unknown as SerpFormationAssessment;
}

test("SERP completa vira prioridade de recomendação sem aplicar mudança", () => {
  const result = resolveSerpEvidencePriority(assessment());
  assert.equal(result.priority, "prioritaria");
  assert.match(result.reason, /exige decisão humana/i);
});

test("SERP parcial ou desatualizada não desempata a arquitetura", () => {
  assert.equal(resolveSerpEvidencePriority(assessment({ formationEvidence: undefined })).priority, "insuficiente");
  assert.equal(resolveSerpEvidencePriority(assessment({ evaluationStatus: "outdated" })).priority, "insuficiente");
});
