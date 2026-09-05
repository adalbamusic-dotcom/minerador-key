import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { configureSupportedPlatformProvider, readPlatformIntegrations } from "../lib/server/platform-integrations-admin.ts";
import { readGoogleCloudMediaBucketName } from "../lib/server/google-cloud/contracts.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

type QueryResult = { data: unknown[]; error: null; count: number | null };
type QueryBuilder = {
  select(..._args: unknown[]): QueryBuilder;
  eq(..._args: unknown[]): QueryBuilder;
  order(..._args: unknown[]): QueryBuilder;
  limit(..._args: unknown[]): QueryBuilder;
  then(resolve: (value: QueryResult) => unknown): Promise<unknown>;
};

function readOnlyQuery(data: unknown[], count: number | null = null): QueryBuilder {
  const result: QueryResult = { data, error: null, count };
  const builder = {} as QueryBuilder;
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.then = (resolve) => Promise.resolve(result).then(resolve);
  return builder;
}

test("Google Cloud Media fica no Admin global e não cria superfície por módulo", async () => {
  const route = await read("app/api/admin/integrations/route.ts");
  const service = await read("lib/server/platform-integrations-admin.ts");
  const runtime = await read("lib/server/integrations-runtime.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.match(route, /requireCanonicalPlatformAdmin/);
  assert.match(route, /bucketName/);
  assert.match(route, /healthOperation/);
  for (const value of ["google_cloud.speech_transcription", "google_cloud.storage_media", "youtube.video_metadata", "GOOGLE_CLOUD_SERVICE_ACCOUNT", "YOUTUBE_DATA_API_KEY"]) assert.match(service + panel, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(runtime, /google_cloud/);
  assert.match(runtime, /youtube_data/);
  assert.match(service, /google_cloud_media/);
  assert.match(service, /readGoogleCloudMediaBucketName/);
  assert.match(panel, /Bucket de mídia/);
  assert.match(panel, /googleCloudBucketName: providerKey === "google_cloud"/);
  assert.match(panel, /Status separado do Google Cloud/);
  assert.doesNotMatch(panel, /radar\.speech|radar\.storage|radar\.youtube|TELEGRAM_BOT_TOKEN|yt-dlp|ffmpeg/i);
});

test("Admin só testa provider por ação explícita e preserva composição responsiva", async () => {
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.match(panel, /Testar Speech/);
  assert.match(panel, /Testar Storage/);
  assert.match(panel, /Testar YouTube/);
  assert.match(panel, /useEffect\(\(\) => \{[\s\S]*load\(\)/);
  const initialEffect = panel.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/u)?.[0] || "";
  assert.doesNotMatch(initialEffect, /health_check_platform_connection/);
  assert.match(panel, /md:grid-cols/);
  assert.match(panel, /lg:grid-cols/);
  assert.match(panel, /bg-background/);
  assert.match(panel, /focus-visible:ring-context-accent/);
  assert.match(panel, /Connection READY/);
  assert.match(panel, /não confirma que o bucket/);
  assert.match(panel, /googleCloudHealth/);
});

test("readback do Admin reidrata bucket e health do Storage a partir do metadata persistido", async () => {
  const client = {
    from(table: string) {
      if (table === "integration_providers") return readOnlyQuery([{ id: "provider-google-cloud", provider_key: "google_cloud", display_name: "Google Cloud Media", status: "active" }]);
      if (table === "integration_connections") return readOnlyQuery([{ id: "connection-google-cloud", provider_id: "provider-google-cloud", owner_scope_type: "platform", environment: "production", lifecycle_status: "ready", secret_ref: "10000000-0000-4000-8000-000000000001", metadata: { label: "Google Cloud", google_cloud_media: { bucket_name: "Media-Bucket" }, google_cloud_health: { storage: { status: "ready", checked_at: "2026-08-25T00:00:00.000Z", code: null, message: null, provider_request_ref: null, stage: "bucket_metadata", details: { bucketConfigured: "true", destructiveWrite: "false" } } } } }]);
      if (table === "integration_bindings") return readOnlyQuery([], 0);
      if (table === "integration_usage_events") return readOnlyQuery([], 0);
      return readOnlyQuery([]);
    },
  };
  const snapshot = await readPlatformIntegrations(client as never);
  const connection = snapshot.platformConnections.find((item) => item.providerKey === "google_cloud");
  assert.equal(connection?.googleCloudBucketName, "media-bucket");
  assert.equal(connection?.googleCloudHealth?.storage?.status, "ready");
  assert.equal(connection?.googleCloudHealth?.storage?.details.bucketConfigured, "true");
});

test("salvamento do Google Cloud grava o bucket normalizado no metadata da Connection", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    rpc: async () => ({ data: "10000000-0000-4000-8000-000000000099", error: null }),
    from(table: string) {
      let updatePayload: Record<string, unknown> | null = null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        update: (payload: Record<string, unknown>) => { updatePayload = payload; return builder; },
        async maybeSingle() {
          if (table === "integration_providers") return { data: { id: "provider-google-cloud", provider_key: "google_cloud", status: "active" }, error: null };
          return { data: { id: "connection-google-cloud", provider_id: "provider-google-cloud", owner_scope_type: "platform", environment: "production", lifecycle_status: "pending", secret_ref: null, metadata: { label: "Google Cloud" } }, error: null };
        },
        async single() {
          updates.push(updatePayload || {});
          return { data: { id: "connection-google-cloud", provider_id: "provider-google-cloud", owner_scope_type: "platform", environment: "production", lifecycle_status: "pending", secret_ref: "10000000-0000-4000-8000-000000000099", metadata: updatePayload?.metadata || {} }, error: null };
        },
      };
      return builder;
    },
  };
  await configureSupportedPlatformProvider(client as never, "10000000-0000-4000-8000-000000000001", {
    providerKey: "google_cloud",
    environment: "production",
    label: "Google Cloud",
    bucketName: "Media-Bucket",
    secretPayload: JSON.stringify({
      type: "service_account",
      project_id: "minerador-key-test",
      private_key: "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----\n",
      client_email: "media@minerador-key-test.iam.gserviceaccount.com",
      token_uri: "https://oauth2.googleapis.com/token",
    }),
  });
  const metadata = updates.at(-1)?.metadata;
  assert.equal(readGoogleCloudMediaBucketName(metadata), "media-bucket");
});

test("migration sucessora somente amplia operation_kind e não executa dados ou segredos", async () => {
  const migration = await read("supabase/migrations/20260825090000_google_cloud_media_capabilities.sql");
  assert.match(migration, /speech_transcription/);
  assert.match(migration, /storage_media/);
  assert.match(migration, /youtube_video_metadata/);
  assert.doesNotMatch(migration, /INSERT|UPDATE|DELETE|integration_secret|CREATE TABLE/i);
  assert.match(migration, /DROP CONSTRAINT/);
});
