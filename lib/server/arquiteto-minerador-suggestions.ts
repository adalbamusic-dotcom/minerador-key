import "server-only";
import {
  ARCHITECT_SUGGESTIONS_SUBJECT_TYPE,
  architectSuggestionRecordKey,
  buildArchitectSuggestionRecord,
  type ArchitectSuggestionDraft,
  type ArchitectSuggestionRecord,
  type ArchitectSuggestionSource,
} from "@/lib/arquiteto/minerador-suggestions";
import { WorkflowRepository } from "./pipeline-repositories";
import type { PipelineContext } from "./pipeline-runtime";

/**
 * F4 · O ARQUITETO GRAVA A SUGESTÃO, NUNCA A KEYWORD (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 2; D3).
 *
 * O único escritor das "Sugestões do Arquiteto": um item de workflow do
 * Arquiteto (`subject_type = "architect_minerador_suggestions"`, etapa
 * `architect`, chave = origem + execução), com o cliente da sessão de quem
 * preparou (a RLS de sempre). Nenhuma tabela do Minerador é tocada aqui. A
 * mesma origem gravada de novo substitui o registro (a última leitura vale).
 */
type SuggestionWriterContext = Pick<PipelineContext, "actorUserId" | "brandId" | "supabase">;

export async function recordArquitetoMineradorSuggestions(context: SuggestionWriterContext, input: {
  source: ArchitectSuggestionSource;
  sourceId: string;
  drafts: readonly ArchitectSuggestionDraft[];
  now?: Date;
}): Promise<{ recorded: number; recordKey: string } | null> {
  const record = buildArchitectSuggestionRecord({
    brandId: context.brandId,
    source: input.source,
    sourceId: input.sourceId,
    createdAt: (input.now ?? new Date()).toISOString(),
    actorId: context.actorUserId,
    drafts: input.drafts,
  });
  if (!record) return null;
  const recordKey = architectSuggestionRecordKey(input.source, input.sourceId);
  const atual = await context.supabase.from("editorial_workflow_items").select("id,lock_version")
    .eq("marca_id", context.brandId).eq("subject_type", ARCHITECT_SUGGESTIONS_SUBJECT_TYPE).eq("subject_id", recordKey).eq("stage", "architect").maybeSingle();
  if (atual.error) throw atual.error;
  const repository = new WorkflowRepository(context);
  const payload = record as unknown as Record<string, unknown>;
  if (atual.data) await repository.update(String((atual.data as { id: string }).id), Number((atual.data as { lock_version: number }).lock_version), { state: "open", payload });
  else await repository.create({ subjectType: ARCHITECT_SUGGESTIONS_SUBJECT_TYPE, subjectId: recordKey, stage: "architect", state: "open", sourceEntityId: input.sourceId, payload });
  return { recorded: record.items.length, recordKey };
}

/** Grava sem derrubar a operação de origem: a falha vira aviso (a operação do Arquiteto já está salva). */
export async function recordArquitetoMineradorSuggestionsSafely(context: SuggestionWriterContext, input: Parameters<typeof recordArquitetoMineradorSuggestions>[1]): Promise<{ recorded: number; recordKey: string } | { recorded: 0; error: string } | null> {
  try {
    return await recordArquitetoMineradorSuggestions(context, input);
  } catch (error) {
    return { recorded: 0, error: error instanceof Error ? error.message.slice(0, 200) : "falha ao gravar a sugestão" };
  }
}

export type { ArchitectSuggestionRecord };
