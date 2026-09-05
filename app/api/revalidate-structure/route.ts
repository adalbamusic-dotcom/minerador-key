import { NextResponse } from "next/server";
import { KeywordArticleReviewSchema } from "@/lib/arquiteto/contracts";
import {
  logicalCoverageGate,
  parseStructureReviewRequest,
  strategicSerpGate,
  type StructureReviewRejection,
} from "@/lib/arquiteto/ai-strategic-payload";
import { assertCanAccessMarca, requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { DeepSeekCanonicalError, resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError, type StructuredAIDiagnostic } from "@/lib/server/structured-ai";
import { CompactProviderResponseSchema } from "@/lib/arquiteto/keyword-review-provider";
import { classifyArchitectDeepSeekFailure, type ArchitectDeepSeekFailureStage } from "@/lib/arquiteto/deepseek-diagnostics";
import { buildAiArchitectureReviewPlan, buildKeywordArticleReviewDiff, enrichAiArchitectureReview } from "@/lib/arquiteto/ai-architecture-review";

/**
 * O contrato do request vive em `lib/arquiteto/ai-strategic-payload.ts`, junto
 * das projeções que o produzem: rota, cliente e testes compartilham o mesmo
 * schema, e a SERP compacta é validada pelo contrato estratégico — nunca pelo
 * assessment integral.
 */
const rejection = (rejected: StructureReviewRejection) => NextResponse.json({
  success: false,
  error: rejected.error,
  ...(rejected.code ? { code: rejected.code } : {}),
  ...(rejected.issues ? { issues: rejected.issues } : {}),
}, { status: rejected.status });

const SYSTEM_PROMPT = `Voce revisa exclusivamente a distribuicao de keywords entre artigos.
Leia cada keyword de forma independente antes de comparar a hipotese de agrupamento existente.
Nao gere ArticleDNA, SiloDNA, outline, titulo, slug, canonical, hierarquia ou estrategia de silo.

SUBTAREFAS INTERNAS OBRIGATORIAS (execute nesta ordem antes de consolidar):
A. diagnosticar grupos e conflitos de intenção;
B. revisar o pertencimento de cada keyword;
C. revisar principal, secundaria e reforco narrativo;
D. revisar canibalizacao usando a evidencia SERP;
E. consolidar uma proposta compacta por IDs.
O plano recebido apenas delimita os fatos de cada subtarefa. Nao devolva raciocinio longo nem KeywordDNA repetido.

ORDEM DE EVIDENCIAS:
1. Fatos primarios: keywordDnaSnapshot, projecao estrategica do KeywordDNA com leitura logica/canonica, entidade, modificadores, nicho, funil, confianca, ambiguidade, volume, tendencia, CPC, competicao Ads, KD, KGR, aplicabilidade, politica da principal e status upstream.
2. Evidencia externa: snapshots e assessments SERP normalizados.
3. Hipotese provisoria: focusGroups, articleCatalog e logicalRecommendations. Ela pode ser confirmada ou contestada, nunca tratada como fato.
4. Restricoes: silos recebidos e protecoes de publicados.

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
As logicalRecommendations calculam uma hipotese de encaixe; confirme ou corrija sem repetir raciocinio longo.
O campo keywordDnaSnapshot e o fato primario recebido do Minerador em projecao estrategica. Nao o reduza a keyword e volume; a ausencia de um campo significa dimensao indeterminada, nunca valor zero.
Use os assessments normalizados da DataForSEO, os silos e as proteções de identidade publicada recebidas no contexto. Evidência SERP orienta a revisão, mas não altera automaticamente a principal, slug, URL, canonical ou decisão humana.
Use apenas IDs recebidos. targetGroupId precisa existir no articleCatalog.
Use a mesma newArticleKey para keywords que devem formar juntas um novo artigo.
Use a mesma newSiloKey quando mais de um novo artigo fizer parte do mesmo silo proposto.
Seja conciso: uma frase curta por justificativa (no maximo 160 caracteres), no maximo um humanDecision por keyword e conflitos somente quando forem reais.
Omita targetGroupId, newArticleKey, siloPlacement e humanDecision quando nao forem aplicaveis.
Nao use null para siloPlacement: omita o campo. Para manter o silo atual, tambem omita siloPlacement.
Formato exato: {"decisions":[{"keywordId":"ID_EXATO","sourceGroupId":"GRUPO_EXATO","action":"manter_no_artigo","targetGroupId":null,"newArticleKey":null,"suggestedRole":"principal","justification":"frase curta","confidence":0.8,"humanDecision":null}],"conflicts":[],"summary":"frase curta"}.
Retorne apenas JSON valido no contrato compacto solicitado. Nada e aplicado ou aprovado automaticamente.`;

type RevalidationDiagnostic = StructuredAIDiagnostic & {
  correlationId: string;
  route: "/api/revalidate-structure";
  stage: "request_validation" | "connection_resolution" | "provider_request" | "response_parsing" | "proposal_validation" | "completed";
  modelResolved: string | null;
  failureStage: ArchitectDeepSeekFailureStage | null;
  proposalValidated: boolean;
};

function createRevalidationDiagnostic(correlationId: string): RevalidationDiagnostic {
  return {
    correlationId,
    route: "/api/revalidate-structure",
    stage: "request_validation",
    providerResolved: false,
    model: null,
    modelResolved: null,
    thinkingMode: null,
    requestStarted: false,
    httpStatus: null,
    finishReason: null,
    nativeFinishReason: null,
    contentPresent: false,
    contentLength: 0,
    reasoningPresent: false,
    jsonParsed: false,
    zodPassed: false,
    failureStage: null,
    proposalValidated: false,
  };
}

function logRevalidationFailure(diagnostic: RevalidationDiagnostic, error: unknown) {
  console.error("[arquiteto/revalidate-structure] operação não concluída", {
    ...diagnostic,
    errorName: error instanceof Error ? error.name : "UnknownError",
    // Não inclui conteúdo, reasoning, prompt, headers ou credenciais.
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Falha não identificada.",
  });
}

export async function POST(req: Request) {
  const diagnostic = createRevalidationDiagnostic(crypto.randomUUID());
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = parseStructureReviewRequest(await req.json());
    if (!parsed.ok) return rejection(parsed.rejection);
    await assertCanAccessMarca(profile.userId, parsed.data.brand.id, profile);
    const serpGate = strategicSerpGate(parsed.data);
    if (!serpGate.ok) return rejection(serpGate.rejection);
    diagnostic.stage = "connection_resolution";
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: profile.userId, brandId: parsed.data.brand.id, client: createCanonicalServiceClient() });
    diagnostic.providerResolved = true;
    diagnostic.model = provider.model;
    diagnostic.modelResolved = provider.model;
    diagnostic.thinkingMode = provider.thinkingMode;
    const coverage = logicalCoverageGate(parsed.data);
    if (!coverage.ok) return rejection(coverage.rejection);

    const stagePlan = buildAiArchitectureReviewPlan(parsed.data);
    const compact = await generateStructuredAI({
      provider,
      system: SYSTEM_PROMPT,
      user: `Execute as subtarefas A-E na ordem indicada e depois consolide a proposta. O payload contem fatos primarios do KeywordDNA, evidencia externa SERP, agrupamento provisório, catalogo, contexto selecionado da Marca, silos e protecoes publicadas. Nao omita fatos nem invente dados.\nPLANO INTERNO:\n${JSON.stringify(stagePlan)}\nCONTEXTO E FATOS:\n${JSON.stringify(parsed.data)}`,
      schema: CompactProviderResponseSchema,
      timeoutMs: 180_000,
      maxTokens: 4_000,
      // Esta operação só classifica e propõe repartição em JSON. O override é
      // por chamada e evita consumir o orçamento em reasoning longo; a
      // configuração global da Connection DeepSeek permanece intacta.
      thinkingMode: "disabled",
      onDiagnostic: (providerDiagnostic) => {
        Object.assign(diagnostic, providerDiagnostic);
        diagnostic.stage = providerDiagnostic.requestStarted ? (providerDiagnostic.jsonParsed ? "proposal_validation" : "provider_request") : "connection_resolution";
      },
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
    const review = enrichAiArchitectureReview({
      review: normalizedReview.data,
      proposalId: `ai-architecture:${diagnostic.correlationId}`,
      stageTrace: stagePlan,
      diff: buildKeywordArticleReviewDiff(parsed.data.focusGroups, normalizedReview.data),
    });
    diagnostic.proposalValidated = true;

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

    diagnostic.stage = "completed";
    return NextResponse.json({ success: true, data: review, diagnostic });
  } catch (error) {
    if (error instanceof DeepSeekCanonicalError) {
      diagnostic.stage = "connection_resolution";
      diagnostic.failureStage = "connection_resolution";
      logRevalidationFailure(diagnostic, error);
      return NextResponse.json({ success: false, error: error.message, code: error.code, diagnostic }, { status: error.status });
    }
    if (error instanceof StructuredAIError) {
      diagnostic.stage = diagnostic.jsonParsed ? "proposal_validation" : "response_parsing";
      diagnostic.failureStage = classifyArchitectDeepSeekFailure({
        providerResolved: diagnostic.providerResolved,
        requestStarted: diagnostic.requestStarted,
        httpStatus: diagnostic.httpStatus,
        finishReason: diagnostic.finishReason,
        nativeFinishReason: diagnostic.nativeFinishReason,
        contentPresent: diagnostic.contentPresent,
        reasoningPresent: diagnostic.reasoningPresent,
        jsonParsed: diagnostic.jsonParsed,
        zodPassed: diagnostic.zodPassed,
        proposalValidated: diagnostic.proposalValidated,
        errorCode: error.code,
      });
      logRevalidationFailure(diagnostic, error);
      return NextResponse.json({ success: false, error: error.message, code: error.code, issues: error.issues, diagnostic }, { status: error.status });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
