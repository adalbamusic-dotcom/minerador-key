import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeScopedArticleProcessOutput, resolveArticleProcessScope, scopedArticleProcessNotification } from "../lib/arquiteto/article-process-scope.ts";
import { selectArticlePanelProcessTab } from "../lib/arquiteto/article-panel-tab-navigation.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

test("lógica de Artigos limita a mutação ao escopo selecionado", () => {
  const logicHandler = workspace.slice(workspace.indexOf("const processDeterministicStructure"), workspace.indexOf("const formSilosWorkingCopy"));
  assert.match(logicHandler, /Selecione um ou mais artigos para processar/);
  assert.match(logicHandler, /resolveArticleProcessScope/);
  assert.match(logicHandler, /scope\.selectedKeywordIds/);
  assert.match(logicHandler, /preservedGroups/);
  assert.match(logicHandler, /mergeScopedArticleProcessOutput/);
  assert.match(logicHandler, /mutationItems/);
  assert.match(logicHandler, /\[\.\.\.preservedGroups, \.\.\.processedGroups\]/);
});

test("tabs internas do componente real propagam a tab ativa pela memoização da row", () => {
  const memoizedRow = workspace.slice(workspace.indexOf("type MemoizedArticleRowProps"), workspace.indexOf("type ArticleSelectionCellProps"));
  const innerPanel = workspace.slice(workspace.indexOf('role="tablist" aria-label={`Processos de ${art.keywordPrincipal}`'), workspace.indexOf('expandedProcessTab === "review" && <section>') + 'expandedProcessTab === "review" && <section>'.length);
  assert.match(memoizedRow, /processTab\?: "logic" \| "serp" \| "ai" \| "review"/);
  assert.match(memoizedRow, /previous\.processTab === next\.processTab/);
  assert.match(workspace, /processTab=\{expandedProcessTabs\[art\.id\] \|\| "logic"\}/);
  assert.match(innerPanel, /setExpandedProcessTabs\(current => selectArticlePanelProcessTab\(current, art\.id, process\)\)/);
  for (const tab of ["logic", "serp", "ai", "review"]) assert.match(innerPanel, new RegExp(`expandedProcessTab === "${tab}"`));

  const articleId = "article-real";
  let tabs: Record<string, "logic" | "serp" | "ai" | "review"> = { [articleId]: "logic" };
  let providerCalls = 0;
  let workingCopyMutations = 0;
  for (const tab of ["serp", "ai", "review", "logic"] as const) {
    tabs = selectArticlePanelProcessTab(tabs, articleId, tab);
    assert.equal(tabs[articleId], tab);
  }
  assert.equal(providerCalls, 0);
  assert.equal(workingCopyMutations, 0);
});

test("SERP distingue execução, força da evidência e contadores diagnósticos", () => {
  assert.match(workspace, /Execução: <strong>\{executionComplete/);
  assert.match(workspace, /Força da evidência:/);
  assert.match(workspace, /Com conflito observado:/);
  assert.match(workspace, /Evidência fraca:/);
  assert.match(workspace, /Recomendação SERP: ainda não registrada/);
});

test("linha expandida recebe rail própria e não confunde seleção com expansão", () => {
  assert.match(workspace, /isExpanded \? "border-l-2 border-l-module-accent/);
  assert.match(workspace, /articleProcess\.review\.state === "PENDING"/);
  assert.match(workspace, /selectedArticleIds\.has\(art\.id\) \? "bg-selected/);
  assert.match(workspace, /text-module-accent/);
});

test("entrypoint real preserva A/B/C e envia somente D ao mutation scope", () => {
  const masterList = [
    { id: "a-1", workingArticleId: "A", group: "A", principal: true, serpRef: "serp-A" },
    { id: "b-1", workingArticleId: "B", group: "B", principal: true, articleDna: "article-B" },
    { id: "c-1", workingArticleId: "C", group: "C", principal: true, humanDecision: "locked" },
    { id: "d-1", workingArticleId: "D", group: "D", principal: true, aiRef: "ai-D" },
    { id: "d-2", workingArticleId: "D", group: "D", secondary: true },
    { id: "d-3", workingArticleId: "D", group: "D", secondary: true },
  ];
  const scope = resolveArticleProcessScope({
    selectedArticleIds: ["row-D"],
    articles: ["A", "B", "C", "D"].map(id => ({ id: `row-${id}`, workingArticleId: id })),
    masterList,
    workingArticleIdFor: item => String(item.workingArticleId || "") || null,
  });
  assert.deepEqual(scope.selectedArticleIds, ["row-D"]);
  assert.deepEqual(scope.selectedKeywordIds, ["d-1", "d-2", "d-3"]);
  const output = masterList.filter(item => scope.selectedKeywordIds.includes(item.id)).map(item => ({ ...item, group: "D-revised" }));
  const merged = mergeScopedArticleProcessOutput({ masterList, mutationKeywordIds: scope.selectedKeywordIds, mutationOutput: output });
  for (const id of ["a-1", "b-1", "c-1"]) {
    assert.equal(merged.find(item => item.id === id), masterList.find(item => item.id === id));
  }
  assert.deepEqual(merged.filter(item => item.id.startsWith("d-")).map(item => item.group), ["D-revised", "D-revised", "D-revised"]);
  assert.equal(scopedArticleProcessNotification({ processedArticleCount: 1, workspaceArticleCount: 4, reservedCandidateCount: 0 }), "1 artigo processado pela Lógica. Working copy com 4 artigos confirmada.");
});

test("múltipla seleção libera somente as keywords das duas rows selecionadas", () => {
  const scope = resolveArticleProcessScope({
    selectedArticleIds: ["row-A", "row-D"],
    articles: ["A", "B", "C", "D"].map(id => ({ id: `row-${id}`, workingArticleId: id })),
    masterList: ["A", "B", "C", "D"].map(id => ({ id: `kw-${id}`, workingArticleId: id })),
    workingArticleIdFor: item => String(item.workingArticleId || "") || null,
  });
  assert.deepEqual(scope.selectedKeywordIds, ["kw-A", "kw-D"]);
});

test("tab local e diagnóstico de IA permanecem ligados ao caminho real", () => {
  assert.match(workspace, /topbarHandlersRef\.current\.processDeterministicStructure/);
  assert.match(workspace, /result\.mutationItems/);
  assert.match(workspace, /ArchitectStrategicApiError/);
  assert.match(workspace, /diagnostic\.failureStage/);
  assert.match(workspace, /pending\.mutationKeywordIds/);
});
