import assert from "node:assert/strict";
import test from "node:test";
import { importArticlesToRadar, RadarItemSchema } from "../lib/editorial/operational-flow.ts";
import { createRadarHydrationSnapshot, reconcileRadarItems } from "../lib/radar/hydration.ts";
import { resolvePrimaryKeyword } from "../lib/radar/keyword-resolver.ts";

const brandId = "11111111-1111-4111-8111-111111111111";
const sourceKeyword = { id: "pub-k-22222222-2222-4222-8222-222222222222", keywordId: "22222222-2222-4222-8222-222222222222", keyword: "captação de pacientes sem tráfego pago", lista_id: "silo-leads", siloName: "LEADS SEM TRÁFEGO PAGO", status: "publicado", isPublished: true };
const article = { articleId: "pub-b-33333333-3333-4333-8333-333333333333", brandId, principalKeywordId: sourceKeyword.id, siloId: "silo-leads", keywordReferences: [
  { keywordId: sourceKeyword.id, keywordDnaVersionId: "legacy:keyword-v1", role: "principal" },
  { keywordId: "support-1", keywordDnaVersionId: "legacy:support-v1", role: "secundaria" },
  { keywordId: "support-2", keywordDnaVersionId: "legacy:support-2-v1", role: "secundaria" },
] } as any;
const version = { versionId: "article-v1", entityId: article.articleId, versionNumber: 1, previousVersionId: null, contentHash: "legacy:article-v1", origin: "import", changeReason: "fixture", createdAt: "2026-07-20T00:00:00.000Z", createdBy: "fixture", payload: article } as any;

test("hidrata publicado por alias pub-k e preserva o texto canônico", () => {
  const hydration = createRadarHydrationSnapshot({ brandId, article: version, sourceKeywords: [sourceKeyword, { id: "support-1", keyword: "captação orgânica", lista_id: "silo-leads" }, { id: "support-2", keyword: "pacientes sem anúncios", lista_id: "silo-leads" }], source: "arquiteto_import", capturedAt: "2026-07-20T00:00:00.000Z" });
  assert.ok(hydration);
  assert.equal(hydration.principalKeyword?.keyword, "captação de pacientes sem tráfego pago");
  assert.equal(hydration.principalKeyword?.canonicalKeywordId, sourceKeyword.keywordId);
  assert.ok(hydration.principalKeyword?.aliases.includes(sourceKeyword.id));
  assert.equal(hydration.silo?.name, "LEADS SEM TRÁFEGO PAGO");
  const resolved = resolvePrimaryKeyword({ brandId, article, keywords: [{ id: sourceKeyword.keywordId, keyword: sourceKeyword.keyword, lista_id: sourceKeyword.lista_id, brandId, aliases: [sourceKeyword.id] }], allowedSiloIds: [sourceKeyword.lista_id] });
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.keyword, "captação de pacientes sem tráfego pago");
});

test("reconcilia item antigo do Radar sem duplicar nem alterar identidade", () => {
  const imported = importArticlesToRadar([], [{ ...version, payload: { ...article, promise: "Cobrir captação de pacientes", suggestedSlug: "captacao-de-pacientes-sem-trafego-pago", hierarchy: "Pilar", mainIntent: "informacional" } }], brandId, "2026-07-20T00:00:00.000Z", [sourceKeyword, { id: "support-1", keyword: "captação orgânica", lista_id: "silo-leads" }, { id: "support-2", keyword: "pacientes sem anúncios", lista_id: "silo-leads" }])[0];
  assert.equal(imported.hydration?.principalKeyword?.keyword, "captação de pacientes sem tráfego pago");
  const old = RadarItemSchema.parse({ ...imported, hydration: null });
  const repaired = reconcileRadarItems([old], { [article.articleId]: version }, brandId, [sourceKeyword, { id: "support-1", keyword: "captação orgânica", lista_id: "silo-leads" }, { id: "support-2", keyword: "pacientes sem anúncios", lista_id: "silo-leads" }]);
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].id, old.id);
  assert.equal(repaired[0].articleId, old.articleId);
  assert.equal(repaired[0].hydration?.source, "reconciled");
  assert.equal(repaired[0].hydration?.principalKeyword?.keyword, "captação de pacientes sem tráfego pago");
});
