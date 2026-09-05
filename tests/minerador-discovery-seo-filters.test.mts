import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyDiscoverySeoFilters, candidateMatchesDiscoverySeoFilters, discoverySeoPresetRange, DISCOVERY_KEYWORD_DIFFICULTY_PRESETS, DISCOVERY_RESULT_PRESETS, readDiscoveryKeywordDifficulty, readDiscoveryResult } from "../lib/minerador/discovery-seo-filters.ts";
import type { DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";
import type { DiscoveryCandidateCurrentMetrics } from "../lib/minerador/discovery-current-metrics.ts";

const metrics = (value: Partial<DiscoveryCandidateCurrentMetrics>) => value as DiscoveryCandidateCurrentMetrics;

const baseCandidate = (overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate => ({
  candidateId: "00000000-0000-4000-8000-000000000001",
  keyword: "portaria remota",
  canonicalKeyword: "portaria remota",
  averageMonthlySearches: 90,
  monthlySearchVolumes: [],
  competition: "MEDIUM",
  competitionIndex: 40,
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
  ...overrides,
});

test("Resultado respeita mínimo, máximo e zero real", () => {
  const candidates = [
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000001", currentMetrics: metrics({ resultsAllintitle: 0 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000002", currentMetrics: metrics({ resultsAllintitle: 20 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000003", currentMetrics: metrics({ resultsAllintitle: 40 }) }),
  ];
  const applied = applyDiscoverySeoFilters(candidates, { result: { min: 0, max: 20 }, keywordDifficulty: { min: null, max: null } });
  assert.deepEqual(applied.acceptedCandidates.map(candidate => readDiscoveryResult(candidate)), [0, 20]);
  assert.equal(applied.summary.result, 1);
});

test("KD respeita mínimo, máximo e zero real sem converter ausência em zero", () => {
  const candidates = [
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000011", currentMetrics: metrics({ keywordDifficulty: 0 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000012", currentMetrics: metrics({ keywordDifficulty: 15 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000013", currentMetrics: metrics({ keywordDifficulty: 42 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000014", currentMetrics: metrics({ keywordDifficulty: null }) }),
  ];
  const applied = applyDiscoverySeoFilters(candidates, { result: { min: null, max: null }, keywordDifficulty: { min: 0, max: 30 } });
  assert.deepEqual(applied.acceptedCandidates.map(candidate => readDiscoveryKeywordDifficulty(candidate)), [0, 15]);
  assert.equal(applied.summary.keywordDifficulty, 2);
});

test("sem filtro ativo, ausência continua visível; com filtro ativo, ausência fica fora", () => {
  const candidate = baseCandidate({ currentMetrics: metrics({ resultsAllintitle: null, keywordDifficulty: null }) });
  assert.equal(candidateMatchesDiscoverySeoFilters(candidate, { result: { min: null, max: null }, keywordDifficulty: { min: null, max: null } }), true);
  assert.equal(candidateMatchesDiscoverySeoFilters(candidate, { result: { min: 0, max: null }, keywordDifficulty: { min: null, max: null } }), false);
  assert.equal(candidateMatchesDiscoverySeoFilters(candidate, { result: { min: null, max: null }, keywordDifficulty: { min: 0, max: null } }), false);
});

test("presets de Resultado mantêm ordem, presente/ausente e limites inclusivos", () => {
  assert.deepEqual(DISCOVERY_RESULT_PRESETS.map(option => option.label), [
    "Todos",
    "Com resultado",
    "Sem medição",
    "0–99",
    "100–499",
    "500–999",
    "1.000–4.999",
    "5.000–9.999",
    "10.000+",
    "Intervalo personalizado",
  ]);
  assert.deepEqual(discoverySeoPresetRange("all"), { min: null, max: null });
  assert.deepEqual(discoverySeoPresetRange("present"), { min: null, max: null, mode: "present" });
  assert.deepEqual(discoverySeoPresetRange("missing"), { min: null, max: null, mode: "missing" });
  assert.deepEqual(discoverySeoPresetRange("0_99"), { min: 0, max: 99 });
  assert.deepEqual(discoverySeoPresetRange("10000_plus"), { min: 10000, max: null });
  assert.deepEqual(discoverySeoPresetRange("custom", 12, 345), { min: 12, max: 345 });
});

test("presets de KD separam medição, zero real e ausência", () => {
  assert.deepEqual(DISCOVERY_KEYWORD_DIFFICULTY_PRESETS.map(option => option.label), ["Todos", "Com KD", "Sem medição", "0–20", "21–40", "41–60", "61–80", "81–100", "Intervalo personalizado"]);
  const candidates = [
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000021", currentMetrics: metrics({ keywordDifficulty: 0 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000022", currentMetrics: metrics({ keywordDifficulty: 20 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000023", currentMetrics: metrics({ keywordDifficulty: 21 }) }),
    baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000024", currentMetrics: metrics({ keywordDifficulty: null }) }),
  ];
  const inFirstBand = applyDiscoverySeoFilters(candidates, { result: { min: null, max: null }, keywordDifficulty: discoverySeoPresetRange("0_20") });
  assert.deepEqual(inFirstBand.acceptedCandidates.map(candidate => readDiscoveryKeywordDifficulty(candidate)), [0, 20]);
  const measured = applyDiscoverySeoFilters(candidates, { result: { min: null, max: null }, keywordDifficulty: discoverySeoPresetRange("present") });
  assert.deepEqual(measured.acceptedCandidates.map(candidate => readDiscoveryKeywordDifficulty(candidate)), [0, 20, 21]);
  const unmeasured = applyDiscoverySeoFilters(candidates, { result: { min: null, max: null }, keywordDifficulty: discoverySeoPresetRange("missing") });
  assert.deepEqual(unmeasured.acceptedCandidates.map(candidate => readDiscoveryKeywordDifficulty(candidate)), [null]);
});

test("filtros SEO não carregam provider nem criam chamada paga automática", async () => {
  const filterRow = await readFile(new URL("../modules/minerador/discovery/discovery-filter-row.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8");
  const filterModule = await readFile(new URL("../lib/minerador/discovery-seo-filters.ts", import.meta.url), "utf8");
  assert.doesNotMatch(filterModule, /fetch\s*\(/);
  assert.doesNotMatch(filterRow, /fetch\s*\(/);
  assert.match(filterRow, /Alterar o filtro não chama a DataForSEO/);
  assert.match(filterRow, /DISCOVERY_RESULT_PRESETS/);
  assert.match(filterRow, /DISCOVERY_KEYWORD_DIFFICULTY_PRESETS/);
  assert.match(filterModule, /Intervalo personalizado/);
  assert.match(filterRow, /Quanto menor o KD, menor a dificuldade relativa estimada para disputar o top 10/);
  assert.match(page, /setResultMin/);
  assert.match(page, /resultPreset/);
  assert.match(page, /setKeywordDifficultyMin/);
  assert.match(page, /keywordDifficultyPreset/);
});

test("provider e tenant permanecem separados no fluxo explícito", async () => {
  const table = await readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
  assert.match(table, /dataforseo\/allintitle/);
  assert.match(table, /candidateIds: selectedCandidateIds/);
  assert.match(route, /eq\("brand_id", context\.brandId\)/);
  assert.match(route, /keywordDifficulty/);
  assert.doesNotMatch(table, /google-ads\/descobrir-keywords.*dataforseo/i);
});
