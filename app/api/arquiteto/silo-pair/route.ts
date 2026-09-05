import { NextResponse } from "next/server";
import { z } from "zod";
import { VersionedSiloDNASchema, VersionedSiloPageSchema } from "@/lib/arquiteto/contracts";
import { persistSiloPairAtomic, pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

const RequestSchema = z.object({
  brandId: z.string().uuid(),
  action: z.enum(["create", "edit"]),
  // LEGACY DRAFT-ONLY. Esta rota materializava um par APROVADO sem Território,
  // sem working copy, sem Pilar humano e sem proveniência — bypass completo do
  // fluxo Silo-first. Não tem chamador nem alcance pela UI, então permanece como
  // caminho histórico de rascunho, com a finalização fechada.
  // Consolidação canônica: POST /api/arquiteto/silo-consolidation.
  siloDnaStatus: z.enum(["draft", "proposed", "approved"]),
  siloPageStatus: z.enum(["draft", "proposed", "approved"]),
  siloDna: VersionedSiloDNASchema,
  siloPage: VersionedSiloPageSchema,
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    // Guard de rota. O helper `persistArquitetoSiloPair` recusa o mesmo caso por
    // conta própria: um import futuro não pode reabrir a porta lateral.
    if (parsed.siloDnaStatus !== "draft" || parsed.siloPageStatus !== "draft") {
      return NextResponse.json({
        success: false,
        error: "LEGACY_SILO_PAIR_FINALIZATION_DISABLED",
        code: "CONFLICT",
      }, { status: 409 });
    }
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: parsed.action });
    const persisted = await persistSiloPairAtomic(context, parsed.siloDna, parsed.siloPage, {
      siloDna: parsed.siloDnaStatus,
      siloPage: parsed.siloPageStatus,
    });
    return NextResponse.json({
      success: true,
      data: {
        persistence: persisted.status,
        atomicity: persisted.atomicity,
        source: persisted.source,
        siloDna: persisted.siloDna,
        siloPage: persisted.siloPage,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "O par SiloDNA/SiloPage não corresponde ao contrato canônico." }, { status: 400 });
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
