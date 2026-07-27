import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireSessionProfile,
  assertCanAccessMarca,
  assertKeywordBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";

export async function POST(req: Request) {
  try {
    // 1. Autenticacao e autorizacao (ownership da keyword por marca)
    const profile = await requireSessionProfile();

    const { keywordId, keyword, brandId } = await req.json();
    if (!keywordId || !keyword || !brandId) {
      return NextResponse.json(
        { success: false, error: "Parâmetros inválidos. É necessário informar keywordId e keyword." },
        { status: 400 }
      );
    }

    // 2. Confirma que a keyword pertence a marca permitida do usuario.
    //    analise_semantica e intent sao campos editoriais e continuam editaveis
    //    mesmo para keywords publicadas (nao sao estruturais).
    await assertCanAccessMarca(profile.userId, brandId, profile);
    await assertKeywordBelongsToMarca(keywordId, brandId, profile);

    let apiKey = process.env.DEEPSEEK_API_KEY;
    let apiUrl = "https://api.deepseek.com/chat/completions";
    let model = "deepseek-chat";

    if (!apiKey) {
      // Fallback para OpenRouter com o modelo do DeepSeek configurado no seu .env.local
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

    // Configuração dinâmica dos Headers de acordo com o provedor (DeepSeek oficial ou OpenRouter)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    if (apiUrl.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "http://localhost:3000";
      headers["X-Title"] = "Minerador Key";
    }

    // Chamada oficial à API (DeepSeek ou OpenRouter)
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Você é um Analista Comportamental de Buscas. Analise a palavra-chave fornecida e extraia APENAS as dimensões que são óbvias e gritantes na sintaxe.\n\nEscolha de 3 a 6 chaves mais relevantes do cardápio abaixo (ignore completamente as que não se aplicam):\n- 'urgencia_tempo': (ex: precisa para agora?)\n- 'intencao_local': (ex: busca um lugar físico?)\n- 'perfil_b2b': (ex: é um dono de negócio pesquisando?)\n- 'emocao_dominante': (ex: medo, vergonha, curiosidade, ambição)\n- 'nivel_consciencia': (ex: leigo, comparador, pronto pra comprar)\n- 'objecao_implícita': (ex: medo de preço, medo de dor)\n- 'poder_aquisitivo': (ex: busca preço baixo ou premium?)\n- 'gatilho_de_conversao': (ex: qual o melhor ângulo de venda para esta busca específica?)\n\nRetorne um objeto JSON dinâmico contendo apenas as chaves escolhidas, com textos curtos, diretos e analíticos. NÃO retorne chaves vazias ou irrelevantes."
          },
          {
            role: "user",
            content: `Analise a intenção e a psicologia de busca por trás da palavra-chave: "${keyword}".`
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
      throw new Error("Resposta vazia retornada do DeepSeek.");
    }

    // Realiza o parse do JSON retornado pela IA
    const parsedData = JSON.parse(content);

    // Inicializa o cliente do Supabase com a role admin para atualizar os novos campos de forma segura
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter o registro existente para mesclar e não apagar nicho_override e outros overrides
    const { data: existingWord } = await supabase
      .from("keywords_kgr")
      .select("brand_id,analise_semantica")
      .eq("id", keywordId)
      .eq("brand_id", brandId)
      .single();

    if (!existingWord?.brand_id) throw new Error("Keyword sem tenant canônico.");

    const currentSemantic = existingWord?.analise_semantica || {};
    const updatedSemantic = { ...currentSemantic, ...parsedData };

    const { error: updateError } = await supabase
      .from("keywords_kgr")
      .update({
        analise_semantica: updatedSemantic
      })
      .eq("id", keywordId)
      .eq("brand_id", existingWord.brand_id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: parsedData
    });
  } catch (err) {
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na API /api/analyze:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
