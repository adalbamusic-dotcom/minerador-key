import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const search = await readFile(new URL("../modules/minerador/discovery/discovery-search-row.tsx", import.meta.url), "utf8");
const filters = await readFile(new URL("../modules/minerador/discovery/discovery-filter-row.tsx", import.meta.url), "utf8");
const table = await readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");

test("barras superiores do Descobrir recebem respiro horizontal responsivo", () => {
  assert.match(search, /<section className="min-w-0 w-full max-w-full border-b border-divider px-3 py-4 sm:px-4 xl:px-6"/);
  assert.match(filters, /<section className="flex flex-wrap gap-2 border-b border-divider px-3 py-4 sm:px-4 xl:px-6"/);
  assert.doesNotMatch(search, /<section[^>]*overflow-x-(?:auto|scroll)/);
  assert.doesNotMatch(filters, /<section[^>]*overflow-x-(?:auto|scroll)/);
});

test("o espaçamento não altera handlers nem a planilha da Descoberta", () => {
  assert.match(filters, /onDiscover/);
  assert.match(filters, /onClear/);
  assert.match(filters, /setActiveFilterPopover/);
  assert.doesNotMatch(filters, /fetch\s*\(/);
  // 2026-09-24, pedido do dono: cabeçalho fixo e Keyword nunca cortada. O shell rola
  // nos dois eixos e a tabela usa layout automático (o min-w-[1442px] já tinha saído antes).
  assert.match(table, /<KeywordTableShell ref=\{tableRef\} scroll="both"/);
  assert.match(table, /data-keyword-table="discovery"/);
  assert.doesNotMatch(table, /table-fixed/);
  assert.doesNotMatch(table, /min-w-\[1442px\]/);
});
