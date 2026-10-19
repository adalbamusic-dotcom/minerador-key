import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  2026-10-18 · A SELEÇÃO EM LOTE DA PLANILHA DO RADAR SOMA  ======
 *
 * Relato: no navegador, marcar o checkbox de uma linha "substituía" a seleção,
 * e o "selecionar todos", depois de "Limpar seleção", ficava só com a linha
 * focada; por isso o "Enviar ao Redator (N)" nunca passava de 1.
 *
 * Este teste monta a planilha REAL (`OperationalDataGrid`) com as transições
 * REAIS do Radar (`lib/radar/spreadsheet-selection.ts`), ligadas do mesmo jeito
 * que `radar-page.tsx` liga (`bulkSelectedRowIds` derivado de
 * `selectedArticleIds`; `handleBulkSelectionChange` por tipo de mudança), e
 * clica nos checkboxes com `click()` nativo — o gesto do mouse.
 *
 * Guarda: marcar 3 deixa 3; o cabeçalho seleciona todas as visíveis; "Limpar"
 * zera; e o cabeçalho, depois de limpar, volta a selecionar todas.
 */

Object.defineProperty(globalThis, "fetch", {
  value: () => Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")),
  writable: true, configurable: true,
});

const { OperationalDataGrid } = await import("../components/editorial/operational-data-grid.tsx");
const selecao = await import("../lib/radar/spreadsheet-selection.ts");

type Linha = { id: string; articleId: string; title: string };

const LINHAS: Linha[] = Array.from({ length: 5 }, (_, indice) => ({
  id: `row-${indice + 1}`, articleId: `artigo-${indice + 1}`, title: `Artigo ${indice + 1}`,
}));

type Mudanca = { kind: "row"; rowId: string; checked: boolean } | { kind: "visible"; rowIds: string[]; checked: boolean } | { kind: "clear" };

function Planilha() {
  const [estado, setEstado] = React.useState(selecao.createRadarSpreadsheetSelection);
  /* O mesmo cálculo de `radar-page.tsx`. */
  const bulkSelectedRowIds = new Set(LINHAS.filter(row => estado.selectedArticleIds.includes(row.articleId)).map(row => row.id));
  const aoMudar = React.useCallback((_ids: string[], change: Mudanca) => {
    if (change.kind === "clear" || (change.kind === "visible" && !change.checked)) return setEstado(() => selecao.clearSelection());
    if (change.kind === "row") {
      const articleId = LINHAS.find(row => row.id === change.rowId)?.articleId;
      if (articleId) setEstado(current => selecao.setArticleSelection(current, articleId, change.checked));
      return;
    }
    const visiveis = change.rowIds.flatMap(rowId => { const articleId = LINHAS.find(row => row.id === rowId)?.articleId; return articleId ? [articleId] : []; });
    setEstado(current => selecao.selectVisibleArticles(current, visiveis));
  }, []);
  const ativo = estado.activeArticleId ? LINHAS.find(row => row.articleId === estado.activeArticleId)?.id ?? null : null;
  return React.createElement("div", null,
    React.createElement("span", { "data-testid": "estado" }, `selecionados=${estado.selectedArticleIds.length} ativo=${estado.activeArticleId ?? "nenhum"}`),
    React.createElement(OperationalDataGrid as never, {
      module: "radar", userId: "u1", brandId: "b1", rows: LINHAS,
      columns: [{ id: "article", header: "Artigo", value: (row: Linha) => row.title, pinned: "left", width: 280 }],
      bulkSelectedRowIds, onBulkSelectionChange: aoMudar, activeRowId: ativo,
      onRowActivate: (row: Linha) => setEstado(current => selecao.selectAndActivateArticle(current, row.articleId)),
      renderBulkBar: (rows: Linha[]) => React.createElement("span", { "data-testid": "barra" }, `Enviar ao Redator (${rows.length})`),
    }),
  );
}

async function tela() {
  const montada = await montarRadar();
  await montada.render(React.createElement(Planilha));
  const caixas = () => [...montada.container.querySelectorAll('tbody input[type="checkbox"]')] as HTMLInputElement[];
  const cabecalho = () => montada.container.querySelector('thead input[type="checkbox"]') as HTMLInputElement;
  const rodape = () => montada.container.querySelector("footer strong")?.textContent || "";
  const limpar = () => [...montada.container.querySelectorAll("footer button")].find(botao => botao.textContent === "Limpar seleção") as HTMLElement;
  return { ...montada, caixas, cabecalho, rodape, limpar, estado: () => montada.get("estado").textContent || "" };
}

test("seleção em lote · marcar 3 checkboxes deixa 3 selecionados (soma, não substitui)", async () => {
  const t = await tela();
  try {
    await t.click(t.caixas()[0]);
    await t.click(t.caixas()[2]);
    await t.click(t.caixas()[4]);
    assert.deepEqual(t.caixas().map(caixa => caixa.checked), [true, false, true, false, true]);
    assert.match(t.rodape(), /3 selecionado\(s\)/);
    assert.match(t.estado(), /selecionados=3/);
    assert.equal(t.get("barra").textContent, "Enviar ao Redator (3)", "a barra de lote recebe as 3 linhas");
    /* Desmarcar uma tira só ela. */
    await t.click(t.caixas()[2]);
    assert.deepEqual(t.caixas().map(caixa => caixa.checked), [true, false, false, false, true]);
  } finally { t.destroy(); }
});

test("seleção em lote · ativar uma linha soma à seleção, e o checkbox seguinte também", async () => {
  const t = await tela();
  try {
    await t.click(t.caixas()[0]);
    /* Clique na linha (fora do checkbox): ativa e entra na seleção, sem tirar a anterior. */
    await t.click(t.container.querySelectorAll("tbody tr")[1].querySelectorAll("td")[3] as HTMLElement);
    await t.click(t.caixas()[3]);
    assert.deepEqual(t.caixas().map(caixa => caixa.checked), [true, true, false, true, false]);
    assert.match(t.rodape(), /3 selecionado\(s\)/);
  } finally { t.destroy(); }
});

test("seleção em lote · o cabeçalho seleciona todas as visíveis, Limpar zera, e o cabeçalho volta a selecionar todas", async () => {
  const t = await tela();
  try {
    await t.click(t.caixas()[1]);
    await t.click(t.cabecalho());
    assert.ok(t.caixas().every(caixa => caixa.checked), "todas as visíveis marcadas");
    assert.match(t.rodape(), /5 selecionado\(s\)/);

    await t.click(t.limpar());
    assert.ok(t.caixas().every(caixa => !caixa.checked), "Limpar zera");
    assert.match(t.rodape(), /0 selecionado\(s\)/);
    assert.match(t.estado(), /selecionados=0 ativo=nenhum/);

    await t.click(t.cabecalho());
    assert.ok(t.caixas().every(caixa => caixa.checked), "depois de limpar, o cabeçalho seleciona todas, não só a focada");
    assert.match(t.rodape(), /5 selecionado\(s\)/);
    assert.equal(t.get("barra").textContent, "Enviar ao Redator (5)");

    /* Desmarcar o cabeçalho zera também. */
    await t.click(t.cabecalho());
    assert.match(t.rodape(), /0 selecionado\(s\)/);
  } finally { t.destroy(); }
});

test("seleção em lote · a página do Radar continua ligada às mesmas transições", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /const bulkSelectedRowIds = new Set\(pipeline\.radarItems\.filter\(row => selectedArticleIds\.includes\(row\.articleId\)\)\.map\(row => row\.id\)\)/);
  assert.match(pagina, /applySpreadsheetSelection\(current => setArticleSelection\(current, articleId, change\.checked\)\)/);
  assert.match(pagina, /applySpreadsheetSelection\(current => selectVisibleArticles\(current, visibleArticleIds\)\)/);
  assert.match(pagina, /change\.kind === "clear" \|\| \(change\.kind === "visible" && !change\.checked\)\) return applySpreadsheetSelection\(\(\) => clearSelection\(\)\)/);
});
