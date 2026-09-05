export type FormalSitePublicationEvidence = {
  publicationStatus?: unknown;
  resolvedUrl?: unknown;
  sourceUrl?: unknown;
  declaredCanonicalUrl?: unknown;
  lastCheckedAt?: unknown;
  verifiedAt?: unknown;
  lastVerifiedAt?: unknown;
  urlSituation?: unknown;
  publicationConfirmedBy?: unknown;
  publicationConfirmedAt?: unknown;
  publicationCorrectedAt?: unknown;
  publicationUnlinkedAt?: unknown;
};

export type CanonicalPublicationResolution = {
  isPublished: boolean;
  source: "formal_site_link" | "publication_record" | "published_lineage" | "legacy_unverified" | "none";
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isFormalSitePublication(evidence: FormalSitePublicationEvidence | null | undefined): boolean {
  if (!evidence || text(evidence.publicationStatus).toLowerCase() !== "published") return false;
  if (![evidence.resolvedUrl, evidence.sourceUrl, evidence.declaredCanonicalUrl].some(value => Boolean(text(value)))) return false;
  if (![evidence.lastCheckedAt, evidence.verifiedAt, evidence.lastVerifiedAt].some(value => Boolean(text(value)))) return false;
  if (!["accessible", "canonical_confirmed", "canonical_missing", "canonical_conflict", "noindex"].includes(text(evidence.urlSituation).toLowerCase())) return false;
  return Boolean(text(evidence.publicationConfirmedBy) && text(evidence.publicationConfirmedAt))
    && !text(evidence.publicationCorrectedAt)
    && !text(evidence.publicationUnlinkedAt);
}

export function resolveCanonicalPublication(input: {
  formalSite?: FormalSitePublicationEvidence | null;
  publicationRecordStatus?: string | null;
  publishedLineage?: boolean;
  legacyStatus?: string | null;
}): CanonicalPublicationResolution {
  if (isFormalSitePublication(input.formalSite)) return { isPublished: true, source: "formal_site_link" };
  if (input.publicationRecordStatus === "published") return { isPublished: true, source: "publication_record" };
  if (input.publishedLineage === true) return { isPublished: true, source: "published_lineage" };
  if (["publicado", "published"].includes(text(input.legacyStatus).toLowerCase())) return { isPublished: false, source: "legacy_unverified" };
  return { isPublished: false, source: "none" };
}

