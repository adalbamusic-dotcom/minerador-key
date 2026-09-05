import "server-only";

import { getTelegramBot } from "@/lib/server/telegram/adapter";
import { resolveTelegramPlatformSecret } from "@/lib/server/telegram/canonical";
import type { ExternalProcessingJob, LocalWorkerFollowUpJob } from "./runner";

export type PreservedTelegramAsset = { fileId: string; data: Uint8Array; filePath: string; contentType: string | null };

export function createTelegramMediaPreservationProcessor(input: {
  persistOriginalAsset: (asset: PreservedTelegramAsset & { job: ExternalProcessingJob }) => Promise<{ uri: string; checksum?: string | null }>;
  fetchTelegramAsset?: (fileId: string, job: ExternalProcessingJob) => Promise<{ filePath: string; data: Uint8Array }>;
  fetchImpl?: typeof fetch;
}) {
  return async (job: ExternalProcessingJob) => {
    if (job.job_kind !== "telegram_media_preservation") return { status: "BLOCKED" as const, payload: { code: "WORKER_JOB_KIND_UNSUPPORTED" } };
    if (!job.contribution_id) return { status: "BLOCKED" as const, payload: { code: "TELEGRAM_CONTRIBUTION_ID_MISSING" } };
    const fileId = typeof job.payload.telegramFileId === "string" ? job.payload.telegramFileId : "";
    if (!fileId) return { status: "BLOCKED" as const, payload: { code: "TELEGRAM_FILE_ID_MISSING" } };
    const fetched = input.fetchTelegramAsset
      ? await input.fetchTelegramAsset(fileId, job)
      : await (async () => {
        const resolution = await resolveTelegramPlatformSecret({});
        const bot = getTelegramBot(resolution.secret.TELEGRAM_BOT_TOKEN, input.fetchImpl);
        const file = await bot.getFile(fileId);
        if (!file.file_path) return null;
        return { filePath: file.file_path, data: await bot.downloadFile(file.file_path) };
      })();
    if (!fetched) return { status: "BLOCKED" as const, payload: { code: "TELEGRAM_FILE_PATH_MISSING" } };
    const persisted = await input.persistOriginalAsset({ job, fileId, data: fetched.data, filePath: fetched.filePath, contentType: null });
    const sourceType = typeof job.payload.sourceType === "string" ? job.payload.sourceType : "";
    const followUpJobs: LocalWorkerFollowUpJob[] = job.brief_id && job.contribution_id && (sourceType === "VOICE" || sourceType === "AUDIO")
      ? [{ brandId: job.brand_id, briefId: job.brief_id, contributionId: job.contribution_id, jobKind: "speech_transcription", payload: { sourceType } }]
      : [];
    return {
      status: "COMPLETED" as const,
      payload: { originalAssetUri: persisted.uri, checksum: persisted.checksum || null },
      writeback: { kind: "telegram_contribution_asset" as const, brandId: job.brand_id, contributionId: job.contribution_id, originalAssetUri: persisted.uri, originalChecksum: persisted.checksum || null },
      ...(followUpJobs.length ? { followUpJobs } : {}),
    };
  };
}
