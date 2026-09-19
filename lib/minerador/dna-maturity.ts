/**
 * Maturidade do KeywordDNA.
 *
 * Mora aqui desde 2026-09-18, quando a IA saiu do Minerador e levou junto o
 * arquivo que a hospedava. A escada nunca foi sobre IA: ela mede se a Lógica
 * interpretou a keyword, se Volume e Resultado foram medidos no Processador,
 * se o KGR foi tratado e se o humano concluiu a revisão.
 *
 * O termo `aiReviewCompleted` que existia aqui vinha de `process.ai.complete`,
 * que nunca era verdadeiro porque nenhuma keyword carregava `ai_review`. Na
 * prática ele travava a escada em `PARCIAL` para a plataforma inteira.
 */

export type DnaMaturity = "INSUFICIENTE" | "PARCIAL" | "COMPLETA PARA REVISÃO" | "CONFIRMADA";

export function deriveDnaMaturity(input: {
  logicalProcessed: boolean;
  googleAdsValid: boolean;
  dataForSeoValid: boolean;
  kgrTreated: boolean;
  humanConfirmed: boolean;
  /** R6 may explicitly keep KGR pending while still completing the review. */
  humanReviewCompleted?: boolean;
}): DnaMaturity {
  if (!input.logicalProcessed) return "INSUFICIENTE";
  const completeForReview = input.googleAdsValid && input.dataForSeoValid && input.kgrTreated;
  if (completeForReview && (input.humanConfirmed || input.humanReviewCompleted)) return "CONFIRMADA";
  if (completeForReview) return "COMPLETA PARA REVISÃO";
  return "PARCIAL";
}

export function dnaMaturityLabel(value: DnaMaturity): string {
  return value;
}
