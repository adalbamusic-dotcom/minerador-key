import { NextResponse } from "next/server";
import {
  requireCanonicalSessionProfile,
  assertCanAccessMarca,
  assertKeywordBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";
import { extractIntentNicheClassification } from "@/lib/minerador/intent-niche-response";
import { fetchProviderResponse, ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { resolveOpenRouterCanonicalConfig, OpenRouterCanonicalError } from "@/lib/minerador/openrouter-canonical";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationRuntimeRepository, IntegrationRuntimeError, recordIntegrationUsageForResource } from "@/lib/server/integrations-runtime";

export async function POST(req: Request) {
  let apiRequestStarted = false;
  let canonicalAI: Awaited<ReturnType<typeof resolveOpenRouterCanonicalConfig>> | null = null;
  let canonicalClient: ReturnType<typeof createCanonicalServiceClient> | null = null;
  const operationRequestId = crypto.randomUUID();
  try {
    // 1. Autenticacao e autorizacao (ownership da keyword por marca)
    const profile = await requireCanonicalSessionProfile();

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

    canonicalClient = createCanonicalServiceClient();
    canonicalAI = await resolveOpenRouterCanonicalConfig({
      client: canonicalClient,
      actorUserId: profile.userId,
      brandId,
      quotaUnits: 1,
    });
    const { apiKey, apiUrl, model } = canonicalAI;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...canonicalAI.extraHeaders,
    };

    apiRequestStarted = true;
    const response = await fetchProviderResponse(apiUrl, {
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

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderRequestError("O provider de IA retornou uma resposta inválida.", 502, "AI_PROVIDER_INVALID_RESPONSE");
    }

    const classification = extractIntentNicheClassification(JSON.parse(content));
    if (!classification) throw new Error("O JSON retornado não contém uma intenção e um nicho utilizáveis.");
    const { intent, nicho: niche } = classification;

    // 1. Obtém o registro existente para mesclar o nicho_override no analise_semantica
    const { data: existingWord } = await profile.supabase
      .from("minerador_keywords")
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
    const { error: updateError } = await profile.supabase
      .from("minerador_keywords")
      .update({
        intent: intent,
        analise_semantica: updatedSemantic
      })
      .eq("id", keywordId)
      .eq("brand_id", existingWord.brand_id);

    if (updateError) throw updateError;

    if (canonicalAI) {
      await recordIntegrationUsageForResource({
        resource: canonicalAI.resource,
        operation: "module_operation",
        module: "minerador",
        resultStatus: "succeeded",
        units: 1,
        idempotencyKey: `minerador:process-intent-niche:${operationRequestId}`,
        metadata: { operationRequestId, keywordId, model: canonicalAI.model },
      }, {
        repository: createIntegrationRuntimeRepository(canonicalClient),
        authorizationRepository: createCanonicalAuthorizationRepository(canonicalClient),
      });
    }

    return NextResponse.json({
      success: true,
      intent,
      nicho: niche
    });
  } catch (err) {
    if (apiRequestStarted && canonicalAI && canonicalClient) {
      await recordIntegrationUsageForResource({
        resource: canonicalAI.resource,
        operation: "module_operation",
        module: "minerador",
        resultStatus: "failed",
        units: 1,
        idempotencyKey: `minerador:process-intent-niche:${operationRequestId}`,
        errorCode: err instanceof Error && "code" in err ? String((err as Error & { code?: unknown }).code) : "AI_PROVIDER_ERROR",
        metadata: { operationRequestId, model: canonicalAI.model },
      }, {
        repository: createIntegrationRuntimeRepository(canonicalClient),
        authorizationRepository: createCanonicalAuthorizationRepository(canonicalClient),
      }).catch(() => undefined);
    }
    if (err instanceof IntegrationRuntimeError) {
      return NextResponse.json({ success: false, operationRequestId, error: err.message, code: err.code, stage: "integration_runtime", diagnostic: { apiRequestStarted, source: "canonical", runtime: err.diagnostic } }, { status: err.status });
    }
    if (err instanceof OpenRouterCanonicalError) {
      return NextResponse.json({ success: false, operationRequestId, error: err.message, code: err.code, stage: "connection_resolution", diagnostic: { apiRequestStarted, source: "canonical" } }, { status: err.status });
    }
    if (err instanceof ProviderRequestError) {
      return NextResponse.json({ success: false, operationRequestId, error: err.message, code: err.code, stage: "provider_request", diagnostic: { apiRequestStarted, source: "canonical" } }, { status: err.status });
    }
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro no process-intent-niche:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro de processamento." },
      { status: mapped.status }
    );
  }
}
