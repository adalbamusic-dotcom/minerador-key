import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createTelegramWebhookSecret, extractTelegramInbound, hashTelegramToken, normalizeTelegramSecret, parseTelegramBotToken, parseTelegramConfigurationInput, TelegramUpdateSchema } from "../lib/server/telegram/contracts.ts";

const BOT_TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAA";
const WEBHOOK_SECRET = "telegram-webhook-secret";

test("Telegram secret is normalized without exposing an extra field", () => {
  const normalized = normalizeTelegramSecret(JSON.stringify({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET }));
  assert.equal(normalized, JSON.stringify({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET }));
  assert.notEqual(hashTelegramToken("opaque-token"), "opaque-token");
  assert.throws(() => normalizeTelegramSecret(JSON.stringify({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET, SECRET: "x" })));
});

test("Telegram configuration accepts only the Bot Token and generates a safe webhook secret", () => {
  const configuration = parseTelegramConfigurationInput(JSON.stringify({ botToken: "123:short" }));
  assert.deepEqual(configuration, { botToken: "123:short", webhookSecret: null });
  const generated = createTelegramWebhookSecret();
  assert.match(generated, /^[A-Za-z0-9_-]{32,64}$/);
  assert.equal(parseTelegramBotToken(JSON.stringify({ TELEGRAM_BOT_TOKEN: "123:short" })), "123:short");
  assert.throws(() => parseTelegramConfigurationInput(JSON.stringify({ webhookSecret: "secret" })), /BOT_TOKEN_REQUIRED/);
});

test("Telegram inbound separates text, voice, audio, document and callback", () => {
  const base = { chat: { id: 7 }, from: { id: 9 } };
  const text = TelegramUpdateSchema.parse({ update_id: 1, message: { ...base, message_id: 10, text: "fala original" } });
  const voice = TelegramUpdateSchema.parse({ update_id: 2, message: { ...base, message_id: 11, voice: { file_id: "voice-1", duration: 4 } } });
  const audio = TelegramUpdateSchema.parse({ update_id: 3, message: { ...base, message_id: 12, audio: { file_id: "audio-1", file_name: "nota.ogg" } } });
  const document = TelegramUpdateSchema.parse({ update_id: 4, message: { ...base, message_id: 13, document: { file_id: "doc-1", file_name: "nota.pdf" } } });
  const callback = TelegramUpdateSchema.parse({ update_id: 5, callback_query: { id: "callback-1", from: { id: 9 }, data: "brief:opaque" } });
  assert.equal(extractTelegramInbound(text).sourceType, "TEXT");
  assert.equal(extractTelegramInbound(text).originalText, "fala original");
  assert.equal(extractTelegramInbound(voice).sourceType, "VOICE");
  assert.equal(extractTelegramInbound(audio).fileName, "nota.ogg");
  assert.equal(extractTelegramInbound(document).sourceType, "DOCUMENT");
  assert.equal(extractTelegramInbound(callback).sourceType, "CALLBACK");
});

test("Telegram adapter exposes only explicit getMe, webhook and file operations", async () => {
  const adapter = await readFile(new URL("../lib/server/telegram/adapter.ts", import.meta.url), "utf8");
  assert.match(adapter, /getMe/);
  assert.match(adapter, /getWebhookInfo/);
  assert.match(adapter, /setWebhook/);
  assert.match(adapter, /getFile/);
  assert.match(adapter, /secret_token/);
  assert.doesNotMatch(adapter, /console\.log\(.*token/i);
});

test("foundation keeps webhook and worker boundaries explicit", async () => {
  const webhook = await readFile(new URL("../lib/server/telegram/webhook.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../lib/server/local-worker/runner.ts", import.meta.url), "utf8");
  const mediaWorker = await readFile(new URL("../lib/server/local-worker/telegram-media.ts", import.meta.url), "utf8");
  const radarWorker = await readFile(new URL("../lib/server/local-worker/radar-expert-contribution.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20260825150000_telegram_expert_contribution_platform_foundation.sql", import.meta.url), "utf8");
  assert.match(webhook, /TELEGRAM_WEBHOOK_HEADER/);
  assert.match(webhook, /claimTelegramInboundUpdate/);
  assert.match(webhook, /insertTelegramContribution/);
  assert.match(worker, /claim_external_processing_job/);
  assert.match(worker, /PROCESSOR_NOT_CONFIGURED/);
  assert.match(worker, /applyLocalWorkerWriteback/);
  assert.match(mediaWorker, /telegram_contribution_asset/);
  assert.match(radarWorker, /fetchSharedTelegramFile/);
  assert.match(radarWorker, /uploadSharedTemporaryMedia/);
  assert.match(radarWorker, /runSharedLongSpeech/);
  assert.match(radarWorker, /generateStructuredAI/);
  assert.match(radarWorker, /humanDecisionRequired/);
  for (const relation of [
    "brand_experts",
    "telegram_expert_bindings",
    "telegram_onboarding_tokens",
    "expert_briefs",
    "telegram_brief_selection_tokens",
    "expert_contributions",
    "external_processing_jobs",
    "telegram_inbound_updates",
  ]) assert.match(migration, new RegExp(`CREATE TABLE public\\.${relation}\\b`));
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_external_processing_job\(\s*p_worker_id text/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /attempts < j\.max_attempts/);
  assert.match(migration, /lease_expires_at = now\(\) \+ make_interval/);
  assert.match(worker, /FAILED_RETRYABLE/);
  assert.match(worker, /Math\.min\(input\.job\.attempts \* 60_000, 15 \* 60_000\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /INSERT INTO public\./i);
});
