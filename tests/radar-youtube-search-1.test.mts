import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_YOUTUBE_MAX_QUERIES,
  buildRadarYoutubeQueryPlan,
  radarYoutubeQueryId,
  radarYoutubeQueryKey,
} from "../lib/radar/youtube-search-queries.ts";
import {
  RADAR_YOUTUBE_SHORT_MAX_SECONDS,
  RadarYoutubeSearchResultSchema,
  buildRadarYoutubeUniverse,
  radarYoutubeUniverseClass,
  radarYoutubeUniverseCounts,
} from "../lib/radar/youtube-search-model.ts";
import {
  RADAR_YOUTUBE_PROVIDER_ENDPOINT,
  buildRadarYoutubeRunFingerprint,
  buildRadarYoutubeSearchRun,
  radarYoutubeApplySelection,
  radarYoutubeResetPatch,
  radarYoutubeRunSummary,
} from "../lib/radar/youtube-search-run.ts";
import {
  DATAFORSEO_YOUTUBE_ENDPOINT,
  normalizeDataForSeoYoutubeResponse,
  radarYoutubeDurationSeconds,
  radarYoutubeVideoIdFromUrl,
} from "../lib/server/dataforseo-youtube-operation.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ======  YOUTUBE_SEARCH_1 · COLETA REAL + UNIVERSO COMPETITIVO  ==========
 *
 * A pergunta que este gate responde é "quem compete DENTRO do YouTube por esta
 * intenção" — e ela não é a pergunta da área Vídeos, que é "o que a marca
 * escolheu para enriquecer o artigo". Confundir as duas faria o benchmark
 * comparar a marca com o próprio acervo.
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

/* ================================ a fixture ============================== */

const keyword = (text: string | null, role: "principal" | "secundaria" | "reforco_narrativo", keywordId: string) => ({
  identity: { keywordId, canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: null, text, role },
  strategy: {
    volume: null, resultCount: null, kgrScore: null, incrementalVolume: null, contribution: null,
    normalizedIntent: null, coveredIntentions: [], strategicContribution: null, purpose: null,
    overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: null,
    semanticQualification: null,
  },
  resolution: "FULL" as const,
});

const contexto = (patch: Partial<{ intent: string | null; topics: string[]; principal: string | null; secundarias: string[] }> = {}) => ({
  state: "COMPLETE" as const,
  article: {
    brandId: "marca-1",
    articleId: "artigo-1",
    articleDnaVersionId: "dna-1",
    articleDnaContentHash: "hash-1",
    promise: "Skincare para pele oleosa",
    mainIntent: "informacional",
    hierarchy: "Suporte",
    classification: patch.intent === undefined
      ? { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "fixture" }
      : patch.intent === null ? null
        : { intent: patch.intent, intentLabel: patch.intent, funnel: "TOP", funnelLabel: "Topo", reason: "fixture" },
  },
  keywords: [
    keyword(patch.principal === undefined ? "skincare para pele oleosa" : patch.principal, "principal", "kw-1"),
    ...(patch.secundarias ?? ["acne e pele oleosa"]).map((texto, indice) => keyword(texto, "secundaria", `kw-${indice + 2}`)),
  ],
  editorialTopics: patch.topics ?? ["como controlar oleosidade da pele"],
  resolvedKeywordTexts: [],
  silo: null,
  formationSerp: null,
  internalLinks: null,
  limitations: [],
}) as unknown as RadarArticleResearchContext;

/* =========================== §3 · as consultas =========================== */

test("§3 · MULTI_QUERY — o plano nasce do ArticleDNA, não de uma keyword só", () => {
  const plano = buildRadarYoutubeQueryPlan({ context: contexto() });
  const textos = plano.queries.map(item => item.text);

  assert.ok(plano.queries.length >= 4, `MULTI_QUERY = YES: ${textos.join(" | ")}`);
  assert.equal(textos[0], "skincare para pele oleosa", "a principal vem primeiro, verbatim");

  /* O ENQUADRAMENTO É O QUE SEPARA BUSCAR NO YOUTUBE DE BUSCAR NO GOOGLE. */
  assert.ok(textos.includes("como skincare para pele oleosa"));
  assert.ok(textos.includes("rotina skincare para pele oleosa"));
  assert.ok(textos.includes("como controlar oleosidade da pele"), "o tópico editorial vira consulta");
  assert.ok(textos.includes("acne e pele oleosa"), "a secundária amplia o universo");

  /* Cada consulta declara de onde veio e por quê — o plano é auditável. */
  for (const consulta of plano.queries) {
    assert.ok(consulta.reason.length > 10, `sem motivo: ${consulta.text}`);
    assert.ok(consulta.origin, `sem origem: ${consulta.text}`);
  }
});

test("§3 · o plano é DETERMINÍSTICO: mesmo contexto, mesmas consultas e mesmos ids", () => {
  const primeiro = buildRadarYoutubeQueryPlan({ context: contexto() });
  const segundo = buildRadarYoutubeQueryPlan({ context: contexto() });
  assert.deepEqual(primeiro, segundo);

  /* O id deriva do TEXTO, nunca de um contador: ele sobrevive à ordem mudar. */
  for (const consulta of primeiro.queries) {
    assert.equal(consulta.queryId, radarYoutubeQueryId(consulta.text));
  }
  assert.equal(radarYoutubeQueryId("Como  SKINCARE"), radarYoutubeQueryId("como skincare"), "acento, caixa e espaço não criam consulta nova");
});

test("§3 · o enquadramento muda com a intenção que o Arquiteto fechou", () => {
  const comercial = buildRadarYoutubeQueryPlan({ context: contexto({ intent: "COMMERCIAL_INVESTIGATION" }) }).queries.map(item => item.text);
  assert.ok(comercial.includes("resenha skincare para pele oleosa"));
  assert.ok(comercial.includes("comparativo skincare para pele oleosa"));
  assert.equal(comercial.includes("como skincare para pele oleosa"), false, "intenção comercial não busca tutorial");

  /* O vocabulário legado em português vale tanto quanto o terminal. */
  const legado = buildRadarYoutubeQueryPlan({ context: contexto({ intent: "comercial" }) }).queries.map(item => item.text);
  assert.ok(legado.includes("resenha skincare para pele oleosa"), `o mainIntent legado também enquadra: ${legado.join(" | ")}`);

  /*
   * SEM CLASSIFICAÇÃO TERMINAL, a autoridade cai no `mainIntent` do artigo —
   * que nesta fixture é "informacional". O enquadramento continua o de
   * informação, e nada é declarado como faltando porque nada faltou.
   */
  const semTerminal = buildRadarYoutubeQueryPlan({ context: contexto({ intent: null }) });
  assert.ok(semTerminal.queries.map(item => item.text).includes("como skincare para pele oleosa"));
  assert.equal(semTerminal.limitations.some(item => /intenção/.test(item)), false, "o mainIntent respondeu: não há ausência a declarar");

  /*
   * E UMA INTENÇÃO QUE NINGUÉM SABE LER É DITA — não silenciada.
   *
   * Calar isto faria a tela sugerir que a intenção do artigo foi considerada
   * quando ela só não foi reconhecida.
   */
  const desconhecida = buildRadarYoutubeQueryPlan({ context: contexto({ intent: "INTENCAO_QUE_NAO_EXISTE" }) });
  assert.ok(desconhecida.queries.map(item => item.text).includes("como skincare para pele oleosa"));
  assert.ok(desconhecida.limitations.some(item => /não corresponde a nenhum enquadramento/.test(item)));
});

test("§3 · consulta repetida não entra duas vezes, e o teto do custo é respeitado", () => {
  /* O tópico editorial repete a principal: pagar duas vezes pelo mesmo texto. */
  const plano = buildRadarYoutubeQueryPlan({ context: contexto({ topics: ["Skincare Para Pele Oleosa", "rotina noturna"] }) });
  const chaves = plano.queries.map(item => radarYoutubeQueryKey(item.text));
  assert.equal(new Set(chaves).size, chaves.length, "nenhuma consulta repetida");
  assert.ok(plano.queries.length <= RADAR_YOUTUBE_MAX_QUERIES);

  const comTeto = buildRadarYoutubeQueryPlan({ context: contexto({ topics: ["a", "b", "c", "d", "e", "f", "g"] }), limit: 3 });
  assert.equal(comTeto.queries.length, 3);

  /*
   * O TETO PADRÃO É O QUE VALE QUANDO NINGUÉM PASSA `limit` — e é ele que a
   * tela usa. Cada consulta é uma chamada paga: um START não gasta mais que
   * `RADAR_YOUTUBE_MAX_QUERIES`, e subir esse número é decisão humana, não
   * consequência de um artigo com muitos tópicos.
   */
  assert.ok(RADAR_YOUTUBE_MAX_QUERIES <= 6, `o teto padrão de custo por START subiu para ${RADAR_YOUTUBE_MAX_QUERIES}`);
  const semTeto = buildRadarYoutubeQueryPlan({
    context: contexto({ topics: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], secundarias: ["k", "l", "m"] }),
  });
  assert.equal(semTeto.queries.length, RADAR_YOUTUBE_MAX_QUERIES, "sem `limit`, quem limita é o teto padrão");
});

test("§3 · ausência de tópico editorial é declarada, não silenciada", () => {
  /*
   * O plano fica menor e continua VÁLIDO — mas quem lê o universo precisa
   * saber que ele não cobriu tópico nenhum, ou vai concluir que os tópicos não
   * têm concorrência em vídeo quando eles só não foram perguntados.
   */
  const semTopicos = buildRadarYoutubeQueryPlan({ context: contexto({ topics: [] }) });
  assert.ok(semTopicos.queries.length > 0, "sem tópico ainda há principal e enquadramento");
  assert.equal(semTopicos.queries.some(item => item.origin === "EDITORIAL_TOPIC"), false);
  assert.ok(semTopicos.limitations.some(item => /tópicos editoriais/.test(item)));

  const comTopicos = buildRadarYoutubeQueryPlan({ context: contexto() });
  assert.equal(comTopicos.limitations.some(item => /tópicos editoriais/.test(item)), false, "a limitação não é fixa");
});

test("§3 · a keyword principal não volta pela porta das secundárias", () => {
  /*
   * DUAS KEYWORDS COM PAPEL `principal` É ANOMALIA DE DADO — e o plano não pode
   * transformá-la em consulta rotulada como secundária, porque o rótulo é o que
   * explica à pessoa por que a consulta existe. A primeira é a central; a outra
   * não vira "amplia o universo".
   */
  const duasPrincipais = buildRadarYoutubeQueryPlan({
    context: {
      ...contexto(),
      keywords: [
        keyword("skincare para pele oleosa", "principal", "kw-1"),
        keyword("skincare oleosa passo a passo", "principal", "kw-9"),
      ],
    } as unknown as RadarArticleResearchContext,
  });

  const textos = duasPrincipais.queries.map(item => item.text);
  assert.ok(textos.includes("skincare para pele oleosa"));
  assert.equal(textos.includes("skincare oleosa passo a passo"), false, "a segunda principal não entra como secundária");
  assert.equal(duasPrincipais.queries.some(item => item.origin === "SECONDARY_KEYWORD"), false);
});

test("§3 · sem keyword principal não há plano — e a ausência é declarada", () => {
  const plano = buildRadarYoutubeQueryPlan({ context: contexto({ principal: null }) });
  assert.deepEqual(plano.queries, []);
  assert.ok(plano.limitations.some(item => /keyword principal/.test(item)));
});

/* ========================= §5 · a normalização ========================== */

const item = (patch: Record<string, unknown> = {}) => ({
  type: "youtube_video",
  rank_absolute: 1,
  title: "Rotina completa para pele oleosa",
  url: "https://www.youtube.com/watch?v=abc123",
  video_id: "abc123",
  channel_name: "Canal Derma",
  channel_id: "UC123",
  duration_time: "12:34",
  views_count: 154_320,
  publication_date: "2026-02-10",
  description: "Passo a passo completo.",
  thumbnail_url: "https://i.ytimg.com/vi/abc123/hq.jpg",
  ...patch,
});

const resposta = (itens: unknown[]) => ({ tasks: [{ result: [{ items: itens }] }] });

test("§5 · o que veio é traduzido, e o que não veio fica NULO", () => {
  const { results, discarded } = normalizeDataForSeoYoutubeResponse(resposta([
    item(),
    item({ video_id: "sem-extras", url: "https://www.youtube.com/watch?v=sem-extras", rank_absolute: 2, channel_name: null, duration_time: null, views_count: null, publication_date: null, description: null, thumbnail_url: null }),
  ]), "ytq:abc");

  assert.equal(discarded, 0);
  assert.equal(results[0].videoId, "abc123");
  assert.equal(results[0].durationSeconds, 754);
  assert.equal(results[0].views, 154_320);
  assert.equal(results[0].channelName, "Canal Derma");
  assert.equal(results[0].queryId, "ytq:abc", "a proveniência da consulta nasce na normalização");

  /*
   * AUSENTE É `null`, NUNCA `0` NEM "".
   *
   * `views: 0` afirmaria que ninguém viu o vídeo; o que aconteceu foi o
   * provider não informar. São coisas diferentes, e o §5 proíbe a primeira.
   */
  assert.equal(results[1].views, null);
  assert.equal(results[1].durationSeconds, null);
  assert.equal(results[1].channelName, null);
  assert.equal(results[1].publishedAt, null);
});

test("§5 · item sem identidade é descartado, e o descarte é contado", () => {
  const { results, discarded } = normalizeDataForSeoYoutubeResponse(resposta([
    item(),
    { type: "youtube_video", title: "sem url nem id", rank_absolute: 2 },
    { nada: true },
    /* O provider já devolveu buraco e string no meio de `items`: nem objeto é. */
    null,
    "lixo",
  ]), "ytq:abc");

  assert.equal(results.length, 1);
  assert.equal(discarded, 4, "descarte silencioso não existe: ele é contado");
});

test("§5 · o videoId sai da URL quando o provider não o nomeia", () => {
  assert.equal(radarYoutubeVideoIdFromUrl("https://www.youtube.com/watch?v=abc123"), "abc123");
  assert.equal(radarYoutubeVideoIdFromUrl("https://youtu.be/abc123"), "abc123");
  assert.equal(radarYoutubeVideoIdFromUrl("https://www.youtube.com/shorts/xyz789"), "xyz789");
  assert.equal(radarYoutubeVideoIdFromUrl("https://vimeo.com/123"), null, "outro domínio não vira vídeo do YouTube");
  assert.equal(radarYoutubeVideoIdFromUrl(null), null);
});

test("§5 · a duração só vira número quando o formato é reconhecível", () => {
  assert.equal(radarYoutubeDurationSeconds("12:34"), 754);
  assert.equal(radarYoutubeDurationSeconds("1:02:03"), 3_723);
  assert.equal(radarYoutubeDurationSeconds("0:45"), 45);
  /* Estimar aqui faria a separação entre Short e tutorial mentir. */
  assert.equal(radarYoutubeDurationSeconds("doze minutos"), null);
  assert.equal(radarYoutubeDurationSeconds(null), null);
});

/* ===================== §6 · o dedupe e a proveniência ==================== */

const resultado = (patch: Record<string, unknown>) => RadarYoutubeSearchResultSchema.parse({
  videoId: "abc123", url: "https://www.youtube.com/watch?v=abc123", title: "Rotina completa",
  rank: 1, queryId: "ytq:1", durationSeconds: 754, badges: [], ...patch,
});

test("§6 · VIDEO_ID_DEDUPE — o mesmo vídeo em quatro consultas é UM concorrente", () => {
  const universo = buildRadarYoutubeUniverse([
    resultado({ queryId: "ytq:1", rank: 3 }),
    resultado({ queryId: "ytq:2", rank: 1 }),
    resultado({ queryId: "ytq:3", rank: 7 }),
    resultado({ videoId: "outro", url: "https://www.youtube.com/watch?v=outro", queryId: "ytq:1", rank: 2 }),
  ]);

  assert.equal(universo.length, 2, "VIDEO_ID_DEDUPE = YES");

  const repetido = universo.find(entrada => entrada.videoId === "abc123");
  assert.ok(repetido);
  assert.equal(repetido.occurrenceCount, 3);
  assert.equal(repetido.bestRank, 1, "a melhor posição de qualquer consulta");
  /* QUERY_PROVENANCE_PRESERVED: nada é substituído pela melhor posição. */
  assert.deepEqual(repetido.queriesFoundIn, ["ytq:1", "ytq:2", "ytq:3"]);
  assert.deepEqual(repetido.allRanks, [
    { queryId: "ytq:1", rank: 3 },
    { queryId: "ytq:2", rank: 1 },
    { queryId: "ytq:3", rank: 7 },
  ]);
});

test("§6 · a mesma consulta não conta o mesmo vídeo duas vezes", () => {
  const universo = buildRadarYoutubeUniverse([
    resultado({ queryId: "ytq:1", rank: 3 }),
    resultado({ queryId: "ytq:1", rank: 9 }),
  ]);
  assert.equal(universo[0].occurrenceCount, 1);
  assert.equal(universo[0].allRanks.length, 1);
});

test("§6 · o campo mais completo vence quando duas consultas descrevem o mesmo vídeo", () => {
  const universo = buildRadarYoutubeUniverse([
    resultado({ queryId: "ytq:1", rank: 2, channelName: null, durationSeconds: null, views: null }),
    resultado({ queryId: "ytq:2", rank: 5, channelName: "Canal Derma", durationSeconds: 754, views: 100 }),
  ]);
  /* Descartar a segunda leitura perderia dado que o provider já entregou. */
  assert.equal(universo[0].channelName, "Canal Derma");
  assert.equal(universo[0].durationSeconds, 754);
  assert.equal(universo[0].views, 100);
});

test("§6 · a ordem é de mérito competitivo, não de chegada", () => {
  const universo = buildRadarYoutubeUniverse([
    resultado({ videoId: "c", url: "https://www.youtube.com/watch?v=c", queryId: "ytq:1", rank: 9 }),
    resultado({ videoId: "a", url: "https://www.youtube.com/watch?v=a", queryId: "ytq:1", rank: 1 }),
    resultado({ videoId: "b", url: "https://www.youtube.com/watch?v=b", queryId: "ytq:1", rank: 5 }),
    resultado({ videoId: "b", url: "https://www.youtube.com/watch?v=b", queryId: "ytq:2", rank: 5 }),
  ]);
  assert.deepEqual(universo.map(entrada => entrada.videoId), ["a", "b", "c"]);

  /*
   * EMPATE NO RANK SE DESEMPATA POR FRENTES DISPUTADAS — §6.
   *
   * Dois vídeos na mesma posição não são equivalentes: o que apareceu em três
   * consultas compete em três frentes. Cair no desempate alfabético aqui
   * esconderia justamente o vídeo mais transversal do universo.
   */
  const empate = buildRadarYoutubeUniverse([
    resultado({ videoId: "zz", url: "https://www.youtube.com/watch?v=zz", queryId: "ytq:1", rank: 2 }),
    resultado({ videoId: "zz", url: "https://www.youtube.com/watch?v=zz", queryId: "ytq:2", rank: 2 }),
    resultado({ videoId: "zz", url: "https://www.youtube.com/watch?v=zz", queryId: "ytq:3", rank: 4 }),
    resultado({ videoId: "aa", url: "https://www.youtube.com/watch?v=aa", queryId: "ytq:1", rank: 2 }),
  ]);
  assert.deepEqual(empate.map(entrada => entrada.bestRank), [2, 2], "o empate é real");
  assert.deepEqual(empate.map(entrada => entrada.videoId), ["zz", "aa"], "quem disputa mais frentes vem antes, mesmo com id maior");
});

/* ====================== §7 · o universo competitivo ===================== */

test("§7 · os critérios são de YouTube — formato, não estrutura de página", () => {
  const tutorial = radarYoutubeUniverseClass({ videoId: "a", title: "Rotina", url: "https://www.youtube.com/watch?v=a", durationSeconds: 754, badges: [] });
  assert.equal(tutorial.universeClass, "COMPARABLE_LONG_FORM");

  /* No teto do formato curto ainda é curto — a fronteira é inclusiva. */
  const short = radarYoutubeUniverseClass({ videoId: "b", title: "Dica", url: "https://www.youtube.com/shorts/b", durationSeconds: RADAR_YOUTUBE_SHORT_MAX_SECONDS, badges: [] });
  assert.equal(short.universeClass, "COMPARABLE_SHORT");

  const aoVivo = radarYoutubeUniverseClass({ videoId: "c", title: "Live", url: "https://www.youtube.com/watch?v=c", durationSeconds: 3_600, badges: ["AO VIVO"] });
  assert.equal(aoVivo.universeClass, "PARTIAL");

  const playlist = radarYoutubeUniverseClass({ videoId: "d", title: "Coleção", url: "https://www.youtube.com/playlist?list=PL1", durationSeconds: null, badges: [] });
  assert.equal(playlist.universeClass, "NOT_RELEVANT");

  /*
   * O SELO DECIDE MESMO QUANDO A URL PARECE DE VÍDEO — e ele vem antes de tudo.
   *
   * Um anúncio com duração longa passaria como tutorial comparável se só a URL
   * fosse olhada, e entraria no benchmark como se disputasse a intenção.
   */
  const anuncio = radarYoutubeUniverseClass({ videoId: "f", title: "Compre já", url: "https://www.youtube.com/watch?v=f", durationSeconds: 900, badges: ["Patrocinado"] });
  assert.equal(anuncio.universeClass, "NOT_RELEVANT");
  assert.match(anuncio.reason, /Patrocinado/i);

  /* SEM DURAÇÃO E SEM FORMATO não se escolhe coorte — e chutar seria pior. */
  const semDuracao = radarYoutubeUniverseClass({ videoId: "e", title: "?", url: "https://www.youtube.com/watch?v=e", durationSeconds: null, badges: [] });
  assert.equal(semDuracao.universeClass, "PARTIAL");
  assert.match(semDuracao.reason, /não informou duração nem formato/);
});

test("§7 · cada classe carrega o motivo, e a contagem fecha com o universo", () => {
  const universo = buildRadarYoutubeUniverse([
    resultado({ videoId: "a", url: "https://www.youtube.com/watch?v=a", queryId: "ytq:1", rank: 1, durationSeconds: 754 }),
    resultado({ videoId: "b", url: "https://www.youtube.com/watch?v=b", queryId: "ytq:1", rank: 2, durationSeconds: 30 }),
    resultado({ videoId: "c", url: "https://www.youtube.com/playlist?list=PL1", queryId: "ytq:1", rank: 3, durationSeconds: null }),
    resultado({ videoId: "d", url: "https://www.youtube.com/watch?v=d", queryId: "ytq:1", rank: 4, durationSeconds: null }),
  ]);

  for (const entrada of universo) assert.ok(entrada.universeReason.length > 10, `sem motivo: ${entrada.videoId}`);

  const contagem = radarYoutubeUniverseCounts(universo);
  /* 754s é long-form; 30s é curto; a playlist não disputa; o sem-duração é parcial. */
  assert.deepEqual(contagem, { COMPARABLE_LONG_FORM: 1, COMPARABLE_SHORT: 1, PARTIAL: 1, NOT_RELEVANT: 1, total: 4, comparable: 2 });
});

/* ================= §1, §8, §9 e §11 · a corrida e o resto ================ */

const corridaDe = (patch: Partial<Parameters<typeof buildRadarYoutubeSearchRun>[0]> = {}) => {
  const plano = buildRadarYoutubeQueryPlan({ context: contexto() });
  const resultados = [
    resultado({ videoId: "a", url: "https://www.youtube.com/watch?v=a", queryId: plano.queries[0].queryId, rank: 1, durationSeconds: 754 }),
    resultado({ videoId: "b", url: "https://www.youtube.com/watch?v=b", queryId: plano.queries[1].queryId, rank: 2, durationSeconds: 30 }),
    resultado({ videoId: "a", url: "https://www.youtube.com/watch?v=a", queryId: plano.queries[1].queryId, rank: 4, durationSeconds: 754 }),
  ];
  const universe = buildRadarYoutubeUniverse(resultados);

  return buildRadarYoutubeSearchRun({
    runId: "run-1",
    runVersion: 1,
    startedAt: "2026-09-14T10:00:00.000Z",
    startedBy: "usuario-1",
    fingerprint: buildRadarYoutubeRunFingerprint({
      articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "hash-1",
      queryIds: plano.queries.map(consulta => consulta.queryId),
    }),
    provenance: {
      provider: "dataforseo", endpoint: "/v3/serp/youtube/organic/live/advanced",
      locationCode: 2076, languageCode: "pt",
      queriesRequested: plano.queries.length, queriesSucceeded: 2, queriesFailed: 0,
      failures: [], collectedAt: "2026-09-14T10:00:05.000Z",
    },
    queries: plano.queries.map((consulta, indice) => ({
      queryId: consulta.queryId, text: consulta.text, origin: consulta.origin,
      sourceRef: consulta.sourceRef, reason: consulta.reason,
      resultCount: indice < 2 ? 2 : 0, executed: indice < 2, failureReason: null,
    })),
    results: resultados,
    universe,
    limitations: plano.limitations,
    ...patch,
  });
};

test("§1 · a corrida tem identidade própria, e o fingerprint é do que ENTROU", () => {
  const corrida = corridaDe();
  assert.equal(corrida.researchMode, "YOUTUBE");
  assert.equal(corrida.state, "COLLECTED");
  assert.equal(corrida.fingerprint.articleId, "artigo-1");
  assert.equal(corrida.fingerprint.articleDnaVersionId, "dna-1");
  assert.match(corrida.fingerprint.signature, /^ytrun:[0-9a-f]{8}$/);

  /* A ordem de execução não muda a pergunta: o fingerprint ordena os ids. */
  const umaOrdem = buildRadarYoutubeRunFingerprint({ articleId: "a", articleDnaVersionId: "v", queryIds: ["ytq:2", "ytq:1"] });
  const outraOrdem = buildRadarYoutubeRunFingerprint({ articleId: "a", articleDnaVersionId: "v", queryIds: ["ytq:1", "ytq:2"] });
  assert.equal(umaOrdem.signature, outraOrdem.signature);

  /* E outra versão do ArticleDNA é outra pergunta. */
  const outraVersao = buildRadarYoutubeRunFingerprint({ articleId: "a", articleDnaVersionId: "v2", queryIds: ["ytq:1"] });
  assert.notEqual(outraVersao.signature, umaOrdem.signature);
});

test("§1 · coleta sem nenhuma consulta respondida NÃO é coleta vazia", () => {
  /*
   * As duas terminam com universo zerado e pedem ações opostas: "o YouTube não
   * devolveu nada" e "não conseguimos perguntar".
   */
  const falhou = corridaDe({
    provenance: {
      provider: "dataforseo", endpoint: "/v3/serp/youtube/organic/live/advanced",
      locationCode: 2076, languageCode: "pt",
      queriesRequested: 4, queriesSucceeded: 0, queriesFailed: 4,
      failures: [{ queryId: "ytq:1", reason: "A DataForSEO retornou HTTP 429." }],
      collectedAt: "2026-09-14T10:00:05.000Z",
    },
  });
  assert.equal(falhou.state, "COLLECTION_FAILED");
  assert.equal(falhou.provenance.failures.length, 1, "a falha é nomeada por consulta");
});

test("§9 · o resumo da aba é curto, e não carrega hash nem debug", () => {
  const resumo = radarYoutubeRunSummary(corridaDe());
  assert.ok(resumo);
  assert.equal(resumo.queriesExecuted, 2);
  assert.equal(resumo.rawResults, 3);
  assert.equal(resumo.uniqueVideos, 2);
  assert.equal(resumo.comparable, 2);
  assert.equal(resumo.longForm, 1);
  assert.equal(resumo.shorts, 1);
  assert.equal(resumo.selected, 0);
  assert.equal(resumo.headline, "2 consulta(s) · 2 vídeo(s) · 1 long-form · 1 Short(s) · 0 selecionado(s) · Coleta concluída");
  assert.equal(/ytrun:|ytq:|fingerprint/.test(resumo.headline), false, "nada de hash na visão normal");

  assert.equal(radarYoutubeRunSummary(null), null);
});

test("§8 · a seleção só alcança o que existe no universo", () => {
  const corrida = corridaDe();
  const universo = corrida.universe;

  assert.deepEqual(radarYoutubeApplySelection({ universe: universo, selectedVideoIds: ["a"] }), ["a"]);

  /*
   * Um id fora do universo seria decisão sobre um vídeo que esta coleta não
   * viu: ele sumiria da tela no próximo readback e continuaria contado.
   */
  assert.deepEqual(radarYoutubeApplySelection({ universe: universo, selectedVideoIds: ["fantasma"] }), []);

  /* A ordem é a do universo, para dois navegadores lerem igual. */
  assert.deepEqual(radarYoutubeApplySelection({ universe: universo, selectedVideoIds: ["b", "a"] }), ["a", "b"]);
});

test("§11 · RESET_SCOPED_TO_YOUTUBE — o reset alcança a pesquisa de YouTube, e só ela", () => {
  const patch = radarYoutubeResetPatch();

  /*
   * O SEGUNDO CAMPO ENTROU NO YOUTUBE_SEARCH_2, e entrou por necessidade.
   *
   * O congelamento é parte da investigação de YouTube: zerar a coleta e deixar
   * o blueprint de pé faria a tela mostrar leitura competitiva de uma amostra
   * apagada — e ela seguiria para o Planejador com proveniência quebrada.
   *
   * O que o §11 proíbe continua proibido: nenhum campo de Google, Amazon,
   * ArticleDNA, Vídeos ou Especialista aparece aqui.
   */
  assert.deepEqual(patch, { youtubeSearch: null, youtubeFrozenInvestigation: null });
  assert.deepEqual(Object.keys(patch).sort(), ["youtubeFrozenInvestigation", "youtubeSearch"]);
  for (const chave of Object.keys(patch)) {
    assert.match(chave, /^youtube/i, `o reset conhece um campo que não é de YouTube: ${chave}`);
  }
  for (const proibido of ["deepResearch", "serpDecisions", "extractions", "benchmark", "competitiveReport", "finalizedBundle", "plannerPackage"]) {
    assert.equal(proibido in patch, false, `o reset alcançou ${proibido}`);
  }
});

/* ===================== §2, §10, §13 · a fiação auditada ================== */

test("§2 · START_USER_INITIATED — a coleta é POST, e nenhum GET dela existe", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8");

  assert.match(rota, /export async function POST/);
  assert.equal(/export async function GET/.test(rota), false, "não há leitura que colete");
  assert.match(rota, /action: z\.literal\("collect"\)/);
  assert.match(rota, /assertEditorialPermission\(profile, input\.brandId, "radar", "edit"\)/);
});

test("§2 · o identificador de uma consulta não pode ser forjado pelo cliente", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8");
  assert.match(rota, /if \(radarYoutubeQueryId\(consulta\.text\) !== consulta\.queryId\)/);
  /* E o custo tem teto: o corpo não aceita mais consultas que o domínio. */
  assert.match(rota, /\.max\(RADAR_YOUTUBE_MAX_QUERIES\)/);
});

test("§4 · o provider é a SERP do YouTube — não o bloco de vídeos do Google", async () => {
  const operacao = await readFile(new URL("../lib/server/dataforseo-youtube-operation.ts", import.meta.url), "utf8");

  /*
   * O ENDEREÇO MUDOU DE CASA NO 1.3, e a prova acompanhou.
   *
   * Ele passou a morar no domínio porque a tela grava a corrida antes da
   * chamada e precisa declarar o endpoint sem importar o módulo de servidor. O
   * que este teste garante continua sendo o mesmo: é a SERP do YouTube, e o
   * adaptador usa exatamente essa — uma só definição, sem cópia divergente.
   */
  assert.equal(DATAFORSEO_YOUTUBE_ENDPOINT, "/v3/serp/youtube/organic/live/advanced");
  assert.equal(RADAR_YOUTUBE_PROVIDER_ENDPOINT, DATAFORSEO_YOUTUBE_ENDPOINT, "adaptador e domínio apontam para o mesmo lugar");
  assert.match(operacao, /RADAR_YOUTUBE_PROVIDER_ENDPOINT/, "o adaptador LÊ a política, não a redefine");
  assert.equal(/"\/v3\/serp\/google\//.test(operacao), false, "nada do Google aqui");

  /* E a biblioteca Vídeos não é substituta da SERP — §4. */
  const codigo = operacao.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/radar_video_sources|video-library|radarVideoSourceDisplay/.test(codigo), false, "a biblioteca deliberada não alimenta o universo competitivo");
});

test("§10 · F5_PRESERVES — a corrida atravessa o contrato inteira, inclusive a curadoria", () => {
  /*
   * F5 NÃO É MECANISMO DE ATUALIZAÇÃO, MAS PRECISA SER INÓCUO.
   *
   * O que a pessoa vê depois de recarregar é o que o contrato conseguiu
   * carregar. Se `queriesFoundIn`, `allRanks` ou a seleção humana caíssem no
   * caminho, a tela voltaria com o mesmo universo e SEM a proveniência que
   * explica cada vídeo — e a curadoria teria de ser refeita no escuro.
   */
  /* Uma análise mínima e VÁLIDA — o resto do contrato não é o assunto aqui. */
  const analiseBase = {
    schemaVersion: 1 as const,
    brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1",
    serpSnapshotId: "serp-1", serpSnapshotVersion: 1, serpSnapshotHash: "hash-serp",
    mode: "competitive_full" as const,
    modeRecommendation: { suggestedMode: "competitive_full" as const, reasons: ["fixture"], confidence: "high" as const, ruleSource: "minerador_kgr_strict" as const },
    modeHumanReason: "",
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [],
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null,
    keywordDecisions: [], plannerPackage: null, status: "draft" as const, humanNotes: [], approvedAt: null, approvedBy: null,
  };

  const corrida = corridaDe({ selectedVideoIds: ["a"] });
  const analise = RadarAnalysisPayloadSchema.parse({ ...analiseBase, youtubeSearch: corrida });

  /* O caminho real: serializado para o banco e lido de volta por outra aba. */
  const relida = RadarAnalysisPayloadSchema.parse(JSON.parse(JSON.stringify(analise)));

  assert.deepEqual(relida.youtubeSearch, corrida, "a corrida volta idêntica do contrato");
  assert.deepEqual(relida.youtubeSearch?.selectedVideoIds, ["a"], "a decisão humana sobrevive");
  assert.ok((relida.youtubeSearch?.universe[0].queriesFoundIn.length ?? 0) > 0, "QUERY_PROVENANCE_PRESERVED");
  assert.ok((relida.youtubeSearch?.universe[0].allRanks.length ?? 0) > 0);
  assert.equal(relida.youtubeSearch?.fingerprint.signature, corrida.fingerprint.signature);

  /*
   * E ANÁLISE GRAVADA ANTES DESTE GATE CONTINUA LEGÍVEL — o campo é aditivo.
   *
   * Um `.default(null)` que exigisse a chave transformaria todo histórico do
   * Radar em erro de parse na primeira leitura.
   */
  const antiga = RadarAnalysisPayloadSchema.parse(analiseBase);
  assert.equal(antiga.youtubeSearch, null);
  assert.equal(antiga.deepResearch, null, "e o campo do Google continua onde estava");
});

test("§12 · a atualização vem do readback da própria área — nunca do F5", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /*
   * Depois de gravar, quem relê é `reloadRadarAnalysis(articleId)`: uma leitura
   * de UM artigo, confirmada por `readbackConfirmed`. Recarregar o workspace
   * inteiro a cada seleção de vídeo pagaria a investigação toda para mover um
   * booleano — e `location.reload` devolveria à pessoa a tela que ela já tinha.
   */
  const gravacao = pagina.slice(pagina.indexOf("const gravarYoutube"), pagina.indexOf("const reloadVideoLibrary"));
  assert.ok(gravacao.includes("pipeline.reloadRadarAnalysis(row.articleId)"), "o readback é por artigo");
  assert.equal(/location\s*\.\s*reload|window\.location\s*=/.test(gravacao), false, "F5 não é mecanismo de atualização");
  assert.equal(gravacao.includes("pipeline.reload("), false, "o workspace inteiro não é relido por causa de um vídeo");

  /* E a gravação é sucessora: nenhuma versão de análise é sobrescrita. */
  assert.ok(gravacao.includes("createRadarAnalysisSuccessor"), "append-only, como o resto do Radar");
});

test("§1 e §10 · a investigação de YouTube é PARALELA à do Google no contrato", async () => {
  const contratos = await readFile(new URL("../lib/radar/analysis-contracts.ts", import.meta.url), "utf8");

  /* GOOGLE_STATE_UNCHANGED: o campo do Google continua onde estava, intacto. */
  assert.match(contratos, /deepResearch: RadarDeepResearchRecordSchema\.nullable\(\)\.default\(null\),/);
  /* E o YouTube ganhou o seu, aditivo — análise já gravada continua legível. */
  assert.match(contratos, /youtubeSearch: RadarYoutubeSearchRunSchema\.nullable\(\)\.default\(null\),/);

  /*
   * AMAZON_STATE: o modo NUNCA muda de estado por acidente de tabela.
   *
   * Quando este gate foi escrito, a Amazon era `planned`, e a asserção existia
   * para provar que o YouTube não a havia promovido de carona. Ela deixou de
   * ser `planned` no PROFILES_2.1, quando a coleta passou a atravessar o
   * provider — e a promoção veio DECLARADA, com motivo escrito ao lado.
   *
   * O que continua sendo verificado é o mesmo: o valor é explícito e tem
   * justificativa. Uma linha sem comentário aqui seria promoção por descuido.
   */
  const modos = await readFile(new URL("../lib/radar/search-mode.ts", import.meta.url), "utf8");
  assert.match(modos, /AMAZON: "(planned|available)"/);
  assert.match(modos, /2\.1 · §8[\s\S]{0,900}AMAZON: "available"/);
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, [], `nenhuma rede deveria ter saído; houve: ${tentativasDeRede.join(", ")}`);
});
