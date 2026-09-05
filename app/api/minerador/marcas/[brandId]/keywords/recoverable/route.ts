import { NextResponse } from "next/server";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { lifecycleErrorResponse, requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const profile = await requireCanonicalSessionProfile();
    await requireMineradorLifecyclePermission(profile, brandId, "view");
    const { data, error } = await profile.supabase
      .from("minerador_keywords")
      .select("*")
      .eq("brand_id", brandId)
      .not("deleted_at", "is", null)
      .gt("purge_after", new Date().toISOString())
      .order("purge_after", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ success: true, items: data || [] });
  } catch (error) {
    return lifecycleErrorResponse(error);
  }
}

