import { createHash } from "node:crypto";
import {
  assertUsableSupabaseJwt,
  readSupabaseJwtMetadata,
  type SupabaseJwtMetadata,
} from "../auth/supabase-token.ts";

export type SupabaseTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  metadata: SupabaseJwtMetadata;
  status: number;
};

export type SupabaseAuthTokenDiagnostic = {
  status: number | null;
  accessTokenPresent: boolean;
  refreshTokenPresent: boolean;
  expiresAtPresent: boolean;
  subjectPresent: boolean;
  role: string | null;
  audience: string | string[] | null;
};

export class SupabaseAuthTokenError extends Error {
  readonly code:
    | "SupabaseTokenConfigError"
    | "SUPABASE_GOOGLE_EXCHANGE_FAILED"
    | "SUPABASE_TOKEN_REFRESH_FAILED"
    | "SUPABASE_ACCESS_TOKEN_MISSING"
    | "SUPABASE_REFRESH_TOKEN_MISSING"
    | "SUPABASE_TOKEN_INVALID_CLAIMS";
  readonly status?: number;
  readonly diagnostic: SupabaseAuthTokenDiagnostic;

  constructor(
    code:
      | "SupabaseTokenConfigError"
      | "SUPABASE_GOOGLE_EXCHANGE_FAILED"
      | "SUPABASE_TOKEN_REFRESH_FAILED"
      | "SUPABASE_ACCESS_TOKEN_MISSING"
      | "SUPABASE_REFRESH_TOKEN_MISSING"
      | "SUPABASE_TOKEN_INVALID_CLAIMS",
    message: string,
    status?: number,
    diagnostic: Partial<SupabaseAuthTokenDiagnostic> = {},
  ) {
    super(message);
    this.name = "SupabaseAuthTokenError";
    this.code = code;
    this.status = status;
    this.diagnostic = {
      status: status ?? null,
      accessTokenPresent: false,
      refreshTokenPresent: false,
      expiresAtPresent: false,
      subjectPresent: false,
      role: null,
      audience: null,
      ...diagnostic,
    };
  }
}

type SupabaseAuthResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
};

function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) throw new SupabaseAuthTokenError("SupabaseTokenConfigError", "Configuração do Supabase ausente.");
  return { url, anonKey };
}

function readTokenSet(payload: unknown, status: number): SupabaseTokenSet {
  const response = payload as SupabaseAuthResponse;
  const accessToken = typeof response?.access_token === "string" ? response.access_token : null;
  const refreshToken = typeof response?.refresh_token === "string" ? response.refresh_token : null;
  if (!accessToken) {
    throw new SupabaseAuthTokenError("SUPABASE_ACCESS_TOKEN_MISSING", "Resposta sem access token do Supabase.", status, {
      status,
      refreshTokenPresent: Boolean(refreshToken),
    });
  }
  if (!refreshToken) {
    throw new SupabaseAuthTokenError("SUPABASE_REFRESH_TOKEN_MISSING", "Resposta sem refresh token do Supabase.", status, {
      status,
      accessTokenPresent: true,
    });
  }

  let metadata: SupabaseJwtMetadata | null = null;
  try {
    metadata = readSupabaseJwtMetadata(accessToken);
    assertUsableSupabaseJwt(accessToken);
    return {
      accessToken,
      refreshToken,
      expiresAt: metadata.expiresAt as number * 1000,
      metadata,
      status,
    };
  } catch (error) {
    const code = error instanceof Error && "code" in error && error.code === "SUPABASE_TOKEN_EXPIRED"
      ? "SUPABASE_TOKEN_REFRESH_FAILED"
      : "SUPABASE_TOKEN_INVALID_CLAIMS";
    throw new SupabaseAuthTokenError(code, "JWT do Supabase inválido ou expirado.", status, {
      status,
      accessTokenPresent: true,
      refreshTokenPresent: true,
      expiresAtPresent: metadata?.expiresAt !== null && metadata?.expiresAt !== undefined,
      subjectPresent: Boolean(metadata?.subject),
      role: metadata?.role ?? null,
      audience: metadata?.audience ?? null,
    });
  }
}

async function requestToken(
  grantType: "id_token" | "refresh_token",
  body: Record<string, string | undefined>,
  operation: "exchange" | "refresh",
): Promise<SupabaseTokenSet> {
  const { url, anonKey } = getSupabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=${grantType}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SupabaseAuthTokenError(
      operation === "exchange" ? "SUPABASE_GOOGLE_EXCHANGE_FAILED" : "SUPABASE_TOKEN_REFRESH_FAILED",
      "Não foi possível contactar o serviço de autenticação do Supabase.",
      undefined,
      { status: null },
    );
  }

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    throw new SupabaseAuthTokenError(
      operation === "exchange" ? "SUPABASE_GOOGLE_EXCHANGE_FAILED" : "SUPABASE_TOKEN_REFRESH_FAILED",
      "O Supabase recusou a sessão de autenticação.",
      response.status,
      { status: response.status },
    );
  }
  return readTokenSet(payload, response.status);
}

export function exchangeGoogleIdTokenForSupabaseToken(
  idToken: string,
  googleAccessToken?: string,
  nonce?: string,
): Promise<SupabaseTokenSet> {
  return requestToken("id_token", {
    provider: "google",
    id_token: idToken,
    access_token: googleAccessToken,
    nonce,
  }, "exchange");
}

const refreshPromises = new Map<string, Promise<SupabaseTokenSet>>();

export function refreshSupabaseAccessToken(refreshToken: string): Promise<SupabaseTokenSet> {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const existing = refreshPromises.get(key);
  if (existing) return existing;

  const promise = requestToken("refresh_token", { refresh_token: refreshToken }, "refresh");
  refreshPromises.set(key, promise);
  const clear = () => {
    if (refreshPromises.get(key) === promise) refreshPromises.delete(key);
  };
  promise.then(clear, clear);
  return promise;
}
