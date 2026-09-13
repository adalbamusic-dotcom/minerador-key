/**
 * A POLÍTICA DA FASE 1 DA FORMAÇÃO — declarada, não embutida.
 *
 * A primeira passada fecha SILOS → ARTIGOS → LINKS com o processamento
 * produzindo uma formação completa; o humano confirma o RESULTADO em
 * "Concluir formação". Isso muda uma coisa no gate SERP: evidência VIGENTE
 * que não sustenta mudança deixa de virar microdecisão obrigatória.
 *
 * O que isto NÃO afrouxa:
 *
 *  - SERP ausente, falhada ou desatualizada continua bloqueando. A hipótese da
 *    lógica nunca substitui ir ao mercado;
 *  - a evidência continua sendo interpretada e gravada — nada é ignorado;
 *  - a decisão humana continua existindo, no ato que fecha o artigo inteiro.
 *
 * O que muda: divergência e inconclusão VIGENTES, sem ajuste determinístico
 * seguro, preservam o baseline estrutural — `humanFormationRef`, `humanRole` e
 * a Principal vigente — e registram o motivo como resultado terminal.
 */

export const PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION = false;

/** O que fica registrado quando a SERP não sustenta mudança. */
export const STRUCTURAL_BASELINE_PRESERVED = "STRUCTURAL_BASELINE_PRESERVED" as const;

export const STRUCTURAL_BASELINE_PRESERVED_REASON =
  "A SERP não apresentou evidência suficiente para alterar a formação; a composição decidida foi preservada.";

/**
 * A SERP sugeriu outro Silo?
 *
 * Artigos NÃO move keyword entre Silos: membership territorial é autoridade da
 * fase Silos. O que a fase pode fazer é registrar o diagnóstico para que
 * alguém o leve para lá.
 */
export const UPSTREAM_SILO_REVIEW_SUGGESTED = "UPSTREAM_SILO_REVIEW_SUGGESTED" as const;
