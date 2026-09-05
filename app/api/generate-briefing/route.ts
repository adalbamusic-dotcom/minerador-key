import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireCanonicalSessionProfile,
  AuthzError,
  assertCanAccessMarca,
  assertListaBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { resolveDeepSeekCanonicalConfig, DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const BriefingResponseSchema = z.object({
  keyword_principal: z.string().trim().min(1).max(500),
  keywords_secundarias: z.array(z.string().trim().min(1).max(500)).default([]),
  slug_sugerido: z.string().trim().min(1).max(180),
  hierarquia: z.string().trim().min(1).max(80),
  meta_title: z.string().trim().min(1).max(180),
  meta_description: z.string().trim().min(1).max(300),
  diretrizes_estrategicas: z.object({
    angulo_de_venda: z.string().trim().default(""),
    chamada_para_acao: z.string().trim().default(""),
  }).default({ angulo_de_venda: "", chamada_para_acao: "" }),
  links_internos_sugeridos: z.array(z.string().trim().min(1).max(180)).max(10).default([]),
  angulo_anti_canibalizacao: z.string().trim().default(""),
}).passthrough();

export async function POST(req: Request) {
  try {
    // 1. Autenticacao: protege gasto de IA e gravacao no banco
    const profile = await requireCanonicalSessionProfile();

    const { keywords } = await req.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { success: false, error: "Par�metros inv�lidos. � necess�rio informar um array de palavras-chave selecionadas." },
        { status: 400 }
      );
    }

    // Inicializa o Supabase
    const supabase = createCanonicalServiceClient();

    // Identificar a lista/silo dos termos (usando o primeiro elemento)
    const siloId = keywords[0]?.lista_id || null;

    // 2. Valida ownership do silo/lista antes de gerar e gravar briefing
    if (!siloId) {
      return NextResponse.json(
        { success: false, error: "Selecione keywords vinculadas a uma lista da marca antes de gerar o briefing." },
        { status: 400 }
      );
    }

    const { data: silo, error: siloError } = await supabase
      .from("minerador_keyword_lists")
      .select("marca_id")
      .eq("id", siloId)
      .maybeSingle();
    if (siloError || !silo?.marca_id) {
      throw new AuthzError(404, "Lista da keyword n�o encontrada.");
    }
    await assertCanAccessMarca(profile.userId, silo.marca_id, profile);
    await assertListaBelongsToMarca(siloId, silo.marca_id, profile);
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: profile.userId, brandId: silo.marca_id, client: supabase, quotaUnits: 1 });

    // Buscar os slugs j� gerados/salvos para contextualiza��o e anti-canibaliza��o
    let existingSlugs: string[] = [];
    try {
      let query = supabase
        .from("briefings_artigos")
        .select("slug_sugerido")
        .order("created_at", { ascending: false })
        .limit(100);

      if (siloId) {
        query = query.eq("silo_id", siloId);
      }

      const { data: briefingsData } = await query;
      if (briefingsData) {
        existingSlugs = (briefingsData as Array<{ slug_sugerido: string | null }>)
          .map((briefing) => briefing.slug_sugerido)
          .filter((slug): slug is string => Boolean(slug));
      }
    } catch (dbErr) {
      console.error("Erro ao buscar slugs existentes para anti-canibalizacao:", dbErr);
    }

    // Formata os dados das palavras-chave para o prompt do modelo de IA
    const formattedKeywordsForPrompt = keywords.map(item => ({
      keyword: item.keyword,
      results: item.results_allintitle,
      volume: item.volume_search,
      intent: item.intent,
      nicho: item.analise_semantica?.nicho_override || null,
      analise_semantica: item.analise_semantica || null
    }));

    const parsedBriefing = await generateStructuredAI({
      provider,
      system: `Você é um Arquiteto de SEO e Copywriter B2B. Crie um briefing para um único artigo, evitando canibalização. Retorne somente o objeto JSON do contrato solicitado. Artigos já publicados: [${existingSlugs.join(", ")}].`,
      user: `Analise as keywords selecionadas e crie o briefing estratégico:\n${JSON.stringify(formattedKeywordsForPrompt, null, 2)}`,
      schema: BriefingResponseSchema,
      maxTokens: 2200,
      thinkingMode: provider.thinkingMode,
    });

    // Insere o briefing de artigo gerado no banco de dados Supabase
    const { data: savedBriefing, error: insertError } = await supabase
      .from("briefings_artigos")
      .insert({
        silo_id: siloId,
        keyword_principal: parsedBriefing.keyword_principal,
        keywords_secundarias: parsedBriefing.keywords_secundarias || [],
        slug_sugerido: parsedBriefing.slug_sugerido,
        hierarquia: parsedBriefing.hierarquia,
        meta_title: parsedBriefing.meta_title,
        meta_description: parsedBriefing.meta_description,
        diretrizes_estrategicas: {
          angulo_de_venda: parsedBriefing.diretrizes_estrategicas?.angulo_de_venda || "",
          chamada_para_acao: parsedBriefing.diretrizes_estrategicas?.chamada_para_acao || "",
          links_internos_sugeridos: parsedBriefing.links_internos_sugeridos || [],
          angulo_anti_canibalizacao: parsedBriefing.angulo_anti_canibalizacao || ""
        },
        status: "rascunho"
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      data: savedBriefing
    });
  } catch (err) {
    if (err instanceof DeepSeekCanonicalError || err instanceof StructuredAIError) return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na gera��o do briefing:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
