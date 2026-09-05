export const AI_LOGIC_PRECONDITION_NOTICE = "IA não iniciada: atualize a Lógica desta keyword antes da revisão.";

export type SemanticReviewFailureSummary = {
  code?: unknown;
  stage?: unknown;
};

export type SemanticReviewNotice = {
  kind: "logic_precondition" | "runtime";
  message: string;
};

export function isLogicSemanticReviewPrecondition(failure: SemanticReviewFailureSummary): boolean {
  return failure.code === "AI_REVIEW_LOGIC_REQUIRED" && failure.stage === "precondition";
}

/**
 * Keeps a blocked precondition distinct from an attempted provider run. A
 * batch containing another kind of failure continues to use the operational
 * summary so provider diagnostics are not hidden behind a generic message.
 */
export function resolveSemanticReviewNotice(input: {
  successCount: number;
  failCount: number;
  failures: readonly SemanticReviewFailureSummary[];
}): SemanticReviewNotice {
  const logicPreconditionBlocked = input.successCount === 0
    && input.failCount > 0
    && input.failures.length === input.failCount
    && input.failures.every(isLogicSemanticReviewPrecondition);

  if (logicPreconditionBlocked) {
    return { kind: "logic_precondition", message: AI_LOGIC_PRECONDITION_NOTICE };
  }

  return {
    kind: "runtime",
    message: `Revisão concluída: ${input.successCount} com sucesso e ${input.failCount} sem resposta válida. Os dados anteriores foram preservados.`,
  };
}
