import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createIntegrationRuntimeRepository,
  resolveIntegrationEnvironment,
  resolveIntegrationResourceForActor,
  type IntegrationEnvironment,
  type IntegrationResolvedResource,
  type IntegrationRuntimeDependencies,
} from "@/lib/server/integrations-runtime";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationSecretStore, IntegrationSecretStoreError, type IntegrationSecretStore } from "@/lib/server/integration-secret-store";
import { DEEPSEEK_ALLOWED_MODELS, DEEPSEEK_API_URL, DEEPSEEK_BASE_URL, DEEPSEEK_DEFAULT_MODEL, type DeepSeekModel } from "@/lib/deepseek-model-config";

type CanonicalClient = Pick<SupabaseClient, "from" | "rpc">;

export const DEEPSEEK_AI_CAPABILITY_KEY = "ai_generation" as const;

export { DEEPSEEK_ALLOWED_MODELS, DEEPSEEK_API_URL, DEEPSEEK_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from "@/lib/deepseek-model-config";
export type DeepSeekThinkingMode = "enabled" | "disabled" | "provider_default";

export type DeepSeekCanonicalErrorCode =
  | "DEEPSEEK_PROVIDER_MISMATCH"
  | "DEEPSEEK_CONNECTION_NOT_FOUND"
  | "DEEPSEEK_CAPABILITY_NOT_AUTHORIZED"
  | "DEEPSEEK_SECRET_NOT_FOUND"
  | "DEEPSEEK_SECRET_INVALID"
  | "DEEPSEEK_SECRET_STORE_UNAVAILABLE"
  | "DEEPSEEK_MODEL_NOT_ALLOWED";

export class DeepSeekCanonicalError extends Error {
  readonly status: 409 | 503;
  readonly code: DeepSeekCanonicalErrorCode;

  constructor(code: DeepSeekCanonicalErrorCode, message: string, status: 409 | 503 = 503) {
    super(message);
    this.name = "DeepSeekCanonicalError";
    this.status = status;
    this.code = code;
  }
}

export type DeepSeekCanonicalResolution = {
  provider: "deepseek";
  resource: IntegrationResolvedResource;
  apiKey: string;
  baseUrl: typeof DEEPSEEK_BASE_URL;
  apiUrl: typeof DEEPSEEK_API_URL;
  model: DeepSeekModel;
  responseFormatMode: "json_object";
  jsonObjectCapability: "supported";
  structuredOutputCapability: "unsupported";
  thinkingMode: DeepSeekThinkingMode;
  extraHeaders: Record<string, string>;
  environment: IntegrationEnvironment;
  credentialSource: "connection";
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function operationMetadata(metadata: Record<string, unknown>, capabilityKey: string) {
  const containers = [metadata.operations, metadata.capabilities, metadata.deepseek_operations];
  for (const container of containers) {
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
    const candidate = (container as Record<string, unknown>)[capabilityKey];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate as Record<string, unknown>;
  }
  return null;
}

export function readDeepSeekModel(metadata: unknown): DeepSeekModel {
  const record = metadataRecord(metadata);
  const nested = record.deepseek && typeof record.deepseek === "object" && !Array.isArray(record.deepseek)
    ? record.deepseek as Record<string, unknown>
    : {};
  const raw = nested.model ?? record.deepseek_model ?? record.model ?? DEEPSEEK_DEFAULT_MODEL;
  if (typeof raw !== "string" || !DEEPSEEK_ALLOWED_MODELS.includes(raw.trim() as DeepSeekModel)) {
    throw new DeepSeekCanonicalError("DEEPSEEK_MODEL_NOT_ALLOWED", "A Connection DeepSeek não possui um modelo permitido para esta operação.", 409);
  }
  return raw.trim() as DeepSeekModel;
}

export function readDeepSeekThinkingMode(metadata: unknown, capabilityKey = DEEPSEEK_AI_CAPABILITY_KEY): DeepSeekThinkingMode {
  const record = metadataRecord(metadata);
  const nested = record.deepseek && typeof record.deepseek === "object" && !Array.isArray(record.deepseek)
    ? record.deepseek as Record<string, unknown>
    : {};
  const operation = operationMetadata(record, capabilityKey);
  const raw = operation?.thinking_mode
    ?? operation?.thinkingMode
    ?? nested.thinking_mode
    ?? nested.thinkingMode
    ?? record.deepseek_thinking_mode
    ?? record.thinking_mode;
  if (raw === "enabled" || raw === true) return "enabled";
  if (raw === "disabled" || raw === false) return "disabled";
  return "provider_default";
}

function parseSecretPayload(payload: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new DeepSeekCanonicalError("DEEPSEEK_SECRET_INVALID", "A credencial DeepSeek da Connection possui formato inválido.", 409);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DeepSeekCanonicalError("DEEPSEEK_SECRET_INVALID", "A credencial DeepSeek da Connection possui formato inválido.", 409);
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((field) => field !== "DEEPSEEK_API_KEY")) {
    throw new DeepSeekCanonicalError("DEEPSEEK_SECRET_INVALID", "A credencial DeepSeek da Connection contém campos não permitidos.", 409);
  }
  const apiKey = typeof record.DEEPSEEK_API_KEY === "string" ? record.DEEPSEEK_API_KEY.trim() : "";
  if (!apiKey) throw new DeepSeekCanonicalError("DEEPSEEK_SECRET_INVALID", "A credencial DeepSeek da Connection está incompleta.", 409);
  return apiKey;
}

export function resolveDeepSeekIntegrationEnvironment(environment: NodeJS.ProcessEnv = process.env): IntegrationEnvironment {
  const configured = environment.DEEPSEEK_INTEGRATION_ENVIRONMENT?.trim().toLowerCase();
  if (configured === "development" || configured === "test" || configured === "staging" || configured === "production") return configured;
  return resolveIntegrationEnvironment(environment);
}

export async function resolveDeepSeekCanonicalConfig(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
}): Promise<DeepSeekCanonicalResolution> {
  const client = input.client || createCanonicalServiceClient();
  const technicalEnvironment = input.technicalEnvironment || process.env;
  const environment = input.environment || resolveDeepSeekIntegrationEnvironment(technicalEnvironment);
  const dependencies = input.runtimeDependencies || {
    repository: createIntegrationRuntimeRepository(client),
    authorizationRepository: createCanonicalAuthorizationRepository(client),
  };
  const resource = await resolveIntegrationResourceForActor({
    actorUserId: input.actorUserId,
    agencyId: input.agencyId || null,
    brandId: input.brandId,
    capabilityKey: DEEPSEEK_AI_CAPABILITY_KEY,
    operation: "ai_generation",
    environment,
    quotaUnits: input.quotaUnits,
  }, dependencies);

  if (resource.connection.providerKey !== "deepseek") {
    throw new DeepSeekCanonicalError("DEEPSEEK_PROVIDER_MISMATCH", "A operação de IA não possui uma Connection DeepSeek válida.", 409);
  }

  const capability = await dependencies.repository.findCapability({
    capabilityKey: DEEPSEEK_AI_CAPABILITY_KEY,
    operation: "ai_generation",
    environment,
  });
  if (!capability || capability.status !== "active") {
    throw new DeepSeekCanonicalError("DEEPSEEK_CAPABILITY_NOT_AUTHORIZED", "A capability de IA DeepSeek não está ativa no catálogo.", 409);
  }

  const connectionResult = await client.from("integration_connections")
    .select("id,secret_ref,metadata")
    .eq("id", resource.connection.connectionId)
    .maybeSingle();
  if (connectionResult.error) throw new DeepSeekCanonicalError("DEEPSEEK_CONNECTION_NOT_FOUND", "Não foi possível consultar a Connection DeepSeek.");
  const connection = connectionResult.data as { id?: string; secret_ref?: string | null; metadata?: unknown } | null;
  if (!connection || connection.id !== resource.connection.connectionId || !connection.secret_ref?.trim()) {
    throw new DeepSeekCanonicalError("DEEPSEEK_CONNECTION_NOT_FOUND", "A Connection DeepSeek resolvida não está disponível.", 409);
  }

  const secretStore = input.secretStore || createIntegrationSecretStore(client);
  let payload: string | null;
  try {
    payload = await secretStore.resolve(connection.secret_ref);
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError) throw new DeepSeekCanonicalError("DEEPSEEK_SECRET_STORE_UNAVAILABLE", "O secret store compartilhado não está disponível.");
    throw error;
  }
  if (!payload) throw new DeepSeekCanonicalError("DEEPSEEK_SECRET_NOT_FOUND", "A credencial DeepSeek da Connection não foi encontrada.");

  return {
    provider: "deepseek",
    resource,
    apiKey: parseSecretPayload(payload),
    baseUrl: DEEPSEEK_BASE_URL,
    apiUrl: DEEPSEEK_API_URL,
    model: readDeepSeekModel(connection.metadata),
    responseFormatMode: "json_object",
    jsonObjectCapability: "supported",
    structuredOutputCapability: "unsupported",
    thinkingMode: readDeepSeekThinkingMode(connection.metadata),
    extraHeaders: {},
    environment,
    credentialSource: "connection",
  };
}
