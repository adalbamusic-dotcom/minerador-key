import assert from "node:assert/strict";
import { register } from "node:module";
import { mock, test } from "node:test";

/*
 * SDD MCP ponta a ponta · F1: o núcleo de medir Volume fora da tela.
 * Só as bordas são simuladas (Google Ads e banco). A classificação da releitura
 * é a MESMA da tela (`classifyVolumeReadback` + `resolveMineradorProcessState`).
 */
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='next/server') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class NextRequest extends Request {}; export const NextResponse = { json: (b, i) => new Response(JSON.stringify(b), { status: i?.status ?? 200 }) };')}; return n(s,c); }`)}`);
mock.module("../lib/server/minerador-google-ads-metrics-http.ts", { namedExports: { handleGoogleAdsKeywordMetrics: async () => { throw new Error("use deps.measure"); } } });

const { planKeywordVolume, measureKeywordVolume, volumePlanHash, VOLUME_MEASURE_CHUNK } = await import("../lib/server/minerador-volume-measure.ts");

const brandId = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const measuredAt = "2026-09-30T10:00:00.000Z";

function fakeContext(rows: Map<string, Record<string, unknown>>) {
  const from = () => {
    const filtros: { ids?: string[] } = {};
    const q = {
      select: () => q, eq: () => q, is: () => q,
      in: (_: string, ids: string[]) => { filtros.ids = ids; return Promise.resolve({ data: ids.filter(i => rows.has(i)).map(i => rows.get(i)), error: null }); },
    };
    return q;
  };
  return { brandId, module: "minerador", action: "edit", actorUserId: "11111111-1111-4111-8111-111111111111", supabase: { from } } as never;
}

const medida = (volume: number) => ({ keyword: "k", status: "bruto", volume_search: volume, analise_semantica: { volume_measurement: { measuredAt, provider: "google_ads", averageMonthlySearches: volume }, volume_eligibility: { status: "eligible", measuredAt } } });

test("plano: só as keywords da marca entram, com o hash estável e o número de blocos", async () => {
  const rows = new Map([[id(1), { id: id(1), keyword: "como captar clientes", volume_search: null }], [id(2), { id: id(2), keyword: "captar clientes", volume_search: 390 }]]);
  const plano = await planKeywordVolume(fakeContext(rows), [id(2), id(1), id(9), id(1)]);
  assert.deepEqual(plano.keywordIds, [id(2), id(1)]);
  assert.deepEqual(plano.missingIds, [id(9)]);
  assert.equal(plano.chunks, 1);
  assert.equal(plano.planHash, volumePlanHash(brandId, [id(1), id(2)]), "a ordem do pedido não muda o hash");
  assert.equal(plano.cost.moneyUsd, 0);
});

test("execução: blocos de 200, releitura decide; sem média não é falha; cota para o lote", async () => {
  const total = VOLUME_MEASURE_CHUNK + 5;
  const ids = Array.from({ length: total }, (_, i) => id(i + 1));
  const rows = new Map<string, Record<string, unknown>>(ids.map(k => [k, { id: k, ...medida(50) }]));
  const pedidos: string[][] = [];
  let bloco = 0;
  const measure = async (request: Request) => {
    const body = await request.json() as { keywordIds: string[] };
    pedidos.push(body.keywordIds);
    bloco += 1;
    if (bloco === 2) return new Response(JSON.stringify({ success: false, code: "GOOGLE_ADS_QUOTA" }), { status: 429 });
    // Primeiro bloco: a primeira sem média (não devolvida pelo Google Ads), as outras medidas.
    const [semMedia, ...medidas] = body.keywordIds;
    rows.set(semMedia, { id: semMedia, keyword: "k", status: "bruto", volume_search: null, analise_semantica: {} });
    return new Response(JSON.stringify({ success: true, unmatchedKeywordIds: [semMedia], projections: medidas.map(keywordId => ({ keywordId, volumeSearch: 50, measuredAt })) }));
  };
  const result = await measureKeywordVolume(fakeContext(rows), ids, { measure: measure as never });
  assert.deepEqual(pedidos.map(p => p.length), [VOLUME_MEASURE_CHUNK, 5]);
  assert.equal(result.requested, total);
  assert.equal(result.withoutAverage, 1, "sem média é processada, sem dado");
  assert.equal(result.measured, VOLUME_MEASURE_CHUNK - 1);
  assert.equal(result.failed, 5, "o bloco da cota fica como falha, com o motivo");
  assert.equal(result.quotaReached, true);
  assert.match(result.outcomes.find(o => o.outcome === "failed")!.reason!, /limite temporário/);
});

test("execução: medição recebida sem a releitura confirmar é falha, nunca sucesso", async () => {
  const rows = new Map([[id(1), { id: id(1), keyword: "k", status: "bruto", volume_search: null, analise_semantica: {} }]]);
  const measure = async () => new Response(JSON.stringify({ success: true, unmatchedKeywordIds: [], projections: [{ keywordId: id(1), volumeSearch: 90, measuredAt }] }));
  const result = await measureKeywordVolume(fakeContext(rows), [id(1)], { measure: measure as never });
  assert.equal(result.outcomes[0].outcome, "failed");
  assert.match(result.outcomes[0].reason!, /releitura não confirmou/);
});
