import { NextResponse } from "next/server";
import { DifferentiationPlanRequestSchema, handleDifferentiationPlan } from "@/lib/server/arquiteto-differentiation";
import { differentiationErrorResponse } from "@/lib/server/arquiteto-differentiation-http";
import { proposeDifferentiationAiAngles } from "@/lib/server/arquiteto-differentiation-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * PUBLICADOS QUE DISPUTAM O MESMO ASSUNTO — DETECÇÃO E PRÉVIA (GRÁTIS).
 *
 * SDD: docs/04-arquiteto/sdd-diferenciacao-publicados-canibalizados-2026-09-27.md.
 *
 * Sem `groupId`: lê o cache de SERP e devolve os grupos (permissão de ver o
 * Arquiteto). Com `groupId`: monta os ângulos (IA só com `ai: true`), o plano
 * com a faixa de custo, o teto de US$ 0,50 por grupo e o hash, e grava a
 * prévia na proposta (permissão de editar). Com `resume`, só relê a prévia e a
 * avaliação gravadas (permissão de ver). Nada é pago aqui; nenhum provider
 * de SEO é chamado. A marca e o ator vêm do contexto resolvido no servidor.
 */
export async function POST(request: Request) {
  try {
    const parsed = DifferentiationPlanRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, code: "INVALID_DIFFERENTIATION_REQUEST", error: "Pedido de diferenciação inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: parsed.data.groupId && !parsed.data.resume ? "edit" : "view" });
    const outcome = await handleDifferentiationPlan({
      store: context,
      now: () => new Date(),
      proposeAiAngles: prompt => proposeDifferentiationAiAngles({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase, ...prompt }),
    }, parsed.data);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    const mapped = differentiationErrorResponse(error, "Não foi possível ler os publicados que disputam o mesmo assunto.");
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
