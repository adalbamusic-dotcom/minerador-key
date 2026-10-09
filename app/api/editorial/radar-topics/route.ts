import { NextResponse } from "next/server";
import { z } from "zod";
import {
  RADAR_R5_TOPIC_ORIGINS,
} from "@/lib/radar/r5-sequential";
import { RadarR6ExpertTopicContextSchema, RadarR6TopicSuggestionSchema } from "@/lib/radar/r6-sequential";
import { radarExpertTopicsSubjectPromptLines } from "@/lib/radar/expert-brief";
import { expertTopicsBlueprintLines, expertTopicsContextWithoutNoise } from "@/lib/redator/expert-topics-pilot";
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

type Pedido = z.infer<typeof RequestSchema>;

/**
 * O PROMPT DO SISTEMA, COM O ASSUNTO QUANDO HÁ — SDD do Assunto, F3.1.
 *
 * Sem Assunto não há linha a mais: o texto é exatamente `SYSTEM_PROMPT`.
 * Com Assunto, as linhas citam a frase e a nota e pedem pautas que aprofundem
 * o Assunto e a virada. A garantia fica no domínio (r7); aqui é o pedido.
 */
function buildSystemPrompt(input: Pedido) {
  return [SYSTEM_PROMPT, ...radarExpertTopicsSubjectPromptLines(input.context)].join("\n");
}

/**
 * 2026-10-09 · regra do piloto: com o artigo-modelo concluído do mesmo
 * ArticleDNA, as linhas dele (seções e as afirmações que só entram com fonte)
 * vêm depois das do Assunto. Sem planta, o prompt de antes, byte a byte.
 */
function buildSystemPromptWithBlueprint(input: Pedido, linhasDaPlanta: readonly string[]) {
  return [buildSystemPrompt(input), ...linhasDaPlanta].join("\n");
}

function buildPrompt(input: Pedido) {
  return JSON.stringify({
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    context: input.context,
  });
}

type LeitorDaPlanta = Awaited<ReturnType<typeof resolvePipelineContext>>["supabase"];

/*
 * 2026-10-09 · O ARTIGO-MODELO CONCLUÍDO DO MESMO ARTICLEDNA, quando existe.
 * As pautas costumam vir antes da planta: sem ela, nenhuma linha. A versão vale
 * se foi organizada sobre o ArticleDNA da pauta (a referência gravada). Leitura
 * pela sessão (RLS da Marca), metadados primeiro e só a planta escolhida depois.
 * Falha de leitura: as pautas seguem sem as linhas (a planta é contexto aqui).
 */
async function linhasDoArtigoModelo(supabase: LeitorDaPlanta, input: Pedido): Promise<string[]> {
  try {
    const metadados = await supabase.from("radar_article_blueprints").select("id,version_number,ir:payload->investigationRef")
      .eq("brand_id", input.brandId).eq("article_id", input.articleId).eq("state", "APPROVED")
      .order("version_number", { ascending: false }).limit(20);
    if (metadados.error) return [];
    const escolhida = ((metadados.data || []) as Array<{ id: string; version_number: number | null; ir: { articleDnaVersionId?: unknown } | null }>)
      .find(linha => linha.ir?.articleDnaVersionId === input.articleDnaVersionId);
    if (!escolhida) return [];
    const conteudo = await supabase.from("radar_article_blueprints").select("id,bp:payload->blueprint,src:payload->sources")
      .eq("brand_id", input.brandId).eq("article_id", input.articleId).eq("id", escolhida.id).limit(1);
    const [linha] = (conteudo.data || []) as Array<{ id: string; bp: unknown; src: unknown }>;
    if (conteudo.error || !linha) return [];
    return expertTopicsBlueprintLines({ version: escolhida.version_number ?? null, blueprint: linha.bp, sources: linha.src, principal: input.context.articleDna.principal });
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Contexto de pautas do Radar inválido.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });
    /* 2026-10-09 · a régua de ruído do CSV na pesquisa do contexto, antes de qualquer chamada. */
    const pedido: Pedido = { ...parsed.data, context: expertTopicsContextWithoutNoise(parsed.data.context).context };
    const linhasDaPlanta = await linhasDoArtigoModelo(context.supabase, pedido);
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase, quotaUnits: 1 });
    const result = await generateStructuredAI({ provider, system: buildSystemPromptWithBlueprint(pedido, linhasDaPlanta), user: buildPrompt(pedido), schema: ResponseSchema, maxTokens: 2800 });

    return NextResponse.json({ success: true, topics: result.topics, humanDecisionRequired: true, persistenceMode: "local" });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Contexto de pautas do Radar inválido.", issues: error.flatten() }, { status: 400 });
    if (error instanceof StructuredAIError || error instanceof DeepSeekCanonicalError || error instanceof PipelineRuntimeError) {
      return NextResponse.json({ success: false, error: error.message, code: error instanceof StructuredAIError ? error.code : error.code }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha na preparação de pautas do Radar." }, { status: 500 });
  }
}
