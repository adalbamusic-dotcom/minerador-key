import { NextResponse, type NextRequest } from "next/server";
import { agencyInviteFallbackPath } from "@/lib/auth/agency-invite-fallback";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import { buildSessionSlotOrigin, createSessionSlotId } from "@/lib/auth/session-slot";

export async function GET(request: NextRequest) {
  const next = safeAuthRedirect(request.nextUrl.searchParams.get("next"), "/login");
  try {
    const origin = buildSessionSlotOrigin(request.url, createSessionSlotId());
    const destination = new URL(next, origin);
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    const invitePath = agencyInviteFallbackPath(next);
    if (invitePath) {
      const response = NextResponse.redirect(new URL(invitePath, request.url));
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }

    const fallback = new URL("/login", request.url);
    fallback.searchParams.set("error", "session_slot_unavailable");
    const response = NextResponse.redirect(fallback);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
