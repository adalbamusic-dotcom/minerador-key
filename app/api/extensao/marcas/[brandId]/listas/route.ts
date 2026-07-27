import { NextRequest } from "next/server";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { isTenantId } from "@/lib/tenant-routing";
import { logExtensionEvent, requireExtensionSessionProfile } from "@/lib/server/extension-auth";
import { consumeExtensionRateLimit } from "@/lib/server/extension-rate-limit";
import { extensionErrorResponse, extensionJson, extensionRequestId } from "@/lib/server/extension-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = extensionRequestId();
  const endpoint = "/api/extensao/marcas/:brandId/listas";
  let userId: string | undefined;
  try {
    const profile = await requireExtensionSessionProfile(request);
    userId = profile.userId;
    const limit = consumeExtensionRateLimit(profile.userId);
    if (!limit.allowed) {
      logExtensionEvent({ requestId, endpoint, result: "rate_limited", code: "rate_limited", userId: profile.userId });
      const message = "Muitas tentativas. Tente novamente em instantes.";
      return extensionJson({ ok: false, requestId, code: "rate_limited", message, error: message }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }

    const { brandId } = await params;
    if (!isTenantId(brandId)) {
      const message = "Marca inválida.";
      return extensionJson({ ok: false, requestId, code: "brand_not_found", message, error: message }, { status: 404 });
    }

    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "view", profile });
    const { data, error } = await profile.supabase
      .from("listas_kgr")
      .select("id,nome,marca_id")
      .eq("marca_id", context.brandId)
      .order("nome", { ascending: true });
    if (error) throw error;

    const lists = (data || []).filter(item => item.marca_id === context.brandId).map(item => ({
      listId: item.id,
      brandId: item.marca_id,
      name: item.nome,
    }));
    logExtensionEvent({ requestId, endpoint, result: "ok", code: lists.length ? "ok" : "no_lists", userId, brands: 1 });
    return extensionJson({ ok: true, requestId, code: lists.length ? "ok" : "no_lists", brandId: context.brandId, lists });
  } catch (error) {
    return extensionErrorResponse({ requestId, endpoint, error, userId });
  }
}
