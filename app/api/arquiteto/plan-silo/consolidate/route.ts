import { NextResponse } from "next/server";
import { z } from "zod";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { improvementRuntime } from "@/lib/server/arquiteto-article-improvement";
import { applyPlanConsolidationLine, applyPlanSiloConsolidation, PlanConsolidationStaleError, previewPlanConsolidation } from "@/lib/server/arquiteto-plan-consolidation";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * "CONSOLIDAR O SILO DO PLANO" (2026-10-14, noite; pedido do dono) e, desde
 * 2026-10-15, os DOIS ESCOPOS do mesmo núcleo ("Silo na aba Silos, artigos na
 * aba Artigos"):
 *
 * POST `{ brandId, groupId, mode: "preview" | "apply", scope?: "silo" | "articles", decisionHash?, acceptedKeywordIds?, keywordId? }`.
 *  - prévia: só leitura e grátis; serve aos dois escopos (`siloDecisionHash`
 *    para a aba Silos, `decisionHash` + linhas para a aba Artigos).
 *  - `scope: "silo"` (aba Silos): o Silo do plano pelo DNA do plano — reusa,
 *    confirma ou recria com nome/slug/objetivo do plano, põe nele as keywords
 *    do plano e a keyword do Silo (opcional), religa o grupo. Exige o
 *    `siloDecisionHash` da prévia.
 *  - `scope: "articles"` (padrão; aba Artigos): grava UMA linha aceita por
 *    chamada (ArticleDNA v1 do plano, sem SERP e sem IA), com o MESMO
 *    `decisionHash`. Nunca cria nem mexe no Silo.
 * Decisão humana: exige `arquiteto:approve`. Nada é apagado, nada é pago, nada
 * é gravado no Minerador.
 */
export const maxDuration = 120;

const PostSchema = z.object({
  brandId: z.string().uuid(),
  groupId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  scope: z.enum(["silo", "articles"]).optional(),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  acceptedKeywordIds: z.array(z.string().uuid()).max(200).optional(),
  keywordId: z.string().uuid().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const input = PostSchema.parse(await request.json());
    if (input.mode === "apply" && input.scope === "silo" && !input.decisionHash) {
      return NextResponse.json({ success: false, error: "Consolidar o Silo do plano exige o hash da prévia.", code: "DECISION_HASH_REQUIRED" }, { status: 400 });
    }
    if (input.mode === "apply" && input.scope !== "silo" && (!input.decisionHash || !input.acceptedKeywordIds?.length || !input.keywordId)) {
      return NextResponse.json({ success: false, error: "Formar os artigos do plano exige o decisionHash da prévia, as linhas aceitas e a linha desta chamada.", code: "DECISION_HASH_REQUIRED" }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: input.brandId, module: "arquiteto", action: "approve" });
    if (input.mode === "preview") {
      return NextResponse.json({ success: true, mode: "preview", readOnly: true, data: await previewPlanConsolidation(context, input.groupId) });
    }
    if (input.scope === "silo") {
      return NextResponse.json({ success: true, mode: "apply", scope: "silo", data: await applyPlanSiloConsolidation(context, { groupId: input.groupId, decisionHash: input.decisionHash! }) });
    }
    const data = await applyPlanConsolidationLine(improvementRuntime(context), { groupId: input.groupId, decisionHash: input.decisionHash!, acceptedKeywordIds: input.acceptedKeywordIds!, keywordId: input.keywordId! });
    return NextResponse.json({ success: true, mode: "apply", scope: "articles", data });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O pedido para consolidar o Silo do plano é inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    if (error instanceof PlanConsolidationStaleError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
