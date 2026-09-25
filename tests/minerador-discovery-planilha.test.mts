import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyKeywordSelectionClick, toggleVisibleKeywordSelection } from "../lib/minerador/keyword-selection.ts";
import { candidateMatchesDiscoveryOrganization, EMPTY_DISCOVERY_ORGANIZATION, sortDiscoveryCandidates } from "../lib/minerador/discovery-organization.ts";
import {
  DISCOVERY_PROCESSED_EMPTY_HINT,
  discoveryCompetitionCell,
  discoveryCpcCell,
  discoveryResultsCell,
  discoveryVolumeCell,
  reconcileDiscoverySelection,
  sameDiscoveryIdOrder,
} from "../lib/minerador/discovery-table-cells.ts";
import type { DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";
import type { DiscoveryCandidateCurrentMetrics } from "../lib/minerador/discovery-current-metrics.ts";

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const table = stripComments(readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8"));
const searchRow = stripComments(readFileSync(new URL("../modules/minerador/discovery/discovery-search-row.tsx", import.meta.url), "utf8"));
const sourceControls = stripComments(readFileSync(new URL("../modules/minerador/discovery/discovery-source-controls.tsx", import.meta.url), "utf8"));

function candidate(id: string, keyword: string, patch: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    candidateId: id,
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
    timeZone: null,
    targeting: null,
    source: "google_ads",
    provider: "google_ads",
    providerVersion: "v25",
    measuredAt: "2026-09-24T10:00:00.000Z",
    existingKeywordId: null,
    ...patch,
  };
}

function manual(id: string, keyword: string, patch: Partial<DiscoveryCandidate> = {}) {
  return candidate(id, keyword, { source: "manual", provider: null, providerVersion: null, measuredAt: null, ...patch });
}

function metrics(patch: Partial<DiscoveryCandidateCurrentMetrics>): DiscoveryCandidateCurrentMetrics {
  return {
    candidateId: "c", brandId: "b", keywordId: null, resultsAllintitle: null, allintitleStatus: "not_measured", allintitleMeasuredAt: null,
    allintitleProvider: null, allintitleExecutor: null, allintitleErrorCode: null, allintitleErrorMessage: null, averageMonthlySearches: null,
    monthlySearchVolumes: [], lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null, competition: null,
    competitionIndex: null, currencyCode: null, targeting: null, metricsMeasuredAt: null, metricsProvider: null, metricsProviderVersion: null,
    updatedAt: null, ...patch,
  };
}

test("reproduz o seletor quebrado: a ordem crua seleciona linhas escondidas e intervalos errados", () => {
  const all = [candidate("a", "zeta"), candidate("b", "alfa"), candidate("c", "beta", { averageMonthlySearches: 10 })];
  const baseIds = all.map(item => item.candidateId);
  const shown = all.filter(item => candidateMatchesDiscoveryOrganization(item, "", "", "", new Set(), "", { ...EMPTY_DISCOVERY_ORGANIZATION, volume: "unavailable" }));
  const visibleIds = shown.map(item => item.candidateId);
  assert.deepEqual(visibleIds, ["a", "b"]);

  const withRawOrder = toggleVisibleKeywordSelection(new Set(), baseIds);
  assert.ok(withRawOrder.has("c"), "com a ordem crua, 'selecionar visíveis' marcava a candidata escondida");
  const withShownOrder = toggleVisibleKeywordSelection(new Set(), visibleIds);
  assert.deepEqual([...withShownOrder].sort(), ["a", "b"]);

  const sorted = sortDiscoveryCandidates(all, "", "", "", { field: "keyword", direction: "asc" }, null).map(item => item.candidateId);
  assert.deepEqual(sorted, ["b", "c", "a"]);
  const rawRange = applyKeywordSelectionClick({ selectedIds: new Set(["b"]), visibleIds: baseIds, id: "a", anchorId: "b", shiftKey: true });
  assert.deepEqual([...rawRange.selectedIds].sort(), ["a", "b"], "com a ordem crua, o intervalo exibido b→a perdia a linha c do meio");
  const shownRange = applyKeywordSelectionClick({ selectedIds: new Set(["b"]), visibleIds: sorted, id: "a", anchorId: "b", shiftKey: true });
  assert.deepEqual([...shownRange.selectedIds].sort(), ["a", "b", "c"], "o Shift+clique segue a ordem exibida");
});

test("a planilha entrega ao hook de seleção a ordem exibida, não a ordem crua", () => {
  assert.doesNotMatch(table, /useKeywordTableSelection\(baseIds\)/);
  assert.match(table, /const selection = useKeywordTableSelection\(selectionScopeIds\);/);
  assert.match(table, /if \(!sameDiscoveryIdOrder\(selectionScopeIds, visibleIds\)\) setSelectionScopeIds\(visibleIds\);/);
  assert.match(table, /const visibleIds = useMemo\(\(\) => organizedCandidates\.map\(candidate => candidate\.candidateId\), \[organizedCandidates\]\);/);
  assert.equal(sameDiscoveryIdOrder(["a", "b"], ["a", "b"]), true);
  assert.equal(sameDiscoveryIdOrder(["a", "b"], ["b", "a"]), false);
  assert.equal(sameDiscoveryIdOrder(["a"], ["a", "b"]), false);
});

test("seleção de uma pesquisa anterior é podada e não trava o envio", () => {
  const current = new Set(["a", "b"]);
  assert.equal(reconcileDiscoverySelection(current, ["a", "b", "c"]), current, "sem mudança devolve o mesmo Set");
  const empty = new Set<string>();
  assert.equal(reconcileDiscoverySelection(empty, []), empty);
  const pruned = reconcileDiscoverySelection(new Set(["a", "velha"]), ["a", "b"]);
  assert.deepEqual([...pruned], ["a"]);
  assert.match(table, /const reconciledSelectedIds = reconcileDiscoverySelection\(selection\.selectedIds, baseIds\);/);
  assert.match(table, /if \(reconciledSelectedIds !== selection\.selectedIds\) selection\.setSelectedIds\(reconciledSelectedIds\);/);
});

test("Histórico e Targeting saem da planilha e do painel Organizar", () => {
  assert.doesNotMatch(table, /label: "Histórico"|label: "Targeting"|"Histórico"|discoveryTargetingLabels|trendText/);
  for (const column of ["Keyword", "Relação", "Resultados", "Volume", "CPC", "Concorrência Ads", "Intenção preliminar", "Funil preliminar", "Situação"]) {
    assert.match(table, new RegExp(`label: "${column}"`));
  }
  assert.doesNotMatch(table, /\btrend: \d+|targeting: \{ min/);
});

test("volume processado sem dado mostra 0 apagado e o dado continua vazio", () => {
  const measured = candidate("a", "sem volume");
  const display = discoveryVolumeCell(measured);
  assert.deepEqual(display, { tone: "processed_empty", text: "0", hint: DISCOVERY_PROCESSED_EMPTY_HINT });
  assert.equal(DISCOVERY_PROCESSED_EMPTY_HINT, "Processado, sem dado");
  assert.equal(measured.averageMonthlySearches, null, "a leitura não inventa zero no dado");
  assert.equal(candidateMatchesDiscoveryOrganization(measured, "", "", "", new Set(), "", { ...EMPTY_DISCOVERY_ORGANIZATION, volume: "has" }), false, "filtro Com volume não conta o 0 de tela");
  assert.equal(candidateMatchesDiscoveryOrganization(measured, "", "", "", new Set(), "", { ...EMPTY_DISCOVERY_ORGANIZATION, volume: "unavailable" }), true);

  assert.deepEqual(discoveryVolumeCell(manual("m", "colada")), { tone: "not_processed", text: "—", hint: "Ainda não processado" });
  assert.deepEqual(discoveryVolumeCell(candidate("v", "com volume", { averageMonthlySearches: 1200 })), { tone: "value", text: "1.200" });
  const afterSessionMeasure = manual("s", "medida agora", { currentMetrics: metrics({ metricsMeasuredAt: "2026-09-24T11:00:00.000Z" }) });
  assert.equal(discoveryVolumeCell(afterSessionMeasure).tone, "processed_empty");
  assert.equal(discoveryCpcCell(afterSessionMeasure).tone, "not_processed", "a resposta do volume não traz CPC; não vira 0");
});

test("CPC e concorrência seguem a mesma leitura", () => {
  assert.equal(discoveryCpcCell(candidate("a", "sem cpc")).text, "0");
  assert.equal(discoveryCpcCell(candidate("a", "sem cpc")).tone, "processed_empty");
  assert.match(discoveryCpcCell(candidate("b", "com cpc", { averageCpcMicros: "2500000" })).text, /R\$\s?2,50/);
  assert.equal(discoveryCpcCell(manual("m", "colada")).text, "—");
  assert.deepEqual(discoveryCompetitionCell(candidate("c", "baixa", { competition: "LOW", competitionIndex: 12 })), { tone: "value", text: "Baixa · 12" });
  assert.equal(discoveryCompetitionCell(candidate("d", "sem dado")).tone, "processed_empty");
  const persisted = manual("p", "persistida", { currentMetrics: metrics({ metricsProvider: "google_ads", metricsMeasuredAt: "2026-09-20T00:00:00.000Z" }) });
  assert.equal(discoveryCpcCell(persisted).tone, "processed_empty");
});

test("Resultados distingue medido sem dado, erro, andamento e nunca medido", () => {
  assert.deepEqual(discoveryResultsCell(candidate("a", "a", { currentMetrics: metrics({ allintitleStatus: "measured", resultsAllintitle: 42 }) })), { tone: "value", text: "42" });
  assert.equal(discoveryResultsCell(candidate("b", "b", { currentMetrics: metrics({ allintitleStatus: "measured" }) })).text, "0");
  const failed = discoveryResultsCell(candidate("c", "c", { currentMetrics: metrics({ allintitleStatus: "failed", allintitleErrorCode: "DATAFORSEO_40501" }) }));
  assert.equal(failed.tone, "error");
  assert.match(failed.hint || "", /DATAFORSEO_40501/);
  assert.equal(discoveryResultsCell(candidate("d", "d", { currentMetrics: metrics({ allintitleStatus: "captcha" }) })).tone, "error");
  assert.equal(discoveryResultsCell(candidate("e", "e", { currentMetrics: metrics({ allintitleStatus: "measuring" }) })).tone, "pending");
  assert.equal(discoveryResultsCell(candidate("f", "f")).text, "—");
});

test("tons da célula usam tokens: 0 apagado em text-text-muted e erro na cor de alerta", () => {
  assert.match(table, /processed_empty: "text-text-muted"/);
  assert.match(table, /error: "font-medium text-warning"/);
  assert.match(table, /not_processed: ""/);
  assert.match(table, /<DiscoveryMetricCell display=\{discoveryResultsCell\(candidate\)\} \/>/);
  // Atualizado pelo corretor (2026-09-24): o Volume também recebe a marca da
  // sessão (candidata pedida em "Atualizar métricas" que voltou sem média).
  assert.match(table, /<DiscoveryMetricCell display=\{discoveryVolumeCell\(candidate, \{ answeredWithoutData: volumeAnsweredIds\.has\(candidate\.candidateId\) \}\)\} \/>/);
  assert.match(table, /title=\{display\.hint\}/);
  assert.match(table, /className="sr-only"/);
  assert.doesNotMatch(table, /"Sem média oficial"/);
});

test("Keyword nunca é cortada e fica com todo o espaço que sobra", () => {
  // Atualizado pelo corretor (2026-09-24): mesma regra do Processador — a
  // keyword quebra linha (whitespace-normal break-words) em vez de empurrar a
  // planilha para a rolagem horizontal; as colunas auxiliares seguem nowrap.
  assert.match(table, /const keywordCell = "[^"]*text-keyword[^"]*whitespace-normal break-words/);
  assert.doesNotMatch(table, /const keywordCell = "[^"]*(?:truncate|max-w-)/);
  assert.match(table, /<span className="min-w-0 select-text cursor-text break-words">\{candidate\.keyword\}<\/span>/);
  assert.doesNotMatch(table, /table-fixed|minWidth:|useKeywordTableResponsiveWidths/);
  assert.match(table, /return columnId === "keyword" \? undefined : 1;/);
  assert.match(table, /<table data-keyword-table="discovery" className="w-full border-collapse[^"]*whitespace-nowrap"/);
});

test("cabeçalho fica fixo ao rolar: o shell rola nos dois eixos com a altura da tela", () => {
  assert.match(table, /<KeywordTableShell ref=\{tableRef\} scroll="both" data-discovery-table-viewport className=\{`max-h-\[calc\(100dvh-2\.5rem\)\]/);
  assert.match(table, /<KeywordTableHeader className="sticky top-0 z-20 border-b border-divider bg-surface-subtle">/);
});

test("selects do Descobrir abrem no esquema escuro com tokens", () => {
  assert.match(table, /const control = "[^"]*scheme-dark/);
  assert.match(table, /const optionClass = "bg-surface-elevated text-foreground";/);
  const options = table.match(/<option\b[^>]*>/g) || [];
  assert.ok(options.length >= 6);
  for (const option of options) assert.match(option, /className=\{optionClass\}/);
  assert.match(searchRow, /const control = "[^"]*scheme-dark/);
  assert.match(sourceControls, /const control = "[^"]*scheme-dark/);
  assert.doesNotMatch(table, /bg-white|text-black|bg-black/);
});
