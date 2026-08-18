import "server-only";

import { sendWithResend } from "./resend-provider";
import type { CommunicationClient, CommunicationConfig, CommunicationHealth, CommunicationSendResult } from "./contracts";

type ConfigRow = {
  provider: "resend";
  status: CommunicationConfig["status"];
  sender_name: string | null;
  sender_email: string | null;
  domain: string | null;
  secret_ref: string | null;
  credential_configured?: boolean;
  validated_at: string | null;
  last_error_code: string | null;
};

function healthFromConfig(row: ConfigRow | null | undefined): CommunicationHealth {
  if (!row) return "MISSING_CREDENTIAL";
  if (row.status === "DISABLED") return "DISABLED";
  if (!row.secret_ref && row.credential_configured !== true) return "MISSING_CREDENTIAL";
  if (!row.sender_email) return "MISSING_SENDER";
  if (row.status === "ERROR") return "PROVIDER_ERROR";
  return row.status === "READY" ? "READY" : "PROVIDER_ERROR";
}

function configFromRow(row: ConfigRow | null | undefined): CommunicationConfig {
  return {
    provider: "resend",
    status: row?.status || "NOT_CONFIGURED",
    senderName: row?.sender_name || null,
    senderEmail: row?.sender_email || null,
    domain: row?.domain || null,
    credentialConfigured: row?.credential_configured === true || Boolean(row?.secret_ref),
    validatedAt: row?.validated_at || null,
    lastErrorCode: row?.last_error_code || null,
    health: healthFromConfig(row),
  };
}

function schemaMissing(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "42P01" || code === "PGRST205" || /platform_communication_config.*not found|relation .*platform_communication_config.*does not exist/i.test(message);
}

export async function getCommunicationConfig(client: CommunicationClient): Promise<CommunicationConfig> {
  const result = await client.from("platform_communication_config").select("provider,status,sender_name,sender_email,domain,secret_ref,validated_at,last_error_code").eq("id", 1).maybeSingle();
  if (result.error) {
    if (schemaMissing(result.error)) return configFromRow(null);
    throw result.error;
  }
  return configFromRow(result.data as ConfigRow | null);
}

export async function getCommunicationHealth(client: CommunicationClient): Promise<CommunicationConfig> {
  const config = await getCommunicationConfig(client);
  if (config.health !== "READY") return config;
  const secret = await resolveSecret(client);
  return secret ? config : { ...config, health: "VAULT_UNAVAILABLE" };
}

export async function saveCommunicationConfig(client: CommunicationClient, input: { provider: string; senderName: string; senderEmail: string; domain?: string; secret?: string }) {
  const result = await client.rpc("save_platform_communication_config", {
    p_provider: input.provider,
    p_sender_name: input.senderName,
    p_sender_email: input.senderEmail,
    p_domain: input.domain || null,
    p_secret: input.secret || null,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return configFromRow(row as ConfigRow | null);
}

async function resolveSecret(client: CommunicationClient) {
  const result = await client.rpc("platform_communication_secret");
  if (result.error || typeof result.data !== "string" || !result.data) return null;
  return result.data;
}

async function markValidation(client: CommunicationClient, status: "READY" | "ERROR", errorCode?: string) {
  const result = await client.rpc("mark_platform_communication_validation", { p_status: status, p_error_code: errorCode || null });
  if (result.error) throw result.error;
}

function senderMatchesDomain(senderEmail: string, domain: string) {
  const at = senderEmail.lastIndexOf("@");
  if (at < 1) return false;
  const senderDomain = senderEmail.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  const configuredDomain = domain.trim().toLowerCase().replace(/\.$/, "");
  return Boolean(senderDomain && configuredDomain && senderDomain === configuredDomain);
}

function testConfigurationError(config: CommunicationConfig) {
  if (config.status === "DISABLED") return "COMMUNICATION_PROVIDER_DISABLED";
  if (config.provider !== "resend") return "COMMUNICATION_PROVIDER_UNSUPPORTED";
  if (!["VALIDATING", "ERROR", "READY"].includes(config.status)) return "COMMUNICATION_CONFIG_NOT_VALIDATING";
  if (!config.senderName) return "COMMUNICATION_SENDER_NAME_REQUIRED";
  if (!config.senderEmail) return "COMMUNICATION_SENDER_EMAIL_REQUIRED";
  if (!config.domain) return "COMMUNICATION_DOMAIN_REQUIRED";
  if (!config.credentialConfigured) return "COMMUNICATION_CREDENTIAL_MISSING";
  if (!senderMatchesDomain(config.senderEmail, config.domain)) return "COMMUNICATION_SENDER_DOMAIN_MISMATCH";
  return null;
}

export async function sendRenderedCommunicationMessage(client: CommunicationClient, input: { destination: string; subject: string; text: string; html: string; idempotencyKey: string }): Promise<CommunicationSendResult> {
  const config = await getCommunicationHealth(client);
  if (config.health !== "READY" || !config.senderEmail) return { status: "NOT_CONFIGURED", provider: null, errorCode: config.health };
  const secret = await resolveSecret(client);
  if (!secret) return { status: "NOT_CONFIGURED", provider: null, errorCode: "VAULT_UNAVAILABLE" };
  const result = await sendWithResend({ ...input, senderEmail: config.senderEmail, apiKey: secret });
  if (result.status === "FAILED") await markValidation(client, "ERROR", result.errorCode);
  return result;
}

export async function sendCommunicationTest(client: CommunicationClient, input: { destination: string; idempotencyKey: string }) {
  const config = await getCommunicationConfig(client);
  const configurationError = testConfigurationError(config);
  if (configurationError) return { status: "NOT_CONFIGURED", provider: null, errorCode: configurationError } satisfies CommunicationSendResult;
  const senderEmail = config.senderEmail;
  if (!senderEmail) return { status: "NOT_CONFIGURED", provider: null, errorCode: "COMMUNICATION_SENDER_EMAIL_REQUIRED" } satisfies CommunicationSendResult;
  const secret = await resolveSecret(client);
  if (!secret) return { status: "NOT_CONFIGURED", provider: null, errorCode: "VAULT_UNAVAILABLE" } satisfies CommunicationSendResult;
  const result = await sendWithResend({
    destination: input.destination,
    senderEmail,
    subject: "Teste de comunicação do Minerador Key",
    text: "Este é um e-mail de teste da configuração global de comunicação.",
    html: "<p>Este é um e-mail de teste da configuração global de comunicação.</p>",
    apiKey: secret,
    idempotencyKey: input.idempotencyKey,
  });
  if (result.status === "FAILED") await markValidation(client, "ERROR", result.errorCode);
  return result;
}

export async function markCommunicationReady(client: CommunicationClient) {
  await markValidation(client, "READY");
}
