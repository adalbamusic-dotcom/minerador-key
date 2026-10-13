import { NextResponse } from "next/server";
import { z } from "zod";
import { handleArticleSubjectConversion } from "@/lib/server/arquiteto-subject-conversion";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * "Atualizar o Assunto do artigo" — a conversão do formato anterior no
 * Arquiteto (SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §7).
 *
 * `preview` só lê (leitura do Arquiteto) e devolve o `decisionHash`. `apply`
 * exige edição e aprovação — a versão nova do ArticleDNA nasce aprovada, pela
 * decisão humana sobre a prévia — e só grava com o mesmo `decisionHash`.
 *
 * POST nunca é cacheado (Next 16, Route Handlers): sem configuração de cache.
 */
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  mode: z.enum(["preview", "apply"]),
  articleIds: z.array(z.string().min(1).max(400)).max(60).optional(),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
    const result = await handleArticleSubjectConversion(context, { mode: parsed.mode, articleIds: parsed.articleIds ?? null, decisionHash: parsed.decisionHash ?? null });
    if (result.state === "REFUSED") {
      return NextResponse.json({ success: false, error: result.message, code: result.code }, { status: result.code === "NOTHING_TO_CONVERT" ? 404 : 409 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido de atualização do Assunto inválido.", code: "INVALID_CONTEXT" }, { status: 400 });
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
