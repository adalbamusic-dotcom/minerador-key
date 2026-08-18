import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireCanonicalSessionProfile,
  AuthzError,
  assertCanAccessMarca,
  assertListaBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";
import { fetchProviderResponse, ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { aiProviderErrorResponse, AIProviderConfigurationError, resolveAIProvider } from "@/lib/server/ai-provider-config";

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

    const resolvedProvider = resolveAIProvider();
    const { apiKey, apiUrl, model } = resolvedProvider;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "A credencial do provider de IA configurado não está disponível.", code: "AI_CREDENTIAL_MISSING" },
        { status: 500 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...resolvedProvider.extraHeaders,
    };

    // Inicializa o Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const response = await fetchProviderResponse(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Voc� � um Arquiteto de SEO e Copywriter B2B. Receberei uma lista de palavras-chave semelhantes. Sua miss�o � agrup�-las para a cria��o de UM �NICO artigo �pico, evitando canibaliza��o. Analise a sem�ntica de todas e retorne EXCLUSIVAMENTE um objeto JSON com:
'keyword_principal': a palavra com maior potencial comercial e volume.
'keywords_secundarias': array com as demais palavras para uso em H2/H3.
'slug_sugerido': URL curta, sem stop words, h�fen separando palavras, otimizada para SEO.
'hierarquia': defina se deve ser 'Pilar' (guia completo) ou 'Suporte' (d�vida espec�fica).
'meta_title': t�tulo magn�tico e otimizado para a palavra principal (max 60 caracteres).
'meta_description': resumo focado em CTR e resposta direta (max 155 caracteres).
'diretrizes_estrategicas': objeto com 'angulo_de_venda' e 'chamada_para_acao' consolidados.

CONTEXTO DE ANTI-CANIBALIZA��O E SILOS:
O site j� possui os seguintes artigos publicados (representados por seus slugs): [${existingSlugs.join(", ")}].
Seu dever ao criar este novo briefing � garantir que a abordagem seja �NICA. Adicione ao objeto JSON as seguintes chaves adicionais:
'links_internos_sugeridos': um array de strings com 1 a 3 slugs desta lista fornecida que t�m total rela��o sem�ntica com o novo artigo e devem receber links internos.
'angulo_anti_canibalizacao': uma frase curta explicando como o redator deve focar este texto para n�o concorrer com os artigos que j� existem na lista fornecida.`
          },
          {
            role: "user",
            content: `Analise as seguintes palavras-chave selecionadas e crie o briefing de agrupamento estrat�gico:\n${JSON.stringify(formattedKeywordsForPrompt, null, 2)}`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderRequestError("O provider de IA retornou uma resposta inválida.", 502, "AI_PROVIDER_INVALID_RESPONSE");
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
    if (err instanceof AIProviderConfigurationError || err instanceof ProviderRequestError) {
      const mapped = aiProviderErrorResponse(err);
      return NextResponse.json({ success: false, error: mapped.message, code: mapped.code }, { status: mapped.status });
    }
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na gera��o do briefing:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
