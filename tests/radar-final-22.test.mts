import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  compactRadarResearchForRead,
  radarResearchProvenanceOfAnalysis,
  radarResearchSampleOfAnalysis,
  radarResearchSampleSummary,
} from "../lib/radar/research-read-model.ts";
import { loadRadarResearchSample } from "../lib/radar/research-part-client.ts";
import { RadarYoutubeSearchRunSchema, type RadarYoutubeSearchRun } from "../lib/radar/youtube-search-run.ts";
import { radarResearchProfileStateOfAnalysis } from "../lib/radar/research-profile-state.ts";

/*
 * ===== RADAR_FINAL_2.2 · A PARIDADE DE LEITURA DO YOUTUBE =====
 *
 * O 2.1 compactou o transporte do YouTube sem ligar a fiação do disclosure: a
 * amostra ficava VAZIA depois do freeze. Este gate fecha isso pela MESMA
 * autoridade genérica — e prova que o Google foi auditado antes de qualquer
 * alteração.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String(entrada));
    return Promise.reject(new Error("REDE NÃO ESPERADA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const fonteDoPainelYoutube = await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");
const fonteDoPainelAmazon = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
const fonteDaPagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const fonteDoModelo = await readFile(new URL("../lib/radar/research-read-model.ts", import.meta.url), "utf8");
const fonteDoClienteLazy = await readFile(new URL("../lib/radar/research-part-client.ts", import.meta.url), "utf8");

/* ========================= a investigação de vídeo ========================= */

const video = (indice: number) => ({
  videoId: `vid-${String(indice).padStart(4, "0")}`,
  url: `https://www.youtube.com/watch?v=vid-${indice}`,
  title: `Título de vídeo concorrente número ${indice}`,
  channelName: `Canal ${indice}`, channelId: `UC${indice}`, channelUrl: null, channelLogo: null,
  publishedAt: "2026-03-01T10:00:00.000Z", publishedAtLabel: "há 6 meses",
  durationSeconds: 640, durationLabel: "10:40", views: 128000,
  description: "Descrição do vídeo concorrente.", thumbnailUrl: null,
  isShorts: false, isLive: false, isMovie: false, badges: [],
  queriesFoundIn: ["ytq:1"], bestRank: indice,
  allRanks: [{ queryId: "ytq:1", rank: indice }], occurrenceCount: 1,
  universeClass: "COMPARABLE_LONG_FORM", universeReason: "Long-form que responde a mesma intenção.",
});

const corrida = (): RadarYoutubeSearchRun => RadarYoutubeSearchRunSchema.parse({
  researchMode: "YOUTUBE", runId: "run-yt-1", runVersion: 1,
  startedAt: "2026-09-14T09:00:00.000Z", startedBy: "user-1", state: "COLLECTED",
  fingerprint: { articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["ytq:1"], signature: "assinatura-yt" },
  provenance: {
    provider: "dataforseo", endpoint: "/v3/serp/youtube/organic/live/advanced",
    queriesRequested: 3, queriesSucceeded: 3, queriesFailed: 0,
    collectedAt: "2026-09-14T09:00:00.000Z",
  },
  queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: 38 }],
  results: [], universe: Array.from({ length: 38 }, (_, i) => video(i + 1)),
});

const fotografia = (legado = false) => ({
  frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "user-1",
  runRef: legado ? null : {
    runId: "run-yt-1", runVersion: 1, runFingerprint: "assinatura-yt",
    collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo",
    endpoint: "/v3/serp/youtube/organic/live/advanced",
    queriesExecuted: 3, universeSize: 38, selectedVideoIds: [],
  },
  /* §2 · a fotografia LEGADA carrega a corrida inteira — e continua legível. */
  run: legado ? corrida() : null,
  multimodal: null, limitations: [],
});

const analiseFinalizada = (legado = false) => ({
  youtubeSearch: corrida(),
  youtubeFrozenInvestigation: fotografia(legado),
  researchTransport: "FULL" as const,
});

const bytes = (valor: unknown) => JSON.stringify(valor ?? null).length;

/* ================================ A ================================ */

test("A · YouTube FINALIZED não leva universe nem results no initial", () => {
  const compacta = compactRadarResearchForRead(analiseFinalizada() as unknown as Record<string, unknown>);
  const serializado = JSON.stringify(compacta);

  assert.equal(compacta.youtubeSearch, null);
  assert.equal(serializado.includes('"universe"'), false);
  assert.equal(serializado.includes('"results"'), false);
  assert.equal(compacta.researchTransport, "COMPACT");

  const antes = bytes(analiseFinalizada());
  const depois = bytes(compacta);
  assert.ok(depois < antes * 0.1, `esperava >90% de corte; cortou ${((1 - depois / antes) * 100).toFixed(1)}%`);

  /* A fotografia sobrevive: é ela que sustenta cabeçalho, cards e Blueprint. */
  assert.ok(compacta.youtubeFrozenInvestigation);
});

/* ============================== B, C e D ============================== */

test("B, C e D · o disclosure busca no PRIMEIRO clique, e só nele", () => {
  const painel = semComentarios(fonteDoPainelYoutube);

  /*
   * ============ O BLOQUEADOR QUE ESTE GATE FECHA ============
   *
   * O 2.1 compactou o transporte e deixou o disclosure lendo `run`. Resultado:
   * amostra VAZIA depois do freeze. A fiação é o conserto — e ela é a mesma da
   * Amazon, pela mesma autoridade.
   */
  assert.match(painel, /onToggle=\{evento => \{/);
  assert.match(painel, /if \(!\(evento\.currentTarget as HTMLDetailsElement\)\.open\) return;/);
  assert.match(painel, /if \(corrida \|\| lazySample\?\.state !== "IDLE"\) return;/);
  assert.match(painel, /onLoadSample\?\.\(\)/);

  /* §13.B · fechado, nenhuma leitura: a busca é do `onToggle`, não da montagem. */
  assert.equal(/useEffect\([^)]*onLoadSample/.test(painel), false);
  assert.equal(/\bfetch\(/.test(painel), false, "o painel não fala com a rede direto");

  /*
   * §1 · E NENHUM ENDPOINT PRÓPRIO DE YOUTUBE NASCEU.
   *
   * A auditoria é do ENDEREÇO e da FUNÇÃO, não da palavra: os `data-testid` do
   * painel contêm "youtube-sample" por construção, e acusá-los pegaria o nome
   * dos elementos em vez de um segundo caminho.
   */
  const pagina = semComentarios(fonteDaPagina);
  assert.equal(/loadYoutubeSample|loadRadarYoutubeSample/.test(pagina + painel), false, "nasceu um cliente por perfil");
  assert.equal(/\/api\/editorial\/radar-youtube-(part|sample)/.test(pagina + painel), false, "nasceu uma rota por perfil");
  assert.match(pagina, /loadRadarResearchSample\(\{ brandId: selectedBrandId, articleId: target\.articleId, profile \}\)/);
});

test("D · a leitura lazy do YouTube não chama provider", async () => {
  const chamadas: string[] = [];
  const fetchFalso = (async (url: unknown) => {
    chamadas.push(String(url));
    return { ok: true, json: async () => ({ success: true, readbackConfirmed: true, analysisVersionId: "v-2", sample: { profile: "YOUTUBE", run: corrida(), count: 38 } }) };
  }) as unknown as typeof fetch;

  const resultado = await loadRadarResearchSample({
    brandId: "marca-1", articleId: "artigo-1", profile: "YOUTUBE", fetchImpl: fetchFalso,
  });

  assert.equal(resultado.ok, true);
  assert.equal(chamadas.length, 1);
  assert.match(chamadas[0], /profile=YOUTUBE/);
  assert.match(chamadas[0], /^\/api\/editorial\/radar-research-part\?/);

  const cliente = semComentarios(fonteDoClienteLazy);
  assert.equal(/dataforseo|executeDataForSeo|youtube\.com\/results/.test(cliente), false);
});

/* ================================ E e F ================================ */

test("E e F · a amostra vem da fotografia corrente, e a fotografia legada continua legível", () => {
  /*
   * §2 · A REFERÊNCIA CANÔNICA MANDA.
   *
   * A contagem do rótulo sai de `runRef.universeSize` — a fotografia — e não de
   * uma corrida viva que pode ser outra. Ler a corrida primeiro faria o rótulo
   * descrever uma coleta que não é a congelada.
   */
  const resumo = radarResearchSampleSummary({
    payload: compactRadarResearchForRead(analiseFinalizada() as unknown as Record<string, unknown>),
    profile: "YOUTUBE",
  });
  assert.deepEqual(resumo, { count: 38, available: true, unit: "vídeo(s)" });

  const fonte = semComentarios(fonteDoModelo);
  assert.match(fonte, /const referencia = congelada \? objeto\(congelada\.runRef\) : null;/);
  assert.ok(
    fonte.indexOf("Number(referencia?.universeSize)") < fonte.indexOf("lista(corrida?.universe).length", fonte.indexOf("Number(referencia?.universeSize)")),
    "a referência é lida ANTES da corrida",
  );

  /*
   * §2 · A FOTOGRAFIA LEGADA carrega a corrida inteira, sem `runRef`.
   *
   * Reescrevê-la seria migrar histórico. A leitura cai na cópia que aquela
   * fotografia tem — e continua respondendo.
   */
  const legada = analiseFinalizada(true);
  const resumoLegado = radarResearchSampleSummary({ payload: legada, profile: "YOUTUBE" });
  assert.equal(resumoLegado.count, 38);
  const amostraLegada = radarResearchSampleOfAnalysis({ payload: legada, profile: "YOUTUBE" });
  assert.equal((amostraLegada.run as { universe: unknown[] }).universe.length, 38);
});

/* ================================== G ================================== */

test("G · o erro da amostra não altera o estado FINALIZED", () => {
  const painel = semComentarios(fonteDoPainelYoutube);

  /*
   * A falha vive DENTRO do disclosure, com botão próprio. O cabeçalho, os cards
   * e o Blueprint continuam pintados a partir da fotografia — que não depende
   * da leitura que falhou.
   */
  assert.match(painel, /data-testid="radar-youtube-sample-failed"/);
  assert.match(painel, /data-testid="radar-youtube-sample-retry"/);
  assert.match(painel, /Não foi possível carregar a amostra\./);

  const compacta = compactRadarResearchForRead(analiseFinalizada() as unknown as Record<string, unknown>);
  const projecao = radarResearchProfileStateOfAnalysis({ payload: compacta, profile: "YOUTUBE" });
  assert.equal(projecao.state, "FINALIZED");
  assert.equal(projecao.counts.videos, 38, "as contagens vêm da referência, não da amostra");

  /*
   * E A ÚNICA AÇÃO QUE SOBRA DEPOIS DO FREEZE CONTINUA OFERECIDA.
   *
   * Ela lia só `run`; com o transporte compactado, "Reabrir / zerar" sumiria de
   * uma investigação finalizada.
   */
  const reset = painel.slice(painel.indexOf('data-testid="radar-youtube-reset"') - 260, painel.indexOf('data-testid="radar-youtube-reset"'));
  assert.match(reset, /\{\(corrida \|\| frozen\) && <button/);
});

/* ================================== H ================================== */

test("H · o handoff não exige a amostra aberta no cliente", () => {
  const pagina = semComentarios(fonteDaPagina);
  /*
   * A FATIA É O CORPO DO HANDLER, não a região do arquivo.
   *
   * `carregarParteDaPesquisa` é DEFINIDA logo abaixo de `enviarAoPlanejador`;
   * uma fatia que fosse até `startYoutubeSearch` acusaria a definição vizinha em
   * vez de uma dependência real.
   */
  const inicio = pagina.indexOf("const enviarAoPlanejador");
  const fatia = pagina.slice(inicio, pagina.indexOf("  };", pagina.indexOf("setPlannerBusy(false);", inicio)));

  /*
   * §11 · O SERVIDOR RESOLVE AS PRÓPRIAS AUTORIDADES.
   *
   * Lazy é transporte de tela. Exigir que a pessoa abra a amostra antes de
   * entregar faria a fronteira depender de um clique de curiosidade.
   */
  assert.ok(fatia.length > 0);
  assert.equal(/lazySample|carregarParteDaPesquisa|onLoadSample/.test(fatia), false);
  assert.match(fatia, /postRadarPlannerHandoff\(\{/);
});

/* ============================= I, L e M · Google ============================= */

test("I e M · o Google foi auditado, e a decisão está registrada no código", async () => {
  /*
   * ============ §5 e §8 · O QUE A AUDITORIA ENCONTROU ============
   *
   * A amostra do Google é `payload.extractions` — páginas extraídas, ~4,7 KB
   * cada. Ela ESTÁ no payload inicial da versão corrente.
   *
   * E ela alimenta CAMINHOS DE ESCRITA do pipeline do Google: a curadoria
   * regrava `extractions` filtradas, e a extração nova as mescla.
   *
   * ============ O QUE O RADAR_FINAL_2.3 MUDOU ============
   *
   * O 2.2 parou aqui por §8: compactar quebraria o fluxo de extração. O 2.3
   * removeu o bloqueio na ORDEM certa — primeiro a fronteira de escrita do
   * Google FINALIZED, provada no servidor; só depois a compactação.
   *
   * O que este teste continua protegendo é a auditoria: `extractions` é a
   * amostra, e a associação com a fotografia existe e não foi inventada.
   */
  const contratos = semComentarios(await readFile(new URL("../lib/radar/analysis-contracts.ts", import.meta.url), "utf8"));
  assert.match(contratos, /extractions: z\.array\(RadarExtractionPageSchema\)/);

  /* As corridas continuam sendo as dos dois perfis; a amostra do Google é lista. */
  const modelo = semComentarios(fonteDoModelo);
  assert.match(modelo, /const CORRIDAS = \["amazonSearch", "youtubeSearch"\] as const;/);
  assert.match(modelo, /const LISTAS_DE_AMOSTRA = \["extractions"\] as const;/);

  /*
   * §8 · A ASSOCIAÇÃO EXISTE E NÃO PRECISOU SER INVENTADA.
   *
   * `finalizedBundle.sample.extractionIds` amarra a amostra à fotografia
   * corrente. É o contrato que um lazy do Google usaria — ele não falta.
   */
  const congelamento = semComentarios(await readFile(new URL("../lib/radar/investigation-finalization.ts", import.meta.url), "utf8"));
  assert.match(congelamento, /extractionIds: z\.array\(z\.string\(\)\)/);
});

test("L · o perfil Google atravessa a autoridade genérica sem inventar amostra", () => {
  /*
   * A rota genérica já entende GOOGLE. Ela devolve `run: null` e a contagem do
   * modelo observado — não uma amostra fabricada a partir de uma análise viva.
   */
  const amostra = radarResearchSampleOfAnalysis({
    payload: { deepResearch: { observed: { sample: { comparablePages: 9 } } } },
    profile: "GOOGLE",
  });
  assert.equal(amostra.run, null);
  assert.equal(amostra.count, 9);

  const resumo = radarResearchSampleSummary({
    payload: { deepResearch: { observed: { sample: { comparablePages: 9 } } } },
    profile: "GOOGLE",
  });
  assert.deepEqual(resumo, { count: 9, available: true, unit: "página(s)" });
});

/* ================================== N ================================== */

test("N · a Amazon não regride: initial compacto, lazy nos dois disclosures", () => {
  const painel = semComentarios(fonteDoPainelAmazon);

  assert.match(painel, /onToggle=\{evento => \{/);
  assert.match(painel, /if \(leitura \|\| lazySample\?\.state !== "IDLE"\) return;/);
  assert.match(painel, /if \(tecnico \|\| lazyProvenance\?\.state !== "IDLE"\) return;/);
  /* 1.3 · §8 · a amostra da Amazon nasce fechada, sem condição nenhuma. */
  assert.equal(/open=\{projecao\.sampleDefaultExpanded/.test(painel), false);

  /*
   * E A PORTA CONTINUA ÚNICA: os dois painéis usam a mesma, e ela não conhece
   * perfil nenhum. Um cliente por perfil divergiria na primeira correção feita
   * só num deles.
   */
  const pagina = semComentarios(fonteDaPagina);
  assert.equal((pagina.match(/loadRadarResearchSample\(/g) || []).length, 1, "uma chamada de amostra para os três perfis");
  assert.equal((pagina.match(/loadRadarResearchProvenance\(/g) || []).length, 1);

  /* §9 · e a trava de escrita segue intacta. */
  const contratos = semComentarios(fonteDoModelo);
  assert.match(contratos, /researchTransport: "COMPACT"/);
});

/* ===================== §2 · a corrida efetiva é UMA ===================== */

test("§2 · o painel do YouTube deriva tudo da MESMA corrida efetiva", () => {
  const painel = semComentarios(fonteDoPainelYoutube);

  /*
   * Coortes, seleção, proveniência e amostra leem `corrida`. Duas fontes aqui
   * fariam a tela contar uma coisa no rótulo e outra nos cards — sobre a mesma
   * investigação.
   */
  assert.match(painel, /const corrida = run \|\| lazySample\?\.run \|\| null;/);
  for (const derivacao of [
    "radarYoutubeRunSummary(corrida)",
    "radarYoutubeFormatCohorts(corrida?.universe || [])",
    "new Set(corrida?.selectedVideoIds || [])",
  ]) {
    assert.ok(painel.includes(derivacao), `derivação fora da corrida efetiva: ${derivacao}`);
  }
});

test("sentinela · nenhuma ida ao servidor fora das leituras declaradas", () => {
  assert.deepEqual(idasAoServidor, []);
});
