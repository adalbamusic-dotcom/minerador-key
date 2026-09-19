/**
 * ===== RADAR_SELECTION_LIGHT_1 · selecionar uma linha não recalcula a página inteira =====
 *
 * ESTRUTURAL — lê a página e o workbench e prova a fiação:
 *  A · o modelo da linha é lido UMA vez por linha por render (cache de render);
 *  B · a projeção e o blueprint têm a mesma disciplina;
 *  C · o cache não atravessa renders (nada de useMemo com lista de dependências
 *      para envelhecer);
 *  D · o card fechado tem o tamanho do card vazio — uma linha e a marca de
 *      estado — e o resto só aparece com a área aberta.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

test("A · o modelo da linha passa por um cache de render, e nenhum consumidor chama o cálculo cru", async () => {
  const pagina = semComentarios(await fonte("../modules/radar/radar-page.tsx"));
  assert.match(pagina, /const calcularDadosDaLinha = \(row: RadarItem\) => \{/);
  assert.match(pagina, /const cacheDaLinha = new WeakMap<RadarItem, ReturnType<typeof calcularDadosDaLinha>>\(\);/);
  assert.match(pagina, /const rowWorkbenchData = \(row: RadarItem\) => \{\s*const pronto = cacheDaLinha\.get\(row\);\s*if \(pronto\) return pronto;\s*const calculado = calcularDadosDaLinha\(row\);\s*cacheDaLinha\.set\(row, calculado\);/);
  /* O cálculo cru tem UM chamador: o cache. */
  assert.equal((pagina.match(/calcularDadosDaLinha\(/g) || []).length, 1, "alguém voltou a chamar o cálculo sem passar pelo cache");
  /* E os consumidores continuam muitos — é isso que o cache paga. */
  assert.ok((pagina.match(/rowWorkbenchData\(/g) || []).length >= 15, "os consumidores do modelo da linha sumiram? o cache perdeu o sentido");
});

test("B · projeção de pesquisa e blueprint canônico têm a mesma disciplina", async () => {
  const pagina = semComentarios(await fonte("../modules/radar/radar-page.tsx"));
  assert.match(pagina, /const cacheDaProjecao = new Map<string, RadarResearchProfileProjection>\(\);/);
  assert.equal((pagina.match(/calcularProjecaoDePesquisa\(/g) || []).length, 1);
  assert.match(pagina, /const cacheDoBlueprint = new Map<string, RadarCompetitiveBlueprintView>\(\);/);
  assert.equal((pagina.match(/calcularBlueprintCanonico\(/g) || []).length, 1);
  /* A chave do blueprint carrega o perfil forçado: Amazon monta o dela mesmo com o seletor em outro lugar. */
  assert.match(pagina, /const chave = `\$\{row \? row\.id : ""\}:\$\{perfil \|\| ""\}`;/);
});

test("C · o cache vive um render: nasce no corpo do componente, sem useMemo nem ref", async () => {
  const pagina = semComentarios(await fonte("../modules/radar/radar-page.tsx"));
  for (const cache of ["cacheDaLinha", "cacheDaProjecao", "cacheDoBlueprint"]) {
    const declaracao = new RegExp(`const ${cache} = (useMemo|useRef|useState)`);
    assert.equal(declaracao.test(pagina), false, `${cache} atravessa renders — uma linha pode mostrar o estado anterior`);
    assert.match(pagina, new RegExp(`const ${cache} = new (WeakMap|Map)<`));
  }
});

test("D · o card fechado tem o tamanho do card vazio: uma linha, e o resto só aberto", async () => {
  const workbench = semComentarios(await fonte("../modules/radar/radar-r3-workbench.tsx"));
  const card = workbench.slice(workbench.indexOf("function AreaCard("), workbench.indexOf("function DisabledAreaCard("));
  assert.match(card, /\{expanded\s*\?\s*copy\.lines\.map\(/, "aberto, o card mostra as linhas inteiras");
  assert.match(card, /:\s*<span className="mt-1 block truncate text-sm leading-5 text-foreground" data-testid=\{`radar-r3-card-\$\{area\}-resumo`\}>\{copy\.lines\.filter\(Boolean\)\.slice\(0, 2\)\.join\(" · "\)/,
    "fechado, o card resume em UMA linha truncada");
  /* O card vazio continua com a mesma estrutura: título, uma linha, marca. */
  const vazio = workbench.slice(workbench.indexOf("function DisabledAreaCard("), workbench.indexOf("function DisabledAreaCard(") + 1200);
  assert.match(vazio, /<span className="mt-1 block text-sm text-text-muted" aria-hidden="true">&nbsp;<\/span>/);
});

test("E · os painéis das áreas continuam renderizando só quando abertos", async () => {
  const workbench = semComentarios(await fonte("../modules/radar/radar-r3-workbench.tsx"));
  for (const area of ["pesquisa", "videos", "especialista", "relatorio"]) {
    assert.match(workbench, new RegExp(`expandedArea === "${area}" && `), `a área ${area} passou a renderizar fechada`);
  }
});
