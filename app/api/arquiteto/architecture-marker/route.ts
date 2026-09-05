import { NextResponse } from "next/server";
import { z } from "zod";
import { ArchitectureMarkerPayloadSchema } from "@/lib/arquiteto/architecture-marker-record";
import { readbackArchitectureMarker, saveArchitectureMarker } from "@/lib/server/arquiteto-architecture-marker-store";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { pipelineArtifactErrorResponse, } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * Registra o cenário de arquitetura processado/confirmado.
 *
 * Só o FATO humano é gravado. Clusters, pontuações e mapa continuam sendo
 * reconstruídos do read-model — esta rota não guarda cópia do cálculo.
 *
 * Nenhum provider é chamado aqui.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  marker: ArchitectureMarkerPayloadSchema,
}).strict();

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Cenário de arquitetura inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    // Gravar não é sucesso: sucesso é o remoto devolver o que foi gravado.
    await saveArchitectureMarker(context, parsed.data.marker);
    const readback = await readbackArchitectureMarker(context);

    return NextResponse.json({ success: true, data: { marker: readback.payload, updatedAt: readback.updatedAt } });
  } catch (error) {
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
