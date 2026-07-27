import { BrandSiteWorkspaceSchema, SiteCatalogEntrySchema, SiteEventSchema, SiteKeywordCandidateSchema, SitePageVerificationSchema, SiteSyncRunSchema, type BrandSiteWorkspace, type BrandSitemapSource, type SiteCatalogEntry, type SiteKeywordCandidate } from "./site-contracts.ts";
import { candidateConfidence, candidateRole, candidateTerms, inferPrimaryKeywordSignal, normalizeCandidateText, slugCoherenceFromFields } from "./site-parser.ts";

export function addSiteEvent(workspace: BrandSiteWorkspace, eventType: string, actorId: string, entityId: string | null, payload: unknown, now = new Date().toISOString()): BrandSiteWorkspace {
  const event = SiteEventSchema.parse({ id: crypto.randomUUID(), brandId: workspace.brandId, eventType, entityId, payload, occurredAt: now, actorId });
  return BrandSiteWorkspaceSchema.parse({ ...workspace, events: [...workspace.events, event], updatedAt: now });
}

export function addSitemap(workspace: BrandSiteWorkspace, input: { url: string; type: BrandSitemapSource["type"]; parentId?: string | null }, now = new Date().toISOString()): { workspace: BrandSiteWorkspace; sitemap: BrandSitemapSource; duplicate: boolean } {
  const duplicate = workspace.sitemaps.find(item => item.url === input.url);
  if (duplicate) return { workspace, sitemap: duplicate, duplicate: true };
  const sitemap = { id: crypto.randomUUID(), brandId: workspace.brandId, url: input.url, type: input.type, parentId: input.parentId || null, enabled: true, status: "not_tested" as const, lastTestedAt: null, lastSyncedAt: null, urlCount: 0, newUrlCount: 0, updatedUrlCount: 0, removedUrlCount: 0, errorCount: 0, lastValidKind: null, lastValidItemCount: 0, createdAt: now, updatedAt: now };
  return { workspace: addSiteEvent({ ...workspace, sitemaps: [...workspace.sitemaps, sitemap] }, "sitemap_created", "local-user", sitemap.id, { url: sitemap.url }, now), sitemap, duplicate: false };
}

export function mergeSitemapSync(workspace: BrandSiteWorkspace, sitemapId: string, result: { run: Record<string, unknown>; urls: Array<{ url: string; lastmod: string | null; sourceSitemapUrl: string }>; errors: Array<{ url: string; message: string }>; processed: Array<{ url: string; kind: "urlset" | "sitemapindex"; count: number }> }, actorId = "local-user", now = new Date().toISOString()): BrandSiteWorkspace {
  const sitemap = workspace.sitemaps.find(item => item.id === sitemapId);
  if (!sitemap) throw new Error("Sitemap não pertence à marca ativa.");
  const incoming = new Map(result.urls.map(item => [item.url, item]));
  const previous = workspace.catalog.filter(item => item.sourceSitemapIds.includes(sitemapId));
  const nextCatalog = workspace.catalog.map(item => {
    const itemInput = incoming.get(item.normalizedUrl);
    if (!itemInput) return item;
    return SiteCatalogEntrySchema.parse({ ...item, sourceSitemapIds: [...new Set([...item.sourceSitemapIds, sitemapId])], sitemapLastmod: itemInput.lastmod, lastSeenAt: now, verificationStatus: item.verificationStatus === "stale" ? "discovered" : item.verificationStatus });
  });
  const existing = new Set(nextCatalog.map(item => item.normalizedUrl));
  const additions = result.urls.filter(item => !existing.has(item.url)).map(item => SiteCatalogEntrySchema.parse({ id: crypto.randomUUID(), brandId: workspace.brandId, sourceSitemapIds: [sitemapId], discoveredUrl: item.url, normalizedUrl: item.url, resolvedUrl: null, declaredCanonicalUrl: null, title: null, h1: null, metaDescription: null, headings: [], httpStatus: null, contentType: null, pageType: "unknown", indexability: "unknown", verificationStatus: "discovered", sitemapLastmod: item.lastmod, firstDiscoveredAt: now, lastSeenAt: now, lastVerifiedAt: null, importStatus: "not_imported", origin: "sitemap", ignoredAt: null }));
  const missingIds = new Set(previous.filter(item => !incoming.has(item.normalizedUrl)).map(item => item.id));
  const marked = [...nextCatalog, ...additions].map(item => missingIds.has(item.id) ? SiteCatalogEntrySchema.parse({ ...item, verificationStatus: "stale" }) : item);
  const run = SiteSyncRunSchema.parse({ ...result.run, brandId: workspace.brandId, sitemapId, newCount: additions.length, updatedCount: result.urls.length - additions.length, missingCount: missingIds.size, errorCount: result.errors.length });
  const nextSitemaps = workspace.sitemaps.map(item => item.id !== sitemapId ? item : { ...item, status: run.status === "completed" ? "synced" as const : run.status === "partial" ? "partial" as const : "error" as const, lastSyncedAt: run.status === "failed" ? item.lastSyncedAt : now, urlCount: result.urls.length, newUrlCount: additions.length, updatedUrlCount: run.updatedCount, removedUrlCount: missingIds.size, errorCount: result.errors.length, lastValidKind: result.processed.at(-1)?.kind || item.lastValidKind, lastValidItemCount: result.processed.reduce((sum, entry) => sum + entry.count, 0), updatedAt: now });
  const next = BrandSiteWorkspaceSchema.parse({ ...workspace, sitemaps: nextSitemaps, syncRuns: [...workspace.syncRuns, run], catalog: marked, updatedAt: now });
  return addSiteEvent(addSiteEvent(next, result.errors.length ? "sitemap_sync_partial" : "sitemap_sync_completed", actorId, sitemapId, { run, errors: result.errors }, now), "catalog_url_discovered", actorId, sitemapId, { count: additions.length }, now);
}

export function applyPageVerification(workspace: BrandSiteWorkspace, entryId: string, raw: Record<string, unknown>, actorId = "local-user", now = new Date().toISOString()): BrandSiteWorkspace {
  const entry = workspace.catalog.find(item => item.id === entryId);
  if (!entry) throw new Error("A URL não pertence ao catálogo da marca ativa.");
  const verification = SitePageVerificationSchema.parse({ ...raw, id: crypto.randomUUID(), brandId: workspace.brandId, catalogEntryId: entryId, verifiedAt: now });
  const updatedEntry = SiteCatalogEntrySchema.parse({ ...entry, resolvedUrl: verification.resolvedUrl, title: verification.title, h1: verification.h1, metaDescription: verification.metaDescription, declaredCanonicalUrl: verification.canonical, headings: verification.headings, httpStatus: verification.httpStatus, contentType: verification.contentType, pageType: verification.pageType, indexability: verification.indexability, verificationStatus: verification.verificationStatus, lastVerifiedAt: now });
  const next = BrandSiteWorkspaceSchema.parse({ ...workspace, catalog: workspace.catalog.map(item => item.id === entryId ? updatedEntry : item), verifications: [...workspace.verifications, verification], updatedAt: now });
  return addSiteEvent(next, "catalog_url_verified", actorId, entryId, { verificationId: verification.id }, now);
}

export function extractCandidatesForEntry(entry: SiteCatalogEntry, now = new Date().toISOString()): SiteKeywordCandidate[] {
  const sources: Array<{ value: string | null; sourceField: SiteKeywordCandidate["sourceField"]; score: number }> = [
    { value: entry.title, sourceField: "title", score: 0.85 }, { value: entry.h1, sourceField: "h1", score: 0.95 }, { value: new URL(entry.normalizedUrl).pathname.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ") || null, sourceField: "slug", score: 0.9 },
    { value: entry.metaDescription, sourceField: "meta_description", score: 0.65 }, ...entry.headings.map(value => ({ value, sourceField: "heading" as const, score: 0.6 })),
  ];
  const byText = new Map<string, { text: string; sourceField: SiteKeywordCandidate["sourceField"]; sourceFields: Set<SiteKeywordCandidate["sourceField"]>; score: number }>();
  const evidence: Array<{ text: string; sourceField: SiteKeywordCandidate["sourceField"] }> = [];
  for (const source of sources) for (const text of candidateTerms(source.value || "")) {
    evidence.push({ text, sourceField: source.sourceField });
    const normalizedText = normalizeCandidateText(text);
    const previous = byText.get(normalizedText);
    if (!previous) byText.set(normalizedText, { text, sourceField: source.sourceField, sourceFields: new Set([source.sourceField]), score: source.score });
    else {
      previous.sourceFields.add(source.sourceField);
      if (source.score > previous.score) {
        previous.text = text;
        previous.sourceField = source.sourceField;
        previous.score = source.score;
      }
    }
  }
  const primarySignal = inferPrimaryKeywordSignal(evidence);
  const ordered = [...byText.values()].sort((a, b) => b.score - a.score || b.text.length - a.text.length);
  return ordered.map(source => {
    const normalizedText = normalizeCandidateText(source.text);
    const isPrimary = primarySignal.normalizedText === normalizedText;
    const sourceFields = [...source.sourceFields];
    return SiteKeywordCandidateSchema.parse({
      id: crypto.randomUUID(), brandId: entry.brandId, catalogEntryId: entry.id, text: source.text, normalizedText, sourceUrl: entry.normalizedUrl,
      sourceField: source.sourceField, sourceFields, suggestedRole: candidateRole(source.sourceField, source.text, entry, isPrimary), slugCoherence: isPrimary ? slugCoherenceFromFields(sourceFields) : "unknown",
      urlSituation: entry.verificationStatus, publicationStatus: entry.verificationStatus === "not_found" ? "not_found" : entry.verificationStatus === "redirect" ? "redirected" : entry.verificationStatus === "canonical_conflict" ? "canonical_conflict" : "not_confirmed", keywordUrlRelation: isPrimary ? "candidate_primary" : "undefined",
      architectureStatus: "awaiting_architecture", relationConfirmedBy: null, relationConfirmedAt: null,
      confidence: isPrimary ? primarySignal.confidence : candidateConfidence(source.score), qualificationStatus: "awaiting_minerador", isKgr: false,
      status: "new", originalText: source.text, extractedAt: now, mineradorKeywordId: null, importBatchId: null, sentAt: null,
    });
  });
}
