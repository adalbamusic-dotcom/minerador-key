import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { WorkflowRepository } from "./pipeline-repositories";
import {
  TERRITORIAL_AI_SUBJECT_TYPE,
  TERRITORIAL_AI_WORKFLOW_STAGE,
  buildTerritorialAiWorkflowRow,
  parseTerritorialAiWorkflowRow,
  type TerritorialAiBase,
  type TerritorialAiPayload,
  type TerritorialAiSerpRef,
} from "@/lib/arquiteto/territorial-ai-record";
import type { TerritorialAiProposal } from "@/lib/arquiteto/territorial-ai";

/**
 * Persistência da proposta de IA territorial.
 *
 * Mesmo caminho da SERP territorial: `editorial_workflow_items` com
 * `subject_type` próprio. Sem DDL, sem artifact_type novo, sem tocar RLS.
 *
 * Este store NÃO escreve em nenhum outro subject_type. Em particular, rodar a
 * IA não encosta no registro da SERP: a evidência continua vigente.
 */

const AI_COLUMNS =
  "id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,payload,lock_version,created_at,updated_at";

type AiRow = {
  id: string;
  marca_id: string;
  subject_type: string;
  subject_id: string;
  article_id: string | null;
  stage: string;
  state: string;
  source_entity_id: string;
  payload: unknown;
  lock_version: number;
  created_at: string;
  updated_at: string;
};

export type TerritorialAiWorkflowItem = {
  workflowItemId: string;
  questionId: string;
  lockVersion: number;
  payload: TerritorialAiPayload;
  createdAt: string;
  updatedAt: string;
};

function readRow(row: AiRow): TerritorialAiWorkflowItem {
  const parsed = parseTerritorialAiWorkflowRow({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    stage: row.stage,
    state: row.state,
    sourceEntityId: row.source_entity_id,
    articleId: row.article_id,
    payload: row.payload,
  });
  // Recusa explícita: normalizar na leitura escolheria um lado sem autoridade.
  if (!parsed.ok) {
    throw new PipelineRuntimeError(
      "CONFLICT",
      `A proposta de IA remota ${row.subject_id} é inconsistente (${parsed.issues.join(", ")}).`,
      409,
    );
  }
  return {
    workflowItemId: row.id,
    questionId: row.subject_id,
    lockVersion: row.lock_version,
    payload: parsed.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTerritorialAiProposals(context: PipelineContext): Promise<TerritorialAiWorkflowItem[]> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(AI_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORIAL_AI_SUBJECT_TYPE)
    .eq("stage", TERRITORIAL_AI_WORKFLOW_STAGE)
    .order("updated_at", { ascending: false });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as AiRow[]).map(readRow);
}

async function findRow(context: PipelineContext, questionId: string): Promise<AiRow | null> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(AI_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORIAL_AI_SUBJECT_TYPE)
    .eq("stage", TERRITORIAL_AI_WORKFLOW_STAGE)
    .eq("subject_id", questionId)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return (result.data as AiRow | null) || null;
}

/**
 * Grava a proposta da pergunta, criando ou sucedendo a anterior.
 *
 * Só chega aqui proposta que passou pelo schema E pela validação de refs. Uma
 * execução que falha não alcança este ponto — e é por isso que a proposta
 * válida anterior sobrevive à falha seguinte.
 */
export async function saveTerritorialAiProposal(
  context: PipelineContext,
  input: {
    proposal: TerritorialAiProposal;
    base: TerritorialAiBase;
    serpRef: TerritorialAiSerpRef | null;
    operationRequestId: string;
    generatedAt: string;
  },
): Promise<TerritorialAiWorkflowItem> {
  const row = buildTerritorialAiWorkflowRow(input);
  const repository = new WorkflowRepository(context);
  const current = await findRow(context, row.subjectId);

  if (!current) {
    const created = await repository.create({
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      stage: TERRITORIAL_AI_WORKFLOW_STAGE,
      state: row.state,
      sourceEntityId: row.sourceEntityId,
      articleId: row.articleId,
      payload: row.payload as unknown as Record<string, unknown>,
    });
    if (!created.data) throw new PipelineRuntimeError("QUERY_FAILURE", "A proposta de IA não pôde ser persistida.", 503);
    return readRow(created.data as unknown as AiRow);
  }

  const updated = await repository.update(current.id, current.lock_version, {
    state: row.state,
    payload: row.payload as unknown as Record<string, unknown>,
  });
  if (!updated.data) throw new PipelineRuntimeError("QUERY_FAILURE", "A proposta de IA não pôde ser atualizada.", 503);
  return readRow(updated.data as unknown as AiRow);
}

/** Releitura remota: é ela que transforma "o provider respondeu" em sucesso. */
export async function readbackTerritorialAiProposal(
  context: PipelineContext,
  questionId: string,
): Promise<TerritorialAiWorkflowItem> {
  const row = await findRow(context, questionId);
  if (!row) {
    throw new PipelineRuntimeError("QUERY_FAILURE", `A proposta de IA ${questionId} não voltou na releitura remota.`, 503);
  }
  return readRow(row);
}
