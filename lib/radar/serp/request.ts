import { z } from "zod";
import { SerpCollectionRecordSchema } from "../../editorial/contracts.ts";
import { RadarHydrationSnapshotSchema } from "../hydration.ts";
import { RadarSerpResolutionEnvelopeSchema } from "../resolution-envelope.ts";

export function buildRadarSerpCollectPayload(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  location: string;
  language: string;
  device: "desktop" | "mobile";
  articleVersion?: unknown;
  resolutionEnvelope: z.infer<typeof RadarSerpResolutionEnvelopeSchema>;
}) {
  const articleDnaVersionId = input.articleDnaVersionId.trim();
  if (!articleDnaVersionId) throw new Error("A versão do ArticleDNA deste item do Radar não está disponível.");
  return {
    action: "collect" as const,
    brandId: input.brandId,
    articleId: input.articleId,
    articleDnaVersionId,
    location: input.location,
    language: input.language,
    device: input.device,
    articleVersion: input.articleVersion,
    resolutionEnvelope: input.resolutionEnvelope,
  };
}

const LocalArticleContextSchema = z.object({
  // The client may carry a legacy/local recovery envelope whose ArticleDNA
  // contains fields newer than this route's request contract. Keep request
  // validation focused on the SERP operation; resolveArticle validates the
  // local ArticleDNA only when the remote canonical read is unavailable.
  articleVersion: z.unknown().optional(),
  articleDnaVersionId: z.string().min(1).optional(),
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
