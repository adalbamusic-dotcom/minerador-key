import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { WorkflowRepository } from "./pipeline-repositories";
import {
  TERRITORIAL_SERP_SUBJECT_TYPE,
  TERRITORIAL_SERP_WORKFLOW_STAGE,
  buildTerritorialSerpWorkflowRow,
  parseTerritorialSerpWorkflowRow,
  type TerritorialSerpBase,
  type TerritorialSerpPayload,
} from "@/lib/arquiteto/territorial-serp-record";
import type { TerritorialSerpAssessment } from "@/lib/arquiteto/territorial-serp";

/**
 * Persistência do parecer de SERP territorial.
 *
 * Usa `editorial_workflow_items` com `subject_type` próprio — o mesmo caminho
 * já provado por `territory` e `silo_working_copy`. Sem DDL, sem artifact_type
 * novo, sem tocar RLS: a policy da tabela autoriza por marca.
 *
 * Toda escrita termina em readback: provider OK não é sucesso; sucesso é o
 * remoto devolvendo o que foi gravado.
 */

const SERP_COLUMNS =
  "id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,payload,lock_version,created_at,updated_at";

type SerpRow = {
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

export type TerritorialSerpWorkflowItem = {
  workflowItemId: string;
  questionId: string;
  lockVersion: number;
  payload: TerritorialSerpPayload;
  createdAt: string;
  updatedAt: string;
};

function readRow(row: SerpRow): TerritorialSerpWorkflowItem {
  const parsed = parseTerritorialSerpWorkflowRow({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    stage: row.stage,
    state: row.state,
    sourceEntityId: row.source_entity_id,
    articleId: row.article_id,
    payload: row.payload,
  });
  // Recusa explícita: um parecer que não concorda consigo mesmo não é
  // normalizado na leitura — normalizar escolheria um lado sem autoridade.
  if (!parsed.ok) {
    throw new PipelineRuntimeError(
      "CONFLICT",
      `O parecer de SERP remoto ${row.subject_id} é inconsistente (${parsed.issues.join(", ")}).`,
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

export async function listTerritorialSerpAssessments(context: PipelineContext): Promise<TerritorialSerpWorkflowItem[]> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(SERP_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORIAL_SERP_SUBJECT_TYPE)
    .eq("stage", TERRITORIAL_SERP_WORKFLOW_STAGE)
    .order("updated_at", { ascending: false });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as SerpRow[]).map(readRow);
}

async function findRow(context: PipelineContext, questionId: string): Promise<SerpRow | null> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(SERP_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORIAL_SERP_SUBJECT_TYPE)
    .eq("stage", TERRITORIAL_SERP_WORKFLOW_STAGE)
    .eq("subject_id", questionId)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return (result.data as SerpRow | null) || null;
}

/**
 * Grava o parecer da pergunta, criando ou sucedendo o anterior.
 *
 * A UNIQUE (marca_id, subject_type, subject_id, stage) garante uma linha por
 * pergunta: a segunda validação da MESMA pergunta atualiza, não duplica.
 * O parecer anterior é substituído apenas por outro parecer válido — falha de
 * provider nem chega aqui, e por isso não apaga evidência boa.
 */
export async function saveTerritorialSerpAssessment(
  context: PipelineContext,
  input: { assessment: TerritorialSerpAssessment; base: TerritorialSerpBase; operationRequestId: string },
): Promise<TerritorialSerpWorkflowItem> {
  const row = buildTerritorialSerpWorkflowRow(input);
  const repository = new WorkflowRepository(context);
  const current = await findRow(context, row.subjectId);

  if (!current) {
    const created = await repository.create({
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      stage: TERRITORIAL_SERP_WORKFLOW_STAGE,
      state: row.state,
      sourceEntityId: row.sourceEntityId,
      articleId: row.articleId,
      payload: row.payload as unknown as Record<string, unknown>,
    });
    if (!created.data) throw new PipelineRuntimeError("QUERY_FAILURE", "O parecer de SERP não pôde ser persistido.", 503);
    return readRow(created.data as unknown as SerpRow);
  }

  const updated = await repository.update(current.id, current.lock_version, {
    state: row.state,
    payload: row.payload as unknown as Record<string, unknown>,
  });
  if (!updated.data) throw new PipelineRuntimeError("QUERY_FAILURE", "O parecer de SERP não pôde ser atualizado.", 503);
  return readRow(updated.data as unknown as SerpRow);
}

/**
 * Releitura remota da pergunta gravada.
 *
 * É isto que transforma "o provider respondeu" em "o parecer existe": sem
 * readback, a rota estaria declarando sucesso por conta própria.
 */
export async function readbackTerritorialSerpAssessment(
  context: PipelineContext,
  questionId: string,
): Promise<TerritorialSerpWorkflowItem> {
  const row = await findRow(context, questionId);
  if (!row) {
    throw new PipelineRuntimeError("QUERY_FAILURE", `O parecer de SERP ${questionId} não voltou na releitura remota.`, 503);
  }
  return readRow(row);
}
