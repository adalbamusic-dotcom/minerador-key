import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_YOUTUBE_COMPARABLE_CLASSES,
  RADAR_YOUTUBE_SHORT_MAX_SECONDS,
  RADAR_YOUTUBE_UNIVERSE_CLASSES,
  buildRadarYoutubeUniverse,
  radarYoutubeCompetitiveSignal,
  radarYoutubeFormatCohorts,
  radarYoutubeUniverseClass,
  radarYoutubeUniverseCounts,
} from "../lib/radar/youtube-search-model.ts";
import {
  RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
  RADAR_YOUTUBE_MAX_BLOCK_DEPTH,
  buildDataForSeoYoutubeRequest,
  normalizeDataForSeoYoutubeResponse,
} from "../lib/server/dataforseo-youtube-operation.ts";
import { radarPrimaryModeCommitment } from "../lib/radar/search-mode.ts";

/*
 * ===  YOUTUBE_SEARCH_1.1 · ALINHAMENTO COM O PAYLOAD REAL DA DATAFORSEO  ===
 *
 * A diferença deste gate para o anterior é a fonte da verdade: lá o collector
 * foi desenhado por hipótese; aqui ele é conferido contra uma coleta REAL que o
 * usuário inspecionou à mão — 114 itens de `skincare para pele oleosa`, com
 * `is_shorts`, `duration_time_seconds`, três ranks e `description: null`.
 *
 * A fixture é um recorte sanitizado desse retorno, VERBATIM nos campos. É ela
 * que responde a este arquivo inteiro.
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

/**
 * O QUE SE AUDITA É O CÓDIGO — não o comentário que explica o código.
 *
 * Uma auditoria que procura "blueprint" no arquivo inteiro acusa o comentário
 * que diz "blueprint é o gate seguinte". O efeito é pior do que um falso
 * positivo: para calar o teste, alguém apagaria justamente a explicação.
 */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ==================== §1 · PRIMARY_MODE_IMMUTABILITY ==================== */

test("§1 · um artigo com pesquisa do Google fechada NÃO vira artigo de YouTube", () => {
  const comGoogle = radarPrimaryModeCommitment({ mode: "YOUTUBE", currentMode: "WEB" });
  assert.equal(comGoogle.canStart, false, "CLOSED_GOOGLE_ARTICLE_MUTATED = NO começa aqui: o START nem acontece");
  assert.equal(comGoogle.committedTo, "WEB");
  assert.match(comGoogle.reason || "", /não será zerada nem convertida/);

  /*
   * A TRAVA É SIMÉTRICA — senão o mesmo problema volta espelhado.
   *
   * Um artigo que nasceu de YouTube aceitando um START de Google por cima é
   * exatamente a conversão que o §1 proíbe, só que na outra direção.
   */
  const comYoutube = radarPrimaryModeCommitment({ mode: "WEB", currentMode: "YOUTUBE" });
  assert.equal(comYoutube.canStart, false);
  assert.equal(comYoutube.committedTo, "YOUTUBE");

  /* Continuar no mesmo universo é sempre permitido: nova coleta não é conversão. */
  assert.equal(radarPrimaryModeCommitment({ mode: "YOUTUBE", currentMode: "YOUTUBE" }).canStart, true);
  assert.equal(radarPrimaryModeCommitment({ mode: "WEB", currentMode: "WEB" }).canStart, true);

  /* E um artigo novo não se compromete com nada antes da primeira investigação. */
  const novo = radarPrimaryModeCommitment({ mode: "YOUTUBE", currentMode: null });
  assert.equal(novo.canStart, true);
  assert.equal(novo.committedTo, null);
  assert.equal(novo.reason, null);
});

test("§1 · a página consulta a AUTORIDADE antes de gastar, nos dois caminhos de START", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /*
   * A guarda tem de estar ANTES do `fetch` que paga. Depois dele, o "não
   * converter" já teria custado uma coleta — e o artigo fechado já teria
   * recebido uma corrida por cima.
   */
  const youtube = pagina.slice(pagina.indexOf("const startYoutubeSearch"), pagina.indexOf("/** §8 · a curadoria"));
  assert.ok(youtube.includes("compromissoDeModo(target, \"YOUTUBE\")"), "o START de YouTube pergunta à autoridade");
  assert.ok(youtube.indexOf("compromissoDeModo") < youtube.indexOf("await fetch("), "a guarda vem antes da chamada paga");

  const google = pagina.slice(pagina.indexOf("const startDeepResearch"), pagina.indexOf("const startDeepResearch") + 2000);
  assert.ok(google.includes("compromissoDeModo(target, \"WEB\")"), "e o START do Google também");

  /*
   * E o compromisso é lido do que está GRAVADO, pela MESMA função do servidor.
   *
   * Desde o 1.2 a tela não sabe mais QUAIS campos provam cada modo: ela
   * pergunta a `radarPrimaryModeOfAnalysis`. Se soubesse, seriam duas cópias da
   * regra — e foi assim que a trava do 1.1 acabou existindo só de um lado.
   */
  const autoridade = semComentarios(pagina.slice(pagina.indexOf("const compromissoDeModo"), pagina.indexOf("const garantirContextoDoRadar")));
  assert.ok(autoridade.includes("radarPrimaryModeOfAnalysis(payload)"));
  assert.equal(/deepResearch|youtubeSearch/.test(autoridade), false, "a tela não reimplementa a resolução de modo");
  assert.equal(autoridade.includes("searchModeByArticle"), false, "o seletor é preferência de quem olha, não compromisso");
});

/* ======================= §2 · a profundidade padrão ====================== */

test("§2 · DEFAULT_BLOCK_DEPTH = 20, e 100 não é pedível", () => {
  assert.equal(RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH, 20);

  /*
   * O TETO PROTEGE A QUALIDADE ANTES DO CUSTO.
   *
   * A coleta real com 100 devolveu 114 itens cuja cauda era derivação lateral —
   * maquiagem, produto avulso, limpeza profissional. Com cinco consultas isso
   * são centenas de ocorrências antes do dedupe, e o universo fica mais
   * ruidoso, não mais completo.
   */
  assert.ok(RADAR_YOUTUBE_MAX_BLOCK_DEPTH < 100, `pedir 100 continua possível: teto ${RADAR_YOUTUBE_MAX_BLOCK_DEPTH}`);

  const pedido = buildDataForSeoYoutubeRequest({
    keyword: "skincare para pele oleosa", locationCode: 2076, languageCode: "pt-BR",
    resultLimit: RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH, operationRequestId: "artigo-1:ytq:1",
  });
  assert.equal(pedido.body[0].block_depth, 20, "o endpoint de YouTube usa block_depth, não o depth do Google");

  assert.throws(() => buildDataForSeoYoutubeRequest({
    keyword: "x y", locationCode: 2076, languageCode: "pt-BR",
    resultLimit: 100, operationRequestId: "artigo-1:ytq:1",
  }), /limite da consulta de YouTube é inválido/);
});

test("§2 · NÃO EXPANDIR AUTOMATICAMENTE — não existe código que suba a profundidade sozinho", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8");
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /*
   * "Se a amostra comparável for insuficiente, expandir" é ação EXPLÍCITA de um
   * gate futuro. Um retry automático com profundidade maior gastaria de novo
   * sem ninguém ter pedido — e o segundo gasto não apareceria em lugar nenhum
   * como decisão.
   */
  for (const [nome, fonte] of [["rota", semComentarios(rota)], ["página", semComentarios(pagina)]] as const) {
    assert.equal(/resultLimit\s*[*+]|resultLimit\s*[-+*]=|RADAR_YOUTUBE_MAX_BLOCK_DEPTH\s*\)?\s*;?\s*$/m.test(fonte), false, `${nome} mexe na profundidade em runtime`);
  }
  /*
   * A rota só usa o teto como LIMITE do schema; ela nunca sobe para ele.
   * Fora da linha de `import`, a única ocorrência é dentro de `.max(`.
   */
  const usosDoTeto = semComentarios(rota).split("\n")
    .filter(linha => linha.includes("RADAR_YOUTUBE_MAX_BLOCK_DEPTH") && !linha.trimStart().startsWith("import"));
  assert.equal(usosDoTeto.length, 1, usosDoTeto.join(" | "));
  assert.ok(usosDoTeto[0].includes(".max(RADAR_YOUTUBE_MAX_BLOCK_DEPTH)"));
  assert.equal(semComentarios(pagina).includes("resultLimit"), false, "a tela nem escolhe profundidade: o padrão é do servidor");
});

test("§3 · `device` e `os` são o ECO do provider — a rota não os inventa", async () => {
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8"));

  /*
   * A rota NÃO manda `device` nem `os` na requisição — quem escolhe é a
   * configuração canônica do provider. Escrever "desktop" na proveniência
   * porque é o nosso palpite descreveria uma coleta que não aconteceu: a real
   * veio mobile/android.
   */
  const proveniencia = rota.slice(rota.indexOf("provider: \"dataforseo\""), rota.indexOf("collectedAt,"));
  assert.ok(proveniencia.includes("device: eco?.device"), "o device vem do eco da resposta");
  assert.ok(proveniencia.includes("os: eco?.os"));
  assert.equal(/device:\s*"/.test(proveniencia), false, "nenhum device literal na proveniência");
  assert.equal(/os:\s*"/.test(proveniencia), false, "nenhum os literal na proveniência");

  /* E a profundidade gravada é a que PEDIMOS, que é coisa diferente do eco. */
  assert.ok(proveniencia.includes("blockDepth: input.resultLimit"));
});

/* =================== §3 · os campos reais, normalizados ================== */

test("§3 · o payload REAL é lido inteiro — e cada campo vai para o seu lugar", () => {
  const { results, discarded, search } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");

  assert.equal(discarded, 0, "nenhum item do retorno real foi descartado");
  assert.equal(results.length, 14);

  /* O eco do provider sobre a própria coleta — §3, nível da coleta. */
  assert.deepEqual(search, {
    keyword: "skincare para pele oleosa",
    locationCode: 2076,
    languageCode: "pt-BR",
    device: "mobile",
    os: "android",
    blockDepth: 100,
    checkUrl: "https://m.youtube.com/results?search_query=skincare%20para%20pele%20oleosa",
    seResultsCount: 1476931,
    itemsCount: 114,
    cost: 0.01,
  });

  const primeiro = results[0];
  assert.equal(primeiro.videoId, "q40agCwCsdk");
  assert.equal(primeiro.title, "Pele Oleosa: Skincare da Manhã e da Noite (Passo a Passo)");
  assert.equal(primeiro.channelId, "UCyXAk6wNyu_mqCau-J2yCCw");
  assert.equal(primeiro.channelName, "Dra. Marina Hayashida");
  assert.equal(primeiro.channelUrl, "https://m.youtube.com/@DraMarinaHayashida");
  assert.ok(primeiro.channelLogo?.startsWith("https://yt3.ggpht.com/"));
  assert.ok(primeiro.thumbnailUrl?.startsWith("https://i.ytimg.com/"));
  assert.equal(primeiro.views, 39000);
  assert.equal(primeiro.durationSeconds, 879);
  assert.equal(primeiro.durationLabel, "14:39");
  assert.equal(primeiro.isShorts, false);
  assert.equal(primeiro.isLive, false);
  assert.equal(primeiro.isMovie, false);
  assert.deepEqual(primeiro.badges, ["4K"]);

  /* OS TRÊS RANKS SÃO TRÊS CAMPOS, e `rank` é o que a curadoria compara. */
  assert.equal(primeiro.rankGroup, 1);
  assert.equal(primeiro.rankAbsolute, 1);
  assert.equal(primeiro.blockRank, 2, "o bloco tem posição própria e ela não é a absoluta");
  assert.equal(primeiro.rank, 1);
});

test("§3 · `publication_date` é RÓTULO e `timestamp` é o INSTANTE — e eram o mesmo campo", () => {
  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");
  const primeiro = results[0];

  assert.equal(primeiro.publishedAtLabel, "há 7 meses", "o rótulo humano é preservado como rótulo");
  assert.equal(primeiro.publishedAt, "2026-02-14 18:50:57 +00:00");

  /*
   * O DEFEITO QUE A COLETA REAL REVELOU.
   *
   * Antes deste gate, "há 7 meses" caía em `publishedAt` — e qualquer conta de
   * recência lia isso como data inválida, em silêncio, porque os dois campos
   * são string. A regressão precisa de guarda própria.
   */
  for (const item of results) {
    if (item.publishedAt === null) continue;
    assert.ok(Number.isFinite(Date.parse(item.publishedAt)), `publishedAt não é instante legível: ${item.publishedAt}`);
    assert.equal(/^há /.test(item.publishedAt), false, "rótulo relativo não entra no campo de instante");
  }
});

test("§3 · `duration_time_seconds` do provider vence o rótulo que teríamos reparseado", () => {
  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");

  const longo = results.find(item => item.videoId === "FCHSnbrnQl4");
  assert.equal(longo?.durationSeconds, 1374);
  assert.equal(longo?.durationLabel, "22:54");

  /*
   * E QUANDO OS DOIS DISCORDAM, O NÚMERO DO PROVIDER É QUE VALE — ele é o dado,
   * o rótulo é a apresentação dele.
   */
  const divergente = normalizeDataForSeoYoutubeResponse({
    tasks: [{ result: [{ items: [{
      type: "youtube_video", rank_absolute: 1, title: "Divergente",
      url: "https://m.youtube.com/watch?v=zz1", video_id: "zz1",
      duration_time: "0:30", duration_time_seconds: 930,
    }] }] }],
  }, "ytq:abc");
  assert.equal(divergente.results[0].durationSeconds, 930);
  assert.equal(divergente.results[0].durationLabel, "0:30");
});

test("§3 · UNSUPPORTED_FIELDS_INVENTED = NO — o que o provider não mandou fica nulo", () => {
  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");

  /*
   * `description` VEM NULA EM TODOS OS 14 ITENS REAIS — e continua nula.
   *
   * Preencher com o título, ou com string vazia, faria o gate seguinte achar
   * que tem texto do concorrente para analisar quando não tem nada.
   */
  assert.ok(results.every(item => item.description === null), "NULL_DESCRIPTION_SUPPORTED");

  /*
   * E SILÊNCIO DO PROVIDER NÃO VIRA `false` — este é o caso que o payload real
   * não tem e que a próxima versão da API pode trazer.
   *
   * `isShorts: false` AFIRMA "não é Short", e um item sem o campo iria para a
   * coorte de long-form por omissão. `null` é "não sei", e "não sei" fica fora
   * das duas coortes.
   */
  const semFormato = normalizeDataForSeoYoutubeResponse({
    tasks: [{ result: [{ items: [{
      type: "youtube_video", rank_absolute: 1, title: "Sem formato declarado",
      url: "https://m.youtube.com/watch?v=semf", video_id: "semf",
    }] }] }],
  }, "ytq:abc").results[0];
  assert.equal(semFormato.isShorts, null);
  assert.equal(semFormato.isLive, null);
  assert.equal(semFormato.isMovie, null);
  assert.equal(semFormato.durationSeconds, null);
  assert.equal(radarYoutubeUniverseClass({ ...semFormato, badges: [] }).universeClass, "PARTIAL");

  /* E nada de inscritos, likes, comentários, capítulos ou transcript: o schema não os tem. */
  const campos = new Set(Object.keys(results[0]));
  for (const inventado of ["subscriberCount", "likes", "comments", "chapters", "transcript", "transcriptText"]) {
    assert.equal(campos.has(inventado), false, `campo inventado no resultado: ${inventado}`);
  }
});

test("§3 · o payload desembrulhado que o usuário inspecionou é lido igual ao envelope `tasks`", () => {
  /*
   * A API devolve `{ tasks: [...] }`; o que se lê no painel é UMA tarefa já
   * aberta. Aceitar só o envelope faria a fixture real ser lida como resposta
   * vazia — e a suíte validaria o normalizador contra algo que ninguém recebe.
   */
  const desembrulhado = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");
  const envelopado = normalizeDataForSeoYoutubeResponse({ tasks: [payloadReal] }, "ytq:abc");
  assert.deepEqual(envelopado.results, desembrulhado.results);
  assert.deepEqual(envelopado.search, desembrulhado.search);
});

/* ================= §4 · long-form e Shorts, nunca juntos ================= */

test("§4 · SHORT NÃO É RUÍDO — e `is_shorts` vence a duração", () => {
  assert.deepEqual([...RADAR_YOUTUBE_UNIVERSE_CLASSES], ["COMPARABLE_LONG_FORM", "COMPARABLE_SHORT", "PARTIAL", "NOT_RELEVANT"]);

  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");
  const universo = buildRadarYoutubeUniverse(results);
  const porId = new Map(universo.map(item => [item.videoId, item]));

  /*
   * OS DOIS CASOS QUE A COLETA REAL TROUXE E QUE O TETO DE 60s ERRARIA.
   *
   * `w5ISfsdsrzg` dura 1:42 e `bs5jX0BDLoE` dura 2:44 — e o YouTube entrega os
   * dois como Short. Classificá-los por segundos os jogaria na coorte de
   * long-form, e a comparação de "ordem dos blocos" passaria a incluir
   * microestrutura.
   */
  assert.ok(porId.get("w5ISfsdsrzg")!.durationSeconds! > RADAR_YOUTUBE_SHORT_MAX_SECONDS);
  assert.equal(porId.get("w5ISfsdsrzg")?.universeClass, "COMPARABLE_SHORT");
  assert.ok(porId.get("bs5jX0BDLoE")!.durationSeconds! > RADAR_YOUTUBE_SHORT_MAX_SECONDS);
  assert.equal(porId.get("bs5jX0BDLoE")?.universeClass, "COMPARABLE_SHORT");

  /* E o Short curto continua Short, e o tutorial continua long-form. */
  assert.equal(porId.get("ffHS13W2hOw")?.universeClass, "COMPARABLE_SHORT");
  assert.equal(porId.get("q40agCwCsdk")?.universeClass, "COMPARABLE_LONG_FORM");

  /* Nenhum item do retorno real foi jogado fora como "não editorial". */
  const contagem = radarYoutubeUniverseCounts(universo);
  assert.equal(contagem.NOT_RELEVANT, 0);
  assert.equal(contagem.comparable, contagem.total, "os 13 vídeos únicos competem, cada um na sua coorte");
});

test("§4 · ao vivo e filme saem das coortes — cada um pelo seu motivo", () => {
  const base = { videoId: "x", title: "x", url: "https://m.youtube.com/watch?v=x", badges: [] as string[] };

  /*
   * AO VIVO É PARCIAL: fala do assunto e não tem roteiro fechado. Não existe
   * hook, sequência nem CTA estáveis para comparar — ainda estão acontecendo.
   */
  const aoVivo = radarYoutubeUniverseClass({ ...base, durationSeconds: 3_600, isShorts: false, isLive: true, isMovie: false });
  assert.equal(aoVivo.universeClass, "PARTIAL");
  assert.match(aoVivo.reason, /ao vivo/i);

  /* FILME NÃO DISPUTA A INTENÇÃO editorial da busca — é outra categoria. */
  const filme = radarYoutubeUniverseClass({ ...base, durationSeconds: 5_400, isShorts: false, isLive: false, isMovie: true });
  assert.equal(filme.universeClass, "NOT_RELEVANT");
  assert.match(filme.reason, /filme/i);

  /*
   * E O MESMO VÍDEO, sem esses selos, seria long-form comparável — é o selo que
   * decide, não a duração.
   */
  assert.equal(
    radarYoutubeUniverseClass({ ...base, durationSeconds: 3_600, isShorts: false, isLive: false, isMovie: false }).universeClass,
    "COMPARABLE_LONG_FORM",
  );
});

test("§4 · LONG_FORM_SEPARATED e SHORTS_SEPARATED — as coortes são duas listas", () => {
  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");
  const coortes = radarYoutubeFormatCohorts(buildRadarYoutubeUniverse(results));

  assert.ok(coortes.longForm.length > 0);
  assert.ok(coortes.shorts.length > 0);
  assert.ok(coortes.longForm.every(item => item.universeClass === "COMPARABLE_LONG_FORM"));
  assert.ok(coortes.shorts.every(item => item.universeClass === "COMPARABLE_SHORT"));

  /* Nenhum vídeo em duas coortes — a separação é partição, não etiqueta. */
  const todos = [...coortes.longForm, ...coortes.shorts, ...coortes.partial, ...coortes.notRelevant].map(item => item.videoId);
  assert.equal(new Set(todos).size, todos.length);

  /*
   * A MÉDIA CONJUNTA NÃO DESCREVE NINGUÉM — e é por isso que a estrutura separa.
   *
   * Somando os dois formatos, a "duração típica" deste universo real fica entre
   * um Short e um tutorial: um número que nenhum dos dois grupos reconhece.
   */
  const media = (itens: typeof coortes.longForm) =>
    itens.reduce((total, item) => total + (item.durationSeconds || 0), 0) / itens.length;
  const mediaLong = media(coortes.longForm);
  const mediaShort = media(coortes.shorts);
  const mediaMisturada = media([...coortes.longForm, ...coortes.shorts]);
  assert.ok(mediaMisturada < mediaLong && mediaMisturada > mediaShort, "a média misturada não é de nenhum dos dois");
});

test("§4 · nenhuma função do domínio recebe as duas coortes para calcular junto", async () => {
  const modelo = await readFile(new URL("../lib/radar/youtube-search-model.ts", import.meta.url), "utf8");
  /*
   * A garantia não é lembrar: é não existir a lista misturada na mão de quem
   * calcula. `radarYoutubeFormatCohorts` é o único caminho para as coortes, e
   * `RADAR_YOUTUBE_COMPARABLE_CLASSES` existe para contar — nunca para somar
   * duração ou estrutura.
   */
  assert.deepEqual([...RADAR_YOUTUBE_COMPARABLE_CLASSES], ["COMPARABLE_LONG_FORM", "COMPARABLE_SHORT"]);
  assert.equal(/duracaoMedia|averageDuration|mediaDeDuracao/i.test(modelo), false, "não existe média de duração no domínio");
});

/* ==================== §5 · o dedupe na fixture real ===================== */

test("§5 · VIDEO_ID_DEDUPE_REAL_FIXTURE — o provider repetiu, e o universo não", () => {
  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");
  const universo = buildRadarYoutubeUniverse(results);

  /* O retorno real trouxe `VmcFzTc7GO0` duas vezes, nas posições 76 e 97. */
  assert.equal(results.filter(item => item.videoId === "VmcFzTc7GO0").length, 2);
  assert.equal(universo.filter(item => item.videoId === "VmcFzTc7GO0").length, 1);
  assert.equal(results.length, 14);
  assert.equal(universo.length, 13, "catorze itens, treze concorrentes");

  /*
   * A MESMA CONSULTA NÃO CONTA DUAS VEZES — e a duplicata do provider foi
   * dentro de UMA consulta só. Contá-la como duas frentes faria a recorrência
   * premiar um vídeo por um artefato da SERP.
   */
  const repetido = universo.find(item => item.videoId === "VmcFzTc7GO0");
  assert.equal(repetido?.occurrenceCount, 1);
  assert.deepEqual(repetido?.queriesFoundIn, ["ytq:abc"]);
  assert.equal(repetido?.bestRank, 76, "a melhor das duas posições é a que fica");
});

/* ================== §6 e §7 · o sinal, e só o sinal ==================== */

test("§6 · RECURRENCE_SIGNAL — recorrência é força observada, não verdade factual", () => {
  const base = { views: null, publishedAt: null, universeClass: "COMPARABLE_LONG_FORM" as const };

  const transversal = radarYoutubeCompetitiveSignal({ entry: { ...base, bestRank: 3, occurrenceCount: 3 }, totalQueries: 5 });
  const pontual = radarYoutubeCompetitiveSignal({ entry: { ...base, bestRank: 28, occurrenceCount: 1 }, totalQueries: 5 });

  assert.ok(transversal.score > pontual.score, "três frentes valem mais que uma na posição 28");
  assert.ok(transversal.reasons.some(item => /3 de 5 consultas/.test(item)));

  /*
   * CADA COMPONENTE PESA SOZINHO — e é preciso medi-los isolados.
   *
   * Comparar "rank 3 + três frentes" com "rank 28 + uma frente" continuaria
   * verdadeiro se um dos dois deixasse de pontuar: o outro sustentaria a
   * diferença sozinho, e o componente morto passaria despercebido.
   */
  const soRecorrencia = (occurrenceCount: number) =>
    radarYoutubeCompetitiveSignal({ entry: { ...base, bestRank: 15, occurrenceCount }, totalQueries: 5 }).score;
  assert.ok(soRecorrencia(3) > soRecorrencia(2), "três frentes valem mais que duas, com o mesmo rank");
  assert.ok(soRecorrencia(2) > soRecorrencia(1), "duas valem mais que uma, com o mesmo rank");

  const soRank = (bestRank: number) =>
    radarYoutubeCompetitiveSignal({ entry: { ...base, bestRank, occurrenceCount: 1 }, totalQueries: 5 }).score;
  assert.ok(soRank(2) > soRank(7), "o topo vale mais que a primeira tela, com a mesma recorrência");
  assert.ok(soRank(7) > soRank(30), "a primeira tela vale mais que a cauda, com a mesma recorrência");

  /*
   * O SINAL EXPLICA-SE — e é isso que o mantém sinal.
   *
   * Um nível sem motivos seria um veredito: quem opera não teria como discordar
   * e acabaria aceitando a ordenação como se fosse fato.
   */
  assert.ok(transversal.reasons.length >= 3);
  for (const motivo of transversal.reasons) assert.ok(motivo.length > 5);

  /* E ele NÃO seleciona: a função devolve nível e razões, nunca uma escolha. */
  assert.deepEqual(Object.keys(transversal).sort(), ["level", "reasons", "score"]);
});

test("§7 · os sinais de pré-curadoria saem todos da SERP — nenhum transcript", () => {
  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:abc");
  const universo = buildRadarYoutubeUniverse(results);
  const coletadoEm = "2026-09-14T18:51:07.000Z";

  for (const entrada of universo) {
    const sinal = radarYoutubeCompetitiveSignal({ entry: entrada, totalQueries: 5, collectedAt: coletadoEm });
    assert.ok(["FORTE", "MEDIO", "OBSERVAR"].includes(sinal.level));
    /* rank, recorrência, views, recência e formato — tudo já entregue pela SERP. */
    assert.ok(sinal.reasons.some(item => /posição/.test(item)));
    assert.ok(sinal.reasons.some(item => /consultas/.test(item)));
  }

  /* O vídeo do topo, recente e transversal, é o que sobe. */
  const topo = universo.find(item => item.videoId === "q40agCwCsdk")!;
  const cauda = universo.find(item => item.videoId === "52pwr1sUtmc")!;
  const sinalTopo = radarYoutubeCompetitiveSignal({ entry: topo, totalQueries: 5, collectedAt: coletadoEm });
  const sinalCauda = radarYoutubeCompetitiveSignal({ entry: cauda, totalQueries: 5, collectedAt: coletadoEm });
  assert.ok(sinalTopo.score > sinalCauda.score, `topo ${sinalTopo.score} vs cauda ${sinalCauda.score}`);
  assert.ok(sinalTopo.reasons.some(item => /último ano/.test(item)), "recência entra como sinal");
});

test("§7 · a recência se mede contra a COLETA, não contra o relógio de quem abre", () => {
  const entrada = {
    bestRank: 1, occurrenceCount: 1, views: null,
    publishedAt: "2026-02-14 18:50:57 +00:00", universeClass: "COMPARABLE_LONG_FORM" as const,
  };

  /*
   * Um universo gravado hoje precisa ser lido daqui a um ano com os MESMOS
   * números. Usar `Date.now()` faria o mesmo dado mudar de sinal sozinho, e a
   * pessoa veria a ordem trocar sem nada ter acontecido.
   */
  const naColeta = radarYoutubeCompetitiveSignal({ entry: entrada, totalQueries: 5, collectedAt: "2026-09-14T18:51:07.000Z" });
  const cincoAnosDepois = radarYoutubeCompetitiveSignal({ entry: entrada, totalQueries: 5, collectedAt: "2031-09-14T18:51:07.000Z" });
  assert.ok(naColeta.reasons.some(item => /último ano/.test(item)));
  assert.ok(cincoAnosDepois.reasons.some(item => /mais de dois anos/.test(item)));

  /* Sem referência de coleta, recência simplesmente não pontua — não inventa. */
  const semReferencia = radarYoutubeCompetitiveSignal({ entry: entrada, totalQueries: 5 });
  assert.equal(semReferencia.reasons.some(item => /ano/.test(item)), false);
});

test("§6 · ausência de campo não PENALIZA — ela só não pontua", () => {
  const comViews = radarYoutubeCompetitiveSignal({
    entry: { bestRank: 5, occurrenceCount: 1, views: 500, publishedAt: null, universeClass: "COMPARABLE_SHORT" },
    totalQueries: 3,
  });
  const semViews = radarYoutubeCompetitiveSignal({
    entry: { bestRank: 5, occurrenceCount: 1, views: null, publishedAt: null, universeClass: "COMPARABLE_SHORT" },
    totalQueries: 3,
  });

  /*
   * O provider não informar visualizações é falha da FONTE, não demérito do
   * vídeo. Descontar por isso puniria o concorrente pelo silêncio da API.
   */
  assert.equal(semViews.score, comViews.score);
  assert.ok(semViews.reasons.some(item => /não informou visualizações/.test(item)));
});

/* =========================== §9 · o que a tela mostra ==================== */

test("§9 · a tela mostra o que decide curadoria — e não despeja JSON técnico", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");

  /* Os sinais que o §9 pede, cada um com o seu lugar. */
  for (const marca of ["radar-youtube-thumb", "radar-youtube-class", "radar-youtube-signal", "radar-youtube-provenance"]) {
    assert.ok(painel.includes(marca), `a tela não mostra ${marca}`);
  }
  assert.ok(painel.includes("video.channelName"));
  assert.ok(painel.includes("video.bestRank"));
  assert.ok(painel.includes("duracaoLegivel"));
  assert.ok(painel.includes("visualizacoesLegiveis"));

  /* As duas coortes aparecem separadas na tela, como no domínio. */
  assert.ok(painel.includes("radar-youtube-cohort-long-form"));
  assert.ok(painel.includes("radar-youtube-cohort-shorts"));

  /*
   * NADA DE JSON CRU NA VISÃO NORMAL.
   *
   * `JSON.stringify` num card transformaria a curadoria em leitura de payload —
   * exatamente o que o §9 proíbe. Proveniência técnica existe, e fica dentro do
   * `<details>`.
   */
  assert.equal(painel.includes("JSON.stringify"), false);
  assert.ok(painel.includes("<details"), "a proveniência técnica fica um nível abaixo");
});

/* ================== §10 · o que ainda NÃO é deste gate ================== */

test("§10 · nenhum caminho aqui busca transcript, capítulos, likes ou inscritos", async () => {
  const fontes = await Promise.all([
    readFile(new URL("../lib/radar/youtube-search-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/radar/youtube-search-run.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/dataforseo-youtube-operation.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8"),
  ]);

  /*
   * Um campo vazio esperando o YOUTUBE_SEARCH_2 é um convite a preenchê-lo
   * antes da hora — e um botão desabilitado, um convite a clicá-lo.
   */
  for (const fonte of fontes.map(semComentarios)) {
    assert.equal(/subscriber_count|subscriberCount|likes_count|comments_count|\bchapters\b/i.test(fonte), false);
  }

  /*
   * O BLUEPRINT CHEGOU NO YOUTUBE_SEARCH_2 — e a proibição que sobra é outra.
   *
   * O que continua vetado é PEDIR transcript, mídia ou fala: o blueprint é
   * leitura de SERP e não baixa nada. Proibir a palavra "blueprint" agora
   * apagaria o gate seguinte em vez de proteger o anterior.
   */
  const painel = semComentarios(fontes[4]);
  assert.equal(/fetchTranscript|requestTranscript|extractVideoText|speechToText|downloadMedia/i.test(painel), false, "a tela não pede transcript, mídia nem fala");
  assert.equal(/await fetch\(/.test(painel), false, "e o painel não chama rede nenhuma");
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
