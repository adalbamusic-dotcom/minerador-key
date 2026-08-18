"use client";

import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

/** Prepared only: callers must keep Google gated until the manual smoke test passes. */
export async function startGoogleOAuth(next?: string) {
  const target = safeAuthRedirect(next);
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;
  const { data, error } = await getBrowserSupabaseClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw new Error("Não foi possível iniciar o login com Google.");
  return data;
}
