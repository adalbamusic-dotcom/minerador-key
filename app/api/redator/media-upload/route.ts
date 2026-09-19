import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { uploadWriterMediaAsset, WriterDeliverableError } from "@/lib/server/writer-deliverables";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const form = await request.formData();
    const brandId = z.string().uuid().parse(form.get("brandId"));
    const documentId = z.string().min(1).parse(form.get("documentId"));
    const assetId = z.string().uuid().parse(form.get("assetId"));
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ code: "file_required" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ code: "invalid_size" }, { status: 413 });
    await assertEditorialPermission(profile, brandId, "redator", "edit");
    const result = await uploadWriterMediaAsset({ brandId, documentId, assetId, bytes: Buffer.from(await file.arrayBuffer()), actorId: profile.userId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", issues: error.issues }, { status: 400 });
    if (error instanceof WriterDeliverableError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code }, { status: 503 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
