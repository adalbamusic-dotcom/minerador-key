import "server-only";
import type { ArticleDNA, ContentDocument, ContentPlan, SiloDNA, VersionEnvelope, VersionStatusEvent } from "../arquiteto/contracts";
import { VersionedArticleDNASchema, VersionedContentPlanSchema, VersionedSiloDNASchema, VersionStatusEventSchema, ContentDocumentSchema } from "../arquiteto/contracts";
import type { BrandInvitation, OperationalPublication, PlannerItem, RadarItem } from "../editorial/operational-flow";
import { BrandInvitationSchema, OperationalPublicationSchema, PlannerItemSchema, RadarItemSchema } from "../editorial/operational-flow";
import type { SavedGridView } from "../editorial/data-grid";
import { SavedGridViewSchema } from "../editorial/data-grid";
import { getOperationalClient, mapPersistenceError, OptimisticLockError } from "./editorial-db";
import { contentHash } from "../arquiteto/versioning";
import type { SerpCollectionRecord, SerpReviewRecord } from "../editorial/contracts";
import { SerpCollectionRecordSchema, SerpReviewRecordSchema } from "../editorial/contracts";
import { PersistenceUnavailableError } from "./editorial-db";
import type { RadarAnalysisVersion } from "../radar/analysis-contracts";

const client = () => getOperationalClient();
const unwrap = <T>(data: T | null, error: unknown) => { if (error) mapPersistenceError(error); return data; };

export class ArtifactRepository {
  async save<T>(marcaId: string, type: "article_dna" | "silo_dna" | "content_plan", version: VersionEnvelope<T>, actorId: string) {
    const row = { version_id: version.versionId, entity_id: version.entityId, marca_id: marcaId, artifact_type: type, version_number: version.versionNumber,
      previous_version_id: version.previousVersionId, content_hash: version.contentHash, origin: version.origin, change_reason: version.changeReason,
      payload: version, created_by: actorId, created_at: version.createdAt };
    const { error } = await client().from("editorial_artifact_versions").upsert(row, { onConflict: "version_id", ignoreDuplicates: true });
    if (error) mapPersistenceError(error);
  }

  async appendEvents(marcaId: string, events: VersionStatusEvent[], actorId: string) {
    if (!events.length) return;
    const rows = events.map(event => ({ id: event.eventId, version_id: event.versionId, status: event.status, reason: event.reason, actor_id: actorId, occurred_at: event.occurredAt }));
    const { error } = await client().from("editorial_version_status_events").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) mapPersistenceError(error);
    void marcaId;
  }

  async list(marcaId: string) {
    const { data, error } = await client().from("editorial_artifact_versions").select("artifact_type,payload").eq("marca_id", marcaId);
    unwrap(data, error);
    const articles: VersionEnvelope<ArticleDNA>[] = []; const silos: VersionEnvelope<SiloDNA>[] = []; const plans: VersionEnvelope<ContentPlan>[] = [];
    for (const row of data || []) {
      if (row.artifact_type === "article_dna") articles.push(VersionedArticleDNASchema.parse(row.payload));
      if (row.artifact_type === "silo_dna") silos.push(VersionedSiloDNASchema.parse(row.payload));
      if (row.artifact_type === "content_plan") plans.push(VersionedContentPlanSchema.parse(row.payload));
    }
    const versionIds = [...articles, ...silos, ...plans].map(version => version.versionId);
    if (!versionIds.length) return { articles, silos, plans, events: [] as VersionStatusEvent[] };
    const { data: eventRows, error: eventError } = await client().from("editorial_version_status_events").select("id,version_id,status,reason,actor_id,occurred_at").in("version_id", versionIds).order("occurred_at");
    unwrap(eventRows, eventError);
    const events = (eventRows || []).map(row => VersionStatusEventSchema.parse({ eventId: row.id, versionId: row.version_id, status: row.status, reason: row.reason, actorId: row.actor_id, occurredAt: row.occurred_at }));
    return { articles, silos, plans, events };
  }
}

type WorkflowStage = "radar" | "planner";
export class WorkflowRepository {
  async list(marcaId: string) {
    const { data, error } = await client().from("editorial_workflow_items").select("id,marca_id,article_id,stage,state,payload,lock_version,created_at,updated_at").eq("marca_id", marcaId).in("stage", ["radar", "planner"]);
    unwrap(data, error); const radar: RadarItem[] = []; const planner: PlannerItem[] = [];
    for (const row of data || []) {
      if (row.stage === "radar") radar.push(RadarItemSchema.parse({ ...(row.payload as object), id: row.id, brandId: row.marca_id, articleId: row.article_id, state: row.state, lockVersion: row.lock_version, importedAt: row.created_at, updatedAt: row.updated_at, origin: "real" }));
      if (row.stage === "planner") planner.push(PlannerItemSchema.parse({ ...(row.payload as object), id: row.id, brandId: row.marca_id, articleId: row.article_id, state: row.state, lockVersion: row.lock_version, importedAt: row.created_at, updatedAt: row.updated_at, origin: "real" }));
    }
    return { radar, planner };
  }

  async find(id: string) {
    const { data, error } = await client().from("editorial_workflow_items").select("*").eq("id", id).maybeSingle();
    return unwrap(data, error);
  }

  async findByArticle(marcaId: string, articleId: string, stage: WorkflowStage = "radar") {
    const { data, error } = await client().from("editorial_workflow_items").select("*").eq("marca_id", marcaId).eq("article_id", articleId).eq("stage", stage).maybeSingle();
    return unwrap(data, error);
  }

  async importItem(input: { marcaId: string; articleId: string; stage: WorkflowStage; state: string; sourceEntityId: string; sourceVersionId: string | null; sourceContentHash: string | null; payload: object; actorId: string }) {
    const { data, error } = await client().from("editorial_workflow_items").upsert({ marca_id: input.marcaId, article_id: input.articleId, stage: input.stage, state: input.state,
      source_entity_id: input.sourceEntityId, source_version_id: input.sourceVersionId, source_content_hash: input.sourceContentHash, payload: input.payload,
      created_by: input.actorId, updated_by: input.actorId }, { onConflict: "marca_id,article_id,stage", ignoreDuplicates: true }).select("*").maybeSingle();
    if (error) mapPersistenceError(error);
    if (data) return data;
    const { data: existing, error: existingError } = await client().from("editorial_workflow_items").select("*").eq("marca_id", input.marcaId).eq("article_id", input.articleId).eq("stage", input.stage).single();
    return unwrap(existing, existingError);
  }

  async transition(id: string, expectedLock: number, state: string, payload: object, actorId: string) {
    const { data, error } = await client().from("editorial_workflow_items").update({ state, payload, updated_by: actorId }).eq("id", id).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (error) mapPersistenceError(error); if (!data) throw new OptimisticLockError(); return data;
  }

  async appendRadarAnalysis(marcaId: string, articleId: string, expectedLock: number, analysis: RadarAnalysisVersion, actorId: string) {
    const current = await this.findByArticle(marcaId, articleId, "radar");
    if (!current) return null;
    if (current.marca_id !== marcaId || current.article_id !== articleId) return null;
    const radar = RadarItemSchema.parse({ ...(current.payload as object), id: current.id, brandId: current.marca_id, articleId: current.article_id, state: current.state, lockVersion: current.lock_version, importedAt: current.created_at, updatedAt: current.updated_at, origin: "real" });
    if (analysis.payload.brandId !== marcaId || analysis.payload.articleId !== articleId) throw new Error("A análise Radar não corresponde ao artigo ou à marca.");
    const alreadySaved = radar.analysisVersions.some(version => version.versionId === analysis.versionId);
    if (alreadySaved) return current;
    const payload = { ...(current.payload as object), analysisVersions: [...radar.analysisVersions, analysis] };
    const { data, error } = await client().from("editorial_workflow_items").update({ payload, updated_by: actorId }).eq("id", current.id).eq("marca_id", marcaId).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new OptimisticLockError();
    return data;
  }
}

export class SerpSnapshotRepository {
  async list(marcaId: string, articleId?: string) {
    try {
      let query = client().from("editorial_serp_snapshots").select("id,marca_id,article_id,version_number,payload,created_at").eq("marca_id", marcaId).order("version_number", { ascending: true });
      if (articleId) query = query.eq("article_id", articleId);
      const { data, error } = await query;
      unwrap(data, error);
      const records = (data || []).map(row => SerpCollectionRecordSchema.parse(row.payload));
      return { records, available: true };
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) return { records: [] as SerpCollectionRecord[], available: false };
      throw error;
    }
  }

  async save(marcaId: string, record: SerpCollectionRecord, actorId: string) {
    try {
      const { error } = await client().from("editorial_serp_snapshots").insert({ id: record.id, marca_id: marcaId, article_id: record.input.articleId, version_number: record.research?.version || 1,
        previous_snapshot_id: record.research?.previousSnapshotId || null, content_hash: record.research?.contentHash || "", status: record.status, payload: record, created_by: actorId, created_at: record.research?.collectedAt || new Date().toISOString() });
      if (error) mapPersistenceError(error);
      return true;
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) return false;
      throw error;
    }
  }

  async saveReview(marcaId: string, review: SerpReviewRecord) {
    try {
      const { error } = await client().from("editorial_serp_reviews").insert({ id: review.id, marca_id: marcaId, article_id: review.articleId, snapshot_id: review.snapshotId,
        status: review.status, notes: review.notes, reviewed_by: review.reviewedBy, reviewed_at: review.reviewedAt, payload: review });
      if (error) mapPersistenceError(error);
      return true;
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) return false;
      throw error;
    }
  }

  async listReviews(marcaId: string, articleId?: string) {
    try {
      let query = client().from("editorial_serp_reviews").select("payload").eq("marca_id", marcaId).order("reviewed_at", { ascending: true });
      if (articleId) query = query.eq("article_id", articleId);
      const { data, error } = await query;
      unwrap(data, error);
      return { reviews: (data || []).map(row => SerpReviewRecordSchema.parse(row.payload)), available: true };
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) return { reviews: [] as SerpReviewRecord[], available: false };
      throw error;
    }
  }
}

export class DecisionEventRepository {
  async append(input: { marcaId: string; workflowItemId?: string | null; articleId: string; eventType: string; fromState?: string | null; toState?: string | null; sourceVersionId?: string | null; payload?: object; actorId: string }) {
    const { error } = await client().from("editorial_decision_events").insert({ marca_id: input.marcaId, workflow_item_id: input.workflowItemId || null, article_id: input.articleId,
      event_type: input.eventType, from_state: input.fromState || null, to_state: input.toState || null, source_version_id: input.sourceVersionId || null, payload: input.payload || {}, actor_id: input.actorId });
    if (error) mapPersistenceError(error);
  }
}

export class ContentDocumentRepository {
  async list(marcaId: string, userId: string) {
    const { data, error } = await client().from("content_documents").select("id,payload,content_hash,lock_version,updated_at").eq("marca_id", marcaId).order("updated_at", { ascending: false });
    unwrap(data, error); const ids = (data || []).map(row => row.id);
    const states = ids.length ? await client().from("content_document_user_states").select("*").eq("user_key", userId).in("document_id", ids) : { data: [], error: null };
    unwrap(states.data, states.error); const stateMap = new Map((states.data || []).map(row => [row.document_id, row]));
    return (data || []).map(row => { const state = stateMap.get(row.id); return { document: ContentDocumentSchema.parse(row.payload), contentHash: row.content_hash, lockVersion: row.lock_version, updatedAt: row.updated_at,
      userState: state ? { cursorPosition: state.cursor_position, scrollTop: state.scroll_top, leftPanelOpen: state.left_panel_open, rightPanelOpen: state.right_panel_open, lastOpenedAt: state.last_opened_at } : null }; });
  }

  async create(marcaId: string, document: ContentDocument, articleId: string, planVersionId: string, articleVersionId: string, slug: string, hash: string, actorId: string) {
    const { data, error } = await client().from("content_documents").upsert({ id: document.id, marca_id: marcaId, article_id: articleId, content_plan_version_id: planVersionId,
      article_dna_version_id: articleVersionId, status: "writing", title: document.title, slug, payload: document, content_hash: hash, created_by: actorId, updated_by: actorId },
      { onConflict: "marca_id,article_id", ignoreDuplicates: true }).select("*").maybeSingle();
    if (error) mapPersistenceError(error); if (data) return data;
    const { data: existing, error: existingError } = await client().from("content_documents").select("*").eq("marca_id", marcaId).eq("article_id", articleId).single();
    return unwrap(existing, existingError);
  }

  async save(documentId: string, expectedLock: number, document: ContentDocument, hash: string, actorId: string) {
    const status = document.status === "planejado" ? "planned" : document.status === "escrevendo" ? "writing" : document.status === "em_revisao" ? "in_review" : "approved";
    const { data, error } = await client().from("content_documents").update({ payload: document, content_hash: hash, status, updated_by: actorId }).eq("id", documentId).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (error) mapPersistenceError(error); if (!data) throw new OptimisticLockError(); return data;
  }

  async createVersion(documentId: string, document: ContentDocument, hash: string, reason: string, actorId: string) {
    const { data: latest, error: latestError } = await client().from("content_document_versions").select("version_id,version_number").eq("document_id", documentId).order("version_number", { ascending: false }).limit(1).maybeSingle();
    if (latestError) mapPersistenceError(latestError); const versionNumber = (latest?.version_number || 0) + 1; const versionId = crypto.randomUUID();
    const { error } = await client().from("content_document_versions").insert({ version_id: versionId, document_id: documentId, version_number: versionNumber,
      previous_version_id: latest?.version_id || null, content_hash: hash, change_reason: reason, payload: document, created_by: actorId });
    if (error) mapPersistenceError(error); return { versionId, versionNumber };
  }

  async saveUserState(documentId: string, userId: string, state: { cursorPosition: number | null; scrollTop: number; leftPanelOpen: boolean; rightPanelOpen: boolean }) {
    const { error } = await client().from("content_document_user_states").upsert({ document_id: documentId, user_key: userId, cursor_position: state.cursorPosition, scroll_top: state.scrollTop,
      left_panel_open: state.leftPanelOpen, right_panel_open: state.rightPanelOpen, last_opened_at: new Date().toISOString() }, { onConflict: "document_id,user_key" });
    if (error) mapPersistenceError(error);
  }
}

export class PublicationProtectionError extends Error {
  constructor(message: string) { super(message); this.name = "PublicationProtectionError"; }
}

export class PublicationRepository {
  async list(marcaId: string) {
    const { data, error } = await client().from("publication_records").select("payload,status,lock_version,updated_at").eq("marca_id", marcaId);
    unwrap(data, error); return (data || []).map(row => OperationalPublicationSchema.parse({ ...(row.payload as object), state: row.status, lockVersion: row.lock_version, updatedAt: row.updated_at }));
  }
  async create(marcaId: string, publication: OperationalPublication, actorId: string) {
    const { data, error } = await client().from("publication_records").upsert({ marca_id: marcaId, article_id: publication.articleId, content_plan_version_id: publication.contentPlanVersionId,
      document_id: publication.documentId, status: publication.state, payload: publication, created_by: actorId, updated_by: actorId }, { onConflict: "marca_id,article_id", ignoreDuplicates: true }).select("*").maybeSingle();
    if (error) mapPersistenceError(error); return data;
  }
  async find(marcaId: string, publicationId: string) {
    const { data, error } = await client().from("publication_records").select("id,payload,status,lock_version,updated_at").eq("marca_id", marcaId);
    unwrap(data, error);
    const row = (data || []).find(candidate => (candidate.payload as { id?: string })?.id === publicationId);
    if (!row) return null;
    return {
      rowId: row.id as string,
      publication: OperationalPublicationSchema.parse({ ...(row.payload as object), state: row.status, lockVersion: row.lock_version, updatedAt: row.updated_at }),
    };
  }
  async updateOperational(marcaId: string, publicationId: string, expectedLock: number, publication: OperationalPublication, actorId: string) {
    const current = await this.find(marcaId, publicationId);
    if (!current) return null;
    if (current.publication.brandId !== publication.brandId || current.publication.articleId !== publication.articleId || current.publication.slug !== publication.slug ||
      current.publication.documentId !== publication.documentId || current.publication.contentPlanVersionId !== publication.contentPlanVersionId || current.publication.unitType !== publication.unitType ||
      (current.publication.state === "published" && current.publication.destinationUrl !== publication.destinationUrl)) {
      throw new PublicationProtectionError("Campos estruturais de uma publicação não podem ser alterados.");
    }
    const payload = OperationalPublicationSchema.parse(publication);
    const { data, error } = await client().from("publication_records").update({ status: payload.state, payload, updated_by: actorId })
      .eq("id", current.rowId).eq("marca_id", marcaId).eq("lock_version", expectedLock).select("id,status,payload,lock_version,updated_at").maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new OptimisticLockError("A publicação foi alterada por outra sessão.");
    return OperationalPublicationSchema.parse({ ...(data.payload as object), state: data.status, lockVersion: data.lock_version, updatedAt: data.updated_at });
  }
  async syncDocumentStatus(documentId: string, documentStatus: ContentDocument["status"], actorId: string) {
    const { data: current, error: currentError } = await client().from("publication_records").select("id,payload,lock_version").eq("document_id", documentId).maybeSingle();
    if (currentError) mapPersistenceError(currentError); if (!current) return;
    const currentPublication = OperationalPublicationSchema.parse(current.payload);
    const target = currentPublication.state === "published" ? "published" : documentStatus === "em_revisao" ? "awaiting_review" : documentStatus === "aprovado" ? "approved" : documentStatus === "escrevendo" ? "writing" : "draft";
    const payload = OperationalPublicationSchema.parse({ ...(current.payload as object), state: target });
    const { data, error } = await client().from("publication_records").update({ status: target, payload, updated_by: actorId }).eq("id", current.id).eq("lock_version", current.lock_version).select("id").maybeSingle();
    if (error) mapPersistenceError(error); if (!data) throw new OptimisticLockError("A publicação vinculada foi alterada por outra sessão.");
  }

  async importApproved(articleId: string, marcaId: string, expectedLock: number, actorId: string) {
    const { data: current, error: currentError } = await client().from("publication_records").select("id,marca_id,status,payload,lock_version").eq("article_id", articleId).eq("marca_id", marcaId).maybeSingle();
    if (currentError) mapPersistenceError(currentError);
    if (!current || current.status !== "approved") return null;
    const payload = OperationalPublicationSchema.parse({ ...(current.payload as object), state: "ready_to_export", lockVersion: current.lock_version + 1, updatedAt: new Date().toISOString() });
    const { data, error } = await client().from("publication_records").update({ status: "ready_to_export", payload, updated_by: actorId }).eq("id", current.id).eq("lock_version", expectedLock).select("id").maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new OptimisticLockError("O item aprovado foi alterado por outra sessão.");
    return { id: data.id, articleId: payload.articleId };
  }
}

export class ViewPreferenceRepository {
  async list(marcaId: string, userId: string) {
    const { data, error } = await client().from("editorial_saved_views").select("id,name,module,settings,is_default,updated_at").eq("marca_id", marcaId).eq("user_key", userId);
    unwrap(data, error); return (data || []).map(row => SavedGridViewSchema.parse({ ...(row.settings as object), id: row.id, name: row.name, module: row.module, brandId: marcaId, userId, isDefault: row.is_default, updatedAt: row.updated_at }));
  }
  async save(view: SavedGridView, userId: string) {
    if (view.isDefault) await client().from("editorial_saved_views").update({ is_default: false }).eq("marca_id", view.brandId).eq("user_key", userId).eq("module", view.module);
    const { data, error } = await client().from("editorial_saved_views").upsert({ id: view.id, marca_id: view.brandId, user_key: userId, module: view.module, name: view.name, settings: view, is_default: view.isDefault }, { onConflict: "id" }).select("*").single();
    return unwrap(data, error);
  }
  async delete(id: string, marcaId: string, userId: string) {
    const { error } = await client().from("editorial_saved_views").delete().eq("id", id).eq("marca_id", marcaId).eq("user_key", userId);
    if (error) mapPersistenceError(error);
  }
}

export class InvitationRepository {
  async create(input: Omit<BrandInvitation, "id" | "createdAt" | "delivery" | "tokenId" | "status">, actorId: string) {
    const roleResult = await client().from("brand_roles").select("id").eq("slug", input.role).or(`marca_id.eq.${input.brandId},marca_id.is.null`).limit(1).maybeSingle();
    let role = roleResult.data;
    if (roleResult.error) mapPersistenceError(roleResult.error);
    if (!role) {
      const created = await client().from("brand_roles").insert({ marca_id: input.brandId, slug: input.role, name: input.role, description: "Preset criado pelo fluxo de convite." }).select("id").single();
      role = unwrap(created.data, created.error);
    }
    const token = crypto.randomUUID(); const tokenHash = await contentHash(token);
    const inserted = await client().from("brand_invitations").insert({ marca_id: input.brandId, email: input.email.toLowerCase(), role_id: role!.id, token_hash: tokenHash,
      status: "pending", expires_at: input.expiresAt, created_by: actorId }).select("id,created_at").single();
    const row = unwrap(inserted.data, inserted.error)!;
    const permissions = input.permissions.flatMap(permission => permission.actions.map(action => ({ invitation_id: row.id, module: permission.module, action })));
    if (permissions.length) { const { error } = await client().from("brand_invitation_permissions").insert(permissions); if (error) mapPersistenceError(error); }
    return BrandInvitationSchema.parse({ ...input, id: row.id, status: "pending", createdAt: row.created_at, createdBy: actorId, delivery: "not_sent", tokenId: `persisted:${row.id}` });
  }

  async updateStatus(id: string, status: "cancelled" | "expired") {
    const { data, error } = await client().from("brand_invitations").update({ status, ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}) }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
    if (error) mapPersistenceError(error); return data;
  }

  async list(marcaId: string) {
    const { data, error } = await client().from("brand_invitations").select("id,marca_id,email,status,expires_at,created_at,created_by,role_id,brand_roles(slug),brand_invitation_permissions(module,action)").eq("marca_id", marcaId);
    unwrap(data, error); return (data || []).map(row => { const roleRelation = row.brand_roles as unknown as { slug?: string } | null; const permissionsRows = row.brand_invitation_permissions as unknown as Array<{ module: string; action: string }>;
      const grouped = new Map<string, string[]>(); for (const permission of permissionsRows || []) grouped.set(permission.module, [...(grouped.get(permission.module) || []), permission.action]);
      return BrandInvitationSchema.parse({ id: row.id, brandId: row.marca_id, email: row.email, role: roleRelation?.slug || "viewer", permissions: [...grouped].map(([module, actions]) => ({ module, actions })), status: row.status,
        expiresAt: row.expires_at, createdAt: row.created_at, createdBy: row.created_by, delivery: "not_sent", tokenId: `persisted:${row.id}` }); });
  }
}

export class MembershipRepository {}
export class PermissionRepository {}
export class DelegatedAccessRepository {}
