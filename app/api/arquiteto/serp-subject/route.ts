import { NextResponse } from "next/server";
import { z } from "zod";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor } from "@/lib/arquiteto/serp-lens-targeting";
import { SERP_SUBJECT_LENS_LABELS, SERP_SUBJECT_THRESHOLDS } from "@/lib/arquiteto/serp-subject-overlap";
import { readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { SERP_SUBJECT_MAX_KEYWORDS, readSerpSubjectFootprints } from "@/lib/server/arquiteto-serp-subject-store";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * A SERP DA MESA PARA A MEDIDA DE "MESMO ASSUNTO" (D2.2) — SÓ LEITURA DO CACHE.
 *
 * Devolve a pegada de cada keyword pedida nas 4 lentes: as URLs do top 10
 * (digest) e os domínios (observação), lidas do cache já pago, em lotes de
 * 100 ids e só nas colunas que a medida usa. A tela monta o índice
 * (`buildSerpSubjectIndex`) e entrega à formação, à troca da principal e ao
 * diagnóstico.
 *
 * O que ela NÃO faz: não paga, não coleta, não grava, não resolve credencial
 * do provider. Keyword sem SERP no cache volta em `withoutSerp` — a tela diz
 * "sem SERP no cache" e oferece coletar pelo caminho pago que já existe
 * (plano e confirmação). O custo de leitura volta em `egress`.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  keywords: z.array(z.object({
    keywordId: z.string().min(1),
    keyword: z.string().trim().min(1),
  })).min(1).max(SERP_SUBJECT_MAX_KEYWORDS),
});

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Pedido da SERP da mesa inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    // Leitura: a permissão de ver o Arquiteto basta. O contexto filtra a marca (R4).
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "view" });
    const now = new Date();

    /*
     * A chave do cache é o que foi enviado ao provider: localidade e idioma
     * do targeting do Minerador para a keyword; sem ele, os do ambiente — a
     * mesma regra da SERP por keyword (`/api/arquiteto/keyword-serp`).
     */
    const ambiente = readDataForSeoTargetCodes();
    const targeting = await readMineradorKeywordTargetCodes(context.supabase, context.brandId, parsed.data.keywords.map(item => item.keywordId), ambiente);
    const alvos = parsed.data.keywords.map(item => ({
      keywordId: item.keywordId,
      keyword: item.keyword,
      ...serpTargetCodesFor(targeting.codes, item.keywordId, ambiente),
    }));

    const leitura = await readSerpSubjectFootprints(context, alvos, { now });
    return NextResponse.json({
      success: true,
      data: {
        footprints: leitura.footprints,
        withoutSerp: leitura.withoutSerp,
        missingLenses: leitura.missingLenses,
        egress: leitura.egress,
        lenses: SERP_SUBJECT_LENS_LABELS,
        thresholds: SERP_SUBJECT_THRESHOLDS,
        targetingReadFailed: targeting.readFailed,
        paid: false,
      },
    });
  } catch (error) {
    const mapped = pipelineArtifactErrorResponse(error);
    if (mapped.status !== 503) return NextResponse.json(mapped.body, { status: mapped.status });
    const message = error instanceof Error ? error.message : "Não foi possível ler a SERP da mesa no cache.";
    return NextResponse.json({ success: false, error: message, code: "SERP_SUBJECT_READ_FAILED" }, { status: 503 });
  }
}
