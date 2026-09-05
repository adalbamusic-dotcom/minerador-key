import type {
  AiArchitectureReviewStageTrace,
  KeywordArticleReview,
  KeywordArticleReviewDiff,
  KeywordReviewFocusGroup,
  KeywordArticleCatalogEntry,
  LogicalKeywordRecommendation,
} from "./contracts.ts";
import type { StrategicSerpAssessment } from "./ai-strategic-payload.ts";

type ReviewPlanInput = {
  focusGroups: KeywordReviewFocusGroup[];
  articleCatalog: KeywordArticleCatalogEntry[];
  logicalRecommendations: LogicalKeywordRecommendation[];
  serpAssessments: StrategicSerpAssessment[];
};

const ids = (groups: KeywordReviewFocusGroup[]) => groups.flatMap(group => group.keywords.map(keyword => keyword.keywordId));
const unique = (values: string[]) => [...new Set(values)];

/**
 * Mantém as cinco subtarefas explícitas no contrato, mesmo quando o provider
 * as resolve numa chamada compacta por lote. O plano é composto pelo servidor
 * a partir dos fatos já recebidos; não é uma segunda fonte de verdade.
 */
export function buildAiArchitectureReviewPlan(input: ReviewPlanInput): AiArchitectureReviewStageTrace[] {
  const keywordIds = unique(ids(input.focusGroups));
  const groupIds = unique(input.focusGroups.map(group => group.groupId));
  const hasSerpEvidence = input.serpAssessments.some(assessment => assessment.snapshotCount > 0);
  const hasAlternativeArticles = input.articleCatalog.length > input.focusGroups.length;
  const hasLogicalRecommendations = input.logicalRecommendations.length === keywordIds.length;

  return [
    {
      stage: "diagnosticar_grupos",
      status: hasLogicalRecommendations ? "completed" : "evidence_insufficient",
      keywordIds,
      groupIds,
      note: hasLogicalRecommendations ? "Grupos e recomendações lógicas foram identificados para comparação." : "A pré-análise lógica não cobre todas as keywords do lote.",
    },
    {
      stage: "revisar_pertencimento",
      status: hasAlternativeArticles ? "completed" : "evidence_insufficient",
      keywordIds,
      groupIds: unique(input.articleCatalog.map(article => article.groupId)),
      note: hasAlternativeArticles ? "Pertencimento será comparado com artigos relevantes do catálogo." : "O lote não possui artigo alternativo suficiente para comparar pertencimento.",
    },
    {
      stage: "revisar_papeis",
      status: "completed",
      keywordIds,
      groupIds,
      note: "Principal, secundária e reforço narrativo serão revisados respeitando âncoras publicadas e o limite de seis keywords.",
    },
    {
      stage: "revisar_canibalizacao",
      status: hasSerpEvidence ? "completed" : "evidence_insufficient",
      keywordIds,
      groupIds,
      note: hasSerpEvidence ? "Sobreposição e conflito serão avaliados com os assessments SERP recebidos." : "SERP sem snapshot suficiente; conflitos não serão inventados.",
    },
    {
      stage: "consolidar_proposta",
      status: "completed",
      keywordIds,
      groupIds,
      note: "A saída é uma proposta por ID, pendente de revisão humana; nenhuma aprovação é produzida.",
    },
  ];
}

export function buildKeywordArticleReviewDiff(
  focusGroups: KeywordReviewFocusGroup[],
  review: Pick<KeywordArticleReview, "decisions">,
): KeywordArticleReviewDiff[] {
  const current = new Map(focusGroups.flatMap(group => group.keywords.map(keyword => [keyword.keywordId, {
    groupId: group.groupId,
    role: keyword.keywordId === group.currentPrincipalKeywordId ? "principal" as const : "secundaria" as const,
    published: group.isPublished && keyword.keywordId === group.currentPrincipalKeywordId,
  }] as const)));
  return review.decisions.map(decision => {
    const origin = current.get(decision.keywordId);
    return {
      keywordId: decision.keywordId,
      sourceGroupId: decision.sourceGroupId,
      targetGroupId: decision.targetGroupId,
      newArticleKey: decision.newArticleKey,
      fromRole: origin?.role || null,
      toRole: decision.suggestedRole,
      action: decision.action,
      justification: decision.justification,
      confidence: decision.confidence,
      publishedProtected: Boolean(origin?.published),
    };
  });
}

export function enrichAiArchitectureReview(input: {
  review: KeywordArticleReview;
  proposalId: string;
  stageTrace: AiArchitectureReviewStageTrace[];
  diff: KeywordArticleReviewDiff[];
}): KeywordArticleReview {
  return {
    ...input.review,
    proposalId: input.proposalId,
    source: "ai",
    approvalStatus: "pending_human",
    stageTrace: input.stageTrace,
    diff: input.diff,
  };
}
