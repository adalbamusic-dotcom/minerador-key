import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  keywordHasProcessorRun,
  processorCpcCell,
  processorKdCell,
  processorResultsCell,
  processorVolumeCell,
  PROCESSOR_PROCESSED_EMPTY_HINT,
} from "../lib/minerador/processor-table-cells.ts";
import {
  combinedKgrFilterValue,
  combinedVinculoFilterValue,
  deriveMineradorTableRows,
  KGR_FILTER_GROUPS,
  parseCombinedKgrFilter,
  parseCombinedVinculoFilter,
  VINCULO_FILTER_GROUPS,
  type MineradorTableFilters,
  type MineradorTableRow,
} from "../lib/minerador/table-view.ts";
import { resolveCanonicalKeywordSnapshot } from "../lib/minerador/canonical-keyword-snapshot.ts";
import { classifyKgrMeasurement } from "../lib/minerador/kgr-applicability.ts";
import { readVolumeEligibility } from "../lib/minerador/volume-eligibility.ts";
import { defaultMineradorOrganization, mineradorOrganizationLabels, normalizeMineradorLastOrganization } from "../lib/minerador/last-organization.ts";
import { resolveKeywordTableResponsiveWidths } from "../modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts";

const MEASURED_AT = "2026-09-20T10:00:00.000Z";

function row(id: string, semantic: Record<string, unknown> | null, extra: Partial<MineradorTableRow> = {}): MineradorTableRow {
  return { id, keyword: `keyword ${id}`, location: null, results_allintitle: null, volume_search: null, kgr_score: null, intent: null, status: "bruto", lista_id: null, analise_semantica: semantic, ...extra };
}

const filters = (overrides: Partial<MineradorTableFilters> = {}): MineradorTableFilters => ({
  searchQuery: "", status: "Todos", intent: "Todos", listId: "Todos", siteRelation: "Todos", siteArchitecture: "Todos", sitePublication: "Todos",
  kgrApplicability: "Todos", kgrMeasurement: "Todos", volumeEligibility: "Todos", sortColumn: "keyword", sortDirection: "asc", ...overrides,
});

const volumeUnavailable = { volume_eligibility: { status: "unavailable", provider: "google_ads", providerVersion: "v25", measuredAt: MEASURED_AT, averageMonthlySearches: null } };
const volumeFailed = { volume_eligibility: { status: "measurement_failed", provider: "google_ads", providerVersion: "v25", measuredAt: MEASURED_AT, averageMonthlySearches: null } };
const volumeMeasuredWithoutCpc = { volume_measurement: { provider: "google_ads", measuredAt: MEASURED_AT, averageMonthlySearches: 480 } };
const resultsMeasured = { allintitle_measurement: { provider: "dataforseo", measuredAt: MEASURED_AT, resultsAllintitle: 12, operationRequestId: "op-1" } };

function withoutComments(source: string): string {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

test("Volume: nunca processado é —, processado sem dado é 0 apagado, falha é erro e rodando é pendente", () => {
  assert.deepEqual(processorVolumeCell({ semantic: null, value: null }), { tone: "not_processed", text: "—", hint: "Ainda não processado" });
  const empty = processorVolumeCell({ semantic: volumeUnavailable, value: null });
  assert.equal(empty.tone, "processed_empty");
  assert.equal(empty.text, "0");
  assert.equal(empty.hint, PROCESSOR_PROCESSED_EMPTY_HINT);
  assert.equal(processorVolumeCell({ semantic: volumeFailed, value: null }).tone, "error");
  assert.equal(processorVolumeCell({ semantic: null, value: null, attempts: { volume: { state: "failed" } } }).tone, "error");
  assert.equal(processorVolumeCell({ semantic: volumeUnavailable, value: null, attempts: { volume: { state: "running" } } }).tone, "pending");
  assert.equal(processorVolumeCell({ semantic: volumeFailed, value: 320 }).tone, "value");
});

test("CPC herda o processo do Volume: medição sem CPC é 0 apagado, sem medição continua —", () => {
  assert.equal(processorCpcCell({ semantic: volumeMeasuredWithoutCpc, value: null }).tone, "processed_empty");
  assert.equal(processorCpcCell({ semantic: volumeUnavailable, value: null }).tone, "processed_empty");
  assert.equal(processorCpcCell({ semantic: volumeFailed, value: null }).tone, "error");
  assert.equal(processorCpcCell({ semantic: {}, value: null }).tone, "not_processed");
});

test("Resultados: o erro gravado aparece com o motivo; valor anterior com falha nova mantém o número e avisa", () => {
  const lastError = { allintitle_last_error: { provider: "dataforseo", errorCode: "40501", message: "Crédito insuficiente", failedAt: MEASURED_AT } };
  const failed = processorResultsCell({ semantic: lastError, value: null });
  assert.equal(failed.tone, "error");
  assert.equal(failed.text, "Erro");
  assert.match(failed.hint || "", /Crédito insuficiente/);
  const preserved = processorResultsCell({ semantic: { ...resultsMeasured, ...lastError }, value: 12 });
  assert.equal(preserved.tone, "value");
  assert.match(preserved.hint || "", /Última atualização falhou/);
  assert.equal(processorResultsCell({ semantic: { allintitle_measurement: { provider: "dataforseo", measuredAt: MEASURED_AT, status: "no_results" } }, value: null }).tone, "processed_empty");
  assert.equal(processorResultsCell({ semantic: { allintitle_measurement: { provider: "dataforseo", measuredAt: MEASURED_AT, status: "captcha" } }, value: null }).tone, "error");
  assert.equal(processorResultsCell({ semantic: {}, value: null }).tone, "not_processed");
  assert.equal(processorResultsCell({ semantic: {}, value: null, attempts: { results: { state: "running" } } }).tone, "pending");
});

test("KD vem com Resultados: overview sem KD ou Resultados medido sem overview é 0 apagado; erro do overview é erro", () => {
  assert.equal(processorKdCell({ semantic: { dataforseo_keyword_overview: { provider: "dataforseo", keywordDifficulty: null } }, value: null }).tone, "processed_empty");
  assert.equal(processorKdCell({ semantic: resultsMeasured, value: null }).tone, "processed_empty");
  const overviewError = processorKdCell({ semantic: { dataforseo_keyword_overview_last_error: { errorCode: "x", message: "Timeout do provider", failedAt: MEASURED_AT } }, value: null });
  assert.equal(overviewError.tone, "error");
  assert.match(overviewError.hint || "", /Timeout do provider/);
  assert.equal(processorKdCell({ semantic: {}, value: null }).tone, "not_processed");
});

test("ADR-020: o 0 apagado é só tela; o dado continua vazio e KGR, elegibilidade e filtros não o tratam como zero medido", () => {
  const processedEmpty = row("vazia", volumeUnavailable);
  const measuredZero = row("zero", { volume_measurement: { provider: "google_ads", measuredAt: MEASURED_AT, averageMonthlySearches: 0 } }, { volume_search: 0 });
  const snapshot = resolveCanonicalKeywordSnapshot(processedEmpty);
  assert.equal(snapshot.metrics.volume.value, null);
  assert.equal(snapshot.metrics.kgr.score, null);
  assert.equal(classifyKgrMeasurement({ kgrScore: snapshot.metrics.kgr.score, volume: snapshot.metrics.volume.value, results: snapshot.metrics.result.value }), "without_data");
  assert.equal(readVolumeEligibility(processedEmpty), "unavailable");
  assert.equal(processedEmpty.volume_search, null);
  const partial = deriveMineradorTableRows([processedEmpty, measuredZero], [], filters({ kgrMeasurement: "partial" }));
  assert.deepEqual(partial.map(item => item.id), ["zero"]);
  assert.equal(resolveCanonicalKeywordSnapshot(measuredZero).metrics.volume.value, 0);
});

test("filtro Processo: com processo inclui dado, sem dado e erro; valor só importado do Descobrir fica em sem processo", () => {
  const imported = row("importada", { discovery_import: { source: "discovery", sourceSnapshot: { metrics: { averageMonthlySearches: 900, metricsMeasuredAt: MEASURED_AT } } } });
  const never = row("nunca", null);
  const empty = row("vazia", volumeUnavailable);
  const failed = row("falhou", volumeFailed);
  const measured = row("medida", resultsMeasured, { results_allintitle: 12 });
  assert.equal(keywordHasProcessorRun(imported), false);
  assert.equal(keywordHasProcessorRun(never), false);
  const all = [imported, never, empty, failed, measured];
  assert.deepEqual(deriveMineradorTableRows(all, [], filters({ processRun: "with_process", sortColumn: "keyword" })).map(item => item.id).sort(), ["falhou", "medida", "vazia"]);
  assert.deepEqual(deriveMineradorTableRows(all, [], filters({ processRun: "without_process" })).map(item => item.id).sort(), ["importada", "nunca"]);
  assert.equal(deriveMineradorTableRows(all, [], filters()).length, 5);
});

test("KGR e Vínculo viram um seletor só cada: escolher um lado zera o outro e valor desconhecido volta a Todos", () => {
  assert.deepEqual(KGR_FILTER_GROUPS.map(group => group.label), ["Aplicabilidade", "Cálculo"]);
  assert.deepEqual(VINCULO_FILTER_GROUPS.map(group => group.label), ["Vínculo", "Relação com URL"]);
  for (const group of KGR_FILTER_GROUPS) for (const option of group.options) {
    const parsed = parseCombinedKgrFilter(option.value);
    assert.equal(combinedKgrFilterValue(parsed.kgrApplicability, parsed.kgrMeasurement), option.value);
    assert.ok(parsed.kgrApplicability === "Todos" || parsed.kgrMeasurement === "Todos");
  }
  for (const group of VINCULO_FILTER_GROUPS) for (const option of group.options) {
    const parsed = parseCombinedVinculoFilter(option.value);
    assert.equal(combinedVinculoFilterValue(parsed.sitePublication, parsed.siteRelation), option.value);
    assert.ok(parsed.sitePublication === "Todos" || parsed.siteRelation === "Todos");
  }
  assert.deepEqual(parseCombinedKgrFilter("inventado:x"), { kgrApplicability: "Todos", kgrMeasurement: "Todos" });
  assert.deepEqual(parseCombinedVinculoFilter("Todos"), { sitePublication: "Todos", siteRelation: "Todos" });
  assert.deepEqual(parseCombinedKgrFilter("calculo:complete"), { kgrApplicability: "Todos", kgrMeasurement: "complete" });
  assert.deepEqual(parseCombinedVinculoFilter("relacao:supporting"), { sitePublication: "Todos", siteRelation: "supporting" });
});

test("preferência salva antiga não deixa filtro escondido: Silo e Arquitetura voltam a Todos e os pares viram um lado só", () => {
  const restored = normalizeMineradorLastOrganization({
    filterListId: "silo-1", filterSiteArchitecture: "architecture_confirmed",
    filterKgrApplicability: "applicable", filterKgrMeasurement: "complete",
    filterSitePublication: "free", filterSiteRelation: "supporting", filterProcess: "with_process",
  }, ["silo-1"]);
  assert.equal(restored.filterListId, "Todos");
  assert.equal(restored.filterSiteArchitecture, "Todos");
  assert.equal(restored.filterKgrApplicability, "applicable");
  assert.equal(restored.filterKgrMeasurement, "Todos");
  assert.equal(restored.filterSitePublication, "free");
  assert.equal(restored.filterSiteRelation, "Todos");
  assert.equal(restored.filterProcess, "with_process");
  assert.equal(normalizeMineradorLastOrganization({ filterProcess: "qualquer" }).filterProcess, "Todos");
  assert.equal(defaultMineradorOrganization.filterProcess, "Todos");
  const labels = mineradorOrganizationLabels(restored, [{ id: "silo-1", nome: "Estética" }]);
  assert.ok(labels.includes("Com processo"));
  assert.ok(labels.includes("Vínculo: Livre"));
  assert.equal(labels.some(label => label.startsWith("Silo")), false);
  assert.equal(labels.some(label => label.startsWith("Arquitetura")), false);
});

test("larguras: a coluna fill fica com toda a sobra e é a última a encolher; sem fill nada muda", () => {
  const preferred = { keyword: 460, results: 128, volume: 120, intent: 168 };
  const constraints = {
    keyword: { min: 240, max: 1200, fill: true },
    results: { min: 104, priority: "protected" as const },
    volume: { min: 96, priority: "protected" as const },
    intent: { min: 104, flexible: true },
  };
  const wide = resolveKeywordTableResponsiveWidths(preferred, constraints, 1500);
  assert.equal(wide.keyword, 460 + (1500 - 876));
  assert.equal(wide.results, 128);
  assert.equal(wide.intent, 168);
  const tight = resolveKeywordTableResponsiveWidths(preferred, constraints, 800);
  assert.equal(tight.keyword, 460);
  assert.equal(tight.intent, 104);
  const tighter = resolveKeywordTableResponsiveWidths(preferred, constraints, 700);
  assert.equal(tighter.results + tighter.volume, 200);
  assert.equal(tighter.keyword, 700 - 104 - 200);
  const { keyword: _fill, ...rest } = constraints;
  void _fill;
  const legacy = resolveKeywordTableResponsiveWidths(preferred, { ...rest, keyword: { min: 240, flexible: true } }, 1500);
  assert.deepEqual(legacy, preferred);
});

test("tela do Processador: filtros novos, cabeçalho preso, keyword com a sobra e células sem traço solto", () => {
  const workspace = withoutComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
  const organizeStart = workspace.indexOf("{organizeOpen && (");
  const organizeEnd = workspace.indexOf("{siteSyncPlan && (");
  assert.ok(organizeStart > 0 && organizeEnd > organizeStart);
  const organize = workspace.slice(organizeStart, organizeEnd);
  assert.doesNotMatch(organize, /\bSilo\b/);
  assert.doesNotMatch(organize, /Arquitetura/);
  assert.doesNotMatch(organize, /Relação com URL/);
  assert.doesNotMatch(organize, /Estado do cálculo KGR|Aplicabilidade KGR/);
  assert.doesNotMatch(organize, /bg-\[#|slate-|text-\[1[01]px\]/);
  assert.match(organize, /data-organize-filter="vinculo"[\s\S]*VINCULO_FILTER_GROUPS[\s\S]*<optgroup/);
  assert.match(organize, /data-organize-filter="kgr"[\s\S]*KGR_FILTER_GROUPS[\s\S]*<optgroup/);
  assert.match(organize, /data-organize-filter="processo"[\s\S]*PROCESS_RUN_FILTER_OPTIONS/);
  assert.equal((organize.match(/<select/g) || []).length, (organize.match(/className=\{ORGANIZE_SELECT_CLASS\}/g) || []).length);
  assert.match(workspace, /const ORGANIZE_SELECT_CLASS = `[^`]*\$\{BULK_SELECT_THEME\}`/);
  // Atualizado em 2026-09-24 (pedido do dono): uma rolagem vertical só; a página não rola e a planilha ocupa a sobra.
  // Corretor, mesmo dia: altura mínima no lugar de min-h-0, e o espaço do rodapé é um irmão, não padding.
  assert.match(workspace, /<KeywordTableShell ref=\{tableRef\} scroll="both" data-processor-table-viewport className="min-h-40">/);
  assert.match(workspace, /<KeywordTableHeader className="sticky top-0 z-20/);
  assert.match(workspace, /keyword: \{ min: 240, max: 1200, fill: true \}/);
  assert.match(workspace, /data-processor-keyword-text\s+className=\{`break-words select-text cursor-text text-sm text-keyword/);
  for (const cell of ["resultsCell", "volumeCell", "cpcCell", "kdCell"]) assert.match(workspace, new RegExp(`<ProcessorMetricPlaceholder cell=\\{${cell}\\} />`));
  assert.doesNotMatch(workspace, /formatMetricInteger\(volumeValue\) : "-"/);
  assert.doesNotMatch(workspace, /keywordDifficultyEvidence\.value : "—"/);
  assert.match(workspace, /processed_empty: "text-text-muted\/60"/);
  assert.match(workspace, /error: "font-medium text-warning"/);
  assert.match(workspace, /processRun: filterProcess/);
});
