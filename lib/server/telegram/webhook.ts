import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTelegramBot } from "./adapter";
import { extractTelegramInbound, sanitizeTelegramUpdateMetadata, TelegramUpdateSchema, TELEGRAM_WEBHOOK_HEADER, type TelegramSecret } from "./contracts";
import { resolveTelegramPlatformSecret, type TelegramPlatformSecretResolution } from "./canonical";
import {
  claimTelegramInboundUpdate,
  consumeTelegramOnboardingToken,
  enqueueExternalProcessingJob,
  finishTelegramInboundUpdate,
  findActiveTelegramBinding,
  insertTelegramContribution,
  issueBriefSelectionToken,
  listOpenExpertBriefs,
  markBindingInteraction,
  markExpertBriefAwaitingReview,
  selectTelegramBrief,
  type PersistenceClient,
  type TelegramBindingRecord,
} from "./persistence";

type WebhookClient = Pick<SupabaseClient, "from" | "rpc">;

export type TelegramWebhookResult = {
  status: 200 | 401 | 422 | 503;
  body: { ok: boolean; duplicate?: boolean; ignored?: boolean; code?: string };
};

export type TelegramWebhookDependencies = {
  client?: WebhookClient;
  secretResolution?: TelegramPlatformSecretResolution;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

function sameSecret(expected: string, received: string | null) {
  if (!received) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(received, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function payloadHash(payload: string) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function dependencyClient(client?: WebhookClient) {
  return client as PersistenceClient | undefined;
}

async function sendBriefSelection(input: { bot: ReturnType<typeof getTelegramBot>; chatId: string; binding: TelegramBindingRecord; briefs: Awaited<ReturnType<typeof listOpenExpertBriefs>>; client?: WebhookClient }) {
  const rows = await Promise.all(input.briefs.slice(0, 8).map(async (brief) => ({
    brief,
    token: await issueBriefSelectionToken({ bindingId: input.binding.id, brandId: input.binding.brandId, briefId: brief.id }, dependencyClient(input.client)),
  })));
  await input.bot.sendMessage({
    chatId: input.chatId,
    text: rows.length === 1 ? `Selecione o brief ativo: ${rows[0].brief.title}` : "Escolha para qual brief esta contribuição deve ser enviada:",
    replyMarkup: { inline_keyboard: rows.map((row) => [{ text: row.brief.title.slice(0, 60), callback_data: `brief:${row.token.token}` }]) },
  });
}

async function markIgnored(updateId: string, code: string, client?: WebhookClient) {
  await finishTelegramInboundUpdate(updateId, "IGNORED", { errorCode: code }, dependencyClient(client));
  return { status: 200 as const, body: { ok: true, ignored: true, code } };
}

async function handleStart(input: { secret: TelegramSecret; inbound: ReturnType<typeof extractTelegramInbound>; client?: WebhookClient; fetchImpl?: typeof fetch }) {
  const chatId = input.inbound.chatId;
  const userId = input.inbound.userId;
  if (!chatId || !userId || !input.inbound.command?.argument) return markIgnored(input.inbound.updateId, "TELEGRAM_ONBOARDING_TOKEN_MISSING", input.client);
  const binding = await consumeTelegramOnboardingToken({ token: input.inbound.command.argument, telegramUserId: userId, telegramChatId: chatId }, dependencyClient(input.client));
  const bot = getTelegramBot(input.secret.TELEGRAM_BOT_TOKEN, input.fetchImpl);
  if (!binding) {
    await bot.sendMessage({ chatId, text: "Este link de conexão é inválido, expirou ou já foi utilizado." });
    return markIgnored(input.inbound.updateId, "TELEGRAM_ONBOARDING_TOKEN_INVALID", input.client);
  }
  await bot.sendMessage({ chatId, text: "Conexão confirmada. Envie uma contribuição quando um brief estiver disponível." });
  await finishTelegramInboundUpdate(input.inbound.updateId, "PROCESSED", { bindingId: binding.id }, dependencyClient(input.client));
  return { status: 200 as const, body: { ok: true } };
}

async function handleCallback(input: { secret: TelegramSecret; inbound: ReturnType<typeof extractTelegramInbound>; client?: WebhookClient; fetchImpl?: typeof fetch }) {
  const binding = await findActiveTelegramBinding({ telegramUserId: input.inbound.userId, telegramChatId: input.inbound.chatId }, dependencyClient(input.client));
  const bot = getTelegramBot(input.secret.TELEGRAM_BOT_TOKEN, input.fetchImpl);
  if (input.inbound.callbackQueryId) await bot.answerCallbackQuery(input.inbound.callbackQueryId, binding ? undefined : "Conexão não encontrada.");
  if (!binding || !input.inbound.callbackData?.startsWith("brief:")) return markIgnored(input.inbound.updateId, "TELEGRAM_CALLBACK_IGNORED", input.client);
  const selected = await selectTelegramBrief({ token: input.inbound.callbackData.slice("brief:".length), bindingId: binding.id }, dependencyClient(input.client));
  if (!selected) return markIgnored(input.inbound.updateId, "TELEGRAM_BRIEF_SELECTOR_INVALID", input.client);
  if (input.inbound.chatId) await bot.sendMessage({ chatId: input.inbound.chatId, text: "Brief selecionado. Agora envie texto, áudio, voz ou documento." });
  await finishTelegramInboundUpdate(input.inbound.updateId, "PROCESSED", { bindingId: binding.id, briefId: selected.briefId }, dependencyClient(input.client));
  return { status: 200 as const, body: { ok: true } };
}

async function handleContribution(input: { secret: TelegramSecret; inbound: ReturnType<typeof extractTelegramInbound>; payloadHash: string; client?: WebhookClient; fetchImpl?: typeof fetch }) {
  const binding = await findActiveTelegramBinding({ telegramUserId: input.inbound.userId, telegramChatId: input.inbound.chatId }, dependencyClient(input.client));
  const bot = getTelegramBot(input.secret.TELEGRAM_BOT_TOKEN, input.fetchImpl);
  if (!binding || !input.inbound.chatId) return markIgnored(input.inbound.updateId, "TELEGRAM_BINDING_NOT_FOUND", input.client);
  const briefs = await listOpenExpertBriefs(binding, dependencyClient(input.client));
  const selected = binding.selectedBriefId ? briefs.find((brief) => brief.id === binding.selectedBriefId) : null;
  if (!selected) {
    if (briefs.length) await sendBriefSelection({ bot, chatId: input.inbound.chatId, binding, briefs, client: input.client });
    return markIgnored(input.inbound.updateId, briefs.length ? "TELEGRAM_BRIEF_SELECTION_REQUIRED" : "TELEGRAM_NO_OPEN_BRIEF", input.client);
  }
  if (!selected.sentAt || !["awaiting_expert", "receiving", "awaiting_review"].includes(selected.status)) {
    return markIgnored(input.inbound.updateId, "TELEGRAM_BRIEF_NOT_SENT", input.client);
  }
  if (!["TEXT", "VOICE", "AUDIO", "DOCUMENT"].includes(input.inbound.sourceType)) return markIgnored(input.inbound.updateId, "TELEGRAM_SOURCE_UNSUPPORTED", input.client);
  const contribution = await insertTelegramContribution({ binding, briefId: selected.id, inbound: input.inbound, payloadHash: input.payloadHash }, dependencyClient(input.client));
  await markExpertBriefAwaitingReview({ brandId: binding.brandId, expertId: binding.expertId, briefId: selected.id }, dependencyClient(input.client));
  if (!contribution.duplicate && contribution.contributionId && input.inbound.sourceType !== "TEXT") {
    await enqueueExternalProcessingJob({ brandId: binding.brandId, briefId: selected.id, contributionId: contribution.contributionId, jobKind: "telegram_media_preservation", payload: { sourceType: input.inbound.sourceType, telegramFileId: input.inbound.telegramFileId, fileName: input.inbound.fileName, contentType: input.inbound.contentType, audioMetadata: input.inbound.metadata } }, dependencyClient(input.client));
  }
  await markBindingInteraction(binding.id, binding.brandId, dependencyClient(input.client));
  await finishTelegramInboundUpdate(input.inbound.updateId, "PROCESSED", { bindingId: binding.id, briefId: selected.id }, dependencyClient(input.client));
  await bot.sendMessage({ chatId: input.inbound.chatId, text: contribution.duplicate ? "Esta contribuição já foi recebida." : "Contribuição recebida e preservada. O processamento será feito pelo worker local." });
  return { status: 200 as const, body: { ok: true } };
}

export async function processTelegramWebhook(request: Request, dependencies: TelegramWebhookDependencies = {}): Promise<TelegramWebhookResult> {
  const resolution = dependencies.secretResolution || await resolveTelegramPlatformSecret({ client: dependencies.client });
  const receivedSecret = request.headers.get(TELEGRAM_WEBHOOK_HEADER);
  if (!sameSecret(resolution.secret.TELEGRAM_WEBHOOK_SECRET, receivedSecret)) return { status: 401, body: { ok: false, code: "TELEGRAM_WEBHOOK_UNAUTHORIZED" } };
  const raw = await request.text();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { status: 422, body: { ok: false, code: "TELEGRAM_UPDATE_INVALID" } }; }
  const updateResult = TelegramUpdateSchema.safeParse(parsed);
  if (!updateResult.success) return { status: 422, body: { ok: false, code: "TELEGRAM_UPDATE_INVALID" } };
  const inbound = extractTelegramInbound(updateResult.data);
  const claimed = await claimTelegramInboundUpdate({ updateId: inbound.updateId, payloadHash: payloadHash(raw), userId: inbound.userId, chatId: inbound.chatId, metadata: sanitizeTelegramUpdateMetadata(inbound) }, dependencyClient(dependencies.client));
  if (claimed.duplicate) return { status: 200, body: { ok: true, duplicate: true } };
  try {
    if (inbound.command?.name === "start") return await handleStart({ secret: resolution.secret, inbound, client: dependencies.client, fetchImpl: dependencies.fetchImpl });
    if (inbound.sourceType === "CALLBACK") return await handleCallback({ secret: resolution.secret, inbound, client: dependencies.client, fetchImpl: dependencies.fetchImpl });
    return await handleContribution({ secret: resolution.secret, inbound, payloadHash: payloadHash(raw), client: dependencies.client, fetchImpl: dependencies.fetchImpl });
  } catch (error) {
    await finishTelegramInboundUpdate(inbound.updateId, "FAILED", { errorCode: error instanceof Error ? error.name.slice(0, 80) : "TELEGRAM_WEBHOOK_FAILED" }, dependencyClient(dependencies.client));
    throw error;
  }
}
