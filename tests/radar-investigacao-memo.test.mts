import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRadarDeepResearchViewMemo, type RadarDeepResearchViewKey } from "../lib/radar/deep-research-view-memo.ts";

/*
 * ====== 2026-10-08 · A INVESTIGAÇÃO DA LINHA LEMBRADA — SEM NUNCA SERVIR DADO VELHO ======
 *
 * O dono: "o selector e o scroll estão muito lentos". Medido na bancada do
 * scratchpad: cada render refazia `buildRadarDeepResearchView` para as 25
 * linhas, e um clique numa linha custava de 14 a 19 s. A view passou a ser
 * lembrada por linha, com a ENTRADA INTEIRA na chave.
 *
 * Aqui:
 *   1. mesma chave → mesmo objeto, e o cálculo roda uma vez;
 *   2. cada elemento da chave, sozinho, refaz o cálculo — inclusive o item
 *      novo (versão gravada nova, releitura), a troca de artigo, o registro
 *      SERP novo e a seleção nova (rascunho da curadoria);
 *   3. a fiação da página: o objeto entregue à view só usa insumos que
 *      derivam da chave, e a única chamada da view passa pela memória.
 *
 * A prova com a tela inteira montada (trocar de linha não recalcula; versão
 * nova aparece) está em `tests/tela-radar-render-dom.test.mts`.
 */

const semComentarios = (texto: string) => texto.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
const fonte = async (caminho: string) => semComentarios(await readFile(new URL(caminho, import.meta.url), "utf8"));

const item = (id: string) => ({ id, articleId: id });
const chave = (row: object, extra: Partial<RadarDeepResearchViewKey> = {}): RadarDeepResearchViewKey => ({
  row, article: ARTIGO, serpRecord: REGISTRO, running: false, researchDraft: RASCUNHO, mode: "WEB", ...extra,
});
const ARTIGO = { versionId: "dna-v1" };
const REGISTRO = { id: "serp-1" };
const RASCUNHO = { "ref-1": { decision: "primary" } };

test("1 · mesma chave devolve o MESMO objeto e não refaz o cálculo", () => {
  const lerInvestigacao = createRadarDeepResearchViewMemo<{ n: number }>();
  let montagens = 0;
  const montar = () => ({ n: ++montagens });
  const linha = item("a");
  const primeira = lerInvestigacao(chave(linha), montar);
  const segunda = lerInvestigacao(chave(linha), montar);
  const terceira = lerInvestigacao({ ...chave(linha) }, montar);
  assert.equal(montagens, 1);
  assert.equal(segunda, primeira);
  assert.equal(terceira, primeira, "a chave compara por identidade de cada elemento, não do objeto da chave");
});

test("2 · cada elemento da chave, sozinho, refaz o cálculo (nenhum dado velho)", () => {
  const casos: Array<[string, (linha: object) => RadarDeepResearchViewKey]> = [
    ["item novo (versão gravada nova / releitura)", () => chave(item("a"))],
    ["ArticleDNA novo", linha => chave(linha, { article: { versionId: "dna-v2" } })],
    ["registro SERP novo (coleta nova)", linha => chave(linha, { serpRecord: { id: "serp-2" } })],
    ["investigação rodando", linha => chave(linha, { running: true })],
    ["seleção nova (rascunho da curadoria)", linha => chave(linha, { researchDraft: { "ref-1": { decision: "excluded" } } })],
    ["rascunho zerado ({} novo)", linha => chave(linha, { researchDraft: {} })],
    ["modo trocado", linha => chave(linha, { mode: "YOUTUBE" })],
  ];
  for (const [nome, proxima] of casos) {
    const lerInvestigacao = createRadarDeepResearchViewMemo<{ n: number }>();
    let montagens = 0;
    const montar = () => ({ n: ++montagens });
    const linha = item("a");
    const antes = lerInvestigacao(chave(linha), montar);
    const depois = lerInvestigacao(proxima(linha), montar);
    assert.equal(montagens, 2, `${nome}: não recalculou`);
    assert.notEqual(depois, antes, `${nome}: devolveu a view anterior`);
    /* E voltar à chave anterior também é entrada nova: a memória guarda só a última. */
    lerInvestigacao(chave(linha), montar);
    assert.equal(montagens, nome.startsWith("item novo") ? 2 : 3, `${nome}: a volta serviu uma view guardada de outra entrada`);
  }
});

test("2 · linhas diferentes não se misturam (troca de artigo)", () => {
  const lerInvestigacao = createRadarDeepResearchViewMemo<{ artigo: string }>();
  const a = item("a");
  const b = item("b");
  const viewA = lerInvestigacao(chave(a), () => ({ artigo: "a" }));
  const viewB = lerInvestigacao(chave(b), () => ({ artigo: "b" }));
  assert.deepEqual([viewA.artigo, viewB.artigo], ["a", "b"]);
  assert.equal(lerInvestigacao(chave(a), () => ({ artigo: "ERRADO" })), viewA);
  assert.equal(lerInvestigacao(chave(b), () => ({ artigo: "ERRADO" })), viewB);
});

/* ------------------------------ a fiação ------------------------------ */

const DERIVADOS_DA_CHAVE = new Set([
  "researchContext", "analysis", "view", "selectionProjection", "curationSummary", "modeloDoRelatorio",
  "investigacaoRodando", "rascunhoDaPesquisa", "modoDaLinha",
]);
const LIVRES = new Set(["null", "true", "false", "undefined", "Boolean"]);

function identificadoresDeTopo(literal: string): string[] {
  const semTexto = literal.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "\"\"");
  const parametros = new Set([...semTexto.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)].map(m => m[1]));
  const encontrados: string[] = [];
  for (const m of semTexto.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)) {
    const antes = semTexto.slice(0, m.index).trimEnd().slice(-1);
    const depois = semTexto.slice((m.index || 0) + m[1].length).trimStart().slice(0, 1);
    if ((antes === "{" || antes === ",") && depois === ":") continue;
    if (parametros.has(m[1]) || LIVRES.has(m[1])) continue;
    encontrados.push(m[1]);
  }
  return [...new Set(encontrados)];
}

test("3 · a página: uma chamada da view, dentro da memória, com a chave completa", async () => {
  const pagina = await fonte("../modules/radar/radar-page.tsx");
  assert.equal((pagina.match(/buildRadarDeepResearchView\(/g) || []).length, 1, "a view voltou a ser montada fora da memória");
  /* A memória é do módulo — o dono é o item, então não há o que envelhecer entre marcas. */
  const memoria = pagina.indexOf("const investigacaoDaLinha = createRadarDeepResearchViewMemo<");
  assert.ok(memoria > 0 && memoria < pagina.indexOf("export function RadarPage("), "a memória da investigação precisa nascer no módulo, fora do componente");
  assert.doesNotMatch(pagina, /investigacaoDaLinha = use(Memo|Ref|State)/);
  /* A chave inteira, nesta ordem de leitura: item, ArticleDNA, registro, rodando, rascunho, modo. */
  assert.match(pagina, /const deepResearch = investigacaoDaLinha\(\{ row, article, serpRecord: record, running: investigacaoRodando, researchDraft: rascunhoDaPesquisa, mode: modoDaLinha \}, \(\) => buildRadarDeepResearchView\(\{/);
  assert.match(pagina, /const investigacaoRodando = busyArticleId === row\.articleId \|\| serpAction\?\.articleId === row\.articleId;/);
  assert.match(pagina, /const rascunhoDaPesquisa = researchDraftByArticle\[row\.articleId\];/);
  assert.match(pagina, /const modoDaLinha = modoEfetivoDe\(row\);/);
});

test("3 · todo insumo da view deriva da chave — insumo novo fora da lista quebra aqui, antes de servir dado velho", async () => {
  const pagina = await fonte("../modules/radar/radar-page.tsx");
  const abre = "() => buildRadarDeepResearchView({";
  const inicio = pagina.indexOf(abre) + abre.length;
  const fim = pagina.indexOf("}));", inicio);
  assert.ok(inicio > abre.length && fim > inicio, "o objeto entregue à view não foi achado");
  const literal = `{${pagina.slice(inicio, fim)}}`;
  const fora = identificadoresDeTopo(literal).filter(nome => !DERIVADOS_DA_CHAVE.has(nome));
  assert.deepEqual(fora, [], `insumo(s) fora da chave da memória: ${fora.join(", ")}`);

  /*
   * E os derivados continuam derivados SÓ do item, do ArticleDNA e do
   * registro SERP — a âncora de cada um, como está no cálculo da linha.
   */
  const calculo = pagina.slice(pagina.indexOf("const calcularDadosDaLinha = (row: RadarItem) => {"), pagina.indexOf("const cacheDaLinha = new WeakMap"));
  const ancoras: RegExp[] = [
    /const record = latestSerp\(row\.articleId\);/,
    /const view = record \? buildRadarSerpView\(record\) : null;/,
    /const latestAnalysis = row\.analysisVersions\.slice\(\)\.sort\(\(a, b\) => b\.versionNumber - a\.versionNumber\)\[0\] \|\| null;/,
    /const analysis = radarAnalysisMatchesSerp\(\{ analysis: latestAnalysis, brandId: row\.brandId, articleId: row\.articleId, articleDnaVersionId: row\.articleDnaVersionId, view \}\) \? latestAnalysis : null;/,
    /const selectionProjection = buildRadarSerpSelectionProjection\(view, analysis, radarSelectionScope\(row\)\);/,
    /const article = pipeline\.articleVersions\[row\.articleId\];/,
    /const curationSummary = buildRadarSerpCurationSummary\(\{ view, analysis, scope: radarSelectionScope\(row\) \}\);/,
    /const modeloDoRelatorio = analysis\?\.payload\.competitiveReport\?\.observedCompetitiveModel \|\| null;/,
    /const researchContext = buildRadarArticleResearchContext\(\{ item: row, article: article \|\| null \}\);/,
  ];
  for (const ancora of ancoras) assert.match(calculo, ancora, `a derivação mudou: ${ancora.source.slice(0, 60)}… — confira se a chave da memória ainda cobre a entrada`);
  /* `latestSerp` escolhe UM elemento de `pipeline.serpRecords`, sem copiar: a identidade é a do registro. */
  assert.match(pagina, /const latestSerp = \(articleId: string\) => latestRadarR5SerpRecord\(pipeline\.serpRecords, articleId\);/);
});

test("3 · a view é pura: nenhuma leitura de relógio no módulo da view", async () => {
  const view = await fonte("../lib/radar/deep-research-view.ts");
  assert.doesNotMatch(view, /Date\.now\(\)|new Date\(\)|performance\.now\(\)|Math\.random\(\)/);
});
