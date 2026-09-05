import { z } from "zod";
import type { SerpCollectionRecord, SerpReviewRecord } from "../editorial/contracts.ts";
import {
  radarR4QueueItems,
  type RadarR4LocalArticleState,
  type RadarR4SerpQueue,
  type RadarR4SerpQueueState,
  type RadarR4Topic,
  type RadarR4TopicSource,
} from "./r4-queue.ts";

export const RADAR_R5_SERP_PROCESS_STATES = ["ELIGIBLE", "ALREADY_DONE", "REQUIRES_EXPLICIT_REFRESH", "BLOCKED"] as const;
export type RadarR5SerpProcessState = typeof RADAR_R5_SERP_PROCESS_STATES[number];

export const RADAR_R5_TOPIC_ORIGINS = ["SERP", "AMAZON", "ArticleDNA", "SiloDNA", "Conteúdo existente"] as const;
export type RadarR5TopicOrigin = typeof RADAR_R5_TOPIC_ORIGINS[number];

export const RadarR5TopicSuggestionSchema = z.object({
  text: z.string().trim().min(1).max(500),
  origin: z.enum(RADAR_R5_TOPIC_ORIGINS),
  origins: z.array(z.enum(RADAR_R5_TOPIC_ORIGINS)).min(1).max(4).optional(),
  justification: z.string().trim().min(1).max(1000),
  need: z.string().trim().min(1).max(500),
  reference: z.string().trim().min(1).max(800).optional(),
  complementaryExistingContent: z.string().trim().min(1).max(500).optional(),
}).strict();

export const RadarR5ExpertTopicContextSchema = z.object({
  articleDna: z.object({ principal: z.string(), intent: z.string(), silo: z.string() }).strict(),
  serpNeeds: z.array(z.string()).max(40),
  amazonCriteria: z.array(z.string()).max(20),
  existingContent: z.string().max(8000),
  openGaps: z.array(z.string()).max(40),
  articleDnaVersionId: z.string().min(1),
  serpSnapshotId: z.string().nullable(),
  approvedReferences: z.array(z.object({
    position: z.number().int().positive(),
    title: z.string(),
    url: z.string().url(),
    role: z.enum(["primary", "support"]),
  }).strict()).max(20),
  amazonState: z.enum(["AMAZON_APPLICABLE", "AMAZON_NOT_APPLICABLE", "AMAZON_PENDING", "AMAZON_REVIEWED"]),
}).strict();

export type RadarR5TopicSuggestion = z.infer<typeof RadarR5TopicSuggestionSchema>;
export type RadarR5ExpertTopicContext = z.infer<typeof RadarR5ExpertTopicContextSchema>;

export type RadarR5QueueProgress = {
  total: number;
  queued: number;
  running: number;
  waitingReview: number;
  completed: number;
  failedRetryable: number;
  failedFinal: number;
  active: boolean;
};

function timestampForRecord(record: SerpCollectionRecord): number {
  const value = record.research?.collectedAt || record.snapshot?.capturedAt;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/** Prefer an existing real snapshot over a mock or legacy snapshot. */
export function latestRadarR5SerpRecord(records: SerpCollectionRecord[], articleId: string): SerpCollectionRecord | null {
  const articleRecords = records.filter(record => record.input.articleId === articleId);
  const realRecords = articleRecords.filter(record => record.origin === "real" && Boolean(record.research));
  const candidates = realRecords.length ? realRecords : articleRecords;
  return [...candidates].sort((left, right) => {
    const versionDifference = (left.research?.version || 0) - (right.research?.version || 0);
    return versionDifference || timestampForRecord(left) - timestampForRecord(right) || left.id.localeCompare(right.id);
  }).at(-1) || null;
}

export function latestRadarR5SerpReview(reviews: SerpReviewRecord[], snapshotId: string | null | undefined): SerpReviewRecord | null {
  if (!snapshotId) return null;
  return [...reviews.filter(review => review.snapshotId === snapshotId)].sort((left, right) => Date.parse(left.reviewedAt) - Date.parse(right.reviewedAt) || left.id.localeCompare(right.id)).at(-1) || null;
}

export function deriveRadarR5PersistedSerpState(input: {
  articleId: string;
  records: SerpCollectionRecord[];
  reviews: SerpReviewRecord[];
}): RadarR4LocalArticleState["serp"] {
  const record = latestRadarR5SerpRecord(input.records, input.articleId);
  if (!record || record.origin !== "real" || !record.research) return { state: null, position: null, total: null, error: null };
  const review = latestRadarR5SerpReview(input.reviews, record.id);
  return {
    state: review ? "COMPLETED" : "WAITING_REVIEW",
    position: null,
    total: null,
    error: review?.status === "rejected" ? "SERP revisada e rejeitada; uma nova coleta exige refresh explícito." : null,
  };
}

export function classifyRadarR5SerpArticle(input: {
  keywordReady: boolean;
  latestRecord: SerpCollectionRecord | null;
  currentState?: RadarR4SerpQueueState | null;
  mode?: "default" | "explicit_refresh";
}): RadarR5SerpProcessState {
  if (!input.keywordReady) return "BLOCKED";
  if (input.currentState === "FAILED_FINAL") return "BLOCKED";
  if (input.mode === "explicit_refresh") {
    if (["QUEUED", "RUNNING"].includes(input.currentState || "")) return "BLOCKED";
    return input.latestRecord?.origin === "real" && input.latestRecord.research ? "ELIGIBLE" : "BLOCKED";
  }
  if (input.currentState === "FAILED_RETRYABLE") return "ELIGIBLE";
  if (["QUEUED", "RUNNING"].includes(input.currentState || "")) return "ALREADY_DONE";
  if (input.latestRecord?.origin === "real" && input.latestRecord.research) return "ALREADY_DONE";
  return "ELIGIBLE";
}

export function classifyRadarR5SerpFailure(error: unknown): "FAILED_RETRYABLE" | "FAILED_FINAL" {
  const message = error instanceof Error ? error.message : String(error || "");
  return /not_entitled|permission_denied|unauthorized|forbidden|invalid_serp_request|transfer_conflict|invalid_transfer|schema_missing/i.test(message)
    ? "FAILED_FINAL"
    : "FAILED_RETRYABLE";
}

export function buildRadarR5QueueProgress(queue: RadarR4SerpQueue | null): RadarR5QueueProgress {
  const items = queue ? radarR4QueueItems(queue) : [];
  const count = (state: RadarR4SerpQueueState) => items.filter(item => item.state === state).length;
  const progress = {
    total: items.length,
    queued: count("QUEUED"),
    running: count("RUNNING"),
    waitingReview: count("WAITING_REVIEW"),
    completed: count("COMPLETED"),
    failedRetryable: count("FAILED_RETRYABLE"),
    failedFinal: count("FAILED_FINAL"),
  };
  return { ...progress, active: progress.total > 0 && progress.completed < progress.total };
}

export function topicSourceType(origin: RadarR5TopicOrigin): RadarR4TopicSource {
  return origin;
}

export function topicSuggestionsToRadarTopics(articleId: string, suggestions: RadarR5TopicSuggestion[]): RadarR4Topic[] {
  return suggestions.map((suggestion, index) => ({
    id: `${articleId}:topic:deepseek:${index + 1}`,
    text: suggestion.text,
    source: suggestion.justification,
    sourceType: topicSourceType(suggestion.origin),
    origin: suggestion.origin,
    justification: suggestion.justification,
    need: suggestion.need,
    reference: suggestion.reference || null,
    provenance: {
      origins: [...new Set(suggestion.origins || [suggestion.origin])],
      reference: suggestion.reference || null,
      complementaryExistingContent: suggestion.complementaryExistingContent || null,
    },
  }));
}

export function areRadarR5TopicsReviewed(items: RadarR4Topic[], reviewedIds: string[]): boolean {
  return items.length > 0 && items.every(item => reviewedIds.includes(item.id));
}
