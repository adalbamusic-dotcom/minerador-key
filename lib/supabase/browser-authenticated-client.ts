"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
export { getSupabaseSessionErrorMessage } from "@/lib/auth/supabase-token";

export type SupabaseSessionDiagnostic = { step: "supabase_session"; reason: "SUPABASE_SESSION_READY" | "SUPABASE_ACCESS_TOKEN_MISSING"; subject: string | null };

export class SupabaseBrowserAuthError extends Error {
  readonly code = "SUPABASE_ACCESS_TOKEN_MISSING" as const;
  readonly diagnostic: SupabaseSessionDiagnostic;
  constructor() {
    super("Sessão Supabase ausente ou expirada.");
    this.name = "SupabaseBrowserAuthError";
    this.diagnostic = { step: "supabase_session", reason: "SUPABASE_ACCESS_TOKEN_MISSING", subject: null };
  }
  get expiresAt() { return null; }
}

export async function getCurrentSupabaseToken(): Promise<string> {
  const { data, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) throw new SupabaseBrowserAuthError();
  return data.session.access_token;
}

export async function getCurrentSupabaseTokenResult() {
  try {
    const token = await getCurrentSupabaseToken();
    const { data } = await getBrowserSupabaseClient().auth.getUser();
    return { ok: true as const, reason: "SUPABASE_SESSION_READY" as const, token, diagnostic: { step: "supabase_session" as const, reason: "SUPABASE_SESSION_READY" as const, subject: data.user?.id || null } };
  } catch {
    return { ok: false as const, reason: "SUPABASE_ACCESS_TOKEN_MISSING" as const, diagnostic: { step: "supabase_session" as const, reason: "SUPABASE_ACCESS_TOKEN_MISSING" as const, subject: null } };
  }
}

export function isSupabaseBrowserAuthError(error: unknown): error is SupabaseBrowserAuthError { return error instanceof SupabaseBrowserAuthError; }
export function isSupabaseTokenExpirationError(error: unknown): error is SupabaseBrowserAuthError { return isSupabaseBrowserAuthError(error); }

export async function withSupabaseSelectRetry<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (!isSupabaseBrowserAuthError(error)) throw error;
    await getBrowserSupabaseClient().auth.refreshSession();
    return operation();
  }
}

/** Native cookie-backed Supabase client; it never reads a parallel session. */
export function createAuthenticatedBrowserClient(): SupabaseClient { return getBrowserSupabaseClient(); }
