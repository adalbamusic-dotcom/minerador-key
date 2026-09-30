import { NextRequest, NextResponse } from "next/server";
import { ArticleImprovementRequestSchema, handleArticleImprovement, improvementRuntime, projectImprovementRun } from "@/lib/server/arquiteto-article-improvement";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";

export const maxDuration = 120;
export async function POST(request: NextRequest) {
  try {
    const parsed = ArticleImprovementRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido de melhoria inválido.", issues: parsed.error.flatten() }, { status: 400 });
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: parsed.data.action === "status" ? "view" : "edit" });
    const run = await handleArticleImprovement(improvementRuntime(context), parsed.data);
    return NextResponse.json({ success: true, data: projectImprovementRun(run) });
  } catch (error) {
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
/** Resume from the server after F5; browser recovery storage grants no authority. */
export async function GET(request: NextRequest) {
  try {
    const brandId = request.nextUrl.searchParams.get("brandId") ?? "";
    const context = await resolvePipelineContext({ brandId, module: "arquiteto", action: "view" });
    const result = await context.supabase.from("editorial_workflow_items").select("payload")
      .eq("marca_id", context.brandId).eq("subject_type", "article_improvement_run").eq("stage", "architect")
      .eq("payload->>actorId", context.actorUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, data: result.data?.payload ? projectImprovementRun(result.data.payload) : null });
  } catch (error) {
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
