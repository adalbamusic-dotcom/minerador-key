import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTelegramBot, TelegramApiError } from "./adapter";
import { resolveTelegramPlatformSecret, TelegramCanonicalError } from "./canonical";

type TelegramAdminClient = Pick<SupabaseClient, "from" | "rpc">;

export class TelegramWebhookAdminError extends Error {
  readonly status: 400 | 409 | 502 | 503;
  readonly code: string;
  readonly diagnostics: Record<string, string | null>;
  readonly providerRequestRef: string | null;

  constructor(status: 400 | 409 | 502 | 503, code: string, message: string, diagnostics: Record<string, string | null> = {}, providerRequestRef: string | null = null) {
    super(message);
    this.name = "TelegramWebhookAdminError";
    this.status = status;
    this.code = code;
    this.diagnostics = diagnostics;
    this.providerRequestRef = providerRequestRef;
  }
}

function isLocalOrPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized === "::1" || normalized === "0.0.0.0") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized) || /^169\.254\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  const private172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(normalized);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

function webhookUrl(value: string) {
  const normalizedInput = typeof value === "string" ? value.trim() : "";
  if (!normalizedInput) throw new TelegramWebhookAdminError(400, "WEBHOOK_URL_REQUIRED", "Informe a URL pública HTTPS antes de configurar o webhook.");
  let url: URL;
  try { url = new URL(normalizedInput); } catch { throw new TelegramWebhookAdminError(400, "WEBHOOK_URL_INVALID", "A URL do webhook deve ser pública e usar HTTPS."); }
  if (url.protocol !== "https:" || !url.hostname || isLocalOrPrivateHostname(url.hostname) || url.username || url.password || url.hash || normalizedInput.length > 2_000) {
    throw new TelegramWebhookAdminError(400, "WEBHOOK_URL_INVALID", "A URL do webhook deve ser pública e usar HTTPS.");
  }
  return url.toString();
}

export async function configureTelegramPlatformWebhook(input: { client: TelegramAdminClient; connectionId: string; url: string; fetchImpl?: typeof fetch }) {
  const normalizedUrl = webhookUrl(input.url);
  let resolution: Awaited<ReturnType<typeof resolveTelegramPlatformSecret>>;
  try {
    resolution = await resolveTelegramPlatformSecret({ client: input.client, connectionId: input.connectionId, requireReady: false });
  } catch (error) {
    if (error instanceof TelegramCanonicalError) {
      throw new TelegramWebhookAdminError(error.status === 503 ? 503 : 409, error.code, error.message);
    }
    throw error;
  }
  try {
    await getTelegramBot(resolution.secret.TELEGRAM_BOT_TOKEN, input.fetchImpl).setWebhook({ url: normalizedUrl, secretToken: resolution.secret.TELEGRAM_WEBHOOK_SECRET });
  } catch (error) {
    if (error instanceof TelegramApiError) {
      throw new TelegramWebhookAdminError(502, "SET_WEBHOOK_FAILED", "Não foi possível configurar o webhook Telegram.", { stage: "set_webhook", httpStatus: error.errorCode === null ? null : String(error.errorCode) }, error.providerRequestRef);
    }
    throw error;
  }
  const metadata = resolution.metadata.telegram && typeof resolution.metadata.telegram === "object" && !Array.isArray(resolution.metadata.telegram) ? resolution.metadata.telegram as Record<string, unknown> : {};
  const result = await input.client.from("integration_connections").update({ metadata: { ...resolution.metadata, telegram: { ...metadata, webhook_url: normalizedUrl, webhook_configured_at: new Date().toISOString() } }, updated_at: new Date().toISOString() }).eq("id", input.connectionId);
  if (result.error) throw new TelegramWebhookAdminError(503, "TELEGRAM_WEBHOOK_STATE_NOT_PERSISTED", "O Telegram aceitou o webhook, mas não foi possível persistir o estado da Connection.");
  return { configured: true as const, url: normalizedUrl };
}
