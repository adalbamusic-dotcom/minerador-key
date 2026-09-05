import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { WorkflowRepository } from "./pipeline-repositories";
import {
  TERRITORY_SUBJECT_TYPE,
  TERRITORY_WORKFLOW_STAGE,
  buildTerritoryWorkflowRow,
  parseTerritoryWorkflowRow,
} from "@/lib/arquiteto/territory-record";
import { TerritoryCandidateSchema, buildTerritoryRef, type TerritoryCandidate, type TerritoryRef } from "@/lib/arquiteto/territory";

const TERRITORY_COLUMNS =
  "id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,payload,lock_version,created_at,updated_at";

type TerritoryRow = {
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

export type TerritoryWorkflowItem = {
  workflowItemId: string;
  territoryRef: TerritoryRef;
  lockVersion: number;
  state: string;
  territory: TerritoryCandidate;
  createdAt: string;
  updatedAt: string;
};

function readRow(row: TerritoryRow, brandId: string): TerritoryWorkflowItem {
  const parsed = parseTerritoryWorkflowRow(
    {
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      stage: row.stage,
      state: row.state,
      sourceEntityId: row.source_entity_id,
      articleId: row.article_id,
      payload: row.payload,
    },
    brandId,
  );
  // Recusa explícita. Um registro territorial que não concorda consigo mesmo não
  // é normalizado na leitura: normalizar escolheria um dos lados sem autoridade.
  if (!parsed.ok) {
    throw new PipelineRuntimeError(
      "CONFLICT",
      `O registro territorial remoto ${row.subject_id} é inconsistente (${parsed.issues.join(", ")}).`,
      409,
    );
  }
  return {
    workflowItemId: row.id,
    territoryRef: parsed.territory.territoryRef,
    lockVersion: row.lock_version,
    state: row.state,
    territory: parsed.territory,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTerritoryWorkflowItems(context: PipelineContext): Promise<TerritoryWorkflowItem[]> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(TERRITORY_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORY_SUBJECT_TYPE)
    .eq("stage", TERRITORY_WORKFLOW_STAGE)
    .order("updated_at", { ascending: false });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as TerritoryRow[]).map(row => readRow(row, context.brandId));
}

async function findTerritoryRow(context: PipelineContext, territoryRef: string): Promise<TerritoryRow | null> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(TERRITORY_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORY_SUBJECT_TYPE)
    .eq("stage", TERRITORY_WORKFLOW_STAGE)
    .eq("subject_id", territoryRef)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return (result.data as TerritoryRow | null) || null;
}

/**
 * O `territoryRef` é EMITIDO AQUI, no servidor, e nunca aceito do cliente na
 * criação. O browser pode usar um identificador temporário de UI enquanto o
 * território não existe; a identidade canônica é a que sai desta função.
 *
 * O draft chega sem `territoryRef` e sem `brandId`: os dois são impostos pelo
 * contexto autenticado, não declarados pelo chamador.
 */
export async function createTerritoryWorkflowItem(
  context: PipelineContext,
  draft: Record<string, unknown>,
): Promise<TerritoryWorkflowItem> {
  const territory = TerritoryCandidateSchema.parse({
    ...draft,
    territoryRef: buildTerritoryRef(),
    brandId: context.brandId,
  });
  const row = buildTerritoryWorkflowRow(territory);
  const repository = new WorkflowRepository(context);
  const created = await repository.create({
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    stage: row.stage,
    state: row.state,
    sourceEntityId: row.sourceEntityId,
    articleId: row.articleId,
    payload: row.payload as unknown as Record<string, unknown>,
  });
  if (!created.data) throw new PipelineRuntimeError("QUERY_FAILURE", "O território não pôde ser persistido.", 503);
  return readRow(created.data as unknown as TerritoryRow, context.brandId);
}

export async function updateTerritoryWorkflowItem(
  context: PipelineContext,
  territoryRef: string,
  expectedLock: number,
  draft: Record<string, unknown>,
): Promise<TerritoryWorkflowItem> {
  const current = await findTerritoryRow(context, territoryRef);
  if (!current) throw new PipelineRuntimeError("CONFLICT", "O território não existe nesta Brand.", 409);
  // A identidade é imutável: `territoryRef` e `brandId` vêm da linha e do
  // contexto, nunca do corpo da requisição.
  const territory = TerritoryCandidateSchema.parse({
    ...draft,
    territoryRef: current.subject_id,
    brandId: context.brandId,
  });
  const row = buildTerritoryWorkflowRow(territory);
  const repository = new WorkflowRepository(context);
  const updated = await repository.update(current.id, expectedLock, {
    state: row.state,
    payload: row.payload as unknown as Record<string, unknown>,
  });
  return readRow(updated.data as unknown as TerritoryRow, context.brandId);
}
