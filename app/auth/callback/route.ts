import { NextResponse, type NextRequest } from "next/server";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

function loginErrorRedirect(request: NextRequest, error: string, next?: string | null) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  if (next) url.searchParams.set("callbackUrl", safeAuthRedirect(next));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  if (!code) return loginErrorRedirect(request, "oauth_code_missing", next);

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginErrorRedirect(request, "oauth_callback_failed", next);
  } catch {
    return loginErrorRedirect(request, "oauth_callback_failed", next);
  }

  return NextResponse.redirect(new URL(safeAuthRedirect(request.nextUrl.searchParams.get("next")), request.url));
}
