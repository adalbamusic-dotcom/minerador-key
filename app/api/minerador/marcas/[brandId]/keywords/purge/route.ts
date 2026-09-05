import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { lifecycleErrorResponse, parseRpcPayload, requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const InputSchema = z.object({ keywordIds: z.array(z.string().uuid()).min(1).max(100) });

/**
 * Administrative/server-side endpoint. The normal Minerador UI never calls
 * purge automatically; an operator invokes it only after purge_after.
 */
export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const input = InputSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    await requireMineradorLifecyclePermission(profile, brandId, "manage");
    const { data, error } = await profile.supabase.rpc("lifecycle_purge_minerador_keywords", {
      p_brand_id: brandId,
      p_keyword_ids: input.keywordIds,
      p_actor_user_id: profile.userId,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, ...parseRpcPayload(data) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, code: "KEYWORD_PURGE_FAILED", message: "Seleção de keywords inválida." }, { status: 400 });
    return lifecycleErrorResponse(error, "KEYWORD_PURGE_FAILED");
  }
}
