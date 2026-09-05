import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, assertCanAccessMarca, authzErrorResponse } from "@/lib/server/authz";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { resolveDeepSeekCanonicalConfig, DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const ClusterResponseSchema = z.object({
  clusters: z.array(z.object({
    tema_principal: z.string().trim().min(1).max(160),
    keywords: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  }).strict()).max(100),
}).strict();

export async function POST(req: Request) {
  try {
    // 1. Autenticacao: protege gasto de chave de IA
    const profile = await requireCanonicalSessionProfile();

    const body = await req.json() as { keywords?: unknown; brandId?: unknown };
    const keywords = body.keywords;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { success: false, error: "Parâmetros inválidos. É necessário informar um array de palavras-chave." },
        { status: 400 }
      );
    }

    // Formata dados simplificados para reduzir uso de tokens e agilizar resposta
    const formattedKeywords = (keywords as Array<Record<string, unknown>>).map(item => {
      const semantic = item.analise_semantica && typeof item.analise_semantica === "object"
        ? item.analise_semantica as Record<string, unknown>
        : null;
      return {
        keyword: item.keyword,
        volume: item.volume_search,
        intent: item.intent,
        nicho: semantic?.nicho_override || null,
      };
    });

    const brandId = typeof body.brandId === "string"
      ? body.brandId
      : (keywords as Array<Record<string, unknown>>).find((item) => typeof item.brand_id === "string")?.brand_id;
    if (typeof brandId !== "string" || !brandId.trim()) return NextResponse.json({ success: false, error: "brandId é obrigatório para a clusterização." }, { status: 400 });
    await assertCanAccessMarca(profile.userId, brandId, profile);
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: profile.userId, brandId, client: createCanonicalServiceClient(), quotaUnits: 1 });
    const parsedResponse = await generateStructuredAI({
      provider,
      system: "Você é um Analista de SEO focado em prevenção de canibalização. Agrupe somente keywords com a mesma intenção de busca e retorne o contrato clusters.",
      user: `Agrupe as seguintes palavras-chave em clusters:\n${JSON.stringify(formattedKeywords, null, 2)}`,
      schema: ClusterResponseSchema,
      maxTokens: 1800,
      thinkingMode: provider.thinkingMode,
    });

    return NextResponse.json({
      success: true,
      clusters: parsedResponse.clusters,
    });
  } catch (err) {
    if (err instanceof DeepSeekCanonicalError || err instanceof StructuredAIError) return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro na clusterização:", err);
    return NextResponse.json(
      { success: false, error: mapped.message || "Erro interno de processamento." },
      { status: mapped.status }
    );
  }
}
