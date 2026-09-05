import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const TELEGRAM_PROVIDER_KEY = "telegram" as const;
export const TELEGRAM_BOT_KEY = "platform" as const;
export const TELEGRAM_BOT_TOKEN_SECRET_NAME = "telegram_platform_bot" as const;
export const TELEGRAM_BOT_TOKEN_SECRET_DESCRIPTION = "Token global do Bot Telegram da Plataforma; nunca retornar ao cliente." as const;
export const TELEGRAM_CAPABILITY_MESSAGE_SEND = "telegram.message_send" as const;
export const TELEGRAM_CAPABILITY_FILE_FETCH = "telegram.file_fetch" as const;
export const TELEGRAM_MESSAGE_SEND_OPERATION = "telegram_message_send" as const;
export const TELEGRAM_FILE_FETCH_OPERATION = "telegram_file_fetch" as const;
export const TELEGRAM_WEBHOOK_HEADER = "X-Telegram-Bot-Api-Secret-Token" as const;

// Keep local validation deliberately small. Telegram's getMe call remains the
// authoritative validation, so the Admin must not reject an otherwise opaque
// provider token because of an implementation-specific format assumption.
const TelegramTokenSchema = z.string().trim().min(1, "BOT_TOKEN_REQUIRED").max(512, "TELEGRAM_BOT_TOKEN_INVALID").refine((value) => !/\s/.test(value), "TELEGRAM_BOT_TOKEN_INVALID");
const TelegramWebhookSecretSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{1,256}$/, "TELEGRAM_WEBHOOK_SECRET_INVALID");

const TelegramConfigurationInputSchema = z.object({
  botToken: TelegramTokenSchema,
  webhookSecret: TelegramWebhookSecretSchema.nullable().optional(),
}).strict();

export const TelegramSecretSchema = z.object({
  TELEGRAM_BOT_TOKEN: TelegramTokenSchema,
  TELEGRAM_WEBHOOK_SECRET: TelegramWebhookSecretSchema,
}).strict();

export type TelegramSecret = z.infer<typeof TelegramSecretSchema>;
export type TelegramConfigurationInput = z.infer<typeof TelegramConfigurationInputSchema>;

export function normalizeTelegramBotToken(input: unknown): string {
  const result = TelegramTokenSchema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message || "TELEGRAM_BOT_TOKEN_INVALID");
  return result.data;
}

export function normalizeTelegramWebhookSecret(input: unknown): string | null {
  if (input === null || typeof input === "undefined" || (typeof input === "string" && input.trim() === "")) return null;
  const result = TelegramWebhookSecretSchema.safeParse(input);
  if (!result.success) throw new Error("TELEGRAM_WEBHOOK_SECRET_INVALID");
  return result.data;
}

export function parseTelegramConfigurationInput(payload: string): TelegramConfigurationInput {
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new Error("TELEGRAM_CONFIGURATION_INVALID"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("TELEGRAM_CONFIGURATION_INVALID");
  const record = parsed as Record<string, unknown>;
  if (typeof record.botToken !== "string" || !record.botToken.trim()) throw new Error("BOT_TOKEN_REQUIRED");
  try {
    const botToken = normalizeTelegramBotToken(record.botToken);
    const webhookSecret = normalizeTelegramWebhookSecret(record.webhookSecret);
    if (Object.keys(record).some((field) => !["botToken", "webhookSecret"].includes(field))) throw new Error("TELEGRAM_CONFIGURATION_INVALID");
    const result = TelegramConfigurationInputSchema.safeParse({ botToken, webhookSecret });
    if (!result.success) throw new Error("TELEGRAM_CONFIGURATION_INVALID");
    return { botToken: result.data.botToken, webhookSecret: result.data.webhookSecret ?? null };
  } catch (error) {
    if (error instanceof Error && (error.message === "BOT_TOKEN_REQUIRED" || error.message === "TELEGRAM_BOT_TOKEN_INVALID" || error.message === "TELEGRAM_WEBHOOK_SECRET_INVALID")) throw error;
    throw new Error("TELEGRAM_CONFIGURATION_INVALID");
  }
}

export function parseTelegramBotToken(payload: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new Error("TELEGRAM_SECRET_INVALID"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("TELEGRAM_SECRET_INVALID");
  const record = parsed as Record<string, unknown>;
  return normalizeTelegramBotToken(record.TELEGRAM_BOT_TOKEN);
}

export function normalizeTelegramSecret(input: unknown): string {
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input); } catch { throw new Error("TELEGRAM_SECRET_INVALID"); }
  }
  const parsed = TelegramSecretSchema.safeParse(value);
  if (!parsed.success) throw new Error("TELEGRAM_SECRET_INVALID");
  return JSON.stringify(parsed.data);
}

export function parseTelegramSecret(payload: string): TelegramSecret {
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new Error("TELEGRAM_SECRET_INVALID"); }
  const result = TelegramSecretSchema.safeParse(parsed);
  if (!result.success) throw new Error("TELEGRAM_SECRET_INVALID");
  return result.data;
}

export function createOpaqueTelegramToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashTelegramToken(token) };
}

export function createTelegramWebhookSecret(): string {
  return randomBytes(48).toString("base64url");
}

export function hashTelegramToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const TelegramUserSchema = z.object({ id: z.union([z.number().int(), z.string().trim().min(1)]), username: z.string().optional(), first_name: z.string().optional(), last_name: z.string().optional() }).passthrough();
const TelegramChatSchema = z.object({ id: z.union([z.number().int(), z.string().trim().min(1)]), type: z.string().optional(), username: z.string().optional() }).passthrough();
const TelegramVoiceSchema = z.object({ file_id: z.string().min(1), file_unique_id: z.string().optional(), duration: z.number().int().nonnegative().optional(), mime_type: z.string().optional(), file_size: z.number().int().nonnegative().optional() }).passthrough();
const TelegramAudioSchema = TelegramVoiceSchema.extend({ file_name: z.string().optional(), title: z.string().optional(), performer: z.string().optional() });
const TelegramDocumentSchema = z.object({ file_id: z.string().min(1), file_unique_id: z.string().optional(), file_name: z.string().optional(), mime_type: z.string().optional(), file_size: z.number().int().nonnegative().optional() }).passthrough();

const TelegramMessageSchema = z.object({
  message_id: z.union([z.number().int(), z.string().trim().min(1)]),
  from: TelegramUserSchema.optional(),
  chat: TelegramChatSchema,
  date: z.number().int().optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  voice: TelegramVoiceSchema.optional(),
  audio: TelegramAudioSchema.optional(),
  document: TelegramDocumentSchema.optional(),
}).passthrough();

const TelegramCallbackQuerySchema = z.object({
  id: z.string().min(1),
  from: TelegramUserSchema,
  message: TelegramMessageSchema.optional(),
  data: z.string().optional(),
}).passthrough();

export const TelegramUpdateSchema = z.object({
  update_id: z.union([z.number().int(), z.string().trim().min(1)]),
  message: TelegramMessageSchema.optional(),
  callback_query: TelegramCallbackQuerySchema.optional(),
}).passthrough();

export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

export type TelegramInboundSource = {
  updateId: string;
  userId: string | null;
  chatId: string | null;
  messageId: string | null;
  callbackQueryId: string | null;
  callbackData: string | null;
  command: { name: string; argument: string | null } | null;
  sourceType: "TEXT" | "VOICE" | "AUDIO" | "DOCUMENT" | "CALLBACK" | "UNSUPPORTED";
  originalText: string | null;
  telegramFileId: string | null;
  telegramFileUniqueId: string | null;
  fileName: string | null;
  contentType: string | null;
  fileSize: number | null;
  durationSeconds: number | null;
  metadata: Record<string, string | number | null>;
};

function stringId(value: string | number | undefined | null) {
  return value === undefined || value === null ? null : String(value);
}

function commandFromText(text: string | null) {
  if (!text?.startsWith("/")) return null;
  const [rawCommand, ...argumentParts] = text.trim().split(/\s+/);
  const name = rawCommand?.slice(1).split("@")[0]?.toLowerCase();
  if (!name) return null;
  return { name, argument: argumentParts.join(" ").trim() || null };
}

export function extractTelegramInbound(update: TelegramUpdate): TelegramInboundSource {
  const message = update.message;
  const callback = update.callback_query;
  const sourceMessage = message || callback?.message;
  const source = message?.voice ? { type: "VOICE" as const, file: message.voice, text: null }
    : message?.audio ? { type: "AUDIO" as const, file: message.audio, text: null }
      : message?.document ? { type: "DOCUMENT" as const, file: message.document, text: null }
        : message?.text || message?.caption ? { type: "TEXT" as const, file: null, text: message.text || message.caption || null }
          : callback ? { type: "CALLBACK" as const, file: null, text: null }
            : { type: "UNSUPPORTED" as const, file: null, text: null };
  const file = source.file;
  const originalText = source.text;
  return {
    updateId: String(update.update_id),
    userId: stringId(message?.from?.id || callback?.from.id),
    chatId: stringId(sourceMessage?.chat.id),
    messageId: stringId(sourceMessage?.message_id),
    callbackQueryId: callback?.id || null,
    callbackData: callback?.data || null,
    command: source.type === "TEXT" ? commandFromText(originalText) : null,
    sourceType: source.type,
    originalText,
    telegramFileId: file?.file_id || null,
    telegramFileUniqueId: file?.file_unique_id || null,
    fileName: "file_name" in (file || {}) && typeof file?.file_name === "string" ? file.file_name : null,
    contentType: file?.mime_type || null,
    fileSize: file?.file_size ?? null,
    durationSeconds: "duration" in (file || {}) && typeof file?.duration === "number" ? file.duration : null,
    metadata: {
      updateId: String(update.update_id),
      messageId: stringId(sourceMessage?.message_id),
      callbackQueryId: callback?.id || null,
      sourceType: source.type,
      telegramUserId: stringId(message?.from?.id || callback?.from.id),
      telegramChatId: stringId(sourceMessage?.chat.id),
      fileUniqueId: file?.file_unique_id || null,
      fileName: "file_name" in (file || {}) && typeof file?.file_name === "string" ? file.file_name : null,
      contentType: file?.mime_type || null,
      fileSize: file?.file_size ?? null,
      durationSeconds: "duration" in (file || {}) && typeof file?.duration === "number" ? file.duration : null,
    },
  };
}

export function sanitizeTelegramUpdateMetadata(input: TelegramInboundSource) {
  return { ...input.metadata, command: input.command?.name || null };
}
