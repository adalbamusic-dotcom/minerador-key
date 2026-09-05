export const ARTICLE_PANEL_PROCESS_TABS = ["logic", "serp", "ai", "review"] as const;

export type ArticlePanelProcessTab = typeof ARTICLE_PANEL_PROCESS_TABS[number];

/** Estado local do painel expandido; não executa processos nem altera a working copy. */
export function selectArticlePanelProcessTab(
  current: Record<string, ArticlePanelProcessTab>,
  articleId: string,
  tab: ArticlePanelProcessTab,
): Record<string, ArticlePanelProcessTab> {
  return { ...current, [articleId]: tab };
}
