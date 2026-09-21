import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_ANALYSIS_HEAVY_FIELDS,
  pruneRadarAnalysisHistory,
  radarAnalysisVersionsToPreserve,
} from "../lib/radar/analysis-history-pruning.ts";

/**
 * O PESO QUE ATRAVESSA A REDE A CADA F5.
 *
 * Medido em produção, numa marca real: 6,0 MB de workspace, dos quais 5,98 MB
 * (98,8%) em `analysisVersions` — 25 versões históricas de um único artigo. A
 * maior delas: `extractions` 832 KB, `competitiveReport` 717 KB.
 *
 * Esse payload passa pela rede, pelo `JSON.parse` e pela validação Zod antes da
 * primeira pintura, e fica em memória enquanto a tela existir. Era a causa de
 * "F5 lento", "selecionar artigo lento" e "expandir área lento" ao mesmo tempo.
 */

const versao = (numero: number, status: string, peso = 1_000) => ({
  versionId: `v-${numero}`,
  versionNumber: numero,
  createdAt: `2026-09-0${Math.min(numero, 9)}T00:00:00Z`,
  payload: {
    status,
    extractions: Array.from({ length: peso }, (_, indice) => ({ id: `p-${indice}`, url: `https://exemplo.test/${indice}`, html: "x".repeat(200) })),
    competitiveReport: { needs: Array.from({ length: peso }, () => ({ title: "y".repeat(200) })) },
    /*
     * As corridas entraram na poda em RADAR_FINAL_2: elas são matéria-prima
     * recalculável, e `amazonSearch` sozinho pesa 88,3% de uma versão real.
     */
    youtubeSearch: { universe: Array.from({ length: peso }, (_, indice) => ({ videoId: `v-${indice}` })) } as unknown as null,
    amazonSearch: { universe: Array.from({ length: peso }, (_, indice) => ({ asin: `A-${indice}` })) } as unknown as null,
    deepResearch: { queries: 3 },
  },
});

/* =================== o que fica inteiro, e por quê ================== */

test("LIVE_UX · a corrente e a última aprovada ficam inteiras", () => {
  const versoes = [versao(1, "approved"), versao(2, "draft"), versao(3, "draft")];
  const preservadas = radarAnalysisVersionsToPreserve(versoes);

  /* A corrente é a que a tela abre; a aprovada sustenta o que já foi decidido. */
  assert.deepEqual([...preservadas].sort(), ["v-1", "v-3"]);
});

test("LIVE_UX · quando a corrente É a aprovada, preserva-se uma só", () => {
  const versoes = [versao(1, "draft"), versao(2, "approved")];
  assert.deepEqual([...radarAnalysisVersionsToPreserve(versoes)], ["v-2"]);
});

test("LIVE_UX · sem nenhuma aprovada, a corrente ainda fica", () => {
  const versoes = [versao(1, "draft"), versao(2, "draft")];
  assert.deepEqual([...radarAnalysisVersionsToPreserve(versoes)], ["v-2"]);
});

test("LIVE_UX · lista vazia não preserva nada e não quebra", () => {
  assert.deepEqual([...radarAnalysisVersionsToPreserve([])], []);
  assert.deepEqual(pruneRadarAnalysisHistory([]), []);
});

/* ======================== a poda em si ============================ */

test("LIVE_UX · o histórico perde o conteúdo pesado e mantém a identidade", () => {
  const versoes = [versao(1, "approved"), versao(2, "draft"), versao(3, "draft")];
  const podadas = pruneRadarAnalysisHistory(versoes);

  const antiga = podadas.find(item => item.versionId === "v-2");
  assert.ok(antiga);
  assert.deepEqual(antiga.payload.extractions, [], "extractions vira vazio, não some");
  assert.equal(antiga.payload.competitiveReport, null);

  /* O que o histórico da tela mostra continua lá. */
  assert.equal(antiga.versionNumber, 2);
  assert.equal(antiga.payload.status, "draft");
  assert.equal((antiga as { createdAt: string }).createdAt, "2026-09-02T00:00:00Z");
  /* E o resto do payload não é tocado. */
  assert.deepEqual(antiga.payload.deepResearch, { queries: 3 });
});

test("LIVE_UX · as preservadas saem intactas", () => {
  const versoes = [versao(1, "approved"), versao(2, "draft"), versao(3, "draft")];
  const podadas = pruneRadarAnalysisHistory(versoes);

  for (const alvo of ["v-1", "v-3"]) {
    const preservada = podadas.find(item => item.versionId === alvo);
    assert.ok(preservada);
    assert.equal((preservada.payload.extractions as unknown[]).length, 1_000, `${alvo} mantém as extrações`);
    assert.ok(preservada.payload.competitiveReport, `${alvo} mantém o relatório`);
  }
});

test("LIVE_UX · a poda não muta o que recebeu", () => {
  /*
   * Mutar o registro lido apagaria dado de quem o leu antes por outro caminho,
   * no mesmo processo — e o efeito apareceria longe daqui.
   */
  const versoes = [versao(1, "draft"), versao(2, "draft")];
  const original = JSON.stringify(versoes);
  pruneRadarAnalysisHistory(versoes);
  assert.equal(JSON.stringify(versoes), original, "a entrada continua intacta");
});

test("LIVE_UX · a poda corta a maior parte do peso", () => {
  const versoes = Array.from({ length: 25 }, (_, indice) => versao(indice + 1, indice === 0 ? "approved" : "draft"));
  const antes = JSON.stringify(versoes).length;
  const depois = JSON.stringify(pruneRadarAnalysisHistory(versoes)).length;

  /* Em produção o corte medido foi de 63%; com 25 versões sintéticas é maior. */
  assert.ok(depois < antes * 0.2, `corte insuficiente: ${antes} → ${depois}`);
});

/* ============ a leitura poda; a ESCRITA lê o registro inteiro ========= */

test("LIVE_UX · a escrita nunca reusa a leitura podada", async () => {
  /*
   * O RISCO QUE ISTO TRAVA É PERDA DE DADO PERMANENTE.
   *
   * `appendRadarAnalysis` regrava `analysisVersions` inteiro. Se ele lesse pelo
   * caminho podado, cada análise nova apagaria `extractions` e
   * `competitiveReport` das versões antigas NO BANCO — e não haveria volta.
   *
   * A separação é estrutural: `list()` poda porque alimenta a tela; a escrita
   * lê a linha COMO ESTÁ GRAVADA, e regravar o que se leu verbatim é lossless
   * por construção.
   *
   * 2026-09-21: o caminho cru ganhou nome próprio, `findByArticleRaw`. As
   * corridas passaram a morar em `radar_analysis_runs`, e `findByArticle`
   * agora as REIDRATA para os consumidores. Reidratar na escrita seria o erro
   * simétrico do que este teste sempre travou: devolveria as corridas para
   * dentro da linha, desfazendo a arrumação uma análise por vez.
   *
   * O invariante não mudou — nem podado, nem reidratado: verbatim.
   */
  const fonte = await readFile(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "");

  const escrita = semComentarios.slice(semComentarios.indexOf("async appendRadarAnalysis"));
  const corpo = escrita.slice(0, escrita.indexOf("async ", 10));
  assert.ok(corpo.includes("this.findByArticleRaw("), "a escrita lê a linha como está gravada");
  assert.ok(!corpo.includes("this.findByArticle("), "e não pela leitura que reidrata as corridas");
  assert.ok(!corpo.includes("pruneRadarAnalysisHistory"), "a escrita não passa pela poda");
  assert.ok(!corpo.includes("this.list("), "a escrita não reusa a listagem da tela");

  /* E a poda acontece exatamente uma vez, na listagem. */
  assert.equal((semComentarios.match(/pruneRadarAnalysisHistory\(/g) || []).length, 1);
  const listagem = semComentarios.slice(semComentarios.indexOf("async list("), semComentarios.indexOf("async find("));
  assert.ok(listagem.includes("pruneRadarAnalysisHistory("), "é a listagem que poda");
});

test("LIVE_UX · o registro remoto continua íntegro: a poda é de leitura", async () => {
  const fonte = await readFile(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Nenhum UPDATE/upsert escreve o resultado da poda de volta. */
  assert.ok(!/update\([^)]*pruneRadarAnalysisHistory/.test(semComentarios));
  assert.ok(!/upsert\([^)]*pruneRadarAnalysisHistory/.test(semComentarios));

  const dominio = await readFile(new URL("../lib/radar/analysis-history-pruning.ts", import.meta.url), "utf8");
  const limpo = dominio.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/fetch\(|supabase|createClient|from\(/.test(limpo), "o domínio da poda é puro");
});

test("LIVE_UX · os campos podados são os medidos, não uma lista arbitrária", () => {
  /*
   * ============ A LISTA CRESCEU EM RADAR_FINAL_2 ============
   *
   * Ela foi escrita quando só existia o pipeline do Google. YouTube e Amazon
   * trouxeram a própria matéria-prima para dentro da versão de análise, e a
   * medição de uma investigação Amazon real mostrou o custo: `amazonSearch`
   * sozinho é 129,7 KB — 88,3% da versão inteira.
   *
   * A regra não mudou: continua sendo MATÉRIA-PRIMA RECALCULÁVEL, medida, e
   * nunca conclusão. As fotografias congeladas ficam de fora da poda de
   * propósito — elas são o que a tela abre.
   */
  assert.deepEqual([...RADAR_ANALYSIS_HEAVY_FIELDS], [
    "extractions", "competitiveReport", "youtubeSearch", "amazonSearch",
  ]);

  /* Os valores vazios precisam ser aceitos pelo schema que valida a leitura. */
  const podada = pruneRadarAnalysisHistory([versao(1, "draft"), versao(2, "draft")])[0];
  assert.ok(Array.isArray(podada.payload.extractions), "extractions continua array");
  assert.equal(podada.payload.competitiveReport, null, "competitiveReport continua nullable");
  assert.equal(podada.payload.youtubeSearch, null, "a corrida de vídeo é nullable");
  assert.equal(podada.payload.amazonSearch, null, "a corrida de produto é nullable");

  /*
   * E NENHUMA CONCLUSÃO ENTRA NA PODA.
   *
   * Podar a fotografia congelada faria a tela perder a leitura que ela existe
   * para mostrar — e §24 é explícito: performance muda transporte, não
   * semântica.
   */
  for (const conclusao of ["amazonFrozenInvestigation", "youtubeFrozenInvestigation", "finalizedBundle", "plannerBundle", "amazonBlueprint"]) {
    assert.equal(
      (RADAR_ANALYSIS_HEAVY_FIELDS as readonly string[]).includes(conclusao),
      false,
      `${conclusao} é conclusão e não pode ser podada`,
    );
  }
});
