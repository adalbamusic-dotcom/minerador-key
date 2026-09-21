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
    "Status",
  ];
  const positions = labels.map((label) => header.indexOf(label));

  assert.ok(tableStart >= 0);
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(page, /style=\{\{ minWidth: processorTableMinimumWidth \}\} className="w-full table-fixed/);
  assert.match(page, /readCanonicalKeywordDna\(item\)/);
  assert.match(page, /primaryKeywordPolicyLabel\(primaryKeywordPolicy\)/);
  assert.match(page, /colSpan=\{14\}/);
});

test("a planilha não organiza silo: isso é etapa do Arquiteto", async () => {
  /*
   * A coluna Silo/Categoria foi removida em 2026-09-21. Silo é decisão de
   * arquitetura, tomada no Arquiteto sobre o conjunto aprovado; um editor por
   * linha aqui competia com aquela etapa e confundia a triagem.
   *
   * `lista_id` NÃO sumiu: ele filtra o carregamento, é destino da importação
   * e alimenta o movimento em lote — organização de trabalho, não
   * arquitetura. O que saiu foi o editor por linha.
   */
  const page = await readTablePage();

  assert.doesNotMatch(page, /aria-label="Silo\/Categoria"/, "sem editor de silo na linha");
  assert.doesNotMatch(page, /handleUpdateKeywordList/, "e sem o handler que só ele usava");
  assert.doesNotMatch(page, /columnId="silo"/, "nem alça de redimensionamento");

  // O cabeçalho é `<KeywordTableHeader>`, não `<thead>`: fatiar por `</thead>`
  // devolve -1 e a fatia vira o arquivo inteiro, onde "Sem Silo/Categoria"
  // ainda aparece no nome da lista. A asserção passaria a medir nada.
  const tableStart = page.indexOf("<table");
  const fimCabecalho = page.indexOf("</KeywordTableHeader>", tableStart);
  assert.ok(fimCabecalho > tableStart, "o cabeçalho da tabela foi localizado");
  const header = page.slice(tableStart, fimCabecalho);
  assert.doesNotMatch(header, /Silo\/Categoria/, "o cabeçalho não anuncia a coluna");

  // A célula expandida atravessa a tabela inteira: uma coluna a menos tem de
  // aparecer aqui, ou o Perfil desalinha.
  const celulas = (page.slice(page.indexOf("<tbody"), page.indexOf("colSpan={14}")).match(/<td[\s>]/g) || []).length;
  assert.equal(celulas, 14, "o colSpan acompanha o número de células da linha");

  // O lote do rodapé saiu junto, no mesmo dia e pela mesma razão: aqui não
  // se mexe em silo, só se declara o tipo de página que a keyword é ou pode
  // vir a ser.
  assert.doesNotMatch(page, /handleBatchMove/, "sem mover para silo em lote");
  assert.doesNotMatch(page, /Mover para Silo/, "nem o controle no rodapé");

  // O que continua: `lista_id` como destino de importação e filtro de carga.
  assert.match(page, /lista_id\.is\.null/, "o carregamento segue filtrando por lista");
  assert.match(page, /targetListId: targetListId \|\| null/, "e a importação segue tendo destino");
});

test("keyword ocupa a maior coluna, com URL real abaixo e vínculo separado", async () => {
  const page = await readTablePage();
  const keywordCellStart = page.indexOf("{/* Palavra */}");
  const vinculoCellStart = page.indexOf("{/* Vínculo", keywordCellStart);
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

test("qualificação mantém o contador separado", async () => {
  const page = await readTablePage();

  assert.match(page, /<span className="hidden lg:inline">Lógica<\/span>/);
  assert.doesNotMatch(page, /Qualificar \$\{selectedIds\.size\}/);
  assert.match(page, /<span className="font-semibold text-foreground">\{selectedIds\.size\}<\/span>/);
  assert.match(page, /<span>selecionada\{selectedIds\.size === 1 \? "" : "s"\}<\/span>/);
  assert.match(page, /disabled=\{bulkActionProcessing \|\| updating \|\| queueProcessing \|\| dnaProcessing \|\| loading \|\| selectedIds\.size === 0\}/);

  // O nome da lista continua sendo resolvido: o painel do DNA o mostra como
  // "Lista/Silo atual" no contexto publicado, mesmo sem a coluna na planilha.
  assert.match(page, /const selectedListName = lists\.find\(list => list\.id === item\.lista_id\)\?\.nome \|\| "Sem Silo\/Categoria"/);
  assert.match(page, /listName: selectedListName/);

  assert.doesNotMatch(page, /group relative inline-flex min-h-8 min-w-44/);
  assert.doesNotMatch(page, /appearance-none rounded opacity-0/);
  // A coluna Status informa; escrever é papel da barra do rodapé e do card
  // do DNA (SDD dos três eixos, 2026-09-20).
  assert.doesNotMatch(page, /onChange=\{\(e\) => handleUpdateStatus\(item\.id, e\.target\.value\)\}/);
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
