export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!url || !key) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  return { url, key };
}
