import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { listArquitetoArtifacts } from "./arquiteto-persistence";
import { readBrandSiloCatalog } from "@/lib/arquiteto/territorial-landscape";
import { isFullyConsolidatedQualification, qualificationConsolidatedAxes, qualificationLensSummary, type KeywordSemanticQualification } from "@/lib/minerador/keyword-semantic-qualification";
import { readCurrentKeywordSemanticQualifications } from "./keyword-semantic-qualification-store";
import { approvedPackageDiverged, buildApprovedPackage } from "@/lib/minerador/approved-package";
import { isApprovedForArchitect } from "@/lib/minerador/editorial-status";
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

function receivedKeywordIdsOf(rows: readonly WorkflowRow[]) {
  return rows
    .filter(row => row.state === MINERADOR_ARQUITETO_RECEIVED_STATE && row.subject_type === "keyword")
    .map(row => row.subject_id);
}

type BrandKeywordRow = Record<string, unknown> & { id: string; brand_id: string; keyword: string };

/*
 * LEITURA DA MARCA EM DUAS LARGURAS (SDD de egress, E8 e R5/R7/R8).
 *
 * O índice leva todas as colunas de `minerador_keywords` MENOS
 * `analise_semantica`, o payload JSON que responde por ~96% dos bytes da
 * linha. É o que a elegibilidade de importação e o pool de importação leem.
 * A linha inteira só vai para as keywords que o consumidor usa inteiras: as
 * recebidas pelo Arquiteto (espalhadas no item da mesa) e as pedidas num
 * handoff (pacote aprovado).
 */
export const ARQUITETO_KEYWORD_INDEX_COLUMNS = "id,brand_id,keyword,location,results_allintitle,volume_search,kgr_score,intent,status,created_at,lista_id,volume_source,deleted_at,purge_after,deleted_by";
export const ARQUITETO_KEYWORD_ROW_COLUMNS = `${ARQUITETO_KEYWORD_INDEX_COLUMNS},analise_semantica`;
/** Colunas que o PATCH da working copy lê da keyword do item editado. */
export const ARQUITETO_PATCH_KEYWORD_STATUS_COLUMNS = "id,status";
export const ARQUITETO_PATCH_KEYWORD_KGR_COLUMNS = "id,status,kgr_score,analise_semantica";
/** Tamanho do lote de `.in("id", …)`: a URL do PostgREST tem limite. */
export const ARQUITETO_KEYWORD_ID_BATCH = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `id` é uuid no banco: um texto fora do formato faria o PostgREST recusar a
 * consulta inteira. Fora do formato, o id simplesmente não é encontrado — a
 * mesma consequência de antes, quando o filtro era feito em memória.
 */
function uuidBatches(ids: readonly string[]) {
  const valid = [...new Set(ids.map(String))].filter(id => UUID_PATTERN.test(id));
  const batches: string[][] = [];
  for (let index = 0; index < valid.length; index += ARQUITETO_KEYWORD_ID_BATCH) {
    batches.push(valid.slice(index, index + ARQUITETO_KEYWORD_ID_BATCH));
  }
  return batches;
}

/** Linha inteira de todas as keywords vivas. Só para o pedido explícito de detalhe completo. */
async function listBrandKeywords(context: PipelineContext) {
  const result = await context.supabase.from("minerador_keywords").select(ARQUITETO_KEYWORD_ROW_COLUMNS).eq("brand_id", context.brandId).is("deleted_at", null);
  if (result.error) readFailure(result.error);
  return (result.data || []) as unknown as BrandKeywordRow[];
}

/** Todas as keywords vivas da marca, sem `analise_semantica`. */
async function listBrandKeywordIndex(context: PipelineContext) {
  const result = await context.supabase.from("minerador_keywords").select(ARQUITETO_KEYWORD_INDEX_COLUMNS).eq("brand_id", context.brandId).is("deleted_at", null);
  if (result.error) readFailure(result.error);
  return (result.data || []) as unknown as BrandKeywordRow[];
}

/** Linha inteira só das keywords pedidas, vivas e da marca. */
async function listBrandKeywordsByIds(context: PipelineContext, ids: readonly string[]) {
  const rows: BrandKeywordRow[] = [];
  for (const batch of uuidBatches(ids)) {
    const result = await context.supabase.from("minerador_keywords").select(ARQUITETO_KEYWORD_ROW_COLUMNS).eq("brand_id", context.brandId).is("deleted_at", null).in("id", batch);
    if (result.error) readFailure(result.error);
    rows.push(...((result.data || []) as unknown as BrandKeywordRow[]));
  }
  return rows;
}

export type ArchitectPatchKeyword = {
  id: string;
  status?: string | null;
  kgr_score?: number | null;
  analise_semantica?: unknown;
};

/**
 * Keywords dos itens que o PATCH da working copy vai editar.
 *
 * Mesma semântica da leitura anterior — marca filtrada e SEM filtro de
 * `deleted_at` —, mas só para os `subject_id` dos itens enviados. O status
 * protege a identidade publicada; `kgr_score` e `analise_semantica` só são
 * lidos para os itens que trazem decisão humana de KGR.
 */
export type ArchitectPatchKeywordReadInput = { workflowItemIds: readonly string[]; kgrDecisionWorkflowItemIds: readonly string[] };

/**
 * Monta o pedido de leitura do PATCH a partir dos updates validados: todo item
 * enviado lê o status; só o item que traz `articleKgrDecision` lê também
 * `kgr_score` e `analise_semantica`, que `readArticleKgrDecision` exige.
 */
export function architectPatchKeywordReadInput(
  updates: ReadonlyArray<{ workflowItemId: string; assignment: { articleKgrDecision?: string | null } }>,
): ArchitectPatchKeywordReadInput {
  return {
    workflowItemIds: updates.map(update => update.workflowItemId),
    kgrDecisionWorkflowItemIds: updates.filter(update => Boolean(update.assignment.articleKgrDecision)).map(update => update.workflowItemId),
  };
}

export async function readArchitectPatchKeywords(
  context: PipelineContext,
  input: ArchitectPatchKeywordReadInput,
) {
  const subjectByWorkflowItemId = new Map<string, string>();
  for (const batch of uuidBatches(input.workflowItemIds)) {
    const result = await context.supabase.from("editorial_workflow_items").select("id,subject_id").eq("marca_id", context.brandId).in("id", batch);
    if (result.error) throw result.error;
    for (const row of (result.data || []) as Array<{ id: unknown; subject_id: unknown }>) {
      subjectByWorkflowItemId.set(String(row.id), String(row.subject_id));
    }
  }
  // O id enviado pode vir em maiúsculas (o schema da rota aceita) e o banco
  // devolve minúsculas: a comparação é sem caixa, como a do uuid no Postgres.
  const kgrItems = new Set(input.kgrDecisionWorkflowItemIds.map(id => String(id).toLowerCase()));
  const statusSubjects: string[] = [];
  const kgrSubjects: string[] = [];
  for (const [workflowItemId, subjectId] of subjectByWorkflowItemId) {
    (kgrItems.has(workflowItemId.toLowerCase()) ? kgrSubjects : statusSubjects).push(subjectId);
  }
  const keywordById = new Map<string, ArchitectPatchKeyword>();
  const readColumns = async (subjectIds: string[], columns: string) => {
    for (const batch of uuidBatches(subjectIds)) {
      const result = await context.supabase.from("minerador_keywords").select(columns).eq("brand_id", context.brandId).in("id", batch);
      if (result.error) throw result.error;
      for (const row of (result.data || []) as unknown as ArchitectPatchKeyword[]) {
        const id = String(row.id);
        // A leitura com KGR é superconjunto da leitura de status: nunca é rebaixada.
        if (columns === ARQUITETO_PATCH_KEYWORD_KGR_COLUMNS || !keywordById.has(id)) keywordById.set(id, row);
      }
    }
  };
  await readColumns(statusSubjects, ARQUITETO_PATCH_KEYWORD_STATUS_COLUMNS);
  await readColumns(kgrSubjects, ARQUITETO_PATCH_KEYWORD_KGR_COLUMNS);
  return keywordById;
}

function approvedPackageInput(keyword: Record<string, unknown> & { id: string; brand_id: string }) {
  return {
    keywordId: keyword.id,
    brandId: keyword.brand_id,
    keyword: typeof keyword.keyword === "string" ? keyword.keyword : "",
    intent: keyword.intent,
    volumeSearch: keyword.volume_search,
    resultsAllintitle: keyword.results_allintitle,
    kgrScore: keyword.kgr_score,
    listaId: keyword.lista_id,
    semantic: (keyword.analise_semantica || null) as Record<string, unknown> | null,
  };
}

/** Status efetivo: aprovada que foi mexida depois já não entrega pacote novo. */
function keywordIsApproved(keyword: Record<string, unknown> & { id: string; brand_id: string }) {
  return isApprovedForArchitect({
    status: keyword.status,
    diverged: approvedPackageDiverged(approvedPackageInput(keyword)),
  });
}

function sourceFromKeyword(keyword: Record<string, unknown> & { id: string; brand_id: string }, qualification?: KeywordSemanticQualification | null): MineradorKeywordHandoffSource {
  const sourceVersionId = ["keywordDnaVersionId", "keyword_dna_version_id", "sourceVersionId", "source_version_id"]
    .map(key => keyword[key])
    .find(value => typeof value === "string" && value.trim());
  const lenses = qualificationLensSummary(qualification);
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
        // Aditivo: só quando a Qualificação foi lida nas quatro lentes.
        ...(lenses ? { lenses } : {}),
      }
      : null,
    // O DNA inteiro, congelado na aprovação. Nada do KeywordDNA fica de fora.
    approvedDna: buildApprovedPackage(approvedPackageInput(keyword)),
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
  const requested = new Set(requestedKeywordIds);
  // O banco filtra pelos ids pedidos (R7): a marca inteira não sai mais do
  // Postgres para ser descartada aqui. Id de outra marca, apagado ou fora do
  // formato não volta, e a contagem abaixo continua recusando com 403.
  const [workflowItems, keywords, artifacts] = await Promise.all([
    listArchitectWorkflowItems(context),
    listBrandKeywordsByIds(context, [...requested]),
    listArquitetoArtifacts(context),
  ]);
  // O `.in` do Postgres compara uuid sem caixa; o filtro em memória de antes
  // comparava o texto exato. Exigir que cada linha devolvida seja um id pedido
  // tal como veio preserva a regra antiga (id em maiúsculas → 403).
  if (keywords.length !== requested.size || !keywords.every(keyword => requested.has(keyword.id))) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "Uma ou mais keywords não pertencem à Brand autorizada.", 403);
  }

  // Aprovada de verdade: coluna aprovada E pacote não divergente. Keyword
  // mexida depois da aprovação fica em revisão e não reabastece o Arquiteto.
  const eligibleKeywords = keywords.filter(keyword =>
    isCanonicalHandoffStatus(typeof keyword.status === "string" ? keyword.status : null) && keywordIsApproved(keyword));
  // Leitura opcional: a Qualificação Semântica enriquece o pacote quando existe.
  // Ausência, evidência mista ou insuficiente não bloqueiam o handoff — o
  // pacote transporta honestamente o que há, sem inventar Intenção nem Funil.
  const qualifications = await readCurrentKeywordSemanticQualifications({
    brandId: context.brandId,
    keywordIds: eligibleKeywords.map(keyword => keyword.id),
  }).catch(() => new Map<string, KeywordSemanticQualification>());
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
  // O que cada item já recebido carrega hoje: é a comparação que decide se a
  // reaprovação tem o que propagar.
  const receivedApprovedHashById = new Map<string, string | null>(
    [...workflowByKeywordId.entries()].map(([keywordId, row]) => {
      const payload = (row.payload || {}) as Record<string, unknown>;
      const approved = payload.approvedDna && typeof payload.approvedDna === "object" ? payload.approvedDna as Record<string, unknown> : null;
      return [keywordId, typeof approved?.contentHash === "string" ? approved.contentHash : null];
    }),
  );
  // Sem segundo gate semântico: aprovado no Minerador é condição suficiente.
  // A Qualificação Semântica viaja integralmente como informação readonly.
  const sources = eligibleKeywords.map(keyword => sourceFromKeyword(keyword, qualifications.get(keyword.id) || null));
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId: context.brandId,
    keywords: sources,
    existingKeywordIds,
    receivedApprovedHashById,
  });
  return {
    plan,
    eligibleKeywordIds: eligibleKeywords.map(keyword => keyword.id),
  };
}

async function persistCanonicalHandoff(context: PipelineContext, prepared: Awaited<ReturnType<typeof prepareCanonicalHandoff>>) {
  if (prepared.plan.rows.length) {
    const result = await context.supabase.from("editorial_workflow_items").upsert(
      prepared.plan.rows.map(row => ({ ...row, created_by: context.actorUserId, updated_by: context.actorUserId })),
      { onConflict: "marca_id,subject_type,subject_id,stage", ignoreDuplicates: true },
    );
    if (result.error) readFailure(result.error);
  }

  // Reaprovação de keyword já recebida reescreve o pacote no lugar. O trigger
  // `pipeline_editorial_touch_lock_version` incrementa a versão sozinho, então
  // a cadeia fica auditável sem tabela nova.
  for (const update of prepared.plan.updates) {
    const result = await context.supabase.from("editorial_workflow_items")
      .update({
        payload: update.payload,
        source_version_id: update.sourceVersionId,
        source_content_hash: update.sourceContentHash,
        updated_by: context.actorUserId,
      })
      .eq("marca_id", context.brandId)
      .eq("subject_type", "keyword")
      .eq("subject_id", update.keywordId)
      .eq("stage", "architect");
    if (result.error) readFailure(result.error);
  }
}

export type CanonicalArquitetoWorkspaceOptions = {
  /**
   * "full" devolve `availableKeywords` com a linha inteira de todas as
   * keywords vivas, como antes. Reservado ao ponto de recuperação, que é ação
   * explícita; a montagem e as releituras usam o índice sem
   * `analise_semantica`.
   */
  keywordDetail?: "full";
};

export async function loadCanonicalArquitetoWorkspace(context: PipelineContext, options: CanonicalArquitetoWorkspaceOptions = {}) {
  const fullKeywordDetail = options.keywordDetail === "full";
  const workflowRowsRead = listArchitectWorkflowItems(context);
  const [allWorkflowRows, availableKeywords, artifacts, brandRow, receivedKeywordRows] = await Promise.all([
    workflowRowsRead,
    fullKeywordDetail ? listBrandKeywords(context) : listBrandKeywordIndex(context),
    listArquitetoArtifacts(context),
    // Catálogo `marcas.silos_existentes`: estado remoto da MESMA Brand, escrito
    // pela criação manual de Silo. Chega pelo read-model canônico em vez de ser
    // lido do contexto de Marca no browser.
    context.supabase.from("marcas").select("silos_existentes").eq("id", context.brandId).maybeSingle(),
    // Linha inteira só das recebidas: elas são espalhadas no item da mesa
    // (`buildCanonicalWorkflowWorkspaceItems`) e precisam do DNA completo.
    fullKeywordDetail
      ? Promise.resolve(null)
      : workflowRowsRead.then(rows => listBrandKeywordsByIds(context, receivedKeywordIdsOf(rows))),
  ]);
  if (brandRow.error) throw brandRow.error;

  const workflowRows = allWorkflowRows.filter(row => row.state === MINERADOR_ARQUITETO_RECEIVED_STATE);
  const keywordIds = new Set(receivedKeywordIdsOf(allWorkflowRows));
  const keywords = (receivedKeywordRows ?? availableKeywords).filter(keyword => keywordIds.has(keyword.id));
  if (keywords.length !== keywordIds.size) {
    throw new PipelineRuntimeError("CONFLICT", "O workflow canônico referencia uma keyword que não está disponível na mesma Brand.", 409);
  }

  const articleDnas = latestByEntity(artifacts.articleDnas).filter(version =>
    version.payload.keywordReferences.some(reference => keywordIds.has(reference.keywordId)),
  );
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
