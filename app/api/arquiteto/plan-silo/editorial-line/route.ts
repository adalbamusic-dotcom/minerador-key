import { NextResponse } from "next/server";
import { z } from "zod";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { improvementRuntime } from "@/lib/server/arquiteto-article-improvement";
import { applyPlanEditorialLine, EditorialLineStaleError, previewPlanEditorialLine } from "@/lib/server/arquiteto-plan-editorial-line";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * ETAPA 3 DA ABA ARTIGOS · "LINHA EDITORIAL" (2026-10-15, pedido do dono).
 *
 * POST `{ brandId, groupId, mode: "preview" | "apply", articleId?, lineHash? }`.
 * A prévia é só leitura e grátis (sem IA). Aplicar grava UM artigo por chamada
 * (ArticleDNA v+1, decisão humana) com o `lineHash` dele na prévia; a tela
 * repete para cada artigo aceito, sem novo aceite. Exige `arquiteto:approve`.
 * Nada é apagado, nada é pago, nada vai ao Minerador nem ao Redator.
 */
export const maxDuration = 120;

const PostSchema = z.object({
  brandId: z.string().uuid(),
  groupId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  articleId: z.string().min(1).max(200).optional(),
  lineHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const input = PostSchema.parse(await request.json());
    if (input.mode === "apply" && (!input.articleId || !input.lineHash)) {
      return NextResponse.json({ success: false, error: "Gravar a linha editorial exige o artigo e o hash dele na prévia.", code: "DECISION_HASH_REQUIRED" }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: input.brandId, module: "arquiteto", action: "approve" });
    if (input.mode === "preview") return NextResponse.json({ success: true, mode: "preview", readOnly: true, data: await previewPlanEditorialLine(context, input.groupId) });
    const data = await applyPlanEditorialLine(improvementRuntime(context), { groupId: input.groupId, articleId: input.articleId!, lineHash: input.lineHash! });
    return NextResponse.json({ success: true, mode: "apply", data });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O pedido da linha editorial é inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    if (error instanceof EditorialLineStaleError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
