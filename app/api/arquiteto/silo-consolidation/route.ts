import { NextResponse } from "next/server";
import { z } from "zod";
import { consolidateSiloFromWorkingCopy } from "@/lib/server/arquiteto-silo-consolidation-adapter";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { VersionedSiloDNASchema, VersionedSiloPageSchema } from "@/lib/arquiteto/contracts";
import { TerritoryRefSchema } from "@/lib/arquiteto/territory-ref";
import { SiloPageApprovalDecisionSchema } from "@/lib/arquiteto/silo-page-approval";

/**
 * Consolidação Silo-first — separada da edição da working copy, que vive em
 * `PATCH /api/arquiteto/workspace`.
 *
 * Os envelopes chegam PRONTOS do cliente e são repassados sem reconstrução:
 * regenerar `versionId`/`createdAt` num retry destruiria o replay idempotente
 * da RPC. Repetir a operação significa repetir o mesmo envelope.
 *
 * Route Handlers não são cacheados por padrão e POST nunca é cacheável, então
 * nenhuma configuração de cache é necessária aqui.
 */
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  action: z.enum(["create", "edit"]),
  territoryRef: TerritoryRefSchema,
  territoryExpectedLock: z.number().int().positive(),
  workingCopyExpectedLock: z.number().int().positive(),
  // Independentes por contrato: aprovar o SiloDNA não aprova a SiloPage.
  siloDnaStatus: z.enum(["draft", "proposed", "approved"]),
  siloPageStatus: z.enum(["draft", "proposed", "approved"]),
  // Decisão humana de consolidação — não é `approved: true`. Ela descreve a
  // arquitetura aprovada, e o servidor confere contra a working copy remota.
  decision: z.object({
    actorUserId: z.string().min(1),
    decidedAt: z.string().min(1),
    reason: z.string().min(1),
    territoryRef: TerritoryRefSchema,
    pillarArticleId: z.string().min(1),
    supportArticleIds: z.array(z.string().min(1)),
    excludedArticleIds: z.array(z.string().min(1)),
    publishedIdentityResolved: z.boolean(),
  }).strict(),
  // Decisão humana de aprovação DA PÁGINA. Independente da consolidação:
  // aprovar o SiloDNA não aprova a SiloPage, então ela vem em campo próprio.
  siloPageApproval: SiloPageApprovalDecisionSchema.nullish(),
  siloDna: VersionedSiloDNASchema,
  siloPage: VersionedSiloPageSchema,
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({
      brandId: parsed.brandId,
      module: "arquiteto",
      action: parsed.action,
    });
    const persisted = await consolidateSiloFromWorkingCopy(context, {
      territoryRef: parsed.territoryRef,
      territoryExpectedLock: parsed.territoryExpectedLock,
      workingCopyExpectedLock: parsed.workingCopyExpectedLock,
      siloDna: parsed.siloDna,
      siloPage: parsed.siloPage,
      statuses: { siloDna: parsed.siloDnaStatus, siloPage: parsed.siloPageStatus },
      decision: parsed.decision,
      siloPageApproval: parsed.siloPageApproval ?? null,
    });
    return NextResponse.json({ success: true, data: persisted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "A consolidação do Silo é inválida.", code: "INVALID_CONTEXT" },
        { status: 400 },
      );
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
