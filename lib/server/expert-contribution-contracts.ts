import { z } from "zod";

export const ExpertEvidenceReferenceSchema = z.object({
  sourceType: z.enum(["TEXT", "VOICE", "AUDIO", "DOCUMENT"]),
  provider: z.literal("telegram"),
  externalUpdateId: z.string().min(1).max(80),
  originalAssetUri: z.string().url().nullable().optional(),
  checksum: z.string().max(256).nullable().optional(),
}).strict();

/**
 * Statuses already accepted by the canonical expert_briefs table. This is a
 * shared representation of the current contract, not a second workflow.
 */
export const ExpertBriefStatusSchema = z.enum([
  "draft",
  "ready_to_send",
  "awaiting_expert",
  "receiving",
  "awaiting_review",
  "reviewed",
  "blocked",
  "cancelled",
]);

export const ExpertBriefInputSchema = z.object({
  brandId: z.string().uuid(),
  expertId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256).nullable().optional(),
  articleDnaVersionId: z.string().trim().min(1).max(256).nullable().optional(),
  title: z.string().trim().min(1).max(240),
  radarContext: z.record(z.string(), z.unknown()).default({}),
  questions: z.array(z.unknown()).default([]),
}).strict();

export const ExpertContributionRecordSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  expertId: z.string().uuid(),
  briefId: z.string().uuid(),
  provider: z.literal("telegram"),
  sourceType: z.enum(["TEXT", "VOICE", "AUDIO", "DOCUMENT"]),
  originalText: z.string().nullable(),
  transcriptText: z.string().nullable(),
  organizationPayload: z.record(z.string(), z.unknown()).nullable(),
  evidence: ExpertEvidenceReferenceSchema,
}).strict();

export type ExpertBriefInput = z.infer<typeof ExpertBriefInputSchema>;
export type ExpertBriefStatus = z.infer<typeof ExpertBriefStatusSchema>;
export type ExpertContributionRecord = z.infer<typeof ExpertContributionRecordSchema>;
