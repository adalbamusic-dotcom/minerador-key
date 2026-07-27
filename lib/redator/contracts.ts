import { z } from "zod";
import { ContentBlockSchema, ContentDocumentSchema, VersionReferenceSchema, type ContentDocument } from "../arquiteto/contracts.ts";
import { GuardianFindingSchema, SectionReviewSchema, type GuardianFinding, type SectionReview } from "../editorial/operational-contracts.ts";

export const RedatorPromptContextSchema = z.object({
  documentId: z.string().min(1),
  sectionId: z.string().min(1),
  sectionLabel: z.string().min(1),
  contentPlanRef: VersionReferenceSchema,
  articleDnaRef: VersionReferenceSchema,
  siloDnaRef: VersionReferenceSchema,
  keywordDnaRefs: z.array(VersionReferenceSchema).min(1),
  instructions: z.array(z.string().max(4000)).max(40),
  previousBlocks: z.array(ContentBlockSchema).max(120),
  pendingItems: z.array(z.string().max(1000)).max(40),
  humanInstruction: z.string().max(4000).default(""),
});

export const RedatorSectionRequestSchema = z.object({
  brandId: z.string().min(1),
  document: ContentDocumentSchema,
  sectionId: z.string().min(1),
  humanInstruction: z.string().max(4000).default(""),
});

export const RedatorImproveRequestSchema = z.object({
  brandId: z.string().min(1),
  document: ContentDocumentSchema,
  selectedText: z.string().trim().min(1).max(12000),
  humanInstruction: z.string().max(4000).default(""),
});

export const RedatorGuardianRequestSchema = z.object({
  brandId: z.string().min(1),
  document: ContentDocumentSchema,
  contentHash: z.string().min(1),
});

export const RedatorProposalBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("paragraph"),
  text: z.string().min(1),
  provenance: z.object({
    keywordDnaRefs: z.array(VersionReferenceSchema),
    evidenceRefs: z.array(z.object({ artifactId: z.string(), artifactType: z.string(), contentHash: z.string() })),
    sourceIds: z.array(z.string()),
  }),
});

export const RedatorSectionProposalSchema = z.object({
  documentId: z.string().min(1),
  sectionId: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1).max(8),
  alerts: z.array(z.string().max(1000)).max(20),
  humanDecisionRequired: z.literal(true),
  origin: z.literal("ai"),
});

export const RedatorImproveProposalSchema = z.object({
  replacementText: z.string().trim().min(1).max(12000),
  alerts: z.array(z.string().max(1000)).max(20),
  humanDecisionRequired: z.literal(true),
  origin: z.literal("ai"),
});

export const GuardianReportSchema = z.object({
  documentId: z.string().min(1),
  contentHash: z.string().min(1),
  status: z.enum(["ready_for_human_review", "warnings", "blocked"]),
  findings: z.array(GuardianFindingSchema),
  sections: z.array(SectionReviewSchema),
  blockingCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  humanDecisionRequired: z.literal(true),
  origin: z.literal("rule_engine"),
  generatedAt: z.string().datetime(),
});

export type RedatorPromptContext = z.infer<typeof RedatorPromptContextSchema>;
export type RedatorSectionRequest = z.infer<typeof RedatorSectionRequestSchema>;
export type RedatorImproveRequest = z.infer<typeof RedatorImproveRequestSchema>;
export type RedatorGuardianRequest = z.infer<typeof RedatorGuardianRequestSchema>;
export type RedatorProposalBlock = z.infer<typeof RedatorProposalBlockSchema>;
export type RedatorSectionProposal = z.infer<typeof RedatorSectionProposalSchema>;
export type RedatorImproveProposal = z.infer<typeof RedatorImproveProposalSchema>;
export type GuardianReport = z.infer<typeof GuardianReportSchema>;

export type RedatorDocumentInput = ContentDocument;
export type RedatorContentBlock = z.infer<typeof ContentBlockSchema>;
export type RedatorFinding = GuardianFinding;
export type RedatorSectionReview = SectionReview;

export function parseRedatorDocument(input: unknown) {
  return ContentDocumentSchema.parse(input);
}
