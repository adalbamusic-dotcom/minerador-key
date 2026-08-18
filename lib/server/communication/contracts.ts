import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunicationConfigStatus = "DISABLED" | "NOT_CONFIGURED" | "VALIDATING" | "READY" | "ERROR";
export type CommunicationHealth = "DISABLED" | "MISSING_CREDENTIAL" | "MISSING_SENDER" | "VAULT_UNAVAILABLE" | "READY" | "PROVIDER_ERROR";
export type CommunicationMessageType = "AGENCY_INVITATION" | "AGENCY_WELCOME";
export type CommunicationMessageStatus = "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "FAILED" | "BOUNCED";
export type CommunicationSendStatus = "QUEUED" | "SENT" | "FAILED" | "NOT_CONFIGURED";

export const COMMUNICATION_DISPATCH_MAX_ATTEMPTS = 3;
export const COMMUNICATION_DISPATCH_LEASE_SECONDS = 5 * 60;

export type CommunicationConfig = {
  provider: "resend";
  status: CommunicationConfigStatus;
  senderName: string | null;
  senderEmail: string | null;
  domain: string | null;
  credentialConfigured: boolean;
  validatedAt: string | null;
  lastErrorCode: string | null;
  health: CommunicationHealth;
};

export type CommunicationSendResult = {
  status: CommunicationSendStatus;
  provider: "resend" | null;
  errorCode?: string;
  providerMessageId?: string;
  providerErrorType?: string;
  providerErrorMessage?: string;
  providerHttpStatus?: number;
};

export type CommunicationClient = Pick<SupabaseClient, "from" | "rpc">;
