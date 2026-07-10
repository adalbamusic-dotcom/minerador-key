import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireSessionProfile,
  assertListaBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";

export async function POST(req: Request) {
  try {
    // 1. Autenticacao: protege gasto de IA e gravacao no banco
    const profile = await requireSessionProfile();

    const { keywords } = await req.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { success: false, error: "Parâmetros inválidos. É necessário informar um array de palavras-chave selecionadas." },
        { status: 400 }
      );
    }

    let apiKey = process.env.DEEPSEEK_API_KEY;
    let apiUrl = "https://api.deepseek.com/chat/completions";
    let model = "deepseek-chat";

    if (!apiKey) {
      apiKey = process.env.OPENROUTER_API_KEY;
      if (apiKey) {
        apiUrl = "https://openrouter.ai/api/v1/chat/completions";
        model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-pro";
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Nem DEEPSEEK_API_KEY nem OPENROUTER_API_KEY estão configuradas no seu arquivo .env.local." },
        { status: 500 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    if (apiUrl.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "http://localhost:3000";
      headers["X-Title"] = "Minerador Key";
    }

    // Inicializa o Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Identificar a lista/silo dos termos (usando o primeiro elemento)
    const siloId = keywords[0]?.lista_id || null;

    // 2. Valida ownership do silo/lista antes de gerar e gravar briefing
    if (siloId) {
      await assertListaBelongsToMarca(siloId, profile.marcaId || "", profile);
    }

    // Buscar os slugs já gerados/salvos para contextualização e anti-canibalização
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
        existingSlugs = briefingsData
          .map((b: any) => b.slug_sugerido)
          .filter(Boolean);
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

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Você é um Arquiteto de SEO e Copywriter B2B. Receberei uma lista de palavras-chave semelhantes. Sua missão é agrupá-las para a criação de UM ÚNICO artigo épico, evitando canibalização. Analise a semântica de todas e retorne EXCLUSIVAMENTE um objeto JSON com:
'keyword_principal': a palavra com maior potencial comercial e volume.
'keywords_secundarias': array com as demais palavras para uso em H2/H3.
'slug_sugerido': URL curta, sem stop words, hífen separando palavras, otimizada para SEO.
'hierarquia': defina se deve ser 'Pilar' (guia completo) ou 'Suporte' (dúvida específica).
'meta_title': título magnético e otimizado para a palavra principal (max 60 caracteres).
'meta_description': resumo focado em CTR e resposta direta (max 155 caracteres).
'diretrizes_estrategicas': objeto com 'angulo_de_venda' e 'chamada_para_acao' consolidados.

CONTEXTO DE ANTI-CANIBALIZAÇÃO E SILOS:
O site já possui os seguintes artigos publicados (representados por seus slugs): [${existingSlugs.join(", ")}].
Seu dever ao criar este novo briefing é garantir que a abordagem seja ÚNICA. Adicione ao objeto JSON as seguintes chaves adicionais:
'links_internos_sugeridos': um array de strings com 1 a 3 slugs desta lista fornecida que têm total relação semântica com o novo artigo e devem receber links internos.
'angulo_anti_canibalizacao': uma frase curta explicando como o redator deve focar este texto para não concorrer com os artigos que já existem na lista fornecida.`
          },
          {
            role: "user",
            content: `Analise as seguintes palavras-chave selecionadas e crie o briefing de agrupamento estratégico:\n${JSON.stringify(formattedKeywordsForPrompt, null, 2)}`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API do DeepSeek: ${errorText}`);
    }

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Resposta vazia retornada do modelo de IA.");
    }

    // Faz o parse do briefing gerado
    const parsedBriefing = JSON.parse(content);

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
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na geração do briefing:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
