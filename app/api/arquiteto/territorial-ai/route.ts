import { NextResponse } from "next/server";
import { z } from "zod";
import {
  TerritorialAiResponseSchema,
  keepValidTerritorialAiProposals,
  type TerritorialAiProposal,
} from "@/lib/arquiteto/territorial-ai";
import { buildTerritorialAiBase, TerritorialAiSerpRefSchema } from "@/lib/arquiteto/territorial-ai-record";
import { readbackTerritorialAiProposal, saveTerritorialAiProposal } from "@/lib/server/arquiteto-territorial-ai-store";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * IA da etapa Silos.
 *
 * Usa a Connection global da Plataforma e o gerador estruturado compartilhado —
 * a mesma infraestrutura da IA de Article. O que NÃO é reaproveitado é o
 * contrato: aquele analisa working copies de ArticleDNA, este analisa a dúvida
 * arquitetural.
 *
 * A rota é EVIDÊNCIA + PROPOSTA. Não escreve território, não move keyword, não
 * confirma silo e não encosta no registro da SERP.
 */

const ContextSchema = z.object({
  questionId: z.string().min(1),
  kind: z.string().min(1),
  reason: z.string().min(1),
  /** Fatos da arquitetura observada — entram no prompt e no baseHash. */
  architectureFacts: z.array(z.string()).max(80),
  /** Hipótese determinística vigente. */
  logicFacts: z.array(z.string()).max(40),
  /** Refs que a proposta pode citar; qualquer outra é recusada. */
  knownTargetRefs: z.array(z.string().min(1)).max(80),
  knownKeywordIds: z.array(z.string().min(1)).max(200),
  /** Identidade publicada protegida: contexto, nunca alvo de alteração. */
  publishedIdentity: z.array(z.string()).max(20).default([]),
  serpRef: TerritorialAiSerpRefSchema.nullable().default(null),
  serpFacts: z.array(z.string()).max(30).default([]),
});

const RequestSchema = z.object({
  brandId: z.string().min(1),
  /** Contexto da marca estritamente necessário para coerência editorial. */
  brand: z.object({
    name: z.string(),
    niche: z.string().nullable().default(null),
    positioning: z.string().nullable().default(null),
  }),
  // Uma dúvida por vez, em lote pequeno: a IA acompanha a pergunta, não a marca.
  questions: z.array(ContextSchema).min(1).max(6),
}).strict();

const SYSTEM_PROMPT = `Voce revisa a arquitetura de SILOS editoriais a partir de UMA duvida arquitetural.
Silo e um universo editorial: entidade central, intencao macro, fronteira e narrativa. Nao e um artigo.
Responda somente JSON com { proposals: [...], summary }.
Cada proposal tem: questionId, recommendation, targetRefs, keywordRefs, reason, supportingEvidence, conflicts, limitations, legacyStance.
recommendation deve ser um de: maintain, use_existing_silo, create_new_silo, merge, split, move_keywords, change_head, update_context, reject_shallow_hypothesis, no_op.
Use SOMENTE refs e keywordIds presentes no contexto recebido. Nunca invente identificadores novos.
Voce NAO cria entidades, NAO move keywords, NAO confirma silo e NAO persiste nada: produz hipotese reversivel para decisao humana.
Identidade publicada (URL, slug, canonical) e restricao herdada: nunca proponha altera-la. Se a arquitetura publicada for ruim, use legacyStance legacy_constraint ou adapt_new_content e explique como o conteudo novo se acomoda.
Se a arquitetura ja estiver coerente, responda recommendation no_op e explique no reason. Isso e um resultado valido.
FORMATO: targetRefs, keywordRefs, supportingEvidence, conflicts e limitations sao SEMPRE arrays de string, mesmo com um unico item ou vazios.`;

function buildPrompt(brand: z.infer<typeof RequestSchema>["brand"], question: z.infer<typeof ContextSchema>) {
  const linhas = [
    `MARCA: ${brand.name}${brand.niche ? ` | nicho: ${brand.niche}` : ""}${brand.positioning ? ` | posicionamento: ${brand.positioning}` : ""}`,
    `DUVIDA (${question.kind}): ${question.reason}`,
    `questionId: ${question.questionId}`,
    "",
    "ARQUITETURA OBSERVADA:",
    ...question.architectureFacts.map(fact => `- ${fact}`),
    "",
    "HIPOTESE DA LOGICA:",
    ...(question.logicFacts.length ? question.logicFacts.map(fact => `- ${fact}`) : ["- nenhuma hipotese registrada"]),
  ];
  if (question.publishedIdentity.length) {
    linhas.push("", "IDENTIDADE PUBLICADA (PROTEGIDA, nao alterar):", ...question.publishedIdentity.map(fact => `- ${fact}`));
  }
  if (question.serpFacts.length) {
    linhas.push("", "EVIDENCIA SERP VIGENTE:", ...question.serpFacts.map(fact => `- ${fact}`));
  } else {
    linhas.push("", "EVIDENCIA SERP: nao exigida para esta duvida.");
  }
  linhas.push(
    "",
    "REFS PERMITIDAS (targetRefs):",
    ...(question.knownTargetRefs.length ? question.knownTargetRefs.map(ref => `- ${ref}`) : ["- nenhuma"]),
    "",
    "KEYWORDS PERMITIDAS (keywordRefs):",
    ...(question.knownKeywordIds.length ? question.knownKeywordIds.map(id => `- ${id}`) : ["- nenhuma"]),
  );
  return linhas.join("\n");
}

/**
 * Mensagem para a interface, sem nome de provider.
 *
 * A infraestrutura compartilhada cita o provider nos próprios erros — útil no
 * diagnóstico interno, mas a UI do Arquiteto fala de "revisão com IA", não de
 * fornecedor. O detalhe técnico continua no log da operação.
 */
function publicFailureMessage(error: unknown): string {
  const bruto = error instanceof Error ? error.message : "";
  const semProvider = bruto.replace(/\bDeepSeek\b/gi, "o modelo").replace(/\bprovider\b/gi, "serviço");
  return semProvider.trim() || "Falha na revisão com IA.";
}

export async function POST(request: Request) {
  const operationRequestId = crypto.randomUUID();
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Pedido de revisão inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    const provider = await resolveDeepSeekCanonicalConfig({
      actorUserId: pipelineContext.actorUserId,
      brandId: pipelineContext.brandId,
      client: pipelineContext.supabase,
      quotaUnits: parsed.data.questions.length,
    });

    const proposals: TerritorialAiProposal[] = [];
    const failures: { questionId: string; error: string }[] = [];
    const rejectedRefs: { questionId: string; issues: string[] }[] = [];

    for (const question of parsed.data.questions) {
      try {
        const generated = await generateStructuredAI({
          provider,
          system: SYSTEM_PROMPT,
          user: buildPrompt(parsed.data.brand, question),
          schema: TerritorialAiResponseSchema,
        });

        // Ref inventada não vira proposta: seria decisão sobre objeto imaginário.
        const { accepted, rejected } = keepValidTerritorialAiProposals({
          proposals: generated.proposals,
          questionId: question.questionId,
          knownTargetRefs: new Set(question.knownTargetRefs),
          knownKeywordIds: new Set(question.knownKeywordIds),
        });
        if (rejected.length) {
          rejectedRefs.push({
            questionId: question.questionId,
            issues: rejected.flatMap(item => item.issues.map(issue => issue.detail)),
          });
        }
        const proposal = accepted[0];
        if (!proposal) {
          failures.push({ questionId: question.questionId, error: "A revisão não produziu proposta utilizável para esta dúvida." });
          continue;
        }

        const base = buildTerritorialAiBase({
          questionId: question.questionId,
          kind: question.kind,
          architectureFacts: question.architectureFacts,
          logicFacts: question.logicFacts,
          serpBaseHash: question.serpRef?.assessmentBaseHash ?? null,
        });
        const generatedAt = new Date().toISOString();

        // Provider OK não é sucesso: só é sucesso o que persiste E volta.
        await saveTerritorialAiProposal(pipelineContext, {
          proposal, base, serpRef: question.serpRef, operationRequestId, generatedAt,
        });
        const readback = await readbackTerritorialAiProposal(pipelineContext, question.questionId);

        await recordIntegrationUsage({
          resource: provider.resource,
          operation: "module_operation",
          module: "arquiteto",
          resultStatus: "succeeded",
          units: 1,
          idempotencyKey: `deepseek:territorial_ai:${operationRequestId}:${question.questionId}`,
          metadata: { operationRequestId, operationKind: "territorial_ai", questionId: question.questionId },
        });

        proposals.push(readback.payload.proposal);
      } catch (error) {
        // Uma dúvida que falha não derruba as outras, e não apaga a proposta
        // válida anterior: a falha nem chega ao writer.
        await recordIntegrationUsage({
          resource: provider.resource,
          operation: "module_operation",
          module: "arquiteto",
          resultStatus: "failed",
          units: 1,
          errorCode: "TERRITORIAL_AI_FAILED",
          idempotencyKey: `deepseek:territorial_ai:${operationRequestId}:${question.questionId}:failed`,
          metadata: { operationRequestId, operationKind: "territorial_ai", questionId: question.questionId },
        }).catch(() => undefined);
        failures.push({
          questionId: question.questionId,
          error: publicFailureMessage(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        source: "PROVIDER_LIVE",
        operationRequestId,
        proposals,
        failures,
        rejectedRefs,
        requested: parsed.data.questions.length,
        succeeded: proposals.length,
      },
    });
  } catch (error) {
    const runtime = integrationRuntimeErrorResponse(error);
    if (runtime) return NextResponse.json({ success: false, error: runtime.message, code: runtime.code }, { status: runtime.status });
    if (error instanceof StructuredAIError) {
      return NextResponse.json({ success: false, error: publicFailureMessage(error), code: error.code }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Não foi possível revisar os silos com IA.";
    return NextResponse.json({ success: false, error: message, code: "TERRITORIAL_AI_FAILED" }, { status: 500 });
  }
}
