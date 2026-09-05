import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Admin exposes Telegram as a shared platform provider and explicit health actions", async () => {
  const admin = await readFile(new URL("../lib/server/platform-integrations-admin.ts", import.meta.url), "utf8");
  const health = await readFile(new URL("../lib/server/platform-integrations-health.ts", import.meta.url), "utf8");
  const webhookAdmin = await readFile(new URL("../lib/server/telegram/admin.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../modules/admin/platform-integrations-panel.tsx", import.meta.url), "utf8");
  assert.match(admin, /providerKey: "telegram"/);
  assert.match(admin, /telegram\.message_send/);
  assert.match(admin, /telegram_get_me/);
  assert.match(health, /getTelegramBot/);
  assert.match(panel, /Testar Bot/);
  assert.match(panel, /Testar Webhook/);
  assert.match(panel, /Configurar Webhook/);
  assert.match(admin, /createTelegramWebhookSecret/);
  assert.match(admin, /BOT_TOKEN_REQUIRED/);
  assert.match(panel, /Configurado automaticamente/);
  assert.match(panel, /JSON\.stringify\(\{ botToken: apiForm\.telegramBotToken \}\)/);
  assert.doesNotMatch(admin, /getTelegramBot|\.setWebhook\(|\.getMe\(/);
  assert.match(webhookAdmin, /WEBHOOK_URL_REQUIRED/);
  assert.match(webhookAdmin, /SET_WEBHOOK_FAILED/);
  assert.doesNotMatch(panel, /TELEGRAM_BOT_TOKEN.*value=\{data/);
});

test("Marca exposes persisted external experts without turning them into memberships", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260825150000_telegram_expert_contribution_platform_foundation.sql", import.meta.url), "utf8");
  const panel = await readFile(new URL("../modules/marca/brand-experts-panel.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../modules/marca/brand-page.tsx", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE public\.brand_experts/);
  assert.match(migration, /created_by uuid NOT NULL REFERENCES auth\.users/);
  assert.match(panel, /Conectar Telegram/);
  assert.match(panel, /uso único/);
  assert.match(page, /BrandExpertsPanel/);
  assert.doesNotMatch(panel, /brand_memberships/);
});
