import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importKeywordsWithCore, type KeywordImportCoreItem } from "../lib/minerador/keyword-import-core.ts";
import { applyApproval, approvedPackageDiverged, approvedPackageSignature, type ApprovedPackageInput } from "../lib/minerador/approved-package.ts";
import { resolveEffectiveKeywordStatus } from "../lib/minerador/editorial-status.ts";

/**
 * CONSERTO — reimportar pela Descoberta não rebaixa aprovada (SDD 2026-09-24,
 * F1b.7 "Defeito que já existe", regra da Q10).
 *
 * Antes do conserto, `importKeywordsWithCore` regravava `discovery_import`
 * (com `lastSeenAt`) em toda existente, inclusive aprovada. A chave entra na
 * assinatura do pacote, e a aprovada virava Em revisão em silêncio. Agora a
 * existente com registro de aprovação não é escrita; a que não tem segue
 * recebendo a evidência como antes.
 *
 * O banco é uma tabela em memória com a forma do `postgrest-js`. Nenhuma rede.
 */

type Row = Record<string, unknown>;
type Filter = { column: string; kind: "eq" | "is"; value: unknown };
type Recorded = { op: "select" | "insert" | "update"; columns: string; filters: Filter[]; values: Row | null };

const BRAND = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_BRAND = "bbbbbbbb-0000-4000-8000-000000000002";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const APPROVED_AT = "2026-09-20T10:00:00+00:00";
const NOW = "2026-09-24T12:00:00+00:00";
const BATCH = "00000000-0000-4000-8000-000000000001";

function project(row: Row, columns: string) {
  if (!columns || columns === "*") return { ...row };
  return Object.fromEntries(columns.split(",").map(column => [column.trim(), row[column.trim()] ?? null]));
}

function readColumn(row: Row, column: string): unknown {
  // `a->b` lê o caminho JSON como o PostgREST: chave ausente é SQL NULL.
  const [head, ...path] = column.split("->");
  let value: unknown = row[head];
  for (const key of path) value = value && typeof value === "object" ? (value as Row)[key] : undefined;
  return value ?? null;
}

function fakeSupabase(initial: Row[], options: { beforeUpdate?: (rows: Row[]) => void } = {}) {
  const rows = initial.map(row => structuredClone(row));
  const log: Recorded[] = [];
  let nextId = 1;
  function builder() {
    const state: Recorded = { op: "select", columns: "", filters: [], values: null };
    let single = false;
    const query = {
      select(columns = "*") { state.columns = columns; return query; },
      eq(column: string, value: unknown) { state.filters.push({ column, kind: "eq", value }); return query; },
      is(column: string, value: unknown) { state.filters.push({ column, kind: "is", value }); return query; },
      insert(values: Row) { state.op = "insert"; state.values = values; return query; },
      update(values: Row) { state.op = "update"; state.values = values; return query; },
      single() { single = true; return query; },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve().then(() => execute()).then(resolve, reject);
      },
    };
    function execute() {
      log.push(structuredClone(state));
      if (state.op === "insert") {
        const row = { ...structuredClone(state.values!), id: `created-${nextId++}`, deleted_at: null };
        rows.push(row);
        const projected = project(row, state.columns);
        return { data: single ? projected : [projected], error: null };
      }
      if (state.op === "update") options.beforeUpdate?.(rows);
      const target = rows.filter(row => state.filters.every(({ column, value }) => readColumn(row, column) === value));
      if (state.op === "update") {
        for (const row of target) Object.assign(row, structuredClone(state.values!));
        return { data: state.columns ? target.map(row => project(row, state.columns)) : null, error: null };
      }
      return { data: target.map(row => project(row, state.columns)), error: null };
    }
    return query;
  }
  return { rows, log, client: { from: () => builder() } as unknown as SupabaseClient };
}

function packageInput(row: Row): ApprovedPackageInput {
  return {
    keywordId: String(row.id),
    brandId: String(row.brand_id),
    keyword: String(row.keyword),
    intent: row.intent,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
    kgrScore: row.kgr_score,
    listaId: row.lista_id,
    semantic: row.analise_semantica as Record<string, unknown>,
  };
}

async function approvedRow(id: string, keyword: string): Promise<Row> {
  const base: Row = {
    id,
    keyword,
    brand_id: BRAND,
    lista_id: "lista-1",
    status: "aprovado",
    intent: "Informacional",
    volume_search: 480,
    results_allintitle: 30,
    kgr_score: 0.0625,
    deleted_at: null,
    analise_semantica: {
      dna_origem: "logico_deterministico",
      discovery_import: { source: "google_ads_discovery", lastSeenAt: "2026-09-10T00:00:00+00:00", sourceBatchId: "antigo" },
    },
  };
  const semantic = await applyApproval({ ...packageInput(base), approvedAt: APPROVED_AT, approvedBy: ACTOR });
  return { ...base, analise_semantica: semantic };
}

function item(keyword: string): KeywordImportCoreItem {
  return {
    keyword,
    source: "discovery",
    status: "bruto",
    locations: [{ countryCode: "BR", stateCode: "SP" }],
    extractionBatchId: BATCH,
    discoverySource: "google_ads",
    discoveryRunId: "run-2",
    resultsStatus: "pending",
    volumeStatus: "success",
    volume: 480,
    volumeSource: "google_ads",
  };
}

test("fixture: a aprovada nasce íntegra (assinatura bate, status efetivo Aprovado)", async () => {
  const row = await approvedRow("kw-aprovada", "clínica de estética");
  assert.equal(approvedPackageDiverged(packageInput(row)), false);
  assert.equal(resolveEffectiveKeywordStatus({ status: row.status, diverged: false }).status, "aprovado");
});

test("reimportar uma aprovada pela Descoberta não escreve nela: a assinatura fica idêntica e ela continua Aprovada", async () => {
  const row = await approvedRow("kw-aprovada", "clínica de estética");
  const before = structuredClone(row);
  const signatureBefore = approvedPackageSignature(packageInput(before));
  const supabase = fakeSupabase([row]);

  const result = await importKeywordsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: supabase.client, now: NOW, items: [item("CLINICA DE ESTETICA")] });

  assert.equal(result.existing, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.items[0]?.outcome, "existing");
  assert.equal(result.items[0]?.keywordId, "kw-aprovada");
  assert.equal(result.items[0]?.metadataUpdated, false);
  assert.equal(result.items[0]?.reason, "approval_record_preserved");
  assert.equal(supabase.log.filter(entry => entry.op === "update").length, 0, "nenhum update na aprovada");

  const after = supabase.rows.find(candidate => candidate.id === "kw-aprovada")!;
  assert.deepEqual(after, before, "a linha inteira fica byte a byte igual");
  assert.equal(approvedPackageSignature(packageInput(after)), signatureBefore);
  const diverged = approvedPackageDiverged(packageInput(after));
  assert.equal(diverged, false);
  assert.equal(resolveEffectiveKeywordStatus({ status: after.status, diverged }).status, "aprovado");
});

test("o que o conserto evita: a mesma evidência escrita numa aprovada mudaria a assinatura e a rebaixaria", async () => {
  const row = await approvedRow("kw-aprovada", "clínica de estética");
  const semantic = row.analise_semantica as Row;
  const rewritten: Row = { ...row, analise_semantica: { ...semantic, discovery_import: { ...(semantic.discovery_import as Row), lastSeenAt: NOW } } };
  const diverged = approvedPackageDiverged(packageInput(rewritten));
  assert.equal(diverged, true);
  assert.equal(resolveEffectiveKeywordStatus({ status: rewritten.status, diverged }).status, "em_revisao");
});

test("registro de aprovação em Em revisão ou publicada também não é escrito (mesma regra da Q10)", async () => {
  const inReview = { ...(await approvedRow("kw-revisao", "estética facial")), status: "em_revisao" };
  const before = structuredClone(inReview);
  const supabase = fakeSupabase([inReview]);
  const result = await importKeywordsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: supabase.client, now: NOW, items: [item("estética facial")] });
  assert.equal(result.items[0]?.outcome, "existing");
  assert.equal(result.items[0]?.metadataUpdated, false);
  assert.deepEqual(supabase.rows[0], before);
});

test("existente sem registro de aprovação segue como hoje: recebe discovery_import com lastSeenAt e preserva o resto", async () => {
  const plain: Row = {
    id: "kw-bruta",
    keyword: "harmonização facial",
    brand_id: BRAND,
    lista_id: "lista-2",
    status: "bruto",
    deleted_at: null,
    analise_semantica: { humanDecision: "preserve", discovery_import: { source: "manual_discovery", lastSeenAt: "2026-09-01T00:00:00+00:00" } },
  };
  const supabase = fakeSupabase([plain]);
  const result = await importKeywordsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: supabase.client, now: NOW, items: [item("Harmonização  Facial")] });

  assert.equal(result.existing, 1);
  assert.equal(result.items[0]?.outcome, "existing");
  assert.equal(result.items[0]?.metadataUpdated, true);
  assert.equal(result.items[0]?.reason, "keyword_preserved");
  const updates = supabase.log.filter(entry => entry.op === "update");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].filters, [
    { column: "id", kind: "eq", value: "kw-bruta" },
    { column: "brand_id", kind: "eq", value: BRAND },
    { column: "deleted_at", kind: "is", value: null },
    { column: "analise_semantica->aprovacao", kind: "is", value: null },
  ]);
  assert.equal(updates[0].columns, "id", "o update devolve só o id");
  const semantic = supabase.rows[0].analise_semantica as Row;
  assert.equal(semantic.humanDecision, "preserve");
  const discovery = semantic.discovery_import as Row;
  assert.equal(discovery.lastSeenAt, NOW);
  assert.equal(discovery.source, "google_ads_discovery");
  assert.equal(discovery.sourceBatchId, BATCH);
  assert.equal(supabase.rows[0].lista_id, "lista-2");
  assert.equal(supabase.rows[0].status, "bruto");
});

test("aprovada ENTRE a leitura e a escrita: o update condicionado não a regrava e ela continua Aprovada", async () => {
  const plain: Row = { id: "kw-corrida", keyword: "peeling químico", brand_id: BRAND, lista_id: "lista-3", status: "bruto", deleted_at: null, analise_semantica: { humanDecision: "preserve" } };
  let approvedMeanwhile: Row | null = null;
  const supabase = fakeSupabase([plain], {
    beforeUpdate: rows => {
      if (approvedMeanwhile) return;
      const index = rows.findIndex(row => row.id === "kw-corrida");
      approvedMeanwhile = { ...rows[index], status: "aprovado", analise_semantica: { humanDecision: "preserve", aprovacao: { approvedAt: APPROVED_AT, approvedBy: ACTOR } } };
      rows[index] = structuredClone(approvedMeanwhile);
    },
  });
  const result = await importKeywordsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: supabase.client, now: NOW, items: [item("peeling quimico")] });
  assert.equal(result.failed, 0);
  assert.equal(result.items[0]?.outcome, "existing");
  assert.equal(result.items[0]?.metadataUpdated, false);
  assert.equal(result.items[0]?.reason, "changed_during_import");
  assert.deepEqual(supabase.rows[0], approvedMeanwhile, "o registro de aprovação feito no meio fica intacto");
});

test("nova segue criada como bruto com discovery_import; a aprovada de outra marca não casa nem é tocada", async () => {
  const foreign = { ...(await approvedRow("kw-outra-marca", "clínica de estética")), brand_id: OTHER_BRAND };
  const before = structuredClone(foreign);
  const supabase = fakeSupabase([foreign]);
  const result = await importKeywordsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: supabase.client, now: NOW, items: [item("clínica de estética")] });
  assert.equal(result.created, 1);
  assert.equal(result.items[0]?.outcome, "created");
  const created = supabase.rows.find(row => row.id === result.items[0]?.keywordId)!;
  assert.equal(created.status, "bruto");
  assert.equal(created.brand_id, BRAND);
  assert.equal(((created.analise_semantica as Row).discovery_import as Row).lastSeenAt, NOW);
  assert.deepEqual(supabase.rows.find(row => row.id === "kw-outra-marca"), before);
});
