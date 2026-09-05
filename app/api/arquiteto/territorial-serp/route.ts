import { NextResponse } from "next/server";
import { z } from "zod";
import {
  TerritorialSerpQuestionKindSchema,
  assessTerritorialSerp,
  type TerritorialSerpQuestion,
} from "@/lib/arquiteto/territorial-serp";
import { resolveDataForSeoCompatibilityConfig } from "@/lib/arquiteto/dataforseo-serp-compatibility";
import { collectDataForSeoSerpSnapshot } from "@/lib/server/dataforseo-serp-operation";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { readbackTerritorialSerpAssessment, saveTerritorialSerpAssessment } from "@/lib/server/arquiteto-territorial-serp-store";
import { TerritorialSerpBaseSchema } from "@/lib/arquiteto/territorial-serp-record";

/**
 * SERP da etapa Silos.
 *
 * Consulta o provider interno já configurado na Connection global da Marca —
 * o mesmo caminho da SERP de Article. A rota não escolhe provider, não guarda
 * credencial e não expõe nada disso na resposta: a UI só recebe o parecer.
 *
 * O parecer é EVIDÊNCIA. Nenhuma escrita de território acontece aqui.
 */

const QuestionSchema = z.object({
  questionId: z.string().min(1),
  kind: TerritorialSerpQuestionKindSchema,
  territoryRef: z.string().nullable(),
  comparedTerritoryRef: z.string().nullable(),
  queries: z.array(z.object({
    keywordId: z.string().min(1),
    keyword: z.string().trim().min(1),
    role: z.enum(["primary", "comparison"]),
  })).min(1).max(2),
  reason: z.string().min(1),
  /** O que a pergunta valida; sustenta a detecção de desatualização. */
  base: TerritorialSerpBaseSchema,
});

const RequestSchema = z.object({
  brandId: z.string().min(1),
  // Lote pequeno por decisão humana: a SERP é sob demanda, não varredura.
  questions: z.array(QuestionSchema).min(1).max(10),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
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
      return NextResponse.json({ success: false, error: "Pedido de SERP inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    const totalQueries = parsed.data.questions.reduce((total, question) => total + question.queries.length, 0);
    const dataForSeo = await resolveDataForSeoCompatibilityConfig({
      actorUserId: pipelineContext.actorUserId,
      brandId: pipelineContext.brandId,
      client: pipelineContext.supabase,
      quotaUnits: totalQueries,
    });

    const assessments = [];
    const failures: { questionId: string; error: string }[] = [];

    for (const question of parsed.data.questions) {
      try {
        const snapshots = await runBounded(question.queries, CONCURRENCY, async query => collectDataForSeoSerpSnapshot({
          brandId: parsed.data.brandId,
          // A SERP territorial não pertence a um Article: a identidade da
          // consulta é a própria pergunta arquitetural.
          articleId: question.questionId,
          articleDnaVersionId: `territorial:${question.questionId}`,
          keywordId: query.keywordId,
          keywordDnaVersionId: `territorial:${query.keywordId}`,
          keyword: query.keyword,
          location: "Brasil",
          language: "pt-br",
          device: parsed.data.device,
          expectedIntent: "",
          expectedFormat: "",
          requiredTopics: [query.keyword],
          articleEntities: [],
          resultLimit: parsed.data.resultLimit,
          // Consulta de evidência: cada pergunta é lida do zero, sem sucessão
          // de versões — a arquitetura ainda não decidiu nada para versionar.
          version: 1,
          previousSnapshotId: null,
        }, { config: dataForSeo.config, operationRequestId }));

        await recordIntegrationUsage({
          resource: dataForSeo.resource,
          operation: "module_operation",
          module: "arquiteto",
          resultStatus: "succeeded",
          units: question.queries.length,
          idempotencyKey: `dataforseo:territorial_serp:${operationRequestId}:${question.questionId}`,
          metadata: { operationRequestId, operationKind: "territorial_serp", questionId: question.questionId },
        });

        const assessment = assessTerritorialSerp({
          question: question as TerritorialSerpQuestion,
          snapshots,
        });
        // Provider OK não é sucesso: só é sucesso o que persiste E volta.
        await saveTerritorialSerpAssessment(pipelineContext, {
          assessment, base: question.base, operationRequestId,
        });
        const readback = await readbackTerritorialSerpAssessment(pipelineContext, assessment.questionId);
        assessments.push(readback.payload.assessment);
      } catch (error) {
        // Uma pergunta que falha não derruba as outras; o parcial é declarado.
        await recordIntegrationUsage({
          resource: dataForSeo.resource,
          operation: "module_operation",
          module: "arquiteto",
          resultStatus: "failed",
          units: question.queries.length,
          errorCode: "TERRITORIAL_SERP_FAILED",
          idempotencyKey: `dataforseo:territorial_serp:${operationRequestId}:${question.questionId}:failed`,
          metadata: { operationRequestId, operationKind: "territorial_serp", questionId: question.questionId },
        }).catch(() => undefined);
        failures.push({
          questionId: question.questionId,
          error: error instanceof Error ? error.message : "Falha ao consultar a SERP.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        source: "PROVIDER_LIVE",
        operationRequestId,
        assessments,
        failures,
        requested: parsed.data.questions.length,
        succeeded: assessments.length,
      },
    });
  } catch (error) {
    const runtime = integrationRuntimeErrorResponse(error);
    if (runtime) return NextResponse.json({ success: false, error: runtime.message, code: runtime.code }, { status: runtime.status });
    const message = error instanceof Error ? error.message : "Não foi possível validar a SERP dos silos.";
    return NextResponse.json({ success: false, error: message, code: "TERRITORIAL_SERP_FAILED" }, { status: 500 });
  }
}
