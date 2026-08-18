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
import { readOpenRouterModel } from "@/lib/openrouter-model-config";

type CanonicalClient = Pick<SupabaseClient, "from" | "rpc">;

export const MINERADOR_AI_CAPABILITY_KEY = "ai_generation" as const;

export type OpenRouterCanonicalErrorCode =
  | "OPENROUTER_PROVIDER_MISMATCH"
  | "OPENROUTER_CONNECTION_NOT_FOUND"
  | "OPENROUTER_SECRET_NOT_FOUND"
  | "OPENROUTER_SECRET_INVALID"
  | "OPENROUTER_SECRET_STORE_UNAVAILABLE"
  | "OPENROUTER_MODEL_NOT_CONFIGURED";

export class OpenRouterCanonicalError extends Error {
  readonly status: 409 | 503;
  readonly code: OpenRouterCanonicalErrorCode;

  constructor(code: OpenRouterCanonicalErrorCode, message: string, status: 409 | 503 = 503) {
    super(message);
    this.name = "OpenRouterCanonicalError";
    this.status = status;
    this.code = code;
  }
}

export type OpenRouterCanonicalResolution = {
  resource: IntegrationResolvedResource;
  apiKey: string;
  apiUrl: "https://openrouter.ai/api/v1/chat/completions";
  model: string;
  extraHeaders: Record<string, string>;
  environment: IntegrationEnvironment;
  credentialSource: "connection";
};

function parseSecretPayload(payload: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new OpenRouterCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection possui formato inválido.", 409);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OpenRouterCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection possui formato inválido.", 409);
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((field) => field !== "OPENROUTER_API_KEY")) {
    throw new OpenRouterCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection contém campos não permitidos.", 409);
  }
  const apiKey = typeof record.OPENROUTER_API_KEY === "string" ? record.OPENROUTER_API_KEY.trim() : "";
  if (!apiKey) throw new OpenRouterCanonicalError("OPENROUTER_SECRET_INVALID", "A credencial OpenRouter da Connection está incompleta.", 409);
  return apiKey;
}

export function resolveOpenRouterIntegrationEnvironment(environment: NodeJS.ProcessEnv = process.env): IntegrationEnvironment {
  const configured = environment.OPENROUTER_INTEGRATION_ENVIRONMENT?.trim().toLowerCase();
  if (configured === "development" || configured === "test" || configured === "staging" || configured === "production") return configured;
  return resolveIntegrationEnvironment(environment);
}

export async function resolveOpenRouterCanonicalConfig(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
}): Promise<OpenRouterCanonicalResolution> {
  const client = input.client || createCanonicalServiceClient();
  const technicalEnvironment = input.technicalEnvironment || process.env;
  const environment = input.environment || resolveOpenRouterIntegrationEnvironment(technicalEnvironment);
  const dependencies = input.runtimeDependencies || {
    repository: createIntegrationRuntimeRepository(client),
    authorizationRepository: createCanonicalAuthorizationRepository(client),
  };
  const resource = await resolveIntegrationResourceForActor({
    actorUserId: input.actorUserId,
    agencyId: input.agencyId || null,
    brandId: input.brandId,
    capabilityKey: MINERADOR_AI_CAPABILITY_KEY,
    operation: "ai_generation",
    environment,
    quotaUnits: input.quotaUnits,
  }, dependencies);

  if (resource.connection.providerKey !== "openrouter") {
    throw new OpenRouterCanonicalError("OPENROUTER_PROVIDER_MISMATCH", "O binding de IA aponta para um provider diferente de OpenRouter.", 409);
  }

  const connectionResult = await client.from("integration_connections")
    .select("id,secret_ref,metadata")
    .eq("id", resource.connection.connectionId)
    .maybeSingle();
  if (connectionResult.error) throw new OpenRouterCanonicalError("OPENROUTER_CONNECTION_NOT_FOUND", "Não foi possível consultar a Connection OpenRouter.");
  const connection = connectionResult.data as { id?: string; secret_ref?: string | null; metadata?: unknown } | null;
  if (!connection || connection.id !== resource.connection.connectionId || !connection.secret_ref?.trim()) {
    throw new OpenRouterCanonicalError("OPENROUTER_CONNECTION_NOT_FOUND", "A Connection OpenRouter resolvida não está disponível.", 409);
  }

  const secretStore = input.secretStore || createIntegrationSecretStore(client);
  let payload: string | null;
  try {
    payload = await secretStore.resolve(connection.secret_ref);
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError) throw new OpenRouterCanonicalError("OPENROUTER_SECRET_STORE_UNAVAILABLE", "O secret store compartilhado não está disponível.");
    throw error;
  }
  if (!payload) throw new OpenRouterCanonicalError("OPENROUTER_SECRET_NOT_FOUND", "A credencial OpenRouter da Connection não foi encontrada.");

  const apiKey = parseSecretPayload(payload);
  const model = readOpenRouterModel(connection.metadata);
  if (!model) throw new OpenRouterCanonicalError("OPENROUTER_MODEL_NOT_CONFIGURED", "O modelo OpenRouter ainda não foi configurado no metadata operacional da Connection.", 409);
  const appUrl = technicalEnvironment.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return {
    resource,
    apiKey,
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    model,
    extraHeaders: { "HTTP-Referer": appUrl, "X-Title": "Minerador Key" },
    environment,
    credentialSource: "connection",
  };
}
