import { NextResponse } from "next/server";
import type { ArticleDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { DifferentiationApplyRequestSchema, handleDifferentiationApply } from "@/lib/server/arquiteto-differentiation";
import { differentiationErrorResponse } from "@/lib/server/arquiteto-differentiation-http";
import { appendArquitetoArtifact } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * PUBLICADOS QUE DISPUTAM O MESMO ASSUNTO — A DECISÃO HUMANA.
 *
 * `accept` exige o hash da avaliação que a pessoa viu e grava, por página com
 * ArticleDNA, uma versão nova em revisão pelo writer canônico do Arquiteto
 * (`appendArquitetoArtifact`, com a trava do Assunto declarado), com ator e
 * histórico, e confirma pela releitura. URL, slug, canonical e marca não mudam.
 * `keep` registra "Manter como está" até haver SERP nova. Esta rota não é
 * exposta ao MCP: aplicar é ato humano na tela.
 */
export async function POST(request: Request) {
  try {
    const parsed = DifferentiationApplyRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, code: "INVALID_DIFFERENTIATION_REQUEST", error: "Decisão de diferenciação inválida. Nada foi gravado.", issues: parsed.error.flatten() }, { status: 400 });
    }
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });
    const outcome = await handleDifferentiationApply({
      store: context,
      now: () => new Date(),
      persistArticleVersion: async (version: VersionEnvelope<ArticleDNA>) => {
        const gravada = await appendArquitetoArtifact(context, "article_dna", version, "proposed");
        return { status: gravada.status, versionId: gravada.version.versionId };
      },
    }, parsed.data);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    const mapped = differentiationErrorResponse(error, "A decisão de diferenciação não pôde ser gravada. Recarregue e confira o que foi aplicado.");
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
