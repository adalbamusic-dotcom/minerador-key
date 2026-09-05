import assert from "node:assert/strict";
import test from "node:test";
import { persistExpertContributionOrganizationWriteback, persistExpertContributionTranscriptWriteback, persistTelegramContributionAssetWriteback } from "../lib/local-worker/writeback.ts";

test("worker escreve o URI do asset na contribuição com escopo de marca antes de concluir o job", async () => {
  const calls: Array<{ table: string; operation: string; value?: unknown }> = [];
  const client = {
    from(table: string) {
      const builder = {
        update(value: unknown) { calls.push({ table, operation: "update", value }); return builder; },
        eq(column: string, value: unknown) { calls.push({ table, operation: `eq:${column}`, value }); return builder; },
        select(value: unknown) { calls.push({ table, operation: "select", value }); return builder; },
        async maybeSingle() { return { data: { id: "contribution-1" }, error: null }; },
      };
      return builder;
    },
  };
  await persistTelegramContributionAssetWriteback({ client: client as never, writeback: { kind: "telegram_contribution_asset", brandId: "brand-1", contributionId: "contribution-1", originalAssetUri: "https://storage.example/asset.ogg", originalChecksum: "checksum-1" } });
  assert.equal(calls[0]?.table, "expert_contributions");
  assert.equal(calls[0]?.operation, "update");
  assert.equal((calls[0]?.value as Record<string, unknown>).original_asset_uri, "https://storage.example/asset.ogg");
  assert.equal((calls[0]?.value as Record<string, unknown>).processing_status, "EXTRACTED");
  assert.equal(typeof (calls[0]?.value as Record<string, unknown>).processed_at, "string");
  assert.equal(calls.some(call => call.operation === "eq:brand_id" && call.value === "brand-1"), true);
  assert.equal((calls[0]?.value as Record<string, unknown>).original_checksum, "checksum-1");
});

function writebackClient() {
  const calls: Array<{ table: string; operation: string; value?: unknown }> = [];
  const client = {
    calls,
    from(table: string) {
      const builder = {
        update(value: unknown) { calls.push({ table, operation: "update", value }); return builder; },
        eq(column: string, value: unknown) { calls.push({ table, operation: `eq:${column}`, value }); return builder; },
        select(value: unknown) { calls.push({ table, operation: "select", value }); return builder; },
        async maybeSingle() { return { data: { id: "contribution-1", transcript_text: "texto fiel", organization_payload: { organizedText: "texto organizado" }, processing_status: "EXTRACTED" }, error: null }; },
      };
      return builder;
    },
  };
  return client;
}

test("worker grava transcrição e organização em writebacks separados sem tocar no asset original", async () => {
  const transcriptClient = writebackClient();
  await persistExpertContributionTranscriptWriteback({ client: transcriptClient as never, writeback: { kind: "expert_contribution_transcript", brandId: "brand-1", expertId: "expert-1", briefId: "brief-1", contributionId: "contribution-1", transcriptText: " texto fiel ", extractionPayload: { provider: "google_cloud_speech" } } });
  const transcriptUpdate = transcriptClient.calls.find(call => call.operation === "update")?.value as Record<string, unknown>;
  assert.equal(transcriptUpdate.transcript_text, "texto fiel");
  assert.equal(transcriptUpdate.processing_status, "EXTRACTED");
  assert.equal(transcriptUpdate.extraction_payload && typeof transcriptUpdate.extraction_payload, "object");
  assert.equal("original_asset_uri" in transcriptUpdate, false);

  const organizationClient = writebackClient();
  await persistExpertContributionOrganizationWriteback({ client: organizationClient as never, writeback: { kind: "expert_contribution_organization", brandId: "brand-1", expertId: "expert-1", briefId: "brief-1", contributionId: "contribution-1", organizationPayload: { organizedText: "texto organizado", humanDecisionRequired: true } } });
  const organizationUpdate = organizationClient.calls.find(call => call.operation === "update")?.value as Record<string, unknown>;
  assert.deepEqual(organizationUpdate.organization_payload, { organizedText: "texto organizado", humanDecisionRequired: true });
  assert.equal("transcript_text" in organizationUpdate, false);
  assert.equal("original_asset_uri" in organizationUpdate, false);
});
