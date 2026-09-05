import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDataForSeoSerpConfig,
  DataForSeoSerpError,
  type DataForSeoSerpConfig,
  type DataForSeoSerpCredentials,
} from "../minerador/dataforseo-serp-core";
import {
  createIntegrationRuntimeRepository,
  resolveIntegrationResourceForActor,
  resolveIntegrationEnvironment,
  type IntegrationEnvironment,
  type IntegrationResolvedResource,
  type IntegrationRuntimeDependencies,
} from "./integrations-runtime";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "./canonical-authorization";
import { createIntegrationSecretStore, IntegrationSecretStoreError, type IntegrationSecretStore } from "./integration-secret-store";

type CanonicalClient = Pick<SupabaseClient, "from" | "rpc">;

export const DATAFORSEO_ALLINTITLE_CAPABILITY_KEY = "dataforseo.allintitle" as const;
export const DATAFORSEO_SERP_COMPATIBILITY_CAPABILITY_KEY = "dataforseo.serp_compatibility" as const;

export type DataForSeoCanonicalErrorCode =
  | "DATAFORSEO_PROVIDER_MISMATCH"
  | "DATAFORSEO_CONNECTION_NOT_FOUND"
  | "DATAFORSEO_SECRET_NOT_FOUND"
  | "DATAFORSEO_SECRET_INVALID"
  | "DATAFORSEO_SECRET_STORE_UNAVAILABLE";

export class DataForSeoCanonicalError extends Error {
  readonly status: 409 | 503;
  readonly code: DataForSeoCanonicalErrorCode;

  constructor(code: DataForSeoCanonicalErrorCode, message: string, status: 409 | 503 = 503) {
    super(message);
    this.name = "DataForSeoCanonicalError";
    this.code = code;
    this.status = status;
  }
}

export type DataForSeoCanonicalResolution = {
  resource: IntegrationResolvedResource;
  config: DataForSeoSerpConfig;
  environment: IntegrationEnvironment;
  credentialSource: "connection";
};

type DataForSeoCanonicalOperation = "allintitle" | "serp_compatibility";

function parseSecretPayload(payload: string): DataForSeoSerpCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_INVALID", "A credencial DataForSEO da Connection possui formato inválido.", 409);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_INVALID", "A credencial DataForSEO da Connection possui formato inválido.", 409);
  }
  const record = parsed as Record<string, unknown>;
  const allowedFields = new Set(["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
  if (Object.keys(record).some((field) => !allowedFields.has(field))) {
    throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_INVALID", "A credencial DataForSEO da Connection possui campos não permitidos.", 409);
  }
  const login = typeof record.DATAFORSEO_LOGIN === "string" ? record.DATAFORSEO_LOGIN.trim() : "";
  const password = typeof record.DATAFORSEO_PASSWORD === "string" ? record.DATAFORSEO_PASSWORD.trim() : "";
  if (!login || !password) {
    throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_INVALID", "A credencial DataForSEO da Connection está incompleta.", 409);
  }
  return { login, password };
}

export function resolveDataForSeoIntegrationEnvironment(environment = process.env): IntegrationEnvironment {
  const configured = environment.DATAFORSEO_INTEGRATION_ENVIRONMENT?.trim().toLowerCase();
  if (configured === "development" || configured === "test" || configured === "staging" || configured === "production") return configured;
  return resolveIntegrationEnvironment(environment);
}

async function resolveDataForSeoCanonicalOperationConfig(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
}, operation: DataForSeoCanonicalOperation, capabilityKey: typeof DATAFORSEO_ALLINTITLE_CAPABILITY_KEY | typeof DATAFORSEO_SERP_COMPATIBILITY_CAPABILITY_KEY): Promise<DataForSeoCanonicalResolution> {
  const client = input.client || createCanonicalServiceClient();
  const technicalEnvironment = input.technicalEnvironment || process.env;
  const environment = input.environment || resolveDataForSeoIntegrationEnvironment(technicalEnvironment);
  const dependencies = input.runtimeDependencies || {
    repository: createIntegrationRuntimeRepository(client),
    authorizationRepository: createCanonicalAuthorizationRepository(client),
  };
  const resource = await resolveIntegrationResourceForActor({
    actorUserId: input.actorUserId,
    agencyId: input.agencyId || null,
    brandId: input.brandId,
    capabilityKey,
    operation,
    environment,
    quotaUnits: input.quotaUnits,
  }, dependencies);

  if (resource.connection.providerKey !== "dataforseo") {
    throw new DataForSeoCanonicalError("DATAFORSEO_PROVIDER_MISMATCH", "O binding DataForSEO aponta para um provider diferente.", 409);
  }

  const connectionResult = await client.from("integration_connections")
    .select("id,provider_id,secret_ref")
    .eq("id", resource.connection.connectionId)
    .maybeSingle();
  if (connectionResult.error) throw new DataForSeoCanonicalError("DATAFORSEO_CONNECTION_NOT_FOUND", "Não foi possível ler a Connection DataForSEO.");
  const connection = connectionResult.data as { id?: string; provider_id?: string; secret_ref?: string | null } | null;
  if (!connection?.id || !connection.secret_ref?.trim()) {
    throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_NOT_FOUND", "A Connection DataForSEO não possui uma credencial resolvível.", 409);
  }

  const store = input.secretStore || createIntegrationSecretStore(client);
  let payload: string | null;
  try {
    payload = await store.resolve(connection.secret_ref);
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError) throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_STORE_UNAVAILABLE", "O secret store DataForSEO não está disponível.");
    throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_STORE_UNAVAILABLE", "O secret store DataForSEO não está disponível.");
  }
  if (!payload) throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_NOT_FOUND", "A credencial da Connection DataForSEO não foi encontrada.", 409);

  const credentials = parseSecretPayload(payload);
  let config: DataForSeoSerpConfig;
  try {
    config = buildDataForSeoSerpConfig(credentials, technicalEnvironment);
  } catch (error) {
    if (error instanceof DataForSeoSerpError) throw error;
    throw new DataForSeoCanonicalError("DATAFORSEO_SECRET_INVALID", "A credencial DataForSEO da Connection é inválida.", 409);
  }
  return { resource, config, environment, credentialSource: "connection" };
}

export async function resolveDataForSeoCanonicalConfig(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
}): Promise<DataForSeoCanonicalResolution> {
  return resolveDataForSeoCanonicalOperationConfig(input, "allintitle", DATAFORSEO_ALLINTITLE_CAPABILITY_KEY);
}

/** Resolves the governed SERP capability; it does not perform allintitle. */
export async function resolveDataForSeoCanonicalSerpCompatibilityConfig(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
}): Promise<DataForSeoCanonicalResolution> {
  return resolveDataForSeoCanonicalOperationConfig(input, "serp_compatibility", DATAFORSEO_SERP_COMPATIBILITY_CAPABILITY_KEY);
}
