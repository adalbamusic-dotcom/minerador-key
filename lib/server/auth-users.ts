import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUserSummary = {
  id: string;
  email: string;
  name: string | null;
  emailConfirmed: boolean;
  confirmedAt: string | null;
};

function userName(user: { user_metadata?: unknown; email?: string | null }) {
  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata as Record<string, unknown> : {};
  for (const key of ["full_name", "name", "display_name"]) {
    if (typeof metadata[key] === "string" && metadata[key].trim()) return metadata[key].trim();
  }
  return null;
}

function summarizeUser(user: { id: string; email?: string | null; user_metadata?: unknown; email_confirmed_at?: string | null; confirmed_at?: string | null }): AuthUserSummary | null {
  const email = user.email?.trim();
  if (!email) return null;
  const confirmedAt = user.email_confirmed_at || user.confirmed_at || null;
  const emailConfirmed = Boolean(confirmedAt);
  return { id: user.id, email, name: userName(user), emailConfirmed, confirmedAt };
}

export async function searchAuthUsers(client: SupabaseClient, query: string, limit = 20): Promise<AuthUserSummary[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  const found: AuthUserSummary[] = [];

  for (let page = 1; page <= 100; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    for (const user of result.data.users) {
      const summary = summarizeUser(user);
      if (!summary) continue;
      const haystack = `${summary.email} ${summary.name || ""}`.toLowerCase();
      if (haystack.includes(normalized)) found.push(summary);
    }
    if (result.data.users.length < 1000) break;
  }

  return found.sort((a, b) => {
    const aExact = a.email.toLowerCase() === normalized ? 0 : 1;
    const bExact = b.email.toLowerCase() === normalized ? 0 : 1;
    return aExact - bExact || a.email.localeCompare(b.email);
  }).slice(0, limit);
}
