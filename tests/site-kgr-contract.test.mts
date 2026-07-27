import assert from "node:assert/strict";
import test from "node:test";
import { SiteKeywordCandidateSchema } from "../lib/marca/site-contracts.ts";
import { importSiteKeywordsToMinerador } from "../lib/marca/site-minerador-import.ts";

const candidate = SiteKeywordCandidateSchema.parse({
  id: "00000000-0000-4000-8000-000000000001", brandId: "brand-1", catalogEntryId: "00000000-0000-4000-8000-000000000002",
  text: "seo para clinicas", normalizedText: "seo para clinicas", sourceUrl: "https://example.com/seo-para-clinicas", sourceField: "h1", confidence: "high",
  suggestedRole: "possible_primary", originalText: "seo para clinicas",
});

test("Site candidata permanece sugestão e nunca nasce como KGR", () => {
  assert.equal(candidate.isKgr, false);
  assert.equal(candidate.qualificationStatus, "awaiting_minerador");
  assert.equal(candidate.slugCoherence, "unknown");
});

test("importação leva evidência ao Minerador como bruto", async () => {
  let saved: unknown = null;
  const result = await importSiteKeywordsToMinerador({
    brandId: "brand-1", targetListId: "00000000-0000-4000-8000-000000000003", candidates: [candidate], importBatchId: "00000000-0000-4000-8000-000000000004", requestedBy: "user-1",
    repository: {
      validateDestination: async () => undefined,
      findByList: async () => [],
      insertKeyword: async payload => { saved = payload as unknown as Record<string, unknown>; return { id: "00000000-0000-4000-8000-000000000005", brand_id: payload.brand_id, keyword: payload.keyword }; },
    },
  });
  assert.equal(result.persisted, true);
  assert.equal((saved as { brand_id: string }).brand_id, "brand-1");
  assert.equal((saved as { status: string }).status, "bruto");
  const origin = (saved as { analise_semantica: { site_origin: { isKgr?: boolean; sourceFields: string[] } } }).analise_semantica.site_origin;
  assert.deepEqual(origin.sourceFields, ["h1"]);
  assert.equal(origin.isKgr, undefined);
});
