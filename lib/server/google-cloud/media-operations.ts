import "server-only";

import { resolveGoogleCloudSpeech, resolveGoogleCloudStorage, resolveYouTubeVideoMetadata, type GoogleCloudMediaResolution } from "./canonical";
import { transcribeLongAudio, transcribeShortAudio, type SpeechAudioMetadata, type SpeechClientFactory, type SpeechTranscriptResult } from "./speech-operation";
import { checkTemporaryMediaObject, removeTemporaryMediaObject, uploadRadarVideoDurableObject, uploadTemporaryMediaObject, type StorageClientFactory, type TemporaryMediaObject } from "./storage-operation";
import { fetchYouTubeVideoMetadata, type YouTubeVideoMetadata } from "./youtube-metadata-operation";
import type { IntegrationEnvironment, IntegrationRuntimeDependencies } from "@/lib/server/integrations-runtime";
import type { IntegrationSecretStore } from "@/lib/server/integration-secret-store";
import type { SupabaseClient } from "@supabase/supabase-js";

type MediaClient = Pick<SupabaseClient, "from" | "rpc">;

type ResolutionInput = {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  client?: MediaClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
};

export type SharedSpeechResult = { resolution: GoogleCloudMediaResolution; result: SpeechTranscriptResult };
export type SharedStorageResult = { resolution: GoogleCloudMediaResolution; result: TemporaryMediaObject };
export type SharedYouTubeResult = { resolution: GoogleCloudMediaResolution; result: YouTubeVideoMetadata };

export async function runSharedShortSpeech(input: ResolutionInput & { audioContent: string | Uint8Array; metadata?: SpeechAudioMetadata; clientFactory?: SpeechClientFactory }): Promise<SharedSpeechResult> {
  const resolution = await resolveGoogleCloudSpeech({ ...input, quotaUnits: 1 });
  if (!resolution.credentials) throw new Error("GOOGLE_CLOUD_CREDENTIALS_NOT_RESOLVED");
  const result = await transcribeShortAudio({ credentials: resolution.credentials, audioContent: input.audioContent, metadata: input.metadata, clientFactory: input.clientFactory });
  return { resolution, result };
}

export async function runSharedLongSpeech(input: ResolutionInput & { gcsUri: string; metadata?: SpeechAudioMetadata; clientFactory?: SpeechClientFactory }): Promise<SharedSpeechResult> {
  const resolution = await resolveGoogleCloudSpeech({ ...input, quotaUnits: 1 });
  if (!resolution.credentials) throw new Error("GOOGLE_CLOUD_CREDENTIALS_NOT_RESOLVED");
  const result = await transcribeLongAudio({ credentials: resolution.credentials, gcsUri: input.gcsUri, metadata: input.metadata, clientFactory: input.clientFactory });
  return { resolution, result };
}

export async function uploadSharedTemporaryMedia(input: ResolutionInput & { source: string; data: Buffer | Uint8Array; contentType: string; fileName?: string | null; checksum?: string | null; objectId?: string; clientFactory?: StorageClientFactory }): Promise<SharedStorageResult> {
  const resolution = await resolveGoogleCloudStorage({ ...input, quotaUnits: 1 });
  if (!resolution.credentials || !resolution.bucketName) throw new Error("GOOGLE_CLOUD_STORAGE_CONFIGURATION_NOT_RESOLVED");
  const result = await uploadTemporaryMediaObject({ credentials: resolution.credentials, bucketName: resolution.bucketName, brandId: input.brandId, source: input.source, data: input.data, contentType: input.contentType, fileName: input.fileName, checksum: input.checksum, objectId: input.objectId, clientFactory: input.clientFactory });
  return { resolution, result };
}

export async function uploadSharedRadarVideoMedia(input: ResolutionInput & { videoSourceId: string; data: Buffer | Uint8Array; contentType: string; fileName?: string | null; checksum?: string | null; objectId?: string; clientFactory?: StorageClientFactory }): Promise<SharedStorageResult> {
  const resolution = await resolveGoogleCloudStorage({ ...input, quotaUnits: 1 });
  if (!resolution.credentials || !resolution.bucketName) throw new Error("GOOGLE_CLOUD_STORAGE_CONFIGURATION_NOT_RESOLVED");
  const result = await uploadRadarVideoDurableObject({
    credentials: resolution.credentials, bucketName: resolution.bucketName,
    brandId: input.brandId, videoSourceId: input.videoSourceId,
    data: input.data, contentType: input.contentType, fileName: input.fileName,
    checksum: input.checksum, objectId: input.objectId, clientFactory: input.clientFactory,
  });
  return { resolution, result };
}

export async function checkSharedTemporaryMedia(input: ResolutionInput & { objectKey: string; clientFactory?: StorageClientFactory }) {
  const resolution = await resolveGoogleCloudStorage({ ...input, quotaUnits: 1 });
  if (!resolution.credentials || !resolution.bucketName) throw new Error("GOOGLE_CLOUD_STORAGE_CONFIGURATION_NOT_RESOLVED");
  const result = await checkTemporaryMediaObject({ credentials: resolution.credentials, bucketName: resolution.bucketName, objectKey: input.objectKey, clientFactory: input.clientFactory });
  return { resolution, result };
}

export async function removeSharedTemporaryMedia(input: ResolutionInput & { objectKey: string; clientFactory?: StorageClientFactory }) {
  const resolution = await resolveGoogleCloudStorage({ ...input, quotaUnits: 1 });
  if (!resolution.credentials || !resolution.bucketName) throw new Error("GOOGLE_CLOUD_STORAGE_CONFIGURATION_NOT_RESOLVED");
  const result = await removeTemporaryMediaObject({ credentials: resolution.credentials, bucketName: resolution.bucketName, brandId: input.brandId, objectKey: input.objectKey, clientFactory: input.clientFactory });
  return { resolution, result };
}

export async function fetchSharedYouTubeMetadata(input: ResolutionInput & { videoUrlOrId: string; fetchImpl?: typeof fetch }): Promise<SharedYouTubeResult> {
  const resolution = await resolveYouTubeVideoMetadata({ ...input, quotaUnits: 1 });
  if (!resolution.youtubeApiKey) throw new Error("YOUTUBE_API_KEY_NOT_RESOLVED");
  const result = await fetchYouTubeVideoMetadata({ apiKey: resolution.youtubeApiKey, videoUrlOrId: input.videoUrlOrId, fetchImpl: input.fetchImpl });
  return { resolution, result };
}
