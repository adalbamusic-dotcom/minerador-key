import assert from "node:assert/strict";
import test from "node:test";
import { selectLatestRadarSerpRecord } from "../lib/radar/serp-hydration.ts";

const item = { id: "radar:article-1", articleId: "pub-k-keyword-1", articleDnaVersionId: "article-dna-v1", principalKeywordId: "pub-k-keyword-1", hydration: { principalKeywordId: "pub-k-keyword-1", principalKeyword: { referenceKeywordId: "pub-k-keyword-1", canonicalKeywordId: "keyword-uuid-1", sourceKeywordId: null, originalKeywordId: null, aliases: [], keywordDnaVersionId: "kw-v1", keyword: "keyword", role: "principal", brandId: "brand-1", siloId: "silo-1", siloName: "Silo", isPublished: true }, keywordSnapshots: [] } } as never;

function record(version: number, articleId = "pub-k-keyword-1") {
  return { id: `serp:${version}`, input: { articleId, keyword: "keyword", location: "Brasil", language: "pt-BR", device: "desktop" }, origin: "real", isMock: false, research: { articleId, version, organicResults: Array.from({ length: 9 }, (_, index) => ({ position: index + 1 })) }, } as never;
}

test("encontra snapshot local existente pelo artigo e preserva os nove resultados", () => {
  const selected = selectLatestRadarSerpRecord([record(1)], item);
  assert.equal(selected?.id, "serp:1");
  assert.equal(selected?.research?.organicResults.length, 9);
});

test("usa alias/canonicalKeywordId para localizar snapshot legado e escolhe a maior versão", () => {
  const selected = selectLatestRadarSerpRecord([record(1, "keyword-uuid-1"), record(2, "keyword-uuid-1")], item);
  assert.equal(selected?.id, "serp:2");
});
