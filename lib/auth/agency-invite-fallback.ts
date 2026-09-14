import { safeAuthRedirect } from "./safe-auth-redirect.ts";

const INVITE_URL_BASE = "https://minerador-key.local";

/** Extracts an invite token only from the canonical same-origin onboarding path. */
export function agencyInviteTokenFromPath(next: string): string | null {
  const safePath = safeAuthRedirect(next, "");
  if (!safePath) return null;

  const destination = new URL(safePath, INVITE_URL_BASE);
  if (destination.pathname !== "/onboarding/agencia" || destination.hash) return null;
  const tokens = destination.searchParams.getAll("token");
  if (tokens.length !== 1 || !tokens[0].trim()) return null;
  return tokens[0].trim();
}

/** A same-origin fallback is permitted only for a tokenized Agency invitation. */
export function agencyInviteFallbackPath(next: string): string | null {
  const safePath = safeAuthRedirect(next, "");
  if (!agencyInviteTokenFromPath(safePath)) return null;
  return safePath;
}
