export type ArticleProcessScopeArticle = {
  id: string;
  workingArticleId?: string | null;
};

export type ArticleProcessScopeItem = Record<string, unknown> & {
  id: string;
};

export type ArticleProcessScope = {
  selectedArticleIds: string[];
  selectedWorkingArticleIds: string[];
  selectedKeywordIds: string[];
};

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

/**
 * Captures the mutation scope at the button boundary. External articles may be
 * consulted by a caller as read-only context, but never enter this result.
 */
export function resolveArticleProcessScope(input: {
  selectedArticleIds: Iterable<string>;
  articles: readonly ArticleProcessScopeArticle[];
  masterList: readonly ArticleProcessScopeItem[];
  workingArticleIdFor: (item: ArticleProcessScopeItem) => string | null;
}): ArticleProcessScope {
  const selectedArticleIds = sorted(input.selectedArticleIds);
  const selectedIdSet = new Set(selectedArticleIds);
  const selectedWorkingArticleIds = sorted(input.articles
    .filter(article => selectedIdSet.has(article.id))
    .map(article => article.workingArticleId || "")
    .filter(Boolean));
  const selectedWorkingArticleIdSet = new Set(selectedWorkingArticleIds);
  const selectedKeywordIds = sorted(input.masterList
    .filter(item => {
      const workingArticleId = input.workingArticleIdFor(item);
      return Boolean(workingArticleId && selectedWorkingArticleIdSet.has(workingArticleId));
    })
    .map(item => item.id));
  return { selectedArticleIds, selectedWorkingArticleIds, selectedKeywordIds };
}

/** Keeps non-selected objects and their ordering untouched during a scoped run. */
export function mergeScopedArticleProcessOutput<T extends ArticleProcessScopeItem>(input: {
  masterList: readonly T[];
  mutationKeywordIds: Iterable<string>;
  mutationOutput: readonly T[];
}): T[] {
  const mutationIds = new Set(input.mutationKeywordIds);
  const outputById = new Map(input.mutationOutput.map(item => [item.id, item]));
  return input.masterList.map(item => mutationIds.has(item.id) ? outputById.get(item.id) || item : item);
}

/**
 * Artigo e keyword são unidades diferentes: a Lógica processa artigos, cada um
 * com suas keywords. Misturar as duas contagens na mesma frase já produziu
 * "14 artigos processados" para 5 artigos e 14 keywords.
 */
export function scopedArticleProcessNotification(input: {
  processedArticleCount: number;
  processedKeywordCount?: number;
  workspaceArticleCount: number;
  reservedCandidateCount: number;
}) {
  const keywords = typeof input.processedKeywordCount === "number"
    ? `, envolvendo ${input.processedKeywordCount} keyword${input.processedKeywordCount === 1 ? "" : "s"}`
    : "";
  const processed = `${input.processedArticleCount} artigo${input.processedArticleCount === 1 ? "" : "s"} processado${input.processedArticleCount === 1 ? "" : "s"} pela Lógica${keywords}.`;
  const workspace = `Working copy com ${input.workspaceArticleCount} artigo${input.workspaceArticleCount === 1 ? "" : "s"} confirmada.`;
  const candidates = input.reservedCandidateCount ? ` ${input.reservedCandidateCount} candidata${input.reservedCandidateCount === 1 ? "" : "s"} a Silo reservada${input.reservedCandidateCount === 1 ? "" : "s"}.` : "";
  return `${processed} ${workspace}${candidates}`;
}

