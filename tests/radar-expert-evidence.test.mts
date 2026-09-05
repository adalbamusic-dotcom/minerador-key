import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarExpertEvidence, projectRadarExpertEvidence } from "../lib/radar/expert-evidence.ts";

const base = {
  brandId: "10000000-0000-4000-8000-0000000000a1",
  articleId: "article-a",
  articleDnaVersionId: "article-dna-v1",
  brief: { id: "20000000-0000-4000-8000-0000000000a1", brandId: "10000000-0000-4000-8000-0000000000a1", expertId: "30000000-0000-4000-8000-0000000000a1", articleId: "article-a", articleDnaVersionId: "article-dna-v1" },
  contribution: {
    id: "40000000-0000-4000-8000-0000000000a1",
    brandId: "10000000-0000-4000-8000-0000000000a1",
    expertId: "30000000-0000-4000-8000-0000000000a1",
    briefId: "20000000-0000-4000-8000-0000000000a1",
    sourceType: "VOICE" as const,
    originalText: null,
    transcriptText: "Texto bruto preservado.",
    organizationPayload: { organizedText: "Organização fiel para revisão." },
    externalUpdateId: "telegram-update-1",
    originalAssetUri: "gs://bucket/radar/asset.ogg",
    checksum: "checksum-1",
    receivedAt: "2026-08-26T12:00:00.000Z",
  },
};

test("projeção aceita somente conteúdo revisado e preserva a camada de organização", () => {
  const evidence = buildRadarExpertEvidence({ ...base, review: { decision: "accepted" } });
  assert.equal(evidence.id, "expert-evidence:40000000-0000-4000-8000-0000000000a1");
  assert.equal(evidence.evidenceType, "EDITORIAL_ORGANIZATION");
  assert.equal(evidence.approvedContent, "Organização fiel para revisão.");
  assert.equal(evidence.originalAssetUri, "gs://bucket/radar/asset.ogg");
  assert.equal(evidence.humanDecision, "accepted");
  assert.equal(evidence.fidelityStatus, "faithful");
});

test("pergunta pendente não vira ExpertEvidence e áudio sem texto permanece bloqueado", () => {
  const pending = projectRadarExpertEvidence({ ...base, review: { decision: "pending" } });
  assert.equal(pending.evidence, null);
  assert.equal(pending.reason, "pending_review");

  const unreadable = projectRadarExpertEvidence({
    ...base,
    contribution: { ...base.contribution, transcriptText: null, organizationPayload: null },
    review: { decision: "accepted" },
  });
  assert.equal(unreadable.evidence, null);
  assert.equal(unreadable.reason, "content_not_readable");
});

test("rejeição mantém proveniência sem contaminar o conteúdo aprovado do relatório", () => {
  const evidence = buildRadarExpertEvidence({
    ...base,
    contribution: { ...base.contribution, organizationPayload: null, transcriptText: null, originalText: "Fala original textual." },
    review: { decision: "rejected" },
  });
  assert.equal(evidence.evidenceType, "ORIGINAL");
  assert.equal(evidence.approvedContent, "Fala original textual.");
  assert.equal(evidence.humanDecision, "rejected");
  assert.equal(evidence.fidelityStatus, "conflict");
});

test("projeção falha fechada em marca, artigo, versão ou brief divergente", () => {
  assert.throws(() => buildRadarExpertEvidence({ ...base, brandId: "90000000-0000-4000-8000-0000000000a1", review: { decision: "accepted" } }), /RADAR_EXPERT_EVIDENCE_BRAND_MISMATCH/);
  assert.throws(() => buildRadarExpertEvidence({ ...base, articleId: "article-b", review: { decision: "accepted" } }), /RADAR_EXPERT_EVIDENCE_ARTICLE_MISMATCH/);
  assert.throws(() => buildRadarExpertEvidence({ ...base, contribution: { ...base.contribution, briefId: "50000000-0000-4000-8000-0000000000a1" }, review: { decision: "accepted" } }), /RADAR_EXPERT_EVIDENCE_CONTEXT_MISMATCH/);
});

