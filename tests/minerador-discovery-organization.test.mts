import assert from "node:assert/strict";
import test from "node:test";
import { candidateMatchesDiscoveryOrganization, EMPTY_DISCOVERY_ORGANIZATION, sortDiscoveryCandidates } from "../lib/minerador/discovery-organization.ts";
import type { DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";

function candidate(id: string, keyword: string, volume: number | null, cpc: string | null, index: number | null): DiscoveryCandidate { return { candidateId: id, keyword, canonicalKeyword: keyword, averageMonthlySearches: volume, monthlySearchVolumes: volume === null ? [] : [{ year: 2026, month: "JULY", searches: volume }], competition: index === null ? null : "MEDIUM", competitionIndex: index, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: cpc, currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false }, source: "google_ads", sourceData: null, provider: "google_ads", providerVersion: "v25", measuredAt: "2026-08-03T00:00:00.000Z", existingKeywordId: null }; }
const rows = [candidate("a", "Zeta", 0, "1000000", 20), candidate("b", "Árvore", 120, "3000000", 80), candidate("c", "Beta", null, null, null)];

test("ordena keyword, volume e mantém média ausente distinta de zero", () => {
  assert.deepEqual(sortDiscoveryCandidates(rows, "", "", "", { field: "keyword", direction: "asc" }, null).map(row => row.candidateId), ["b", "c", "a"]);
  assert.deepEqual(sortDiscoveryCandidates(rows, "", "", "", { field: "volume", direction: "desc" }, null).map(row => row.candidateId), ["b", "a", "c"]);
  assert.deepEqual(sortDiscoveryCandidates(rows, "", "", "", { field: "volume", direction: "asc" }, null).map(row => row.candidateId), ["a", "b", "c"]);
});
test("CPC compara micros e concorrência prioriza índice", () => {
  assert.deepEqual(sortDiscoveryCandidates(rows, "", "", "", { field: "cpc", direction: "desc" }, null).map(row => row.candidateId), ["b", "a", "c"]);
  assert.deepEqual(sortDiscoveryCandidates(rows, "", "", "", { field: "competition", direction: "desc" }, null).map(row => row.candidateId), ["b", "a", "c"]);
});
test("organização filtra localmente sem mutar candidatas ou seleção", () => {
  const selected = new Set(["c"]); const filters = { ...EMPTY_DISCOVERY_ORGANIZATION, selection: "selected" as const };
  assert.equal(candidateMatchesDiscoveryOrganization(rows[2], "", "Não definida", "Não definido", selected, "", filters), true);
  assert.equal(candidateMatchesDiscoveryOrganization(rows[0], "", "Não definida", "Não definido", selected, "", filters), false);
  assert.equal(rows.length, 3);
});
