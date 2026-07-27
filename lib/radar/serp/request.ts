import { z } from "zod";
import { SerpCollectionRecordSchema } from "../../editorial/contracts.ts";
import { VersionedArticleDNASchema } from "../../arquiteto/contracts.ts";
import { RadarHydrationSnapshotSchema } from "../hydration.ts";
import { RadarSerpResolutionEnvelopeSchema } from "../resolution-envelope.ts";

const LocalArticleContextSchema = z.object({
  articleVersion: VersionedArticleDNASchema.optional(),
  hydration: RadarHydrationSnapshotSchema.nullable().optional(),
  resolutionEnvelope: RadarSerpResolutionEnvelopeSchema,
});

export const CollectRequestSchema = z.object({
  action: z.literal("collect"),
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  location: z.string().min(1).max(160),
  language: z.string().min(2).max(20),
  device: z.enum(["desktop", "mobile"]),
  ...LocalArticleContextSchema.shape,
});

export const ReviewRequestSchema = z.object({
  action: z.literal("review"),
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  snapshotId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(4000).default(""),
  record: SerpCollectionRecordSchema.optional(),
  ...LocalArticleContextSchema.shape,
});

export const RequestSchema = z.discriminatedUnion("action", [CollectRequestSchema, ReviewRequestSchema]);
