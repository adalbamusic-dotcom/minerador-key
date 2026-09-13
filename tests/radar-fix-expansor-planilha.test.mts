import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  FIX · O EXPANSOR DA LINHA DA PLANILHA  =======================
 *
 * Depois da homologação da Fase 1, o chevron da linha "não abria o detalhe".
 *
 * O HANDLER ESTAVA CERTO O TEMPO TODO. Renderizei a planilha real no DOM e o
 * clique abria; renderizei-a num navegador de verdade, com o CSS de verdade, e
 * o clique no BOTÃO também abria. O que não abria era o clique em quase toda a
 * área onde o chevron aparenta estar:
 *
 *   célula do expansor .... 29,3 × 34,0 px
 *   botão ................. 12,0 × 12,0 px  →  12% da célula
 *   zona morta ............ 8,9px esquerda · 8,4px direita · 9px topo · 13px base
 *
 * Medido num navegador real: um clique 3px dentro da célula, fora do botão,
 * atinge o `<td>`, sobe até o `onClick` do `<tr>` — cujo guarda
 * `target.closest("button, input, a, …")` não casa, porque um `td` não é
 * botão — e a linha é ATIVADA em vez de expandida. O usuário mira no chevron,
 * a linha seleciona, e nada abre. Depois da correção: botão 28,8 × 28,0 (81%
 * da célula), cobrindo todos os pontos que antes caíam no vazio.
 *
 * Nada aqui toca Pesquisa, bundle congelado, blueprint, pautas, status
 * operacional, provider ou persistência: o alvo é o tamanho de um botão.
 *
 * `happy-dom` não calcula layout, então a geometria é travada pelas classes
 * que a produzem — os pixels acima foram medidos no navegador. O
 * comportamento (abre, fecha, não seleciona) é exercido com cliques reais.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const { OperationalDataGrid } = await import("../components/editorial/operational-data-grid.tsx");

type Linha = { id: string; articleId: string; title: string; pesquisa: string };

const LINHAS: Linha[] = [
  { id: "row-1", articleId: "artigo-1", title: "Skincare para pele oleosa", pesquisa: "Pesquisa finalizada" },
  { id: "row-2", articleId: "artigo-2", title: "Rotina noturna", pesquisa: "Não iniciada" },
];

/** O que a planilha do Radar faz com cada evento, registrado para conferência. */
type Diario = { ativadas: string[]; selecionadas: string[][]; pesquisaLida: number };

function montarPlanilha(diario: Diario) {
  return function Planilha() {
    const [expandido, setExpandido] = React.useState<string | null>(null);
    const [ativo, setAtivo] = React.useState<string | null>(null);
    const [selecionados, setSelecionados] = React.useState<ReadonlySet<string>>(new Set());

    return React.createElement("div", null,
      React.createElement("span", { "data-testid": "estado" },
        `expandido=${expandido ?? "nenhum"} ativo=${ativo ?? "nenhum"} selecionados=${[...selecionados].join(",") || "nenhum"}`),
      React.createElement(OperationalDataGrid as never, {
        module: "radar", userId: "u1", brandId: "b1", rows: LINHAS,
        columns: [
          { id: "article", header: "Artigo", value: (row: Linha) => row.title, pinned: "left", sortable: true, width: 280 },
          /* A coluna Pesquisa registra cada leitura: expandir não pode mexer nela. */
          { id: "research", header: "Pesquisa", value: (row: Linha) => { diario.pesquisaLida += 1; return row.pesquisa; }, width: 200 },
        ],
        expandedRowId: expandido,
        onExpandedRowChange: (id: string | null) => setExpandido(id),
        bulkSelectedRowIds: selecionados,
        onBulkSelectionChange: (ids: string[]) => { diario.selecionadas.push(ids); setSelecionados(new Set(ids)); },
        activeRowId: ativo,
        onRowActivate: (row: Linha) => { diario.ativadas.push(row.id); setAtivo(row.id); },
        renderExpanded: (row: Linha) => React.createElement("div", { "data-testid": `detalhe-${row.articleId}` }, `perfil de ${row.articleId}`),
      }),
    );
  };
}

async function tela() {
  const diario: Diario = { ativadas: [], selecionadas: [], pesquisaLida: 0 };
  const montada = await montarRadar();
  await montada.render(React.createElement(montarPlanilha(diario)));
  const chevrons = () => [...montada.container.querySelectorAll('button[aria-label$="detalhes"]')] as HTMLElement[];
  return {
    ...montada, diario, chevrons,
    estado: () => montada.get("estado").textContent || "",
    detalhe: (articleId: string) => montada.query(`detalhe-${articleId}`),
  };
}

/* ==========  A e B · ABRE NO PRIMEIRO CLIQUE, FECHA NO SEGUNDO  ====== */

test("FIX expansor · A e B — clique abre o detalhe, segundo clique fecha", async () => {
  const t = await tela();
  try {
    const chevron = t.chevrons()[0];
    assert.ok(chevron, "o botão do expansor existe na linha");
    assert.equal(chevron.getAttribute("aria-label"), "Abrir detalhes");
    assert.equal(t.detalhe("artigo-1"), null, "nada aberto antes do clique");

    await t.click(chevron);
    assert.match(t.estado(), /expandido=row-1/, "A · o detalhe abriu");
    assert.ok(t.detalhe("artigo-1"), "e o conteúdo expandido foi renderizado");
    assert.equal(t.chevrons()[0].getAttribute("aria-label"), "Fechar detalhes", "o rótulo acompanha o estado");

    await t.click(t.chevrons()[0]);
    assert.match(t.estado(), /expandido=nenhum/, "B · o segundo clique fechou");
    assert.equal(t.detalhe("artigo-1"), null, "e o conteúdo saiu do DOM — não foi só escondido");
  } finally { t.destroy(); }
});

test("FIX expansor · só uma linha por vez, e cada linha abre a sua", async () => {
  const t = await tela();
  try {
    await t.click(t.chevrons()[0]);
    assert.ok(t.detalhe("artigo-1"));
    assert.equal(t.detalhe("artigo-2"), null);

    await t.click(t.chevrons()[1]);
    assert.match(t.estado(), /expandido=row-2/);
    assert.ok(t.detalhe("artigo-2"), "a segunda linha abre a sua");
    assert.equal(t.detalhe("artigo-1"), null, "e a primeira fecha");
  } finally { t.destroy(); }
});

/* ==========  C · O CHECKBOX SELECIONA SEM ABRIR  ==================== */

test("FIX expansor · C — o checkbox seleciona e não abre; o expansor abre e não seleciona", async () => {
  const t = await tela();
  try {
    const caixa = t.container.querySelector('tbody input[type="checkbox"]') as HTMLElement;
    assert.ok(caixa, "o checkbox da linha existe");

    /*
     * UM CLIQUE, NÃO UM `change` FABRICADO.
     *
     * Para caixas de seleção o React deriva `onChange` do evento de CLIQUE, não
     * de um `change` sintético — e `caixa.checked = true` ainda atravessaria o
     * rastreador que ele instala sobre a propriedade. `click()` é o gesto real:
     * o navegador alterna o estado e emite o evento que o React escuta.
     */
    await t.click(caixa);
    assert.match(t.estado(), /selecionados=row-1/, "o checkbox selecionou");
    assert.match(t.estado(), /expandido=nenhum/, "C · e não abriu nada");
    assert.equal(t.detalhe("artigo-1"), null);
    /* Nem ativou a linha: marcar não é escolher. */
    assert.deepEqual(t.diario.ativadas, [], "o checkbox não ativou a linha");
    assert.match(t.estado(), /ativo=nenhum/);

    /*
     * E A RECÍPROCA, que é o defeito de verdade: era a ATIVAÇÃO DE LINHA que
     * roubava o clique do chevron. Quem clica no expansor não está escolhendo
     * a linha — está pedindo para ver o detalhe dela.
     */
    await t.click(t.chevrons()[0]);
    assert.match(t.estado(), /expandido=row-1/);
    assert.deepEqual(t.diario.ativadas, [], "o clique no expansor não ativou a linha");
    assert.match(t.estado(), /ativo=nenhum/);
    assert.deepEqual(t.diario.selecionadas.at(-1), ["row-1"], "nem alterou a seleção");
  } finally { t.destroy(); }
});

/* ==========  A ÁREA DE CLIQUE — A CAUSA MEDIDA  ===================== */

test("FIX expansor · o botão cobre a célula, não 12% dela", () => {
  const grid = readFileSync(new URL("../components/editorial/operational-data-grid.tsx", import.meta.url), "utf8");

  /*
   * `happy-dom` NÃO CALCULA LAYOUT, então o tamanho não é conferível aqui —
   * ele foi medido num navegador real (12% antes, 81% depois). O que este
   * teste tranca são as classes que produzem aquela geometria: sem elas o
   * botão volta a ser um alvo de 12×12 dentro de uma célula de 29×34, e o
   * clique volta a cair no `td`.
   */
  const celula = grid.slice(grid.indexOf("{renderExpanded ? <button") - 80, grid.indexOf("aria-label={`${(expandedRowId"));
  assert.match(celula, /<td className="p-0 text-center/, "a célula não reserva padding fora do alvo");
  assert.match(celula, /className="flex h-full w-full cursor-pointer items-center justify-center py-2"/, "o botão ocupa a célula inteira");
  assert.ok(!/<td className="p-1 text-center text-slate-700">\{renderExpanded \? <button type="button" aria-label/.test(grid), "a forma antiga não voltou");

  /* O clique continua parando no botão: sem isso, abrir também selecionaria. */
  const inicioDoBotao = grid.indexOf("{renderExpanded ? <button");
  assert.ok(inicioDoBotao > 0, "o botão do expansor foi localizado");
  const botao = grid.slice(inicioDoBotao, grid.indexOf("</button>", inicioDoBotao));
  assert.ok(botao.length > 100 && botao.length < 1200, "o recorte é o botão, não o arquivo");
  assert.match(botao, /onPointerDown=\{event => event\.stopPropagation\(\)\}/);
  assert.match(botao, /onClick=\{event => \{ event\.stopPropagation\(\);/);
});

/* ==========  D e E · NADA A MONTANTE É TOCADO  ====================== */

test("FIX expansor · D e E — expandir não mexe em Pesquisa, e a linha finalizada abre igual", async () => {
  const t = await tela();
  try {
    const antes = t.diario.pesquisaLida;
    assert.ok(antes > 0, "a coluna Pesquisa foi renderizada ao menos uma vez");

    /* E · a primeira linha é a finalizada ("Pesquisa finalizada"). */
    await t.click(t.chevrons()[0]);
    assert.ok(t.detalhe("artigo-1"), "E · a linha finalizada expande normalmente");
    assert.match(t.container.textContent || "", /Pesquisa finalizada/, "e a coluna continua dizendo o mesmo");

    /*
     * D · A COLUNA É LIDA DE NOVO porque a tabela re-renderiza — o que ela não
     * pode é MUDAR. O valor antes e depois é o mesmo, e nenhuma escrita saiu.
     */
    assert.ok(t.diario.pesquisaLida > antes, "a coluna re-renderizou (leitura, não escrita)");
    assert.match(t.container.textContent || "", /Não iniciada/, "a outra linha também segue intacta");
    assert.deepEqual(tentativasDeRede, [], "D · nenhum provider foi chamado ao expandir");
  } finally { t.destroy(); }
});

/* ==========  F · A REMONTAGEM NÃO DISPARA NADA  ==================== */

test("FIX expansor · F — remontar a planilha (o F5) não dispara provider nem abre sozinho", async () => {
  const t = await tela();
  try {
    await t.click(t.chevrons()[0]);
    assert.match(t.estado(), /expandido=row-1/);
  } finally { t.destroy(); }

  /* A remontagem é o que o F5 faz: estado novo, nada aberto, nada chamado. */
  const nova = await tela();
  try {
    assert.match(nova.estado(), /expandido=nenhum/, "F · a planilha volta fechada");
    assert.equal(nova.detalhe("artigo-1"), null);
    assert.deepEqual(nova.diario.ativadas, [], "e sem ativar linha nenhuma");
  } finally { nova.destroy(); }

  assert.deepEqual(tentativasDeRede, [], "REAL_PROVIDER_CALLS = 0");
});

/* ==========  O RADAR CONTINUA LIGADO AO GRID  ====================== */

test("FIX expansor · a planilha do Radar continua passando o expansor e o detalhe", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /* §1, §3 e §6: handler, estado e conteúdo condicional continuam ligados. */
  assert.match(pagina, /expandedRowId=\{expandedRadarId\}/);
  assert.match(pagina, /onExpandedRowChange=\{handleExpandedChange\}/);
  assert.match(pagina, /renderExpanded=\{row => <RadarProfile r3=\{rowWorkbenchData\(row\)\.r3\}/);

  /*
   * §2 · O ID DO TOGGLE É O ID DA LINHA.
   *
   * O grid devolve `row.id`; o guarda do Radar procura por `row.id` na MESMA
   * lista que alimenta a tabela (`pipeline.radarItems`). Se um dos dois
   * passasse a usar `articleId`, o guarda não encontraria a linha e — com uma
   * ação em andamento — bloquearia a abertura em silêncio.
   */
  assert.match(pagina, /rows=\{pipeline\.radarItems\}/);
  assert.match(pagina, /pipeline\.radarItems\.find\(row => row\.id === id\)\?\.articleId/);

  /* §4: o guarda só barra quando há ação em curso para OUTRO artigo. */
  const guarda = pagina.slice(pagina.indexOf("const handleExpandedChange"), pagina.indexOf("setExpandedRadarId(id);"));
  assert.match(guarda, /serpActionRef\.current && id &&/, "sem ação em curso, nada é barrado");
  assert.match(guarda, /reviewingArticleIdRef\.current && id &&/);
  assert.ok(!/if \(id\) return/.test(guarda), "nenhum retorno incondicional");
});
