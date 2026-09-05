import "server-only";

import type { PipelineContext, PipelineMutationResult, PipelineReadResult } from "./pipeline-runtime";
import { PipelineRuntimeError, persisted, pipelineErrorFromSupabase, readMany, readOne } from "./pipeline-runtime";
import { canonicalUuidOrGenerate, canonicalUuidOrNull, normalizePersistenceTimestamp } from "./serp-persistence-adapter";

export type PipelineJsonObject = Record<string, unknown>;
export type ArtifactType = "article_dna" | "silo_dna" | "silo_page" | "content_plan" | "article_architecture_ai_review";

type PipelineRepositoryContext = Pick<PipelineContext, "actorUserId" | "brandId" | "supabase">;
type PipelineRow = Record<string, unknown>;

function mutationData<T>(data: T | null | undefined, error: unknown): T {
  if (error) throw pipelineErrorFromSupabase(error);
  if (data == null) throw new PipelineRuntimeError("QUERY_FAILURE", "A persistência não foi confirmada pelo banco.", 503);
  return data;
}

function requireLock(expectedLock: number) {
  if (!Number.isInteger(expectedLock) || expectedLock < 1) {
    throw new PipelineRuntimeError("INVALID_CONTEXT", "lock_version esperado é obrigatório e deve ser positivo.", 400);
  }
}

function requireDocumentId(documentId: string) {
  if (!documentId.trim()) throw new PipelineRuntimeError("INVALID_CONTEXT", "document_id é obrigatório.", 400);
}

abstract class ContextBoundRepository {
  protected readonly context: PipelineRepositoryContext;

  constructor(context: PipelineRepositoryContext) {
    this.context = context;
  }

  protected get client() {
    return this.context.supabase;
  }

  protected get brandId() {
    return this.context.brandId;
  }

  protected get actorUserId() {
    return this.context.actorUserId;
  }
}

export type ArtifactVersionAppendInput = {
  versionId?: string;
  entityId: string;
  artifactType: ArtifactType;
  previousVersionId?: string | null;
  sourceVersionId?: string | null;
  status: string;
  contentHash: string;
  payload: PipelineJsonObject;
  origin: string;
  changeReason: string;
  createdAt?: string;
};

export class ArtifactVersionRepository extends ContextBoundRepository {
  async list(entityId?: string, artifactType?: ArtifactType): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    let query = this.client.from("editorial_artifact_versions").select("*").eq("marca_id", this.brandId);
    if (entityId) query = query.eq("entity_id", entityId);
    if (artifactType) query = query.eq("artifact_type", artifactType);
    const result = await query.order("version_number", { ascending: true });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async append(input: ArtifactVersionAppendInput): Promise<PipelineMutationResult<PipelineRow>> {
    const latestResult = await this.client
      .from("editorial_artifact_versions")
      .select("*")
      .eq("marca_id", this.brandId)
      .eq("entity_id", input.entityId)
      .eq("artifact_type", input.artifactType)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latest = readOne(latestResult.data as PipelineRow | null, latestResult.error);
    const latestRow = latest.status === "READY" ? latest.data : null;
    if (latestRow?.content_hash === input.contentHash) return { status: "UNCHANGED", data: latestRow };

    if (
      latestRow &&
      input.previousVersionId &&
      input.previousVersionId !== latestRow.version_id
    ) {
      throw new PipelineRuntimeError("CONFLICT", "A versão anterior informada não corresponde à versão canônica vigente.", 409);
    }

    const row = {
      version_id: input.versionId ?? crypto.randomUUID(),
      entity_id: input.entityId,
      marca_id: this.brandId,
      artifact_type: input.artifactType,
      version_number: Number(latestRow?.version_number ?? 0) + 1,
      previous_version_id: latestRow?.version_id ?? null,
      source_version_id: input.sourceVersionId ?? null,
      status: input.status,
      content_hash: input.contentHash,
      payload: input.payload,
      origin: input.origin,
      change_reason: input.changeReason,
      created_by: this.actorUserId,
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    const result = await this.client.from("editorial_artifact_versions").insert(row).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }
}

export type WorkflowStage = "minerador" | "architect" | "radar" | "planner" | "writer" | "publications";

export type WorkflowCreateInput = {
  subjectType: string;
  subjectId: string;
  articleId?: string | null;
  stage: WorkflowStage;
  state: string;
  sourceEntityId: string;
  sourceVersionId?: string | null;
  sourceContentHash?: string | null;
  payload?: PipelineJsonObject;
};

export type WorkflowUpdateInput = {
  state?: string;
  sourceVersionId?: string | null;
  sourceContentHash?: string | null;
  payload?: PipelineJsonObject;
};

export class WorkflowRepository extends ContextBoundRepository {
  async list(): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    const result = await this.client.from("editorial_workflow_items").select("*").eq("marca_id", this.brandId).order("updated_at", { ascending: false });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async find(id: string): Promise<PipelineReadResult<PipelineRow>> {
    const result = await this.client.from("editorial_workflow_items").select("*").eq("id", id).eq("marca_id", this.brandId).maybeSingle();
    return readOne(result.data as PipelineRow | null, result.error);
  }

  async create(input: WorkflowCreateInput): Promise<PipelineMutationResult<PipelineRow>> {
    const result = await this.client.from("editorial_workflow_items").insert({
      marca_id: this.brandId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      article_id: input.articleId ?? null,
      stage: input.stage,
      state: input.state,
      source_entity_id: input.sourceEntityId,
      source_version_id: input.sourceVersionId ?? null,
      source_content_hash: input.sourceContentHash ?? null,
      payload: input.payload ?? {},
      created_by: this.actorUserId,
      updated_by: this.actorUserId,
    }).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }

  async update(id: string, expectedLock: number, input: WorkflowUpdateInput): Promise<PipelineMutationResult<PipelineRow>> {
    requireLock(expectedLock);
    const changes = {
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.sourceVersionId !== undefined ? { source_version_id: input.sourceVersionId } : {}),
      ...(input.sourceContentHash !== undefined ? { source_content_hash: input.sourceContentHash } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      updated_by: this.actorUserId,
    };
    const result = await this.client.from("editorial_workflow_items").update(changes).eq("id", id).eq("marca_id", this.brandId).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    if (!result.data) throw new PipelineRuntimeError("CONFLICT", "O item de workflow foi alterado ou não pertence à Brand.", 409);
    return { status: "PERSISTED", data: result.data as PipelineRow };
  }
}

export type SerpSnapshotAppendInput = {
  id?: string;
  articleId: string;
  sourceVersionId?: string | null;
  snapshotVersion: number;
  previousSnapshotId?: string | null;
  contentHash: string;
  status: string;
  payload: PipelineJsonObject;
  createdAt?: string;
};

export class SerpSnapshotRepository extends ContextBoundRepository {
  async list(articleId?: string): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    let query = this.client.from("editorial_serp_snapshots").select("*").eq("marca_id", this.brandId);
    if (articleId) query = query.eq("article_id", articleId);
    const result = await query.order("snapshot_version", { ascending: true });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async append(input: SerpSnapshotAppendInput): Promise<PipelineMutationResult<PipelineRow>> {
    const result = await this.client.from("editorial_serp_snapshots").insert({
      id: canonicalUuidOrGenerate(input.id),
      marca_id: this.brandId,
      article_id: input.articleId,
      source_version_id: input.sourceVersionId ?? null,
      snapshot_version: input.snapshotVersion,
      previous_snapshot_id: canonicalUuidOrNull(input.previousSnapshotId),
      content_hash: input.contentHash,
      status: input.status,
      payload: input.payload,
      created_by: this.actorUserId,
      ...(input.createdAt ? { created_at: normalizePersistenceTimestamp(input.createdAt) } : {}),
    }).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }
}

export type SerpReviewAppendInput = {
  id?: string;
  articleId: string;
  snapshotId: string;
  sourceVersionId?: string | null;
  status: string;
  payload: PipelineJsonObject;
  reviewedAt?: string;
};

export class SerpReviewRepository extends ContextBoundRepository {
  async list(articleId?: string): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    let query = this.client.from("editorial_serp_reviews").select("*").eq("marca_id", this.brandId);
    if (articleId) query = query.eq("article_id", articleId);
    const result = await query.order("created_at", { ascending: true });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async append(input: SerpReviewAppendInput): Promise<PipelineMutationResult<PipelineRow>> {
    const snapshotId = canonicalUuidOrNull(input.snapshotId);
    if (!snapshotId) throw new PipelineRuntimeError("INVALID_CONTEXT", "snapshot_id precisa ser o UUID canônico do snapshot remoto.", 400);
    const result = await this.client.from("editorial_serp_reviews").insert({
      id: canonicalUuidOrGenerate(input.id),
      marca_id: this.brandId,
      article_id: input.articleId,
      snapshot_id: snapshotId,
      source_version_id: input.sourceVersionId ?? null,
      status: input.status,
      reviewed_by: this.actorUserId,
      payload: input.payload,
      ...(input.reviewedAt ? { created_at: normalizePersistenceTimestamp(input.reviewedAt) } : {}),
    }).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }
}

export type ContentDocumentCreateInput = {
  id: string;
  articleId: string;
  articleDnaVersionId?: string | null;
  contentPlanVersionId?: string | null;
  currentVersionId?: string | null;
  status: string;
  title: string;
  slug: string;
  contentHash: string;
  payload: PipelineJsonObject;
};

export type ContentDocumentUpdateInput = {
  articleDnaVersionId?: string | null;
  contentPlanVersionId?: string | null;
  currentVersionId?: string | null;
  status?: string;
  title?: string;
  slug?: string;
  contentHash?: string;
  payload?: PipelineJsonObject;
};

export class ContentDocumentRepository extends ContextBoundRepository {
  async list(): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    const result = await this.client.from("content_documents").select("*").eq("marca_id", this.brandId).order("updated_at", { ascending: false });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async find(id: string): Promise<PipelineReadResult<PipelineRow>> {
    const result = await this.client.from("content_documents").select("*").eq("id", id).eq("marca_id", this.brandId).maybeSingle();
    return readOne(result.data as PipelineRow | null, result.error);
  }

  async create(input: ContentDocumentCreateInput): Promise<PipelineMutationResult<PipelineRow>> {
    const result = await this.client.from("content_documents").insert({
      id: input.id,
      marca_id: this.brandId,
      article_id: input.articleId,
      article_dna_version_id: input.articleDnaVersionId ?? null,
      content_plan_version_id: input.contentPlanVersionId ?? null,
      current_version_id: input.currentVersionId ?? null,
      status: input.status,
      title: input.title,
      slug: input.slug,
      content_hash: input.contentHash,
      payload: input.payload,
      created_by: this.actorUserId,
      updated_by: this.actorUserId,
    }).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }

  async update(id: string, expectedLock: number, input: ContentDocumentUpdateInput): Promise<PipelineMutationResult<PipelineRow>> {
    requireLock(expectedLock);
    const changes = {
      ...(input.articleDnaVersionId !== undefined ? { article_dna_version_id: input.articleDnaVersionId } : {}),
      ...(input.contentPlanVersionId !== undefined ? { content_plan_version_id: input.contentPlanVersionId } : {}),
      ...(input.currentVersionId !== undefined ? { current_version_id: input.currentVersionId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.contentHash !== undefined ? { content_hash: input.contentHash } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      updated_by: this.actorUserId,
    };
    const result = await this.client.from("content_documents").update(changes).eq("id", id).eq("marca_id", this.brandId).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    if (!result.data) throw new PipelineRuntimeError("CONFLICT", "O documento foi alterado ou não pertence à Brand.", 409);
    return { status: "PERSISTED", data: result.data as PipelineRow };
  }
}

export type ContentDocumentVersionAppendInput = {
  versionId?: string;
  contentHash: string;
  payload: PipelineJsonObject;
  changeReason: string;
};

async function assertDocumentBrand(context: PipelineRepositoryContext, documentId: string) {
  requireDocumentId(documentId);
  const result = await context.supabase.from("content_documents").select("id").eq("id", documentId).eq("marca_id", context.brandId).maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  if (!result.data) throw new PipelineRuntimeError("NOT_AUTHORIZED", "O documento não pertence à Brand autorizada.", 403);
}

export class ContentDocumentVersionRepository extends ContextBoundRepository {
  async list(documentId: string): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    await assertDocumentBrand(this.context, documentId);
    const result = await this.client.from("content_document_versions").select("*").eq("document_id", documentId).order("version_number", { ascending: true });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async append(documentId: string, input: ContentDocumentVersionAppendInput): Promise<PipelineMutationResult<PipelineRow>> {
    await assertDocumentBrand(this.context, documentId);
    const latestResult = await this.client.from("content_document_versions").select("version_id,version_number,content_hash").eq("document_id", documentId).order("version_number", { ascending: false }).limit(1).maybeSingle();
    const latest = readOne(latestResult.data as PipelineRow | null, latestResult.error);
    const latestRow = latest.status === "READY" ? latest.data : null;
    if (latestRow?.content_hash === input.contentHash) return { status: "UNCHANGED", data: latestRow };

    const result = await this.client.from("content_document_versions").insert({
      version_id: input.versionId ?? crypto.randomUUID(),
      document_id: documentId,
      version_number: Number(latestRow?.version_number ?? 0) + 1,
      previous_version_id: latestRow?.version_id ?? null,
      content_hash: input.contentHash,
      payload: input.payload,
      change_reason: input.changeReason,
      created_by: this.actorUserId,
    }).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }
}

export type ContentDocumentUserStateInput = {
  cursorPosition: number | null;
  scrollTop: number;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
};

export class ContentDocumentUserStateRepository extends ContextBoundRepository {
  async get(documentId: string): Promise<PipelineReadResult<PipelineRow>> {
    await assertDocumentBrand(this.context, documentId);
    const result = await this.client.from("content_document_user_states").select("*").eq("document_id", documentId).eq("user_id", this.actorUserId).maybeSingle();
    return readOne(result.data as PipelineRow | null, result.error);
  }

  async save(documentId: string, input: ContentDocumentUserStateInput): Promise<PipelineMutationResult<PipelineRow>> {
    await assertDocumentBrand(this.context, documentId);
    const result = await this.client.from("content_document_user_states").upsert({
      document_id: documentId,
      user_id: this.actorUserId,
      cursor_position: input.cursorPosition,
      scroll_top: input.scrollTop,
      left_panel_open: input.leftPanelOpen,
      right_panel_open: input.rightPanelOpen,
      last_opened_at: new Date().toISOString(),
    }, { onConflict: "document_id,user_id" }).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }
}

export type SavedViewInput = {
  id?: string;
  module: "marca" | "minerador" | "arquiteto" | "radar" | "planejador" | "redator" | "publicacoes";
  name: string;
  settings: PipelineJsonObject;
  isDefault: boolean;
};

export class SavedViewRepository extends ContextBoundRepository {
  async list(module?: SavedViewInput["module"]): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    let query = this.client.from("editorial_saved_views").select("*").eq("marca_id", this.brandId).eq("user_id", this.actorUserId);
    if (module) query = query.eq("module", module);
    const result = await query.order("updated_at", { ascending: false });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async save(input: SavedViewInput): Promise<PipelineMutationResult<PipelineRow>> {
    const row = {
      id: input.id ?? crypto.randomUUID(),
      marca_id: this.brandId,
      user_id: this.actorUserId,
      module: input.module,
      name: input.name,
      settings: input.settings,
      is_default: input.isDefault,
    };
    if (input.id) {
      const updated = await this.client.from("editorial_saved_views").update({ name: row.name, module: row.module, settings: row.settings, is_default: row.is_default }).eq("id", input.id).eq("marca_id", this.brandId).eq("user_id", this.actorUserId).select("*").maybeSingle();
      if (updated.error) throw pipelineErrorFromSupabase(updated.error);
      if (updated.data) return { status: "PERSISTED", data: updated.data as PipelineRow };
    }
    const result = await this.client.from("editorial_saved_views").insert(row).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }
}

export type PublicationCreateInput = {
  id?: string;
  articleId: string;
  contentPlanVersionId?: string | null;
  documentId?: string | null;
  status: string;
  publishedUrl?: string | null;
  slug: string;
  canonical?: string | null;
  contentHash: string;
  payload: PipelineJsonObject;
};

export type PublicationUpdateInput = Omit<PublicationCreateInput, "id" | "articleId">;

export class PublicationRecordRepository extends ContextBoundRepository {
  async list(): Promise<PipelineReadResult<readonly PipelineRow[]>> {
    const result = await this.client.from("publication_records").select("*").eq("marca_id", this.brandId).order("updated_at", { ascending: false });
    return readMany(result.data as PipelineRow[] | null, result.error);
  }

  async find(id: string): Promise<PipelineReadResult<PipelineRow>> {
    const result = await this.client.from("publication_records").select("*").eq("id", id).eq("marca_id", this.brandId).maybeSingle();
    return readOne(result.data as PipelineRow | null, result.error);
  }

  async create(input: PublicationCreateInput): Promise<PipelineMutationResult<PipelineRow>> {
    const result = await this.client.from("publication_records").insert({
      id: input.id ?? crypto.randomUUID(),
      marca_id: this.brandId,
      article_id: input.articleId,
      content_plan_version_id: input.contentPlanVersionId ?? null,
      document_id: input.documentId ?? null,
      status: input.status,
      published_url: input.publishedUrl ?? null,
      slug: input.slug,
      canonical: input.canonical ?? null,
      content_hash: input.contentHash,
      payload: input.payload,
      created_by: this.actorUserId,
      updated_by: this.actorUserId,
    }).select("*").single();
    return persisted(mutationData(result.data as PipelineRow | null, result.error));
  }

  async update(id: string, expectedLock: number, input: PublicationUpdateInput): Promise<PipelineMutationResult<PipelineRow>> {
    requireLock(expectedLock);
    const result = await this.client.from("publication_records").update({
      content_plan_version_id: input.contentPlanVersionId ?? null,
      document_id: input.documentId ?? null,
      status: input.status,
      published_url: input.publishedUrl ?? null,
      slug: input.slug,
      canonical: input.canonical ?? null,
      content_hash: input.contentHash,
      payload: input.payload,
      updated_by: this.actorUserId,
    }).eq("id", id).eq("marca_id", this.brandId).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    if (!result.data) throw new PipelineRuntimeError("CONFLICT", "O registro de publicação foi alterado ou não pertence à Brand.", 409);
    return { status: "PERSISTED", data: result.data as PipelineRow };
  }
}

export function createPipelineRepositories(context: PipelineContext) {
  return {
    artifactVersions: new ArtifactVersionRepository(context),
    workflow: new WorkflowRepository(context),
    serpSnapshots: new SerpSnapshotRepository(context),
    serpReviews: new SerpReviewRepository(context),
    contentDocuments: new ContentDocumentRepository(context),
    contentDocumentVersions: new ContentDocumentVersionRepository(context),
    contentDocumentUserStates: new ContentDocumentUserStateRepository(context),
    savedViews: new SavedViewRepository(context),
    publicationRecords: new PublicationRecordRepository(context),
  };
}
