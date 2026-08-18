export const SUPABASE_TOKEN_REFRESH_MARGIN_SECONDS = 60;

export const SUPABASE_SESSION_REASONS = [
  "SESSION_LOADING",
  "SUPABASE_SESSION_MISSING",
  "GOOGLE_ID_TOKEN_MISSING",
  "SUPABASE_GOOGLE_EXCHANGE_FAILED",
  "SUPABASE_ACCESS_TOKEN_MISSING",
  "SUPABASE_REFRESH_TOKEN_MISSING",
  "SUPABASE_TOKEN_INVALID_CLAIMS",
  "SUPABASE_TOKEN_EXPIRED",
  "SUPABASE_TOKEN_REFRESH_FAILED",
  "SUPABASE_SESSION_READY",
] as const;

export type SupabaseSessionReason = typeof SUPABASE_SESSION_REASONS[number];

export type SupabaseSessionFailureReason = Exclude<SupabaseSessionReason, "SUPABASE_SESSION_READY">;

export function getSupabaseSessionErrorMessage(reason: SupabaseSessionFailureReason, expiresAt: number | null = null): string {
  const actuallyExpired = expiresAt !== null && expiresAt * 1000 <= Date.now();
  if (reason === "SUPABASE_TOKEN_EXPIRED" && actuallyExpired) return "Sua sessão expirou. Entre novamente.";
  if (reason === "SUPABASE_TOKEN_REFRESH_FAILED") return "Não foi possível renovar sua sessão. Entre novamente.";
  if (reason === "SUPABASE_GOOGLE_EXCHANGE_FAILED") return "Não foi possível criar sua sessão de dados. Verifique o login Google e tente novamente.";
  if (reason === "GOOGLE_ID_TOKEN_MISSING") return "O login Google não forneceu os dados necessários. Entre novamente.";
  if (reason === "SUPABASE_ACCESS_TOKEN_MISSING" || reason === "SUPABASE_REFRESH_TOKEN_MISSING") {
    return "A sessão de dados ainda não está pronta. Saia e entre novamente para continuar.";
  }
  if (reason === "SUPABASE_SESSION_MISSING") return "Sua sessão não foi encontrada. Entre novamente para continuar.";
  if (reason === "SUPABASE_TOKEN_INVALID_CLAIMS") return "A sessão de dados recebida é inválida. Entre novamente.";
  return "A sessão de dados está sendo preparada. Tente novamente em instantes.";
}

export type SupabaseJwtMetadata = {
  issuer: string | null;
  audience: string | string[] | null;
  subject: string | null;
  role: string | null;
  issuedAt: number | null;
  expiresAt: number | null;
  expired: boolean;
};

export class SupabaseTokenValidationError extends Error {
  readonly code: "SUPABASE_TOKEN_INVALID_CLAIMS" | "SUPABASE_TOKEN_EXPIRED";

  constructor(message: string, code: "SUPABASE_TOKEN_INVALID_CLAIMS" | "SUPABASE_TOKEN_EXPIRED" = "SUPABASE_TOKEN_INVALID_CLAIMS") {
    super(message);
    this.name = "SupabaseTokenValidationError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeJwtPayload(accessToken: string): Record<string, unknown> {
  const parts = accessToken.split(".");
  if (parts.length !== 3) throw new SupabaseTokenValidationError("JWT malformado.");

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!isRecord(payload)) throw new SupabaseTokenValidationError("Payload JWT inválido.");
    return payload;
  } catch (error) {
    if (error instanceof SupabaseTokenValidationError) throw error;
    throw new SupabaseTokenValidationError("Payload JWT inválido.");
  }
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  return typeof payload[key] === "number" && Number.isFinite(payload[key])
    ? payload[key] as number
    : null;
}

export function readSupabaseJwtMetadata(accessToken: string, now = Date.now()): SupabaseJwtMetadata {
  const payload = decodeJwtPayload(accessToken);
  const expiresAt = readNumber(payload, "exp");
  const audience = typeof payload.aud === "string"
    ? payload.aud
    : Array.isArray(payload.aud) && payload.aud.every(item => typeof item === "string")
      ? payload.aud as string[]
      : null;

  return {
    issuer: typeof payload.iss === "string" ? payload.iss : null,
    audience,
    subject: typeof payload.sub === "string" ? payload.sub : null,
    role: typeof payload.role === "string" ? payload.role : null,
    issuedAt: readNumber(payload, "iat"),
    expiresAt,
    expired: expiresAt === null || expiresAt * 1000 <= now,
  };
}

function hasAuthenticatedAudience(audience: SupabaseJwtMetadata["audience"]): boolean {
  return audience === "authenticated" || (Array.isArray(audience) && audience.includes("authenticated"));
}

export function assertUsableSupabaseJwt(
  accessToken: string,
  now = Date.now(),
  marginSeconds = SUPABASE_TOKEN_REFRESH_MARGIN_SECONDS
): SupabaseJwtMetadata {
  const metadata = readSupabaseJwtMetadata(accessToken, now);
  const minimumExpiry = Math.floor(now / 1000) + marginSeconds;

  if (!metadata.subject) throw new SupabaseTokenValidationError("JWT sem subject.");
  if (metadata.role !== "authenticated" || !hasAuthenticatedAudience(metadata.audience)) {
    throw new SupabaseTokenValidationError("JWT não é um token authenticated do Supabase.");
  }
  if (metadata.expiresAt === null) {
    throw new SupabaseTokenValidationError("JWT sem expiração válida.");
  }
  if (metadata.expired || metadata.expiresAt <= minimumExpiry) {
    throw new SupabaseTokenValidationError("JWT expirado ou próximo da expiração.", "SUPABASE_TOKEN_EXPIRED");
  }

  return metadata;
}

export function isJwtExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return code === "pgrst301" || code === "pgrst303" || message.includes("jwt expired") || message.includes("invalid jwt");
}
