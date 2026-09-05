import { normalizeCandidateText } from "./site-parser.ts";
import type { SiteKeywordCandidate } from "./site-contracts.ts";

export type SiteKeywordImportOutcome = "new" | "existing_in_minerador" | "duplicate_in_batch" | "failed";

export interface SiteKeywordImportExisting {
  id: string;
  keyword: string;
}

export type SiteKeywordImportCandidate = Omit<Pick<SiteKeywordCandidate, "id" | "text" | "normalizedText" | "catalogEntryId" | "sourceUrl" | "sourceField" | "suggestedRole" | "confidence">, "catalogEntryId"> & { catalogEntryId: string | null } & Partial<Pick<SiteKeywordCandidate, "sourceFields" | "slugCoherence" | "urlSituation" | "publicationStatus" | "keywordUrlRelation" | "architectureStatus" | "relationConfirmedBy" | "relationConfirmedAt" | "extractedAt">> & { sourceKind?: "site_sitemap" | "manual_url"; resolvedUrl?: string | null; declaredCanonicalUrl?: string | null; lastCheckedAt?: string | null; httpStatus?: number | null; contentType?: string | null; pageTitle?: string | null; pageH1?: string | null };

export interface SiteKeywordImportPlanItem {
  candidateId: string;
  text: string;
  normalizedText: string;
  catalogEntryId: string | null;
  sourceKind: "site_sitemap" | "manual_url";
  sourceUrl: string;
  sourceField: SiteKeywordCandidate["sourceField"];
  sourceFields: SiteKeywordCandidate["sourceFields"];
  suggestedRole: SiteKeywordCandidate["suggestedRole"];
  slugCoherence: SiteKeywordCandidate["slugCoherence"];
  urlSituation: SiteKeywordCandidate["urlSituation"];
  publicationStatus: SiteKeywordCandidate["publicationStatus"];
  keywordUrlRelation: SiteKeywordCandidate["keywordUrlRelation"];
  architectureStatus: SiteKeywordCandidate["architectureStatus"];
  relationConfirmedBy: string | null;
  relationConfirmedAt: string | null;
  resolvedUrl: string | null;
  declaredCanonicalUrl: string | null;
  extractedAt: string | null;
  lastCheckedAt?: string | null;
  httpStatus?: number | null;
  contentType?: string | null;
  pageTitle?: string | null;
  pageH1?: string | null;
  confidence: SiteKeywordCandidate["confidence"];
  outcome: SiteKeywordImportOutcome;
  mineradorKeywordId: string | null;
}

export interface SiteKeywordImportSummary {
  selected: number;
  new: number;
  existing: number;
  duplicateInBatch: number;
  ignored: number;
  failed: number;
}

export function buildSiteKeywordImportPlan(candidates: SiteKeywordImportCandidate[], existingRows: SiteKeywordImportExisting[]): { items: SiteKeywordImportPlanItem[]; summary: SiteKeywordImportSummary } {
  const existing = new Map(existingRows.map(row => [normalizeCandidateText(row.keyword), row]));
  const seen = new Set<string>();
  const items = candidates.map(candidate => {
    const normalizedText = normalizeCandidateText(candidate.text);
    const base = { candidateId: candidate.id, text: candidate.text, normalizedText, catalogEntryId: candidate.catalogEntryId, sourceKind: candidate.sourceKind || "site_sitemap" as const, sourceUrl: candidate.sourceUrl, sourceField: candidate.sourceField, sourceFields: candidate.sourceFields?.length ? candidate.sourceFields : [candidate.sourceField], suggestedRole: candidate.suggestedRole, slugCoherence: candidate.slugCoherence || "unknown" as const, urlSituation: candidate.urlSituation || "unverified" as const, publicationStatus: candidate.publicationStatus || "not_confirmed" as const, keywordUrlRelation: candidate.keywordUrlRelation || "undefined" as const, architectureStatus: candidate.architectureStatus || "awaiting_architecture" as const, relationConfirmedBy: candidate.relationConfirmedBy ?? null, relationConfirmedAt: candidate.relationConfirmedAt ?? null, resolvedUrl: candidate.resolvedUrl ?? null, declaredCanonicalUrl: candidate.declaredCanonicalUrl ?? null, extractedAt: candidate.extractedAt ?? null, lastCheckedAt: candidate.lastCheckedAt ?? null, httpStatus: candidate.httpStatus ?? null, contentType: candidate.contentType ?? null, pageTitle: candidate.pageTitle ?? null, pageH1: candidate.pageH1 ?? null, confidence: candidate.confidence };
    if (seen.has(normalizedText)) return { ...base, outcome: "duplicate_in_batch" as const, mineradorKeywordId: null };
    seen.add(normalizedText);
    const existingRow = existing.get(normalizedText);
    return { ...base, outcome: existingRow ? "existing_in_minerador" as const : "new" as const, mineradorKeywordId: existingRow?.id || null };
  });
  const summary = {
    selected: items.length,
    new: items.filter(item => item.outcome === "new").length,
    existing: items.filter(item => item.outcome === "existing_in_minerador").length,
    duplicateInBatch: items.filter(item => item.outcome === "duplicate_in_batch").length,
    ignored: 0,
    failed: 0,
  };
  return { items, summary };
}
