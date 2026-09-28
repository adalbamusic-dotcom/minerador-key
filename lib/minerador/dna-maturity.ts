/**
 * Maturidade do KeywordDNA.
 *
 * Mora aqui desde 2026-09-18, quando a IA saiu do Minerador e levou junto o
 * arquivo que a hospedava. A escada nunca foi sobre IA: ela mede se a Lógica
 * interpretou a keyword, se o Volume foi processado e se o humano concluiu a
 * revisão. Resultado (SERP) e KGR saíram da escada em 2026-09-28: são opcionais.
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
  /*
   * Desde 2026-09-28 (SDD SERP no artigo e KGR opcional, M3), "completa para
   * revisão" depende só do Volume processado (Google Ads) e da Lógica — já
   * garantida acima. Resultados (SERP) e KGR são opcionais: `dataForSeoValid` e
   * `kgrTreated` ficam na assinatura pelos chamadores e não travam a escada.
   * Os rótulos do enum não mudam (KeywordDNA `.strict()`).
   */
  const completeForReview = input.googleAdsValid;
  if (completeForReview && (input.humanConfirmed || input.humanReviewCompleted)) return "CONFIRMADA";
  if (completeForReview) return "COMPLETA PARA REVISÃO";
  return "PARCIAL";
}

export function dnaMaturityLabel(value: DnaMaturity): string {
  return value;
}
