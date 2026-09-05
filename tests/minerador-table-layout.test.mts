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
    "Vínculo",
    "Resultados",
    "Volume",
    "KGR",
    "CPC",
    "KD",
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
  assert.match(page, /style=\{\{ minWidth: processorTableMinimumWidth \}\} className="w-full table-fixed/);
  assert.match(page, /readCanonicalKeywordDna\(item\)/);
  assert.match(page, /primaryKeywordPolicyLabel\(primaryKeywordPolicy\)/);
  assert.match(page, /colSpan=\{15\}/);
});

test("keyword ocupa a maior coluna, com URL real abaixo e vínculo separado", async () => {
  const page = await readTablePage();
  const keywordCellStart = page.indexOf("{/* Palavra */}");
  const vinculoCellStart = page.indexOf("{/* Vínculo de publicação", keywordCellStart);
  const keywordCell = page.slice(keywordCellStart, vinculoCellStart);

  assert.match(keywordCell, /break-words/);
  assert.match(keywordCell, /URL publicada não lida/);
  assert.doesNotMatch(keywordCell, /primaryKeywordPolicyLabel/);
  assert.doesNotMatch(keywordCell, /max-w-xs truncate/);
  assert.match(page, /className="w-\[128px\][\s\S]*?text-center/);
  assert.match(page, /keywordReadModel\.funnelLabel/);
});

test("larguras evitam compressão e mantêm dados informativos sem editores semânticos", async () => {
  const page = await readTablePage();

  for (const width of ["70px", "80px", "88px", "96px", "108px", "120px", "128px", "168px"]) {
    assert.match(page, new RegExp(`w-\\[${width}\\]`));
  }
  assert.match(page, /Nicho de mercado/);
  assert.match(page, /keywordReadModel\.nicheLabel/);
  assert.doesNotMatch(page, /handleUpdateNiche/);
  assert.doesNotMatch(page, /<option value="">Não informado<\/option>/);
  assert.doesNotMatch(page, /onChange=\{\(e\) => handleUpdateNiche/);
  assert.match(page, /KeywordTableShell/);
});

test("qualificação mantém o contador separado e o select de silo compacto", async () => {
  const page = await readTablePage();

  assert.match(page, /<span className="hidden lg:inline">Lógica<\/span>/);
  assert.doesNotMatch(page, /Qualificar \$\{selectedIds\.size\}/);
  assert.match(page, /<span className="font-semibold text-foreground">\{selectedIds\.size\}<\/span>/);
  assert.match(page, /<span>selecionada\{selectedIds\.size === 1 \? "" : "s"\}<\/span>/);
  assert.match(page, /disabled=\{bulkActionProcessing \|\| updating \|\| queueProcessing \|\| dnaProcessing \|\| loading \|\| selectedIds\.size === 0\}/);
  assert.match(page, /const selectedListName = lists\.find\(list => list\.id === item\.lista_id\)\?\.nome \|\| "Sem Silo\/Categoria"/);
  assert.match(page, /const mineradorTableSelectClass = "border border-divider bg-surface-subtle rounded px-1\.5 py-0\.5 text-\[10px\] font-bold focus:outline-none cursor-pointer w-full truncate/);
  assert.match(page, /className=\{`\$\{mineradorTableSelectClass\} text-center/);
  assert.match(page, /className=\{`\$\{mineradorTableSelectClass\} text-center text-foreground\/80/);
  assert.doesNotMatch(page, /group relative inline-flex min-h-8 min-w-44/);
  assert.doesNotMatch(page, /appearance-none rounded opacity-0/);
  assert.match(page, /aria-label="Silo\/Categoria"/);
  assert.match(page, /onChange=\{\(e\) => handleUpdateKeywordList\(item\.id, e\.target\.value\)\}/);
  assert.match(page, /onChange=\{\(e\) => handleUpdateStatus\(item\.id, e\.target\.value\)\}/);
  assert.match(page, /<td className="w-\[168px\][\s\S]*?<\/td>[\s\S]*?Status Dropdown/);
});

test("estado de funil sem dado permanece neutro e não é inferido", async () => {
  const page = await readTablePage();
  const funnelCellStart = page.indexOf('className="w-[80px]');
  const funnelCell = page.slice(funnelCellStart, page.indexOf("</td>", funnelCellStart));
  assert.match(page, /function funnelLabelFor[\s\S]*?keywordReadModel\.funnelLabel/);
  assert.match(page, /keywordReadModel\.funnelLabel/);
  assert.doesNotMatch(funnelCell, /<select/);
});

test("Funil exibe InfoHint visível com a legenda das três etapas", async () => {
  const page = await readTablePage();
  const funnelHeaderStart = page.indexOf('label="Funil"');
  const funnelHeader = page.slice(funnelHeaderStart - 260, funnelHeaderStart + 520);

  assert.match(funnelHeader, /info=\{<span[\s\S]*?<InfoHint/);
  assert.match(funnelHeader, /title="Etapa provável da jornada"/);
  assert.match(funnelHeader, /TOFU é o topo do funil: descoberta e buscas amplas/);
  assert.match(funnelHeader, /MOFU é o meio: consideração e comparação/);
  assert.match(funnelHeader, /BOFU é o fundo: busca mais próxima de contratar/);
});
