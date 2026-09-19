import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Publicações usa a GlobalTopbar sem duplicar a barra operacional local", () => {
  const source = readFileSync(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8");

  assert.match(source, /OperationalDataGridTopbarApi/);
  assert.match(source, /GLOBAL_TOPBAR_ACTION_CONTROL/);
  assert.match(source, /topbar=\{\{ moduleId: "publicacoes"/);
  assert.match(source, /renderTopbarActions/);
  assert.match(source, /grid\.exportRows\(grid\.queriedRows, "planilha"\)/);
  assert.match(source, /grid\.toggleColumns/);
  assert.match(source, /grid\.setOrderMode/);
  assert.match(source, /grid\.setPageSize/);
  assert.match(source, /onClick=\{exportManifest\}/);
  /*
   * CORTE 3.5 · `Importar aprovados` era o botão local-first: atualizava a tela
   * e disparava o comando sem esperar a resposta do servidor. A entrada em
   * Publicações passou a ser `sendWriterToPublications`, com readback; a Fila
   * ficou somente leitura.
   */
  assert.doesNotMatch(source, /Importar aprovados/);
  assert.match(source, /Biblioteca/);
  assert.match(source, /Biblioteca/);
  assert.match(source, /Fila/);
  assert.match(source, /Publicados/);
  assert.match(source, /Atualizações/);

  assert.match(source, /useLocalHistory\("publicacoes"/);
  assert.match(source, /<HistoryControls[^>]+moduleId="publicacoes" showHistory=\{false\} showUndoRedo=\{false\}/);
  assert.match(source, /global-topbar-history/);
  assert.match(source, /undoLabel: "Desfazer publicação"/);
  assert.match(source, /redoLabel: "Refazer publicação"/);
  assert.match(source, /historyLabel: "Histórico de Publicações"/);

  assert.doesNotMatch(source, /<OperationalDataGrid[^>]+title="Publicações"/);
  assert.doesNotMatch(source, /<OperationalDataGrid[^>]+description="Biblioteca/);
  assert.doesNotMatch(source, /<OperationalDataGrid[^>]+toolbar=\{/);
  assert.doesNotMatch(source, /const toolbar =/);
  assert.doesNotMatch(source, /router\.(back|forward)\(|window\.history\.(back|forward)\(/);
});

test("Publicações não cria estados paralelos para busca, histórico ou undo/redo", () => {
  const source = readFileSync(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8");

  assert.equal((source.match(/useLocalHistory\(/g) || []).length, 1);
  assert.equal((source.match(/useState\([^\n]*search/gi) || []).length, 0);
  assert.doesNotMatch(source, /setSearch|searchQuery/);
  assert.doesNotMatch(source, /useReducer\([^\n]*(undo|redo|history)/i);
});

/**
 * ===== A NAVEGAÇÃO ENTRE ÁREAS NÃO DEPENDE DA ÁREA ABERTA =====
 *
 * O defeito que este teste trava: o switcher `Biblioteca · Fila · Publicados ·
 * Atualizações` vivia dentro de `renderTopbarActions`, que só é chamado pelo
 * `OperationalDataGrid`. A Biblioteca não é planilha, então o grid não renderiza
 * nela — e como a Biblioteca é a área padrão, ao abrir Publicações as outras
 * três ficavam INALCANÇÁVEIS. Verificado no navegador antes da correção.
 */
test("Publicações alcança as quatro áreas a partir de qualquer uma delas", () => {
  const source = readFileSync(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8");
  const codigo = source.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Um nó só, construído fora do render prop do grid. */
  assert.match(codigo, /const areaTabs = <div[^>]*data-publicacoes-area-tabs/);
  const dentroDasAcoes = codigo.slice(codigo.indexOf("const renderTopbarActions"), codigo.indexOf("return <div className=\"flex h-screen"));
  for (const area of ["Biblioteca", "Fila", "Publicados", "Atualizações"]) {
    assert.ok(!dentroDasAcoes.includes(`"${area}"`), `${area} não pode depender do grid estar renderizado`);
  }

  /* Registrado pelas duas superfícies, que são mutuamente exclusivas. */
  assert.match(codigo, /topbar=\{\{ moduleId: "publicacoes", tabs: areaTabs/);
  assert.match(codigo, /<PublicacoesAreaTabs tabs=\{areaTabs\}\/>/);
  assert.match(codigo, /moduleId: "publicacoes", tabs \}\)/);
  assert.equal((codigo.match(/data-publicacoes-area-tabs/g) || []).length, 1, "o switcher é definido uma vez só");

  /* E a ponte do grid precisa aceitar `tabs` para que isso seja possível. */
  const grid = readFileSync(new URL("../components/editorial/operational-data-grid.tsx", import.meta.url), "utf8");
  assert.match(grid, /tabs\?: React\.ReactNode/);
  assert.match(grid, /tabs=\{topbar\.tabs\}/);
  assert.match(grid, /\.\.\.\(tabs !== undefined \? \{ tabs \} : \{\}\)/);
});

test("a Biblioteca de Publicações tem escopo de entrega, e não de estado do Redator", () => {
  const source = readFileSync(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8");
  const codigo = source.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(codigo, /useState<EditorialLibraryFilter>\(PUBLICATIONS_LIBRARY_DEFAULT_FILTER\)/);
  assert.match(codigo, /PUBLICATIONS_LIBRARY_FILTERS\.map/);
  /* `Rascunho` e `Finalizado` são do Redator; como recorte de Publicações eles
   * traziam para a lista, como item normal, documento nunca recebido. */
  assert.doesNotMatch(codigo, /"TODOS", "RASCUNHO", "FINALIZADO"/);
});
