import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import {
  SILO_WORKING_COPY_STAGE,
  SILO_WORKING_COPY_SUBJECT_TYPE,
  SiloWorkingCopyStateSchema,
  buildSiloWorkingCopyRef,
  territoryRefOfWorkingCopy,
  readRpcDomainError,
  SILO_WORKING_COPY_RPC_ERRORS,
  parseSiloWorkingCopyRow,
  type SiloWorkingCopyState,
} from "@/lib/arquiteto/silo-working-copy-record";
import { TERRITORY_SUBJECT_TYPE, TERRITORY_WORKFLOW_STAGE } from "@/lib/arquiteto/territory-record";

export { readRpcDomainError, SILO_WORKING_COPY_RPC_ERRORS };
export type { SiloWorkingCopyRpcError } from "@/lib/arquiteto/silo-working-copy-record";

const COLUMNS =
  "id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,payload,lock_version,created_at,updated_at";

type Row = {
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

export type SiloWorkingCopyItem = {
  workflowItemId: string;
  workingCopyRef: string;
  lockVersion: number;
  state: string;
  workingCopy: SiloWorkingCopyState;
  createdAt: string;
  updatedAt: string;
};

function readRow(row: Row, brandId: string): SiloWorkingCopyItem {
  const parsed = parseSiloWorkingCopyRow(
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
  // Recusa explícita: uma linha que não concorda consigo mesma não é
  // normalizada na leitura — normalizar escolheria um lado sem autoridade.
  if (!parsed.ok) {
    throw new PipelineRuntimeError(
      "CONFLICT",
      `A working copy de Silo ${row.subject_id} é inconsistente (${parsed.issues.join(", ")}).`,
      409,
    );
  }
  return {
    workflowItemId: row.id,
    workingCopyRef: parsed.workingCopy.workingCopyRef,
    lockVersion: row.lock_version,
    state: row.state,
    workingCopy: parsed.workingCopy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSiloWorkingCopies(context: PipelineContext): Promise<SiloWorkingCopyItem[]> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", SILO_WORKING_COPY_SUBJECT_TYPE)
    .eq("stage", SILO_WORKING_COPY_STAGE)
    .order("updated_at", { ascending: false });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as Row[]).map(row => readRow(row, context.brandId));
}

function rpcFailure(error: unknown): never {
  const code = readRpcDomainError(error);
  if (code) {
    const status = code === "STALE_WORKING_COPY" || code === "WORKING_COPY_ALREADY_CONSUMED" ? 409 : 409;
    throw new PipelineRuntimeError("CONFLICT", code, status);
  }
  throw pipelineErrorFromSupabase(error);
}

export type SiloWorkingCopyCreateResult = SiloWorkingCopyItem & { idempotentReplay: boolean };

/**
 * Localiza o item de workflow do território pelo `territoryRef`. As RPCs
 * endereçam o território pelo `id` da linha; o domínio conhece o `territoryRef`.
 */
async function findTerritoryWorkflowItemId(context: PipelineContext, territoryRef: string): Promise<string> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select("id")
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORY_SUBJECT_TYPE)
    .eq("stage", TERRITORY_WORKFLOW_STAGE)
    .eq("subject_id", territoryRef)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const id = (result.data as { id?: string } | null)?.id;
  if (!id) throw new PipelineRuntimeError("CONFLICT", "WORKING_COPY_NOT_FOUND", 409);
  return id;
}

function readRpcRow(payload: unknown, brandId: string): SiloWorkingCopyItem {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "A RPC da working copy não devolveu readback canônico.", 503);
  }
  const data = payload as Record<string, unknown>;
  const row = data.workingCopy;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "O readback da working copy está incompleto.", 503);
  }
  return readRow(row as unknown as Row, brandId);
}

/**
 * WRITER CANÔNICO — passa pela RPC transacional.
 *
 * O caminho anterior fazia `read Território → INSERT` em requisições PostgREST
 * distintas, ou seja transações distintas: o guard territorial provava uma coisa
 * e a escrita acontecia em outra janela. A RPC trava o Território e a working
 * copy na MESMA transação.
 *
 * O `workingCopyRef` continua derivado do território e nunca aceito do cliente;
 * agora quem deriva é o banco, dentro do lock.
 */
export async function createSiloWorkingCopy(
  context: PipelineContext,
  draft: Record<string, unknown>,
): Promise<SiloWorkingCopyCreateResult> {
  const territoryRef = typeof draft.territoryRef === "string" ? draft.territoryRef : "";
  const workingCopy = SiloWorkingCopyStateSchema.parse({
    ...draft,
    workingCopyRef: buildSiloWorkingCopyRef(territoryRef),
    brandId: context.brandId,
  });
  const territoryWorkflowItemId = await findTerritoryWorkflowItemId(context, workingCopy.territoryRef);

  const result = await context.supabase.rpc("persist_silo_working_copy_atomic", {
    p_marca_id: context.brandId,
    p_actor_user_id: context.actorUserId,
    p_action: "create",
    p_territory_workflow_item_id: territoryWorkflowItemId,
    p_working_copy_expected_lock: null,
    p_working_copy: workingCopy,
  });
  if (result.error) rpcFailure(result.error);

  const data = result.data as Record<string, unknown>;
  return {
    ...readRpcRow(data, context.brandId),
    idempotentReplay: data?.idempotentReplay === true,
  };
}

/**
 * WRITER CANÔNICO — mesma RPC, ação `edit`.
 *
 * A editabilidade do território é provada DENTRO da transação da escrita. Era
 * essa janela que permitia gravar na working copy depois da consolidação.
 */
export async function updateSiloWorkingCopy(
  context: PipelineContext,
  workingCopyRef: string,
  expectedLock: number,
  draft: Record<string, unknown>,
): Promise<SiloWorkingCopyItem> {
  const territoryRef = territoryRefOfWorkingCopy(workingCopyRef);
  if (!territoryRef) {
    throw new PipelineRuntimeError("CONFLICT", "IDENTITY_IS_IMMUTABLE", 409);
  }
  const workingCopy = SiloWorkingCopyStateSchema.parse({
    ...draft,
    workingCopyRef,
    territoryRef,
    brandId: context.brandId,
  });
  const territoryWorkflowItemId = await findTerritoryWorkflowItemId(context, territoryRef);

  const result = await context.supabase.rpc("persist_silo_working_copy_atomic", {
    p_marca_id: context.brandId,
    p_actor_user_id: context.actorUserId,
    p_action: "edit",
    p_territory_workflow_item_id: territoryWorkflowItemId,
    p_working_copy_expected_lock: expectedLock,
    p_working_copy: workingCopy,
  });
  if (result.error) rpcFailure(result.error);

  return readRpcRow(result.data as Record<string, unknown>, context.brandId);
}