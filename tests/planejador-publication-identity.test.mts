import assert from "node:assert/strict";
import test from "node:test";
import { PublishedIdentityReferenceSchema } from "../lib/arquiteto/contracts.ts";
import { publishedIdentityReferenceForArticle, resolvePlannerPublicationIdentity } from "../lib/planejador/publication-identity.ts";

const operational = (state: "draft" | "published") => ({ id: "publication-1", brandId: "brand-1", articleId: "article-1", plannerItemId: "planner-1", contentPlanVersionId: "plan-1", documentId: "document-1", title: "Artigo", slug: "artigo", siloId: "silo-1", hierarchy: "Pilar", state, responsible: null, destination: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", origin: "local" as const, lockVersion: 1, unitType: "article" as const, destinationUrl: null, publishedAt: null, publishedDocumentHash: null, lastExportDocumentHash: null, lastExportedAt: null, lastExportFileName: null, lastExportFormat: null, updateRequested: false, updateRequestedAt: null, history: [] });

test("publicacao legada publicada fica protegida sem inventar URL ou data", () => {
  const identity = resolvePlannerPublicationIdentity({ brandId: "brand-1", articleId: "article-1", legacyBriefing: { id: "article-1", silo_id: "silo-1", keyword_principal: "trafego organico", keywords_secundarias: [], titulo: "Artigo", slug_sugerido: "artigo", canonical: "https://example.com/artigo", hierarquia: "Pilar", status: "publicado", meta_title: null, meta_description: null, diretrizes_estrategicas: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" } });
  assert.equal(identity.state, "published");
  assert.equal(identity.protected, true);
  assert.equal(identity.publishedUrl, null);
  assert.equal(identity.publishedAt, null);
});

test("origens divergentes ficam em conflito e nao perdem a protecao", () => {
  const identity = resolvePlannerPublicationIdentity({ brandId: "brand-1", articleId: "article-1", operational: operational("draft"), legacyBriefing: { id: "article-1", silo_id: "silo-1", keyword_principal: "trafego organico", keywords_secundarias: [], titulo: "Artigo", slug_sugerido: "artigo", canonical: null, hierarquia: "Pilar", status: "publicado", meta_title: null, meta_description: null, diretrizes_estrategicas: null, created_at: null, updated_at: null } });
  assert.equal(identity.state, "conflict");
  assert.equal(identity.protected, true);
});

test("ArticleDNA pode manter referência compacta sem substituir a publicação canônica", () => {
  const identity = resolvePlannerPublicationIdentity({ brandId: "brand-1", articleId: "article-1", operational: operational("published") });
  const reference = publishedIdentityReferenceForArticle(identity);
  assert.deepEqual(PublishedIdentityReferenceSchema.parse(reference), { publicationRecordId: "publication-1", publicationStatus: "published_protected", slug: "artigo" });
});
