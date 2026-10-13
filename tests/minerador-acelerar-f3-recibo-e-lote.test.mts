import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUBJECT_SEARCH_VOLUME_MEASUREMENT_KIND,
  SUBJECT_SEARCH_VOLUME_ORIGIN,
  buildSubjectSearchReceiptDraft,
  isSubjectSearchReceiptTableMissing,
  readSubjectSearchReceiptRow,
  readSubjectSearchVolumeProvenance,
  subjectSearchReceiptInsertRow,
  subjectSearchVolumeDecision,
  type SubjectSearchReceipt,
} from "../lib/minerador/subject-search-receipt.ts";
import { isValidGoogleAdsDemandMeasurement } from "../lib/minerador/google-ads-demand.ts";
import {
  SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS,
  SUBJECT_DISCOVERY_ELIGIBLE_VOLUME_COLUMNS,
  SubjectDiscoveryImportRequestSchema,
  importSubjectDiscoveryWithCore,
  readSubjectDiscoveryBlock,
  type SubjectDiscoveryImportVolumePort,
} from "../lib/minerador/subject-discovery-import.ts";
import {
  SubjectDiscoverySearchRequestSchema,
  runSubjectDiscoverySearch,
  type SubjectDiscoveryExecuteResponse,
  type SubjectDiscoveryPlanResponse,
  type SubjectDiscoveryPorts,
} from "../lib/minerador/subject-discovery-search.ts";
import {
  subjectSearchBatchExecuteRequest,
  subjectSearchBatchImportPlan,
  subjectSearchBatchLines,
  subjectSearchBatchPlanRequest,
  subjectSearchBatchVisibleCandidates,
  subjectSearchBatchWithVolumeKeys,
  summarizeSubjectSearchBatchPlan,
} from "../modules/minerador/discovery/subject-search-batch-model.ts";
import { cadastroLeftoversToDelete, cadastroReapprovalIds } from "../modules/minerador/subject-cadastro-follow-up.ts";
import { DECLARED_PLAN_LEFTOVER_BLOCKED, classifyDeclaredPlanLeftovers } from "../lib/minerador/declared-plan-leftovers.ts";

/**
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md` — F3
 * (itens 8 e 7: recibo da Pesquisa por Assunto, Volume no import, lote) e
 * item 9 (o card resolve o que a prévia já sabe). Portas e bancos em memória:
 * nenhuma rede, nenhum Google Ads, nenhum DataForSEO, nenhuma IA.
 */

globalThis.fetch = (async () => { throw new Error("Rede proibida neste teste."); }) as typeof fetch;

const BRAND = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_BRAND = "bbbbbbbb-0000-4000-8000-000000000002";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const OP = "0e000000-0000-4000-8000-0000000000f1";
const BATCH = "0b000000-0000-4000-8000-0000000000b1";
const EXECUTED_AT = "2026-10-13T12:00:00.000Z";
const SUBJECT_ID = "5b000000-0000-4000-8000-00000000000a";
const GROUP = "9a000000-0000-4000-8000-000000000001";

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const metrics = (average: number | null) => ({ averageMonthlySearches: average, competition: "LOW", competitionIndex: 12, averageCpcMicros: "900000", lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: "BRL" });

function receipt(overrides: Partial<SubjectSearchReceipt> = {}): SubjectSearchReceipt {
  const draft = buildSubjectSearchReceiptDraft({
    operationRequestId: OP,
    batchId: BATCH,
    subjectKeywordId: SUBJECT_ID,
    phrase: "seo para clínicas",
    providerVersion: "v25",
    targeting: { language: "languageConstants/1014", geoTargetConstants: [], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    googleAdsRequestIds: ["req-1", null, "req-1", "req-2"],
    executedAt: EXECUTED_AT,
    candidates: [
      { keyword: "marketing para clínicas", normalizedKeyword: "marketing para clinicas", googleAds: metrics(880) },
      { keyword: "seo médico", normalizedKeyword: "seo medico", googleAds: metrics(null) },
      { keyword: "agência médica", normalizedKeyword: "agencia medica", googleAds: null },
      { keyword: "zero busca", normalizedKeyword: "zero busca", googleAds: metrics(0) },
    ],
  });
  return { ...draft, brandId: BRAND, actorId: ACTOR, candidateCount: Object.keys(draft.candidates).length, ...overrides };
}

const fresh = { status: "bruto", volume_search: null, results_allintitle: null, kgr_score: null, volume_source: null, analise_semantica: {} };

/* ============================== item 8 — recibo ============================== */

test("recibo: só as candidatas medidas pelo Google Ads, pela chave normalizada, com lote, ids únicos e versão", () => {
  const value = receipt();
  assert.deepEqual(Object.keys(value.candidates).sort(), ["marketing para clinicas", "seo medico", "zero busca"]);
  assert.equal(value.candidates["seo medico"].averageMonthlySearches, null, "média ausente fica ausente");
  assert.equal(value.batchId, BATCH);
  assert.deepEqual(value.googleAdsRequestIds, ["req-1", "req-2"]);
  assert.equal(value.providerVersion, "v25");
  const row = subjectSearchReceiptInsertRow(value);
  assert.equal(row.marca_id, BRAND);
  assert.equal(row.actor_id, ACTOR);
  assert.equal(row.provider, "google_ads");
  assert.equal(row.candidate_count, 3);
  const back = readSubjectSearchReceiptRow(JSON.parse(JSON.stringify(row)));
  assert.ok(back);
  assert.equal(back!.candidates["marketing para clinicas"].averageMonthlySearches, 880);
  assert.equal(readSubjectSearchReceiptRow({ ...row, provider: "dataforseo" }), null, "outro provider não é recibo");
  assert.equal(readSubjectSearchReceiptRow({ ...row, executed_at: "ontem" }), null);
  assert.equal(buildSubjectSearchReceiptDraft({ ...{ operationRequestId: OP, subjectKeywordId: null, phrase: "x", providerVersion: null, targeting: value.targeting, googleAdsRequestIds: [], executedAt: EXECUTED_AT, candidates: [] } }).providerVersion, "desconhecida");
});

test("recibo: tabela ausente (M-A não aplicada) é reconhecida por 42P01 e PGRST205", () => {
  assert.equal(isSubjectSearchReceiptTableMissing({ code: "42P01" }), true);
  assert.equal(isSubjectSearchReceiptTableMissing({ code: "PGRST205" }), true);
  assert.equal(isSubjectSearchReceiptTableMissing({ code: "PGRST116", message: "Could not find the table 'public.minerador_subject_search_receipts' in the schema cache" }), true);
  assert.equal(isSubjectSearchReceiptTableMissing({ code: "42501" }), false);
  assert.equal(isSubjectSearchReceiptTableMissing(null), false);
});

test("volume: keyword nova recebe a média como Volume validado, com proveniência e a data da pesquisa", () => {
  const decision = subjectSearchVolumeDecision(receipt(), "marketing para clinicas", fresh);
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.value, 880);
  assert.equal(decision.measuredAt, EXECUTED_AT);
  assert.equal(decision.patch.volume_search, 880);
  assert.equal(decision.patch.volume_source, "google_ads");
  assert.equal(decision.patch.kgr_score, null);
  const measurement = decision.patch.analise_semantica.volume_measurement as Record<string, unknown>;
  assert.equal(isValidGoogleAdsDemandMeasurement(measurement), true, "o predicado de sempre (C18) lê como Volume validado");
  assert.equal(measurement.origin, SUBJECT_SEARCH_VOLUME_ORIGIN);
  assert.equal(measurement.measurementKind, SUBJECT_SEARCH_VOLUME_MEASUREMENT_KIND);
  assert.deepEqual(measurement.receiptRef, { operationRequestId: OP, batchId: BATCH });
  assert.equal(measurement.measuredAt, EXECUTED_AT);
  assert.equal(measurement.accountRef, null, "o recibo não expõe conta");
  assert.deepEqual(readSubjectSearchVolumeProvenance(measurement), { operationRequestId: OP, batchId: BATCH });
  // Zero do Google Ads é medição (não ausência).
  const zero = subjectSearchVolumeDecision(receipt(), "zero busca", fresh);
  assert.equal(zero.ok && zero.value, 0);
});

test("volume: média ausente não grava; fora do recibo não grava; medição válida, publicada e keyword do plano não mudam", () => {
  const value = receipt();
  const noAverage = subjectSearchVolumeDecision(value, "seo medico", fresh);
  assert.equal(!noAverage.ok && noAverage.code, "no_average");
  const missing = subjectSearchVolumeDecision(value, "agencia medica", fresh);
  assert.equal(!missing.ok && missing.code, "no_candidate");
  const measured = { ...fresh, volume_search: 50, volume_source: "google_ads", analise_semantica: { volume_measurement: { provider: "google_ads", averageMonthlySearches: 50, measuredAt: "2026-09-01T00:00:00.000Z" } } };
  const kept = subjectSearchVolumeDecision(value, "marketing para clinicas", measured);
  assert.equal(!kept.ok && kept.code, "already_measured");
  const published = subjectSearchVolumeDecision(value, "marketing para clinicas", { ...fresh, status: "publicado" });
  assert.equal(!published.ok && published.code, "published");
  const subject = subjectSearchVolumeDecision(value, "marketing para clinicas", { ...fresh, analise_semantica: { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null } } });
  assert.equal(!subject.ok && subject.code, "plan_keyword");
  const principal = subjectSearchVolumeDecision(value, "marketing para clinicas", { ...fresh, analise_semantica: { keyword_declared_principal: { subjectKeywordId: SUBJECT_ID, groupId: GROUP, planVersion: 1 } } });
  assert.equal(!principal.ok && principal.code, "plan_keyword");
  assert.match(!principal.ok ? principal.reason : "", /botão "Volume"/);
});

/* ======================== item 8 — import com a porta ======================== */

type Row = Record<string, unknown>;

function fakeSupabase(initial: Row[]) {
  const rows = initial.map(row => structuredClone(row));
  const log: Array<{ op: string; columns: string; values: Row | null }> = [];
  let nextId = 1;
  const readPath = (row: Row, expression: string) => {
    const [base, ...path] = expression.split("->").map(part => part.trim());
    let value: unknown = row[base];
    for (const key of path) value = value && typeof value === "object" ? (value as Row)[key] ?? null : null;
    return value ?? null;
  };
  const project = (row: Row, columns: string) => Object.fromEntries(columns.split(",").map(part => {
    const [alias, expression] = part.includes(":") ? part.split(":").map(value => value.trim()) : [part.trim().split("->").pop()!.trim(), part.trim()];
    return [alias, structuredClone(readPath(row, expression))];
  }));
  function builder() {
    const state = { op: "select", columns: "", filters: [] as Array<[string, string, unknown]>, values: null as Row | null };
    let single = false;
    let range: [number, number] | null = null;
    const query = {
      select(columns = "*") { state.columns = columns; return query; },
      eq(column: string, value: unknown) { state.filters.push(["eq", column, value]); return query; },
      in(column: string, value: unknown[]) { state.filters.push(["in", column, value]); return query; },
      is(column: string, value: unknown) { state.filters.push(["is", column, value]); return query; },
      insert(values: Row) { state.op = "insert"; state.values = values; return query; },
      update(values: Row) { state.op = "update"; state.values = values; return query; },
      order() { return query; },
      range(from: number, to: number) { range = [from, to]; return query; },
      single() { single = true; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        log.push({ op: state.op, columns: state.columns, values: state.values ? structuredClone(state.values) : null });
        const matches = (row: Row) => state.filters.every(([kind, column, value]) => kind === "in" ? (value as unknown[]).includes(readPath(row, column)) : readPath(row, column) === value);
        if (state.op === "insert") {
          const row = { ...structuredClone(state.values!), id: `created-${nextId++}`, deleted_at: null, group_id: null };
          rows.push(row);
          return Promise.resolve({ data: project(row, state.columns || "id"), error: null }).then(resolve);
        }
        let target = rows.filter(matches);
        if (state.op === "update") {
          for (const row of target) Object.assign(row, structuredClone(state.values!));
          return Promise.resolve({ data: target.map(row => project(row, state.columns || "id")), error: null }).then(resolve);
        }
        if (range) target = target.slice(range[0], range[1] + 1);
        const projected = target.map(row => project(row, state.columns));
        return Promise.resolve({ data: single ? projected[0] ?? null : projected, error: null }).then(resolve);
      },
    };
    return query;
  }
  return { rows, log, client: { from: () => builder() } as unknown as SupabaseClient };
}

function volumePort(status: SubjectDiscoveryImportVolumePort["receipt"], value: SubjectSearchReceipt | null = receipt()): SubjectDiscoveryImportVolumePort {
  return {
    receipt: status,
    decide: (key, existing) => value && status === "found" ? subjectSearchVolumeDecision(value, key, existing) : { ok: false, code: "no_receipt", reason: "sem recibo" },
    verified: key => Boolean(value && status === "found" && value.candidates[key]),
  };
}

const importRequest = (keywords: string[]) => SubjectDiscoveryImportRequestSchema.parse({
  importRequestId: "9e000000-0000-4000-8000-000000000001",
  searchId: OP,
  subjectPhrase: "seo para clínicas",
  items: keywords.map(keyword => ({ keyword, origins: ["ads_keyword_seed"], evidence: [] })),
});

test("import com recibo: a nova nasce com o Volume do recibo e a origem conferida; a sem média nasce sem volume", async () => {
  const db = fakeSupabase([]);
  const logicCalls: string[][] = [];
  const result = await importSubjectDiscoveryWithCore({
    brandId: BRAND, actorUserId: ACTOR, supabase: db.client, request: importRequest(["marketing para clínicas", "seo médico"]), now: EXECUTED_AT,
    volume: volumePort("found"),
    runLogic: async ids => { logicCalls.push(ids); return { applied: ids.length, unchanged: 0, failed: 0 }; },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const inserts = db.log.filter(entry => entry.op === "insert");
  assert.equal(inserts.length, 2);
  const withVolume = inserts.find(entry => entry.values!.keyword === "marketing para clínicas")!.values!;
  assert.equal(withVolume.volume_search, 880);
  assert.equal(withVolume.volume_source, "google_ads");
  assert.equal(withVolume.brand_id, BRAND);
  assert.equal(isValidGoogleAdsDemandMeasurement((withVolume.analise_semantica as Row).volume_measurement), true);
  assert.equal(readSubjectDiscoveryBlock(withVolume.analise_semantica).searches[0].provenanceVerified, true);
  const without = inserts.find(entry => entry.values!.keyword === "seo médico")!.values!;
  assert.equal(without.volume_search, null);
  assert.equal("volume_source" in without, false, "sem média, o insert de sempre");
  assert.equal(readSubjectDiscoveryBlock(without.analise_semantica).searches[0].provenanceVerified, true, "a keyword está no recibo, mesmo sem média");
  assert.deepEqual(result.volume, { receipt: "found", written: 1, skipped: 1 });
  assert.equal(result.rows.find(row => row.keyword === "seo médico")!.volume!.outcome, "skipped");
  // A Lógica roda no mesmo núcleo, nas criadas.
  assert.deepEqual(logicCalls, [["created-1", "created-2"]]);
  assert.deepEqual(result.logic, { ran: true, applied: 2, unchanged: 0, failed: 0, error: null });
});

test("import sem recibo (M-A ausente ou busca antiga): o insert é o de antes e a origem segue não conferida", async () => {
  for (const status of ["unavailable", "not_found", "failed"] as const) {
    const db = fakeSupabase([]);
    const result = await importSubjectDiscoveryWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: db.client, request: importRequest(["marketing para clínicas"]), now: EXECUTED_AT, volume: volumePort(status) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const payload = db.log.find(entry => entry.op === "insert")!.values!;
    assert.deepEqual(Object.keys(payload).sort(), ["analise_semantica", "brand_id", "keyword", "lista_id", "results_allintitle", "status", "volume_search"]);
    assert.equal(payload.volume_search, null);
    assert.equal(readSubjectDiscoveryBlock(payload.analise_semantica).searches[0].provenanceVerified, false);
    assert.deepEqual(result.volume, { receipt: status, written: 0, skipped: 0 });
    assert.equal(result.logic, undefined, "sem a porta da Lógica, nada roda");
  }
});

test("import com recibo: existente sem medição recebe o Volume; com medição válida não muda; a Lógica que falha não derruba o import", async () => {
  const db = fakeSupabase([
    { id: "kw-1", keyword: "marketing para clínicas", brand_id: BRAND, status: "bruto", deleted_at: null, volume_search: null, results_allintitle: null, kgr_score: null, volume_source: null, analise_semantica: {} },
    { id: "kw-2", keyword: "zero busca", brand_id: BRAND, status: "bruto", deleted_at: null, volume_search: 40, results_allintitle: null, kgr_score: null, volume_source: "google_ads", analise_semantica: { volume_measurement: { provider: "google_ads", averageMonthlySearches: 40, measuredAt: "2026-09-01T00:00:00.000Z" } } },
  ]);
  const result = await importSubjectDiscoveryWithCore({
    brandId: BRAND, actorUserId: ACTOR, supabase: db.client, request: importRequest(["marketing para clínicas", "zero busca"]), now: EXECUTED_AT,
    volume: volumePort("found"),
    runLogic: async () => { throw new Error("banco fora"); },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(db.log.some(entry => entry.op === "select" && entry.columns === SUBJECT_DISCOVERY_ELIGIBLE_VOLUME_COLUMNS), "com recibo, a leitura das elegíveis traz o pacote de volume");
  assert.equal(db.log.some(entry => entry.op === "select" && entry.columns === SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS), false);
  const updates = db.log.filter(entry => entry.op === "update");
  const first = updates.find(entry => (entry.values!.analise_semantica as Row) && entry.values!.volume_search === 880);
  assert.ok(first, "a existente sem medição recebe 880");
  const second = updates.find(entry => entry.values!.volume_search === undefined);
  assert.ok(second, "a medida só recebe a origem");
  assert.equal(db.rows.find(row => row.id === "kw-2")!.volume_search, 40, "medição válida nunca é sobrescrita");
  assert.equal(result.rows.find(row => row.keywordId === "kw-2")!.volume!.outcome, "skipped");
  assert.equal(result.logic!.ran, false);
  assert.match(result.logic!.error || "", /botão do Processador/);
});

test("recibo de outra marca: a leitura do servidor filtra pela marca da rota (estrutural) e a porta sem recibo nunca grava", () => {
  const server = stripComments(read("lib/server/subject-search-receipts.ts"));
  assert.match(server, /\.eq\("marca_id", input\.brandId\)\s*\.eq\("operation_request_id", input\.operationRequestId\)/);
  assert.match(server, /receipt\.brandId !== input\.brandId/);
  const port = volumePort("not_found", { ...receipt(), brandId: OTHER_BRAND });
  assert.equal(port.decide("marketing para clinicas", fresh).ok, false);
  assert.equal(port.verified("marketing para clinicas"), false);
});

/* ======================== item 8 — a execução grava o recibo ======================== */

function searchPorts(record: (draft: unknown) => Promise<{ status: "recorded" } | { status: "unavailable"; reason: string } | { status: "failed"; reason: string }>) {
  const drafts: unknown[] = [];
  const ports: SubjectDiscoveryPorts = {
    now: () => new Date(EXECUTED_AT),
    readBrandSiteUrl: async () => null,
    readSubjectKeyword: async id => id === SUBJECT_ID ? { id, keyword: "seo para clínicas", keywordSubject: { declared: true, note: null, destinationUrl: null, destinationCheck: null } } : null,
    lookupSerp: async () => assert.fail("a pesquisa não lê SERP"),
    findLedgerCapability: async () => assert.fail("a pesquisa não lê o ledger DataForSEO"),
    readExistingKeywords: async () => [],
    async openExecution() {
      return {
        ledgerCapability: false,
        findUsage: async () => assert.fail("DataForSEO"),
        collectSerp: async () => assert.fail("DataForSEO"),
        recordDataForSeoUsage: async () => assert.fail("DataForSEO"),
        googleAdsIdeas: async () => ({ requestId: "ads-req", providerVersion: "v25", ideas: [{ keyword: "marketing para clínicas", ...metrics(880) }, { keyword: "seo médico", ...metrics(null) }] }),
        recordGoogleAdsUsage: async () => undefined,
      };
    },
    recordReceipt: async draft => { drafts.push(draft); return record(draft); },
  };
  return { ports, drafts };
}

const targeting = { language: "languageConstants/1014", selectedStates: ["Todos os estados"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false };

async function execute(ports: SubjectDiscoveryPorts, batchId: string | null = BATCH) {
  const plan = await runSubjectDiscoverySearch({ brandId: BRAND, request: SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", subjectKeywordId: SUBJECT_ID, targeting }) }, ports);
  const planBody = plan.body as SubjectDiscoveryPlanResponse;
  return runSubjectDiscoverySearch({ brandId: BRAND, request: SubjectDiscoverySearchRequestSchema.parse({ mode: "execute", subjectKeywordId: SUBJECT_ID, targeting, operationRequestId: OP, authorizedPlan: { planHash: planBody.plan.planHash, maxCostUsd: planBody.plan.maxCostUsd }, batchId }) }, ports);
}

test("execução: grava o recibo com a média de cada candidata e o lote; o plano não grava nada", async () => {
  const { ports, drafts } = searchPorts(async () => ({ status: "recorded" }));
  const plan = await runSubjectDiscoverySearch({ brandId: BRAND, request: SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", subjectKeywordId: SUBJECT_ID, targeting, batchId: BATCH }) }, ports);
  assert.equal(plan.status, 200);
  assert.equal(drafts.length, 0, "o plano não grava recibo");
  const outcome = await execute(ports);
  assert.equal(outcome.status, 200);
  const body = outcome.body as SubjectDiscoveryExecuteResponse;
  assert.deepEqual(body.receipt, { status: "recorded" });
  assert.equal(body.batchId, BATCH);
  assert.equal(drafts.length, 1);
  const draft = drafts[0] as { batchId: string; operationRequestId: string; providerVersion: string; candidates: Record<string, { averageMonthlySearches: number | null }>; googleAdsRequestIds: string[]; executedAt: string };
  assert.equal(draft.batchId, BATCH);
  assert.equal(draft.operationRequestId, OP);
  assert.equal(draft.providerVersion, "v25");
  assert.equal(draft.executedAt, EXECUTED_AT);
  assert.deepEqual(draft.googleAdsRequestIds, ["ads-req"]);
  assert.equal(draft.candidates["marketing para clinicas"].averageMonthlySearches, 880);
  assert.equal(draft.candidates["seo medico"].averageMonthlySearches, null);
});

test("execução sem a tabela ou com falha do recibo: a pesquisa responde igual, com aviso; recibo que lança vira 'failed'", async () => {
  const unavailable = await execute(searchPorts(async () => ({ status: "unavailable", reason: "receipts_table_missing" })).ports, null);
  const body = unavailable.body as SubjectDiscoveryExecuteResponse;
  assert.equal(unavailable.status, 200);
  assert.equal(body.receipt?.status, "unavailable");
  assert.ok(body.notices.some(notice => /M-A ainda não foi aplicada/.test(notice)));
  assert.equal(body.candidates.length, 2);
  assert.equal("batchId" in body, false, "sem lote, sem o campo");
  const thrown = await execute(searchPorts(async () => { throw Object.assign(new Error("x"), { code: "XX000" }); }).ports);
  assert.equal(thrown.status, 200);
  assert.equal((thrown.body as SubjectDiscoveryExecuteResponse).receipt?.status, "failed");
});

/* ============================== item 7 — lote ============================== */

const LINE_A = "5b000000-0000-4000-8000-0000000000a1";
const LINE_B = "5b000000-0000-4000-8000-0000000000b2";

test("lote: uma linha por Assunto gravado, na ordem, sem falhadas nem repetidas; o plano leva só o id (semente = keyword)", () => {
  const lines = subjectSearchBatchLines([
    { order: 2, title: "Artigo B", keyword: "kw b", subjectKeywordId: LINE_B, outcome: "declared" },
    { order: 1, title: "Artigo A", keyword: "kw a", subjectKeywordId: LINE_A, outcome: "unchanged" },
    { order: 3, title: "Falhou", keyword: "kw c", subjectKeywordId: "5b000000-0000-4000-8000-0000000000c3", outcome: "failed" },
    { order: 4, title: "Repetida", keyword: "kw a", subjectKeywordId: LINE_A, outcome: "declared" },
    { order: 5, title: "Sem id", keyword: "kw d", subjectKeywordId: null, outcome: "declared" },
  ]);
  assert.deepEqual(lines.map(line => line.subjectKeywordId), [LINE_A, LINE_B]);
  const plan = subjectSearchBatchPlanRequest(lines[0]);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.subjectKeywordId, LINE_A);
  assert.equal(plan.phrase, "");
  assert.equal(SubjectDiscoverySearchRequestSchema.safeParse(plan).success, true);
  const executeBody = subjectSearchBatchExecuteRequest(lines[0], { planHash: "sha256:abc", maxCostUsd: 0 }, OP, BATCH);
  assert.equal(executeBody.batchId, BATCH);
  assert.deepEqual(executeBody.authorizedPlan, { planHash: "sha256:abc", maxCostUsd: 0 });
  assert.equal(SubjectDiscoverySearchRequestSchema.safeParse(executeBody).success, true);
});

test("lote: um plano somado (US$ 0, consultas do Google Ads), linha recusada fica de fora", () => {
  const plan = (lines: number) => ({ lines: Array.from({ length: lines }, () => ({ provider: "google_ads" })), maxCostUsd: 0, paidCalls: 0 });
  const summary = summarizeSubjectSearchBatchPlan([
    { line: { subjectKeywordId: LINE_A, order: 1, title: "", keyword: "" }, plan: plan(2) as never, seed: "a", error: null },
    { line: { subjectKeywordId: LINE_B, order: 2, title: "", keyword: "" }, plan: plan(1) as never, seed: "b", error: null },
    { line: { subjectKeywordId: "x", order: 3, title: "", keyword: "" }, plan: null, seed: null, error: "Assunto não encontrado" },
  ]);
  assert.deepEqual(summary, { ready: 2, refused: 1, adsCalls: 3, maxCostUsd: 0, paidCalls: 0 });
});

test("lote: 'Só com volume' e 'Marcar as com volume' tiram a frase do Assunto; o envio leva só as marcadas, sem métrica", () => {
  const candidate = (keyword: string, normalizedKeyword: string, average: number | null, isSubjectPhrase = false) => ({ keyword, normalizedKeyword, origins: ["ads_keyword_seed"], evidence: ["Ideia do Google Ads para a frase"], googleAds: metrics(average), dataForSeoEstimate: null, ranked: [], bestRankGroup: null, isSubjectPhrase, existingKeywordId: null });
  const result = {
    operationRequestId: OP,
    subject: { phrase: "seo para clínicas", normalizedPhrase: "seo para clinicas" },
    candidates: [candidate("seo para clínicas", "seo para clinicas", 5000, true), candidate("marketing para clínicas", "marketing para clinicas", 880), candidate("seo médico", "seo medico", null)],
    receipt: { status: "recorded" },
  } as unknown as SubjectDiscoveryExecuteResponse;
  assert.deepEqual(subjectSearchBatchVisibleCandidates(result, true).map(item => item.normalizedKeyword), ["marketing para clinicas"]);
  assert.deepEqual(subjectSearchBatchVisibleCandidates(result, false).map(item => item.normalizedKeyword), ["marketing para clinicas", "seo medico"]);
  assert.deepEqual([...subjectSearchBatchWithVolumeKeys(result)], ["marketing para clinicas"]);
  const line = { subjectKeywordId: LINE_A, order: 1, title: "A", keyword: "seo para clínicas" };
  const none = subjectSearchBatchImportPlan([{ line, result, selected: new Set() }]);
  assert.deepEqual(none, { lines: [], items: 0, withVolume: 0 }, "nada pré-selecionado, nada enviado");
  const plan = subjectSearchBatchImportPlan([{ line, result, selected: new Set(["marketing para clinicas", "seo medico", "seo para clinicas"]) }]);
  assert.equal(plan.items, 2, "a frase do Assunto não vai");
  assert.equal(plan.withVolume, 1);
  assert.equal(plan.lines[0].searchId, OP);
  assert.equal(plan.lines[0].receiptRecorded, true);
  for (const item of plan.lines[0].items) assert.deepEqual(Object.keys(item).sort(), ["evidence", "keyword", "origins"]);
});

test("lote (estrutural): a tela usa as MESMAS rotas e corpos da Pesquisa por Assunto, uma confirmação para pesquisar e outra para enviar", () => {
  const hook = stripComments(read("modules/minerador/discovery/use-subject-search-batch.ts"));
  const client = stripComments(read("modules/minerador/discovery/subject-search-client.ts"));
  const panel = stripComments(read("modules/minerador/discovery/subject-search-batch-panel.tsx"));
  assert.match(client, /\/subject-discovery\/search`/);
  assert.match(client, /\/subject-discovery\/import`/);
  assert.match(hook, /postSubjectSearch\(brandId, subjectSearchBatchPlanRequest\(line\)\)/);
  assert.match(hook, /postSubjectSearch\(brandId, subjectSearchBatchExecuteRequest\(item\.line, item\.plan!, crypto\.randomUUID\(\), batchId\)\)/);
  assert.match(hook, /postSubjectDiscoveryImport\(brandId, \{/);
  assert.doesNotMatch(hook + panel + client, /volume_search|averageMonthlySearches:|\.insert\(|\.update\(|\.rpc\(|supabase/, "a tela não manda volume nem escreve no banco");
  assert.match(panel, /onClick=\{\(\) => void batch\.confirmExecute\(\)\}/);
  assert.match(panel, /onClick=\{\(\) => void batch\.confirmImport\(\)\}/);
  assert.match(panel, /Confirmar envio ao Processador/);
  assert.match(hook, /const \[onlyWithVolume, setOnlyWithVolume\] = useState\(true\)/, "'Só com volume' marcado por padrão");
  const use = stripComments(read("modules/minerador/discovery/use-subject-search.ts"));
  assert.match(use, /postSubjectSearch\(brandId, buildSubjectSearchRequest\(\{ mode: "plan", \.\.\.config \}\)\)/, "a pesquisa de uma frase usa a mesma chamada");
});

/* ============================== item 8 — rotas, MCP, runtime ============================== */

test("rotas e MCP: o import lê o recibo pelo servidor e roda a Lógica pelas MESMAS portas; o runtime grava o recibo fora da rota", () => {
  const route = stripComments(read("app/api/minerador/marcas/[brandId]/subject-discovery/import/route.ts"));
  assert.match(route, /subjectDiscoveryImportPorts\(\{ brandId: context\.brandId, searchId: input\.searchId, db: profile\.supabase \}\)/);
  assert.match(route, /volume: ports\.volume,\s*runLogic: ports\.runLogic/);
  const mcp = stripComments(read("lib/server/platform-mcp-tools.ts"));
  assert.match(mcp, /subjectDiscoveryImportPorts\(\{ brandId: access\.brandId, searchId: completo\.searchId, db: getOperationalClient\(\) \}\)/);
  const runtime = stripComments(read("lib/server/subject-discovery-runtime.ts"));
  assert.match(runtime, /recordReceipt: draft => recordSubjectSearchReceipt\(\{ brandId: context\.brandId, actorId: profile\.userId, draft \}\)/);
  assert.doesNotMatch(runtime, /\.insert\(/);
  const server = stripComments(read("lib/server/subject-search-receipts.ts"));
  assert.match(server, /createCanonicalServiceClient\(\)/, "só o servidor (service_role) inclui");
  assert.doesNotMatch(server, /\.update\(|\.delete\(|\.upsert\(/, "só inclusões");
  assert.match(server, /runKeywordLogicWithCore\(\{ brandId: input\.brandId, keywordIds, db: input\.db \}\)/, "a Lógica do MCP run_keyword_logic");
});

test("migration M-A: só inclusões, RLS por marca, só o servidor escreve, guardas e pós-checagem; rollback derruba só a tabela", () => {
  const migration = read("supabase/migrations/20261014120000_recibos_da_pesquisa_por_assunto.sql");
  const sql = migration.replace(/--.*$/gm, "");
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;\s*$/m);
  assert.match(sql, /RAISE EXCEPTION 'RECIBOS_PRE: public\.can_access_brand\(uuid\) ausente\.'/);
  assert.match(sql, /RAISE EXCEPTION 'RECIBOS_PRE: minerador_subject_search_receipts já existe/);
  assert.match(sql, /CREATE TABLE public\.minerador_subject_search_receipts \(/);
  assert.match(sql, /PRIMARY KEY \(marca_id, operation_request_id\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.minerador_subject_search_receipts/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.minerador_subject_search_receipts FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.minerador_subject_search_receipts TO authenticated;/);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.minerador_subject_search_receipts TO service_role;/);
  assert.match(sql, /FOR SELECT TO authenticated USING \(public\.can_access_brand\(marca_id\)\)/);
  assert.equal((sql.match(/CREATE POLICY/g) || []).length, 1, "uma policy, só de leitura");
  assert.doesNotMatch(sql, /subject_keyword_id uuid[^,]*REFERENCES/, "sem FK no Assunto: exclusão definitiva não é bloqueada por recibo");
  assert.doesNotMatch(sql, /minerador_keywords|UPDATE public\.|DELETE FROM|DROP /i, "não toca outra tabela nem dado");
  assert.match(sql, /RAISE EXCEPTION 'RECIBOS_POS: anon lê a tabela\.'/);
  assert.match(migration, /RAISE EXCEPTION 'ENSAIO'/, "ensaio documentado");
  assert.match(migration, /Nunca `supabase db push`/);
  const rollback = read("supabase/rollback/20261014120000_recibos_da_pesquisa_por_assunto.rollback.sql").replace(/--.*$/gm, "");
  assert.match(rollback, /DROP TABLE IF EXISTS public\.minerador_subject_search_receipts;/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.minerador_subject_search_receipts_append_only\(\);/);
  assert.doesNotMatch(rollback, /minerador_keywords/);
});

/* ============================== item 9 — o card ============================== */

test("item 9: reaprovação só das aprovadas dos artigos que mudam; sobra só se o servidor disse que pode sair", () => {
  const article = (change: string, subject: [string | null, string | null], principal: [string | null, string | null]) => ({ change, subject: { keywordId: subject[0], status: subject[1] }, principal: { keywordId: principal[0], status: principal[1] } });
  const preview = {
    articles: [
      article("changed", ["s1", "aprovado"], ["s1", "aprovado"]),
      article("new", ["s2", "bruto"], ["p2", "aprovado"]),
      article("unchanged", ["s3", "aprovado"], ["p3", "aprovado"]),
    ],
    leftovers: [
      { keywordId: "l1", keyword: "silo wifi", reason: "silo_name", label: "", deletable: true, blockedReason: null },
      { keywordId: "l2", keyword: "artigo pilar", reason: "pasted_label", label: "", deletable: false, blockedReason: DECLARED_PLAN_LEFTOVER_BLOCKED.sent },
      { keywordId: "l3", keyword: "antiga", reason: "pasted_label", label: "" },
    ],
  } as never;
  assert.deepEqual(cadastroReapprovalIds(preview), ["s1", "p2"]);
  const split = cadastroLeftoversToDelete(preview);
  assert.deepEqual(split.deletable.map(item => item.keywordId), ["l1"]);
  assert.deepEqual(split.blocked.map(item => item.keywordId), ["l2", "l3"], "sem a resposta do servidor, não é oferecida");
});

test("item 9: a sobra publicada ou enviada ao Arquiteto não é oferecida; leitura que falha não oferece nada", async () => {
  const rowsByTable: Record<string, Row[]> = {
    minerador_keywords: [
      { id: "l1", brand_id: BRAND, status: "bruto", deleted_at: null, analise_semantica: {} },
      { id: "l2", brand_id: BRAND, status: "publicado", deleted_at: null, analise_semantica: {} },
      { id: "l3", brand_id: BRAND, status: "aprovado", deleted_at: null, analise_semantica: {} },
    ],
    editorial_workflow_items: [{ subject_id: "l3", marca_id: BRAND, stage: "architect", subject_type: "keyword" }],
  };
  const reads: string[] = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        is(column: string, value: unknown) { filters.push([column, value]); return query; },
        in(column: string, value: unknown[]) { filters.push([column, { in: value }]); return query; },
        then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
          reads.push(table);
          const data = (rowsByTable[table] || []).filter(row => filters.every(([column, value]) => value && typeof value === "object" && "in" in (value as object) ? ((value as { in: unknown[] }).in).includes(row[column]) : row[column] === value));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const map = await classifyDeclaredPlanLeftovers(client, BRAND, ["l1", "l2", "l3", "l4"]);
  assert.deepEqual(map.get("l1"), { deletable: true, blockedReason: null });
  assert.equal(map.get("l2")!.blockedReason, DECLARED_PLAN_LEFTOVER_BLOCKED.published);
  assert.equal(map.get("l3")!.blockedReason, DECLARED_PLAN_LEFTOVER_BLOCKED.sent);
  assert.equal(map.get("l4")!.deletable, false, "fora da marca ou já excluída: não oferecida");
  assert.deepEqual([...new Set(reads)].sort(), ["editorial_workflow_items", "minerador_keywords"]);
  const broken = { from() { throw new Error("banco fora"); } } as unknown as SupabaseClient;
  const failed = await classifyDeclaredPlanLeftovers(broken, BRAND, ["l1"]);
  assert.deepEqual(failed.get("l1"), { deletable: false, blockedReason: DECLARED_PLAN_LEFTOVER_BLOCKED.unknown });
  assert.equal((await classifyDeclaredPlanLeftovers(broken, BRAND, [])).size, 0, "sem sobra, nenhuma leitura");
});

test("item 9 (estrutural): caixas nunca marcadas por padrão, texto de exclusão definitiva, confirmação de sempre, 'Ver na planilha'", () => {
  const card = stripComments(read("modules/minerador/subject-cadastro-card.tsx"));
  const followUp = stripComments(read("modules/minerador/subject-cadastro-follow-up.ts"));
  assert.match(card, /const \[excluirSobras, setExcluirSobras\] = useState\(false\);/);
  assert.match(card, /const \[reaprovar, setReaprovar\] = useState\(false\);/);
  assert.match(card, /checked=\{excluirSobras\}/);
  assert.match(card, /checked=\{reaprovar\}/);
  assert.match(followUp, /apaga de vez — decisão sua/);
  assert.match(followUp, /EXCLUÍDA DEFINITIVAMENTE/);
  assert.match(followUp, /só a Lógica é exigida/);
  assert.doesNotMatch(card + followUp, /recuperáve(l|is) por Restaurar|lixeira \(recuperável\)/, "nunca promete lixeira recuperável para não publicada");
  // As decisões só rodam depois do cadastro gravado e relido.
  const apply = card.slice(card.indexOf("const handleApply = async"), card.indexOf("const busy = phase"));
  assert.ok(apply.indexOf("setApplied(result)") < apply.indexOf("requestCadastroReapproval("), "reaprova depois do cadastro");
  assert.ok(apply.indexOf("setApplied(result)") < apply.indexOf("onDeleteLeftovers(sobras)"), "exclui depois do cadastro");
  assert.match(apply, /excluirSobras \? cadastroLeftoversToDelete\(preview\.result\)\.deletable/);
  assert.match(card, /Ver na planilha \(cor \{EDITORIAL_GROUP_COLOR_LABELS\[corDoCadastro\]\}\)/);
  const workspace = stripComments(read("modules/minerador/minerador-workspace.tsx"));
  assert.match(workspace, /onDeleteLeftovers=\{ids => void handleBatchDelete\(false, ids\)\}/, "a MESMA confirmação de exclusão do Minerador");
  assert.match(workspace, /keywordGroups\.setChoice\(input\.color\)/);
  const reapprove = stripComments(read("app/api/minerador/marcas/[brandId]/plans/reapprove/route.ts"));
  assert.match(reapprove, /module: "minerador", action: "approve"/);
  // SDD acelerar item 2 (mudança declarada): a aprovação sai do encadeamento único.
  assert.match(reapprove, /approveKeywordsWithRowsOnServer\(context\.brandId, context\.actorUserId, keywordIds\)/);
  const encadeamento = stripComments(read("lib/server/minerador-approve-and-send.ts"));
  assert.match(encadeamento, /keywordDecisionEntries\(rows, "approve"\)/);
  assert.match(encadeamento, /applyKeywordDecisionEntries\(\{/);
  assert.match(reapprove, /runKeywordLogicWithCore\(\{ brandId: context\.brandId, keywordIds \}\)/);
  assert.doesNotMatch(reapprove, /createMineradorArquitetoHandoff|\.delete\(|\.insert\(/, "reaprovar não envia nem apaga");
});
