import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  SERP_CACHE_SUBJECT_TYPE,
  SerpCacheObservationSchema,
  pruneSerpBody,
  serpCacheLensLabel,
  trimSerpBodyToDepth,
  type SerpCacheLens,
} from "../lib/editorial/serp-cache.ts";
import { SerpCollectionRecordSchema } from "../lib/editorial/contracts.ts";
import { DataForSeoSerpError, type DataForSeoSerpConfig } from "../lib/minerador/dataforseo-serp-core.ts";
import { SerpResearchSnapshotSchema, type SerpResearchSnapshot, type SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import {
  RADAR_SERP_CANONICAL_COLLECTION_DEPTH,
  RADAR_SERP_EXTRA_LENS_DEPTH,
  RADAR_SERP_LENS_LABELS,
  RADAR_SERP_NO_ORGANIC_REASON,
  RADAR_SERP_RECOLLECT_CALLS,
  RADAR_SERP_SNAPSHOT_DEPTH,
  RadarSerpCacheProvenanceSchema,
  RadarSerpLensEntrySchema,
  RadarSerpLensSetSchema,
  radarSerpLensMissingKindOf,
  radarSerpLensSetMatchesCache,
  radarSerpReusableLensGap,
  type RadarSerpLensSet,
} from "../lib/radar/serp/lens-set.ts";
import {
  CollectAuxiliaryRequestSchema,
  CollectRequestSchema,
  buildRadarSerpCollectPayload,
  radarSerpCollectOutcome,
} from "../lib/radar/serp/request.ts";
import { buildRadarSerpLensCoverage, radarSerpRecollectConfirmation } from "../lib/radar/serp-lens-coverage.ts";
import { buildDataForSeoAmazonRequest } from "../lib/server/dataforseo-amazon-operation.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { buildDataForSeoYoutubeRequest } from "../lib/server/dataforseo-youtube-operation.ts";
import { collectAndCacheSerp } from "../lib/server/serp-cache.ts";
import type { SerpCacheContext } from "../lib/server/serp-cache-store.ts";
import {
  collectRadarSerpLensSnapshot,
  radarSerpLensedContentHash,
  readRadarKeywordTargetCodes,
  type RadarSerpLensCollectionInput,
  type RadarSerpLensDeps,
} from "../lib/server/radar-serp-lenses.ts";

/**
 * R2 DA SDD DO RADAR NAS QUATRO LENTES — a SERP canônica do artigo, cache primeiro.
 *
 * O núcleo é executado de verdade: store do cache, normalizador e observação
 * reais, contra um banco em memória com a forma do `postgrest-js` e um `fetch`
 * FALSO no lugar da DataForSEO, que devolve o corpo real da fixture advanced
 * com variações por lente. Nenhuma chamada paga, nenhum banco remoto.
 *
 * Prova: chamadas pagas por caso, cache antes da credencial, janela fixa (o
 * acerto e a coleta dão o mesmo snapshot e o mesmo hash), lentes copiadas sem
 * digest, hash cobrindo as lentes, "sem mudança" sem versão, recoleta
 * explícita, uso por lente e o snapshot anterior às lentes intacto.
 */

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const CONFIG: DataForSeoSerpConfig = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };
const MARCA = "5f0c9a1e-3b2d-4c8e-9a7f-1d2e3f4a5b6c";
const KW = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const CODIGOS = { locationCode: 2076, languageCode: "pt" };
const T0 = new Date("2026-09-20T09:00:00.000Z");
const T1 = new Date("2026-09-23T10:00:00.000Z");
const T2 = new Date("2026-09-23T11:00:00.000Z");
const ROTULOS = SERP_CACHE_LENSES.map(serpCacheLensLabel);

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
  chamadas: Consulta[] = [];
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
    this.chamadas.push(consulta);
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
  entradasDoCache() { return this.tabelas.editorial_workflow_items.filter(linha => linha.subject_type === SERP_CACHE_SUBJECT_TYPE); }
  entradaDa(lente: string) { return this.entradasDoCache().find(linha => serpCacheLensLabel((linha.payload as { meta: { lens: SerpCacheLens } }).meta.lens) === lente); }
  leiturasDoCache() { return this.chamadas.filter(chamada => chamada.op === "select" && chamada.tabela === "editorial_workflow_items" && /observation:payload->observation|body:payload->body|meta:payload->meta/.test(chamada.colunas)); }
  leuCorpo() { return this.chamadas.some(chamada => chamada.op === "select" && chamada.colunas.includes("body:payload->body")); }
  zerarChamadas() { this.chamadas = []; }
}

const contexto = (banco: Banco): SerpCacheContext => ({ supabase: banco as unknown as SerpCacheContext["supabase"], brandId: MARCA, actorUserId: "ator-1" });

/* --------------------------------- provider --------------------------------- */

type Registro = Record<string, unknown>;
type CorpoDaFixture = { tasks: Array<Registro & { id: string; data: Registro; result: Array<Registro & { items: Registro[] }> | null }> };

/*
 * O que muda por lente, sobre o corpo real. A macOS repete a Windows (lentes
 * que concordam); a Android troca o primeiro orgânico; a iOS ganha uma
 * pergunta no People Also Ask.
 */
function variantePadrao(lente: string, corpo: CorpoDaFixture) {
  const itens = corpo.tasks[0].result![0].items;
  if (lente === "mobile-android") {
    const primeiro = itens.find(item => item.type === "organic")!;
    primeiro.domain = "www.so-no-android.com.br";
    primeiro.url = "https://www.so-no-android.com.br/skincare";
  }
  if (lente === "mobile-ios") {
    const paa = itens.find(item => item.type === "people_also_ask") as Registro & { items: Registro[] };
    paa.items.push({ type: "people_also_ask_element", title: "Skincare facial funciona no celular?" });
  }
}

type Chamada = { url: string; pedido: Registro };

function provedor(opcoes: { variante?: (lente: string, corpo: CorpoDaFixture) => void; falha?: Record<string, number | "task"> } = {}) {
  const chamadas: Chamada[] = [];
  let sequencia = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const pedido = (JSON.parse(String(init?.body)) as Registro[])[0];
    chamadas.push({ url: String(url), pedido });
    const lente = `${pedido.device}-${pedido.os}`;
    const falha = opcoes.falha?.[lente];
    if (typeof falha === "number") return new Response("{}", { status: falha });
    sequencia += 1;
    const corpo = structuredClone(CRU) as CorpoDaFixture;
    corpo.tasks[0].id = `tarefa-${lente}-${sequencia}`;
    corpo.tasks[0].data = { ...corpo.tasks[0].data, device: pedido.device, os: pedido.os, depth: pedido.depth, tag: pedido.tag };
    if (falha === "task") {
      corpo.tasks[0].status_code = 40501;
      corpo.tasks[0].status_message = "Invalid Field: 'os'.";
      corpo.tasks[0].result = null;
    } else {
      variantePadrao(lente, corpo);
      opcoes.variante?.(lente, corpo);
    }
    const resposta = Number(pedido.depth) < 20 ? trimSerpBodyToDepth(corpo, Number(pedido.depth)) : corpo;
    return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const porLente = () => chamadas.map(chamada => `${chamada.pedido.device}-${chamada.pedido.os}`).sort();
  return { fetchImpl, chamadas, porLente };
}

/* ------------------------------ dependências ------------------------------ */

type Uso = Parameters<RadarSerpLensDeps["recordUsage"]>[0];
const RECURSO = { allowed: true, actorUserId: "ator-1", agencyId: null, brandId: MARCA, resourceKey: null, capability: null } as unknown as Uso["resource"];

function dependencias(fetchImpl: typeof fetch) {
  const cotas: number[] = [];
  const usos: Uso[] = [];
  const deps: RadarSerpLensDeps = {
    resolveConfig: async quotaUnits => { cotas.push(quotaUnits); return { config: CONFIG, resource: RECURSO }; },
    recordUsage: async entrada => { usos.push(entrada); return null; },
    fetchImpl,
  };
  return { deps, cotas, usos };
}

const BUSCA: SerpSearchInput = {
  brandId: MARCA, articleId: "artigo-skincare", articleDnaVersionId: "dna-v1", keywordId: KW, keywordDnaVersionId: "kwdna-v1",
  keyword: "skincare facial", location: "Brasil", language: "pt-BR", device: "mobile", operatingSystem: null,
  expectedIntent: "", expectedFormat: "pilar", requiredTopics: [], articleEntities: [], resultLimit: 50, version: 1, previousSnapshotId: null,
};

const entrada = (banco: Banco, extra: Partial<RadarSerpLensCollectionInput> = {}): RadarSerpLensCollectionInput => ({
  context: contexto(banco), searchInput: BUSCA, codes: CODIGOS, cacheKeywordId: KW, previous: null, recollect: false, now: T1, operationRequestId: "op-radar", ...extra,
});

/** O Minerador pagou as quatro lentes antes: canônica em 20 com corpo, extras em 10 sem corpo. */
async function semearMinerador(banco: Banco, quando = T0, fetchImpl = provedor().fetchImpl) {
  for (const lens of SERP_CACHE_LENSES) {
    const canonica = serpCacheLensLabel(lens) === serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS);
    await collectAndCacheSerp(contexto(banco), {
      query: { keyword: BUSCA.keyword, ...CODIGOS, lens, endpoint: "advanced" },
      depth: canonica ? 20 : 10,
      keywordId: KW,
    }, { config: CONFIG, operationRequestId: "op-minerador", collectedBy: "minerador", now: quando, storeBody: canonica, provider: { fetchImpl } });
  }
}

const semVariacaoDeProveniencia = (snapshot: SerpResearchSnapshot) => {
  const copia = structuredClone(snapshot) as Record<string, unknown>;
  delete copia.id;
  delete copia.cacheProvenance;
  const conjunto = copia.lensSet as RadarSerpLensSet;
  copia.lensSet = { ...conjunto, lenses: conjunto.lenses.map(lente => ({ lens: lente.lens, status: lente.status, observation: lente.observation })) };
  return copia;
};

/* ================================ o pedido ================================ */

test("pedido · device é aceito e ignorado, a recoleta exige confirmação explícita", () => {
  const base = {
    action: "collect", brandId: MARCA, articleId: "artigo-skincare", articleDnaVersionId: "dna-v1", location: "Brasil", language: "pt-BR",
    resolutionEnvelope: {},
  };
  for (const device of [undefined, "desktop", "mobile"]) {
    const pedido = CollectRequestSchema.safeParse({ ...base, ...(device ? { device } : {}) });
    assert.equal(pedido.success || pedido.error.issues.every(issue => issue.path[0] === "resolutionEnvelope"), true, `device ${device} não é motivo de recusa`);
    if (!pedido.success) assert.equal(pedido.error.issues.some(issue => issue.path[0] === "device"), false);
  }
  const recoletaSemConfirmar = CollectRequestSchema.safeParse({ ...base, recollect: { confirmed: false } });
  assert.equal(recoletaSemConfirmar.success, false);
  assert.ok(!recoletaSemConfirmar.success && recoletaSemConfirmar.error.issues.some(issue => issue.path[0] === "recollect"));

  const payload = buildRadarSerpCollectPayload({ brandId: MARCA, articleId: "a", articleDnaVersionId: "dna-v1", location: "Brasil", language: "pt-BR", resolutionEnvelope: {} as never });
  assert.equal("device" in payload, false, "o cliente novo não manda aparelho");
  assert.equal("recollect" in payload, false, "sem pedido, sem recoleta");
  const pago = buildRadarSerpCollectPayload({ brandId: MARCA, articleId: "a", articleDnaVersionId: "dna-v1", location: "Brasil", language: "pt-BR", resolutionEnvelope: {} as never, recollect: true });
  assert.deepEqual(pago.recollect, { confirmed: true });

  const auxiliar = CollectAuxiliaryRequestSchema.shape;
  assert.equal("recollect" in auxiliar, false, "a pesquisa auxiliar fica para a R4");
});

test("pedido · o resultado da coleta diz se mudou e quantas chamadas foram pagas", () => {
  const record = { id: "r" } as unknown as Parameters<typeof radarSerpCollectOutcome>[1];
  assert.deepEqual(radarSerpCollectOutcome({ unchanged: true, unchangedBy: "cache_meta", lensCoverage: { observed: 4, total: 4, paidCalls: 0, cacheHits: 4 } }, record),
    { record, unchanged: true, unchangedBy: "cache_meta", paidCalls: 0, cacheHits: 4, observedLenses: 4, totalLenses: 4, cacheReadFailed: null, reusedLensGaps: null });
  assert.deepEqual(radarSerpCollectOutcome({}, record),
    { record, unchanged: false, unchangedBy: null, paidCalls: null, cacheHits: null, observedLenses: null, totalLenses: null, cacheReadFailed: null, reusedLensGaps: null }, "servidor anterior às lentes");
  const semCache = radarSerpCollectOutcome({ unchanged: false, lensCoverage: { observed: 4, total: 4, paidCalls: 4, cacheHits: 0, cacheReadFailed: true, reusedLensGaps: 0 } }, record);
  assert.equal(semCache.cacheReadFailed, true, "o cache indisponível chega ao cliente");
  assert.equal(semCache.reusedLensGaps, 0);
  assert.equal(radarSerpCollectOutcome({ lensCoverage: { cacheReadFailed: "sim", reusedLensGaps: -1 } }, record).cacheReadFailed, null);
});

/* =========================== cache antes de pagar =========================== */

test("cache · com as quatro lentes no cache: zero chamada, nenhuma credencial, nenhum uso", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const provider = provedor();
  const { deps, cotas, usos } = dependencias(provider.fetchImpl);

  const resultado = await collectRadarSerpLensSnapshot(entrada(banco), deps);

  assert.equal(provider.chamadas.length, 0);
  assert.deepEqual(cotas, [], "a credencial e a quota não são lidas");
  assert.deepEqual(usos, [], "acerto não registra uso");
  assert.equal(resultado.paidCalls, 0);
  assert.equal(resultado.cacheHits, 4);
  assert.equal(resultado.unchanged, false);
  const conjunto = resultado.research.lensSet!;
  assert.deepEqual(conjunto.lenses.map(lente => lente.lens), [...RADAR_SERP_LENS_LABELS]);
  assert.ok(conjunto.lenses.every(lente => lente.status === "observed" && lente.source === "cache" && lente.collectedBy === "minerador"));
  assert.equal(conjunto.lenses[0].depth, 20, "a canônica do Minerador, em 20, atende o pedido de 10");
  assert.deepEqual(resultado.research.cacheProvenance, { source: "cache", collectedBy: "minerador", providerRequestId: "tarefa-desktop-windows-1", cacheCollectedAt: T0.toISOString(), locationCode: 2076, languageCode: "pt", snapshotOpenedAt: T1.toISOString() });
  assert.equal(resultado.research.payloadDepth, "advanced");
  assert.equal(resultado.research.providerDepth, 20);
  assert.equal(resultado.research.collectedAt, T0.toISOString(), "a data é a da observação, não a do clique");
  assert.equal(resultado.research.device, "desktop", "o device pedido (mobile) não muda a lente");
  assert.equal(resultado.research.operatingSystem, "windows");
  assert.equal(resultado.research.resultLimit, RADAR_SERP_SNAPSHOT_DEPTH);
});

test("cache · sem nada no cache: quota = 4, canônica em 20 com os windows, extras em 10, gravadas pelo Radar", async () => {
  const banco = new Banco();
  const provider = provedor();
  const { deps, cotas, usos } = dependencias(provider.fetchImpl);

  const resultado = await collectRadarSerpLensSnapshot(entrada(banco), deps);

  assert.deepEqual(cotas, [4], "uma resolução, com uma unidade por lente faltante");
  assert.deepEqual(provider.porLente(), [...ROTULOS].sort());
  for (const chamada of provider.chamadas) {
    assert.match(chamada.url, /\/v3\/serp\/google\/organic\/live\/advanced$/, "endpoint advanced nas quatro lentes");
    const lente = `${chamada.pedido.device}-${chamada.pedido.os}`;
    assert.equal(chamada.pedido.depth, lente === "desktop-windows" ? RADAR_SERP_CANONICAL_COLLECTION_DEPTH : RADAR_SERP_EXTRA_LENS_DEPTH, lente);
    assert.equal(chamada.pedido.location_code, 2076);
    assert.equal(chamada.pedido.language_code, "pt");
  }
  assert.equal(resultado.paidCalls, 4);
  assert.equal(resultado.cacheHits, 0);

  const canonica = banco.entradaDa("desktop-windows")!;
  const payloadCanonica = canonica.payload as { meta: { collectedBy: string; depth: number }; body?: unknown; digest?: unknown };
  assert.equal(payloadCanonica.meta.collectedBy, "radar");
  assert.equal(payloadCanonica.meta.depth, 20);
  assert.ok(payloadCanonica.body, "a canônica guarda o corpo: a CALL 3 do Minerador não paga de novo");
  assert.equal(canonica.stage, "minerador", "o estágio é o do cache");
  assert.equal(canonica.source_entity_id, KW, "some junto com a keyword");
  for (const lente of ["desktop-macos", "mobile-android", "mobile-ios"]) {
    const extra = banco.entradaDa(lente)!.payload as { meta: { collectedBy: string; depth: number }; body?: unknown; digest?: unknown };
    assert.equal(extra.meta.collectedBy, "radar", lente);
    assert.equal(extra.meta.depth, 10, lente);
    assert.equal(extra.body, undefined, `${lente} não guarda corpo`);
    assert.ok(extra.digest, `${lente} guarda o digest para o Minerador`);
  }

  assert.equal(usos.length, 4, "um uso por chamada paga");
  assert.deepEqual(usos.map(uso => (uso.metadata as { lens: string }).lens).sort(), [...ROTULOS].sort());
  assert.equal(new Set(usos.map(uso => uso.idempotencyKey)).size, 4, "idempotência por lente");
  for (const uso of usos) {
    assert.equal(uso.module, "radar");
    assert.equal(uso.units, 1);
    assert.equal(uso.resultStatus, "succeeded");
    assert.equal(uso.costAmount, 0.0035);
    assert.match(uso.idempotencyKey, /^dataforseo:radar:serp:op-radar:artigo-skincare:(desktop|mobile)-(windows|macos|android|ios)$/);
    assert.equal((uso.metadata as { snapshotId: string }).snapshotId, resultado.research.id);
    assert.equal((uso.metadata as { operationKind: string }).operationKind, "serp");
  }
  assert.ok(resultado.research.lensSet!.lenses.every(lente => lente.source === "paid" && lente.collectedBy === "radar"));
  assert.deepEqual(resultado.research.cacheProvenance, { source: "paid", collectedBy: "radar", providerRequestId: "tarefa-desktop-windows-1", cacheCollectedAt: T1.toISOString(), locationCode: 2076, languageCode: "pt", snapshotOpenedAt: T1.toISOString() });
});

test("cache · canônica no cache e extras faltando: quota = 3, só as extras pagas", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  banco.tabelas.editorial_workflow_items = banco.tabelas.editorial_workflow_items.filter(linha => linha === banco.entradaDa("desktop-windows"));
  const provider = provedor();
  const { deps, cotas } = dependencias(provider.fetchImpl);

  const resultado = await collectRadarSerpLensSnapshot(entrada(banco), deps);

  assert.deepEqual(cotas, [3]);
  assert.deepEqual(provider.porLente(), ["desktop-macos", "mobile-android", "mobile-ios"]);
  assert.ok(provider.chamadas.every(chamada => chamada.pedido.depth === 10));
  assert.equal(resultado.cacheHits, 1);
  assert.equal(resultado.research.lensSet!.lenses[0].source, "cache");
});

test("cache · entrada mais velha que 30 dias não serve: as quatro são pagas", async () => {
  const banco = new Banco();
  await semearMinerador(banco, new Date(T1.getTime() - 31 * 24 * 60 * 60 * 1000));
  const provider = provedor();
  const { deps, cotas } = dependencias(provider.fetchImpl);
  await collectRadarSerpLensSnapshot(entrada(banco), deps);
  assert.deepEqual(cotas, [4]);
  assert.equal(provider.chamadas.length, 4);
});

/* ============================== equivalência ============================== */

test("equivalência · o acerto de cache dá o MESMO snapshot e o MESMO hash da coleta paga", async () => {
  const banco = new Banco();
  const pago = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  const relido = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2 }), dependencias(provedor().fetchImpl).deps);

  assert.equal(relido.paidCalls, 0);
  assert.equal(relido.research.contentHash, pago.research.contentHash);
  assert.deepEqual(semVariacaoDeProveniencia(relido.research), semVariacaoDeProveniencia(pago.research));
  assert.equal(relido.research.collectedAt, T1.toISOString(), "a data é a da coleta gravada");
});

test("equivalência · data gravada com +00:00 vira ISO com Z no snapshot, sem recusa", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  for (const linha of banco.entradasDoCache()) (linha.payload as { meta: { collectedAt: string } }).meta.collectedAt = "2026-09-20T09:00:00+00:00";
  const { research } = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  assert.equal(research.collectedAt, "2026-09-20T09:00:00.000Z");
  assert.equal(research.cacheProvenance!.cacheCollectedAt, "2026-09-20T09:00:00.000Z");
  assert.ok(research.lensSet!.lenses.every(lente => lente.collectedAt === "2026-09-20T09:00:00.000Z"));
});

test("equivalência · entrada canônica em 20 e em 10 do mesmo corpo dão o mesmo hash (janela fixa)", async () => {
  const em20 = new Banco();
  await semearMinerador(em20);
  const em10 = new Banco();
  await semearMinerador(em10);
  const provider = provedor();
  em10.tabelas.editorial_workflow_items = em10.tabelas.editorial_workflow_items.filter(linha => linha !== em10.entradaDa("desktop-windows"));
  await collectAndCacheSerp(contexto(em10), { query: { keyword: BUSCA.keyword, ...CODIGOS, lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" }, depth: 10, keywordId: KW },
    { config: CONFIG, operationRequestId: "op-arquiteto", collectedBy: "arquiteto", now: T0, provider: { fetchImpl: provider.fetchImpl } });

  const a = await collectRadarSerpLensSnapshot(entrada(em20), dependencias(provedor().fetchImpl).deps);
  const b = await collectRadarSerpLensSnapshot(entrada(em10), dependencias(provedor().fetchImpl).deps);
  assert.equal(a.paidCalls + b.paidCalls, 0);
  assert.equal(b.research.providerDepth, 10);
  assert.equal(a.research.providerDepth, 20);
  assert.equal(b.research.contentHash, a.research.contentHash);
});

test("equivalência · o corpo que volta do jsonb com as chaves em outra ordem dá o mesmo hash", async () => {
  const comGrafo = (_lente: string, corpo: CorpoDaFixture) => {
    corpo.tasks[0].result![0].items.splice(3, 0, { type: "knowledge_graph", rank_group: 1, rank_absolute: 4, title: "Skincare", description: "Cuidados com a pele", attributes: { origem: "Coreia", categoria: "Cosmético", ano: "2010" } });
  };
  const inverter = (valor: unknown): unknown => {
    if (Array.isArray(valor)) return valor.map(inverter);
    if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor as Registro).reverse().map(([chave, item]) => [chave, inverter(item)]));
    return valor;
  };
  const banco = new Banco();
  const pago = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor({ variante: comGrafo }).fetchImpl).deps);
  assert.ok(pago.research.knowledgeGraph, "o grafo entrou no snapshot");
  const canonica = banco.entradaDa("desktop-windows")!;
  (canonica.payload as Registro).body = inverter((canonica.payload as Registro).body);
  const relido = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2 }), dependencias(provedor().fetchImpl).deps);
  assert.equal(relido.paidCalls, 0);
  assert.notDeepEqual(Object.keys(relido.research.knowledgeGraph!.attributes), Object.keys(pago.research.knowledgeGraph!.attributes), "a ordem mudou de fato");
  assert.equal(relido.research.contentHash, pago.research.contentHash);
});

/* =========================== lentes copiadas =========================== */

test("lensSet · quatro lentes na ordem canônica, cópia da observação, sem digest", async () => {
  const banco = new Banco();
  const resultado = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  const conjunto = RadarSerpLensSetSchema.parse(resultado.research.lensSet);
  assert.deepEqual(RADAR_SERP_LENS_LABELS, ROTULOS, "os rótulos são os de SERP_CACHE_LENSES");
  assert.deepEqual(conjunto.lenses.map(lente => lente.lens), ROTULOS);
  const chavesDaObservacao = Object.keys(SerpCacheObservationSchema.shape).sort();
  for (const lente of conjunto.lenses) {
    assert.deepEqual(Object.keys(lente.observation!).sort(), chavesDaObservacao, `${lente.lens}: só a observação`);
    assert.equal(lente.observation!.lens, lente.lens);
  }
  assert.equal(JSON.stringify(resultado.research).includes("\"digest\""), false, "nenhum digest no snapshot");
  assert.equal(JSON.stringify(resultado.research).includes("\"sellers\""), false);
  assert.equal(JSON.stringify(resultado.research).includes(SERP_CACHE_SUBJECT_TYPE), false, "nenhum ponteiro para a entrada de cache");
  assert.ok(Buffer.byteLength(JSON.stringify(conjunto)) < 8_000, "o conjunto copiado fica perto de 4 × 1 KB");

  const android = conjunto.lenses.find(lente => lente.lens === "mobile-android")!;
  assert.ok(android.observation!.competitorDomains.some(dominio => dominio.includes("so-no-android")));
  const ios = conjunto.lenses.find(lente => lente.lens === "mobile-ios")!;
  assert.ok(ios.observation!.questions.includes("Skincare facial funciona no celular?"));
});

test("lensSet · lente que falha vira lacuna declarada e não derruba a canônica", async () => {
  const banco = new Banco();
  const provider = provedor({ falha: { "mobile-ios": 500, "desktop-macos": "task" } });
  const { deps, usos } = dependencias(provider.fetchImpl);
  const resultado = await collectRadarSerpLensSnapshot(entrada(banco), deps);

  const porLente = Object.fromEntries(resultado.research.lensSet!.lenses.map(lente => [lente.lens, lente]));
  assert.equal(porLente["mobile-ios"].status, "missing");
  assert.match(porLente["mobile-ios"].missingReason!, /HTTP 500/);
  assert.equal(porLente["desktop-macos"].status, "missing");
  assert.match(porLente["desktop-macos"].missingReason!, /40501/);
  assert.equal(porLente["mobile-ios"].observation, undefined);
  assert.equal(porLente["desktop-windows"].status, "observed");
  assert.equal(buildRadarSerpLensCoverage(resultado.research).label, "SERP · 2 de 4 lentes");

  assert.equal(usos.length, 3, "HTTP 500 não chegou a ser SERP cobrada; a task recusada foi paga e registrada");
  const recusada = usos.find(uso => (uso.metadata as { lens: string }).lens === "desktop-macos")!;
  assert.equal(recusada.resultStatus, "failed");
});

test("lensSet · extra sem nenhum orgânico é lacuna, como o cache a trata, e não observação", async () => {
  const banco = new Banco();
  const vazia = (lente: string, corpo: CorpoDaFixture) => {
    if (lente !== "desktop-macos") return;
    corpo.tasks[0].result![0].items = corpo.tasks[0].result![0].items.filter(item => item.type !== "organic");
  };
  const { research } = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor({ variante: vazia }).fetchImpl).deps);
  const macos = research.lensSet!.lenses[1];
  assert.equal(macos.status, "missing");
  assert.match(macos.missingReason!, /sem nenhum resultado orgânico/);
  assert.equal(macos.missingKind, "no_organic");
  assert.equal(macos.attemptedAt, T1.toISOString());
  assert.equal(banco.entradaDa("desktop-macos"), undefined, "o cache também não guardou");
});

test("lensSet · canônica recusada pelo provider derruba a coleta com o erro de antes, sem pagar as extras", async () => {
  const banco = new Banco();
  const provider = provedor({ falha: { "desktop-windows": "task" } });
  const { deps, usos } = dependencias(provider.fetchImpl);
  await assert.rejects(collectRadarSerpLensSnapshot(entrada(banco), deps), (erro: unknown) => erro instanceof DataForSeoSerpError && erro.code === "dataforseo_task_failed");
  assert.deepEqual(provider.porLente(), ["desktop-windows"], "as extras não são pagas sem canônica");
  assert.equal(usos.length, 1, "a chamada paga é registrada mesmo sem snapshot");
  assert.equal(usos[0].resultStatus, "failed");
  assert.equal((usos[0].metadata as { snapshotId: unknown }).snapshotId, null);
});

/* ================================= hash ================================= */

test("hash · muda com a observação de uma lente extra; não muda com data, origem nem providerRequestId", async () => {
  const banco = new Banco();
  const { research } = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  const conjunto = research.lensSet!;
  const hash = (lensSet: RadarSerpLensSet) => radarSerpLensedContentHash(research, CODIGOS, lensSet);
  assert.equal(hash(conjunto), research.contentHash);

  const outraObservacao = structuredClone(conjunto);
  outraObservacao.lenses[1].observation!.competitorDomains.push("novo-no-macos.com.br");
  assert.notEqual(hash(outraObservacao), research.contentHash);

  const faltando = structuredClone(conjunto);
  faltando.lenses[3] = { lens: "mobile-ios", status: "missing", missingReason: "HTTP 500", source: null, collectedBy: null, collectedAt: null, depth: null, providerRequestId: null };
  assert.notEqual(hash(faltando), research.contentHash, "lente que some é mudança");

  const soProveniencia = structuredClone(conjunto);
  soProveniencia.lenses = soProveniencia.lenses.map(lente => ({ ...lente, collectedAt: "2026-09-01T00:00:00.000Z", providerRequestId: "outra-tarefa", source: "cache", collectedBy: "arquiteto", depth: 20 }));
  assert.equal(hash(soProveniencia), research.contentHash);

  assert.notEqual(radarSerpLensedContentHash(research, { locationCode: 2076, languageCode: "en" }, conjunto), research.contentHash, "o idioma da consulta é conteúdo");
});

test("legado · snapshot anterior às lentes continua legível, sem chave nova e com o hash gravado", () => {
  const legado = normalizeDataForSeoSerpResponse(CRU, { ...BUSCA, device: "desktop", operatingSystem: null, resultLimit: 10 }, CONFIG, "2026-09-10T10:00:00.000Z", "tarefa-antiga");
  const gravado = JSON.parse(JSON.stringify(legado));
  const relido = SerpResearchSnapshotSchema.parse(gravado);
  assert.equal(relido.contentHash, legado.contentHash);
  for (const chave of ["payloadDepth", "providerDepth", "cacheProvenance", "lensSet"]) assert.equal(chave in relido, false, `${chave} não aparece no snapshot antigo`);
  const registro = SerpCollectionRecordSchema.parse({ id: legado.id, input: { keyword: legado.query, articleId: legado.articleId, location: "Brasil", language: "pt-BR", device: "desktop" }, status: "needs_review", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null, dnaIntent: null, conflictReason: null, humanDecisionRequired: true, research: gravado });
  assert.equal(JSON.stringify(SerpCollectionRecordSchema.parse(JSON.parse(JSON.stringify(registro)))), JSON.stringify(registro), "a serialização do registro antigo não muda");
  const cobertura = buildRadarSerpLensCoverage(relido);
  assert.equal(cobertura.state, "single_lens");
  assert.equal(cobertura.label, "SERP · 1 lente (coleta anterior às quatro lentes)");
});

test("legado · o snapshot anterior às lentes nunca é \"sem mudança\": a primeira atualização abre versão", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const legado = normalizeDataForSeoSerpResponse(CRU, { ...BUSCA, device: "desktop", operatingSystem: null, resultLimit: 10 }, CONFIG, "2026-09-10T10:00:00.000Z", "tarefa-antiga");
  const resultado = await collectRadarSerpLensSnapshot(entrada(banco, { previous: legado }), dependencias(provedor().fetchImpl).deps);
  assert.equal(resultado.unchanged, false);
  assert.notEqual(resultado.research.id, legado.id);
  assert.notEqual(resultado.research.contentHash, legado.contentHash);
});

/* ========================== sem mudança, sem versão ========================== */

test("sem mudança · as mesmas coletas no cache: devolve o anterior sem ler corpo nem credencial", async () => {
  const banco = new Banco();
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  banco.zerarChamadas();
  const provider = provedor();
  const { deps, cotas, usos } = dependencias(provider.fetchImpl);

  const segundo = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research }), deps);

  assert.equal(segundo.unchanged, true);
  assert.equal(segundo.unchangedBy, "cache_meta");
  assert.equal(segundo.research, primeiro.research, "o próprio snapshot anterior");
  assert.equal(banco.leuCorpo(), false, "nenhum corpo lido");
  assert.equal(banco.leiturasDoCache().length, 1, "uma leitura leve das quatro lentes");
  assert.deepEqual(cotas, []);
  assert.deepEqual(usos, []);
  assert.equal(provider.chamadas.length, 0);
  assert.equal(banco.chamadas.some(chamada => chamada.op !== "select"), false, "nada gravado");
});

test("sem mudança · outra coleta com o mesmo conteúdo: lê o corpo, normaliza, hash igual, nenhuma versão", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  await semearMinerador(banco, new Date(T1.getTime() - 60_000));
  const segundo = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research }), dependencias(provedor().fetchImpl).deps);
  assert.equal(segundo.unchanged, true);
  assert.equal(segundo.unchangedBy, "content_hash");
  assert.equal(segundo.research.id, primeiro.research.id);
  assert.equal(segundo.paidCalls, 0);
});

test("sem mudança · outra versão do ArticleDNA nunca devolve o snapshot anterior", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  const outraVersao = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research, searchInput: { ...BUSCA, articleDnaVersionId: "dna-v2" } }), dependencias(provedor().fetchImpl).deps);
  assert.equal(outraVersao.unchanged, false);
  assert.equal(outraVersao.research.articleDnaVersionId, "dna-v2");
  assert.equal(outraVersao.research.contentHash, primeiro.research.contentHash, "o conteúdo é o mesmo; o vínculo não");
});

test("sem mudança · o atalho exige as quatro lentes observadas e as mesmas coletas", () => {
  const conjunto = RadarSerpLensSetSchema.parse({
    version: "radar-lens-set-v1",
    lenses: ROTULOS.map((lens, indice) => ({ lens, status: "observed", missingReason: null, source: "cache", collectedBy: "minerador", collectedAt: "2026-09-20T09:00:00.000Z", depth: indice ? 10 : 20, providerRequestId: `t-${indice}`,
      observation: { lens, depth: 10, competitorDomains: [], organicCount: 1, itemTypes: [], questions: [], relatedSearches: [], aiOverviewDomains: [], commercialSignals: false } })),
  });
  const iguais = ROTULOS.map((_, indice) => ({ providerRequestId: `t-${indice}`, collectedAt: "2026-09-20T09:00:00+00:00" }));
  assert.equal(radarSerpLensSetMatchesCache(conjunto, iguais), true, "+00:00 e Z são o mesmo instante");
  assert.equal(radarSerpLensSetMatchesCache(conjunto, iguais.map((hit, indice) => indice === 2 ? { ...hit, providerRequestId: "outra" } : hit)), false);
  assert.equal(radarSerpLensSetMatchesCache(conjunto, iguais.map((hit, indice) => indice === 3 ? null : hit)), false);
  const comFalta = structuredClone(conjunto);
  comFalta.lenses[3] = { lens: "mobile-ios", status: "missing", missingReason: "HTTP 500", source: null, collectedBy: null, collectedAt: null, depth: null, providerRequestId: null };
  assert.equal(radarSerpLensSetMatchesCache(comFalta, iguais), false, "lente faltante é tentada de novo");
});

/* ============================== recoleta paga ============================== */

test("recoleta · paga as quatro sem ler o cache; conteúdo igual não abre versão; o uso diz recoleta", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  banco.zerarChamadas();
  const provider = provedor();
  const { deps, cotas, usos } = dependencias(provider.fetchImpl);

  const recoleta = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research, recollect: true }), deps);

  assert.deepEqual(cotas, [RADAR_SERP_RECOLLECT_CALLS]);
  assert.equal(provider.chamadas.length, 4);
  assert.equal(banco.leiturasDoCache().length, 0, "a recoleta não lê o cache antes de pagar");
  assert.equal(recoleta.unchanged, true);
  assert.equal(recoleta.unchangedBy, "content_hash");
  assert.equal(recoleta.research.id, primeiro.research.id);
  assert.equal(usos.length, 4);
  assert.ok(usos.every(uso => (uso.metadata as { operationKind: string; snapshotId: string }).operationKind === "serp_recollect" && (uso.metadata as { snapshotId: string }).snapshotId === primeiro.research.id));
  assert.ok(banco.entradasDoCache().every(linha => (linha.payload as { meta: { collectedBy: string } }).meta.collectedBy === "radar"), "o cache avançou para a recoleta");
});

test("recoleta · conteúdo novo numa lente abre versão nova com hash novo", async () => {
  const banco = new Banco();
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor().fetchImpl).deps);
  const mudou = (lente: string, corpo: CorpoDaFixture) => {
    if (lente !== "mobile-ios") return;
    const paa = corpo.tasks[0].result![0].items.find(item => item.type === "people_also_ask") as Registro & { items: Registro[] };
    paa.items.push({ type: "people_also_ask_element", title: "Pergunta nova no iOS?" });
  };
  const recoleta = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research, recollect: true }), dependencias(provedor({ variante: mudou }).fetchImpl).deps);
  assert.equal(recoleta.unchanged, false);
  assert.notEqual(recoleta.research.contentHash, primeiro.research.contentHash);
  assert.equal(recoleta.research.organicResults.length, primeiro.research.organicResults.length, "a canônica é a mesma: só a lente mudou");
});

/* ============================ códigos do alvo ============================ */

test("códigos · os do alvo da keyword pela função do Minerador; sem keyword do acervo, os do ambiente", async () => {
  const banco = new Banco();
  banco.tabelas.minerador_keywords.push({ id: KW, lock_version: 1, brand_id: MARCA, deleted_at: null, analise_semantica: { allintitle_measurement: { targeting: { languageCode: "languageConstants/1000", sourceGeoTargetConstants: ["geoTargetConstants/2076"] } } } });
  const ambiente = { locationCode: 2076, languageCode: "pt" };

  const doAlvo = await readRadarKeywordTargetCodes(banco as unknown as SerpCacheContext["supabase"], MARCA, KW, ambiente);
  assert.deepEqual(doAlvo, { codes: { locationCode: 2076, languageCode: "en" }, cacheKeywordId: KW, source: "keyword_targeting", readFailed: false }, "o idioma é o do alvo, não o do ambiente");

  banco.tabelas.minerador_keywords[0].deleted_at = "2026-09-22T10:00:00+00:00";
  const excluida = await readRadarKeywordTargetCodes(banco as unknown as SerpCacheContext["supabase"], MARCA, KW, ambiente);
  assert.equal(excluida.source, "environment", "keyword excluída não empresta o alvo");
  banco.tabelas.minerador_keywords[0].deleted_at = null;
  const consulta = banco.chamadas.at(-1)!;
  assert.equal(consulta.colunas, "id,targeting:analise_semantica->allintitle_measurement->targeting", "coluna estreita");
  assert.deepEqual(consulta.filtros.map(filtro => filtro.coluna).sort(), ["brand_id", "deleted_at", "id"]);

  const outraMarca = await readRadarKeywordTargetCodes(banco as unknown as SerpCacheContext["supabase"], "0f0c9a1e-3b2d-4c8e-9a7f-1d2e3f4a5b6c", KW, ambiente);
  assert.deepEqual(outraMarca, { codes: ambiente, cacheKeywordId: null, source: "environment", readFailed: false });

  banco.zerarChamadas();
  const naoAcervo = await readRadarKeywordTargetCodes(banco as unknown as SerpCacheContext["supabase"], MARCA, "kw-referencia-local", ambiente);
  assert.equal(naoAcervo.cacheKeywordId, null);
  assert.equal(banco.chamadas.length, 0, "id que não é do acervo não vai ao banco");

  const quebrado = { from() { throw new Error("rede fora"); } };
  const falhou = await readRadarKeywordTargetCodes(quebrado as unknown as SerpCacheContext["supabase"], MARCA, KW, ambiente);
  assert.deepEqual(falhou, { codes: ambiente, cacheKeywordId: null, source: "environment", readFailed: true });
});

/* ============================== a tela (modelo) ============================== */

test("tela · \"SERP · K de 4 lentes\", a origem de cada uma e o que veio de um aparelho só", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  banco.tabelas.editorial_workflow_items = banco.tabelas.editorial_workflow_items.filter(linha => linha !== banco.entradaDa("mobile-ios"));
  const { research } = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor({ falha: { "mobile-ios": 500 } }).fetchImpl).deps);
  const cobertura = buildRadarSerpLensCoverage(research);

  assert.equal(cobertura.state, "lensed");
  assert.equal(cobertura.label, "SERP · 3 de 4 lentes");
  assert.deepEqual(cobertura.rows.map(linha => linha.name), ["Desktop · Windows", "Desktop · macOS", "Celular · Android", "Celular · iOS"]);
  assert.equal(cobertura.rows[0].detail, "Cache · pago pelo Minerador");
  assert.match(cobertura.rows[3].detail, /^Faltou: .*HTTP 500/);
  const soNoAndroid = cobertura.exclusive.find(item => item.lens === "mobile-android");
  assert.ok(soNoAndroid?.domains.some(dominio => dominio.includes("so-no-android")), JSON.stringify(cobertura.exclusive));
  assert.equal(cobertura.exclusive.some(item => item.lens === "desktop-macos"), false, "macOS concorda com Windows: nada exclusivo");
  assert.ok(cobertura.notes.some(nota => nota.includes("Celular · iOS não entrou")));
  assert.ok(cobertura.notes.some(nota => nota.includes("não reforço")));
  assert.equal(cobertura.datesSpreadFlagged, false);

  const espalhado = structuredClone(research);
  espalhado.lensSet!.lenses[1].collectedAt = new Date(Date.parse(research.lensSet!.lenses[0].collectedAt!) - 9 * 24 * 60 * 60 * 1000).toISOString();
  const marcado = buildRadarSerpLensCoverage(espalhado);
  assert.equal(marcado.datesSpreadDays, 9);
  assert.equal(marcado.datesSpreadFlagged, true);
  assert.ok(marcado.notes.some(nota => nota.includes("9 dias de diferença")));
  espalhado.lensSet!.lenses[1].collectedAt = new Date(Date.parse(research.lensSet!.lenses[0].collectedAt!) - 7 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(buildRadarSerpLensCoverage(espalhado).datesSpreadFlagged, false, "7 dias ainda não é marcado");

  assert.equal(buildRadarSerpLensCoverage(null).state, "none");
  const confirmacao = radarSerpRecollectConfirmation();
  assert.equal(confirmacao.calls, 4);
  assert.match(confirmacao.message, /até 4 chamadas/);
});

/* =============================== estrutura =============================== */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(new URL(caminho, import.meta.url), "utf8"));

test("estrutura · no núcleo, o cache vem antes da credencial, e quem paga grava como radar", () => {
  const nucleo = ler("../lib/server/radar-serp-lenses.ts");
  const corpo = nucleo.slice(nucleo.indexOf("export async function collectRadarSerpLensSnapshot"));
  const leitura = corpo.indexOf("lookupSerpCache(");
  const credencial = corpo.indexOf("deps.resolveConfig(");
  const pagamento = corpo.indexOf("collectAndCacheSerp(");
  assert.ok(leitura > 0 && credencial > leitura, "cache antes da credencial");
  assert.ok(pagamento > credencial, "e o provider depois dela");
  assert.equal(corpo.indexOf("deps.resolveConfig("), corpo.lastIndexOf("deps.resolveConfig("), "uma resolução por coleta");
  assert.match(corpo, /collectedBy: "radar"/);
  assert.match(corpo, /storeBody: false/);
  assert.match(corpo, /if \(faltas > 0\)/, "sem falta, nenhuma credencial");
});

test("estrutura · na rota, a trava vem antes do núcleo, e \"sem mudança\" responde antes de gravar", () => {
  const rota = ler("../app/api/editorial/serp/route.ts");
  const post = rota.slice(rota.indexOf("export async function POST"));
  const trava = post.indexOf("radarGoogleSerpWriteLock(");
  const nucleo = post.indexOf("collectRadarSerpLensSnapshot(");
  assert.ok(trava > 0 && nucleo > trava, "a trava vem antes do cache e da recoleta");
  assert.ok(post.indexOf("readRadarKeywordTargetCodes(") > trava);
  const semMudanca = post.indexOf("if (lentes.unchanged && previous)");
  const rechecagem = post.indexOf("radarGoogleSerpWriteLockAtSave(input.brandId, input.articleId)");
  const gravacao = post.indexOf("repository.save(input.brandId, record");
  assert.ok(nucleo < semMudanca && semMudanca < rechecagem && rechecagem < gravacao);
  assert.match(post.slice(semMudanca, rechecagem), /return NextResponse\.json\(\{ record: previous/);
  const canonica = post.slice(post.indexOf("const repository = new SerpSnapshotRepository(); const history"));
  assert.equal(/input\.device/.test(canonica), false, "a SERP canônica não lê o device do cliente");
  assert.match(canonica, /recollect: input\.recollect\?\.confirmed === true/);
  assert.match(canonica, /resolveDataForSeoCanonicalSerpCompatibilityConfig\(\{ actorUserId: profile\.userId, brandId: input\.brandId, quotaUnits \}\)/, "a quota é a das faltas");
});

test("R5 · YouTube e Amazon Merchant continuam em lente única: o pedido não ganha device nem os", () => {
  const youtube = buildDataForSeoYoutubeRequest({ keyword: "skincare facial", locationCode: 2076, languageCode: "pt-BR", resultLimit: 20, operationRequestId: "op-yt" });
  const amazon = buildDataForSeoAmazonRequest({ keyword: "skincare facial", locationCode: 2076, languageCode: "pt", depth: 20, operationRequestId: "op-amz" });
  for (const [nome, corpo] of [["youtube", youtube.body[0]], ["amazon", amazon.body[0]]] as const) {
    assert.equal("device" in corpo, false, `${nome} sem device`);
    assert.equal("os" in corpo, false, `${nome} sem os`);
  }
});

test("estrutura · o cliente não escolhe lente e repassa a recoleta confirmada", () => {
  const contexto = ler("../components/editorial-pipeline-context.tsx");
  const coleta = contexto.slice(contexto.indexOf("collectSerp: async"), contexto.indexOf("collectAuxiliarySerp: async"));
  assert.equal(/device:/.test(coleta), false);
  assert.match(coleta, /recollect: options\?\.recollect === true/);
  assert.match(coleta, /options\?\.onOutcome\?\.\(radarSerpCollectOutcome\(body, record\)\)/);
});

/* ======================= correções da revisão do R2 ======================= */

const HORA = 60 * 60 * 1000;

function semLente(banco: Banco, lente: string) {
  banco.tabelas.editorial_workflow_items = banco.tabelas.editorial_workflow_items.filter(linha => linha !== banco.entradaDa(lente));
}

test("proveniência · grava os códigos consultados e de onde vieram, não só o texto do pedido", async () => {
  const banco = new Banco();
  const provider = provedor();
  const { research } = await collectRadarSerpLensSnapshot(entrada(banco, { codes: { locationCode: 2076, languageCode: "EN" }, codesSource: "keyword_targeting" }), dependencias(provider.fetchImpl).deps);
  assert.ok(provider.chamadas.every(chamada => chamada.pedido.language_code === "en"), "a consulta usou o idioma do alvo");
  assert.equal(research.language, "pt-BR", "o campo do snapshot continua o texto do pedido");
  assert.equal(research.cacheProvenance!.languageCode, "en");
  assert.equal(research.cacheProvenance!.locationCode, 2076);
  assert.equal(research.cacheProvenance!.codesSource, "keyword_targeting");

  const doAmbiente = await collectRadarSerpLensSnapshot(entrada(new Banco(), { codesSource: "environment" }), dependencias(provedor().fetchImpl).deps);
  assert.equal(doAmbiente.research.cacheProvenance!.codesSource, "environment");
  assert.equal(doAmbiente.research.cacheProvenance!.languageCode, "pt");
  assert.notEqual(doAmbiente.research.contentHash, research.contentHash, "idioma consultado diferente, hash diferente");

  const semOrigem = await collectRadarSerpLensSnapshot(entrada(new Banco()), dependencias(provedor().fetchImpl).deps);
  assert.equal("codesSource" in semOrigem.research.cacheProvenance!, false, "sem origem declarada, a chave não aparece");

  const anterior = { source: "cache", collectedBy: "minerador", providerRequestId: "t", cacheCollectedAt: "2026-09-20T09:00:00.000Z" };
  const relida = RadarSerpCacheProvenanceSchema.parse(JSON.parse(JSON.stringify(anterior)));
  assert.deepEqual(Object.keys(relida), Object.keys(anterior), "a proveniência gravada antes continua legível e não ganha chave");
  assert.equal(RadarSerpCacheProvenanceSchema.safeParse({ ...anterior, codesSource: "chute" }).success, false);
});

test("proveniência · a versão nova pode trazer SERP mais velha que a anterior; a data da versão fica à parte", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const legado = normalizeDataForSeoSerpResponse(CRU, { ...BUSCA, device: "desktop", operatingSystem: null, resultLimit: 10 }, CONFIG, "2026-09-23T09:30:00.000Z", "tarefa-de-hoje");
  const { research } = await collectRadarSerpLensSnapshot(entrada(banco, { previous: legado }), dependencias(provedor().fetchImpl).deps);
  assert.ok(Date.parse(research.collectedAt) < Date.parse(legado.collectedAt), "a SERP do cache é mais velha que a da versão anterior");
  assert.equal(research.collectedAt, T0.toISOString());
  assert.equal(research.cacheProvenance!.snapshotOpenedAt, T1.toISOString(), "o instante da versão é o do clique");
  const cobertura = buildRadarSerpLensCoverage(research);
  assert.equal(cobertura.serpObservedAt, T0.toISOString());
  assert.equal(cobertura.versionOpenedAt, T1.toISOString());
  const doLegado = buildRadarSerpLensCoverage(legado);
  assert.equal(doLegado.serpObservedAt, legado.collectedAt);
  assert.equal(doLegado.versionOpenedAt, null, "snapshot anterior ao campo não inventa data de versão");
  assert.equal(buildRadarSerpLensCoverage(null).serpObservedAt, null);
});

test("lacuna · lente recusada (40501) não é paga de novo a cada clique, nem depois de um dia", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  semLente(banco, "mobile-ios");
  const recusaIos = () => provedor({ falha: { "mobile-ios": "task" } });

  const p1 = recusaIos();
  const d1 = dependencias(p1.fetchImpl);
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), d1.deps);
  assert.deepEqual(p1.porLente(), ["mobile-ios"]);
  assert.deepEqual(d1.cotas, [1]);
  const ios = primeiro.research.lensSet!.lenses[3];
  assert.equal(ios.status, "missing");
  assert.equal(ios.missingKind, "provider_refused");
  assert.equal(ios.attemptedAt, T1.toISOString());
  assert.ok(buildRadarSerpLensCoverage(primeiro.research).notes.some(nota => nota.includes("A falta é definitiva e não é paga de novo")));

  banco.zerarChamadas();
  const p2 = recusaIos();
  const d2 = dependencias(p2.fetchImpl);
  const segundo = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research }), d2.deps);
  assert.equal(p2.chamadas.length, 0, "a lacuna recente não é paga de novo");
  assert.deepEqual(d2.cotas, [], "nem credencial nem quota");
  assert.deepEqual(d2.usos, []);
  assert.equal(segundo.unchanged, true);
  assert.equal(segundo.unchangedBy, "cache_meta");
  assert.equal(segundo.paidCalls, 0);
  assert.equal(segundo.reusedLensGaps, 1);
  assert.equal(segundo.cacheHits, 3);
  assert.equal(banco.leuCorpo(), false, "sem corpo lido");

  for (const horas of [25, 24 * 5]) {
    const p3 = recusaIos();
    const d3 = dependencias(p3.fetchImpl);
    const depois = await collectRadarSerpLensSnapshot(entrada(banco, { now: new Date(T1.getTime() + horas * HORA), previous: primeiro.research }), d3.deps);
    assert.equal(p3.chamadas.length, 0, `${horas} h depois: "sem mudança" não grava, então nenhuma janela poderia vencer e voltar a cobrar a cada clique`);
    assert.deepEqual(d3.cotas, []);
    assert.equal(depois.unchanged, true);
    assert.equal(depois.reusedLensGaps, 1);
  }

  const p4 = recusaIos();
  const recoleta = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research, recollect: true }), dependencias(p4.fetchImpl).deps);
  assert.equal(p4.chamadas.length, 4, "a recoleta paga ignora a janela");
  assert.equal(recoleta.reusedLensGaps, 0);
});

test("lacuna · a lacuna copiada entra na versão nova quando a canônica muda, com a data da tentativa original", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  semLente(banco, "mobile-ios");
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor({ falha: { "mobile-ios": "task" } }).fetchImpl).deps);
  const outraCanonica = (lente: string, corpo: CorpoDaFixture) => {
    if (lente !== "desktop-windows") return;
    const primeiroOrganico = corpo.tasks[0].result![0].items.find(item => item.type === "organic")!;
    primeiroOrganico.domain = "www.novo-no-topo.com.br";
    primeiroOrganico.url = "https://www.novo-no-topo.com.br/skincare";
  };
  await collectAndCacheSerp(contexto(banco), { query: { keyword: BUSCA.keyword, ...CODIGOS, lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" }, depth: 20, keywordId: KW },
    { config: CONFIG, operationRequestId: "op-minerador-2", collectedBy: "minerador", now: new Date(T1.getTime() + 30 * 60 * 1000), provider: { fetchImpl: provedor({ variante: outraCanonica }).fetchImpl } });
  const provider = provedor({ falha: { "mobile-ios": "task" } });
  const segundo = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research }), dependencias(provider.fetchImpl).deps);
  assert.equal(provider.chamadas.length, 0);
  assert.equal(segundo.unchanged, false, "a canônica mudou: versão nova");
  assert.deepEqual(segundo.research.lensSet!.lenses[3], primeiro.research.lensSet!.lenses[3], "a lacuna é a mesma, copiada");
});

test("lacuna · falha transitória (HTTP 500) é tentada de novo; lente que chegou ao cache é lida, não a lacuna", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  semLente(banco, "mobile-ios");
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor({ falha: { "mobile-ios": 500 } }).fetchImpl).deps);
  assert.equal(primeiro.research.lensSet!.lenses[3].missingKind, "request_failed");
  const p2 = provedor({ falha: { "mobile-ios": 500 } });
  const segundo = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research }), dependencias(p2.fetchImpl).deps);
  assert.deepEqual(p2.porLente(), ["mobile-ios"], "transitória: nova tentativa");
  assert.equal(segundo.reusedLensGaps, 0);

  const recusado = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor({ falha: { "mobile-ios": "task" } }).fetchImpl).deps);
  await collectAndCacheSerp(contexto(banco), { query: { keyword: BUSCA.keyword, ...CODIGOS, lens: SERP_CACHE_LENSES[3], endpoint: "advanced" }, depth: 10, keywordId: KW },
    { config: CONFIG, operationRequestId: "op-minerador-ios", collectedBy: "minerador", now: new Date(T1.getTime() + 10 * 60 * 1000), storeBody: false, provider: { fetchImpl: provedor().fetchImpl } });
  const p3 = provedor({ falha: { "mobile-ios": "task" } });
  const comIos = await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: recusado.research }), dependencias(p3.fetchImpl).deps);
  assert.equal(p3.chamadas.length, 0);
  assert.equal(comIos.reusedLensGaps, 0);
  assert.equal(comIos.research.lensSet!.lenses[3].status, "observed", "a lente do cache vence a lacuna copiada");
  assert.equal(comIos.unchanged, false);
});

test("lacuna · a regra pura: só a definitiva, e a lacuna gravada sem tipo é lida pelo texto do núcleo", () => {
  const base = { lens: "mobile-ios" as const, status: "missing" as const, missingReason: "recusada", source: null, collectedBy: null, collectedAt: null, depth: null, providerRequestId: null };
  const lacuna = (extra: Record<string, unknown>) => RadarSerpLensEntrySchema.parse({ ...base, ...extra });
  assert.equal(radarSerpReusableLensGap(lacuna({ missingKind: "provider_refused", attemptedAt: "2026-09-23T11:00:00+00:00" })), true);
  assert.equal(radarSerpReusableLensGap(lacuna({ missingKind: "no_organic" })), true);
  assert.equal(radarSerpReusableLensGap(lacuna({ missingKind: "request_failed", attemptedAt: "2026-09-23T11:00:00.000Z" })), false, "transitória, tenta");
  assert.equal(radarSerpReusableLensGap(lacuna({ missingKind: "not_observed" })), false);
  assert.equal(radarSerpReusableLensGap(null), false);
  assert.equal(radarSerpLensMissingKindOf(lacuna({ missingReason: "A resposta do provider não é uma SERP. (provider 40501: Invalid Field: 'os'.)" })), "provider_refused", "lacuna gravada sem tipo: a recusa pelo texto");
  assert.equal(radarSerpLensMissingKindOf(lacuna({ missingReason: "A resposta do provider não é uma SERP. (provider 50000: Internal Error.)" })), "request_failed");
  assert.equal(radarSerpLensMissingKindOf(lacuna({ missingReason: RADAR_SERP_NO_ORGANIC_REASON })), "no_organic");
  assert.equal(radarSerpLensMissingKindOf(lacuna({ missingReason: "DataForSEO respondeu HTTP 500." })), "request_failed");
  assert.equal(radarSerpLensMissingKindOf(lacuna({ missingKind: "request_failed", missingReason: "(provider 40501: x)" })), "request_failed", "o tipo gravado vence o texto");

  const observada = { lens: "mobile-ios", status: "observed", missingReason: null, source: "cache", collectedBy: "minerador", collectedAt: "2026-09-20T09:00:00.000Z", depth: 10, providerRequestId: "t",
    observation: { lens: "mobile-ios", depth: 10, competitorDomains: [], organicCount: 1, itemTypes: [], questions: [], relatedSearches: [], aiOverviewDomains: [], commercialSignals: false } };
  assert.equal(RadarSerpLensEntrySchema.safeParse(observada).success, true);
  assert.equal(RadarSerpLensEntrySchema.safeParse({ ...observada, missingKind: "provider_refused" }).success, false, "observada não tem tipo de falta");
  assert.equal(RadarSerpLensEntrySchema.safeParse({ ...observada, attemptedAt: "2026-09-20T09:00:00.000Z" }).success, false);

  const conjunto = RadarSerpLensSetSchema.parse({ version: "radar-lens-set-v1", lenses: ROTULOS.map((lens, indice) => indice === 3
    ? { ...base, missingKind: "provider_refused", attemptedAt: "2026-09-23T11:00:00.000Z" }
    : { ...observada, lens, providerRequestId: `t-${indice}`, observation: { ...observada.observation, lens } }) });
  const hits = ROTULOS.map((_, indice) => indice === 3 ? null : { providerRequestId: `t-${indice}`, collectedAt: "2026-09-20T09:00:00.000Z" });
  assert.equal(radarSerpLensSetMatchesCache(conjunto, hits), false, "sem a lacuna reaproveitável, a falta é tentada");
  assert.equal(radarSerpLensSetMatchesCache(conjunto, hits, [false, false, false, true]), true);
  assert.equal(radarSerpLensSetMatchesCache(conjunto, hits.map((hit, indice) => indice === 3 ? { providerRequestId: "nova", collectedAt: "2026-09-23T11:30:00.000Z" } : hit), [false, false, false, true]), false, "a lente chegou ao cache: lê");
});

test("cache indisponível · as quatro lentes são pagas e a resposta diz que o cache falhou", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const executar = banco.executar.bind(banco);
  banco.executar = (consulta: Consulta) => {
    if (consulta.op === "select" && consulta.tabela === "editorial_workflow_items") {
      banco.chamadas.push(consulta);
      return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
    }
    return executar(consulta);
  };
  const provider = provedor();
  const { deps, cotas, usos } = dependencias(provider.fetchImpl);
  const resultado = await collectRadarSerpLensSnapshot(entrada(banco), deps);
  assert.equal(resultado.cacheReadFailed, true);
  assert.deepEqual(cotas, [4], "sem saber o que existe, as quatro são faltas");
  assert.equal(provider.chamadas.length, 4);
  assert.equal(usos.length, 4);
  assert.equal(resultado.paidCalls, 4);
  assert.equal(resultado.cacheHits, 0);
});

test("estrutura · a rota grava a origem dos códigos e devolve cache indisponível e lacunas copiadas", () => {
  const rota = ler("../app/api/editorial/serp/route.ts");
  const chamada = rota.slice(rota.indexOf("await collectRadarSerpLensSnapshot("), rota.indexOf("const coberturaDasLentes"));
  assert.match(chamada, /codesSource: alvo\.source/);
  const cobertura = rota.slice(rota.indexOf("const coberturaDasLentes"), rota.indexOf("if (lentes.unchanged && previous)"));
  assert.match(cobertura, /cacheReadFailed: lentes\.cacheReadFailed/);
  assert.match(cobertura, /reusedLensGaps: lentes\.reusedLensGaps/);
  assert.match(rota.slice(rota.indexOf("if (lentes.unchanged && previous)")), /lensCoverage: coberturaDasLentes/);
});

test("lacuna · task 50xxx do provider é transitória: vira request_failed e é tentada de novo", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  semLente(banco, "mobile-ios");
  const erroInterno = (lente: string, corpo: CorpoDaFixture) => {
    if (lente !== "mobile-ios") return;
    corpo.tasks[0].status_code = 50000;
    corpo.tasks[0].status_message = "Internal Error.";
    corpo.tasks[0].result = null;
  };
  const primeiro = await collectRadarSerpLensSnapshot(entrada(banco), dependencias(provedor({ variante: erroInterno }).fetchImpl).deps);
  const ios = primeiro.research.lensSet!.lenses[3];
  assert.equal(ios.status, "missing");
  assert.match(ios.missingReason!, /50000/);
  assert.equal(ios.missingKind, "request_failed");
  const p2 = provedor({ variante: erroInterno });
  await collectRadarSerpLensSnapshot(entrada(banco, { now: T2, previous: primeiro.research }), dependencias(p2.fetchImpl).deps);
  assert.deepEqual(p2.porLente(), ["mobile-ios"]);
});
