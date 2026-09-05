export const MIN_KEYWORDS_PER_APPROVED_ARTICLE = 1;
export const MAX_KEYWORDS_PER_ARTICLE = 6;

export function isArticleKeywordCountValid(count: number) {
  return count >= MIN_KEYWORDS_PER_APPROVED_ARTICLE && count <= MAX_KEYWORDS_PER_ARTICLE;
}
