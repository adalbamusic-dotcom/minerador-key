import assert from "node:assert/strict";
import test from "node:test";
import type { ArticleDNA, SiloPage } from "../lib/arquiteto/contracts.ts";
import { suggestInternalLinkAnchorConcepts } from "../lib/arquiteto/link-anchor-concepts.ts";

test("sugestões de âncora usam o contexto do ArticleDNA sem copiar a principal como âncora final", () => {
  const article = {
    principalKeywordId: "primary",
    secondaryKeywordIds: ["secondary"],
    narrativeReinforcementIds: ["reinforcement"],
    mainIntent: "commercial",
    entities: ["unhas", "gel"],
    keywordReferences: [
      { keywordId: "primary", keywordDnaSnapshot: { sourceKeywordSnapshot: { keyword: "unhas de gel preço" } } },
      { keywordId: "secondary", keywordDnaSnapshot: { sourceKeywordSnapshot: { keyword: "valor do procedimento" } } },
      { keywordId: "reinforcement", keywordDnaSnapshot: { sourceKeywordSnapshot: { keyword: "quanto custa unha de gel" } } },
    ],
  } as unknown as ArticleDNA;
  const concepts = suggestInternalLinkAnchorConcepts({ article });
  assert.ok(concepts.includes("intenção: commercial"));
  assert.ok(concepts.includes("tema relacionado: valor do procedimento"));
  assert.ok(concepts.includes("sobre unhas de gel preço"));
  assert.equal(concepts.includes("unhas de gel preço"), false);
});

test("SiloPage oferece contexto de universo e seções, não uma URL ou string final", () => {
  const siloPage = {
    h1: "Manicure",
    slug: "/manicure",
    sections: [{ heading: "Técnicas", id: "tecnicas", objective: "", linkedArticleIds: [] }],
  } as unknown as SiloPage;
  assert.deepEqual(suggestInternalLinkAnchorConcepts({ siloPage }), [
    "universo: Manicure",
    "seção: Técnicas",
    "categoria: manicure",
  ]);
});
