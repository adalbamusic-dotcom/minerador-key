/**
 * A NOTA DE DIFERENCIAÇÃO NO ArticleDNA — o formato que desce ao Radar e ao
 * Redator (SDD docs/04-arquiteto/sdd-diferenciacao-publicados-canibalizados-2026-09-27.md §5).
 *
 * A nota mora no campo que o ArticleDNA JÁ tem, `differentiation` (lista de
 * textos), com o prefixo `Diferenciação: `: nenhum campo novo no schema
 * `.strict()` — código antigo em produção continua lendo a versão nova.
 *
 * Arquivo sem dependências: o envio do Radar ao Redator importa só isto.
 */

export const DIFFERENTIATION_NOTE_PREFIX = "Diferenciação: " as const;
export const DIFFERENTIATION_LINK_PREFIX = "Link interno sugerido: " as const;
/** Linhas de diferenciação que viajam no `editorialContext`. */
export const DIFFERENTIATION_EDITORIAL_LINES_MAX = 4;

/**
 * As linhas que descem ao Redator no `editorialContext` do envio do Radar: só
 * as de diferenciação do ArticleDNA fixado, no máximo 4. Sem nota, `[]` — o
 * documento sai byte a byte como antes.
 */
export function differentiationEditorialLines(differentiation: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(differentiation)) return [];
  return differentiation
    .filter((linha): linha is string => typeof linha === "string" && linha.startsWith(DIFFERENTIATION_NOTE_PREFIX))
    .slice(0, DIFFERENTIATION_EDITORIAL_LINES_MAX);
}
