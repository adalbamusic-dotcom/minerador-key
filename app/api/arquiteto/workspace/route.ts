import { NextResponse } from "next/server";
import { z } from "zod";
import { loadCanonicalArquitetoWorkspace } from "@/lib/server/arquiteto-workspace";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

const QuerySchema = z.object({ brandId: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const query = QuerySchema.parse({ brandId: new URL(request.url).searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    return NextResponse.json({ success: true, data: await loadCanonicalArquitetoWorkspace(context) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "brandId é obrigatório e deve ser válido.", code: "INVALID_CONTEXT" }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
