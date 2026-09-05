import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRadarExpertOrganizationPrompt, RADAR_EXPERT_ORGANIZATION_SYSTEM_PROMPT, RadarExpertOrganizationSchema, validateRadarExpertOrganization } from "@/lib/radar/expert-organization";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI } from "@/lib/server/structured-ai";
import { runSharedLongSpeech, uploadSharedTemporaryMedia } from "@/lib/server/google-cloud/media-operations";
import { fetchSharedTelegramFile } from "@/lib/server/telegram/operations";
import { getExpertBrief, getExpertContribution, markExpertContributionProcessing } from "@/lib/server/telegram/persistence";
import { createTelegramMediaPreservationProcessor, type PreservedTelegramAsset } from "./telegram-media";
import type { ExternalProcessingJob, LocalWorkerProcessor } from "./runner";
import type { SpeechAudioMetadata, SpeechTranscriptResult } from "@/lib/server/google-cloud/speech-operation";

type WorkerClient = Pick<SupabaseClient, "from" | "rpc">;

type RadarContributionWorkerDependencies = {
  actorUserId: string;
  client?: WorkerClient;
  fetchTelegramAsset?: (fileId: string, job: ExternalProcessingJob) => Promise<{ filePath: string; data: Uint8Array }>;
  persistOriginalAsset?: (asset: PreservedTelegramAsset & { job: ExternalProcessingJob }) => Promise<{ uri: string; checksum?: string | null }>;
  transcribe?: (input: { job: ExternalProcessingJob; contribution: Awaited<ReturnType<typeof getExpertContribution>> }) => Promise<SpeechTranscriptResult>;
  organize?: (input: { job: ExternalProcessingJob; contribution: NonNullable<Awaited<ReturnType<typeof getExpertContribution>>>, brief: NonNullable<Awaited<ReturnType<typeof getExpertBrief>>> }) => Promise<Record<string, unknown>>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourceType(job: ExternalProcessingJob) {
  return text(job.payload.sourceType);
}

function contentType(job: ExternalProcessingJob) {
  const value = text(job.payload.contentType);
  return value || (sourceType(job) === "VOICE" || sourceType(job) === "AUDIO" ? "audio/ogg" : "application/octet-stream");
}

function fileName(job: ExternalProcessingJob, filePath: string) {
  return text(job.payload.fileName) || filePath.split("/").pop() || "expert-media";
}

function checksum(data: Uint8Array) {
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

function speechMetadata(job: ExternalProcessingJob): SpeechAudioMetadata {
  const metadata = record(job.payload.audioMetadata);
  const result: SpeechAudioMetadata = {};
  for (const key of ["languageCode", "encoding", "model"] as const) {
    const value = text(metadata[key]);
    if (value) result[key] = value;
  }
  for (const key of ["sampleRateHertz", "audioChannelCount"] as const) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) result[key] = value;
  }
  if (typeof metadata.enableAutomaticPunctuation === "boolean") result.enableAutomaticPunctuation = metadata.enableAutomaticPunctuation;
  return result;
}

function contributionIdentity(contribution: NonNullable<Awaited<ReturnType<typeof getExpertContribution>>>) {
  return { brandId: contribution.brandId, expertId: contribution.expertId, briefId: contribution.briefId, contributionId: contribution.id };
}

async function readContribution(job: ExternalProcessingJob, client: WorkerClient) {
  if (!job.contribution_id || !job.brief_id) throw new Error("EXPERT_CONTRIBUTION_CONTEXT_MISSING");
  const contribution = await getExpertContribution({ brandId: job.brand_id, briefId: job.brief_id, contributionId: job.contribution_id }, client);
  if (!contribution) throw new Error("EXPERT_CONTRIBUTION_NOT_FOUND");
  return contribution;
}

export function createRadarExpertContributionWorkerProcessor(input: RadarContributionWorkerDependencies): LocalWorkerProcessor {
  const client = input.client;
  const mediaProcessor = createTelegramMediaPreservationProcessor({
    fetchImpl: undefined,
    fetchTelegramAsset: input.fetchTelegramAsset || (async (fileId, job) => {
      const fetched = await fetchSharedTelegramFile({ actorUserId: input.actorUserId, brandId: job.brand_id, client, fileId });
      if (!fetched.file.file_path) throw new Error("TELEGRAM_FILE_PATH_MISSING");
      return { filePath: fetched.file.file_path, data: fetched.data };
    }),
    persistOriginalAsset: input.persistOriginalAsset || (async (asset) => {
      const uploaded = await uploadSharedTemporaryMedia({
        actorUserId: input.actorUserId,
        brandId: asset.job.brand_id,
        client,
        source: "radar-expert-contribution",
        data: asset.data,
        contentType: contentType(asset.job),
        fileName: fileName(asset.job, asset.filePath),
        checksum: checksum(asset.data),
        objectId: asset.job.contribution_id || undefined,
      });
      return { uri: uploaded.result.uri, checksum: uploaded.result.checksum };
    }),
  });

  return async job => {
    const workerClient = client;
    if (!workerClient) throw new Error("RADAR_WORKER_CLIENT_MISSING");

    if (job.job_kind === "telegram_media_preservation") {
      const contribution = await readContribution(job, workerClient);
      const mediaSourceType = sourceType(job) || contribution.sourceType;
      if (contribution.evidence.originalAssetUri) {
        const followUpJobs = job.brief_id && job.contribution_id && (mediaSourceType === "VOICE" || mediaSourceType === "AUDIO")
          ? [{ brandId: job.brand_id, briefId: job.brief_id, contributionId: job.contribution_id, jobKind: "speech_transcription" as const, payload: { sourceType: mediaSourceType } }]
          : [];
        return { status: "COMPLETED" as const, payload: { originalAssetUri: contribution.evidence.originalAssetUri, checksum: contribution.evidence.checksum || null, idempotent: true }, ...(followUpJobs.length ? { followUpJobs } : {}) };
      }
      await markExpertContributionProcessing({ ...contributionIdentity(contribution) }, workerClient);
      return mediaProcessor({ ...job, payload: { ...job.payload, sourceType: mediaSourceType } });
    }

    if (job.job_kind === "speech_transcription") {
      const contribution = await readContribution(job, workerClient);
      if (sourceType(job) !== "VOICE" && sourceType(job) !== "AUDIO" && contribution.sourceType !== "VOICE" && contribution.sourceType !== "AUDIO") return { status: "BLOCKED" as const, payload: { code: "EXPERT_SOURCE_NOT_AUDIO" } };
      if (contribution.organizationPayload) return { status: "COMPLETED" as const, payload: { organizationAlreadyPresent: true, idempotent: true } };
      if (contribution.transcriptText) {
        return {
          status: "COMPLETED" as const,
          payload: { transcriptAlreadyPresent: true, idempotent: true },
          followUpJobs: [{ brandId: contribution.brandId, briefId: contribution.briefId, contributionId: contribution.id, jobKind: "document_extraction" as const, payload: { operation: "organize_expert_transcript" } }],
        };
      }
      if (!contribution.evidence.originalAssetUri) throw new Error("ORIGINAL_ASSET_NOT_READY");
      if (!contribution.evidence.originalAssetUri.startsWith("gs://")) throw new Error("ORIGINAL_ASSET_URI_NOT_GCS");
      await markExpertContributionProcessing({ ...contributionIdentity(contribution) }, workerClient);
      const result = input.transcribe
        ? await input.transcribe({ job, contribution })
        : (await runSharedLongSpeech({ actorUserId: input.actorUserId, brandId: contribution.brandId, client, gcsUri: contribution.evidence.originalAssetUri, metadata: speechMetadata(job) })).result;
      if (!result.transcript) throw new Error("EXPERT_TRANSCRIPT_EMPTY");
      return {
        status: "COMPLETED" as const,
        payload: { transcriptLength: result.transcript.length, mode: result.mode, languageCode: result.languageCode },
        writeback: { kind: "expert_contribution_transcript" as const, ...contributionIdentity(contribution), transcriptText: result.transcript, extractionPayload: { provider: "google_cloud_speech", mode: result.mode, languageCode: result.languageCode, confidence: result.confidence, alternatives: result.alternatives } },
        followUpJobs: [{ brandId: contribution.brandId, briefId: contribution.briefId, contributionId: contribution.id, jobKind: "document_extraction" as const, payload: { operation: "organize_expert_transcript" } }],
      };
    }

    if (job.job_kind !== "document_extraction" || text(job.payload.operation) !== "organize_expert_transcript") return { status: "BLOCKED" as const, payload: { code: "RADAR_WORKER_JOB_KIND_UNSUPPORTED" } };
    const contribution = await readContribution(job, workerClient);
    if (contribution.organizationPayload) return { status: "COMPLETED" as const, payload: { organizationAlreadyPresent: true, idempotent: true } };
    const transcript = contribution.transcriptText || contribution.originalText || "";
    if (!transcript) throw new Error("EXPERT_TRANSCRIPT_NOT_READY");
    const brief = await getExpertBrief({ brandId: contribution.brandId, briefId: contribution.briefId, expertId: contribution.expertId }, workerClient);
    if (!brief) throw new Error("EXPERT_BRIEF_NOT_FOUND");
    await markExpertContributionProcessing({ ...contributionIdentity(contribution) }, workerClient);
    const organization = input.organize
      ? await input.organize({ job, contribution, brief })
      : await (async () => {
        const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: input.actorUserId, brandId: contribution.brandId, client });
        const generated = await generateStructuredAI({ provider, system: RADAR_EXPERT_ORGANIZATION_SYSTEM_PROMPT, user: buildRadarExpertOrganizationPrompt({ briefTitle: brief.title, questions: brief.questions, radarContext: brief.radarContext, transcript }), schema: RadarExpertOrganizationSchema, maxTokens: 3500 });
        return validateRadarExpertOrganization({ transcript, organization: generated });
      })();
    const validatedOrganization = validateRadarExpertOrganization({ transcript, organization: RadarExpertOrganizationSchema.parse(organization) });
    if (!record(validatedOrganization).organizedText) throw new Error("EXPERT_ORGANIZATION_EMPTY");
    return {
      status: "COMPLETED" as const,
      payload: { organizedLength: text(record(validatedOrganization).organizedText).length, provider: input.organize ? "injected" : "deepseek" },
      writeback: { kind: "expert_contribution_organization" as const, ...contributionIdentity(contribution), organizationPayload: { ...validatedOrganization, provider: input.organize ? "injected" : "deepseek", sourceTranscriptHash: createHash("sha256").update(transcript, "utf8").digest("hex"), humanDecisionRequired: true } },
    };
  };
}
