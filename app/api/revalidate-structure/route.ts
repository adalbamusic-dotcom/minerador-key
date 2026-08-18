import { NextResponse } from "next/server";
import { z } from "zod";
import {
  KeywordArticleCatalogEntrySchema,
  KeywordArticleReviewSchema,
  KeywordReviewFocusGroupSchema,
  LogicalKeywordRecommendationSchema,
} from "@/lib/arquiteto/contracts";
import { assertCanAccessMarca, requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { CompactProviderResponseSchema } from "@/lib/arquiteto/keyword-review-provider";

const RequestSchema = z.object({
  focusGroups: z.array(KeywordReviewFocusGroupSchema).min(1).max(4),
  articleCatalog: z.array(KeywordArticleCatalogEntrySchema).min(1).max(16),
  logicalRecommendations: z.array(LogicalKeywordRecommendationSchema).min(1).max(40),
  brand: z.object({ id: z.string(), name: z.string(), niche: z.string().nullable().optional() }).optional(),
}).strict();

const SYSTEM_PROMPT = `Voce revisa exclusivamente a distribuicao de keywords entre artigos.
As keywords ja possuem DNA logico e os artigos ja foram montados por um processo deterministico.
Nao gere ArticleDNA, SiloDNA, outline, titulo, slug, canonical, hierarquia ou estrategia de silo.

PRIORIDADE OBRIGATORIA:
1. Primeiro tente fortalecer artigos publicados do catalogo com keywords realmente aderentes.
2. Depois tente fortalecer artigos novos em silos existentes.
3. Crie artigo novo somente quando nenhum artigo existente tiver o mesmo contrato de busca.
4. Mantenha o novo artigo em silo existente sempre que houver encaixe; proponha novo silo somente quando a fronteira semantica realmente exigir.

Artigos publicados sao ancoras protegidas. Nunca mova a keyword publicada principal e nunca altere sua estrutura.
Uma keyword nova pode ser movida para um publicado como secundaria ou reforco narrativo quando fizer sentido.
REGRA RIGIDA: cada artigo pode ter no maximo 6 keywords no total, contando a principal. Nunca envie uma keyword para um artigo que ja tenha 6.
Quando um tema exigir mais de 6 keywords, distribua o excedente em novos artigos semanticamente especificos, priorizando o mesmo silo existente.
Cada keyword recebida em focusGroups deve aparecer exatamente uma vez em decisions.
As logicalRecommendations ja calculam encaixe atual e melhor candidato; valide ou corrija essa pre-analise, sem repetir raciocinio longo.
Use apenas IDs recebidos. targetGroupId precisa existir no articleCatalog.
Use a mesma newArticleKey para keywords que devem formar juntas um novo artigo.
Use a mesma newSiloKey quando mais de um novo artigo fizer parte do mesmo silo proposto.
Seja conciso: uma frase curta por justificativa, no maximo um humanDecision por keyword e conflitos somente quando forem reais.
Omita targetGroupId, newArticleKey, siloPlacement e humanDecision quando nao forem aplicaveis.
Nao use null para siloPlacement: omita o campo. Para manter o silo atual, tambem omita siloPlacement.
Formato exato: {"decisions":[{"keywordId":"ID_EXATO","sourceGroupId":"GRUPO_EXATO","action":"manter_no_artigo","targetGroupId":null,"newArticleKey":null,"suggestedRole":"principal","justification":"frase curta","confidence":0.8,"humanDecision":null}],"conflicts":[],"summary":"frase curta"}.
Retorne apenas JSON valido no contrato compacto solicitado. Nada e aplicado ou aprovado automaticamente.`;

export async function POST(req: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Lote compacto de keywords invalido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.brand?.id) await assertCanAccessMarca(profile.userId, parsed.data.brand.id, profile);
    const requestedKeywordIds = new Set(parsed.data.focusGroups.flatMap(group => group.keywords.map(keyword => keyword.keywordId)));
    const recommendationIds = new Set(parsed.data.logicalRecommendations.map(recommendation => recommendation.keywordId));
    if (requestedKeywordIds.size !== recommendationIds.size || [...requestedKeywordIds].some(id => !recommendationIds.has(id))) {
      return NextResponse.json({ success: false, error: "A pre-analise logica nao cobre exatamente as keywords do lote." }, { status: 400 });
    }

    const compact = await generateStructuredAI({
      system: SYSTEM_PROMPT,
      user: `Revise somente a pertinencia das keywords. Receba a pre-analise logica e um catalogo reduzido de candidatos:\n${JSON.stringify(parsed.data)}`,
      schema: CompactProviderResponseSchema,
      timeoutMs: 180_000,
    });
    const focusKeywords = new Map(parsed.data.focusGroups.flatMap(group => group.keywords.map(keyword => [keyword.keywordId, {
      groupId: group.groupId,
      isPublished: keyword.isPublished,
      isCurrentPrincipal: keyword.keywordId === group.currentPrincipalKeywordId,
    }] as const)));
    const catalogByArticle = new Map(parsed.data.articleCatalog.map(article => [article.articleId, article.groupId]));
    const logicalByKeyword = new Map(parsed.data.logicalRecommendations.map(recommendation => [recommendation.keywordId, recommendation]));
    const normalizedReview = KeywordArticleReviewSchema.safeParse({
      decisions: compact.decisions.map(decision => {
        const focus = focusKeywords.get(decision.keywordId);
        const logical = logicalByKeyword.get(decision.keywordId);
        let action = decision.action;
        let targetGroupId = decision.targetGroupId
          ? catalogByArticle.get(decision.targetGroupId) || decision.targetGroupId
          : null;
        if ((action === "mover_para_artigo" || action === "reforcar_publicado") && !targetGroupId) {
          targetGroupId = logical?.bestTargetGroupId || null;
          if (!targetGroupId) action = "manter_no_artigo";
        }
        if (action === "manter_no_artigo" || action === "criar_novo_artigo") targetGroupId = null;

        let placement = decision.siloPlacement;
        if (action !== "criar_novo_artigo") placement = undefined;
        if (placement?.action === "usar_silo_existente"
          && !parsed.data.articleCatalog.some(article => article.siloId === placement?.siloId)) placement = undefined;
        if (placement?.action === "propor_novo_silo" && (!placement.newSiloKey || !placement.siloName)) placement = undefined;
        const referencedSilo = placement?.siloId
          ? parsed.data.articleCatalog.find(article => article.siloId === placement?.siloId)
          : null;
        return {
          keywordId: decision.keywordId,
          sourceGroupId: decision.sourceGroupId ?? focus?.groupId,
          action,
          targetGroupId,
          newArticleKey: action === "criar_novo_artigo" ? decision.newArticleKey ?? `article-${decision.keywordId}` : null,
          siloPlacement: placement ? {
            action: placement.action,
            siloId: placement.siloId ?? null,
            siloName: placement.siloName ?? referencedSilo?.siloName ?? null,
            newSiloKey: placement.newSiloKey ?? null,
          } : { action: "manter_silo", siloId: null, siloName: null, newSiloKey: null },
          suggestedRole: decision.suggestedRole
            ?? (action === "reforcar_publicado" ? "reforco_narrativo" : focus?.isCurrentPrincipal ? "principal" : "secundaria"),
          justification: decision.providerWarning
            ? `${decision.providerWarning}${decision.justification ? ` ${decision.justification}` : ""}`
            : decision.justification ?? "Sugestao compacta da IA; revisar antes de aceitar.",
          confidence: decision.confidence ?? 0.5,
          humanDecisionPoints: decision.humanDecision ? [decision.humanDecision] : [],
        };
      }),
      conflicts: compact.conflicts.filter(conflict => conflict.keywordIds.length > 0).map((conflict, index) => ({
        id: `ai-keyword-conflict-${index + 1}`,
        level: "keyword",
        type: "distribuicao_ambigua",
        severity: "atencao",
        entityIds: conflict.keywordIds,
        reason: conflict.reason,
        evidence: ["Conflito apontado na revisao compacta da IA."],
        recommendation: "Comparar a pre-analise logica e decidir manualmente.",
        humanDecisionRequired: true,
      })),
      summary: compact.summary,
    });
    if (!normalizedReview.success) {
      const firstIssue = normalizedReview.error.issues[0];
      const detail = firstIssue
        ? ` Campo ${firstIssue.path.map(String).join(".") || "raiz"}: ${firstIssue.message}.`
        : "";
      throw new StructuredAIError(
        `A IA devolveu uma decisao estrutural incompleta ou contraditoria.${detail}`,
        422,
        normalizedReview.error.issues,
      );
    }
    const review = normalizedReview.data;

    const catalog = new Map(parsed.data.articleCatalog.map(article => [article.groupId, article]));
    const seen = new Set<string>();
    for (const decision of review.decisions) {
      const focus = focusKeywords.get(decision.keywordId);
      if (!focus || focus.groupId !== decision.sourceGroupId || seen.has(decision.keywordId)) {
        throw new StructuredAIError("A IA devolveu uma keyword ausente, duplicada ou ligada ao grupo de origem errado.", 422);
      }
      seen.add(decision.keywordId);
      if (focus.isPublished && decision.action !== "manter_no_artigo") {
        throw new StructuredAIError("A IA tentou mover uma keyword principal publicada protegida.", 422);
      }
      if (decision.targetGroupId && !catalog.has(decision.targetGroupId)) {
        throw new StructuredAIError("A IA indicou um artigo-alvo inexistente.", 422);
      }
      if (decision.action === "reforcar_publicado" && !catalog.get(decision.targetGroupId || "")?.isPublished) {
        throw new StructuredAIError("Uma decisao de reforco publicado apontou para artigo nao publicado.", 422);
      }
      if (decision.action !== "criar_novo_artigo" && decision.siloPlacement.action !== "manter_silo") {
        throw new StructuredAIError("A IA tentou mudar o silo sem estar propondo um novo artigo.", 422);
      }
      if (decision.siloPlacement.action === "usar_silo_existente"
        && !parsed.data.articleCatalog.some(article => article.siloId === decision.siloPlacement.siloId)) {
        throw new StructuredAIError("A IA indicou um silo existente que nao consta no catalogo.", 422);
      }
    }
    if (seen.size !== focusKeywords.size) {
      throw new StructuredAIError("A IA nao revisou todas as keywords deste lote. Tente novamente.", 422);
    }

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    if (error instanceof StructuredAIError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
