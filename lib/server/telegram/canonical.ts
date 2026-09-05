import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationSecretStore, type IntegrationSecretStore } from "@/lib/server/integration-secret-store";
import { createIntegrationRuntimeRepository, resolveIntegrationEnvironment, resolveIntegrationResourceForActor, type IntegrationEnvironment, type IntegrationRuntimeDependencies } from "@/lib/server/integrations-runtime";
import { parseTelegramSecret, TELEGRAM_CAPABILITY_FILE_FETCH, TELEGRAM_CAPABILITY_MESSAGE_SEND, TELEGRAM_PROVIDER_KEY, type TelegramSecret } from "./contracts";

type TelegramClient = Pick<SupabaseClient, "from" | "rpc">;

export class TelegramCanonicalError extends Error {
  readonly code: string;
  readonly status: 403 | 409 | 503;
  constructor(code: string, message: string, status: 403 | 409 | 503 = 409) {
    super(message);
    this.name = "TelegramCanonicalError";
    this.code = code;
    this.status = status;
  }
}

export type TelegramPlatformSecretResolution = {
  secret: TelegramSecret;
  connectionId: string;
  providerId: string;
  metadata: Record<string, unknown>;
};

function objectMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function resolveTelegramPlatformSecret(input: { client?: TelegramClient; connectionId?: string; secretStore?: IntegrationSecretStore; environment?: IntegrationEnvironment; requireReady?: boolean }): Promise<TelegramPlatformSecretResolution> {
  const client = input.client || createCanonicalServiceClient();
  const environment = input.environment || resolveIntegrationEnvironment();
  const providerResult = await client.from("integration_providers").select("id,provider_key,status").eq("provider_key", TELEGRAM_PROVIDER_KEY).eq("status", "active").maybeSingle();
  if (providerResult.error) throw new TelegramCanonicalError("TELEGRAM_PROVIDER_UNAVAILABLE", "Não foi possível consultar o provider Telegram.", 503);
  if (!providerResult.data) throw new TelegramCanonicalError("TELEGRAM_PROVIDER_MISSING", "O provider Telegram global ainda não foi cadastrado.", 409);

  let connectionQuery = client.from("integration_connections")
    .select("id,provider_id,secret_ref,metadata,lifecycle_status,owner_scope_type,environment")
    .eq("provider_id", providerResult.data.id)
    .eq("owner_scope_type", "platform")
    .eq("environment", environment)
    .neq("lifecycle_status", "revoked");
  if (input.connectionId?.trim()) connectionQuery = connectionQuery.eq("id", input.connectionId.trim());
  const connectionResult = await connectionQuery.order("created_at", { ascending: false });
  if (connectionResult.error) throw new TelegramCanonicalError("TELEGRAM_CONNECTION_UNAVAILABLE", "Não foi possível consultar a Connection global do Telegram.", 503);
  const connections = (connectionResult.data || []).filter((row) => row.lifecycle_status !== "disabled");
  if (connections.length !== 1) throw new TelegramCanonicalError(connections.length ? "TELEGRAM_CONNECTION_AMBIGUOUS" : "TELEGRAM_CONNECTION_MISSING", connections.length ? "Há mais de uma Connection Telegram global elegível." : "A Connection Telegram global ainda não foi configurada.", 409);
  const connection = connections[0];
  if (input.requireReady !== false && (connection.lifecycle_status !== "ready" || !connection.secret_ref?.trim())) throw new TelegramCanonicalError("TELEGRAM_CONNECTION_NOT_READY", "A Connection Telegram global ainda não está READY.", 409);
  if (!connection.secret_ref?.trim()) throw new TelegramCanonicalError("TELEGRAM_SECRET_MISSING", "O segredo Telegram global ainda não foi configurado.", 409);

  const store = input.secretStore || createIntegrationSecretStore(client);
  let payload: string | null;
  try { payload = await store.resolve(connection.secret_ref); } catch { throw new TelegramCanonicalError("TELEGRAM_SECRET_STORE_UNAVAILABLE", "O Secret Store Telegram não está disponível.", 503); }
  if (!payload) throw new TelegramCanonicalError("TELEGRAM_SECRET_MISSING", "O segredo Telegram global não foi encontrado.", 409);
  try {
    return { secret: parseTelegramSecret(payload), connectionId: connection.id, providerId: connection.provider_id, metadata: objectMetadata(connection.metadata) };
  } catch { throw new TelegramCanonicalError("TELEGRAM_SECRET_INVALID", "O segredo Telegram global é inválido.", 409); }
}

export type TelegramActorResolution = TelegramPlatformSecretResolution & {
  resource: Awaited<ReturnType<typeof resolveIntegrationResourceForActor>>;
  environment: IntegrationEnvironment;
};

async function resolveTelegramOperation(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  operation: "message_send" | "file_fetch";
  client?: TelegramClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  quotaUnits?: number;
}): Promise<TelegramActorResolution> {
  const client = input.client || createCanonicalServiceClient();
  const environment = input.environment || resolveIntegrationEnvironment();
  const capabilityKey = input.operation === "message_send" ? TELEGRAM_CAPABILITY_MESSAGE_SEND : TELEGRAM_CAPABILITY_FILE_FETCH;
  const resource = await resolveIntegrationResourceForActor({
    actorUserId: input.actorUserId,
    agencyId: input.agencyId || null,
    brandId: input.brandId,
    capabilityKey,
    operation: input.operation === "message_send" ? "telegram_message_send" : "telegram_file_fetch",
    environment,
    quotaUnits: input.quotaUnits,
  }, input.runtimeDependencies || {
    repository: createIntegrationRuntimeRepository(client),
    authorizationRepository: createCanonicalAuthorizationRepository(client),
  });
  if (resource.connection.providerKey !== TELEGRAM_PROVIDER_KEY) throw new TelegramCanonicalError("TELEGRAM_PROVIDER_MISMATCH", "O binding Telegram aponta para outro provider.", 409);
  const connectionResult = await client.from("integration_connections").select("id,provider_id,secret_ref,metadata").eq("id", resource.connection.connectionId).maybeSingle();
  if (connectionResult.error || !connectionResult.data?.secret_ref) throw new TelegramCanonicalError("TELEGRAM_SECRET_MISSING", "A credencial Telegram não está disponível.", 409);
  const store = input.secretStore || createIntegrationSecretStore(client);
  const payload = await store.resolve(connectionResult.data.secret_ref);
  if (!payload) throw new TelegramCanonicalError("TELEGRAM_SECRET_MISSING", "A credencial Telegram não está disponível.", 409);
  try {
    return { resource, environment, secret: parseTelegramSecret(payload), connectionId: connectionResult.data.id, providerId: connectionResult.data.provider_id, metadata: objectMetadata(connectionResult.data.metadata) };
  } catch { throw new TelegramCanonicalError("TELEGRAM_SECRET_INVALID", "A credencial Telegram é inválida.", 409); }
}

export function resolveTelegramMessageSend(input: Omit<Parameters<typeof resolveTelegramOperation>[0], "operation">) {
  return resolveTelegramOperation({ ...input, operation: "message_send" });
}

export function resolveTelegramFileFetch(input: Omit<Parameters<typeof resolveTelegramOperation>[0], "operation">) {
  return resolveTelegramOperation({ ...input, operation: "file_fetch" });
}
