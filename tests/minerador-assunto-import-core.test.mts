import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  importSubjectsWithCore,
  SUBJECT_IMPORT_APPROVAL_WARNING,
  SUBJECT_IMPORT_DELETED_NOTICE,
  SUBJECT_IMPORT_LIVE_COLUMNS,
  type SubjectImportItem,
} from "../lib/minerador/keyword-import-core.ts";
import { resolveKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE } from "../lib/minerador/subject-destination.ts";

/**
 * IMPORT DE ASSUNTOS — NÚCLEO (SDD 2026-09-24, F1.3, F1.9).
 *
 * O banco é uma tabela em memória com a forma do `postgrest-js`: projeta as
 * colunas pedidas, filtra por eq/in/is/not/gt e registra cada consulta, para o
 * teste provar o que foi lido (egress) e o que foi escrito. Nenhuma rede.
 */

type Row = Record<string, unknown>;
type Filter = { column: string; kind: "eq" | "in" | "is" | "not_is" | "gt"; value: unknown };
type Recorded = { table: string; op: "select" | "insert" | "update"; columns: string; filters: Filter[]; values: Row | null };

const BRAND_A = "aaaaaaaa-0000-4000-8000-000000000001";
const BRAND_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const NOW = "2026-09-24T12:00:00+00:00";
const SITE = "https://exemplo.com.br";
const REQUEST = "99999999-0000-4000-8000-000000000009";

function project(row: Row, columns: string) {
  if (!columns || columns === "*") return { ...row };
  return Object.fromEntries(columns.split(",").map(column => [column.trim(), row[column.trim()] ?? null]));
}

function fakeSupabase(tables: Record<string, Row[]>, options: { gate?: Promise<void>; maxRows?: number; omitSemanticIds?: readonly string[] } = {}) {
  const data: Record<string, Row[]> = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map(row => structuredClone(row))]));
  const log: Recorded[] = [];
  let nextId = 1;
  function builder(table: string) {
    const state: Recorded = { table, op: "select", columns: "", filters: [], values: null };
    let single = false;
    let maybe = false;
    let ordered: string | null = null;
    let range: [number, number] | null = null;
    const query = {
      select(columns = "*") { state.columns = columns; return query; },
      eq(column: string, value: unknown) { state.filters.push({ column, kind: "eq", value }); return query; },
      in(column: string, value: unknown[]) { state.filters.push({ column, kind: "in", value }); return query; },
      is(column: string, value: unknown) { state.filters.push({ column, kind: "is", value }); return query; },
      not(column: string, operator: string, value: unknown) { assert.equal(operator, "is"); state.filters.push({ column, kind: "not_is", value }); return query; },
      gt(column: string, value: unknown) { state.filters.push({ column, kind: "gt", value }); return query; },
      insert(values: Row) { state.op = "insert"; state.values = values; return query; },
      update(values: Row) { state.op = "update"; state.values = values; return query; },
      order(column: string) { ordered = column; return query; },
      range(from: number, to: number) { range = [from, to]; return query; },
      single() { single = true; return query; },
      maybeSingle() { maybe = true; return query; },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(options.gate).then(() => execute()).then(resolve, reject);
      },
    };
    function matches(row: Row) {
      return state.filters.every(({ column, kind, value }) => {
        const current = row[column] ?? null;
        if (kind === "eq") return current === value;
        if (kind === "in") return (value as unknown[]).includes(current);
        if (kind === "is") return current === value;
        if (kind === "not_is") return current !== value;
        return current !== null && Date.parse(String(current)) > Date.parse(String(value));
      });
    }
    function execute() {
      log.push(structuredClone(state));
      const rows = data[table] || (data[table] = []);
      if (state.op === "insert") {
        const row = { ...structuredClone(state.values!), id: `created-${nextId++}`, deleted_at: null };
        rows.push(row);
        const projected = project(row, state.columns);
        return { data: single || maybe ? projected : [projected], error: null };
      }
      let target = rows.filter(matches);
      if (state.op === "update") for (const row of target) Object.assign(row, structuredClone(state.values!));
      if (state.op === "select" && ordered) target = [...target].sort((a, b) => String(a[ordered!]).localeCompare(String(b[ordered!])));
      if (state.op === "select" && range) target = target.slice(range[0], range[1] + 1);
      if (state.op === "select" && options.maxRows !== undefined) target = target.slice(0, options.maxRows);
      if (state.op === "select" && state.columns.includes("analise_semantica") && options.omitSemanticIds) target = target.filter(row => !options.omitSemanticIds!.includes(String(row.id)));
      const projected = target.map(row => project(row, state.columns));
      return { data: single || maybe ? projected[0] ?? null : projected, error: null };
    }
    return query;
  }
  return {
    data,
    log,
    writes: () => log.filter(entry => entry.op !== "select"),
    client: { from: (table: string) => builder(table) } as unknown as SupabaseClient,
  };
}

function keyword(id: string, text: string, extra: Row = {}): Row {
  return { id, keyword: text, brand_id: BRAND_A, status: "bruto", lista_id: null, deleted_at: null, analise_semantica: {}, ...extra };
}

const declared = (note: string | null, destinationUrl: string | null = null) => ({
  keyword_subject: { declared: true, note, destinationUrl, destinationCheck: destinationUrl ? { hostMatchesBrand: true, catalogPageType: null, catalogTitle: null, checkedAt: NOW } : null },
  keyword_subject_actor: ACTOR,
  keyword_subject_at: NOW,
  keyword_subject_origin: "review",
  keyword_subject_history: [],
});

const published = {
  site_origin: {
    sourceUrl: `${SITE}/seo`,
    resolvedUrl: `${SITE}/seo`,
    canonicalUrl: `${SITE}/seo`,
    urlSituation: "canonical_confirmed", publicationStatus: "published",
    lastCheckedAt: "2026-09-20T23:30:00+00:00",
    publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T23:40:00+00:00",
    siteRole: "article",
  },
};

function run(db: ReturnType<typeof fakeSupabase>, mode: "preview" | "apply", items: SubjectImportItem[], extra: Partial<Parameters<typeof importSubjectsWithCore>[0]> = {}) {
  return importSubjectsWithCore({
    brandId: BRAND_A,
    actorUserId: ACTOR,
    supabase: db.client,
    mode,
    source: "csv",
    items,
    importRequestId: mode === "apply" ? REQUEST : null,
    brandSiteUrl: SITE,
    now: NOW,
    ...extra,
  });
}

test("prévia não escreve nada e classifica cada linha", async () => {
  const db = fakeSupabase({
    minerador_keywords: [
      keyword("k-plain", "marketing para clínicas", { status: "aprovado", analise_semantica: { discovery_import: { source: "google_ads_discovery" } } }),
      keyword("k-same", "SEO para clínicas", { analise_semantica: declared("Para donos de clínica") }),
      keyword("k-diff", "tráfego pago clínica", { analise_semantica: declared("Outra nota") }),
    ],
  });
  const result = await run(db, "preview", [
    { keyword: "Nova frase de assunto" },
    { keyword: "Marketing para  CLÍNICAS" },
    { keyword: "seo para clinicas", note: "Para donos de clínica" },
    { keyword: "tráfego pago clínica", note: "Nota nova" },
    { keyword: "   " },
    { keyword: "nova frase de assunto" },
    { keyword: "nota longa", note: "x".repeat(281) },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(db.writes().length, 0, "a prévia não escreve");
  assert.deepEqual(result.rows.map(row => row.classification), [
    "new", "existing_without_subject", "existing_subject_same", "existing_subject_different", "invalid", "invalid", "invalid",
  ]);
  const plain = result.rows[1];
  assert.equal(plain.keywordId, "k-plain");
  assert.equal(plain.status, "aprovado");
  assert.equal(plain.approvalWarning, SUBJECT_IMPORT_APPROVAL_WARNING);
  assert.equal(plain.originLabel, "Descoberta · Google Ads");
  assert.deepEqual(result.rows[3].recorded, { note: "Outra nota", destinationUrl: null });
  assert.match(result.rows[5].reason || "", /Repetida/);
  assert.match(result.rows[6].reason || "", /280/);
  assert.equal(result.counts.new, 1);
  assert.equal(result.counts.invalid, 3);
  assert.deepEqual(result.createdIds, []);
});

test("egress: vivas só com id,keyword,status,lista_id; analise_semantica só das que casaram", async () => {
  const db = fakeSupabase({
    minerador_keywords: [
      keyword("k-1", "marketing para clínicas"),
      keyword("k-2", "outra keyword da marca"),
      keyword("k-3", "mais uma"),
    ],
  });
  await run(db, "preview", [{ keyword: "marketing para clínicas" }, { keyword: "nova" }]);
  const reads = db.log.filter(entry => entry.table === "minerador_keywords" && entry.op === "select");
  assert.equal(reads[0].columns, SUBJECT_IMPORT_LIVE_COLUMNS);
  assert.equal(reads[0].columns, "id,keyword,status,lista_id");
  for (const read of reads) assert.notEqual(read.columns, "*");
  const semanticReads = reads.filter(read => read.columns.includes("analise_semantica"));
  assert.equal(semanticReads.length, 1);
  assert.deepEqual(semanticReads[0].filters.find(filter => filter.kind === "in")?.value, ["k-1"]);
  assert.ok(semanticReads[0].filters.some(filter => filter.kind === "eq" && filter.column === "brand_id" && filter.value === BRAND_A));
});

test("prévia avisa versão apagada ainda restaurável por leitura estreita separada", async () => {
  const db = fakeSupabase({
    minerador_keywords: [
      keyword("k-del", "SEO para clínicas", { deleted_at: "2026-09-24T10:00:00+00:00", purge_after: "2026-09-25T10:00:00+00:00" }),
      keyword("k-old", "frase expirada", { deleted_at: "2026-09-20T10:00:00+00:00", purge_after: "2026-09-21T10:00:00+00:00" }),
    ],
  });
  const result = await run(db, "preview", [{ keyword: "seo para clínicas" }, { keyword: "frase expirada" }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rows[0].classification, "new", "a apagada não casa: segue a regra das vivas");
  assert.equal(result.rows[0].deletedVersion, true);
  assert.ok(result.rows[0].notices.includes(SUBJECT_IMPORT_DELETED_NOTICE));
  assert.equal(result.rows[1].deletedVersion, false, "fora da janela de restauração não avisa");
  const deletedRead = db.log.find(entry => entry.filters.some(filter => filter.kind === "not_is"));
  assert.equal(deletedRead?.columns, "id,keyword");
});

test("apply cria as novas como bruto, declaradas pelo humano, e reaplicar não escreve nada", async () => {
  const db = fakeSupabase({ minerador_keywords: [] });
  const items = [{ keyword: "SEO para clínicas", note: "Para donos de clínica", destinationUrl: `${SITE}/seo-clinicas` }, { keyword: "Tráfego pago para clínicas" }];
  const first = await run(db, "apply", items);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.createdIds.length, 2);
  const created = db.data.minerador_keywords;
  assert.equal(created.length, 2);
  for (const row of created) {
    assert.equal(row.brand_id, BRAND_A);
    assert.equal(row.status, "bruto");
    assert.equal("volume_search" in row, false, "nenhuma métrica é gravada");
    assert.equal("intent" in row, false, "intenção vem da Lógica");
    const semantic = row.analise_semantica as Row;
    assert.equal(semantic.keyword_subject_actor, ACTOR);
    assert.equal(semantic.keyword_subject_origin, "import");
    assert.equal((semantic.subject_import as Row).importRequestId, REQUEST);
    assert.equal("discovery_import" in semantic, false);
  }
  const subject = resolveKeywordSubject(created[0].analise_semantica as Row);
  assert.equal(subject.declared, true);
  assert.equal(subject.note, "Para donos de clínica");
  assert.equal(subject.destinationUrl, `${SITE}/seo-clinicas`);
  assert.equal(subject.destinationCheck?.hostMatchesBrand, true);
  const insert = db.log.find(entry => entry.op === "insert");
  assert.equal(insert?.columns, "id", "o insert devolve só o id (R6)");

  const writesBefore = db.writes().length;
  const second = await run(db, "apply", items, { importRequestId: "99999999-0000-4000-8000-000000000010" });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(db.writes().length, writesBefore, "reimportar não cria nem regrava");
  assert.deepEqual(second.createdIds, []);
  assert.deepEqual(second.rows.map(row => row.outcome), ["unchanged", "unchanged"]);
});

test("existente sem Assunto não é declarada sem marcação; com marcação, é declarada", async () => {
  const db = fakeSupabase({ minerador_keywords: [keyword("k-plain", "marketing para clínicas", { status: "aprovado", lista_id: "lista-x", analise_semantica: { humano: "preservar" } })] });
  const unmarked = await run(db, "apply", [{ keyword: "marketing para clínicas", note: "Nota" }]);
  assert.equal(unmarked.ok, true);
  if (!unmarked.ok) return;
  assert.equal(unmarked.rows[0].outcome, "not_marked");
  assert.equal(db.writes().length, 0);
  assert.equal(resolveKeywordSubject(db.data.minerador_keywords[0].analise_semantica as Row).declared, false);

  const marked = await run(db, "apply", [{ keyword: "marketing para clínicas", note: "Nota" }], { declareExistingIds: ["k-plain"] });
  assert.equal(marked.ok, true);
  if (!marked.ok) return;
  assert.deepEqual(marked.declaredIds, ["k-plain"]);
  const row = db.data.minerador_keywords[0];
  assert.equal(row.lista_id, "lista-x", "a lista da existente é preservada");
  assert.equal(row.status, "aprovado", "o import não mexe no status; a assinatura faz o resto");
  const semantic = row.analise_semantica as Row;
  assert.equal(semantic.humano, "preservar");
  assert.equal(resolveKeywordSubject(semantic).note, "Nota");
  const update = db.log.find(entry => entry.op === "update");
  assert.ok(update?.filters.some(filter => filter.column === "id" && filter.value === "k-plain"));
  assert.ok(update?.filters.some(filter => filter.column === "brand_id" && filter.value === BRAND_A));
  assert.ok(update?.filters.some(filter => filter.kind === "is" && filter.column === "deleted_at" && filter.value === null));
});

test("existente já Assunto com nota diferente mantém o gravado, mesmo marcada", async () => {
  const db = fakeSupabase({ minerador_keywords: [keyword("k-diff", "SEO para clínicas", { analise_semantica: declared("Nota gravada") })] });
  const result = await run(db, "apply", [{ keyword: "SEO para clínicas", note: "Nota do arquivo" }], { declareExistingIds: ["k-diff"] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rows[0].classification, "existing_subject_different");
  assert.equal(result.rows[0].outcome, "kept");
  assert.equal(db.writes().length, 0);
  assert.equal(resolveKeywordSubject(db.data.minerador_keywords[0].analise_semantica as Row).note, "Nota gravada");
});

test("publicada pode ser declarada, se marcada, sem mexer em keyword, lista nem status", async () => {
  const db = fakeSupabase({ minerador_keywords: [keyword("k-pub", "SEO para clínicas", { status: "aprovado", lista_id: "lista-p", analise_semantica: published })] });
  const preview = await run(db, "preview", [{ keyword: "SEO para clínicas" }]);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.rows[0].classification, "published");
  assert.equal(preview.rows[0].published, true);

  const applied = await run(db, "apply", [{ keyword: "SEO para clínicas" }], { declareExistingIds: ["k-pub"] });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.deepEqual(applied.declaredIds, ["k-pub"]);
  const row = db.data.minerador_keywords[0];
  assert.equal(row.keyword, "SEO para clínicas");
  assert.equal(row.lista_id, "lista-p");
  assert.deepEqual((row.analise_semantica as Row).site_origin, published.site_origin);
  const update = db.log.find(entry => entry.op === "update");
  assert.deepEqual(Object.keys(update?.values || {}), ["analise_semantica"], "só analise_semantica é escrita");
});

test("destino fora do domínio da marca é recusado e nada é gravado; catálogo só informa", async () => {
  const db = fakeSupabase({
    minerador_keywords: [],
    brand_site_catalog_entries: [
      { marca_id: BRAND_A, normalized_url: "exemplo.com.br/servicos/seo", page_type: "service", title: "SEO para clínicas", h1: null },
      { marca_id: BRAND_B, normalized_url: "exemplo.com.br/servicos/trafego", page_type: "service", title: "Da outra marca", h1: null },
    ],
  });
  const result = await run(db, "apply", [
    { keyword: "fora do domínio", destinationUrl: "https://outro-site.com/landing" },
    { keyword: "sem https", destinationUrl: "http://exemplo.com.br/landing" },
    { keyword: "no catálogo", destinationUrl: `${SITE}/servicos/seo` },
    { keyword: "fora do catálogo", destinationUrl: `${SITE}/landing-nova` },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.rows.map(row => row.classification), ["invalid", "invalid", "new", "new"]);
  assert.match(result.rows[0].reason || "", /site da marca/);
  assert.deepEqual(result.rows.map(row => row.outcome), ["invalid", "invalid", "created", "created"]);
  assert.equal(db.data.minerador_keywords.length, 2);
  const catalogRead = db.log.find(entry => entry.table === "brand_site_catalog_entries");
  assert.equal(catalogRead?.columns, "normalized_url,page_type,title,h1");
  assert.ok(catalogRead?.filters.some(filter => filter.column === "marca_id" && filter.value === BRAND_A));
  const inCatalog = resolveKeywordSubject(db.data.minerador_keywords[0].analise_semantica as Row);
  const outCatalog = resolveKeywordSubject(db.data.minerador_keywords[1].analise_semantica as Row);
  assert.deepEqual(catalogRead?.filters.find(filter => filter.kind === "in")?.value, ["exemplo.com.br/servicos/seo", "exemplo.com.br/landing-nova"]);
  assert.equal(inCatalog.destinationCheck?.catalogPageType, "service");
  assert.equal(inCatalog.destinationCheck?.catalogTitle, "SEO para clínicas");
  assert.equal(outCatalog.destinationCheck?.catalogPageType, null);
  assert.equal(outCatalog.destinationCheck?.hostMatchesBrand, true, "fora do catálogo não bloqueia");
  assert.equal(outCatalog.destinationUrl, `${SITE}/landing-nova`);
});

test("marca sem site: o Assunto entra sem destino e a resposta diz por quê", async () => {
  const db = fakeSupabase({ minerador_keywords: [] });
  const result = await run(db, "preview", [{ keyword: "SEO para clínicas", destinationUrl: `${SITE}/seo` }], { brandSiteUrl: null });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rows[0].classification, "new");
  assert.equal(result.rows[0].destinationUrl, null);
  assert.ok(result.notices.includes(SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE));
});

test("importRequestId em curso é recusado na mesma instância; depois de terminar, é aceito", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const db = fakeSupabase({ minerador_keywords: [] }, { gate });
  const first = run(db, "apply", [{ keyword: "SEO para clínicas" }]);
  const second = await run(db, "apply", [{ keyword: "SEO para clínicas" }]);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, "IMPORT_REQUEST_IN_PROGRESS");
  const otherBrand = await run(fakeSupabase({ minerador_keywords: [] }), "preview", [{ keyword: "x" }]);
  assert.equal(otherBrand.ok, true, "a prévia não trava");
  release();
  const done = await first;
  assert.equal(done.ok, true);
  assert.equal(db.data.minerador_keywords.length, 1, "o envio recusado não criou duplicata");
  const again = await run(db, "apply", [{ keyword: "SEO para clínicas" }]);
  assert.equal(again.ok, true, "a trava é liberada ao terminar");
});

test("apply exige importRequestId e ator auth.users.id; e-mail e local-user são recusados", async () => {
  const db = fakeSupabase({ minerador_keywords: [] });
  const noRequest = await run(db, "apply", [{ keyword: "x" }], { importRequestId: null });
  assert.equal(noRequest.ok, false);
  if (!noRequest.ok) assert.equal(noRequest.code, "IMPORT_REQUEST_REQUIRED");
  for (const actorUserId of ["dono@exemplo.com.br", "local-user", ""]) {
    const refused = await run(db, "apply", [{ keyword: "x" }], { actorUserId });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.code, "ACTOR_REQUIRED");
  }
  assert.equal(db.log.length, 0, "recusa antes de qualquer leitura");
});

test("isolamento: a mesma frase em outra marca não casa, e id de outra marca marcado não é tocado", async () => {
  const db = fakeSupabase({
    minerador_keywords: [keyword("k-b", "SEO para clínicas", { brand_id: BRAND_B, analise_semantica: { marca: "b" } })],
  });
  const preview = await run(db, "preview", [{ keyword: "SEO para clínicas" }]);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.rows[0].classification, "new");
  assert.equal(preview.rows[0].keywordId, null);

  const applied = await run(db, "apply", [{ keyword: "SEO para clínicas" }], { declareExistingIds: ["k-b"] });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.createdIds.length, 1);
  const rowB = db.data.minerador_keywords.find(row => row.id === "k-b");
  assert.deepEqual(rowB?.analise_semantica, { marca: "b" });
  assert.equal(db.log.filter(entry => entry.op === "update").length, 0);
  for (const entry of db.log.filter(item => item.table === "minerador_keywords")) {
    if (entry.op === "insert") assert.equal(entry.values?.brand_id, BRAND_A);
    else assert.ok(entry.filters.some(filter => filter.column === "brand_id" && filter.value === BRAND_A), `${entry.op} sem brand_id`);
  }
});

test("lista padrão só vale se for da marca; a coluna lista resolve por nome", async () => {
  const lists = [
    { id: "lista-a", nome: "Clínicas", marca_id: BRAND_A },
    { id: "lista-a2", nome: "Serviços", marca_id: BRAND_A },
    { id: "lista-b", nome: "Da outra", marca_id: BRAND_B },
  ];
  const db = fakeSupabase({ minerador_keywords: [] });
  const result = await run(db, "apply", [
    { keyword: "sem lista no arquivo" },
    { keyword: "com lista no arquivo", listaReference: "Serviços" },
    { keyword: "lista que não existe", listaReference: "Inexistente" },
  ], { lists, defaultListaId: "lista-a" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(db.data.minerador_keywords.map(row => row.lista_id), ["lista-a", "lista-a2", null]);

  const other = fakeSupabase({ minerador_keywords: [] });
  await run(other, "apply", [{ keyword: "padrão de outra marca" }], { lists, defaultListaId: "lista-b" });
  assert.equal(other.data.minerador_keywords[0].lista_id, null);
});

test("marca com mais de 1000 vivas: a leitura pagina e a frase da segunda página é existente", async () => {
  const many: Row[] = [];
  for (let n = 0; n < 1000; n += 1) many.push(keyword(`k-${String(n).padStart(5, "0")}`, `keyword ${n}`));
  // Id depois de todas as outras na ordem: só aparece na segunda página.
  many.push(keyword("k-99999", "SEO para clínicas", { analise_semantica: { nicho: "Clínicas" } }));
  const db = fakeSupabase({ minerador_keywords: many }, { maxRows: 1000 });
  const preview = await run(db, "preview", [{ keyword: "SEO para clínicas" }]);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.rows[0].classification, "existing_without_subject");
  assert.equal(preview.rows[0].keywordId, "k-99999");
  const liveReads = db.log.filter(entry => entry.table === "minerador_keywords" && entry.op === "select" && entry.columns === SUBJECT_IMPORT_LIVE_COLUMNS);
  assert.equal(liveReads.length, 2, "duas páginas");

  const applied = await run(db, "apply", [{ keyword: "SEO para clínicas" }]);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.deepEqual(applied.createdIds, [], "a existente da segunda página não vira duplicata");
});

test("existente marcada cujo DNA não foi lido: nada é gravado e a linha falha com motivo", async () => {
  const db = fakeSupabase({
    minerador_keywords: [keyword("k-plain", "marketing para clínicas", { analise_semantica: { dna_origem: "logico_deterministico", nicho: "Clínicas" } })],
  }, { omitSemanticIds: ["k-plain"] });
  const applied = await run(db, "apply", [{ keyword: "marketing para clínicas" }], { declareExistingIds: ["k-plain"] });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.rows[0].outcome, "failed");
  assert.match(applied.rows[0].reason || "", /não foi possível ler o DNA atual/i);
  assert.equal(applied.failed, 1);
  assert.deepEqual(applied.declaredIds, []);
  assert.equal(db.writes().length, 0);
  assert.deepEqual(db.data.minerador_keywords[0].analise_semantica, { dna_origem: "logico_deterministico", nicho: "Clínicas" });
});
