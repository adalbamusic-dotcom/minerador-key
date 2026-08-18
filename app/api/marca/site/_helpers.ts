import { z } from "zod";
import { assertCanAccessMarca, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";

export const SiteBrandRequestSchema = z.object({ brandId: z.string().uuid() });

export async function authorizedSiteBrand(brandId: string) {
  const profile = await requireCanonicalSessionProfile();
  await assertCanAccessMarca(profile.userId, brandId, profile);
  const { data, error } = await profile.supabase.from("marcas").select("id,site_url").eq("id", brandId).single();
  if (error || !data) throw new Error("Marca não encontrada.");
  if (!data.site_url) throw new Error("Cadastre o site principal antes de usar o sitemap.");
  const primaryUrl = normalizeSiteUrl(data.site_url);
  return { profile, brandId, primaryUrl, primaryHost: new URL(primaryUrl).hostname };
}
