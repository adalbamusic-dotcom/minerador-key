import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { mock, test } from "node:test";

/*
 * SERP NO ARTIGO E KGR OPCIONAL — as rotas do Arquiteto executadas de verdade
 * (SDD `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`,
 * A1, A2, A3 e A4). Mesmo arranjo de `arquiteto-quatro-lentes-rota`:
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --conditions=react-server \
 *     --import ./scripts/node-ts-register.mjs --experimental-test-module-mocks \
 *     --test tests/arquiteto-serp-no-artigo-rota.test.mts
 *
 * Sessão, permissão, uso de integração, credencial e o store do parecer são
 * dublês; o banco é uma tabela em memória com a forma do `postgrest-js`; o
 * provider é o `fetch` global trocado por um que registra cada pedido. Nenhuma
 * chamada paga, nenhum banco remoto.
 */

register(`data:text/javascript,${encodeURIComponent(
  "export async function resolve(especificador, contexto, proximo) {"
  + " if (especificador === 'next/server') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent("
  + "\"export const NextResponse = { json: (corpo, opcoes) => new Response(JSON.stringify(corpo), { status: (opcoes && opcoes.status) || 200, headers: { 'Content-Type': 'application/json' } }) };\") };"
  + " return proximo(especificador, contexto); }",
)}`);

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const CONFIG = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };
const MARCA = "44444444-4444-4444-8444-444444444444";
const KW_1 = "11111111-1111-4111-8111-111111111111";
const KW_2 = "22222222-2222-4222-8222-222222222222";
const KW_3 = "55555555-5555-4555-8555-555555555555";
const WF_1 = "66666666-6666-4666-8666-666666666666";
const TERRITORIO = "territory:33333333-3333-4333-8333-333333333333";

/* ------------------------------ banco em memória ----------------------------- */

type Linha = Record<string, unknown> & { id: string; lock_version: number };
type Filtro = { coluna: string; tipo: "eq" | "in" | "is"; valor: unknown };

function projetar(linha: Record<string, unknown>, colunas: string) {
  if (colunas.trim() === "*") return structuredClone(linha);
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
  constructor(banco: Banco, tabela: string) { this.banco = banco; this.tabela = tabela; }
  select(colunas = "*") { this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "eq", valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, tipo: "in", valor }); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "is", valor }); return this; }
  order() { return this; }
  insert(valores: Record<string, unknown>) { this.op = "insert"; this.valores = valores; return this; }
  update(valores: Record<string, unknown>) { this.op = "update"; this.valores = valores; return this; }
  maybeSingle() { this.unica = true; return this; }
  single() { this.unica = true; return this; }
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
      return { data: projetar(linha, consulta.colunas || "*"), error: null };
    }
    const alvo = linhas.filter(linha => consulta.filtros.every(({ coluna, tipo, valor }) =>
      tipo === "eq" ? linha[coluna] === valor : tipo === "is" ? (linha[coluna] ?? null) === valor : (valor as unknown[]).includes(linha[coluna])));
    if (consulta.op === "update") for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: linha.lock_version + 1 });
    const projetadas = alvo.map(linha => projetar(linha, consulta.colunas || "*"));
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
}

/* --------------------------------- provider --------------------------------- */

const pedidosSerp: Array<{ keyword: string; depth: number }> = [];
const pedidosAllintitle: Array<{ keyword: string; device: string; depth: number }> = [];
globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  const [corpo] = JSON.parse(String(init?.body)) as Array<{ keyword: string; device: string; os: string; depth: number; location_code: number; language_code: string }>;
  if (String(url).endsWith("/v3/serp/google/organic/live/regular")) {
    pedidosAllintitle.push({ keyword: corpo.keyword, device: corpo.device, depth: corpo.depth });
    return new Response(JSON.stringify({
      status_code: 20000,
      tasks: [{ id: `allintitle-${pedidosAllintitle.length}`, status_code: 20000, cost: 0.002, result: [{ keyword: corpo.keyword, location_code: corpo.location_code, language_code: corpo.language_code, datetime: "2026-09-28 10:00:00 +00:00", se_results_count: 42, check_url: null }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  pedidosSerp.push({ keyword: corpo.keyword, depth: corpo.depth });
  const resposta = structuredClone(CRU);
  resposta.tasks[0].id = `task-${pedidosSerp.length}`;
  resposta.tasks[0].data = { ...resposta.tasks[0].data, keyword: corpo.keyword, device: corpo.device, os: corpo.os, depth: corpo.depth };
  resposta.tasks[0].result[0].keyword = corpo.keyword;
  return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

/* ---------------------------------- dublês ---------------------------------- */

let banco = new Banco();
const usos: Array<{ units: number; idempotencyKey: string; resultStatus: string; metadata?: Record<string, unknown> }> = [];
let resolucoes = 0;
const gravados: Array<{ candidateRef: string; verdict: string; interpretation: Record<string, unknown> | null }> = [];

class IntegrationRuntimeError extends Error {}
class DataForSeoCanonicalError extends Error {
  readonly code = "canonical";
  readonly status = 503;
}
class PipelineRuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

mock.module("@/lib/server/authz", { namedExports: {
  requireCanonicalSessionProfile: async () => ({ userId: "usuario-1" }),
  authzErrorResponse: (error: unknown) => ({ status: 500, message: error instanceof Error ? error.message : String(error) }),
} });
mock.module("@/lib/server/editorial-authorization", { namedExports: { assertEditorialPermission: async () => undefined } });
mock.module("@/lib/server/pipeline-runtime", { namedExports: {
  PipelineRuntimeError,
  resolvePipelineContext: async (input: { module: string; action: string }) => ({ ...input, get supabase() { return banco; }, brandId: MARCA, actorUserId: "usuario-1" }),
} });
mock.module("@/lib/server/integrations-runtime", { namedExports: {
  IntegrationRuntimeError,
  integrationRuntimeErrorResponse: () => null,
  recordIntegrationUsage: async (uso: { units: number; idempotencyKey: string; resultStatus: string; metadata?: Record<string, unknown> }) => { usos.push(uso); },
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
// PATCH /api/arquiteto/workspace: a trava do Assunto e a leitura estreita das keywords são dublês.
let keywordsDoPatch = new Map<string, Record<string, unknown>>();
mock.module("@/lib/server/arquiteto-workspace", { namedExports: {
  architectPatchKeywordReadInput: () => ({ workflowItemIds: [], kgrDecisionWorkflowItemIds: [] }),
  loadCanonicalArquitetoWorkspace: async () => ({}),
  readArchitectPatchKeywords: async () => keywordsDoPatch,
} });
/*
 * O repositório de workflow com a MESMA semântica do real (marca filtrada,
 * lock otimista, 409 com lock vencido), sobre o banco em memória: o real
 * depende de helpers do runtime que aqui é dublê.
 */
class WorkflowRepository {
  readonly contexto: { supabase: Banco; brandId: string };
  constructor(contexto: { supabase: Banco; brandId: string }) { this.contexto = contexto; }
  async find(id: string) {
    const lido = await this.contexto.supabase.from("editorial_workflow_items").select("*").eq("id", id).eq("marca_id", this.contexto.brandId).maybeSingle();
    return lido.data ? { status: "READY", data: lido.data as Record<string, unknown> } : { status: "NO_DATA", data: null };
  }
  async update(id: string, expectedLock: number, input: { payload?: Record<string, unknown> }) {
    const gravado = await this.contexto.supabase.from("editorial_workflow_items").update({ ...(input.payload !== undefined ? { payload: input.payload } : {}) }).eq("id", id).eq("marca_id", this.contexto.brandId).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (!gravado.data) throw new PipelineRuntimeError("CONFLICT", "O item de workflow foi alterado ou não pertence à Brand.", 409);
    return { status: "PERSISTED", data: gravado.data as Record<string, unknown> };
  }
}
mock.module("@/lib/server/pipeline-repositories", { namedExports: { WorkflowRepository } });
mock.module("@/lib/server/arquiteto-subject-guard", { namedExports: { assertWorkingSubjectAnchorAssignment: async () => undefined } });
mock.module("@/lib/server/arquiteto-persistence", { namedExports: {
  pipelineArtifactErrorResponse: (error: unknown) => error instanceof PipelineRuntimeError
    ? { status: error.status, body: { success: false, error: error.message, code: error.code } }
    : { status: 503, body: { success: false, error: error instanceof Error ? error.message : String(error), code: "QUERY_FAILURE" } },
} });
mock.module("@/lib/server/arquiteto-territory-store", { namedExports: { listTerritoryWorkflowItems: async () => [], createTerritoryWorkflowItem: async () => ({}), updateTerritoryWorkflowItem: async () => ({}), readTerritoryWorkflowItem: async () => null } });
// A rota do workspace passou a importar o "Desfazer Silo"; esta suíte não o usa.
mock.module("@/lib/server/arquiteto-territory-undo", { namedExports: { planTerritoryUndoForBrand: async () => { throw new Error("Desfazer Silo fora do escopo desta suíte."); } } });
mock.module("@/lib/server/arquiteto-territorial-serp-store", { namedExports: { listTerritorialSerpAssessments: async () => [], saveTerritorialSerpAssessment: async () => undefined, readbackTerritorialSerpAssessment: async () => ({ payload: {} }) } });
mock.module("@/lib/server/arquiteto-territorial-ai-store", { namedExports: { listTerritorialAiProposals: async () => [] } });
mock.module("@/lib/server/arquiteto-article-formation-marker-store", { namedExports: { readArticleFormationMarker: async () => null } });
mock.module("@/lib/server/arquiteto-architecture-marker-store", { namedExports: { readArchitectureMarker: async () => null } });
mock.module("@/lib/server/arquiteto-silo-working-copy-store", { namedExports: { createSiloWorkingCopy: async () => ({}), listSiloWorkingCopies: async () => [], updateSiloWorkingCopy: async () => ({}) } });

const { POST: POST_SERP } = await import("../app/api/arquiteto/serp/route.ts");
const { POST: POST_KEYWORD } = await import("../app/api/arquiteto/keyword-serp/route.ts");
const { POST: POST_ALLINTITLE } = await import("../app/api/arquiteto/article-allintitle/route.ts");
const { PATCH: PATCH_WORKSPACE } = await import("../app/api/arquiteto/workspace/route.ts");
const { collectAndCacheSerp } = await import("../lib/server/serp-cache.ts");
const { SERP_CACHE_LENSES, serpCacheLensLabel } = await import("../lib/editorial/serp-cache.ts");
const { NO_VOLUME_NOT_OBSERVED_REASON } = await import("../lib/arquiteto/article-serp-interpretation.ts");
const { ArticleKgrIdentitySchema } = await import("../lib/arquiteto/contracts.ts");

const recomecar = () => {
  banco = new Banco();
  pedidosSerp.length = 0;
  pedidosAllintitle.length = 0;
  usos.length = 0;
  gravados.length = 0;
  resolucoes = 0;
  keywordsDoPatch = new Map();
};

const chamar = async (handler: (request: Request) => Promise<Response>, url: string, corpo: Record<string, unknown>, method = "POST") => {
  const resposta = await handler(new Request(`http://teste${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, any> };
};

const semear = async (texto: string, keywordId: string, lensIndex: number) => {
  const lens = SERP_CACHE_LENSES[lensIndex];
  const canonica = lensIndex === 0;
  await collectAndCacheSerp({ supabase: banco as never, brandId: MARCA, actorUserId: "minerador" }, {
    query: { keyword: texto, locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced" },
    depth: canonica ? 20 : 10,
    keywordId,
  }, { config: CONFIG, operationRequestId: "op-semente", collectedBy: "minerador", now: new Date(), storeBody: canonica });
};

/* --------------------------- A3 · parecer sem volume -------------------------- */

const keyword = (id: string, text: string, volume: number | null) => ({ id, keyword: text, intent: "informational", volume_search: volume, kgr_score: null, lista_id: "silo-1", silo_id: "silo-1", siloName: "Silo", status: "aprovado", isPublished: false, slug_sugerido: null, hierarquia: null, analise_semantica: { intencao_principal: "informational", entidade_central: text, dna_origem: "humano", dna_confianca: 0.9 } });
const grupo = {
  id: "grupo-1", keywordIds: [KW_1, KW_2], keywords: [keyword(KW_1, "skincare facial", 880), keyword(KW_2, "rotina skincare facial", 0)],
  publishedAnchorId: null, territoryRef: TERRITORIO, suggestedSiloId: "silo-1", suggestedSiloName: "Silo",
  evidence: { lexical: 0.9, intent: 0.9, entities: 0.9, silo: 1, combined: 0.9 }, confidence: 0.9, alerts: [],
  principalSuggestion: { keywordId: KW_1, score: 0.9, breakdown: { cobertura: 0.9, intencao: 0.9, centralidadeSemantica: 0.9, aderenciaMarca: 0.9, potencialComercial: 0.5, volume: 0.8, dificuldade: 0.4, qualidadeSlug: 0.8, ancoraPublicada: 0, serp: null }, justificativa: ["principal"], pendencias: [] },
  roles: { [KW_1]: "principal", [KW_2]: "secundaria" }, suggestedHierarchy: "Pilar",
};
const corpoSerp = (extra: Record<string, unknown>) => ({ brandId: MARCA, groups: [grupo], lenses: SERP_CACHE_LENSES.map(serpCacheLensLabel), formationBaseHashes: { "grupo-1": "base-1" }, ...extra });

test("A3 · secundária sem volume fica fora do plano: só a Principal nas 4 lentes", async () => {
  recomecar();
  const { status, corpo } = await chamar(POST_SERP, "/api/arquiteto/serp", corpoSerp({ mode: "plan" }));
  assert.equal(status, 200);
  assert.equal(corpo.data.plan.paidQueries, 4, "1 keyword com volume × 4 lentes (antes eram 8)");
  assert.ok(corpo.data.plan.missingDetails.every((item: { keyword: string }) => item.keyword === "skincare facial"));
  assert.deepEqual(pedidosSerp, []);
  assert.equal(resolucoes, 0);
});

test("A3 · na execução a keyword sem volume nunca vai ao provider e sai como não observada, sem travar as lentes", async () => {
  recomecar();
  const { status, corpo } = await chamar(POST_SERP, "/api/arquiteto/serp", corpoSerp({ mode: "execute", authorizedPaidQueries: 4 }));
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 400));
  assert.ok(pedidosSerp.length > 0 && pedidosSerp.length <= 4);
  assert.ok(pedidosSerp.every(pedido => pedido.keyword === "skincare facial"), "a sem volume nunca é coletada");
  const registro = gravados.find(item => item.candidateRef === "grupo-1");
  assert.ok(registro?.interpretation);
  const naoObservadas = registro!.interpretation!.notObserved as Array<{ keywordId: string; reason: string }>;
  assert.deepEqual(naoObservadas.map(item => item.keywordId), [KW_2]);
  assert.equal(naoObservadas[0].reason, NO_VOLUME_NOT_OBSERVED_REASON);
  const lentes = registro!.interpretation!.lenses as { requested: string[]; observed: string[]; missing: unknown[] };
  assert.equal(lentes.requested.length, 4);
  assert.deepEqual(lentes.missing, [], "a keyword sem volume não entra em missing");
  assert.ok(usos.every(uso => !String(uso.idempotencyKey).includes(KW_2)));
});

/* --------------------- A2 · coleta do lote por keyword-serp --------------------- */

test("A2 · keyword do lote já no cache não entra no plano pago; a canônica é paga com 20", async () => {
  recomecar();
  for (let indice = 0; indice < 4; indice += 1) await semear("skincare facial", KW_1, indice);
  const corpo = { brandId: MARCA, scopeId: "article-batch:1:00000000", territoryRef: null, keywords: [{ keywordId: KW_1, keyword: "skincare facial" }, { keywordId: KW_3, keyword: "serum vitamina c" }] };
  const plano = await chamar(POST_KEYWORD, "/api/arquiteto/keyword-serp", { ...corpo, mode: "plan" });
  assert.equal(plano.status, 200);
  assert.equal(plano.corpo.data.plan.paidQueries, 4, "só a keyword fora do cache, nas 4 lentes");
  pedidosSerp.length = 0;
  const executado = await chamar(POST_KEYWORD, "/api/arquiteto/keyword-serp", { ...corpo, mode: "execute", authorizedPaidQueries: 4 });
  assert.equal(executado.status, 200, JSON.stringify(executado.corpo).slice(0, 300));
  assert.equal(pedidosSerp.length, 4);
  assert.ok(pedidosSerp.every(pedido => pedido.keyword === "serum vitamina c"));
  assert.deepEqual(pedidosSerp.map(pedido => pedido.depth).sort((a, b) => a - b), [10, 10, 10, 20], "canônica com 20, extras com 10");
});

/* ------------------------------ A4 · allintitle ------------------------------ */

const semearArtigo = (input: { mineradorResults?: number | null; measuredAt?: string | null; kgrIdentity?: Record<string, unknown> }) => {
  banco.linhas("minerador_keywords").push({
    id: KW_1, lock_version: 1, brand_id: MARCA, deleted_at: null, keyword: "skincare facial", volume_search: 400,
    results_allintitle: input.mineradorResults ?? null, kgr_score: null,
    analise_semantica: input.measuredAt ? { allintitle_measurement: { measuredAt: input.measuredAt, resultsAllintitle: input.mineradorResults } } : {},
  });
  banco.linhas("editorial_workflow_items").push({
    id: WF_1, lock_version: 3, marca_id: MARCA, subject_type: "keyword", subject_id: KW_1, stage: "architect", state: "received",
    source_entity_id: "keyword-dna-1", source_version_id: "keyword-dna-1:v1", article_id: null,
    payload: { siloId: "silo-1", ...(input.kgrIdentity ? { kgrIdentity: input.kgrIdentity } : {}) },
  });
};
const corpoAllintitle = (extra: Record<string, unknown>) => ({ brandId: MARCA, articles: [{ workflowItemId: WF_1 }], ...extra });
const recente = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

test("A4 · allintitle do Minerador de até 30 dias atende sem custo e sem credencial", async () => {
  recomecar();
  semearArtigo({ mineradorResults: 88, measuredAt: recente });
  const plano = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "plan" }));
  assert.equal(plano.status, 200);
  assert.equal(plano.corpo.data.plan.paidQueries, 0);
  assert.equal(plano.corpo.data.items[0].reuse, "minerador");
  const executado = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "execute" }));
  assert.equal(executado.status, 200);
  assert.deepEqual(pedidosAllintitle, []);
  assert.equal(resolucoes, 0);
  assert.deepEqual(usos, []);
  const item = banco.linhas("editorial_workflow_items").find(linha => linha.id === WF_1)!;
  assert.equal(item.lock_version, 3, "reaproveitar não grava nada");
});

test("A4 · sem medição: plano de 1 consulta; sem autorização nada é pago; autorizado mede, grava no Arquiteto e não toca o Minerador", async () => {
  recomecar();
  semearArtigo({});
  const plano = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "plan" }));
  assert.equal(plano.corpo.data.plan.paidQueries, 1);
  const semAutorizacao = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "execute" }));
  assert.equal(semAutorizacao.status, 409);
  assert.equal(semAutorizacao.corpo.code, "PAID_PLAN_REQUIRED");
  assert.deepEqual(pedidosAllintitle, []);

  const executado = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "execute", authorizedPaidQueries: 1 }));
  assert.equal(executado.status, 200, JSON.stringify(executado.corpo).slice(0, 400));
  assert.deepEqual(pedidosAllintitle, [{ keyword: "allintitle:skincare facial", device: "desktop", depth: 10 }], "mesma query allintitle: sem aspas do Minerador");
  const item = banco.linhas("editorial_workflow_items").find(linha => linha.id === WF_1)!;
  const identidade = ArticleKgrIdentitySchema.parse((item.payload as Record<string, unknown>).kgrIdentity);
  assert.equal(identidade.resultCount, 42);
  assert.equal(identidade.kgrValue, 0.105);
  assert.equal(identidade.decision, "NO", "medir não aplica o KGR");
  assert.equal((item.payload as Record<string, unknown>).siloId, "silo-1", "o resto do payload fica");
  const escritasNoMinerador = banco.consultas.filter(consulta => consulta.tabela === "minerador_keywords" && consulta.op !== "select");
  assert.deepEqual(escritasNoMinerador, [], "o Arquiteto não escreve em minerador_keywords");
  const linha = banco.linhas("minerador_keywords")[0];
  assert.equal(linha.results_allintitle, null);
  assert.equal(usos.length, 1);
  assert.equal(usos[0].units, 1);
  assert.equal(usos[0].metadata?.operationKind, "article_allintitle");
});

test("A4 · a medição do Arquiteto é reaproveitada; Recalcular paga de novo só com autorização", async () => {
  recomecar();
  semearArtigo({ kgrIdentity: { isKgrArticle: false, source: "minerador", bindingStatus: "not_applicable", status: "not_kgr", primaryKeywordId: KW_1, evidence: [{ kind: "article_allintitle", keywordId: KW_1, resultCount: 30, measuredAt: recente }] } });
  const plano = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "plan" }));
  assert.equal(plano.corpo.data.plan.paidQueries, 0);
  assert.equal(plano.corpo.data.items[0].reuse, "arquiteto");
  const recalcular = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "plan", recollect: true }));
  assert.equal(recalcular.corpo.data.plan.paidQueries, 1);
  const semAutorizacao = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "execute", recollect: true }));
  assert.equal(semAutorizacao.status, 409);
  assert.deepEqual(pedidosAllintitle, []);
  const pago = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpoAllintitle({ mode: "execute", recollect: true, authorizedPaidQueries: 1 }));
  assert.equal(pago.status, 200);
  assert.equal(pedidosAllintitle.length, 1);
  const item = banco.linhas("editorial_workflow_items").find(linha => linha.id === WF_1)!;
  const identidade = ArticleKgrIdentitySchema.parse((item.payload as Record<string, unknown>).kgrIdentity);
  assert.equal(identidade.evidence?.length, 2, "a medição anterior fica como histórico");
});

test("correção · o servidor não mede Principal sem volume, e item fora da etapa vira lacuna sem derrubar o bloco", async () => {
  recomecar();
  semearArtigo({});
  const WF_SEM_VOLUME = "wf-sem-volume";
  const WF_FORA = "wf-fora-da-etapa";
  banco.linhas("minerador_keywords").push({ id: "kw-sem-volume", lock_version: 1, brand_id: MARCA, deleted_at: null, keyword: "skincare sem busca", volume_search: 0, results_allintitle: null, kgr_score: null, analise_semantica: {} });
  banco.linhas("editorial_workflow_items").push(
    { id: WF_SEM_VOLUME, lock_version: 1, marca_id: MARCA, subject_type: "keyword", subject_id: "kw-sem-volume", stage: "architect", state: "received", source_entity_id: null, source_version_id: null, article_id: null, payload: {} },
    { id: WF_FORA, lock_version: 1, marca_id: MARCA, subject_type: "keyword", subject_id: KW_1, stage: "radar", state: "received", source_entity_id: null, source_version_id: null, article_id: null, payload: {} },
  );
  const corpo = (extra: Record<string, unknown>) => ({ brandId: MARCA, articles: [{ workflowItemId: WF_1 }, { workflowItemId: WF_SEM_VOLUME }, { workflowItemId: WF_FORA }], ...extra });
  const plano = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpo({ mode: "plan" }));
  assert.equal(plano.status, 200, JSON.stringify(plano.corpo).slice(0, 400));
  assert.equal(plano.corpo.data.plan.paidQueries, 1, "só a Principal com volume entra no plano");
  assert.deepEqual(plano.corpo.data.gaps.map((lacuna: { workflowItemId: string }) => lacuna.workflowItemId).sort(), [WF_FORA, WF_SEM_VOLUME].sort());
  // Mesmo autorizando mais do que o plano, a Principal sem volume nunca vai ao provider.
  const executado = await chamar(POST_ALLINTITLE, "/api/arquiteto/article-allintitle", corpo({ mode: "execute", authorizedPaidQueries: 1 }));
  assert.equal(executado.status, 200, JSON.stringify(executado.corpo).slice(0, 400));
  assert.deepEqual(pedidosAllintitle, [{ keyword: "allintitle:skincare facial", device: "desktop", depth: 10 }]);
  assert.match(executado.corpo.data.gaps.find((lacuna: { workflowItemId: string }) => lacuna.workflowItemId === WF_SEM_VOLUME).reason, /sem volume não há KGR/);
  const semVolume = banco.linhas("editorial_workflow_items").find(linha => linha.id === WF_SEM_VOLUME)!;
  assert.equal(semVolume.lock_version, 1, "nada é gravado na Principal sem volume");
});

/* -------------------------- A1 · PATCH "Aplicar KGR" -------------------------- */

test("A1 · Aplicar KGR Sim é aceito sem score; o registro é humano, v2, e não escreve no Minerador", async () => {
  recomecar();
  semearArtigo({});
  keywordsDoPatch = new Map([[KW_1, { id: KW_1, status: "aprovado", kgr_score: null, analise_semantica: {} }]]);
  const { status, corpo } = await chamar(PATCH_WORKSPACE, "/api/arquiteto/workspace", {
    brandId: MARCA,
    updates: [{ workflowItemId: WF_1, expectedLock: 3, assignment: { articleKgrDecision: "YES" } }],
  }, "PATCH");
  assert.equal(status, 200, JSON.stringify(corpo).slice(0, 400));
  const item = banco.linhas("editorial_workflow_items").find(linha => linha.id === WF_1)!;
  const identidade = ArticleKgrIdentitySchema.parse((item.payload as Record<string, unknown>).kgrIdentity);
  assert.equal(identidade.decision, "YES");
  assert.equal(identidade.decisionSource, "HUMAN_DECISION");
  assert.equal(identidade.decisionContractVersion, "article-kgr-decision-v2");
  assert.equal(identidade.kgrValue, null);
  assert.equal(identidade.decisionHistory?.at(-1)?.actorUserId, "usuario-1");
  assert.deepEqual(banco.consultas.filter(consulta => consulta.tabela === "minerador_keywords" && consulta.op !== "select"), []);
});
