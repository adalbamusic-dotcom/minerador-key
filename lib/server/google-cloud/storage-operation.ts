import "server-only";

import { loadGoogleCloudStorageClient } from "./sdk-loaders";
import { GoogleCloudMediaError, type GoogleCloudServiceAccountCredentials } from "./contracts";

export type StorageFileLike = {
  save(data: Buffer, options?: Record<string, unknown>): Promise<unknown>;
  exists(): Promise<[boolean]>;
  getMetadata?: () => Promise<[unknown]>;
  delete?: (options?: Record<string, unknown>) => Promise<unknown>;
};

export type StorageBucketLike = {
  file(name: string): StorageFileLike;
  getMetadata?: () => Promise<[unknown]>;
};

export type StorageClientLike = {
  bucket(name: string): StorageBucketLike;
};

export type StorageClientFactory = (credentials: GoogleCloudServiceAccountCredentials) => Promise<StorageClientLike> | StorageClientLike;

export type TemporaryMediaObject = {
  brandId: string;
  source: string;
  objectKey: string;
  uri: string;
  contentType: string;
  checksum: string | null;
};

function safeSegment(value: string, field: string) {
  const normalized = value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized || normalized.length > 160) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", `${field} inválido.`);
  return normalized;
}

export function createBrandScopedMediaObjectKey(input: { brandId: string; source: string; fileName?: string | null; objectId?: string }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.brandId)) {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "brandId inválido para o objeto de mídia.");
  }
  const source = safeSegment(input.source, "source");
  const name = input.fileName ? safeSegment(input.fileName, "fileName") : "media";
  const objectId = input.objectId || crypto.randomUUID();
  if (!/^[0-9a-f-]{8,80}$/i.test(objectId)) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "objectId inválido para o objeto de mídia.");
  return `temporary/brand/${input.brandId}/${source}/${objectId}-${name}`;
}

/**
 * O PREFIXO DURÁVEL DO RADAR — §8 do Gate 2 de Vídeos.
 *
 * `temporary/brand/...` foi desenhado para processamento transitório, e
 * `removeSharedTemporaryMedia` existe justamente para apagá-lo. Guardar ali o
 * artefato original de uma fonte deliberada contradiria o nome e o desenho: o
 * original precisa sobreviver ao processamento que o gerou.
 *
 * A tenantização por marca é a mesma, e é ela que os guards de posse conferem.
 */
export function createRadarVideoDurableObjectKey(input: {
  brandId: string;
  videoSourceId: string;
  fileName?: string | null;
  objectId?: string;
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.brandId)) {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "brandId inválido para o objeto de vídeo.");
  }
  if (!/^[0-9a-f-]{8,80}$/i.test(input.videoSourceId)) {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "videoSourceId inválido para o objeto de vídeo.");
  }
  const name = input.fileName ? safeSegment(input.fileName, "fileName") : "original";
  const objectId = input.objectId || crypto.randomUUID();
  if (!/^[0-9a-f-]{8,80}$/i.test(objectId)) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "objectId inválido para o objeto de vídeo.");
  return `brand/${input.brandId}/radar/videos/${input.videoSourceId}/${objectId}-${name}`;
}

export function buildGoogleStorageUri(bucketName: string, objectKey: string) {
  if (!bucketName.trim() || !objectKey.trim()) throw new GoogleCloudMediaError("GOOGLE_CLOUD_CONFIGURATION_MISSING", "Bucket ou objectKey ausente.");
  return `gs://${bucketName.trim()}/${objectKey.trim()}`;
}

async function resolveClient(input: { credentials: GoogleCloudServiceAccountCredentials; clientFactory?: StorageClientFactory }) {
  if (input.clientFactory) return input.clientFactory(input.credentials);
  return loadGoogleCloudStorageClient(input.credentials);
}

function metadataRecord(input: { brandId: string; source: string; objectKey: string; contentType: string; checksum?: string | null }) {
  return {
    brandId: input.brandId,
    source: input.source,
    objectKey: input.objectKey,
    contentType: input.contentType,
    ...(input.checksum ? { checksum: input.checksum } : {}),
  };
}

export async function uploadTemporaryMediaObject(input: {
  credentials: GoogleCloudServiceAccountCredentials;
  bucketName: string;
  brandId: string;
  source: string;
  data: Buffer | Uint8Array;
  contentType: string;
  fileName?: string | null;
  checksum?: string | null;
  objectId?: string;
  clientFactory?: StorageClientFactory;
}): Promise<TemporaryMediaObject> {
  const objectKey = createBrandScopedMediaObjectKey({ brandId: input.brandId, source: input.source, fileName: input.fileName, objectId: input.objectId });
  const contentType = input.contentType.trim();
  if (!contentType || contentType.length > 160) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "contentType inválido.");
  const client = await resolveClient(input);
  const bucket = client.bucket(input.bucketName);
  await bucket.file(objectKey).save(Buffer.from(input.data), {
    resumable: false,
    metadata: { contentType, metadata: metadataRecord({ brandId: input.brandId, source: input.source, objectKey, contentType, checksum: input.checksum }) },
  });
  return { brandId: input.brandId, source: input.source, objectKey, uri: buildGoogleStorageUri(input.bucketName, objectKey), contentType, checksum: input.checksum || null };
}

/**
 * O UPLOAD DURÁVEL DE UMA FONTE DE VÍDEO — §4 do Gate 2.2.
 *
 * Irmão de `uploadTemporaryMediaObject`, não substituto: o transitório
 * continua servindo o que é descartável, e `removeSharedTemporaryMedia` existe
 * para apagá-lo. Este grava sob o prefixo que precisa sobreviver ao
 * processamento que o gerou.
 *
 * A tenantização é a mesma e continua sendo o que os guards de posse conferem.
 */
export async function uploadRadarVideoDurableObject(input: {
  credentials: GoogleCloudServiceAccountCredentials;
  bucketName: string;
  brandId: string;
  videoSourceId: string;
  data: Buffer | Uint8Array;
  contentType: string;
  fileName?: string | null;
  checksum?: string | null;
  objectId?: string;
  clientFactory?: StorageClientFactory;
}): Promise<TemporaryMediaObject> {
  const objectKey = createRadarVideoDurableObjectKey({
    brandId: input.brandId, videoSourceId: input.videoSourceId,
    fileName: input.fileName, objectId: input.objectId,
  });
  const contentType = input.contentType.trim();
  if (!contentType || contentType.length > 160) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "contentType inválido.");
  const client = await resolveClient(input);
  const bucket = client.bucket(input.bucketName);
  await bucket.file(objectKey).save(Buffer.from(input.data), {
    resumable: false,
    metadata: { contentType, metadata: metadataRecord({ brandId: input.brandId, source: "radar_video", objectKey, contentType, checksum: input.checksum }) },
  });
  return { brandId: input.brandId, source: "radar_video", objectKey, uri: buildGoogleStorageUri(input.bucketName, objectKey), contentType, checksum: input.checksum || null };
}

export async function checkTemporaryMediaObject(input: {
  credentials: GoogleCloudServiceAccountCredentials;
  bucketName: string;
  objectKey: string;
  clientFactory?: StorageClientFactory;
}) {
  const client = await resolveClient(input);
  const [exists] = await client.bucket(input.bucketName).file(input.objectKey).exists();
  return { exists, uri: buildGoogleStorageUri(input.bucketName, input.objectKey) };
}

export async function removeTemporaryMediaObject(input: {
  credentials: GoogleCloudServiceAccountCredentials;
  bucketName: string;
  brandId: string;
  objectKey: string;
  clientFactory?: StorageClientFactory;
}) {
  if (!input.objectKey.startsWith(`temporary/brand/${input.brandId}/`)) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "O objeto não pertence à Brand informada.");
  const client = await resolveClient(input);
  if (!client.bucket(input.bucketName).file(input.objectKey).delete) return { deleted: false };
  await client.bucket(input.bucketName).file(input.objectKey).delete?.({ ignoreNotFound: true });
  return { deleted: true };
}
