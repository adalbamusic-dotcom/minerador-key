import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * ===== O DIÁLOGO DE IMPORTAÇÃO AGRUPADO POR SILO — 2026-10-07 =====
 *
 * O componente real (`WorkflowImportDialog`) no DOM:
 *
 *   1. SEM `groupOf`, nada muda: nenhum cabeçalho de grupo, e a busca continua
 *      casando SÓ com o rótulo da linha — consumidores atuais preservados
 *      (Redator, Arquiteto, ImportPanel sem groupOf);
 *   2. COM `groupOf`, cada grupo contíguo abre com cabeçalho: nome, contagem
 *      dos ainda não importados e "Selecionar o silo inteiro";
 *   3. o checkbox do grupo marca/desmarca os selecionáveis DO GRUPO que passam
 *      na busca atual, e fica `indeterminate` quando a seleção é parcial;
 *   4. a busca também casa com o rótulo do grupo: buscar o nome do silo mostra
 *      o silo inteiro.
 *
 * Roda dentro de `npm run test:radar` (tests/radar-*.test.mts), com o loader
 * de runtime. Fixtures, sem rede.
 */

const { WorkflowImportDialog } = await import("../components/editorial/workflow-status.tsx");

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

type Linha = { id: string; nome: string; grupo: string | null; importado: boolean };

/* Grupos contíguos, como o chamador entrega depois de ordenar pelo módulo puro. */
const LINHAS: Linha[] = [
  { id: "r1", nome: "Artigo pilar", grupo: "Crescimento", importado: false },
  { id: "r2", nome: "Artigo suporte", grupo: "Crescimento", importado: false },
  { id: "r3", nome: "Artigo veterano", grupo: "Crescimento", importado: true },
  { id: "r4", nome: "Artigo autoridade", grupo: "Autoridade", importado: false },
  { id: "r5", nome: "Artigo solto", grupo: null, importado: false },
];

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => { tela = await montarRadar(); });
test.afterEach(() => { tela?.destroy(); tela = null; });

async function montarDialogo(comGrupos: boolean) {
  await tela!.render(React.createElement(WorkflowImportDialog<Linha>, {
    open: true,
    title: "Importar artigos aprovados",
    description: "bancada",
    rows: LINHAS,
    label: (row: Linha) => row.nome,
    disabled: (row: Linha) => row.importado,
    ...(comGrupos ? { groupOf: (row: Linha) => row.grupo } : {}),
    onClose: () => {},
    onImport: async () => {},
  }));
}

const busca = () => tela!.container.querySelector('input[placeholder="Buscar itens da etapa anterior…"]') as HTMLInputElement;
const cabecalhos = () => tela!.all("workflow-import-group-header");
const togglesDeGrupo = () => tela!.all("workflow-import-group-toggle") as HTMLInputElement[];
const checkboxDaLinha = (nome: string) => {
  const linha = [...tela!.container.querySelectorAll("label")].find(elemento => elemento.textContent?.includes(nome) && elemento.querySelector('input[type="checkbox"]'));
  assert.ok(linha, `linha com "${nome}"`);
  return linha!.querySelector('input[type="checkbox"]') as HTMLInputElement;
};

test("sem groupOf nada muda: nenhum cabeçalho e a busca casa só com o rótulo da linha", async () => {
  await montarDialogo(false);
  assert.equal(cabecalhos().length, 0);
  assert.ok(!tela!.text().includes("Selecionar o silo inteiro"));
  assert.ok(!tela!.text().includes("Crescimento"), "o nome do grupo não aparece sem groupOf");
  /* Buscar o nome do silo não encontra nada: o filtro continua só pelo rótulo. */
  await tela!.type(busca(), "Crescimento");
  assert.ok(!tela!.text().includes("Artigo pilar"));
  assert.ok(tela!.text().includes("Nenhum item disponível"));
});

test("com groupOf cada grupo contíguo abre com nome, contagem e seleção do grupo", async () => {
  await montarDialogo(true);
  const headers = cabecalhos();
  /* Dois grupos nomeados; a linha sem grupo (null) não ganha cabeçalho. */
  assert.equal(headers.length, 2);
  assert.ok(headers[0].textContent?.includes("Crescimento"));
  assert.ok(headers[0].textContent?.includes("2 de 3 ainda não importados"));
  assert.ok(headers[0].textContent?.includes("Selecionar o silo inteiro"));
  assert.ok(headers[1].textContent?.includes("Autoridade"));
  assert.ok(headers[1].textContent?.includes("1 de 1 ainda não importados"));
  /*
   * 2026-10-07 · Passada dos revisores: o texto visível é o mesmo em todos os
   * grupos, então o leitor de tela precisa do aria-label dizendo DE QUAL silo
   * é cada checkbox — sem ele, navegar por controles ouvia a mesma frase.
   */
  assert.equal(togglesDeGrupo()[0].getAttribute("aria-label"), "Selecionar o silo Crescimento inteiro");
  assert.equal(togglesDeGrupo()[1].getAttribute("aria-label"), "Selecionar o silo Autoridade inteiro");
  /* As linhas continuam na ordem recebida: quem ordena é o chamador. */
  const texto = tela!.text();
  for (const [antes, depois] of [["Artigo pilar", "Artigo suporte"], ["Artigo suporte", "Artigo veterano"], ["Artigo veterano", "Artigo autoridade"], ["Artigo autoridade", "Artigo solto"]]) {
    assert.ok(texto.indexOf(antes) < texto.indexOf(depois), `${antes} antes de ${depois}`);
  }
});

test("o checkbox do grupo marca só os selecionáveis do grupo e fica indeterminate na seleção parcial", async () => {
  await montarDialogo(true);
  const [crescimento] = togglesDeGrupo();
  /* Marca o silo inteiro: r1 e r2; r3 já importado fica de fora. */
  await tela!.click(crescimento);
  assert.ok(tela!.text().includes("2 selecionado(s)"));
  assert.equal(crescimento.checked, true);
  assert.equal(crescimento.indeterminate, false);
  /* Desmarca o silo inteiro. */
  await tela!.click(crescimento);
  assert.ok(tela!.text().includes("0 selecionado(s)"));
  /* Seleção parcial pela linha: o checkbox do grupo fica indeterminate. */
  await tela!.click(checkboxDaLinha("Artigo pilar"));
  assert.ok(tela!.text().includes("1 selecionado(s)"));
  assert.equal(togglesDeGrupo()[0].indeterminate, true);
  assert.equal(togglesDeGrupo()[0].checked, false);
  /* O "Selecionar todos" global continua valendo por cima dos grupos. */
  const global = [...tela!.container.querySelectorAll("label")].find(elemento => elemento.textContent?.includes("Selecionar todos ainda não importados"))!.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await tela!.click(global);
  assert.ok(tela!.text().includes("4 selecionado(s)"));
});

test("a busca casa com o rótulo do grupo e a seleção do grupo respeita o filtro atual", async () => {
  await montarDialogo(true);
  /* Buscar o nome do silo mostra o silo inteiro, inclusive linhas cujo rótulo não casa. */
  await tela!.type(busca(), "crescimento");
  const texto = tela!.text();
  for (const nome of ["Artigo pilar", "Artigo suporte", "Artigo veterano"]) assert.ok(texto.includes(nome), nome);
  assert.ok(!texto.includes("Artigo autoridade"));
  assert.ok(!texto.includes("Artigo solto"));
  /* Com a busca estreitada a uma linha, o grupo conta e marca só o que passou no filtro. */
  await tela!.type(busca(), "pilar");
  assert.ok(cabecalhos()[0].textContent?.includes("1 de 1 ainda não importados"));
  await tela!.click(togglesDeGrupo()[0]);
  assert.ok(tela!.text().includes("1 selecionado(s)"));
});

/*
 * 2026-10-07 · Passada dos revisores: a LIGAÇÃO no Radar (módulo puro →
 * reordenação → groupOf no ImportPanel) não tinha guarda nenhuma — um refactor
 * que voltasse à lista plana deixava test:radar, test:operational e
 * test:arquiteto verdes. Âncora estrutural curta, com comentários removidos
 * ANTES do match: um comentário citando o nome não pode segurar a âncora.
 */
test("âncora: radar-page liga radarImportSiloGroups, reordena e passa groupOf ao diálogo", () => {
  const fonte = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(codigo, /radarImportSiloGroups\(\{/, "o Radar calcula os grupos com o módulo puro");
  assert.match(codigo, /articleId: version\.payload\.articleId/, "a linha leva o articleId do ArticleDNA aprovado");
  assert.match(codigo, /orderedRowIds\.map\(/, "o importable é reordenado pelos grupos antes do diálogo");
  assert.match(codigo, /groupOf=\{/, "o ImportPanel recebe groupOf: sem ele o diálogo volta à lista plana");
  /*
   * A tela NÃO repassa o siloId declarado: o invariante do Arquiteto ("a tela
   * Radar não usa payload.siloId como autoridade",
   * tests/arquiteto-radar-handoff-context.test.mts) proíbe — relaxá-lo é
   * decisão de contrato do dono, registrada no backlog do Radar. O critério
   * declarado-primeiro vive no módulo puro, testado na suíte dele.
   */
  assert.doesNotMatch(codigo, /payload\.siloId/, "o guarda do Arquiteto continua valendo nesta tela");
});

test("sentinela: nenhuma chamada de rede", () => {
  assert.equal(chamadasDeRede, 0);
});
