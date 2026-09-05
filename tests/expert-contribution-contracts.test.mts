import assert from "node:assert/strict";
import test from "node:test";
import { ExpertBriefInputSchema, ExpertContributionRecordSchema } from "../lib/server/expert-contribution-contracts.ts";

test("ExpertBrief remains an input contract, not an editorial approval", () => {
  const brief = ExpertBriefInputSchema.parse({ brandId: "10000000-0000-4000-8000-0000000000a1", expertId: "10000000-0000-4000-8000-0000000000a2", title: "Perguntas sobre atendimento", questions: ["Como funciona?"] });
  assert.equal(brief.title, "Perguntas sobre atendimento");
  assert.deepEqual(brief.radarContext, {});
});

test("ExpertContribution keeps original, transcript and organization as separate layers", () => {
  const record = ExpertContributionRecordSchema.parse({ id: "10000000-0000-4000-8000-0000000000a3", brandId: "10000000-0000-4000-8000-0000000000a1", expertId: "10000000-0000-4000-8000-0000000000a2", briefId: "10000000-0000-4000-8000-0000000000a4", provider: "telegram", sourceType: "VOICE", originalText: null, transcriptText: null, organizationPayload: null, evidence: { sourceType: "VOICE", provider: "telegram", externalUpdateId: "12", originalAssetUri: null, checksum: null } });
  assert.equal(record.originalText, null);
  assert.equal(record.transcriptText, null);
  assert.equal(record.organizationPayload, null);
});

