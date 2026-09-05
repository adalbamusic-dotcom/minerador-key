import { NextResponse } from "next/server";
import { z } from "zod";
import { ARTICLE_SERP_HUMAN_DECISIONS } from "@/lib/arquiteto/article-serp-record";
import { readbackArticleFormationSerpAssessment, resolveArticleFormationSerpAssessment } from "@/lib/server/arquiteto-article-serp-store";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * A DECISÃO EDITORIAL SOBRE UM PARECER DA SERP.
 *
 * Não existe "ignorar a SERP": o que se grava aqui é a questão concreta que a
 * pessoa resolveu — manter a composição, trocar a Principal, separar, juntar
 * ou recompor. Um botão genérico de dispensa transformaria o gate em
 * formalidade e apagaria justamente o que precisava ficar registrado.
 *
 * A decisão viaja amarrada ao `formationBaseHash` que estava em tela. Se a
 * composição mudar depois, ela deixa de valer sozinha — sem tombstone, sem
 * revogação manual.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  candidateRef: z.string().min(1),
  formationBaseHash: z.string().min(1),
  assessmentId: z.string().min(1),
  decision: z.enum(ARTICLE_SERP_HUMAN_DECISIONS),
  reason: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Requisição inválida para decidir sobre a SERP." }, { status: 400 });
    }
    const profile = await requireCanonicalSessionProfile();
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    await resolveArticleFormationSerpAssessment(context, {
      candidateRef: parsed.data.candidateRef,
      resolution: {
        decision: parsed.data.decision,
        reason: parsed.data.reason,
        source: "human",
        decidedAt: new Date().toISOString(),
        decidedBy: profile.userId,
        assessmentId: parsed.data.assessmentId,
        formationBaseHash: parsed.data.formationBaseHash,
      },
    });

    // Gravar não é sucesso: sucesso é o remoto devolver a decisão registrada.
    const lido = await readbackArticleFormationSerpAssessment(context, parsed.data.candidateRef);
    if (lido.payload.humanResolution?.formationBaseHash !== parsed.data.formationBaseHash) {
      return NextResponse.json(
        { success: false, error: "A decisão não voltou na releitura remota." },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, data: { candidateRef: lido.candidateRef, resolution: lido.payload.humanResolution } });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
