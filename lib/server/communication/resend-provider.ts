import "server-only";

import type { CommunicationSendResult } from "./contracts";

type ResendMessage = {
  destination: string;
  senderEmail: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  apiKey: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] || character);
}

function sanitizeProviderText(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value
    .replace(/bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:re|sk)_[a-z0-9_-]+\b/gi, "[redacted-secret]")
    .replace(/(api[_ -]?key|authorization|secret|token)\s*[:=]\s*[^\s,;]+/gi, "[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240) || fallback;
}

async function readProviderError(response: Response) {
  const raw = await response.text().catch(() => "");
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  return {
    providerErrorType: sanitizeProviderText(record?.name ?? record?.type ?? record?.code, "resend_error"),
    providerErrorMessage: sanitizeProviderText(record?.message ?? record?.error, `Resend retornou HTTP ${response.status}.`),
    providerHttpStatus: response.status,
  };
}

export async function sendWithResend(message: ResendMessage): Promise<CommunicationSendResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${message.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey },
      body: JSON.stringify({ from: message.senderEmail, to: [message.destination], subject: message.subject, text: message.text, html: message.html }),
      cache: "no-store",
    });
    if (!response.ok) return { status: "FAILED", provider: "resend", errorCode: `RESEND_HTTP_${response.status}`, ...(await readProviderError(response)) };
    const body = await response.json().catch(() => ({})) as { id?: unknown };
    return { status: "SENT", provider: "resend", providerMessageId: typeof body.id === "string" ? body.id : undefined };
  } catch {
    return { status: "FAILED", provider: "resend", errorCode: "RESEND_NETWORK_ERROR" };
  }
}

export function renderGreeting(name?: string | null) {
  return name ? `Olá, ${name}.` : "Olá.";
}

export { escapeHtml };
