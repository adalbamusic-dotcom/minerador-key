export type ArticleSelectionClickOptions = {
  selectedIds: Set<string>;
  visibleIds: string[];
  id: string;
  anchorId: string | null;
  shiftKey?: boolean;
  additiveKey?: boolean;
};

export type ArticleSelectionResult = {
  selectedIds: Set<string>;
  anchorId: string;
};

export type ArticleSelectionPaintOptions = {
  initialSelectedIds: Set<string>;
  visibleIds: string[];
  anchorId: string;
  currentId: string;
  mode: "select" | "deselect";
};

export function selectionRangeIndices(startIndex: number, endIndex: number, length: number): number[] {
  if (startIndex < 0 || endIndex < 0 || startIndex >= length || endIndex >= length) return [];
  const step = startIndex <= endIndex ? 1 : -1;
  const indices: number[] = [];
  for (let index = startIndex; ; index += step) {
    indices.push(index);
    if (index === endIndex) return indices;
  }
}

export function applyArticleSelectionClick({
  selectedIds,
  visibleIds,
  id,
  anchorId,
  shiftKey = false,
  additiveKey = false,
}: ArticleSelectionClickOptions): ArticleSelectionResult {
  const next = new Set(selectedIds);
  const clickedIndex = visibleIds.indexOf(id);
  const anchorIndex = anchorId ? visibleIds.indexOf(anchorId) : -1;

  if (shiftKey && clickedIndex >= 0 && anchorIndex >= 0) {
    const [start, end] = anchorIndex <= clickedIndex
      ? [anchorIndex, clickedIndex]
      : [clickedIndex, anchorIndex];
    if (!additiveKey) next.clear();
    visibleIds.slice(start, end + 1).forEach(articleId => next.add(articleId));
  } else if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  return { selectedIds: next, anchorId: id };
}

export function toggleVisibleArticleSelection(selectedIds: Set<string>, visibleIds: string[]): Set<string> {
  const next = new Set(selectedIds);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => next.has(id));
  visibleIds.forEach(id => {
    if (allVisibleSelected) next.delete(id);
    else next.add(id);
  });
  return next;
}

export function applySelectionPaint({
  initialSelectedIds,
  visibleIds,
  anchorId,
  currentId,
  mode,
}: ArticleSelectionPaintOptions): Set<string> {
  const next = new Set(initialSelectedIds);
  const anchorIndex = visibleIds.indexOf(anchorId);
  const currentIndex = visibleIds.indexOf(currentId);
  const range = selectionRangeIndices(anchorIndex, currentIndex, visibleIds.length);
  range.forEach(index => {
    if (mode === "select") next.add(visibleIds[index]);
    else next.delete(visibleIds[index]);
  });
  return next;
}
