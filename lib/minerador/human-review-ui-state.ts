/**
 * Estado visual da Revisão Humana.
 *
 * Revisão Humana não é gate: não bloqueia aprovação, status nem handoff. Ela
 * só existe quando há decisão humana real disponível. Chamar de "pendente" um
 * painel que não tem nada a decidir criava trabalho inventado — o usuário via
 * uma cobrança sem ação correspondente e era empurrado a reprocessar.
 *
 * - `no_decision_needed`: nada a decidir; o painel é leitura.
 * - `decision_available`: existe decisão humana concreta esperando escolha.
 * - `decisions_recorded`: o humano já registrou suas decisões.
 */
export type HumanReviewUiState = "no_decision_needed" | "decision_available" | "decisions_recorded";

export function deriveHumanReviewUiState(input: {
  completed?: boolean;
  /** Decisões humanas concretas ainda sem escolha registrada. */
  pendingDecisions?: number;
}): HumanReviewUiState {
  if (input.completed) return "decisions_recorded";
  return (input.pendingDecisions || 0) > 0 ? "decision_available" : "no_decision_needed";
}

export function humanReviewStatePill(state: HumanReviewUiState): { label: string; tone: "success" | "pending" | "neutral" } {
  if (state === "decisions_recorded") return { label: "Decisões registradas", tone: "success" };
  if (state === "decision_available") return { label: "Decisão disponível", tone: "pending" };
  return { label: "Sem decisões pendentes", tone: "neutral" };
}

export function humanReviewStateSummary(state: HumanReviewUiState, pendingDecisions = 0): string {
  if (state === "decisions_recorded") return "decisões humanas registradas";
  if (state === "decision_available") return `${pendingDecisions} decisão(ões) humana(s) disponível(is)`;
  return "sem decisões pendentes · painel de leitura";
}
