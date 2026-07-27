import { NextResponse } from "next/server";
import { authzErrorResponse, requireSessionProfile } from "@/lib/server/authz";
import { listAccessibleTenantIds } from "@/lib/server/tenant-context";

export async function GET() {
  try {
    return NextResponse.json({ tenants: await listAccessibleTenantIds(await requireSessionProfile()) });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
