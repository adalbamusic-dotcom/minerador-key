"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

export async function resendSignupConfirmation(email: string, callbackUrl: string) {
  return getBrowserSupabaseClient().auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}` },
  });
}
