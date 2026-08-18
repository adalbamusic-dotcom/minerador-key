import { redirect } from "next/navigation";
import { PersonalAccountPage } from "@/modules/conta/personal-account-page";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";
import { getCanonicalPersonalAccount } from "@/lib/server/personal-account";
import { SupabaseSessionError } from "@/lib/server/supabase-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PersonalAccountRoute() {
  let account: Awaited<ReturnType<typeof getCanonicalPersonalAccount>>;
  try {
    account = await getCanonicalPersonalAccount();
  } catch (error) {
    if ((error instanceof CanonicalAuthorizationError && error.status === 401) || error instanceof SupabaseSessionError) {
      redirect("/login?callbackUrl=%2Fconta");
    }
    throw error;
  }
  return <PersonalAccountPage identity={account.identity} brands={account.brands} agencies={account.agencies} isPlatformAdmin={account.isPlatformAdmin} />;
}
