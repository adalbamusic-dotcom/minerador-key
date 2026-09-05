import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { WorkflowRepository } from "./pipeline-repositories";
import {
  ARTICLE_FORMATION_SERP_SUBJECT_TYPE,
  ARTICLE_FORMATION_SERP_WORKFLOW_STAGE,
  buildArticleFormationSerpRow,
  parseArticleFormationSerpRow,
  type ArticleFormationSerpPayload,
  type ArticleSerpHumanResolution,
  type ArticleSerpVerdict,
} from "@/lib/arquiteto/article-serp-record";
import type { SerpFormationAssessment } from "@/lib/arquiteto/serp-formation";

/**
 * Persistência do parecer de SERP da FORMAÇÃO de Article.
 *
 * Mesmo caminho de `territorial_serp_assessment`: `editorial_workflow_items`
 * com `subject_type` próprio, `subject_id = candidateRef` e `article_id` nulo.
 * Sem DDL, sem artifact_type novo, sem tocar RLS.
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

export type ArticleFormationSerpWorkflowItem = {
  workflowItemId: string;
  candidateRef: string;
  lockVersion: number;
  payload: ArticleFormationSerpPayload;
  createdAt: string;
  updatedAt: string;
};

function readRow(row: SerpRow): ArticleFormationSerpWorkflowItem {
  const parsed = parseArticleFormationSerpRow({
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
      `O parecer de SERP de formação ${row.subject_id} é inconsistente (${parsed.issues.join(", ")}).`,
      409,
    );
  }
  return {
    workflowItemId: row.id,
    candidateRef: row.subject_id,
    lockVersion: row.lock_version,
    payload: parsed.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listArticleFormationSerpAssessments(
  context: PipelineContext,
): Promise<ArticleFormationSerpWorkflowItem[]> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(SERP_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", ARTICLE_FORMATION_SERP_SUBJECT_TYPE)
    .eq("stage", ARTICLE_FORMATION_SERP_WORKFLOW_STAGE)
    .order("updated_at", { ascending: false });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as SerpRow[]).map(readRow);
}

async function findRow(context: PipelineContext, candidateRef: string): Promise<SerpRow | null> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(SERP_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", ARTICLE_FORMATION_SERP_SUBJECT_TYPE)
    .eq("stage", ARTICLE_FORMATION_SERP_WORKFLOW_STAGE)
    .eq("subject_id", candidateRef)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return (result.data as SerpRow | null) || null;
}

/**
 * Grava o parecer do candidato, criando ou sucedendo o anterior.
 *
 * A UNIQUE (marca_id, subject_type, subject_id, stage) garante uma linha por
 * candidato: reexecutar a SERP do MESMO artigo atualiza, não duplica.
 *
 * A resolução humana anterior é descartada de propósito quando a base muda:
 * ela foi tomada contra outra composição, e mantê-la faria uma decisão velha
 * liberar uma gravação que ninguém aprovou.
 */
export async function saveArticleFormationSerpAssessment(
  context: PipelineContext,
  input: {
    candidateRef: string;
    territoryRef: string;
    formationBaseHash: string;
    verdict: ArticleSerpVerdict;
    assessment: SerpFormationAssessment;
    operationRequestId: string;
    interpretation?: ArticleFormationSerpPayload["interpretation"];
  },
): Promise<ArticleFormationSerpWorkflowItem> {
  const repository = new WorkflowRepository(context);
  const current = await findRow(context, input.candidateRef);
  const anterior = current ? readRow(current).payload : null;
  const resolucaoPreservada = anterior?.humanResolution
    && anterior.humanResolution.formationBaseHash === input.formationBaseHash
    ? anterior.humanResolution
    : null;

  const row = buildArticleFormationSerpRow({ ...input, humanResolution: resolucaoPreservada });

  if (!current) {
    const created = await repository.create({
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      stage: ARTICLE_FORMATION_SERP_WORKFLOW_STAGE,
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
 * Registra a decisão humana CONTRA o parecer vigente.
 *
 * A decisão é da questão editorial concreta e viaja com o `formationBaseHash`
 * que estava em tela. Se a composição mudar depois, a decisão deixa de valer
 * sozinha — sem precisar de ninguém para revogá-la.
 */
export async function resolveArticleFormationSerpAssessment(
  context: PipelineContext,
  input: { candidateRef: string; resolution: ArticleSerpHumanResolution },
): Promise<ArticleFormationSerpWorkflowItem> {
  const current = await findRow(context, input.candidateRef);
  if (!current) {
    throw new PipelineRuntimeError("CONFLICT", `Não há parecer de SERP para ${input.candidateRef}; colete a evidência antes de decidir.`, 409);
  }
  const vigente = readRow(current).payload;
  if (input.resolution.formationBaseHash !== vigente.formationBaseHash) {
    throw new PipelineRuntimeError(
      "CONFLICT",
      "A decisão foi tomada sobre outra composição; recarregue o parecer vigente antes de decidir.",
      409,
    );
  }

  const row = buildArticleFormationSerpRow({
    candidateRef: vigente.candidateRef,
    territoryRef: vigente.territoryRef,
    formationBaseHash: vigente.formationBaseHash,
    verdict: vigente.verdict,
    // O parecer volta como veio do remoto; este caminho só carimba a decisão.
    assessment: vigente.assessment as unknown as SerpFormationAssessment,
    operationRequestId: vigente.provenance.operationRequestId,
    interpretation: vigente.interpretation,
    humanResolution: input.resolution,
  });

  const repository = new WorkflowRepository(context);
  const updated = await repository.update(current.id, current.lock_version, {
    state: row.state,
    payload: row.payload as unknown as Record<string, unknown>,
  });
  if (!updated.data) throw new PipelineRuntimeError("QUERY_FAILURE", "A decisão sobre a SERP não pôde ser gravada.", 503);
  return readRow(updated.data as unknown as SerpRow);
}

/**
 * Releitura remota do parecer gravado.
 *
 * É isto que transforma "o provider respondeu" em "a evidência existe": sem
 * readback a rota estaria declarando sucesso por conta própria.
 */
export async function readbackArticleFormationSerpAssessment(
  context: PipelineContext,
  candidateRef: string,
): Promise<ArticleFormationSerpWorkflowItem> {
  const row = await findRow(context, candidateRef);
  if (!row) {
    throw new PipelineRuntimeError("QUERY_FAILURE", `O parecer de SERP ${candidateRef} não voltou na releitura remota.`, 503);
  }
  return readRow(row);
}
