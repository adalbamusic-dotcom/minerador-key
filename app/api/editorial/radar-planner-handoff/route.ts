import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { RadarStartError } from "@/lib/server/radar-youtube-start";
import { RadarPlannerSendError, sendRadarToPlanner } from "@/lib/server/radar-planner-send";

/**
 * ===== O HANDOFF AO PLANEJADOR — RADAR_FINAL_1 · §18 e §19 =====
 *
 * ========================= PROVIDER_CALLS = 0 =========================
 *
 * Esta rota consolida e entrega. Ela não coleta nada: Google, YouTube, Amazon,
 * reviews e transcrição continuam em zero. Por isso ela pode ser repetida sem
 * medo — e §20 garante que repetir não duplica.
 *
 * ==================== POR QUE POST, E NÃO UM EFEITO ====================
 *
 * Entregar ao Planejador é decisão humana com consequência: a partir dela outro
 * módulo passa a planejar sobre esta evidência. Um GET que entregasse em
 * silêncio, disparado por montagem de tela, faria a fronteira ser cruzada sem
 * que ninguém decidisse cruzá-la.
 */

const noStoreHeaders = { "Cache-Control": "no-store" } as const;

const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
}).strict();

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = CorpoSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    const resultado = await sendRadarToPlanner({
      brandId: input.brandId,
      articleId: input.articleId,
      actorId: profile.userId,
      sentAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      persistenceMode: "remote" as const,
      /* §19 · só chega aqui o que o servidor releu e revalidou. */
      readbackConfirmed: true,
      change: resultado.change,
      analysisVersionId: resultado.analysisVersionId,
      /* §25 · a tela mostra a frase; hash e ids ficam nos detalhes técnicos. */
      headline: resultado.headline,
      bundleId: resultado.record.bundleId,
      bundleHash: resultado.record.bundleHash,
      handoffVersion: resultado.record.handoffVersion,
      primaryResearchProfile: resultado.record.primaryResearchProfile,
      bundleBytes: resultado.bundleBytes,
      /* §17 · o envelope não pode multiplicar o dossiê: a medida viaja. */
      handoffBytes: resultado.handoffBytes,
      /* §11 · o destino confirmado, relido do Planejador. */
      plannerItemId: resultado.plannerItemId,
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RadarPlannerSendError) {
      return NextResponse.json({
        success: false,
        code: error.code,
        error: error.message,
        /* O bloqueio viaja inteiro: quem opera precisa saber o que falta. */
        blocks: error.readiness?.blocks || [],
      }, { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof RadarStartError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido de envio ao Planejador inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}
