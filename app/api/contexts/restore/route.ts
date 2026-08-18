import { NextRequest, NextResponse } from "next/server";
import { buildAgencyRef } from "@/lib/agency-routing";
import { switchTenantPath } from "@/lib/tenant-routing";
import type { StoredGlobalNavigationContext } from "@/lib/navigation/global-context";
import { listCanonicalAccessibleAgencies, listCanonicalAccessibleBrands, requireCanonicalActorUserId } from "@/lib/server/canonical-authorization";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function failureResponse(error: unknown) {
  if (error instanceof CanonicalAuthorizationError) {
    return NextResponse.json({ target: null, code: error.status === 401 ? "AUTH_REQUIRED" : "CONTEXT_UNAVAILABLE" }, { status: error.status });
  }
  return NextResponse.json({ target: null, code: "CONTEXT_UNAVAILABLE" }, { status: 503 });
}

function validInput(value: unknown): value is StoredGlobalNavigationContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredGlobalNavigationContext>;
  return (candidate.kind === "brand" || candidate.kind === "agency" || candidate.kind === "account" || candidate.kind === "admin")
    && typeof candidate.pathname === "string"
    && candidate.pathname.startsWith("/")
    && !candidate.pathname.startsWith("//")
    && !candidate.pathname.includes("\\")
    && candidate.pathname.length <= 512
    && typeof candidate.search === "string"
    && candidate.search.length <= 2048;
}

function agencySuffix(pathname: string) {
  const match = pathname.match(/^\/agencias\/[^/]+(\/membros|\/marcas|\/configuracoes)?\/?$/);
  return match ? match[1] || "" : "";
}

export async function POST(request: NextRequest) {
  try {
    await requireCanonicalActorUserId();
    const input = await request.json() as unknown;
    if (!validInput(input)) return NextResponse.json({ target: null, code: "CONTEXT_INVALID" }, { status: 400 });

    if (input.kind === "account") return NextResponse.json({ target: "/conta" }, { headers: { "Cache-Control": "no-store" } });

    const [brands, agencies] = await Promise.all([
      input.kind === "brand" || input.kind === "admin" ? listCanonicalAccessibleBrands("marca") : Promise.resolve(null),
      input.kind === "agency" ? listCanonicalAccessibleAgencies() : Promise.resolve(null),
    ]);

    if (input.kind === "admin") {
      return NextResponse.json({ target: brands?.isPlatformAdmin ? "/admin" : null }, { headers: { "Cache-Control": "no-store" } });
    }

    if (input.kind === "brand" && brands && input.brandId) {
      const brand = brands.brands.find((candidate) => candidate.id === input.brandId);
      if (brand) {
        const target = switchTenantPath({
          targetBrand: { brandId: brand.id, brandName: brand.nome },
          pathname: input.pathname,
          search: input.search,
        });
        return NextResponse.json({ target }, { headers: { "Cache-Control": "no-store" } });
      }
    }

    if (input.kind === "agency" && agencies && input.agencyId) {
      const agency = agencies.agencies.find((candidate) => candidate.id === input.agencyId);
      if (agency) {
        const canonicalRef = buildAgencyRef(agency.name, agency.id);
        return NextResponse.json({ target: `/agencias/${canonicalRef}${agencySuffix(input.pathname)}` }, { headers: { "Cache-Control": "no-store" } });
      }
    }

    return NextResponse.json({ target: null, code: "CONTEXT_NOT_AUTHORIZED" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failureResponse(error);
  }
}
