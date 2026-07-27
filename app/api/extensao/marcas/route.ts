import { NextRequest } from "next/server";
import { buildBrandRef, type TenantRouteModule } from "@/lib/tenant-routing";
import { canAccessTenantModule, listAccessibleTenantIds, resolveTenantContext } from "@/lib/server/tenant-context";
import { consumeExtensionRateLimit } from "@/lib/server/extension-rate-limit";
import { logExtensionEvent, requireExtensionSessionProfile } from "@/lib/server/extension-auth";
import { extensionErrorResponse, extensionJson, extensionRequestId } from "@/lib/server/extension-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MINERADOR_MODULE: TenantRouteModule = "minerador";

export async function GET(request: NextRequest) {
  const requestId = extensionRequestId();
  const endpoint = "/api/extensao/marcas";
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

    const candidates = await listAccessibleTenantIds(profile);
    const brands: Array<{ brandId: string; brandRef: string; name: string; isActive: true; capabilities: string[] }> = [];
    for (const candidate of candidates) {
      try {
        const context = await resolveTenantContext({ brandId: candidate.id, profile });
        if (!canAccessTenantModule(context, MINERADOR_MODULE)) continue;
        brands.push({
          brandId: context.brandId,
          brandRef: buildBrandRef(context.brandName, context.brandId),
          name: context.brandName,
          isActive: true,
          capabilities: context.permissions.filter(permission => permission.startsWith("minerador:")),
        });
      } catch (error) {
        if (error && typeof error === "object" && "status" in error && (error as { status?: unknown }).status === 403) continue;
        throw error;
      }
    }

    const code = brands.length ? "ok" : "no_brands";
    logExtensionEvent({ requestId, endpoint, result: code, code, userId, brands: brands.length });
    return extensionJson({ ok: true, requestId, code, brands });
  } catch (error) {
    return extensionErrorResponse({ requestId, endpoint, error, userId });
  }
}
