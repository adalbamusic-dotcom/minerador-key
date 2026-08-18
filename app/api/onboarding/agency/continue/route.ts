import { NextResponse } from "next/server";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { findAuthUserByEmail } from "@/lib/server/auth-users";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import { AgencyOnboardingError, inspectAgencyInvitation } from "@/lib/server/agency-onboarding";

function invalid(request: Request) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", "auth_link_verification_failed");
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    const source = new URL(request.url);
    const token = source.searchParams.get("token");
    const operation = source.searchParams.get("operation") || crypto.randomUUID();
    const client = createCanonicalServiceClient();
    const invitation = await inspectAgencyInvitation(client, token);
    if (invitation.status !== "PENDING") throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_UNAVAILABLE", "Este convite não está disponível.");
    const callbackUrl = `/onboarding/agencia?${new URLSearchParams({ token: token || "", operation }).toString()}`;
    const identity = await findAuthUserByEmail(client, invitation.destination_email);
    const callback = safeAuthRedirect(callbackUrl);
    const target = !identity
      ? `/cadastro?${new URLSearchParams({ callbackUrl: callback, inviteToken: token || "", operation }).toString()}`
      : `/login?${new URLSearchParams({ callbackUrl: callback, ...(identity.identityStatus === "confirmed" ? {} : { error: identity.identityStatus === "pending_confirmation" ? "invited_identity_pending_confirmation" : "invited_identity_unavailable" }) }).toString()}`;
    const response = NextResponse.redirect(new URL(target, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return invalid(request);
  }
}
