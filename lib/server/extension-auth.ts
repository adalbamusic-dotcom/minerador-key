import { createClient } from "@supabase/supabase-js";
import { AuthzError, requireSessionProfileForIdentity, type SessionProfile } from "@/lib/server/authz";

export type ExtensionAuthCode = "unauthorized" | "token_expired" | "identity_not_linked" | "internal_error";

export class ExtensionAuthError extends Error {
  readonly status: number;
  readonly code: ExtensionAuthCode;

  constructor(status: number, code: ExtensionAuthCode, message: string) {
    super(message);
    this.name = "ExtensionAuthError";
    this.status = status;
    this.code = code;
  }
}

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) throw new ExtensionAuthError(500, "internal_error", "Configuracao do Supabase ausente.");
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function readBearer(request: Request): string {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new ExtensionAuthError(401, "unauthorized", "Bearer ausente ou invalido.");
  return match[1];
}

function isExpiredAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const candidate = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  return candidate.code === "token_expired"
    || (candidate.code === "pgrst301" && /expired/.test(message))
    || /jwt.*expired|token.*expired|expired.*jwt/.test(message);
}

export async function requireExtensionSessionProfile(request: Request): Promise<SessionProfile> {
  const token = readBearer(request);
  let user: { id: string; email?: string | null } | null = null;
  try {
    const result = await publicSupabaseClient().auth.getUser(token);
    if (result.error || !result.data.user?.id) {
      const expired = isExpiredAuthError(result.error);
      throw new ExtensionAuthError(401, expired ? "token_expired" : "unauthorized", expired ? "A sessao da extensao expirou." : "Token ausente ou invalido.");
    }
    user = { id: result.data.user.id, email: result.data.user.email };
  } catch (error) {
    if (error instanceof ExtensionAuthError) throw error;
    const expired = isExpiredAuthError(error);
    throw new ExtensionAuthError(401, expired ? "token_expired" : "unauthorized", expired ? "A sessao da extensao expirou." : "Token ausente ou invalido.");
  }

  try {
    return await requireSessionProfileForIdentity({ userId: user.id, email: user.email });
  } catch (error) {
    if (error instanceof AuthzError && error.status === 403) {
      throw new ExtensionAuthError(403, "identity_not_linked", "Identidade sem perfil autorizado.");
    }
    throw new ExtensionAuthError(503, "internal_error", "Nao foi possivel resolver as autorizacoes.");
  }
}

export function logExtensionEvent(input: { requestId: string; endpoint: string; result: string; code?: string; userId?: string; brands?: number }) {
  console.info(JSON.stringify({
    event: "minerador.extension.authenticated_contract",
    requestId: input.requestId,
    endpoint: input.endpoint,
    result: input.result,
    code: input.code || null,
    userId: input.userId || null,
    brands: input.brands ?? null,
  }));
}
