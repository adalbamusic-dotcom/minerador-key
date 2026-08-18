export type KeywordSelectionClickOptions = {
  selectedIds: Set<string>;
  visibleIds: string[];
  id: string;
  anchorId: string | null;
  shiftKey?: boolean;
  additiveKey?: boolean;
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

export function applyKeywordSelectionClick({ selectedIds, visibleIds, id, anchorId, shiftKey = false, additiveKey = false }: KeywordSelectionClickOptions): KeywordSelectionResult {
  const next = new Set(selectedIds);
  const clickedIndex = visibleIds.indexOf(id);
  const anchorIndex = anchorId ? visibleIds.indexOf(anchorId) : -1;

  if (shiftKey && clickedIndex >= 0 && anchorIndex >= 0) {
    const [start, end] = anchorIndex <= clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
    if (!additiveKey) next.clear();
    visibleIds.slice(start, end + 1).forEach(keywordId => next.add(keywordId));
  } else if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  return { selectedIds: next, anchorId: id };
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
