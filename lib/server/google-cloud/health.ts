import "server-only";

import { loadGoogleCloudSpeechClient, loadGoogleCloudStorageClient } from "./sdk-loaders";
import { fetchYouTubeVideoMetadata } from "./youtube-metadata-operation";
import { GoogleCloudMediaError, parseGoogleCloudServiceAccountSecret, parseYouTubeDataApiKeySecret, readGoogleCloudMediaBucketName } from "./contracts";
import type { StorageClientFactory } from "./storage-operation";

export type GoogleCloudHealthResult = {
  providerRequestRef: string | null;
  details: Record<string, string>;
};

function mapError(error: unknown, fallback: string): never {
  if (error instanceof GoogleCloudMediaError) throw error;
  throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", fallback);
}

function providerErrorRecord(error: unknown) {
  return error && typeof error === "object" ? error as Record<string, unknown> : {};
}

function providerErrorStatus(error: unknown) {
  const record = providerErrorRecord(error);
  const response = providerErrorRecord(record.response);
  const status = record.status ?? record.statusCode ?? response.status ?? response.statusCode ?? (typeof record.code === "number" || (typeof record.code === "string" && /^\d+$/.test(record.code)) ? record.code : null);
  if (typeof status === "number") return status;
  if (typeof status === "string" && /^\d+$/.test(status)) return Number(status);
  return null;
}

function providerErrorCode(error: unknown) {
  const record = providerErrorRecord(error);
  const response = providerErrorRecord(record.response);
  const errors = Array.isArray(record.errors) ? record.errors : [];
  const firstError = providerErrorRecord(errors[0]);
  return [record.code, record.reason, response.code, firstError.reason, firstError.domain]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .join(" ")
    .toUpperCase();
}

function providerErrorMessage(error: unknown) {
  const record = providerErrorRecord(error);
  return typeof record.message === "string" ? record.message.toUpperCase() : "";
}

function mapStorageProviderError(error: unknown): never {
  if (error instanceof GoogleCloudMediaError) {
    if (error.code === "GOOGLE_CLOUD_PROVIDER_FAILED") {
      throw new GoogleCloudMediaError("PROVIDER_ERROR", "O Cloud Storage não confirmou o bucket configurado.");
    }
    throw error;
  }

  const status = providerErrorStatus(error);
  const code = providerErrorCode(error);
  const message = providerErrorMessage(error);
  if (status === 404 || /NOT_FOUND|BUCKET_NOT_FOUND|NO_SUCH_BUCKET/.test(code) || /BUCKET[^\n]*NOT FOUND/.test(message)) {
    throw new GoogleCloudMediaError("BUCKET_NOT_FOUND", "O bucket de mídia não foi encontrado. Verifique o nome configurado no projeto Google Cloud.");
  }
  if (status === 401 || /INVALID_GRANT|INVALID_CREDENTIAL|CREDENTIAL_INVALID|UNAUTHENTICATED/.test(code) || /INVALID GRANT|INVALID CREDENTIAL/.test(message)) {
    throw new GoogleCloudMediaError("CREDENTIAL_INVALID", "A credencial Google Cloud não foi aceita pelo Cloud Storage.");
  }
  if (status === 403 || /ACCESS_DENIED|PERMISSION_DENIED|FORBIDDEN/.test(code) || /ACCESS DENIED|PERMISSION DENIED|FORBIDDEN/.test(message)) {
    throw new GoogleCloudMediaError("BUCKET_ACCESS_DENIED", "A credencial não possui acesso suficiente ao bucket de mídia.");
  }
  if (/SERVICE_DISABLED|API_DISABLED|SERVICE_NOT_ENABLED|SERVICE HAS NOT BEEN ENABLED/.test(code) || /SERVICE DISABLED|API DISABLED|SERVICE HAS NOT BEEN ENABLED/.test(message)) {
    throw new GoogleCloudMediaError("STORAGE_API_DISABLED", "A API do Cloud Storage não está habilitada no projeto Google Cloud.");
  }
  throw new GoogleCloudMediaError("PROVIDER_ERROR", "O Cloud Storage não confirmou o bucket configurado.");
}

export async function probeGoogleCloudSpeech(input: { secretPayload: string }): Promise<GoogleCloudHealthResult> {
  const credentials = parseGoogleCloudServiceAccountSecret(input.secretPayload);
  try {
    const client = await loadGoogleCloudSpeechClient(credentials);
    const clientWithProject = client as typeof client & { getProjectId?: () => Promise<string> };
    const projectId = clientWithProject.getProjectId ? await clientWithProject.getProjectId() : credentials.project_id;
    return { providerRequestRef: null, details: { stage: "credential_and_client", projectId, apiCall: "minimal_authentication" } };
  } catch (error) {
    return mapError(error, "O Speech-to-Text não confirmou a credencial.");
  }
}

export async function probeGoogleCloudStorage(input: { secretPayload: string; metadata?: unknown; clientFactory?: StorageClientFactory }): Promise<GoogleCloudHealthResult> {
  let credentials: ReturnType<typeof parseGoogleCloudServiceAccountSecret>;
  try {
    credentials = parseGoogleCloudServiceAccountSecret(input.secretPayload);
  } catch (error) {
    if (error instanceof GoogleCloudMediaError && error.code === "GOOGLE_CLOUD_SECRET_INVALID") {
      throw new GoogleCloudMediaError("CREDENTIAL_INVALID", "A credencial Google Cloud possui formato inválido.");
    }
    throw error;
  }
  const bucketName = readGoogleCloudMediaBucketName(input.metadata);
  if (!bucketName) throw new GoogleCloudMediaError("MEDIA_BUCKET_NOT_CONFIGURED", "O bucket de mídia ainda não foi configurado.");
  try {
    const client = input.clientFactory ? await input.clientFactory(credentials) : await loadGoogleCloudStorageClient(credentials);
    const bucket = client.bucket(bucketName);
    if (!bucket.getMetadata) throw new GoogleCloudMediaError("PROVIDER_ERROR", "O client Storage não oferece validação de metadata do bucket.");
    await bucket.getMetadata();
    return { providerRequestRef: null, details: { stage: "bucket_metadata", bucketConfigured: "true", destructiveWrite: "false" } };
  } catch (error) {
    return mapStorageProviderError(error);
  }
}

export async function probeYouTubeData(input: { secretPayload: string; metadata?: unknown; fetchImpl?: typeof fetch }): Promise<GoogleCloudHealthResult> {
  const apiKey = parseYouTubeDataApiKeySecret(input.secretPayload);
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata as Record<string, unknown> : {};
  const videoId = typeof metadata.youtube_health_video_id === "string" && metadata.youtube_health_video_id.trim() ? metadata.youtube_health_video_id.trim() : process.env.YOUTUBE_HEALTH_VIDEO_ID?.trim();
  if (!videoId) throw new GoogleCloudMediaError("GOOGLE_CLOUD_CONFIGURATION_MISSING", "Configure um videoId de fixture para o health check do YouTube.");
  try {
    const video = await fetchYouTubeVideoMetadata({ apiKey, videoUrlOrId: videoId, fetchImpl: input.fetchImpl, healthCheck: true });
    return { providerRequestRef: null, details: { stage: "videos_list", videoId: video.videoId, metadataOnly: "true" } };
  } catch (error) {
    return mapError(error, "O YouTube Data API não confirmou a API key.");
  }
}
