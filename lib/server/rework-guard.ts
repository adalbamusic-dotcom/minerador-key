import "server-only";

/**
 * ===== GUARDA DE RETRABALHO — SERVIDOR (F5) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §10.1.
 * As regras são de `lib/editorial/rework-guard.ts`; aqui só se lê e grava a
 * linha do guarda (`editorial_workflow_items`, `subject_type =
 * 'operation_ledger'`, `subject_id = '<kind>:<fingerprint>'`) e se traduz o
 * veredito que recusa num 409 com o registro anterior.
 *
 * Quem chama é o NÚCLEO de cada operação — rota, MCP e tela passam pelo mesmo
 * ponto. A operação que já tem registro próprio (a execução da melhoria, o
 * registro de uso, o parecer da SERP) passa o `previous` dela e não lê nem
 * grava a linha do guarda.
 *
 * A guarda AVISA e RECUSA a repetição; ela nunca derruba uma operação por
 * falha própria: leitura que falha = sem registro anterior (`fresh`), e a
 * gravação do registro é melhor-esforço (o resultado da operação é o que vale).
 */

import {
  appendReworkLedgerAttempt,
  assessRework,
  decideRework,
  readReworkLedgerPayload,
  reworkLedgerSubjectId,
  reworkPreviousFromLedger,
  REWORK_LEDGER_SUBJECT_TYPE,
  type ReworkAssessment,
  type ReworkDeclaredCheck,
  type ReworkLedgerStage,
  type ReworkOperationKind,
  type ReworkOutcome,
  type ReworkOverride,
  type ReworkPolicy,
  type ReworkPrevious,
  type ReworkRefusalCode,
} from "@/lib/editorial/rework-guard";
import { PipelineRuntimeError, type PipelineContext } from "./pipeline-runtime";

type GuardContext = Pick<PipelineContext, "supabase" | "brandId" | "actorUserId">;

/**
 * Recusa da guarda: 409, código próprio (`REWORK_SAME_INPUTS`,
 * `REWORK_SAME_REFUSAL`, `DECLARED_PLAN_CONTRADICTION`,
 * `REWORK_PARALLEL_PATH`) e o registro anterior. Continua sendo um
 * `CONFLICT` para quem só sabe ler o erro da pipeline.
 */
export class ReworkRefusedError extends PipelineRuntimeError {
  public readonly reworkCode: ReworkRefusalCode;
  public readonly assessment: ReworkAssessment;

  constructor(assessment: ReworkAssessment) {
    const code = assessment.code ?? "REWORK_SAME_INPUTS";
    super("CONFLICT", `${code}: ${assessment.message}`, 409);
    this.name = "ReworkRefusedError";
    this.reworkCode = code;
    this.assessment = assessment;
  }
}

export type ReworkOperation = {
  kind: ReworkOperationKind;
  fingerprint: string;
  /** Estágio do módulo dono (padrão: Arquiteto). */
  stage?: ReworkLedgerStage;
  /** O grupo da operação, quando se sabe (o "Histórico do grupo" filtra por ele). */
  groupId?: string | null;
  /** O que entrou, em uma frase (o histórico mostra). */
  inputsSummary: string;
  declared?: ReworkDeclaredCheck | null;
  policy?: ReworkPolicy;
  /**
   * O registro próprio da operação, quando ela tem. `undefined` = lê a linha
   * do guarda; `null` = "já li, não há".
   */
  previous?: ReworkPrevious | null;
};

type LedgerRow = { id: string; lock_version: number; payload: unknown };

const LEDGER_COLUMNS = "id,lock_version,payload";

/** A linha do guarda destes insumos. Leitura que falha = `null` (a guarda nunca derruba a operação). */
export async function readReworkLedgerRow(context: GuardContext, kind: ReworkOperationKind, fingerprint: string, stage: ReworkLedgerStage = "architect"): Promise<LedgerRow | null> {
  try {
    const result = await context.supabase
      .from("editorial_workflow_items")
      .select(LEDGER_COLUMNS)
      .eq("marca_id", context.brandId)
      .eq("subject_type", REWORK_LEDGER_SUBJECT_TYPE)
      .eq("stage", stage)
      .eq("subject_id", reworkLedgerSubjectId(kind, fingerprint))
      .maybeSingle();
    if (result.error || !result.data) return null;
    const row = result.data as Record<string, unknown>;
    return typeof row.id === "string" ? { id: row.id, lock_version: Number(row.lock_version) || 1, payload: row.payload } : null;
  } catch {
    return null;
  }
}

/** Várias linhas do guarda de uma vez (lote da SERP). Falha = mapa vazio. */
export async function readReworkLedgerRows(context: GuardContext, kind: ReworkOperationKind, fingerprints: readonly string[], stage: ReworkLedgerStage = "architect"): Promise<Map<string, ReworkPrevious>> {
  const found = new Map<string, ReworkPrevious>();
  const ids = [...new Set(fingerprints)].map(fingerprint => reworkLedgerSubjectId(kind, fingerprint));
  if (!ids.length) return found;
  try {
    const result = await context.supabase
      .from("editorial_workflow_items")
      .select("subject_id,payload")
      .eq("marca_id", context.brandId)
      .eq("subject_type", REWORK_LEDGER_SUBJECT_TYPE)
      .eq("stage", stage)
      .in("subject_id", ids);
    if (result.error) return found;
    for (const row of (result.data || []) as Array<Record<string, unknown>>) {
      const previous = reworkPreviousFromLedger(readReworkLedgerPayload(row.payload));
      if (previous && previous.kind === kind) found.set(previous.fingerprint, previous);
    }
  } catch {
    return found;
  }
  return found;
}

/** O veredito destes insumos. Sem `previous` próprio, lê a linha do guarda. */
export async function checkRework(context: GuardContext, operation: ReworkOperation): Promise<ReworkAssessment> {
  const previous = operation.previous !== undefined
    ? operation.previous
    : reworkPreviousFromLedger(readReworkLedgerPayload((await readReworkLedgerRow(context, operation.kind, operation.fingerprint, operation.stage))?.payload));
  return assessRework({
    kind: operation.kind,
    fingerprint: operation.fingerprint,
    previous,
    declared: operation.declared ?? null,
    ...(operation.policy ? { policy: operation.policy } : {}),
  });
}

/**
 * Aplica o veredito: recusa (409) o que não pode rodar sem motivo — e o que
 * nunca pode (plano declarado, caminho paralelo). Devolve se houve override.
 */
export function enforceRework(assessment: ReworkAssessment, override?: ReworkOverride): { overridden: boolean; overrideReason: string | null } {
  const decision = decideRework(assessment, override);
  if (!decision.proceed) throw new ReworkRefusedError(assessment);
  return { overridden: decision.overridden, overrideReason: decision.overrideReason };
}

export type ReworkOutcomeInput = {
  outcome: ReworkOutcome;
  outcomeCode?: string | null;
  resultRef?: string | null;
  costUsd?: number | null;
  message?: string | null;
  overrideReason?: string | null;
  at?: string;
};

/**
 * Registra a tentativa na linha do guarda (mesmos insumos = mesma linha, pela
 * UNIQUE `(marca_id, subject_type, subject_id, stage)` que já existe). Melhor
 * esforço: devolve `false` sem lançar quando não confirma — o resultado da
 * operação já é o que vale; o registro serve ao aviso e ao histórico.
 */
export async function recordOperation(context: GuardContext, operation: ReworkOperation, outcome: ReworkOutcomeInput): Promise<boolean> {
  const stage = operation.stage ?? "architect";
  const subjectId = reworkLedgerSubjectId(operation.kind, operation.fingerprint);
  const attempt = {
    at: outcome.at ?? new Date().toISOString(),
    actorId: context.actorUserId,
    outcome: outcome.outcome,
    outcomeCode: outcome.outcomeCode ?? null,
    resultRef: outcome.resultRef ?? null,
    costUsd: typeof outcome.costUsd === "number" && Number.isFinite(outcome.costUsd) ? outcome.costUsd : null,
    ...(outcome.message ? { message: outcome.message.slice(0, 600) } : {}),
    ...(outcome.overrideReason ? { overrideReason: outcome.overrideReason } : {}),
  };
  const base = { kind: operation.kind, fingerprint: operation.fingerprint, groupId: operation.groupId ?? null, inputsSummary: operation.inputsSummary };
  try {
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      const current = await readReworkLedgerRow(context, operation.kind, operation.fingerprint, stage);
      // Idempotente: a mesma tentativa (mesmo instante dado pelo chamador) não entra duas vezes.
      if (outcome.at && readReworkLedgerPayload(current?.payload)?.attempts.some(item => item.at === attempt.at && item.outcome === attempt.outcome)) return true;
      const payload = appendReworkLedgerAttempt(current?.payload, base, attempt);
      if (!current) {
        const inserted = await context.supabase.from("editorial_workflow_items").insert({
          marca_id: context.brandId,
          subject_type: REWORK_LEDGER_SUBJECT_TYPE,
          subject_id: subjectId,
          article_id: null,
          stage,
          state: outcome.outcome,
          // A própria operação é a origem: nunca o id de uma keyword (o ciclo de exclusão da keyword não a alcança).
          source_entity_id: subjectId,
          payload,
          created_by: context.actorUserId,
          updated_by: context.actorUserId,
        });
        // Corrida com outra aba (UNIQUE): relê e acrescenta na linha que venceu.
        if (inserted.error) continue;
      } else {
        const updated = await context.supabase.from("editorial_workflow_items")
          .update({ state: outcome.outcome, payload, updated_by: context.actorUserId })
          .eq("id", current.id)
          .eq("marca_id", context.brandId)
          .eq("lock_version", current.lock_version);
        if (updated.error) continue;
      }
      const relida = readReworkLedgerPayload((await readReworkLedgerRow(context, operation.kind, operation.fingerprint, stage))?.payload);
      if (relida?.attempts.some(item => item.at === attempt.at && item.actorId === attempt.actorId && item.outcome === attempt.outcome)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * A porta da guarda para os núcleos com dependências injetadas (retirada,
 * plano no Silo): o runtime real lê e grava a linha do guarda; os testes
 * passam a sua; sem porta, a operação roda como antes.
 */
export type ReworkGuardPort = {
  check: (operation: ReworkOperation) => Promise<ReworkAssessment>;
  record: (operation: ReworkOperation, outcome: ReworkOutcomeInput) => Promise<boolean>;
};

export function reworkGuardPort(context: GuardContext): ReworkGuardPort {
  return {
    check: operation => checkRework(context, operation),
    record: (operation, outcome) => recordOperation(context, operation, outcome),
  };
}

/**
 * Roda uma operação SOB A GUARDA: confere (409 sem motivo quando a mesma
 * recusa ou o plano declarado barram), executa e registra o desfecho. A recusa
 * de domínio (`classifyFailure` = "refused") fica no registro e barra a
 * repetição igual; falha transitória ("failed") nunca barra a próxima.
 */
export async function runUnderReworkGuard<T>(context: GuardContext, operation: ReworkOperation, options: {
  override?: ReworkOverride;
  classifyFailure: (error: unknown) => "refused" | "failed";
  success: (result: T) => { outcomeCode: string; resultRef?: string | null; costUsd?: number | null; message?: string | null };
}, run: () => Promise<T>): Promise<T> {
  const assessment = await checkRework(context, operation);
  const { overrideReason } = enforceRework(assessment, options.override);
  let result: T;
  try {
    result = await run();
  } catch (error) {
    const outcome = options.classifyFailure(error);
    const message = error instanceof Error ? error.message : "falha sem resposta conclusiva";
    await recordOperation(context, operation, {
      outcome,
      outcomeCode: outcome === "refused" ? message.split(":")[0].trim().slice(0, 80) || "REFUSED" : "INDETERMINATE",
      message,
      overrideReason,
    });
    throw error;
  }
  const sucesso = options.success(result);
  await recordOperation(context, operation, { outcome: "succeeded", outcomeCode: sucesso.outcomeCode, resultRef: sucesso.resultRef ?? null, costUsd: sucesso.costUsd ?? null, message: sucesso.message ?? null, overrideReason });
  return result;
}
