import { NextRequest, NextResponse } from "next/server";
import { ArticleImprovementRequestSchema, handleArticleImprovement, improvementRuntime, projectImprovementRun } from "@/lib/server/arquiteto-article-improvement";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { ARTICLE_IMPROVEMENT_VERSION } from "@/lib/arquiteto/article-improvement";
import type { ImprovementRun } from "@/lib/server/arquiteto-article-improvement";
import { readAllPlanSheetRecoveryPages } from "@/lib/arquiteto/plan-sheet-recovery";

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
    if (request.nextUrl.searchParams.get("recovery") === "plan_sheet") {
      // Cursor by both fields: different runs may have the same created_at.
      // Fetch until an empty page, even if the server imposes a smaller page size.
      const rows = await readAllPlanSheetRecoveryPages(async cursor => {
        let query = context.supabase.from("editorial_workflow_items").select("id,created_at,updated_at,payload")
          .eq("marca_id", context.brandId).eq("subject_type", "article_improvement_run").eq("stage", "architect")
          .eq("payload->>actorId", context.actorUserId).eq("payload->>origin", "plan_sheet")
          .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
        if (cursor) query = query.or(`created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`);
        const result = await query;
        if (result.error) throw result.error;
        return result.data ?? [];
      });
      const runs = rows.map(row => {
        const run = row.payload as ImprovementRun;
        if (!run || run.version !== ARTICLE_IMPROVEMENT_VERSION || run.brandId !== context.brandId || run.actorId !== context.actorUserId || run.origin !== "plan_sheet" || !Array.isArray(run.proposals) || !Array.isArray(run.keywords) || !Array.isArray(run.outcomes) || !["prepared", "collecting", "applying", "complete"].includes(run.state)) throw new Error("Uma execução da planilha não pode ser lida com segurança.");
        if (typeof row.updated_at !== "string") throw new Error("Uma execução não tem data de atualização válida.");
        return { run: projectImprovementRun(run), updatedAt: row.updated_at, id: String(row.id) };
      });
      // The creation cursor is immutable; a later confirmation of an older
      // run must still invalidate an earlier draft when rebuilding the view.
      runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
      return NextResponse.json({ success: true, data: runs.map(item => item.run) });
    }
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
