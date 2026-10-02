import { NextResponse } from "next/server";
import { z } from "zod";
import { RadarArticleBlueprintEditSchema, RadarArticleBlueprintInvalidError } from "@/lib/radar/article-blueprint";
import {
  approveRadarArticleBlueprint,
  editRadarArticleBlueprint,
  generateRadarArticleBlueprint,
  listRadarArticleBlueprints,
} from "@/lib/server/radar-article-blueprint";
import { DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { StructuredAIError } from "@/lib/server/structured-ai";

/**
 * O ARTIGO-MODELO DO RADAR (SDD diretriz editorial, Adendo A, D5 — 2026-10-02).
 *
 * GET lista as versões. POST:
 *   - "generate": 1 chamada de IA, paga, por clique explícito (`confirmPaid: true`);
 *   - "edit": a edição do dono vira outra versão;
 *   - "approve": aprova a versão do pacote vigente (decisão humana).
 *
 * 2026-10-02 · "generate" é ORGANIZAR o artigo-modelo da SERP: a tela o pede
 * logo depois de "Finalizar pesquisa" (o botão avisa a chamada de IA) ou pelo
 * painel "Artigo-modelo da SERP". Resposta cortada ou fora do formato ganha UMA
 * nova tentativa (uma chamada a mais); por isso o teto da rota cobre as duas.
 */

/* Route segment config do Next 16 (docs/01-app/.../route-segment-config/maxDuration). */
export const maxDuration = 300;

const noStore = { "Cache-Control": "no-store" };

const LeituraSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
});

const AcaoSchema = z.discriminatedUnion("action", [
  /*
   * 2026-10-02 · `ifMissing`: o encadeamento automático (congelar → organizar) não
   * paga a IA de novo quando o MESMO pacote já tem artigo-modelo — acrescentar
   * YouTube ou Amazon a um artigo do Google não muda o pacote. Os botões do painel
   * não mandam a opção e organizam de novo de propósito.
   */
  z.object({ action: z.literal("generate"), brandId: z.string().uuid(), articleId: z.string().trim().min(1).max(256), confirmPaid: z.literal(true), ifMissing: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("edit"), brandId: z.string().uuid(), articleId: z.string().trim().min(1).max(256), blueprintId: z.string().uuid(), edit: RadarArticleBlueprintEditSchema }).strict(),
  z.object({ action: z.literal("approve"), brandId: z.string().uuid(), articleId: z.string().trim().min(1).max(256), blueprintId: z.string().uuid() }).strict(),
]);

function erro(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Pedido do artigo-modelo inválido.", issues: error.flatten() }, { status: 400, headers: noStore });
  if (error instanceof RadarArticleBlueprintInvalidError) return NextResponse.json({ success: false, error: error.message, notes: error.notes }, { status: 422, headers: noStore });
  if (error instanceof StructuredAIError || error instanceof DeepSeekCanonicalError || error instanceof PipelineRuntimeError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status, headers: noStore });
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha no artigo-modelo." }, { status: 500, headers: noStore });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const entrada = LeituraSchema.parse({ brandId: url.searchParams.get("brandId"), articleId: url.searchParams.get("articleId") });
    const context = await resolvePipelineContext({ brandId: entrada.brandId, module: "radar", action: "view" });
    const versions = await listRadarArticleBlueprints(context.supabase, context.brandId, entrada.articleId);
    return NextResponse.json({ success: true, versions }, { headers: noStore });
  } catch (error) {
    return erro(error);
  }
}

export async function POST(request: Request) {
  try {
    const entrada = AcaoSchema.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: entrada.brandId, module: "radar", action: "edit" });
    const base = { client: context.supabase, brandId: context.brandId, articleId: entrada.articleId, actorUserId: context.actorUserId };
    const version = entrada.action === "generate"
      ? await generateRadarArticleBlueprint({ ...base, ifMissing: entrada.ifMissing === true })
      : entrada.action === "edit"
        ? await editRadarArticleBlueprint({ ...base, blueprintId: entrada.blueprintId, edit: entrada.edit })
        : await approveRadarArticleBlueprint({ ...base, blueprintId: entrada.blueprintId });
    return NextResponse.json({ success: true, version }, { headers: noStore });
  } catch (error) {
    return erro(error);
  }
}
