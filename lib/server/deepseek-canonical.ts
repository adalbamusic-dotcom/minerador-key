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
import {
  OPENROUTER_API_URL,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
  isOpenRouterBatchVariant,
  isOpenRouterKnownModel,
  isOpenRouterModelSlug,
} from "@/lib/openrouter-model-config";

/*
 * RESOLVEDOR CANÔNICO DA IA DA PLATAFORMA.
 *
 * O nome ficou "DeepSeek" porque todas as rotas de IA já chamam
 * `resolveDeepSeekCanonicalConfig`. Desde 2026-10-11 ele segue a Connection que
 * o runtime resolver para a capability `ai_generation`, e o runtime aponta para
 * a OpenRouter. O ramo DeepSeek continua aqui só para rollback de uma linha no
 * runtime; nenhuma operação nova cai nele.
 *
 * `resolveAICanonicalConfig` é o mesmo resolvedor com o nome neutro.
 */

type CanonicalClient = Pick<SupabaseClient, "from" | "rpc">;
/** Só as variáveis lidas aqui; aceita `process.env` e objetos de teste. */
type EnvironmentReader = Readonly<Record<string, string | undefined>>;

export const DEEPSEEK_AI_CAPABILITY_KEY = "ai_generation" as const;
export const AI_CAPABILITY_KEY = DEEPSEEK_AI_CAPABILITY_KEY;

export { DEEPSEEK_ALLOWED_MODELS, DEEPSEEK_API_URL, DEEPSEEK_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from "@/lib/deepseek-model-config";
export { OPENROUTER_API_URL, OPENROUTER_BASE_URL, OPENROUTER_DEFAULT_MODEL } from "@/lib/openrouter-model-config";
export type DeepSeekThinkingMode = "enabled" | "disabled" | "provider_default";

export type AICanonicalProvider = "deepseek" | "openrouter";

export type DeepSeekCanonicalErrorCode =
  | "DEEPSEEK_PROVIDER_MISMATCH"
  | "DEEPSEEK_CONNECTION_NOT_FOUND"
  | "DEEPSEEK_CAPABILITY_NOT_AUTHORIZED"
  | "DEEPSEEK_SECRET_NOT_FOUND"
  | "DEEPSEEK_SECRET_INVALID"
  | "DEEPSEEK_SECRET_STORE_UNAVAILABLE"
  | "DEEPSEEK_MODEL_NOT_ALLOWED"
  | "OPENROUTER_SECRET_NOT_FOUND"
  | "OPENROUTER_SECRET_INVALID"
  | "OPENROUTER_SECRET_STORE_UNAVAILABLE"
  | "OPENROUTER_MODEL_NOT_ALLOWED";

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

export const AICanonicalError = DeepSeekCanonicalError;

export type DeepSeekCanonicalResolution = {
  provider: AICanonicalProvider;
  resource: IntegrationResolvedResource;
  apiKey: string;
  baseUrl: string;
  apiUrl: string;
  model: string;
  /** De onde veio o modelo: env do servidor, metadata da Connection ou padrão do código. */
  modelSource: "environment" | "connection" | "default";
  responseFormatMode: "json_object";
  jsonObjectCapability: "supported";
  structuredOutputCapability: "unsupported";
  thinkingMode: DeepSeekThinkingMode;
  extraHeaders: Record<string, string>;
  environment: IntegrationEnvironment;
  /** "environment" = chave lida de OPENROUTER_API_KEY; "connection" = chave do Secret Store. */
  credentialSource: "connection" | "environment";
};

export type AICanonicalResolution = DeepSeekCanonicalResolution;

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

/**
 * Modelo da OpenRouter, nesta ordem: `OPENROUTER_MODEL` → metadata da
 * Connection (só modelos conhecidos) → padrão do código.
 *
 * A metadata da Connection remota ainda carrega o modelo DeepSeek de 2026-08
 * (`deepseek/deepseek-v4-pro-0813`). Por isso ela só vale quando aponta para um
 * modelo da lista conhecida; qualquer outro valor é ignorado e cai no padrão.
 */
export function readOpenRouterModel(metadata: unknown, environment: EnvironmentReader = process.env): { model: string; modelSource: DeepSeekCanonicalResolution["modelSource"] } {
  const fromEnv = environment.OPENROUTER_MODEL?.trim();
  if (fromEnv) {
    if (!isOpenRouterModelSlug(fromEnv)) {
      throw new DeepSeekCanonicalError("OPENROUTER_MODEL_NOT_ALLOWED", "OPENROUTER_MODEL não é um identificador de modelo válido da OpenRouter.", 409);
    }
    // A OpenRouter devolve 404 para `:batch` em chat/completions. Recusar aqui
    // troca um "erro HTTP 404" mudo por uma instrução que o operador entende.
    if (isOpenRouterBatchVariant(fromEnv)) {
      throw new DeepSeekCanonicalError("OPENROUTER_MODEL_NOT_ALLOWED", `OPENROUTER_MODEL usa a variante :batch (${fromEnv}), que a OpenRouter não aceita no endpoint de chat. Use o mesmo ID sem :batch.`, 409);
    }
    return { model: fromEnv, modelSource: "environment" };
  }
  const record = metadataRecord(metadata);
  const nested = metadataRecord(record.openrouter);
  const raw = nested.model ?? record.openrouter_model;
  if (isOpenRouterKnownModel(raw)) return { model: raw.trim(), modelSource: "connection" };
  return { model: OPENROUTER_DEFAULT_MODEL, modelSource: "default" };
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

function parseOpenRouterSecretPayload(payload: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new DeepSeekCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection possui formato inválido.", 409);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DeepSeekCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection possui formato inválido.", 409);
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((field) => field !== "OPENROUTER_API_KEY")) {
    throw new DeepSeekCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection contém campos não permitidos.", 409);
  }
  const apiKey = typeof record.OPENROUTER_API_KEY === "string" ? record.OPENROUTER_API_KEY.trim() : "";
  if (!apiKey) throw new DeepSeekCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection está incompleta.", 409);
  return apiKey;
}

/** Cabeçalhos de atribuição recomendados pela OpenRouter. Nenhum carrega segredo. */
export function openRouterAttributionHeaders(environment: EnvironmentReader = process.env): Record<string, string> {
  const headers: Record<string, string> = { "X-Title": "Minerador Key" };
  const candidates = [environment.APP_BASE_URL, environment.NEXT_PUBLIC_APP_URL, environment.MCP_PUBLIC_BASE_URL];
  for (const candidate of candidates) {
    const raw = candidate?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        headers["HTTP-Referer"] = url.origin;
        break;
      }
    } catch {
      continue;
    }
  }
  return headers;
}

export function resolveDeepSeekIntegrationEnvironment(environment: NodeJS.ProcessEnv = process.env): IntegrationEnvironment {
  const configured = environment.DEEPSEEK_INTEGRATION_ENVIRONMENT?.trim().toLowerCase();
  if (configured === "development" || configured === "test" || configured === "staging" || configured === "production") return configured;
  return resolveIntegrationEnvironment(environment);
}

async function readConnectionSecret(input: {
  client: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  secretRef: string;
  provider: AICanonicalProvider;
}) {
  const secretStore = input.secretStore || createIntegrationSecretStore(input.client);
  let payload: string | null;
  try {
    payload = await secretStore.resolve(input.secretRef);
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError) {
      throw new DeepSeekCanonicalError(input.provider === "openrouter" ? "OPENROUTER_SECRET_STORE_UNAVAILABLE" : "DEEPSEEK_SECRET_STORE_UNAVAILABLE", "O secret store compartilhado não está disponível.");
    }
    throw error;
  }
  if (!payload) {
    throw input.provider === "openrouter"
      ? new DeepSeekCanonicalError("OPENROUTER_SECRET_NOT_FOUND", "A credencial OpenRouter não foi encontrada: configure OPENROUTER_API_KEY no servidor ou salve a chave na Connection.")
      : new DeepSeekCanonicalError("DEEPSEEK_SECRET_NOT_FOUND", "A credencial DeepSeek da Connection não foi encontrada.");
  }
  return payload;
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

  const provider = resource.connection.providerKey;
  if (provider !== "openrouter" && provider !== "deepseek") {
    throw new DeepSeekCanonicalError("DEEPSEEK_PROVIDER_MISMATCH", "A operação de IA não possui uma Connection de IA válida.", 409);
  }
  const label = provider === "openrouter" ? "OpenRouter" : "DeepSeek";

  const capability = await dependencies.repository.findCapability({
    capabilityKey: DEEPSEEK_AI_CAPABILITY_KEY,
    operation: "ai_generation",
    environment,
  });
  if (!capability || capability.status !== "active") {
    throw new DeepSeekCanonicalError("DEEPSEEK_CAPABILITY_NOT_AUTHORIZED", "A capability de IA não está ativa no catálogo.", 409);
  }

  const connectionResult = await client.from("integration_connections")
    .select("id,secret_ref,metadata")
    .eq("id", resource.connection.connectionId)
    .maybeSingle();
  if (connectionResult.error) throw new DeepSeekCanonicalError("DEEPSEEK_CONNECTION_NOT_FOUND", `Não foi possível consultar a Connection ${label}.`);
  const connection = connectionResult.data as { id?: string; secret_ref?: string | null; metadata?: unknown } | null;
  if (!connection || connection.id !== resource.connection.connectionId || !connection.secret_ref?.trim()) {
    throw new DeepSeekCanonicalError("DEEPSEEK_CONNECTION_NOT_FOUND", `A Connection ${label} resolvida não está disponível.`, 409);
  }

  if (provider === "openrouter") {
    // A Connection continua sendo a âncora de autorização e do ledger. A chave
    // vem primeiro da env do servidor, que é onde o dono a mantém na Vercel.
    const envKey = technicalEnvironment.OPENROUTER_API_KEY?.trim();
    const apiKey = envKey || parseOpenRouterSecretPayload(await readConnectionSecret({ client, secretStore: input.secretStore, secretRef: connection.secret_ref, provider }));
    const { model, modelSource } = readOpenRouterModel(connection.metadata, technicalEnvironment);
    return {
      provider: "openrouter",
      resource,
      apiKey,
      baseUrl: OPENROUTER_BASE_URL,
      apiUrl: OPENROUTER_API_URL,
      model,
      modelSource,
      responseFormatMode: "json_object",
      jsonObjectCapability: "supported",
      structuredOutputCapability: "unsupported",
      thinkingMode: readDeepSeekThinkingMode(connection.metadata),
      extraHeaders: openRouterAttributionHeaders(technicalEnvironment),
      environment,
      credentialSource: envKey ? "environment" : "connection",
    };
  }

  const payload = await readConnectionSecret({ client, secretStore: input.secretStore, secretRef: connection.secret_ref, provider });
  return {
    provider: "deepseek",
    resource,
    apiKey: parseSecretPayload(payload),
    baseUrl: DEEPSEEK_BASE_URL,
    apiUrl: DEEPSEEK_API_URL,
    model: readDeepSeekModel(connection.metadata),
    modelSource: "connection",
    responseFormatMode: "json_object",
    jsonObjectCapability: "supported",
    structuredOutputCapability: "unsupported",
    thinkingMode: readDeepSeekThinkingMode(connection.metadata),
    extraHeaders: {},
    environment,
    credentialSource: "connection",
  };
}

/** Nome neutro do mesmo resolvedor. */
export const resolveAICanonicalConfig = resolveDeepSeekCanonicalConfig;
