import { NextResponse } from "next/server";
import { z } from "zod";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { applyRecreatePlanSilo, previewRecreatePlanSilo, RecreatePlanSiloStaleError } from "@/lib/server/arquiteto-plan-silo-recreate";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * "RECRIAR O SILO DO PLANO" (2026-10-14, caso WifiConecta, azul).
 *
 * POST `{ brandId, groupId, mode: "preview" | "apply", decisionHash? }`.
 * A prévia é só leitura (o Silo desfeito do plano e o que acontece com cada
 * keyword do grupo); aplicar exige o MESMO `decisionHash`, limpa o "desfeito"
 * só deste Silo, confirma, liga o grupo e põe nele as keywords sem artigo.
 * Decisão humana: exige `arquiteto:approve`. Nada é apagado; nada é pago.
 */

const PostSchema = z.object({
  brandId: z.string().uuid(),
  groupId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const input = PostSchema.parse(await request.json());
    if (input.mode === "apply" && !input.decisionHash) {
      return NextResponse.json({ success: false, error: "Recriar exige o decisionHash da prévia.", code: "DECISION_HASH_REQUIRED" }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: input.brandId, module: "arquiteto", action: "approve" });
    if (input.mode === "preview") {
      return NextResponse.json({ success: true, mode: "preview", readOnly: true, data: await previewRecreatePlanSilo(context, input.groupId) });
    }
    return NextResponse.json({ success: true, mode: "apply", data: await applyRecreatePlanSilo(context, { groupId: input.groupId, decisionHash: input.decisionHash! }) });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O pedido para recriar o Silo do plano é inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    if (error instanceof RecreatePlanSiloStaleError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
