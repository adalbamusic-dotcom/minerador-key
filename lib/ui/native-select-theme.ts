/**
 * Tema das listas de opções dos `<select>` nativos (pedido do dono,
 * 2026-09-24: no modo escuro a lista abria branca e ilegível).
 *
 * - `scheme-dark` faz o navegador desenhar a lista de opções escura; no tema
 *   claro (`.light` ou `[data-theme="light"]`, definidos em globals.css) volta
 *   a `scheme-light`.
 * - `**:` alcança as opções em qualquer profundidade, inclusive dentro de
 *   `<optgroup>` — `*:` só pegava os filhos diretos do select.
 * - Só tokens: fundo e texto seguem o tema ativo.
 */
export const NATIVE_SELECT_THEME = "scheme-dark in-[.light]:scheme-light in-data-[theme=light]:scheme-light **:bg-background **:text-foreground";
