import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { mock, test } from "node:test";

/*
 * `next/server` não resolve no ESM do Node sem extensão, e a rota só usa
 * `NextResponse.json`: um dublê mínimo, com a mesma forma de resposta.
 */
register(`data:text/javascript,${encodeURIComponent(
  "export async function resolve(especificador, contexto, proximo) {"
  + " if (especificador === 'next/server') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent("
  + "\"export const NextResponse = { json: (corpo, opcoes) => new Response(JSON.stringify(corpo), { status: (opcoes && opcoes.status) || 200, headers: { 'Content-Type': 'application/json' } }) };\") };"
  + " return proximo(especificador, contexto); }",
)}`);

/**
 * A ROTA DE FORMAÇÃO NAS QUATRO LENTES, EXECUTADA DE VERDADE — A3, A5, A6 e A8
 * do adendo `docs/04-arquiteto/propostas/adendo-quatro-lentes-arquiteto-2026-09-23.md`.
 *
 * Roda com `--conditions=react-server`, o registro de TS
 * (`scripts/node-ts-register.mjs`) e `--experimental-test-module-mocks`:
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --conditions=react-server \
 *     --import ./scripts/node-ts-register.mjs --experimental-test-module-mocks \
 *     --test tests/arquiteto-quatro-lentes-rota.test.mts
 *
 * Sessão, permissão, contexto da marca, uso de integração, credencial e o
 * store do parecer são dublês; o RESTO é o código real: a rota, o cache de
 * SERP, o store do cache, o normalizador, o parecer nas quatro lentes. O banco
 * é uma tabela em memória com a forma do `postgrest-js`; o provider é o `fetch`
 * global trocado por um que registra cada pedido e devolve o corpo REAL do
 * fixture. Nenhuma chamada paga, nenhum banco remoto.
 */

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const CONFIG = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };
const MARCA = "marca-a";
const KW_1 = "11111111-1111-4111-8111-111111111111";
const KW_2 = "22222222-2222-4222-8222-222222222222";
const TERRITORIO = "territory:33333333-3333-4333-8333-333333333333";

/* ------------------------------ banco em memória ----------------------------- */

type Linha = Record<string, unknown> & { id: string; lock_version: number };
type Filtro = { coluna: string; tipo: "eq" | "in" | "is"; valor: unknown };

function projetar(linha: Record<string, unknown>, colunas: string) {
  return Object.fromEntries(colunas.split(",").map(item => {
    const [apelido, caminho] = item.includes(":") ? item.split(":") : [item, item];
    const partes = caminho.split(/->>?/);
    let valor: unknown = linha;
    for (const parte of partes) valor = valor && typeof valor === "object" ? (valor as Record<string, unknown>)[parte] : undefined;
    if (caminho.includes("->>") && valor !== undefined && valor !== null) valor = String(valor);
    return [apelido, valor ?? null];
  }));
}

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
  select(colunas: string) { this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "eq", valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, tipo: "in", valor }); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "is", valor }); return this; }
  insert(valores: Record<string, unknown>) { this.op = "insert"; this.valores = valores; return this; }
  update(valores: Record<string, unknown>) { this.op = "update"; this.valores = valores; return this; }
  maybeSingle() { this.unica = true; return this; }
  then<A, B = never>(resolve: (valor: { data: unknown; error: unknown }) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
}

class Banco {
  tabelas = new Map<string, Linha[]>();
  consultas: Consulta[] = [];
  private proximo = 1;
  from(tabela: string) { return new Consulta(this, tabela); }
  linhas(tabela: string) {
    if (!this.tabelas.has(tabela)) this.tabelas.set(tabela, []);
    return this.tabelas.get(tabela)!;
  }
  executar(consulta: Consulta) {
    this.consultas.push(consulta);
    const linhas = this.linhas(consulta.tabela);
    if (consulta.op === "insert") {
      const linha: Linha = { ...structuredClone(consulta.valores!), id: `linha-${this.proximo++}`, lock_version: 1 };
      linhas.push(linha);
      return { data: projetar(linha, consulta.colunas), error: null };
    }
    const alvo = linhas.filter(linha => consulta.filtros.every(({ coluna, tipo, valor }) =>
      tipo === "eq" ? linha[coluna] === valor : tipo === "is" ? (linha[coluna] ?? null) === valor : (valor as unknown[]).includes(linha[coluna])));
    if (consulta.op === "update") for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: linha.lock_version + 1 });
    const projetadas = alvo.map(linha => projetar(linha, consulta.colunas));
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
}

/* --------------------------------- provider --------------------------------- */

const pedidosAoProvider: Array<{ keyword: string; device: string; os: string; depth: number }> = [];
globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
  const [corpo] = JSON.parse(String(init?.body)) as Array<{ keyword: string; device: string; os: string; depth: number }>;
  pedidosAoProvider.push({ keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth });
  const resposta = structuredClone(CRU);
  resposta.tasks[0].id = `task-${pedidosAoProvider.length}`;
  resposta.tasks[0].data = { ...resposta.tasks[0].data, keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth };
  resposta.tasks[0].result[0].keyword = corpo.keyword;
  return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

/* ---------------------------------- dublês ---------------------------------- */

let banco = new Banco();
const usos: Array<{ units: number; idempotencyKey: string; resultStatus: string }> = [];
let resolucoes = 0;
const gravados: Array<{ candidateRef: string; verdict: string; interpretation: Record<string, unknown> | null }> = [];

class IntegrationRuntimeError extends Error {}
class DataForSeoCanonicalError extends Error {
  readonly code = "canonical";
  readonly status = 503;
}

mock.module("@/lib/server/authz", { namedExports: {
  requireCanonicalSessionProfile: async () => ({ userId: "usuario-1" }),
  authzErrorResponse: (error: unknown) => ({ status: 500, message: error instanceof Error ? error.message : String(error) }),
} });
mock.module("@/lib/server/editorial-authorization", { namedExports: { assertEditorialPermission: async () => undefined } });
/** Dublê com a mesma forma do erro real (code, mensagem, status). */
class PipelineRuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
mock.module("@/lib/server/pipeline-runtime", { namedExports: {
  PipelineRuntimeError,
  resolvePipelineContext: async () => ({ get supabase() { return banco; }, brandId: MARCA, actorUserId: "usuario-1" }),
} });
mock.module("@/lib/server/integrations-runtime", { namedExports: {
  IntegrationRuntimeError,
  integrationRuntimeErrorResponse: () => null,
  recordIntegrationUsage: async (uso: { units: number; idempotencyKey: string; resultStatus: string }) => { usos.push(uso); },
} });
mock.module("@/lib/server/dataforseo-canonical", { namedExports: {
  DataForSeoCanonicalError,
  resolveDataForSeoCanonicalConfig: async () => { resolucoes += 1; return { resource: { id: "recurso" }, config: CONFIG, environment: "test", credentialSource: "connection" }; },
} });
mock.module("@/lib/server/arquiteto-article-serp-store", { namedExports: {
  saveArticleFormationSerpAssessment: async (_contexto: unknown, entrada: { candidateRef: string; verdict: string; interpretation?: Record<string, unknown> | null }) => {
    gravados.push({ candidateRef: entrada.candidateRef, verdict: entrada.verdict, interpretation: entrada.interpretation ?? null });
    return { candidateRef: entrada.candidateRef, workflowItemId: `wf-${entrada.candidateRef}` };
  },
  readbackArticleFormationSerpAssessment: async (_contexto: unknown, candidateRef: string) => ({ payload: { formationBaseHash: "base-1", verdict: gravados.find(item => item.candidateRef === candidateRef)?.verdict } }),
  listArticleFormationSerpAssessments: async () => [],
} });

const gravadosTerritoriais: Array<Record<string, any>> = [];
mock.module("@/lib/server/arquiteto-territorial-serp-store", { namedExports: {
  saveTerritorialSerpAssessment: async (_contexto: unknown, entrada: { assessment: Record<string, any> }) => { gravadosTerritoriais.push(entrada.assessment); },
  readbackTerritorialSerpAssessment: async (_contexto: unknown, questionId: string) => ({ payload: { assessment: gravadosTerritoriais.find(item => item.questionId === questionId) } }),
  listTerritorialSerpAssessments: async () => [],
} });

/*
 * PATCH /api/arquiteto/workspace (correção da A3): só as travas da primária
 * rodam de verdade — a rota, `silo-primary-acceptance` e as leituras
 * estreitas contra o banco em memória. Os stores de território e o resto da
 * hidratação são dublês que só registram o que a rota tentou gravar.
 */
const territoriosGravados: Array<{ op: "create" | "update"; territoryRef: string | null; territory: Record<string, any> }> = [];
mock.module("@/lib/server/arquiteto-workspace", { namedExports: {
  architectPatchKeywordReadInput: () => ({}),
  loadCanonicalArquitetoWorkspace: async () => ({}),
  readArchitectPatchKeywords: async () => new Map(),
} });
mock.module("@/lib/server/arquiteto-persistence", { namedExports: {
  pipelineArtifactErrorResponse: (error: unknown) => error instanceof PipelineRuntimeError
    ? { status: error.status, body: { success: false, error: error.message, code: error.code } }
    : { status: 503, body: { success: false, error: error instanceof Error ? error.message : String(error), code: "QUERY_FAILURE" } },
} });
mock.module("@/lib/server/pipeline-repositories", { namedExports: { WorkflowRepository: class {} } });
mock.module("@/lib/server/arquiteto-territory-store", { namedExports: {
  listTerritoryWorkflowItems: async () => [],
  createTerritoryWorkflowItem: async (_contexto: unknown, territory: Record<string, any>) => {
    territoriosGravados.push({ op: "create", territoryRef: null, territory });
    return { territoryRef: "territory:novo", lockVersion: 1, territory };
  },
  updateTerritoryWorkflowItem: async (_contexto: unknown, territoryRef: string, _lock: number, territory: Record<string, any>) => {
    territoriosGravados.push({ op: "update", territoryRef, territory });
    return { territoryRef, lockVersion: 2, territory };
  },
} });
mock.module("@/lib/server/arquiteto-territorial-ai-store", { namedExports: { listTerritorialAiProposals: async () => [] } });
mock.module("@/lib/server/arquiteto-article-formation-marker-store", { namedExports: { readArticleFormationMarker: async () => null } });
mock.module("@/lib/server/arquiteto-architecture-marker-store", { namedExports: { readArchitectureMarker: async () => null } });
mock.module("@/lib/server/arquiteto-silo-working-copy-store", { namedExports: {
  createSiloWorkingCopy: async () => ({}),
  listSiloWorkingCopies: async () => [],
  updateSiloWorkingCopy: async () => ({}),
} });

const { POST } = await import("../app/api/arquiteto/serp/route.ts");
const { POST: POST_TERRITORIAL } = await import("../app/api/arquiteto/territorial-serp/route.ts");
const { POST: POST_KEYWORD } = await import("../app/api/arquiteto/keyword-serp/route.ts");
const { PATCH: PATCH_WORKSPACE } = await import("../app/api/arquiteto/workspace/route.ts");
const { TERRITORY_PRIMARY_COLUMNS, KEYWORD_TERRITORY_REF_COLUMNS } = await import("../lib/arquiteto/silo-primary-acceptance.ts");
const { serpPaidPlanOptions } = await import("../lib/arquiteto/serp-lens-plan.ts");
const { collectAndCacheSerp } = await import("../lib/server/serp-cache.ts");
const { SERP_CACHE_LENSES, serpCacheLensLabel } = await import("../lib/editorial/serp-cache.ts");

/* ---------------------------------- pedido ---------------------------------- */

const keyword = (id: string, text: string) => ({ id, keyword: text, intent: "informational", volume_search: 100, kgr_score: 0.2, lista_id: "silo-1", silo_id: "silo-1", siloName: "Silo", status: "aprovado", isPublished: false, slug_sugerido: null, hierarquia: null, analise_semantica: { intencao_principal: "informational", entidade_central: text, dna_origem: "humano", dna_confianca: 0.9 } });
const grupo = {
  id: "grupo-1", keywordIds: [KW_1, KW_2], keywords: [keyword(KW_1, "skincare facial"), keyword(KW_2, "rotina skincare facial")],
  publishedAnchorId: null, territoryRef: TERRITORIO, suggestedSiloId: "silo-1", suggestedSiloName: "Silo",
  evidence: { lexical: 0.9, intent: 0.9, entities: 0.9, silo: 1, combined: 0.9 }, confidence: 0.9, alerts: [],
  principalSuggestion: { keywordId: KW_1, score: 0.9, breakdown: { cobertura: 0.9, intencao: 0.9, centralidadeSemantica: 0.9, aderenciaMarca: 0.9, potencialComercial: 0.5, volume: 0.8, dificuldade: 0.4, qualidadeSlug: 0.8, ancoraPublicada: 0, serp: null }, justificativa: ["principal"], pendencias: [] },
  roles: { [KW_1]: "principal", [KW_2]: "secundaria" }, suggestedHierarchy: "Pilar",
};

const chamar = async (extra: Record<string, unknown>) => {
  const resposta = await POST(new Request("http://teste/api/arquiteto/serp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: MARCA, groups: [grupo], lenses: SERP_CACHE_LENSES.map(serpCacheLensLabel), formationBaseHashes: { "grupo-1": "base-1" }, ...extra }),
  }));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, any> };
};

const recomecar = () => {
  banco = new Banco();
  pedidosAoProvider.length = 0;
  usos.length = 0;
  gravados.length = 0;
  resolucoes = 0;
};

/** Grava no cache a SERP de uma keyword numa lente, como o Minerador gravaria. */
const semear = async (texto: string, keywordId: string, lensIndex: number, collectedAt = new Date()) => {
  const lens = SERP_CACHE_LENSES[lensIndex];
  const canonica = lensIndex === 0;
  await collectAndCacheSerp({ supabase: banco as never, brandId: MARCA, actorUserId: "minerador" }, {
    query: { keyword: texto, locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced" },
    depth: canonica ? 20 : 10,
    keywordId,
  }, { config: CONFIG, operationRequestId: "op-minerador", collectedBy: "minerador", now: collectedAt, storeBody: canonica });
};

/* ---------------------------------- testes ---------------------------------- */

test("A6 · `plan` não chama o provider, não resolve credencial, não registra uso", async () => {
  recomecar();
  const { status, corpo } = await chamar({ mode: "plan" });
  assert.equal(status, 200);
  assert.equal(corpo.data.mode, "plan");
  // 2 keywords × 4 lentes, nada em cache.
  assert.equal(corpo.data.plan.paidQueries, 8);
  assert.equal(corpo.data.plan.primaryPaidQueries, 2);
  assert.equal(corpo.data.plan.extraPaidQueries, 6);
  assert.deepEqual(pedidosAoProvider, []);
  assert.equal(resolucoes, 0);
  assert.deepEqual(usos, []);
  assert.deepEqual(gravados, []);
  // Só `meta` foi lido do cache — nenhum corpo, nenhum digest.
  const leiturasDoCache = banco.consultas.filter(consulta => consulta.tabela === "editorial_workflow_items");
  assert.ok(leiturasDoCache.length > 0);
  assert.ok(leiturasDoCache.every(consulta => consulta.colunas === "subject_id,meta:payload->meta"));
});

test("A6 · `execute` sem autorização, ou com menos que o plano, NÃO paga nada e devolve o plano", async () => {
  recomecar();
  const semAutorizacao = await chamar({ mode: "execute" });
  assert.equal(semAutorizacao.status, 409);
  assert.equal(semAutorizacao.corpo.code, "PAID_PLAN_REQUIRED");
  assert.equal(semAutorizacao.corpo.data.plan.paidQueries, 8);

  const aMenos = await chamar({ mode: "execute", authorizedPaidQueries: 7 });
  assert.equal(aMenos.status, 409);
  assert.equal(aMenos.corpo.code, "PAID_PLAN_CHANGED");
  // Um cliente antigo, com `device`, também não paga no clique.
  const legado = await POST(new Request("http://teste/api/arquiteto/serp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: MARCA, groups: [grupo], device: "desktop", formationBaseHashes: { "grupo-1": "base-1" } }),
  }));
  assert.equal(legado.status, 409);
  assert.equal((await legado.json()).data.plan.paidQueries, 2, "o legado é uma lente só");

  assert.deepEqual(pedidosAoProvider, []);
  assert.equal(resolucoes, 0);
  assert.deepEqual(usos, []);
  assert.deepEqual(gravados, []);
});

test("A3/A5 · tudo em cache: nenhuma chamada, o voto nas 4 lentes e o marcador gravado", async () => {
  recomecar();
  for (const [texto, id] of [["skincare facial", KW_1], ["rotina skincare facial", KW_2]] as const) {
    for (let lente = 0; lente < 4; lente += 1) await semear(texto, id, lente);
  }
  pedidosAoProvider.length = 0;

  const { status, corpo } = await chamar({ mode: "execute" });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.equal(corpo.data.paidQueries, 0);
  assert.deepEqual(pedidosAoProvider, [], "tudo em cache: o provider não é chamado");
  assert.equal(resolucoes, 0, "nem a credencial é lida");
  assert.equal(corpo.diagnostic.extraLensCacheHits, 6);
  // As extras vieram pelo digest: nenhuma leitura de corpo de lente extra.
  const leiturasDeCorpo = banco.consultas.filter(consulta => consulta.colunas.includes("body:payload->body"));
  assert.ok(leiturasDeCorpo.every(consulta => ((consulta.filtros.find(filtro => filtro.tipo === "in")?.valor as string[]) || []).length <= 2));

  assert.equal(gravados.length, 1);
  const lentes = gravados[0].interpretation?.lenses as { requested: string[]; observed: string[]; agreement: string; missing: unknown[]; perLens: Array<{ pairs: Array<{ level: string }> }> };
  assert.deepEqual(lentes.requested, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  assert.deepEqual(lentes.observed, lentes.requested);
  assert.equal(lentes.agreement, "4/4");
  assert.deepEqual(lentes.missing, []);
  // A mesma SERP para as duas buscas: forte em cada lente.
  assert.deepEqual(lentes.perLens.map(linha => linha.pairs[0]?.level), ["forte", "forte", "forte", "forte"]);
  assert.equal(gravados[0].verdict, "COMPATIBLE");
});

test("A6/A3 · paga EXATAMENTE as lentes que faltam, sem corpo nas extras, com a lente no uso", async () => {
  recomecar();
  // A canônica das duas e a macOS das duas em cache; android e iOS faltam.
  for (const [texto, id] of [["skincare facial", KW_1], ["rotina skincare facial", KW_2]] as const) {
    await semear(texto, id, 0);
    await semear(texto, id, 1);
  }
  pedidosAoProvider.length = 0;
  const plano = await chamar({ mode: "plan" });
  assert.equal(plano.corpo.data.plan.paidQueries, 4);

  const { status, corpo } = await chamar({ mode: "execute", authorizedPaidQueries: plano.corpo.data.plan.paidQueries });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.equal(pedidosAoProvider.length, 4);
  assert.ok(pedidosAoProvider.every(pedido => pedido.device === "mobile" && pedido.depth === 10));
  assert.deepEqual(pedidosAoProvider.map(pedido => pedido.os).sort(), ["android", "android", "ios", "ios"]);
  assert.equal(corpo.data.paidQueries, 4);
  // As extras pagas gravam meta, observação e digest — nunca o corpo.
  const extras = banco.linhas("editorial_workflow_items").filter(linha => (linha.payload as { meta: { lens: { device: string } } }).meta.lens.device === "mobile");
  assert.equal(extras.length, 4);
  assert.ok(extras.every(linha => !("body" in (linha.payload as object)) && "digest" in (linha.payload as object)));
  // O uso de cada lente paga, com a lente na chave: nada registrado por acerto.
  assert.equal(usos.length, 4);
  assert.ok(usos.every(uso => uso.resultStatus === "succeeded" && /:mobile-(android|ios)$/.test(uso.idempotencyKey)));
  const lentes = gravados[0].interpretation?.lenses as { observed: string[] };
  assert.deepEqual(lentes.observed, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
});

test("A6 · 'só a lente principal': as extras que faltam não são pagas e ficam declaradas", async () => {
  recomecar();
  for (const [texto, id] of [["skincare facial", KW_1], ["rotina skincare facial", KW_2]] as const) await semear(texto, id, 0);
  pedidosAoProvider.length = 0;
  const { status, corpo } = await chamar({ mode: "execute", payMissingExtraLenses: false });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.deepEqual(pedidosAoProvider, []);
  const lentes = gravados[0].interpretation?.lenses as { observed: string[]; missing: Array<{ reason: string; detail?: string }> };
  assert.deepEqual(lentes.observed, ["desktop-windows"]);
  assert.equal(lentes.missing.length, 6);
  assert.ok(lentes.missing.every(item => item.reason === "não paga" && item.detail === "A validação foi pedida só com as lentes em cache."));
});

test("A6 · acerto que degrada depois do plano NÃO é pago além do autorizado: o artigo falha dizendo por quê", async () => {
  recomecar();
  // A canônica está no cache SEM corpo: o plano (meta) conta acerto, a leitura do corpo vê falta.
  for (const [texto, id] of [["skincare facial", KW_1], ["rotina skincare facial", KW_2]] as const) {
    await collectAndCacheSerp({ supabase: banco as never, brandId: MARCA, actorUserId: "minerador" }, {
      query: { keyword: texto, locationCode: 2076, languageCode: "pt", lens: SERP_CACHE_LENSES[0], endpoint: "advanced" }, depth: 20, keywordId: id,
    }, { config: CONFIG, operationRequestId: "op-minerador", collectedBy: "minerador", now: new Date(), storeBody: false });
    for (let lente = 1; lente < 4; lente += 1) await semear(texto, id, lente);
  }
  pedidosAoProvider.length = 0;
  const plano = await chamar({ mode: "plan" });
  assert.equal(plano.corpo.data.plan.paidQueries, 0, "pela meta, tudo em cache");
  const { status, corpo } = await chamar({ mode: "execute" });
  assert.equal(status, 200);
  assert.equal(pedidosAoProvider.length, 0, "nenhuma chamada fora do autorizado");
  assert.equal(corpo.data.failures.length, 1);
  assert.equal(corpo.data.failures[0].code, "SERP_PAID_NOT_AUTHORIZED");
  assert.equal(gravados.length, 0);
});

test("A8 · lentes com mais de 7 dias de diferença: marcadas, e NENHUMA recoleta sem pedido", async () => {
  recomecar();
  const agora = new Date();
  const antiga = new Date(agora.getTime() - 9 * 24 * 60 * 60 * 1000);
  for (const [texto, id] of [["skincare facial", KW_1], ["rotina skincare facial", KW_2]] as const) {
    await semear(texto, id, 0, agora);
    await semear(texto, id, 1, antiga);
    await semear(texto, id, 2, agora);
    await semear(texto, id, 3, agora);
  }
  pedidosAoProvider.length = 0;
  const plano = await chamar({ mode: "plan" });
  assert.equal(plano.corpo.data.plan.paidQueries, 0);
  assert.equal(plano.corpo.data.plan.datesDiverge, true);
  assert.equal(plano.corpo.data.plan.recollectableQueries, 2);

  const sem = await chamar({ mode: "execute" });
  assert.equal(sem.status, 200);
  // `length`, e não `deepEqual(…, [])`: a asserção estreitaria o tipo da lista para `never[]`.
  assert.equal(pedidosAoProvider.length, 0, "marcar não paga");
  const marcador = gravados[0].interpretation?.lenses as { datesDiverge: boolean; collectedAtSpreadDays: number };
  assert.equal(marcador.datesDiverge, true);
  assert.ok(marcador.collectedAtSpreadDays >= 9);

  // Pedida, a recoleta paga só as duas lentes antigas.
  gravados.length = 0;
  const pedida = await chamar({ mode: "execute", recollectStaleLenses: true, authorizedPaidQueries: 2 });
  assert.equal(pedida.status, 200, JSON.stringify(pedida.corpo).slice(0, 500));
  assert.equal(pedidosAoProvider.length, 2);
  assert.ok(pedidosAoProvider.every(pedido => pedido.os === "macos"));
  assert.equal((gravados[0].interpretation?.lenses as { datesDiverge: boolean }).datesDiverge, false);
});

test("A8 · keyword do acervo usa os códigos do Minerador, lidos da marca ativa", async () => {
  recomecar();
  // Com o ambiente em `pt-br`, a chave do Minerador continua em `pt`.
  const antes = process.env.DATAFORSEO_LANGUAGE_CODE;
  process.env.DATAFORSEO_LANGUAGE_CODE = "pt-br";
  try {
    banco.linhas("minerador_keywords").push(
      { id: KW_1, lock_version: 1, brand_id: MARCA, deleted_at: null, analise_semantica: { allintitle_measurement: { targeting: { languageCode: "pt", sourceGeoTargetConstants: ["geoTargetConstants/2076"] } } } },
      { id: KW_2, lock_version: 1, brand_id: "marca-b", deleted_at: null, analise_semantica: { allintitle_measurement: { targeting: { languageCode: "pt" } } } },
    );
    await semear("skincare facial", KW_1, 0);
    const plano = await chamar({ mode: "plan", lenses: ["desktop-windows"] });
    // KW_1 é da marca: cai na entrada do Minerador. KW_2 é de outra marca: fica com o ambiente e falta.
    assert.equal(plano.corpo.data.plan.perLens[0].hits, 1);
    assert.equal(plano.corpo.data.plan.perLens[0].misses, 1);
    const leitura = banco.consultas.find(consulta => consulta.tabela === "minerador_keywords")!;
    assert.equal(leitura.colunas, "id,targeting:analise_semantica->allintitle_measurement->targeting");
    assert.ok(leitura.filtros.some(filtro => filtro.coluna === "brand_id" && filtro.valor === MARCA));
    assert.ok(leitura.filtros.some(filtro => filtro.coluna === "deleted_at" && filtro.tipo === "is" && filtro.valor === null));
  } finally {
    if (antes === undefined) delete process.env.DATAFORSEO_LANGUAGE_CODE;
    else process.env.DATAFORSEO_LANGUAGE_CODE = antes;
  }
});

/* ============================ SERP territorial (A4) ============================ */

const TERRITORIO_B = "territory:44444444-4444-4444-8444-444444444444";
const comparacao = {
  questionId: "serp:new_vs_existing:a", kind: "new_vs_existing", territoryRef: TERRITORIO, comparedTerritoryRef: TERRITORIO_B,
  queries: [
    { keywordId: TERRITORIO, keyword: "sérum facial", role: "primary" },
    { keywordId: TERRITORIO_B, keyword: "sérum vitamina c", role: "comparison" },
  ],
  reason: "Silo novo.",
  base: { kind: "new_vs_existing", territoryRef: TERRITORIO, comparedTerritoryRef: TERRITORIO_B, queries: ["sérum facial", "sérum vitamina c"], subjectFacts: [] },
};
const semComparacao = {
  questionId: "serp:manual_silo:b", kind: "manual_silo", territoryRef: TERRITORIO_B, comparedTerritoryRef: null,
  queries: [{ keywordId: TERRITORIO_B, keyword: "sérum vitamina c", role: "primary" }],
  reason: "Silo criado à mão.",
  base: { kind: "manual_silo", territoryRef: TERRITORIO_B, comparedTerritoryRef: null, queries: ["sérum vitamina c"], subjectFacts: [] },
};
const chamarTerritorial = async (perguntas: unknown[], extra: Record<string, unknown>) => {
  const resposta = await POST_TERRITORIAL(new Request("http://teste/api/arquiteto/territorial-serp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: MARCA, questions: perguntas, lenses: SERP_CACHE_LENSES.map(serpCacheLensLabel), ...extra }),
  }));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, any> };
};
/** O texto de território vai ao cache com os códigos do ambiente, sem keyword do acervo. */
const semearTexto = (texto: string, lensIndex: number) => semear(texto, null as never, lensIndex);

test("A4/A6 · territorial: `plan` não paga; só a pergunta COM comparação paga lentes extras", async () => {
  recomecar();
  gravadosTerritoriais.length = 0;
  const plano = await chamarTerritorial([comparacao, semComparacao], { mode: "plan" });
  assert.equal(plano.status, 200);
  // Comparação: 2 consultas × 4 lentes. Sem comparação: a principal (a mesma consulta já contada) e extras não pagas.
  assert.equal(plano.corpo.data.plan.primaryPaidQueries, 2);
  assert.equal(plano.corpo.data.plan.extraPaidQueries, 6);
  assert.equal(plano.corpo.data.plan.perLens.find((linha: { lens: string }) => linha.lens === "mobile-ios").unpaidMisses, 1);
  assert.deepEqual(pedidosAoProvider, []);
  assert.equal(resolucoes, 0);

  const semAutorizacao = await chamarTerritorial([comparacao], { mode: "execute" });
  assert.equal(semAutorizacao.status, 409);
  assert.deepEqual(pedidosAoProvider, []);
});

test("A4 · territorial em cache nas 4 lentes: a sobreposição é votada por lente, sem nenhuma chamada", async () => {
  recomecar();
  gravadosTerritoriais.length = 0;
  for (let lente = 0; lente < 4; lente += 1) {
    await semearTexto("sérum facial", lente);
    await semearTexto("sérum vitamina c", lente);
  }
  pedidosAoProvider.length = 0;
  const { status, corpo } = await chamarTerritorial([comparacao, semComparacao], { mode: "execute" });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.deepEqual(pedidosAoProvider, []);
  assert.equal(corpo.data.serpCache.paid, 0);
  const [comp, sem] = corpo.data.assessments;
  // A mesma SERP para os dois textos: sobreposição alta nas 4 lentes.
  assert.equal(comp.overlap, "high");
  assert.equal(comp.lenses.agreement, "4/4");
  assert.deepEqual(comp.lenses.perLens.map((linha: { verdict: string }) => linha.verdict), ["high", "high", "high", "high"]);
  assert.equal(comp.recommendation, "usar_silo_existente");
  // Sem comparação: as extras em cache mostram o formato, sem voto.
  assert.equal(sem.lenses.agreement, "sem comparação");
  assert.deepEqual(sem.lenses.observed, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  assert.ok(sem.lenses.perLens.every((linha: { blocks?: string[] }) => Array.isArray(linha.blocks) && linha.blocks.length > 0));
});

test("A4/A6 · territorial: paga só as extras da comparação, uma vez por consulta, e declara as outras", async () => {
  recomecar();
  gravadosTerritoriais.length = 0;
  await semearTexto("sérum facial", 0);
  await semearTexto("sérum vitamina c", 0);
  pedidosAoProvider.length = 0;
  const plano = await chamarTerritorial([comparacao, semComparacao], { mode: "plan" });
  assert.equal(plano.corpo.data.plan.paidQueries, 6);
  const { status, corpo } = await chamarTerritorial([comparacao, semComparacao], { mode: "execute", authorizedPaidQueries: 6 });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.equal(pedidosAoProvider.length, 6, "3 lentes × 2 consultas da comparação, cada uma paga uma vez");
  assert.ok(pedidosAoProvider.every(pedido => pedido.depth === 10 && !(pedido.device === "desktop" && pedido.os === "windows")));
  const extras = banco.linhas("editorial_workflow_items").filter(linha => (linha.payload as { meta: { lens: { operatingSystem: string } } }).meta.lens.operatingSystem !== "windows");
  assert.ok(extras.every(linha => !("body" in (linha.payload as object))), "lente extra paga não grava corpo");
  const [, sem] = corpo.data.assessments;
  // A pergunta sem comparação reaproveita, sem pagar de novo, a lente que a comparação acabou de pagar.
  assert.deepEqual(sem.lenses.observed, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  assert.deepEqual(sem.lenses.missing, []);

  // Na ordem inversa, a pergunta sem comparação vem antes: nada foi pago ainda, e ela não paga.
  recomecar();
  gravadosTerritoriais.length = 0;
  await semearTexto("sérum facial", 0);
  await semearTexto("sérum vitamina c", 0);
  pedidosAoProvider.length = 0;
  const inversa = await chamarTerritorial([semComparacao, comparacao], { mode: "execute", authorizedPaidQueries: 6 });
  assert.equal(inversa.status, 200);
  assert.equal(pedidosAoProvider.length, 6);
  // As 3 extras da pergunta sem comparação ficam declaradas "sem par" — nenhuma foi paga por ela.
  const faltantes = inversa.corpo.data.assessments[0].lenses.missing as Array<{ reason: string }>;
  assert.equal(faltantes.length, 3);
  assert.ok(faltantes.every(item => item.reason === "sem par"));
  assert.deepEqual(inversa.corpo.data.assessments[0].lenses.observed, ["desktop-windows"]);
});

/* ======================= correções da A2 (2026-09-23) ======================= */

const DIA = 24 * 60 * 60 * 1000;
/** Grava um texto de território numa lente, numa data. */
const semearTextoEm = (texto: string, lensIndex: number, collectedAt: Date) => semear(texto, null as never, lensIndex, collectedAt);

test("correção A2 · territorial com a canônica faltando: paga desktop-windows com 20 e grava a entrada com 20", async () => {
  recomecar();
  gravadosTerritoriais.length = 0;
  // As extras de "sérum facial" em cache; a canônica falta. Pergunta sem comparação: só a principal é paga.
  for (let lente = 1; lente < 4; lente += 1) await semearTexto("sérum facial", lente);
  pedidosAoProvider.length = 0;
  const manual = { ...semComparacao, questionId: "serp:manual_silo:c", territoryRef: TERRITORIO, queries: [{ keywordId: TERRITORIO, keyword: "sérum facial", role: "primary" }], base: { ...semComparacao.base, territoryRef: TERRITORIO, queries: ["sérum facial"] } };
  const plano = await chamarTerritorial([manual], { mode: "plan" });
  assert.equal(plano.corpo.data.plan.paidQueries, 1);
  const { status, corpo } = await chamarTerritorial([manual], { mode: "execute", authorizedPaidQueries: 1 });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.deepEqual(pedidosAoProvider, [{ keyword: "sérum facial", device: "desktop", os: "windows", depth: 20 }]);
  const canonica = banco.linhas("editorial_workflow_items").find(linha => {
    const meta = (linha.payload as { meta: { lens: { operatingSystem: string }; normalizedKeyword: string } }).meta;
    return meta.lens.operatingSystem === "windows" && meta.normalizedKeyword === "sérum facial";
  });
  assert.equal((canonica?.payload as { meta: { depth: number } }).meta.depth, 20, "a CALL 3 do Minerador não paga de novo");
  assert.ok("body" in (canonica?.payload as object), "a canônica guarda o corpo");
  // O parecer lê o pedido (10): o corpo pago com 20 é recortado antes de normalizar.
  assert.ok(corpo.data.assessments.length === 1);
});

test("correção A2 · territorial: recoleta só quando pedida, e só das lentes antigas", async () => {
  recomecar();
  gravadosTerritoriais.length = 0;
  const agora = new Date();
  const antiga = new Date(agora.getTime() - 9 * DIA);
  for (let lente = 0; lente < 4; lente += 1) {
    await semearTextoEm("sérum facial", lente, lente === 1 ? antiga : agora);
    await semearTextoEm("sérum vitamina c", lente, agora);
  }
  pedidosAoProvider.length = 0;
  const plano = await chamarTerritorial([comparacao], { mode: "plan" });
  assert.equal(plano.corpo.data.plan.paidQueries, 0);
  assert.equal(plano.corpo.data.plan.recollectableQueries, 1);
  assert.equal(plano.corpo.data.plan.datesDiverge, true);

  // Sem pedido: nada é pago, e a diferença fica marcada no parecer.
  const sem = await chamarTerritorial([comparacao], { mode: "execute" });
  assert.equal(sem.status, 200, JSON.stringify(sem.corpo).slice(0, 500));
  assert.equal(pedidosAoProvider.length, 0);
  assert.equal(sem.corpo.data.assessments[0].lenses.datesDiverge, true);

  // Pedida, com o número da opção: paga só a macOS antiga de "sérum facial".
  const opcao = serpPaidPlanOptions(plano.corpo.data.plan).find(item => item.id === "recollect");
  assert.ok(opcao);
  // O dublê do readback devolve o primeiro parecer com o mesmo `questionId`.
  gravadosTerritoriais.length = 0;
  const pedida = await chamarTerritorial([comparacao], { mode: "execute", ...opcao.choice });
  assert.equal(pedida.status, 200, JSON.stringify(pedida.corpo).slice(0, 500));
  assert.deepEqual(pedidosAoProvider, [{ keyword: "sérum facial", device: "desktop", os: "macos", depth: 10 }]);
  assert.equal(pedida.corpo.data.assessments[0].lenses.datesDiverge, false);
});

test("correção A2 · territorial: a recoleta pedida da lente PRINCIPAL antiga paga a canônica com 20, e só ela", async () => {
  recomecar();
  gravadosTerritoriais.length = 0;
  const agora = new Date();
  for (let lente = 0; lente < 4; lente += 1) {
    await semearTextoEm("sérum facial", lente, lente === 0 ? new Date(agora.getTime() - 9 * DIA) : agora);
    await semearTextoEm("sérum vitamina c", lente, agora);
  }
  pedidosAoProvider.length = 0;
  const plano = await chamarTerritorial([comparacao], { mode: "plan" });
  assert.equal(plano.corpo.data.plan.recollectableQueries, 1);
  const opcao = serpPaidPlanOptions(plano.corpo.data.plan).find(item => item.id === "recollect");
  assert.ok(opcao);
  const pedida = await chamarTerritorial([comparacao], { mode: "execute", ...opcao.choice });
  assert.equal(pedida.status, 200, JSON.stringify(pedida.corpo).slice(0, 500));
  assert.deepEqual(pedidosAoProvider, [{ keyword: "sérum facial", device: "desktop", os: "windows", depth: 20 }]);
  assert.equal(pedida.corpo.data.assessments[0].lenses.datesDiverge, false);
});

test("correção A2 · territorial: consultas de épocas diferentes com lentes consistentes NÃO saem 'lentes de datas diferentes'", async () => {
  recomecar();
  gravadosTerritoriais.length = 0;
  const agora = new Date();
  const velho = new Date(agora.getTime() - 20 * DIA);
  for (let lente = 0; lente < 4; lente += 1) {
    await semearTextoEm("sérum facial", lente, agora);
    await semearTextoEm("sérum vitamina c", lente, velho);
  }
  pedidosAoProvider.length = 0;
  const { status, corpo } = await chamarTerritorial([comparacao], { mode: "execute" });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.equal(corpo.data.plan.datesDiverge, false);
  assert.equal(corpo.data.assessments[0].lenses.datesDiverge, false);
  assert.equal(corpo.data.assessments[0].lenses.collectedAtSpreadDays, 0);
});

const KW_3 = "55555555-5555-4555-8555-555555555555";
const grupoDois = {
  ...grupo, id: "grupo-2", keywordIds: [KW_1, KW_3], keywords: [keyword(KW_1, "skincare facial"), keyword(KW_3, "skincare facial noturno")],
  roles: { [KW_1]: "principal", [KW_3]: "secundaria" },
};

test("correção A2 · formação: a mesma keyword em dois artigos paga cada lente extra UMA vez", async () => {
  recomecar();
  for (const [texto, id] of [["skincare facial", KW_1], ["rotina skincare facial", KW_2], ["skincare facial noturno", KW_3]] as const) await semear(texto, id, 0);
  pedidosAoProvider.length = 0;
  const hashes = { "grupo-1": "base-1", "grupo-2": "base-1" };
  const plano = await chamar({ mode: "plan", groups: [grupo, grupoDois], formationBaseHashes: hashes });
  // 3 keywords distintas × 3 extras; antes eram 2 artigos × 2 keywords × 3 = 12.
  assert.equal(plano.corpo.data.plan.paidQueries, 9);
  const { status, corpo } = await chamar({ mode: "execute", groups: [grupo, grupoDois], formationBaseHashes: hashes, authorizedPaidQueries: 9 });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.equal(pedidosAoProvider.length, 9);
  const doKw1 = pedidosAoProvider.filter(pedido => pedido.keyword === "skincare facial");
  assert.deepEqual(doKw1.map(pedido => pedido.os).sort(), ["android", "ios", "macos"]);
  assert.equal(usos.length, 9, "uso registrado uma vez por chamada");
  // Os dois artigos leem a lente paga: as 4 lentes observadas nos dois.
  assert.equal(gravados.length, 2);
  for (const gravado of gravados) assert.deepEqual((gravado.interpretation?.lenses as { observed: string[] }).observed, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
});

test("correção A2 · formação KGR leve: a secundária e TODAS as extras entram no plano como condicionais", async () => {
  recomecar();
  const kgr = {
    ...grupo, id: "grupo-kgr",
    kgrIdentity: { isKgrArticle: true, source: "human_confirmation", bindingStatus: "confirmed", status: "confirmed", primaryKeywordId: KW_1, principalKeywordDnaId: KW_1, boundSlug: "skincare-facial" },
  };
  const { status, corpo } = await chamar({ mode: "plan", groups: [kgr], formationBaseHashes: { "grupo-kgr": "base-1" } });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  // 2 buscas × 4 lentes; só a canônica da Principal é paga sem condição.
  assert.equal(corpo.data.plan.paidQueries, 8);
  assert.equal(corpo.data.plan.conditionalPaidQueries, 7);
  assert.deepEqual(pedidosAoProvider, []);
});

test("correção A2 · formação: a degradação de um artigo NÃO tira a vaga da falta planejada de outro", async () => {
  recomecar();
  // Artigo A: a canônica em cache SEM corpo (o plano conta acerto; a leitura do corpo vê falta).
  await collectAndCacheSerp({ supabase: banco as never, brandId: MARCA, actorUserId: "minerador" }, {
    query: { keyword: "skincare facial", locationCode: 2076, languageCode: "pt", lens: SERP_CACHE_LENSES[0], endpoint: "advanced" }, depth: 20, keywordId: KW_1,
  }, { config: CONFIG, operationRequestId: "op-minerador", collectedBy: "minerador", now: new Date(), storeBody: false });
  pedidosAoProvider.length = 0;
  const umaBusca = (id: string, kw: string, text: string) => ({
    ...grupo, id, keywordIds: [kw], keywords: [keyword(kw, text)], roles: { [kw]: "principal" },
    principalSuggestion: { ...grupo.principalSuggestion, keywordId: kw },
  });
  const grupos = [umaBusca("grupo-a", KW_1, "skincare facial"), umaBusca("grupo-b", KW_3, "skincare facial noturno")];
  const hashes = { "grupo-a": "base-1", "grupo-b": "base-1" };
  const plano = await chamar({ mode: "plan", groups: grupos, formationBaseHashes: hashes, lenses: ["desktop-windows"] });
  assert.equal(plano.corpo.data.plan.paidQueries, 1, "só a falta do artigo B está no plano");
  const { status, corpo } = await chamar({ mode: "execute", groups: grupos, formationBaseHashes: hashes, lenses: ["desktop-windows"], authorizedPaidQueries: 1 });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  // Antes: o artigo A, que corre primeiro, levava a única vaga, e o B falhava.
  assert.deepEqual(pedidosAoProvider.map(pedido => pedido.keyword), ["skincare facial noturno"]);
  assert.equal(corpo.data.failures.length, 1);
  assert.equal(corpo.data.failures[0].articleId, "grupo-a");
  assert.equal(corpo.data.failures[0].code, "SERP_PAID_NOT_AUTHORIZED");
});

const chamarPorKeyword = async (extra: Record<string, unknown>) => {
  const resposta = await POST_KEYWORD(new Request("http://teste/api/arquiteto/keyword-serp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: MARCA, scopeId: TERRITORIO, territoryRef: TERRITORIO, keywords: [{ keywordId: KW_1, keyword: "skincare facial" }], ...extra }),
  }));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, any> };
};

test("correção A2 · 'Consultar nas 4 lentes': lente antiga marcada, SEM botão de recoleta, e o plano lê só `meta`", async () => {
  recomecar();
  const agora = new Date();
  for (let lente = 0; lente < 4; lente += 1) await semear("skincare facial", KW_1, lente, lente === 1 ? new Date(agora.getTime() - 9 * DIA) : agora);
  pedidosAoProvider.length = 0;
  banco.consultas.length = 0;

  const plano = await chamarPorKeyword({ mode: "plan" });
  assert.equal(plano.status, 200);
  assert.equal(plano.corpo.data.plan.paidQueries, 0);
  assert.equal(plano.corpo.data.plan.datesDiverge, true);
  assert.equal(plano.corpo.data.plan.recollectableQueries, 0, "a rota não recoleta: o plano não oferece");
  assert.deepEqual(serpPaidPlanOptions(plano.corpo.data.plan, { allowPrimaryOnly: false }).map(opcao => opcao.id), ["all"]);
  const leituras = banco.consultas.filter(consulta => consulta.tabela === "editorial_workflow_items");
  assert.ok(leituras.length > 0 && leituras.every(consulta => consulta.colunas === "subject_id,meta:payload->meta"), "o plano não lê a observação");

  const { status, corpo } = await chamarPorKeyword({ mode: "execute" });
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 500));
  assert.equal(pedidosAoProvider.length, 0);
  const observacoes = corpo.data.observations as Array<{ lens: string; collectedAt?: string }>;
  assert.equal(observacoes.length, 4);
  assert.ok(observacoes.every(item => typeof item.collectedAt === "string"), "cada lente leva a sua data");
  const macos = observacoes.find(item => item.lens === "desktop-macos");
  const windows = observacoes.find(item => item.lens === "desktop-windows");
  assert.ok(Date.parse(windows!.collectedAt!) - Date.parse(macos!.collectedAt!) > 8 * DIA);
});

/* ------------- correção A3 · PATCH do workspace, executado de verdade ------------- */

const MARCA_UUID = "99999999-9999-4999-8999-999999999999";
const SILO_A3 = "territory:66666666-6666-4666-8666-666666666666";
const EVIDENCIA_A3 = { competitorOverlap: 2, devicesAgreeing: 4, devicesObserved: 4, score: 16 };

/** Uma linha de território e a membership da keyword, como o banco guarda. */
const semearSilo = (territory: Record<string, unknown>, membros: Array<{ keywordId: string; territoryRef: string | null; marca?: string }> = []) => {
  recomecar();
  territoriosGravados.length = 0;
  const linhas = banco.linhas("editorial_workflow_items");
  linhas.push({ id: "wf-territorio", lock_version: 3, marca_id: MARCA, subject_type: "territory", stage: "architect", subject_id: SILO_A3, payload: { contractVersion: "territory-record-v1", territory: { territoryRef: SILO_A3, ...territory } } });
  for (const membro of membros) {
    linhas.push({ id: `wf-${membro.keywordId}`, lock_version: 1, marca_id: membro.marca ?? MARCA, subject_type: "keyword", stage: "architect", subject_id: membro.keywordId, payload: { territoryRef: membro.territoryRef } });
  }
};

const patchWorkspace = async (corpo: Record<string, unknown>) => {
  const resposta = await PATCH_WORKSPACE(new Request("http://teste/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: MARCA_UUID, ...corpo }),
  }));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, any> };
};

const aceitarNoSilo = (territory: Record<string, unknown>, keywordId = KW_1) => patchWorkspace({
  territoryPrimaryAcceptances: [{
    territoryRef: SILO_A3, expectedLock: 3, territory,
    acceptance: { keywordId, previousKeywordId: null, evidence: EVIDENCIA_A3 },
  }],
});

test("correção A3 · PATCH: aceite em lista nova grava a primária com ator do servidor, lendo só colunas estreitas", async () => {
  semearSilo({ publicationProtection: "unpublished", territoryKind: "new" }, [{ keywordId: KW_1, territoryRef: SILO_A3 }]);
  const { status, corpo } = await aceitarNoSilo({ name: "Skincare", publicationProtection: "unpublished", territoryKind: "new" });
  assert.equal(status, 200, JSON.stringify(corpo));
  assert.equal(territoriosGravados.length, 1);
  const gravada = territoriosGravados[0].territory.primaryKeyword;
  assert.equal(gravada.electedBy, "serp");
  assert.equal(gravada.keywordId, KW_1);
  assert.equal(gravada.confirmedBy.actorUserId, "usuario-1", "o ator é o da sessão");
  // As leituras da trava são estreitas: nunca `*` nem o payload inteiro.
  const leituras = banco.consultas.filter(consulta => consulta.op === "select").map(consulta => consulta.colunas);
  assert.deepEqual(leituras, [TERRITORY_PRIMARY_COLUMNS, KEYWORD_TERRITORY_REF_COLUMNS]);
});

test("correção A3 · PATCH: Silo PUBLICADO sem primária não recebe a primária da SERP, mesmo que o corpo diga 'unpublished'", async () => {
  semearSilo({ publicationProtection: "protected", territoryKind: "existing" }, [{ keywordId: KW_1, territoryRef: SILO_A3 }]);
  // O navegador mente sobre a origem no rascunho: a rota usa a linha gravada.
  const { status, corpo } = await aceitarNoSilo({ name: "Skincare", publicationProtection: "unpublished", territoryKind: "new" });
  assert.equal(status, 409);
  assert.match(corpo.error, /página publicada/);
  assert.equal(territoriosGravados.length, 0, "nada foi gravado");

  semearSilo({ publicationProtection: "unpublished", territoryKind: "existing" }, [{ keywordId: KW_1, territoryRef: SILO_A3 }]);
  assert.equal((await aceitarNoSilo({ name: "Skincare" })).status, 409);
  semearSilo({ publicationProtection: "unknown", territoryKind: "new" }, [{ keywordId: KW_1, territoryRef: SILO_A3 }]);
  assert.equal((await aceitarNoSilo({ name: "Skincare" })).status, 409);
  assert.equal(territoriosGravados.length, 0);
});

test("correção A3 · PATCH: keyword de outro Silo ou de OUTRA MARCA não vira primária", async () => {
  semearSilo({ publicationProtection: "unpublished", territoryKind: "new" }, [
    { keywordId: KW_1, territoryRef: "territory:77777777-7777-4777-8777-777777777777" },
    { keywordId: KW_2, territoryRef: SILO_A3, marca: "marca-b" },
  ]);
  const deOutroSilo = await aceitarNoSilo({ name: "Skincare" }, KW_1);
  assert.equal(deOutroSilo.status, 409);
  assert.match(deOutroSilo.corpo.error, /não pertence a este Silo/);
  const deOutraMarca = await aceitarNoSilo({ name: "Skincare" }, KW_2);
  assert.equal(deOutraMarca.status, 409);
  assert.equal(territoriosGravados.length, 0);
});

test("correção A3 · PATCH: a criação recusa primária de SERP forjada e aceita a declaração publicada", async () => {
  semearSilo({ publicationProtection: "unpublished", territoryKind: "new" });
  const forjada = await patchWorkspace({ territoryCreates: [{ territory: {
    name: "Skincare",
    primaryKeyword: { electedBy: "serp", keywordId: KW_1, evidence: EVIDENCIA_A3, electedAt: "2026-09-23T00:00:00+00:00", confirmedBy: { actorUserId: "ator-forjado", confirmedAt: "2020-01-01T00:00:00+00:00" } },
  } }] });
  assert.equal(forjada.status, 409);
  assert.match(forjada.corpo.error, /não nasce com primária eleita pela SERP/);
  assert.equal(territoriosGravados.length, 0);

  const publicada = await patchWorkspace({ territoryCreates: [{ territory: {
    name: "Skincare",
    primaryKeyword: { electedBy: "published_declaration", keywordId: KW_1, url: "https://marca.com.br/skincare", canonical: null, electedAt: "2026-09-23T00:00:00+00:00" },
  } }] });
  assert.equal(publicada.status, 200, JSON.stringify(publicada.corpo));
  assert.equal(territoriosGravados.length, 1);
});

test("correção A3 · PATCH: a edição genérica passa pela trava da primária, e território inexistente não grava", async () => {
  semearSilo({ publicationProtection: "unpublished", territoryKind: "new" });
  const semPrimaria = await patchWorkspace({ territoryUpdates: [{ territoryRef: SILO_A3, expectedLock: 3, territory: { name: "Skincare facial" } }] });
  assert.equal(semPrimaria.status, 200, JSON.stringify(semPrimaria.corpo));
  assert.equal(territoriosGravados.length, 1);

  const criandoPrimaria = await patchWorkspace({ territoryUpdates: [{ territoryRef: SILO_A3, expectedLock: 3, territory: {
    name: "Skincare facial",
    primaryKeyword: { electedBy: "serp", keywordId: KW_1, evidence: EVIDENCIA_A3, electedAt: "2026-09-23T00:00:00+00:00" },
  } }] });
  assert.equal(criandoPrimaria.status, 409);
  assert.equal(territoriosGravados.length, 1, "a segunda edição não gravou");

  const inexistente = await patchWorkspace({ territoryUpdates: [{ territoryRef: "territory:88888888-8888-4888-8888-888888888888", expectedLock: 1, territory: { name: "x" } }] });
  assert.equal(inexistente.status, 409);
  assert.equal(territoriosGravados.length, 1);
});
