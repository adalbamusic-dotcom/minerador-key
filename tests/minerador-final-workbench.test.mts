import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const discoveryPage = readFileSync(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8");
const discoverySearch = readFileSync(new URL("../modules/minerador/discovery/discovery-search-row.tsx", import.meta.url), "utf8");
const discoveryFilters = readFileSync(new URL("../modules/minerador/discovery/discovery-filter-row.tsx", import.meta.url), "utf8");
const discoveryTable = readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
const processor = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const dnaPanels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const bulkBar = readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-bulk-bar-shell.tsx", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../components/global-topbar.tsx", import.meta.url), "utf8");
const organizeButton = readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-organize-button.tsx", import.meta.url), "utf8");

test("busca da Descoberta usa a mesma porta de entrada no clique e no Enter", () => {
  assert.match(discoverySearch, /max-w-\[60ch\]/);
  assert.match(discoverySearch, /Digite uma keyword, serviço, produto ou nicho\.\.\./);
  assert.match(discoverySearch, /event\.key === "Enter"/);
  assert.match(discoverySearch, /void onSubmit\(\)/);
  assert.match(discoveryFilters, /Buscar Keywords/);
  assert.match(discoveryFilters, /onClick=\{onDiscover\}/);
  assert.match(discoveryFilters, /disabled=\{loading \|\| !canSubmit\}/);
  assert.match(discoveryPage, /normalizedSeed\.length < 2/);
  assert.match(discoveryPage, /loadingRef\.current/);
  assert.match(discoveryPage, /onSubmit=\{discover\}/);
});

test("entrada principal do Descobrir possui hierarquia sem alterar os controles auxiliares", () => {
  assert.match(discoverySearch, /const primarySearchControl = "[^\"]*border-action-accent\/35[^\"]*hover:border-action-accent\/50[^\"]*focus:border-action-accent\/65[^\"]*focus-visible:ring-2 focus-visible:ring-action-accent\/20/);
  assert.match(discoverySearch, /max-w-\[60ch\] text-sm font-semibold text-foreground/);
  assert.match(discoverySearch, /const control = "[^\"]*border-divider[^\"]*hover:border-module-accent\/25[^\"]*focus:border-module-accent\/50/);
});

test("Descoberta ocupa a largura útil e preserva seleção de texto", () => {
  assert.match(discoveryPage, /flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip px-0/);
  assert.match(discoveryTable, /select-text/);
  assert.match(processor, /select-text/);
  assert.doesNotMatch(processor.split("return (")[0], /select-none/);
});

test("DNA expandido não repete título e keyword e permanece compacto", () => {
  assert.match(dnaPanels, /KeywordDNA/);
  assert.match(dnaPanels, /KeywordDnaProvenance/);
  assert.match(dnaPanels, /showProvenance = true/);
  assert.doesNotMatch(dnaPanels, /#\$\{visualPosition\}/);
  assert.doesNotMatch(dnaPanels, /<h3[^>]*>\{keyword\.keyword\}<\/h3>/);
  assert.match(processor, /showProvenance=\{false\}/);
  assert.match(processor, /<KeywordDnaProvenance keyword=\{item\} \/>/);
});

test("barra de seleção é um dock único no viewport e reserva espaço para as últimas linhas", () => {
  assert.match(bulkBar, /fixed bottom-0/);
  assert.match(bulkBar, /data-keyword-table-bulk-bar/);
  assert.match(bulkBar, /h-11 min-h-11/);
  assert.match(bulkBar, /overflow-hidden/);
  assert.doesNotMatch(bulkBar, /overflow(?:-[xy])?-(?:auto|scroll)/);
  assert.match(bulkBar, /bg-surface-elevated/);
  assert.match(processor, /KeywordTableShell ref=\{tableRef\} scroll="x" className=\{selectedIds\.size > 0 \? "pb-14" : ""\}/);
  assert.match(discoveryTable, /KeywordTableShell ref=\{tableRef\} scroll="x" className=\{selection\.selectedIds\.size \? "pb-14" : ""\}/);
});

test("GlobalTopbar agrupa as ferramentas do Minerador imediatamente antes das tabs", () => {
  assert.match(topbar, /data-topbar-module-actions/);
  assert.match(topbar, /overflow-hidden" data-topbar-module-actions/);
  assert.doesNotMatch(topbar, /overflow-x-auto[^>]*data-topbar-module-actions/);
  assert.match(topbar, /model\.moduleId !== "minerador"/);
  assert.match(topbar, /data-topbar-module-tabs/);
  assert.match(processor, /KeywordTableOrganizeButton/);
  assert.match(discoveryTable, /KeywordTableOrganizeButton/);
  assert.match(organizeButton, /ListFilter/);
});

test("as duas tabelas têm mínimo semântico e reduzem colunas flexíveis antes do scroll", () => {
  assert.match(processor, /data-keyword-table="processor"/);
  assert.match(processor, /min-w-\[1234px\]/);
  assert.match(processor, /flexible: true/);
  assert.match(discoveryTable, /data-keyword-table="discovery"/);
  assert.match(discoveryTable, /min-w-\[1442px\]/);
  assert.match(discoveryTable, /flexible: true/);
});

test("reordenação e resize continuam separados", () => {
  for (const source of [processor, discoveryTable]) {
    assert.match(source, /KeywordTableDragHandle/);
    assert.match(source, /enabled=\{orderMode === "manual"\}/);
    assert.match(source, /KeywordTableRowResizeHandle rowId=.*enabled/);
  }
});
