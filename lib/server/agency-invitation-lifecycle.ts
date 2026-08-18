export type AgencyInvitationEnvironment = "production" | "staging" | "development" | "test";

export type AgencyInvitationPolicy = {
  environment: AgencyInvitationEnvironment;
  ttlMs: number;
  ttlHours: number;
};

export const AGENCY_INVITATION_DURATION_DAYS = 7;
export const AGENCY_INVITATION_DEVELOPMENT_TTL_HOURS = 2;
export const AGENCY_INVITATION_PRODUCTION_TTL_MS = AGENCY_INVITATION_DURATION_DAYS * 24 * 60 * 60 * 1000;
export const AGENCY_INVITATION_DEVELOPMENT_TTL_MS = AGENCY_INVITATION_DEVELOPMENT_TTL_HOURS * 60 * 60 * 1000;
export const AGENCY_INVITATION_DURATION_MS = AGENCY_INVITATION_PRODUCTION_TTL_MS;

type PolicyInput = { environment?: AgencyInvitationEnvironment; ttlMs?: number };

function normalizeEnvironment(value: string | undefined): AgencyInvitationEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production") return "production";
  if (normalized === "staging" || normalized === "preview") return "staging";
  if (normalized === "development" || normalized === "dev") return "development";
  if (normalized === "test") return "test";
  return null;
}

function resolveEnvironment(env: Record<string, string | undefined>): AgencyInvitationEnvironment {
  const configured = env.AGENCY_INVITATION_ENV?.trim();
  if (configured) return normalizeEnvironment(configured) || "production";

  const deployment = env.VERCEL_ENV?.trim();
  if (deployment) return normalizeEnvironment(deployment) || "production";

  return normalizeEnvironment(env.NODE_ENV) || "production";
}

export function resolveAgencyInvitationPolicy(env: Record<string, string | undefined> = process.env, input: PolicyInput = {}): AgencyInvitationPolicy {
  const environment = input.environment || resolveEnvironment(env);
  const defaultTtlMs = environment === "production" || environment === "test"
    ? AGENCY_INVITATION_PRODUCTION_TTL_MS
    : AGENCY_INVITATION_DEVELOPMENT_TTL_MS;
  const ttlMs = input.ttlMs === undefined ? defaultTtlMs : input.ttlMs;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("AGENCY_INVITATION_TTL_INVALID");
  return { environment, ttlMs, ttlHours: ttlMs / (60 * 60 * 1000) };
}

export type AgencyInvitationRenewalDecision = "REUSE_CURRENT_INVITATION" | "CREATE_SUCCESSOR_INVITATION";

export function classifyAgencyInvitationRenewal(input: { status: string; expiresAt: string; now?: Date; policy?: AgencyInvitationPolicy }): AgencyInvitationRenewalDecision {
  const now = input.now || new Date();
  const expiresAt = new Date(input.expiresAt);
  const policy = input.policy || resolveAgencyInvitationPolicy();
  if (!Number.isFinite(expiresAt.getTime())) return "CREATE_SUCCESSOR_INVITATION";
  if (input.status !== "PENDING") return "CREATE_SUCCESSOR_INVITATION";
  if (expiresAt <= now || expiresAt.getTime() > now.getTime() + policy.ttlMs) return "CREATE_SUCCESSOR_INVITATION";
  return "REUSE_CURRENT_INVITATION";
}

export function canonicalAgencyInvitationExpiry(now = new Date(), policy = resolveAgencyInvitationPolicy()) {
  return new Date(now.getTime() + policy.ttlMs).toISOString();
}
