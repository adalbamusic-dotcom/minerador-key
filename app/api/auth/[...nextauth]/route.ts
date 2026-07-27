import NextAuth, { AuthOptions, type Account, type User } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import {
  exchangeGoogleIdTokenForSupabaseToken,
  refreshSupabaseAccessToken,
  SupabaseAuthTokenError,
  type SupabaseAuthTokenDiagnostic,
  type SupabaseTokenSet,
} from "@/lib/server/supabase-auth-tokens";
import {
  SUPABASE_SESSION_REASONS,
  SUPABASE_TOKEN_REFRESH_MARGIN_SECONDS,
  assertUsableSupabaseJwt,
  type SupabaseSessionFailureReason,
} from "@/lib/auth/supabase-token";
import { GOOGLE_LOGIN_ENABLED } from "@/lib/server/auth-feature-flags";

type CredentialsUser = User & {
  accessToken?: unknown;
  refreshToken?: unknown;
  accessTokenExpires?: unknown;
};

type GoogleTokenSet = {
  accessToken: string;
  expiresAt: number;
};

function safeTokenError(error: unknown, fallback: SupabaseSessionFailureReason): SupabaseSessionFailureReason {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const code = error.code as SupabaseSessionFailureReason;
    if (SUPABASE_SESSION_REASONS.includes(code)) return code;
  }
  return fallback;
}

function logSupabaseDiagnostic(input: {
  provider: "google" | "credentials";
  step: string;
  reason: SupabaseSessionFailureReason | "SUPABASE_SESSION_READY";
  status: number | null;
  code: string;
  diagnostic?: Partial<SupabaseAuthTokenDiagnostic>;
  accessTokenPresent?: boolean;
  refreshTokenPresent?: boolean;
  expiresAtPresent?: boolean;
  subjectPresent?: boolean;
  role?: string | null;
  audience?: string | string[] | null;
  sessionError?: string | null;
}) {
  if (process.env.NODE_ENV === "production") return;
  console.error("Supabase auth diagnostic", {
    provider: input.provider,
    step: input.step,
    reason: input.reason,
    status: input.status,
    code: input.code,
    accessTokenPresent: input.diagnostic?.accessTokenPresent ?? input.accessTokenPresent ?? false,
    refreshTokenPresent: input.diagnostic?.refreshTokenPresent ?? input.refreshTokenPresent ?? false,
    expiresAtPresent: input.diagnostic?.expiresAtPresent ?? input.expiresAtPresent ?? false,
    subjectPresent: input.diagnostic?.subjectPresent ?? input.subjectPresent ?? false,
    role: input.diagnostic?.role ?? input.role ?? null,
    audience: input.diagnostic?.audience ?? input.audience ?? null,
    sessionError: input.sessionError ?? null,
  });
}

function applySupabaseToken(
  token: import("next-auth/jwt").JWT,
  tokenSet: SupabaseTokenSet,
  expectedUserId?: string,
  provider?: "credentials" | "google",
) {
  const userId = tokenSet.metadata.subject;
  if (!userId || (expectedUserId && expectedUserId !== userId)) {
    throw new Error("SUPABASE_TOKEN_INVALID_CLAIMS");
  }
  token.accessToken = tokenSet.accessToken;
  token.refreshToken = tokenSet.refreshToken;
  token.accessTokenExpires = tokenSet.expiresAt;
  token.accessTokenKind = "supabase";
  token.userId = userId;
  token.supabaseProvider = provider || token.supabaseProvider;
  delete token.supabaseFailureExpiresAt;
  token.error = undefined;
  token.supabaseSessionReason = "SUPABASE_SESSION_READY";
}

function clearSupabaseToken(token: import("next-auth/jwt").JWT) {
  delete token.accessToken;
  delete token.refreshToken;
  delete token.accessTokenExpires;
  delete token.accessTokenKind;
  delete token.supabaseFailureExpiresAt;
  delete token.supabaseSessionReason;
}

function isSupabaseTokenFresh(token: import("next-auth/jwt").JWT): boolean {
  return token.accessTokenKind === "supabase"
    && typeof token.accessTokenExpires === "number"
    && token.accessTokenExpires > Date.now() + SUPABASE_TOKEN_REFRESH_MARGIN_SECONDS * 1000;
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("GoogleTokenRefreshError");

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
  } catch {
    throw new Error("GoogleTokenRefreshError");
  }

  const payload = await response.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!response.ok || typeof payload?.access_token !== "string") throw new Error("GoogleTokenRefreshError");
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  return { accessToken: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 };
}

async function refreshGoogleIfNeeded(token: import("next-auth/jwt").JWT) {
  if (!token.googleAccessToken || !token.googleAccessTokenExpires) return;
  if (token.googleAccessTokenExpires > Date.now() + SUPABASE_TOKEN_REFRESH_MARGIN_SECONDS * 1000) return;
  if (!token.googleRefreshToken) {
    delete token.googleAccessToken;
    delete token.googleAccessTokenExpires;
    token.googleTokenError = "GoogleTokenRefreshError";
    return;
  }
  try {
    const refreshed = await refreshGoogleAccessToken(token.googleRefreshToken);
    token.googleAccessToken = refreshed.accessToken;
    token.googleAccessTokenExpires = refreshed.expiresAt;
    token.googleTokenError = undefined;
  } catch {
    delete token.googleAccessToken;
    delete token.googleAccessTokenExpires;
    token.googleTokenError = "GoogleTokenRefreshError";
    console.error("Google token refresh failed", { code: "GoogleTokenRefreshError" });
  }
}

async function ensureSupabaseToken(token: import("next-auth/jwt").JWT) {
  if (!token.accessToken || token.accessTokenKind !== "supabase") {
    clearSupabaseToken(token);
    token.error = token.error || "SUPABASE_ACCESS_TOKEN_MISSING";
    token.supabaseSessionReason = token.error as SupabaseSessionFailureReason;
    logSupabaseDiagnostic({
      provider: token.supabaseProvider || "credentials",
      step: "supabase_session_guard",
      reason: token.supabaseSessionReason,
      status: null,
      code: token.supabaseSessionReason,
      sessionError: token.error,
    });
    return;
  }
  if (isSupabaseTokenFresh(token)) {
    token.error = undefined;
    token.supabaseSessionReason = "SUPABASE_SESSION_READY";
    return;
  }
  if (!token.refreshToken) {
    clearSupabaseToken(token);
    token.error = "SUPABASE_REFRESH_TOKEN_MISSING";
    token.supabaseSessionReason = "SUPABASE_REFRESH_TOKEN_MISSING";
    logSupabaseDiagnostic({
      provider: token.supabaseProvider || "credentials",
      step: "supabase_refresh",
      reason: "SUPABASE_REFRESH_TOKEN_MISSING",
      status: null,
      code: "SUPABASE_REFRESH_TOKEN_MISSING",
      accessTokenPresent: false,
      refreshTokenPresent: false,
      sessionError: token.error,
    });
    return;
  }
  try {
    const refreshed = await refreshSupabaseAccessToken(token.refreshToken);
    applySupabaseToken(token, refreshed);
  } catch (error) {
    const previousExpiresAt = token.accessTokenExpires;
    clearSupabaseToken(token);
    if (typeof previousExpiresAt === "number") token.supabaseFailureExpiresAt = previousExpiresAt;
    token.error = safeTokenError(error, "SUPABASE_TOKEN_REFRESH_FAILED");
    token.supabaseSessionReason = token.error as SupabaseSessionFailureReason;
    const tokenError = error instanceof SupabaseAuthTokenError ? error : null;
    logSupabaseDiagnostic({
      provider: token.supabaseProvider || "credentials",
      step: "supabase_refresh",
      reason: token.error as SupabaseSessionFailureReason,
      status: tokenError?.status ?? null,
      code: token.error,
      diagnostic: tokenError?.diagnostic,
      sessionError: token.error,
    });
  }
}

function setGoogleToken(token: import("next-auth/jwt").JWT, account: Account) {
  token.googleTokenError = undefined;
  if (typeof account.access_token === "string") token.googleAccessToken = account.access_token;
  if (typeof account.refresh_token === "string") token.googleRefreshToken = account.refresh_token;
  if (typeof account.expires_at === "number") token.googleAccessTokenExpires = account.expires_at * 1000;
}

const googleProvider = GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/spreadsheets",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    });

export const authOptions: AuthOptions = {
  providers: [
    ...(GOOGLE_LOGIN_ENABLED ? [googleProvider] : []),
    CredentialsProvider({
      name: "Supabase",
      credentials: {
        email: { label: "E-mail", type: "email", placeholder: "seu-email@exemplo.com" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("E-mail e senha são obrigatórios.");
        }

        try {
          // Faz a autenticação na API do Supabase Auth
          const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error_description || errorData.message || "E-mail ou senha incorretos.");
          }

          const data = await response.json();

          if (data.user) {
            return {
              id: data.user.id,
              name: data.user.email.split("@")[0],
              email: data.user.email,
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              accessTokenExpires: typeof data.expires_at === "number"
                ? data.expires_at * 1000
                : Date.now() + Number(data.expires_in || 3600) * 1000,
            };
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Erro de conexão com o banco de dados.";
          console.error("Erro de autorização Supabase:", { code: "SupabaseCredentialsError" });
          throw new Error(message);
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      // Google tem um token próprio para APIs Google; nunca é usado no PostgREST.
      if (account?.provider === "google") {
        setGoogleToken(token, account);
        token.supabaseProvider = "google";
        if (!account.id_token) {
          clearSupabaseToken(token);
          token.error = "GOOGLE_ID_TOKEN_MISSING";
          token.supabaseSessionReason = "GOOGLE_ID_TOKEN_MISSING";
          logSupabaseDiagnostic({
            provider: "google",
            step: "google_id_token",
            reason: "GOOGLE_ID_TOKEN_MISSING",
            status: null,
            code: "GOOGLE_ID_TOKEN_MISSING",
            sessionError: token.error,
          });
          throw new Error("GOOGLE_ID_TOKEN_MISSING");
        } else {
          try {
            const supabaseToken = await exchangeGoogleIdTokenForSupabaseToken(
              account.id_token,
              account.access_token,
              undefined,
            );
            applySupabaseToken(token, supabaseToken, undefined, "google");
            logSupabaseDiagnostic({
              provider: "google",
              step: "google_to_supabase_exchange",
              reason: "SUPABASE_SESSION_READY",
              status: supabaseToken.status,
              code: "SUPABASE_SESSION_READY",
              accessTokenPresent: true,
              refreshTokenPresent: true,
              expiresAtPresent: true,
              subjectPresent: Boolean(supabaseToken.metadata.subject),
              role: supabaseToken.metadata.role,
              audience: supabaseToken.metadata.audience,
            });
          } catch (error) {
            clearSupabaseToken(token);
            token.error = safeTokenError(error, "SUPABASE_GOOGLE_EXCHANGE_FAILED");
            token.supabaseSessionReason = token.error as SupabaseSessionFailureReason;
            const tokenError = error instanceof SupabaseAuthTokenError ? error : null;
            logSupabaseDiagnostic({
              provider: "google",
              step: "google_to_supabase_exchange",
              reason: token.error as SupabaseSessionFailureReason,
              status: tokenError?.status ?? null,
              code: token.error,
              diagnostic: tokenError?.diagnostic,
              sessionError: token.error,
            });
            throw new Error(token.error);
          }
        }
      }

      // Login via e-mail/senha já recebe um JWT emitido pelo Supabase Auth.
      const credentialsUser = user as CredentialsUser | undefined;
      if (credentialsUser && typeof credentialsUser.accessToken === "string") {
        try {
          if (typeof credentialsUser.refreshToken !== "string" || !credentialsUser.refreshToken) {
            throw new Error("SUPABASE_REFRESH_TOKEN_MISSING");
          }
          const metadata = assertUsableSupabaseJwt(credentialsUser.accessToken);
          const supabaseToken: SupabaseTokenSet = {
            accessToken: credentialsUser.accessToken,
            refreshToken: credentialsUser.refreshToken,
            expiresAt: (metadata.expiresAt as number) * 1000,
            metadata,
            status: 200,
          };
          applySupabaseToken(token, supabaseToken, credentialsUser.id, "credentials");
          logSupabaseDiagnostic({
            provider: "credentials",
            step: "credentials_supabase_session",
            reason: "SUPABASE_SESSION_READY",
            status: 200,
            code: "SUPABASE_SESSION_READY",
            accessTokenPresent: true,
            refreshTokenPresent: true,
            expiresAtPresent: true,
            subjectPresent: Boolean(metadata.subject),
            role: metadata.role,
            audience: metadata.audience,
          });
        } catch (error) {
          clearSupabaseToken(token);
          token.error = safeTokenError(error, "SUPABASE_TOKEN_INVALID_CLAIMS");
          token.supabaseSessionReason = token.error as SupabaseSessionFailureReason;
          logSupabaseDiagnostic({
            provider: "credentials",
            step: "credentials_supabase_session",
            reason: token.supabaseSessionReason,
            status: null,
            code: token.supabaseSessionReason,
            sessionError: token.error,
          });
          throw new Error(token.error);
        }
      }

      await ensureSupabaseToken(token);
      await refreshGoogleIfNeeded(token);
      return token;
    },
    async session({ session, token }) {
      const isSupabaseReady = token.supabaseSessionReason === "SUPABASE_SESSION_READY"
        && typeof token.accessToken === "string";
      session.accessToken = isSupabaseReady ? token.accessToken : undefined;
      session.error = token.error;
      session.googleTokenError = token.googleTokenError;
      session.supabaseProvider = token.supabaseProvider;
      session.supabaseSessionReason = token.supabaseSessionReason;
      session.supabaseAuth = {
        status: isSupabaseReady ? "ready" : "error",
        reason: isSupabaseReady
          ? "SUPABASE_SESSION_READY"
          : (token.supabaseSessionReason || "SUPABASE_ACCESS_TOKEN_MISSING"),
        expiresAt: isSupabaseReady && typeof token.accessTokenExpires === "number"
          ? token.accessTokenExpires
          : typeof token.supabaseFailureExpiresAt === "number" ? token.supabaseFailureExpiresAt : null,
      };
      if (token.userId) {
        session.user = {
          ...session.user,
          id: token.userId as string
        };
      } else if (token.sub) {
        session.user = {
          ...session.user,
          id: token.sub
        };
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
    error: "/login",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
