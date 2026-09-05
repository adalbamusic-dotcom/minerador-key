import "server-only";

import { getTelegramBot, type TelegramMessageReplyMarkup } from "./adapter";
import { resolveTelegramFileFetch, resolveTelegramMessageSend, type TelegramActorResolution } from "./canonical";
import type { IntegrationEnvironment, IntegrationRuntimeDependencies } from "@/lib/server/integrations-runtime";
import type { IntegrationSecretStore } from "@/lib/server/integration-secret-store";
import type { SupabaseClient } from "@supabase/supabase-js";

type TelegramOperationInput = {
  actorUserId: string;
  agencyId?: string | null;
  brandId: string;
  client?: Pick<SupabaseClient, "from" | "rpc">;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
};

export async function sendSharedTelegramMessage(input: TelegramOperationInput & { chatId: string; text: string; replyMarkup?: TelegramMessageReplyMarkup }): Promise<{ resolution: TelegramActorResolution; messageId: number }> {
  const resolution = await resolveTelegramMessageSend({ ...input, quotaUnits: 1 });
  const result = await getTelegramBot(resolution.secret.TELEGRAM_BOT_TOKEN).sendMessage({ chatId: input.chatId, text: input.text, replyMarkup: input.replyMarkup });
  return { resolution, messageId: result.message_id };
}

export async function answerSharedTelegramCallback(input: TelegramOperationInput & { callbackQueryId: string; text?: string }) {
  const resolution = await resolveTelegramMessageSend({ ...input, quotaUnits: 1 });
  await getTelegramBot(resolution.secret.TELEGRAM_BOT_TOKEN).answerCallbackQuery(input.callbackQueryId, input.text);
  return { resolution };
}

export async function fetchSharedTelegramFile(input: TelegramOperationInput & { fileId: string; fetchImpl?: typeof fetch }) {
  const resolution = await resolveTelegramFileFetch({ ...input, quotaUnits: 1 });
  const bot = getTelegramBot(resolution.secret.TELEGRAM_BOT_TOKEN, input.fetchImpl);
  const file = await bot.getFile(input.fileId);
  if (!file.file_path) throw new Error("TELEGRAM_FILE_PATH_MISSING");
  const data = await bot.downloadFile(file.file_path);
  return { resolution, file, data };
}
