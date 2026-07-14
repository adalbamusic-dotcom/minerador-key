import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ViewPreferenceRepository } from "@/lib/server/editorial-repositories";
import { SavedGridViewSchema } from "@/lib/editorial/data-grid";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { PermissionModuleSchema } from "@/lib/editorial/operational-flow";

const QuerySchema = z.object({ brandId: z.string().uuid(), module: z.string().min(1) });

export async function GET(request: NextRequest) {
  try { const profile = await requireSessionProfile(); const query = QuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams)); const permissionModule = PermissionModuleSchema.parse(query.module.split(":")[0]); await assertEditorialPermission(profile, query.brandId, permissionModule, "view");
    const userKey = profile.email.toLowerCase(); const views = (await new ViewPreferenceRepository().list(query.brandId, userKey)).filter(view => view.module === query.module); return NextResponse.json({ views, persisted: true });
  } catch (error) { return response(error); }
}
export async function POST(request: NextRequest) {
  try { const profile = await requireSessionProfile(); const view = SavedGridViewSchema.parse(await request.json()); const permissionModule = PermissionModuleSchema.parse(view.module.split(":")[0]); await assertEditorialPermission(profile, view.brandId, permissionModule, "view");
    const userKey = profile.email.toLowerCase(); await new ViewPreferenceRepository().save({ ...view, userId: userKey }, userKey); return NextResponse.json({ view: { ...view, userId: userKey }, persisted: true });
  } catch (error) { return response(error); }
}
export async function DELETE(request: NextRequest) {
  try { const profile = await requireSessionProfile(); const query = QuerySchema.extend({ id: z.string().uuid() }).parse(Object.fromEntries(request.nextUrl.searchParams)); const permissionModule = PermissionModuleSchema.parse(query.module.split(":")[0]); await assertEditorialPermission(profile, query.brandId, permissionModule, "view");
    await new ViewPreferenceRepository().delete(query.id, query.brandId, profile.email.toLowerCase()); return NextResponse.json({ ok: true });
  } catch (error) { return response(error); }
}
function response(error: unknown) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Visualização inválida." }, { status: 400 }); if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 }); const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
