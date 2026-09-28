import { NextResponse } from "next/server";
import { ReinforcementSearchRunRequestSchema, handleReinforcementSearchRun } from "@/lib/server/arquiteto-published-reinforcement-search";
import { differentiationErrorResponse } from "@/lib/server/arquiteto-differentiation-http";
import { readGoogleAdsAverageVolumes } from "@/lib/server/arquiteto-differentiation-runtime";
import { readCandidateFootprints } from "@/lib/server/arquiteto-differentiation-store";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { buildSubjectDiscoveryPorts } from "@/lib/server/subject-discovery-runtime";
import { requireTenantPermission } from "@/lib/server/tenant-context";

/**
 * REFORÇAR PUBLICADOS — A RODADA PAGA DA BUSCA EM LOTE.
 *
 * Exige o hash da prévia e o custo autorizado (uma confirmação por rodada). O
 * servidor confere o hash gravado, o TETO DE US$ 1,00 por rodada, relê os
 * publicados (mudou → nada é pago) e o ledger (repetição não paga). Paga pelo
 * MESMO caminho da diferenciação e da Pesquisa por Assunto
 * (`buildSubjectDiscoveryPorts`: Google Ads grátis, SERP do DataForSEO com cache
 * primeiro e ledger), registrado como módulo `arquiteto`.
 */
export async function POST(request: Request) {
  try {
    const parsed = ReinforcementSearchRunRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, code: "INVALID_REINFORCEMENT_REQUEST", error: "Pedido da rodada inválido. Nada foi pago.", issues: parsed.error.flatten() }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });
    const outcome = await handleReinforcementSearchRun({
      store: context,
      now: () => new Date(),
      openRunPorts: async operationRequestId => {
        const profile = await requireCanonicalSessionProfile();
        if (profile.userId !== context.actorUserId) throw new Error("A sessão mudou durante a rodada.");
        const tenant = await requireTenantPermission({ brandId: context.brandId, actorUserId: profile.userId, module: "arquiteto", action: "edit", profile });
        const subject = buildSubjectDiscoveryPorts({ profile, context: tenant, input: { operationRequestId }, usage: { module: "arquiteto", collectedBy: "arquiteto" } });
        return {
          openExecution: () => subject.openExecution(),
          googleAdsVolumes: keywords => readGoogleAdsAverageVolumes({ actorUserId: profile.userId, agencyId: tenant.agencyId ?? null, brandId: tenant.brandId, keywords }),
          readFootprints: targets => readCandidateFootprints(context, targets, new Date()),
        };
      },
    }, parsed.data);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    const mapped = differentiationErrorResponse(error, "A busca para os publicados não pôde ser concluída. O que já foi pago está no controle de gastos.");
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
