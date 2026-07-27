import { z } from "zod";

export const SitePersistenceModeSchema = z.enum(["local_fallback", "remote", "unavailable"]);
export const SitemapTypeSchema = z.enum(["principal", "sitemap_index", "posts", "paginas", "produtos", "categorias", "outro"]);
export const SitemapStatusSchema = z.enum(["not_tested", "testing", "tested", "syncing", "synced", "partial", "error", "disabled"]);
export const SiteSyncStatusSchema = z.enum(["running", "completed", "partial", "failed"]);
export const SitePageTypeSchema = z.enum(["article", "page", "service", "product", "category", "author", "other", "unknown"]);
export type SitePageType = z.infer<typeof SitePageTypeSchema>;
export const SiteIndexabilitySchema = z.enum(["unknown", "indexable", "noindex", "blocked"]);
export const SiteVerificationStatusSchema = z.enum(["discovered", "unverified", "accessible", "canonical_confirmed", "canonical_missing", "canonical_conflict", "redirect", "noindex", "not_found", "error", "stale"]);
export const SiteCatalogImportStatusSchema = z.enum(["not_imported", "selected", "imported_as_legacy_content", "keywords_sent", "ignored", "duplicate", "conflict"]);
export const SiteCatalogOriginSchema = z.enum(["sitemap", "manual"]);
export const SiteKeywordSourceFieldSchema = z.enum(["title", "h1", "slug", "meta_description", "heading", "structured_data", "other"]);
export const SiteKeywordSuggestedRoleSchema = z.enum(["possible_primary", "possible_secondary", "supporting_keyword", "supporting_term", "unclassified"]);
export const SiteKeywordUrlRelationSchema = z.enum(["confirmed_primary", "candidate_primary", "supporting", "mentioned", "undefined"]);
export type SiteKeywordUrlRelation = z.infer<typeof SiteKeywordUrlRelationSchema>;
export const SiteKeywordArchitectureStatusSchema = z.enum(["not_structured", "awaiting_architecture", "in_review", "architecture_confirmed", "architectural_review_required", "conflict"]);
export type SiteKeywordArchitectureStatus = z.infer<typeof SiteKeywordArchitectureStatusSchema>;
export const SitePublicationStatusSchema = z.enum(["not_confirmed", "published", "not_found", "redirected", "outside_sitemap", "canonical_conflict"]);
export type SitePublicationStatus = z.infer<typeof SitePublicationStatusSchema>;
export const SiteKeywordConfidenceSchema = z.preprocess(value => {
  if (typeof value === "number") return value >= 0.85 ? "high" : value >= 0.65 ? "medium" : "low";
  return value;
}, z.enum(["high", "medium", "low"]));
export type SiteKeywordSourceField = z.infer<typeof SiteKeywordSourceFieldSchema>;
export type SiteKeywordSuggestedRole = z.infer<typeof SiteKeywordSuggestedRoleSchema>;
export const SiteKeywordSlugCoherenceSchema = z.enum(["high", "medium", "low", "unknown"]);
export type SiteKeywordSlugCoherence = z.infer<typeof SiteKeywordSlugCoherenceSchema>;
export const SiteKeywordQualificationStatusSchema = z.enum(["awaiting_minerador", "sent", "existing", "ignored"]);
export type SiteKeywordQualificationStatus = z.infer<typeof SiteKeywordQualificationStatusSchema>;
export const SiteKeywordCandidateStatusSchema = z.enum(["new", "duplicate_batch", "exists_in_minerador", "selected", "sent", "ignored", "error"]);
export const SiteImportKindSchema = z.enum(["keywords", "legacy_content"]);
export const SiteImportStatusSchema = z.enum(["preview", "importing", "imported", "partial", "failed", "rolled_back"]);

const OptionalText = z.string().nullable().default(null);

export const BrandSitemapSourceSchema = z.object({
  id: z.string().uuid(), brandId: z.string().min(1), url: z.string().url(), type: SitemapTypeSchema,
  parentId: z.string().uuid().nullable().default(null), enabled: z.boolean().default(true), status: SitemapStatusSchema.default("not_tested"),
  lastTestedAt: OptionalText, lastSyncedAt: OptionalText, urlCount: z.number().int().nonnegative().default(0), newUrlCount: z.number().int().nonnegative().default(0),
  updatedUrlCount: z.number().int().nonnegative().default(0), removedUrlCount: z.number().int().nonnegative().default(0), errorCount: z.number().int().nonnegative().default(0),
  lastValidKind: z.enum(["urlset", "sitemapindex"]).nullable().default(null), lastValidItemCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});

export const SiteSyncRunSchema = z.object({
  id: z.string().uuid(), brandId: z.string().min(1), sitemapId: z.string().uuid(), status: SiteSyncStatusSchema,
  foundCount: z.number().int().nonnegative().default(0), newCount: z.number().int().nonnegative().default(0), updatedCount: z.number().int().nonnegative().default(0),
  missingCount: z.number().int().nonnegative().default(0), errorCount: z.number().int().nonnegative().default(0), durationMs: z.number().int().nonnegative().default(0),
  startedAt: z.string().datetime(), completedAt: OptionalText, errorMessage: OptionalText,
});

export const SiteCatalogEntrySchema = z.object({
  id: z.string().uuid(), brandId: z.string().min(1), sourceSitemapIds: z.array(z.string().uuid()).default([]), discoveredUrl: z.string().url(), normalizedUrl: z.string().url(),
  resolvedUrl: OptionalText, declaredCanonicalUrl: OptionalText, title: OptionalText, h1: OptionalText, metaDescription: OptionalText,
  headings: z.array(z.string()).default([]), httpStatus: z.number().int().nullable().default(null), contentType: OptionalText,
  pageType: SitePageTypeSchema.default("unknown"), indexability: SiteIndexabilitySchema.default("unknown"), verificationStatus: SiteVerificationStatusSchema.default("discovered"),
  sitemapLastmod: OptionalText, firstDiscoveredAt: z.string().datetime(), lastSeenAt: z.string().datetime(), lastVerifiedAt: OptionalText,
  importStatus: SiteCatalogImportStatusSchema.default("not_imported"), origin: SiteCatalogOriginSchema.default("sitemap"), ignoredAt: OptionalText,
});

export const SitePageVerificationSchema = z.object({
  id: z.string().uuid(), brandId: z.string().min(1), catalogEntryId: z.string().uuid(), requestedUrl: z.string().url(), resolvedUrl: z.string().url(),
  httpStatus: z.number().int(), contentType: z.string(), title: OptionalText, h1: OptionalText, metaDescription: OptionalText, canonical: OptionalText, robots: OptionalText,
  headings: z.array(z.string()).default([]), pageType: SitePageTypeSchema, indexability: SiteIndexabilitySchema, verificationStatus: SiteVerificationStatusSchema, verifiedAt: z.string().datetime(),
});

export const SiteKeywordCandidateSchema = z.object({
  id: z.string().uuid(), brandId: z.string().min(1), catalogEntryId: z.string().uuid(), text: z.string().trim().min(1), normalizedText: z.string().trim().min(1),
  sourceUrl: z.string().url(), sourceField: SiteKeywordSourceFieldSchema, sourceFields: z.array(SiteKeywordSourceFieldSchema).default([]),
  suggestedRole: SiteKeywordSuggestedRoleSchema.default("unclassified"), slugCoherence: SiteKeywordSlugCoherenceSchema.default("unknown"),
  urlSituation: SiteVerificationStatusSchema.default("unverified"), publicationStatus: SitePublicationStatusSchema.default("not_confirmed"), keywordUrlRelation: SiteKeywordUrlRelationSchema.default("undefined"),
  architectureStatus: SiteKeywordArchitectureStatusSchema.default("awaiting_architecture"), relationConfirmedBy: z.string().nullable().default(null), relationConfirmedAt: OptionalText,
  confidence: SiteKeywordConfidenceSchema, qualificationStatus: SiteKeywordQualificationStatusSchema.default("awaiting_minerador"), isKgr: z.literal(false).default(false),
  status: SiteKeywordCandidateStatusSchema.default("new"), originalText: z.string().trim().min(1), extractedAt: OptionalText, mineradorKeywordId: z.string().uuid().nullable().default(null), importBatchId: z.string().uuid().nullable().default(null), sentAt: OptionalText,
});

export const SiteImportBatchSchema = z.object({
  id: z.string().uuid(), brandId: z.string().min(1), kind: SiteImportKindSchema, status: SiteImportStatusSchema,
  candidateIds: z.array(z.string().uuid()).default([]), catalogEntryIds: z.array(z.string().uuid()).default([]), targetListId: z.string().uuid().nullable().default(null),
  snapshot: z.unknown(), summary: z.record(z.string(), z.number()).default({}), createdBy: z.string().min(1).default("local-user"), createdAt: z.string().datetime(), completedAt: OptionalText, errorMessage: OptionalText,
});

export const SiteEventSchema = z.object({
  id: z.string().uuid(), brandId: z.string().min(1), eventType: z.string().min(1), entityId: z.string().nullable().default(null), payload: z.unknown(), occurredAt: z.string().datetime(), actorId: z.string().min(1),
});

export const BrandSiteWorkspaceSchema = z.object({
  brandId: z.string().min(1), persistenceMode: SitePersistenceModeSchema.default("local_fallback"), sitemaps: z.array(BrandSitemapSourceSchema).default([]), syncRuns: z.array(SiteSyncRunSchema).default([]),
  catalog: z.array(SiteCatalogEntrySchema).default([]), verifications: z.array(SitePageVerificationSchema).default([]), candidates: z.array(SiteKeywordCandidateSchema).default([]),
  importBatches: z.array(SiteImportBatchSchema).default([]), events: z.array(SiteEventSchema).default([]), updatedAt: z.string().datetime(),
});

export type BrandSitemapSource = z.infer<typeof BrandSitemapSourceSchema>;
export type SiteSyncRun = z.infer<typeof SiteSyncRunSchema>;
export type SiteCatalogEntry = z.infer<typeof SiteCatalogEntrySchema>;
export type SitePageVerification = z.infer<typeof SitePageVerificationSchema>;
export type SiteKeywordCandidate = z.infer<typeof SiteKeywordCandidateSchema>;
export type SiteImportBatch = z.infer<typeof SiteImportBatchSchema>;
export type SiteEvent = z.infer<typeof SiteEventSchema>;
export type BrandSiteWorkspace = z.infer<typeof BrandSiteWorkspaceSchema>;
