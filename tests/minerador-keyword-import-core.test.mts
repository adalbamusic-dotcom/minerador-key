import assert from "node:assert/strict";
import test from "node:test";
import { importKeywordsWithCore, type KeywordImportCoreItem } from "../lib/minerador/keyword-import-core.ts";

type Row = Record<string, unknown>;
type QueryResult = { data: unknown; error: { code?: string; message?: string } | null };
type Query = {
  select: (...columns: string[]) => Query;
  eq: (column: string, value: unknown) => Query;
  insert: (value: Row) => Query;
  update: (value: Row) => Query;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  execute: () => Promise<QueryResult>;
  then: (resolve: (value: QueryResult) => unknown, reject: (error: unknown) => unknown) => unknown;
};

function fakeSupabase(initial: Row[], options: { insertError?: { code: string; message: string } } = {}) {
  const rows = initial.map(row => ({ ...row }));
  const insertedPayloads: Row[] = [];
  let nextId = 1;
  function builder(): Query {
    let mode = "select";
    let payload: Row | null = null;
    const filters: Array<[string, unknown]> = [];
    let requireSingle = false;
    let allowEmpty = false;
    const query: Query = {
      select() { return query; },
      eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        insert(value: Row) { mode = "insert"; payload = value; insertedPayloads.push({ ...value }); return query; },
      update(value: Row) { mode = "update"; payload = value; return query; },
      single() { requireSingle = true; return query.execute(); },
      maybeSingle() { allowEmpty = true; return query.execute(); },
      then(resolve: (value: QueryResult) => unknown, reject: (error: unknown) => unknown) { return query.execute().then(resolve, reject); },
      async execute() {
        const matches = rows.filter(row => filters.every(([column, value]) => row[column] === value));
        if (mode === "select") {
          if (requireSingle && matches.length !== 1) return { data: null, error: { code: "PGRST116", message: "not found" } };
          if (allowEmpty) return { data: matches[0] || null, error: null };
          return { data: matches, error: null };
        }
        if (mode === "update") {
          for (const row of matches) Object.assign(row, payload || {});
          return { data: null, error: null };
        }
        if (options.insertError) return { data: null, error: options.insertError };
        const row = { ...(payload || {}), id: `keyword-${nextId++}` };
        rows.push(row);
        return { data: requireSingle ? row : [row], error: null };
      },
    };
    return query;
  }
  return { rows, insertedPayloads, from: () => builder() };
}

const batchId = "00000000-0000-4000-8000-000000000001";
const location = { countryCode: "BR" as const, stateCode: "SP" };
function item(keyword: string): KeywordImportCoreItem {
  return { keyword, source: "discovery", status: "bruto", locations: [location], extractionBatchId: batchId, resultsStatus: "pending", volumeStatus: "pending" };
}

test("nucleo cria como bruto, deduplica o lote e preserva existente", async () => {
  const existing = { id: "keyword-existing", keyword: "clinica de estetica", brand_id: "brand-a", lista_id: "lista-1", status: "aprovado", analise_semantica: { humanDecision: "preserve" } };
  const supabase = fakeSupabase([existing]);
  const result = await importKeywordsWithCore({
    brandId: "brand-a",
    actorUserId: "actor-a",
    supabase: supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
    now: "2026-08-04T00:00:00.000Z",
    items: [item("Nova keyword"), item("CLÍNICA DE ESTÉTICA"), item("nova   keyword")],
  });
  assert.equal(result.created, 1);
  assert.equal(result.existing, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.failed, 0);
  assert.equal(supabase.rows.filter((row: Row) => row.brand_id === "brand-a").length, 2);
  assert.equal(supabase.rows.find((row: Row) => row.id === "keyword-existing")?.lista_id, "lista-1");
  assert.equal(supabase.rows.find((row: Row) => row.keyword === "Nova keyword")?.status, "bruto");
  const semantic = supabase.rows.find((row: Row) => row.id === "keyword-existing")?.analise_semantica as Row;
  assert.equal(semantic.humanDecision, "preserve");
});

test("nucleo isola a mesma keyword por brand_id", async () => {
  const supabase = fakeSupabase([{ id: "other-keyword", keyword: "mesma keyword", brand_id: "brand-b", lista_id: null, status: "bruto", analise_semantica: {} }]);
  const result = await importKeywordsWithCore({ brandId: "brand-a", actorUserId: "actor-a", supabase: supabase as unknown as import("@supabase/supabase-js").SupabaseClient, items: [item("mesma keyword")] });
  assert.equal(result.created, 1);
  assert.equal(supabase.rows.filter((row: Row) => row.keyword === "mesma keyword").length, 2);
});

test("nucleo devolve código sanitizado por item quando a persistência falha", async () => {
  const supabase = fakeSupabase([], { insertError: { code: "42501", message: "permission denied" } });
  const result = await importKeywordsWithCore({ brandId: "brand-a", actorUserId: "actor-a", supabase: supabase as unknown as import("@supabase/supabase-js").SupabaseClient, items: [item("keyword sem permissão")] });
  assert.equal(result.failed, 1);
  assert.equal(result.items[0]?.reason, "keyword_insert_failed");
  assert.equal(result.items[0]?.errorCode, "42501");
});

test("manual e CSV sem métricas não enviam volume_source nulo", async () => {
  const supabase = fakeSupabase([]);
  const result = await importKeywordsWithCore({
    brandId: "brand-a",
    actorUserId: "actor-a",
    supabase: supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
    items: [
      { ...item("keyword manual sem métricas"), discoverySource: "manual", volume: null, volumeSource: undefined, resultsAllintitle: null, locations: [] },
      { ...item("keyword csv sem métricas"), discoverySource: "csv", volume: null, volumeSource: undefined, resultsAllintitle: null, locations: [] },
    ],
  });
  assert.equal(result.created, 2);
  assert.equal(supabase.insertedPayloads.length, 2);
  assert.equal(supabase.insertedPayloads.every(payload => !("volume_source" in payload)), true);
  assert.equal("volume_search" in (supabase.insertedPayloads[0] || {}), true);
});
