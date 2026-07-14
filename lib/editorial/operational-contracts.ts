import { z } from "zod";
import { ConfidenceSchema, VersionReferenceSchema } from "../arquiteto/contracts.ts";

export const AIReviewAnnotationSchema = z.object({
  id: z.string().min(1),
  module: z.enum(["minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"]),
  entityId: z.string().min(1),
  action: z.string().min(1),
  summary: z.string().min(1),
  details: z.array(z.string()),
  confidence: ConfidenceSchema,
  source: z.literal("ai"),
  reviewState: z.enum(["pending_fine_review", "reviewed", "adjusted", "dismissed"]),
  appliedLocally: z.boolean(),
  createdAt: z.string().datetime(),
});

export const BrandRoleSchema = z.enum(["owner", "brand_admin", "strategist", "analyst", "writer", "editor", "viewer", "external_collaborator", "legacy_client"]);
export const BrandSkillSchema = z.object({ id: z.string(), brandId: z.string(), name: z.string().min(1), description: z.string(), rules: z.array(z.string()), status: z.enum(["draft", "approved", "archived"]), origin: z.enum(["local", "legacy", "mock"]) });
export const BrandPromptSchema = z.object({ id: z.string(), brandId: z.string(), name: z.string(), purpose: z.string(), content: z.string(), scope: z.enum(["brand", "article"]), status: z.enum(["draft", "approved", "archived"]), origin: z.enum(["local", "mock"]), skillId: z.string().nullable() });
export const BrandMaterialSchema = z.object({ id: z.string(), brandId: z.string(), name: z.string(), type: z.enum(["prd", "voice_guide", "manual", "published_content", "own_source", "strategic_file"]), origin: z.enum(["real", "local", "legacy", "mock"]), status: z.enum(["available", "missing", "pending_review"]) });

export const DelegatedPermissionSchema = z.enum(["view_miner", "edit_architect", "review_radar", "approve_content_plan", "review_content", "view_publications"]);
export const DelegatedAccessGrantSchema = z.object({ id: z.string(), brandId: z.string(), granteeId: z.string(), permissions: z.array(DelegatedPermissionSchema), status: z.enum(["requested", "active", "revoked"]),
  protectedCapabilities: z.array(z.enum(["change_tax_id", "change_billing", "remove_owner", "change_registration", "delete_brand"])) });

export const AnchorCandidateSchema = z.object({ id: z.string(), text: z.string().min(1), semanticReason: z.string(), naturalness: ConfidenceSchema, repetitionRisk: z.enum(["low", "medium", "high"]), overOptimizationRisk: z.enum(["low", "medium", "high"]), approved: z.boolean() });
export const InternalLinkAssignmentSchema = z.object({ id: z.string(), sourceArticleId: z.string(), targetArticleId: z.string(), targetSlug: z.string().min(1), strategicReason: z.string(), recommendedContext: z.string(), relatedTopic: z.string(), linkIntent: z.string(), suggestedPosition: z.string(), candidates: z.array(AnchorCandidateSchema).min(1), previouslyUsedAnchors: z.array(z.string()), required: z.boolean(), status: z.enum(["suggested", "approved", "inserted", "rejected"]), humanApproved: z.boolean() });

export const ExternalSourceSuggestionSchema = z.object({ id: z.string(), articleId: z.string(), claim: z.string().min(1), entity: z.string(), sourceType: z.enum(["official_documentation", "public_agency", "study", "scientific_article", "manufacturer", "technical_standard", "institution", "industry_source", "recognized_entity"]), candidateUrl: z.string().url().nullable(), domain: z.string().nullable(), title: z.string().nullable(), reason: z.string(), relationToArticle: z.string(), confidence: ConfidenceSchema, authority: z.enum(["unknown", "medium", "high"]), checkedAt: z.string().datetime().nullable(), stalenessRisk: z.enum(["low", "medium", "high"]), status: z.enum(["suggested", "approved", "rejected", "needs_source"]), humanApproved: z.boolean() });

export const GuardianFindingSchema = z.object({ id: z.string(), documentId: z.string(), sectionId: z.string(), category: z.enum(["coverage", "intent", "entities", "naturalness", "completeness", "repetition", "cannibalization", "originality", "evidence", "internal_link", "anchor", "external_link", "source", "heading", "cta", "readability", "ymyl", "metadata", "plan_adherence", "skill_adherence"]), severity: z.enum(["info", "warning", "blocked"]), message: z.string(), suggestion: z.string().nullable(), humanDecisionRequired: z.boolean() });
export const SectionReviewSchema = z.object({ sectionId: z.string(), label: z.string(), status: z.enum(["not_analyzed", "approved", "warning", "blocked", "missing_evidence"]), findings: z.array(GuardianFindingSchema) });

export const EditorialImageBriefSchema = z.object({ id: z.string(), articleId: z.string(), position: z.string(), objective: z.string(), subject: z.string(), visualFunction: z.string(), requiredElements: z.array(z.string()), avoid: z.array(z.string()), aspectRatio: z.string(), prompt: z.string().nullable(), altText: z.string().nullable(), fileName: z.string().nullable(), status: z.enum(["planned", "prompt_ready", "approved", "rejected"]), humanApproved: z.boolean() });

export const PublicationRecordSchema = z.object({ id: z.string(), articleId: z.string(), brandId: z.string(), title: z.string(), slug: z.string(), siloId: z.string().nullable(), documentRef: VersionReferenceSchema.nullable(), responsible: z.string().nullable(), status: z.enum(["library", "queue", "published", "update_due"]), seoScore: z.number().min(0).max(100).nullable(), originalityScore: z.number().min(0).max(100).nullable(), ymylStatus: z.enum(["not_applicable", "pending", "reviewed"]), linkCount: z.number().int().nonnegative(), sourceCount: z.number().int().nonnegative(), imageCount: z.number().int().nonnegative(), destination: z.string().nullable(), lastEditedAt: z.string().datetime().nullable(), publishedAt: z.string().datetime().nullable(), origin: z.enum(["real", "local", "mock"]) });

export const OperationalContentPlanSchema = z.object({ planRef: VersionReferenceSchema, skillIds: z.array(z.string()), promptIds: z.array(z.string()), internalLinks: z.array(InternalLinkAssignmentSchema), externalSources: z.array(ExternalSourceSuggestionSchema), imageBriefs: z.array(EditorialImageBriefSchema), pendingDecisions: z.array(z.string()) });

export type BrandSkill = z.infer<typeof BrandSkillSchema>;
export type BrandPrompt = z.infer<typeof BrandPromptSchema>;
export type BrandMaterial = z.infer<typeof BrandMaterialSchema>;
export type AIReviewAnnotation = z.infer<typeof AIReviewAnnotationSchema>;
export type InternalLinkAssignment = z.infer<typeof InternalLinkAssignmentSchema>;
export type ExternalSourceSuggestion = z.infer<typeof ExternalSourceSuggestionSchema>;
export type GuardianFinding = z.infer<typeof GuardianFindingSchema>;
export type SectionReview = z.infer<typeof SectionReviewSchema>;
export type PublicationRecord = z.infer<typeof PublicationRecordSchema>;
