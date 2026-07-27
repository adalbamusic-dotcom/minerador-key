import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSiteUrl, validateSiteUrl } from "../lib/marca/site-domain.ts";
import { assertAllowedExternalUrl, isAuthorizedSiteHost, isBlockedExternalHost } from "../lib/marca/site-security.ts";
import { extractPageData, parseSitemapXml } from "../lib/marca/site-parser.ts";
import { emptyBrandSiteWorkspace } from "../lib/marca/site-store.ts";
import { addSitemap, extractCandidatesForEntry, mergeSitemapSync } from "../lib/marca/site-reconciliation.ts";
import { buildSiteKeywordImportPlan } from "../lib/marca/site-keyword-flow.ts";
import { importSiteKeywordsToMinerador, mergeSiteEvidence, type SiteKeywordMineradorInsert } from "../lib/marca/site-minerador-import.ts";
import { buildMineradorSiteSyncPlan, type MineradorSiteSyncCandidate } from "../lib/minerador/site-sync-adapter.ts";
import { SiteKeywordCandidateSchema } from "../lib/marca/site-contracts.ts";

test("URL do site aceita domínio sem protocolo e normaliza a raiz", () => {
  assert.equal(normalizeSiteUrl("  EXEMPLO.com.br/  "), "https://exemplo.com.br");
  assert.equal(normalizeSiteUrl("https://Exemplo.com.br:443/contato/#top"), "https://exemplo.com.br/contato/");
});

test("URL do site rejeita protocolos que não são web", () => {
  const result = validateSiteUrl("javascript:alert(1)");
  assert.equal(result.ok, false);
});

test("URL vazia permanece compatível com marca sem site cadastrado", () => {
  assert.equal(normalizeSiteUrl("   "), "");
  assert.deepEqual(validateSiteUrl(""), { ok: true, value: "" });
});

test("parser reconhece urlset e sitemap index sem fazer rede", () => {
  const urlset = parseSitemapXml("<urlset><url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url></urlset>");
  assert.equal(urlset.kind, "urlset"); assert.deepEqual(urlset.items, [{ url: "https://example.com/a", lastmod: "2026-01-01" }]);
  const index = parseSitemapXml("<sitemapindex><sitemap><loc>https://example.com/posts.xml</loc></sitemap></sitemapindex>");
  assert.equal(index.kind, "sitemapindex"); assert.equal(index.items[0].url, "https://example.com/posts.xml");
  assert.throws(() => parseSitemapXml("<urlset><url><loc>https://example.com/a</loc></url>"), /incompleto/);
});

test("extrator HTML diferencia canonical confirmado e noindex", () => {
  const page = extractPageData("<html><head><title>Clínica estética</title><meta name=description content=\"Atendimento\"><link rel=canonical href=\"https://example.com/a\"></head><body><h1>Clínica estética</h1><h2>Serviços</h2></body></html>", "https://example.com/a");
  assert.equal(page.title, "Clínica estética"); assert.equal(page.h1, "Clínica estética"); assert.equal(page.canonical, "https://example.com/a"); assert.equal(page.indexability, "indexable");
  assert.equal(extractPageData("<meta name=robots content=\"noindex\"><h1>Teste</h1>", "https://example.com/a").indexability, "noindex");
});

test("segurança bloqueia redes reservadas e host fora da marca", () => {
  assert.equal(isBlockedExternalHost("127.0.0.1"), true); assert.equal(isBlockedExternalHost("169.254.169.254"), true); assert.equal(isBlockedExternalHost("::ffff:127.0.0.1"), true);
  assert.equal(isAuthorizedSiteHost("www.example.com", "example.com"), true); assert.equal(isAuthorizedSiteHost("other.example.com", "example.com"), false);
  assert.throws(() => assertAllowedExternalUrl("https://other.example.com/page", "example.com"), /domínio principal/);
});

test("sincronização de catálogo é idempotente e preserva ausências", () => {
  const base = emptyBrandSiteWorkspace("00000000-0000-0000-0000-000000000001", "2026-01-01T00:00:00.000Z");
  const added = addSitemap(base, { url: "https://example.com/sitemap.xml", type: "principal" }, "2026-01-01T00:00:00.000Z");
  const first = mergeSitemapSync(added.workspace, added.sitemap.id, { run: { id: "11111111-1111-4111-8111-111111111111", brandId: base.brandId, sitemapId: added.sitemap.id, status: "completed", foundCount: 1, errorCount: 0, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000, errorMessage: null }, urls: [{ url: "https://example.com/a", lastmod: null, sourceSitemapUrl: added.sitemap.url }], processed: [{ url: added.sitemap.url, kind: "urlset", count: 1 }], errors: [] });
  const second = mergeSitemapSync(first, added.sitemap.id, { run: { id: "22222222-2222-4222-8222-222222222222", brandId: base.brandId, sitemapId: added.sitemap.id, status: "completed", foundCount: 0, errorCount: 0, startedAt: "2026-01-02T00:00:00.000Z", completedAt: "2026-01-02T00:00:01.000Z", durationMs: 1000, errorMessage: null }, urls: [], processed: [{ url: added.sitemap.url, kind: "urlset", count: 0 }], errors: [] });
  assert.equal(first.catalog.length, 1); assert.equal(second.catalog.length, 1); assert.equal(second.catalog[0].verificationStatus, "stale");
  assert.ok(extractCandidatesForEntry(first.catalog[0]).length >= 0);
});

test("extração produz fila revisável sem palavras isoladas e sugere principal", () => {
  const entry = { id: "00000000-0000-4000-8000-000000000002", brandId: "00000000-0000-4000-8000-000000000001", sourceSitemapIds: [], discoveredUrl: "https://example.com/seo-para-clinicas", normalizedUrl: "https://example.com/seo-para-clinicas", resolvedUrl: "https://example.com/seo-para-clinicas", declaredCanonicalUrl: "https://example.com/seo-para-clinicas", title: "SEO para clínicas: como aumentar sua visibilidade", h1: "SEO para clínicas", metaDescription: "Estratégia de SEO para clínicas de estética", headings: ["Saiba mais", "Captação de pacientes com SEO local"], httpStatus: 200, contentType: "text/html", pageType: "article" as const, indexability: "indexable" as const, verificationStatus: "canonical_confirmed" as const, sitemapLastmod: null, firstDiscoveredAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z", lastVerifiedAt: "2026-01-01T00:00:00.000Z", importStatus: "not_imported" as const, origin: "sitemap" as const, ignoredAt: null };
  const candidates = extractCandidatesForEntry(entry);
  assert.ok(candidates.length > 0); assert.ok(candidates.length < 10); assert.ok(candidates.some(candidate => candidate.suggestedRole === "possible_primary")); assert.equal(candidates.some(candidate => candidate.text === "SEO"), false); assert.ok(candidates.every(candidate => candidate.catalogEntryId === entry.id && candidate.sourceUrl === entry.normalizedUrl));
});

test("prévia de importação identifica existente e duplicata sem escrever", () => {
  const base = emptyBrandSiteWorkspace("00000000-0000-0000-0000-000000000001"); const added = addSitemap(base, { url: "https://example.com/sitemap.xml", type: "principal" });
  const first = mergeSitemapSync(added.workspace, added.sitemap.id, { run: { id: "33333333-3333-4333-8333-333333333333", brandId: base.brandId, sitemapId: added.sitemap.id, status: "completed", foundCount: 1, errorCount: 0, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000, errorMessage: null }, urls: [{ url: "https://example.com/seo-para-clinicas", lastmod: null, sourceSitemapUrl: added.sitemap.url }], processed: [{ url: added.sitemap.url, kind: "urlset", count: 1 }], errors: [] });
  const candidates = extractCandidatesForEntry({ ...first.catalog[0], title: "SEO para clínicas", h1: "SEO para clínicas", headings: [] }); const second = { ...candidates[0], id: "00000000-0000-4000-8000-000000000004", text: "SEO local para clínicas", normalizedText: "seo local para clinicas" }; const plan = buildSiteKeywordImportPlan([candidates[0], candidates[0], second], [{ id: "minerador-keyword-1", keyword: candidates[0].text }]);
  assert.equal(plan.summary.selected, 3); assert.equal(plan.summary.existing, 1); assert.equal(plan.summary.duplicateInBatch, 1); assert.equal(plan.summary.new, 1);
});

test("workspace antigo com confiança numérica continua compatível", () => {
  const candidate = SiteKeywordCandidateSchema.parse({ id: "00000000-0000-4000-8000-000000000005", brandId: "brand-a", catalogEntryId: "00000000-0000-4000-8000-000000000006", text: "seo para clínicas", normalizedText: "seo para clinicas", sourceUrl: "https://example.com/seo", sourceField: "h1", confidence: 0.95, extractedAt: "2026-01-01T00:00:00.000Z", originalText: "SEO para clínicas" });
  assert.equal(candidate.confidence, "high"); assert.equal(candidate.suggestedRole, "unclassified"); assert.equal(candidate.mineradorKeywordId, null);
});
test("site adapter uses repository IDs and preserves existing Minerador records", async () => {
  const brandId = "00000000-0000-0000-0000-000000000001";
  const listId = "00000000-0000-0000-0000-000000000002";
  const rows = [{ id: "00000000-0000-0000-0000-000000000003", brand_id: brandId, keyword: "existing keyword" }];
  const inserts: SiteKeywordMineradorInsert[] = [];
  const repository = {
    async validateDestination(receivedBrandId: string, receivedListId: string) { assert.equal(receivedBrandId, brandId); assert.equal(receivedListId, listId); },
    async findByList(receivedBrandId: string, receivedListId: string) { assert.equal(receivedBrandId, brandId); assert.equal(receivedListId, listId); return rows; },
    async insertKeyword(payload: SiteKeywordMineradorInsert) { inserts.push(payload); const saved = { id: "00000000-0000-0000-0000-000000000004", brand_id: payload.brand_id, keyword: String(payload.keyword) }; rows.push(saved); return saved; },
  };
  const candidate = (id: string, text: string) => ({ id, brandId, catalogEntryId: "00000000-0000-0000-0000-000000000005", text, sourceUrl: "https://example.com/article", sourceField: "h1" as const, suggestedRole: "possible_primary" as const, confidence: "high" as const });
  const result = await importSiteKeywordsToMinerador({ brandId, targetListId: listId, targetListName: "Silo existente", importBatchId: "00000000-0000-0000-0000-000000000006", requestedBy: "user-1", candidates: [candidate("00000000-0000-0000-0000-000000000007", "New keyword"), candidate("00000000-0000-0000-0000-000000000008", "Existing keyword"), candidate("00000000-0000-0000-0000-000000000009", "NEW KEYWORD")], repository, now: "2026-01-01T00:00:00.000Z" });
  assert.equal(result.status, "completed"); assert.equal(result.persisted, true); assert.equal(result.inserted[0].mineradorKeywordId, "00000000-0000-0000-0000-000000000004"); assert.equal(result.existing[0].mineradorKeywordId, rows[0].id); assert.equal(result.summary.duplicateInBatch, 1); assert.equal(inserts.length, 1);
  assert.equal(inserts[0].status, "bruto"); const origin = (inserts[0].analise_semantica as { site_origin: { source: string; batchId: string; siloId?: string; siloName?: string | null } }).site_origin; assert.equal(origin.source, "site_sitemap"); assert.equal(origin.batchId, "00000000-0000-0000-0000-000000000006"); assert.equal(origin.siloId, listId); assert.equal(origin.siloName, "Silo existente");
});

test("consolidação preserva URL resolvida, canonical e publicação confirmada", () => {
  const evidence = {
    schemaVersion: "site-sitemap-v1" as const, source: "site_sitemap" as const, brandId: "brand-a", catalogEntryId: "catalog-published",
    sourceUrl: "https://example.com/slug", resolvedUrl: "https://example.com/slug-final", declaredCanonicalUrl: "https://example.com/slug-final",
    urlSituation: "canonical_confirmed" as const, publicationStatus: "published" as const, keywordUrlRelation: "confirmed_primary" as const,
    architectureStatus: "awaiting_architecture" as const, suggestedRole: "possible_primary" as const, sourceFields: ["h1" as const], extractedField: "h1" as const,
    slugCoherence: "high" as const, confidence: "high" as const, normalizedText: "keyword", batchId: "batch-published", requestedBy: "user-a",
    extractedAt: "2026-01-01T00:00:00.000Z", importedAt: "2026-01-01T00:00:00.000Z", lastCheckedAt: "2026-01-01T00:00:00.000Z",
    relationConfirmedBy: "user-a", relationConfirmedAt: "2026-01-01T00:00:00.000Z", siloId: "list-a", siloName: "Silo existente",
  };
  const result = mergeSiteEvidence({}, evidence);
  const origin = result.semantic.site_origin as typeof evidence;
  assert.equal(origin.resolvedUrl, "https://example.com/slug-final"); assert.equal(origin.declaredCanonicalUrl, "https://example.com/slug-final");
  assert.equal(origin.publicationStatus, "published"); assert.equal(origin.siloId, "list-a");
});

test("primary suggestion requires convergence across slug, H1 and title", () => {
  const entry = { id: "00000000-0000-4000-8000-000000000010", brandId: "00000000-0000-4000-8000-000000000011", sourceSitemapIds: [], discoveredUrl: "https://example.com/seo-local", normalizedUrl: "https://example.com/seo-local", resolvedUrl: "https://example.com/seo-local", declaredCanonicalUrl: "https://example.com/seo-local", title: "SEO local | Example", h1: "SEO local", metaDescription: null, headings: [], httpStatus: 200, contentType: "text/html", pageType: "article" as const, indexability: "indexable" as const, verificationStatus: "canonical_confirmed" as const, sitemapLastmod: null, firstDiscoveredAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z", lastVerifiedAt: "2026-01-01T00:00:00.000Z", importStatus: "not_imported" as const, origin: "sitemap" as const, ignoredAt: null };
  const primary = extractCandidatesForEntry(entry).find(candidate => candidate.suggestedRole === "possible_primary");
  assert.equal(primary?.normalizedText, "seo local"); assert.equal(primary?.confidence, "high");
});

test("evidência Site/Sitemap é aditiva e idempotente sem apagar semântica existente", () => {
  const evidence = {
    schemaVersion: "site-sitemap-v1" as const, source: "site_sitemap" as const, brandId: "brand-a", catalogEntryId: "catalog-a",
    sourceUrl: "https://example.com/seo", resolvedUrl: "https://example.com/seo", declaredCanonicalUrl: "https://example.com/seo",
    urlSituation: "canonical_confirmed" as const, publicationStatus: "not_confirmed" as const, keywordUrlRelation: "candidate_primary" as const,
    architectureStatus: "awaiting_architecture" as const, suggestedRole: "possible_primary" as const, sourceFields: ["h1" as const], extractedField: "h1" as const,
    slugCoherence: "high" as const, confidence: "high" as const, normalizedText: "seo", batchId: "batch-a", requestedBy: "user-a",
    extractedAt: "2026-01-01T00:00:00.000Z", importedAt: "2026-01-01T00:00:00.000Z", lastCheckedAt: "2026-01-01T00:00:00.000Z",
    relationConfirmedBy: null, relationConfirmedAt: null,
  };
  const first = mergeSiteEvidence({ nicho_override: "Estética" }, evidence);
  const second = mergeSiteEvidence(first.semantic, evidence);
  assert.equal(first.semantic.nicho_override, "Estética");
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal((second.semantic.site_origins as unknown[]).length, 1);
});

test("prévia do Minerador separa nova, evidência alterada, sem alteração e duplicata", () => {
  const candidate = (id: string, text: string): MineradorSiteSyncCandidate => ({
    id, brandId: "brand-a", text, normalizedText: text.toLowerCase(), catalogEntryId: `catalog-${id}`,
    sourceUrl: `https://example.com/${id}`, sourceField: "h1", sourceFields: ["h1"], suggestedRole: "possible_primary",
    slugCoherence: "high", urlSituation: "canonical_confirmed", publicationStatus: "not_confirmed", keywordUrlRelation: "candidate_primary",
    architectureStatus: "awaiting_architecture", relationConfirmedBy: null, relationConfirmedAt: null, extractedAt: "2026-01-01T00:00:00.000Z",
    confidence: "high", resolvedUrl: `https://example.com/${id}`, declaredCanonicalUrl: null, catalogTitle: text,
  });
  const unchanged = candidate("same", "Já existe");
  const plan = buildMineradorSiteSyncPlan([candidate("new", "Nova"), unchanged, unchanged], [
    { id: "keyword-same", keyword: "Já existe", lista_id: "list-a", analise_semantica: { site_origin: { source: "site_sitemap", brandId: "brand-a", catalogEntryId: "catalog-same", normalizedText: "já existe", sourceUrl: "https://example.com/same" } } },
  ], "list-a");
  assert.equal(plan.summary.new, 1);
  assert.equal(plan.summary.updated, 1);
  assert.equal(plan.summary.duplicateInBatch, 1);
  assert.equal(plan.items[1].outcome, "evidence_updated");
});
