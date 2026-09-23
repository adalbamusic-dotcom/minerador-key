import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  architectSerpCollectionRequest,
  architectSerpStoresBody,
  formationSerpCacheRequest,
  normalizeCachedFormationSerp,
  serpBodyAtRequestedDepth,
} from "../lib/arquiteto/dataforseo-serp-compatibility.ts";
import { competitiveObservationFromCache } from "../lib/arquiteto/serp-competitive-evidence.ts";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  serpCacheLensLabel,
  serpCacheSubjectId,
  trimSerpBodyToDepth,
  type SerpCacheLens,
} from "../lib/editorial/serp-cache.ts";
import type { DataForSeoSerpConfig } from "../lib/minerador/dataforseo-serp-core.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheRequest } from "../lib/server/serp-cache.ts";
import type { SerpCacheContext } from "../lib/server/serp-cache-store.ts";

/**
 * AS COLETAS DO ARQUITETO EXECUTADAS DE VERDADE — A2 e A7.1–A7.3 do adendo
 * `docs/04-arquiteto/propostas/adendo-quatro-lentes-arquiteto-2026-09-23.md`.
 *
 * Roda com `--conditions=react-server` e o registro de TS
 * (`scripts/node-ts-register.mjs`), como `test:serp-cache` e
 * `test:arquiteto:servidor`: o núcleo do cache começa com `import "server-only"`.
 *
 * As rotas pagam pelo MESMO par de chamadas que este arquivo executa —
 * `collectAndCacheSerp(contexto, architectSerpCollectionRequest(pedido), {
 * storeBody })` — e a forma dessa chamada em cada rota é fixada pelos testes
 * estruturais de `arquiteto-serp-cache-formacao` e `arquiteto-origem-do-silo`.
 * O banco é uma tabela em memória com a forma do `postgrest-js`; o provider é
 * um `fetch` falso que registra cada pedido e devolve o corpo REAL do fixture,
 * na profundidade pedida. Nenhuma chamada paga, nenhum banco remoto.
 */

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const CONFIG: DataForSeoSerpConfig = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };
const CODES = { locationCode: 2076, languageCode: "pt" };
const T1 = new Date("2026-09-23T10:00:00.000Z");
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
  private proximo = 1;
  from(tabela: string) { return new Consulta(this, tabela); }
  private casa(linha: Linha, filtros: Filtro[]) {
    return filtros.every(({ coluna, tipo, valor }) => tipo === "eq" ? linha[coluna] === valor : (valor as unknown[]).includes(linha[coluna]));
  }
  executar(consulta: Consulta): Resposta {
    this.chamadas.push(consulta);
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

type PedidoAoProvider = { keyword: string; device: string; os: string | undefined; depth: number };

/**
 * Provider falso: registra cada pedido e devolve o corpo REAL do fixture (uma
 * coleta de 20) com a keyword e a lente pedidas, recortado à profundidade
 * pedida — como o provider devolveria.
 */
function providerFalso() {
  const pedidos: PedidoAoProvider[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const [corpo] = JSON.parse(String(init?.body)) as Array<{ keyword: string; device: string; os?: string; depth: number }>;
    pedidos.push({ keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth });
    const resposta = structuredClone(corpo.depth < 20 ? trimSerpBodyToDepth(CRU, corpo.depth) : CRU) as typeof CRU;
    resposta.tasks[0].id = `task-${pedidos.length}`;
    resposta.tasks[0].data = { ...resposta.tasks[0].data, keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth };
    resposta.tasks[0].result[0].keyword = corpo.keyword;
    return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetchImpl, pedidos };
}

const organicos = (corpo: unknown) =>
  ((corpo as { tasks: Array<{ result: Array<{ items: Array<{ type: string }> }> }> }).tasks[0].result[0].items || []).filter(item => item.type === "organic").length;

/** O pedido de LEITURA de cada rota do Arquiteto: a profundidade que o leitor usa. */
const pedidoDeLeitura = (lens: SerpCacheLens, overrides: Partial<SerpCacheRequest> = {}): SerpCacheRequest => ({
  query: { keyword: "skincare facial", ...CODES, lens, endpoint: "advanced" },
  depth: 10,
  keywordId: "kw-1",
  ...overrides,
});

/** A CALL 3 do Minerador: canônica, `advanced`, 20, lida em modo body. */
const pedidoDaCall3: SerpCacheRequest = pedidoDeLeitura(SERP_CACHE_CANONICAL_LENS, { depth: 20 });

/** Como as três rotas pagam uma falta: pedido do Arquiteto, gravação conforme a lente. */
const pagarComoOArquiteto = (banco: Banco, provider: ReturnType<typeof providerFalso>, pedido: SerpCacheRequest, opcoes: { storeBody?: boolean } = {}) =>
  collectAndCacheSerp(contexto(banco), architectSerpCollectionRequest(pedido), {
    config: CONFIG, operationRequestId: "op-arquiteto", collectedBy: "arquiteto", now: T1,
    ...(opcoes.storeBody === undefined ? {} : { storeBody: opcoes.storeBody }),
    provider: { fetchImpl: provider.fetchImpl },
  });

const entrada = (overrides: Partial<SerpSearchInput> = {}): SerpSearchInput => ({
  brandId: "marca-a", articleId: "a", articleDnaVersionId: "v", keywordId: "kw-1", keywordDnaVersionId: "kv",
  keyword: "skincare facial", location: "Brasil", language: "pt-br", device: "desktop", operatingSystem: "windows",
  expectedIntent: "informational", expectedFormat: "", requiredTopics: ["skincare facial"], articleEntities: [],
  resultLimit: 10, version: 1, previousSnapshotId: null,
  ...overrides,
});

/* ---------------- A2 · a canônica do Arquiteto grava com 20 ---------------- */

test("A2 · a canônica paga pelo Arquiteto vai ao provider com 20, grava 20 e a CALL 3 do Minerador não paga de novo", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  // A formação e a territorial pedem 10: é o pedido de leitura, não o de pagamento.
  const leitura = formationSerpCacheRequest({ keyword: "skincare facial", keywordId: "kw-1", depth: 10, device: "desktop", codes: CODES });
  const coleta = await pagarComoOArquiteto(banco, provider, leitura);

  assert.deepEqual(provider.pedidos, [{ keyword: "skincare facial", device: "desktop", os: "windows", depth: 20 }]);
  assert.equal(coleta.meta.depth, 20);
  assert.equal(coleta.write, "created");
  const payload = banco.linhaDe(serpCacheSubjectId(leitura.query))!.payload as { meta: { depth: number; collectedBy: string }; body?: unknown };
  assert.equal(payload.meta.depth, 20);
  assert.equal(payload.meta.collectedBy, "arquiteto");
  assert.ok(payload.body, "a canônica guarda o corpo: CALL 3, formação e territorial o leem");

  // A CALL 3 do Minerador acha a entrada e NÃO paga.
  const [call3] = await lookupSerpCache(contexto(banco), [pedidoDaCall3], { mode: "body", now: DEPOIS });
  assert.ok(call3.hit?.body, "a entrada de 20 atende a CALL 3");
  // O corpo inteiro da coleta de 20 (o fixture real devolveu 18 orgânicos), não o recorte de 10.
  assert.equal(organicos(call3.hit!.body), organicos(CRU));
  assert.ok(organicos(CRU) > 10);
  assert.equal(provider.pedidos.length, 1, "nenhuma segunda chamada paga");

  // E continua atendendo o leitor de 10, recortada.
  const [formacao] = await lookupSerpCache(contexto(banco), [leitura], { mode: "body", now: DEPOIS });
  assert.equal(organicos(formacao.hit!.body), 10);
});

test("A2 · o que acontecia antes: a canônica gravada com 10 é recusada pela CALL 3, que pagaria de novo", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  await collectAndCacheSerp(contexto(banco), pedidoDeLeitura(SERP_CACHE_CANONICAL_LENS), {
    config: CONFIG, operationRequestId: "op-antigo", collectedBy: "arquiteto", now: T1, provider: { fetchImpl: provider.fetchImpl },
  });
  assert.equal(provider.pedidos[0].depth, 10);
  const [call3] = await lookupSerpCache(contexto(banco), [pedidoDaCall3], { mode: "body", now: DEPOIS });
  assert.equal(call3.hit, null);
  assert.equal(call3.missReason, "coletada com 10 resultados; pedido de 20");
});

test("A2 · falta paga com 20 e acerto da mesma entrada dão o MESMO snapshot para o pedido de 10", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  const leitura = pedidoDeLeitura(SERP_CACHE_CANONICAL_LENS);
  const coleta = await pagarComoOArquiteto(banco, provider, leitura);
  const input = entrada();

  // A falta, como a rota normaliza: o corpo cru recortado ao pedido.
  const falta = normalizeDataForSeoSerpResponse(serpBodyAtRequestedDepth(coleta.body, coleta.meta.depth, input.resultLimit), input, CONFIG, coleta.meta.collectedAt, coleta.providerRequestId);
  // O acerto, como a rota normaliza: o corpo podado que o cache devolve, com a proveniência da entrada.
  const [acerto] = await lookupSerpCache(contexto(banco), [leitura], { mode: "body", now: DEPOIS });
  const doCache = normalizeCachedFormationSerp(acerto.hit!.body, input, acerto.hit!.meta);

  assert.equal(falta.contentHash, doCache.contentHash);
  assert.deepEqual(falta.organicResults, doCache.organicResults);
  assert.deepEqual(falta.serpFeatures, doCache.serpFeatures);
  assert.equal(falta.collectedAt, doCache.collectedAt);
  assert.equal(provider.pedidos.length, 1);
});

test("A2 · consulta territorial por texto (sem keyword do acervo) também paga a canônica com 20", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  const territorial = pedidoDeLeitura(SERP_CACHE_CANONICAL_LENS, { keywordId: null, query: { keyword: "cuidados com a pele", ...CODES, lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" } });
  const coleta = await pagarComoOArquiteto(banco, provider, territorial);
  assert.equal(provider.pedidos[0].depth, 20);
  assert.equal(coleta.meta.keywordId, null);
  assert.equal(organicos(serpBodyAtRequestedDepth(coleta.body, coleta.meta.depth, territorial.depth)), 10);
});

/* ----------- A7.1 · SERP por keyword: extras sem corpo, com digest ----------- */

test("A7.1 · as três extras pagas pela SERP por keyword gravam SEM corpo, com observação e digest, a 10", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  for (const lens of SERP_CACHE_LENSES) {
    await pagarComoOArquiteto(banco, provider, pedidoDeLeitura(lens), { storeBody: architectSerpStoresBody(lens) });
  }

  assert.deepEqual(provider.pedidos.map(item => [`${item.device}-${item.os}`, item.depth]), [
    ["desktop-windows", 20],
    ["desktop-macos", 10],
    ["mobile-android", 10],
    ["mobile-ios", 10],
  ]);

  for (const lens of SERP_CACHE_LENSES) {
    const rotulo = serpCacheLensLabel(lens);
    const payload = banco.linhaDe(serpCacheSubjectId(pedidoDeLeitura(lens).query))!.payload as { body?: unknown; digest?: unknown; observation?: { organicCount: number } };
    assert.ok(payload.observation && payload.observation.organicCount > 0, `${rotulo}: a observação que a rota lê está lá`);
    if (lens === SERP_CACHE_CANONICAL_LENS) {
      assert.ok(payload.body, "a canônica guarda o corpo");
      assert.equal("digest" in payload, false, "a canônica não duplica o top 10 ao lado do corpo");
    } else {
      assert.equal("body" in payload, false, `${rotulo}: sem leitor de corpo, sem corpo`);
      assert.ok(payload.digest, `${rotulo}: o digest que a derivação v4 do Minerador lê`);
    }
  }

  // A rota lê em modo observation: as quatro atendem, sem pagar nada de novo.
  const leituras = await lookupSerpCache(contexto(banco), SERP_CACHE_LENSES.map(lens => pedidoDeLeitura(lens)), { mode: "observation", now: DEPOIS });
  assert.ok(leituras.every(item => item.hit?.observation));
  assert.equal(provider.pedidos.length, 4);

  // Quem um dia precisar do corpo de uma extra vê falta e paga a entrada completa.
  const [corpoExtra] = await lookupSerpCache(contexto(banco), [pedidoDeLeitura(SERP_CACHE_LENSES[2])], { mode: "body", now: DEPOIS });
  assert.equal(corpoExtra.hit, null);
});

test("A7.1 · a entrada extra de outra marca nunca atende esta", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  const lens = SERP_CACHE_LENSES[3];
  await pagarComoOArquiteto(banco, provider, pedidoDeLeitura(lens), { storeBody: architectSerpStoresBody(lens) });
  const [outraMarca] = await lookupSerpCache(contexto(banco, "marca-b"), [pedidoDeLeitura(lens)], { mode: "observation", now: DEPOIS });
  assert.equal(outraMarca.hit, null);
});

/* ------- A7.2 · os citados pelo AI Overview e as buscas relacionadas ------- */

test("A7.2 · a observação devolvida leva os citados pela IA, sem duplicar e sem somar de novo aos concorrentes", async () => {
  const banco = new Banco();
  const provider = providerFalso();
  const lens = SERP_CACHE_LENSES[2];
  await pagarComoOArquiteto(banco, provider, pedidoDeLeitura(lens), { storeBody: architectSerpStoresBody(lens) });
  const [lida] = await lookupSerpCache(contexto(banco), [pedidoDeLeitura(lens)], { mode: "observation", now: DEPOIS });
  const cache = lida.hit!.observation!;
  const obs = competitiveObservationFromCache("kw-pedido", lens, cache);

  // O fixture real cita cetaphil, sephora, loreal, dermaclub e o youtube três vezes, todos com `www.`.
  assert.deepEqual(obs.aiOverviewDomains, ["cetaphil.com.br", "sephora.com.br", "loreal-paris.com.br", "dermaclub.com.br", "youtube.com"]);
  assert.equal(new Set(obs.aiOverviewDomains).size, obs.aiOverviewDomains!.length);
  assert.deepEqual(obs.competitorDomains, cache.competitorDomains, "competitorDomains é o do cache, sem os citados somados de novo");
  assert.equal(new Set(obs.competitorDomains).size, obs.competitorDomains.length);
  for (const citado of obs.aiOverviewDomains!) assert.ok(obs.competitorDomains.includes(citado), `${citado} já estava no universo do cache`);
  assert.ok(obs.relatedSearches && obs.relatedSearches.length > 0, "as buscas relacionadas do fixture chegam");
  assert.deepEqual(obs.relatedSearches, cache.relatedSearches);
  assert.equal(obs.keywordId, "kw-pedido", "o id é o do pedido, não o gravado na entrada");
  assert.equal(obs.lens, "mobile-android");
});
