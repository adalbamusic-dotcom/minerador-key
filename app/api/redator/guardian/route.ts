import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { RedatorGuardianRequestSchema } from "@/lib/redator/contracts";
import { runGuardian } from "@/lib/redator/guardian";

export async function POST(request: NextRequest) {
  try {
    const profile = await requireSessionProfile();
    const input = RedatorGuardianRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "review");
    return NextResponse.json({ report: runGuardian(input.document, input.contentHash) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Pedido de análise inválido.", details: error.issues }, { status: 400 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
