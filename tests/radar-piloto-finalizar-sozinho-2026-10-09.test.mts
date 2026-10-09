import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  RadarYoutubeFrozenInvestigationSchema,
  freezeRadarYoutubeInvestigation,
  projectRadarYoutubeEvidence,
  radarFrozenRunCounts,
} from "../lib/radar/youtube-evidence.ts";
import {
  RadarAmazonFrozenInvestigationSchema,
  freezeRadarAmazonInvestigation,
  radarAmazonFrozenCounts,
} from "../lib/radar/amazon-evidence.ts";
import {
  RADAR_AMAZON_RESET_LABEL,
  RADAR_PROFILE_AREA_LABELS,
  RADAR_PROFILE_SUPPORT_MISSING_LIMITATION,
  radarAmazonReportEvidence,
  radarProfileAutoFinalizeDecision,
  radarProfileAutoFinalizePendingText,
  radarProfileRegisteredLimitations,
  radarResearchProfileStateOfAnalysis,
  radarYoutubeReportEvidence,
} from "../lib/radar/research-profile-state.ts";
import {
  RADAR_AUTO_FINALIZE_AI_COST,
  radarAutoFinalizeDoneNotice,
  radarAutoFinalizeStartNote,
  radarPhase1WithAutoFinalize,
  radarProfileFinalizeNote,
} from "../lib/radar/operational-actions.ts";
import { RADAR_AMAZON_SUPPORT_MISSING_LIMITATION } from "../lib/radar/amazon-editorial.ts";
import {
  radarAuxiliaryFailureLimitation,
  radarFailedQueriesLimitation,
  radarRunFailedQueriesLimitation,
} from "../lib/radar/investigation-finalization.ts";
import { buildRadarYoutubeUniverse } from "../lib/radar/youtube-search-model.ts";
import { buildRadarYoutubeRunFingerprint, buildRadarYoutubeSearchRun, RADAR_YOUTUBE_PROVIDER_ENDPOINT } from "../lib/radar/youtube-search-run.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint, radarAmazonQueryId } from "../lib/radar/amazon-search-run.ts";

/*
 * ====== 2026-10-09 · PILOTO · YOUTUBE E AMAZON FINALIZAM SOZINHOS COM A REGRA DO GOOGLE ======
 *
 * Regra do dono (2026-10-09): o processo antigo é SUBSTITUÍDO pelo do piloto,
 * nos artigos, no YouTube, na Amazon e nos reajustes. O Google já finaliza
 * sozinho registrando a limitação (2026-10-08); YouTube e Amazon ainda paravam
 * na D9 de 2026-10-02 por consulta que falhou e por apoio do Google que falhou.
 *
 * PRIMEIRO, O CONGELAMENTO É SAGRADO. A fixture
 * `radar-piloto-congelamentos-antigos-2026-10-09.json` foi tirada com o código
 * de ANTES desta rodada, com uma consulta falha e o apoio ausente — o caso que
 * a regra nova passa a registrar. Ela não muda de hash nem de leitura, e o
 * automático não tira fotografia nova sobre ela. A regra nova vale para
 * congelamento NOVO.
 *
 * Tudo aqui vale para qualquer página, marca e assunto. PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

const ler = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const hash = (valor: unknown) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");

const antigos = JSON.parse(await ler("./fixtures/radar-piloto-congelamentos-antigos-2026-10-09.json"));
const youtubeAntigo = antigos.youtubeFrozenInvestigation;
const amazonAntigo = antigos.amazonFrozenInvestigation;

/* Os hashes medidos no instante em que a fixture foi gerada, com o código de antes. */
const HASH_YOUTUBE_ANTIGO = "2dc25e3d05cd7c8cfc1e376d817e2406311f93cbd73a4cc4649c578117d2e418";
const HASH_AMAZON_ANTIGO = "875c15e0978f4aed5c6668b5908ff0216d25e2679f6ebbf2fd98fa40920c6f59";

/* ===================== as corridas que originaram as fotografias ===================== */

const corridaYoutubeAntiga = async () => {
  const bruto = JSON.parse(await ler("./fixtures/dataforseo-youtube-skin-care-noturno.json"));
  const normalizada = normalizeDataForSeoYoutubeResponse(bruto, "ytq:1");
  return buildRadarYoutubeSearchRun({
    runId: "run-yt-antiga", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ["ytq:1", "ytq:2"] }),
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
      queriesRequested: 2, queriesSucceeded: 1, queriesFailed: 1, failures: [{ queryId: "ytq:2", reason: "cota recusada" }],
      collectedAt: "2026-09-14T18:51:07.000Z",
    },
    queries: [
      { queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: normalizada.results.length },
      { queryId: "ytq:2", text: "rotina noturna pele", origin: "SECONDARY_KEYWORD", reason: "secundária", executed: false, failureReason: "cota recusada" },
    ],
    results: normalizada.results, universe: buildRadarYoutubeUniverse(normalizada.results),
  });
};

const corridaAmazonAntiga = async () => {
  const bruto = JSON.parse(await ler("./fixtures/dataforseo-amazon-discovery.json"));
  const normalizada = normalizeDataForSeoAmazonResponse(bruto, "amzq:1");
  return buildRadarAmazonSearchRun({
    runId: "run-amz-antiga", runVersion: 1, startedAt: "2026-09-15T12:00:00.000Z", startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["amzq:1", "amzq:2"] }),
    provenance: {
      provider: "dataforseo", endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z", languageCode: "pt_BR", depth: 20,
      queriesRequested: 2, queriesSucceeded: 1, queriesFailed: 1, failures: [{ queryId: "amzq:2", reason: "cota recusada" }],
    },
    queries: [
      { queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true },
      { queryId: "amzq:2", text: "protetor solar facial fps 50", origin: "PRIMARY_KEYWORD", reason: "segunda", executed: false, failureReason: "cota recusada" },
    ],
    results: normalizada.results, universe: buildRadarAmazonUniverse(normalizada.results), relatedSearches: normalizada.relatedSearches,
  });
};

/* A mesma montagem, sobre o blueprint QUE FOI congelado — sem depender do gerador de hoje. */
const refazerYoutube = async (extra: Record<string, unknown> = {}) => freezeRadarYoutubeInvestigation({
  run: await corridaYoutubeAntiga(),
  blueprint: youtubeAntigo.blueprint,
  finalizedBy: youtubeAntigo.finalizedBy,
  finalizedAt: youtubeAntigo.finalizedAt,
  multimodal: { blueprint: youtubeAntigo.multimodal.blueprint, researchSources: youtubeAntigo.multimodal.researchSources },
  ...extra,
});
const refazerAmazon = async (extra: Record<string, unknown> = {}) => freezeRadarAmazonInvestigation({
  run: await corridaAmazonAntiga(),
  blueprint: { ...amazonAntigo.competitiveBlueprint, provenance: { ...amazonAntigo.competitiveBlueprint.provenance, frozenAt: null } },
  finalizedBy: amazonAntigo.finalizedBy,
  finalizedAt: amazonAntigo.finalizedAt,
  setup: {
    intent: { type: "TOP_BEST", desiredCount: 5, useCase: null, rankingCriteria: null },
    target: { type: "CATEGORY_DISCOVERY", products: [], categoryQuery: "protetor solar facial", productClass: "protetor solar", brandFilter: null, brand: null, line: null },
  },
  ...extra,
});

/* ======================= O CONGELAMENTO É SAGRADO ======================= */

test("SAGRADO · as fotografias antigas leem igual: mesmo hash, mesmo conteúdo, pelo schema de hoje", () => {
  assert.equal(hash(youtubeAntigo), HASH_YOUTUBE_ANTIGO, "a fixture do YouTube não foi editada");
  assert.equal(hash(amazonAntigo), HASH_AMAZON_ANTIGO, "a fixture da Amazon não foi editada");

  const youtubeLido = RadarYoutubeFrozenInvestigationSchema.parse(youtubeAntigo);
  assert.deepEqual(youtubeLido, youtubeAntigo);
  assert.equal(hash(youtubeLido), HASH_YOUTUBE_ANTIGO, "ler pelo schema não muda o hash");
  const amazonLido = RadarAmazonFrozenInvestigationSchema.parse(amazonAntigo);
  assert.deepEqual(amazonLido, amazonAntigo);
  assert.equal(hash(amazonLido), HASH_AMAZON_ANTIGO, "ler pelo schema não muda o hash");

  /* A leitura para quem consome não ganha limitação nenhuma depois do fato. */
  assert.deepEqual(projectRadarYoutubeEvidence(youtubeLido).limitations, youtubeAntigo.limitations);
  assert.deepEqual(radarFrozenRunCounts(youtubeLido), { queriesExecuted: 1, universeSize: youtubeAntigo.runRef.universeSize, selectedVideoIds: [], collectedAt: "2026-09-14T18:51:07.000Z" });
  assert.deepEqual(radarAmazonFrozenCounts(amazonLido), { queriesExecuted: 1, universeSize: amazonAntigo.runRef.universeSize, collectedAt: "2026-09-15T12:00:05.000Z" });
});

test("SAGRADO · a projeção e o automático leem a fotografia antiga como finalizada — e não tiram outra", async () => {
  const casos = [
    { profile: "YOUTUBE" as const, payload: { youtubeSearch: await corridaYoutubeAntiga(), youtubeFrozenInvestigation: youtubeAntigo, supportResearch: { collectedAt: null, failureReason: "cota recusada" } } },
    { profile: "AMAZON" as const, payload: { amazonSearch: await corridaAmazonAntiga(), amazonFrozenInvestigation: amazonAntigo, researchPackage: { status: "PARTIAL_SUPPORT_FAILED", primaryResearch: { status: "COLLECTED", queryCount: 1, uniqueProductCount: 51 }, supportResearch: { status: "FAILED" } } } },
  ];
  for (const { profile, payload } of casos) {
    const projecao = radarResearchProfileStateOfAnalysis({ payload, profile });
    assert.equal(projecao.state, "FINALIZED", profile);
    assert.equal(projecao.frozen, true, profile);
    assert.equal(projecao.canStart, false, profile);
    assert.equal(projecao.counts.queries, 1, `${profile}: os números vêm da fotografia`);

    const automatico = radarProfileAutoFinalizeDecision({ payload, profile });
    assert.equal(automatico.next, null, `${profile}: fotografia assinada não é refeita`);
    assert.equal(automatico.pending, false, `${profile}: já finalizada não é pendência`);
  }
  assert.equal(radarYoutubeReportEvidence(radarResearchProfileStateOfAnalysis({ payload: casos[0].payload, profile: "YOUTUBE" }))?.finalized, true);
  assert.equal(radarAmazonReportEvidence({ projecao: radarResearchProfileStateOfAnalysis({ payload: casos[1].payload, profile: "AMAZON" }), payload: casos[1].payload })?.blueprintFrozen, true);
});

test("SAGRADO · congelar de novo preserva, byte a byte, o que o código de antes gravava — a regra nova só ACRESCENTA no fim", async () => {
  /*
   * A regra nova vale para congelamento NOVO (inclusive o reparo, que é uma
   * fotografia nova pedida por alguém, com prévia). Sobre a mesma corrida e o
   * mesmo blueprint, tudo o que o código de antes escrevia continua igual; a
   * única diferença é a consulta que falhou, acrescentada ao FIM das
   * limitações. Sem falha e sem extra, não há o que acrescentar — e a
   * fotografia é a de antes.
   */
  const youtube = await refazerYoutube();
  const antesYt = youtubeAntigo.limitations.length;
  assert.equal(hash({ ...youtube, limitations: youtube.limitations.slice(0, antesYt) }), HASH_YOUTUBE_ANTIGO, "o prefixo é a fotografia de antes");
  assert.deepEqual(youtube.limitations.slice(antesYt), ['1 consulta(s) do YouTube falharam na coleta ("rotina noturna pele"); o universo competitivo foi montado sem elas.']);
  assert.deepEqual(await refazerYoutube({ extraLimitations: [] }), youtube, "extra vazio é o mesmo que ausente");

  const amazon = await refazerAmazon();
  const antesAmz = amazonAntigo.limitations.length;
  assert.equal(hash({ ...amazon, limitations: amazon.limitations.slice(0, antesAmz) }), HASH_AMAZON_ANTIGO, "o prefixo é a fotografia de antes");
  assert.deepEqual(amazon.limitations.slice(antesAmz), ['1 consulta(s) da Amazon falharam na coleta ("protetor solar facial fps 50"); o universo competitivo foi montado sem elas.']);
  assert.deepEqual(await refazerAmazon({ extraLimitations: [] }), amazon, "extra vazio é o mesmo que ausente");

  /* Corrida sem falha não deriva nada: a lista fica exatamente a de antes. */
  assert.deepEqual(radarRunFailedQueriesLimitation({ queries: [{ text: "a", executed: true, failureReason: null }], provenance: { queriesFailed: 0 } }, "consulta(s) do YouTube"), []);
  assert.deepEqual(radarRunFailedQueriesLimitation(null, "consulta(s) da Amazon"), []);
});

/* ======================= A REGRA DO GOOGLE, NOS TRÊS PERFIS ======================= */

/* Teste estrutural: os comentários saem antes de procurar (eles citam os nomes que o código usa). */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const readFileSyncTexto = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const fatia = (fonte: string, de: string, ate: string) => {
  const inicio = fonte.indexOf(de);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.ok(inicio >= 0, `âncora "${de}"`);
  assert.ok(fim > inicio, `âncora "${ate}"`);
  return fonte.slice(inicio, fim);
};

const pacoteAmazon = (status: string, apoio: string) => ({
  status,
  primaryResearch: { status: "COLLECTED", queryCount: 1, uniqueProductCount: 51 },
  supportResearch: { status: apoio },
});

test("UMA REGRA SÓ · a frase da consulta que falhou e o veredito são os mesmos do Google", () => {
  /* O Google continua dizendo exatamente o que dizia. */
  assert.deepEqual(
    radarAuxiliaryFailureLimitation([{ keyword: "marketing odontológico" }, { keyword: null }]),
    ['2 consulta(s) auxiliar(es) do plano falharam na coleta ("marketing odontológico"); o universo competitivo foi montado sem elas.'],
  );
  assert.deepEqual(radarFailedQueriesLimitation(2), radarAuxiliaryFailureLimitation(2));
  /* O perfil troca só o que se conta. */
  assert.deepEqual(radarFailedQueriesLimitation(1, "consulta(s) do YouTube"), ["1 consulta(s) do YouTube falharam na coleta; o universo competitivo foi montado sem elas."]);
  /* Total gravado maior que as consultas com motivo: diz o total, sem inventar nome. */
  assert.deepEqual(
    radarRunFailedQueriesLimitation({ queries: [{ text: "a", executed: false, failureReason: "x" }], provenance: { queriesFailed: 2 } }, "consulta(s) da Amazon"),
    ["2 consulta(s) da Amazon falharam na coleta; o universo competitivo foi montado sem elas."],
  );
  /* Consulta EXECUTADA não é falha, mesmo com um motivo antigo gravado ao lado. */
  assert.deepEqual(
    radarRunFailedQueriesLimitation({ queries: [{ text: "a", executed: false, failureReason: "x" }, { text: "b", executed: true, failureReason: "resposta parcial" }], provenance: { queriesFailed: 1 } }, "consulta(s) do YouTube"),
    ['1 consulta(s) do YouTube falharam na coleta ("a"); o universo competitivo foi montado sem elas.'],
  );

  /* O veredito vem das mesmas duas funções nos três perfis — conferido no código, sem comentários. */
  const perfil = semComentarios(readFileSyncTexto("../lib/radar/research-profile-state.ts"));
  const decisao = fatia(perfil, "export function radarProfileAutoFinalizeDecision(", "export function radarProfileAutoFinalizePendingText(");
  assert.ok(decisao.includes("radarAutoFinalizeStops(reason)"));
  assert.ok(decisao.includes("radarAutoFinalizeWithLimitations(prontidao, radarProfileRegisteredLimitations(input))"));
  const google = fatia(semComentarios(readFileSyncTexto("../lib/radar/investigation-finalization.ts")), "export function radarGoogleAutoFinalizeDecision(", "const FrozenQuerySchema");
  assert.ok(google.includes("const parar = radarAutoFinalizeStops;"));
  assert.ok(google.includes("return radarAutoFinalizeWithLimitations(input.finalization.reason, limitations);"));
});

test("YOUTUBE · o que o automático diz ao finalizar é o que a fotografia grava — no clique, no automático e no reparo", async () => {
  const run = await corridaYoutubeAntiga();
  const payload = { youtubeSearch: run, supportResearch: { collectedAt: null, failureReason: "a cota do provider foi recusada" } };
  const decisao = radarProfileAutoFinalizeDecision({ payload, profile: "YOUTUBE" });
  assert.deepEqual({ next: decisao.next, pending: decisao.pending }, { next: "FINALIZE", pending: false });
  assert.deepEqual(decisao.limitations, [
    '1 consulta(s) do YouTube falharam na coleta ("rotina noturna pele"); o universo competitivo foi montado sem elas.',
    RADAR_PROFILE_SUPPORT_MISSING_LIMITATION,
  ]);
  assert.match(radarAutoFinalizeDoneNotice(decisao.limitations), /^Finalizada sozinha com limitação registrada: 1 consulta\(s\) do YouTube falharam/);

  /* A autoridade do botão manual continua com a última palavra: o que ela recusa, o automático não congela. */
  const pacoteEmCurso = radarProfileAutoFinalizeDecision({
    payload: { youtubeSearch: run, researchPackage: { status: "COLLECTING", primaryResearch: { status: "COLLECTED", queryCount: 1, uniqueProductCount: 30 }, supportResearch: { status: "COLLECTED" } } },
    profile: "YOUTUBE",
  });
  assert.equal(pacoteEmCurso.next, null, "o pacote ainda diz coletando: o manual recusa, e o automático também");
  assert.equal(pacoteEmCurso.pending, true);

  /* A montagem da tela: a corrida congelada e a mesma lista como extra (`fotografiaDoYoutube`). */
  const fotografia = await refazerYoutube({ extraLimitations: radarProfileRegisteredLimitations({ payload, profile: "YOUTUBE" }) });
  for (const limitacao of decisao.limitations) {
    assert.equal(fotografia.limitations.filter(item => item === limitacao).length, 1, `gravada uma vez: ${limitacao}`);
  }
  assert.deepEqual(projectRadarYoutubeEvidence(fotografia).limitations, fotografia.limitations, "quem consome lê o mesmo");
});

test("AMAZON · o servidor grava a limitação sem mudar uma linha: a consulta pela corrida, o apoio pelo blueprint", async () => {
  const run = await corridaAmazonAntiga();
  const blueprint = { ...amazonAntigo.competitiveBlueprint, provenance: { ...amazonAntigo.competitiveBlueprint.provenance, frozenAt: null } };
  const payload = { amazonSearch: run, researchPackage: pacoteAmazon("PARTIAL_SUPPORT_FAILED", "FAILED"), amazonBlueprint: blueprint };
  const decisao = radarProfileAutoFinalizeDecision({ payload, profile: "AMAZON" });
  assert.deepEqual({ next: decisao.next, pending: decisao.pending }, { next: "FINALIZE", pending: false });
  assert.deepEqual(decisao.limitations, [
    '1 consulta(s) da Amazon falharam na coleta ("protetor solar facial fps 50"); o universo competitivo foi montado sem elas.',
    RADAR_AMAZON_SUPPORT_MISSING_LIMITATION,
  ]);
  /* Como `fotografiaAmazon` chama hoje: sem extra nenhum. */
  const fotografia = freezeRadarAmazonInvestigation({ run, blueprint, finalizedBy: "u", finalizedAt: "2026-10-09T12:00:00.000Z" });
  for (const limitacao of decisao.limitations) {
    assert.equal(fotografia.limitations.filter(item => item === limitacao).length, 1, `gravada uma vez: ${limitacao}`);
  }
  /* O extra é aditivo e não duplica o que o blueprint já declarou. */
  const comExtra = freezeRadarAmazonInvestigation({ run, blueprint, finalizedBy: "u", finalizedAt: "2026-10-09T12:00:00.000Z", extraLimitations: decisao.limitations });
  assert.deepEqual(comExtra, fotografia);
  /* E o que é novo entra uma vez, no fim, depois da consulta derivada. */
  const comNovo = freezeRadarAmazonInvestigation({ run, blueprint, finalizedBy: "u", finalizedAt: "2026-10-09T12:00:00.000Z", extraLimitations: [" Uma limitação a mais. ", "Uma limitação a mais."] });
  assert.deepEqual(comNovo.limitations, [...fotografia.limitations, "Uma limitação a mais."]);

  /* Antes da análise: o apoio que falhou não para — a análise roda e declara SUPPORT_MISSING. */
  const antes = radarProfileAutoFinalizeDecision({ payload: { amazonSearch: run, researchPackage: pacoteAmazon("PARTIAL_SUPPORT_FAILED", "FAILED") }, profile: "AMAZON" });
  assert.equal(antes.next, "ANALYZE");
  assert.deepEqual(antes.limitations, decisao.limitations);
  assert.match(antes.reason, /^Com limitação registrada: 1 consulta\(s\) · 51 produto\(s\) na amostra; a análise roda sozinha, sem chamada paga/);
});

/* ======================= as duas paradas da Amazon ======================= */

const corridaAmazonDoAlvo = async (startedAt = "2026-09-15T12:00:00.000Z") => {
  const bruto = JSON.parse(await ler("./fixtures/dataforseo-amazon-discovery.json"));
  const normalizada = normalizeDataForSeoAmazonResponse(bruto, radarAmazonQueryId("protetor solar facial"));
  return buildRadarAmazonSearchRun({
    runId: "run-amz-alvo", runVersion: 1, startedAt, startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: [radarAmazonQueryId("protetor solar facial")] }),
    provenance: {
      provider: "dataforseo", endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z", languageCode: "pt_BR", depth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    },
    queries: [{ queryId: radarAmazonQueryId("protetor solar facial"), text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "categoria", executed: true }],
    results: normalizada.results, universe: buildRadarAmazonUniverse(normalizada.results), relatedSearches: normalizada.relatedSearches,
  });
};
const alvo = (extra: { type?: string; productClass?: string | null; brandFilter?: string | null; categoryQuery?: string; products?: unknown[]; declaredAt?: string } = {}) => ({
  intent: { type: extra.type || "TOP_BEST", desiredCount: extra.type && !extra.type.startsWith("TOP") ? null : 5, useCase: null, rankingCriteria: null },
  target: {
    type: extra.type === "PRODUCT_REVIEW" ? "SPECIFIC_PRODUCT" : "CATEGORY_DISCOVERY",
    products: extra.products || [],
    categoryQuery: extra.categoryQuery ?? "protetor solar facial",
    productClass: extra.productClass === undefined ? "protetor solar" : extra.productClass,
    brandFilter: extra.brandFilter ?? null, brand: null, line: null,
  },
  declaredAt: extra.declaredAt || "2026-09-15T12:00:00.000Z",
  declaredBy: "user-1",
});
const decidirAmazon = async (setup: unknown) => radarProfileAutoFinalizeDecision({
  payload: { amazonSearch: await corridaAmazonDoAlvo(), researchPackage: pacoteAmazon("READY", "COLLECTED"), amazonEditorialSetup: setup },
  profile: "AMAZON",
});

test("AMAZON · shortlist elegível vazia para — com o motivo, a área e o botão de zerar, e o custo da coleta nova", async () => {
  /* O alvo que a prateleira sustenta segue: a análise roda sozinha. */
  assert.equal((await decidirAmazon(alvo())).next, "ANALYZE");

  const semCandidato = await decidirAmazon(alvo({ productClass: "geladeira frost free" }));
  assert.equal(semCandidato.next, null);
  assert.equal(semCandidato.pending, true);
  assert.match(semCandidato.reason, /^Nenhum dos 51 produto\(s\) observado\(s\) é compatível com o alvo declarado \("geladeira frost free"\): a shortlist elegível está vazia e não há ranking a construir\. .*a coleta nova é paga\.$/);
  assert.equal(semCandidato.manualLabel, RADAR_AMAZON_RESET_LABEL);
  assert.deepEqual(semCandidato.limitations, [], "quem para não registra nada");
  assert.equal(
    radarProfileAutoFinalizePendingText(semCandidato, "AMAZON"),
    `Não finalizou sozinha: ${semCandidato.reason.charAt(0).toLowerCase()}${semCandidato.reason.slice(1)} Para continuar, na área + Amazon (review), botão "Zerar pesquisa Amazon".`,
  );

  /* Review: o produto escolhido que a prateleira não devolveu deixa a shortlist vazia. */
  const review = await decidirAmazon(alvo({ type: "PRODUCT_REVIEW", productClass: null, categoryQuery: "protetor solar facial", products: [{ input: "B000000000", inputType: "ASIN", resolvedAsin: "B000000000", resolvedTitle: "protetor solar facial" }] }));
  assert.equal(review.next, null);
  assert.match(review.reason, /^Nenhum dos produtos escolhidos para o artigo apareceu nesta coleta da prateleira: a shortlist elegível está vazia/);
  assert.equal(review.manualLabel, RADAR_AMAZON_RESET_LABEL);

  /* O guia de compra não promete lista: passa. */
  assert.equal((await decidirAmazon(alvo({ type: "BUYING_GUIDE", productClass: "geladeira frost free" }))).next, "ANALYZE");
  /* Sem configuração gravada (artigo anterior ao alvo editorial), nada a conferir. */
  assert.equal((await decidirAmazon(undefined)).next, "ANALYZE");
});

test("AMAZON · configuração do alvo que não corresponde à coleta para — e a do mesmo START ou das mesmas consultas segue", async () => {
  /* Outro START, outras consultas: a fotografia amarraria um alvo que não foi pesquisado. */
  const diverge = await decidirAmazon(alvo({ categoryQuery: "geladeira", productClass: "protetor solar", declaredAt: "2026-09-20T10:00:00.000Z" }));
  assert.equal(diverge.next, null);
  assert.equal(diverge.pending, true);
  assert.match(diverge.reason, /^A configuração do alvo gravada não é a que originou esta coleta/);
  assert.match(diverge.reason, /a coleta nova é paga\.$/);
  assert.equal(diverge.manualLabel, RADAR_AMAZON_RESET_LABEL);

  /* Mesmo START (o servidor grava `declaredAt` = `startedAt`): corresponde, mesmo com consultas de outra versão. */
  assert.equal((await decidirAmazon(alvo({ categoryQuery: "geladeira", declaredAt: "2026-09-15T12:00:00.000Z" }))).next, "ANALYZE");
  /* Outro instante, mas as mesmas consultas: corresponde. */
  assert.equal((await decidirAmazon(alvo({ declaredAt: "2026-09-20T10:00:00.000Z" }))).next, "ANALYZE");

  /* A parada vale também depois da análise: nada congela sobre um alvo que não foi pesquisado. */
  const analisada = radarProfileAutoFinalizeDecision({
    payload: {
      amazonSearch: await corridaAmazonDoAlvo(), researchPackage: pacoteAmazon("READY", "COLLECTED"),
      amazonBlueprint: amazonAntigo.competitiveBlueprint,
      amazonEditorialSetup: alvo({ categoryQuery: "geladeira", declaredAt: "2026-09-20T10:00:00.000Z" }),
    },
    profile: "AMAZON",
  });
  assert.equal(analisada.next, null);
  assert.equal(analisada.manualLabel, RADAR_AMAZON_RESET_LABEL);
});

test("AMAZON · o apoio sem gravação confirmada para e aponta o retry do card", async () => {
  const pendente = radarProfileAutoFinalizeDecision({
    payload: { amazonSearch: await corridaAmazonDoAlvo(), researchPackage: { status: "COLLECTING", primaryResearch: { status: "COLLECTED", queryCount: 1, uniqueProductCount: 51 }, supportResearch: { status: "PENDING" } } },
    profile: "AMAZON",
  });
  assert.equal(pendente.next, null);
  assert.match(pendente.reason, /apoio do Google ainda não está gravado/);
  assert.equal(pendente.manualLabel, "Tentar novamente apoio Google");
});

test("a frase da parada: nula quando segue ou já finalizou; com a área do perfil quando para", () => {
  assert.equal(radarProfileAutoFinalizePendingText({ pending: false, reason: "x", manualLabel: null }, "YOUTUBE"), null);
  assert.equal(
    radarProfileAutoFinalizePendingText({ pending: true, reason: "O apoio do Google ainda não está gravado; congelar agora deixaria a investigação sem ele.", manualLabel: "Repetir apoio" }, "YOUTUBE"),
    'Não finalizou sozinha: o apoio do Google ainda não está gravado; congelar agora deixaria a investigação sem ele. Para continuar, na área + YouTube (vídeo), botão "Repetir apoio".',
  );
  assert.equal(
    radarProfileAutoFinalizePendingText({ pending: true, reason: "A coleta ainda está em andamento.", manualLabel: null }, "AMAZON"),
    "Não finalizou sozinha: a coleta ainda está em andamento.",
  );
});

test("D10 · as limitações novas que vão ao congelamento (e dele aos entregáveis) não carregam palavra proibida", async () => {
  const PROIBIDAS = /pend[êe]ncia|aguardando aprova[çc][ãa]o|rascunho|fonte a obter|preencher|pe[çc]a ao Arquiteto|confira se a coleta traz/i;
  const frases = [
    ...radarProfileRegisteredLimitations({ payload: { youtubeSearch: await corridaYoutubeAntiga(), supportResearch: { collectedAt: null, failureReason: "x" } }, profile: "YOUTUBE" }),
    ...radarProfileRegisteredLimitations({ payload: { amazonSearch: await corridaAmazonAntiga(), researchPackage: pacoteAmazon("PARTIAL_SUPPORT_FAILED", "FAILED") }, profile: "AMAZON" }),
  ];
  assert.equal(frases.length, 4);
  for (const frase of frases) assert.equal(PROIBIDAS.test(frase), false, frase);
});

/* ======================= a tela: o que vai acontecer, antes do clique ======================= */

test("TELA · as notas e o ⓘ da Fase 1 do YouTube e da Amazon dizem a regra nova, com o custo", () => {
  for (const perfil of ["YOUTUBE", "AMAZON"] as const) {
    const nota = radarAutoFinalizeStartNote("coleta", perfil);
    assert.ok(nota.includes(RADAR_AUTO_FINALIZE_AI_COST), perfil);
    assert.match(nota, /que falhou e apoio do Google que falhou viram limitação registrada/);
    const fase1 = radarPhase1WithAutoFinalize({ id: "ANALYZE_COMPETITION", label: "Analisar concorrência", info: null }, perfil);
    assert.ok((fase1.info || "").includes(radarAutoFinalizeStartNote("análise", perfil)), `${perfil}: o ⓘ é a nota do perfil`);
    assert.equal(/D9|Ao terminar sem pendência/.test(fase1.info || ""), false);
  }
});

test("TELA · os painéis mostram a frase pronta e dizem o perfil em cada nota antes do clique", () => {
  for (const [arquivo, perfil, testid] of [
    ["../modules/radar/radar-youtube-search-panel.tsx", "YOUTUBE", "radar-youtube-auto-finalize-pending"],
    ["../modules/radar/radar-amazon-search-panel.tsx", "AMAZON", "radar-amazon-auto-finalize-pending"],
  ] as const) {
    const painel = semComentarios(readFileSyncTexto(arquivo));
    const pendencia = fatia(painel, `data-testid="${testid}"`, "</p>}");
    assert.ok(pendencia.includes("{autoFinalizePending}"), `${perfil}: a frase chega pronta da autoridade`);
    assert.equal(/radarProfileManualStepLabel|radarAutoFinalizePendingNotice/.test(painel), false, `${perfil}: o painel não remonta a frase`);
    const notas = painel.match(/radarAutoFinalizeStartNote\([^)]*\)/g) || [];
    assert.ok(notas.length >= 2, perfil);
    for (const nota of notas) assert.ok(nota.endsWith(`, "${perfil}")`), `${perfil}: ${nota}`);
    /* O finalizar manual diz, antes do clique, que a falha fica registrada — e o custo da IA. */
    const finalizar = fatia(painel, "onClick={() => onFinalize?.()}", "</button>");
    assert.ok(finalizar.includes(`title={radarProfileFinalizeNote("${perfil}")}`), `${perfil}: o ⓘ do finalizar manual`);
    assert.ok(finalizar.includes('radarFinalizeWithAiLabel("Finalizar investigação")'));
    const ditoAntes = radarProfileFinalizeNote(perfil);
    assert.match(ditoAntes, /que falhou e apoio do Google que falhou ficam registrados como limitação na fotografia/);
    assert.ok(ditoAntes.includes(RADAR_AUTO_FINALIZE_AI_COST));
  }
});

test("TELA · a página encadeia pela regra nova: frase da autoridade, limitação no aviso e na fotografia", () => {
  const pagina = semComentarios(readFileSyncTexto("../modules/radar/radar-page.tsx"));

  const pendencia = fatia(pagina, "const pendenciaDoAutomatico = ", "const setupDoArtigo");
  assert.ok(pendencia.includes("return radarProfileAutoFinalizePendingText(radarProfileAutoFinalizeDecision(leitura), perfil);"));

  const amazon = fatia(pagina, "const finalizarAmazonSemPendencia = async", "const acaoAmazonSemProvider = async");
  assert.ok(amazon.includes('radarProfileAutoFinalizePendingText(decisaoAutomatica, "AMAZON")'));
  assert.ok(amazon.includes("radarAutoFinalizeDoneNotice(decisaoAutomatica.limitations)"));

  const youtube = fatia(pagina, "const finalizarYoutubeSemPendencia = async", "const resetYoutubeSearch");
  assert.ok(youtube.includes('radarProfileAutoFinalizePendingText(decisaoAutomatica, "YOUTUBE")'));
  assert.ok(youtube.includes("radarAutoFinalizeDoneNotice(decisaoAutomatica.limitations)"));
  assert.equal(/RADAR_AUTO_FINALIZE_DONE_NOTICE/.test(amazon + youtube), false, "o aviso diz a limitação, não \"sem pendência\" fixo");

  const fotografia = fatia(pagina, "const fotografiaDoYoutube = ", "const finalizarYoutubeSemPendencia = async");
  assert.ok(fotografia.includes('extraLimitations: radarProfileRegisteredLimitations({ payload: { ...(entrada.base?.payload || {}), youtubeSearch: entrada.run }, profile: "YOUTUBE" })'));

  /* O apoio que falhou de novo também leva ao automático; só a gravação não confirmada fica de fora. */
  const repetir = fatia(pagina, "const repetirApoioDoGoogle = async", "const calcularProjecaoDePesquisa");
  assert.ok(repetir.includes("const automatico = apoio && !naoGravado ? await finalizarYoutubeSemPendencia(target) : null;"));
});

test("TELA · a área dita na frase é a mesma que a bancada mostra", () => {
  const bancada = readFileSyncTexto("../modules/radar/radar-r3-workbench.tsx");
  for (const area of Object.values(RADAR_PROFILE_AREA_LABELS)) assert.ok(bancada.includes(`"${area}"`), area);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
