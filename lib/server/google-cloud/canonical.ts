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
import {
  GOOGLE_CLOUD_PROVIDER_KEY,
  YOUTUBE_DATA_API_KEY_SECRET_FIELD,
  YOUTUBE_DATA_PROVIDER_KEY,
  GoogleCloudMediaError,
  parseGoogleCloudServiceAccountSecret,
  parseYouTubeDataApiKeySecret,
  readGoogleCloudMediaBucketName,
  type GoogleCloudServiceAccountCredentials,
} from "./contracts";

type CanonicalClient = Pick<SupabaseClient, "from" | "rpc">;

export const GOOGLE_CLOUD_SPEECH_CAPABILITY_KEY = "google_cloud.speech_transcription" as const;
export const GOOGLE_CLOUD_STORAGE_CAPABILITY_KEY = "google_cloud.storage_media" as const;
export const YOUTUBE_VIDEO_METADATA_CAPABILITY_KEY = "youtube.video_metadata" as const;

export type GoogleCloudMediaOperation = "speech_transcription" | "storage_media" | "youtube_video_metadata";

export type GoogleCloudMediaResolution = {
  resource: IntegrationResolvedResource;
  environment: IntegrationEnvironment;
  providerKey: typeof GOOGLE_CLOUD_PROVIDER_KEY | typeof YOUTUBE_DATA_PROVIDER_KEY;
  credentials?: GoogleCloudServiceAccountCredentials;
  youtubeApiKey?: string;
  bucketName: string | null;
  credentialSource: "connection";
};

export class GoogleCloudCanonicalError extends Error {
  public readonly status: 409 | 503;
  public readonly code: "GOOGLE_CLOUD_PROVIDER_MISMATCH" | "GOOGLE_CLOUD_CONNECTION_NOT_FOUND" | "GOOGLE_CLOUD_SECRET_NOT_FOUND" | "GOOGLE_CLOUD_SECRET_STORE_UNAVAILABLE" | "GOOGLE_CLOUD_SECRET_INVALID" | "YOUTUBE_SECRET_INVALID";

  constructor(code: GoogleCloudCanonicalError["code"], message: string, status: 409 | 503 = 503) {
    super(message);
    this.name = "GoogleCloudCanonicalError";
    this.code = code;
    this.status = status;
  }
}

function operationInput(operation: GoogleCloudMediaOperation) {
  if (operation === "speech_transcription") return { capabilityKey: GOOGLE_CLOUD_SPEECH_CAPABILITY_KEY, operation: "speech_transcription" as const, providerKey: GOOGLE_CLOUD_PROVIDER_KEY };
  if (operation === "storage_media") return { capabilityKey: GOOGLE_CLOUD_STORAGE_CAPABILITY_KEY, operation: "storage_media" as const, providerKey: GOOGLE_CLOUD_PROVIDER_KEY };
  return { capabilityKey: YOUTUBE_VIDEO_METADATA_CAPABILITY_KEY, operation: "youtube_video_metadata" as const, providerKey: YOUTUBE_DATA_PROVIDER_KEY };
}

async function resolveOperation(input: {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  operation: GoogleCloudMediaOperation;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
}): Promise<GoogleCloudMediaResolution> {
  const client = input.client || createCanonicalServiceClient();
  const technicalEnvironment = input.technicalEnvironment || process.env;
  const environment = input.environment || resolveIntegrationEnvironment(technicalEnvironment);
  const selected = operationInput(input.operation);
  const dependencies = input.runtimeDependencies || {
    repository: createIntegrationRuntimeRepository(client),
    authorizationRepository: createCanonicalAuthorizationRepository(client),
  };
  const resource = await resolveIntegrationResourceForActor({
    actorUserId: input.actorUserId,
    agencyId: input.agencyId || null,
    brandId: input.brandId,
    capabilityKey: selected.capabilityKey,
    operation: selected.operation,
    environment,
    quotaUnits: input.quotaUnits,
  }, dependencies);

  if (resource.connection.providerKey !== selected.providerKey) {
    throw new GoogleCloudCanonicalError("GOOGLE_CLOUD_PROVIDER_MISMATCH", "O binding da mídia aponta para um provider diferente.", 409);
  }
  const connectionResult = await client.from("integration_connections")
    .select("id,provider_id,secret_ref,metadata")
    .eq("id", resource.connection.connectionId)
    .maybeSingle();
  if (connectionResult.error) throw new GoogleCloudCanonicalError("GOOGLE_CLOUD_CONNECTION_NOT_FOUND", "Não foi possível ler a Connection de mídia.");
  const connection = connectionResult.data as { id?: string; provider_id?: string; secret_ref?: string | null; metadata?: unknown } | null;
  if (!connection?.id || !connection.secret_ref?.trim()) throw new GoogleCloudCanonicalError("GOOGLE_CLOUD_SECRET_NOT_FOUND", "A Connection de mídia não possui uma credencial resolvível.", 409);

  const store = input.secretStore || createIntegrationSecretStore(client);
  let payload: string | null;
  try {
    payload = await store.resolve(connection.secret_ref);
  } catch (error) {
    if (error instanceof IntegrationSecretStoreError) throw new GoogleCloudCanonicalError("GOOGLE_CLOUD_SECRET_STORE_UNAVAILABLE", "O Secret Store de mídia não está disponível.");
    throw new GoogleCloudCanonicalError("GOOGLE_CLOUD_SECRET_STORE_UNAVAILABLE", "O Secret Store de mídia não está disponível.");
  }
  if (!payload) throw new GoogleCloudCanonicalError("GOOGLE_CLOUD_SECRET_NOT_FOUND", "A credencial da Connection de mídia não foi encontrada.", 409);

  try {
    if (selected.providerKey === GOOGLE_CLOUD_PROVIDER_KEY) {
      return {
        resource,
        environment,
        providerKey: selected.providerKey,
        credentials: parseGoogleCloudServiceAccountSecret(payload),
        bucketName: readGoogleCloudMediaBucketName(connection.metadata),
        credentialSource: "connection",
      };
    }
    return {
      resource,
      environment,
      providerKey: selected.providerKey,
      youtubeApiKey: parseYouTubeDataApiKeySecret(payload),
      bucketName: null,
      credentialSource: "connection",
    };
  } catch (error) {
    if (error instanceof GoogleCloudMediaError) {
      const code = error.code === "YOUTUBE_SECRET_INVALID" ? "YOUTUBE_SECRET_INVALID" : "GOOGLE_CLOUD_SECRET_INVALID";
      throw new GoogleCloudCanonicalError(code, "A credencial da Connection de mídia é inválida.", 409);
    }
    throw error;
  }
}

export function resolveGoogleCloudSpeech(input: Omit<Parameters<typeof resolveOperation>[0], "operation">) {
  return resolveOperation({ ...input, operation: "speech_transcription" });
}

export function resolveGoogleCloudStorage(input: Omit<Parameters<typeof resolveOperation>[0], "operation">) {
  return resolveOperation({ ...input, operation: "storage_media" });
}

export function resolveYouTubeVideoMetadata(input: Omit<Parameters<typeof resolveOperation>[0], "operation">) {
  return resolveOperation({ ...input, operation: "youtube_video_metadata" });
}

export const YOUTUBE_SECRET_FIELD = YOUTUBE_DATA_API_KEY_SECRET_FIELD;
