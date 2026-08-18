import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTenantId } from "@/lib/tenant-routing";

export type PipelineErrorCode =
  | "NO_DATA"
  | "QUERY_FAILURE"
  | "SCHEMA_MISSING"
  | "NOT_AUTHORIZED"
  | "INVALID_ARTIFACT"
  | "INVALID_CONTEXT"
  | "CONFLICT";

export class PipelineRuntimeError extends Error {
  public readonly code: PipelineErrorCode;
  public readonly status: 400 | 401 | 403 | 409 | 503;

  constructor(
    code: PipelineErrorCode,
    message: string,
    status: 400 | 401 | 403 | 409 | 503 = code === "NOT_AUTHORIZED" ? 403 : 503,
  ) {
    super(message);
    this.name = "PipelineRuntimeError";
    this.code = code;
    this.status = status;
  }
}

export type PipelineReadResult<T> =
  | { status: "READY"; data: T }
  | { status: "NO_DATA"; data: null };

export type PipelineMutationResult<T> =
  | { status: "PERSISTED"; data: T }
  | { status: "UNCHANGED"; data: T };

export type PipelineContextInput = {
  brandId: string;
  module: string;
  action: string;
};

export type PipelineContext = {
  readonly actorUserId: string;
  readonly brandId: string;
  readonly module: string;
  readonly action: string;
  readonly permissions: readonly [string];
  readonly authorizationSource: "canonical_actor_rpc";
  /** Server-only service_role client, returned only after both RPC checks pass. */
  readonly supabase: SupabaseClient;
};

export type PipelineContextDependencies = {
  requireActorUserId?: () => Promise<string>;
  createServiceClient?: () => SupabaseClient | Promise<SupabaseClient>;
};

const schemaErrorCodes = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205", "PGRST206"]);
const conflictErrorCodes = new Set(["23505", "23503", "40001"]);

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { code: "", message: "" };
  const candidate = error as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    message: typeof candidate.message === "string" ? candidate.message : "",
  };
}

export function pipelineErrorFromSupabase(error: unknown): PipelineRuntimeError {
  const { code, message } = errorDetails(error);
  if (schemaErrorCodes.has(code) || /relation .* does not exist|column .* does not exist|function .* does not exist/i.test(message)) {
    return new PipelineRuntimeError("SCHEMA_MISSING", "O schema canônico do pipeline não está disponível.", 503);
  }
  if (conflictErrorCodes.has(code)) {
    return new PipelineRuntimeError("CONFLICT", "A operação entrou em conflito com um registro existente ou concorrente.", 409);
  }
  if (code === "42501" || code === "PGRST301" || code === "PGRST302") {
    return new PipelineRuntimeError("QUERY_FAILURE", "A consulta do pipeline não pôde ser autorizada no servidor.", 503);
  }
  return new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível consultar ou persistir o pipeline editorial.", 503);
}

export function readOne<T>(data: T | null | undefined, error: unknown): PipelineReadResult<T> {
  if (error) throw pipelineErrorFromSupabase(error);
  return data == null ? { status: "NO_DATA", data: null } : { status: "READY", data };
}

export function readMany<T>(data: T[] | null | undefined, error: unknown): PipelineReadResult<readonly T[]> {
  if (error) throw pipelineErrorFromSupabase(error);
  return data?.length ? { status: "READY", data } : { status: "NO_DATA", data: null };
}

export function persisted<T>(data: T | null | undefined): PipelineMutationResult<T> {
  if (data == null) throw new PipelineRuntimeError("QUERY_FAILURE", "A persistência não foi confirmada pelo banco.", 503);
  return { status: "PERSISTED", data };
}

function invalidContext(message: string): never {
  throw new PipelineRuntimeError("INVALID_CONTEXT", message, 400);
}

async function defaultActorUserId() {
  try {
    const { requireCanonicalActorUserId } = await import("@/lib/server/canonical-authorization");
    return await requireCanonicalActorUserId();
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "REMOTE_UNAVAILABLE") {
      throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível validar a identidade no servidor.", 503);
    }
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "Sessão Supabase ausente ou inválida.", 401);
  }
}

async function defaultServiceClient() {
  const { createCanonicalServiceClient } = await import("@/lib/server/canonical-authorization");
  return createCanonicalServiceClient();
}

async function canonicalRpc(client: SupabaseClient, functionName: string, params: Record<string, string>) {
  const result = await client.rpc(functionName, params);
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  if (typeof result.data !== "boolean") {
    throw new PipelineRuntimeError("QUERY_FAILURE", "A autorização canônica retornou uma resposta inválida.", 503);
  }
  return result.data;
}

/**
 * Resolves the actor and explicit Brand before exposing the server-side
 * service_role client to a repository context.
 */
export async function resolvePipelineContext(
  input: PipelineContextInput,
  dependencies: PipelineContextDependencies = {},
): Promise<PipelineContext> {
  if (!input || typeof input.brandId !== "string" || !input.brandId.trim()) {
    invalidContext("brandId é obrigatório para qualquer operação editorial.");
  }
  if (!isTenantId(input.brandId)) invalidContext("brandId deve ser o UUID canônico da Brand.");
  if (typeof input.module !== "string" || !input.module.trim() || typeof input.action !== "string" || !input.action.trim()) {
    invalidContext("module e action são obrigatórios para resolver o contexto editorial.");
  }

  const actorUserId = await (dependencies.requireActorUserId ?? defaultActorUserId)();
  if (!isTenantId(actorUserId)) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "A sessão autenticada não possui um actorUserId válido.", 401);
  }

  let supabase: SupabaseClient;
  try {
    supabase = await (dependencies.createServiceClient ?? defaultServiceClient)();
  } catch {
    throw new PipelineRuntimeError("QUERY_FAILURE", "O cliente server-side do pipeline não está configurado.", 503);
  }

  const canAccess = await canonicalRpc(supabase, "canonical_actor_can_access_brand", {
    target_brand_id: input.brandId,
    target_actor_user_id: actorUserId,
  });
  if (!canAccess) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "O ator não possui acesso operacional à Brand informada.", 403);
  }

  const canUseAction = await canonicalRpc(supabase, "canonical_actor_can_use_brand_action", {
    target_brand_id: input.brandId,
    target_actor_user_id: actorUserId,
    requested_module: input.module.trim(),
    requested_action: input.action.trim(),
  });
  if (!canUseAction) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "O ator não possui permissão para esta ação editorial.", 403);
  }

  return {
    actorUserId,
    brandId: input.brandId,
    module: input.module.trim(),
    action: input.action.trim(),
    permissions: [`${input.module.trim()}:${input.action.trim()}`],
    authorizationSource: "canonical_actor_rpc",
    supabase,
  };
}
