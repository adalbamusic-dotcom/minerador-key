export type AgencyInvitationVisibilityInput = {
  status: string;
  source: string;
  expires_at: string;
  access_expires_at?: string | null;
  is_operational?: boolean;
  isOperational?: boolean;
};

function isFutureDate(value: string | null | undefined, now: number) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) && timestamp > now;
}

export function isActionableAgencyInvitation(invitation: AgencyInvitationVisibilityInput, now = Date.now()) {
  if (invitation.status !== "PENDING" || !isFutureDate(invitation.expires_at, now)) return false;

  if (invitation.source === "ADMIN_INVITE") {
    return isFutureDate(invitation.access_expires_at, now);
  }

  if (invitation.source === "PUBLIC_APPLICATION") {
    return invitation.is_operational !== false && invitation.isOperational !== false;
  }

  return false;
}
