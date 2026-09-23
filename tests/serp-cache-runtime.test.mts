import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SERP_CACHE_CANONICAL_LENS, SERP_CACHE_LENSES, SerpOrganicDigestSchema, serpCacheLensLabel, serpCacheSubjectId, type SerpCacheLens, type SerpCacheQuery } from "../lib/editorial/serp-cache.ts";
import { DataForSeoSerpError, type DataForSeoSerpConfig } from "../lib/minerador/dataforseo-serp-core.ts";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheRequest } from "../lib/server/serp-cache.ts";
import type { SerpCacheContext } from "../lib/server/serp-cache-store.ts";
import {
  SERP_LENS_COVERAGE_CONCURRENCY,
  SERP_LENS_COVERAGE_DEPTH,
  SERP_LENS_COVERAGE_LENSES,
  countSerpLensOutcomes,
  createSerpLensCoverage,
  planSerpLensCoverage,
  serpLensDerivationInputs,
  type SerpLensCoverageTarget,
} from "../lib/server/minerador-serp-lens-coverage.ts";
import { deriveSerpSemanticEvidence, deriveSerpSemanticEvidenceAcrossLenses, type SerpLensSource } from "../lib/minerador/serp-semantic-evidence.ts";
import { buildKeywordSemanticQualification, parseKeywordSemanticQualification, repeatsCurrentSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";

/**
 * O CACHE DE SERP EXECUTADO DE VERDADE — núcleo e store, sem ler código como texto.
 *
 * `lib/server/serp-cache.ts` e `serp-cache-store.ts` começam com
 * `import "server-only"`; este arquivo roda com `--conditions=react-server`
 * (script `test:serp-cache`), que resolve esse import para o módulo vazio.
 *
 * O banco é uma tabela em memória atrás de um cliente com a mesma forma do
 * `postgrest-js` (select/eq/in/insert/update/maybeSingle); o provider é um
 * `fetch` falso com o corpo REAL do fixture. Nenhuma chamada paga, nenhum
 * banco remoto.
 */

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const CONFIG: DataForSeoSerpConfig = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };
const T1 = new Date("2026-09-23T10:00:00.000Z");
const T2 = new Date("2026-09-23T10:05:00.000Z");
const DEPOIS = new Date("2026-09-23T12:00:00.000Z");

/* ------------------------------ banco em memória ----------------------------- */

type Linha = Record<string, unknown> & { id: string; lock_version: number };
type Filtro = { coluna: string; tipo: "eq" | "in"; valor: unknown };
type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

class Consulta {
  op: "select" | "insert" | "update" = "select";
  colunas = "";
  filtros: Filtro[] = [];
  valores: Record<string, unknown> | null = null;
  unica = false;
  // Sem propriedade de parâmetro: o `node --test` só apaga tipos, não transpila.
  readonly banco: Banco;
  readonly tabela: string;
  constructor(banco: Banco, tabela: string) {
    this.banco = banco;
    this.tabela = tabela;
  }
  select(colunas: string) { this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "eq", valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, tipo: "in", valor }); return this; }
  insert(valores: Record<string, unknown>) { this.op = "insert"; this.valores = valores; return this; }
  update(valores: Record<string, unknown>) { this.op = "update"; this.valores = valores; return this; }
  maybeSingle() { this.unica = true; return this; }
  then<A, B = never>(resolve: (valor: Resposta) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
  filtro(coluna: string) { return this.filtros.find(item => item.coluna === coluna)?.valor; }
}

/** `payload->meta->>collectedAt` → caminho no objeto; `->>` devolve texto. */
function projetar(linha: Linha, colunas: string) {
  return Object.fromEntries(colunas.split(",").map(item => {
    const [apelido, caminho] = item.includes(":") ? item.split(":") : [item, item];
    const partes = caminho.split(/->>?/);
    let valor: unknown = linha;
    for (const parte of partes) valor = valor && typeof valor === "object" ? (valor as Record<string, unknown>)[parte] : undefined;
    if (caminho.includes("->>") && valor !== undefined && valor !== null) valor = String(valor);
    return [apelido, valor ?? null];
  }));
}

class Banco {
  linhas: Linha[] = [];
  chamadas: Consulta[] = [];
  falha: ((consulta: Consulta) => Resposta["error"]) | null = null;
  private proximo = 1;
  from(tabela: string) { return new Consulta(this, tabela); }
  private casa(linha: Linha, filtros: Filtro[]) {
    return filtros.every(({ coluna, tipo, valor }) => tipo === "eq" ? linha[coluna] === valor : (valor as unknown[]).includes(linha[coluna]));
  }
  executar(consulta: Consulta): Resposta {
    this.chamadas.push(consulta);
    const erro = this.falha?.(consulta);
    if (erro) return { data: null, error: erro };
    if (consulta.op === "insert") {
      const valores = consulta.valores!;
      const duplicada = this.linhas.some(linha => ["marca_id", "subject_type", "subject_id", "stage"].every(chave => linha[chave] === valores[chave]));
      if (duplicada) return { data: null, error: { code: "23505", message: "duplicate key" } };
      const linha: Linha = { ...structuredClone(valores), id: `linha-${this.proximo++}`, lock_version: 1 };
      this.linhas.push(linha);
      return { data: projetar(linha, consulta.colunas), error: null };
    }
    const alvo = this.linhas.filter(linha => this.casa(linha, consulta.filtros));
    if (consulta.op === "update") {
      for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: linha.lock_version + 1 });
    }
    const projetadas = alvo.map(linha => projetar(linha, consulta.colunas));
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
  linhaDe(subjectId: string) { return this.linhas.find(linha => linha.subject_id === subjectId); }
}

const contexto = (banco: Banco, brandId = "marca-a"): SerpCacheContext => ({
  supabase: banco as unknown as SerpCacheContext["supabase"],
  brandId,
  actorUserId: "usuario-1",
});

/* --------------------------------- provider --------------------------------- */

const respostaDo = (status: number, corpo: unknown): typeof fetch => async () =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const consulta: SerpCacheQuery = { keyword: "skincare facial", locationCode: 2076, languageCode: "pt", lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" };
const pedido = (overrides: Partial<SerpCacheRequest> = {}): SerpCacheRequest => ({ query: consulta, depth: 20, keywordId: "kw-1", ...overrides });

const coletar = (banco: Banco, fetchImpl: typeof fetch, now: Date, overrides: Partial<SerpCacheRequest> = {}, brandId = "marca-a") =>
  collectAndCacheSerp(contexto(banco, brandId), pedido(overrides), { config: CONFIG, operationRequestId: "op-1", collectedBy: "minerador", now, provider: { fetchImpl } });

const semOrganicos = () => {
  const corpo = structuredClone(CRU);
  corpo.tasks[0].result[0].items = [];
  corpo.tasks[0].result[0].item_types = [];
  return corpo;
};

const organicos = (corpo: unknown) =>
  ((corpo as { tasks: Array<{ result: Array<{ items: Array<{ type: string }> }> }> }).tasks[0].result[0].items || []).filter(item => item.type === "organic").length;

/* ----------------------------------- coleta ---------------------------------- */

test("coleta boa: grava uma vez, na marca, presa à keyword, e o banco devolve só id,lock_version", async () => {
  const banco = new Banco();
  const coleta = await coletar(banco, respostaDo(200, CRU), T1);
  assert.equal(coleta.write, "created");
  assert.equal(coleta.writeError, null);
  assert.ok(coleta.observation && coleta.observation.organicCount > 0);
  // Quem chamou recebe o corpo CRU, como antes do cache.
  assert.deepEqual(coleta.body, CRU);

  const linha = banco.linhaDe(serpCacheSubjectId(consulta))!;
  assert.ok(linha, "a entrada existe");
  assert.equal(linha.marca_id, "marca-a");
  assert.equal(linha.source_entity_id, "kw-1");
  const payload = linha.payload as { meta: { keywordId: string; collectedAt: string }; body: unknown };
  assert.equal(payload.meta.keywordId, "kw-1");
  assert.equal(payload.meta.collectedAt, T1.toISOString());
  // Grava o corpo podado, nunca o cru.
  assert.ok(JSON.stringify(payload.body).length < JSON.stringify(CRU).length * 0.45);

  const insert = banco.chamadas.find(item => item.op === "insert")!;
  assert.equal(insert.colunas, "id,lock_version");
  // Toda leitura e escrita é da marca (R4).
  for (const chamada of banco.chamadas) {
    if (chamada.op === "insert") assert.equal(chamada.valores?.marca_id, "marca-a");
    else assert.equal(chamada.filtro("marca_id"), "marca-a");
  }
});

test("task recusada (40501): NÃO lança, devolve o diagnóstico do provider e não toca o banco", async () => {
  const banco = new Banco();
  const corpo = { status_code: 20000, status_message: "Ok.", tasks: [{ id: "task-40501", status_code: 40501, status_message: "Invalid Field: 'os'.", result: null }] };
  const coleta = await coletar(banco, respostaDo(200, corpo), T1);
  assert.equal(coleta.observation, null);
  assert.match(coleta.observationError || "", /\S/);
  assert.equal(coleta.write, "skipped");
  assert.equal(coleta.diagnostic.taskStatusCode, 40501);
  assert.equal(coleta.diagnostic.taskStatusMessage, "Invalid Field: 'os'.");
  assert.equal(coleta.providerRequestId, "task-40501");
  assert.deepEqual(coleta.body, corpo, "o corpo cru segue para quem chama, que recusa como antes");
  assert.equal(banco.chamadas.length, 0, "corpo recusado nunca é gravado");
});

test("status raiz inválido (40100): também volta com diagnóstico e sem gravar", async () => {
  const banco = new Banco();
  const coleta = await coletar(banco, respostaDo(200, { status_code: 40100, status_message: "You are not authorized.", tasks: [] }), T1);
  assert.equal(coleta.observation, null);
  assert.equal(coleta.write, "skipped");
  assert.equal(coleta.diagnostic.rootStatusCode, 40100);
  assert.equal(banco.chamadas.length, 0);
});

test("SERP sem nenhum orgânico: devolve a observação, mas não vira acerto de 30 dias", async () => {
  const banco = new Banco();
  const coleta = await coletar(banco, respostaDo(200, semOrganicos()), T1);
  assert.ok(coleta.observation, "uma SERP vazia é uma observação válida");
  assert.equal(coleta.observation!.organicCount, 0);
  assert.equal(coleta.write, "skipped");
  assert.equal(banco.chamadas.length, 0);
});

test("HTTP 500 continua lançando na própria chamada, como antes do cache", async () => {
  const banco = new Banco();
  await assert.rejects(coletar(banco, respostaDo(500, "{}"), T1), (erro: unknown) => erro instanceof DataForSeoSerpError && erro.code === "dataforseo_http");
  assert.equal(banco.chamadas.length, 0);
});

test("gravação que falha não derruba quem chamou: a SERP já está na mão", async () => {
  const banco = new Banco();
  banco.falha = chamada => chamada.op === "insert" ? { code: "XX000", message: "banco fora" } : null;
  const coleta = await coletar(banco, respostaDo(200, CRU), T1);
  assert.equal(coleta.write, "failed");
  assert.match(coleta.writeError || "", /banco fora/);
  assert.ok(coleta.observation && coleta.observation.organicCount > 0);
  assert.equal(banco.linhas.length, 0);
});

/* ---------------------------------- gravação --------------------------------- */

test("coleta sem keyword HERDA a keyword da entrada que sucede — na meta e na origem", async () => {
  const banco = new Banco();
  await coletar(banco, respostaDo(200, CRU), T1, { keywordId: "kw-1" });
  // A pergunta territorial paga o mesmo texto depois, sem keyword do acervo.
  const territorial = await coletar(banco, respostaDo(200, CRU), T2, { keywordId: null });
  assert.equal(territorial.write, "updated");
  const linha = banco.linhaDe(serpCacheSubjectId(consulta))!;
  assert.equal(linha.source_entity_id, "kw-1", "a exclusão da keyword continua levando a entrada");
  const meta = (linha.payload as { meta: { keywordId: string | null; collectedAt: string } }).meta;
  assert.equal(meta.keywordId, "kw-1");
  assert.equal(meta.collectedAt, T2.toISOString(), "a coleta é a nova; só o vínculo é herdado");
});

test("entrada sem keyword sucedida por outra sem keyword continua sem keyword", async () => {
  const banco = new Banco();
  await coletar(banco, respostaDo(200, CRU), T1, { keywordId: null });
  await coletar(banco, respostaDo(200, CRU), T2, { keywordId: null });
  const linha = banco.linhaDe(serpCacheSubjectId(consulta))!;
  assert.equal(linha.source_entity_id, serpCacheSubjectId(consulta));
  assert.equal((linha.payload as { meta: { keywordId: string | null } }).meta.keywordId, null);
});

test("o cache só anda para a frente: coleta mais velha não sobrescreve a mais nova", async () => {
  const banco = new Banco();
  await coletar(banco, respostaDo(200, CRU), T2);
  // A requisição que começou antes (T1) termina depois.
  const atrasada = await coletar(banco, respostaDo(200, CRU), T1);
  assert.equal(atrasada.write, "concurrent");
  assert.equal(banco.chamadas.filter(item => item.op === "update").length, 0);
  const meta = (banco.linhaDe(serpCacheSubjectId(consulta))!.payload as { meta: { collectedAt: string } }).meta;
  assert.equal(meta.collectedAt, T2.toISOString());
  // A procura lê só o lock, a origem e a data — nunca o payload.
  const procura = banco.chamadas.filter(item => item.op === "select" && item.unica);
  assert.ok(procura.length > 0);
  for (const item of procura) assert.equal(item.colunas, "id,lock_version,source_entity_id,collectedAt:payload->meta->>collectedAt");
});

/* ---------------------------------- leitura ---------------------------------- */

test("refresh não lê nada: tudo é falta, com o motivo dito", async () => {
  const banco = new Banco();
  await coletar(banco, respostaDo(200, CRU), T1);
  banco.chamadas = [];
  const [consultado] = await lookupSerpCache(contexto(banco), [pedido()], { mode: "body", now: DEPOIS, refresh: true });
  assert.equal(consultado.hit, null);
  assert.equal(consultado.missReason, "recoleta pedida");
  assert.equal(banco.chamadas.length, 0, "pagar de novo é a decisão: nem o banco é lido");
});

test("acerto: cada modo lê só as suas colunas, na marca, e a entrada de 20 atende o pedido de 10 recortada", async () => {
  const banco = new Banco();
  await coletar(banco, respostaDo(200, CRU), T1);
  banco.chamadas = [];

  const [porObservacao] = await lookupSerpCache(contexto(banco), [pedido({ depth: 10 })], { mode: "observation", now: DEPOIS });
  assert.ok(porObservacao.hit?.observation);
  assert.equal(porObservacao.hit?.body, undefined, "quem agrupa não recebe corpo (R8)");

  const [porMeta] = await lookupSerpCache(contexto(banco), [pedido({ depth: 10 })], { mode: "meta", now: DEPOIS });
  assert.ok(porMeta.hit);
  assert.equal(porMeta.hit?.observation, undefined);
  assert.equal(porMeta.hit?.body, undefined);

  const [porCorpo] = await lookupSerpCache(contexto(banco), [pedido({ depth: 10 })], { mode: "body", now: DEPOIS });
  assert.ok(porCorpo.hit?.body);
  assert.ok(organicos(CRU) > 10, "o fixture tem mais de 10 orgânicos");
  assert.equal(organicos(porCorpo.hit!.body), 10, "devolvido como o provider devolveria um pedido de 10");

  const colunas = banco.chamadas.map(item => item.colunas);
  assert.deepEqual(colunas, [
    "subject_id,meta:payload->meta,observation:payload->observation",
    "subject_id,meta:payload->meta",
    "subject_id,meta:payload->meta,body:payload->body",
  ]);
  for (const chamada of banco.chamadas) {
    assert.equal(chamada.filtro("marca_id"), "marca-a");
    assert.equal(chamada.filtro("subject_type"), "serp_cache_entry");
    assert.equal(chamada.filtro("stage"), "minerador");
  }
});

test("a entrada de uma marca nunca atende outra", async () => {
  const banco = new Banco();
  await coletar(banco, respostaDo(200, CRU), T1, {}, "marca-a");
  const [daOutra] = await lookupSerpCache(contexto(banco, "marca-b"), [pedido()], { mode: "meta", now: DEPOIS });
  assert.equal(daOutra.hit, null);
  assert.equal(daOutra.missReason, "sem entrada");
});

test("entrada vencida, de outra lente ou mais rasa que o pedido é falta", async () => {
  const banco = new Banco();
  await coletar(banco, respostaDo(200, CRU), T1, { depth: 10 });
  const trintaEUmDias = new Date(T1.getTime() + 31 * 24 * 60 * 60 * 1000);
  const [vencida] = await lookupSerpCache(contexto(banco), [pedido({ depth: 10 })], { mode: "meta", now: trintaEUmDias });
  assert.equal(vencida.hit, null);
  const [maisFunda] = await lookupSerpCache(contexto(banco), [pedido({ depth: 20 })], { mode: "meta", now: DEPOIS });
  assert.equal(maisFunda.hit, null, "a coleta de 10 não serve quem pede 20");
  const [outraLente] = await lookupSerpCache(contexto(banco), [pedido({ depth: 10, query: { ...consulta, lens: { device: "mobile", operatingSystem: "ios" } } })], { mode: "meta", now: DEPOIS });
  assert.equal(outraLente.hit, null);
});

test("leitura que falha LANÇA: é a rota que decide pagar como antes", async () => {
  const banco = new Banco();
  banco.falha = () => ({ code: "57014", message: "statement timeout" });
  await assert.rejects(lookupSerpCache(contexto(banco), [pedido()], { mode: "meta", now: DEPOIS }), /statement timeout/);
});

/* ------------------------------ as quatro lentes ------------------------------ */

/*
 * Decisão do usuário (2026-09-23): a SERP paga vai para o cache desde a
 * primeira vez, na Descoberta ou no Processador, nas QUATRO lentes. A rota de
 * Resultados paga a canônica pela CALL 3 (corpo, 20) e as outras três por
 * `minerador-serp-lens-coverage` (sem corpo, 10). Aqui as duas partes rodam
 * como a rota as roda, contra o banco em memória e um provider falso.
 */

type PedidoAoProvider = { url: string; keyword: string; device: string; os: string | undefined; depth: number };

/** Provider falso que registra cada pedido e devolve o corpo real, com a keyword e a lente pedidas. */
function providerFalso(opcoes: { falharEm?: (pedido: PedidoAoProvider) => "http500" | "40501" | null; atrasoMs?: number } = {}) {
  const pedidos: PedidoAoProvider[] = [];
  const estado = { emVoo: 0, maxEmVoo: 0, tarefas: 0 };
  const fetchImpl: typeof fetch = async (url, init) => {
    const [corpo] = JSON.parse(String(init?.body)) as Array<{ keyword: string; device: string; os?: string; depth: number }>;
    const registrado: PedidoAoProvider = { url: String(url), keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth };
    pedidos.push(registrado);
    estado.emVoo += 1;
    estado.maxEmVoo = Math.max(estado.maxEmVoo, estado.emVoo);
    try {
      if (opcoes.atrasoMs) await new Promise(resolve => setTimeout(resolve, opcoes.atrasoMs));
      const falha = opcoes.falharEm?.(registrado) ?? null;
      if (falha === "http500") return new Response("{}", { status: 500, headers: { "Content-Type": "application/json" } });
      estado.tarefas += 1;
      const resposta = structuredClone(CRU);
      resposta.tasks[0].id = `task-${estado.tarefas}`;
      resposta.tasks[0].data = { ...resposta.tasks[0].data, keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth };
      resposta.tasks[0].result[0].keyword = corpo.keyword;
      if (falha === "40501") {
        resposta.tasks[0].status_code = 40501;
        resposta.tasks[0].status_message = "Invalid Field: 'os'.";
        resposta.tasks[0].result = null;
      }
      return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
    } finally {
      estado.emVoo -= 1;
    }
  };
  return { fetchImpl, pedidos, estado };
}

const alvo = (overrides: Partial<SerpLensCoverageTarget> = {}): SerpLensCoverageTarget => ({
  targetId: "alvo-1", keyword: "skincare facial", keywordId: "kw-1", locationCode: 2076, languageCode: "pt", ...overrides,
});
const CODIGOS = { locationCode: 2076, languageCode: "pt" };

/** A CALL 3 como a rota a paga: lente canônica, `advanced`, 20, com corpo. */
const pedidoCanonico = (keyword = "skincare facial", keywordId: string | null = "kw-1"): SerpCacheRequest => ({
  query: { keyword, locationCode: 2076, languageCode: "pt", lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" },
  depth: 20,
  keywordId,
});

/** Uma execução de Resultados para os alvos: CALL 3 pelo cache + as três lentes. */
async function executarResultados(banco: Banco, provider: ReturnType<typeof providerFalso>, now: Date, alvos = [alvo()], opcoes: { quotaCovered?: boolean; quotaBudget?: number } = {}) {
  const ctx = contexto(banco);
  const canonicas = await lookupSerpCache(ctx, alvos.map(item => pedidoCanonico(item.keyword, item.keywordId)), { mode: "body", now });
  for (const [indice, consultaCanonica] of canonicas.entries()) {
    if (!consultaCanonica.hit?.body) await collectAndCacheSerp(ctx, pedidoCanonico(alvos[indice].keyword, alvos[indice].keywordId), { config: CONFIG, operationRequestId: "op-1", collectedBy: "minerador", now, provider: { fetchImpl: provider.fetchImpl } });
  }
  const plano = await planSerpLensCoverage(ctx, alvos, { now });
  const cobertura = createSerpLensCoverage(ctx, plano, { config: CONFIG, operationRequestId: "op-1", now, quotaCovered: opcoes.quotaCovered ?? true, quotaBudget: opcoes.quotaBudget, provider: { fetchImpl: provider.fetchImpl } });
  const resultados = [];
  for (const item of alvos) resultados.push(await cobertura.ensure(item.targetId, CODIGOS));
  return { plano, resultados };
}

const lenteDe = (pedidoFeito: PedidoAoProvider) => `${pedidoFeito.device}-${pedidoFeito.os}`;
const linhaDaLente = (banco: Banco, lens: SerpCacheLens, keyword = "skincare facial") =>
  banco.linhaDe(serpCacheSubjectId({ keyword, locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced" }));

test("quatro lentes: as três extras são as do produto menos a canônica, a 10 resultados e com concorrência 3", () => {
  assert.deepEqual(SERP_LENS_COVERAGE_LENSES.map(serpCacheLensLabel), ["desktop-macos", "mobile-android", "mobile-ios"]);
  assert.equal(SERP_LENS_COVERAGE_LENSES.length + 1, SERP_CACHE_LENSES.length);
  assert.equal(SERP_LENS_COVERAGE_DEPTH, 10, "a menor profundidade que atende formação, territorial e SERP por keyword");
  assert.equal(SERP_LENS_COVERAGE_CONCURRENCY, 3, "o CONCURRENCY das rotas de SERP do Arquiteto");
});

test("primeira execução: as 4 lentes pedidas por keyword, 4 chamadas pagas, canônica com corpo e as outras sem", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  const { plano, resultados } = await executarResultados(banco, provider, T1);

  assert.equal(provider.pedidos.length, 4, "uma chamada por lente");
  assert.deepEqual(provider.pedidos.map(lenteDe).sort(), ["desktop-macos", "desktop-windows", "mobile-android", "mobile-ios"]);
  for (const feito of provider.pedidos) {
    assert.match(feito.url, /\/v3\/serp\/google\/organic\/live\/advanced$/, "mesmo endpoint advanced nas 4");
    assert.equal(feito.keyword, "skincare facial");
    assert.equal(feito.depth, feito.os === "windows" ? 20 : 10, "canônica a 20, as outras a 10");
  }
  assert.equal(plano.missingQueries, 3, "a quota conta as três lentes extras que faltam");
  assert.deepEqual(resultados[0].map(item => [item.lens, item.source, item.paid, item.stored]), [
    ["desktop-macos", "collected", true, true],
    ["mobile-android", "collected", true, true],
    ["mobile-ios", "collected", true, true],
  ]);
  assert.equal(resultados[0].reduce((total, item) => total + (item.cost ?? 0), 0), 0.0035 * 3, "o custo de cada task paga vai para o uso");

  assert.equal(banco.linhas.length, 4, "quatro entradas no cache da marca");
  const canonica = linhaDaLente(banco, SERP_CACHE_CANONICAL_LENS)!.payload as { meta: { depth: number }; body?: unknown };
  assert.ok(canonica.body, "a canônica guarda o corpo: a Qualificação e o Arquiteto o leem");
  assert.equal(canonica.meta.depth, 20);
  for (const lens of SERP_LENS_COVERAGE_LENSES) {
    const payload = linhaDaLente(banco, lens)!.payload as { meta: { depth: number; collectedBy: string; lens: SerpCacheLens }; observation: { organicCount: number }; body?: unknown };
    assert.equal("body" in payload, false, `${serpCacheLensLabel(lens)} sem leitor de corpo: grava só meta e observação`);
    assert.equal(payload.meta.depth, 10);
    assert.equal(payload.meta.collectedBy, "minerador");
    assert.deepEqual(payload.meta.lens, lens);
    assert.ok(payload.observation.organicCount > 0, "a observação que a SERP por keyword lê está lá");
  }
});

test("segunda execução com tudo em cache: nenhuma chamada paga, e as três extras são lidas só em modo digest", async () => {
  const banco = new Banco();
  await executarResultados(banco, providerFalso(), T1);
  banco.chamadas = [];
  const provider = providerFalso();
  const { plano, resultados } = await executarResultados(banco, provider, DEPOIS);

  assert.equal(provider.pedidos.length, 0, "nenhuma chamada paga");
  assert.equal(plano.missingQueries, 0, "a quota não pede unidade de lente");
  assert.ok(resultados[0].every(item => item.source === "cache" && !item.paid && item.stored));
  const leituras = banco.chamadas.filter(item => item.op === "select" && !item.unica).map(item => item.colunas);
  // Mudou em 2026-09-23 (adendo das 4 lentes, §3): a intenção e o funil leem as
  // extras pelo digest; a MESMA leitura do plano entrega o digest do acerto.
  assert.deepEqual(leituras, [
    "subject_id,meta:payload->meta,body:payload->body",
    "subject_id,meta:payload->meta,digest:payload->digest",
  ], "uma leitura de corpo (a canônica) e uma de digest para as três extras — nunca observação nem corpo delas");
  assert.equal(banco.chamadas.filter(item => item.op !== "select").length, 0, "nada é regravado");
  assert.ok(resultados[0].every(item => item.digest && item.digest.organic.length > 0), "o acerto entrega o digest gravado");
});

test("só as lentes faltantes ou vencidas são pagas", async () => {
  const banco = new Banco();
  await executarResultados(banco, providerFalso(), T1);
  // mobile-ios some; mobile-android envelhece além dos 30 dias.
  banco.linhas = banco.linhas.filter(linha => linha !== linhaDaLente(banco, { device: "mobile", operatingSystem: "ios" }));
  const android = linhaDaLente(banco, { device: "mobile", operatingSystem: "android" })!;
  (android.payload as { meta: { collectedAt: string } }).meta.collectedAt = "2026-08-01T00:00:00.000Z";

  const provider = providerFalso();
  const { plano, resultados } = await executarResultados(banco, provider, DEPOIS);
  assert.equal(plano.missingQueries, 2);
  assert.deepEqual(provider.pedidos.map(lenteDe).sort(), ["mobile-android", "mobile-ios"], "a canônica e a macos vêm do cache");
  assert.deepEqual(resultados[0].map(item => [item.lens, item.source]), [["desktop-macos", "cache"], ["mobile-android", "collected"], ["mobile-ios", "collected"]]);
});

test("leitura em modo body de uma entrada sem corpo é FALTA; quem precisa do corpo paga e grava a entrada completa", async () => {
  const banco = new Banco();
  await executarResultados(banco, providerFalso(), T1);
  const android: SerpCacheRequest = { query: { ...consulta, lens: { device: "mobile", operatingSystem: "android" } }, depth: 10, keywordId: "kw-1" };

  // A SERP por keyword (modo observation) e a formação na leitura meta são atendidas…
  const [porObservacao] = await lookupSerpCache(contexto(banco), [android], { mode: "observation", now: DEPOIS });
  assert.ok(porObservacao.hit?.observation, "a SERP por keyword do Arquiteto não paga de novo");
  const [porMeta] = await lookupSerpCache(contexto(banco), [android], { mode: "meta", now: DEPOIS });
  assert.ok(porMeta.hit);
  // …mas quem normaliza o corpo (formação ou territorial com device=mobile) não recebe acerto.
  const [porCorpo] = await lookupSerpCache(contexto(banco), [android], { mode: "body", now: DEPOIS });
  assert.equal(porCorpo.hit, null);
  assert.equal(porCorpo.missReason, "sem entrada");

  // A falta paga como o Arquiteto paga (com corpo) e a entrada passa a ter corpo.
  const provider = providerFalso();
  const coleta = await collectAndCacheSerp(contexto(banco), android, { config: CONFIG, operationRequestId: "op-2", collectedBy: "arquiteto", now: DEPOIS, provider: { fetchImpl: provider.fetchImpl } });
  assert.equal(coleta.write, "updated");
  assert.equal(provider.pedidos.length, 1);
  const [depois] = await lookupSerpCache(contexto(banco), [android], { mode: "body", now: DEPOIS });
  assert.ok(depois.hit?.body, "a próxima leitura de corpo é acerto");
});

test("escrita sem corpo NUNCA apaga o corpo de uma entrada que ainda vale — nem na corrida", async () => {
  const ios: SerpCacheLens = { device: "mobile", operatingSystem: "ios" };
  const pedidoIos: SerpCacheRequest = { query: { ...consulta, lens: ios }, depth: 10, keywordId: "kw-1" };
  const semCorpo = (banco: Banco, now: Date) => collectAndCacheSerp(contexto(banco), pedidoIos, { config: CONFIG, operationRequestId: "op-2", collectedBy: "minerador", now, storeBody: false, provider: { fetchImpl: providerFalso().fetchImpl } });

  // 1. O Arquiteto gravou a lente com corpo; o Minerador paga a mesma chave depois (corrida entre consulta e gravação).
  const banco = new Banco();
  await collectAndCacheSerp(contexto(banco), pedidoIos, { config: CONFIG, operationRequestId: "op-1", collectedBy: "arquiteto", now: T1, provider: { fetchImpl: providerFalso().fetchImpl } });
  banco.chamadas = [];
  const mantida = await semCorpo(banco, T2);
  assert.equal(mantida.write, "kept");
  const payload = linhaDaLente(banco, ios)!.payload as { meta: { collectedAt: string; collectedBy: string }; body?: unknown };
  assert.ok(payload.body, "o corpo continua lá");
  assert.equal(payload.meta.collectedAt, T1.toISOString());
  assert.equal(payload.meta.collectedBy, "arquiteto");
  assert.equal(banco.chamadas.filter(item => item.op === "update").length, 0);
  // A procura pergunta pelo marcador do corpo, nunca pelo corpo.
  assert.deepEqual(banco.chamadas.filter(item => item.unica && item.op === "select").map(item => item.colunas), [
    "id,lock_version,source_entity_id,collectedAt:payload->meta->>collectedAt,bodyStatus:payload->body->>status_code,bodyDepth:payload->meta->>depth",
  ]);

  // 2. Com corpo mas VENCIDA: nenhum leitor a aceitaria; a escrita sem corpo a sucede.
  const vencida = new Banco();
  await collectAndCacheSerp(contexto(vencida), pedidoIos, { config: CONFIG, operationRequestId: "op-1", collectedBy: "arquiteto", now: T1, provider: { fetchImpl: providerFalso().fetchImpl } });
  const trintaEUmDias = new Date(T1.getTime() + 31 * 24 * 60 * 60 * 1000);
  assert.equal((await semCorpo(vencida, trintaEUmDias)).write, "updated");
  assert.equal("body" in (linhaDaLente(vencida, ios)!.payload as object), false);

  // 3. O corpo chega DEPOIS da procura: o lock do UPDATE recusa, e o corpo fica.
  const corrida = new Banco();
  await semCorpo(corrida, T1);
  corrida.falha = chamada => {
    if (chamada.op !== "update") return null;
    const linha = linhaDaLente(corrida, ios)!;
    Object.assign(linha, { lock_version: linha.lock_version + 1, payload: { ...(linha.payload as object), body: { status_code: 20000 } } });
    return null;
  };
  const perdeu = await semCorpo(corrida, T2);
  assert.equal(perdeu.write, "concurrent");
  assert.deepEqual((linhaDaLente(corrida, ios)!.payload as { body?: unknown }).body, { status_code: 20000 });
});

test("entrada com corpo MAIS RASA que o pedido não é mantida: a escrita sem corpo a sucede e a reexecução não paga de novo", async () => {
  const ios: SerpCacheLens = { device: "mobile", operatingSystem: "ios" };
  // O Arquiteto aceita resultLimit abaixo de 10: grava a lente com corpo a 5, ainda vigente.
  const banco = new Banco();
  const raso: SerpCacheRequest = { query: { ...consulta, lens: ios }, depth: 5, keywordId: "kw-1" };
  await collectAndCacheSerp(contexto(banco), raso, { config: CONFIG, operationRequestId: "op-0", collectedBy: "arquiteto", now: T1, provider: { fetchImpl: providerFalso().fetchImpl } });
  assert.equal((linhaDaLente(banco, ios)!.payload as { meta: { depth: number } }).meta.depth, 5);

  // Primeira execução: a entrada de 5 não atende 10; a ios é paga e a escrita NÃO é `kept`.
  const primeira = providerFalso();
  const { resultados } = await executarResultados(banco, primeira, T2);
  assert.deepEqual(primeira.pedidos.map(lenteDe).sort(), ["desktop-macos", "desktop-windows", "mobile-android", "mobile-ios"]);
  const daIos = resultados[0].find(item => item.lens === "mobile-ios")!;
  assert.deepEqual([daIos.source, daIos.paid, daIos.stored], ["collected", true, true]);
  const gravada = linhaDaLente(banco, ios)!.payload as { meta: { depth: number; collectedAt: string; collectedBy: string }; body?: unknown };
  assert.equal(gravada.meta.depth, 10, "a entrada rasa foi sucedida pela de 10");
  assert.equal(gravada.meta.collectedAt, T2.toISOString());
  assert.equal(gravada.meta.collectedBy, "minerador");

  // Segunda execução: nada é pago — sem o conserto, a ios seria paga de novo a cada execução.
  const segunda = providerFalso();
  const reexecucao = await executarResultados(banco, segunda, DEPOIS);
  assert.equal(segunda.pedidos.length, 0);
  assert.equal(reexecucao.plano.missingQueries, 0);

  // A mesma regra direto no store: com corpo, vigente, profundidade suficiente → kept; mais rasa → updated.
  const pedidoIos: SerpCacheRequest = { query: { ...consulta, lens: ios }, depth: 10, keywordId: "kw-1" };
  const semCorpo = (alvoBanco: Banco, now: Date) => collectAndCacheSerp(contexto(alvoBanco), pedidoIos, { config: CONFIG, operationRequestId: "op-2", collectedBy: "minerador", now, storeBody: false, provider: { fetchImpl: providerFalso().fetchImpl } });
  const funda = new Banco();
  await collectAndCacheSerp(contexto(funda), { ...pedidoIos, depth: 10 }, { config: CONFIG, operationRequestId: "op-1", collectedBy: "arquiteto", now: T1, provider: { fetchImpl: providerFalso().fetchImpl } });
  assert.equal((await semCorpo(funda, T2)).write, "kept", "profundidade igual ao pedido é mantida");
  const rasa = new Banco();
  await collectAndCacheSerp(contexto(rasa), { ...pedidoIos, depth: 9 }, { config: CONFIG, operationRequestId: "op-1", collectedBy: "arquiteto", now: T1, provider: { fetchImpl: providerFalso().fetchImpl } });
  assert.equal((await semCorpo(rasa, T2)).write, "updated", "um resultado a menos que o pedido já não é mantida");
  assert.equal("body" in (linhaDaLente(rasa, ios)!.payload as object), false);
});

test("falha numa lente não derruba as outras nem o alvo: vira lacuna, e ensure nunca rejeita", async () => {
  const banco = new Banco();
  const provider = providerFalso({ falharEm: feito => feito.os === "ios" ? "http500" : feito.os === "macos" ? "40501" : null });
  const { resultados } = await executarResultados(banco, provider, T1);
  const [macos, android, ios] = resultados[0];

  assert.equal(android.source, "collected");
  assert.equal(android.stored, true);
  assert.equal(ios.source, "failed");
  assert.equal(ios.paid, true, "o pedido saiu: entra no uso");
  assert.equal(ios.stored, false);
  assert.match(ios.reason || "", /HTTP 500/);
  assert.equal(macos.source, "failed");
  assert.match(macos.reason || "", /provider 40501: Invalid Field: 'os'\./, "o motivo do provider fica na lacuna");
  assert.equal(linhaDaLente(banco, { device: "mobile", operatingSystem: "ios" }), undefined, "lente falha não grava nada");
  assert.ok(linhaDaLente(banco, SERP_CACHE_CANONICAL_LENS), "a canônica seguiu");
  assert.deepEqual(countSerpLensOutcomes(resultados[0]), {
    "desktop-macos": { paid: 1, cached: 0, failed: 1, skipped: 0 },
    "mobile-android": { paid: 1, cached: 0, failed: 0, skipped: 0 },
    "mobile-ios": { paid: 1, cached: 0, failed: 1, skipped: 0 },
  });

  // Nem o provider fora do ar nem o banco fora na gravação fazem `ensure` rejeitar.
  const foraDoAr: typeof fetch = async () => { throw new TypeError("fetch failed"); };
  const planoForaDoAr = await planSerpLensCoverage(contexto(new Banco()), [alvo()], { now: T1 });
  const semProvider = await createSerpLensCoverage(contexto(new Banco()), planoForaDoAr, { config: CONFIG, operationRequestId: "op-1", now: T1, quotaCovered: true, provider: { fetchImpl: foraDoAr } }).ensure("alvo-1", CODIGOS);
  assert.ok(semProvider.every(item => item.source === "failed" && item.paid && !item.stored && /conectar/.test(item.reason || "")));

  const semBanco = new Banco();
  const planoSemBanco = await planSerpLensCoverage(contexto(semBanco), [alvo()], { now: T1 });
  semBanco.falha = chamada => chamada.op === "select" && chamada.unica ? { code: "XX000", message: "banco fora" } : null;
  const semGravar = await createSerpLensCoverage(contexto(semBanco), planoSemBanco, { config: CONFIG, operationRequestId: "op-1", now: T1, quotaCovered: true, provider: { fetchImpl: providerFalso().fetchImpl } }).ensure("alvo-1", CODIGOS);
  assert.ok(semGravar.every(item => item.source === "collected" && item.paid && !item.stored && /gravação no cache falhou: .*banco fora/.test(item.reason || "")), "paga e não gravada: lacuna, com o motivo");
});

test("a quota conta as consultas DISTINTAS que faltam; sem quota ou com cache ilegível, nada é pago", async () => {
  // Keyword e candidata da Descoberta com o mesmo texto: uma consulta por lente.
  const banco = new Banco();
  const provider = providerFalso();
  const alvos = [alvo(), alvo({ targetId: "candidata-1", keyword: "Skincare Facial", keywordId: null })];
  const { plano, resultados } = await executarResultados(banco, provider, T1, alvos);
  assert.equal(plano.missingQueries, 3, "três consultas, não seis");
  assert.equal(provider.pedidos.filter(item => item.os !== "windows").length, 3, "a mesma consulta não é paga duas vezes na requisição");
  assert.ok(resultados[1].every(item => item.source === "cache" && !item.paid && item.stored), "o segundo alvo reaproveita sem uso");

  // Quota que não cobre as lentes extras: nenhuma é paga, todas viram lacuna declarada.
  const semQuota = providerFalso();
  const semQuotaResultado = await executarResultados(new Banco(), semQuota, T1, [alvo()], { quotaCovered: false });
  assert.equal(semQuota.pedidos.filter(item => item.os !== "windows").length, 0);
  assert.ok(semQuotaResultado.resultados[0].every(item => item.source === "skipped" && /quota/.test(item.reason || "")));

  // Cache ilegível: a leitura falha, o plano não pede quota e nada é pago.
  const ilegivel = new Banco();
  ilegivel.falha = () => ({ code: "57014", message: "statement timeout" });
  const planoIlegivel = await planSerpLensCoverage(contexto(ilegivel), [alvo()], { now: T1 });
  assert.equal(planoIlegivel.missingQueries, 0);
  assert.match(planoIlegivel.readFailed || "", /statement timeout/);
  const semCache = providerFalso();
  const pulados = await createSerpLensCoverage(contexto(ilegivel), planoIlegivel, { config: CONFIG, operationRequestId: "op-1", now: T1, quotaCovered: true, provider: { fetchImpl: semCache.fetchImpl } }).ensure("alvo-1", CODIGOS);
  assert.equal(semCache.pedidos.length, 0);
  assert.ok(pulados.every(item => item.source === "skipped" && !item.paid));

  // Códigos do laço que não batem com os do plano: a chave não descreve o pedido.
  const divergente = providerFalso();
  const planoBom = await planSerpLensCoverage(contexto(new Banco()), [alvo()], { now: T1 });
  const outros = await createSerpLensCoverage(contexto(new Banco()), planoBom, { config: CONFIG, operationRequestId: "op-1", now: T1, quotaCovered: true, provider: { fetchImpl: divergente.fetchImpl } }).ensure("alvo-1", { locationCode: 2076, languageCode: "en" });
  assert.equal(divergente.pedidos.length, 0);
  assert.ok(outros.every(item => item.source === "skipped"));
});

test("quota parcial: o saldo paga as lentes que couberem, na ordem dos alvos; o resto vira lacuna e o reaproveitamento não gasta saldo", async () => {
  // Três alvos, nove consultas faltando, saldo de quatro: o primeiro alvo leva três, o segundo uma.
  const banco = new Banco();
  const provider = providerFalso();
  const alvos = [
    alvo(),
    alvo({ targetId: "alvo-2", keyword: "serum vitamina c", keywordId: "kw-2" }),
    alvo({ targetId: "alvo-3", keyword: "protetor solar", keywordId: "kw-3" }),
  ];
  const { plano, resultados } = await executarResultados(banco, provider, T1, alvos, { quotaCovered: false, quotaBudget: 4 });
  assert.equal(plano.missingQueries, 9);
  assert.equal(provider.pedidos.filter(item => item.os !== "windows").length, 4, "nunca passa do saldo");
  assert.deepEqual(resultados.map(itens => itens.filter(item => item.paid).length), [3, 1, 0]);
  const lacunas = resultados.flat().filter(item => !item.stored);
  assert.equal(lacunas.length, 5);
  assert.ok(lacunas.every(item => item.source === "skipped" && !item.paid && /quota/.test(item.reason || "")));

  // Saldo 0 (ou ausente) com quota descoberta: nada é pago, como antes.
  const zero = providerFalso();
  await executarResultados(new Banco(), zero, T1, [alvo()], { quotaCovered: false, quotaBudget: 0 });
  assert.equal(zero.pedidos.filter(item => item.os !== "windows").length, 0);

  // A mesma consulta em dois alvos custa uma unidade de saldo: o segundo reaproveita.
  const repetida = providerFalso();
  const mesmas = await executarResultados(new Banco(), repetida, T1, [alvo(), alvo({ targetId: "candidata-1", keyword: "Skincare Facial", keywordId: null })], { quotaCovered: false, quotaBudget: 3 });
  assert.equal(repetida.pedidos.filter(item => item.os !== "windows").length, 3);
  assert.ok(mesmas.resultados[1].every(item => item.source === "cache" && item.stored && !item.paid));

  // Quota coberta ignora o saldo: todas as faltantes são pagas.
  const coberta = providerFalso();
  await executarResultados(new Banco(), coberta, T1, alvos, { quotaCovered: true, quotaBudget: 0 });
  assert.equal(coberta.pedidos.filter(item => item.os !== "windows").length, 9);
});

test("candidata da Descoberta sem keywordId segue o mesmo caminho nas quatro lentes", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  const candidata = alvo({ targetId: "candidata-9", keyword: "serum vitamina c", keywordId: null });
  const { resultados } = await executarResultados(banco, provider, T1, [candidata]);
  assert.deepEqual(provider.pedidos.map(lenteDe).sort(), ["desktop-macos", "desktop-windows", "mobile-android", "mobile-ios"]);
  assert.ok(resultados[0].every(item => item.source === "collected" && item.stored));
  for (const lens of SERP_CACHE_LENSES) {
    const linha = linhaDaLente(banco, lens, "serum vitamina c")!;
    assert.ok(linha, `${serpCacheLensLabel(lens)} gravada`);
    assert.equal((linha.payload as { meta: { keywordId: string | null } }).meta.keywordId, null);
    assert.equal(linha.source_entity_id, linha.subject_id, "sem keyword do acervo, a origem é a própria entrada");
    assert.equal(linha.marca_id, "marca-a");
  }
});

test("as lentes extras entregam à leitura só o digest e a proveniência: nem corpo, nem observação", async () => {
  // Mudou em 2026-09-23 (adendo das 4 lentes, §3): antes nada saía daqui para a
  // Qualificação; agora sai o digest orgânico — e nada além dele.
  const { resultados } = await executarResultados(new Banco(), providerFalso(), T1);
  for (const item of resultados[0]) {
    assert.deepEqual(Object.keys(item).sort(), ["cost", "digest", "lens", "paid", "provenance", "providerRequestId", "reason", "source", "stored", "subjectId"]);
    assert.ok(SerpOrganicDigestSchema.safeParse(item.digest).success, `${item.lens}: o digest é o do contrato`);
    assert.deepEqual(item.provenance, { collectedAt: T1.toISOString(), providerRequestId: item.providerRequestId, collectedBy: "minerador" });
  }
});

test("concorrência limitada: no máximo `concurrency` pedidos das lentes ao mesmo tempo, e cada início avisa a rota", async () => {
  const provider = providerFalso({ atrasoMs: 15 });
  const plano = await planSerpLensCoverage(contexto(new Banco()), [alvo()], { now: T1 });
  let iniciados = 0;
  const cobertura = createSerpLensCoverage(contexto(new Banco()), plano, { config: CONFIG, operationRequestId: "op-1", now: T1, quotaCovered: true, concurrency: 2, provider: { fetchImpl: provider.fetchImpl, onRequestStarted: () => { iniciados += 1; } } });
  const resultado = await cobertura.ensure("alvo-1", CODIGOS);
  assert.equal(provider.pedidos.length, 3);
  assert.equal(provider.estado.maxEmVoo, 2);
  assert.equal(iniciados, 3, "apiRequestStarted da rota fica verdadeiro");
  assert.ok(resultado.every(item => item.source === "collected"));

  const padrao = providerFalso({ atrasoMs: 15 });
  await createSerpLensCoverage(contexto(new Banco()), plano, { config: CONFIG, operationRequestId: "op-1", now: T1, quotaCovered: true, provider: { fetchImpl: padrao.fetchImpl } }).ensure("alvo-1", CODIGOS);
  assert.equal(padrao.estado.maxEmVoo, 3, "as três lentes de um alvo em paralelo");
});

/* ------------------- intenção e funil pelas quatro lentes ------------------- */

/*
 * Adendo `docs/03-minerador/propostas/adendo-derivacao-v4-quatro-lentes-
 * 2026-09-23.md`, §3: as extras gravam o DIGEST orgânico numa chave própria do
 * payload, e a leitura das quatro lentes o usa — montado do corpo em memória na
 * coleta, lido do cache no acerto. Aqui as camadas reais (núcleo, store,
 * cobertura) rodam contra o banco em memória.
 *
 * Não há fixture real mobile nem macOS: o provider abaixo devolve para as
 * lentes mobile o corpo real com a ordem dos itens INVERTIDA — SINTÉTICO.
 */

/** Provider falso por lente: desktop recebe o corpo real; mobile, o mesmo corpo invertido (SINTÉTICO). */
function providerPorLente() {
  const pedidos: PedidoAoProvider[] = [];
  let tarefas = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const [corpo] = JSON.parse(String(init?.body)) as Array<{ keyword: string; device: string; os?: string; depth: number }>;
    pedidos.push({ url: String(url), keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth });
    tarefas += 1;
    const resposta = structuredClone(CRU);
    resposta.tasks[0].id = `task-${corpo.device}-${corpo.os}-${tarefas}`;
    resposta.tasks[0].data = { ...resposta.tasks[0].data, keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth };
    resposta.tasks[0].result[0].keyword = corpo.keyword;
    if (corpo.device === "mobile") resposta.tasks[0].result[0].items.reverse();
    return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetchImpl, pedidos };
}

/** O caminho da rota: a canônica pelo cache ou paga, as três extras pela cobertura, e a leitura nas quatro. */
async function lerNasQuatroLentes(banco: Banco, fetchImpl: typeof fetch, now: Date) {
  const ctx = contexto(banco);
  const [canonica] = await lookupSerpCache(ctx, [pedidoCanonico()], { mode: "body", now });
  let canonical: SerpLensSource & { body: unknown };
  if (canonica.hit?.body) {
    canonical = { lens: "desktop-windows", body: canonica.hit.body, collectedAt: canonica.hit.meta.collectedAt, providerRequestId: canonica.hit.meta.providerRequestId, collectedBy: canonica.hit.meta.collectedBy };
  } else {
    const coleta = await collectAndCacheSerp(ctx, pedidoCanonico(), { config: CONFIG, operationRequestId: "op-1", collectedBy: "minerador", now, provider: { fetchImpl } });
    canonical = { lens: "desktop-windows", body: coleta.body, collectedAt: coleta.meta.collectedAt, providerRequestId: coleta.providerRequestId, collectedBy: coleta.meta.collectedBy };
  }
  const plano = await planSerpLensCoverage(ctx, [alvo()], { now });
  const outcomes = await createSerpLensCoverage(ctx, plano, { config: CONFIG, operationRequestId: "op-1", now, quotaCovered: true, provider: { fetchImpl } }).ensure("alvo-1", CODIGOS);
  const evidence = deriveSerpSemanticEvidenceAcrossLenses({
    keyword: "skincare facial", locationCode: 2076, languageCode: "pt", operationRequestId: "33333333-3333-4333-8333-333333333333",
    canonical, extras: serpLensDerivationInputs(outcomes),
  });
  assert.ok(evidence, "a canônica produz evidência");
  return { evidence, outcomes, canonical };
}

test("4 lentes: o digest vai só nas lentes não canônicas, numa chave PRÓPRIA do payload — a observação não muda", async () => {
  const banco = new Banco();
  await executarResultados(banco, providerFalso(), T1);
  const canonica = linhaDaLente(banco, SERP_CACHE_CANONICAL_LENS)!.payload as Record<string, unknown>;
  assert.equal("digest" in canonica, false, "a canônica já guarda o corpo: nada de digest duplicado");
  for (const lens of SERP_LENS_COVERAGE_LENSES) {
    const payload = linhaDaLente(banco, lens)!.payload as { digest?: unknown; observation: Record<string, unknown> };
    assert.ok(SerpOrganicDigestSchema.safeParse(payload.digest).success, `${serpCacheLensLabel(lens)} grava o digest`);
    assert.deepEqual(Object.keys(payload.observation).sort(), ["aiOverviewDomains", "commercialSignals", "competitorDomains", "depth", "itemTypes", "lens", "organicCount", "questions", "relatedSearches"], "a observação continua a mesma");
  }
});

test("4 lentes: o modo observation NÃO traz o digest — o egress do leitor do Arquiteto não aumenta", async () => {
  const banco = new Banco();
  await executarResultados(banco, providerFalso(), T1);
  const ios: SerpCacheRequest = { query: { ...consulta, lens: { device: "mobile", operatingSystem: "ios" } }, depth: 10, keywordId: "kw-1" };
  banco.chamadas = [];
  const [porObservacao] = await lookupSerpCache(contexto(banco), [ios], { mode: "observation", now: DEPOIS });
  assert.ok(porObservacao.hit?.observation);
  assert.equal(porObservacao.hit?.digest, undefined);
  assert.deepEqual(banco.chamadas.map(item => item.colunas), ["subject_id,meta:payload->meta,observation:payload->observation"]);
  // Bytes que o modo observation traz da linha, com e sem o digest gravado: os mesmos.
  const linha = linhaDaLente(banco, { device: "mobile", operatingSystem: "ios" })!;
  const semDigest = { ...linha, payload: { ...(linha.payload as Record<string, unknown>), digest: undefined } };
  const colunas = "subject_id,meta:payload->meta,observation:payload->observation";
  assert.equal(JSON.stringify(projetar(linha, colunas)).length, JSON.stringify(projetar(semDigest as typeof linha, colunas)).length);
  // O modo digest traz meta + digest, e nunca observação nem corpo.
  const [porDigest] = await lookupSerpCache(contexto(banco), [ios], { mode: "digest", now: DEPOIS });
  assert.ok(porDigest.hit?.digest);
  assert.equal(porDigest.hit?.observation, undefined);
  assert.equal(porDigest.hit?.body, undefined);
});

test("4 lentes: coleta e acerto dão a MESMA leitura, e o acerto não vira versão nova da Qualificação", async () => {
  const banco = new Banco();
  const primeira = providerPorLente();
  const coleta = await lerNasQuatroLentes(banco, primeira.fetchImpl, T1);
  assert.equal(primeira.pedidos.length, 4, "as quatro lentes pagas na primeira execução");
  assert.ok(coleta.outcomes.every(item => item.source === "collected" && item.digest));
  assert.equal(coleta.evidence.lensEvidence?.readings.length, 4);

  const segunda = providerPorLente();
  const acerto = await lerNasQuatroLentes(banco, segunda.fetchImpl, DEPOIS);
  assert.equal(segunda.pedidos.length, 0, "tudo do cache");
  assert.ok(acerto.outcomes.every(item => item.source === "cache" && item.digest));
  // A canônica veio crua na coleta e podada no acerto; as extras, do digest em memória e do gravado.
  assert.notDeepEqual(acerto.canonical.body, coleta.canonical.body);
  assert.deepEqual(acerto.evidence, coleta.evidence);

  const vigente = await buildKeywordSemanticQualification({ brandId: "marca-a", keywordId: "kw-1", evidence: coleta.evidence, createdBy: "usuario-1" });
  const relida = parseKeywordSemanticQualification(JSON.parse(JSON.stringify(vigente)))!;
  const proxima = await buildKeywordSemanticQualification({ brandId: "marca-a", keywordId: "kw-1", evidence: acerto.evidence, createdBy: "usuario-1", previous: relida });
  assert.equal(repeatsCurrentSemanticQualification(relida, proxima), true);
});

test("4 lentes: entrada extra ANTIGA, sem digest, não é paga de novo e vira lente faltante", async () => {
  const banco = new Banco();
  // As três extras gravadas como antes do digest.
  for (const lens of SERP_LENS_COVERAGE_LENSES) {
    await collectAndCacheSerp(contexto(banco), { query: { ...consulta, lens }, depth: 10, keywordId: "kw-1" }, { config: CONFIG, operationRequestId: "op-0", collectedBy: "minerador", now: T1, storeBody: false, storeDigest: false, provider: { fetchImpl: providerFalso().fetchImpl } });
  }
  for (const lens of SERP_LENS_COVERAGE_LENSES) assert.equal("digest" in (linhaDaLente(banco, lens)!.payload as object), false);
  const provider = providerPorLente();
  const { evidence, outcomes } = await lerNasQuatroLentes(banco, provider.fetchImpl, DEPOIS);
  assert.deepEqual(provider.pedidos.map(lenteDe), ["desktop-windows"], "só a canônica, que faltava, é paga");
  assert.ok(outcomes.every(item => item.source === "cache" && item.digest === null));
  assert.deepEqual(evidence.lensEvidence?.lensesMissing, SERP_LENS_COVERAGE_LENSES.map(lens => ({ lens: serpCacheLensLabel(lens), reason: "missing_digest" })));
  // Com só a canônica lida, a leitura é a de uma lente.
  const uma = deriveSerpSemanticEvidence({ body: CRU, keyword: "skincare facial", locationCode: 2076, languageCode: "pt", providerRequestId: evidence.providerRequestId, operationRequestId: "op", collectedAt: evidence.collectedAt });
  assert.deepEqual(evidence.intent, uma?.intent);
  assert.deepEqual(evidence.funnel, uma?.funnel);
});

test("4 lentes: falha e lacuna entram na leitura como lente faltante, com o motivo", async () => {
  const banco = new Banco();
  const provider = providerFalso({ falharEm: feito => feito.os === "ios" ? "http500" : feito.os === "macos" ? "40501" : null });
  const { resultados } = await executarResultados(banco, provider, T1);
  assert.deepEqual(serpLensDerivationInputs(resultados[0]).map(item => "missing" in item ? [item.lens, item.missing] : [item.lens, "lida"]), [
    ["desktop-macos", "collection_failed"],
    ["mobile-android", "lida"],
    ["mobile-ios", "collection_failed"],
  ]);
  const semQuota = await executarResultados(new Banco(), providerFalso(), T1, [alvo()], { quotaCovered: false });
  assert.ok(serpLensDerivationInputs(semQuota.resultados[0]).every(item => "missing" in item && item.missing === "not_collected"));
});

test("4 lentes: digest gravado MALFORMADO não chega à leitura — é acerto sem digest, lente faltante e nenhuma chamada paga", async () => {
  const banco = new Banco();
  await executarResultados(banco, providerFalso(), T1);
  const [macos, android, ios] = SERP_LENS_COVERAGE_LENSES;
  // Três formas de digest quebrado no banco: sem versão, organic de outro tipo, item com campo desconhecido.
  const valido = (linhaDaLente(banco, ios)!.payload as { digest: Record<string, unknown> }).digest;
  (linhaDaLente(banco, macos)!.payload as Record<string, unknown>).digest = { organic: "x" };
  (linhaDaLente(banco, android)!.payload as Record<string, unknown>).digest = { ...valido, version: undefined };
  (linhaDaLente(banco, ios)!.payload as Record<string, unknown>).digest = { ...valido, organic: [{ title: "t", campo_novo: 1 }] };
  const [lido] = await lookupSerpCache(contexto(banco), [{ query: { ...consulta, lens: macos }, depth: 10, keywordId: "kw-1" }], { mode: "digest", now: DEPOIS });
  assert.ok(lido.hit, "a entrada continua valendo para a cobertura");
  assert.equal(lido.hit?.digest, undefined, "o digest inválido não é aceito como veio");
  const provider = providerPorLente();
  const { evidence, outcomes } = await lerNasQuatroLentes(banco, provider.fetchImpl, DEPOIS);
  assert.deepEqual(provider.pedidos, [], "nada pago: a canônica e as extras estão no cache");
  assert.ok(outcomes.every(item => item.source === "cache" && item.digest === null));
  assert.deepEqual(evidence.lensEvidence?.lensesMissing, SERP_LENS_COVERAGE_LENSES.map(lens => ({ lens: serpCacheLensLabel(lens), reason: "missing_digest" })));
});

test("4 lentes: evidência INVALIDADA — a extra do cache anterior à requisição fica fora; a paga nesta requisição entra", async () => {
  const banco = new Banco();
  // Macos e android já estavam no cache (coleta de T1); a iOS falta e é paga agora.
  for (const lens of SERP_LENS_COVERAGE_LENSES.slice(0, 2)) {
    await collectAndCacheSerp(contexto(banco), { query: { ...consulta, lens }, depth: 10, keywordId: "kw-1" }, { config: CONFIG, operationRequestId: "op-0", collectedBy: "minerador", now: T1, storeBody: false, provider: { fetchImpl: providerFalso().fetchImpl } });
  }
  const { resultados } = await executarResultados(banco, providerFalso(), DEPOIS);
  const outcomes = resultados[0];
  assert.deepEqual(outcomes.map(item => [item.lens, item.source]), [["desktop-macos", "cache"], ["mobile-android", "cache"], ["mobile-ios", "collected"]]);
  const invalidada = serpLensDerivationInputs(outcomes, { invalidatedBefore: DEPOIS.toISOString() });
  assert.deepEqual(invalidada.map(item => "missing" in item ? [item.lens, item.missing] : [item.lens, "lida"]), [
    ["desktop-macos", "evidence_invalidated"],
    ["mobile-android", "evidence_invalidated"],
    ["mobile-ios", "lida"],
  ]);
  // Sem invalidação, o mapeamento é o de sempre.
  assert.ok(serpLensDerivationInputs(outcomes).every(item => !("missing" in item)));
  assert.ok(serpLensDerivationInputs(outcomes, { invalidatedBefore: null }).every(item => !("missing" in item)));
  // A lente paga nesta requisição por OUTRO alvo (fonte `cache`, coleta deste instante) também entra.
  const doutroAlvo = outcomes.map(item => item.lens === "mobile-ios" ? { ...item, source: "cache" as const } : item);
  assert.equal(serpLensDerivationInputs(doutroAlvo, { invalidatedBefore: DEPOIS.toISOString() }).filter(item => !("missing" in item)).length, 1);
  // Falha e lacuna não são "do cache": continuam com o motivo delas.
  const semSerp = [{ ...outcomes[2], source: "failed" as const, digest: null, provenance: null }, { ...outcomes[2], source: "skipped" as const, digest: null, provenance: null }];
  assert.deepEqual(serpLensDerivationInputs(semSerp, { invalidatedBefore: DEPOIS.toISOString() }), [
    { lens: "mobile-ios", missing: "collection_failed" },
    { lens: "mobile-ios", missing: "not_collected" },
  ]);
});
