/*
 * 2026-10-16 · F1 da linha única do Minerador (SDD
 * `sdd-linha-unica-do-minerador-2026-10-16.md`, S-8): este arquivo ficou só com a
 * consulta do allintitle, que o DataForSEO usa (`dataforseo-serp-core.ts`). O
 * resto era da Extensão Chrome (lote, estágios, leitura da página do Google,
 * patch de resultado), aposentada em 2026-08-04 e sem chamador.
 */

/**
 * A CONSULTA DO KGR NÃO LEVA ASPAS.
 *
 * `allintitle:cnc` pergunta quantas páginas têm todas as palavras no título —
 * que é a definição do Resultado no KGR. `allintitle:"cnc"` pergunta outra
 * coisa: a FRASE exata no título. Para termo de uma palavra o Google chega a
 * degenerar a consulta — medição real de 2026-09-18: `allintitle:"cnc"`
 * devolveu 1 resultado e `allintitle:cnc` devolveu 1.720.
 *
 * Aspas e barras invertidas continuam sendo removidas do termo: elas quebram o
 * operador em vez de restringi-lo.
 */
export function buildAllintitleQuery(keyword: string): string {
  return `allintitle:${keyword.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}`;
}
