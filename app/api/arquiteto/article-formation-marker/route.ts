import { NextResponse } from "next/server";
import { z } from "zod";
import { ArticleFormationMarkerPayloadSchema } from "@/lib/arquiteto/article-formation-marker";
import { readbackArticleFormationMarker, saveArticleFormationMarker } from "@/lib/server/arquiteto-article-formation-marker-store";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { pipelineArtifactErrorResponse, } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * Registra o cenário de formação de Artigos processado/confirmado.
 *
 * Só o FATO humano é gravado. Candidatos, papéis e pontuações continuam sendo
 * reconstruídos do read-model. Confirmar formação NÃO cria ArticleDNA: esta
 * rota não materializa artigo nenhum.
 *
 * Nenhum provider é chamado aqui.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  marker: ArticleFormationMarkerPayloadSchema,
}).strict();

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Cenário de formação inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    // Gravar não é sucesso: sucesso é o remoto devolver o que foi gravado.
    await saveArticleFormationMarker(context, parsed.data.marker);
    const readback = await readbackArticleFormationMarker(context);

    return NextResponse.json({ success: true, data: { marker: readback.payload, updatedAt: readback.updatedAt } });
  } catch (error) {
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
