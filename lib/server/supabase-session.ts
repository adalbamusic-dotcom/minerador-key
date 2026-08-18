import "server-only";

import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export class SupabaseSessionError extends Error {
  constructor(public readonly code: "SUPABASE_SESSION_MISSING" | "SUPABASE_SESSION_INVALID") {
    super(code === "SUPABASE_SESSION_MISSING" ? "Sessão Supabase ausente." : "Sessão Supabase inválida ou expirada.");
  }
}

/** Uses Auth getUser instead of trusting cookie claims in server authorization. */
export async function requireSupabaseUser(): Promise<User> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new SupabaseSessionError(error ? "SUPABASE_SESSION_INVALID" : "SUPABASE_SESSION_MISSING");
  }
  return data.user;
}

export async function getSupabaseClaims() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims;
}
