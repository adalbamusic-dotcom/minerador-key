export type ArticleAiExecutionState =
  | "NOT_RUN"
  /** Existe revisão persistida, mas de outra base arquitetural. */
  | "STALE"
  | "PROCESSING"
  | "COMPLETED_NO_PROPOSALS"
  | "COMPLETED_WITH_PROPOSALS"
  | "ERROR";

export type ArticleHumanReviewState = "NOT_REQUIRED" | "PENDING" | "IN_REVIEW" | "COMPLETED";

export type ArticleProcessAnnotation = {
  reviewState: "pending_fine_review" | "reviewed" | "adjusted" | "dismissed";
  /** `false` marca execução da IA sem mutação; não conta como proposta. */
  structuralChange?: boolean;
};

export type ArticleProcessReadModel = {
  logic: { state: "NOT_RUN" | "PROCESSING" | "COMPLETED" };
  serp: { state: "NOT_RUN" | "PROCESSING" | "COMPLETED" | "ERROR" };
  ai: {
    state: ArticleAiExecutionState;
    /** Propostas vigentes sobre a base atual. STALE nunca contribui aqui. */
    proposalCount: number;
    /** Propostas da revisão desatualizada: histórico, não pendência ativa. */
    historicalProposalCount: number;
  };
  review: { state: ArticleHumanReviewState; pendingCount: number };
};

export type ArticleProcessReadModelInput = {
  logicProcessing: boolean;
  hasLogicalOutput: boolean;
  serpProcessing: boolean;
  hasSerpAssessment: boolean;
  serpHasError: boolean;
  aiProcessing: boolean;
  aiHasError?: boolean;
  aiCompletedWithoutProposals?: boolean;
  pendingProposalCount: number;
  /** Estado durável lido do artefato canônico da revisão IA. */
  durableAiState?: "COMPLETED_NO_PROPOSALS" | "COMPLETED_WITH_PROPOSALS" | null;
  durableMaterialProposalCount?: number;
  durablePendingProposalCount?: number;
  /** Base do Article mudou depois da revisão: ela vira histórico, não vigente. */
  aiBaseChanged?: boolean;
  annotations: readonly ArticleProcessAnnotation[];
  humanPendingDecisionCount: number;
  reviewProcessing: boolean;
};

/**
 * The Article process panel is a projection only. It deliberately combines the
 * proposal queue and the annotations already applied to the working copy, so a
 * proposal never disappears from Review merely because it has been applied.
 */
export function deriveArticleProcessReadModel(input: ArticleProcessReadModelInput): ArticleProcessReadModel {
  // Uma execução sem mutação é registro, não proposta: entra na conclusão da
  // IA, mas nunca vira pendência humana artificial.
  const structuralAnnotations = input.annotations.filter(annotation => annotation.structuralChange !== false);
  const noOpAnnotationCount = input.annotations.length - structuralAnnotations.length;
  const annotationProposalCount = structuralAnnotations.length;
  const pendingAnnotationCount = structuralAnnotations.filter(annotation => annotation.reviewState === "pending_fine_review").length;
  // Revisão de base antiga não conta como revisão vigente; permanece histórico
  // visível, sem virar pendência humana da estrutura atual.
  const staleReview = Boolean(input.aiBaseChanged) && Boolean(input.durableAiState);
  const durableState = staleReview ? null : input.durableAiState ?? null;
  const durableMaterialCount = staleReview ? 0 : input.durableMaterialProposalCount ?? 0;
  const durablePendingCount = staleReview ? 0 : input.durablePendingProposalCount ?? 0;
  const historicalProposalCount = staleReview ? input.durableMaterialProposalCount ?? 0 : 0;
  const proposalCount = Math.max(input.pendingProposalCount, annotationProposalCount, durableMaterialCount);
  // Sessão e artefato descrevem a mesma execução: contam uma vez, não somam.
  const pendingCount = Math.max(input.pendingProposalCount, durablePendingCount) + pendingAnnotationCount + input.humanPendingDecisionCount;

  const aiState: ArticleAiExecutionState = input.aiProcessing
    ? "PROCESSING"
    : input.aiHasError
      ? "ERROR"
      : proposalCount > 0
        ? "COMPLETED_WITH_PROPOSALS"
        : input.aiCompletedWithoutProposals || noOpAnnotationCount > 0 || durableState === "COMPLETED_NO_PROPOSALS"
          ? "COMPLETED_NO_PROPOSALS"
          // Revisão existente de outra base é DESATUALIZADA, nunca "não executada".
          : durableState || (staleReview ? "STALE" : "NOT_RUN");

  const reviewState: ArticleHumanReviewState = input.reviewProcessing
    ? "IN_REVIEW"
    : pendingCount > 0
      ? "PENDING"
      : annotationProposalCount > 0 || durableState
        ? "COMPLETED"
        : "NOT_REQUIRED";

  return {
    logic: {
      state: input.logicProcessing ? "PROCESSING" : input.hasLogicalOutput ? "COMPLETED" : "NOT_RUN",
    },
    serp: {
      state: input.serpProcessing ? "PROCESSING" : input.serpHasError ? "ERROR" : input.hasSerpAssessment ? "COMPLETED" : "NOT_RUN",
    },
    ai: { state: aiState, proposalCount, historicalProposalCount },
    review: { state: reviewState, pendingCount },
  };
}

export function articleAiStateLabel(state: ArticleAiExecutionState) {
  return {
    NOT_RUN: "Não executada",
    STALE: "Desatualizada",
    PROCESSING: "Em processamento",
    COMPLETED_NO_PROPOSALS: "Concluída sem propostas",
    COMPLETED_WITH_PROPOSALS: "Concluída",
    ERROR: "Com erro",
  }[state];
}

export function articleReviewStateLabel(state: ArticleHumanReviewState) {
  return {
    NOT_REQUIRED: "Não necessária",
    PENDING: "Aguardando humano",
    IN_REVIEW: "Em revisão",
    COMPLETED: "Concluída",
  }[state];
}

export type ArticleProcessWorkbenchState = "available" | "processing" | "completed" | "pending" | "error";

/** Aggregates only already-derived article projections for the Workbench. */
export function aggregateArticleProcessReadModels(models: ArticleProcessReadModel[]) {
  const aggregate = (process: keyof ArticleProcessReadModel): ArticleProcessWorkbenchState => {
    if (!models.length) return "available";
    const states = models.map(model => model[process].state);
    if (states.includes("PROCESSING") || states.includes("IN_REVIEW")) return "processing";
    if (states.includes("ERROR")) return "error";
    if (states.includes("PENDING")) return "pending";
    if (process === "review") return states.every(state => state === "COMPLETED") ? "completed" : "available";
    return states.every(state => state === "COMPLETED" || state === "COMPLETED_NO_PROPOSALS" || state === "COMPLETED_WITH_PROPOSALS")
      ? "completed"
      : "available";
  };

  return {
    logic: aggregate("logic"),
    serp: aggregate("serp"),
    ai: aggregate("ai"),
    review: aggregate("review"),
  };
}
