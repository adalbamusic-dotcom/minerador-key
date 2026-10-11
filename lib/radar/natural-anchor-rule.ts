/**
 * 2026-10-11 · A REGRA DA ÂNCORA NATURAL, em texto — a MESMA frase no pedido do
 * artigo-modelo, no CSV "Para escrever", no Redator e no MCP. Módulo sem
 * dependência: a regra entra em constantes de topo de outros módulos (as regras
 * gerais do CSV) sem fechar ciclo de carga com a régua (`natural-anchor.ts`).
 */

/** A regra dita a quem escreve (CSV, Redator e MCP). */
export const RADAR_NATURAL_ANCHOR_RULE =
  "A âncora de cada link interno é um trecho natural da frase que nomeia a ideia do destino (em geral 2 a 4 palavras), nunca a keyword principal inteira do destino; e varia: a mesma âncora não se repete para o mesmo destino em outra seção nem em outro artigo do mesmo Silo.";

/** A mesma regra, no pedido do artigo-modelo (a IA recebe também os conceitos de âncora do grafo aprovado). */
export const RADAR_NATURAL_ANCHOR_PROMPT_RULE =
  "A ÂNCORA é um recorte natural da ideia do destino que cabe na frase da seção (em geral 2 a 4 palavras): prefira os conceitos de âncora do grafo aprovado dados no candidato K; nunca use a keyword principal inteira do destino (nem frase que a contenha inteira); não repita a mesma âncora para o mesmo destino em outra seção.";
