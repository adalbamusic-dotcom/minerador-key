import "server-only";

export type TelegramApiErrorShape = { errorCode: number | null; description: string };

export class TelegramApiError extends Error {
  readonly errorCode: number | null;
  readonly providerRequestRef: string | null;
  constructor(message: string, input: { errorCode?: number | null; providerRequestRef?: string | null } = {}) {
    super(message);
    this.name = "TelegramApiError";
    this.errorCode = input.errorCode ?? null;
    this.providerRequestRef = input.providerRequestRef ?? null;
  }
}

type TelegramResponse<T> = { ok: boolean; result?: T; error_code?: number; description?: string; parameters?: Record<string, unknown> };

export type TelegramBotUser = { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string };
export type TelegramWebhookInfo = { url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_date?: number; last_error_message?: string; ip_address?: string };
export type TelegramFile = { file_id: string; file_unique_id?: string; file_size?: number; file_path?: string };

export type TelegramMessageReplyMarkup = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file";

async function telegramRequest<T>(token: string, method: string, body: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TelegramApiError("O Telegram está indisponível.");
  }
  const requestRef = response.headers.get("x-request-id") || response.headers.get("request-id");
  let payload: TelegramResponse<T> | null = null;
  try { payload = await response.json() as TelegramResponse<T>; } catch { /* mapped below */ }
  if (!response.ok || !payload?.ok || payload.result === undefined) {
    throw new TelegramApiError("O Telegram não confirmou a operação.", { errorCode: payload?.error_code ?? response.status, providerRequestRef: requestRef });
  }
  return payload.result;
}

export function getTelegramBot(token: string, fetchImpl: typeof fetch = fetch) {
  return {
    getMe: () => telegramRequest<TelegramBotUser>(token, "getMe", {}, fetchImpl),
    getWebhookInfo: () => telegramRequest<TelegramWebhookInfo>(token, "getWebhookInfo", {}, fetchImpl),
    setWebhook: (input: { url: string; secretToken: string; allowedUpdates?: string[] }) => telegramRequest<boolean>(token, "setWebhook", { url: input.url, secret_token: input.secretToken, allowed_updates: input.allowedUpdates || ["message", "callback_query"] }, fetchImpl),
    sendMessage: (input: { chatId: string; text: string; replyMarkup?: TelegramMessageReplyMarkup }) => telegramRequest<{ message_id: number }>(token, "sendMessage", { chat_id: input.chatId, text: input.text, reply_markup: input.replyMarkup }, fetchImpl),
    answerCallbackQuery: (callbackQueryId: string, text?: string) => telegramRequest<boolean>(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, text }, fetchImpl),
    getFile: (fileId: string) => telegramRequest<TelegramFile>(token, "getFile", { file_id: fileId }, fetchImpl),
    downloadFile: async (filePath: string) => {
      let response: Response;
      try { response = await fetchImpl(`${TELEGRAM_FILE_BASE}/bot${token}/${filePath}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) }); } catch { throw new TelegramApiError("O arquivo Telegram não pôde ser baixado."); }
      if (!response.ok) throw new TelegramApiError("O arquivo Telegram não pôde ser baixado.", { errorCode: response.status });
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export type TelegramBotAdapter = ReturnType<typeof getTelegramBot>;
