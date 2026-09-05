import { NextResponse } from "next/server";
import { z } from "zod";
import {
  RADAR_R5_TOPIC_ORIGINS,
} from "@/lib/radar/r5-sequential";
import { RadarR6ExpertTopicContextSchema, RadarR6TopicSuggestionSchema } from "@/lib/radar/r6-sequential";
import { resolveDeepSeekCanonicalConfig, DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const RequestSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
  context: RadarR6ExpertTopicContextSchema,
}).strict();

const ResponseSchema = z.object({
  topics: z.array(RadarR6TopicSuggestionSchema).min(3).max(5),
}).strict();

const SYSTEM_PROMPT = `Voce prepara pautas de entrevista para o especialista do Radar.
Retorne somente JSON valido no formato {"topics":[...]} com 3 a 5 itens.
Cada item deve conter text, origin, justification, need e reference.
origin deve ser exatamente um destes valores: ${RADAR_R5_TOPIC_ORIGINS.join(", ")}.
Quando mais de uma fonte motivar a pergunta, retorne também origins com as fontes combinadas.
Use somente fatos presentes no contexto recebido. Nao invente necessidades, fontes, produtos, resultados, pessoas ou dados de ArticleDNA.
O texto e uma pauta/pergunta para o especialista, nunca um artigo, resposta final ou recomendacao automatica.
A justificativa deve explicar qual evidencia recebida originou a pauta. reference deve apontar para um rótulo ou URL presente na proveniência recebida. need deve repetir ou resumir uma necessidade/lacuna real do contexto.
Nao repita perguntas, requiredTopics, knownQuestions ou material existente ja conhecido; se o material existente cobrir o ponto, use complementaryExistingContent para explicar a lacuna restante ou nao gere a pergunta.
Nao altere ArticleDNA, KeywordDNA, SiloDNA, slug, canonical ou qualquer identidade do artigo.
Toda pauta exige revisao humana individual e nao pode ser enviada automaticamente.`;

function buildPrompt(input: z.infer<typeof RequestSchema>) {
  return JSON.stringify({
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    context: input.context,
  });
}

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Contexto de pautas do Radar inválido.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase, quotaUnits: 1 });
    const result = await generateStructuredAI({ provider, system: SYSTEM_PROMPT, user: buildPrompt(parsed.data), schema: ResponseSchema, maxTokens: 2800 });

    return NextResponse.json({ success: true, topics: result.topics, humanDecisionRequired: true, persistenceMode: "local" });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Contexto de pautas do Radar inválido.", issues: error.flatten() }, { status: 400 });
    if (error instanceof StructuredAIError || error instanceof DeepSeekCanonicalError || error instanceof PipelineRuntimeError) {
      return NextResponse.json({ success: false, error: error.message, code: error instanceof StructuredAIError ? error.code : error.code }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha na preparação de pautas do Radar." }, { status: 500 });
  }
}
