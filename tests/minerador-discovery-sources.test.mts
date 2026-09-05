import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDiscoverySourceCandidateRows, buildDiscoverySourceRunRow, normalizeDiscoverySourceEntries, parseDiscoveryCsvRecords, parseDiscoveryCsvRows, parseManualKeywords } from "../lib/minerador/discovery-sources.ts";

test("manual aceita keywords sem lista e deduplica somente dentro do lote", () => {
  const parsed = normalizeDiscoverySourceEntries({ source: "manual", entries: parseManualKeywords(" Marketing local \nmarketing local\n\nSEO para clínicas") });
  assert.equal(parsed.accepted.length, 2);
  assert.equal(parsed.duplicateCount, 1);
  assert.equal(parsed.rejectedCount, 0);
  assert.equal(parsed.accepted[0].listaId, null);
  assert.equal(parsed.accepted[0].sourceData.source, "manual");
});

test("CSV reconhece campos suportados e não transforma KGR em métrica operacional", () => {
  const parsed = parseDiscoveryCsvRecords([
    { Keyword: "marketing para clínicas", Volume: "120", CPC: "R$ 2,50", Competição: "LOW", KGR: "0,12", Observação: "importado" },
    { Keyword: "SEO local", Volume: "0", Resultados: "8" },
    { Keyword: "SEO técnico", CPC: 1.5 },
  ]);
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.entries[0].importedMetrics?.averageMonthlySearches, 120);
  assert.equal(parsed.entries[0].importedMetrics?.cpc, "R$ 2,50");
  assert.ok(parsed.ignoredFields.includes("KGR"));
  assert.ok(parsed.ignoredFields.includes("Observação"));
  assert.equal(parsed.entries[1].importedMetrics?.resultsAllintitle, 8);
  assert.equal(parsed.entries[2].importedMetrics?.cpc, "1.5");
});

test("CSV simples de uma coluna aceita header ou ausência de header e ignora linhas vazias", () => {
  const withHeader = parseDiscoveryCsvRows([["Keyword"], ["foo"], [""], ["bar"]]);
  assert.equal(withHeader.rowCount, 2);
  assert.deepEqual(withHeader.entries.map(entry => entry.keyword), ["foo", "bar"]);

  const withoutHeader = parseDiscoveryCsvRows([["foo"], [""], ["bar"]]);
  assert.equal(withoutHeader.rowCount, 2);
  assert.deepEqual(withoutHeader.entries.map(entry => entry.keyword), ["foo", "bar"]);
});

test("linhas locais preservam origem, lista e ausência real de targeting/provider", () => {
  const normalized = normalizeDiscoverySourceEntries({ source: "csv", entries: [{ keyword: "SEO local", listaId: "list-1", location: "SP", importedMetrics: { averageMonthlySearches: 120, resultsAllintitle: 4 }, recognizedFields: ["Keyword", "Volume"], ignoredFields: ["KGR"] }] });
  const rows = buildDiscoverySourceCandidateRows({ brandId: "brand-1", runId: "run-1", source: "csv", preliminaryIntent: "Informativa", preliminaryFunnel: "TOFU", entries: normalized.accepted, existingByCanonical: new Map() });
  assert.equal(rows[0].source, "csv");
  assert.equal(rows[0].provider, null);
  assert.equal(rows[0].provider_version, null);
  assert.equal(rows[0].targeting, null);
  assert.equal(rows[0].currency_code, null);
  assert.equal(rows[0].average_monthly_searches, null);
  assert.equal(rows[0].source_data.listaId, "list-1");
  const run = buildDiscoverySourceRunRow({ id: "run-1", brandId: "brand-1", actorUserId: "actor-1", operationRequestId: "request-1", source: "csv", preliminaryIntent: "Informativa", preliminaryFunnel: "TOFU", receivedCount: 1, normalizedCount: 1, approvedCount: 1, filteredCount: 0, executedAt: "2026-08-13T12:00:00.000Z" });
  assert.equal(run.source, "csv");
  assert.equal(run.provider, null);
  assert.equal(run.currency_code, null);
  assert.equal(run.geo_target_constants, null);
});

test("migration 0040 declara as três origens e mantém a RPC Google anterior", async () => {
  const migration = await readFile(new URL("../supabase/migrations/0040_minerador_discovery_multi_source.sql", import.meta.url), "utf8");
  assert.match(migration, /source IN \('google_ads', 'manual', 'csv'\)/);
  assert.match(migration, /persist_minerador_discovery_source_run/);
  assert.match(migration, /provider_version = 'v25'/);
  assert.match(migration, /provider IS NULL/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON FUNCTION public\.persist_minerador_discovery_source_run/);
  assert.doesNotMatch(migration, /DROP FUNCTION[^;]*persist_minerador_discovery_run/);
});

test("previsao CSV mostra validacao, duplicatas, campos e referencias opcionais", async () => {
  const controls = await readFile(new URL("../modules/minerador/discovery/discovery-source-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /normalizeDiscoverySourceEntries/);
  for (const field of ["validRows", "duplicateRows", "rejectedRows", "importedMetricRows", "ignoredFields", "unresolvedListReferences"]) {
    assert.match(controls, new RegExp(field));
  }
  assert.match(controls, /Confirmar CSV/);
  assert.match(controls, /parseDiscoveryCsvRows/);
  assert.match(controls, /header: false/);
  assert.match(controls, /também pode vir sem cabeçalho/);
});

test("CSV rico preserva campos extras sem rejeitar a origem e mostra resumo compacto", async () => {
  const extraFields = Object.fromEntries(Array.from({ length: 62 }, (_, index) => [`Campo extra ${index + 1}`, `valor-${index + 1}`]));
  const parsed = parseDiscoveryCsvRecords([{ Keyword: "marketing local", Volume: "120", ...extraFields }]);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.ignoredFields.length, 62);
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/discovery/sources/route.ts", import.meta.url), "utf8");
  const controls = await readFile(new URL("../modules/minerador/discovery/discovery-source-controls.tsx", import.meta.url), "utf8");
  assert.match(route, /ignoredFields:[\s\S]*\.max\(200\)/);
  assert.match(controls, /Campos adicionais ignorados/);
  assert.match(controls, /Ver campos ignorados/);
  assert.match(controls, /slice\(0, 32\)/);
});

test("fontes locais usam os modais existentes e os gatilhos ficam na GlobalTopbar", async () => {
  const [controls, topbarActions, discoveryPage, workspace] = await Promise.all([
    readFile(new URL("../modules/minerador/discovery/discovery-source-controls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/minerador/discovery/discovery-source-topbar-actions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(controls, /Buscar no Google Ads/);
  assert.doesNotMatch(controls, /aria-label="Fontes de descoberta"/);
  assert.match(controls, /Colar keywords/);
  assert.match(controls, /Importar CSV/);
  assert.match(controls, /forwardRef/);
  assert.match(controls, /openManual/);
  assert.match(controls, /openCsv/);
  assert.match(topbarActions, /Colar keywords/);
  assert.match(topbarActions, /Importar CSV/);
  assert.match(topbarActions, /data-minerador-discovery-source-actions/);
  assert.match(discoveryPage, /actions: sourceActions/);
  assert.match(discoveryPage, /<DiscoverySourceControls ref=\{sourceControlsRef\}/);
  assert.match(workspace, /<DiscoverySourceControls ref=\{discoverySourceControlsRef\}/);
  assert.match(workspace, /DiscoverySourceTopbarActions/);
  assert.match(controls, /discovery\/sources/);
  assert.doesNotMatch(controls, /fetch\([^)]*google-ads/);
});

test("tabela identifica discretamente Google Ads, Manual e CSV", async () => {
  const table = await readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
  assert.match(table, /sourceText/);
  assert.match(table, /"Google Ads"/);
  assert.match(table, /"Manual"/);
  assert.match(table, /"CSV"/);
  assert.match(table, /Origem: \$\{sourceLabel\}/);
});

test("tabela multi-source preserva largura legível e scroll horizontal compartilhado", async () => {
  const table = await readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
  assert.match(table, /KeywordTableShell ref=\{tableRef\} scroll="x"/);
  assert.match(table, /style=\{\{ minWidth: discoveryTableMinimumWidth \}\}/);
  assert.match(table, /useKeywordTableResponsiveWidths/);
  assert.match(table, /data-keyword-table="discovery"/);
  assert.match(table, /sourceBadge = .*shrink-0/);
  assert.doesNotMatch(table, /min-w-\[1442px\]/);
});

test("Processador não mantém botões visíveis concorrentes de CSV ou Manual", async () => {
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const toolbarStart = workspace.indexOf("actions: <div");
  const toolbarEnd = workspace.indexOf("tabs: sectionTabs", toolbarStart);
  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  const toolbar = workspace.slice(toolbarStart, toolbarEnd);
  assert.doesNotMatch(toolbar, /<span>CSV<\/span>/);
  assert.doesNotMatch(toolbar, /<span>Manual<\/span>/);
  assert.match(toolbar, /<span className="hidden xl:inline">Exportar<\/span>/);
  assert.match(workspace, /const discoverySourceActions = useMemo/);
  assert.match(workspace, /DiscoverySourceControls ref=\{discoverySourceControlsRef\}/);
});

test("rota multi-source persiste somente candidatas e não cria keyword oficial", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/discovery/sources/route.ts", import.meta.url), "utf8");
  assert.match(route, /persist_minerador_discovery_source_run/);
  assert.doesNotMatch(route, /from\("minerador_keywords"\)\.insert/);
});
