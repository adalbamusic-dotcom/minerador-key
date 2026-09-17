import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DataForSeoYoutubeReadError,
  assertRadarYoutubeReadable,
  buildDataForSeoYoutubeRequest,
  normalizarIdiomaBcp47,
  normalizeDataForSeoYoutubeResponse,
} from "../lib/server/dataforseo-youtube-operation.ts";
import {
  RADAR_REQUIRED_SOURCE_FOR_TARGET,
  RADAR_RESEARCH_SOURCES,
  radarDecideResearchSource,
  radarResearchPlanOfAnalysis,
} from "../lib/radar/search-mode.ts";
import { resolveRadarResearchSource } from "../lib/server/radar-primary-mode.ts";

/*
 * ====  YOUTUBE_SEARCH_2.1 · ZERO RESULTS + ALVO × FONTES  ====
 *
 * ===================== O BLOQUEIO QUE ORIGINOU ESTE GATE =====================
 *
 * No runtime real: 3 consultas, 0 vídeos, "Coleta concluída". E o Playground da
 * DataForSEO, para consulta muito próxima, devolvia dezenas de `youtube_video`.
 *
 * Duas divergências concretas entre o que mandávamos e a chamada que funcionou:
 *
 *   1. `depth` — parâmetro do endpoint do GOOGLE, copiado para cá. O de YouTube
 *      ecoa `block_depth`.
 *   2. `pt-br` — nossa minusculização. A chamada boa usou `pt-BR`.
 *
 * E um terceiro defeito que tornava os dois invisíveis: a tarefa do provider
 * podia falhar com HTTP 200 e nós anunciávamos "coleta concluída".
 *
 * PROVIDER_CALLS_IN_TESTS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const payloadReal = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-youtube-skincare-pele-oleosa.json", import.meta.url), "utf8"),
);

/* ============ §2 e §3 · o pedido, alinhado à chamada que funcionou ========= */

test("§2 · `block_depth`, não `depth` — o shape herdado do Google era o defeito", () => {
  const pedido = buildDataForSeoYoutubeRequest({
    keyword: "skincare para pele oleosa", locationCode: 2076, languageCode: "pt-br",
    resultLimit: 20, operationRequestId: "artigo-1:ytq:1",
  });
  const corpo = pedido.body[0] as Record<string, unknown>;

  assert.equal(corpo.block_depth, 20, "o endpoint de YouTube recebe block_depth");
  assert.equal("depth" in corpo, false, "e NÃO recebe o depth do Google");

  /*
   * O ECO DA CHAMADA QUE FUNCIONOU É A REFERÊNCIA.
   *
   * O provider devolve em `data` os parâmetros que executou. A coleta manual
   * confirmada trouxe `block_depth` e nenhum `depth` — é contra isso que o
   * pedido tem de bater, não contra a nossa memória.
   */
  assert.ok("block_depth" in payloadReal.data, "o eco real confirma block_depth");
  assert.equal("depth" in payloadReal.data, false, "e o eco real não tem depth");
});

test("§3 · o idioma vai em BCP-47 — `pt-BR`, como na chamada confirmada", () => {
  assert.equal(normalizarIdiomaBcp47("pt-br"), "pt-BR");
  assert.equal(normalizarIdiomaBcp47("PT-br"), "pt-BR");
  assert.equal(normalizarIdiomaBcp47("pt"), "pt", "sem região, nada a corrigir");
  assert.equal(normalizarIdiomaBcp47("en-us"), "en-US");

  /*
   * A CONFIGURAÇÃO CANÔNICA MINUSCULIZA TUDO, porque nasceu para o Google.
   *
   * Mandar `pt-br` era uma transformação NOSSA que a chamada boa não tinha. Se
   * a lista de idiomas do YouTube for sensível a caixa, ela sozinha explica uma
   * tarefa que volta sem resultado.
   */
  const pedido = buildDataForSeoYoutubeRequest({
    keyword: "x y", locationCode: 2076, languageCode: "pt-br",
    resultLimit: 20, operationRequestId: "a:b",
  });
  assert.equal(pedido.body[0].language_code, "pt-BR");
  assert.equal(pedido.body[0].language_code, payloadReal.data.language_code, "igual ao eco da chamada que funcionou");
  assert.equal(pedido.body[0].location_code, payloadReal.data.location_code, "e a mesma localidade");
});

/* ================= §1 · a medição por consulta ================= */

test("§1 · cada consulta devolve a trilha inteira: RAW → PARSER → NORMALIZER", () => {
  const { diagnostics } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:1");

  /*
   * SEM ESTES NÚMEROS, "0 vídeos" cobria três histórias com ações opostas:
   * o provider não devolveu nada, a tarefa dele falhou, ou não soubemos ler.
   */
  assert.equal(diagnostics.providerStatusCode, 20000, "o status da TAREFA, que mora dentro do corpo");
  assert.equal(diagnostics.providerStatusMessage, "Ok.");
  assert.equal(diagnostics.taskCount, 1);
  assert.equal(diagnostics.resultCount, 1);
  assert.equal(diagnostics.declaredItemsCount, 114, "o que o provider DIZ que devolveu");
  assert.deepEqual(diagnostics.itemTypes, ["youtube_video"]);
  assert.equal(diagnostics.rawItems, 14, "o que veio de fato na fixture recortada");
  assert.equal(diagnostics.rawYoutubeVideos, 14);
  assert.equal(diagnostics.normalized, 14);
  assert.equal(diagnostics.discarded, 0);
  assert.deepEqual(diagnostics.discardReasons, {});
});

test("§1 · o descarte é contado POR MOTIVO — nunca um total anônimo", () => {
  const { diagnostics } = normalizeDataForSeoYoutubeResponse({
    tasks: [{
      status_code: 20000, status_message: "Ok.",
      result: [{ items_count: 4, item_types: ["youtube_video"], items: [
        { type: "youtube_video", title: "Sem url nem id", rank_absolute: 1 },
        { type: "youtube_video", url: "https://m.youtube.com/watch?v=a", rank_absolute: 2 },
        null,
        { type: "youtube_video", title: "ok", url: "https://m.youtube.com/watch?v=b", video_id: "b", rank_absolute: 3 },
      ] }],
    }],
  }, "ytq:1");

  assert.equal(diagnostics.rawItems, 4);
  assert.equal(diagnostics.rawYoutubeVideos, 3, "o item nulo nem chega a ser tipado");
  assert.equal(diagnostics.normalized, 1);
  assert.equal(diagnostics.discarded, 3);
  /* Cada descarte diz POR QUE — sem isso, depurar zero vira adivinhação. */
  assert.deepEqual(diagnostics.discardReasons, { sem_video_id: 1, sem_titulo: 1, item_nao_e_objeto: 1 });
});

/* ================= §4 · sucesso falso não existe ================= */

test("§4 · tarefa recusada pelo provider NÃO é coleta concluída", () => {
  /*
   * A DataForSEO devolve HTTP 200 e reporta o problema DENTRO do corpo: campo
   * inválido, idioma desconhecido, cota. Sem ler isto, toda recusa dela virava
   * "coleta concluída com zero vídeos" na nossa tela — que foi exatamente o que
   * o usuário viu.
   */
  const recusada = normalizeDataForSeoYoutubeResponse({
    tasks: [{ status_code: 40501, status_message: "Invalid Field: 'depth'", result: null }],
  }, "ytq:1");

  assert.equal(recusada.results.length, 0);
  assert.throws(() => assertRadarYoutubeReadable(recusada), (erro: unknown) => {
    assert.ok(erro instanceof DataForSeoYoutubeReadError);
    assert.equal(erro.code, "YOUTUBE_PROVIDER_TASK_FAILED");
    assert.match(erro.message, /40501/);
    assert.match(erro.message, /Invalid Field/);
    return true;
  });
});

test("§4 · provider mandou vídeo e a normalização deu zero = bug NOSSO", () => {
  /*
   * Itens marcados como `youtube_video` sem nada que os identifique. O provider
   * cumpriu; nós é que não soubemos ler. Chamar isso de "coleta concluída"
   * esconderia um defeito de adapter atrás de uma tela que parece correta.
   */
  const ilegivel = normalizeDataForSeoYoutubeResponse({
    tasks: [{
      status_code: 20000, status_message: "Ok.",
      result: [{ items_count: 2, item_types: ["youtube_video"], items: [
        { type: "youtube_video", rank_absolute: 1 },
        { type: "youtube_video", rank_absolute: 2 },
      ] }],
    }],
  }, "ytq:1");

  assert.equal(ilegivel.diagnostics.rawYoutubeVideos, 2);
  assert.equal(ilegivel.diagnostics.normalized, 0);
  assert.throws(() => assertRadarYoutubeReadable(ilegivel), (erro: unknown) => {
    assert.ok(erro instanceof DataForSeoYoutubeReadError);
    assert.equal(erro.code, "YOUTUBE_NORMALIZATION_EMPTY");
    assert.match(erro.message, /2 vídeo\(s\)/);
    assert.match(erro.message, /sem_titulo|sem_url|sem_video_id/, "e diz por que cada um caiu");
    return true;
  });
});

test("§4 · provider que devolveu ZERO de verdade é resultado, não erro", () => {
  /*
   * OS DOIS ZEROS NÃO SÃO O MESMO ZERO.
   *
   * "O YouTube não tem vídeo para esta busca" é uma resposta legítima e precisa
   * continuar passando — senão a correção trocaria um erro silencioso por um
   * falso alarme.
   */
  const vazia = normalizeDataForSeoYoutubeResponse({
    tasks: [{ status_code: 20000, status_message: "Ok.", result: [{ items_count: 0, item_types: [], items: [] }] }],
  }, "ytq:1");

  assert.equal(vazia.diagnostics.rawYoutubeVideos, 0);
  assert.equal(vazia.diagnostics.normalized, 0);
  assert.doesNotThrow(() => assertRadarYoutubeReadable(vazia), "zero honesto passa");

  /* E a fixture real, que tem vídeos, também passa. */
  assert.doesNotThrow(() => assertRadarYoutubeReadable(normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:1")));
});

test("§4 · a leitura é verificada no caminho REAL de execução", async () => {
  const operacao = await readFile(new URL("../lib/server/dataforseo-youtube-operation.ts", import.meta.url), "utf8");
  const executa = operacao.slice(operacao.indexOf("export async function executeDataForSeoYoutubeQuery"));

  /*
   * A verificação não pode ser opcional. Se ela vivesse só num helper que a
   * rota "deveria" chamar, o sucesso falso voltaria no primeiro caminho novo.
   */
  assert.ok(executa.includes("assertRadarYoutubeReadable(normalizada)"), "toda execução real passa pela verificação");
  assert.ok(executa.indexOf("assertRadarYoutubeReadable") < executa.indexOf("return normalizada"), "antes de devolver");
});

/* =============== PARTE B · alvo editorial × fontes de pesquisa ============== */

test("§6 e §9 · o alvo define o produto; as fontes definem de onde vem a leitura", () => {
  assert.deepEqual([...RADAR_RESEARCH_SOURCES], ["WEB_SERP", "YOUTUBE_SERP", "AMAZON_SERP"]);
  assert.equal(RADAR_REQUIRED_SOURCE_FOR_TARGET.YOUTUBE, "YOUTUBE_SERP", "um artigo de vídeo PRECISA da SERP do YouTube");
  assert.equal(RADAR_REQUIRED_SOURCE_FOR_TARGET.WEB, "WEB_SERP");
  assert.equal(RADAR_REQUIRED_SOURCE_FOR_TARGET.AMAZON, "AMAZON_SERP");

  /* Um artigo de vídeo que ainda não coletou o YouTube declara o que falta. */
  const soGoogle = radarResearchPlanOfAnalysis({
    researchTarget: { primaryTarget: "YOUTUBE" }, deepResearch: { queries: [] }, youtubeSearch: null,
  });
  assert.equal(soGoogle.primaryTarget, "YOUTUBE");
  assert.deepEqual(soGoogle.sources, ["WEB_SERP"]);
  assert.equal(soGoogle.missingRequiredSource, "YOUTUBE_SERP");

  /* Com as duas, nada falta — e as duas continuam listadas. */
  const completo = radarResearchPlanOfAnalysis({
    researchTarget: { primaryTarget: "YOUTUBE" }, deepResearch: { queries: [] }, youtubeSearch: { runId: "r" },
  });
  assert.deepEqual(completo.sources, ["WEB_SERP", "YOUTUBE_SERP"]);
  assert.equal(completo.missingRequiredSource, null);
});

test("§7 · GOOGLE_SUPPORT_CHANGES_PRIMARY_TARGET = NO", () => {
  /*
   * ESTA É A REGRA QUE O GATE INVERTEU.
   *
   * Antes, coletar o Google num artigo de vídeo era recusado — e, se passasse,
   * converteria o artigo para WEB. Agora ele entra como APOIO, com o alvo
   * intacto, que é o caso do §6.
   */
  const apoio = radarDecideResearchSource({ currentTarget: "YOUTUBE", source: "WEB_SERP" });
  assert.equal(apoio.primaryTarget, "YOUTUBE", "o alvo não muda");
  assert.equal(apoio.isSupport, true, "e a coleta sabe que é apoio");
  assert.equal(apoio.declaresTarget, false);

  /* A fonte do próprio alvo não é apoio: é a investigação principal. */
  const principal = radarDecideResearchSource({ currentTarget: "YOUTUBE", source: "YOUTUBE_SERP" });
  assert.equal(principal.isSupport, false);
  assert.equal(principal.primaryTarget, "YOUTUBE");

  /* E vale nos dois sentidos: YouTube como apoio de um artigo de Google. */
  const inverso = radarDecideResearchSource({ currentTarget: "WEB", source: "YOUTUBE_SERP" });
  assert.equal(inverso.primaryTarget, "WEB");
  assert.equal(inverso.isSupport, true);
});

test("§6 · dá para começar pelo Google JÁ declarando que o destino é vídeo", () => {
  /*
   * O artigo virgem cujo primeiro passo é ler a intenção no Google, com o
   * destino já decidido. Sem `intendedTarget`, esta coleta declararia WEB e
   * bloquearia o vídeo — o bug que o gate corrige, na origem.
   */
  const comDestino = radarDecideResearchSource({ currentTarget: null, source: "WEB_SERP", intendedTarget: "YOUTUBE" });
  assert.equal(comDestino.primaryTarget, "YOUTUBE");
  assert.equal(comDestino.isSupport, true, "o Google é apoio desde o primeiro minuto");
  assert.equal(comDestino.declaresTarget, true);

  /* Sem declaração, o alvo é o da própria fonte — o comportamento legado. */
  const semDestino = radarDecideResearchSource({ currentTarget: null, source: "WEB_SERP" });
  assert.equal(semDestino.primaryTarget, "WEB");
  assert.equal(semDestino.isSupport, false);
});

test("§9 · o alvo EXPLÍCITO vence a inferência legada", () => {
  /*
   * Artigos anteriores a este gate não têm `researchTarget`. A inferência
   * legada continua respondendo por eles — e some assim que o alvo explícito
   * existir. Sem essa ponte, todo artigo já investigado perderia o alvo.
   */
  const legado = radarResearchPlanOfAnalysis({ deepResearch: { queries: [] }, youtubeSearch: null });
  assert.equal(legado.primaryTarget, "WEB", "inferido da única investigação existente");

  const explicito = radarResearchPlanOfAnalysis({
    researchTarget: { primaryTarget: "YOUTUBE" },
    deepResearch: { queries: [] },
    youtubeSearch: null,
  });
  assert.equal(explicito.primaryTarget, "YOUTUBE", "o declarado vence o inferido");

  /* Alvo gravado fora do vocabulário não vira alvo: cai na inferência. */
  const invalido = radarResearchPlanOfAnalysis({
    researchTarget: { primaryTarget: "TIKTOK" }, deepResearch: { queries: [] },
  });
  assert.equal(invalido.primaryTarget, "WEB");
});

test("§7 · a autoridade do servidor decide por FONTE, e lê o estado gravado", async () => {
  const comAlvoYoutube = async () => ({
    researchTarget: { primaryTarget: "YOUTUBE", declaredAt: "x", declaredBy: "u", reason: "" },
    youtubeSearch: { runId: "r" }, deepResearch: null,
  });

  const decisao = await resolveRadarResearchSource(
    { brandId: "marca-1", articleId: "artigo-1", source: "WEB_SERP" },
    { loadAnalysisPayload: comAlvoYoutube },
  );

  assert.equal(decisao.primaryTarget, "YOUTUBE", "coletar Google não converte o artigo");
  assert.equal(decisao.isSupport, true);
  assert.equal(decisao.declaresTarget, false);
  assert.deepEqual(decisao.plan.sources, ["YOUTUBE_SERP"]);
  assert.deepEqual(tentativasDeRede, [], "a decisão não toca a rede");
});

test("§11 · Amazon tem o caminho pronto e NÃO foi implementada", async () => {
  /* O modelo já aceita o terceiro alvo: quando o START existir, ele encaixa. */
  const amazon = radarDecideResearchSource({ currentTarget: null, source: "AMAZON_SERP" });
  assert.equal(amazon.primaryTarget, "AMAZON");
  assert.equal(amazon.isSupport, false);

  const apoio = radarDecideResearchSource({ currentTarget: "AMAZON", source: "WEB_SERP" });
  assert.equal(apoio.primaryTarget, "AMAZON");
  assert.equal(apoio.isSupport, true);

  /* E nenhuma coleta de Amazon existe neste gate. */
  const modulos = await Promise.all([
    readFile(new URL("../lib/server/radar-youtube-start.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/dataforseo-youtube-operation.ts", import.meta.url), "utf8"),
  ]);
  for (const fonte of modulos) {
    assert.equal(/amazon/i.test(fonte.replace(/\/\*[\s\S]*?\*\//g, " ")), false, "Amazon não foi implementada aqui");
  }
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
