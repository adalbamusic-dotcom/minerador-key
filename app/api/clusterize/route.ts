import { NextResponse } from "next/server";
import { requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { fetchProviderResponse, ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { aiProviderErrorResponse, AIProviderConfigurationError, resolveAIProvider } from "@/lib/server/ai-provider-config";

export async function POST(req: Request) {
  try {
    // 1. Autenticacao: protege gasto de chave de IA
    await requireCanonicalSessionProfile();

    const { keywords } = await req.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { success: false, error: "Parâmetros inválidos. É necessário informar um array de palavras-chave." },
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

    // Formata dados simplificados para reduzir uso de tokens e agilizar resposta
    const formattedKeywords = keywords.map(item => ({
      keyword: item.keyword,
      volume: item.volume_search,
      intent: item.intent,
      nicho: item.analise_semantica?.nicho_override || null
    }));

    const response = await fetchProviderResponse(apiUrl, {
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

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderRequestError("O provider de IA retornou uma resposta inválida.", 502, "AI_PROVIDER_INVALID_RESPONSE");
    }

    const parsedResponse = JSON.parse(content);

    return NextResponse.json({
      success: true,
      clusters: parsedResponse.clusters || []
    });
  } catch (err) {
    if (err instanceof AIProviderConfigurationError || err instanceof ProviderRequestError) {
      const mapped = aiProviderErrorResponse(err);
      return NextResponse.json({ success: false, error: mapped.message, code: mapped.code }, { status: mapped.status });
    }
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na clusterização:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
