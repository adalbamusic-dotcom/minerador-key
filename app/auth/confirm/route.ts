import { NextResponse, type NextRequest } from "next/server";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

const allowedTypes = new Set(["signup", "magiclink", "recovery", "invite"] as const);
type AllowedVerificationType = "signup" | "magiclink" | "recovery" | "invite";

function parseType(value: string | null): AllowedVerificationType | null {
  return value && allowedTypes.has(value as AllowedVerificationType) ? value as AllowedVerificationType : null;
}

function redirectWithoutToken(request: NextRequest, pathname: string, next: string) {
  const url = new URL(pathname, request.url);
  if (pathname === "/login") {
    url.searchParams.set("error", "auth_link_verification_failed");
    url.searchParams.set("callbackUrl", safeAuthRedirect(next));
  }
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = parseType(request.nextUrl.searchParams.get("type"));
  const next = safeAuthRedirect(request.nextUrl.searchParams.get("next"));

  if (!tokenHash || !type) return redirectWithoutToken(request, "/login", next);

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.session) return redirectWithoutToken(request, "/login", next);
  } catch {
    return redirectWithoutToken(request, "/login", next);
  }

  return redirectWithoutToken(request, next, next);
}
