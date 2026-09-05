import assert from "node:assert/strict";
import test from "node:test";
import {
  readGoogleCloudMediaBucketName,
  normalizeMediaBucketName,
  parseGoogleCloudServiceAccountSecret,
  parseYouTubeDataApiKeySecret,
  sanitizeGoogleCloudConfiguration,
} from "../lib/server/google-cloud/contracts.ts";
import { probeGoogleCloudStorage } from "../lib/server/google-cloud/health.ts";
import { loadGoogleCloudSpeechClient, loadGoogleCloudStorageClient } from "../lib/server/google-cloud/sdk-loaders.ts";
import { buildSpeechRecognitionConfig, transcribeLongAudio, transcribeShortAudio } from "../lib/server/google-cloud/speech-operation.ts";
import { buildGoogleStorageUri, checkTemporaryMediaObject, createBrandScopedMediaObjectKey, removeTemporaryMediaObject, uploadTemporaryMediaObject } from "../lib/server/google-cloud/storage-operation.ts";
import { fetchYouTubeVideoMetadata, normalizeYouTubeVideoId } from "../lib/server/google-cloud/youtube-metadata-operation.ts";

const BRAND_ID = "10000000-0000-4000-8000-000000000001";
const SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  project_id: "minerador-key-test",
  private_key_id: "private-key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----\n",
  client_email: "media@minerador-key-test.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
});

function storageClientFixture(getMetadata: () => Promise<[unknown]>) {
  return {
    bucket: () => ({
      file: () => ({ save: async () => undefined, exists: async () => [false] as [boolean] }),
      getMetadata,
    }),
  };
}

test("Google Cloud SDK loaders resolve literal server imports without provider calls", async () => {
  const credentials = parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT);
  const speech = await loadGoogleCloudSpeechClient(credentials);
  const storage = await loadGoogleCloudStorageClient(credentials);

  assert.equal(speech.constructor.name, "SpeechClient");
  assert.equal(storage.constructor.name, "Storage");
});

test("Google Cloud secret contract is strict and sanitized", () => {
  const parsed = parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT);
  assert.equal(parsed.project_id, "minerador-key-test");
  assert.equal(sanitizeGoogleCloudConfiguration({ projectId: parsed.project_id, bucketName: "media-bucket" }).bucketConfigured, true);
  assert.equal(normalizeMediaBucketName("Media_Bucket-01"), "media_bucket-01");
  assert.throws(() => parseGoogleCloudServiceAccountSecret(JSON.stringify({ ...JSON.parse(SERVICE_ACCOUNT), unexpected: "secret" })), /campos não permitidos/);
  assert.doesNotMatch(JSON.stringify(sanitizeGoogleCloudConfiguration({ projectId: parsed.project_id, bucketName: "media-bucket" })), /private|client_email|BEGIN/);
});

test("Cloud Storage configuration is explicit and does not call Google when the bucket is absent", async () => {
  let factoryCalls = 0;
  let metadataCalls = 0;
  await assert.rejects(
    probeGoogleCloudStorage({
      secretPayload: SERVICE_ACCOUNT,
      metadata: {},
      clientFactory: async () => {
        factoryCalls += 1;
        return storageClientFixture(async () => { metadataCalls += 1; return [{}]; });
      },
    }),
    (error: unknown) => (assert.equal((error as { code?: string }).code, "MEDIA_BUCKET_NOT_CONFIGURED"), true),
  );
  assert.equal(factoryCalls, 0);
  assert.equal(metadataCalls, 0);
});

test("Cloud Storage health uses the persisted bucket name and confirms access with a fixture client", async () => {
  let metadataCalls = 0;
  const result = await probeGoogleCloudStorage({
    secretPayload: SERVICE_ACCOUNT,
    metadata: { google_cloud_media: { bucket_name: "Media-Bucket" } },
    clientFactory: async (credentials) => {
      assert.equal(credentials.project_id, "minerador-key-test");
      return { bucket: (bucketName: string) => {
        assert.equal(bucketName, "media-bucket");
        return storageClientFixture(async () => { metadataCalls += 1; return [{}]; }).bucket();
      } };
    },
  });
  assert.equal(result.details.stage, "bucket_metadata");
  assert.equal(result.details.bucketConfigured, "true");
  assert.equal(metadataCalls, 1);
  assert.equal(readGoogleCloudMediaBucketName({ google_cloud_media: { bucket_name: "Media-Bucket" } }), "media-bucket");
  assert.equal(readGoogleCloudMediaBucketName(JSON.parse(JSON.stringify({ google_cloud_media: { bucket_name: "Media-Bucket" } }))), "media-bucket");
});

test("Cloud Storage health keeps provider failures distinguishable and sanitized", async () => {
  const cases = [
    { error: { code: 404 }, expected: "BUCKET_NOT_FOUND" },
    { error: { code: 403 }, expected: "BUCKET_ACCESS_DENIED" },
    { error: { code: "SERVICE_DISABLED" }, expected: "STORAGE_API_DISABLED" },
  ] as const;
  for (const item of cases) {
    await assert.rejects(
      probeGoogleCloudStorage({
        secretPayload: SERVICE_ACCOUNT,
        metadata: { google_cloud_media: { bucket_name: "media-bucket" } },
        clientFactory: async () => storageClientFixture(async () => { throw item.error; }),
      }),
      (error: unknown) => (assert.equal((error as { code?: string }).code, item.expected), true),
    );
  }
  await assert.rejects(
    probeGoogleCloudStorage({
      secretPayload: JSON.stringify({ invalid: true }),
      metadata: { google_cloud_media: { bucket_name: "media-bucket" } },
      clientFactory: async () => storageClientFixture(async () => [{}]),
    }),
    (error: unknown) => (assert.equal((error as { code?: string }).code, "CREDENTIAL_INVALID"), true),
  );
});

test("Speech requests preserve normalized audio metadata and support short plus long modes", async () => {
  assert.deepEqual(buildSpeechRecognitionConfig({ languageCode: "pt-BR", encoding: "LINEAR16", sampleRateHertz: 48_000 }), {
    languageCode: "pt-BR",
    encoding: "LINEAR16",
    sampleRateHertz: 48_000,
    enableAutomaticPunctuation: true,
  });
  let shortRequest: Record<string, unknown> | null = null;
  const short = await transcribeShortAudio({
    credentials: parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT),
    audioContent: new Uint8Array([1, 2, 3]),
    metadata: { encoding: "LINEAR16", sampleRateHertz: 48_000 },
    clientFactory: () => ({
      recognize: async (request: unknown) => { shortRequest = request as Record<string, unknown>; return [{ results: [{ alternatives: [{ transcript: "áudio curto", confidence: 0.91 }] }] }]; },
      longRunningRecognize: async () => { throw new Error("not used"); },
    }),
  });
  assert.equal(short.transcript, "áudio curto");
  assert.equal(short.mode, "short");
  const shortRequestPayload = (shortRequest ?? {}) as Record<string, unknown>;
  assert.equal((shortRequestPayload.config as Record<string, unknown> | undefined)?.sampleRateHertz, 48_000);
  assert.equal((shortRequestPayload.audio as Record<string, unknown> | undefined)?.content, Buffer.from([1, 2, 3]).toString("base64"));

  let longRequest: Record<string, unknown> | null = null;
  const long = await transcribeLongAudio({
    credentials: parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT),
    gcsUri: "gs://media-bucket/temporary/brand/example/audio.wav",
    clientFactory: () => ({
      recognize: async () => { throw new Error("not used"); },
      longRunningRecognize: async (request: unknown) => { longRequest = request as Record<string, unknown>; return [{ promise: async () => [{ results: [{ alternatives: [{ transcript: "áudio longo" }] }] }] }]; },
    }),
  });
  assert.equal(long.transcript, "áudio longo");
  assert.equal(long.mode, "long");
  const longRequestPayload = (longRequest ?? {}) as Record<string, unknown>;
  assert.equal((longRequestPayload.audio as Record<string, unknown> | undefined)?.uri, "gs://media-bucket/temporary/brand/example/audio.wav");
});

test("Storage keys are brand-scoped and temporary lifecycle is explicit", async () => {
  const objectKey = createBrandScopedMediaObjectKey({ brandId: BRAND_ID, source: "radar", fileName: "audio.ogg", objectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  assert.match(objectKey, new RegExp(`^temporary/brand/${BRAND_ID}/radar/`));
  assert.equal(buildGoogleStorageUri("media-bucket", objectKey), `gs://media-bucket/${objectKey}`);
  const calls: string[] = [];
  const files = new Map<string, { exists: boolean }>();
  const clientFactory = () => ({
    bucket: () => ({
      file: (key: string) => ({
        save: async () => { calls.push(`save:${key}`); files.set(key, { exists: true }); },
        exists: async () => [Boolean(files.get(key)?.exists)] as [boolean],
        delete: async () => { calls.push(`delete:${key}`); files.delete(key); },
      }),
    }),
  });
  const uploaded = await uploadTemporaryMediaObject({ credentials: parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT), bucketName: "media-bucket", brandId: BRAND_ID, source: "radar", data: Buffer.from("media"), contentType: "audio/ogg", fileName: "audio.ogg", objectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", clientFactory });
  assert.equal((await checkTemporaryMediaObject({ credentials: parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT), bucketName: "media-bucket", objectKey: uploaded.objectKey, clientFactory })).exists, true);
  assert.equal((await removeTemporaryMediaObject({ credentials: parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT), bucketName: "media-bucket", brandId: BRAND_ID, objectKey: uploaded.objectKey, clientFactory })).deleted, true);
  assert.deepEqual(calls.map((call) => call.split(":")[0]), ["save", "delete"]);
  await assert.rejects(() => removeTemporaryMediaObject({ credentials: parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT), bucketName: "media-bucket", brandId: "10000000-0000-4000-8000-000000000002", objectKey: uploaded.objectKey, clientFactory }), /não pertence/);
});

test("YouTube metadata normalizes public URLs and never downloads media", async () => {
  assert.equal(normalizeYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(normalizeYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(normalizeYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeDataApiKeySecret(JSON.stringify({ YOUTUBE_DATA_API_KEY: "key" })), "key");
  const calls: Array<{ url: string; method?: string }> = [];
  const result = await fetchYouTubeVideoMetadata({
    apiKey: "key",
    videoUrlOrId: "dQw4w9WgXcQ",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init?.method });
      return new Response(JSON.stringify({ items: [{ snippet: { title: "Título", channelId: "channel", channelTitle: "Canal", description: "Descrição", publishedAt: "2026-01-01T00:00:00Z", thumbnails: { default: { url: "https://img.youtube.com/default.jpg", width: 120, height: 90 } } }, contentDetails: { duration: "PT1M" } }] }), { status: 200 });
    },
  });
  assert.equal(result.title, "Título");
  assert.equal(result.duration, "PT1M");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /part=snippet%2CcontentDetails/);
  assert.doesNotMatch(calls[0].url, /download|transcrib/i);
});
