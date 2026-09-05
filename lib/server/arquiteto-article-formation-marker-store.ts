import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { WorkflowRepository } from "./pipeline-repositories";
import {
  ARTICLE_FORMATION_MARKER_SUBJECT_ID,
  ARTICLE_FORMATION_MARKER_SUBJECT_TYPE,
  ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE,
  buildArticleFormationMarkerRow,
  parseArticleFormationMarkerRow,
  type ArticleFormationMarkerPayload,
} from "@/lib/arquiteto/article-formation-marker";

/**
 * Persistência do marcador do cenário de formação de Artigos.
 *
 * Um item por marca em `editorial_workflow_items`. Sem DDL, sem artifact_type
 * novo, sem tocar RLS — a policy da tabela autoriza por marca.
 *
 * Guarda apenas o FATO (processado / confirmado). Candidatos, papéis e
 * pontuações continuam sendo reconstruídos do read-model, e confirmar
 * formação não materializa ArticleDNA.
 */

const MARKER_COLUMNS =
  "id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,payload,lock_version,created_at,updated_at";

type MarkerRow = {
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

export type ArticleFormationMarkerItem = {
  workflowItemId: string;
  lockVersion: number;
  payload: ArticleFormationMarkerPayload;
  updatedAt: string;
};

function readRow(row: MarkerRow): ArticleFormationMarkerItem {
  const parsed = parseArticleFormationMarkerRow({
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
      `O marcador de formação remoto é inconsistente (${parsed.issues.join(", ")}).`,
      409,
    );
  }
  return {
    workflowItemId: row.id,
    lockVersion: row.lock_version,
    payload: parsed.payload,
    updatedAt: row.updated_at,
  };
}

async function findRow(context: PipelineContext): Promise<MarkerRow | null> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(MARKER_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", ARTICLE_FORMATION_MARKER_SUBJECT_TYPE)
    .eq("stage", ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE)
    .eq("subject_id", ARTICLE_FORMATION_MARKER_SUBJECT_ID)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return (result.data as MarkerRow | null) || null;
}

export async function readArticleFormationMarker(context: PipelineContext): Promise<ArticleFormationMarkerItem | null> {
  const row = await findRow(context);
  return row ? readRow(row) : null;
}

/**
 * Grava o cenário vigente, criando ou sucedendo o anterior.
 *
 * A UNIQUE (marca_id, subject_type, subject_id, stage) garante um marcador por
 * marca: reprocessar atualiza, não acumula cenários paralelos.
 */
export async function saveArticleFormationMarker(
  context: PipelineContext,
  payload: ArticleFormationMarkerPayload,
): Promise<ArticleFormationMarkerItem> {
  const row = buildArticleFormationMarkerRow(payload);
  const repository = new WorkflowRepository(context);
  const current = await findRow(context);

  if (!current) {
    const created = await repository.create({
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      stage: ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE,
      state: row.state,
      sourceEntityId: row.sourceEntityId,
      articleId: row.articleId,
      payload: row.payload as unknown as Record<string, unknown>,
    });
    if (!created.data) throw new PipelineRuntimeError("QUERY_FAILURE", "O cenário de formação não pôde ser registrado.", 503);
    return readRow(created.data as unknown as MarkerRow);
  }

  const updated = await repository.update(current.id, current.lock_version, {
    state: row.state,
    payload: row.payload as unknown as Record<string, unknown>,
  });
  if (!updated.data) throw new PipelineRuntimeError("QUERY_FAILURE", "O cenário de formação não pôde ser atualizado.", 503);
  return readRow(updated.data as unknown as MarkerRow);
}

/** Releitura remota: sucesso é o remoto devolver o que foi gravado. */
export async function readbackArticleFormationMarker(context: PipelineContext): Promise<ArticleFormationMarkerItem> {
  const item = await readArticleFormationMarker(context);
  if (!item) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "O cenário de formação não voltou na releitura remota.", 503);
  }
  return item;
}
