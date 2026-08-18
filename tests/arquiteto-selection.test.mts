import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyArticleSelectionClick,
  applySelectionPaint,
  selectionRangeIndices,
  toggleVisibleArticleSelection,
} from "../lib/arquiteto/article-selection.ts";

const visible = ["art-a", "art-b", "art-c", "art-d", "art-e", "art-f"];

test("clique comum alterna somente o artigo e preserva os demais", () => {
  const added = applyArticleSelectionClick({
    selectedIds: new Set(["art-a", "art-c"]),
    visibleIds: visible,
    id: "art-b",
    anchorId: "art-a",
  });
  assert.deepEqual([...added.selectedIds], ["art-a", "art-c", "art-b"]);
  assert.equal(added.anchorId, "art-b");

  const removed = applyArticleSelectionClick({
    selectedIds: added.selectedIds,
    visibleIds: visible,
    id: "art-c",
    anchorId: added.anchorId,
  });
  assert.deepEqual([...removed.selectedIds], ["art-a", "art-b"]);
  assert.equal(removed.anchorId, "art-c");
});

test("Ctrl e Cmd alternam individualmente sem limpar selecoes descontiguas", () => {
  const ctrl = applyArticleSelectionClick({
    selectedIds: new Set(["art-a"]),
    visibleIds: visible,
    id: "art-e",
    anchorId: "art-a",
    additiveKey: true,
  });
  assert.deepEqual([...ctrl.selectedIds], ["art-a", "art-e"]);

  const cmd = applyArticleSelectionClick({
    selectedIds: ctrl.selectedIds,
    visibleIds: visible,
    id: "art-e",
    anchorId: ctrl.anchorId,
    additiveKey: true,
  });
  assert.deepEqual([...cmd.selectedIds], ["art-a"]);
});

test("Shift usa a ordem visual, funciona nos dois sentidos e Ctrl/Cmd+Shift adiciona", () => {
  const down = applyArticleSelectionClick({
    selectedIds: new Set(["art-f"]),
    visibleIds: visible,
    id: "art-e",
    anchorId: "art-b",
    shiftKey: true,
  });
  assert.deepEqual([...down.selectedIds], ["art-b", "art-c", "art-d", "art-e"]);

  const up = applyArticleSelectionClick({
    selectedIds: new Set(["art-f"]),
    visibleIds: visible,
    id: "art-b",
    anchorId: "art-e",
    shiftKey: true,
  });
  assert.deepEqual([...up.selectedIds], ["art-b", "art-c", "art-d", "art-e"]);

  const additive = applyArticleSelectionClick({
    selectedIds: new Set(["art-a", "art-f"]),
    visibleIds: visible,
    id: "art-d",
    anchorId: "art-b",
    shiftKey: true,
    additiveKey: true,
  });
  assert.deepEqual([...additive.selectedIds], ["art-a", "art-f", "art-b", "art-c", "art-d"]);
});

test("Shift respeita busca, filtros, ordenacao, silos visiveis e ignora ancora oculta", () => {
  const visualAfterFilterAndSort = ["silo-a-art-2", "silo-a-art-4", "silo-b-art-1", "silo-b-art-3"];
  const range = applyArticleSelectionClick({
    selectedIds: new Set(),
    visibleIds: visualAfterFilterAndSort,
    id: "silo-b-art-3",
    anchorId: "silo-a-art-4",
    shiftKey: true,
  });
  assert.deepEqual([...range.selectedIds], visualAfterFilterAndSort.slice(1));

  const hiddenAnchor = applyArticleSelectionClick({
    selectedIds: new Set(["outside-filter"]),
    visibleIds: ["visible-a", "visible-b"],
    id: "visible-b",
    anchorId: "hidden-anchor",
    shiftKey: true,
  });
  assert.deepEqual([...hiddenAnchor.selectedIds], ["outside-filter", "visible-b"]);
  assert.equal(hiddenAnchor.anchorId, "visible-b");
});

test("checkbox do cabecalho atua somente sobre visiveis e preserva ocultos", () => {
  const selected = new Set(["hidden", "art-a"]);
  const added = toggleVisibleArticleSelection(selected, ["art-a", "art-b"]);
  assert.deepEqual([...added], ["hidden", "art-a", "art-b"]);
  const removed = toggleVisibleArticleSelection(added, ["art-a", "art-b"]);
  assert.deepEqual([...removed], ["hidden"]);
});

test("pintura aplica imediatamente o intervalo e reduz ao voltar", () => {
  const initialSelectedIds = new Set(["hidden", "art-a"]);
  const forward = applySelectionPaint({
    initialSelectedIds,
    visibleIds: visible,
    anchorId: "art-a",
    currentId: "art-d",
    mode: "select",
  });
  assert.deepEqual([...forward], ["hidden", "art-a", "art-b", "art-c", "art-d"]);

  const backward = applySelectionPaint({
    initialSelectedIds,
    visibleIds: visible,
    anchorId: "art-a",
    currentId: "art-b",
    mode: "select",
  });
  assert.deepEqual([...backward], ["hidden", "art-a", "art-b"]);
});

test("pintura iniciada em linha selecionada desmarca durante o gesto", () => {
  const initialSelectedIds = new Set(["hidden", "art-a", "art-b", "art-c", "art-d"]);
  const forward = applySelectionPaint({
    initialSelectedIds,
    visibleIds: visible,
    anchorId: "art-d",
    currentId: "art-a",
    mode: "deselect",
  });
  assert.deepEqual([...forward], ["hidden"]);

  const backward = applySelectionPaint({
    initialSelectedIds,
    visibleIds: visible,
    anchorId: "art-d",
    currentId: "art-c",
    mode: "deselect",
  });
  assert.deepEqual([...backward], ["hidden", "art-a", "art-b"]);
});

test("faixa de arraste usa indices visuais intermediarios nos dois sentidos", () => {
  assert.deepEqual(selectionRangeIndices(1, 4, 6), [1, 2, 3, 4]);
  assert.deepEqual(selectionRangeIndices(4, 1, 6), [4, 3, 2, 1]);
  assert.deepEqual(selectionRangeIndices(-1, 2, 6), []);
});

test("workspace conecta a selecao, Pointer Events, acessibilidade e isolamento por marca", async () => {
  const page = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.match(page, /const lastSelectionAnchorId = useRef<string \| null>\(null\)/);
  assert.match(page, /const \[selectedArticleIds,\s+setSelectedArticleIds\]/);
  assert.match(page, /setSelectedArticleIds\(new Set\(\)\)/);
  assert.match(page, /applyArticleSelectionClick/);
  assert.match(page, /toggleVisibleArticleSelection/);
  assert.match(page, /handleSelectionPointerDown/);
  assert.match(page, /handleSelectionPointerMove/);
  assert.match(page, /setPointerCapture\(event\.pointerId\)/);
  assert.match(page, /document\.elementFromPoint\(clientX, clientY\)/);
  assert.match(page, /data-article-selection-id/);
  assert.match(page, /initialSelectedIds/);
  assert.match(page, /applySelectionPaint/);
  assert.match(page, /document\.body\.style\.userSelect = "none"/);
  assert.match(page, /releasePointerCapture\(drag\.pointerId\)/);
  assert.match(page, /Math\.hypot\(event\.clientX - drag\.startX, event\.clientY - drag\.startY\) < 4/);
  assert.match(page, /role="checkbox"/);
  assert.doesNotMatch(page, /handleSelectionPointerEnter/);
  assert.doesNotMatch(page, /processedIds/);
  assert.match(page, /onPointerCancel=\{event => finishSelectionDrag/);
  assert.match(page, /onLostPointerCapture=\{event => finishSelectionDrag/);
  assert.match(page, /suppressSelectionClickRef/);
  assert.match(page, /headerSelectionRef\.current\.indeterminate/);
  assert.match(page, /aria-checked=\{someVisibleArticlesSelected \? "mixed"/);
  assert.match(page, /hiddenSelectedArticleCount > 0/);
  assert.match(page, /aria-label=\{art\.isPublished/);
});
