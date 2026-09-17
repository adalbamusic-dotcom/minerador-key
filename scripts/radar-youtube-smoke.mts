/**
 * ===== SMOKE CONTROLADO DA SERP DO YOUTUBE — YOUTUBE_SEARCH_2.1 · §5 =====
 *
 * ======================== UMA CHAMADA. UMA SÓ. ========================
 *
 * Este script faz UMA consulta paga ao DataForSEO e imprime a trilha inteira:
 * o que o provider respondeu, o que o parser leu, o que a normalização
 * produziu e por que cada item caiu.
 *
 * Ele existe porque a suíte não pode responder a pergunta que restou: se a
 * correção de `block_depth` e `pt-BR` basta. Testes provam o que o adapter faz
 * com um payload; só a chamada real prova o que o provider faz com o pedido.
 *
 * ===================== QUEM EXECUTA É O USUÁRIO =====================
 *
 * Nada aqui roda em teste, em CI ou por efeito de tela. É execução manual e
 * deliberada, e ela custa uma consulta.
 *
 *   pnpm run youtube:smoke
 *   pnpm run youtube:smoke "outra consulta"
 *
 * NÃO grava nada: não cria contexto, não abre corrida, não toca o artigo. É
 * leitura pura do provider.
 */

import { readDataForSeoSerpConfig } from "../lib/minerador/dataforseo-serp-core.ts";
import {
  DATAFORSEO_YOUTUBE_ENDPOINT,
  DataForSeoYoutubeReadError,
  RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
  buildDataForSeoYoutubeRequest,
  executeDataForSeoYoutubeQuery,
} from "../lib/server/dataforseo-youtube-operation.ts";

/*
 * A CONSULTA PADRÃO É A QUE O USUÁRIO JÁ CONFERIU À MÃO.
 *
 * Usar outra desconhecida no primeiro smoke misturaria duas dúvidas: "o
 * adapter está certo?" e "esta busca tem vídeo?". Com a consulta confirmada,
 * RAW = 0 só pode significar que o PEDIDO ainda diverge do Playground.
 */
const CONSULTA_PADRAO = "skincare para pele oleosa";

async function main() {
  const consulta = process.argv.slice(2).join(" ").trim() || CONSULTA_PADRAO;
  const config = readDataForSeoSerpConfig();

  const pedido = buildDataForSeoYoutubeRequest({
    keyword: consulta,
    locationCode: config.locationCode,
    languageCode: config.languageCode,
    resultLimit: RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
    operationRequestId: `smoke:${Date.now()}`,
  });

  console.log("=".repeat(70));
  console.log("SMOKE YOUTUBE — UMA CHAMADA PAGA");
  console.log("=".repeat(70));
  console.log(`endpoint          ${DATAFORSEO_YOUTUBE_ENDPOINT}`);
  /* O corpo enviado, verbatim. Nenhuma credencial passa por aqui. */
  console.log(`corpo enviado     ${JSON.stringify(pedido.body[0])}`);
  console.log("");

  try {
    const resposta = await executeDataForSeoYoutubeQuery(
      {
        keyword: consulta,
        locationCode: config.locationCode,
        languageCode: config.languageCode,
        resultLimit: RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
        operationRequestId: `smoke:${Date.now()}`,
        queryId: "smoke:1",
      },
      { config },
    );

    imprimir(consulta, resposta.diagnostics, resposta.search);
    console.log("");
    console.log(`NORMALIZED_COUNT   ${resposta.results.length}`);
    if (resposta.results.length) {
      console.log("");
      console.log("PRIMEIROS RESULTADOS:");
      for (const item of resposta.results.slice(0, 5)) {
        console.log(`  #${item.rank} ${item.isShorts ? "[Short]" : "[Vídeo]"} ${item.durationLabel || "?"} · ${item.channelName || "canal?"} · ${item.title.slice(0, 60)}`);
      }
    }
    console.log("");
    console.log(resposta.results.length ? "RESULTADO: o adapter lê a SERP do YouTube." : "RESULTADO: o provider respondeu e não devolveu vídeo para esta consulta.");
  } catch (erro) {
    if (erro instanceof DataForSeoYoutubeReadError) {
      /*
       * O CAMINHO QUE O GATE EXISTE PARA TORNAR VISÍVEL.
       *
       * Antes, isto era "coleta concluída, 0 vídeos" na tela.
       */
      imprimir(consulta, erro.diagnostics, null);
      console.log("");
      console.log(`FALHA DE LEITURA   ${erro.code}`);
      console.log(`                   ${erro.message}`);
      console.log("");
      console.log(erro.code === "YOUTUBE_NORMALIZATION_EMPTY"
        ? "RESULTADO: o provider mandou vídeo e NÓS não soubemos ler — bug do adapter."
        : "RESULTADO: a DataForSEO recusou a tarefa. Compare o corpo enviado acima com o Playground.");
      process.exitCode = 1;
      return;
    }
    console.log(`FALHA: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  }
}

function imprimir(consulta: string, d: { providerStatusCode: number | null; providerStatusMessage: string | null; taskCount: number; resultCount: number; declaredItemsCount: number | null; itemTypes: string[]; rawItems: number; rawYoutubeVideos: number; normalized: number; discarded: number; discardReasons: Record<string, number> }, search: { device: string | null; os: string | null; blockDepth: number | null; checkUrl: string | null; seResultsCount: number | null } | null) {
  console.log(`QUERY              ${consulta}`);
  console.log(`status da tarefa   ${d.providerStatusCode ?? "—"} ${d.providerStatusMessage || ""}`);
  console.log(`tasks / results    ${d.taskCount} / ${d.resultCount}`);
  console.log(`items_count        ${d.declaredItemsCount ?? "—"}  (o que o provider DIZ)`);
  console.log(`item_types         ${d.itemTypes.join(", ") || "—"}`);
  console.log(`RAW_ITEMS          ${d.rawItems}`);
  console.log(`RAW_YOUTUBE_VIDEOS ${d.rawYoutubeVideos}`);
  console.log(`NORMALIZED         ${d.normalized}`);
  console.log(`DISCARDED          ${d.discarded} ${Object.keys(d.discardReasons).length ? JSON.stringify(d.discardReasons) : ""}`);
  if (search) {
    console.log(`eco do provider    device=${search.device || "—"} os=${search.os || "—"} block_depth=${search.blockDepth ?? "—"}`);
    console.log(`se_results_count   ${search.seResultsCount ?? "—"}`);
    if (search.checkUrl) console.log(`conferir à mão     ${search.checkUrl}`);
  }
}

void main();
