import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyRadarVideoSourceBatch, radarVideoSourceIdentity } from "../lib/radar/video-source.ts";
import type { RadarLibrarySource } from "../lib/radar/video-library.ts";
import type { RadarVideoTextState } from "../lib/radar/video-text-acquisition.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  VÍDEOS · GATE 2.3.1 — CADASTRAR NÃO É SELECIONAR  ===========
 *
 * DUAS DECISÕES, E O GATE 2.3 AS TINHA COLAPSADO EM UMA.
 *
 *   REGISTRO   "esta fonte pertence ao acervo da MARCA"
 *   SELEÇÃO    "este ARTIGO usa esta fonte"
 *
 * O custo de juntá-las aparece no próprio caso que motivou a biblioteca:
 * importar 25 palestras passaria a declarar que o artigo corrente usa as 25 —
 * quando a intenção de quem importa um acervo é escolher DEPOIS.
 *
 * A autoridade da seleção é o CHECKBOX. Marcar cria o vínculo ACTIVE;
 * desmarcar o desativa. Nenhuma das duas coisas chama provider.
 *
 * PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const rotaFontes = () => readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
const rotaBiblioteca = () => readFileSync(new URL("../app/api/editorial/radar-video-library/route.ts", import.meta.url), "utf8");
const painel = () => readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");

/** O corpo do POST de cadastro, sem os utilitários de leitura do arquivo. */
const cadastro = () => {
  const rota = rotaFontes();
  return rota.slice(rota.indexOf("export async function POST"));
};

const hash = (url: string) => String(radarVideoSourceIdentity(url)?.normalizedUrlHash);

const fonte = (patch: Partial<RadarLibrarySource> & { id: string }): RadarLibrarySource => ({
  brandId: "marca-1", articleId: "", sourceKind: "YOUTUBE",
  originalUrl: `https://youtu.be/${patch.id}`, normalizedUrl: `https://www.youtube.com/watch?v=${patch.id}`,
  normalizedUrlHash: `ytv:${patch.id}`, youtubeVideoId: null, displayName: null,
  registrationStatus: "REGISTERED", registeredBy: null,
  registrationArticleDnaVersionId: null, registrationArticleDnaContentHash: null,
  textState: "REGISTERED" as RadarVideoTextState, textStateReason: null,
  metadataFetchedAt: null, videoTitle: null, channelId: null, channelTitle: null,
  videoDescription: null, publishedAt: null, duration: null, thumbnails: null,
  uploadedMediaUri: null, uploadedMediaContentType: null, uploadedMediaAt: null,
  createdAt: "2026-09-12T10:00:00.000Z", updatedAt: "2026-09-12T10:00:00.000Z",
  selectedForArticle: false, articleUsageCount: 0,
  ...patch,
} as RadarLibrarySource);

const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
type VistaDeVideos = Parameters<typeof RadarR3VideosPanel>[0]["videoSources"];

const vista = (sources: RadarLibrarySource[]): VistaDeVideos => ({
  sources, texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: "sem investigação neste fixture",
  loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
});
const MODELO = "artigo-1";

/* ==========  A, B e C · CADASTRAR NÃO SELECIONA  ================== */

test("VÍDEOS 2.3.1 · A — cadastrar uma fonte nova não cria seleção nenhuma", () => {
  /*
   * A PROVA É A AUSÊNCIA DE ESCRITA. O cadastro só toca `radar_video_sources`;
   * a tabela de vínculo aparece no POST unicamente porque `lerFontes` a LÊ para
   * montar a biblioteca com a seleção corrente por cima.
   */
  const corpo = cadastro();
  assert.match(corpo, /from\("radar_video_sources"\)\.insert\(lote\.registrable\.map/);

  for (const escrita of ["insert", "upsert", "update", "delete"]) {
    assert.ok(
      !corpo.includes(`radar_article_video_sources").${escrita}(`),
      `o cadastro não faz ".${escrita}()" no vínculo`,
    );
  }
  assert.ok(!corpo.includes("aVincular"), "o vínculo automático do 2.3 não sobreviveu");
  assert.match(corpo, /CADASTRAR NÃO É SELECIONAR/);
});

test("VÍDEOS 2.3.1 · B — colar uma fonte que já existe não duplica nem seleciona", () => {
  const jaNaBiblioteca = "https://youtu.be/dQw4w9WgXcQ";
  const lote = classifyRadarVideoSourceBatch({
    raw: jaNaBiblioteca,
    existing: [{ normalizedUrlHash: hash(jaNaBiblioteca) }],
  });

  assert.equal(lote.entries[0].verdict, "ALREADY_REGISTERED");
  assert.equal(lote.registrable.length, 0, "nenhuma fonte nova é criada");
  /* E a mensagem diz o que falta fazer, em vez de deixar o usuário no vazio. */
  assert.match(lote.entries[0].reason, /Marque o checkbox dela para usar neste artigo/);

  /* A rota grava só o que é registrável; o resto do lote não vira escrita. */
  assert.match(cadastro(), /if \(lote\.registrable\.length\) \{/);
});

test("VÍDEOS 2.3.1 · C — importar 25 palestras dá 25 fontes e ZERO seleções", () => {
  /*
   * É O CASO DO GATE. O especialista deu 25 palestras; o artigo corrente vai
   * usar quatro. Importar o acervo não pode significar usá-lo inteiro.
   */
  /* O id do YouTube tem 11 caracteres; um fixture fora disso seria INVALID. */
  const vinteECinco = Array.from({ length: 25 }, (_, indice) => `https://www.youtube.com/watch?v=palestra${String(indice).padStart(3, "0")}`);
  const lote = classifyRadarVideoSourceBatch({ raw: vinteECinco.join("\n") });

  assert.equal(lote.registrable.length, 25, "as 25 entram na biblioteca");
  assert.equal(lote.counts.VALID, 25);
  assert.equal(new Set(lote.registrable.map(item => item.normalizedUrlHash)).size, 25, "25 identidades distintas");

  /* E o cadastro não tem por onde criar vínculo: a seleção nasce em zero. */
  assert.ok(!cadastro().includes("radar_article_video_sources\").insert"));
  assert.ok(!cadastro().includes("radar_article_video_sources\").upsert"));
});

/* ==========  D e E · O CHECKBOX É A AUTORIDADE  ================== */

test("VÍDEOS 2.3.1 · D e E — marcar grava ACTIVE, desmarcar grava REMOVED", () => {
  const rota = rotaBiblioteca();
  const selecao = rota.slice(rota.indexOf('if (action === "SELECT" || action === "UNSELECT")'), rota.indexOf('if (action === "PROCESS_SELECTED")'));

  /* D · marcar cria (ou reativa) o vínculo ativo. */
  assert.match(selecao, /status: "ACTIVE"/);
  assert.match(selecao, /removed_at: null/);
  assert.match(selecao, /onConflict: "brand_id,article_id,video_source_id"/);

  /* E · desmarcar desativa, e não apaga: a história do uso permanece. */
  assert.match(selecao, /status: "REMOVED", removed_at: new Date\(\)\.toISOString\(\)/);
  assert.ok(!/\.delete\(\)/.test(selecao), "desmarcar não apaga o vínculo");

  /* As duas escopadas ao artigo e à marca. */
  assert.match(selecao, /\.eq\("article_id", articleId\)/);
  assert.match(selecao, /\.eq\("brand_id", context\.brandId\)/);
});

test("VÍDEOS 2.3.1 · D e E no DOM — a mesma caixa liga e desliga o vínculo", async () => {
  const tela = await montarRadar();
  const acoes: unknown[][] = [];
  const biblioteca = [
    fonte({ id: "usada", displayName: "Palestra usada", selectedForArticle: true, articleUsageCount: 2 }),
    fonte({ id: "livre", displayName: "Palestra livre" }),
  ];

  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(biblioteca),
    onLibraryAction: (...args: unknown[]) => acoes.push(args),
  } as never)));

  /* O estado exibido é o do SERVIDOR, não o de uma cópia local. */
  assert.equal((tela.get("radar-videos-check-usada") as HTMLInputElement).checked, true);
  assert.equal((tela.get("radar-videos-check-livre") as HTMLInputElement).checked, false);

  await tela.click("radar-videos-check-livre");
  await tela.click("radar-videos-check-usada");

  assert.deepEqual(acoes, [
    ["artigo-1", "SELECT", ["livre"]],
    ["artigo-1", "UNSELECT", ["usada"]],
  ]);

  tela.destroy();
});

/* ==========  F · READMITIR NÃO É SELECIONAR  ==================== */

test("VÍDEOS 2.3.1 · F — a arquivada readmitida volta à biblioteca, não ao artigo", () => {
  const corpo = cadastro();

  /* Ela volta a ser fonte da marca… */
  assert.match(corpo, /const readmitir = apos\.filter\(item => coladas\.has\(item\.normalizedUrlHash\) && item\.registrationStatus === "ARCHIVED"\)/);
  assert.match(corpo, /from\("radar_video_sources"\)\s*\n\s*\.update\(\{ registration_status: "REGISTERED"/);
  assert.match(corpo, /\.eq\("brand_id", context\.brandId\)/);

  /* …e nada além disso: nenhuma seleção acompanha a readmissão. */
  const trecho = corpo.slice(corpo.indexOf("const readmitir"), corpo.indexOf("const sources = await lerFontes"));
  assert.ok(!trecho.includes("radar_article_video_sources"), "readmitir não vincula ao artigo");
  assert.match(corpo, /volta à BIBLIOTECA, não ao artigo/);
});

test("VÍDEOS 2.3.1 · F no DOM — a arquivada aparece desmarcada e sem botão de arquivar", async () => {
  const tela = await montarRadar();
  const biblioteca = [fonte({ id: "antiga", displayName: "Palestra antiga", registrationStatus: "ARCHIVED" })];

  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(biblioteca), onLibraryAction: () => {},
  } as never)));

  await tela.click("radar-videos-filter-ARCHIVED");
  assert.equal((tela.get("radar-videos-check-antiga") as HTMLInputElement).checked, false, "arquivada não fica selecionada implicitamente");
  assert.equal(tela.query("radar-videos-archive-antiga"), null, "não se arquiva o que já está arquivado");

  tela.destroy();
});

/* ==========  G · NENHUM PROVIDER  ============================== */

test("VÍDEOS 2.3.1 · G — nem cadastrar nem marcar chamam provider", () => {
  const corpo = cadastro();
  const rota = rotaBiblioteca();
  const selecao = rota.slice(rota.indexOf('if (action === "SELECT" || action === "UNSELECT")'), rota.indexOf('if (action === "PROCESS_SELECTED")'));

  for (const proibido of ["enqueueRadarVideoTextJob", "fetchShared", "runShared", "uploadShared", "googleapis"]) {
    assert.ok(!corpo.includes(proibido), `cadastrar não faz "${proibido}"`);
    assert.ok(!selecao.includes(proibido), `marcar não faz "${proibido}"`);
  }

  /* A rota de cadastro declara isso como contrato, não como coincidência. */
  assert.match(rotaFontes(), /ZERO PROVIDER/);
  /* E enfileirar continua existindo — só que na ação de processar. */
  assert.match(rota, /if \(decisao\.outcome !== "ENQUEUED"\) continue;/);
});

/* ==========  H · F5  =========================================== */

test("VÍDEOS 2.3.1 · H — o F5 devolve a biblioteca e só a seleção explícita", async () => {
  /*
   * MONTAGEM NOVA, ZERO ESTADO DE CLIENTE. Se alguma seleção morasse em
   * `useState`, ela sumiria aqui — e é exatamente por isso que o checkbox lê
   * `selectedForArticle`, que veio do banco.
   */
  const biblioteca = [
    fonte({ id: "escolhida", displayName: "Escolhida", selectedForArticle: true, articleUsageCount: 1 }),
    fonte({ id: "so-na-biblioteca", displayName: "Só na biblioteca" }),
    fonte({ id: "outra", displayName: "Outra" }),
  ];

  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: MODELO, videoSources: vista(biblioteca), onLibraryAction: () => {},
  } as never)));

  /* As três voltam à biblioteca… */
  for (const id of ["escolhida", "so-na-biblioteca", "outra"]) {
    assert.ok(tela.query(`radar-videos-check-${id}`), `${id} está na biblioteca`);
  }
  /* …e só uma volta selecionada. */
  assert.equal((tela.get("radar-videos-check-escolhida") as HTMLInputElement).checked, true);
  assert.equal((tela.get("radar-videos-check-so-na-biblioteca") as HTMLInputElement).checked, false);
  assert.equal((tela.get("radar-videos-check-outra") as HTMLInputElement).checked, false);
  assert.match(tela.text(), /1 selecionada\(s\) para este artigo/);

  tela.destroy();
});

/* ==========  A TELA DIZ A REGRA  =============================== */

test("VÍDEOS 2.3.1 · a tela declara que registrar não é selecionar", () => {
  const tela = painel();

  /*
   * A REGRA CONTINUA DITA — mudou de CAMADA, não de existência (§2.3.3).
   *
   * A explicação do modelo saiu do parágrafo permanente e foi para o InfoHint
   * do título; o aviso do campo de cadastro, que é instrução de uso imediato,
   * ficou onde estava.
   */
  assert.match(tela, /title="Biblioteca de fontes da marca"/);
  assert.match(tela, /Registrar apenas coloca a fonte na biblioteca; declarar que este artigo a usa é o checkbox da linha, e marcar não processa nada\./);
  assert.match(tela, /Elas entram na biblioteca da marca sem ficar\s*\n\s*selecionadas para este artigo\./);

  /* E a marcação paralela do 2.3 saiu: uma caixa, um significado. */
  assert.ok(!tela.includes("setMarcadas"), "não há mais marcação de trabalho concorrente");
  assert.ok(!tela.includes("marcada(s)"), "nem o contador dela");
});

/* ==========  PROVIDER  ========================================= */

test("VÍDEOS 2.3.1 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
