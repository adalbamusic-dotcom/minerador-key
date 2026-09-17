import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_AREA_POLL_OPEN_MS,
  RADAR_AREA_POLL_PENDING_MS,
  radarAreaCacheKey,
  radarAreaPollingPlan,
  radarAreaShouldCoalesce,
  radarAreaShouldRevalidateOnVisible,
} from "../lib/radar/area-live-read.ts";
import {
  RADAR_VIDEO_TEXT_PREVIEW_CHARS,
  RadarVideoSourceTextSchema,
  radarVideoTextSummary,
} from "../lib/radar/video-source.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/**
 * ======  RADAR_LIVE_UX_2.2 · VÍDEOS LIVE  ==============================
 *
 * O que precisa ser verdade em runtime: o usuário manda extrair, o User Worker
 * processa na máquina dele, e o Radar ABERTO caminha sozinho de AGUARDANDO a
 * TEXTO DISPONÍVEL. Sem F5, sem recolher a área, sem reselecionar artigo.
 *
 * E o peso disso não pode crescer: a área revalidando sozinha com 420 KB de
 * transcript por leitura trocaria um problema de atualização por um de custo.
 *
 * Nenhuma chamada real. REAL_PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
const fetchOriginal = globalThis.fetch;
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const brandId = "c0000000-0000-4000-8000-0000000000a1";
const videoSourceId = "c0000000-0000-4000-8000-0000000000a2";

/* ================ §8 · o resumo que substitui o transcript ================ */

const textoCompleto = (patch: Partial<{ transcriptText: string; segments: Array<{ text: string; startMs: number; endMs: number }>; hasTimestamps: boolean }> = {}) =>
  RadarVideoSourceTextSchema.parse({
    id: "texto-1", videoSourceId,
    sourceMethod: "PUBLIC_TRANSCRIPT", provider: "youtube", languageCode: "pt-BR",
    transcriptText: "Protetor solar em bastão é prático para retoque, mas não substitui a camada inicial.",
    segments: [
      { text: "Protetor solar em bastão", startMs: 12_000, endMs: 15_500 },
      { text: "é prático para retoque", startMs: 15_500, endMs: 19_000 },
      { text: "mas não substitui a camada inicial", startMs: 19_000, endMs: 24_250 },
    ],
    hasTimestamps: true, processingVersion: 1, createdAt: "2026-09-14T10:00:00.000Z",
    ...patch,
  });

test("§8 · o resumo carrega o que a listagem mostra, e NADA do texto além do começo", () => {
  const resumo = radarVideoTextSummary(textoCompleto());

  assert.equal(resumo.segmentCount, 3);
  assert.equal(resumo.startMs, 12_000);
  assert.equal(resumo.endMs, 24_250);
  assert.equal(resumo.languageCode, "pt-BR");

  /* O CAMPO NÃO EXISTE — não basta vir vazio: o que não está no objeto não trafega. */
  assert.equal("transcriptText" in resumo, false, "o texto inteiro não está no resumo");
  assert.equal("segments" in resumo, false, "a lista de segmentos também não");
});

test("§8 · o preview é o COMEÇO literal, e o corte é declarado", () => {
  const longo = "a".repeat(RADAR_VIDEO_TEXT_PREVIEW_CHARS + 500);
  const resumo = radarVideoTextSummary(textoCompleto({ transcriptText: longo }));

  assert.equal(resumo.characterCount, longo.length);
  assert.equal(resumo.preview.length, RADAR_VIDEO_TEXT_PREVIEW_CHARS);
  assert.equal(resumo.truncated, true);
  /*
   * NADA É RESUMIDO. O preview é um prefixo do texto original: se um dia
   * alguém trocá-lo por uma síntese, a tela passaria a mostrar palavras que a
   * fonte não disse — dentro de um bloco chamado "transcrição".
   */
  assert.ok(longo.startsWith(resumo.preview));

  const curto = radarVideoTextSummary(textoCompleto({ transcriptText: "curto" }));
  assert.equal(curto.truncated, false);
  assert.equal(curto.preview, "curto");
});

test("§8 · sem marcação de tempo, a janela é nula em vez de zero", () => {
  /*
   * Uma transcrição colada à mão não tem segmentos. Devolver `0` faria a tela
   * anunciar um vídeo que começa no instante zero e não dura nada.
   */
  const resumo = radarVideoTextSummary(textoCompleto({ segments: [], hasTimestamps: false }));
  assert.equal(resumo.startMs, null);
  assert.equal(resumo.endMs, null);
  assert.equal(resumo.segmentCount, 0);
});

/* ============== §2 · a chave de cache separa artigo e biblioteca ============ */

test("§2 · a área Vídeos tem chave própria, e o artigo faz parte dela", () => {
  const doArtigo = radarAreaCacheKey({ brandId, articleId: "artigo-a", articleDnaVersionId: "dna-1", area: "videos" });
  const deOutro = radarAreaCacheKey({ brandId, articleId: "artigo-b", articleDnaVersionId: "dna-1", area: "videos" });
  const doEspecialista = radarAreaCacheKey({ brandId, articleId: "artigo-a", articleDnaVersionId: "dna-1", area: "specialist" });

  assert.notEqual(doArtigo, deOutro, "cada artigo tem o seu cache");
  assert.notEqual(doArtigo, doEspecialista, "Vídeos não lê o cache do Especialista");

  /* E a biblioteca sem artigo é uma chave, não a ausência de uma. */
  const semArtigo = radarAreaCacheKey({ brandId, articleId: "__sem-artigo__", articleDnaVersionId: "__sem-artigo__", area: "videos" });
  assert.notEqual(semArtigo, doArtigo);
});

/* =================== §4 · o ritmo do tique, para Vídeos =================== */

test("§4 · com job na fila o tique é rápido; estável desacelera; escondida para", () => {
  const comFila = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: true, pending: true }, visible: true });
  assert.deepEqual(comFila, { shouldPoll: true, intervalMs: RADAR_AREA_POLL_PENDING_MS, reason: "PENDING_WORK" });
  assert.ok(RADAR_AREA_POLL_PENDING_MS <= 5_000, "o gate pede 3–5 s enquanto alguém espera");

  const estavel = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: true, pending: false }, visible: true });
  assert.deepEqual(estavel, { shouldPoll: true, intervalMs: RADAR_AREA_POLL_OPEN_MS, reason: "AREA_OPEN" });

  /* E · aba escondida pausa o tique, mesmo com job em curso. */
  const escondida = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: true, pending: true }, visible: false });
  assert.equal(escondida.shouldPoll, false);
  assert.equal(escondida.reason, "HIDDEN");

  /* B · com sinal vivo o tique não existe: o servidor avisa. */
  const comRealtime = radarAreaPollingPlan({ signal: "LIVE", activity: { open: true, pending: true }, visible: true });
  assert.equal(comRealtime.shouldPoll, false);
  assert.equal(comRealtime.reason, "LIVE_SIGNAL");
});

test("§14 C e F · eventos próximos viram uma leitura; voltar à aba revalida uma vez", () => {
  /* C · a rajada do worker — job, texto, estado da fonte — é UMA releitura. */
  assert.equal(radarAreaShouldCoalesce({ lastSignalAt: 1_000, now: 1_050 }), true);
  assert.equal(radarAreaShouldCoalesce({ lastSignalAt: 1_000, now: 1_400 }), false);
  assert.equal(radarAreaShouldCoalesce({ lastSignalAt: null, now: 1_000 }), false, "o primeiro sinal nunca é engolido");

  /* F · voltar para a aba revalida uma vez — e só quando havia o que revalidar. */
  assert.equal(radarAreaShouldRevalidateOnVisible({ becameVisible: true, hasCachedValue: true }), true);
  assert.equal(radarAreaShouldRevalidateOnVisible({ becameVisible: true, hasCachedValue: false }), false);
  assert.equal(radarAreaShouldRevalidateOnVisible({ becameVisible: false, hasCachedValue: true }), false);
});

/* ============ §1, §2, §7, §10 e §13 · a fiação, auditada na página ========= */

async function pagina(): Promise<string> {
  return readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
}

test("§1 e §2 · Vídeos usa a MESMA infraestrutura do Especialista, sem política nova", async () => {
  const texto = await pagina();

  assert.match(texto, /import \{ useRadarAreaLiveRead \} from "\.\/use-radar-area-live-read";/);
  assert.match(texto, /area: "videos",/);
  assert.match(texto, /load: carregarAreaVideos,/);

  /*
   * NENHUMA POLÍTICA NOVA — o gate é explícito.
   *
   * Se alguém reintroduzir um `setInterval`, um debounce ou um cache próprio
   * para Vídeos, a área passa a ter duas políticas que divergem no primeiro
   * ajuste — e o Especialista já provou a que existe.
   */
  const leitura = texto.slice(texto.indexOf("const carregarAreaVideos = useCallback"), texto.indexOf("const videosPendenteRef"));
  assert.equal(/setInterval|setTimeout|debounce/.test(leitura), false, "a política do tique não é reescrita aqui");
});

test("§1 · o read-model lê SÓ a área, e nunca o workspace editorial", async () => {
  const texto = await pagina();
  const leitura = texto.slice(texto.indexOf("const carregarAreaVideos = useCallback"), texto.indexOf("const videosPendenteRef"));

  /* As três leituras da área, e nenhuma além delas. */
  assert.match(leitura, /radar-video-sources\?/);
  /*
   * O CASAMENTO É CONDICIONADO AO ARTIGO — não à presença da string.
   *
   * Grepar `radar-video-matching?` passava com a chamada trocada por `false ?`:
   * a URL continuava no arquivo e ninguém a pedia. Provado por mutação.
   */
  assert.match(leitura, /videosArticleId\s*\r?\n?\s*\? fetch\(`\/api\/editorial\/radar-video-matching\?/, "o casamento é lido quando há artigo");
  assert.match(leitura, /lerEstadoDoWorker\(selectedBrandId\)/);
  assert.match(leitura, /await Promise\.all\(\[/, "as três em paralelo");

  /*
   * O QUE NÃO PODE ESTAR AQUI — e a varredura é sobre o CÓDIGO.
   *
   * O próprio bloco explica que não carrega o workspace editorial; proibir a
   * PALAVRA proibiria a frase que documenta a garantia. O que se verifica é a
   * execução, com os comentários fora.
   */
  const codigo = leitura.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/reloadOperational|loadWorkspace|router\.refresh|pipeline\.reload/.test(codigo), false, "FULL_WORKSPACE_POLLING = NO");
});

test("§3 · as tabelas observadas incluem a fila, que é o assunto de Vídeos", async () => {
  const texto = await pagina();
  const bloco = texto.slice(texto.indexOf("const RADAR_VIDEOS_LIVE_TABLES"), texto.indexOf("] as const;", texto.indexOf("const RADAR_VIDEOS_LIVE_TABLES")));

  for (const tabela of [
    "radar_video_sources",
    "radar_article_video_sources",
    "radar_video_source_texts",
    "radar_video_brief_extract_runs",
    "radar_video_brief_extracts",
    "external_processing_jobs",
  ]) {
    assert.ok(bloco.includes(tabela), `a área observa ${tabela}`);
  }
});

test("§10 e §13 · atualizar relê SÓ Vídeos, e nenhuma releitura dispara ação externa", async () => {
  const texto = await pagina();

  assert.match(texto, /const reloadVideoLibrary = useCallback\(\(\) => \{ leituraDeVideos\.refresh\(\); \}, \[leituraDeVideos\]\);/);
  assert.equal(/router\.refresh\(\)|window\.location\.reload\(\)/.test(texto), false, "FULL_WORKSPACE_REFRESH = NO");

  /*
   * §13 · O REFETCH NÃO PODE INICIAR NADA.
   *
   * A leitura da área é só GET. Um POST aqui dentro faria o tique extrair
   * texto sozinho — e o worker cobraria por isso.
   */
  const leitura = texto.slice(texto.indexOf("const carregarAreaVideos = useCallback"), texto.indexOf("const videosPendenteRef"));
  assert.equal(/method: "POST"|runVideoMatching\(|extractVideoText\(/.test(leitura), false, "PROVIDER_AUTO_RUNS = 0");
});

test("§11 · a vista mantém o último estado válido durante a revalidação", async () => {
  const texto = await pagina();
  const vista = texto.slice(texto.indexOf("const vistaDeVideos = useMemo"), texto.indexOf("const reloadVideoLibrary"));

  /* O dado vem do read-model; `revalidating` é dito ao lado, não no lugar. */
  assert.match(vista, /sources: leituraDeVideos\.data\?\.sources \|\| VIDEOS_SEM_FONTES,/);
  assert.match(vista, /revalidating: leituraDeVideos\.revalidating,/);
  /*
   * `loading` É SÓ `loading` — a âncora é exata de propósito.
   *
   * Proibir `loading: leituraDeVideos.revalidating` deixava passar
   * `loading: leituraDeVideos.loading || leituraDeVideos.revalidating`, que é o
   * mesmo defeito escrito de outro jeito: a área volta a "carregando" a cada
   * tique e apaga o que já estava na tela. Provado por mutação.
   */
  assert.match(vista, /loading: leituraDeVideos\.loading,\r?\n/, "revalidar não é carregar");
});

/* ============== §8 na tela · o transcript só vem depois do clique ========== */

const fonteRegistrada = {
  id: videoSourceId, brandId, articleId: null,
  sourceKind: "YOUTUBE" as const,
  originalUrl: "https://www.youtube.com/watch?v=abc",
  normalizedUrl: "https://www.youtube.com/watch?v=abc",
  normalizedUrlHash: "hash-1", youtubeVideoId: "abc",
  displayName: "Resenha de protetores",
  registrationStatus: "REGISTERED" as const,
  registeredBy: null, registrationArticleDnaVersionId: null, registrationArticleDnaContentHash: null,
  textState: "TEXT_READY" as const, textStateReason: null,
  metadataFetchedAt: "2026-09-14T09:00:00.000Z",
  videoTitle: "Resenha de protetores", channelId: null, channelTitle: null,
  videoDescription: null, publishedAt: null, duration: null, thumbnails: null,
  uploadedMediaUri: null, uploadedMediaContentType: null, uploadedMediaAt: null,
  createdAt: "2026-09-14T09:00:00.000Z", updatedAt: "2026-09-14T09:00:00.000Z",
  selectedForArticle: true, articleUsageCount: 1,
};

const vistaDeVideos = (patch: Record<string, unknown> = {}) => ({
  sources: [fonteRegistrada],
  texts: [radarVideoTextSummary(textoCompleto())],
  briefs: [], briefsUnavailableReason: null,
  coverage: null, matching: false,
  investigationFinalized: false, frozenBriefCount: 0,
  loading: false, saving: false, extracting: null, lastBatch: null,
  error: null, readbackConfirmed: true,
  ...patch,
});

async function montarPainelDeVideos(patch: Record<string, unknown> = {}) {
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: "artigo-a", brandId,
    videoSources: vistaDeVideos(patch) as never,
  })));
  return tela;
}

/** O `fetch` desta suíte: registra o que foi pedido e devolve o que mandarmos. */
function servidorDeTranscricao(resposta: unknown = { success: true, text: textoCompleto() }) {
  const pedidos: string[] = [];
  Object.defineProperty(globalThis, "fetch", {
    value: (async (entrada: unknown) => {
      pedidos.push(String(entrada));
      return { ok: true, status: 200, json: async () => resposta };
    }) as unknown as typeof fetch,
    writable: true, configurable: true,
  });
  return pedidos;
}

function restaurarRede() {
  Object.defineProperty(globalThis, "fetch", {
    value: (entrada: unknown) => {
      tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
      return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
    },
    writable: true, configurable: true,
  });
}

test("§14 I · o transcript NÃO é buscado até alguém abrir o disclosure", async () => {
  const pedidos = servidorDeTranscricao();
  const tela = await montarPainelDeVideos();
  try {
    /* A listagem já mostra idioma e número de trechos — sem nenhuma rede. */
    assert.equal(pedidos.length, 0, "montar a área não busca transcrição nenhuma");
    assert.match(tela.text(), /3 trecho\(s\) com tempo/);
    assert.match(tela.text(), /começa em 00:12/);

    /* E o que está na tela é o preview, não o texto inteiro vindo por prop. */
    const corpo = tela.get(`radar-videos-transcript-text-${videoSourceId}`);
    assert.ok((corpo.textContent || "").startsWith("Protetor solar em bastão"));

    await tela.click(`radar-videos-transcript-${videoSourceId}`);

    assert.equal(pedidos.length, 1, "abrir busca — uma vez");
    assert.ok(pedidos[0].includes("/api/editorial/radar-video-text?"), `rota: ${pedidos[0]}`);
    assert.ok(pedidos[0].includes(`videoSourceId=${videoSourceId}`));
  } finally {
    tela.destroy();
    restaurarRede();
  }
});

test("§8 · fechar e reabrir não custa outra ida à rede", async () => {
  const pedidos = servidorDeTranscricao();
  const tela = await montarPainelDeVideos();
  try {
    await tela.click(`radar-videos-transcript-${videoSourceId}`);
    assert.equal(pedidos.length, 1);

    /* Fechar e abrir de novo: o cache da sessão responde. */
    await tela.click(`radar-videos-transcript-${videoSourceId}`);
    await tela.click(`radar-videos-transcript-${videoSourceId}`);
    assert.equal(pedidos.length, 1, "o cache sobrevive ao disclosure fechar");
  } finally {
    tela.destroy();
    restaurarRede();
  }
});

test("§8 · a falha da busca aparece, e não é confundida com transcrição vazia", async () => {
  const pedidos = servidorDeTranscricao({ success: false, error: "A fonte não pertence à biblioteca desta marca." });
  const tela = await montarPainelDeVideos();
  try {
    await tela.click(`radar-videos-transcript-${videoSourceId}`);
    assert.equal(pedidos.length, 1);

    const erro = tela.get(`radar-videos-transcript-error-${videoSourceId}`);
    assert.equal(erro.getAttribute("role"), "alert");
    assert.match(erro.textContent || "", /não pertence à biblioteca/);
  } finally {
    tela.destroy();
    restaurarRede();
  }
});

test("§10 e §11 · a área tem [Atualizar] próprio, e diz quando está revalidando", async () => {
  const pedidos = servidorDeTranscricao();
  const cliques: unknown[] = [];
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
  const tela = await montarRadar();
  try {
    await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
      articleId: "artigo-a", brandId,
      videoSources: vistaDeVideos({ revalidating: true }) as never,
      onReloadLibrary: (articleId: string | null) => { cliques.push(articleId); },
    })));

    /* §11 · revalidar é DITO, e a lista continua na tela. */
    assert.equal(tela.get("radar-videos-revalidating").textContent, "Atualizando…");
    assert.match(tela.text(), /Resenha de protetores/, "o último estado válido não sai da tela");

    await tela.click("radar-videos-refresh");
    assert.deepEqual(cliques, ["artigo-a"], "o botão chama a releitura da área");
    assert.equal(pedidos.length, 0, "e não busca transcrição nenhuma");
  } finally {
    tela.destroy();
    restaurarRede();
  }
});

test("§14 J · REAL_PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, [], `nenhuma rede deveria ter saído; houve: ${tentativasDeRede.join(", ")}`);
  assert.ok(fetchOriginal, "o fetch original continua referenciado para restauro");
});

/* ========== §12 e §14 A/D · a área viva, exercida com resposta em voo ====== */

/**
 * UM SERVIDOR QUE SEGURA A RESPOSTA ATÉ MANDARMOS SOLTAR.
 *
 * É o que permite reproduzir "leitura do artigo A em voo enquanto o usuário vai
 * para B". Com respostas imediatas a janela do defeito nunca se abre, e o teste
 * passaria a medir o próprio `React.act` em vez da guarda de chave.
 */
function servidorControlado() {
  const pedidos: string[] = [];
  const presos: Array<{ articleId: string; soltar: (valor: { articleId: string; estado: string }) => void }> = [];
  let estadoAtual = "AGUARDANDO";

  const carregar = (articleId: string) => () => {
    pedidos.push(articleId);
    return new Promise<{ articleId: string; estado: string }>(resolve => {
      presos.push({ articleId, soltar: resolve });
    });
  };

  return {
    pedidos,
    definirEstado: (valor: string) => { estadoAtual = valor; },
    soltarTodos: async () => {
      const fila = presos.splice(0, presos.length);
      for (const item of fila) item.soltar({ articleId: item.articleId, estado: estadoAtual });
    },
    soltarDe: async (articleId: string) => {
      const indice = presos.findIndex(item => item.articleId === articleId);
      if (indice < 0) return false;
      const [item] = presos.splice(indice, 1);
      item.soltar({ articleId: item.articleId, estado: estadoAtual });
      return true;
    },
    carregar,
    presos: () => presos.length,
  };
}

async function montarAreaViva(servidor: ReturnType<typeof servidorControlado>) {
  const { useRadarAreaLiveRead } = await import("../modules/radar/use-radar-area-live-read.ts");

  function AreaDeVideos({ articleId }: { articleId: string }) {
    const leitura = useRadarAreaLiveRead<{ articleId: string; estado: string }>({
      area: "videos",
      brandId,
      articleId,
      articleDnaVersionId: "dna-1",
      tables: ["radar_video_sources", "external_processing_jobs"],
      load: servidor.carregar(articleId),
      open: true,
      pending: () => true,
      enabled: true,
    });
    return React.createElement("div", null,
      React.createElement("span", { "data-testid": "estado" }, leitura.data?.estado ?? "sem dado"),
      React.createElement("span", { "data-testid": "artigo" }, leitura.data?.articleId ?? ""),
      React.createElement("button", { "data-testid": "atualizar", type: "button", onClick: () => leitura.refresh() }, "Atualizar"),
    );
  }

  const tela = await montarRadar();
  return { tela, AreaDeVideos };
}

test("§14 A · o estado novo aparece sozinho, sem F5 e sem remontar a área", async () => {
  const servidor = servidorControlado();
  const { tela, AreaDeVideos } = await montarAreaViva(servidor);
  try {
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-a" })));
    await servidor.soltarTodos();
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-a" })));
    assert.equal(tela.get("estado").textContent, "AGUARDANDO");

    /*
     * O USER WORKER TERMINOU: o banco agora diz TEXTO DISPONÍVEL. O que faz a
     * tela mudar é a RELEITURA do read-model — o payload do evento nunca é
     * autoridade, e aqui não há payload nenhum: só o sinal.
     */
    servidor.definirEstado("TEXT_READY");
    await tela.click("atualizar");
    await servidor.soltarTodos();
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-a" })));

    assert.equal(tela.get("estado").textContent, "TEXT_READY", "a área caminhou sozinha");
    assert.deepEqual(servidor.pedidos, ["artigo-live-a", "artigo-live-a"]);
  } finally {
    tela.destroy();
  }
});

test("§12 · a resposta atrasada do artigo A não contamina o artigo B", async () => {
  const servidor = servidorControlado();
  const { tela, AreaDeVideos } = await montarAreaViva(servidor);
  try {
    /* A leitura de A sai e fica presa no ar. */
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-a" })));
    assert.equal(servidor.presos(), 1);

    /* O usuário troca para B ANTES de A responder. */
    servidor.definirEstado("ESTADO_DE_B");
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-b" })));

    /* Agora A responde, atrasada. */
    servidor.definirEstado("ESTADO_DE_A");
    await servidor.soltarDe("artigo-live-a");
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-b" })));

    assert.notEqual(tela.get("artigo").textContent, "artigo-live-a", "a resposta de A não pode aparecer em B");
    assert.notEqual(tela.get("estado").textContent, "ESTADO_DE_A");

    /* E quando B responde, é B que aparece. */
    servidor.definirEstado("ESTADO_DE_B");
    await servidor.soltarDe("artigo-live-b");
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-b" })));
    assert.equal(tela.get("artigo").textContent, "artigo-live-b");
    assert.equal(tela.get("estado").textContent, "ESTADO_DE_B");
  } finally {
    tela.destroy();
  }
});

test("§14 C · dois cliques no mesmo gesto viram UMA leitura", async () => {
  const servidor = servidorControlado();
  const { tela, AreaDeVideos } = await montarAreaViva(servidor);
  try {
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-c" })));
    await servidor.soltarTodos();
    await tela.render(comProductShell(React.createElement(AreaDeVideos, { articleId: "artigo-live-c" })));
    const depoisDaPrimeira = servidor.pedidos.length;

    await tela.doubleClick("atualizar");
    await servidor.soltarTodos();

    assert.equal(servidor.pedidos.length, depoisDaPrimeira + 1, "o coalescing engole o segundo clique");
  } finally {
    tela.destroy();
  }
});

/* ============ o que só a auditoria do servidor alcança ============ */

test("§8 · a rota da listagem projeta o resumo, e não o texto", async () => {
  /*
   * A projeção acontece no SERVIDOR. Sem esta prova, trocar
   * `.map(radarVideoTextSummary)` por `as never` devolveria o transcript
   * inteiro de novo e nenhum teste de domínio perceberia — o domínio continua
   * correto; quem deixou de chamá-lo é a rota. Provado por mutação.
   */
  const rota = await readFile(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
  assert.match(rota, /return \[\.\.\.correntes\.values\(\)\]\.map\(radarVideoTextSummary\);/);
  assert.match(rota, /import \{[^}]*radarVideoTextSummary[^}]*\} from "@\/lib\/radar\/video-source";/);
});

test("§8 · a busca sob demanda devolve UMA versão, a corrente", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-video-text/route.ts", import.meta.url), "utf8");
  const get = rota.slice(rota.indexOf("export async function GET"));

  /*
   * `radar_video_source_texts` é append-only por versão. Sem `.limit(1)` a
   * busca traria o histórico inteiro — e recriaria, no clique, o peso que este
   * gate acabou de tirar da listagem. Provado por mutação.
   */
  assert.match(get, /\.order\("processing_version", \{ ascending: false \}\)\s*\r?\n\s*\.limit\(1\)/);
  assert.match(get, /\.eq\("brand_id", context\.brandId\)/, "a leitura é presa à marca");
  assert.match(get, /\.eq\("video_source_id", parsed\.data\.videoSourceId\)/);

  /* E ela NÃO escreve nada: abrir um disclosure não é ação de escrita. */
  const codigo = get.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/\.insert\(|\.update\(|enqueue|marcarEstadoDaFonte/.test(codigo), false, "PROVIDER_AUTO_RUNS = 0");
});

test("§4 · a fila em curso é o que acelera o tique de Vídeos", async () => {
  const texto = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /*
   * Sem isto o tique cairia sempre no ritmo de "área aberta" — dez segundos —
   * e a transição que o User Worker produz, que é a razão deste gate, chegaria
   * tarde. Provado por mutação: zerar a ref não quebrava teste nenhum.
   */
  assert.match(texto, /videosPendenteRef\.current = Boolean\(fila && \(fila\.queued > 0 \|\| fila\.processing > 0\)\);/);
  assert.match(texto, /pending: lerPendenteVideos,/);
});

test("§8 · abrir de novo com a busca em voo não dispara uma segunda", async () => {
  /*
   * A GUARDA FECHA ANTES DO PRIMEIRO `await`.
   *
   * Abrir, fechar e abrir de novo depressa — ou dois disclosures da mesma fonte
   * na tela — veem o mesmo estado de render: `transcricoes[id]` ainda é
   * `undefined`, porque a primeira resposta não voltou. Sem a `ref`, a segunda
   * abertura pediria o mesmo transcript outra vez.
   *
   * Provado por mutação: com a resposta imediata, a janela nunca se abre.
   */
  const pedidos: string[] = [];
  /*
   * A trava mora num objeto porque o TypeScript estreita uma `let` atribuída
   * dentro do executor da `Promise` para `never` — e o teste deixaria de
   * compilar por uma razão que não tem nada a ver com o que ele prova.
   */
  const trava: { soltar: ((valor: unknown) => void) | null } = { soltar: null };
  Object.defineProperty(globalThis, "fetch", {
    value: (async (entrada: unknown) => {
      pedidos.push(String(entrada));
      const corpo = await new Promise<unknown>(resolve => { trava.soltar = resolve; });
      return { ok: true, status: 200, json: async () => corpo };
    }) as unknown as typeof fetch,
    writable: true, configurable: true,
  });

  const tela = await montarPainelDeVideos();
  try {
    await tela.click(`radar-videos-transcript-${videoSourceId}`);
    assert.equal(pedidos.length, 1, "a primeira abertura busca");

    /* Fecha e reabre com a resposta ainda presa no ar. */
    await tela.click(`radar-videos-transcript-${videoSourceId}`);
    await tela.click(`radar-videos-transcript-${videoSourceId}`);
    assert.equal(pedidos.length, 1, "a busca em voo segura a segunda");

    /* E quando ela volta, o texto aparece. */
    trava.soltar?.({ success: true, text: textoCompleto() });
    await tela.render(comProductShell(React.createElement((await import("../modules/radar/radar-r3-videos-panel.tsx")).RadarR3VideosPanel, {
      articleId: "artigo-a", brandId, videoSources: vistaDeVideos() as never,
    })));
    assert.match(tela.get(`radar-videos-transcript-text-${videoSourceId}`).textContent || "", /não substitui a camada inicial/);
  } finally {
    tela.destroy();
    restaurarRede();
  }
});
