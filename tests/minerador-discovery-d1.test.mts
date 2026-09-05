import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDiscoveryRunRow } from "../lib/minerador/discovery-persistence.ts";
import { classifyDiscoveryPerspective, candidateMatchesDiscoveryPerspective, sortDiscoveryCandidatesByPerspective } from "../lib/minerador/discovery-perspective.ts";
import type { DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";

const page = readFileSync(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8");
const searchRow = readFileSync(new URL("../modules/minerador/discovery/discovery-search-row.tsx", import.meta.url), "utf8");
const filterRow = readFileSync(new URL("../modules/minerador/discovery/discovery-filter-row.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
const googleAdsRoute = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url), "utf8");
const importRoute = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/discovery/import/route.ts", import.meta.url), "utf8");

function candidate(keyword: string, candidateId = keyword): DiscoveryCandidate {
  return {
    candidateId,
    keyword,
    canonicalKeyword: keyword,
    averageMonthlySearches: null,
    monthlySearchVolumes: [],
    competition: null,
    competitionIndex: null,
    lowTopOfPageBidMicros: null,
    highTopOfPageBidMicros: null,
    averageCpcMicros: null,
    currencyCode: "BRL",
    timeZone: "America/Sao_Paulo",
    targeting: null,
    source: "google_ads",
    provider: "google_ads",
    providerVersion: "v25",
    measuredAt: "2026-08-19T00:00:00.000Z",
    sourceData: null,
    existingKeywordId: null,
  };
}

test("D1 classifica somente a keyword retornada, sem fabricar candidatas", () => {
  assert.equal(classifyDiscoveryPerspective("manicure perto de mim", "manicure"), "customer");
  assert.equal(classifyDiscoveryPerspective("curso de manicure", "manicure"), "other");
  assert.equal(classifyDiscoveryPerspective("manicure", "manicure"), "ambiguous");
  const input = [candidate("manicure perto de mim"), candidate("curso de manicure"), candidate("manicure")];
  assert.deepEqual(sortDiscoveryCandidatesByPerspective(input, "manicure", "all_customer").map(item => item.keyword), ["manicure perto de mim", "manicure", "curso de manicure"]);
  assert.equal(input.length, 3);
});

test("D1 prioriza cliente e preserva as outras perspectivas", () => {
  const input = [candidate("curso de manicure"), candidate("manicure"), candidate("manicure preço"), candidate("vaga manicure")];
  const sorted = sortDiscoveryCandidatesByPerspective(input, "manicure", "hire");
  assert.deepEqual(sorted.map(item => item.keyword), ["manicure preço", "manicure", "curso de manicure", "vaga manicure"]);
  assert.equal(candidateMatchesDiscoveryPerspective(input[0], "manicure", "hire", "other"), true);
  assert.equal(candidateMatchesDiscoveryPerspective(input[0], "manicure", "hire", "customer"), false);
});

test("modo de descoberta e enfoque são controles locais e só a CTA dispara a pesquisa", () => {
  assert.match(searchRow, /Tipo de descoberta/);
  assert.match(searchRow, /Como clientes me encontram/);
  assert.match(searchRow, /Palavra-chave/);
  assert.doesNotMatch(searchRow, /Tipo de descoberta<select/);
  assert.match(searchRow, /role="radiogroup"/);
  assert.match(searchRow, /name="discovery-mode"/);
  assert.match(searchRow, /type="radio"/);
  assert.match(searchRow, /peer-focus-visible:ring-2/);
  assert.match(searchRow, /Expanda um termo conhecido para encontrar palavras-chave relacionadas\./);
  assert.match(searchRow, /Descubra como potenciais clientes procuram seu produto, serviço ou nicho\./);
  assert.doesNotMatch(searchRow, /esse produto ou serviço no Google/);
  assert.match(searchRow, /Digite uma keyword, serviço, produto ou nicho\.\.\./);
  assert.match(searchRow, /Ex\.: manicure, portaria remota, móveis planejados/);
  assert.match(searchRow, /Enfoque/);
  assert.match(searchRow, /Todos os comportamentos de cliente/);
  assert.match(searchRow, /Encontrar \/ contratar/);
  assert.doesNotMatch(searchRow, /fetch\s*\(/);
  assert.match(filterRow, /Descobrir formas de procura/);
  assert.match(page, /discoveryMode/);
  assert.match(page, /discoveryFocus/);
  assert.match(filterRow, /onClick=\{onDiscover\}/);
});

test("moeda contextual aparece depois de Estados/UF como leitura somente", () => {
  const rendered = searchRow.slice(searchRow.indexOf("return <section"));
  assert.ok(rendered.indexOf("Estados/UF") < rendered.indexOf("Moeda"));
  assert.match(searchRow, /data-discovery-currency-context=\{discoveryCountryCode\}/);
  assert.match(searchRow, /symbol: "R\$"/);
  assert.match(searchRow, /code: "BRL"/);
  assert.match(searchRow, /\$\{context\.symbol\} · \$\{context\.code\}/);
  assert.match(searchRow, /<output data-discovery-currency-context/);
  const currencyStart = searchRow.indexOf("data-discovery-currency-context");
  const currencyBlock = searchRow.slice(currencyStart, searchRow.indexOf("</output>", currencyStart));
  assert.doesNotMatch(currencyBlock, /<select|<input|<button|ChevronDown|onChange/);
  assert.match(searchRow, /discoveryCurrencyByCountry/);
  assert.doesNotMatch(searchRow, /currencyCode/);
  assert.match(table, /formatDiscoveryMoney/);
  assert.doesNotMatch(searchRow, /fetch\s*\(/);
});

test("o modo Palavra-chave mantém a chamada keyword_seed existente e D1 não adiciona IA/DataForSEO", () => {
  assert.match(googleAdsRoute, /seed: \{ kind: "keyword", keywords: \[input\.seed\.trim\(\)\] \}/);
  assert.doesNotMatch(googleAdsRoute, /dataforseo|openrouter|semanticReview|analyze/i);
  assert.doesNotMatch(searchRow, /KeywordPlanIdeaService|GenerateKeywordIdeas|DataForSEO|OpenRouter/);
});

test("modo e enfoque D1 são preservados em source_data JSONB sem mudar schema", () => {
  const row = buildDiscoveryRunRow({
    id: "11111111-1111-4111-8111-111111111111",
    brandId: "22222222-2222-4222-8222-222222222222",
    actorUserId: "33333333-3333-4333-8333-333333333333",
    operationRequestId: "44444444-4444-4444-8444-444444444444",
    draft: {
      seed: "manicure",
      relationshipMode: "Todas as palavras-chave",
      preliminaryIntent: "Não definida",
      preliminaryFunnel: "Não definido",
      language: "Português",
      countryCode: "BR",
      selectedStates: ["Todos os estados"],
      volumeFilter: "Todos",
      cpcFilter: "Todos",
      includeTerms: "",
      excludeTerms: "",
      includeAdultKeywords: false,
      discoveryMode: "customer_discovery",
      discoveryFocus: "hire",
    },
    targeting: { countryCode: "BR", countryLabel: "Brasil", selectedStates: ["Todos os estados"], stateLabels: [], geoTargetConstants: ["geoTargetConstants/2076"], language: "languageConstants/1014", keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    providerVersion: "v25",
    currencyCode: "BRL",
    timeZone: "America/Sao_Paulo",
    status: "completed",
    receivedCount: 3,
    normalizedCount: 3,
    approvedCount: 3,
    filteredCount: 0,
    responseTruncated: false,
    executedAt: "2026-08-19T00:00:00.000Z",
  });
  assert.deepEqual(row.source_data, { discoveryMode: "customer_discovery", discoveryFocus: "hire", seedOriginal: "manicure", perspectiveClassifier: "d1-deterministic-v1" });
});

test("handoff preserva o contexto D1 como proveniência, sem criar etapa de DNA", () => {
  assert.match(importRoute, /readDiscoveryRunContext/);
  assert.match(importRoute, /discoveryMode/);
  assert.match(importRoute, /discoveryFocus/);
  assert.match(importRoute, /discoveryPerspective/);
  assert.match(table, /Perspectiva/);
  assert.match(table, /candidateMatchesDiscoveryPerspective/);
  assert.doesNotMatch(table, /Lógica ✓|IA executada|KeywordDNA consolidado/);
});
