import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { buildRadarYoutubeUniverse, RadarYoutubeSearchResultSchema } from "../lib/radar/youtube-search-model.ts";
import { buildRadarYoutubeRunFingerprint, buildRadarYoutubeSearchRun, RADAR_YOUTUBE_PROVIDER_ENDPOINT } from "../lib/radar/youtube-search-run.ts";
import {
  RADAR_VIDEO_EXPORT_CELL_CHARS,
  RADAR_VIDEO_EXPORT_COLUMNS,
  buildRadarVideoExportArticle,
  radarPortableVideoExport,
  radarVideoExportYoutubeOf,
  type RadarVideoExportYoutube,
} from "../lib/radar/portable-video-export.ts";
import {
  radarGoogleShortVideos,
  radarSocialPieceOf,
  radarVideoCredentialMarker,
  radarVideoLensDigestRequests,
  radarVideoLensOrganicOf,
  radarVideoTitleSignals,
} from "../lib/radar/video-competitive.ts";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { SERP_CACHE_LENSES, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import type { RadarPortableFrozenLensesInput } from "../lib/radar/portable-serp-observed.ts";
import { ARTIGO, EXPORTADO_EM, MARCA, entradaGoogle } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-07 · O CSV DE VÍDEO COMPETITIVO PELA SERP (Parte 1 do desenho, itens 6, 2, 8 e 7) =====
 *
 * Pedido do dono: "a ideia de poder criar conteúdos derivados do assunto é
 * para utilizar a SERP para fazer desses conteúdos competitivos, incluindo os
 * dados de estilos de imagem que podem ser utilizados para os storyboard; eles
 * podem ser fundamento dos vídeos e dos carrosséis. Precisa caprichar na
 * pesquisa competitiva."
 *
 *   6 · concorrencia_curtos_e_carrossel: os curtos do Google (autor do campo
 *       source, duração só do m:ss do título, sem repetição), os Shorts do
 *       YouTube com o motivo do zero, a presença dos blocos por lente, o
 *       orgânico de rede social nas lentes (o resumo do cache, a única leitura
 *       nova), carrossel CONFIRMADO só com img_index, perfil fora;
 *   2 · cadeia_competitiva: referência → observação → oportunidade → entrega →
 *       formato por id da planta; texto só liga por igualdade de chave;
 *   8 · storyboard_visual: estilo observado só com o que se afirma sem ver a
 *       imagem; nenhum adjetivo de estilo;
 *   7 · o "nada assistido" com o cruzamento da biblioteca da marca.
 *
 * Fixtures reais: a SERP do Google de "skin care noturno" (6 curtos, 3
 * repetidos no bloco de vídeos, 4 imagens, 1 do Instagram), a pesquisa do
 * YouTube da mesma busca (com Shorts) e o cache real das lentes da AdalbaPro
 * (o carrossel com img_index). PROVIDER_CALLS = 0: a rede é recusada.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== as fixtures ============================== */

const lerFixture = async (nome: string) => JSON.parse(await readFile(new URL(`./fixtures/${nome}`, import.meta.url), "utf8"));
const TAREFA_NOTURNO = await lerFixture("dataforseo-google-skin-care-noturno.json");
const YOUTUBE_NOTURNO = await lerFixture("dataforseo-youtube-skin-care-noturno.json");
const PUBLICADOS = await lerFixture("adalbapro-publicados-serp-2026-09-26.json");

/* A SERP real de "skin care noturno" como snapshot da investigação (desktop · Windows). */
const SNAPSHOT_NOTURNO = normalizeDataForSeoSerpResponse({ version: "0.1", status_code: 20000, status_message: "Ok.", tasks: [TAREFA_NOTURNO] }, {
  brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: "9d4e2a7c-3b5f-4c6d-8e9f-1a2b3c4d5e6f", keywordId: "k-noturno", keywordDnaVersionId: "k-noturno", keyword: "skin care noturno",
  location: "2076", language: "pt", device: "desktop", operatingSystem: "windows", expectedIntent: "informacional", expectedFormat: "Pilar",
  requiredTopics: [], articleEntities: [], resultLimit: 100, version: 1, previousSnapshotId: null,
}, { locationCode: 2076, languageCode: "pt" }, "2026-09-20T09:05:00.000Z", "tarefa-noturno");

function entradaNoturno(extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: { ...base.article, principalKeyword: "skin care noturno", secondaryKeywords: [] },
    serpObserved: { ...base.serpObserved!, snapshot: SNAPSHOT_NOTURNO },
    ...extra,
  };
}

const corrida = (results: unknown[], providerShortsCount: number | null = null, runId = "run-noturno") => buildRadarYoutubeSearchRun({
  runId, runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
  fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ["ytq:1"] }),
  provenance: {
    provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
    queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [], collectedAt: "2026-09-14T18:51:07.000Z",
    providerShortsCount,
  },
  queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: results.length }],
  results: results as never, universe: buildRadarYoutubeUniverse(results as never),
});

/* A pesquisa real do YouTube de "skin care noturno" (25 itens, 14 Shorts marcados). */
const youtubeNoturno = (): RadarVideoExportYoutube => radarVideoExportYoutubeOf({
  run: corrida(normalizeDataForSeoYoutubeResponse(YOUTUBE_NOTURNO, "ytq:1").results),
  frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM,
})!;

/* Uma pesquisa sintética só de vídeos longos, com títulos escolhidos e a contagem de Shorts do provider. */
function youtubeLongos(titulos: readonly string[], providerShortsCount: number | null, extra: Record<string, unknown> = {}): RadarVideoExportYoutube {
  const results = titulos.map((title, indice) => RadarYoutubeSearchResultSchema.parse({
    videoId: `lng${String(indice).padStart(8, "0")}`, url: `https://www.youtube.com/watch?v=lng${String(indice).padStart(8, "0")}`,
    title, channelName: `Canal ${indice}`, rank: indice + 1, durationSeconds: 600 + indice * 30, views: 1_000, isShorts: false,
    publishedAt: "2026-03-01T00:00:00.000Z", queryId: "ytq:1", thumbnailUrl: `https://i.ytimg.com/vi/lng${String(indice).padStart(8, "0")}/hqdefault.jpg`, ...extra,
  }));
  return radarVideoExportYoutubeOf({ run: corrida(results, providerShortsCount, `run-${providerShortsCount}`), frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM })!;
}

const LENTE_POR_ROTULO: Record<string, SerpCacheLens> = Object.fromEntries(SERP_CACHE_LENSES.map(lens => [`${lens.device}-${lens.operatingSystem}`, lens]));

/* O cache REAL das lentes extras da AdalbaPro (fixture publicados), como o resumo orgânico que a leitura em modo digest devolve. */
function resumoDoCache(keywordDoFixture: string, keywordDoArtigo: string) {
  const entradas = (PUBLICADOS.serp as Array<{ keyword: string; lente: string; urls: string[] | null }>).filter(item => item.keyword === keywordDoFixture && item.urls);
  return entradas.map(item => ({
    request: { query: { keyword: keywordDoArtigo, lens: LENTE_POR_ROTULO[item.lente] } },
    hit: { digest: { version: "organic-digest-v1" as const, keyword: keywordDoArtigo, depth: 10, organic: item.urls!.map((url, indice) => ({ rank_group: indice + 1, url })), blocks: [], sellers: [] } },
    missReason: null,
  }));
}

/* As quatro lentes congeladas no pacote, com os blocos que cada uma mostrou. */
function lentesCongeladas(blocos: Record<string, string[]>): RadarPortableFrozenLensesInput {
  return {
    profile: "GOOGLE",
    frozenAt: "2026-09-20T13:00:00.000Z",
    block: {
      version: 1, canonicalSnapshotId: "s", canonicalSnapshotHash: "h", lensSetHash: "l", auxiliary: [], datesSpreadDays: 0, limitations: [],
      lenses: Object.entries(blocos).map(([lens, itemTypes]) => ({ lens, status: "observed", itemTypes })),
    },
  } as never;
}

type SecaoDaPlanta = RadarArticleBlueprintPayload["blueprint"]["sections"][number];

/* A planta do artigo-modelo pelo caminho real (brief + saneamento), com as seções sob medida. */
function plantaDe(entrada: RadarPortableExportInput, secoes: Array<Partial<SecaoDaPlanta> & { h2: string }>, evidenciaExtra: RadarArticleBlueprintPayload["evidence"] = []): RadarArticleBlueprintPayload {
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: null, articleId: ARTIGO, publication: null });
  const origem = brief.evidence[0]?.id || "M1";
  const ai = RadarArticleBlueprintAiSchema.parse({
    keywordPlan: { reading: "A principal no título." }, reader: "Leitora.", promise: "Promessa.", angle: { statement: "Ângulo." },
    title: { h1: "Skin care noturno: a ordem que funciona", seoTitle: "SEO", metaDescription: "Meta." },
    opening: { readerQuestion: "Qual a ordem do skin care noturno?", direction: "Responder." },
    sections: ["Base", "Meio", "Fim"].map(h2 => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: [origem], practical: null })),
    closing: { turn: "Virada.", cta: "CTA." },
    visual: [{ slot: "CAPA", prompt: "pia" }, { slot: "R1", prompt: "frascos" }, { slot: "R2", prompt: "toalha" }],
  });
  const planta = { ...radarSanitizeArticleBlueprint(ai, brief).payload, approval: "APPROVED" as const };
  const base = planta.blueprint.sections[0];
  return {
    ...planta,
    evidence: [...planta.evidence, ...evidenciaExtra],
    blueprint: {
      ...planta.blueprint,
      sections: secoes.map(secao => ({ ...base, readerQuestion: `${secao.h2}?`, practical: null, h3: [], evidence: [], from: [], externalLinks: [], ...secao })),
    },
  };
}

const linhaDe = (entrada: RadarPortableExportInput, contexto: Partial<Parameters<typeof buildRadarVideoExportArticle>[1]> = {}) =>
  buildRadarVideoExportArticle(entrada, { position: 1, youtube: null, ...contexto }).row;

/* O bloco de um capítulo na cadeia: do cabeçalho "Capítulo N · …" até o próximo. */
const blocoDoCapitulo = (cadeia: string, numero: number) => {
  const linhas = cadeia.split("\n");
  const inicio = linhas.findIndex(linha => linha.startsWith(`Capítulo ${numero} · `));
  assert.ok(inicio >= 0, cadeia);
  const fim = linhas.findIndex((linha, indice) => indice > inicio && /^Capítulo \d+ · /.test(linha));
  return linhas.slice(inicio, fim < 0 ? undefined : fim).join("\n");
};

/* Adjetivo de estilo só existe para quem VIU a imagem: o Radar não vê. */
const ADJETIVO_DE_ESTILO = /minimalista|\bclean\b|modern[oa]s?\b|elegante|sofisticad|vibrante|aconchegante|luxuos|delicad|cl[aá]ssic[oa]|vintage|retr[oô]\b|futurista|colorid|\bpastel\b|clarinh|escurinh|despojad|harmonios|impactante|chamativ|bonit[oa]s?\b|atraente/i;

/* ================================ item 6 ================================ */

test("6 · curtos do Google (fixture real): seis sem repetição, autor do provider, duração só do m:ss do título, credencial, relevância e o cruzamento com o YouTube", () => {
  const curtos = radarGoogleShortVideos(SNAPSHOT_NOTURNO.serpFeatures!.videos);
  /* O bloco de vídeos repete três curtos: a mesma peça é uma. */
  assert.equal(SNAPSHOT_NOTURNO.serpFeatures!.videos.length, 9, "o fixture tem 9 itens, 3 repetidos");
  assert.equal(curtos.length, 6);
  assert.equal(new Set(curtos.map(curto => curto.url)).size, 6);
  assert.deepEqual(curtos.map(curto => curto.segundos), [19, 95, 56, 81, 84, 18], "a duração é a do fim do título");
  assert.ok(curtos.every(curto => curto.curto));
  for (const curto of curtos) assert.doesNotMatch(curto.titulo, /enviado por|Assistir em|\d:\d\d$/, "o título sai sem a moldura do Google");
  assert.deepEqual(curtos.map(curto => radarVideoCredentialMarker(curto.autor)).filter(Boolean), ["dra", "farmaceutica"], "Dra. e Farmacêutica; \"Maquiadora Profissional\" não é credencial");

  const coluna = linhaDe(entradaNoturno(), { youtube: youtubeNoturno() }).concorrencia_curtos_e_carrossel;
  const itens = coluna.split("\n").filter(linha => /^\d+\. /.test(linha));
  assert.equal(itens.length, 6, coluna);
  assert.match(coluna, /^Curtos e vídeos que o Google mostra para "skin care noturno" \(desktop · Windows; blocos de vídeos curtos e de vídeos, sem repetição;/m);
  assert.match(coluna, /^2\. YouTube · Short · Dra\. Marina Hayashida · 1:35 · "Limpeza e Hidratação: A Base do Skincare Noturno \(Minha rotina\)" · relevância: [^·]+ · também na pesquisa do YouTube \(posição \d+\) — https:\/\/www\.youtube\.com\/shorts\/Ce6RKljTA1c$/m);
  assert.match(coluna, /^3\. Instagram · Reel · Thaíse Santos \| Farmacêutica · 0:56 · /m);
  assert.match(coluna, /^6\. TikTok · vídeo · lafernandesss · 0:18 · /m);
  /* A leitura da amostra: duração, plataformas, credencial e padrões — e a duração-alvo pelo P75. */
  assert.match(coluna, /^Leitura da amostra pertinente de curtos \(\d+: \d+ do Google, \d+ da pesquisa do YouTube\): duração mediana \d+:\d\d \(metade central entre \d+:\d\d e \d+:\d\d\), \d+ com duração; plataformas: [^;]+; autor com credencial no nome: 2 de \d+; padrões de título: /m);
  assert.match(coluna, /^Duração-alvo dos cortes: até \d+:\d\d \(P75 dos \d+ curto\(s\) pertinente\(s\) com duração; referência, não meta\)\.$/m);
  assert.match(coluna, /^No bloco de imagens do Google \(desktop · Windows\), 1 de 4 imagem\(ns\) vêm do instagram\.com/m);
  /* O Reel orgânico da posição 4 da lente da investigação entra nas redes sociais. */
  assert.match(coluna, /^Redes sociais no orgânico \(top 10; desktop · Windows; as lentes extras não foram lidas nesta exportação\): Instagram 1 \(Reel 1\)\. Por lente: desktop · Windows 1\.$/m);
  /* Nada sobre retenção, alcance ou visualização de curto: a busca mostra, não mede. */
  assert.doesNotMatch(coluna, /visualiza|retém|reteve|viraliz/i);
});

test("6 · o endereço diz a peça: Reel, post, carrossel CONFIRMADO só com img_index, TikTok, Short, LinkedIn — e perfil fica fora", () => {
  assert.equal(radarSocialPieceOf("https://www.instagram.com/reel/DYKYR7htpKW/")?.tipo, "Reel");
  assert.equal(radarSocialPieceOf("https://www.instagram.com/p/DcmYqNYCC37/")?.tipo, "post");
  assert.equal(radarSocialPieceOf("https://www.instagram.com/p/DYEwpUCjfM1/?img_index=3")?.tipo, "carrossel confirmado (img_index)");
  assert.equal(radarSocialPieceOf("https://www.instagram.com/p/DYEwpUCjfM1/?img_index=3")?.chave, radarSocialPieceOf("https://www.instagram.com/p/DYEwpUCjfM1/")?.chave, "o mesmo post com e sem img_index é uma peça");
  assert.equal(radarSocialPieceOf("https://www.instagram.com/clinicaexemplo/")?.perfil, true);
  assert.equal(radarSocialPieceOf("https://www.tiktok.com/@lafernandesss/video/7469906708723289399")?.tipo, "vídeo");
  assert.equal(radarSocialPieceOf("https://www.tiktok.com/@lafernandesss")?.perfil, true);
  assert.equal(radarSocialPieceOf("https://www.youtube.com/shorts/ivaP0zGHkII")?.tipo, "Short");
  assert.equal(radarSocialPieceOf("https://www.youtube.com/watch?v=17pP43q7UII"), null, "vídeo comum do YouTube já está na serp_youtube");
  assert.equal(radarSocialPieceOf("https://www.linkedin.com/pulse/marketing-para-clinicas-ana/")?.tipo, "artigo");
  assert.equal(radarSocialPieceOf("https://br.linkedin.com/posts/ana_clinica-activity-1")?.tipo, "post");
  assert.equal(radarSocialPieceOf("https://www.linkedin.com/in/ana")?.perfil, true);
  assert.equal(radarSocialPieceOf("https://sitese.com.br/blog/por-que"), null);
});

test("6 · o resumo das lentes extras (cache real): carrossel confirmado por img_index, contagem por peça e por lente, perfil fora — e o motivo de cada lente sem leitura", () => {
  const principal = "como atrair clientes pelo instagram";
  const lookups = resumoDoCache("instagram não traz pacientes", principal);
  assert.equal(lookups.length, 3, "o fixture tem as três lentes extras com URL (a canônica guarda o corpo, não o resumo)");
  /* Um perfil a mais na lente de iOS, para provar que perfil não conta. */
  const comPerfil = lookups.map(item => (item.request.query.lens.operatingSystem === "ios"
    ? { ...item, hit: { digest: { ...item.hit.digest, organic: [...item.hit.digest.organic, { rank_group: 9, url: "https://www.instagram.com/clinicaexemplo/" }] } } }
    : item));
  const resumos = radarVideoLensOrganicOf({ lookups: comPerfil, readFailed: false }, principal);
  assert.deepEqual(resumos.lenses.map(lente => lente.lens), ["desktop-macos", "mobile-android", "mobile-ios"]);
  const entrada = entradaNoturno({ article: { ...entradaGoogle().article, principalKeyword: principal, secondaryKeywords: [] } });
  const coluna = linhaDe(entrada, { lensDigests: resumos }).concorrencia_curtos_e_carrossel;
  assert.match(coluna, /^- Instagram · carrossel confirmado \(img_index\) · desktop · macOS posição 8 — https:\/\/www\.instagram\.com\/p\/DYEwpUCjfM1\/\?img_index=3$/m);
  assert.match(coluna, /^Carrossel e posts que ranqueiam \(abrir e anotar; o cache não diz quantas lâminas nem o visual\):$/m);
  assert.match(coluna, /^Redes sociais no orgânico \(top 10; desktop · Windows, desktop · macOS, celular · Android, celular · iOS\): Instagram \d+ \([^)]*carrossel confirmado \(img_index\) 1[^)]*\) · YouTube 1 \(Short 1\) · perfis \(fora da conta\): 1\. Por lente: desktop · Windows 1 · desktop · macOS 6 · /m);
  assert.doesNotMatch(coluna, /clinicaexemplo/, "perfil não vira referência");
  assert.doesNotMatch(coluna.split("\n").find(linha => linha.startsWith("Redes sociais no orgânico")) || "", /\bperfil \d/, "perfil não entra na contagem de peças");
  /* O carrossel só é afirmado com img_index: sem ele, o mesmo post é "post". */
  const semIndice = radarVideoLensOrganicOf({ lookups: lookups.map(item => ({ ...item, hit: { digest: { ...item.hit.digest, organic: item.hit.digest.organic.map(org => ({ ...org, url: org.url.replace(/\?img_index=\d+$/, "") })) } } })), readFailed: false }, principal);
  const semCarrossel = linhaDe(entrada, { lensDigests: semIndice }).concorrencia_curtos_e_carrossel;
  assert.doesNotMatch(semCarrossel, /carrossel confirmado/);
  assert.match(semCarrossel, /^- Instagram · post · desktop · macOS posição 8 — https:\/\/www\.instagram\.com\/p\/DYEwpUCjfM1\/$/m);

  /* Cada lente sem leitura diz por quê; a leitura que falhou não vira "nenhuma peça". */
  const daLente = (sistema: string) => lookups.find(item => item.request.query.lens.operatingSystem === sistema)!;
  const parcial = radarVideoLensOrganicOf({
    lookups: [
      daLente("macos"),
      { request: daLente("android").request, hit: null, missReason: "vencida" },
      { request: daLente("ios").request, hit: {}, missReason: null },
    ],
    readFailed: false,
  }, principal);
  assert.deepEqual(parcial.lenses.map(lente => lente.missing), [null, "sem coleta válida no cache (vencida)", "a coleta gravada não tem o resumo orgânico"]);
  assert.match(linhaDe(entrada, { lensDigests: parcial }).concorrencia_curtos_e_carrossel, /^Lentes sem leitura do orgânico nesta exportação: celular · Android \(sem coleta válida no cache \(vencida\)\); celular · iOS \(a coleta gravada não tem o resumo orgânico\)\.$/m);
  const falhou = radarVideoLensOrganicOf({ lookups: [], readFailed: true }, principal);
  assert.ok(falhou.lenses.every(lente => lente.organic === null && lente.missing === "a leitura do cache falhou nesta exportação"));
});

test("6 · os pedidos do resumo: só a principal de cada artigo, só nas três lentes extras", () => {
  const pedido = (keyword: string, lens: SerpCacheLens) => ({ query: { keyword, lens }, depth: 10, keywordId: null });
  const pedidos = ["skin care noturno", "rotina noturna"].flatMap(keyword => SERP_CACHE_LENSES.map(lens => pedido(keyword, lens)));
  const resumo = radarVideoLensDigestRequests(pedidos, ["Skin  care noturno", null]);
  assert.deepEqual(resumo.map(item => `${item.query.keyword}:${item.query.lens.device}-${item.query.lens.operatingSystem}`), [
    "skin care noturno:desktop-macos", "skin care noturno:mobile-android", "skin care noturno:mobile-ios",
  ]);
});

test("6 · o zero de Shorts diz qual das duas histórias aconteceu (radarYoutubeShortsNotice), e a presença dos blocos vem das lentes congeladas", () => {
  const titulos = ["Skin care noturno: a ordem certa", "Rotina de skin care noturno simples", "Skin care noturno para pele oleosa", "Erros no skin care noturno"];
  const naoMarcou = youtubeLongos(titulos, 0);
  assert.equal(naoMarcou.shortsNotice, "O YouTube não marcou nenhum resultado como Short nesta busca.");
  assert.match(linhaDe(entradaNoturno(), { youtube: naoMarcou }).concorrencia_curtos_e_carrossel, /^Shorts da pesquisa do YouTube: 0 pertinente\(s\) de 0 \(Short pelo selo do YouTube ou pela duração\)\. O YouTube não marcou nenhum resultado como Short nesta busca\.$/m);
  const perdeu = youtubeLongos(titulos, 3);
  assert.match(linhaDe(entradaNoturno(), { youtube: perdeu }).concorrencia_curtos_e_carrossel, /^Shorts da pesquisa do YouTube: 0 pertinente\(s\) de 0 \([^)]*\)\. O YouTube marcou 3 Short\(s\) e nenhum chegou ao universo: a leitura da coleta está perdendo o formato\.$/m);
  /* Corrida anterior à medição: o zero não é atribuído a ninguém. */
  assert.equal("shortsNotice" in youtubeLongos(titulos, null), false);
  assert.match(linhaDe(entradaNoturno(), { youtube: youtubeLongos(titulos, null) }).concorrencia_curtos_e_carrossel, /A corrida não registrou quantos Shorts o YouTube marcou: não dá para dizer se o zero é do YouTube ou da leitura da coleta\./);

  const congeladas = lentesCongeladas({
    "desktop-windows": ["organic", "short_videos", "video", "images"], "desktop-macos": ["organic", "images", "perspectives"],
    "mobile-android": ["organic", "short_videos"], "mobile-ios": ["organic", "short_videos", "images"],
  });
  const presenca = linhaDe(entradaNoturno(), { lentesCongeladas: congeladas }).concorrencia_curtos_e_carrossel;
  assert.match(presenca, /^Presença dos blocos por lente \(cópia das lentes congelada no pacote\): vídeos curtos \(Shorts\): desktop · Windows, celular · Android, celular · iOS \(3 de 4\) · vídeos: desktop · Windows \(1 de 4\) · imagens: desktop · Windows, desktop · macOS, celular · iOS \(3 de 4\) · perspectivas: desktop · macOS \(1 de 4\) · discussões e fóruns: nenhuma das 4\.$/m);
  /* Sem o pacote com as lentes, a lente da investigação pelo snapshot. */
  assert.match(linhaDe(entradaNoturno()).concorrencia_curtos_e_carrossel, /^Presença dos blocos: o pacote não congelou as quatro lentes; na lente da investigação \(desktop · Windows\): vídeos curtos \(Shorts\) sim · vídeos sim · imagens sim · perspectivas não · discussões e fóruns não\.$/m);
});

test("6 · o vídeo comum do bloco de vídeos é listado, mas fica fora da amostra de curtos; sem curto com duração, a régua de 60 segundos", () => {
  const curtos = radarGoogleShortVideos([
    { title: "Como CAPTAR MAIS CLIENTES pelo INSTAGRAM em 2025", url: "https://www.youtube.com/watch?v=4yyzU1YK16s", source: "Canal A", block: "VIDEO", youtubeVideoId: "4yyzU1YK16s", platform: "YOUTUBE" },
  ]);
  assert.equal(curtos[0].curto, false);
  const snapshot = { ...SNAPSHOT_NOTURNO, serpFeatures: { ...SNAPSHOT_NOTURNO.serpFeatures!, videos: [{ title: "Skin care noturno: a ordem certa", url: "https://www.youtube.com/watch?v=4yyzU1YK16s", domain: "youtube.com", source: "Canal A", block: "VIDEO" as const, youtubeVideoId: "4yyzU1YK16s", platform: "YOUTUBE" as const }] } };
  const coluna = linhaDe(entradaNoturno({ serpObserved: { ...entradaGoogle().serpObserved!, snapshot } })).concorrencia_curtos_e_carrossel;
  /* 2026-10-07 (revisão) · o "não é curto" saía só do bloco, sem a duração: o que se sabe é que o Google não o marca como curto. */
  assert.match(coluna, /^1\. YouTube · vídeo do bloco de vídeos \(o Google não o marca como curto\) · Canal A · /m);
  assert.match(coluna, /^Leitura da amostra pertinente de curtos: nenhum curto pertinente/m);
  assert.match(coluna, /^Duração-alvo dos cortes: até 60 segundos \(sem curto pertinente com duração na amostra/m);
});

/* ================================ item 2 ================================ */

test("2 · cadeia por id: referência, observação, oportunidade, entrega e formato de cada capítulo; páginas pela chave exata; sem casar, \"não ligadas\"; seção sem evidência é proposta editorial", () => {
  const entrada = entradaGoogle();
  const planta = plantaDe(entrada, [
    { h2: "A rotina da noite", readerQuestion: "Como montar a rotina de skincare facial?", answerFirst: "Comece pela limpeza e termine pelo hidratante.", practical: "rosto sem rotina → limpeza, sérum e hidratante → pele preparada para a noite", evidence: ["S2", "P5", "G1"], from: ["M1"] },
    { h2: "Pele oleosa", readerQuestion: "Como cuidar da pele oleosa à noite?", answerFirst: "Prefira texturas leves.", evidence: ["G3"], from: [] },
    { h2: "O fechamento", readerQuestion: "O que levar daqui?", answerFirst: "Constância vale mais que quantidade.", evidence: [], from: [] },
  ], [{ id: "G3", kind: "lacuna", text: "rotina de skincare facial (3 de 12 páginas cobrem)" }]);
  const row = linhaDe(entrada, { blueprint: planta });
  const cadeia = row.cadeia_competitiva;
  assert.match(cadeia, /^Cadeia competitiva de cada peça \(referência → observação → oportunidade → entrega → formato; ids da planta do artigo-modelo da SERP; URL só quando o id ou o rótulo exato liga\):$/m);
  assert.match(cadeia, /^Vídeo inteiro$/m);
  const um = blocoDoCapitulo(cadeia, 1);
  /* A referência pelo id S (o mesmo rótulo do CSV para escrever) e as páginas da lacuna e da pergunta pela chave exata. */
  assert.match(um, /^- Referência: S2 \(Ordem dos produtos de skincare: confira 4 passos essenciais · cetaphil\.com\.br · "7 de jun…\) · páginas que tratam P5: https:\/\/dominio-a0\.com\.br\/artigo\/skincare-facial; https:\/\/dominio-a1\.com\.br\/artigo\/skincare-facial · páginas que tratam G1: https:\/\/dominio-a0\.com\.br\/artigo\/skincare-facial; https:\/\/dominio-a1\.com\.br\/artigo\/skincare-facial$/m);
  assert.match(um, /^- Observação: P5 \(Como montar a rotina de skincare facial\? \(12 de 12 páginas\)\) · Vem do esqueleto da SERP: M1 "Como montar a rotina de skincare facial no dia a dia\?"$/m);
  assert.match(um, /^- Oportunidade: G1 \(Como montar a rotina de skincare facial\? \(12 de 12 páginas cobrem\)\)$/m);
  assert.match(um, /^- Entrega: Comece pela limpeza e termine pelo hidratante · demonstração: 3 telas: antes "rosto sem rotina" · ajuste "limpeza, sérum e hidratante" · depois "pele preparada para a noite"$/m);
  assert.match(um, /^- Formato: capítulo 1 do vídeo longo · corte 1 \(utilidade \d de 4\) · lâmina 2 do carrossel$/m);
  /* Só o que a seção cita: a P6 (outra pergunta da amostra) não aparece por semelhança. */
  assert.doesNotMatch(um, /\bP6\b|\bP1\b|\bC1\b/);
  /* A lacuna cujo texto não é igual ao assunto do Google não liga a página parecida. */
  const dois = blocoDoCapitulo(cadeia, 2);
  assert.match(dois, /páginas que tratam G3: não ligadas \(o rótulo não casou com a leitura do Google\)/);
  assert.match(dois, /^- Oportunidade: G3 \(rotina de skincare facial \(3 de 12 páginas cobrem\)\)$/m);
  assert.match(dois, /^- Formato: capítulo 2 do vídeo longo · sem corte: sem demonstração definida na planta · lâmina 3 do carrossel$/m);
  /* Sem evidência nem origem: proposta editorial, e a disputa é pela execução. */
  const tres = blocoDoCapitulo(cadeia, 3);
  assert.match(tres, /^- Observação: Origem: proposta editorial do artigo \(não vem de uma seção da SERP\)$/m);
  assert.match(tres, /^- Oportunidade: nenhuma lacuna ou diferencial ligado a este capítulo — a disputa é pela execução \(demonstração e clareza\), não por assunto novo$/m);
  /* A cadeia diz o MESMO corte que a coluna de cortes. */
  assert.match(row.cortes_para_redes, /^1\. Do capítulo 1 \(A rotina da noite\):$/m);
  assert.doesNotMatch(row.cortes_para_redes, /^\d+\. Do capítulo 2 /m);

  /* Sem planta: a frase do desenho, e a origem de cada pergunta em perguntas_do_publico. */
  const semPlanta = linhaDe(entrada);
  assert.match(semPlanta.cadeia_competitiva, /^Cadeia por capítulo: só com o artigo-modelo da SERP; a origem de cada pergunta está em perguntas_do_publico\.$/m);
  assert.match(semPlanta.perguntas_do_publico, /^- Como montar a rotina de skincare facial\? \(12 de 12 páginas · necessidade central, recorrência forte · pergunta a responder pela descoberta\)$/m);
  assert.match(semPlanta.perguntas_do_publico, /^- Qual é a ordem correta de skin care\? \(Pessoas também perguntam\)$/m);
});

test("2 · o vídeo inteiro: os pertinentes do topo, o que atravessa Google e YouTube, a faixa pertinente e a premissa; a lacuna de formato ausente não vira oportunidade", () => {
  const cadeia = linhaDe(entradaNoturno(), { youtube: youtubeNoturno() }).cadeia_competitiva;
  assert.match(cadeia, /^- Referência: pertinentes mais bem posicionados no YouTube: "[^"]+" — https:\/\/www\.youtube\.com\/watch\?v=[\w-]+ · /m);
  assert.match(cadeia, /atravessa as duas buscas: "Limpeza e Hidratação: A Base do Skincare Noturno \(Minha rotina\)[^"]*" \(posição \d+ no YouTube e no bloco de vídeos curtos do Google\)/);
  /* 2026-10-07 (revisão) · a faixa é a do formato que a sequência segue (aqui o curto: a SERP aponta Shorts), não a da coorte que lidera. */
  assert.match(cadeia, /^- Observação: padrões de título dos pertinentes: [^;]+; faixa \S+ a \S+ \(Shorts pertinentes\)$/m);
  const longos = linhaDe(entradaNoturno(), { youtube: youtubeLongos(["Skin care noturno: a ordem certa", "Rotina de skin care noturno", "Skin care noturno simples", "Erros no skin care noturno"], 0) }).cadeia_competitiva;
  assert.doesNotMatch(longos, /^- Oportunidade: .*Nenhum Short identificado/m, "a falta de Shorts é limite da amostra, dito na coluna de curtos");
});

/* ================================ item 8 ================================ */

test("8 · storyboard: estilo só com o que se afirma sem ver a imagem, referências para abrir, o checklist, a identidade visual que a Marca não tem — e nenhum adjetivo de estilo", () => {
  /* Títulos que falam com o público da entrada ("pele oleosa"): os quatro são pertinentes, e os sinais se contam um a um. */
  const titulos = ["COMO cuidar da pele oleosa à noite 🌙", "Pele oleosa em 3 passos?", "Dermatologista e a pele oleosa", "Rotina noturna para pele oleosa"];
  const entrada = entradaNoturno({ authors: [{ name: "Dra. Paula Reis", specialty: "Dermatologia", source: "contribution" }] });
  const planta = plantaDe(entrada, [
    { h2: "A ordem da noite", readerQuestion: "Qual a ordem do skincare noturno?", answerFirst: "Limpe, trate e hidrate.", practical: "limpeza; sérum; hidratante" },
    { h2: "O que evitar", readerQuestion: "O que não fazer no skin care noturno?", answerFirst: "Não misture ativos sem orientação.", practical: "rotina com três ácidos → um ativo por noite → pele sem irritação" },
  ]);
  const row = linhaDe(entrada, { youtube: youtubeLongos(titulos, 0), blueprint: planta, lentesCongeladas: lentesCongeladas({ "desktop-windows": ["images"], "desktop-macos": ["images"], "mobile-android": ["organic"], "mobile-ios": ["images"] }) });
  const story = row.storyboard_visual;
  assert.match(story, /^Estilo visual observado na SERP \(só o que dá para afirmar sem ver as imagens: o Radar não vê imagem — lê endereço, domínio, título e contagem\):$/m);
  assert.match(story, /^- Google, bloco de imagens \(desktop · Windows\): 4 imagem\(ns\) — origem pelo domínio \(inferência, não estilo\): [^;]*instagram\.com 1[^;]*; o bloco aparece em 3 de 4 lentes \(desktop · Windows, desktop · macOS, celular · iOS\)\. O texto alternativo é o título da página de origem e não descreve a imagem: não define estilo\.$/m);
  /* Os sinais do título: caixa alta, número, pergunta, emoji e credencial — e a thumbnail não foi vista. */
  assert.match(story, /^- Títulos dos 4 vídeos longos pertinentes do YouTube: caixa alta em 1 · número em 1 · pergunta em 1 · emoji em 1 · credencial no título ou no canal em 1\. A thumbnail não foi vista: o padrão é do título\.$/m);
  assert.match(story, /^- thumbnail: "COMO cuidar da pele oleosa à noite 🌙" — https:\/\/i\.ytimg\.com\/vi\/lng00000000\/hqdefault\.jpg$/m);
  assert.match(story, /^- curto: YouTube · Dra\. Marina Hayashida — https:\/\/www\.youtube\.com\/shorts\/Ce6RKljTA1c$/m);
  /* O curto que a régua do topo põe fora do tema ("SKINCARE NOITE…") não entra na conta dos pertinentes. */
  assert.match(story, /^- Curtos pertinentes do Google \(5\): autor com credencial no nome em 2; Instagram 2 · YouTube 2 · TikTok 1\.$/m);
  assert.match(story, /^Anote ao abrir \(o Radar não classifica imagem; quem abre registra\): rosto em close\? /m);
  assert.match(story, /^Identidade visual da marca: a Marca não guarda paleta, tipografia nem logo/m);
  /* Uma cena por capítulo, pela demonstração da planta; rosto só de quem fala de fato. */
  assert.match(story, /^- Cena 1 · A ordem da noite: texto na tela: "Qual a ordem do skincare noturno\?" · imagem: 3 telas, uma por passo: limpeza; sérum; hidratante · referência observada \(mesma pergunta, pelo título; não assistida\): https:\/\/www\.instagram\.com\/reel\/DYsycpfv4c9\/\.$/m);
  assert.match(story, /^- Cena 2 · O que evitar: [^\n]*imagem: 3 telas: antes "rotina com três ácidos" · ajuste "um ativo por noite" · depois "pele sem irritação"/m);
  assert.match(story, /^- Thumbnail: a promessa do título em poucas palavras; nos títulos pertinentes, número em 1 de 4 e pergunta em 1 de 4; rosto só de quem fala de fato \(aba Especialista: Dra\. Paula Reis\)\.$/m);
  /* Os cortes na vertical, os MESMOS da coluna de cortes. */
  assert.match(story, /^- Corte 1 \(capítulo 1\): tela 1: "Qual a ordem do skincare noturno\?" · tela 2: o primeiro passo "limpeza" · tela final: o CTA do corte\.$/m);
  assert.match(story, /^- Corte 2 \(capítulo 2\): tela 1: "O que não fazer no skin care noturno\?" · tela 2: o ajuste "um ativo por noite" a partir do antes "rotina com três ácidos" · tela final: o CTA do corte\.$/m);
  assert.match(row.cortes_para_redes, /^1\. Do capítulo 1 \(A ordem da noite\):$/m);
  assert.match(row.cortes_para_redes, /^2\. Do capítulo 2 \(O que evitar\):$/m);
  /* O carrossel leva texto na imagem: a regra "sem texto legível" é dita como a que NÃO vale, e nenhuma lâmina a pede. */
  assert.match(story, /^Storyboard do carrossel \(o carrossel leva texto na imagem: a regra "sem texto legível" do plano visual do artigo não vale aqui; 4 lâminas, o texto de cada uma em cortes_para_redes\):$/m);
  for (const lamina of story.split("\n").filter(linha => linha.startsWith("- Lâmina"))) assert.doesNotMatch(lamina, /sem texto/i, lamina);
  assert.match(story, /^- Lâmina 2: texto = o título "A ordem da noite" e o Apoio publicável · visual = os passos em lista: limpeza; sérum; hidratante \(lista, como em \d+ de \d+ páginas concorrentes\)\.$/m);
  /* Nenhum adjetivo de estilo em nenhuma das três colunas novas. */
  for (const coluna of ["storyboard_visual", "concorrencia_curtos_e_carrossel", "cadeia_competitiva"] as const) assert.doesNotMatch(row[coluna], ADJETIVO_DE_ESTILO, coluna);
  assert.deepEqual(radarVideoTitleSignals([{ title: "SKINCARE NOITE 🌑", channelName: "Thaíse Santos | Farmacêutica" }, { title: "CLT e skin care?", channelName: null }]), { total: 2, caixaAlta: 1, numero: 0, pergunta: 1, emoji: 1, credencial: 1 }, "sigla de 3 letras não é caixa alta");
});

/* ================================ item 7 ================================ */

test("7 · o \"nada assistido\" com o cruzamento: o vídeo do topo com transcrição na biblioteca da marca é dito pelo número; sem transcrição, a frase de antes", () => {
  const titulos = ["Skin care noturno: a ordem certa", "Rotina de skin care noturno", "Skin care noturno simples", "Erros no skin care noturno"];
  const selecionado = (transcriptBody?: string) => ({
    title: "Rotina de skin care noturno", url: "https://www.youtube.com/watch?v=lng00000001&t=12s", channel: "Canal 1", duration: "10:30",
    usage: "SUPPORT" as const, usageLabel: "Apoio", usageHint: "trecho com tempo", note: null, section: null, excerpt: null, summary: null,
    ...(transcriptBody ? { transcriptStart: "boa noite", transcriptBody } : {}),
  });
  const contexto = (transcriptBody?: string) => ({ ...entradaGoogle().videoContext!, selected: [selecionado(transcriptBody)] });
  const comTranscricao = linhaDe(entradaNoturno({ videoContext: contexto("a ordem do skin care noturno começa pela limpeza e termina no hidratante ".repeat(10)) }), { youtube: youtubeLongos(titulos, 0) }).serp_youtube;
  assert.match(comTranscricao, /^O Radar lê título, canal, duração, posição e data\. Do topo, 1 tem transcrição na biblioteca da marca \(selecionado pela marca, não pela pesquisa\): nº 2 da lista acima — o trecho está em biblioteca_da_marca\. Os outros 3 não foram assistidos nem transcritos: nada aqui afirma o que é dito dentro deles\.$/m);
  assert.doesNotMatch(comTranscricao, /Nenhum vídeo foi assistido/);
  /* Selecionado sem transcrição não foi transcrito: a frase de antes continua. */
  const semTranscricao = linhaDe(entradaNoturno({ videoContext: contexto() }), { youtube: youtubeLongos(titulos, 0) }).serp_youtube;
  assert.match(semTranscricao, /^O Radar lê título, canal, duração, posição e data\. Nenhum vídeo foi assistido ou transcrito: nada aqui afirma o que é dito dentro de um vídeo\.$/m);
});

/* ================================ D10, teto e a linha de topo ================================ */

test("D10 e teto: o CSV inteiro com as colunas novas sai concluído (sem pendência, \"pendente de\", \"aguardando\" nem \"confira antes de aprovar\"), cada célula nova cabe no teto e as linhas Marca e Voz da marca saem vazias nelas", () => {
  const entrada = entradaNoturno({ specialistContext: { ...entradaGoogle().specialistContext!, pending: 2 } });
  /* O caso maior: seis capítulos com evidência cheia, nove curtos, oito posts e as quatro lentes. */
  const ids = ["S1", "S2", "S3", "P1", "P2", "C1", "G1", "B1"];
  const planta = plantaDe(entrada, Array.from({ length: 6 }, (_, indice) => ({
    h2: `Capítulo ${indice + 1} do skin care noturno com um título longo como os do uso real`,
    readerQuestion: `Qual a ordem do skin care noturno no passo ${indice + 1} quando a pele reage?`,
    answerFirst: "Limpe, trate e hidrate, nessa ordem, com um ativo por noite.",
    practical: "rotina com três ácidos misturados → um ativo por noite, com hidratante → pele sem irritação no dia seguinte",
    h3: ["Diagnóstico da rotina", "O ajuste da noite", "Como conferir sem número inventado"],
    evidence: ids, from: ["M1", "M2"],
  })));
  const principal = "skin care noturno";
  const curtosDemais = Array.from({ length: 9 }, (_, indice) => ({ title: `Skin care noturno parte ${indice} com título comprido o bastante para encher a célula ... enviado por Autora ${indice} em Instagram. Assistir em Instagram. 0:${String(20 + indice).padStart(2, "0")}`, url: `https://www.instagram.com/reel/REEL${indice}/`, domain: "www.instagram.com", source: `Autora ${indice}`, block: "SHORT_VIDEOS" as const, youtubeVideoId: null, platform: "INSTAGRAM" as const }));
  const snapshot = { ...SNAPSHOT_NOTURNO, serpFeatures: { ...SNAPSHOT_NOTURNO.serpFeatures!, videos: [...SNAPSHOT_NOTURNO.serpFeatures!.videos, ...curtosDemais] } };
  const lookups = SERP_CACHE_LENSES.slice(1).map(lens => ({
    request: { query: { keyword: principal, lens } }, missReason: null,
    hit: { digest: { version: "organic-digest-v1" as const, keyword: principal, depth: 10, blocks: [], sellers: [], organic: Array.from({ length: 10 }, (_, indice) => ({ rank_group: indice + 1, url: `https://www.instagram.com/p/POST${lens.operatingSystem}${indice}/?img_index=${indice}`, title: `Post ${indice} sobre skin care noturno com legenda comprida que o resumo do cache guarda inteira` })) } },
  }));
  /* Vídeo longo (a SERP do YouTube aponta longos): a sequência é a da planta, e a cadeia tem os seis capítulos. */
  const titulosLongos = Array.from({ length: 10 }, (_, indice) => `Pele oleosa à noite, parte ${indice + 1}: o passo a passo comentado com erros comuns e o que muda na rotina`);
  const artigo = {
    entrada: { ...entrada, serpObserved: { ...entrada.serpObserved!, snapshot } },
    youtube: youtubeLongos(titulosLongos, 0),
    blueprint: planta,
    lentesCongeladas: lentesCongeladas({ "desktop-windows": ["short_videos", "images"], "desktop-macos": ["images"], "mobile-android": ["short_videos"], "mobile-ios": ["images"] }),
    lensDigests: radarVideoLensOrganicOf({ lookups, readFailed: false }, principal),
  };
  const voz = { kind: "available" as const, voice: { versionId: "v", version: 1, name: "Marca", contentHash: "sha256:v", status: "active", title: "Marca", sections: [{ heading: "Voz", body: "Próxima e adulta." }], markdown: "## Voz\n\nPróxima e adulta." } };
  const row = buildRadarVideoExportArticle(artigo.entrada, { position: 1, youtube: artigo.youtube, blueprint: planta, lentesCongeladas: artigo.lentesCongeladas, lensDigests: artigo.lensDigests, brandVoice: voz as never }).row;
  for (const coluna of ["concorrencia_curtos_e_carrossel", "storyboard_visual", "cadeia_competitiva"] as const) {
    assert.ok(row[coluna].length <= RADAR_VIDEO_EXPORT_CELL_CHARS, `${coluna}: ${row[coluna].length} caracteres`);
    assert.doesNotMatch(row[coluna], /cortado no limite da célula/, coluna);
  }
  assert.match(row.cadeia_competitiva, /^Capítulo 6 · /m, "a cadeia chega ao último capítulo");
  const { csv } = radarPortableVideoExport({ articles: [artigo], today: EXPORTADO_EM, brandVoice: voz as never });
  /* 2026-10-07 (revisão) · "rascunho" e "falta conferir" entraram na varredura; e a Skill de voz nos três estados da Marca (o rótulo do estado vazava). */
  const PROIBIDAS = [/pend[eê]ncia/i, /pendente de/i, /aguardando/i, /confira antes de aprovar/i, /rascunho/i, /falta conferir/i];
  for (const proibida of PROIBIDAS) assert.doesNotMatch(csv, proibida, `D10: ${proibida}`);
  for (const status of ["draft", "pending_approval"]) {
    const noEstado = radarPortableVideoExport({ articles: [artigo], today: EXPORTADO_EM, brandVoice: { ...voz, voice: { ...voz.voice, status } } as never }).csv;
    for (const proibida of PROIBIDAS) assert.doesNotMatch(noEstado, proibida, `D10 com a Skill em ${status}: ${proibida}`);
    assert.match(lerCsv(noEstado)[1].pode_gravar, /Skill "Marca" v1 \(versão corrente na Marca\)/);
  }
  const linhas = lerCsv(csv);
  /*
   * 2026-10-07 (revisão) · o caminho da ROTA: ela só chama o lote, com as
   * lentes congeladas e o resumo das lentes extras em cada artigo. Nenhum
   * teste conferia que os dois atravessam o lote — perder qualquer um deixava
   * a coluna dizendo "as lentes extras não foram lidas", em silêncio.
   */
  const doLote = linhas[2].concorrencia_curtos_e_carrossel;
  assert.match(doLote, /^Redes sociais no orgânico \(top 10; desktop · Windows, desktop · macOS, celular · Android, celular · iOS\): /m, "o resumo das lentes extras atravessa o lote");
  assert.match(doLote, /^Presença dos blocos por lente \(cópia das lentes congelada no pacote\): /m, "as lentes congeladas atravessam o lote");
  assert.deepEqual(Object.keys(linhas[0]), [...RADAR_VIDEO_EXPORT_COLUMNS]);
  assert.deepEqual(RADAR_VIDEO_EXPORT_COLUMNS.slice(-4), ["concorrencia_curtos_e_carrossel", "storyboard_visual", "cadeia_competitiva", "prompt"]);
  for (const linha of linhas.slice(0, 2)) {
    assert.ok(["Marca", "Voz da marca"].includes(linha.ordem), linha.ordem);
    for (const coluna of ["concorrencia_curtos_e_carrossel", "storyboard_visual", "cadeia_competitiva"]) assert.equal(linha[coluna], "", `${linha.ordem}: ${coluna}`);
  }
});

test("teto · no caso extremo a cadeia e o storyboard encolhem por igual (e dizem) — os seis capítulos continuam, nada é cortado no teto da célula", () => {
  const entrada = entradaNoturno();
  /* Seis resultados com endereço longo, citados por todas as seis seções, e seções com títulos e entregas compridos. */
  const longa = (indice: number) => `https://concorrente-${indice}.exemplo.com.br/blog/categoria/skin-care/noturno/${"guia-completo-da-rotina-".repeat(4)}${indice}`;
  const extras = Array.from({ length: 6 }, (_, indice) => ({ id: `S${90 + indice}`, kind: "resultado orgânico", text: `Guia ${indice} do skin care noturno com título comprido para encher · ${longa(indice)}` }));
  const comprido = (indice: number) => `${"Como montar o skin care noturno passo a passo quando a pele reage e a rotina tem ativos demais ".repeat(2)}(parte ${indice})`;
  const planta = plantaDe(entrada, Array.from({ length: 6 }, (_, indice) => ({
    h2: comprido(indice + 1),
    readerQuestion: `Qual a ordem do skin care noturno quando a pele reage aos ativos no passo ${indice + 1}?`,
    answerFirst: "Limpe, trate e hidrate, nessa ordem, com um ativo por noite e o hidratante no fim.",
    practical: `${"rotina com três ácidos misturados na mesma noite ".repeat(3)} → ${"um ativo por noite, com hidratante e protetor no dia seguinte ".repeat(2)} → ${"pele sem irritação e com a barreira preservada ".repeat(2)}`,
    evidence: ["S90", "S91", "S92", "S93", "S94", "S95"], from: ["M1", "M2"],
  })), extras);
  const titulosLongos = Array.from({ length: 10 }, (_, indice) => `Pele oleosa à noite, parte ${indice + 1}: o passo a passo comentado com erros comuns e o que muda na rotina`);
  const row = linhaDe(entrada, { blueprint: planta, youtube: youtubeLongos(titulosLongos, 0) });
  assert.match(row.cadeia_competitiva, /^\(Cadeia encolhida para caber na célula: até \d item\(ns\) por elo/m);
  assert.match(row.cadeia_competitiva, /^Capítulo 6 · /m, "o último capítulo continua");
  for (const coluna of ["concorrencia_curtos_e_carrossel", "storyboard_visual", "cadeia_competitiva"] as const) {
    assert.ok(row[coluna].length <= RADAR_VIDEO_EXPORT_CELL_CHARS, `${coluna}: ${row[coluna].length} caracteres`);
    assert.doesNotMatch(row[coluna], /cortado no limite da célula/, coluna);
  }
  assert.match(row.storyboard_visual, /^- Lâmina 7: /m, "o carrossel chega à última lâmina de capítulo");
});

/* ================================ a leitura nova, só no modo vídeo ================================ */

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

test("a única leitura nova: o resumo das lentes extras em modo digest, por lote, só com videoLensDigests — que só a rota no modo vídeo liga; o CSV para escrever e o MCP não a fazem", async () => {
  const nucleo = semComentarios(await readFile(new URL("../lib/server/radar-portable-export-core.ts", import.meta.url), "utf8"));
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8"));
  const leitor = semComentarios(await readFile(new URL("../lib/server/radar-video-lens-digest-read.ts", import.meta.url), "utf8"));
  /* O leitor: grátis (cache), modo digest, só a principal nas lentes extras, e a falha contida. */
  assert.match(leitor, /lookupSerpCache\(input\.context, pedidos, \{ mode: "digest", now: input\.now \}\)/);
  assert.match(leitor, /const pedidos = radarVideoLensDigestRequests\(input\.pedidos, input\.principais\)/);
  assert.match(leitor, /catch \(erro\)/);
  assert.doesNotMatch(leitor, /collectAndCacheSerp|executeDataForSeo|fetch\(/, "nenhuma coleta, nenhum provider");
  /* O núcleo: a leitura só dentro do bloco da flag, depois do laço por artigo, com os pedidos já montados. */
  assert.equal((nucleo.match(/readRadarVideoLensDigestsForExport\(/g) || []).length, 1);
  const bloco = nucleo.slice(nucleo.indexOf("if (input.videoLensDigests && montadas.length) {"), nucleo.indexOf("const plano ="));
  assert.match(bloco, /readRadarVideoLensDigestsForExport\(\{/, "a leitura fora do bloco da flag");
  assert.match(bloco, /pedidos: pedidosDasLentes,/);
  assert.match(bloco, /lensReadFailed: lentes\.readFailed,/);
  /* 2026-10-07 (revisão) · o que foi lido chega a cada artigo montado — sem isto, a leitura acontecia e o CSV não a via. */
  assert.match(bloco, /for \(const item of montadas\) item\.lensDigests = radarVideoLensOrganicOf\(resumos, principalDe\(item\)\);/);
  const laco = nucleo.slice(nucleo.indexOf("for (const articleId of"), nucleo.indexOf("const lentes ="));
  assert.doesNotMatch(laco, /readRadarVideoLensDigestsForExport|lookupSerpCache/, "leitura por artigo");
  assert.equal((nucleo.match(/readMineradorKeywordTargetCodes\(/g) || []).length, 1, "o resumo reusa os pedidos: nenhuma leitura de alvo a mais");
  /* A rota liga só no modo vídeo; o MCP (radarWritingExportForArticle) não passa a flag. */
  assert.match(rota, /videoLensDigests: input\.mode === "video",/);
  const doMcp = nucleo.slice(nucleo.indexOf("export async function radarWritingExportForArticle"));
  assert.match(doMcp, /assembleRadarPortableExport\(\{[^}]*\}\)/);
  assert.doesNotMatch(doMcp, /videoLensDigests/);
  assert.match(nucleo, /if \(input\.videoLensDigests && montadas\.length\) \{/);
});

/* ================================ revisão de 2026-10-07 ================================ */

/* Uma pesquisa do YouTube com longos e Shorts escolhidos: título, duração e se o YouTube marcou Short. */
function youtubeMisto(videos: ReadonlyArray<{ title: string; segundos: number; short?: boolean }>): RadarVideoExportYoutube {
  const results = videos.map((video, indice) => RadarYoutubeSearchResultSchema.parse({
    videoId: `mix${String(indice).padStart(8, "0")}`, url: `https://www.youtube.com/${video.short ? "shorts/" : "watch?v="}mix${String(indice).padStart(8, "0")}`,
    title: video.title, channelName: `Canal ${indice}`, rank: indice + 1, durationSeconds: video.segundos, views: 1_000, isShorts: Boolean(video.short),
    publishedAt: "2026-03-01T00:00:00.000Z", queryId: "ytq:1",
  }));
  return radarVideoExportYoutubeOf({ run: corrida(results, null, "run-misto"), frozen: null, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: EXPORTADO_EM })!;
}

test("revisão · a abertura dos cortes conta os Shorts do tema e aponta para a coluna de curtos — \"sem dado de concorrência\" só quando a coluna não tem o dado", () => {
  /*
   * 2026-10-07 (revisão) · cortes_para_redes lia os Shorts da fotografia (a
   * amostra inteira, com outro público na mediana) e, sem Shorts no YouTube,
   * dizia "sem dado de concorrência" ao lado de concorrencia_curtos_e_carrossel
   * com Reels, curtos do Google e duração-alvo.
   */
  const titulos = ["Skin care noturno: a ordem certa", "Rotina de skin care noturno simples", "Skin care noturno para pele oleosa", "Erros no skin care noturno"];
  const comCurtosNoGoogle = linhaDe(entradaNoturno(), { youtube: youtubeLongos(titulos, 0) }).cortes_para_redes;
  assert.match(comCurtosNoGoogle, /^Shorts: nenhum Short do tema nesta amostra; a concorrência do curto \(curtos que o Google mostra, Reels e Shorts no orgânico, duração-alvo dos cortes\) está em concorrencia_curtos_e_carrossel\.$/m);
  assert.doesNotMatch(comCurtosNoGoogle, /sem dado de concorrência/);
  /* Sem curto no Google nem peça curta no orgânico: aí sim, sem dado. */
  const semCurto = { ...SNAPSHOT_NOTURNO, serpFeatures: { ...SNAPSHOT_NOTURNO.serpFeatures!, videos: [] }, organicResults: SNAPSHOT_NOTURNO.organicResults.filter(item => !radarSocialPieceOf(item.url)) };
  const vazio = linhaDe(entradaNoturno({ serpObserved: { ...entradaGoogle().serpObserved!, snapshot: semCurto } }), { youtube: youtubeLongos(titulos, 0) }).cortes_para_redes;
  assert.match(vazio, /^Shorts: nenhum Short do tema nesta amostra; cortes podem testar o formato, sem dado de concorrência\.$/m);
  /* Shorts do público e de outro público: a contagem e a mediana são só dos pertinentes (15s, não os 58s de quem fala com advogados). */
  const misto = youtubeMisto([
    ...["Pele oleosa à noite: o passo a passo", "Pele oleosa à noite sem erro", "Pele oleosa à noite com ácido"].map(title => ({ title, segundos: 600 })),
    { title: "Pele oleosa em 15 segundos", segundos: 15, short: true }, { title: "Pele oleosa: a dica rápida", segundos: 15, short: true },
    ...[1, 2, 3].map(n => ({ title: `Skin care noturno para clientes de advocacia ${n}`, segundos: 58, short: true })),
  ]);
  const linha = linhaDe(entradaNoturno(), { youtube: misto });
  assert.match(linha.intencao_e_formato, /^Duração dos Shorts \(pertinentes\): mediana 15s$/m);
  assert.match(linha.cortes_para_redes, /^Shorts do tema nesta amostra \(pertinentes\): 2 de 5 · duração mediana 15s\. Existe espaço para cortes do tema; a concorrência do curto \([^)]+\) está em concorrencia_curtos_e_carrossel\.$/m);
  assert.doesNotMatch(linha.cortes_para_redes, /58s/, "outro público não entra na mediana dos cortes");
});

test("revisão · a cadeia diz a faixa do formato que a sequência segue: vídeo longo com a faixa dos longos pertinentes, e a liderança dos Shorts dita", () => {
  /*
   * 2026-10-07 (revisão) · 3 longos do público, 6 longos de outro público e 5
   * Shorts do público: a fotografia lidera por longos (9 > 5) e a sequência é
   * longa; os pertinentes lideram por Shorts (5 > 3). A cadeia juntava "vídeo
   * longo" com a faixa dos Shorts ("25s a 45s").
   */
  const misto = youtubeMisto([
    ...[540, 600, 660].map((segundos, n) => ({ title: `Pele oleosa à noite: parte ${n + 1}`, segundos })),
    ...[1, 2, 3, 4, 5, 6].map(n => ({ title: `Skin care noturno para clientes de advocacia, parte ${n}`, segundos: 900 })),
    ...[15, 25, 35, 45, 55].map((segundos, n) => ({ title: `Pele oleosa em segundos, dica ${n + 1}`, segundos, short: true })),
  ]);
  const linha = linhaDe(entradaNoturno(), { youtube: misto });
  assert.match(linha.intencao_e_formato, /^Divergência: [^\n]*os pertinentes, o formato curto \(Shorts\)\. A sequência do vídeo segue a leitura gravada da pesquisa/m, "a divergência continua dita na intenção");
  const cadeia = linha.cadeia_competitiva;
  assert.match(cadeia, /^- Formato: vídeo longo, faixa \d+min\S* a \d+min\S* \(longos pertinentes\), \d+ capítulo\(s\)$/m);
  assert.match(cadeia, /^- Observação: [^\n]*faixa \d+min\S* a \d+min\S* \(longos pertinentes\); os pertinentes lideram por Shorts \(divergência registrada em intencao_e_formato\)$/m);
  assert.doesNotMatch(cadeia, /vídeo longo, faixa \d+s a/, "vídeo longo nunca com a faixa dos Shorts");
});

test("revisão · as lentes extras dizem de quando são: resumo do cache, fora do pacote congelado, com a data e se é posterior ao congelamento", () => {
  /*
   * 2026-10-07 (revisão) · a lente da investigação vem do snapshot do pacote; as
   * três extras, do resumo do cache no momento da exportação. A contagem por
   * lente juntava as duas sem data — leituras de dias diferentes como a mesma SERP.
   */
  const principal = "como atrair clientes pelo instagram";
  const lookups = resumoDoCache("instagram não traz pacientes", principal)
    .map(item => ({ ...item, hit: { ...item.hit, meta: { collectedAt: item.request.query.lens.operatingSystem === "ios" ? "2026-09-10T08:00:00.000Z" : "2026-10-05T12:00:00.000Z" } } }));
  const resumos = radarVideoLensOrganicOf({ lookups, readFailed: false }, principal);
  assert.deepEqual(resumos.lenses.map(lente => lente.collectedAt), ["2026-10-05T12:00:00.000Z", "2026-10-05T12:00:00.000Z", "2026-09-10T08:00:00.000Z"]);
  const entrada = entradaNoturno({ article: { ...entradaGoogle().article, principalKeyword: principal, secondaryKeywords: [] } });
  const coluna = linhaDe(entrada, { lensDigests: resumos, lentesCongeladas: lentesCongeladas({ "desktop-windows": ["organic"], "desktop-macos": ["organic"], "mobile-android": ["organic"], "mobile-ios": ["organic"] }) }).concorrencia_curtos_e_carrossel;
  assert.match(coluna, /^Lentes extras no orgânico: resumo do cache da marca no momento desta exportação, observação fora do pacote congelado \(congelado em 20\/09\/2026\) — desktop · macOS, celular · Android: coleta de 05\/10\/2026, posterior ao congelamento · celular · iOS: coleta de 10\/09\/2026, anterior ao congelamento\.$/m);
  /* Sem a data no resumo, a linha diz que não a leu — nunca a data do pacote; sem as lentes congeladas, o congelamento vem da investigação. */
  const semData = linhaDe(entrada, { lensDigests: radarVideoLensOrganicOf({ lookups: resumoDoCache("instagram não traz pacientes", principal), readFailed: false }, principal) }).concorrencia_curtos_e_carrossel;
  assert.match(semData, /^Lentes extras no orgânico: resumo do cache da marca no momento desta exportação, observação fora do pacote congelado \(congelado em 20\/09\/2026\) — desktop · macOS, celular · Android, celular · iOS: data da coleta não lida\.$/m);
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});

/* ============================== utilidades ============================== */

function lerCsv(csv: string): Array<Record<string, string>> {
  const texto = csv.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = ""; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) { if (c === "\"" && texto[i + 1] === "\"") { campo += "\""; i += 1; } else if (c === "\"") aspas = false; else campo += c; }
    else if (c === "\"") aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; } else if (c === "\r") { /* CRLF */ } else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; } else campo += c;
  }
  const [cabecalho, ...dados] = linhas;
  return dados.map(valores => Object.fromEntries(cabecalho.map((coluna, indice) => [coluna, valores[indice] ?? ""])));
}
