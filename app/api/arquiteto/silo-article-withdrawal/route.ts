import { NextResponse } from "next/server";
import { z } from "zod";
import { handleSiloArticleWithdrawal, siloArticleWithdrawalRuntime } from "@/lib/server/arquiteto-silo-article-withdrawal";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { SILO_ARTICLE_WITHDRAWAL_REASON_MAX } from "@/lib/arquiteto/silo-article-withdrawal";

/**
 * "Retirar artigo do Silo" (F4, SDD 2026-10-12 §11 passo 6).
 *
 * `preview` só lê (permissão de leitura do Arquiteto). `apply` exige edição —
 * o par SiloDNA + SiloPage vai pelo `persistSiloPairAtomic`, que só aceita
 * `create`/`edit` — e aprovação, porque rejeitar a versão vigente de um
 * ArticleDNA é decisão sobre o artefato, como nas rotas vizinhas.
 *
 * POST nunca é cacheado (Next 16, Route Handlers): sem configuração de cache.
 */
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  siloId: z.string().min(1),
  articleId: z.string().min(1),
  reason: z.string().max(SILO_ARTICLE_WITHDRAWAL_REASON_MAX * 2),
  mode: z.enum(["preview", "apply"]),
  /** A versão do SiloDNA que a prévia mostrou; diferente da vigente = recusa. */
  expectedSiloDnaVersionId: z.string().min(1).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({
      brandId: parsed.brandId,
      module: "arquiteto",
      action: parsed.mode === "apply" ? "edit" : "view",
    });
    if (parsed.mode === "apply") {
      await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: "approve" });
    }
    const result = await handleSiloArticleWithdrawal(siloArticleWithdrawalRuntime(context), {
      siloId: parsed.siloId,
      articleId: parsed.articleId,
      reason: parsed.reason,
      mode: parsed.mode,
      expectedSiloDnaVersionId: parsed.expectedSiloDnaVersionId ?? null,
    });
    if (result.state === "REFUSED") {
      return NextResponse.json({ success: false, error: result.message, code: result.code }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido de retirada inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
