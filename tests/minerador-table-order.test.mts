import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyManualOrder, moveIdBefore, moveIdByOffset, reconcileManualOrderIds } from "../lib/minerador/manual-order.ts";
import { deriveMineradorTableRows } from "../lib/minerador/table-view.ts";

const processor = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const discovery = readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
const resize = readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-resize.tsx", import.meta.url), "utf8");

test("ordem manual preserva IDs, aceita inserção e move antes do alvo", () => {
  assert.deepEqual(reconcileManualOrderIds(["a", "b", "c"], ["c", "c", "gone"]), ["c", "a", "b"]);
  assert.deepEqual(moveIdBefore(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(moveIdByOffset(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(applyManualOrder([{ id: "a" }, { id: "b" }, { id: "c" }], ["c", "a", "b"], item => item.id).map(item => item.id), ["c", "a", "b"]);
});

test("projeção do Processador não aplica ordenação de coluna em modo manual", () => {
  const rows = [
    { id: "a", keyword: "zeta", location: null, results_allintitle: null, volume_search: null, kgr_score: null, intent: null, status: "bruto", lista_id: null },
    { id: "b", keyword: "alfa", location: null, results_allintitle: null, volume_search: null, kgr_score: null, intent: null, status: "bruto", lista_id: null },
  ];
  const visible = deriveMineradorTableRows(rows, [], { searchQuery: "", status: "Todos", intent: "Todos", listId: "Todos", siteRelation: "Todos", siteArchitecture: "Todos", sitePublication: "Todos", kgrApplicability: "Todos", kgrMeasurement: "Todos", volumeEligibility: "Todos", orderMode: "manual", manualOrderIds: ["a", "b"], sortColumn: "keyword", sortDirection: "asc" });
  assert.deepEqual(visible.map(row => row.id), ["a", "b"]);
});

test("as duas planilhas reutilizam o mesmo controller e handle acessível", () => {
  for (const source of [processor, discovery]) {
    assert.match(source, /KeywordTableDragHandle/);
    assert.match(source, /useKeywordTableOrder/);
    assert.match(source, /orderMode === "manual"/);
    assert.match(source, /KeywordTableOrderModeSelect/);
  }
  assert.match(processor, /onDragOver=\{\(event\) => handleKeywordRowDragOver/);
  assert.match(discovery, /onDragOver=\{event => handleCandidateRowDragOver/);
  assert.match(processor, /enabled=\{orderMode === "manual"\}/);
  assert.match(discovery, /enabled=\{orderMode === "manual"\}/);
});

test("as duas planilhas usam arraste por ponteiro e resize compartilhados", () => {
  for (const source of [processor, discovery]) {
    assert.match(source, /KeywordTableColumnResizeHandle/);
    assert.match(source, /KeywordTableRowResizeHandle/);
    assert.match(source, /useKeywordTableColumnResize/);
    assert.match(source, /useKeywordTableRowResize/);
    assert.match(source, /data-keyword-table-row-id/);
    assert.match(source, /onPointerDragStart=\{.*startPointerDragging/);
  }
  assert.match(processor, /<KeywordTableShell scroll="x"(?:\s+className=\{[^}]+\})?>/);
  assert.match(processor, /visualPosition=\{index \+ 1\}/);
  assert.match(processor, /Outros campos do KeywordDNA/);
  assert.doesNotMatch(processor, /JSON\.stringify\(value\)/);
  assert.match(processor, /columnResize\.widths\[columnId\]/);
  assert.match(discovery, /columnResize\.widths\[columnId\]/);
  assert.match(resize, /onMouseDown/);
  assert.match(resize, /cursor-col-resize/);
  assert.match(resize, /cursor-row-resize/);
});
