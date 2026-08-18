import assert from "node:assert/strict";
import test from "node:test";
import { candidateMatchesCpc, candidateMatchesTerms, candidateMatchesVolume, classifyDiscoveryRelation, parseDiscoveryTerms, type DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";
import { discoveryGeoTargetConstants, discoveryLanguageConstant, discoveryTargetingLabels, resolveDiscoveryTargeting } from "../lib/minerador/google-ads-discovery-catalog.ts";

const candidate: DiscoveryCandidate = { candidateId: "run:1", keyword: "marketing para clínicas", canonicalKeyword: "marketing para clínicas", averageMonthlySearches: 120, monthlySearchVolumes: [], competition: "MEDIUM", competitionIndex: 42, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: "1200000", currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false }, provider: "google_ads", providerVersion: "v25", measuredAt: "2026-08-03T00:00:00.000Z", existingKeywordId: null };

test("classifica exata, frase, ampla e relacionada de forma determinística", () => {
  assert.equal(classifyDiscoveryRelation("marketing para clínicas", "marketing para clínicas"), "exact");
  assert.equal(classifyDiscoveryRelation("marketing para clínicas", "guia de marketing para clínicas"), "phrase");
  assert.equal(classifyDiscoveryRelation("marketing clínicas", "clínicas marketing local"), "broad");
  assert.equal(classifyDiscoveryRelation("marketing clínicas", "harmonização facial"), "related");
});
test("separa termos com vírgula, linhas e correspondência exata", () => {
  assert.deepEqual(parseDiscoveryTerms("marketing, [clínicas]\nseo").map(item => [item.normalized, item.exact]), [["marketing", false], ["clínicas", true], ["seo", false]]);
  assert.equal(candidateMatchesTerms(candidate, "[marketing para clínicas]", "any"), true);
  assert.equal(candidateMatchesTerms(candidate, "[marketing]", "any"), false);
});
test("não confunde volume ausente com zero", () => {
  assert.equal(candidateMatchesVolume(candidate, "120_499", { min: null, max: null }), true);
  assert.equal(candidateMatchesVolume({ ...candidate, averageMonthlySearches: null }, "unavailable", { min: null, max: null }), true);
  assert.equal(candidateMatchesVolume({ ...candidate, averageMonthlySearches: null }, "0_49", { min: null, max: null }), false);
});
test("catálogo centralizado usa constantes oficiais e não combina país com estados", () => {
  assert.equal(discoveryLanguageConstant("Português"), "languageConstants/1014");
  assert.deepEqual(discoveryGeoTargetConstants(["Todos os estados"]), ["geoTargetConstants/2076"]);
  assert.deepEqual(discoveryGeoTargetConstants(["SP", "RJ"]), ["geoTargetConstants/20106", "geoTargetConstants/20102"]);
});
test("targeting resolve códigos internos, rejeita mais de dez e mostra nomes humanos", () => {
  assert.deepEqual(resolveDiscoveryTargeting(["Todos os estados"]).geoTargetConstants, ["geoTargetConstants/2076"]);
  assert.deepEqual(resolveDiscoveryTargeting(["SP", "MG"]).stateLabels, ["São Paulo", "Minas Gerais"]);
  assert.throws(() => resolveDiscoveryTargeting(["SP", "RJ", "MG", "PR", "BA", "SC", "RS", "PE", "CE", "GO", "ES"]), /GOOGLE_ADS_TOO_MANY_GEO_TARGETS/);
  assert.throws(() => resolveDiscoveryTargeting(["XX"]), /GOOGLE_ADS_INVALID_GEO_TARGET/);
  assert.deepEqual(discoveryTargetingLabels(["geoTargetConstants/2076"]), { label: "Brasil", details: ["Brasil"] });
  assert.deepEqual(discoveryTargetingLabels(["geoTargetConstants/20106", "geoTargetConstants/20094"]).details, ["Minas Gerais", "São Paulo"]);
});
test("targeting usa os IDs oficiais atuais de todas as UFs brasileiras", () => {
  const expected = {
    AC: "geoTargetConstants/21232", AL: "geoTargetConstants/20086", AP: "geoTargetConstants/21226", AM: "geoTargetConstants/20087",
    BA: "geoTargetConstants/20088", CE: "geoTargetConstants/20089", DF: "geoTargetConstants/20090", ES: "geoTargetConstants/20091",
    GO: "geoTargetConstants/20092", MA: "geoTargetConstants/20093", MT: "geoTargetConstants/20096", MS: "geoTargetConstants/20095",
    MG: "geoTargetConstants/20094", PA: "geoTargetConstants/20097", PB: "geoTargetConstants/20098", PR: "geoTargetConstants/20101",
    PE: "geoTargetConstants/20099", PI: "geoTargetConstants/20100", RJ: "geoTargetConstants/20102", RN: "geoTargetConstants/20103",
    RS: "geoTargetConstants/20104", RO: "geoTargetConstants/21227", RR: "geoTargetConstants/21228", SC: "geoTargetConstants/20105",
    SP: "geoTargetConstants/20106", SE: "geoTargetConstants/21229", TO: "geoTargetConstants/21230",
  } as const;
  for (const [state, resourceName] of Object.entries(expected)) assert.deepEqual(resolveDiscoveryTargeting([state]).geoTargetConstants, [resourceName]);
});
test("targeting rejeita entrada vazia, resource name no cliente e mistura Brasil/UF", () => {
  assert.throws(() => resolveDiscoveryTargeting(["SP", ""]), /GOOGLE_ADS_INVALID_GEO_TARGET/);
  assert.throws(() => resolveDiscoveryTargeting(["geoTargetConstants/20106"]), /GOOGLE_ADS_INVALID_GEO_TARGET/);
  assert.throws(() => resolveDiscoveryTargeting(["Todos os estados", "SP"]), /GOOGLE_ADS_MIXED_GEO_TARGETS/);
  assert.throws(() => resolveDiscoveryTargeting(["SP", "SP"]), /GOOGLE_ADS_DUPLICATE_GEO_TARGETS/);
});
test("CPC da pesquisa é aplicado no ciclo da execução", () => {
  assert.equal(candidateMatchesCpc(candidate, "Com CPC"), true);
  assert.equal(candidateMatchesCpc({ ...candidate, averageCpcMicros: null }, "Sem CPC"), true);
});
