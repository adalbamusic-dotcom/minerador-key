import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/lib/server/authz";
import { listCanonicalAccessibleBrands } from "@/lib/server/canonical-authorization";
import { TENANT_MODULES, type TenantModule } from "@/lib/server/tenant-context";

export async function GET(request: Request) {
  try {
    const requestedModule = new URL(request.url).searchParams.get("module");
    const requiredModule = requestedModule && (TENANT_MODULES as readonly string[]).includes(requestedModule)
      ? requestedModule as TenantModule
      : undefined;
    const result = await listCanonicalAccessibleBrands(requiredModule);
    return NextResponse.json({ tenants: result.brands });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
