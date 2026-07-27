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

    // 2. Confirma que a keyword pertence a marca permitida.
    //    intent e analise_semantica.nicho_override sao editoriais (permitidos em publicado).
    await assertCanAccessMarca(profile.userId, brandId, profile);
    await assertKeywordBelongsToMarca(keywordId, brandId, profile);

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

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Você é um Analista Forense de SEO e Comportamento de Busca especialista no Google Brasil.
Sua única função é realizar uma engenharia reversa do perfil do usuário brasileiro baseando-se estritamente na palavra-chave.
Retorne OBRIGATORIAMENTE um objeto JSON com as chaves exatas:
1. "intent": Classifique a real intenção de busca no mercado brasileiro estritamente como "Informativo", "Comercial" ou "Vendas".
2. "nicho": Classifique o nicho de mercado (ex: "Odontologia", "Advocacia", "Saúde", "Estética", "Fitness", "Serviços", "Marketing", ou um nicho específico correspondente em português com apenas uma ou duas palavras se for diferente destes).

Exemplo de saída esperada:
{
  "intent": "Vendas",
  "nicho": "Odontologia"
}`
          },
          {
            role: "user",
            content: `Classifique a intenção e o nicho da palavra-chave: "${keyword}"`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API: ${errorText}`);
    }

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Resposta vazia retornada do modelo de IA.");
    }

    const parsedData = JSON.parse(content);
    const intent = parsedData.intent;
    const niche = parsedData.nicho;

    if (!intent || !niche) {
      throw new Error("O JSON retornado não contém as chaves 'intent' e 'nicho'.");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Obtém o registro existente para mesclar o nicho_override no analise_semantica
    const { data: existingWord } = await supabase
      .from("keywords_kgr")
      .select("brand_id,analise_semantica")
      .eq("id", keywordId)
      .eq("brand_id", brandId)
      .single();

    if (!existingWord?.brand_id) throw new Error("Keyword sem tenant canônico.");

    const currentSemantic = existingWord?.analise_semantica || {};
    const updatedSemantic = {
      ...currentSemantic,
      nicho_override: niche
    };

    // 2. Salva no banco de dados Supabase
    const { error: updateError } = await supabase
      .from("keywords_kgr")
      .update({
        intent: intent,
        analise_semantica: updatedSemantic
      })
      .eq("id", keywordId)
      .eq("brand_id", existingWord.brand_id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      intent,
      nicho: niche
    });
  } catch (err) {
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro no process-intent-niche:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro de processamento." },
      { status: mapped.status }
    );
  }
}
