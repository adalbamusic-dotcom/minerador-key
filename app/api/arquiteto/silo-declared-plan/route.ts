import { NextResponse } from "next/server";
import { z } from "zod";
import { handleSiloDeclaredPlan, siloDeclaredPlanRuntime } from "@/lib/server/arquiteto-silo-declared-plan";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * "Aplicar o plano declarado ao Silo" (SDD 2026-10-12 §11 passo 7, D7).
 *
 * `preview` só lê (permissão de leitura do Arquiteto) e devolve o
 * `decisionHash`. `apply` exige edição — o par SiloDNA + SiloPage vai pelo
 * `persistSiloPairAtomic`, que só aceita `create`/`edit` — e aprovação, porque
 * a versão nova do par nasce aprovada, como na retirada e na consolidação.
 *
 * POST nunca é cacheado (Next 16, Route Handlers): sem configuração de cache.
 */
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  siloId: z.string().min(1),
  mode: z.enum(["preview", "apply"]),
  /** A versão do SiloDNA que a prévia mostrou; diferente da vigente = recusa. */
  expectedSiloDnaVersionId: z.string().min(1).optional(),
  /** O hash da prévia aceita; `apply` só grava com o mesmo. */
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({
      brandId: parsed.brandId,
      module: "arquiteto",
      action: parsed.mode === "apply" ? "edit" : "view",
    });
    if (parsed.mode === "apply") {
      await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: "approve" });
    }
    const result = await handleSiloDeclaredPlan(siloDeclaredPlanRuntime(context), {
      siloId: parsed.siloId,
      mode: parsed.mode,
      expectedSiloDnaVersionId: parsed.expectedSiloDnaVersionId ?? null,
      decisionHash: parsed.decisionHash ?? null,
    });
    if (result.state === "REFUSED") {
      return NextResponse.json({ success: false, error: result.message, code: result.code, ...(result.rework ? { rework: result.rework } : {}) }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido de aplicação do plano inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
