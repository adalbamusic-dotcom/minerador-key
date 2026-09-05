import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireCanonicalSessionProfile,
  assertCanAccessMarca,
  assertKeywordBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";
import { ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { resolveDeepSeekCanonicalConfig, DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const IntentAnalysisSchema = z.record(z.string(), z.string().trim().min(1).max(500)).superRefine((value, context) => {
  const allowed = new Set(["urgencia_tempo", "intencao_local", "perfil_b2b", "emocao_dominante", "nivel_consciencia", "objecao_implicita", "poder_aquisitivo", "gatilho_de_conversao"]);
  const keys = Object.keys(value);
  if (keys.length < 3 || keys.length > 6) context.addIssue({ code: "custom", message: "A análise deve conter de 3 a 6 dimensões." });
  if (keys.some((key) => !allowed.has(key))) context.addIssue({ code: "custom", message: "A análise contém uma dimensão não prevista." });
});

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

    const canonicalClient = createCanonicalServiceClient();
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: profile.userId, brandId, client: canonicalClient, quotaUnits: 1 });
    const parsedData = await generateStructuredAI({
      provider,
      system: "Você é um Analista Comportamental de Buscas. Extraia somente de 3 a 6 dimensões óbvias da sintaxe da palavra-chave, usando apenas as chaves permitidas e textos curtos.",
      user: `Analise a intenção e a psicologia de busca por trás da palavra-chave: "${keyword}".`,
      schema: IntentAnalysisSchema,
      maxTokens: 900,
      thinkingMode: provider.thinkingMode,
    });

    const supabase = canonicalClient;

    // Obter o registro existente para mesclar e n�o apagar nicho_override e outros overrides
    const { data: existingWord } = await supabase
      .from("minerador_keywords")
      .select("brand_id,analise_semantica")
      .eq("id", keywordId)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
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
      .eq("brand_id", existingWord.brand_id)
      .is("deleted_at", null);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: parsedData
    });
  } catch (err) {
    if (err instanceof DeepSeekCanonicalError || err instanceof StructuredAIError || err instanceof ProviderRequestError) return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na API /api/analyze:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
