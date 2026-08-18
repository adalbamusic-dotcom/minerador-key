import { NextResponse } from "next/server";
import { z } from "zod";
import { createMineradorArquitetoHandoff } from "@/lib/server/arquiteto-workspace";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

const RequestSchema = z.object({
  brandId: z.string().uuid(),
  keywordIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: "create" });
    const result = await createMineradorArquitetoHandoff(context, parsed.keywordIds);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O handoff exige uma Brand e keywords válidas.", code: "INVALID_CONTEXT" }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
