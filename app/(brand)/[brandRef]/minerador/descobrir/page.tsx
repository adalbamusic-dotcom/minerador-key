import { DiscoveryKeywordsPage } from "@/modules/minerador";
import { redirect } from "next/navigation";
import { SupabaseSessionError } from "@/lib/server/supabase-session";
import { requireTenantModule } from "../../layout";

export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) {
  const { brandRef } = await params;
  try {
    await requireTenantModule(brandRef, "minerador");
  } catch (error) {
    if (error instanceof SupabaseSessionError) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`/${brandRef}/minerador/descobrir`)}`);
    }
    throw error;
  }
  return <DiscoveryKeywordsPage brandRef={brandRef}/>;
}
