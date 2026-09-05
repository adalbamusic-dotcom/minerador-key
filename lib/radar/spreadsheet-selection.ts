export type RadarSpreadsheetSelectionState = {
  selectedArticleIds: string[];
  activeArticleId: string | null;
};

function uniqueArticleIds(articleIds: readonly string[]) {
  return [...new Set(articleIds.filter(Boolean))];
}

export function assertSelectionInvariant(state: RadarSpreadsheetSelectionState) {
  if (state.selectedArticleIds.length > 0 && state.activeArticleId === null) {
    throw new Error("Todo artigo selecionado precisa manter um artigo ativo no Workbench.");
  }
  if (state.activeArticleId !== null && !state.selectedArticleIds.includes(state.activeArticleId)) {
    throw new Error(`O artigo ativo ${state.activeArticleId} precisa permanecer selecionado.`);
  }
  return state;
}

function withInvariant(state: RadarSpreadsheetSelectionState) {
  return assertSelectionInvariant({
    selectedArticleIds: uniqueArticleIds(state.selectedArticleIds),
    activeArticleId: state.activeArticleId,
  });
}

export function createRadarSpreadsheetSelection(): RadarSpreadsheetSelectionState {
  return { selectedArticleIds: [], activeArticleId: null };
}

export function clearSelection(): RadarSpreadsheetSelectionState {
  return createRadarSpreadsheetSelection();
}

export function selectAndActivateArticle(state: RadarSpreadsheetSelectionState, articleId: string): RadarSpreadsheetSelectionState {
  assertSelectionInvariant(state);
  const selectedArticleIds = state.selectedArticleIds.includes(articleId)
    ? state.selectedArticleIds
    : [...state.selectedArticleIds, articleId];
  return withInvariant({ selectedArticleIds, activeArticleId: articleId });
}

export function toggleArticleSelection(state: RadarSpreadsheetSelectionState, articleId: string): RadarSpreadsheetSelectionState {
  assertSelectionInvariant(state);
  if (!state.selectedArticleIds.includes(articleId)) return selectAndActivateArticle(state, articleId);
  const selectedArticleIds = state.selectedArticleIds.filter(id => id !== articleId);
  const activeArticleId = state.activeArticleId === articleId ? selectedArticleIds.at(-1) || null : state.activeArticleId;
  return withInvariant({ selectedArticleIds, activeArticleId });
}

export function setArticleSelection(state: RadarSpreadsheetSelectionState, articleId: string, selected: boolean): RadarSpreadsheetSelectionState {
  if (selected) return selectAndActivateArticle(state, articleId);
  return state.selectedArticleIds.includes(articleId) ? toggleArticleSelection(state, articleId) : withInvariant(state);
}

export function selectVisibleArticles(state: RadarSpreadsheetSelectionState, visibleArticleIds: readonly string[]): RadarSpreadsheetSelectionState {
  assertSelectionInvariant(state);
  const selectedArticleIds = uniqueArticleIds([...state.selectedArticleIds, ...visibleArticleIds]);
  const activeArticleId = state.activeArticleId && selectedArticleIds.includes(state.activeArticleId)
    ? state.activeArticleId
    : visibleArticleIds.find(articleId => selectedArticleIds.includes(articleId)) || selectedArticleIds[0] || null;
  return withInvariant({ selectedArticleIds, activeArticleId });
}
