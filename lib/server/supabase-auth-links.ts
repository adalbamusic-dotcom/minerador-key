import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";

export type SupabaseAuthLinkType = "signup" | "magiclink" | "recovery";

export type SupabaseAuthVerificationType = SupabaseAuthLinkType | "invite";

export class SupabaseAuthLinkError extends Error {
  readonly code = "SUPABASE_AUTH_LINK_FAILED";

  constructor() {
    super("Não foi possível gerar o link seguro de autenticação.");
  }
}

function buildRedirectUrl(origin: string, next: string) {
  const redirect = new URL("/auth/callback", origin);
  redirect.searchParams.set("next", safeAuthRedirect(next));
  return redirect.toString();
}

function buildConfirmationUrl(origin: string, next: string, tokenHash: string, type: SupabaseAuthVerificationType) {
  const confirm = new URL("/auth/confirm", origin);
  confirm.searchParams.set("token_hash", tokenHash);
  confirm.searchParams.set("type", type);
  confirm.searchParams.set("next", safeAuthRedirect(next));
  return confirm.toString();
}

export async function generateSupabaseAuthLink(
  client: SupabaseClient,
  input: {
    type: SupabaseAuthLinkType;
    email: string;
    origin: string;
    next: string;
    password?: string;
    data?: Record<string, string>;
  },
) {
  const redirectTo = buildRedirectUrl(input.origin, input.next);
  const result = input.type === "signup"
    ? await client.auth.admin.generateLink({ type: "signup", email: input.email, password: input.password || "", options: { redirectTo, ...(input.data ? { data: input.data } : {}) } })
    : input.type === "recovery"
      ? await client.auth.admin.generateLink({ type: "recovery", email: input.email, options: { redirectTo } })
      : await client.auth.admin.generateLink({ type: "magiclink", email: input.email, options: { redirectTo } });
  const properties = result.data?.properties;
  const actionLink = properties?.action_link;
  const tokenHash = properties?.hashed_token;
  const verificationType = properties?.verification_type;
  if (
    result.error ||
    typeof actionLink !== "string" ||
    !actionLink ||
    typeof tokenHash !== "string" ||
    !tokenHash ||
    (verificationType !== "signup" && verificationType !== "magiclink" && verificationType !== "recovery" && verificationType !== "invite")
  ) throw new SupabaseAuthLinkError();

  return {
    actionLink,
    confirmationLink: buildConfirmationUrl(input.origin, input.next, tokenHash, verificationType),
    diagnostics: {
      action_link_present: "YES",
      verification_type: verificationType,
      redirect_to_present: typeof properties.redirect_to === "string" && properties.redirect_to.length > 0 ? "YES" : "NO",
      hashed_token_present: "YES",
      verification_method: "SSR_VERIFY_OTP_TOKEN_HASH",
    },
  };
}
