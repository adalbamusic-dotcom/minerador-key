import type { SupabaseClient } from "@supabase/supabase-js";

export type LocalWorkerWriteback =
  | {
    kind: "telegram_contribution_asset";
    brandId: string;
    contributionId: string;
    originalAssetUri: string;
    originalChecksum?: string | null;
  }
  | {
    kind: "expert_contribution_transcript";
    brandId: string;
    expertId: string;
    briefId: string;
    contributionId: string;
    transcriptText: string;
    extractionPayload?: Record<string, unknown> | null;
  }
  | {
    kind: "expert_contribution_organization";
    brandId: string;
    expertId: string;
    briefId: string;
    contributionId: string;
    organizationPayload: Record<string, unknown>;
  };

type WritebackClient = Pick<SupabaseClient, "from">;

function fail(result: { error: { code?: string; message?: string } | null }, message: string): never | void {
  if (!result.error) return;
  throw new Error(`${message}:${result.error.code || "REMOTE_ERROR"}`);
}

export async function persistTelegramContributionAssetWriteback(input: { client: WritebackClient; writeback: LocalWorkerWriteback }) {
  if (input.writeback.kind !== "telegram_contribution_asset") throw new Error("LOCAL_WORKER_WRITEBACK_KIND_MISMATCH");
  const update: Record<string, unknown> = {
    original_asset_uri: input.writeback.originalAssetUri,
    processing_status: "EXTRACTED",
    processed_at: new Date().toISOString(),
  };
  if (input.writeback.originalChecksum !== undefined) update.original_checksum = input.writeback.originalChecksum;
  const result = await input.client.from("expert_contributions").update(update).eq("id", input.writeback.contributionId).eq("brand_id", input.writeback.brandId).select("id").maybeSingle();
  fail(result, "Não foi possível escrever o asset original na contribuição");
  if (!result.data) throw new Error("EXPERT_CONTRIBUTION_WRITEBACK_NOT_FOUND");
}

export async function persistExpertContributionTranscriptWriteback(input: { client: WritebackClient; writeback: LocalWorkerWriteback }) {
  if (input.writeback.kind !== "expert_contribution_transcript") throw new Error("LOCAL_WORKER_WRITEBACK_KIND_MISMATCH");
  const transcriptText = input.writeback.transcriptText.trim();
  if (!transcriptText) throw new Error("EXPERT_TRANSCRIPT_EMPTY");
  const update: Record<string, unknown> = {
    transcript_text: transcriptText,
    processing_status: "EXTRACTED",
    processed_at: new Date().toISOString(),
  };
  if (input.writeback.extractionPayload) update.extraction_payload = input.writeback.extractionPayload;
  const result = await input.client.from("expert_contributions")
    .update(update)
    .eq("id", input.writeback.contributionId)
    .eq("brand_id", input.writeback.brandId)
    .eq("expert_id", input.writeback.expertId)
    .eq("brief_id", input.writeback.briefId)
    .select("id,transcript_text,processing_status")
    .maybeSingle();
  fail(result, "Não foi possível escrever a transcrição fiel da contribuição");
  if (!result.data) throw new Error("EXPERT_CONTRIBUTION_TRANSCRIPT_WRITEBACK_NOT_FOUND");
}

export async function persistExpertContributionOrganizationWriteback(input: { client: WritebackClient; writeback: LocalWorkerWriteback }) {
  if (input.writeback.kind !== "expert_contribution_organization") throw new Error("LOCAL_WORKER_WRITEBACK_KIND_MISMATCH");
  const result = await input.client.from("expert_contributions")
    .update({ organization_payload: input.writeback.organizationPayload, processing_status: "EXTRACTED", processed_at: new Date().toISOString() })
    .eq("id", input.writeback.contributionId)
    .eq("brand_id", input.writeback.brandId)
    .eq("expert_id", input.writeback.expertId)
    .eq("brief_id", input.writeback.briefId)
    .select("id,transcript_text,organization_payload,processing_status")
    .maybeSingle();
  fail(result, "Não foi possível escrever a organização da contribuição");
  if (!result.data) throw new Error("EXPERT_CONTRIBUTION_ORGANIZATION_WRITEBACK_NOT_FOUND");
}
