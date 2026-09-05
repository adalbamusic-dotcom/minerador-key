import type { ArticleDNA, VersionEnvelope } from "./contracts.ts";

type AiReviewState = "pending_fine_review" | "reviewed" | "adjusted" | "dismissed";

export type ArticleConsolidationGateInput = {
  candidate: VersionEnvelope<ArticleDNA>;
  publishedBaseline?: VersionEnvelope<ArticleDNA>;
  compatiblePublishedBaselines?: VersionEnvelope<ArticleDNA>[];
  pendingAiReviewCount?: number;
  unresolvedConflictCount?: number;
};

const publishedPolicy = (article: ArticleDNA) => article.primaryKeywordPolicy || article.primaryKeywordPolicyContext?.policy || "unknown";

export function publishedArticleCompatibilityIssues(
  keywordIds: string[],
  candidateArticleId: string,
  baselines: VersionEnvelope<ArticleDNA>[],
): string[] {
  const candidateKeywordIds = new Set(keywordIds);
  const matches = baselines.filter(baseline => baseline.payload.articleId !== candidateArticleId && baseline.payload.publishedIdentityRef
    && baseline.payload.keywordReferences.some(reference => candidateKeywordIds.has(reference.keywordId)));
  return matches.length
    ? [`Existe ArticleDNA publicado compatível (${matches.map(baseline => baseline.payload.articleId).join(", ")}); fortalecer o publicado antes de criar outra URL.`]
    : [];
}

/** Gate local e determinístico da primeira consolidação de ArticleDNA. */
export function articleConsolidationIssues(input: ArticleConsolidationGateInput): string[] {
  const article = input.candidate.payload;
  const issues: string[] = [];
  if (article.kgrIdentity?.decision === "PENDING_HUMAN_DECISION") issues.push("A decisão humana Sim/Não do KGR do artigo permanece pendente.");
  const references = article.keywordReferences;
  const principal = references.filter(reference => reference.role === "principal");
  const expectedIds = [article.principalKeywordId, ...article.secondaryKeywordIds, ...article.narrativeReinforcementIds];

  if (references.length < 1 || references.length > 6) issues.push("O ArticleDNA precisa ter entre 1 e 6 KeywordDNAs.");
  if (principal.length !== 1 || principal[0]?.keywordId !== article.principalKeywordId) issues.push("A principal precisa estar definida exatamente uma vez.");
  const referenceIds = new Set(references.map(reference => reference.keywordId));
  const expectedIdSet = new Set(expectedIds);
  if (new Set(expectedIds).size !== expectedIds.length || referenceIds.size !== references.length || expectedIdSet.size !== referenceIds.size
    || [...expectedIdSet].some(id => !referenceIds.has(id)) || [...referenceIds].some(id => !expectedIdSet.has(id))) {
    issues.push("Os papéis precisam cobrir cada KeywordDNA uma única vez.");
  }
  if (references.some(reference => !["principal", "secundaria", "reforco_narrativo"].includes(reference.role))) issues.push("Existe papel de keyword inválido.");
  if (input.pendingAiReviewCount && input.pendingAiReviewCount > 0) issues.push("Existem decisões da IA aguardando revisão humana.");
  if (input.unresolvedConflictCount && input.unresolvedConflictCount > 0) issues.push("Existem conflitos arquiteturais não resolvidos.");
  if (!article.serpAssessmentRef) issues.push("A evidência SERP precisa estar referenciada antes da consolidação.");
  issues.push(...publishedArticleCompatibilityIssues(references.map(reference => reference.keywordId), article.articleId,
    (input.compatiblePublishedBaselines || []).filter(baseline => baseline.payload.brandId === article.brandId)));

  const previous = input.publishedBaseline?.payload;
  if (previous?.brandId && article.brandId !== previous.brandId) issues.push("brandId publicado não pode ser alterado.");
  if (previous?.publishedIdentityRef) {
    const oldIdentity = previous.publishedIdentityRef;
    const newIdentity = article.publishedIdentityRef;
    if (!newIdentity) issues.push("A identidade publicada precisa continuar presente.");
    if (newIdentity?.publishedUrl !== oldIdentity.publishedUrl) issues.push("URL publicada não pode ser alterada.");
    if (newIdentity?.slug !== oldIdentity.slug) issues.push("Slug publicado não pode ser alterado.");
    if (newIdentity?.canonical !== oldIdentity.canonical) issues.push("Canonical publicado não pode ser alterado.");
  }
  if (previous && article.suggestedSlug !== previous.suggestedSlug) issues.push("Slug do publicado não pode ser alterado.");
  if (previous && article.canonical !== previous.canonical) issues.push("Canonical do publicado não pode ser alterado.");

  if (previous) {
    const policy = publishedPolicy(previous);
    const principalCanChange = policy === "reviewable" || policy === "revisable";
    if (!principalCanChange && article.principalKeywordId !== previous.principalKeywordId) {
      issues.push(`Principal publicada protegida pela política ${policy}; somente conteúdo reviewable/revisable pode trocar principal.`);
    }
    if (policy === "free" || policy === "conflict") issues.push("Política publicada inválida ou conflitante precisa de decisão humana antes da consolidação.");
  }
  return [...new Set(issues)];
}

export type ArticleDnaReadback = {
  articleDnas: Array<VersionEnvelope<ArticleDNA>>;
  statuses: Array<{ versionId: string; status: string }>;
};

/** Compara o envelope retornado no F5/readback com o que foi confirmado. */
export function articleDnaReadbackIssues(expected: VersionEnvelope<ArticleDNA>, readback: ArticleDnaReadback): string[] {
  const issues: string[] = [];
  const remote = readback.articleDnas.find(version => version.payload.articleId === expected.payload.articleId && version.versionId === expected.versionId);
  if (!remote) return [`ArticleDNA ${expected.payload.articleId} não retornou no readback F5.`];
  if (remote.contentHash !== expected.contentHash) issues.push(`Hash divergente no readback de ${expected.payload.articleId}.`);
  if (remote.payload.brandId !== expected.payload.brandId) issues.push(`brandId divergente no readback de ${expected.payload.articleId}.`);
  if (remote.payload.principalKeywordId !== expected.payload.principalKeywordId) issues.push(`Principal divergente no readback de ${expected.payload.articleId}.`);
  if (remote.payload.suggestedSlug !== expected.payload.suggestedSlug) issues.push(`Slug divergente no readback de ${expected.payload.articleId}.`);
  if (remote.payload.canonical !== expected.payload.canonical) issues.push(`Canonical divergente no readback de ${expected.payload.articleId}.`);
  const status = readback.statuses.filter(item => item.versionId === expected.versionId).at(-1)?.status;
  if (status !== "approved") issues.push(`ArticleDNA ${expected.payload.articleId} retornou sem status approved no readback F5.`);
  return issues;
}

export function pendingAiReviewCount(states: Array<{ reviewState: AiReviewState }>) {
  return states.filter(state => state.reviewState === "pending_fine_review").length;
}
