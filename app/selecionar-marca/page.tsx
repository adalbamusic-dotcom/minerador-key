import { redirect } from "next/navigation";
import { findPendingAgencyOnboarding, listCanonicalAccessibleBrands, requireCanonicalActorUserId } from "@/lib/server/canonical-authorization";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";
import { SupabaseSessionError } from "@/lib/server/supabase-session";

/**
 * Compatibility entry only. The former mandatory context-picker is retired;
 * canonical login restores a validated context or lands on a global surface.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SelectTenantPage() {
  let destination = "/conta";
  try {
    await requireCanonicalActorUserId();
    const [brands, pendingOnboarding] = await Promise.all([
      listCanonicalAccessibleBrands("marca"),
      findPendingAgencyOnboarding(),
    ]);
    if (brands.isPlatformAdmin) destination = "/admin";
    else if (pendingOnboarding) destination = "/onboarding/agencia";
  } catch (error) {
    if ((error instanceof CanonicalAuthorizationError && error.status === 401) || error instanceof SupabaseSessionError) {
      redirect("/login?callbackUrl=%2Fconta");
    }
    throw error;
  }
  redirect(destination);
}
