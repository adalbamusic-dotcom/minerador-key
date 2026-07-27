import type { ArticleDNA } from "../arquiteto/contracts.ts";
import { isCanonicalUuid, isPublishedKeywordAlias, parsePublishedKeywordAlias } from "./identifiers.ts";

export type RadarKeywordCandidate = { id: string; keyword: string; lista_id?: string | null; brandId?: string | null; aliases?: string[]; sourceKeywordId?: string | null; originalKeywordId?: string | null };

export function isTechnicalKeyword(value: string) {
  const normalized = value.trim();
  return !normalized || isPublishedKeywordAlias(normalized) || /^keyword[-_:]/i.test(normalized) || /^kw[-_:]/i.test(normalized) || isCanonicalUuid(normalized);
}

export function normalizeKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function publishedSourceId(value: string) {
  return parsePublishedKeywordAlias(value)?.sourceId || null;
}

function candidateMatches(candidate: RadarKeywordCandidate, referenceId: string) {
  const ids = [candidate.id, ...(candidate.aliases || []), candidate.sourceKeywordId || "", candidate.originalKeywordId || ""].filter(Boolean);
  return ids.includes(referenceId) || ids.some(id => publishedSourceId(id) === referenceId || publishedSourceId(referenceId) === id);
}

export function resolvePrimaryKeyword(input: {
  brandId: string;
  article: ArticleDNA;
  keywords: RadarKeywordCandidate[];
  allowedSiloIds?: string[];
}) {
  const principal = input.article.keywordReferences.find(reference => reference.role === "principal" && reference.keywordId === input.article.principalKeywordId);
  if (!principal) return { ok: false as const, code: "principal_reference_missing", message: "A keyword principal não está vinculada corretamente ao ArticleDNA." };
  const candidate = input.keywords.find(keyword => candidateMatches(keyword, principal.keywordId));
  if (!candidate || (candidate.brandId && candidate.brandId !== input.brandId) || (input.allowedSiloIds && candidate.lista_id && !input.allowedSiloIds.includes(candidate.lista_id))) {
    return { ok: false as const, code: "keyword_not_found_or_wrong_brand", message: "A keyword principal deste artigo não foi encontrada. Corrija o vínculo no Arquiteto antes de pesquisar a SERP." };
  }
  const keyword = normalizeKeyword(candidate.keyword);
  if (isTechnicalKeyword(keyword)) return { ok: false as const, code: "technical_keyword", message: "A keyword principal foi hidratada como identificador técnico. Corrija o vínculo no Arquiteto antes de pesquisar a SERP." };
  return { ok: true as const, keyword, keywordId: principal.keywordId, keywordDnaVersionId: principal.keywordDnaVersionId };
}
