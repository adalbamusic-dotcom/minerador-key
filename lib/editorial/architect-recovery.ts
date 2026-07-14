import { z } from "zod";
import { ProvisionalArticleGroupSchema, VersionedArticleDNASchema, VersionedSiloDNASchema, VersionStatusEventSchema } from "../arquiteto/contracts.ts";
import { AIReviewAnnotationSchema } from "./operational-contracts.ts";

export const ArchitectReviewRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  importedKeywordSignature: z.string(),
  masterList: z.array(z.record(z.string(), z.unknown())),
  provisionalGroups: z.array(ProvisionalArticleGroupSchema),
  customSlugs: z.record(z.string(), z.string()),
  customHierarchies: z.record(z.string(), z.string()),
  annotations: z.array(AIReviewAnnotationSchema),
  savedAt: z.string().datetime(),
});

export const ArchitectArticleDnaRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  versions: z.record(z.string(), VersionedArticleDNASchema),
  events: z.array(VersionStatusEventSchema),
  savedAt: z.string().datetime(),
});

export const ArchitectSiloDnaRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  versions: z.record(z.string(), VersionedSiloDNASchema),
  events: z.array(VersionStatusEventSchema),
  savedAt: z.string().datetime(),
});

export const architectReviewRecoveryKey = (brandId: string) => `minerador-pro:architect-review:${brandId}`;
export const architectArticleDnaRecoveryKey = (brandId: string) => `minerador-pro:architect-article-dna:${brandId}`;
export const architectSiloDnaRecoveryKey = (brandId: string) => `minerador-pro:architect-silo-dna:${brandId}`;
