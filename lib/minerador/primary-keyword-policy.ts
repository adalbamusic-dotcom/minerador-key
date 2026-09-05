import { isLegacyPublishedStatus } from "./editorial-status.ts";

export const PrimaryKeywordPolicies = ["locked", "reviewable", "free"] as const;
export type PrimaryKeywordPolicy = typeof PrimaryKeywordPolicies[number];

type Semantic = Record<string, unknown> | null | undefined;

export type PrimaryKeywordPolicyHistoryEntry = {
  previous: PrimaryKeywordPolicy;
  next: PrimaryKeywordPolicy;
  actorId: string;
  changedAt: string;
  reason?: string;
};

export function readPrimaryKeywordPolicy(input: { status?: string | null; semantic?: Semantic }): PrimaryKeywordPolicy {
  const explicit = input.semantic?.primary_keyword_policy;
  if (PrimaryKeywordPolicies.includes(explicit as PrimaryKeywordPolicy)) return explicit as PrimaryKeywordPolicy;
  return isLegacyPublishedStatus(input.status) ? "locked" : "free";
}

function readHistory(value: unknown): PrimaryKeywordPolicyHistoryEntry[] {
  if (Array.isArray(value)) return value.filter(entry => entry && typeof entry === "object") as PrimaryKeywordPolicyHistoryEntry[];
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === "object") as PrimaryKeywordPolicyHistoryEntry[] : []; }
  catch { return []; }
}

export function primaryKeywordPolicyLabel(policy: PrimaryKeywordPolicy): string {
  return ({ locked: "Principal travada", reviewable: "Principal revisável", free: "Keyword livre" } as const)[policy];
}

export function setPrimaryKeywordPolicy(
  semantic: Semantic,
  input: { status: string; publicationConfirmed?: boolean; keyword: string; policy: Extract<PrimaryKeywordPolicy, "locked" | "reviewable">; actorId: string; changedAt: string; reason?: string },
): Record<string, unknown> {
  const current = { ...(semantic ?? {}) };
  const previous = readPrimaryKeywordPolicy({ status: input.status, semantic: current });
  if (!isLegacyPublishedStatus(input.status) && input.publicationConfirmed !== true) return semantic && typeof semantic === "object" ? semantic : current;
  if (previous === input.policy) return semantic && typeof semantic === "object" ? semantic : current;
  const history = readHistory(current.primary_keyword_policy_history);
  history.push({ previous, next: input.policy, actorId: input.actorId, changedAt: input.changedAt, ...(input.reason ? { reason: input.reason } : {}) });
  const version = Number.isFinite(Number(current.primary_keyword_policy_version)) ? Number(current.primary_keyword_policy_version) : 0;
  return {
    ...current,
    primary_keyword_policy: input.policy,
    primary_keyword_published_original: typeof current.primary_keyword_published_original === "string" ? current.primary_keyword_published_original : input.keyword,
    primary_keyword_current: input.keyword,
    primary_keyword_policy_actor: input.actorId,
    primary_keyword_policy_at: input.changedAt,
    primary_keyword_policy_version: version + 1,
    primary_keyword_policy_history: JSON.stringify(history),
    primary_keyword_review_required: input.policy === "reviewable",
    ...(input.reason ? { primary_keyword_policy_reason: input.reason } : {}),
  };
}
