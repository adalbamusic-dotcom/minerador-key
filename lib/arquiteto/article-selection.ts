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

/**
 * A identidade usada pela seleção pertence à cópia de trabalho do artigo. O
 * objeto pode ser um item canônico, um item de recuperação ou uma projeção da
 * tabela; em todos os casos a ordem de resolução evita conteúdo mutável.
 */
export function resolveWorkingArticleId(input: Record<string, unknown>): string | null {
  const workflow = input.canonicalWorkflow && typeof input.canonicalWorkflow === "object" && !Array.isArray(input.canonicalWorkflow)
    ? input.canonicalWorkflow as Record<string, unknown>
    : {};
  const artifact = input.canonicalArtifact && typeof input.canonicalArtifact === "object" && !Array.isArray(input.canonicalArtifact)
    ? input.canonicalArtifact as Record<string, unknown>
    : {};
  const candidates = [
    input.workingArticleId,
    input.articleId,
    workflow.articleId,
    artifact.entityId,
    input.persistentArticleId,
    input.provisionalGroupId,
    input.briefingId,
    workflow.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" && typeof candidate !== "number") continue;
    const value = String(candidate).trim();
    if (value && value !== "null" && value !== "undefined") return value;
  }
  return null;
}

export function articleSelectionIdForWorkingArticle(workingArticleId: unknown): string | null {
  if (typeof workingArticleId !== "string" && typeof workingArticleId !== "number") return null;
  const normalizedId = String(workingArticleId).trim();
  return normalizedId ? `article-working:${encodeURIComponent(normalizedId)}` : null;
}

export function sameSelectionSet(current: ReadonlySet<string>, expected: ReadonlySet<string>): boolean {
  if (current.size !== expected.size) return false;
  for (const value of expected) if (!current.has(value)) return false;
  return true;
}

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

/**
 * Identidade da linha quando o Article vem da FORMAÇÃO.
 *
 * `workingArticleId` deixou de servir sozinho: várias keywords do mesmo grupo
 * do Minerador carregam o MESMO `workingArticleId`, e desde que a formação
 * passou a agrupar por convergência elas podem cair em artigos diferentes.
 * Duas linhas distintas ficariam com a mesma chave.
 *
 * O `candidateRef` já é derivado de identificadores canônicos — o Silo e a
 * keyword principal — então continua sendo identidade real, não um índice
 * visual nem um hash de conteúdo.
 */
export function articleSelectionIdForCandidate(candidateRef: unknown): string | null {
  if (typeof candidateRef !== "string") return null;
  const normalizedRef = candidateRef.trim();
  return normalizedRef ? `article-candidate:${encodeURIComponent(normalizedRef)}` : null;
}
