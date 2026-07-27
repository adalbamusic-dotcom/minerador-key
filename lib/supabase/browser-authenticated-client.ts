import { getSession } from "next-auth/react";
import type { Session } from "next-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertUsableSupabaseJwt,
  getSupabaseSessionErrorMessage,
  isJwtExpiredError,
  readSupabaseJwtMetadata,
  type SupabaseJwtMetadata,
  type SupabaseSessionFailureReason,
  type SupabaseSessionReason,
} from "@/lib/auth/supabase-token";

export { getSupabaseSessionErrorMessage } from "@/lib/auth/supabase-token";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export type SupabaseSessionDiagnostic = {
  provider: Session["supabaseProvider"] | null;
  step: "nextauth_session" | "supabase_token" | "supabase_query";
  reason: SupabaseSessionReason;
  accessTokenPresent: boolean;
  refreshTokenPresent: false;
  expiresAt: number | null;
  secondsRemaining: number | null;
  subject: string | null;
  role: string | null;
  audience: string | string[] | null;
  issuer: string | null;
  sessionError: string | null;
};

export type SupabaseTokenResult =
  | {
      ok: true;
      reason: "SUPABASE_SESSION_READY";
      token: string;
      expiresAt: number;
      metadata: SupabaseJwtMetadata;
      diagnostic: SupabaseSessionDiagnostic;
    }
  | {
      ok: false;
      reason: SupabaseSessionFailureReason;
      token?: never;
      expiresAt: number | null;
      metadata: SupabaseJwtMetadata | null;
      diagnostic: SupabaseSessionDiagnostic;
    };

export class SupabaseBrowserAuthError extends Error {
  readonly diagnostic: SupabaseSessionDiagnostic;
  readonly code: SupabaseSessionFailureReason;

  constructor(
    code: SupabaseSessionFailureReason,
    message: string,
    diagnostic: SupabaseSessionDiagnostic,
  ) {
    super(message);
    this.name = "SupabaseBrowserAuthError";
    this.code = code;
    this.diagnostic = diagnostic;
  }

  get expiresAt(): number | null {
    return this.diagnostic.expiresAt;
  }
}

let sessionPromise: Promise<Session | null> | null = null;

function getCurrentNextAuthSession(): Promise<Session | null> {
  if (!sessionPromise) {
    sessionPromise = getSession().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

const knownSessionFailures = new Set<SupabaseSessionFailureReason>([
  "SESSION_LOADING",
  "NEXTAUTH_SESSION_MISSING",
  "GOOGLE_ID_TOKEN_MISSING",
  "SUPABASE_GOOGLE_EXCHANGE_FAILED",
  "SUPABASE_ACCESS_TOKEN_MISSING",
  "SUPABASE_REFRESH_TOKEN_MISSING",
  "SUPABASE_TOKEN_INVALID_CLAIMS",
  "SUPABASE_TOKEN_EXPIRED",
  "SUPABASE_TOKEN_REFRESH_FAILED",
]);

function normalizeSessionFailure(value: unknown): SupabaseSessionFailureReason {
  if (typeof value === "string" && knownSessionFailures.has(value as SupabaseSessionFailureReason)) {
    return value as SupabaseSessionFailureReason;
  }
  if (value === "SupabaseTokenRefreshError") return "SUPABASE_TOKEN_REFRESH_FAILED";
  if (value === "SupabaseTokenInvalid") return "SUPABASE_TOKEN_INVALID_CLAIMS";
  if (value === "SupabaseTokenExchangeError") return "SUPABASE_GOOGLE_EXCHANGE_FAILED";
  if (value === "SupabaseTokenMissing") return "SUPABASE_ACCESS_TOKEN_MISSING";
  return "SUPABASE_TOKEN_INVALID_CLAIMS";
}

function buildDiagnostic(
  session: Session | null,
  reason: SupabaseSessionReason,
  metadata: SupabaseJwtMetadata | null,
  step: SupabaseSessionDiagnostic["step"],
  expiresAtOverride?: number | null,
): SupabaseSessionDiagnostic {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = expiresAtOverride !== undefined ? expiresAtOverride : metadata?.expiresAt ?? null;
  return {
    provider: session?.supabaseProvider ?? null,
    step,
    reason,
    accessTokenPresent: Boolean(session?.accessToken),
    refreshTokenPresent: false,
    expiresAt,
    secondsRemaining: expiresAt === null ? null : expiresAt - now,
    subject: metadata?.subject ?? null,
    role: metadata?.role ?? null,
    audience: metadata?.audience ?? null,
    issuer: metadata?.issuer ?? null,
    sessionError: session?.error ?? null,
  };
}

function failure(
  session: Session | null,
  reason: SupabaseSessionFailureReason,
  metadata: SupabaseJwtMetadata | null = null,
  step: SupabaseSessionDiagnostic["step"] = "supabase_token",
  expiresAtOverride?: number | null,
): SupabaseTokenResult {
  return {
    ok: false,
    reason,
    expiresAt: metadata?.expiresAt ?? null,
    metadata,
    diagnostic: buildDiagnostic(session, reason, metadata, step, expiresAtOverride),
  };
}

export async function getCurrentSupabaseTokenResult(): Promise<SupabaseTokenResult> {
  const session = await getCurrentNextAuthSession();
  if (!session) return failure(null, "NEXTAUTH_SESSION_MISSING", null, "nextauth_session");
  if (session.supabaseAuth?.status === "error") {
    return failure(session, session.supabaseAuth.reason === "SUPABASE_SESSION_READY"
      ? "SUPABASE_ACCESS_TOKEN_MISSING"
      : session.supabaseAuth.reason, null, "supabase_token", session.supabaseAuth.expiresAt);
  }
  if (session.error) return failure(session, normalizeSessionFailure(session.error));
  if (!session.user) return failure(session, "NEXTAUTH_SESSION_MISSING", null, "nextauth_session");
  if (!session.accessToken) return failure(session, "SUPABASE_ACCESS_TOKEN_MISSING");

  let metadata: SupabaseJwtMetadata;
  try {
    metadata = readSupabaseJwtMetadata(session.accessToken);
    assertUsableSupabaseJwt(session.accessToken);
  } catch (error) {
    const reason = error && typeof error === "object" && "code" in error
      ? normalizeSessionFailure(error.code)
      : "SUPABASE_TOKEN_INVALID_CLAIMS";
    return failure(session, reason, (() => {
      try { return readSupabaseJwtMetadata(session.accessToken as string); } catch { return null; }
    })());
  }

  const diagnostic = buildDiagnostic(session, "SUPABASE_SESSION_READY", metadata, "supabase_token");
  return {
    ok: true,
    reason: "SUPABASE_SESSION_READY",
    token: session.accessToken,
    expiresAt: metadata.expiresAt as number,
    metadata,
    diagnostic,
  };
}

export async function getCurrentSupabaseToken(): Promise<string> {
  const result = await getCurrentSupabaseTokenResult();
  if (result.ok) return result.token;
  throw new SupabaseBrowserAuthError(result.reason, getSupabaseSessionErrorMessage(result.reason, result.expiresAt), result.diagnostic);
}

export function isSupabaseBrowserAuthError(error: unknown): error is SupabaseBrowserAuthError {
  return error instanceof SupabaseBrowserAuthError;
}

export function isSupabaseTokenExpirationError(error: unknown): error is SupabaseBrowserAuthError {
  if (!isSupabaseBrowserAuthError(error)) return false;
  return error.code === "SUPABASE_TOKEN_REFRESH_FAILED"
    || error.code === "SUPABASE_TOKEN_EXPIRED" && error.expiresAt !== null && error.expiresAt * 1000 <= Date.now();
}

export async function withSupabaseSelectRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isJwtExpiredError(error)) throw error;
    await getCurrentSupabaseToken();
    return operation();
  }
}

/**
 * Cliente browser estável: cada requisição pede o token atual ao NextAuth.
 * Não há Authorization fixo, persistência de sessão Supabase ou fallback anon.
 */
export function createAuthenticatedBrowserClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: getCurrentSupabaseToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
