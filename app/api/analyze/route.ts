import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireCanonicalSessionProfile,
  assertCanAccessMarca,
  assertKeywordBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";
import { fetchProviderResponse, ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { aiProviderErrorResponse, AIProviderConfigurationError, resolveAIProvider } from "@/lib/server/ai-provider-config";

export async function POST(req: Request) {
  try {
    // 1. Autenticacao e autorizacao (ownership da keyword por marca)
    const profile = await requireCanonicalSessionProfile();

    const { keywordId, keyword, brandId } = await req.json();
    if (!keywordId || !keyword || !brandId) {
      return NextResponse.json(
        { success: false, error: "Par�metros inv�lidos. � necess�rio informar keywordId e keyword." },
        { status: 400 }
      );
    }

    // 2. Confirma que a keyword pertence a marca permitida do usuario.
    //    analise_semantica e intent sao campos editoriais e continuam editaveis
    //    mesmo para keywords publicadas (nao sao estruturais).
    await assertCanAccessMarca(profile.userId, brandId, profile);
    await assertKeywordBelongsToMarca(keywordId, brandId, profile);

    const resolvedProvider = resolveAIProvider();
    const { apiKey, apiUrl, model } = resolvedProvider;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "A credencial do provider de IA configurado não está disponível.", code: "AI_CREDENTIAL_MISSING" },
        { status: 500 }
      );
    }

    // Configura��o din�mica dos Headers de acordo com o provedor (DeepSeek oficial ou OpenRouter)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...resolvedProvider.extraHeaders,
    };

    // Chamada oficial � API (DeepSeek ou OpenRouter)
    const response = await fetchProviderResponse(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Voc� � um Analista Comportamental de Buscas. Analise a palavra-chave fornecida e extraia APENAS as dimens�es que s�o �bvias e gritantes na sintaxe.\n\nEscolha de 3 a 6 chaves mais relevantes do card�pio abaixo (ignore completamente as que n�o se aplicam):\n- 'urgencia_tempo': (ex: precisa para agora?)\n- 'intencao_local': (ex: busca um lugar f�sico?)\n- 'perfil_b2b': (ex: � um dono de neg�cio pesquisando?)\n- 'emocao_dominante': (ex: medo, vergonha, curiosidade, ambi��o)\n- 'nivel_consciencia': (ex: leigo, comparador, pronto pra comprar)\n- 'objecao_impl�cita': (ex: medo de pre�o, medo de dor)\n- 'poder_aquisitivo': (ex: busca pre�o baixo ou premium?)\n- 'gatilho_de_conversao': (ex: qual o melhor �ngulo de venda para esta busca espec�fica?)\n\nRetorne um objeto JSON din�mico contendo apenas as chaves escolhidas, com textos curtos, diretos e anal�ticos. N�O retorne chaves vazias ou irrelevantes."
          },
          {
            role: "user",
            content: `Analise a inten��o e a psicologia de busca por tr�s da palavra-chave: "${keyword}".`
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

    // Realiza o parse do JSON retornado pela IA
    const parsedData = JSON.parse(content);

    // Inicializa o cliente do Supabase com a role admin para atualizar os novos campos de forma segura
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter o registro existente para mesclar e n�o apagar nicho_override e outros overrides
    const { data: existingWord } = await supabase
      .from("minerador_keywords")
      .select("brand_id,analise_semantica")
      .eq("id", keywordId)
      .eq("brand_id", brandId)
      .single();

    if (!existingWord?.brand_id) throw new Error("Keyword sem tenant can�nico.");

    const currentSemantic = existingWord?.analise_semantica || {};
    const updatedSemantic = { ...currentSemantic, ...parsedData };

    const { error: updateError } = await supabase
      .from("minerador_keywords")
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
    if (err instanceof AIProviderConfigurationError || err instanceof ProviderRequestError) {
      const mapped = aiProviderErrorResponse(err);
      return NextResponse.json({ success: false, error: mapped.message, code: mapped.code }, { status: mapped.status });
    }
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na API /api/analyze:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
