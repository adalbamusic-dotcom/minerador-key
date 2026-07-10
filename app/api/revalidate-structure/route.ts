import { NextResponse } from "next/server";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";

const SYSTEM_PROMPT = `Voce e um Arquiteto de SEO especializado em silos, KGR e prevencao de canibalizacao. Sua tarefa e revalidar a estrutura de Silos, Artigos e keywords secundarias recebida do front-end.

Regras de negocio obrigatorias:
1. Consolide micro-silos quando eles tratam da mesma intencao de busca ou pertencem claramente ao mesmo grupo semantico.
2. Reposicione keywords secundarias quando elas orbitam melhor outro artigo.
3. Retorne apenas JSON valido, sem Markdown.
4. Preserve a estrutura de artigos publicados conforme a regra abaixo.

IMPORTANTE: Voce pode promover ou rebaixar a 'hierarquia' (Pilar/Suporte) de um artigo Publicado dentro do seu proprio Silo. Porem, voce E PROIBIDO de alterar o 'slug', a 'keyword_principal' ou mover um artigo Publicado para outro 'silo'.

Campos imutaveis quando status === "publicado":
- keyword_principal
- slug
- silo_id / siloName

Campos mutaveis quando status === "publicado":
- hierarquia
- keywords_secundarias

Para itens nao-publicados, voce pode sugerir mudanca de Silo, hierarquia, slug, keyword principal e keywords secundarias se isso melhorar a arquitetura.

Formato esperado de saida:
{
  "silos": [
    {
      "silo_id": "id-ou-null",
      "siloName": "Nome do Silo",
      "artigos": [
        {
          "id": "id-do-artigo",
          "status": "publicado|aprovado|novo",
          "keyword_principal": "string",
          "slug": "string",
          "hierarquia": "Pilar|Suporte 1|Suporte 2",
          "keywords_secundarias": ["string"]
        }
      ]
    }
  ],
  "notas": ["decisoes estruturais relevantes"]
}`;

export async function POST(req: Request) {
  try {
    // 1. Autenticacao: protege gasto de IA. As regras de imutabilidade de
    //    publicado ja estao no SYSTEM_PROMPT e sao reforcadas pelos triggers do banco.
    await requireSessionProfile();

    const { structure } = await req.json();
    if (!structure) {
      return NextResponse.json(
        { success: false, error: "Estrutura obrigatoria ausente." },
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
        { success: false, error: "Nem DEEPSEEK_API_KEY nem OPENROUTER_API_KEY estao configuradas no .env.local." },
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
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Revalide esta estrutura sem violar as protecoes de publicados:\n${JSON.stringify(structure, null, 2)}`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API de IA: ${errorText}`);
    }

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) throw new Error("Resposta de IA vazia.");

    return NextResponse.json({
      success: true,
      data: JSON.parse(content)
    });
  } catch (err) {
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na revalidacao estrutural:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
