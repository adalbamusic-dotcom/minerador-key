import { NextResponse } from "next/server";
import { z } from "zod";
import {
  HOMOLOGATION_FRESH_STAGE,
  homologationFreshPhrase,
  planHomologationFresh,
  type FreshWorkflowRow,
} from "@/lib/arquiteto/homologation-fresh";
import {
  HOMOLOGATION_ROUND_SUBJECT_TYPE,
  activeHomologationRound,
  buildHomologationRoundMarker,
  type HomologationRound,
} from "@/lib/arquiteto/homologation-round";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * REINICIAR A RODADA DE HOMOLOGAÇÃO.
 *
 * Operação destrutiva da CÓPIA DE TRABALHO — e só dela. Nenhuma linha de
 * `editorial_artifact_versions` é tocada aqui: ArticleDNA, SiloDNA, SiloPage e
 * InternalLinkGraph continuam no acervo, aprovados ou propostos.
 *
 * TRÊS TRAVAS, e nenhuma delas vem do cliente:
 *
 *  1. o modo de homologação é lido de `ARQUITETO_HOMOLOGATION_MODE`, variável
 *     SERVER-ONLY. A variável pública controla só a visibilidade do botão; se
 *     alguém ligar apenas ela, a rota recusa;
 *  2. a marca vem de `resolvePipelineContext`, nunca do corpo;
 *  3. a frase de confirmação é derivada do TAMANHO do plano recalculado no
 *     servidor. Plano diferente do que a pessoa viu ⇒ frase diferente ⇒ recusa.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  /** Frase digitada pela pessoa; conferida contra o plano do servidor. */
  confirmation: z.string().min(1),
});

const homologationEnabled = () =>
  String(process.env.ARQUITETO_HOMOLOGATION_MODE || "").trim().toLowerCase() === "true";

export async function GET(request: Request) {
  try {
    if (!homologationEnabled()) {
      return NextResponse.json({ success: false, error: "O modo de homologação não está habilitado neste ambiente." }, { status: 403 });
    }
    const url = new URL(request.url);
    const brandId = url.searchParams.get("brandId") || "";
    const context = await resolvePipelineContext({ brandId, module: "arquiteto", action: "view" });
    const plan = await planFor(context);
    // A rodada ativa viaja junto: é ela que a mesa usa para separar o estado
    // corrente do histórico, e pedir isso numa segunda rota seria duas
    // leituras da mesma pergunta.
    const activeRound = await activeRoundFor(context);
    return NextResponse.json({
      success: true,
      data: { ...plan, phrase: homologationFreshPhrase(plan.totalCleared), activeRound },
    });
  } catch (error) {
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    if (!homologationEnabled()) {
      return NextResponse.json({ success: false, error: "O modo de homologação não está habilitado neste ambiente." }, { status: 403 });
    }
    const parsed = RequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: "edit" });

    const plan = await planFor(context);
    const esperada = homologationFreshPhrase(plan.totalCleared);
    if (parsed.confirmation.trim() !== esperada) {
      /*
       * A frase carrega o tamanho do plano. Recusar aqui cobre o caso em que
       * o cenário mudou entre o preview e a confirmação: a pessoa estaria
       * apagando um conjunto diferente do que leu.
       */
      return NextResponse.json({
        success: false,
        error: `A confirmação não corresponde ao plano atual. Recarregue o preview: esperado "${esperada}".`,
      }, { status: 409 });
    }
    if (plan.clean) {
      return NextResponse.json({ success: true, data: { ...plan, deleted: 0, approvedArtifactsDeleted: 0 } });
    }

    const { error } = await context.supabase
      .from("editorial_workflow_items")
      .delete()
      .eq("marca_id", context.brandId)
      .eq("stage", HOMOLOGATION_FRESH_STAGE)
      .in("id", plan.clearIds);
    if (error) throw error;

    /*
     * A FRONTEIRA DA RODADA NASCE AQUI.
     *
     * Sem ela, limpar a cópia de trabalho não bastaria: os read models
     * resolvem "a última aprovada" e encontrariam o SiloDNA e o ArticleDNA da
     * rodada anterior, apresentando-os como estado corrente. O marcador não
     * apaga nada — ele declara a partir de quando o cenário é o novo.
     *
     * Ele é gravado DEPOIS da limpeza, e de propósito: se a limpeza falhar,
     * não existe rodada nova para declarar.
     */
    const anterior = await activeRoundFor(context);
    const round = buildHomologationRoundMarker({
      roundId: crypto.randomUUID(),
      startedBy: context.actorUserId,
      previousRoundId: anterior?.roundId ?? null,
    });
    const marcador = await context.supabase.from("editorial_workflow_items").insert({
      marca_id: context.brandId,
      subject_type: HOMOLOGATION_ROUND_SUBJECT_TYPE,
      subject_id: round.roundId,
      stage: HOMOLOGATION_FRESH_STAGE,
      state: "active",
      payload: round,
    });
    if (marcador.error) throw marcador.error;

    // Readback: o resumo é o que o remoto devolve depois, não o que pedimos.
    const restante = await planFor(context);
    return NextResponse.json({
      success: true,
      data: {
        workingAssignmentsCleared: plan.clearing.find(item => item.subjectType === "keyword")?.count ?? 0,
        workingArticlesCleared: plan.clearing.find(item => item.subjectType === "article_formation_analysis")?.count ?? 0,
        workingSilosCleared: plan.clearing.find(item => item.subjectType === "silo_working_copy")?.count ?? 0,
        territoriesCleared: plan.clearing.find(item => item.subjectType === "territory")?.count ?? 0,
        deleted: plan.totalCleared,
        activeRoundId: round.roundId,
        previousRoundId: round.previousRoundId,
        roundStartedAt: round.startedAt,
        remainingWorkingItems: restante.totalCleared,
        preserved: restante.preserving,
        approvedArtifactsDeleted: 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "A requisição de reinício não corresponde ao contrato." }, { status: 400 });
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

async function activeRoundFor(context: Awaited<ReturnType<typeof resolvePipelineContext>>): Promise<HomologationRound | null> {
  const { data, error } = await context.supabase
    .from("editorial_workflow_items")
    .select("payload")
    .eq("marca_id", context.brandId)
    .eq("subject_type", HOMOLOGATION_ROUND_SUBJECT_TYPE);
  if (error) throw error;
  return activeHomologationRound((data || []).map(row => row.payload as HomologationRound));
}

async function planFor(context: Awaited<ReturnType<typeof resolvePipelineContext>>) {
  const { data, error } = await context.supabase
    .from("editorial_workflow_items")
    .select("id, subject_type, stage, state")
    .eq("marca_id", context.brandId);
  if (error) throw error;
  const rows: FreshWorkflowRow[] = (data || []).map(row => ({
    id: String(row.id),
    subjectType: String(row.subject_type),
    stage: String(row.stage),
    state: String(row.state),
  }));
  return planHomologationFresh({ rows });
}
