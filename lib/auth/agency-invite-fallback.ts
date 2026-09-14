import { safeAuthRedirect } from "./safe-auth-redirect.ts";

/** A same-origin fallback is permitted only for a tokenized Agency invitation. */
export function agencyInviteFallbackPath(next: string): string | null {
  const safePath = safeAuthRedirect(next, "");
  if (!safePath) return null;

  const destination = new URL(safePath, "https://minerador-key.local");
  if (destination.pathname !== "/onboarding/agencia" || destination.hash) return null;

  const tokens = destination.searchParams.getAll("token");
  if (tokens.length !== 1 || !tokens[0].trim()) return null;

  return `${destination.pathname}${destination.search}`;
}
