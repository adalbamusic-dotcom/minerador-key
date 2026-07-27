import assert from "node:assert/strict";
import test from "node:test";
import type { RadarItem } from "../lib/editorial/operational-flow.ts";
import { radarCanonicalRouteKey, resolveRadarRouteItem } from "../lib/radar/route-resolution.ts";

const item = { id: "radar:article-1", articleId: "pub-k-keyword-1", articleDnaVersionId: "article-dna-v1", principalKeywordId: "pub-k-keyword-1", hydration: { principalKeywordId: "pub-k-keyword-1", principalKeyword: { referenceKeywordId: "pub-k-keyword-1", canonicalKeywordId: "keyword-uuid-1", sourceKeywordId: null, originalKeywordId: null, aliases: [], keywordDnaVersionId: "kw-v1", keyword: "keyword", role: "principal", brandId: "brand-1", siloId: "silo-1", siloName: "Silo", isPublished: true }, keywordSnapshots: [] } } as unknown as RadarItem;

test("usa a versão do ArticleDNA como rota canônica e resolve aliases legados", () => {
  assert.equal(radarCanonicalRouteKey(item), "article-dna-v1");
  assert.equal(resolveRadarRouteItem([item], "radar:article-1"), item);
  assert.equal(resolveRadarRouteItem([item], "pub-k-keyword-1"), item);
  assert.equal(resolveRadarRouteItem([item], "keyword-uuid-1"), item);
});

test("alias ambiguo nao escolhe artigo silenciosamente", () => {
  const second = { ...item, id: "radar:article-2", articleId: "article-2", principalKeywordId: "pub-k-keyword-1" };
  assert.equal(resolveRadarRouteItem([item, second], "pub-k-keyword-1"), null);
});
