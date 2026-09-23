import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARCHITECT_CANONICAL_SERP_COLLECTION_DEPTH,
  FORMATION_SERP_ENDPOINT,
  FORMATION_SERP_MOBILE_LENS,
  architectSerpCollectionRequest,
  architectSerpStoresBody,
  createFormationSerpQuotaLedger,
  formationSerpCacheRequest,
  formationSerpCodesMatch,
  formationSerpLens,
  normalizeCachedFormationSerp,
  providerDiagnosticAtRequestedDepth,
  serpBodyAtRequestedDepth,
} from "../lib/arquiteto/dataforseo-serp-compatibility.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  pruneSerpBody,
  serpCacheEntryServes,
  serpCacheSubjectId,
  trimSerpBodyToDepth,
  type SerpCacheMeta,
} from "../lib/editorial/serp-cache.ts";
import { DataForSeoSerpError, type DataForSeoSerpConfig } from "../lib/minerador/dataforseo-serp-core.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import { executeDataForSeoSerpOperation, inspectDataForSeoSerpResponse, type DataForSeoSerpProviderDiagnostic } from "../lib/server/dataforseo-serp-operation.ts";
import { serpCacheObservationFromBody } from "../lib/server/serp-cache-observation.ts";
import { normalizeOrganicDigestSerp, serpBodyFromOrganicDigest } from "../lib/arquiteto/dataforseo-serp-compatibility.ts";
import { buildSerpOrganicDigest, serpCacheLensLabel } from "../lib/editorial/serp-cache.ts";
import {
  SERP_LENS_DATES_DIVERGE_DAYS,
  SERP_LENS_LABELS,
  SERP_PAID_QUERY_COST_USD,
  SerpLensesMarkerSchema,
  authorizeSerpPaidPlan,
  buildSerpPaidPlan,
  collectedAtSpreadDays,
  createPaidQueryBudget,
  describeSerpLensesMarker,
  describeSerpPaidPlan,
  mergeSerpPaidPlans,
  resolveRequestedSerpLenses,
  serpLensFromLabel,
  serpPaidPlanKeys,
  serpPaidPlanOptions,
  staleByDateIndexes,
  staleSlotKeys,
  type SerpPlanSlot,
} from "../lib/arquiteto/serp-lens-plan.ts";
import {
  MINERADOR_TARGETING_COLUMNS,
  isAcervoKeywordId,
  mineradorSerpTargetCodes,
  readMineradorKeywordTargetCodes,
  serpTargetCodesFor,
} from "../lib/arquiteto/serp-lens-targeting.ts";

/**
 * A SERP DA FORMAÇÃO DE ARTIGOS PASSA PELO CACHE.
 *
 * `/api/arquiteto/serp` pagava de novo cada keyword de cada grupo — desktop
 * sem `os`, endpoint `regular`, 10 resultados —, embora o Minerador já tivesse
 * pago a mesma SERP desktop-windows `advanced` com 20. Agora a rota pergunta
 * ao cache antes da quota, paga só o que falta e normaliza o acerto com a
 * proveniência da coleta original.
 *
 * MUDANÇA DE COMPORTAMENTO, dita: `regular` → `advanced` (perguntas do People
 * Also Ask, citações do AI Overview e blocos que o `regular` anunciava e não
 * entregava) e o sistema operacional passa a ir explícito ao provider.
 *
 * Nenhum teste aqui chama o provider: o corpo é o fixture REAL já usado por
 * tests/serp-cache.test.mts.
 */

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const NOW = new Date("2026-09-23T12:00:00.000Z");
const CODES = { locationCode: 2076, languageCode: "pt" };

// Comentário não é comportamento: casar com a própria explicação dá falso positivo.
const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter(linha => {
    const limpa = linha.trim();
    return !limpa.startsWith("//") && !limpa.startsWith("*") && !limpa.startsWith("/*");
  })
  .join("\n");

const rota = semComentarios("../app/api/arquiteto/serp/route.ts");
const fronteira = semComentarios("../lib/arquiteto/dataforseo-serp-compatibility.ts");

/** O trecho de código entre duas âncoras únicas. */
const trecho = (codigo: string, inicio: string, fim: string) => {
  const a = codigo.indexOf(inicio);
  const b = codigo.indexOf(fim, a + inicio.length);
  assert.ok(a > -1 && b > a, `âncoras ausentes: ${inicio} → ${fim}`);
  return codigo.slice(a, b);
};

const entrada = (overrides: Partial<SerpSearchInput> = {}): SerpSearchInput => ({
  brandId: "b", articleId: "a", articleDnaVersionId: "v", keywordId: "kw-1", keywordDnaVersionId: "kv",
  keyword: "skincare facial", location: "Brasil", language: "pt-br", device: "desktop", operatingSystem: "windows",
  expectedIntent: "informational", expectedFormat: "", requiredTopics: ["skincare facial"], articleEntities: [],
  resultLimit: 10, version: 1, previousSnapshotId: null,
  ...overrides,
});

/** A entrada que o Minerador grava ao qualificar: desktop-windows, advanced, 20. */
const metaDoMinerador = (overrides: Partial<SerpCacheMeta> = {}): SerpCacheMeta => ({
  keyword: "skincare facial",
  normalizedKeyword: "skincare facial",
  locationCode: 2076,
  languageCode: "pt",
  lens: SERP_CACHE_CANONICAL_LENS,
  endpoint: "advanced",
  depth: 20,
  collectedAt: "2026-09-20T08:30:00.000Z",
  providerRequestId: "task-minerador-1",
  keywordId: "kw-1",
  collectedBy: "minerador",
  ...overrides,
});

/* ------------------------------ comportamento ------------------------------ */

test("a lente é explícita: desktop é a canônica desktop-windows, mobile é android", () => {
  assert.deepEqual(formationSerpLens("desktop"), SERP_CACHE_CANONICAL_LENS);
  assert.deepEqual(formationSerpLens("desktop"), { device: "desktop", operatingSystem: "windows" });
  assert.deepEqual(formationSerpLens("mobile"), { device: "mobile", operatingSystem: "android" });
  assert.deepEqual(FORMATION_SERP_MOBILE_LENS, formationSerpLens("mobile"));
  // Nenhuma lente fora das quatro do produto.
  for (const device of ["desktop", "mobile"] as const) {
    const lente = formationSerpLens(device);
    assert.ok(SERP_CACHE_LENSES.some(item => item.device === lente.device && item.operatingSystem === lente.operatingSystem));
  }
});

test("o pedido da formação é advanced e cai na MESMA chave que o Minerador gravou", () => {
  assert.equal(FORMATION_SERP_ENDPOINT, "advanced");
  const pedido = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, device: "desktop", codes: CODES });
  assert.deepEqual(pedido, {
    query: { keyword: "skincare facial", locationCode: 2076, languageCode: "pt", lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" },
    depth: 10,
    keywordId: "kw-1",
  });
  assert.equal(serpCacheSubjectId(pedido.query), serpCacheSubjectId(metaDoMinerador()));
  // A coleta de 20 do Minerador atende o pedido de 10 da formação.
  assert.deepEqual(serpCacheEntryServes(metaDoMinerador(), { query: pedido.query, depth: pedido.depth, now: NOW }), { serves: true });
});

test("entrada regular, de outra lente ou vencida não atende a formação", () => {
  const pedido = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, device: "desktop", codes: CODES });
  const atende = (meta: SerpCacheMeta) => serpCacheEntryServes(meta, { query: pedido.query, depth: pedido.depth, now: NOW }).serves;
  assert.equal(atende(metaDoMinerador({ endpoint: "regular" })), false);
  assert.equal(atende(metaDoMinerador({ lens: { device: "desktop", operatingSystem: "macos" } })), false);
  assert.equal(atende(metaDoMinerador({ collectedAt: "2026-08-01T00:00:00.000Z" })), false);
  // Mobile pede android: a entrada desktop do Minerador não serve.
  const mobile = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, device: "mobile", codes: CODES });
  assert.equal(serpCacheEntryServes(metaDoMinerador(), { query: mobile.query, depth: 10, now: NOW }).serves, false);
});

test("códigos divergentes entre chave e config são detectados", () => {
  assert.equal(formationSerpCodesMatch(CODES, { locationCode: 2076, languageCode: " PT " }), true);
  assert.equal(formationSerpCodesMatch(CODES, { locationCode: 2840, languageCode: "pt" }), false);
  assert.equal(formationSerpCodesMatch(CODES, { locationCode: 2076, languageCode: "pt-br" }), false);
});

test("acerto normaliza com a proveniência da ENTRADA e registra a lente enviada", () => {
  const meta = metaDoMinerador();
  // O que `lookupSerpCache` devolve a um pedido de 10 sobre uma entrada de 20.
  const corpo = trimSerpBodyToDepth(pruneSerpBody(CRU), 10);
  const snapshot = normalizeCachedFormationSerp(corpo, entrada(), meta);
  assert.equal(snapshot.collectedAt, "2026-09-20T08:30:00.000Z");
  assert.equal(snapshot.device, "desktop");
  assert.equal(snapshot.operatingSystem, "windows");
  assert.ok(snapshot.organicResults.length > 0 && snapshot.organicResults.length <= 10);
  // O ganho do advanced que motivou a troca: o PAA chega ao parecer.
  assert.ok(snapshot.peopleAlsoAsk.length > 0, "o advanced do fixture traz perguntas do PAA");
});

test("data gravada com deslocamento vira o formato que o snapshot aceita", () => {
  const snapshot = normalizeCachedFormationSerp(trimSerpBodyToDepth(pruneSerpBody(CRU), 10), entrada(), metaDoMinerador({ collectedAt: "2026-09-20T08:30:00+00:00" }));
  assert.equal(snapshot.collectedAt, "2026-09-20T08:30:00.000Z");
});

test("corpo em cache que não normaliza LANÇA — e a rota paga em vez de reprovar o artigo", () => {
  const falha = { status_code: 20000, tasks: [{ id: "t", status_code: 40501, result: null }] };
  assert.throws(() => normalizeCachedFormationSerp(falha, entrada(), metaDoMinerador()), DataForSeoSerpError);
  const servir = trecho(rota, "const serveFromCache = ", "const obtainKeywordSerp = ");
  assert.match(servir, /catch \(error\) \{[\s\S]*return null;/);
  // Antes era `fromCache || payKeywordSerp(input)`: o acerto degradado era pago
  // sem entrar na previsão da quota. Agora ele soma à previsão antes de pagar.
  const obter = trecho(rota, "const obtainKeywordSerp = ", "const principalBodies = ");
  assert.match(obter, /if \(fromCache\) return fromCache;\n\s+if \(cached\) quota\.expectMisses\(1\);\n\s+return payKeywordSerp\(input\);/);
});

/* ---------------------- diagnóstico da resposta recusada ---------------------- */

const CONFIG: DataForSeoSerpConfig = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };

/** Um `fetch` falso: nenhum teste chama o provider pago. */
const fetchFalso = (status: number, corpo: string): typeof fetch => async () => new Response(corpo, { status, headers: { "Content-Type": "application/json" } });

const pagar = (fetchImpl: typeof fetch) => executeDataForSeoSerpOperation({
  keyword: "skincare facial", locationCode: 2076, languageCode: "pt", device: "mobile", operatingSystem: "android",
  resultLimit: 10, operationRequestId: "op-1", payloadDepth: "advanced",
}, { config: CONFIG, fetchImpl });

const nucleo = semComentarios("../lib/server/serp-cache.ts");

test("task recusada (40501): a chamada devolve o diagnóstico; só a observação recusa", async () => {
  const corpo = { status_code: 20000, status_message: "Ok.", tasks: [{ id: "task-40501", status_code: 40501, status_message: "Invalid Field: 'os'.", result: null }] };
  const resposta = await pagar(fetchFalso(200, JSON.stringify(corpo)));
  // O código, a mensagem e o id da task existem no retorno da chamada paga…
  assert.deepEqual(resposta.diagnostic, {
    httpStatus: 200, rootStatusCode: 20000, rootStatusMessage: "Ok.", taskStatusCode: 40501, taskStatusMessage: "Invalid Field: 'os'.",
    taskCount: 1, resultCount: 0, itemsCount: 0, providerRequestId: "task-40501",
  });
  // …e quem lança é a observação. Por isso o núcleo a calcula dentro de try.
  assert.throws(() => serpCacheObservationFromBody(pruneSerpBody(resposta.body), metaDoMinerador({ lens: FORMATION_SERP_MOBILE_LENS })),
    (erro: unknown) => erro instanceof DataForSeoSerpError && erro.code === "dataforseo_task_failed");
});

test("status raiz inválido (40100): o diagnóstico também volta, e a observação recusa", async () => {
  const resposta = await pagar(fetchFalso(200, JSON.stringify({ status_code: 40100, status_message: "You are not authorized.", tasks: [] })));
  assert.equal(resposta.diagnostic.rootStatusCode, 40100);
  assert.equal(resposta.diagnostic.rootStatusMessage, "You are not authorized.");
  assert.throws(() => serpCacheObservationFromBody(pruneSerpBody(resposta.body), metaDoMinerador()),
    (erro: unknown) => erro instanceof DataForSeoSerpError && erro.code === "dataforseo_invalid_response");
});

test("HTTP não-2xx e JSON inválido continuam lançando na própria chamada", async () => {
  await assert.rejects(pagar(fetchFalso(500, "{}")), (erro: unknown) => erro instanceof DataForSeoSerpError && erro.code === "dataforseo_http");
  await assert.rejects(pagar(fetchFalso(200, "não é json")), (erro: unknown) => erro instanceof DataForSeoSerpError && erro.code === "dataforseo_invalid_response");
});

test("o núcleo não lança na resposta recusada: devolve o diagnóstico e não grava", () => {
  const coletar = trecho(nucleo, "export async function collectAndCacheSerp(", "export const serpCacheMisses");
  // A observação é calculada dentro de try: a recusa vira `observation: null`.
  assert.match(coletar, /try \{\n\s+observation = serpCacheObservationFromBody\(podado, meta\);\n\s+\} catch \(error\) \{\n\s+observationError = /);
  // Corpo recusado ou SERP sem orgânico não viram acerto de 30 dias.
  // Mudou em 2026-09-23 (adendo das 4 lentes, §3): o retorno ganhou o digest orgânico.
  assert.match(coletar, /if \(!observation \|\| observation\.organicCount === 0\) \{\n\s+return \{ body: resposta\.body, providerRequestId: resposta\.providerRequestId, diagnostic: resposta\.diagnostic, meta, observation, observationError, digest, write: "skipped", writeError: null \};/);
  assert.ok(coletar.indexOf('write: "skipped"') < coletar.indexOf("await writeSerpCacheEntry("), "o desvio vem antes da gravação");
});

/* ------------------------- quota das faltas degradadas ------------------------ */

const livroComResolve = () => {
  const pedidos: number[] = [];
  const livro = createFormationSerpQuotaLedger(async (unidades: number) => {
    pedidos.push(unidades);
    return { unidades };
  });
  return { livro, pedidos };
};

test("lote de corpos degradado com zero faltas iniciais: a quota é avaliada para o LOTE, não para 1", async () => {
  const { livro, pedidos } = livroComResolve();
  livro.expectMisses(0);
  assert.equal(livro.resolution, null, "tudo em cache: nada resolvido");
  // A leitura dos 20 corpos das principais lançou: os 20 acertos viram faltas.
  livro.expectMisses(20);
  await livro.ensureCovered();
  assert.deepEqual(pedidos, [20]);
  // As 20 chamadas seguintes não reavaliam: já estão cobertas.
  await Promise.all(Array.from({ length: 20 }, () => livro.ensureCovered()));
  assert.deepEqual(pedidos, [20]);
});

test("faltas parciais + degradação: reavalia o que ainda não virou uso succeeded", async () => {
  const { livro, pedidos } = livroComResolve();
  livro.expectMisses(3);
  await livro.ensureCovered();
  livro.recordSucceeded();
  livro.recordSucceeded();
  // Um lote de secundárias com 5 acertos degradou: 3 + 5 previstas, 2 já em `usedUnits`.
  livro.expectMisses(5);
  await livro.ensureCovered();
  assert.deepEqual(pedidos, [3, 6]);
  assert.equal(livro.coveredMisses, 8);
});

test("reavaliações paralelas são uma só; e a recusa da quota propaga sem travar a próxima", async () => {
  const pedidos: number[] = [];
  let recusar = true;
  const livro = createFormationSerpQuotaLedger(async (unidades: number) => {
    pedidos.push(unidades);
    if (recusar) throw new Error("INTEGRATION_QUOTA_EXHAUSTED");
    return unidades;
  });
  livro.expectMisses(4);
  const tentativas = await Promise.allSettled([livro.ensureCovered(), livro.ensureCovered()]);
  assert.ok(tentativas.every(item => item.status === "rejected"));
  recusar = false;
  const paralelas = await Promise.all([livro.ensureCovered(), livro.ensureCovered(), livro.ensureCovered()]);
  assert.deepEqual(paralelas, [4, 4, 4]);
  assert.equal(pedidos.filter(unidades => unidades === 4).length, 3, "duas recusas + UMA avaliação para três chamadas");
});

test("resolve que descobre códigos divergentes aumenta a previsão e reavalia na hora", async () => {
  const pedidos: number[] = [];
  const livro = createFormationSerpQuotaLedger(async (unidades: number) => {
    pedidos.push(unidades);
    // A rota faz isto quando a config diverge da chave: nenhum acerto serve.
    livro.expectAtLeast(12);
    return unidades;
  });
  livro.expectMisses(2);
  await livro.ensureCovered();
  assert.deepEqual(pedidos, [2, 12]);
});

/* -------------------------------- estrutura -------------------------------- */

test("a rota não paga mais pelo utilitário regular", () => {
  assert.doesNotMatch(rota, /collectDataForSeoCompatibilitySnapshot/);
  assert.doesNotMatch(rota, /quotaUnits: totalKeywords/);
  assert.match(rota, /endpoint: "\/v3\/serp\/google\/organic\/live\/advanced"/);
  assert.doesNotMatch(rota, /live\/regular/);
});

test("o cache é lido em modo meta ANTES de resolver credencial e quota", () => {
  const leitura = rota.indexOf('{ mode: "meta", now }');
  const resolucao = rota.indexOf("resolveDataForSeoCompatibilityConfig({");
  assert.ok(leitura > -1 && resolucao > -1);
  assert.ok(leitura < resolucao, "lookup antes do resolve");
  assert.match(rota, /lookupSerpCache\(pipelineContext, potentialKeywords\.map\(keyword => cacheRequestFor\(keyword\)\), \{ mode: "meta", now \}\)/);
  // Principais, secundárias, reforços e candidatas entram na mesma leitura.
  assert.match(rota, /const potentialKeywords = \[\.\.\.groups\.flatMap\(group => group\.keywords\), \.\.\.siloCandidateKeywords\];/);
});

test("a quota conta só as faltas, e com zero faltas o resolve não é chamado", () => {
  /*
   * Mudou em 2026-09-23 (adendo das 4 lentes, A6): a previsão é o PLANO de
   * chamadas pagas — faltas da lente principal e das extras, lidas em `meta` —,
   * o mesmo número que a pessoa autorizou.
   */
  assert.match(rota, /const potentialMisses = plan\.paidQueries;/);
  // Mudou em 2026-09-23 (correção da A2): a entrada do plano é nomeada, para o orçamento reservar as mesmas faltas.
  assert.match(rota, /const planInput = \{/);
  assert.match(rota, /const plan = buildSerpPaidPlan\(planInput\);/);
  // A previsão começa nas faltas da leitura meta; o resolve só roda se houver alguma.
  assert.match(rota, /const quota = createFormationSerpQuotaLedger\(resolveDataForSeo\);\n\s+quota\.expectMisses\(potentialMisses\);/);
  assert.match(rota, /if \(potentialMisses > 0\) await quota\.ensureCovered\(\);/);
  const resolver = trecho(rota, "const resolveDataForSeo = ", "return resolution;");
  assert.match(resolver, /quotaUnits,/);
  // Códigos divergentes: os acertos ainda não servidos entram na previsão.
  assert.match(resolver, /quota\.expectAtLeast\(potentialKeywords\.length - diagnostic\.cacheHits\);/);
});

test("acerto que degrada em falta é previsto e a quota reavaliada ANTES de pagar — nunca com 1 unidade fixa", () => {
  // A versão anterior resolvia uma única vez com `resolveDataForSeo(1)` e
  // pagava o lote degradado inteiro sob essa avaliação.
  assert.doesNotMatch(rota, /resolveDataForSeo\(1\)/);
  assert.doesNotMatch(rota, /lateResolution|requireDataForSeo/);
  const corpos = trecho(rota, "const readCachedBodies = ", "const markProviderResponse = ");
  assert.match(corpos, /const degradedHits = cacheRequests\.length - servedRequests;/);
  assert.match(corpos, /quota\.expectMisses\(degradedHits\);\n\s+await quota\.ensureCovered\(\);/);
  // Contado por pedido: o catch da leitura deixa `servedRequests` em 0 e o lote inteiro é previsto.
  assert.match(corpos, /servedRequests \+= 1;/);
  const pagar = trecho(rota, "const payKeywordSerp = ", "const serveFromCache = ");
  assert.match(pagar, /const resolution = await quota\.ensureCovered\(\);/);
  // Uso `succeeded` registrado entra em `usedUnits`: a próxima reavaliação o desconta.
  assert.match(pagar, /resultStatus: "succeeded" \}\);\n\s+quota\.recordSucceeded\(\);/);
});

test("a chave usa os códigos-alvo e a divergência com a config descarta os acertos", () => {
  assert.match(rota, /const targetCodes = readDataForSeoTargetCodes\(\);/);
  assert.match(rota, /formationSerpCodesMatch\(targetCodes, resolution\.config\)/);
  assert.match(rota, /cacheCodesMatch = false;/);
  /*
   * Mudou em 2026-09-23 (A8): a keyword com os códigos do Minerador tem chave
   * igual ao que vai ao provider, e a divergência da config só descarta o
   * acerto das keywords com os códigos do ambiente.
   */
  assert.match(rota, /const keyServes = \(keywordId: string\) => cacheCodesMatch \|\| !usesEnvironmentCodes\(keywordId\);/);
  assert.match(rota, /const cached = keyServes\(input\.keywordId\) \? input\.cachedBodies\.get\(subjectId\) : undefined;/);
});

test("um único relógio por requisição", () => {
  assert.equal(rota.match(/new Date\(/g)?.length, 1);
  assert.match(rota, /const now = new Date\(\);/);
});

test("cache fora não derruba a operação: a leitura falha e a rota paga", () => {
  const meta = trecho(rota, "let metaLookups: SerpCacheLookup[];", "const cachedMeta = ");
  assert.match(meta, /\} catch \(error\) \{[\s\S]*diagnostic\.cacheReadFailed = true;[\s\S]*hit: null/);
  const corpos = trecho(rota, "const readCachedBodies = ", "const payKeywordSerp = ");
  assert.match(corpos, /lookupSerpCache\(pipelineContext, cacheRequests, \{ mode: "body", now \}\)/);
  assert.match(corpos, /\} catch \(error\) \{[\s\S]*diagnostic\.cacheReadFailed = true;/);
});

test("os corpos são lidos por lote — principais de todos os grupos, secundárias por grupo, candidatas", () => {
  assert.match(rota, /const principalBodies = await readCachedBodies\(groups\.flatMap\(group => group\.keywords\.filter\(keyword => keyword\.id === group\.principalSuggestion\.keywordId\)\)\);/);
  assert.ok(rota.indexOf("const principalBodies = ") < rota.indexOf("const settledAssessments = "), "as principais são lidas antes dos grupos");
  assert.match(rota, /collect\(group\.keywords\[principalIndex\], principalIndex, principalBodies\)/);
  assert.match(rota, /const secondaryBodies = await readCachedBodies\(group\.keywords\.filter\(\(_, index\) => index !== principalIndex\)\);/);
  assert.match(rota, /const candidateBodies = await readCachedBodies\(siloCandidateKeywords\);/);
  // A secundária de um KGR leve continua condicionada à principal ambígua.
  assert.match(rota, /if \(validationProfile !== "kgr_light" \|\| principalAmbiguous\) \{/);
});

test("o acerto normaliza com collectedAt e providerRequestId da entrada", () => {
  const servir = trecho(rota, "const serveFromCache = ", "const obtainKeywordSerp = ");
  assert.match(servir, /normalizeCachedFormationSerp\(cached\.body, input\.serpInput, cached\.meta\)/);
  assert.doesNotMatch(servir, /collectAndCacheSerp|recordSerpUsage|recordIntegrationUsage/);
  const normalizar = trecho(fronteira, "export function normalizeCachedFormationSerp(", "\n}");
  assert.match(normalizar, /normalizeDataForSeoSerpResponse\(/);
  assert.match(normalizar, /new Date\(meta\.collectedAt\)\.toISOString\(\)/);
  assert.match(normalizar, /meta\.providerRequestId/);
  assert.match(normalizar, /\{ locationCode: meta\.locationCode, languageCode: meta\.languageCode \}/);
});

test("a falta paga por collectAndCacheSerp, com os ganchos do diagnóstico, e normaliza o corpo CRU", () => {
  const pagar = trecho(rota, "const payKeywordSerp = ", "const serveFromCache = ");
  assert.match(pagar, /await collectAndCacheSerp\(pipelineContext, cacheRequest, \{/);
  assert.match(pagar, /collectedBy: "arquiteto",/);
  assert.match(pagar, /\n\s+now,\n/);
  for (const gancho of ["onRequestBuilt", "onRequestStarted", "onHttpResponse"]) assert.match(pagar, new RegExp(`${gancho}: `));
  // O núcleo volta também na task recusada (`observation: null`): o
  // diagnóstico do provider é aplicado no retorno, ANTES de normalizar — que é
  // quem recusa. O gancho de fetch que lia o corpo duas vezes saiu.
  assert.doesNotMatch(pagar, /fetchImpl:/);
  assert.doesNotMatch(fronteira, /fetchWithProviderDiagnostic/);
  // Colado ao fechamento de `collectAndCacheSerp(...)`: dentro de um `if` o
  // diagnóstico da task recusada voltaria a se perder.
  /*
   * Mudou em 2026-09-23 (correção de A2): entre o fechamento e o diagnóstico
   * só entra o recorte do corpo, que não lança; as contagens aplicadas são as
   * do corpo recortado, como no acerto.
   */
  assert.match(pagar, /\}\);\n\s+const requestedBody = serpBodyAtRequestedDepth\([^\n]*\);\n\s+markProviderResponse\(queryDiagnostic, providerDiagnosticAtRequestedDepth\(collection\.diagnostic, collection\.body, requestedBody\)\);/);
  assert.doesNotMatch(pagar, /markProviderResponse\(queryDiagnostic, collection\.diagnostic\)/, "contagens do corpo de 20 na falta");
  assert.ok(pagar.indexOf("markProviderResponse(queryDiagnostic, ") < pagar.indexOf("normalizeDataForSeoSerpResponse(requestedBody"), "diagnóstico antes da normalização");
  const marcar = trecho(rota, "const markProviderResponse = ", "const payKeywordSerp = ");
  assert.match(marcar, /applyProviderDiagnostic\(diagnostic, queryDiagnostic, providerDiagnostic\);/);
  assert.match(marcar, /diagnostic\.paidQueries \+= 1;/);
  assert.match(marcar, /queryDiagnostic\.source = "provider";/);
  assert.doesNotMatch(pagar, /diagnostic\.paidQueries \+= 1/, "a contagem vive só no gancho — sem contar duas vezes");
  /*
   * Mudou em 2026-09-23 (A2 do adendo das 4 lentes do Arquiteto): a canônica
   * é paga com 20 e o corpo CRU é recortado à profundidade do pedido antes de
   * normalizar — a mesma regra do acerto. Coleta na profundidade do pedido
   * passa intacta.
   */
  assert.match(pagar, /const requestedBody = serpBodyAtRequestedDepth\(collection\.body, collection\.meta\.depth, input\.serpInput\.resultLimit\);/);
  // Mudou em 2026-09-23 (A8): o snapshot registra os códigos da CONSULTA — os do Minerador ou os da config.
  assert.match(pagar, /normalizeDataForSeoSerpResponse\(requestedBody, input\.serpInput, \{ locationCode: cacheRequest\.query\.locationCode, languageCode: cacheRequest\.query\.languageCode \}, collection\.meta\.collectedAt, collection\.providerRequestId\)/);
  assert.match(pagar, /const cacheRequest = architectSerpCollectionRequest\(cacheRequestFor\(/);
  // Falha de gravação do cache não derruba: só avisa.
  assert.match(pagar, /if \(collection\.write === "failed"\) \{\n\s+console\.warn\(/);
});

test("o uso só é registrado para faltas pagas", () => {
  const pagar = trecho(rota, "const payKeywordSerp = ", "const serveFromCache = ");
  const chamadas = rota.match(/await recordSerpUsage\(/g)?.length || 0;
  const noPagamento = pagar.match(/await recordSerpUsage\(/g)?.length || 0;
  assert.equal(noPagamento, 2, "sucesso e falha do pagamento");
  /*
   * Mudou em 2026-09-23 (A3): a lente extra paga tem o próprio caminho pago
   * (sucesso, recusa do provider e erro de provider), com a lente na chave de
   * idempotência. Nenhum registro fora dos dois caminhos pagos.
   */
  // Mudou em 2026-09-23 (correção da A2): o pagamento da extra é `collectExtraLens`, uma vez por consulta.
  const pagarExtra = trecho(rota, "const collectExtraLens = ", "const payExtraLensDigest = ");
  const naExtra = pagarExtra.match(/await recordSerpUsage\(/g)?.length || 0;
  assert.equal(naExtra, 3, "sucesso, recusa e erro da lente extra paga");
  assert.equal(chamadas, noPagamento + naExtra, "nenhum registro de uso fora do caminho pago");
  assert.match(pagarExtra, /lens: serpCacheLensLabel\(input\.extraLens\), resultStatus: "succeeded"/);
  assert.match(rota, /idempotencyKey: `dataforseo:serp_validation:\$\{operationRequestId\}:\$\{input\.articleId\}:\$\{input\.keywordId\}\$\{input\.lens \? `:\$\{input\.lens\}` : ""\}`/);
  assert.match(pagar, /resultStatus: "succeeded"/);
  assert.match(pagar, /resultStatus: "failed", errorCode: error\.code/);
});

test("o snapshot registra a lente enviada; o parecer continua com o snapshot completo", () => {
  assert.equal(rota.match(/device: lens\.device, operatingSystem: lens\.operatingSystem,/g)?.length, 2);
  assert.doesNotMatch(rota, /device: parsed\.data\.device,\n/);
  // O contrato persistido não mudou: o parecer leva `assessment` com seus snapshots.
  assert.match(rota, /saveArticleFormationSerpAssessment\(pipelineContext, \{[\s\S]*assessment,/);
  assert.match(rota, /snapshots,\n\s+queriedKeywordDnaIds: snapshots\.map\(snapshot => snapshot\.keywordId\),/);
});

test("R5 — a rota não lê tabela com select(\"*\")", () => {
  assert.doesNotMatch(rota, /select\("\*"\)/);
});

/* -------- A2 · a canônica paga pelo Arquiteto grava com 20 resultados -------- */

/*
 * A chave do cache não inclui profundidade. Uma canônica paga pelo Arquiteto
 * com 10 substituía a entrada ausente ou vencida do Minerador, e a CALL 3,
 * que pede 20, recusava a entrada mais rasa e pagava de novo. Agora toda falta
 * da canônica paga pelo Arquiteto vai ao provider com 20; a leitura continua
 * pedindo o que o leitor usa.
 */

const allintitle = semComentarios("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts");
const territorial = semComentarios("../app/api/arquiteto/territorial-serp/route.ts");
const porKeyword = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");

test("A2 · a profundidade da canônica do Arquiteto é a mesma da CALL 3 do Minerador", () => {
  const call3 = /const SEMANTIC_SERP_DEPTH = (\d+);/.exec(allintitle)?.[1];
  assert.ok(call3, "a constante da CALL 3 sumiu do Minerador: conferir a nova fonte");
  assert.equal(ARCHITECT_CANONICAL_SERP_COLLECTION_DEPTH, Number(call3));
  assert.equal(ARCHITECT_CANONICAL_SERP_COLLECTION_DEPTH, 20);
});

test("A2 · só a canônica sobe para 20; as extras ficam na profundidade pedida", () => {
  const canonica = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, device: "desktop", codes: CODES });
  const paga = architectSerpCollectionRequest(canonica);
  assert.equal(paga.depth, 20);
  // Só a profundidade muda: mesma consulta, mesma chave, mesma keyword.
  assert.deepEqual({ ...paga, depth: canonica.depth }, canonica);
  assert.equal(serpCacheSubjectId(paga.query), serpCacheSubjectId(canonica.query));
  // A entrada gravada com 20 atende a CALL 3 (20) e a formação (10).
  const gravada = metaDoMinerador({ depth: paga.depth, collectedBy: "arquiteto", collectedAt: NOW.toISOString() });
  assert.deepEqual(serpCacheEntryServes(gravada, { query: canonica.query, depth: 20, now: NOW }), { serves: true });
  assert.deepEqual(serpCacheEntryServes(gravada, { query: canonica.query, depth: 10, now: NOW }), { serves: true });
  // O que acontecia antes: a de 10 era recusada pela CALL 3.
  assert.equal(serpCacheEntryServes({ ...gravada, depth: 10 }, { query: canonica.query, depth: 20, now: NOW }).serves, false);

  // Pedido mais fundo que 20 não é rebaixado.
  assert.equal(architectSerpCollectionRequest({ ...canonica, depth: 30 }).depth, 30);

  // Nenhuma lente extra muda de profundidade: nenhum leitor delas pede mais que o top 10.
  for (const lens of SERP_CACHE_LENSES.slice(1)) {
    const extra = { ...canonica, query: { ...canonica.query, lens } };
    assert.equal(architectSerpCollectionRequest(extra), extra);
    assert.equal(architectSerpCollectionRequest(extra).depth, 10);
  }
  const mobile = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, device: "mobile", codes: CODES });
  assert.equal(architectSerpCollectionRequest(mobile).depth, 10);
});

test("A2 · só a canônica grava corpo quando o Arquiteto paga pela SERP por keyword", () => {
  assert.equal(architectSerpStoresBody(SERP_CACHE_CANONICAL_LENS), true);
  for (const lens of SERP_CACHE_LENSES.slice(1)) assert.equal(architectSerpStoresBody(lens), false, `${lens.device}-${lens.operatingSystem}`);
});

test("A2 · falta paga com 20 e acerto de 20 dão o MESMO snapshot para um pedido de 10", () => {
  // O fixture é a coleta REAL da canônica com 20 (task.data.depth = 20).
  assert.equal(CRU.tasks[0].data.depth, 20);
  const input = entrada();
  const falta = normalizeDataForSeoSerpResponse(serpBodyAtRequestedDepth(CRU, 20, input.resultLimit), input, CODES, "2026-09-23T12:00:00.000Z", "task-arquiteto");
  // O acerto: `lookupSerpCache` devolve o corpo podado recortado ao pedido.
  const acerto = normalizeCachedFormationSerp(trimSerpBodyToDepth(pruneSerpBody(CRU), input.resultLimit), input, metaDoMinerador({ collectedAt: "2026-09-23T12:00:00.000Z", providerRequestId: "task-arquiteto" }));
  assert.equal(falta.contentHash, acerto.contentHash);
  assert.deepEqual(falta.organicResults, acerto.organicResults);
  assert.deepEqual(falta.peopleAlsoAsk, acerto.peopleAlsoAsk);
  assert.deepEqual(falta.serpFeatures, acerto.serpFeatures);
  assert.deepEqual(falta.diagnostic, acerto.diagnostic);

  // Sem o recorte, pagar mais fundo mudaria o parecer: os blocos depois do 10º orgânico entrariam.
  const semRecorte = normalizeDataForSeoSerpResponse(CRU, input, CODES, "2026-09-23T12:00:00.000Z", "task-arquiteto");
  assert.notEqual(semRecorte.contentHash, acerto.contentHash);
});

test("A2 · coleta na profundidade do pedido passa intacta: o corpo de antes", () => {
  const corpo = { status_code: 20000, tasks: [] };
  assert.equal(serpBodyAtRequestedDepth(corpo, 10, 10), corpo);
  assert.equal(serpBodyAtRequestedDepth(corpo, 10, 20), corpo);
  // Task recusada continua recusada depois do recorte: o erro é o mesmo de antes.
  const recusada = { status_code: 20000, tasks: [{ id: "t", status_code: 40501, result: null }] };
  assert.throws(() => normalizeDataForSeoSerpResponse(serpBodyAtRequestedDepth(recusada, 20, 10), entrada(), CODES, NOW.toISOString(), null),
    (erro: unknown) => erro instanceof DataForSeoSerpError && erro.code === "dataforseo_task_failed");
});

test("A2 · o diagnóstico da falta conta o corpo recortado: as mesmas contagens do acerto", () => {
  const input = entrada();
  const doProvider = inspectDataForSeoSerpResponse(CRU, 200, "task-arquiteto");
  const recortado = serpBodyAtRequestedDepth(CRU, 20, input.resultLimit);
  const falta = providerDiagnosticAtRequestedDepth(doProvider, CRU, recortado);
  // O acerto: a rota inspeciona o corpo em cache, podado e recortado ao pedido.
  const acerto = inspectDataForSeoSerpResponse(trimSerpBodyToDepth(pruneSerpBody(CRU), input.resultLimit), null, "task-arquiteto");
  assert.equal(falta.itemsCount, acerto.itemsCount);
  assert.equal(falta.resultCount, acerto.resultCount);
  // O defeito: sem a correção, a falta contava os itens do corpo de 20.
  assert.ok(doProvider.itemsCount > falta.itemsCount, `${doProvider.itemsCount} > ${falta.itemsCount}`);
  // A resposta real continua a do provider: HTTP, códigos e id da task.
  assert.equal(falta.httpStatus, 200);
  assert.equal(falta.taskStatusCode, doProvider.taskStatusCode);
  assert.equal(falta.rootStatusCode, doProvider.rootStatusCode);
  assert.equal(falta.taskCount, doProvider.taskCount);
  assert.equal(falta.providerRequestId, doProvider.providerRequestId);

  // Coleta na profundidade do pedido: o diagnóstico de antes, o mesmo objeto.
  assert.equal(providerDiagnosticAtRequestedDepth(doProvider, CRU, serpBodyAtRequestedDepth(CRU, 10, 10)), doProvider);
  // Task recusada: o recorte não inventa itens nem apaga o código de erro.
  const recusada = { status_code: 20000, tasks: [{ id: "t", status_code: 40501, result: null }] };
  const diagRecusada = inspectDataForSeoSerpResponse(recusada, 200, null);
  const diagRecortada = providerDiagnosticAtRequestedDepth(diagRecusada, recusada, serpBodyAtRequestedDepth(recusada, 20, 10));
  assert.equal(diagRecortada.taskStatusCode, 40501);
  assert.equal(diagRecortada.itemsCount, 0);
  assert.equal(diagRecortada.resultCount, 0);
});

test("A2 · as três rotas pagam a canônica com 20 e continuam LENDO a profundidade pedida", () => {
  // Formação: a falta paga pelo pedido mais fundo; a leitura pede `resultLimit`.
  // Mudou em 2026-09-23 (A3): o pedido escolhe a lente diretamente (`lens`), não mais `device`.
  assert.match(rota, /depth: parsed\.data\.resultLimit, lens: requestLens, codes,/);
  const pagarFormacao = trecho(rota, "const payKeywordSerp = ", "const serveFromCache = ");
  assert.match(pagarFormacao, /architectSerpCollectionRequest\(cacheRequestFor\(/);

  // Territorial: a falta com cache paga com 20 e devolve o corpo recortado; o caminho sem cache não grava e segue no pedido.
  assert.match(territorial, /depth: parsed\.data\.resultLimit,/);
  /*
   * Mudou em 2026-09-23 (correção da A2): a asserção era sobre o arquivo
   * inteiro e passou a casar com `coletarExtra`, que também chama
   * `architectSerpCollectionRequest(lookup.request)`. Uma canônica que
   * voltasse a pagar com 10 passava. Agora ela é presa ao trecho de `coletar`.
   */
  const coletarCanonica = trecho(territorial, "const coletar = async", "const coletasExtras");
  assert.match(coletarCanonica, /collectAndCacheSerp\(pipelineContext, architectSerpCollectionRequest\(lookup\.request\), \{/);
  assert.doesNotMatch(coletarCanonica, /collectAndCacheSerp\(pipelineContext, lookup\.request,/);
  assert.match(coletarCanonica, /body: serpBodyAtRequestedDepth\(coleta\.body, coleta\.meta\.depth, lookup\.request\.depth\)/);
  const semCache = trecho(territorial, "if (codigosDivergem) {\n", "const coleta = await collectAndCacheSerp(");
  assert.match(semCache, /resultLimit: lookup\.request\.depth,/);
  assert.doesNotMatch(semCache, /architectSerpCollectionRequest/);

  // SERP por keyword: a canônica paga com 20; a observação é sempre o top 10.
  assert.match(porKeyword, /collectAndCacheSerp\(pipelineContext, architectSerpCollectionRequest\(item\.pedido\), \{/);
  assert.match(porKeyword, /depth: parsed\.data\.resultLimit,/);
});

/* ============ A3 · as lentes do pedido (formação e territorial) ============ */

test("A3 · o pedido pede as quatro lentes; `device` continua como forma legada de uma lente só", () => {
  assert.deepEqual([...SERP_LENS_LABELS], SERP_CACHE_LENSES.map(serpCacheLensLabel));
  for (const label of SERP_LENS_LABELS) assert.equal(serpCacheLensLabel(serpLensFromLabel(label)), label);

  const padrao = resolveRequestedSerpLenses({});
  assert.deepEqual(padrao.lenses, [...SERP_CACHE_LENSES]);
  assert.deepEqual(padrao.primary, SERP_CACHE_CANONICAL_LENS, "a canônica é a lente lida em corpo");
  assert.equal(padrao.extras.length, 3);
  assert.equal(padrao.legacy, false);

  // Ordem do produto, sem repetição; a canônica é a principal sempre que pedida.
  const fora = resolveRequestedSerpLenses({ lenses: ["mobile-ios", "desktop-windows", "mobile-ios"] });
  assert.deepEqual(fora.lenses.map(serpCacheLensLabel), ["desktop-windows", "mobile-ios"]);
  assert.deepEqual(fora.primary, SERP_CACHE_CANONICAL_LENS);
  assert.deepEqual(fora.extras.map(serpCacheLensLabel), ["mobile-ios"]);
  // Sem a canônica, a primeira pedida vira a principal.
  assert.equal(serpCacheLensLabel(resolveRequestedSerpLenses({ lenses: ["mobile-ios"] }).primary), "mobile-ios");

  // Legado: exatamente a lente de antes.
  const desktop = resolveRequestedSerpLenses({ device: "desktop" });
  assert.deepEqual(desktop, { lenses: [SERP_CACHE_CANONICAL_LENS], primary: SERP_CACHE_CANONICAL_LENS, extras: [], legacy: true });
  assert.deepEqual(resolveRequestedSerpLenses({ device: "mobile" }).primary, FORMATION_SERP_MOBILE_LENS);
  assert.deepEqual(resolveRequestedSerpLenses({ device: "mobile" }).primary, formationSerpLens("mobile"));
  // Com os dois, vale `lenses`.
  assert.equal(resolveRequestedSerpLenses({ device: "mobile", lenses: ["desktop-windows", "desktop-macos"] }).legacy, false);

  // O pedido ao cache aceita a lente diretamente, na mesma chave que `device` dava.
  const porLente = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, lens: SERP_CACHE_CANONICAL_LENS, codes: CODES });
  assert.deepEqual(porLente, formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, device: "desktop", codes: CODES }));
});

/* ====== A3 · as extras são lidas pelo digest, pela MESMA classificação ====== */

const factosDe = (snapshot: { organicResults: ReadonlyArray<{ url: string; domain: string; title: string; snippet: string; inferredType: string }> }) =>
  snapshot.organicResults.map(item => ({ url: item.url, domain: item.domain, title: item.title, snippet: item.snippet, inferredType: item.inferredType }));

test("A3 · digest e corpo da MESMA SERP dão os mesmos fatos (fixture real)", () => {
  const input = entrada({ device: "mobile", operatingSystem: "ios" });
  const meta = { locationCode: 2076, languageCode: "pt", collectedAt: "2026-09-20T08:30:00+00:00", providerRequestId: "task-ios" };
  const corpo = trimSerpBodyToDepth(pruneSerpBody(CRU), 10);
  const digest = buildSerpOrganicDigest(pruneSerpBody(CRU));
  assert.ok(digest);
  const pelaLentePrincipal = normalizeDataForSeoSerpResponse(corpo, input, CODES, "2026-09-20T08:30:00.000Z", "task-ios");
  const peloDigest = normalizeOrganicDigestSerp(digest, input, meta);
  assert.equal(peloDigest.organicResults.length, 10);
  assert.deepEqual(factosDe(peloDigest), factosDe(pelaLentePrincipal), "título, URL, domínio, snippet e tipo — pela mesma classificação");
  // A data com deslocamento vira o formato que o snapshot aceita, e a lente é a pedida.
  assert.equal(peloDigest.collectedAt, "2026-09-20T08:30:00.000Z");
  assert.equal(peloDigest.operatingSystem, "ios");
  // O corpo montado do digest só tem orgânicos: nada de bloco inventado.
  const montado = serpBodyFromOrganicDigest(digest) as { tasks: Array<{ result: Array<{ items: Array<{ type: string }> }> }> };
  assert.ok(montado.tasks[0].result[0].items.every(item => item.type === "organic"));
});

test("A3 · a única diferença declarada: o digest não traz vídeo com título e URL próprios", () => {
  // Fixture real com blocos `video` e `short_videos`: eles não têm título nem URL
  // no topo, o normalizador já os pulava — a leitura pelas duas vias é igual.
  const tarefa = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skin-care-noturno.json", import.meta.url), "utf8"));
  const cru = { status_code: 20000, tasks: [tarefa] };
  const input = entrada({ keyword: "skin care noturno", requiredTopics: ["skin care noturno"] });
  const meta = { locationCode: 2076, languageCode: "pt", collectedAt: NOW.toISOString(), providerRequestId: null };
  const digestReal = buildSerpOrganicDigest(pruneSerpBody(cru));
  assert.ok(digestReal);
  assert.ok(tarefa.result[0].items.some((item: { type: string }) => item.type === "video"), "a fixture tem bloco de vídeo");
  assert.deepEqual(
    factosDe(normalizeOrganicDigestSerp(digestReal, input, meta)),
    factosDe(normalizeDataForSeoSerpResponse(trimSerpBodyToDepth(pruneSerpBody(cru), 10), input, CODES, NOW.toISOString(), null)),
  );

  // Vídeo COM título e URL no topo: a lente principal o conta, o digest não. É a
  // assimetria que o marcador declara; os votos comparam só dentro da mesma lente.
  const comVideo = structuredClone(cru);
  comVideo.tasks[0].result[0].items.splice(1, 0, { type: "video", rank_group: 1, rank_absolute: 2, title: "Rotina noturna em vídeo", url: "https://www.youtube.com/watch?v=abc" });
  const principal = factosDe(normalizeDataForSeoSerpResponse(trimSerpBodyToDepth(pruneSerpBody(comVideo), 10), input, CODES, NOW.toISOString(), null));
  const extra = factosDe(normalizeOrganicDigestSerp(buildSerpOrganicDigest(pruneSerpBody(comVideo))!, input, meta));
  assert.ok(principal.some(item => item.inferredType === "video"));
  assert.deepEqual(extra, principal.filter(item => item.inferredType !== "video"));
});

/* ================= A6 · o plano de chamadas pagas ================= */

const LENTES = [...SERP_CACHE_LENSES];
const [CANONICA, MACOS, ANDROID, IOS] = LENTES;
const vaga = (payKey: string, lens: typeof CANONICA, overrides: Partial<SerpPlanSlot> = {}): SerpPlanSlot => ({
  payKey, dateGroup: payKey.split(":")[0], lens, primary: lens === CANONICA, conditional: false, payable: true,
  hitCollectedAt: null, missReason: "sem entrada", ...overrides,
});
const acerto = (data = "2026-09-20T00:00:00.000Z") => ({ hitCollectedAt: data, missReason: null });

test("A6 · o plano conta as faltas por lente, as condicionais e o custo em faixa", () => {
  const slots = [
    // Principal: canônica em cache, macos e android faltando, ios em cache.
    vaga("p:win", CANONICA, acerto()), vaga("p:mac", MACOS), vaga("p:and", ANDROID), vaga("p:ios", IOS, acerto()),
    // Secundária de KGR leve: tudo condicional.
    vaga("s:win", CANONICA, { conditional: true }), vaga("s:mac", MACOS, { conditional: true }),
    // Artigo de uma busca só: a extra não é paga (sem par).
    vaga("u:mac", MACOS, { payable: false }),
  ];
  const plan = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: false });
  assert.equal(plan.paidQueries, 4);
  assert.equal(plan.primaryPaidQueries, 1);
  assert.equal(plan.extraPaidQueries, 3);
  assert.equal(plan.conditionalPaidQueries, 2);
  assert.deepEqual(plan.perLens.map(linha => [linha.lens, linha.hits, linha.misses, linha.conditionalMisses, linha.unpaidMisses]), [
    ["desktop-windows", 1, 1, 1, 0], ["desktop-macos", 0, 2, 1, 1], ["mobile-android", 0, 1, 0, 0], ["mobile-ios", 1, 0, 0, 0],
  ]);
  // A canônica paga com 20 tem preço MEDIDO; as extras, faixa ESTIMADA.
  assert.deepEqual(plan.estimatedCostUsd, {
    min: Math.round((SERP_PAID_QUERY_COST_USD.canonicalDepth20 + 3 * SERP_PAID_QUERY_COST_USD.otherLensMin) * 10000) / 10000,
    max: Math.round((SERP_PAID_QUERY_COST_USD.canonicalDepth20 + 3 * SERP_PAID_QUERY_COST_USD.otherLensMax) * 10000) / 10000,
  });
  assert.equal(plan.digestChecked, false);

  // "Só a lente principal": as extras que faltam não entram no teto.
  const soPrincipal = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: false, recollectStaleLenses: false });
  assert.equal(soPrincipal.paidQueries, 1);
  assert.equal(soPrincipal.extraPaidQueries, 0);
  // A mesma consulta em duas vagas com a mesma chave de pagamento é paga uma vez.
  assert.equal(buildSerpPaidPlan({ lenses: LENTES, slots: [vaga("x:mac", MACOS), vaga("x:mac", MACOS)], payMissingExtraLenses: true, recollectStaleLenses: false }).paidQueries, 1);
  // Tudo em cache: zero.
  assert.equal(buildSerpPaidPlan({ lenses: LENTES, slots: [vaga("p:win", CANONICA, acerto())], payMissingExtraLenses: true, recollectStaleLenses: false }).paidQueries, 0);
});

test("A6 · a execução só paga o autorizado: sem autorização ou com plano maior, nada é pago", () => {
  assert.deepEqual(authorizeSerpPaidPlan({ paidQueries: 0 }, 0), { ok: true }, "tudo em cache não pede autorização");
  const exige = authorizeSerpPaidPlan({ paidQueries: 3 }, 0);
  assert.equal(exige.ok, false);
  assert.equal(!exige.ok && exige.code, "PAID_PLAN_REQUIRED");
  const mudou = authorizeSerpPaidPlan({ paidQueries: 3 }, 2);
  assert.equal(!mudou.ok && mudou.code, "PAID_PLAN_CHANGED");
  assert.match(!mudou.ok ? mudou.message : "", /Nada foi pago/);
  assert.deepEqual(authorizeSerpPaidPlan({ paidQueries: 3 }, 3), { ok: true });
  assert.deepEqual(authorizeSerpPaidPlan({ paidQueries: 3 }, 5), { ok: true }, "o plano encolheu: paga menos, nunca mais");

  // O orçamento: nenhuma chamada além do autorizado, mesmo que um acerto degrade.
  const orcamento = createPaidQueryBudget(2);
  assert.deepEqual([orcamento.take(), orcamento.take(), orcamento.take()], [true, true, false]);
  assert.equal(orcamento.used, 2);
  assert.equal(orcamento.remaining, 0);
  assert.equal(createPaidQueryBudget(0).take(), false);
});

test("A6 · as saídas do plano levam o número exato que a execução pode pagar", () => {
  const slots = [vaga("p:win", CANONICA), vaga("p:mac", MACOS), vaga("p:and", ANDROID, acerto("2026-09-01T00:00:00.000Z")), vaga("p:ios", IOS, acerto("2026-09-20T00:00:00.000Z"))];
  const plan = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: false });
  const opcoes = serpPaidPlanOptions(plan);
  assert.deepEqual(opcoes.map(opcao => [opcao.id, opcao.choice]), [
    ["all", { authorizedPaidQueries: 2, payMissingExtraLenses: true, recollectStaleLenses: false }],
    ["primary_only", { authorizedPaidQueries: 1, payMissingExtraLenses: false, recollectStaleLenses: false }],
    ["recollect", { authorizedPaidQueries: 3, payMissingExtraLenses: true, recollectStaleLenses: true }],
  ]);
  // A SERP por keyword não sabe validar sem as extras: a saída não aparece.
  assert.deepEqual(serpPaidPlanOptions(plan, { allowPrimaryOnly: false }).map(opcao => opcao.id), ["all", "recollect"]);
  // A recoleta pedida paga exatamente o que a saída prometeu.
  assert.equal(buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: true }).paidQueries, 3);
  // Nada a pagar: "Validar sem pagar", com zero autorizado.
  const vazio = serpPaidPlanOptions(buildSerpPaidPlan({ lenses: LENTES, slots: [vaga("p:win", CANONICA, acerto())], payMissingExtraLenses: true, recollectStaleLenses: false }));
  assert.deepEqual(vazio.map(opcao => [opcao.label, opcao.choice.authorizedPaidQueries]), [["Validar sem pagar", 0]]);

  const texto = describeSerpPaidPlan(plan);
  assert.match(texto.headline, /Até 2 chamada\(s\) paga\(s\): 1 na lente principal e 1 nas lentes extras/);
  assert.match(texto.cost || "", /estimado/);
  assert.match(texto.dates || "", /19 dias/);
});

test("A6 · os lotes da SERP por keyword somam num plano só", () => {
  const um = buildSerpPaidPlan({ lenses: LENTES, slots: [vaga("a:win", CANONICA), vaga("a:mac", MACOS, acerto())], payMissingExtraLenses: true, recollectStaleLenses: false });
  const dois = buildSerpPaidPlan({ lenses: LENTES, slots: [vaga("b:win", CANONICA, acerto()), vaga("b:mac", MACOS), vaga("b:ios", IOS)], payMissingExtraLenses: true, recollectStaleLenses: false });
  const soma = mergeSerpPaidPlans([um, dois]);
  assert.equal(soma.paidQueries, um.paidQueries + dois.paidQueries);
  assert.equal(soma.primaryPaidQueries, 1);
  assert.equal(soma.extraPaidQueries, 2);
  assert.equal(soma.perLens.find(linha => linha.lens === "desktop-macos")?.hits, 1);
  assert.equal(soma.estimatedCostUsd.max, Math.round((um.estimatedCostUsd.max + dois.estimatedCostUsd.max) * 10000) / 10000);
  assert.throws(() => mergeSerpPaidPlans([]));
});

/* ============== A8 · portão de datas: marca, nunca recoleta sozinho ============== */

test("A8 · lentes da mesma consulta com mais de 7 dias de diferença são marcadas; a recoleta é só pedida", () => {
  assert.equal(SERP_LENS_DATES_DIVERGE_DAYS, 7);
  assert.equal(collectedAtSpreadDays(["2026-09-12T00:00:00.000Z", "2026-09-20T00:00:00.000Z"]), 8);
  assert.equal(collectedAtSpreadDays(["2026-09-20T00:00:00+00:00"]), 0);
  assert.equal(collectedAtSpreadDays(["ilegível", "2026-09-20T00:00:00.000Z"]), 0);
  // Só a mais antiga que 7 dias da mais nova é "antiga".
  assert.deepEqual(staleByDateIndexes(["2026-09-12T00:00:00.000Z", "2026-09-19T00:00:00.000Z", "2026-09-20T00:00:00.000Z"]), [0]);
  assert.deepEqual(staleByDateIndexes(["2026-09-13T00:00:00.000Z", "2026-09-20T00:00:00.000Z"]), [], "7 dias exatos não marcam");

  const slots = [
    vaga("p:win", CANONICA, acerto("2026-09-20T00:00:00.000Z")),
    vaga("p:mac", MACOS, acerto("2026-09-12T00:00:00+00:00")),
    vaga("p:and", ANDROID, acerto("2026-09-19T00:00:00.000Z")),
    // Outra consulta, datas próximas entre si: não conta.
    vaga("q:win", CANONICA, acerto("2026-09-01T00:00:00.000Z")),
  ];
  assert.deepEqual([...staleSlotKeys(slots)], ["p:mac"]);
  const sem = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: false });
  assert.equal(sem.datesDiverge, true);
  assert.equal(sem.collectedAtSpreadDays, 8);
  assert.equal(sem.recollectableQueries, 1);
  assert.equal(sem.paidQueries, 0, "marcar não dispara chamada nenhuma");
  const pedida = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: true });
  assert.equal(pedida.paidQueries, 1, "a recoleta pedida paga só a lente antiga");
  // Sem pagar extras, a extra antiga não é trocada.
  assert.equal(buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: false, recollectStaleLenses: true }).paidQueries, 0);

  // O marcador diz as datas na tela.
  const marcador = SerpLensesMarkerSchema.parse({
    requested: ["desktop-windows", "desktop-macos"], observed: ["desktop-windows", "desktop-macos"], missing: [], perLens: [],
    agreement: "2/2", collectedAtSpreadDays: 8, datesDiverge: true,
  });
  assert.equal(describeSerpLensesMarker(marcador), "SERP · 2 lentes · concordância 2/2 · lentes de datas diferentes (8 dias)");
  assert.equal(describeSerpLensesMarker({ ...marcador, observed: ["desktop-windows"], agreement: "1/1", datesDiverge: false }), "SERP · 1 de 2 lentes");
  assert.equal(describeSerpLensesMarker(null), null, "parecer legado: nada aparece");
});

/* ============== A8 · os mesmos códigos de local e idioma do Minerador ============== */

const AMBIENTE_PT_BR = { locationCode: 2076, languageCode: "pt-br" };

/** A chave que a CALL 3 do Minerador grava: os códigos do targeting do alvo, canônica, advanced. */
const chaveDoMinerador = (keyword: string, codigos: { locationCode: number; languageCode: string }) =>
  serpCacheSubjectId({ keyword, ...codigos, lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" });

test("A8 · keyword do acervo usa o resolvedor do Minerador e cai na MESMA chave que ele grava", () => {
  // Sem targeting gravado, o Minerador consulta o Brasil em `pt` — seja qual for o idioma do ambiente.
  assert.deepEqual(mineradorSerpTargetCodes(null, AMBIENTE_PT_BR), { locationCode: 2076, languageCode: "pt" });
  // O registro que a medição grava (`allintitle_measurement.targeting`).
  assert.deepEqual(mineradorSerpTargetCodes({ provider: "dataforseo", languageCode: "pt", locationCode: 2076, sourceGeoTargetConstants: ["geoTargetConstants/2076"] }, AMBIENTE_PT_BR), { locationCode: 2076, languageCode: "pt" });
  // Targeting de candidata (Google Ads): o mesmo resolvedor traduz o idioma.
  assert.deepEqual(mineradorSerpTargetCodes({ language: "languageConstants/1000", geoTargetConstants: ["geoTargetConstants/2076"] }, AMBIENTE_PT_BR), { locationCode: 2076, languageCode: "en" });
  // Fora do Brasil o Minerador recusa: não há entrada dele a reaproveitar.
  assert.equal(mineradorSerpTargetCodes({ geoTargetConstants: ["geoTargetConstants/2840"] }, AMBIENTE_PT_BR), null);
  assert.equal(mineradorSerpTargetCodes(null, { locationCode: 2840, languageCode: "en" }), null);

  // O defeito: com o ambiente em `pt-br`, a chave do Arquiteto não era a do Minerador.
  const codigos = mineradorSerpTargetCodes(null, AMBIENTE_PT_BR)!;
  const agora = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, lens: SERP_CACHE_CANONICAL_LENS, codes: codigos });
  const antes = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, lens: SERP_CACHE_CANONICAL_LENS, codes: AMBIENTE_PT_BR });
  assert.equal(serpCacheSubjectId(agora.query), chaveDoMinerador("skincare facial", { locationCode: 2076, languageCode: "pt" }));
  assert.notEqual(serpCacheSubjectId(antes.query), chaveDoMinerador("skincare facial", { locationCode: 2076, languageCode: "pt" }));

  // Texto sem keyword do acervo (território) continua com os códigos do ambiente.
  const mapa = new Map([["kw-1", codigos]]);
  assert.deepEqual(serpTargetCodesFor(mapa, "kw-1", AMBIENTE_PT_BR), codigos);
  assert.deepEqual(serpTargetCodesFor(mapa, null, AMBIENTE_PT_BR), AMBIENTE_PT_BR);
  assert.deepEqual(serpTargetCodesFor(mapa, "kw-de-outra-marca", AMBIENTE_PT_BR), AMBIENTE_PT_BR);
});

/** Um cliente com a forma do `postgrest-js` que só devolve linhas da marca filtrada. */
function clienteDoMinerador(linhas: Array<{ id: string; brand_id: string; deleted_at: string | null; targeting: unknown }>, opcoes: { falhar?: boolean } = {}) {
  const consultas: Array<{ tabela: string; colunas: string; eq: Record<string, unknown>; is: Record<string, unknown>; ids: string[] }> = [];
  const client = {
    from(tabela: string) {
      const consulta = { tabela, colunas: "", eq: {} as Record<string, unknown>, is: {} as Record<string, unknown>, ids: [] as string[] };
      consultas.push(consulta);
      const construtor = {
        select(colunas: string) { consulta.colunas = colunas; return construtor; },
        eq(coluna: string, valor: unknown) { consulta.eq[coluna] = valor; return construtor; },
        is(coluna: string, valor: unknown) { consulta.is[coluna] = valor; return construtor; },
        in(_coluna: string, ids: string[]) {
          consulta.ids = ids;
          if (opcoes.falhar) return Promise.resolve({ data: null, error: { message: "falhou" } });
          const data = linhas
            .filter(linha => linha.brand_id === consulta.eq.brand_id && linha.deleted_at === null && ids.includes(linha.id))
            .map(linha => ({ id: linha.id, targeting: linha.targeting }));
          return Promise.resolve({ data, error: null });
        },
      };
      return construtor;
    },
  };
  return { client: client as never, consultas };
}

const KW_A = "11111111-1111-4111-8111-111111111111";
const KW_B = "22222222-2222-4222-8222-222222222222";
const KW_OUTRA = "33333333-3333-4333-8333-333333333333";

test("A8 · o targeting é lido no servidor, da marca ativa, em coluna estreita — nunca de outra marca", async () => {
  const { client, consultas } = clienteDoMinerador([
    { id: KW_A, brand_id: "marca-a", deleted_at: null, targeting: { languageCode: "pt", sourceGeoTargetConstants: ["geoTargetConstants/2076"] } },
    { id: KW_B, brand_id: "marca-a", deleted_at: null, targeting: null },
    { id: KW_OUTRA, brand_id: "marca-b", deleted_at: null, targeting: { language: "languageConstants/1000" } },
  ]);
  const lido = await readMineradorKeywordTargetCodes(client, "marca-a", [KW_A, KW_B, KW_OUTRA, "territory:t1", KW_A], AMBIENTE_PT_BR);
  assert.equal(lido.readFailed, false);
  assert.deepEqual([...lido.codes.keys()].sort(), [KW_A, KW_B]);
  assert.deepEqual(lido.codes.get(KW_B), { locationCode: 2076, languageCode: "pt" }, "sem targeting: o que o Minerador usaria");
  assert.equal(lido.codes.has(KW_OUTRA), false, "o targeting de outra marca não é lido");
  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].tabela, "minerador_keywords");
  assert.equal(consultas[0].colunas, MINERADOR_TARGETING_COLUMNS);
  assert.doesNotMatch(consultas[0].colunas, /\*|analise_semantica(,|$)/, "nunca a análise inteira");
  assert.deepEqual(consultas[0].eq, { brand_id: "marca-a" });
  assert.deepEqual(consultas[0].is, { deleted_at: null });
  assert.deepEqual(consultas[0].ids, [KW_A, KW_B, KW_OUTRA], "pseudo-id de território e repetição ficam fora");
  assert.equal(isAcervoKeywordId("territory:t1"), false);

  // Falha de leitura não derruba: tudo segue com os códigos do ambiente.
  const falho = await readMineradorKeywordTargetCodes(clienteDoMinerador([], { falhar: true }).client, "marca-a", [KW_A], AMBIENTE_PT_BR);
  assert.deepEqual(falho, { codes: new Map(), readFailed: true });
  // Sem id do acervo, nenhuma consulta.
  const vazio = clienteDoMinerador([]);
  await readMineradorKeywordTargetCodes(vazio.client, "marca-a", ["territory:t1"], AMBIENTE_PT_BR);
  assert.equal(vazio.consultas.length, 0);
});

/* ============== A3/A6/A8 · a rota de formação, pela ordem do código ============== */

test("A6 · modo plan: devolve o plano ANTES de credencial, quota, corpo e qualquer pagamento", () => {
  const plano = rota.indexOf('if (parsed.data.mode === "plan") {');
  assert.ok(plano > -1);
  for (const depois of ["await resolveDataForSeoCompatibilityConfig(", "await quota.ensureCovered()", '{ mode: "body", now }', "await collectAndCacheSerp(", '{ mode: "digest", now }']) {
    const posicao = rota.indexOf(depois);
    assert.ok(posicao > plano, `${depois} precisa vir depois do retorno do plano`);
  }
  const retorno = trecho(rota, 'if (parsed.data.mode === "plan") {', "const authorization = ");
  assert.match(retorno, /return NextResponse\.json\(\{ success: true, data: \{ mode: "plan", plan,/);
  // O plano lê só `meta`, das quatro lentes.
  const leitura = trecho(rota, "let metaLookups: SerpCacheLookup[];", "const slots: SerpPlanSlot[] = [];");
  assert.match(leitura, /\{ mode: "meta", now \}\)[\s\S]*extraSlotsWanted\.map\(item => cacheRequestFor\(item\.keyword, undefined, item\.extraLens\)\), \{ mode: "meta", now \}/);
});

test("A6 · execução: autorização antes de pagar, orçamento em TODO caminho pago, 409 sem pagar", () => {
  const autorizar = rota.indexOf("const authorization = authorizeSerpPaidPlan(plan, parsed.data.authorizedPaidQueries);");
  assert.ok(autorizar > -1);
  assert.ok(autorizar < rota.indexOf("await quota.ensureCovered()"), "a autorização vem antes da quota");
  assert.ok(autorizar < rota.indexOf("await collectAndCacheSerp("), "e antes de qualquer pagamento");
  assert.match(rota, /if \(!authorization\.ok\) \{[\s\S]*?status: 409 \}\);/);
  // Mudou em 2026-09-23 (correção da A2): o orçamento reserva as faltas do plano, e cada caminho pago toma a vaga pela sua chave.
  assert.match(rota, /const budget = createPaidQueryBudget\(parsed\.data\.authorizedPaidQueries, serpPaidPlanKeys\(planInput\)\);/);
  // Cada caminho pago consome o orçamento ANTES do provider.
  for (const [inicio, fim] of [["const payKeywordSerp = ", "const serveFromCache = "], ["const collectExtraLens = ", "const payExtraLensDigest = "]] as const) {
    const pago = trecho(rota, inicio, fim);
    const orcamento = pago.indexOf("if (!budget.take(");
    assert.ok(orcamento > -1 && orcamento < pago.indexOf("await collectAndCacheSerp("), `${inicio}: o orçamento vem antes do provider`);
  }
  assert.equal(rota.match(/await collectAndCacheSerp\(/g)?.length, 2, "só os dois caminhos pagos chamam o provider");
  // O teto da quota é o plano autorizado.
  assert.match(rota, /const potentialMisses = plan\.paidQueries;/);
});

test("A3 · as extras são lidas pelo digest (nunca o corpo), só onde há par, e pagas SEM corpo", () => {
  const extras = trecho(rota, "const readExtraLenses = ", "const extraLensesByArticle = ");
  assert.match(extras, /lookupSerpCache\(pipelineContext, pedidos\.map\(item => item\.request\), \{ mode: "digest", now \}\)/);
  assert.doesNotMatch(extras, /mode: "body"/);
  // Entrada gravada antes do digest não é paga de novo sem pedido.
  assert.match(extras, /reason: "sem digest"/);
  // A escolha "só com o cache" é respeitada.
  assert.match(extras, /else if \(!parsed\.data\.payMissingExtraLenses\) \{/);
  // Mudou em 2026-09-23 (correção da A2): a coleta paga é compartilhada; cada artigo normaliza o digest com a sua identidade.
  const pagarExtra = trecho(rota, "const collectExtraLens = ", "const payExtraLensDigest = ");
  assert.match(pagarExtra, /storeBody: architectSerpStoresBody\(input\.extraLens\),/);
  assert.match(trecho(rota, "const payExtraLensDigest = ", "const readExtraLenses = "), /normalizeOrganicDigestSerp\(collected\.digest, input\.serpInput, collected\)/);
  // Só com pelo menos duas buscas observadas: uma busca só não tem par a votar.
  assert.match(rota, /if \(requested\.extras\.length && snapshots\.length >= 2\) \{/);
  assert.match(rota, /if \(group\.keywords\.length < 2\) return \[\];/);
});

test("A3/A5 · pedido legado grava o parecer de antes; pedido com lentes grava o voto agregado e o marcador", () => {
  assert.match(rota, /if \(requested\.legacy\) \{\n\s+interpretation = interpretArticleSerp\(\{/);
  assert.match(rota, /const across = interpretArticleSerpAcrossLenses\(\{/);
  assert.match(rota, /lensesMarker = formationLensesMarkerOf\(\{/);
  assert.match(rota, /\.\.\.\(lensesMarker \? \{ lenses: lensesMarker \} : \{\}\),/);
  // A lente principal continua gerando os snapshots do parecer e do ArticleDNA.
  assert.match(rota, /const lens = requested\.primary;/);
});

test("A8 · a rota lê os códigos do Minerador no servidor, pela marca do contexto, antes do cache", () => {
  const leitura = rota.indexOf("await readMineradorKeywordTargetCodes(pipelineContext.supabase, pipelineContext.brandId,");
  assert.ok(leitura > -1);
  assert.ok(leitura < rota.indexOf("await lookupSerpCache("), "a chave precisa dos códigos antes da leitura");
  assert.match(rota, /const codesFor = \(keywordId: string\) => serpTargetCodesFor\(targeting\.codes, keywordId, targetCodes\);/);
  // Na falta, a keyword com os códigos do Minerador os envia; as outras, os da config.
  const pagar = trecho(rota, "const payKeywordSerp = ", "const serveFromCache = ");
  assert.match(pagar, /usesEnvironmentCodes\(input\.keywordId\) \? \{\n\s+locationCode: resolution\.config\.locationCode, languageCode: resolution\.config\.languageCode,\n\s+\} : codesFor\(input\.keywordId\)/);
  // O targeting nunca vem do cliente.
  assert.doesNotMatch(rota, /parsed\.data\.[a-zA-Z]+\.targeting|keyword\.targeting/);
});

/* ============ A6 · a mesa: nenhuma SERP paga no clique ============ */

const mesa = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
const dialogo = semComentarios("../modules/arquiteto/serp-paid-plan-dialog.tsx");

test("A6 · 'Validar SERP': as quatro lentes, o plano primeiro, e só a escolha libera a execução", () => {
  const corpo = trecho(mesa, "const confirmSerpValidation = async", "const handleSerpRecommendationDecision");
  assert.match(corpo, /lenses: \[\.\.\.SERP_LENS_LABELS\]/);
  assert.doesNotMatch(corpo, /device: "desktop"/, "a tela não pede mais uma lente só");
  const plano = corpo.indexOf('{ ...serpRequest, mode: "plan" }');
  const escolha = corpo.indexOf("await askSerpPaidPlan(");
  const execucao = corpo.indexOf('{ ...serpRequest, mode: "execute", ...choice }');
  assert.ok(plano > -1 && escolha > plano && execucao > escolha, "plano → escolha → execução");
  // Cancelar não paga e não marca nenhum artigo como em processamento.
  const cancelar = corpo.slice(escolha, execucao);
  assert.match(cancelar, /if \(!choice\) \{[\s\S]*?nenhuma chamada foi paga[\s\S]*?return "cancelled";/);
  // Quem chamou (o processamento da formação) não conta como coletado o que foi cancelado.
  assert.match(mesa, /const resultadoDaSerp = await confirmSerpValidation\(pendentes\);/);
  assert.match(mesa, /const coletadosAgora = resultadoDaSerp === "cancelled" \? new Set<string>\(\) : new Set\(resumoSerp\.needsCollection\);/);
  assert.ok(cancelar.indexOf('status: "processing"') > cancelar.indexOf("if (!choice)"), "o estado de processamento só depois da escolha");
});

test("A6 · 'Validar SERP dos silos': as quatro lentes e o plano antes do pagamento", () => {
  const corpo = trecho(mesa, "const validateTerritorialSerp = async", "const validateTerritorialSerpRef = ");
  assert.match(corpo, /lenses: \[\.\.\.SERP_LENS_LABELS\]/);
  const plano = corpo.indexOf('await pedir({ mode: "plan" })');
  const escolha = corpo.indexOf("await askSerpPaidPlan(");
  const execucao = corpo.indexOf('await pedir({ mode: "execute", ...escolha })');
  assert.ok(plano > -1 && escolha > plano && execucao > escolha);
  assert.match(corpo, /if \(!escolha\) \{[\s\S]*?nenhuma chamada foi paga[\s\S]*?return;/);
});

test("A6 · a prévia: tudo em cache segue sem perguntar; cancelar resolve sem pagar", () => {
  const perguntar = trecho(mesa, "const askSerpPaidPlan = useCallback(", "}, []);");
  assert.match(perguntar, /if \(plan\.paidQueries === 0 && plan\.recollectableQueries === 0\) \{\n\s+return Promise\.resolve\(\{ authorizedPaidQueries: 0,/);
  assert.match(mesa, /onCancel=\{\(\) => \{ serpPaidPlanPrompt\.resolve\(null\); setSerpPaidPlanPrompt\(null\); \}\}/);
  assert.match(mesa, /onChoose=\{choice => \{ serpPaidPlanPrompt\.resolve\(choice\); setSerpPaidPlanPrompt\(null\); \}\}/);
  // A prévia usa os botões compartilhados da mesa e o vocabulário de SERP, sem provider.
  assert.match(mesa, /buttonClassName=\{ARCHITECT_UI\.toolbarButton\}/);
  assert.match(mesa, /primaryButtonClassName=\{ARCHITECT_UI\.primaryButton\}/);
  assert.match(dialogo, /role="dialog" aria-modal="true"/);
  assert.match(dialogo, /serpPaidPlanOptions\(plan, \{ allowPrimaryOnly \}\)/);
  assert.match(dialogo, /Nada é pago antes da sua escolha/);
  assert.doesNotMatch(dialogo, /dataforseo|DataForSeo|crédito|token/i);
  // Sistema visual: nenhum hex, nenhum texto abaixo do piso.
  assert.doesNotMatch(dialogo, /#[0-9a-fA-F]{3,8}\b|text-\[(?:[0-9]|1[01])px\]/);
});

test("A5 · os pareceres mostram as lentes; o parecer legado não mostra nada", () => {
  const revisao = semComentarios("../modules/arquiteto/article-formation-review.tsx");
  assert.match(revisao, /\{serp\.parecer\.lenses && \(/);
  assert.match(revisao, /data-testid="architect-review-serp-lenses"/);
  assert.match(mesa, /lenses: "lenses" in remoto \? describeSerpLensesMarker\(remoto\.lenses\) : null/);
  const territorial = semComentarios("../modules/arquiteto/territorial-review-panel.tsx");
  assert.match(territorial, /\{view\.serp\.assessment\.lenses && \(/);
  assert.match(territorial, /describeSerpLensesMarker\(view\.serp\.assessment\.lenses\)/);
});

/* ============== correções da A2 (2026-09-23): plano e orçamento ============== */

test("correção A2 · rota que não recolhe: o plano MARCA as lentes antigas e NÃO oferece recoleta paga", () => {
  // A "Consultar nas 4 lentes": tudo em cache, a macOS 9 dias mais velha.
  const slots = [
    vaga("k:win", CANONICA, acerto("2026-09-20T00:00:00.000Z")), vaga("k:mac", MACOS, acerto("2026-09-11T00:00:00.000Z")),
    vaga("k:and", ANDROID, acerto("2026-09-20T00:00:00.000Z")), vaga("k:ios", IOS, acerto("2026-09-20T00:00:00.000Z")),
  ];
  // O defeito, fixado: com a recoleta disponível (o padrão), a prévia oferecia "Recoletar… (pago, 1)".
  const antes = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: false });
  assert.equal(antes.recollectableQueries, 1);
  assert.ok(serpPaidPlanOptions(antes, { allowPrimaryOnly: false }).some(opcao => opcao.id === "recollect"));

  const plan = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: false, recollectAvailable: false });
  assert.equal(plan.paidQueries, 0);
  assert.equal(plan.recollectableQueries, 0);
  assert.equal(plan.datesDiverge, true, "a diferença continua marcada");
  assert.equal(plan.perLens.find(linha => linha.lens === "desktop-macos")?.staleByDate, 1);
  assert.deepEqual(serpPaidPlanOptions(plan, { allowPrimaryOnly: false }).map(opcao => opcao.id), ["all"]);
  // Nada a pagar nem a recoletar: a mesa segue sem abrir a prévia.
  assert.ok(plan.paidQueries === 0 && plan.recollectableQueries === 0);
  const texto = describeSerpPaidPlan(plan);
  assert.match(texto.dates || "", /Esta ação não recoleta lentes antigas; a diferença fica marcada/);
  assert.doesNotMatch(texto.dates || "", /podem ser recoletadas/);
  // Mesmo pedida, a recoleta não entra no plano de uma rota que não a sabe fazer.
  assert.equal(buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: true, recollectAvailable: false }).paidQueries, 0);
});

test("correção A2 · a mesma consulta extra em dois artigos: paga uma vez, e só é condicional se TODOS a pedirem com condição", () => {
  const slots = [
    vaga("extra:mac", MACOS, { conditional: true }),
    vaga("extra:mac", MACOS, { conditional: false }),
    vaga("extra:and", ANDROID, { conditional: true }),
    vaga("extra:and", ANDROID, { conditional: true }),
  ];
  const plan = buildSerpPaidPlan({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: false });
  assert.equal(plan.paidQueries, 2);
  assert.equal(plan.conditionalPaidQueries, 1, "a macOS é pedida sem condição por um dos artigos");
  assert.equal(plan.perLens.find(linha => linha.lens === "desktop-macos")?.conditionalMisses, 0);
  assert.equal(plan.perLens.find(linha => linha.lens === "mobile-android")?.conditionalMisses, 1);
  assert.deepEqual([...serpPaidPlanKeys({ lenses: LENTES, slots, payMissingExtraLenses: true, recollectStaleLenses: false })].sort(), ["extra:and", "extra:mac"]);
});

test("correção A2 · o orçamento reserva as faltas PLANEJADAS: a degradação de um artigo não tira a vaga de outro", () => {
  // O defeito, fixado: sem reserva, quem chega primeiro leva a vaga.
  const semReserva = createPaidQueryBudget(1);
  assert.equal(semReserva.take("degradado"), true);
  assert.equal(semReserva.take("planejada"), false);

  const orcamento = createPaidQueryBudget(1, new Set(["planejada"]));
  assert.equal(orcamento.take("degradado"), false, "fora do plano, só com sobra");
  assert.equal(orcamento.take("planejada"), true);
  assert.equal(orcamento.take("planejada"), false, "a vaga é uma só");

  // Com sobra (autorizado acima do plano), a degradação usa a sobra e a planejada continua garantida.
  const comSobra = createPaidQueryBudget(2, new Set(["planejada"]));
  assert.equal(comSobra.take("degradado"), true);
  assert.equal(comSobra.take("outro-degradado"), false);
  assert.equal(comSobra.take("planejada"), true);
  assert.equal(comSobra.used, 2);
  // Nunca além do autorizado, nem para chave planejada.
  assert.equal(createPaidQueryBudget(0, new Set(["planejada"])).take("planejada"), false);
});

test("correção A2 · a rota de formação reserva o plano e paga cada consulta extra uma vez por requisição", () => {
  assert.match(rota, /const budget = createPaidQueryBudget\(parsed\.data\.authorizedPaidQueries, serpPaidPlanKeys\(planInput\)\);/);
  assert.match(trecho(rota, "const payKeywordSerp = ", "const serveFromCache = "), /if \(!budget\.take\(payKeyOf\(input\.articleId, input\.keywordId, lens\)\)\) \{/);
  assert.match(rota, /payKey: extraPayKeyOf\(serpCacheSubjectId\(cacheRequestFor\(item\.keyword, undefined, item\.extraLens\)\.query\)\)/);
  const extra = trecho(rota, "const extraCollections = ", "const readExtraLenses = ");
  assert.match(extra, /if \(!budget\.take\(input\.payKey\)\)/);
  assert.match(extra, /let collection = extraCollections\.get\(input\.payKey\);/);
  assert.match(extra, /extraCollections\.set\(input\.payKey, collection\);/);
});
