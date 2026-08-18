import { NextResponse, type NextRequest } from "next/server";
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
    const fallback = new URL("/login", request.url);
    fallback.searchParams.set("error", "session_slot_unavailable");
    const response = NextResponse.redirect(fallback);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
