import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveDataForSeoCompatibilityConfig } from "@/lib/arquiteto/dataforseo-serp-compatibility";
import { collectDataForSeoSerpSnapshot } from "@/lib/server/dataforseo-serp-operation";
import { observationFromSnapshot, serpLensOf } from "@/lib/arquiteto/serp-competitive-evidence";
import { DEFAULT_SERP_LENSES, SerpLensSchema } from "@/lib/arquiteto/keyword-serp-record";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { readbackKeywordSerpObservations, saveKeywordSerpObservations } from "@/lib/server/arquiteto-keyword-serp-store";

/**
 * SERP POR KEYWORD, NAS QUATRO LENTES.
 *
 * A rota territorial responde outra pergunta: ela consulta o TEXTO da entidade
 * central de um território, no máximo duas consultas, e persiste um parecer.
 * Esta consulta cada KEYWORD do grupo, uma vez por lente, e persiste a
 * observação competitiva — domínios, blocos e perguntas. É o insumo que a
 * eleição por SERP e a proposta de reforço das páginas publicadas precisam e
 * que nunca existiu no acervo.
 *
 * Duas coisas que ela NÃO faz:
 *   - não decide nada: observação não move membership nem troca primária;
 *   - não varre: o lote vem de seleção humana e é pequeno por contrato.
 *
 * O provider é o mesmo já configurado na Connection global da Marca. A rota não
 * escolhe provider, não guarda credencial e não devolve nada disso.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  /** Identidade do grupo observado: `territory:<ref>`, artigo ou lote. */
  scopeId: z.string().min(1),
  territoryRef: z.string().min(1).nullable().default(null),
  // Teto de keywords por artigo mais folga para o grupo em avaliação.
  keywords: z.array(z.object({
    keywordId: z.string().min(1),
    keyword: z.string().trim().min(1),
  })).min(1).max(12),
  /** Lentes a observar. Vazio = as quatro do produto. */
  lenses: z.array(SerpLensSchema).min(1).max(4).default(DEFAULT_SERP_LENSES),
  resultLimit: z.number().int().positive().max(50).default(10),
});

/** Concorrência limitada: o provider é compartilhado com os outros módulos. */
const CONCURRENCY = 3;

async function runBounded<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function POST(request: Request) {
  const operationRequestId = crypto.randomUUID();
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Pedido de SERP por keyword inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    /*
     * Uma consulta por keyword POR LENTE. É o produto cartesiano mesmo: sem
     * observar a mesma keyword em dispositivos diferentes não há como medir a
     * divergência entre lentes, e sem ela o universo pareceria sempre um só.
     */
    const alvos = parsed.data.keywords.flatMap(keyword =>
      parsed.data.lenses.map(lens => ({ keyword, lens })));

    const dataForSeo = await resolveDataForSeoCompatibilityConfig({
      actorUserId: pipelineContext.actorUserId,
      brandId: pipelineContext.brandId,
      client: pipelineContext.supabase,
      quotaUnits: alvos.length,
    });

    const gaps: { keywordId: string; lens: string; reason: string }[] = [];

    const coletadas = await runBounded(alvos, CONCURRENCY, async alvo => {
      try {
        const snapshot = await collectDataForSeoSerpSnapshot({
          brandId: parsed.data.brandId,
          // A observação não pertence a um Article: a identidade é o escopo.
          articleId: parsed.data.scopeId,
          articleDnaVersionId: `keyword-serp:${parsed.data.scopeId}`,
          keywordId: alvo.keyword.keywordId,
          keywordDnaVersionId: `keyword-serp:${alvo.keyword.keywordId}`,
          keyword: alvo.keyword.keyword,
          location: "Brasil",
          language: "pt-br",
          device: alvo.lens.device,
          operatingSystem: alvo.lens.operatingSystem,
          expectedIntent: "",
          expectedFormat: "",
          requiredTopics: [alvo.keyword.keyword],
          articleEntities: [],
          resultLimit: parsed.data.resultLimit,
          // Observação de evidência: cada coleta é lida do zero, sem sucessão.
          version: 1,
          previousSnapshotId: null,
          /*
           * PAYLOAD COMPLETO, e não por capricho.
           *
           * Medido no provider em 2026-09-20, mesma keyword e mesma lente: o
           * `regular` devolveu 8 domínios e ZERO perguntas do People Also Ask
           * — com `people_also_ask` listado em `item_types`, isto é, anunciado
           * e não entregue. O `advanced` devolveu 13 domínios e 4 perguntas.
           * Os 5 domínios a mais são as citações do AI Overview.
           *
           * Com o `regular`, `sharedQuestions` e a cobertura do universo
           * seriam sempre zero, e a sobreposição de domínios seria medida sobre
           * pouco mais da metade do universo real.
           */
        }, { config: dataForSeo.config, operationRequestId, payloadDepth: "advanced" });
        return observationFromSnapshot(snapshot);
      } catch (error) {
        /*
         * Uma lente que falha não derruba as outras, e o buraco é DECLARADO:
         * uma coleta parcial que se anuncia completa faria a eleição parecer
         * decidida sobre evidência que ninguém observou.
         */
        gaps.push({
          keywordId: alvo.keyword.keywordId,
          lens: serpLensOf(alvo.lens),
          reason: error instanceof Error ? error.message : "Falha ao consultar a SERP.",
        });
        return null;
      }
    });

    const observations = coletadas.filter((item): item is NonNullable<typeof item> => Boolean(item));

    await recordIntegrationUsage({
      resource: dataForSeo.resource,
      operation: "module_operation",
      module: "arquiteto",
      resultStatus: observations.length ? "succeeded" : "failed",
      units: alvos.length,
      ...(observations.length ? {} : { errorCode: "KEYWORD_SERP_EMPTY" }),
      idempotencyKey: `dataforseo:keyword_serp:${operationRequestId}:${parsed.data.scopeId}`,
      metadata: { operationRequestId, operationKind: "keyword_serp", scopeId: parsed.data.scopeId, lenses: parsed.data.lenses.length },
    }).catch(() => undefined);

    if (!observations.length) {
      return NextResponse.json({
        success: false,
        error: "Nenhuma lente respondeu: não há observação a persistir.",
        code: "KEYWORD_SERP_EMPTY",
        data: { operationRequestId, gaps },
      }, { status: 502 });
    }

    // Provider OK não é sucesso: só é sucesso o que persiste E volta.
    await saveKeywordSerpObservations(pipelineContext, {
      payload: {
        scopeId: parsed.data.scopeId,
        territoryRef: parsed.data.territoryRef,
        keywordIds: parsed.data.keywords.map(item => item.keywordId),
        lenses: parsed.data.lenses,
        // O contrato guarda listas próprias: o que é persistido não é a mesma
        // referência que a leitura devolveu.
        observations: observations.map(item => ({
          ...item,
          competitorDomains: [...item.competitorDomains],
          itemTypes: [...item.itemTypes],
          questions: [...item.questions],
        })),
        gaps,
        provenance: { operationRequestId, collectedAt: new Date().toISOString() },
      },
    });
    const readback = await readbackKeywordSerpObservations(pipelineContext, parsed.data.scopeId);

    return NextResponse.json({
      success: true,
      data: {
        source: "PROVIDER_LIVE",
        operationRequestId,
        scopeId: readback.scopeId,
        observations: readback.payload.observations,
        lenses: readback.payload.lenses.map(serpLensOf),
        gaps: readback.payload.gaps,
        requested: alvos.length,
        succeeded: readback.payload.observations.length,
      },
    });
  } catch (error) {
    const runtime = integrationRuntimeErrorResponse(error);
    if (runtime) return NextResponse.json({ success: false, error: runtime.message, code: runtime.code }, { status: runtime.status });
    const message = error instanceof Error ? error.message : "Não foi possível coletar a SERP das keywords.";
    return NextResponse.json({ success: false, error: message, code: "KEYWORD_SERP_FAILED" }, { status: 500 });
  }
}
