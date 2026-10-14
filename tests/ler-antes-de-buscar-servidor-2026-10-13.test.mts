import assert from "node:assert/strict";
import { register } from "node:module";
import { mock, test } from "node:test";

/*
 * F3 · LER ANTES DE BUSCAR — o lado do servidor (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 3; D4).
 * Só as bordas são simuladas (banco e Google Ads); nenhuma chamada paga, nenhum
 * banco remoto. Portas que contam chamadas provam: o leitor só lê, em projeção
 * estreita e pela marca; a rota de métricas do Minerador grava a medição já
 * recebida (replay) SEM consultar o Google Ads; o plano de "Medir volume" diz o
 * que já temos.
 */
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='next/server') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class NextRequest extends Request {}; export const NextResponse = { json: (b, i) => new Response(JSON.stringify(b), { status: i?.status ?? 200 }) };')}; return n(s,c); }`)}`);

let consultasAoGoogleAds = 0, clientesAbertos = 0;
mock.module("@/lib/google/ads/historical-metrics", { namedExports: { generateGoogleAdsHistoricalMetrics: async () => { consultasAoGoogleAds++; throw new Error("o Google Ads não pode ser consultado neste teste"); } } });
mock.module("@/lib/server/google-ads-canonical", { namedExports: {
  resolveGoogleAdsCanonicalContext: async () => ({ customerId: "1234567890", managerCustomerId: null, targeting: null, config: { apiVersion: "v25" } }),
  createGoogleAdsCanonicalClient: async () => { clientesAbertos++; return { client: {} }; },
  targetingToProviderInput: () => ({}),
  defaultGoogleAdsCanonicalTargeting: () => ({}),
  GoogleAdsConfigurationBlocker: class extends Error {},
} });
mock.module("@/lib/server/authz", { namedExports: { requireCanonicalSessionProfile: async () => { throw new Error("contexto autorizado é usado"); } } });
mock.module("@/lib/server/tenant-context", { namedExports: { requireTenantPermission: async () => { throw new Error("contexto autorizado é usado"); } } });
mock.module("@/lib/server/integrations-runtime", { namedExports: { IntegrationRuntimeError: class extends Error {} } });

const { KNOWN_BEFORE_SEARCH_COLUMNS, readKnownBeforeSearch, knownVolumesByNormalized } = await import("../lib/server/known-before-search.ts");
const { handleGoogleAdsKeywordMetrics } = await import("../lib/server/minerador-google-ads-metrics-http.ts");
const { planKeywordVolume } = await import("../lib/server/minerador-volume-measure.ts");

const MARCA = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const diasAtras = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/** Um banco de mentira encadeável que guarda cada consulta (tabela, colunas, filtros, escrita). */
function banco(tabelas: Record<string, Array<Record<string, unknown>>>, falhar = false) {
  const consultas: Array<{ tabela: string; op: string; colunas?: string; filtros: Array<[string, string, unknown]>; valores?: unknown }> = [];
  const from = (tabela: string) => {
    const consulta = { tabela, op: "select", colunas: undefined as string | undefined, filtros: [] as Array<[string, string, unknown]>, valores: undefined as unknown };
    consultas.push(consulta);
    const resultado = () => {
      if (falhar) return { data: null, error: { message: "banco fora" } };
      if (consulta.op === "insert") return { data: { id: `m-${consultas.length}` }, error: null };
      if (consulta.op === "update") return { data: null, error: null };
      const linhas = (tabelas[tabela] ?? []).filter(linha => consulta.filtros.every(([tipo, coluna, valor]) => tipo === "eq" ? linha[coluna] === valor : tipo === "is" ? (linha[coluna] ?? null) === valor : (valor as unknown[]).includes(linha[coluna])));
      return { data: linhas, error: null };
    };
    const q: Record<string, unknown> = {
      select: (colunas: string) => { if (consulta.op === "select") consulta.colunas = colunas; return q; },
      eq: (coluna: string, valor: unknown) => { consulta.filtros.push(["eq", coluna, valor]); return q; },
      is: (coluna: string, valor: unknown) => { consulta.filtros.push(["is", coluna, valor]); return q; },
      in: (coluna: string, valor: unknown[]) => { consulta.filtros.push(["in", coluna, valor]); return q; },
      insert: (valores: unknown) => { consulta.op = "insert"; consulta.valores = valores; return q; },
      update: (valores: unknown) => { consulta.op = "update"; consulta.valores = valores; return q; },
      single: async () => resultado(),
      maybeSingle: async () => resultado(),
      then: (ok: (valor: unknown) => unknown, erro?: (motivo: unknown) => unknown) => Promise.resolve(resultado()).then(ok, erro),
    };
    return q;
  };
  return { client: { from }, consultas };
}

test("F3 · o leitor do servidor lê em projeção estreita, pela marca, e diz o que já sabemos (D4)", async () => {
  const linhas = [
    { id: id(1), brand_id: MARCA, deleted_at: null, keyword: "medida há dois anos", volume_search: 390, volume_source: "google_ads", volume_eligibility: null, volume_measured_at: "2024-10-01T00:00:00.000Z", volume_measured_average: 390, volume_measured_provider: "google_ads" },
    { id: id(2), brand_id: MARCA, deleted_at: null, keyword: "sem média recente", volume_search: null, volume_source: null, volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: diasAtras(3), averageMonthlySearches: null } },
    { id: id(3), brand_id: MARCA, deleted_at: null, keyword: "outra era", volume_search: 140, volume_source: "previous", volume_eligibility: null },
    { id: id(4), brand_id: "outra-marca", deleted_at: null, keyword: "de outra marca", volume_search: 900, volume_source: "google_ads" },
  ];
  const { client, consultas } = banco({ minerador_keywords: linhas });
  const lido = await readKnownBeforeSearch(client, MARCA, [id(1), id(2), id(3), id(4), id(1), "territory:abc"]);
  assert.equal(lido.readFailed, false);
  assert.deepEqual([...lido.keywords.values()].map(k => [k.id, k.volume.state]), [[id(1), "measured"], [id(2), "no_average"], [id(3), "missing"]]);
  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].colunas, KNOWN_BEFORE_SEARCH_COLUMNS);
  assert.doesNotMatch(KNOWN_BEFORE_SEARCH_COLUMNS, /(^|,)analise_semantica(,|$)|\*/, "nunca o analise_semantica inteiro");
  assert.deepEqual(consultas[0].filtros.slice(0, 2), [["eq", "brand_id", MARCA], ["is", "deleted_at", null]]);
  assert.deepEqual(consultas[0].filtros[2], ["in", "id", [id(1), id(2), id(3), id(4)]], "sem repetição e sem pseudo-id de território");
  assert.ok(consultas.every(consulta => consulta.op === "select"), "só lê");
  // Banco fora: quem chama decide (nunca paga às cegas).
  const fora = await readKnownBeforeSearch(banco({}, true).client, MARCA, [id(1)]);
  assert.deepEqual([fora.readFailed, fora.keywords.size], [true, 0]);
  // O mapa de "já temos": medida = número, "sem média" < 30 dias = null, a que falta fica de fora.
  const mapa = knownVolumesByNormalized(new Map([["a", { keywordId: id(1), known: lido.keywords.get(id(1))!.volume }], ["b", { keywordId: id(2), known: lido.keywords.get(id(2))!.volume }], ["c", { keywordId: id(3), known: lido.keywords.get(id(3))!.volume }]]));
  assert.deepEqual([...mapa], [["a", 390], ["b", null]]);
});

const metrica = (keyword: string, media: number) => ({ keyword, normalizedKeyword: keyword, averageMonthlySearches: media, monthlySearchVolumes: [{ year: 2026, month: "SEPTEMBER", searches: media }], competition: "LOW", competitionIndex: 10, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: "900000", currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: { languageCode: "pt" }, customerId: "******7890", provider: "google_ads", providerVersion: "v25", measuredAt: "2026-10-14T10:00:00.000Z", canonicalKeyword: keyword, closeVariants: [], normalizedCloseVariants: [], matchedRequestedKeywords: [keyword] });

test("F3 · medir uma vez: a rota de métricas do Minerador grava a medição já recebida (replay) sem abrir o Google Ads", async () => {
  consultasAoGoogleAds = 0; clientesAbertos = 0;
  const linhas = [{ id: id(7), brand_id: MARCA, deleted_at: null, keyword: "trafego organico e pago", status: "bruto", intent: "Informativa", volume_search: 140, results_allintitle: null, kgr_score: null, volume_source: "previous", analise_semantica: {} }];
  const { client, consultas } = banco({ minerador_keywords: linhas });
  const replays: string[][] = [];
  const contexto = { brandId: MARCA, module: "minerador", action: "edit", actorUserId: "11111111-1111-4111-8111-111111111111", supabase: client } as never;
  const pedido = new Request(`http://localhost/api/minerador/marcas/${MARCA}/google-ads/metricas-keywords`, { method: "POST", body: JSON.stringify({ keywordIds: [id(7)], candidateIds: [], operationRequestId: "22222222-2222-4222-8222-222222222222" }) });
  const resposta = await handleGoogleAdsKeywordMetrics(pedido as never, { params: Promise.resolve({ brandId: MARCA }) }, contexto, { replay: async ({ keywords }) => { replays.push(keywords); return { metrics: [metrica("trafego organico e pago", 50)] as never, requestId: "ads-req-preparo" }; } });
  const corpo = await resposta.json() as Record<string, any>;
  assert.equal(resposta.status, 200, JSON.stringify(corpo));
  assert.deepEqual([consultasAoGoogleAds, clientesAbertos], [0, 0], "nenhuma consulta e nenhum cliente do Google Ads");
  assert.deepEqual(replays, [["trafego organico e pago"]]);
  assert.equal(corpo.diagnostic.apiRequestStarted, false);
  const gravacao = consultas.find(consulta => consulta.tabela === "minerador_keyword_metric_measurements" && consulta.op === "insert")!;
  assert.equal((gravacao.valores as Record<string, unknown>).average_monthly_searches, 50, "a medição registrada é a do preparo");
  assert.equal((gravacao.valores as Record<string, unknown>).customer_id_ref, "******7890", "a conta continua mascarada");
  const projecao = consultas.find(consulta => consulta.tabela === "minerador_keywords" && consulta.op === "update")!;
  assert.equal((projecao.valores as Record<string, unknown>).volume_search, 50);
  assert.equal((projecao.valores as Record<string, unknown>).volume_source, "google_ads");
});

test("F3 · plano do 'Medir volume': diz o que já temos (medida de qualquer idade, 'sem média' < 30 dias) sem tirar nada do pedido", async () => {
  const linhas = new Map<string, Record<string, unknown>>([
    [id(1), { id: id(1), keyword: "medida", volume_search: 390, volume_source: "google_ads", analise_semantica: { volume_measurement: { provider: "google_ads", measuredAt: "2025-01-01T00:00:00.000Z", averageMonthlySearches: 390 } } }],
    [id(2), { id: id(2), keyword: "sem média", volume_search: null, analise_semantica: { volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: diasAtras(2), averageMonthlySearches: null } } }],
    [id(3), { id: id(3), keyword: "nunca medida", volume_search: null, analise_semantica: {} }],
  ]);
  const from = () => { const q: Record<string, unknown> = { select: () => q, eq: () => q, is: () => q, in: (_: string, ids: string[]) => Promise.resolve({ data: ids.filter(i => linhas.has(i)).map(i => linhas.get(i)), error: null }) }; return q; };
  const plano = await planKeywordVolume({ brandId: MARCA, module: "minerador", action: "view", actorUserId: "u", supabase: { from } } as never, [id(1), id(2), id(3)]);
  assert.deepEqual(plano.keywordIds, [id(1), id(2), id(3)], "medir de novo continua sendo o pedido explícito");
  assert.deepEqual(plano.alreadyKnown.map(item => [item.id, item.state]), [[id(1), "measured"], [id(2), "no_average"]]);
  assert.equal(plano.toMeasureFirstTime, 1);
});
