import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function readTablePage() {
  return readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
}

test("tabela do Minerador preserva a ordem operacional das colunas", async () => {
  const page = await readTablePage();
  const tableStart = page.indexOf("<table");
  const header = page.slice(tableStart, page.indexOf("</thead>", tableStart));
  const labels = [
    "Palavra-Chave",
    "Principal",
    "Resultados",
    "Volume",
    "KGR",
    "Intenção",
    "Nicho de mercado",
    "Funil",
    "Silo/Categoria",
    "Status",
  ];
  const positions = labels.map((label) => header.indexOf(label));

  assert.ok(tableStart >= 0);
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(page, /min-w-\[110rem\] table-fixed/);
  assert.match(page, /funnelLabelFor\(item\)/);
  assert.match(page, /primaryKeywordPolicyLabel\(primaryKeywordPolicy\)/);
  assert.match(page, /colSpan=\{12\}/);
});

test("keyword ocupa a maior coluna, com canonical abaixo e principal separada", async () => {
  const page = await readTablePage();
  const keywordCellStart = page.indexOf("{/* Palavra */}");
  const principalCellStart = page.indexOf("{/* Política da principal */}", keywordCellStart);
  const keywordCell = page.slice(keywordCellStart, principalCellStart);

  assert.match(keywordCell, /break-words/);
  assert.match(keywordCell, /Canonical publicado fixo/);
  assert.doesNotMatch(keywordCell, /primaryKeywordPolicyLabel/);
  assert.doesNotMatch(keywordCell, /max-w-xs truncate/);
  assert.match(page, /className="w-\[128px\] py-1 px-3 text-center/);
  assert.match(page, /extensionFunnelHints\(semantic\)/);
});

test("larguras evitam compressão e mantêm selects e textos alinhados", async () => {
  const page = await readTablePage();

  for (const width of ["80px", "88px", "128px", "136px", "168px", "216px", "120px"]) {
    assert.match(page, new RegExp(`w-\\[${width}\\]`));
  }
  assert.match(page, /Nicho de mercado/);
  assert.match(page, /value=\{item\.analise_semantica\?\.nicho_override \|\| "Geral"\}[\s\S]*?w-full/);
  assert.match(page, /KeywordTableShell/);
});

test("qualificação mantém o contador separado e o select de silo compacto", async () => {
  const page = await readTablePage();

  assert.match(page, /<span>Qualificar selecionadas<\/span>/);
  assert.doesNotMatch(page, /Qualificar \$\{selectedIds\.size\}/);
  assert.match(page, /<span>\{selectedIds\.size\} selecionada/);
  assert.match(page, /disabled=\{updating \|\| queueProcessing \|\| dnaProcessing \|\| loading \|\| selectedIds\.size === 0\}/);
  assert.match(page, /const selectedListName = lists\.find\(list => list\.id === item\.lista_id\)\?\.nome \|\| "Sem Silo\/Categoria"/);
  assert.match(page, /const mineradorTableSelectClass = "bg-\[#06070a\] border rounded px-1\.5 py-0\.5 text-\[10px\] font-bold focus:outline-none cursor-pointer w-full truncate"/);
  assert.match(page, /className=\{`\$\{mineradorTableSelectClass\} text-center/);
  assert.match(page, /className=\{`\$\{mineradorTableSelectClass\} text-center text-slate-500 border-slate-900 bg-slate-950/);
  assert.doesNotMatch(page, /group relative inline-flex min-h-8 min-w-44/);
  assert.doesNotMatch(page, /appearance-none rounded opacity-0/);
  assert.match(page, /aria-label="Silo\/Categoria"/);
  assert.match(page, /onChange=\{\(e\) => handleUpdateKeywordList\(item\.id, e\.target\.value\)\}/);
  assert.match(page, /<td className="w-\[216px\][\s\S]*?<\/td>[\s\S]*?Status Dropdown/);
});

test("estado de funil sem dado permanece neutro e não é inferido", async () => {
  const page = await readTablePage();
  assert.match(page, /return hints\.join\(" \/ "\) \|\| "—"/);
  assert.match(page, /funnel_review_required === "sim"/);
});
