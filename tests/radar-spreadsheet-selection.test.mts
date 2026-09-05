import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSelectionInvariant,
  clearSelection,
  createRadarSpreadsheetSelection,
  selectAndActivateArticle,
  selectVisibleArticles,
  setArticleSelection,
} from "../lib/radar/spreadsheet-selection.ts";

test("selecionar por checkbox seleciona e ativa o mesmo artigo", () => {
  const result = setArticleSelection(createRadarSpreadsheetSelection(), "article-a", true);
  assert.deepEqual(result, { selectedArticleIds: ["article-a"], activeArticleId: "article-a" });
  assert.deepEqual(assertSelectionInvariant(result), result);
});

test("multiseleção mantém todos os checks e a linha acionada vira o artigo ativo", () => {
  const withA = setArticleSelection(createRadarSpreadsheetSelection(), "article-a", true);
  const withB = setArticleSelection(withA, "article-b", true);
  const withC = setArticleSelection(withB, "article-c", true);
  assert.deepEqual(withC, { selectedArticleIds: ["article-a", "article-b", "article-c"], activeArticleId: "article-c" });

  const rowA = selectAndActivateArticle(withC, "article-a");
  assert.deepEqual(rowA, { selectedArticleIds: ["article-a", "article-b", "article-c"], activeArticleId: "article-a" });
});

test("desmarcar artigo não ativo preserva o Workbench e desmarcar ativo escolhe o último restante", () => {
  const start = { selectedArticleIds: ["article-a", "article-b", "article-c"], activeArticleId: "article-a" };
  const withoutB = setArticleSelection(start, "article-b", false);
  assert.deepEqual(withoutB, { selectedArticleIds: ["article-a", "article-c"], activeArticleId: "article-a" });

  const activeC = selectAndActivateArticle(withoutB, "article-c");
  const withoutC = setArticleSelection(activeC, "article-c", false);
  assert.deepEqual(withoutC, { selectedArticleIds: ["article-a"], activeArticleId: "article-a" });
  assert.deepEqual(setArticleSelection(withoutC, "article-a", false), clearSelection());
});

test("seleção de cabeçalho preserva ativo selecionado e escolhe artigo determinístico quando necessário", () => {
  const first = selectVisibleArticles(createRadarSpreadsheetSelection(), ["article-a", "article-b"]);
  assert.deepEqual(first, { selectedArticleIds: ["article-a", "article-b"], activeArticleId: "article-a" });

  const withActiveB = selectAndActivateArticle(first, "article-b");
  assert.deepEqual(selectVisibleArticles(withActiveB, ["article-a", "article-c"]), {
    selectedArticleIds: ["article-a", "article-b", "article-c"],
    activeArticleId: "article-b",
  });
});

test("a invariante rejeita Workbench vazio para check ativo e foco sem checkbox", () => {
  assert.throws(
    () => assertSelectionInvariant({ selectedArticleIds: ["article-a"], activeArticleId: null }),
    /precisa manter um artigo ativo/,
  );
  assert.throws(
    () => assertSelectionInvariant({ selectedArticleIds: [], activeArticleId: "article-a" }),
    /precisa permanecer selecionado/,
  );
  assert.throws(
    () => assertSelectionInvariant({ selectedArticleIds: ["article-b"], activeArticleId: "article-a" }),
    /precisa permanecer selecionado/,
  );
});
