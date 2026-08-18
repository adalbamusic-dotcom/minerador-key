export type AuthFailureCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_CONFIRMED"
  | "EXISTING_IDENTITY_REUSED"
  | "PASSWORD_MISMATCH"
  | "RATE_LIMITED"
  | "CONFIGURATION"
  | "NETWORK"
  | "OUTRO";

export type AuthLikeError = { code?: string | null; status?: number | null; message?: string | null; name?: string | null } | null | undefined;

function authErrorFields(error: unknown): AuthLikeError {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : null,
    status: typeof candidate.status === "number" ? candidate.status : null,
    message: typeof candidate.message === "string" ? candidate.message : null,
    name: typeof candidate.name === "string" ? candidate.name : null,
  };
}

export function classifyAuthError(error: unknown): AuthFailureCode {
  const fields = authErrorFields(error);
  const code = fields?.code?.toLowerCase() || "";
  const message = fields?.message?.toLowerCase() || "";
  if (code === "email_not_confirmed" || /email not confirmed|email.*confirm/i.test(message)) return "EMAIL_NOT_CONFIRMED";
  if (code === "user_already_exists" || /already registered|already exists|email.*exist/i.test(message)) return "EXISTING_IDENTITY_REUSED";
  if (code === "too_many_requests" || code === "over_request_rate_limit" || fields?.status === 429 || /rate limit|too many requests|too many attempts/i.test(message)) return "RATE_LIMITED";
  if (code === "invalid_api_key" || code === "configuration_error" || /supabase_public_config_missing|invalid api key|missing.*supabase|invalid.*supabase.*url/i.test(`${code} ${message}`)) return "CONFIGURATION";
  if (fields?.name === "AuthRetryableFetchError" || /failed to fetch|network|fetch.*failed|timed out|timeout/i.test(message)) return "NETWORK";
  if (code === "invalid_credentials" || code === "invalid_grant" || /invalid login credentials|invalid credentials/i.test(message)) return "INVALID_CREDENTIALS";
  return "OUTRO";
}

export function authFailureMessage(failure: AuthFailureCode): string {
  switch (failure) {
    case "EMAIL_NOT_CONFIRMED": return "Seu e-mail ainda não foi confirmado.";
    case "INVALID_CREDENTIALS": return "E-mail ou senha incorretos.";
    case "RATE_LIMITED": return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "CONFIGURATION": return "Não foi possível conectar ao serviço de autenticação. Verifique a configuração local e tente novamente.";
    case "NETWORK": return "Não foi possível conectar ao serviço de autenticação. Verifique sua conexão e tente novamente.";
    default: return "Não foi possível concluir o login. Tente novamente.";
  }
}

/** Development-only diagnostic without exposing provider messages or secrets. */
export function authFailureDiagnostic(error: unknown, failure: AuthFailureCode) {
  const fields = authErrorFields(error);
  return { category: failure, providerCode: fields?.code || null, status: fields?.status || null };
}
