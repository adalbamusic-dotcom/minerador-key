import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { listArquitetoArtifacts } from "./arquiteto-persistence";
import { readBrandSiloCatalog } from "@/lib/arquiteto/territorial-landscape";
import { isFullyConsolidatedQualification, qualificationConsolidatedAxes, type KeywordSemanticQualification } from "@/lib/minerador/keyword-semantic-qualification";
import { readCurrentKeywordSemanticQualifications } from "./keyword-semantic-qualification-store";
import { readCurrentKeywordContextualPresentations } from "./keyword-contextual-presentation-store";
import type { KeywordContextualPresentation } from "@/lib/minerador/keyword-contextual-presentation";
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
  const result = await context.supabase.from("minerador_keywords").select("*").eq("brand_id", context.brandId).is("deleted_at", null);
  if (result.error) readFailure(result.error);
  return (result.data || []) as Array<Record<string, unknown> & { id: string; brand_id: string; keyword: string }>;
}

function sourceFromKeyword(keyword: Record<string, unknown> & { id: string; brand_id: string }, qualification?: KeywordSemanticQualification | null, presentation?: KeywordContextualPresentation | null): MineradorKeywordHandoffSource {
  const sourceVersionId = ["keywordDnaVersionId", "keyword_dna_version_id", "sourceVersionId", "source_version_id"]
    .map(key => keyword[key])
    .find(value => typeof value === "string" && value.trim());
  return {
    id: keyword.id,
    brandId: keyword.brand_id,
    status: typeof keyword.status === "string" ? keyword.status : null,
    sourceVersionId: typeof sourceVersionId === "string" ? sourceVersionId : null,
    contentHash: typeof keyword.content_hash === "string" ? keyword.content_hash : null,
    // A Qualificação viaja como está: eixos preenchidos só quando conclusivos,
    // e `semanticState` diz a verdade sobre o que a SERP concluiu.
    semanticQualification: qualification
      ? {
        versionId: qualification.id,
        versionNumber: qualification.lifecycle.version,
        contentHash: qualification.lifecycle.contentHash,
        intent: qualificationConsolidatedAxes(qualification).intent,
        funnel: qualificationConsolidatedAxes(qualification).funnel,
        semanticState: isFullyConsolidatedQualification(qualification) ? "conclusive" : "non_conclusive",
        collectedAt: qualification.source.collectedAt,
      }
      : null,
    // Apresentação Contextual é contexto opcional: viaja quando existe.
    contextualPresentation: presentation
      ? {
        versionId: presentation.id,
        versionNumber: presentation.lifecycle.version,
        contentHash: presentation.lifecycle.contentHash,
        generatedAt: presentation.provenance.generatedAt,
      }
      : null,
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
  // Leitura opcional: a Qualificação Semântica enriquece o pacote quando existe.
  // Ausência, evidência mista ou insuficiente não bloqueiam o handoff — o
  // pacote transporta honestamente o que há, sem inventar Intenção nem Funil.
  const qualifications = await readCurrentKeywordSemanticQualifications({
    brandId: context.brandId,
    keywordIds: eligibleKeywords.map(keyword => keyword.id),
  }).catch(() => new Map<string, KeywordSemanticQualification>());
  // Apresentação Contextual: leitura opcional, sem gerar bloqueio nem IA.
  const presentations = await readCurrentKeywordContextualPresentations({
    brandId: context.brandId,
    keywordIds: eligibleKeywords.map(keyword => keyword.id),
  }).catch(() => new Map<string, KeywordContextualPresentation>());
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
  // Sem segundo gate semântico: aprovado no Minerador é condição suficiente.
  // A Qualificação Semântica viaja integralmente como informação readonly.
  const sources = eligibleKeywords.map(keyword => sourceFromKeyword(keyword, qualifications.get(keyword.id) || null, presentations.get(keyword.id) || null));
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId: context.brandId,
    keywords: sources,
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
  const [allWorkflowRows, availableKeywords, artifacts, brandRow] = await Promise.all([
    listArchitectWorkflowItems(context),
    listBrandKeywords(context),
    listArquitetoArtifacts(context),
    // Catálogo `marcas.silos_existentes`: estado remoto da MESMA Brand, escrito
    // pela criação manual de Silo. Chega pelo read-model canônico em vez de ser
    // lido do contexto de Marca no browser.
    context.supabase.from("marcas").select("silos_existentes").eq("id", context.brandId).maybeSingle(),
  ]);
  if (brandRow.error) throw brandRow.error;

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
  const workspacePresentations = await readCurrentKeywordContextualPresentations({
    brandId: context.brandId,
    keywordIds: keywords.map(keyword => keyword.id),
  }).catch(() => new Map<string, KeywordContextualPresentation>());
  // A elegibilidade é estrutural: status canônico, Brand, lifecycle e
  // duplicação. Nenhuma dimensão semântica participa desta decisão.
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
  // O criador manual grava o par canônico antes de existir ArticleDNA. Se o
  // readback dependesse apenas de artigos associados, um F5 esconderia o
  // SiloDNA/SiloPage recém-criado da cópia de trabalho e do select de Silo.
  const siloDnas = latestByEntity(artifacts.siloDnas)
    .filter(version => version.payload.brandId === context.brandId);
  const siloPages = latestByEntity(artifacts.siloPages)
    .filter(version => version.payload.brandId === context.brandId);
  // Revisão IA vigente por Article: é ela que faz o estado sobreviver ao F5.
  const aiReviews = latestByEntity(artifacts.aiReviews)
    .filter(version => version.payload.brandId === context.brandId);
  const relatedVersionIds = new Set([
    ...articleDnas.map(version => version.versionId),
    ...siloDnas.map(version => version.versionId),
    ...siloPages.map(version => version.versionId),
    ...aiReviews.map(version => version.versionId),
  ]);

  return {
    source: "CANONICAL_REMOTE" as const,
    workflowItems: workflowRows.map(workflowSnapshot),
    importEligibility,
    keywords,
    availableKeywords,
    // Apresentação Contextual persistida no Minerador: viaja somente leitura
    // para o perfil da keyword no Arquiteto. Não é regenerada nem editada aqui.
    keywordPresentations: [...workspacePresentations.values()],
    articleDnas,
    siloDnas,
    siloPages,
    aiReviews,
    statuses: artifacts.statuses.filter(item => relatedVersionIds.has(item.versionId)),
    brandSiloCatalog: readBrandSiloCatalog(brandRow.data?.silos_existentes),
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
