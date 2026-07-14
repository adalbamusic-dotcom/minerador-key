import { z } from "zod";
import type { ArticleDNA, ContentDocument, ContentPlan, SiloDNA, VersionEnvelope, VersionStatusEvent } from "../arquiteto/contracts.ts";
import { ContentDocumentSchema, ContentPlanSchema, VersionedContentPlanSchema } from "../arquiteto/contracts.ts";
import { createVersionEnvelope, legacyVersionReference, toVersionReference } from "../arquiteto/versioning.ts";
import { isArticleKeywordCountValid } from "../arquiteto/domain-rules.ts";

export const WorkflowOriginSchema = z.enum(["real", "local"]);
export const ArchitectWorkflowStateSchema = z.enum(["draft", "analyzing", "conflicts", "awaiting_approval", "approved", "blocked", "sent_radar"]);
export const RadarWorkflowStateSchema = z.enum(["imported", "research_pending", "researching", "needs_review", "conflicts", "awaiting_approval", "approved", "sent_planner"]);
export const PlannerWorkflowStateSchema = z.enum(["draft", "planning", "pending", "awaiting_review", "approved", "sent_writer"]);
export const PublicationWorkflowStateSchema = z.enum(["draft", "writing", "awaiting_review", "in_review", "approved", "ready_to_export", "queued", "exported", "published", "update_due", "blocked", "archived"]);

export const RadarItemSchema = z.object({
  id: z.string(), brandId: z.string(), articleId: z.string(), articleDnaVersionId: z.string(), articleDnaContentHash: z.string(),
  title: z.string(), slug: z.string(), siloId: z.string(), hierarchy: z.string(), principalKeywordId: z.string(), format: z.string(),
  intent: z.string(), state: RadarWorkflowStateSchema, importedAt: z.string().datetime(), updatedAt: z.string().datetime(), origin: WorkflowOriginSchema, lockVersion: z.number().int().positive().default(1),
});
export const PlannerItemSchema = z.object({
  id: z.string(), brandId: z.string(), articleId: z.string(), radarItemId: z.string(), title: z.string(), slug: z.string(), siloId: z.string(),
  format: z.string(), intent: z.string(), state: PlannerWorkflowStateSchema, contentPlanVersionId: z.string().nullable(), importedAt: z.string().datetime(), updatedAt: z.string().datetime(), origin: WorkflowOriginSchema, lockVersion: z.number().int().positive().default(1),
});
export const OperationalPublicationSchema = z.object({
  id: z.string(), brandId: z.string(), articleId: z.string(), plannerItemId: z.string(), contentPlanVersionId: z.string(), documentId: z.string(),
  title: z.string(), slug: z.string(), siloId: z.string(), hierarchy: z.string(), state: PublicationWorkflowStateSchema,
  responsible: z.string().nullable(), destination: z.string().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), origin: WorkflowOriginSchema,
  lockVersion: z.number().int().positive().default(1),
});
export type RadarItem = z.infer<typeof RadarItemSchema>;
export type PlannerItem = z.infer<typeof PlannerItemSchema>;
export type OperationalPublication = z.infer<typeof OperationalPublicationSchema>;

export const PermissionModuleSchema = z.enum(["marca", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes", "administracao"]);
export const PermissionActionSchema = z.enum(["view", "comment", "create", "edit", "review", "approve", "export", "publish", "manage"]);
export const CollaboratorRoleSchema = z.enum(["owner", "brand_admin", "strategist", "analyst", "planner", "writer", "editor", "reviewer", "eeat_specialist", "medical_reviewer", "publisher", "viewer", "external_collaborator"]);
export const ModulePermissionSchema = z.object({ module: PermissionModuleSchema, actions: z.array(PermissionActionSchema) });
export const BrandInvitationSchema = z.object({
  id: z.string(), brandId: z.string(), email: z.string().email(), role: CollaboratorRoleSchema, permissions: z.array(ModulePermissionSchema),
  status: z.enum(["pending", "accepted", "expired", "cancelled", "suspended", "revoked"]), expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(), createdBy: z.string(), delivery: z.enum(["development_adapter", "provider_sent", "not_sent"]), tokenId: z.string(),
});
export type BrandInvitation = z.infer<typeof BrandInvitationSchema>;

export function effectiveVersionStatus(versionId: string, events: VersionStatusEvent[]) {
  return events.filter(event => event.versionId === versionId).at(-1)?.status || null;
}

export function mergeVersionEvents(current: VersionStatusEvent[], incoming: VersionStatusEvent[]) {
  const indexed = new Map<string, { event: VersionStatusEvent; order: number }>();
  [...current, ...incoming].forEach((event, order) => indexed.set(event.eventId, { event, order }));
  return [...indexed.values()].sort((left, right) => {
    const byDate = left.event.occurredAt.localeCompare(right.event.occurredAt);
    return byDate || left.order - right.order;
  }).map(item => item.event);
}

export function hasHumanApproval(versionId: string, events: VersionStatusEvent[]) {
  return effectiveVersionStatus(versionId, events) === "approved";
}

export function articleApprovalIssues(version: VersionEnvelope<ArticleDNA>, events: VersionStatusEvent[], blockingConflicts = 0) {
  const article = version.payload; const issues: string[] = [];
  const principal = article.keywordReferences.filter(reference => reference.role === "principal");
  if (principal.length !== 1) issues.push("O artigo precisa de exatamente uma keyword principal.");
  if (!isArticleKeywordCountValid(article.keywordReferences.length)) issues.push("O artigo precisa ter entre 2 e 6 keywords.");
  if (!article.siloId) issues.push("O artigo precisa de silo definido.");
  if (!article.hierarchy) issues.push("O artigo precisa de função definida.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.suggestedSlug)) issues.push("O slug precisa ser válido.");
  if (blockingConflicts > 0) issues.push("Existem conflitos bloqueadores.");
  if (!hasHumanApproval(version.versionId, events)) issues.push("A versão ainda não recebeu aprovação humana.");
  return issues;
}

export function approvedArticleVersions(versions: Record<string, VersionEnvelope<ArticleDNA>>, events: VersionStatusEvent[]) {
  return Object.values(versions).filter(version => articleApprovalIssues(version, events).length === 0);
}

export function importArticlesToRadar(existing: RadarItem[], versions: VersionEnvelope<ArticleDNA>[], brandId: string, now = new Date().toISOString()) {
  const existingIds = new Set(existing.map(item => item.articleId));
  const additions = versions.filter(version => version.payload.brandId === brandId && !existingIds.has(version.payload.articleId)).map(version => RadarItemSchema.parse({
    id: `radar:${version.payload.articleId}`, brandId, articleId: version.payload.articleId, articleDnaVersionId: version.versionId,
    articleDnaContentHash: version.contentHash, title: version.payload.promise, slug: version.payload.suggestedSlug, siloId: version.payload.siloId,
    hierarchy: version.payload.hierarchy, principalKeywordId: version.payload.principalKeywordId, format: version.payload.hierarchy,
    intent: version.payload.mainIntent, state: "research_pending", importedAt: now, updatedAt: now, origin: "local", lockVersion: 1,
  }));
  return [...existing, ...additions];
}

export function setRadarState(items: RadarItem[], ids: string[], target: RadarItem["state"], now = new Date().toISOString()) {
  const allowed: Record<RadarItem["state"], RadarItem["state"][]> = {
    imported: ["research_pending"], research_pending: ["researching", "awaiting_approval"], researching: ["needs_review", "conflicts"],
    needs_review: ["awaiting_approval", "conflicts"], conflicts: ["needs_review"], awaiting_approval: ["approved", "needs_review"],
    approved: ["sent_planner", "needs_review"], sent_planner: ["approved"],
  };
  return items.map(item => ids.includes(item.id) && allowed[item.state].includes(target) ? { ...item, state: target, updatedAt: now, lockVersion: item.lockVersion + 1 } : item);
}

export function importRadarToPlanner(existing: PlannerItem[], radarItems: RadarItem[], brandId: string, now = new Date().toISOString()) {
  const existingIds = new Set(existing.map(item => item.articleId));
  const additions = radarItems.filter(item => item.brandId === brandId && item.state === "approved" && !existingIds.has(item.articleId)).map(item => PlannerItemSchema.parse({
    id: `planner:${item.articleId}`, brandId, articleId: item.articleId, radarItemId: item.id, title: item.title, slug: item.slug,
    siloId: item.siloId, format: item.format, intent: item.intent, state: "draft", contentPlanVersionId: null,
    importedAt: now, updatedAt: now, origin: "local", lockVersion: 1,
  }));
  return [...existing, ...additions];
}

export async function createOperationalPlan(item: PlannerItem, article: VersionEnvelope<ArticleDNA>, silo: VersionEnvelope<SiloDNA> | undefined, actorId: string) {
  const keywordRefs = article.payload.keywordReferences.map(reference => ({ entityId: reference.keywordId, versionId: reference.keywordDnaVersionId, contentHash: reference.keywordDnaContentHash }));
  const payload = ContentPlanSchema.parse({
    schemaVersion: 1, planId: `plan:${item.articleId}`, brandDnaRef: legacyVersionReference(`brand:${item.brandId}`, { brandId: item.brandId }),
    keywordDnaRefs: keywordRefs, articleDnaRef: toVersionReference(article), siloDnaRef: silo ? toVersionReference(silo) : legacyVersionReference(`silo:${item.siloId}`, { siloId: item.siloId }),
    serpEvidenceRefs: [], productEvidenceRefs: [], originalityReportRef: null,
    approvedOutline: article.payload.requiredTopics.length ? article.payload.requiredTopics.map((topic, index) => ({ id: `section:${index + 1}`, heading: topic, objective: `Cobrir ${topic} dentro da fronteira aprovada.`, keywordDnaRefs: keywordRefs })) : [{ id: "section:1", heading: article.payload.promise, objective: article.payload.desiredResult, keywordDnaRefs: keywordRefs }],
    writingInstructions: [article.payload.angle, article.payload.antiCannibalizationBoundary], humanPendingDecisions: ["Revisar outline, links, fontes e evidências antes da redação."],
  });
  return createVersionEnvelope({ entityId: payload.planId, versionNumber: 1, origin: "human", changeReason: "Planejamento operacional criado para revisão humana.", createdBy: actorId, payload }) as Promise<Readonly<VersionEnvelope<ContentPlan>>>;
}

export function createOperationalDocument(plan: VersionEnvelope<ContentPlan>, article: VersionEnvelope<ArticleDNA>, item: PlannerItem) {
  const provenance = { keywordDnaRefs: plan.payload.keywordDnaRefs, evidenceRefs: [...plan.payload.serpEvidenceRefs, ...plan.payload.productEvidenceRefs], sourceIds: [] as string[] };
  return ContentDocumentSchema.parse({
    schemaVersion: 1, id: `document:${item.articleId}`, title: item.title, status: "planejado", contentPlanRef: toVersionReference(plan),
    brandDnaRef: plan.payload.brandDnaRef, keywordDnaRefs: plan.payload.keywordDnaRefs, siloDnaRef: plan.payload.siloDnaRef,
    articleDnaRef: toVersionReference(article), serpSnapshotRefs: plan.payload.serpEvidenceRefs, evidenceRefs: plan.payload.productEvidenceRefs,
    sourceIds: [], linkMap: [], instructions: plan.payload.writingInstructions,
    blocks: [{ id: `heading:${item.articleId}`, type: "heading", level: 1, text: item.title, provenance }, ...plan.payload.approvedOutline.map(section => ({ id: section.id, type: "heading" as const, level: 2 as const, text: section.heading, provenance }))],
    editorContent: null, metadata: { slug: article.payload.suggestedSlug, principalKeyword: article.payload.principalKeywordId, metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "",
      canonical: article.payload.canonical, indexationStatus: "noindex", plannedImages: [] },
  });
}

export function createPublicationDraft(item: PlannerItem, plan: VersionEnvelope<ContentPlan>, document: ContentDocument, article: VersionEnvelope<ArticleDNA>, now = new Date().toISOString()) {
  return OperationalPublicationSchema.parse({ id: `publication:${item.articleId}`, brandId: item.brandId, articleId: item.articleId,
    plannerItemId: item.id, contentPlanVersionId: plan.versionId, documentId: document.id, title: item.title, slug: item.slug,
    siloId: item.siloId, hierarchy: article.payload.hierarchy, state: "draft", responsible: null, destination: null,
    createdAt: now, updatedAt: now, origin: "local", lockVersion: 1 });
}

export function importApprovedWriterItems(items: OperationalPublication[], ids: string[], now = new Date().toISOString()) {
  return items.map(item => ids.includes(item.id) && item.state === "approved"
    ? { ...item, state: "ready_to_export" as const, updatedAt: now, lockVersion: item.lockVersion + 1 }
    : item);
}

export function validateInvitationAccess(invitation: BrandInvitation, module: z.infer<typeof PermissionModuleSchema>, action: z.infer<typeof PermissionActionSchema>, now = new Date()) {
  if (["cancelled", "suspended", "revoked", "expired"].includes(invitation.status)) return false;
  if (new Date(invitation.expiresAt) <= now) return false;
  return invitation.permissions.some(permission => permission.module === module && permission.actions.includes(action));
}

export function createDevelopmentInvitation(input: Omit<BrandInvitation, "id" | "createdAt" | "delivery" | "tokenId" | "status">, now = new Date()) {
  return BrandInvitationSchema.parse({ ...input, id: crypto.randomUUID(), createdAt: now.toISOString(), status: "pending", delivery: "development_adapter", tokenId: crypto.randomUUID() });
}

export function parseOperationalPlan(value: unknown) { return VersionedContentPlanSchema.parse(value); }
