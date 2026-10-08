import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarArticleDisplayTitle } from "../lib/radar/r3-workbench.ts";

/*
 * ===== 2026-10-08 · A PLANILHA DO RADAR SEM "COBRIR COM CLAREZA O TEMA" =====
 *
 * Pedido do dono: "Cobrir com clareza o tema “X”." é a promessa padrão que o
 * Arquiteto grava quando a semântica não trouxe uma — não é título e não diz
 * nada. A planilha, o cabeçalho do Workbench e o perfil mostram só o X. E a
 * coluna Especialista saiu da planilha (o card continua; ver gate 18.7).
 */

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

test("o título sai sem a moldura da promessa padrão, com ou sem aspas e ponto", () => {
  assert.equal(radarArticleDisplayTitle("Cobrir com clareza o tema “marketing digital para dentistas”."), "marketing digital para dentistas");
  assert.equal(radarArticleDisplayTitle("Cobrir com clareza o tema \"leads qualificados\""), "leads qualificados");
  assert.equal(radarArticleDisplayTitle("Cobrir com clareza o tema skincare para pele oleosa."), "skincare para pele oleosa");
  assert.equal(radarArticleDisplayTitle("  cobrir com clareza o tema skin care principia  "), "skin care principia");
});

test("promessa escrita de verdade e título vazio continuam como vieram", () => {
  assert.equal(radarArticleDisplayTitle("Mostrar como a clínica aparece no Google quando o paciente procura"), "Mostrar como a clínica aparece no Google quando o paciente procura");
  assert.equal(radarArticleDisplayTitle("Como cobrir com clareza o tema da bio"), "Como cobrir com clareza o tema da bio", "só a moldura no começo sai");
  assert.equal(radarArticleDisplayTitle(null), "");
  assert.equal(radarArticleDisplayTitle(undefined), "");
});

test("o modelo R3 (planilha, cabeçalho e perfil) e a ordenação da coluna usam o título sem moldura; a coluna Especialista não existe", () => {
  const modelo = semComentarios(readFileSync(new URL("../lib/radar/r3-workbench.ts", import.meta.url), "utf8"));
  assert.match(modelo, /title: radarArticleDisplayTitle\(input\.article\?\.payload\.promise \|\| input\.row\.title\)/);
  const pagina = semComentarios(readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const coluna = pagina.slice(pagina.indexOf(`{ id: "article", header: "Artigo"`), pagina.indexOf(`{ id: "research", header: "Pesquisa"`));
  assert.ok(coluna.length > 60, "a coluna Artigo foi localizada");
  assert.match(coluna, /value: row => `\$\{radarArticleDisplayTitle\(row\.title\)\}/, "busca e ordenação sem a moldura");
  assert.match(coluna, /\{data\.r3\.title\}/);
  assert.doesNotMatch(pagina, /header: "Especialista"/);
});
