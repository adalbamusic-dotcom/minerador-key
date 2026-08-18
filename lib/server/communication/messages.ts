import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunicationClient, CommunicationMessageStatus, CommunicationMessageType } from "./contracts";

export type CommunicationMessageRow = {
  id: string;
  message_type: CommunicationMessageType;
  template_code: string;
  template_version: number;
  destination_email: string;
  payload: Record<string, unknown>;
  status: CommunicationMessageStatus;
  idempotency_key: string;
  attempt_count: number;
  next_attempt_at: string;
  provider: string | null;
  provider_message_id: string | null;
  agency_application_id?: string | null;
  agency_invitation_id?: string | null;
  agency_id?: string | null;
};

export async function enqueueCommunicationMessage(
  client: CommunicationClient,
  input: {
    messageType: CommunicationMessageType;
    templateCode: string;
    templateVersion: number;
    destination: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    agencyApplicationId?: string | null;
    agencyInvitationId?: string | null;
    agencyId?: string | null;
  },
) {
  const result = await client.rpc("enqueue_communication_message", {
    p_message_type: input.messageType,
    p_template_code: input.templateCode,
    p_template_version: input.templateVersion,
    p_destination_email: input.destination,
    p_payload: input.payload,
    p_idempotency_key: input.idempotencyKey,
    p_agency_application_id: input.agencyApplicationId || null,
    p_agency_invitation_id: input.agencyInvitationId || null,
    p_agency_id: input.agencyId || null,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.message_id) throw new Error("COMMUNICATION_MESSAGE_NOT_PERSISTED");
  return { id: row.message_id as string, status: row.message_status as CommunicationMessageStatus };
}

export async function createAgencyInvitationTokenGeneration(
  client: CommunicationClient,
  input: { invitationId: string; tokenHash: string },
) {
  const result = await client.rpc("create_agency_invitation_token_generation", {
    p_invitation_id: input.invitationId,
    p_token_hash: input.tokenHash,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.token_generation || !row?.token_expires_at) throw new Error("AGENCY_INVITATION_TOKEN_GENERATION_NOT_PERSISTED");
  return { generation: row.token_generation as number, expiresAt: row.token_expires_at as string };
}

export async function claimCommunicationMessage(client: CommunicationClient, messageId?: string | null) {
  const result = await client.rpc("claim_communication_message", { p_message_id: messageId || null });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return (row || null) as CommunicationMessageRow | null;
}

export async function completeCommunicationMessage(
  client: CommunicationClient,
  input: { messageId: string; status: "QUEUED" | "SENT" | "FAILED"; provider?: string | null; providerMessageId?: string | null; errorCategory?: string | null; nextAttemptAt?: string | null },
) {
  const result = await client.rpc("complete_communication_message", {
    p_message_id: input.messageId,
    p_status: input.status,
    p_provider: input.provider || null,
    p_provider_message_id: input.providerMessageId || null,
    p_error_category: input.errorCategory || null,
    p_next_attempt_at: input.nextAttemptAt || null,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return (row || null) as CommunicationMessageRow | null;
}

export async function recordCommunicationDeliveryEvent(
  client: CommunicationClient,
  input: { messageId: string; provider: string; providerMessageId?: string | null; eventType: "DELIVERED" | "BOUNCED"; eventId: string; payload?: Record<string, unknown> },
) {
  const result = await client.rpc("record_communication_delivery_event", {
    p_communication_message_id: input.messageId,
    p_provider: input.provider,
    p_provider_message_id: input.providerMessageId || null,
    p_event_type: input.eventType,
    p_event_id: input.eventId,
    p_payload: input.payload || {},
  });
  if (result.error) throw result.error;
  return result.data === true;
}

export async function findCommunicationMessage(client: SupabaseClient, messageId: string) {
  const result = await client.from("communication_messages").select("*").eq("id", messageId).maybeSingle();
  if (result.error) throw result.error;
  return (result.data || null) as CommunicationMessageRow | null;
}
