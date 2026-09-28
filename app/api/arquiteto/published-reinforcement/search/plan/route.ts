import { NextResponse } from "next/server";
import { ReinforcementSearchPlanRequestSchema, handleReinforcementSearchPlan } from "@/lib/server/arquiteto-published-reinforcement-search";
import { differentiationErrorResponse } from "@/lib/server/arquiteto-differentiation-http";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * REFORÇAR PUBLICADOS — A PRÉVIA DA BUSCA EM LOTE (GRÁTIS).
 *
 * SDD: docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md §4.
 *
 * Recebe os publicados "sem par no lote", separa os que disputam o mesmo
 * assunto com outro publicado (esses seguem pela diferenciação), monta o plano
 * com a faixa de custo, o teto de US$ 1,00 por rodada e o hash, e grava a
 * prévia. Com `resume`, só relê a prévia e o resultado gravados. Nada é pago
 * aqui. A marca e o ator vêm do contexto resolvido no servidor.
 */
export async function POST(request: Request) {
  try {
    const parsed = ReinforcementSearchPlanRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, code: "INVALID_REINFORCEMENT_REQUEST", error: "Pedido da busca inválido. Nada foi gravado.", issues: parsed.error.flatten() }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: parsed.data.resume ? "view" : "edit" });
    const outcome = await handleReinforcementSearchPlan({ store: context, now: () => new Date() }, parsed.data);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    const mapped = differentiationErrorResponse(error, "Não foi possível montar a prévia da busca para os publicados.");
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
