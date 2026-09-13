import type { getOperationalClient } from "./editorial-db";

type Db = ReturnType<typeof getOperationalClient>;
export type GlobalWorkflowRow = { id: string; state: string; lock_version: number; payload: unknown };

/**
 * ONDE A GRAVAÇÃO DO STATUS PODE FALHAR.
 *
 * "A gravação do status falhou" não é diagnóstico: ele não diz se o problema
 * foi criar a linha, atualizar sob lock, registrar o histórico ou reler. Pior,
 * o erro do PostgREST NÃO é `instanceof Error` — é objeto simples —, então a
 * mensagem real do banco era engolida pelo fallback do chamador e nunca
 * chegava a lugar nenhum.
 *
 * Cada passo agora tem nome. O nome vai para o log com o erro técnico; o
 * chamador traduz para uma frase operacional.
 */
export const GLOBAL_TRANSITION_STEPS = [
  "INSERT_INITIAL_ITEM",
  "UPDATE_ITEM",
  "LOCK_VERSION_CHECK",
  "INSERT_DECISION_EVENT",
  "COMPENSATING_ROLLBACK",
  "READBACK_ITEM",
  "READBACK_EVENT",
] as const;
export type GlobalTransitionStep = (typeof GLOBAL_TRANSITION_STEPS)[number];

export class GlobalTransitionError extends Error {
  readonly step: GlobalTransitionStep;
  /** O erro cru do banco. Vai para o log, nunca para a mesa. */
  readonly detail: unknown;

  // Campos explícitos, não parameter properties: o type-stripping do Node
  // recusa `constructor(readonly x)` e o teste nem carregaria o módulo.
  constructor(step: GlobalTransitionStep, message: string, detail?: unknown) {
    super(message);
    this.name = "GlobalTransitionError";
    this.step = step;
    this.detail = detail;
  }
}

const descreve = (raw: unknown) => {
  if (!raw) return "sem detalhe";
  if (raw instanceof Error) return raw.message;
  const erro = raw as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return [erro.code, erro.message, erro.details, erro.hint].filter(Boolean).join(" · ") || "sem detalhe";
};

/** Existing tables, optimistic lock, history and readback. No artifact is mutated. */
export async function persistGlobalTransition(db: Db, input: {
  brandId: string; articleId: string; actorId: string; target: string;
  previous: GlobalWorkflowRow | null; payload: object; sourceVersionId?: string;
}) {
  const previous = input.previous;
  const written = previous
    ? await db.from("editorial_workflow_items")
      .update({ state: input.target, payload: input.payload, updated_by: input.actorId })
      .eq("marca_id", input.brandId).eq("id", previous.id).eq("lock_version", previous.lock_version)
      .select("id,state,lock_version,payload").maybeSingle()
    : await db.from("editorial_workflow_items").insert({
      marca_id: input.brandId, stage: "architect", subject_type: "article",
      subject_id: input.articleId, article_id: input.articleId, state: input.target,
      /*
       * `source_entity_id` É NOT NULL NO SCHEMA — e o INSERT não o enviava.
       *
       * Esta era a causa de "A gravação do status falhou" nos cinco artigos da
       * homologação: nenhum deles tinha linha `architect`, então toda transição
       * caía no INSERT, e todo INSERT violava a restrição. A entidade de origem
       * de um item de artigo é o próprio ArticleDNA, cujo `entityId` é o
       * articleId — o mesmo que já vai em `subject_id`.
       */
      source_entity_id: input.articleId,
      // A versão que sustentou a transição, quando o chamador a informa. É ela
      // que o gate do handoff compara depois para saber se a marca ainda vale.
      ...(input.sourceVersionId ? { source_version_id: input.sourceVersionId } : {}),
      payload: input.payload, created_by: input.actorId, updated_by: input.actorId,
    }).select("id,state,lock_version,payload").single();
  if (written.error) {
    throw new GlobalTransitionError(
      previous ? "UPDATE_ITEM" : "INSERT_INITIAL_ITEM",
      previous
        ? "O status do artigo não pôde ser atualizado."
        : "Não foi possível criar o estado inicial do artigo.",
      written.error,
    );
  }
  if (!written.data) {
    // UPDATE com lock que não casou: a linha mudou em outra sessão.
    throw new GlobalTransitionError(
      "LOCK_VERSION_CHECK",
      "A versão do status mudou; recarregue e tente novamente.",
      { expectedLock: previous?.lock_version ?? null },
    );
  }
  const row = written.data as GlobalWorkflowRow;
  const event = await db.from("editorial_decision_events").insert({
    marca_id: input.brandId, workflow_item_id: row.id, article_id: input.articleId,
    event_type: "architect_workflow_status", from_state: previous?.state ?? null,
    to_state: input.target, source_version_id: input.sourceVersionId ?? null,
    actor_id: input.actorId, payload: { ...input.payload, workflowLockVersion: row.lock_version },
  }).select("id").single();
  if (event.error || !event.data) {
    // REST has no multi-request transaction. Compensate only our own revision;
    // never overwrite another session. No success is returned on either failure.
    const rollback = await db.from("editorial_workflow_items")
      .update({ state: previous?.state ?? "RASCUNHO", payload: previous?.payload ?? {}, updated_by: input.actorId })
      .eq("marca_id", input.brandId).eq("id", row.id).eq("lock_version", row.lock_version)
      .select("id").maybeSingle();
    throw new GlobalTransitionError(
      rollback.error || !rollback.data ? "COMPENSATING_ROLLBACK" : "INSERT_DECISION_EVENT",
      rollback.error || !rollback.data
        ? "O histórico da transição não pôde ser confirmado e o estado exige reconciliação remota."
        : "O histórico da transição não pôde ser confirmado; a mudança de status foi revertida.",
      { event: event.error, rollback: rollback.error },
    );
  }
  const [read, history] = await Promise.all([
    db.from("editorial_workflow_items").select("id,state,lock_version,payload")
      .eq("marca_id", input.brandId).eq("id", row.id).single(),
    db.from("editorial_decision_events").select("id,to_state")
      .eq("marca_id", input.brandId).eq("id", event.data.id).single(),
  ]);
  if (read.error || read.data?.state !== input.target || read.data?.lock_version !== row.lock_version) {
    throw new GlobalTransitionError(
      "READBACK_ITEM",
      "O status foi gravado, mas o readback remoto divergiu.",
      { error: read.error, observed: read.data?.state ?? null, expected: input.target },
    );
  }
  if (history.error || history.data?.to_state !== input.target) {
    throw new GlobalTransitionError(
      "READBACK_EVENT",
      "O histórico foi gravado, mas o readback remoto divergiu.",
      { error: history.error, observed: history.data?.to_state ?? null, expected: input.target },
    );
  }
  return read.data as GlobalWorkflowRow;
}

/** O que o log do servidor registra quando uma transição falha. */
export function describeGlobalTransitionFailure(error: unknown) {
  return error instanceof GlobalTransitionError
    ? { step: error.step, message: error.message, technical: descreve(error.detail) }
    : { step: "UNKNOWN" as const, message: "A gravação do status falhou.", technical: descreve(error) };
}
