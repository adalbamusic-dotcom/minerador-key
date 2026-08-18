import { NextResponse } from "next/server";
import {
  findPendingAgencyOnboarding,
  listCanonicalAccessibleAgencies,
  listCanonicalAccessibleBrands,
} from "@/lib/server/canonical-authorization";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";

function errorResponse(error: unknown) {
  if (error instanceof CanonicalAuthorizationError) {
    return NextResponse.json(
      { code: error.code, error: error.status >= 500 ? "Não foi possível carregar seus contextos." : error.message },
      { status: error.status },
    );
  }
  return NextResponse.json({ code: "CONTEXTS_UNAVAILABLE", error: "Não foi possível carregar seus contextos." }, { status: 503 });
}

/** Canonical context index. It never selects a tenant on behalf of the actor. */
export async function GET() {
  try {
    const [brands, agencies, pendingOnboarding] = await Promise.all([
      listCanonicalAccessibleBrands("marca"),
      listCanonicalAccessibleAgencies(),
      findPendingAgencyOnboarding(),
    ]);
    return NextResponse.json({
      isPlatformAdmin: brands.isPlatformAdmin,
      brands: brands.brands,
      operationalAgency: agencies.operationalAgency,
      agency: agencies.operationalAgency,
      agencies: agencies.agencies,
      pendingOnboarding,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
