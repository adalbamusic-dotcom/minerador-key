import { NextResponse } from "next/server";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";

export async function POST(req: Request) {
  try {
    // 1. Autenticacao: protege gasto de chave de IA
    await requireSessionProfile();

    const { keywords } = await req.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { success: false, error: "Parâmetros inválidos. É necessário informar um array de palavras-chave." },
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
        { success: false, error: "Nem DEEPSEEK_API_KEY nem OPENROUTER_API_KEY estão configuradas no .env.local." },
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

    // Formata dados simplificados para reduzir uso de tokens e agilizar resposta
    const formattedKeywords = keywords.map(item => ({
      keyword: item.keyword,
      volume: item.volume_search,
      intent: item.intent,
      nicho: item.analise_semantica?.nicho_override || null
    }));

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Você é um Analista de SEO focado em prevenção de canibalização. Sua missão é ler a lista de palavras-chave fornecida e agrupar as que possuem a MESMA intenção de busca (aquelas que deveriam estar no mesmo artigo) em clusters. Retorne ESTRITAMENTE um objeto JSON contendo um array chamado 'clusters'. Cada objeto dentro do array deve ter: 'tema_principal' (um nome curto para o grupo) e 'keywords' (um array com as palavras exatas que pertencem a este grupo)."
          },
          {
            role: "user",
            content: `Agrupe as seguintes palavras-chave em clusters:\n${JSON.stringify(formattedKeywords, null, 2)}`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na chamada da API de IA: ${errorText}`);
    }

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Resposta de IA vazia.");
    }

    const parsedResponse = JSON.parse(content);

    return NextResponse.json({
      success: true,
      clusters: parsedResponse.clusters || []
    });
  } catch (err) {
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na clusterização:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
