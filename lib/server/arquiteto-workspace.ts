import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { listArquitetoArtifacts } from "./arquiteto-persistence";
import {
  buildMineradorArquitetoHandoffPlan,
  MINERADOR_ARQUITETO_RECEIVED_STATE,
  resolveCanonicalMineradorArquitetoImportEligibility,
  type MineradorKeywordHandoffSource,
} from "@/lib/arquiteto/minerador-handoff";

type WorkflowRow = {
  id: string;
  marca_id: string;
  subject_type: string;
  subject_id: string;
  article_id: string | null;
  stage: "architect";
  state: string;
  source_entity_id: string;
  source_version_id: string | null;
  source_content_hash: string | null;
  payload: Record<string, unknown>;
  lock_version: number;
  created_at: string;
  updated_at: string;
};

function readFailure(error: unknown): never {
  throw pipelineErrorFromSupabase(error);
}

function latestByEntity<T extends { entityId: string; versionNumber: number }>(versions: readonly T[]) {
  const latest = new Map<string, T>();
  for (const version of versions) {
    const current = latest.get(version.entityId);
    if (!current || version.versionNumber > current.versionNumber) latest.set(version.entityId, version);
  }
  return [...latest.values()];
}

function workflowSnapshot(row: WorkflowRow) {
  return {
    id: row.id,
    marcaId: row.marca_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    articleId: row.article_id,
    stage: row.stage,
    state: row.state,
    sourceEntityId: row.source_entity_id,
    sourceVersionId: row.source_version_id,
    sourceContentHash: row.source_content_hash,
    payload: row.payload || {},
    lockVersion: row.lock_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listArchitectWorkflowItems(context: PipelineContext) {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select("id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,source_version_id,source_content_hash,payload,lock_version,created_at,updated_at")
    .eq("marca_id", context.brandId)
    .eq("subject_type", "keyword")
    .eq("stage", "architect")
    .order("updated_at", { ascending: false });
  if (result.error) readFailure(result.error);
  return (result.data || []) as WorkflowRow[];
}

async function listBrandKeywords(context: PipelineContext) {
  const result = await context.supabase.from("minerador_keywords").select("*").eq("brand_id", context.brandId);
  if (result.error) readFailure(result.error);
  return (result.data || []) as Array<Record<string, unknown> & { id: string; brand_id: string; keyword: string }>;
}

function sourceFromKeyword(keyword: Record<string, unknown> & { id: string; brand_id: string }): MineradorKeywordHandoffSource {
  return {
    id: keyword.id,
    brandId: keyword.brand_id,
    status: typeof keyword.status === "string" ? keyword.status : null,
    contentHash: typeof keyword.content_hash === "string" ? keyword.content_hash : null,
  };
}

function articleDnaKeywordIds(artifacts: Awaited<ReturnType<typeof listArquitetoArtifacts>>, brandId: string) {
  return new Set(latestByEntity(artifacts.articleDnas)
    .filter(version => version.payload.brandId === brandId)
    .flatMap(version => version.payload.keywordReferences.map(reference => reference.keywordId)));
}

function isCanonicalHandoffStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLocaleLowerCase("pt-BR") || "";
  return normalized === "aprovado" || normalized === "publicado";
}

async function prepareCanonicalHandoff(context: PipelineContext, requestedKeywordIds: readonly string[]) {
  const [workflowItems, allKeywords, artifacts] = await Promise.all([
    listArchitectWorkflowItems(context),
    listBrandKeywords(context),
    listArquitetoArtifacts(context),
  ]);
  const requested = new Set(requestedKeywordIds);
  const keywords = allKeywords.filter(keyword => requested.has(keyword.id));
  if (keywords.length !== requested.size) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "Uma ou mais keywords não pertencem à Brand autorizada.", 403);
  }

  const eligibleKeywords = keywords.filter(keyword => isCanonicalHandoffStatus(typeof keyword.status === "string" ? keyword.status : null));
  const articleIds = articleDnaKeywordIds(artifacts, context.brandId);
  const workflowByKeywordId = new Map<string, WorkflowRow>();
  for (const workflow of workflowItems) {
    if (!workflowByKeywordId.has(workflow.subject_id)) workflowByKeywordId.set(workflow.subject_id, workflow);
  }
  const blocked = eligibleKeywords.filter(keyword => {
    const workflow = workflowByKeywordId.get(keyword.id);
    return !articleIds.has(keyword.id) && Boolean(workflow && workflow.state !== MINERADOR_ARQUITETO_RECEIVED_STATE);
  });
  if (blocked.length) {
    throw new PipelineRuntimeError("CONFLICT", "Uma ou mais keywords já possuem workflow remoto incompatível com o handoff normal.", 409);
  }

  const existingKeywordIds = new Set(eligibleKeywords
    .filter(keyword => articleIds.has(keyword.id) || workflowByKeywordId.get(keyword.id)?.state === MINERADOR_ARQUITETO_RECEIVED_STATE)
    .map(keyword => keyword.id));
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId: context.brandId,
    keywords: eligibleKeywords.map(sourceFromKeyword),
    existingKeywordIds,
  });
  return {
    plan,
    eligibleKeywordIds: eligibleKeywords.map(keyword => keyword.id),
  };
}

async function persistCanonicalHandoff(context: PipelineContext, prepared: Awaited<ReturnType<typeof prepareCanonicalHandoff>>) {
  if (!prepared.plan.rows.length) return;
  const result = await context.supabase.from("editorial_workflow_items").upsert(
    prepared.plan.rows.map(row => ({ ...row, created_by: context.actorUserId, updated_by: context.actorUserId })),
    { onConflict: "marca_id,subject_type,subject_id,stage", ignoreDuplicates: true },
  );
  if (result.error) readFailure(result.error);
}

export async function loadCanonicalArquitetoWorkspace(context: PipelineContext) {
  const [allWorkflowRows, availableKeywords, artifacts] = await Promise.all([
    listArchitectWorkflowItems(context),
    listBrandKeywords(context),
    listArquitetoArtifacts(context),
  ]);

  const workflowRows = allWorkflowRows.filter(row => row.state === MINERADOR_ARQUITETO_RECEIVED_STATE);
  const keywordIds = new Set(workflowRows
    .filter(row => row.subject_type === "keyword")
    .map(row => row.subject_id));
  const keywords = availableKeywords.filter(keyword => keywordIds.has(keyword.id));
  if (keywords.length !== keywordIds.size) {
    throw new PipelineRuntimeError("CONFLICT", "O workflow canônico referencia uma keyword que não está disponível na mesma Brand.", 409);
  }

  const articleDnas = latestByEntity(artifacts.articleDnas).filter(version =>
    version.payload.keywordReferences.some(reference => keywordIds.has(reference.keywordId)),
  );
  const importEligibility = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId: context.brandId,
    keywords: availableKeywords.map(keyword => ({
      id: keyword.id,
      brandId: keyword.brand_id,
      status: typeof keyword.status === "string" ? keyword.status : null,
      contentHash: typeof keyword.content_hash === "string" ? keyword.content_hash : null,
    })),
    workflowItems: allWorkflowRows.map(row => ({
      marcaId: row.marca_id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      stage: row.stage,
      state: row.state,
    })),
    articleDnaKeywordIds: new Set(artifacts.articleDnas
      .filter(version => version.payload.brandId === context.brandId)
      .flatMap(version => version.payload.keywordReferences.map(reference => reference.keywordId))),
  });
  const siloIds = new Set(articleDnas
    .map(version => version.payload.siloId)
    .filter((value): value is string => Boolean(value)));
  const siloDnas = latestByEntity(artifacts.siloDnas).filter(version => siloIds.has(version.payload.siloId));
  const siloPages = latestByEntity(artifacts.siloPages).filter(version => siloIds.has(version.payload.siloId));
  const relatedVersionIds = new Set([
    ...articleDnas.map(version => version.versionId),
    ...siloDnas.map(version => version.versionId),
    ...siloPages.map(version => version.versionId),
  ]);

  return {
    source: "CANONICAL_REMOTE" as const,
    workflowItems: workflowRows.map(workflowSnapshot),
    importEligibility,
    keywords,
    availableKeywords,
    articleDnas,
    siloDnas,
    siloPages,
    statuses: artifacts.statuses.filter(item => relatedVersionIds.has(item.versionId)),
  };
}

export async function createMineradorArquitetoHandoff(context: PipelineContext, keywordIds: readonly string[]) {
  const uniqueIds = [...new Set(keywordIds)];
  if (!uniqueIds.length) throw new PipelineRuntimeError("INVALID_CONTEXT", "Selecione ao menos uma keyword do Minerador.", 400);

  const prepared = await prepareCanonicalHandoff(context, uniqueIds);
  await persistCanonicalHandoff(context, prepared);
  const confirmation = await prepareCanonicalHandoff(context, uniqueIds);
  if (confirmation.plan.rows.length || confirmation.eligibleKeywordIds.length !== prepared.eligibleKeywordIds.length) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "O handoff remoto não pôde ser confirmado.", 503);
  }

  return {
    persistence: prepared.plan.createdKeywordIds.length ? "PERSISTED" as const : "UNCHANGED" as const,
    source: "CANONICAL_REMOTE" as const,
    importedKeywordIds: prepared.plan.importedKeywordIds,
    createdKeywordIds: prepared.plan.createdKeywordIds,
    existingKeywordIds: prepared.plan.existingKeywordIds,
  };
}
