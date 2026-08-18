import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildConfiguredAppUrl, buildIsolatedAuthEntryUrl } from "@/lib/auth/isolated-auth-entry";
import { escapeHtml, renderGreeting } from "./resend-provider";
import { getCommunicationHealth, sendRenderedCommunicationMessage } from "./service";
import { claimCommunicationMessage, completeCommunicationMessage, createAgencyInvitationTokenGeneration, type CommunicationMessageRow } from "./messages";
import type { CommunicationClient, CommunicationHealth, CommunicationMessageStatus } from "./contracts";
import {
  AGENCY_COMMUNICATION_PRESET_CODES,
  formatCommunicationPlanName,
  formatInvitationExpiry,
  resolveAgencyCommunicationPreset,
  resolveAgencyInvitationPresetCode,
  resolveAgencyInvitationTemplate,
  type CommunicationTemplateContent,
} from "./agency-invitation-template";

type TemplateRow = CommunicationTemplateContent;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function requiredPayloadValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`COMMUNICATION_PAYLOAD_${key.toUpperCase()}_MISSING`);
  return value;
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_match, key: string) => values[key] || "");
}

async function loadTemplate(client: CommunicationClient, row: CommunicationMessageRow) {
  const result = await client.from("communication_templates").select("subject,text_body,html_body").eq("code", row.template_code).eq("version", row.template_version).eq("active", true).maybeSingle();
  if (result.error || !result.data) throw new Error("COMMUNICATION_TEMPLATE_NOT_FOUND");
  return result.data as TemplateRow;
}

async function buildMessageContent(client: SupabaseClient, row: CommunicationMessageRow) {
  const payload = row.payload || {};
  let recipientName: string | null = null;
  let agencyName = "";
  let planName = "";
  let technicalExpiresAt = "";
  let accessExpiresAt = "";
  let trialDays = "";
  let template: TemplateRow;

  if (row.message_type === "AGENCY_INVITATION") {
    const invitationId = requiredPayloadValue(payload, "invitationId");
    const invitation = await client.from("agency_invitations").select("id,application_id,is_operational,status,responsible_name,proposed_agency_name,plan_code,expires_at,access_expires_at,source").eq("id", invitationId).maybeSingle();
    if (invitation.error || !invitation.data || invitation.data.status !== "PENDING" || new Date(invitation.data.expires_at) <= new Date() || (invitation.data.application_id && !invitation.data.is_operational)) {
      throw new Error("COMMUNICATION_INVITATION_NOT_PENDING");
    }
    recipientName = invitation.data.responsible_name;
    agencyName = invitation.data.proposed_agency_name;
    planName = formatCommunicationPlanName(invitation.data.plan_code);
    technicalExpiresAt = formatInvitationExpiry(invitation.data.expires_at);
    const presetCode = resolveAgencyInvitationPresetCode(invitation.data.source);
    template = resolveAgencyCommunicationPreset(presetCode) || resolveAgencyInvitationTemplate(await loadTemplate(client, row));
    if (presetCode === AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialApproved) {
      trialDays = "30";
    } else {
      if (typeof invitation.data.access_expires_at !== "string" || !invitation.data.access_expires_at) {
        throw new Error("COMMUNICATION_TRUSTED_INVITATION_ACCESS_EXPIRY_MISSING");
      }
      if (new Date(invitation.data.access_expires_at) <= new Date()) {
        throw new Error("COMMUNICATION_TRUSTED_INVITATION_ACCESS_EXPIRED");
      }
      accessExpiresAt = formatInvitationExpiry(invitation.data.access_expires_at);
    }
  } else if (row.template_code === AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialRequestReceived) {
    const applicationId = row.agency_application_id || requiredPayloadValue(payload, "applicationId");
    const application = await client.from("agency_applications").select("id,status,responsible_name,proposed_agency_name").eq("id", applicationId).maybeSingle();
    if (application.error || !application.data) throw new Error("COMMUNICATION_APPLICATION_NOT_FOUND");
    recipientName = application.data.responsible_name;
    agencyName = application.data.proposed_agency_name;
    template = resolveAgencyCommunicationPreset(AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialRequestReceived) || await loadTemplate(client, row);
  } else {
    template = await loadTemplate(client, row);
    recipientName = typeof payload.responsibleName === "string" ? payload.responsibleName : null;
    agencyName = requiredPayloadValue(payload, "agencyName");
    technicalExpiresAt = typeof payload.expiresAt === "string" ? formatInvitationExpiry(payload.expiresAt) : "";
  }

  const greeting = renderGreeting(recipientName);
  let values: Record<string, string> = {
    greeting,
    recipient_name: recipientName || "",
    agency_name: agencyName,
    plan_name: planName,
    trial_days: trialDays,
    access_expires_at: accessExpiresAt,
    technical_expires_at: technicalExpiresAt,
    expires_at: technicalExpiresAt,
    cta_label: "Concluir acesso",
    onboarding_url: "",
    workspace_url: "",
  };

  if (row.message_type === "AGENCY_INVITATION") {
    const invitationId = requiredPayloadValue(payload, "invitationId");
    const token = randomBytes(32).toString("base64url");
    await createAgencyInvitationTokenGeneration(client, { invitationId, tokenHash: hashToken(token) });
    const onboarding = new URLSearchParams({ token });
    values = { ...values, onboarding_url: buildIsolatedAuthEntryUrl(`/onboarding/agencia?${onboarding.toString()}`) };
  } else if (row.template_code !== AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialRequestReceived) {
    const workspacePath = requiredPayloadValue(payload, "workspacePath");
    values = { ...values, workspace_url: buildConfiguredAppUrl(workspacePath) };
  }

  return {
    destination: row.destination_email,
    subject: interpolate(template.subject, values),
    text: interpolate(template.text_body, values),
    html: interpolate(template.html_body, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeHtml(value)]))),
    idempotencyKey: row.idempotency_key,
  };
}

function retryAt(attemptCount: number) {
  if (attemptCount >= 3) return null;
  const delayMs = Math.min(15 * 60 * 1000, 30 * 1000 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMs).toISOString();
}

export type CommunicationDispatchResult = {
  messageId: string | null;
  status: CommunicationMessageStatus | "NO_MESSAGE";
  health: CommunicationHealth;
  errorCode?: string;
};

export async function dispatchCommunicationMessage(client: CommunicationClient, messageId?: string | null): Promise<CommunicationDispatchResult> {
  const health = await getCommunicationHealth(client);
  if (health.health !== "READY") return { messageId: messageId || null, status: "QUEUED", health: health.health, errorCode: health.health };

  const row = await claimCommunicationMessage(client, messageId);
  if (!row) return { messageId: messageId || null, status: "NO_MESSAGE", health: health.health };

  try {
    const content = await buildMessageContent(client as SupabaseClient, row);
    const sent = await sendRenderedCommunicationMessage(client, content);
    if (sent.status === "SENT") {
      await completeCommunicationMessage(client, { messageId: row.id, status: "SENT", provider: sent.provider, providerMessageId: sent.providerMessageId });
      return { messageId: row.id, status: "SENT", health: health.health };
    }
    if (sent.status === "NOT_CONFIGURED") {
      await completeCommunicationMessage(client, { messageId: row.id, status: "QUEUED", errorCategory: sent.errorCode, nextAttemptAt: new Date(Date.now() + 60_000).toISOString() });
      return { messageId: row.id, status: "QUEUED", health: sent.errorCode as CommunicationHealth || "VAULT_UNAVAILABLE", errorCode: sent.errorCode };
    }
    await completeCommunicationMessage(client, { messageId: row.id, status: "FAILED", provider: sent.provider, providerMessageId: sent.providerMessageId, errorCategory: sent.errorCode, nextAttemptAt: retryAt(row.attempt_count) });
    return { messageId: row.id, status: "FAILED", health: health.health, errorCode: sent.errorCode };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "COMMUNICATION_DISPATCH_FAILED";
    await completeCommunicationMessage(client, { messageId: row.id, status: "FAILED", errorCategory: errorCode, nextAttemptAt: retryAt(row.attempt_count) });
    return { messageId: row.id, status: "FAILED", health: health.health, errorCode };
  }
}
