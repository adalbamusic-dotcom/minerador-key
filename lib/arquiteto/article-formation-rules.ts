import type { ArchitectKeyword, ProvisionalArticleGroup } from "./contracts.ts";
import { normalizeSearchIntent } from "./intent-profile.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";

export const MAX_SECONDARY_KEYWORDS = MAX_KEYWORDS_PER_ARTICLE - 1;

export type ArticleFormationIssue = {
  code: "missing_principal" | "multiple_principals" | "too_many_keywords" | "too_many_secondaries" | "cross_brand" | "incompatible_intent";
  message: string;
  keywordIds: string[];
};

function intentOf(keyword: ArchitectKeyword) {
  return normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal);
}

function severeIntentConflict(principal: ArchitectKeyword, support: ArchitectKeyword): boolean {
  const main = intentOf(principal);
  const other = intentOf(support);
  if (main === "unknown" || other === "unknown" || main === other) return false;
  if (main === "navigational" || other === "navigational") return true;
  return (main === "transactional" && other === "informational") || (main === "informational" && other === "transactional");
}

/** Gate estrutural da formação. Não escolhe keywords nem confirma KGR. */
export function inspectArticleFormation(group: ProvisionalArticleGroup, brandId?: string): ArticleFormationIssue[] {
  const issues: ArticleFormationIssue[] = [];
  const principalId = group.principalSuggestion.keywordId;
  const principals = group.keywords.filter(keyword => keyword.id === principalId || group.roles[keyword.id] === "principal");
  const principal = group.keywords.find(keyword => keyword.id === principalId);
  if (!principal) issues.push({ code: "missing_principal", message: "A formação precisa de uma keyword principal presente no grupo.", keywordIds: [principalId].filter(Boolean) });
  if (principals.length > 1 || Object.values(group.roles).filter(role => role === "principal").length > 1) {
    issues.push({ code: "multiple_principals", message: "Um artigo não pode ter mais de uma keyword principal.", keywordIds: principals.map(keyword => keyword.id) });
  }
  const uniqueIds = new Set(group.keywords.map(keyword => keyword.id));
  if (group.keywords.length > MAX_KEYWORDS_PER_ARTICLE || uniqueIds.size > MAX_KEYWORDS_PER_ARTICLE) {
    issues.push({ code: "too_many_keywords", message: `Um artigo aceita no máximo ${MAX_KEYWORDS_PER_ARTICLE} referências.`, keywordIds: group.keywords.map(keyword => keyword.id) });
  }
  const support = group.keywords.filter(keyword => keyword.id !== principalId);
  if (support.length > MAX_SECONDARY_KEYWORDS) {
    issues.push({ code: "too_many_secondaries", message: `A principal pode ter no máximo ${MAX_SECONDARY_KEYWORDS} keywords de apoio.`, keywordIds: support.map(keyword => keyword.id) });
  }
  const declaredBrands = group.keywords.map(keyword => (keyword as ArchitectKeyword & { brandId?: string }).brandId).filter(Boolean);
  if (brandId && declaredBrands.some(value => value !== brandId)) {
    issues.push({ code: "cross_brand", message: "Keywords de marcas diferentes não podem formar o mesmo artigo.", keywordIds: group.keywords.map(keyword => keyword.id) });
  }
  if (principal) {
    const conflicts = support.filter(keyword => severeIntentConflict(principal, keyword));
    if (conflicts.length) issues.push({ code: "incompatible_intent", message: "Há intenção incompatível grave entre a principal e uma keyword de apoio.", keywordIds: [principal.id, ...conflicts.map(keyword => keyword.id)] });
  }
  return issues;
}

export function assertArticleFormation(group: ProvisionalArticleGroup, brandId?: string): void {
  const issues = inspectArticleFormation(group, brandId);
  if (issues.length) throw new Error(issues.map(issue => issue.message).join(" "));
}
