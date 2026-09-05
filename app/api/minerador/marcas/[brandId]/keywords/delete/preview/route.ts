import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { lifecycleErrorResponse, requireMineradorLifecyclePermission } from "@/lib/server/minerador-keyword-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const InputSchema = z.object({
  keywordIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const input = InputSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    await requireMineradorLifecyclePermission(profile, brandId, "manage");

    const { data, error } = await profile.supabase.rpc("lifecycle_preview_minerador_keywords", {
      p_brand_id: brandId,
      p_keyword_ids: input.keywordIds,
      p_actor_user_id: profile.userId,
    });
    if (error) throw error;
    const payload = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const items = (Array.isArray(payload.items) ? payload.items : []).map((value: unknown) => {
      const impact = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const root = impact.root && typeof impact.root === "object" ? impact.root as Record<string, unknown> : {};
      return {
        id: typeof root.id === "string" ? root.id : null,
        keyword: typeof root.label === "string" ? root.label : "",
        isPublished: impact.mode === "recoverable",
        publicationSource: impact.mode === "recoverable" ? "server_canonical" : "none",
        alreadyRecoverable: impact.recoveryState === "recoverable",
        impact,
      };
    }).filter((item): item is { id: string; keyword: string; isPublished: boolean; publicationSource: string; alreadyRecoverable: boolean; impact: Record<string, unknown> } => typeof item.id === "string");
    const publishedIds = Array.isArray(payload.publishedIds) ? payload.publishedIds : [];
    const hardDeleteIds = Array.isArray(payload.hardDeleteIds) ? payload.hardDeleteIds : [];
    const blockedIds = Array.isArray(payload.blockedIds) ? payload.blockedIds : [];
    return NextResponse.json({
      success: true,
      items,
      publishedIds,
      hardDeleteIds,
      blockedIds,
      requiresRecoverableConfirmation: publishedIds.length > 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, code: "KEYWORD_DELETE_NOT_FOUND", message: "Seleção de keywords inválida." }, { status: 400 });
    return lifecycleErrorResponse(error);
  }
}
