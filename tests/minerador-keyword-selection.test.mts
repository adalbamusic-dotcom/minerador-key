import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyKeywordSelectionClick, applyKeywordSelectionPaint, toggleVisibleKeywordSelection } from "../lib/minerador/keyword-selection.ts";

const visible = ["one", "two", "three", "four", "five", "six"];

test("clique comum alterna somente a keyword e atualiza a âncora", () => {
  const result = applyKeywordSelectionClick({ selectedIds: new Set(["one", "three"]), visibleIds: visible, id: "two", anchorId: "one" });
  assert.deepEqual([...result.selectedIds], ["one", "three", "two"]);
  assert.equal(result.anchorId, "two");
});

test("Ctrl/Cmd adiciona e remove uma keyword sem limpar as demais", () => {
  const added = applyKeywordSelectionClick({ selectedIds: new Set(["one"]), visibleIds: visible, id: "five", anchorId: "one", additiveKey: true });
  assert.deepEqual([...added.selectedIds], ["one", "five"]);
  const removed = applyKeywordSelectionClick({ selectedIds: added.selectedIds, visibleIds: visible, id: "five", anchorId: "five", additiveKey: true });
  assert.deepEqual([...removed.selectedIds], ["one"]);
});

test("Shift usa a ordem visual e Ctrl/Cmd+Shift adiciona o intervalo", () => {
  const range = applyKeywordSelectionClick({ selectedIds: new Set(["six"]), visibleIds: visible, id: "four", anchorId: "two", shiftKey: true });
  assert.deepEqual([...range.selectedIds], ["two", "three", "four"]);
  const additiveRange = applyKeywordSelectionClick({ selectedIds: new Set(["six"]), visibleIds: visible, id: "four", anchorId: "two", shiftKey: true, additiveKey: true });
  assert.deepEqual([...additiveRange.selectedIds], ["six", "two", "three", "four"]);
});

test("cabeçalho atua somente sobre visíveis e preserva selecionadas ocultas", () => {
  const selected = new Set(["hidden", "one"]);
  const added = toggleVisibleKeywordSelection(selected, ["one", "two"]);
  assert.deepEqual([...added], ["hidden", "one", "two"]);
  const removed = toggleVisibleKeywordSelection(added, ["one", "two"]);
  assert.deepEqual([...removed], ["hidden"]);
});

test("pintura atualiza imediatamente o intervalo e desfaz o trecho ao voltar", () => {
  const initial = new Set(["hidden"]);
  const forward = applyKeywordSelectionPaint({ initialSelectedIds: initial, visibleIds: visible, anchorId: "two", currentId: "five", mode: "select" });
  assert.deepEqual([...forward], ["hidden", "two", "three", "four", "five"]);
  const backward = applyKeywordSelectionPaint({ initialSelectedIds: initial, visibleIds: visible, anchorId: "two", currentId: "three", mode: "select" });
  assert.deepEqual([...backward], ["hidden", "two", "three"]);
  const erase = applyKeywordSelectionPaint({ initialSelectedIds: new Set(visible), visibleIds: visible, anchorId: "five", currentId: "three", mode: "deselect" });
  assert.deepEqual([...erase], ["one", "two", "six"]);
});

test("workspace mantém checkbox acessível, âncora, arraste e contador de ocultas", async () => {
  const page = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const selectionCell = await readFile(new URL("../modules/minerador/keyword-table/keyword-table-selection.tsx", import.meta.url), "utf8");
  const selectionHook = await readFile(new URL("../modules/minerador/keyword-table/use-keyword-table-selection.ts", import.meta.url), "utf8");
  assert.match(page, /useKeywordTableSelection\(visibleKeywordIds\)/);
  assert.match(selectionCell, /role="checkbox"/);
  assert.match(selectionCell, /aria-checked=\{someSelected \? "mixed"/);
  assert.match(page, /selection\.onSelectionPointerDown/);
  assert.match(selectionCell, /data-keyword-selection-id=\{id\}/);
  assert.match(selectionCell, /data-keyword-selection-handle="true"/);
  assert.match(selectionCell, /touch-none/);
  assert.match(selectionHook, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(selectionHook, /pointerId/);
  assert.match(selectionHook, /document\.addEventListener\("pointermove"/);
  assert.match(selectionHook, /document\.addEventListener\("pointercancel"/);
  assert.match(selectionHook, /window\.addEventListener\("blur"/);
  assert.match(selectionHook, /suppressClickTimerRef/);
  assert.match(selectionHook, /initialSelectedIds: drag\.initial/);
  assert.match(selectionHook, /applyKeywordSelectionPaint\(/);
  assert.match(selectionHook, /drag\.currentId === id/);
  assert.match(selectionHook, /event\.preventDefault\(\)/);
  assert.match(selectionHook, /setPointerCapture\(event\.pointerId\)/);
  assert.doesNotMatch(selectionHook, /cursor-crosshair/);
  assert.match(page, /onPointerDown=\{\(event\) => selection\.onSelectionPointerDown\(item\.id, event\)\}/);
  assert.match(page, /hiddenSelectedCount > 0/);
  assert.match(page, /selection\.toggleVisible\(\)/);
  assert.match(selectionHook, /toggleVisibleKeywordSelection/);
});
