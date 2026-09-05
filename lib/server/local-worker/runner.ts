import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { enqueueExternalProcessingJob } from "@/lib/server/telegram/persistence";
import { persistExpertContributionOrganizationWriteback, persistExpertContributionTranscriptWriteback, persistTelegramContributionAssetWriteback, type LocalWorkerWriteback } from "@/lib/local-worker/writeback";

export type ExternalProcessingJob = {
  id: string;
  brand_id: string;
  brief_id: string | null;
  contribution_id: string | null;
  job_kind: "telegram_media_preservation" | "speech_transcription" | "document_extraction";
  status: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  claimed_by: string | null;
};

type WorkerClient = Pick<SupabaseClient, "from" | "rpc">;

export type LocalWorkerFollowUpJob = {
  brandId: string;
  briefId: string;
  contributionId: string;
  jobKind: ExternalProcessingJob["job_kind"];
  payload?: Record<string, unknown>;
};

export type LocalWorkerProcessorOutcome = { status?: "COMPLETED" | "BLOCKED"; payload?: Record<string, unknown>; writeback?: LocalWorkerWriteback; followUpJobs?: LocalWorkerFollowUpJob[] };
export type LocalWorkerProcessor = (job: ExternalProcessingJob) => Promise<LocalWorkerProcessorOutcome>;

function fail(result: { error: { code?: string; message?: string } | null }, message: string): never | void {
  if (!result.error) return;
  throw new Error(`${message}:${result.error.code || "REMOTE_ERROR"}`);
}

export async function claimNextExternalProcessingJob(input: { workerId: string; leaseSeconds?: number; client?: WorkerClient }) {
  const client = input.client || createCanonicalServiceClient();
  const result = await client.rpc("claim_external_processing_job", { p_worker_id: input.workerId, p_lease_seconds: input.leaseSeconds || 300 });
  fail(result, "Não foi possível reservar um job do worker local");
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return row ? row as ExternalProcessingJob : null;
}

export async function releaseExternalProcessingJob(input: { jobId: string; workerId: string; client?: WorkerClient }) {
  const client = input.client || createCanonicalServiceClient();
  const result = await client.from("external_processing_jobs").update({ status: "PENDING_LOCAL_PROCESSING", claimed_by: null, claimed_at: null, heartbeat_at: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq("id", input.jobId).eq("claimed_by", input.workerId);
  fail(result, "Não foi possível liberar o job reservado");
}

export async function heartbeatExternalProcessingJob(input: { jobId: string; workerId: string; leaseSeconds?: number; client?: WorkerClient }) {
  const client = input.client || createCanonicalServiceClient();
  const now = new Date();
  const result = await client.from("external_processing_jobs")
    .update({ heartbeat_at: now.toISOString(), lease_expires_at: new Date(now.getTime() + (input.leaseSeconds || 300) * 1000).toISOString(), updated_at: now.toISOString() })
    .eq("id", input.jobId)
    .eq("claimed_by", input.workerId)
    .eq("status", "PROCESSING");
  fail(result, "Não foi possível renovar o lease do job do worker local");
}

export async function completeExternalProcessingJob(input: { jobId: string; workerId: string; status: "COMPLETED" | "BLOCKED"; payload?: Record<string, unknown>; client?: WorkerClient }) {
  const client = input.client || createCanonicalServiceClient();
  const result = await client.from("external_processing_jobs").update({ status: input.status, payload: input.payload || {}, claimed_by: null, claimed_at: null, heartbeat_at: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq("id", input.jobId).eq("claimed_by", input.workerId);
  fail(result, "Não foi possível concluir o job do worker local");
}

export async function applyLocalWorkerWriteback(input: { writeback: LocalWorkerWriteback; client?: WorkerClient }) {
  const client = input.client || createCanonicalServiceClient();
  if (input.writeback.kind === "telegram_contribution_asset") {
    await persistTelegramContributionAssetWriteback({ client, writeback: input.writeback });
  } else if (input.writeback.kind === "expert_contribution_transcript") {
    await persistExpertContributionTranscriptWriteback({ client, writeback: input.writeback });
  } else {
    await persistExpertContributionOrganizationWriteback({ client, writeback: input.writeback });
  }
}

export async function failExternalProcessingJob(input: { job: ExternalProcessingJob; workerId: string; code: string; message: string; client?: WorkerClient }) {
  const client = input.client || createCanonicalServiceClient();
  const final = input.job.attempts >= input.job.max_attempts;
  const result = await client.from("external_processing_jobs").update({ status: final ? "FAILED_FINAL" : "FAILED_RETRYABLE", last_error_code: input.code.slice(0, 160), last_error_message: input.message.slice(0, 500), available_at: new Date(Date.now() + (final ? 0 : Math.min(input.job.attempts * 60_000, 15 * 60_000))).toISOString(), claimed_by: null, claimed_at: null, heartbeat_at: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq("id", input.job.id).eq("claimed_by", input.workerId);
  fail(result, "Não foi possível registrar a falha do job do worker local");
}

export async function runLocalWorkerOnce(input: { workerId: string; processor?: LocalWorkerProcessor; client?: WorkerClient }) {
  const job = await claimNextExternalProcessingJob(input);
  if (!job) return { status: "EMPTY" as const, job: null };
  if (!input.processor) {
    await releaseExternalProcessingJob({ jobId: job.id, workerId: input.workerId, client: input.client });
    return { status: "PROCESSOR_NOT_CONFIGURED" as const, job };
  }
  const leaseSeconds = 300;
  let heartbeatFailure: Error | null = null;
  const heartbeatTimer = setInterval(() => {
    void heartbeatExternalProcessingJob({ jobId: job.id, workerId: input.workerId, leaseSeconds, client: input.client }).catch(error => {
      heartbeatFailure = error instanceof Error ? error : new Error("WORKER_HEARTBEAT_FAILED");
    });
  }, Math.max(30_000, Math.floor(leaseSeconds * 1000 / 3)));
  try {
    const outcome = await input.processor(job);
    if (heartbeatFailure) throw heartbeatFailure;
    if (outcome.status === "BLOCKED" && (outcome.writeback || outcome.followUpJobs?.length)) throw new Error("WORKER_WRITEBACK_ON_BLOCKED_JOB");
    if (outcome.writeback) {
      await applyLocalWorkerWriteback({ writeback: outcome.writeback, client: input.client });
    }
    const followUpJobIds: string[] = [];
    for (const followUp of outcome.followUpJobs || []) {
      if (followUp.brandId !== job.brand_id || followUp.briefId !== job.brief_id || followUp.contributionId !== job.contribution_id) throw new Error("WORKER_FOLLOW_UP_SCOPE_MISMATCH");
      const queued = await enqueueExternalProcessingJob(followUp, input.client);
      if (queued.jobId) followUpJobIds.push(queued.jobId);
    }
    await completeExternalProcessingJob({ jobId: job.id, workerId: input.workerId, status: outcome.status || "COMPLETED", payload: { ...(outcome.payload || {}), ...(followUpJobIds.length ? { followUpJobIds } : {}) }, client: input.client });
    return { status: "PROCESSED" as const, job, outcome };
  } catch (error) {
    await failExternalProcessingJob({ job, workerId: input.workerId, code: error instanceof Error ? error.name : "WORKER_FAILED", message: error instanceof Error ? error.message : "Falha não identificada no worker.", client: input.client });
    return { status: "FAILED" as const, job };
  } finally {
    clearInterval(heartbeatTimer);
  }
}
