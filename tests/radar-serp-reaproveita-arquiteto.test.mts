import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  sameSerpCacheLens,
  serpCacheLensLabel,
  serpCacheSubjectId,
  trimSerpBodyToDepth,
} from "../lib/editorial/serp-cache.ts";
import { buildDataForSeoSerpConfig, readDataForSeoTargetCodes, type DataForSeoSerpConfig } from "../lib/minerador/dataforseo-serp-core.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import {
  architectSerpCollectionRequest,
  architectSerpStoresBody,
  formationSerpCacheRequest,
} from "../lib/arquiteto/dataforseo-serp-compatibility.ts";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor, type SerpTargetCodes } from "../lib/arquiteto/serp-lens-targeting.ts";
import { collectAndCacheSerp, type SerpCacheRequest } from "../lib/server/serp-cache.ts";
import type { SerpCacheContext } from "../lib/server/serp-cache-store.ts";
import {
  collectRadarSerpLensSnapshot,
  readRadarKeywordTargetCodes,
  type RadarSerpLensCollectionInput,
  type RadarSerpLensDeps,
} from "../lib/server/radar-serp-lenses.ts";
import { RadarAnalysisPayloadSchema, VersionedRadarAnalysisSchema, createRadarAnalysisSuccessor } from "../lib/radar/analysis-contracts.ts";
import { buildRadarYoutubeRunFingerprint, buildRadarYoutubeStartedRun } from "../lib/radar/youtube-search-run.ts";

/**
 * SDD "SERP no artigo e KGR opcional" (2026-09-28), fatia R1 do Radar, e o
 * item 5 da decisão do dono:
 *
 *   "Radar: a busca no Google reaproveita a mesma coleta do Arquiteto (mesmo
 *    cache). YouTube e Amazon só ACRESCENTAM dados; nunca substituem nem
 *    apagam os dados de busca no Google."
 *
 * O reaproveitamento já funcionava pela CHAVE do cache (keyword normalizada ×
 * localidade × idioma × lente × `advanced`), e `collectedBy` não é filtro.
 * Este arquivo PROVA que a chave do Arquiteto e a do Radar são a mesma — sem
 * targeting do Minerador (a SERP deixou de ser obrigatória lá), com targeting,
 * com outra grafia da keyword e com a config diferente do ambiente — e que o
 * Radar lê a coleta do Arquiteto sem pagar nada.
 *
 * O núcleo roda de verdade (store do cache, normalizador, observação) contra
 * um banco em memória com a forma do `postgrest-js` e um `fetch` FALSO no
 * lugar da DataForSEO. Nenhuma chamada paga, nenhum banco remoto, nenhuma rede.
 */

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const CONFIG: DataForSeoSerpConfig = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };
const MARCA = "5f0c9a1e-3b2d-4c8e-9a7f-1d2e3f4a5b6c";
const KW = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const AMBIENTE: SerpTargetCodes = { locationCode: 2076, languageCode: "pt" };
const T_ARQUITETO = new Date("2026-09-28T09:00:00.000Z");
const T_RADAR = new Date("2026-10-10T10:00:00.000Z");

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

/* ------------------------------ banco em memória ----------------------------- */

type Linha = Record<string, unknown> & { id: string; lock_version: number };
type Filtro = { coluna: string; tipo: "eq" | "in" | "is"; valor: unknown };
type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

class Consulta {
  op: "select" | "insert" | "update" = "select";
  colunas = "";
  filtros: Filtro[] = [];
  valores: Record<string, unknown> | null = null;
  unica = false;
  readonly banco: Banco;
  readonly tabela: string;
  constructor(banco: Banco, tabela: string) {
    this.banco = banco;
    this.tabela = tabela;
  }
  select(colunas = "*") { if (this.op === "select" || !this.colunas) this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "eq", valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, tipo: "in", valor }); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "is", valor }); return this; }
  insert(valores: Record<string, unknown>) { this.op = "insert"; this.valores = valores; return this; }
  update(valores: Record<string, unknown>) { this.op = "update"; this.valores = valores; return this; }
  maybeSingle() { this.unica = true; return this; }
  then<A, B = never>(resolve: (valor: Resposta) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
}

function projetar(linha: Linha, colunas: string) {
  if (!colunas || colunas === "*") return structuredClone(linha);
  return Object.fromEntries(colunas.split(",").map(item => {
    const [apelido, caminho] = item.includes(":") ? item.split(":") : [item, item];
    let valor: unknown = linha;
    for (const parte of caminho.split(/->>?/)) valor = valor && typeof valor === "object" ? (valor as Record<string, unknown>)[parte] : undefined;
    if (caminho.includes("->>") && valor !== undefined && valor !== null) valor = String(valor);
    return [apelido, structuredClone(valor ?? null)];
  }));
}

class Banco {
  tabelas: Record<string, Linha[]> = { editorial_workflow_items: [], minerador_keywords: [] };
  private proximo = 1;
  from(tabela: string) { return new Consulta(this, tabela); }
  private casa(linha: Linha, filtros: Filtro[]) {
    return filtros.every(({ coluna, tipo, valor }) => {
      if (tipo === "eq") return linha[coluna] === valor;
      if (tipo === "is") return (linha[coluna] ?? null) === valor;
      return (valor as unknown[]).includes(linha[coluna]);
    });
  }
  executar(consulta: Consulta): Resposta {
    const linhas = this.tabelas[consulta.tabela] || (this.tabelas[consulta.tabela] = []);
    if (consulta.op === "insert") {
      const valores = consulta.valores!;
      const duplicada = linhas.some(linha => ["marca_id", "subject_type", "subject_id", "stage"].every(chave => linha[chave] === valores[chave]));
      if (duplicada) return { data: null, error: { code: "23505", message: "duplicate key" } };
      const linha: Linha = { ...structuredClone(valores), id: `linha-${this.proximo++}`, lock_version: 1 };
      linhas.push(linha);
      return { data: projetar(linha, consulta.colunas), error: null };
    }
    const alvo = linhas.filter(linha => this.casa(linha, consulta.filtros));
    if (consulta.op === "update") {
      for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: linha.lock_version + 1 });
    }
    const projetadas = alvo.map(linha => projetar(linha, consulta.colunas));
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
  entradas() { return this.tabelas.editorial_workflow_items; }
}

const contexto = (banco: Banco): SerpCacheContext => ({ supabase: banco as unknown as SerpCacheContext["supabase"], brandId: MARCA, actorUserId: "ator-1" });
const cliente = (banco: Banco) => banco as unknown as SerpCacheContext["supabase"];

/* --------------------------------- provider --------------------------------- */

type Registro = Record<string, unknown>;

function provedor() {
  const pedidos: Registro[] = [];
  let sequencia = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const pedido = (JSON.parse(String(init?.body)) as Registro[])[0];
    pedidos.push(pedido);
    sequencia += 1;
    const corpo = structuredClone(CRU) as { tasks: Array<Registro & { id: string; data: Registro }> };
    corpo.tasks[0].id = `tarefa-${pedido.device}-${pedido.os}-${sequencia}`;
    corpo.tasks[0].data = { ...corpo.tasks[0].data, device: pedido.device, os: pedido.os, depth: pedido.depth, tag: pedido.tag };
    const resposta = Number(pedido.depth) < 20 ? trimSerpBodyToDepth(corpo, Number(pedido.depth)) : corpo;
    return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, pedidos };
}

/* ------------------------- o Arquiteto, como a rota paga ------------------------- */

/**
 * O pedido da rota `keyword-serp` do Arquiteto (a coleta do lote e a SERP por
 * keyword): `advanced`, a profundidade pedida, o id do acervo — e, numa falta,
 * `architectSerpCollectionRequest` (canônica em 20) com o corpo só na canônica.
 */
const pedidoDoArquiteto = (keyword: string, codigos: SerpTargetCodes, lens: (typeof SERP_CACHE_LENSES)[number]): SerpCacheRequest => ({
  query: { keyword, ...codigos, lens, endpoint: "advanced" },
  depth: 10,
  keywordId: KW,
});

async function codigosDoArquiteto(banco: Banco, ambiente = AMBIENTE) {
  const lidos = await readMineradorKeywordTargetCodes(cliente(banco), MARCA, [KW], ambiente);
  return serpTargetCodesFor(lidos.codes, KW, ambiente);
}

async function arquitetoColetaAsQuatroLentes(banco: Banco, keyword: string, codigos: SerpTargetCodes, fetchImpl = provedor().fetchImpl) {
  for (const lens of SERP_CACHE_LENSES) {
    const coleta = await collectAndCacheSerp(contexto(banco), architectSerpCollectionRequest(pedidoDoArquiteto(keyword, codigos, lens)), {
      config: CONFIG, operationRequestId: "op-arquiteto", collectedBy: "arquiteto", now: T_ARQUITETO,
      storeBody: architectSerpStoresBody(lens), provider: { fetchImpl },
    });
    assert.equal(coleta.writeError, null);
  }
}

/* --------------------------------- o Radar --------------------------------- */

type Uso = Parameters<RadarSerpLensDeps["recordUsage"]>[0];
const RECURSO = { allowed: true, actorUserId: "ator-1", agencyId: null, brandId: MARCA, resourceKey: null, capability: null } as unknown as Uso["resource"];

function dependencias(fetchImpl: typeof fetch, config: DataForSeoSerpConfig = CONFIG) {
  const cotas: number[] = [];
  const usos: Uso[] = [];
  const deps: RadarSerpLensDeps = {
    resolveConfig: async quotaUnits => { cotas.push(quotaUnits); return { config, resource: RECURSO }; },
    recordUsage: async entrada => { usos.push(entrada); return null; },
    fetchImpl,
  };
  return { deps, cotas, usos };
}

const BUSCA: SerpSearchInput = {
  brandId: MARCA, articleId: "artigo-skincare", articleDnaVersionId: "dna-v1", keywordId: KW, keywordDnaVersionId: "kwdna-v1",
  keyword: "skincare facial", location: "Brasil", language: "pt-BR", device: "desktop", operatingSystem: null,
  expectedIntent: "", expectedFormat: "pilar", requiredTopics: [], articleEntities: [], resultLimit: 10, version: 1, previousSnapshotId: null,
};

async function radarAtualizaSerp(banco: Banco, deps: RadarSerpLensDeps, ambiente = AMBIENTE, extra: Partial<RadarSerpLensCollectionInput> = {}) {
  const alvo = await readRadarKeywordTargetCodes(cliente(banco), MARCA, KW, ambiente);
  return {
    alvo,
    coleta: await collectRadarSerpLensSnapshot({
      context: contexto(banco), searchInput: BUSCA, codes: alvo.codes, codesSource: alvo.source, cacheKeywordId: alvo.cacheKeywordId,
      previous: null, recollect: false, now: T_RADAR, operationRequestId: "op-radar", ...extra,
    }, deps),
  };
}

/** A chave do Radar para cada lente, montada como o núcleo dele monta. */
const chaveDoRadar = (keyword: string, codigos: SerpTargetCodes, lens: (typeof SERP_CACHE_LENSES)[number]) =>
  serpCacheSubjectId({ keyword, locationCode: codigos.locationCode, languageCode: codigos.languageCode.trim().toLowerCase(), lens, endpoint: "advanced" });

const linhaDaKeyword = (targeting: unknown) => ({
  id: KW, lock_version: 1, brand_id: MARCA, deleted_at: null,
  analise_semantica: targeting === undefined ? {} : { allintitle_measurement: { targeting } },
});

/* ================================ R1 · a chave ================================ */

for (const [cenario, preparar, esperado] of [
  ["keyword fora do acervo lido (sem linha)", (_banco: Banco) => undefined, AMBIENTE],
  ["keyword sem medição do Minerador (SERP opcional: sem targeting)", (banco: Banco) => { banco.tabelas.minerador_keywords.push(linhaDaKeyword(undefined)); }, { locationCode: 2076, languageCode: "pt" }],
  ["keyword com targeting em inglês", (banco: Banco) => { banco.tabelas.minerador_keywords.push(linhaDaKeyword({ languageCode: "languageConstants/1000", sourceGeoTargetConstants: ["geoTargetConstants/2076"] })); }, { locationCode: 2076, languageCode: "en" }],
] as const) {
  test(`R1 · chave igual no Arquiteto e no Radar — ${cenario}`, async () => {
    const banco = new Banco();
    preparar(banco);
    const doArquiteto = await codigosDoArquiteto(banco);
    const doRadar = (await readRadarKeywordTargetCodes(cliente(banco), MARCA, KW, AMBIENTE)).codes;
    assert.deepEqual(doArquiteto, esperado);
    assert.deepEqual(doRadar, esperado, "o Radar resolve os mesmos códigos");
    for (const lens of SERP_CACHE_LENSES) {
      const radar = chaveDoRadar(BUSCA.keyword, doRadar, lens);
      assert.equal(serpCacheSubjectId(pedidoDoArquiteto(BUSCA.keyword, doArquiteto, lens).query), radar, `keyword-serp × Radar em ${serpCacheLensLabel(lens)}`);
      const formacao = formationSerpCacheRequest({ keyword: BUSCA.keyword, keywordId: KW, depth: 10, lens, codes: doArquiteto });
      assert.equal(serpCacheSubjectId(formacao.query), radar, `formação × Radar em ${serpCacheLensLabel(lens)}`);
    }
  });
}

test("R1 · ambiente com 'pt-br': os dois módulos caem no MESMO código, com e sem linha no acervo", async () => {
  const ambiente = { locationCode: 2076, languageCode: "pt-br" };
  const semLinha = new Banco();
  assert.deepEqual(await codigosDoArquiteto(semLinha, ambiente), (await readRadarKeywordTargetCodes(cliente(semLinha), MARCA, KW, ambiente)).codes);
  const comLinha = new Banco();
  comLinha.tabelas.minerador_keywords.push(linhaDaKeyword(undefined));
  assert.deepEqual(await codigosDoArquiteto(comLinha, ambiente), (await readRadarKeywordTargetCodes(cliente(comLinha), MARCA, KW, ambiente)).codes);
});

test("R1 · grafia diferente da mesma keyword (maiúsculas e espaços) cai na mesma entrada", () => {
  for (const lens of SERP_CACHE_LENSES) {
    assert.equal(serpCacheSubjectId(pedidoDoArquiteto("  Skincare Facial ", AMBIENTE, lens).query), chaveDoRadar("skincare facial", AMBIENTE, lens));
  }
});

/* ========================= R1 · a coleta reaproveitada ========================= */

test("R1 · o Radar lê a coleta do Arquiteto nas 4 lentes: zero chamada, nenhuma credencial, nenhum uso", async () => {
  const banco = new Banco();
  banco.tabelas.minerador_keywords.push(linhaDaKeyword(undefined));
  const arquiteto = provedor();
  await arquitetoColetaAsQuatroLentes(banco, BUSCA.keyword, await codigosDoArquiteto(banco), arquiteto.fetchImpl);
  assert.equal(arquiteto.pedidos.length, 4, "o Arquiteto pagou as quatro lentes uma vez");
  assert.equal(arquiteto.pedidos.find(pedido => pedido.device === "desktop" && pedido.os === "windows")?.depth, 20, "a canônica paga em 20");

  const radar = provedor();
  const { deps, cotas, usos } = dependencias(radar.fetchImpl);
  const { coleta } = await radarAtualizaSerp(banco, deps);

  assert.equal(radar.pedidos.length, 0, "nenhuma chamada paga no Radar");
  assert.deepEqual(cotas, [], "nem a credencial nem a quota são lidas");
  assert.deepEqual(usos, []);
  assert.equal(coleta.paidCalls, 0);
  assert.equal(coleta.cacheHits, 4);
  const lentes = coleta.research.lensSet!.lenses;
  assert.ok(lentes.every(lente => lente.status === "observed" && lente.source === "cache" && lente.collectedBy === "arquiteto"), JSON.stringify(lentes.map(lente => [lente.lens, lente.source, lente.collectedBy])));
  assert.equal(coleta.research.cacheProvenance?.collectedBy, "arquiteto", "a proveniência diz de quem é a coleta");
  assert.equal(coleta.research.cacheProvenance?.cacheCollectedAt, T_ARQUITETO.toISOString());
  assert.equal(banco.entradas().length, 4, "nenhuma entrada nova: o dado não é guardado duas vezes");
});

test("R1 · Arquiteto e Radar pelo mesmo núcleo dão o mesmo snapshot (o hash não depende de quem pagou)", async () => {
  const doArquiteto = new Banco();
  await arquitetoColetaAsQuatroLentes(doArquiteto, BUSCA.keyword, AMBIENTE);
  const lido = (await radarAtualizaSerp(doArquiteto, dependencias(provedor().fetchImpl).deps)).coleta;

  const vazio = new Banco();
  const pago = (await radarAtualizaSerp(vazio, dependencias(provedor().fetchImpl).deps)).coleta;
  assert.equal(pago.paidCalls, 4);
  assert.equal(lido.research.contentHash, pago.research.contentHash);
});

test("R1 · o limite conhecido: canônica gravada SEM corpo por outro gravador faz o Radar pagar só a canônica", async () => {
  const banco = new Banco();
  const fetchImpl = provedor().fetchImpl;
  for (const lens of SERP_CACHE_LENSES) {
    await collectAndCacheSerp(contexto(banco), architectSerpCollectionRequest(pedidoDoArquiteto(BUSCA.keyword, AMBIENTE, lens)), {
      config: CONFIG, operationRequestId: "op-sem-corpo", collectedBy: "minerador", now: T_ARQUITETO, storeBody: false, provider: { fetchImpl },
    });
  }
  const radar = provedor();
  const { coleta } = await radarAtualizaSerp(banco, dependencias(radar.fetchImpl).deps);
  assert.equal(coleta.paidCalls, 1, "as três extras vêm do cache");
  assert.deepEqual(radar.pedidos.map(pedido => `${pedido.device}-${pedido.os}`), ["desktop-windows"]);
  assert.equal(architectSerpStoresBody(SERP_CACHE_CANONICAL_LENS), true, "por isso o Arquiteto grava o corpo da canônica");
  assert.ok(SERP_CACHE_LENSES.filter(lens => !sameSerpCacheLens(lens, SERP_CACHE_CANONICAL_LENS)).every(lens => !architectSerpStoresBody(lens)));
});

/* ===================== R1 · config diferente do ambiente ===================== */

test("R1 · config ≠ ambiente: o Radar consulta e grava pela CHAVE, nunca pelos códigos da config", async () => {
  const banco = new Banco();
  const radar = provedor();
  const outraConfig = { ...CONFIG, locationCode: 2840, languageCode: "en" };
  const { coleta } = await radarAtualizaSerp(banco, dependencias(radar.fetchImpl, outraConfig).deps);
  assert.equal(coleta.paidCalls, 4);
  assert.ok(radar.pedidos.every(pedido => pedido.location_code === 2076 && pedido.language_code === "pt"), JSON.stringify(radar.pedidos.map(pedido => [pedido.location_code, pedido.language_code])));

  /* O Arquiteto, depois, acha a coleta do Radar na chave dele: ninguém paga de novo. */
  const codigos = await codigosDoArquiteto(banco);
  const ids = new Set(banco.entradas().map(linha => linha.subject_id));
  for (const lens of SERP_CACHE_LENSES) assert.ok(ids.has(serpCacheSubjectId(pedidoDoArquiteto(BUSCA.keyword, codigos, lens).query)), serpCacheLensLabel(lens));
});

test("R1 · em produção a config SERP tira localidade e idioma do MESMO leitor da chave: não há divergência a pagar", () => {
  for (const env of [{}, { DATAFORSEO_LANGUAGE_CODE: "pt-br" }, { DATAFORSEO_LOCATION_CODE: "2076", DATAFORSEO_LANGUAGE_CODE: "en" }] as NodeJS.ProcessEnv[]) {
    const config = buildDataForSeoSerpConfig({ login: "l", password: "p" }, env);
    assert.deepEqual({ locationCode: config.locationCode, languageCode: config.languageCode }, readDataForSeoTargetCodes(env));
  }
  const canonica = semComentarios(ler("../lib/server/dataforseo-canonical.ts"));
  assert.match(canonica, /const technicalEnvironment = input\.technicalEnvironment \|\| process\.env;/);
  assert.match(canonica, /config = buildDataForSeoSerpConfig\(credentials, technicalEnvironment\);/);
  for (const rota of ["../app/api/arquiteto/keyword-serp/route.ts", "../app/api/editorial/serp/route.ts", "../lib/server/radar-support-research.ts"]) {
    assert.equal(/technicalEnvironment/.test(semComentarios(ler(rota))), false, `${rota} não injeta outro ambiente`);
  }
});

/* ===================== item 5 · YouTube e Amazon acrescentam ===================== */

function analiseComGoogle() {
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: MARCA, articleId: "artigo-skincare", articleDnaVersionId: "dna-v1",
    serpSnapshotId: "serp-1", serpSnapshotVersion: 2, serpSnapshotHash: "a".repeat(64),
    serpDecisions: [{ key: "organic:1", itemType: "organic", decision: "included", reason: "concorrente direto", note: "", ownDomain: false }], selectedCompetitorIds: ["https://a.test/1"], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null,
    benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });
  return VersionedRadarAnalysisSchema.parse({
    versionId: "v1", entityId: "radar-analysis:artigo-skincare", versionNumber: 1, previousVersionId: null,
    contentHash: `sha256:${"b".repeat(64)}`, origin: "human", changeReason: "fixture",
    createdAt: "2026-09-28T10:00:00.000Z", createdBy: "ator", payload,
  });
}

test("item 5 · a coleta do YouTube entra numa versão NOVA da análise e não toca nenhum campo do Google", async () => {
  const anterior = analiseComGoogle();
  const corrida = buildRadarYoutubeStartedRun({
    runId: "yt-1", runVersion: 1, startedAt: "2026-09-28T11:00:00.000Z", startedBy: "ator",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "artigo-skincare", articleDnaVersionId: "dna-v1", queryIds: ["ytq:1"] }),
    queries: [{ queryId: "ytq:1", text: "skincare facial", origin: "principal", reason: "consulta central" }],
  });
  const proxima = await createRadarAnalysisSuccessor(anterior, { youtubeSearch: corrida }, "ator", "2026-09-28T11:00:00.000Z");
  assert.equal(proxima.versionNumber, anterior.versionNumber + 1, "acrescenta uma versão; a anterior fica");
  assert.equal(proxima.payload.youtubeSearch?.runId, "yt-1");
  for (const campo of ["serpSnapshotId", "serpSnapshotVersion", "serpSnapshotHash", "serpDecisions", "selectedCompetitorIds", "deepResearch", "finalizedBundle", "supportResearch"] as const) {
    assert.deepEqual(proxima.payload[campo], anterior.payload[campo], `o campo ${campo} do Google mudou`);
  }
});

test("item 5 · YouTube e Amazon só referenciam a SERP do Google que existe; nenhum dos dois recoleta nem zera", () => {
  const apoioAmazon = semComentarios(ler("../lib/server/radar-support-research.ts"));
  assert.match(apoioAmazon, /purpose: "support"/, "o apoio da Amazon passa pelo mesmo núcleo, cache primeiro");
  const rotaAmazon = semComentarios(ler("../app/api/editorial/radar-amazon-search/route.ts"));
  assert.match(rotaAmazon, /createRadarAnalysisSuccessor\(corrente, \{ researchPackage: entrada\.record \}/, "a Amazon grava só o pacote dela");
  const inicioYoutube = semComentarios(ler("../lib/server/radar-youtube-start.ts"));
  assert.match(inicioYoutube, /createRadarAnalysisSuccessor\(contexto\.analysis, \{\s*youtubeSearch: run,/);
  for (const [nome, fonte] of [["Amazon", rotaAmazon], ["apoio", apoioAmazon], ["YouTube", inicioYoutube]] as const) {
    assert.equal(/serpSnapshotId: null|finalizedBundle: null|deepResearch: null/.test(fonte), false, `${nome} não zera campo do Google`);
  }
});
