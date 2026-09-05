import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyArticleSelectionClick,
  applySelectionPaint,
  articleSelectionIdForWorkingArticle,
  resolveWorkingArticleId,
  sameSelectionSet,
  selectionRangeIndices,
  toggleVisibleArticleSelection,
} from "../lib/arquiteto/article-selection.ts";
import { applyCanonicalSiloNames, assignSiloToArticleMembers, canonicalSiloOptions } from "../lib/arquiteto/silo-workspace.ts";

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

test("linhas de artigos usam a identidade persistente da working copy, não keywords ou cluster", () => {
  const initial = { workingArticleId: "working-article-1", clusterId: "cluster-a", keyword: "keyword antiga" };
  const afterKeywordChange = { ...initial, keyword: "keyword nova", clusterId: "cluster-b" };
  const initialId = articleSelectionIdForWorkingArticle(resolveWorkingArticleId(initial));
  const changedId = articleSelectionIdForWorkingArticle(resolveWorkingArticleId(afterKeywordChange));
  assert.equal(initialId, "article-working:working-article-1");
  assert.equal(changedId, initialId);
  assert.notEqual(initialId, articleSelectionIdForWorkingArticle("working-article-2"));
  assert.equal(resolveWorkingArticleId({ articleId: "article-real", clusterId: "cluster-a" }), "article-real");
  assert.equal(resolveWorkingArticleId({ canonicalWorkflow: { id: "workflow-1", articleId: null } }), "workflow-1");
});

test("comparação de Sets evita atualização quando a pintura não muda semanticamente a seleção", () => {
  assert.equal(sameSelectionSet(new Set(["a", "b"]), new Set(["b", "a"])), true);
  assert.equal(sameSelectionSet(new Set(["a"]), new Set(["a", "b"])), false);
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

test("silo canônico vem exclusivamente dos artefatos persistidos e Sem Silo não ganha identidade", () => {
  const silos = canonicalSiloOptions([
    { payload: { siloId: "silo-manicure", name: "Manicure" } },
  ] as any, [
    { payload: { siloId: "silo-manicure", slug: "/manicure" } },
  ] as any);
  assert.deepEqual(silos, [{ id: "silo-manicure", nome: "Manicure", slug: "/manicure" }]);
  assert.deepEqual(canonicalSiloOptions([
    { payload: { siloId: "sem-silo", name: "Sem Silo" } },
  ] as any, [] as any), []);
  assert.deepEqual(canonicalSiloOptions([
    { payload: { siloId: "silo-sem-nome" } },
  ] as any, [
    { payload: { siloId: "silo-sem-nome", slug: "manicure", breadcrumbs: [{ label: "Manicure", slug: "manicure" }], h1: "" } },
  ] as any), [{ id: "silo-sem-nome", nome: "Manicure", slug: "manicure" }]);

  const projected = applyCanonicalSiloNames([
    { id: "kw-real", siloId: "silo-manicure", siloName: "valor obsoleto" },
    { id: "kw-legada", siloId: "lista-sem-artefato", siloName: "não canônico" },
  ], silos);
  assert.deepEqual(projected.map(item => [item.siloId, item.siloName]), [
    ["silo-manicure", "Manicure"],
    [null, null],
  ]);

  const publishedLegacy = applyCanonicalSiloNames([
    { id: "kw-publicado", isPublished: true, siloId: "lista-legada", siloName: "Silo legado" },
  ], silos);
  assert.deepEqual(publishedLegacy.map(item => [item.siloId, item.siloName]), [["lista-legada", "Silo legado"]]);
});

test("movimento individual atualiza somente os membros do artigo alvo", () => {
  const current = [
    { id: "kw-a", siloId: null, silo_id: null, siloName: null },
    { id: "kw-b", siloId: null, silo_id: null, siloName: null },
    { id: "kw-c", siloId: "silo-outro", silo_id: "silo-outro", siloName: "Outro" },
  ];
  const next = assignSiloToArticleMembers(current, new Set(["kw-a", "kw-b"]), { id: "silo-manicure", nome: "Manicure", slug: "/manicure" });
  assert.deepEqual(next.map(item => [item.id, item.siloId, item.siloName]), [
    ["kw-a", "silo-manicure", "Manicure"],
    ["kw-b", "silo-manicure", "Manicure"],
    ["kw-c", "silo-outro", "Outro"],
  ]);
});

test("movimento em lote altera somente os membros dos artigos selecionados", () => {
  const current = [
    { id: "kw-artigo-a", siloId: null },
    { id: "kw-artigo-b", siloId: null },
    { id: "kw-nao-selecionada", siloId: "silo-outro" },
  ];
  const next = assignSiloToArticleMembers(current, new Set(["kw-artigo-a", "kw-artigo-b"]), { id: "silo-manicure", nome: "Manicure", slug: "/manicure" });
  assert.deepEqual(next.map(item => [item.id, item.siloId]), [
    ["kw-artigo-a", "silo-manicure"],
    ["kw-artigo-b", "silo-manicure"],
    ["kw-nao-selecionada", "silo-outro"],
  ]);
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
  assert.match(page, /articleSelectionIdForWorkingArticle\(c\.workingArticleId\)/);
  assert.match(page, /resolveWorkingArticleId\(kw\)/);
  assert.doesNotMatch(page, /articleSelectionIdForCluster/);
  assert.match(page, /toggleVisibleArticleSelection/);
  assert.match(page, /toggleVisibleSiloArticleSelection/);
  assert.match(page, /assignSiloToArticleMembers/);
  assert.match(page, /canonicalSiloOptions/);
  assert.match(page, /confirmSiloAssignmentReadback/);
  assert.match(page, /loadCanonicalArquitetoWorkspace\(selectedBrandId\)/);
  assert.match(page, /ARTIGOS SEM SILO/);
  assert.match(page, /Mover selecionados para Silo/);
  assert.doesNotMatch(page, /Silo: \{group\.siloName\}/);
  assert.match(page, /handleSelectionPointerDown/);
  assert.match(page, /handleSelectionPointerMove/);
  assert.match(page, /setPointerCapture\(drag\.pointerId\)/);
  assert.match(page, /document\.elementFromPoint\(clientX, clientY\)/);
  assert.match(page, /data-article-selection-id/);
  assert.match(page, /initialSelectedIds/);
  assert.match(page, /applySelectionPaint/);
  assert.match(page, /document\.body\.style\.userSelect = "none"/);
  assert.match(page, /releasePointerCapture\(drag\.pointerId\)/);
  assert.match(page, /Math\.hypot\(event\.clientX - drag\.startX, event\.clientY - drag\.startY\) < ARTICLE_SELECTION_DRAG_THRESHOLD/);
  assert.match(page, /role="checkbox"/);
  assert.doesNotMatch(page, /handleSelectionPointerEnter/);
  assert.doesNotMatch(page, /processedIds/);
  assert.match(page, /onPointerCancel=\{onPointerCancel\}/);
  assert.match(page, /onLostPointerCapture=\{onLostPointerCapture\}/);
  assert.match(page, /suppressSelectionClickRef/);
  assert.match(page, /ARTICLE_SELECTION_DRAG_THRESHOLD = 6/);
  assert.match(page, /window\.addEventListener\("pointermove"/);
  assert.match(page, /sameSelectionSet/);
  assert.match(page, /useLayoutEffect/);
  assert.match(page, /architect\.selection\.click-to-commit/);
  assert.match(page, /markSelectionInteraction/);
  assert.match(page, /event\.stopPropagation\(\)/);
  assert.match(page, /headerSelectionRef\.current\.indeterminate/);
  assert.match(page, /aria-checked=\{someVisibleArticlesSelected \? "mixed"/);
  assert.match(page, /hiddenSelectedArticleCount > 0/);
  assert.match(page, /aria-label=\{isPublished/);
  assert.match(page, /data-article-group-selection-id=\{group\.key\}/);
  assert.match(page, /toggleVisibleSiloArticleSelection\(groupArticleIds, "group"\)/);
  assert.match(page, /data-silo-page-selection-id=\{pageEntityId\}/);
  assert.match(page, /Selecionar artigos visíveis do silo/);
  assert.doesNotMatch(page, /ungrouped:/);
});

test("toggle de seleção fica isolado do subárvore pesada e da persistência", async () => {
  const page = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.match(page, /const MemoizedArticleRow = React\.memo/);
  assert.match(page, /const MemoizedArticleSelectionCell = React\.memo/);
  assert.match(page, /previous\.selected === next\.selected/);
  assert.match(page, /selectedArticleIdsRef/);
  assert.match(page, /visibleArticleIdsRef/);

  const revisionStart = page.indexOf("const articleTableRenderRevision");
  const revisionEnd = page.indexOf("]);", revisionStart);
  assert.ok(revisionStart >= 0 && revisionEnd > revisionStart, "revisão da tabela não encontrada");
  const revision = page.slice(revisionStart, revisionEnd);
  assert.doesNotMatch(revision, /\bselectedArticleIds\b/);
  assert.doesNotMatch(revision, /selectedSiloPageIds/);

  const clickStart = page.indexOf("const handleArticleSelectionClick");
  const clickEnd = page.indexOf("const selectArticles", clickStart);
  assert.ok(clickStart >= 0 && clickEnd > clickStart, "handler do clique não encontrado");
  const clickHandler = page.slice(clickStart, clickEnd);
  assert.doesNotMatch(clickHandler, /persistWorkingCopyAssignments|loadCanonicalArquitetoWorkspace|setCanonicalWorkspaceReload|runBackgroundTask|fetch\(/);
  assert.match(clickHandler, /setSelectedArticleIds\(result\.selectedIds\)/);

  const interactionStart = page.indexOf("const handleSelectionPointerDown");
  const interactionEnd = page.indexOf("const handleDeleteSelectedNonPublished", interactionStart);
  assert.ok(interactionStart >= 0 && interactionEnd > interactionStart, "bloco de interação da seleção não encontrado");
  const interactionBlock = page.slice(interactionStart, interactionEnd);
  assert.doesNotMatch(interactionBlock, /fetch\(|persistWorkingCopyAssignments|loadCanonicalArquitetoWorkspace|readBrowserArtifact|callStrategicApi|runBackgroundTask|setAcceptedArticleDnas|setAcceptedSiloDnas|setSerpAssessments|setPendingKeywordReview/);
});
