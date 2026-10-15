import { NextResponse } from "next/server";
import { z } from "zod";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { improvementRuntime } from "@/lib/server/arquiteto-article-improvement";
import { applyPlanConsolidationLine, PlanConsolidationStaleError, previewPlanConsolidation } from "@/lib/server/arquiteto-plan-consolidation";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * "CONSOLIDAR O SILO DO PLANO" (2026-10-14, noite; pedido do dono).
 *
 * POST `{ brandId, groupId, mode: "preview" | "apply", decisionHash?, acceptedKeywordIds?, keywordId? }`.
 * A prévia é só leitura e grátis. Aplicar exige o MESMO `decisionHash` e grava
 * UMA linha aceita por chamada (a tela repete para cada linha, sem novo
 * aceite): confirma/cria o Silo do plano e grava o ArticleDNA v1 do plano,
 * sem SERP e sem IA. Decisão humana: exige `arquiteto:approve`. Nada é apagado,
 * nada é pago, nada é gravado no Minerador.
 */
export const maxDuration = 120;

const PostSchema = z.object({
  brandId: z.string().uuid(),
  groupId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  acceptedKeywordIds: z.array(z.string().uuid()).max(200).optional(),
  keywordId: z.string().uuid().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const input = PostSchema.parse(await request.json());
    if (input.mode === "apply" && (!input.decisionHash || !input.acceptedKeywordIds?.length || !input.keywordId)) {
      return NextResponse.json({ success: false, error: "Consolidar exige o decisionHash da prévia, as linhas aceitas e a linha desta chamada.", code: "DECISION_HASH_REQUIRED" }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: input.brandId, module: "arquiteto", action: "approve" });
    if (input.mode === "preview") {
      return NextResponse.json({ success: true, mode: "preview", readOnly: true, data: await previewPlanConsolidation(context, input.groupId) });
    }
    const data = await applyPlanConsolidationLine(improvementRuntime(context), { groupId: input.groupId, decisionHash: input.decisionHash!, acceptedKeywordIds: input.acceptedKeywordIds!, keywordId: input.keywordId! });
    return NextResponse.json({ success: true, mode: "apply", data });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O pedido para consolidar o Silo do plano é inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    if (error instanceof PlanConsolidationStaleError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
