import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { WorkflowRepository } from "./pipeline-repositories";
import {
  KEYWORD_SERP_SUBJECT_TYPE,
  KEYWORD_SERP_WORKFLOW_STAGE,
  buildKeywordSerpWorkflowRow,
  parseKeywordSerpWorkflowRow,
  type KeywordSerpPayload,
} from "@/lib/arquiteto/keyword-serp-record";

/**
 * Persistência das observações de SERP por keyword.
 *
 * Mesmo caminho do parecer territorial: `editorial_workflow_items` com
 * `subject_type` próprio, sem DDL, sem artifact_type novo, sem tocar RLS.
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

export type KeywordSerpWorkflowItem = {
  workflowItemId: string;
  scopeId: string;
  lockVersion: number;
  payload: KeywordSerpPayload;
  createdAt: string;
  updatedAt: string;
};

function readRow(row: SerpRow): KeywordSerpWorkflowItem {
  const parsed = parseKeywordSerpWorkflowRow({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    stage: row.stage,
    state: row.state,
    sourceEntityId: row.source_entity_id,
    articleId: row.article_id,
    payload: row.payload,
  });
  // Recusa explícita: uma coleta que não concorda consigo mesma não é
  // normalizada na leitura — normalizar escolheria um lado sem autoridade.
  if (!parsed.ok) {
    throw new PipelineRuntimeError(
      "CONFLICT",
      `A coleta de SERP remota ${row.subject_id} é inconsistente (${parsed.issues.join(", ")}).`,
      409,
    );
  }
  return {
    workflowItemId: row.id,
    scopeId: row.subject_id,
    lockVersion: row.lock_version,
    payload: parsed.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listKeywordSerpObservations(context: PipelineContext): Promise<KeywordSerpWorkflowItem[]> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(SERP_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", KEYWORD_SERP_SUBJECT_TYPE)
    .eq("stage", KEYWORD_SERP_WORKFLOW_STAGE)
    .order("updated_at", { ascending: false });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as SerpRow[]).map(readRow);
}

async function findRow(context: PipelineContext, scopeId: string): Promise<SerpRow | null> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(SERP_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", KEYWORD_SERP_SUBJECT_TYPE)
    .eq("stage", KEYWORD_SERP_WORKFLOW_STAGE)
    .eq("subject_id", scopeId)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return (result.data as SerpRow | null) || null;
}

/**
 * Grava a coleta do escopo, criando ou sucedendo a anterior.
 *
 * A UNIQUE (marca_id, subject_type, subject_id, stage) garante uma linha por
 * escopo: recoletar o MESMO grupo atualiza, não duplica. Coleta que falha no
 * provider nem chega aqui, e por isso não apaga observação boa.
 */
export async function saveKeywordSerpObservations(
  context: PipelineContext,
  input: { payload: Omit<KeywordSerpPayload, "contractVersion"> },
): Promise<KeywordSerpWorkflowItem> {
  const row = buildKeywordSerpWorkflowRow(input);
  const repository = new WorkflowRepository(context);
  const current = await findRow(context, row.subjectId);

  if (!current) {
    const created = await repository.create({
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      stage: KEYWORD_SERP_WORKFLOW_STAGE,
      state: row.state,
      sourceEntityId: row.sourceEntityId,
      articleId: row.articleId,
      payload: row.payload as unknown as Record<string, unknown>,
    });
    if (!created.data) throw new PipelineRuntimeError("QUERY_FAILURE", "A coleta de SERP não pôde ser persistida.", 503);
    return readRow(created.data as unknown as SerpRow);
  }

  const updated = await repository.update(current.id, current.lock_version, {
    state: row.state,
    payload: row.payload as unknown as Record<string, unknown>,
  });
  if (!updated.data) throw new PipelineRuntimeError("QUERY_FAILURE", "A coleta de SERP não pôde ser atualizada.", 503);
  return readRow(updated.data as unknown as SerpRow);
}

/**
 * Releitura remota da coleta gravada.
 *
 * É isto que transforma "o provider respondeu" em "a observação existe": sem
 * readback, a rota estaria declarando sucesso por conta própria.
 */
export async function readbackKeywordSerpObservations(
  context: PipelineContext,
  scopeId: string,
): Promise<KeywordSerpWorkflowItem> {
  const row = await findRow(context, scopeId);
  if (!row) {
    throw new PipelineRuntimeError("QUERY_FAILURE", `A coleta de SERP ${scopeId} não voltou na releitura remota.`, 503);
  }
  return readRow(row);
}
