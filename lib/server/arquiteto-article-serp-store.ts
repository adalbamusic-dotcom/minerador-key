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
import { ARTICLE_FORMATION_SERP_LIST_DETAIL, projectArticleFormationSerpRecord } from "@/lib/arquiteto/article-serp-projection";

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
/**
 * 2026-10-14 · F2 das listas leves: só os pareceres pedidos (releitura do que
 * mudou na mesa), em blocos de 100 `candidateRef`. Mesma validação da lista.
 */
export async function listArticleFormationSerpAssessmentsByRefs(
  context: PipelineContext,
  candidateRefs: readonly string[],
): Promise<ArticleFormationSerpWorkflowItem[]> {
  const refs = [...new Set(candidateRefs)];
  const lidos: ArticleFormationSerpWorkflowItem[] = [];
  for (let inicio = 0; inicio < refs.length; inicio += 100) {
    const result = await context.supabase
      .from("editorial_workflow_items")
      .select(SERP_COLUMNS)
      .eq("marca_id", context.brandId)
      .eq("subject_type", ARTICLE_FORMATION_SERP_SUBJECT_TYPE)
      .eq("stage", ARTICLE_FORMATION_SERP_WORKFLOW_STAGE)
      .in("subject_id", refs.slice(inicio, inicio + 100));
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    lidos.push(...((result.data || []) as SerpRow[]).map(readRow));
  }
  return lidos;
}

/** A view da M-L (`20261016120000_listas_leves.sql`) com o parecer já em projeção. */
export const ARTICLE_FORMATION_SERP_LIGHT_VIEW = "arquiteto_formation_serp_lista_leve" as const;

/** A view ainda não existe (migration não aplicada): 42P01 / PGRST205. */
export function articleFormationSerpLightViewMissing(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  return code === "42P01" || code === "PGRST205" || String(error.message || "").includes(ARTICLE_FORMATION_SERP_LIGHT_VIEW);
}

type SerpLightRow = SerpRow & { projetado?: boolean | null };

/**
 * 2026-10-14 · F6 das listas leves: os pareceres da LISTA do Arquiteto já
 * projetados NO BANCO (view `arquiteto_formation_serp_lista_leve`; a mesma
 * projeção de `lib/arquiteto/article-serp-projection.ts`, conferida contra as
 * linhas reais da WifiConecta: 61 de 61 iguais). Todos da marca, ou só os
 * `candidateRefs` pedidos (releitura do que mudou), em blocos de 100.
 *
 * Sem a view (migration ainda não aplicada) — e SÓ nesse caso —, a leitura de
 * antes: o parecer inteiro do banco projetado no Node. Qualquer outro erro
 * lança (nunca vira lista vazia). Mesma validação de sempre (`readRow`).
 * Nenhum caminho de escrita lê daqui: a escrita relê a linha inteira.
 */
export async function listArticleFormationSerpForList(
  context: PipelineContext,
  candidateRefs?: readonly string[],
): Promise<{ records: Array<ArticleFormationSerpWorkflowItem & { detail?: typeof ARTICLE_FORMATION_SERP_LIST_DETAIL }>; source: "view" | "node" }> {
  const refs = candidateRefs ? [...new Set(candidateRefs)] : null;
  const lerDaView = async (bloco: readonly string[] | null) => {
    let query = context.supabase
      .from(ARTICLE_FORMATION_SERP_LIGHT_VIEW)
      .select(`${SERP_COLUMNS},projetado`)
      .eq("marca_id", context.brandId)
      .eq("subject_type", ARTICLE_FORMATION_SERP_SUBJECT_TYPE)
      .eq("stage", ARTICLE_FORMATION_SERP_WORKFLOW_STAGE);
    query = bloco ? query.in("subject_id", [...bloco]) : query.order("updated_at", { ascending: false });
    return query;
  };
  const linhas: SerpLightRow[] = [];
  const blocos: Array<readonly string[] | null> = refs ? Array.from({ length: Math.ceil(refs.length / 100) }, (_, i) => refs.slice(i * 100, i * 100 + 100)) : [null];
  for (const bloco of blocos) {
    const result = await lerDaView(bloco);
    if (result.error) {
      if (articleFormationSerpLightViewMissing(result.error)) {
        const inteiros = refs ? await listArticleFormationSerpAssessmentsByRefs(context, refs) : await listArticleFormationSerpAssessments(context);
        return { records: inteiros.map(projectArticleFormationSerpRecord), source: "node" };
      }
      throw pipelineErrorFromSupabase(result.error);
    }
    linhas.push(...((result.data || []) as unknown as SerpLightRow[]));
  }
  return {
    records: linhas.map(row => {
      const record = readRow(row);
      return row.projetado ? { ...record, detail: ARTICLE_FORMATION_SERP_LIST_DETAIL } : record;
    }),
    source: "view",
  };
}

/**
 * 2026-10-14 · F2 das listas leves: UM parecer, pelo `candidateRef`, ou `null`
 * quando não existe. Falha de banco continua lançando (não vira "sem parecer").
 */
export async function findArticleFormationSerpAssessment(
  context: PipelineContext,
  candidateRef: string,
): Promise<ArticleFormationSerpWorkflowItem | null> {
  const row = await findRow(context, candidateRef);
  return row ? readRow(row) : null;
}

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
