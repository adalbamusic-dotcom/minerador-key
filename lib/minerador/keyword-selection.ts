export type KeywordSelectionClickOptions = {
  selectedIds: Set<string>;
  visibleIds: string[];
  id: string;
  anchorId: string | null;
  shiftKey?: boolean;
  additiveKey?: boolean;
  /**
   * Ativação por teclado (Espaço/Enter no `role="checkbox"`).
   *
   * O mouse numa planilha TROCA a seleção; a caixa de seleção, para quem
   * navega por teclado ou leitor de tela, precisa continuar alternando o item
   * sob foco — limpar o resto num Espaço seria destruir a seleção sem aviso.
   */
  keyboard?: boolean;
};

export type KeywordSelectionResult = {
  selectedIds: Set<string>;
  anchorId: string;
};

export type KeywordSelectionPaintOptions = {
  initialSelectedIds: Set<string>;
  visibleIds: string[];
  anchorId: string;
  currentId: string;
  mode: "select" | "deselect";
};

/**
 * AS TRÊS SELEÇÕES DE UMA PLANILHA.
 *
 *   clique          — a seleção passa a ser SÓ o item clicado.
 *   Ctrl/Cmd+clique — alterna o item e preserva os demais.
 *   Shift+clique    — intervalo da âncora até o item, na ordem visual.
 *
 * O clique simples alternava em vez de trocar, e o resultado era uma planilha
 * que se comportava como se Ctrl estivesse permanentemente pressionado: cada
 * clique somava mais uma linha e nada saía da seleção.
 *
 * A âncora NÃO se move no Shift. Ela é a origem do intervalo, e movê-la fazia
 * o segundo Shift+clique medir a partir do destino do primeiro, encurtando o
 * trecho a cada tentativa de esticá-lo.
 */
export function applyKeywordSelectionClick({ selectedIds, visibleIds, id, anchorId, shiftKey = false, additiveKey = false, keyboard = false }: KeywordSelectionClickOptions): KeywordSelectionResult {
  const next = new Set(selectedIds);
  const clickedIndex = visibleIds.indexOf(id);
  const anchorIndex = anchorId ? visibleIds.indexOf(anchorId) : -1;

  if (shiftKey && clickedIndex >= 0 && anchorIndex >= 0) {
    const [start, end] = anchorIndex <= clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
    if (!additiveKey) next.clear();
    visibleIds.slice(start, end + 1).forEach(keywordId => next.add(keywordId));
    return { selectedIds: next, anchorId: anchorId as string };
  }

  if (additiveKey || keyboard) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedIds: next, anchorId: id };
  }

  // Clicar de novo no único item selecionado limpa a seleção: é a forma de
  // desmarcar sem precisar de outro controle.
  if (next.size === 1 && next.has(id)) return { selectedIds: new Set(), anchorId: id };
  return { selectedIds: new Set([id]), anchorId: id };
}

export function toggleVisibleKeywordSelection(selectedIds: Set<string>, visibleIds: string[]): Set<string> {
  const next = new Set(selectedIds);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => next.has(id));
  visibleIds.forEach(id => {
    if (allVisibleSelected) next.delete(id);
    else next.add(id);
  });
  return next;
}

export function applyKeywordSelectionPaint({ initialSelectedIds, visibleIds, anchorId, currentId, mode }: KeywordSelectionPaintOptions): Set<string> {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const currentIndex = visibleIds.indexOf(currentId);
  const next = new Set(initialSelectedIds);
  if (anchorIndex < 0 || currentIndex < 0) return next;
  const [start, end] = anchorIndex <= currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
  visibleIds.slice(start, end + 1).forEach(keywordId => {
    if (mode === "select") next.add(keywordId);
    else next.delete(keywordId);
  });
  return next;
}
