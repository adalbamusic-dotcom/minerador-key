import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_DISCOVERY_SEO_FILTERS,
  DISCOVERY_KEYWORD_DIFFICULTY_PRESETS,
  DISCOVERY_RESULT_PRESETS,
  DISCOVERY_SEO_DEFAULT_PRESET,
  DISCOVERY_SERP_GATE_MESSAGE,
  candidateMatchesDiscoverySeoFilters,
  countDiscoveryCandidatesHiddenBySeoFilters,
  discoverySeoPresetAfterMeasurement,
  discoverySeoPresetsAfterMeasurement,
  discoverySeoPresetRange,
  isDiscoverySerpMeasurementEnabled,
} from "../lib/minerador/discovery-seo-filters.ts";
import type { DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";
import type { DiscoveryCandidateCurrentMetrics } from "../lib/minerador/discovery-current-metrics.ts";

const metrics = (value: Partial<DiscoveryCandidateCurrentMetrics>) => value as DiscoveryCandidateCurrentMetrics;

const baseCandidate = (overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate => ({
  candidateId: "00000000-0000-4000-8000-000000000101",
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

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

async function readSource(path: string) {
  return stripComments(await readFile(new URL(path, import.meta.url), "utf8"));
}

function sliceBetween(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${start} deve existir`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `${end} deve vir depois de ${start}`);
  return source.slice(from, to);
}

test("Resultado e KD começam em Sem medição", async () => {
  assert.equal(DISCOVERY_SEO_DEFAULT_PRESET, "missing");
  assert.equal(DISCOVERY_RESULT_PRESETS.find(option => option.key === DISCOVERY_SEO_DEFAULT_PRESET)?.label, "Sem medição");
  assert.equal(DISCOVERY_KEYWORD_DIFFICULTY_PRESETS.find(option => option.key === DISCOVERY_SEO_DEFAULT_PRESET)?.label, "Sem medição");
  assert.deepEqual(DEFAULT_DISCOVERY_SEO_FILTERS.result, discoverySeoPresetRange("missing"));
  assert.deepEqual(DEFAULT_DISCOVERY_SEO_FILTERS.keywordDifficulty, discoverySeoPresetRange("missing"));

  const page = await readSource("../modules/minerador/discovery/discovery-keywords-page.tsx");
  assert.match(page, /useState<DiscoveryResultPreset>\(DISCOVERY_SEO_DEFAULT_PRESET\)/);
  assert.match(page, /useState<DiscoveryKeywordDifficultyPreset>\(DISCOVERY_SEO_DEFAULT_PRESET\)/);
  assert.doesNotMatch(page, /useState<Discovery(Result|KeywordDifficulty)Preset>\("all"\)/);
});

test("Medir resultados fica bloqueado com Resultado e KD em Sem medição", () => {
  assert.equal(isDiscoverySerpMeasurementEnabled(DEFAULT_DISCOVERY_SEO_FILTERS), false);
  assert.equal(isDiscoverySerpMeasurementEnabled({ result: discoverySeoPresetRange("missing"), keywordDifficulty: discoverySeoPresetRange("missing") }), false);
  assert.equal(isDiscoverySerpMeasurementEnabled(null), false);
  assert.equal(isDiscoverySerpMeasurementEnabled(undefined), false);
  assert.equal(DISCOVERY_SERP_GATE_MESSAGE, "Ative o filtro Resultado ou KD para medir com a DataForSEO.");
});

test("qualquer outra opção em Resultado ou em KD libera a medição", () => {
  const missing = discoverySeoPresetRange("missing");
  for (const option of DISCOVERY_RESULT_PRESETS.filter(item => item.key !== "missing")) {
    assert.equal(isDiscoverySerpMeasurementEnabled({ result: discoverySeoPresetRange(option.key), keywordDifficulty: missing }), true, `Resultado · ${option.label}`);
  }
  for (const option of DISCOVERY_KEYWORD_DIFFICULTY_PRESETS.filter(item => item.key !== "missing")) {
    assert.equal(isDiscoverySerpMeasurementEnabled({ result: missing, keywordDifficulty: discoverySeoPresetRange(option.key) }), true, `KD · ${option.label}`);
  }
  // Intervalo personalizado ainda sem limites continua sendo uma escolha explícita.
  assert.equal(isDiscoverySerpMeasurementEnabled({ result: discoverySeoPresetRange("custom", null, null), keywordDifficulty: missing }), true);
});

test("a tela desabilita a ação e explica o motivo enquanto a medição está bloqueada", async () => {
  const table = await readSource("../modules/minerador/discovery/discovery-table-placeholder.tsx");
  assert.match(table, /const serpMeasurementEnabled = isDiscoverySerpMeasurementEnabled\(seoFilters\);/);
  assert.match(table, /seoFilters = DEFAULT_DISCOVERY_SEO_FILTERS/);
  const action = sliceBetween(table, 'title="Medir concorrência orgânica"', 'title="Transformar candidatas em keywords do Minerador"');
  assert.match(action, /disabled=\{importing \|\| volumeMeasuring \|\| allintitleMeasuring \|\| !serpMeasurementEnabled\}/);
  assert.match(action, /description=\{serpMeasurementEnabled \? "[^"]+" : DISCOVERY_SERP_GATE_MESSAGE\}/);
  assert.match(action, /ariaLabel=\{serpMeasurementEnabled \? "Medir resultados" : `Medir resultados\. \$\{DISCOVERY_SERP_GATE_MESSAGE\}`\}/);
  assert.match(table, /\{!serpMeasurementEnabled && <span data-discovery-serp-gate[^>]*>\{DISCOVERY_SERP_GATE_MESSAGE\}<\/span>\}/);
});

function classNameOf(source: string, marker: string) {
  const tag = source.slice(source.indexOf(marker), source.indexOf(">", source.indexOf(marker)));
  const match = tag.match(/className="([^"]+)"/);
  assert.ok(match, `${marker} deve ter className literal`);
  return match[1].split(/\s+/);
}

test("a explicação do bloqueio é texto essencial legível em todas as larguras", async () => {
  const table = await readSource("../modules/minerador/discovery/discovery-table-placeholder.tsx");
  const wide = classNameOf(table, "<span data-discovery-serp-gate ");
  const compact = classNameOf(table, "<p data-discovery-serp-gate-compact ");
  for (const classes of [wide, compact]) {
    assert.ok(classes.includes("text-sm"), "texto de 14px");
    assert.ok(classes.includes("text-text-muted"), "cor por token, sem opacidade reduzida");
    assert.ok(!classes.some(item => /^text-\[\d+px\]$/.test(item) || /^text-text-muted\//.test(item) || /^opacity-/.test(item)), classes.join(" "));
  }
  // Uma das duas aparece em cada largura: a da barra a partir de md, a compacta abaixo.
  assert.ok(wide.includes("md:inline") && wide.includes("hidden"));
  assert.ok(compact.includes("md:hidden") && !compact.includes("hidden"));
  assert.match(table, /\{selection\.selectedIds\.size > 0 && !serpMeasurementEnabled && <p data-discovery-serp-gate-compact [^>]*>\{DISCOVERY_SERP_GATE_MESSAGE\}<\/p>\}/);
});

test("Sem medição esconde medições do banco e do CSV, e a tabela diz quantas", async () => {
  const fromDatabase = baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000201", currentMetrics: metrics({ resultsAllintitle: 50 }) });
  const fromCsv = baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000202", source: "csv", provider: null, sourceData: { imported: true, source: "csv", listaId: null, location: null, intent: null, funnel: null, importedMetrics: { averageMonthlySearches: 90, cpc: null, competition: null, competitionIndex: null, resultsAllintitle: 30 }, recognizedFields: [], ignoredFields: [] } });
  const kdOnly = baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000203", currentMetrics: metrics({ keywordDifficulty: 12 }) });
  const unmeasured = baseCandidate({ candidateId: "00000000-0000-4000-8000-000000000204" });
  const candidates = [fromDatabase, fromCsv, kdOnly, unmeasured];

  assert.deepEqual(candidates.filter(candidate => candidateMatchesDiscoverySeoFilters(candidate, DEFAULT_DISCOVERY_SEO_FILTERS)).map(candidate => candidate.candidateId), [unmeasured.candidateId]);
  assert.equal(countDiscoveryCandidatesHiddenBySeoFilters(candidates, DEFAULT_DISCOVERY_SEO_FILTERS), 3);
  const everything = { result: discoverySeoPresetRange("all"), keywordDifficulty: discoverySeoPresetRange("all") };
  assert.equal(countDiscoveryCandidatesHiddenBySeoFilters(candidates, everything), 0);
  // Faixa esconde quem ainda não foi medido: o aviso também vale para esse caso.
  assert.equal(countDiscoveryCandidatesHiddenBySeoFilters(candidates, { result: discoverySeoPresetRange("0_99"), keywordDifficulty: discoverySeoPresetRange("all") }), 2);
  assert.equal(countDiscoveryCandidatesHiddenBySeoFilters([], DEFAULT_DISCOVERY_SEO_FILTERS), 0);

  const table = await readSource("../modules/minerador/discovery/discovery-table-placeholder.tsx");
  assert.match(table, /const seoHiddenCount = useMemo\(\(\) => countDiscoveryCandidatesHiddenBySeoFilters\(candidatesWithImportState, seoFilters\), \[candidatesWithImportState, seoFilters\]\);/);
  assert.match(table, /\{seoHiddenCount > 0 && <p data-discovery-seo-hidden className="[^"]*text-sm[^"]*text-text-muted[^"]*">\{seoHiddenCount\} /);
  assert.match(table, /seoHiddenCount === candidatesWithImportState\.length \? "Nenhuma candidata corresponde aos filtros Resultado e KD\." : "Nenhuma candidata corresponde à organização local\."/);
});

test("a função que dispara a medição recusa antes de chamar a DataForSEO", async () => {
  const table = await readSource("../modules/minerador/discovery/discovery-table-placeholder.tsx");
  const body = sliceBetween(table, "const measureAllintitle = async () => {", "const importSelected = async () =>");
  const gate = body.indexOf("if (!serpMeasurementEnabled)");
  const refusal = body.indexOf("return;", gate);
  const providerCall = body.indexOf("dataforseo/allintitle");
  assert.ok(gate >= 0, "a função deve checar o filtro");
  assert.ok(refusal > gate && refusal < providerCall, "a recusa deve acontecer antes da chamada ao provider");
  assert.ok(gate < body.indexOf("setAllintitleMeasuring(true)"), "a recusa não liga o estado de medição");
  assert.match(body, /if \(!serpMeasurementEnabled\) \{\s*publishNotice\(\{[^}]*DISCOVERY_SERP_GATE_MESSAGE[^}]*\}\);\s*return;\s*\}/);
});

test("reiniciar os filtros volta Resultado e KD para Sem medição", async () => {
  const page = await readSource("../modules/minerador/discovery/discovery-keywords-page.tsx");
  assert.doesNotMatch(page, /setResultPreset\("all"\)|setKeywordDifficultyPreset\("all"\)/);
  const resets = [
    sliceBetween(page, "const restoreLatestSearch = async () => {", "void restoreLatestSearch();"),
    sliceBetween(page, "const discover = async () => {", "const acceptSourceResult ="),
    sliceBetween(page, "const acceptSourceResult = (payload: DiscoverySourceResponse) => {", "const patchCandidates ="),
    sliceBetween(page, "const clearFilters = () => {", "return <main"),
  ];
  for (const block of resets) {
    assert.match(block, /setResultPreset\(DISCOVERY_SEO_DEFAULT_PRESET\)/);
    assert.match(block, /setKeywordDifficultyPreset\(DISCOVERY_SEO_DEFAULT_PRESET\)/);
  }
  // O rascunho da busca não guarda os filtros SEO: nada a restaurar além do padrão.
  const types = await readSource("../modules/minerador/discovery/discovery-types.ts");
  const draftType = sliceBetween(types, "export type DiscoverySearchDraft = {", "};");
  assert.doesNotMatch(draftType, /result|keywordDifficulty|seo/i);
});

test("depois de medir, só o filtro que ficou em Sem medição passa para Todos", async () => {
  assert.equal(discoverySeoPresetAfterMeasurement("missing"), "all");
  for (const preset of ["all", "present", "0_99", "10000_plus", "custom"] as const) assert.equal(discoverySeoPresetAfterMeasurement(preset), preset);
  for (const preset of ["0_20", "81_100"] as const) assert.equal(discoverySeoPresetAfterMeasurement(preset), preset);

  // Presets vigentes na hora da resposta.
  assert.deepEqual(discoverySeoPresetsAfterMeasurement({ result: "all", keywordDifficulty: "missing" }), { result: "all", keywordDifficulty: "all" });
  assert.deepEqual(discoverySeoPresetsAfterMeasurement({ result: "missing", keywordDifficulty: "0_20" }), { result: "all", keywordDifficulty: "0_20" });
  // Corrida: o usuário voltou os dois a Sem medição durante a chamada; o ajuste não reabre a medição.
  assert.equal(discoverySeoPresetsAfterMeasurement({ result: "missing", keywordDifficulty: "missing" }), null);
  // Nada a trocar: o aviso não pode afirmar troca de filtro.
  assert.equal(discoverySeoPresetsAfterMeasurement({ result: "0_99", keywordDifficulty: "0_20" }), null);

  const table = await readSource("../modules/minerador/discovery/discovery-table-placeholder.tsx");
  const body = sliceBetween(table, "const measureAllintitle = async () => {", "const importSelected = async () =>");
  const reveal = body.indexOf("const filtersRevealed = measuredCount > 0 && onSerpMeasured?.() === true;");
  assert.ok(reveal > body.indexOf('throw new Error(payload.message || "A medição SEO não foi concluída.")'), "o ajuste só roda depois da resposta OK");
  assert.match(body, /details: filtersRevealed \? "Filtros em Sem medição passaram para Todos/);
  // Só conta candidata que voltou com Resultado numérico.
  const loop = sliceBetween(body, "for (const item of payload.projections || []) {", "const filtersRevealed");
  const skip = loop.indexOf('if (!candidateId || typeof item.resultsAllintitle !== "number") continue;');
  assert.ok(skip >= 0 && skip < loop.indexOf("measuredCount += 1;"), "a contagem vem depois do continue");
  assert.equal((body.match(/measuredCount \+= 1/g) || []).length, 1);

  const page = await readSource("../modules/minerador/discovery/discovery-keywords-page.tsx");
  assert.match(page, /useEffect\(\(\) => \{ seoPresetsRef\.current = \{ result: resultPreset, keywordDifficulty: keywordDifficultyPreset \}; \}, \[resultPreset, keywordDifficultyPreset\]\);/);
  const keep = sliceBetween(page, "const keepMeasuredCandidatesVisible = () => {", "const clearFilters =");
  assert.match(keep, /const next = discoverySeoPresetsAfterMeasurement\(seoPresetsRef\.current\);\s*if \(!next\) return false;\s*setResultPreset\(next\.result\); setKeywordDifficultyPreset\(next\.keywordDifficulty\);\s*return true;/);
  assert.match(page, /onSerpMeasured=\{keepMeasuredCandidatesVisible\}/);
});

test("nenhum outro caminho da Descoberta chama a DataForSEO", async () => {
  const page = await readSource("../modules/minerador/discovery/discovery-keywords-page.tsx");
  const table = await readSource("../modules/minerador/discovery/discovery-table-placeholder.tsx");
  const filterRow = await readSource("../modules/minerador/discovery/discovery-filter-row.tsx");
  const sourceControls = await readSource("../modules/minerador/discovery/discovery-source-controls.tsx");
  const searchRow = await readSource("../modules/minerador/discovery/discovery-search-row.tsx");
  for (const source of [page, filterRow, sourceControls, searchRow]) assert.doesNotMatch(source, /\/dataforseo\//i);
  assert.equal((table.match(/dataforseo\/allintitle/g) || []).length, 1);
  // Única chamada: o clique explícito em Medir resultados.
  assert.equal((table.match(/measureAllintitle\(\)/g) || []).length, 1);
  assert.match(table, /onClick=\{\(\) => void measureAllintitle\(\)\}/);
  assert.doesNotMatch(table, /useEffect/);

  for (const route of [
    "../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts",
    "../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts",
    "../app/api/minerador/marcas/[brandId]/discovery/import/route.ts",
    "../app/api/minerador/marcas/[brandId]/discovery/sources/route.ts",
  ]) {
    assert.doesNotMatch(await readSource(route), /dataforseo/i, route);
  }
});

test("os popovers de Resultado e KD explicam o bloqueio sem chamar provider", async () => {
  const filterRow = await readSource("../modules/minerador/discovery/discovery-filter-row.tsx");
  assert.match(filterRow, /Sem medição é o padrão e mantém Medir resultados bloqueado/);
  assert.match(filterRow, /Escolha Todos para liberar e continuar vendo as candidatas sem medição; faixas e \{presentLabel\} mostram só as já medidas\./);
  assert.match(filterRow, /Alterar o filtro não chama a DataForSEO/);
  assert.doesNotMatch(filterRow, /fetch\s*\(/);
});

test("o title do filtro em Sem medição considera o outro filtro SEO", async () => {
  const filterRow = await readSource("../modules/minerador/discovery/discovery-filter-row.tsx");
  const title = sliceBetween(filterRow, "function numericRangeFilterTitle(", "function NumericRangeFilter");
  assert.match(title, /if \(missingSelected\) return serpMeasurementEnabled \? "Sem medição neste filtro\. Medir resultados já está liberado pelo outro filtro SEO" : "Sem medição: Medir resultados fica bloqueado\./);
  assert.match(filterRow, /title=\{numericRangeFilterTitle\(label, preset === "missing", serpMeasurementEnabled, hasData\)\}/);
  assert.equal((filterRow.match(/hasData=\{hasSeoData\} serpMeasurementEnabled=\{serpMeasurementEnabled\}/g) || []).length, 2, "Resultado e KD recebem o estado da medição");

  const page = await readSource("../modules/minerador/discovery/discovery-keywords-page.tsx");
  assert.match(page, /const serpMeasurementEnabled = isDiscoverySerpMeasurementEnabled\(seoFilters\);/);
  assert.match(page, /<DiscoveryFilterRow[^>]*serpMeasurementEnabled=\{serpMeasurementEnabled\}/);
});
