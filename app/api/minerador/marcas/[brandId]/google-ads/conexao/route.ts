import { NextRequest, NextResponse } from "next/server";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { GoogleAdsConfigurationBlocker, resolveGoogleAdsCanonicalContext } from "@/lib/server/google-ads-canonical";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function responseError(error: unknown) {
  if (error instanceof AuthzError) return { status: error.status, code: "GOOGLE_ADS_CONNECTION_FORBIDDEN", stage: "authorization", message: error.message, diagnostic: { apiRequestStarted: false, source: "platform_env" } };
  if (error instanceof GoogleAdsConfigurationBlocker) return { status: error.status, code: error.code, stage: "configuration_validation", message: error.message, diagnostic: { apiRequestStarted: false, source: "platform_env" } };
  return { status: 503, code: "GOOGLE_ADS_PLATFORM_ENV_UNAVAILABLE", stage: "configuration_validation", message: "A infraestrutura Google Ads não está configurada.", diagnostic: { apiRequestStarted: false, source: "platform_env" } };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  void request;
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return NextResponse.json({ success: false, code: "BRAND_NOT_FOUND", message: "Marca inválida." }, { status: 404 });
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "view", profile });
    const platform = await resolveGoogleAdsCanonicalContext({ actorUserId: profile.userId, agencyId: context.agencyId, brandId: context.brandId, operation: "discovery" });
    return NextResponse.json({
      success: true,
      connection: {
        customerIdRef: `******${platform.customerId.slice(-4)}`,
        status: "platform_env",
        validatedAt: null,
        source: "platform_env",
      },
    });
  } catch (error) {
    const mapped = responseError(error);
    return NextResponse.json({ success: false, ...mapped }, { status: mapped.status });
  }
}

export async function POST() {
  const mapped = responseError(new GoogleAdsConfigurationBlocker("GOOGLE_ADS_PLATFORM_READ_ONLY", "Google Ads é infraestrutura fixa da Plataforma e não possui configuração por Brand.", 409));
  return NextResponse.json({ success: false, ...mapped }, { status: mapped.status });
}
