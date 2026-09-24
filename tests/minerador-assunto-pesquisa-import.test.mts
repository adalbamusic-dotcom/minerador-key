import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendSubjectDiscoverySearch,
  importSubjectDiscoveryWithCore,
  readSubjectDiscoveryBlock,
  SUBJECT_DISCOVERY_APPROVAL_COLUMNS,
  SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS,
  SUBJECT_DISCOVERY_LIVE_COLUMNS,
  SUBJECT_DISCOVERY_REASONS,
  SUBJECT_DISCOVERY_SUBJECT_COLUMNS,
  SUBJECT_DISCOVERY_SUBJECT_REASONS,
  SubjectDiscoveryImportRequestSchema,
  type SubjectDiscoveryImportRequest,
  type SubjectDiscoverySearchEntry,
} from "../lib/minerador/subject-discovery-import.ts";
import { applyApproval, approvedPackageDiverged, approvedPackageSignature, type ApprovedPackageInput } from "../lib/minerador/approved-package.ts";

/**
 * PESQUISA POR ASSUNTO — IMPORT (SDD 2026-09-24, F1b.7, F1b.11 "Import").
 *
 * O banco é uma tabela em memória com a forma do `postgrest-js`: projeta as
 * colunas pedidas (com alias e caminho JSON `col->chave`), filtra por
 * eq/in/is, inclusive `is` num caminho JSON, e registra cada consulta, para o
 * teste provar o que foi lido (egress) e o que foi escrito. Nenhuma rede.
 */

type Row = Record<string, unknown>;
type Filter = { column: string; kind: "eq" | "in" | "is"; value: unknown };
type Recorded = { table: string; op: "select" | "insert" | "update"; columns: string; filters: Filter[]; values: Row | null };

const BRAND_A = "aaaaaaaa-0000-4000-8000-000000000001";
const BRAND_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const NOW = "2026-09-24T12:00:00+00:00";
const APPROVED_AT = "2026-09-20T10:00:00+00:00";
const SEARCH = "5eac0000-0000-4000-8000-000000000001";
const REQUEST = "9e000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "5b000000-0000-4000-8000-00000000000a";

/** Marca de "JSON null": o `->` do PostgREST devolve `null` JSON, que não é SQL NULL. */
const JSON_NULL = Symbol("json-null");

function readPath(row: Row, expression: string): unknown {
  const [base, ...path] = expression.split("->").map(part => part.trim());
  let value: unknown = row[base];
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !(key in (value as Row))) return null;
    value = (value as Row)[key];
    if (value === null) return JSON_NULL;
  }
  return value ?? null;
}

function project(row: Row, columns: string) {
  if (!columns || columns === "*") return structuredClone(row);
  return Object.fromEntries(columns.split(",").map(part => {
    const [alias, expression] = part.includes(":") ? part.split(":").map(value => value.trim()) : [part.trim().split("->").pop()!.trim(), part.trim()];
    const value = readPath(row, expression);
    return [alias, value === JSON_NULL ? null : structuredClone(value)];
  }));
}

type FakeOptions = {
  gate?: Promise<void>;
  insertError?: { code: string; message: string };
  onInsertError?: (rows: Row[]) => void;
  beforeUpdate?: (rows: Row[], filters: Filter[]) => void;
};

function fakeSupabase(initial: Row[], options: FakeOptions = {}) {
  const rows = initial.map(row => structuredClone(row));
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
        const current = readPath(row, column);
        if (kind === "eq") return current === value;
        if (kind === "in") return (value as unknown[]).includes(current);
        return current === value;
      });
    }
    function execute() {
      log.push(structuredClone(state));
      if (state.op === "insert") {
        if (options.insertError) {
          options.onInsertError?.(rows);
          return { data: null, error: options.insertError };
        }
        const row = { ...structuredClone(state.values!), id: `created-${nextId++}`, deleted_at: null };
        rows.push(row);
        const projected = project(row, state.columns);
        return { data: single || maybe ? projected : [projected], error: null };
      }
      if (state.op === "update") options.beforeUpdate?.(rows, state.filters);
      let target = rows.filter(matches);
      if (state.op === "update") {
        for (const row of target) Object.assign(row, structuredClone(state.values!));
        const projected = target.map(row => project(row, state.columns));
        return { data: state.columns ? projected : null, error: null };
      }
      if (ordered) target = [...target].sort((a, b) => String(a[ordered!]).localeCompare(String(b[ordered!])));
      if (range) target = target.slice(range[0], range[1] + 1);
      const projected = target.map(row => project(row, state.columns));
      return { data: single || maybe ? projected[0] ?? null : projected, error: null };
    }
    return query;
  }
  return {
    rows,
    log,
    reads: () => log.filter(entry => entry.op === "select"),
    writes: () => log.filter(entry => entry.op !== "select"),
    client: { from: (table: string) => builder(table) } as unknown as SupabaseClient,
  };
}

function keyword(id: string, text: string, extra: Row = {}): Row {
  return { id, keyword: text, brand_id: BRAND_A, status: "bruto", lista_id: null, deleted_at: null, volume_search: null, results_allintitle: null, analise_semantica: {}, ...extra };
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
    semantic: row.analise_semantica as Row,
  };
}

async function approved(id: string, text: string, status = "aprovado"): Promise<Row> {
  const base = keyword(id, text, { status, intent: "Informacional", volume_search: 320, results_allintitle: 12, kgr_score: 0.0375, lista_id: "lista-1", analise_semantica: { dna_origem: "logico_deterministico" } });
  return { ...base, analise_semantica: await applyApproval({ ...packageInput(base), approvedAt: APPROVED_AT, approvedBy: ACTOR }) };
}

const declaredSubject = { keyword_subject: { declared: true, note: "Para donos de clínica", destinationUrl: null, destinationCheck: null }, keyword_subject_actor: ACTOR, keyword_subject_at: NOW, keyword_subject_origin: "import", keyword_subject_history: [] };

function request(items: SubjectDiscoveryImportRequest["items"], extra: Partial<SubjectDiscoveryImportRequest> = {}): SubjectDiscoveryImportRequest {
  return SubjectDiscoveryImportRequestSchema.parse({ importRequestId: REQUEST, searchId: SEARCH, subjectPhrase: "SEO para clínicas", items, ...extra });
}

const candidate = (text: string, origins: string[] = ["labs_related"], evidence: string[] = []) => ({ keyword: text, origins, evidence }) as SubjectDiscoveryImportRequest["items"][number];

function run(supabase: ReturnType<typeof fakeSupabase>, body: SubjectDiscoveryImportRequest, brandId = BRAND_A, actorUserId = ACTOR) {
  return importSubjectDiscoveryWithCore({ brandId, actorUserId, supabase: supabase.client, request: body, now: NOW });
}

/* -------------------------------------------------------------------------- */

test("corpo: aceita o contrato e recusa métrica, marca, ator, origem desconhecida e mais de 600 itens", () => {
  const ok = SubjectDiscoveryImportRequestSchema.safeParse({ importRequestId: REQUEST, searchId: SEARCH, subjectKeywordId: null, subjectPhrase: "SEO para clínicas", items: [candidate("seo clinica")] });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.success && ok.data.items[0].evidence, []);

  const base = { importRequestId: REQUEST, searchId: SEARCH, subjectPhrase: "SEO para clínicas" };
  for (const metric of ["volume", "volumeSearch", "searchVolume", "cpc", "competition", "resultsAllintitle", "estimate"]) {
    const parsed = SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: [{ ...candidate("seo"), [metric]: 10 }] });
    assert.equal(parsed.success, false, metric);
  }
  for (const field of ["brandId", "brand_id", "actorId", "volume"]) {
    assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: [candidate("seo")], [field]: "x" }).success, false, field);
  }
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: [candidate("seo", ["google_ads"])] }).success, false, "origem fora da lista");
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: [candidate("seo", [])] }).success, false, "sem origem");
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: [candidate("seo", ["labs_ranked"], ["a", "b", "c", "d"])] }).success, false, "mais de 3 evidências");
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: [candidate("seo", ["labs_ranked"], ["x".repeat(161)])] }).success, false, "evidência longa");
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, subjectPhrase: "x".repeat(201), items: [candidate("seo")] }).success, false, "frase longa");
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, importRequestId: "abc", items: [candidate("seo")] }).success, false);
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: [] }).success, false);
  const many = (count: number) => Array.from({ length: count }, (_, index) => candidate(`keyword ${index}`));
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: many(600) }).success, true);
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...base, items: many(601) }).success, false);
});

test("nova vira bruto, sem lista, sem métrica e com o bloco; o insert devolve só o id", async () => {
  const supabase = fakeSupabase([]);
  const result = await run(supabase, request([candidate("SEO odontológico", ["labs_ranked", "ads_keyword_seed", "labs_ranked"], ["ranqueia em #7 em exemplo.com/pagina", "  duas\nlinhas  "])]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.counts.created, 1);
  assert.equal(result.rows[0].outcome, "created");
  const inserts = supabase.writes().filter(entry => entry.op === "insert");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].columns, "id");
  const payload = inserts[0].values!;
  assert.equal(payload.status, "bruto");
  assert.equal(payload.lista_id, null);
  assert.equal(payload.brand_id, BRAND_A);
  assert.equal(payload.volume_search, null);
  assert.equal(payload.results_allintitle, null);
  assert.equal("volume_source" in payload, false, "volume_source fica no padrão do banco");
  assert.deepEqual(Object.keys(payload).sort(), ["analise_semantica", "brand_id", "keyword", "lista_id", "results_allintitle", "status", "volume_search"]);
  assert.deepEqual(payload.analise_semantica, {
    subject_discovery: {
      version: 1,
      searches: [{
        searchId: SEARCH,
        importRequestId: REQUEST,
        importedAt: NOW,
        actorId: ACTOR,
        subjectKeywordId: null,
        subjectPhrase: "SEO para clínicas",
        origins: ["ads_keyword_seed", "labs_ranked"],
        evidence: ["ranqueia em #7 em exemplo.com/pagina", "duas linhas"],
        provenanceVerified: false,
      }],
      subjectKeywordIds: [],
    },
  });
  assert.equal(result.rows[0].keywordId, supabase.rows[0].id);
});

test("existente sem registro de aprovação recebe a busca no bloco, com update condicionado, e preserva o resto", async () => {
  const existing = keyword("kw-1", "seo para dentistas", { lista_id: "lista-9", analise_semantica: { dna_origem: "logico_deterministico", humanDecision: "preserve" } });
  const supabase = fakeSupabase([existing]);
  const result = await run(supabase, request([candidate("SEO para Dentistas", ["labs_category"])]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.rows[0].outcome, "recorded");
  assert.equal(result.rows[0].keywordId, "kw-1");
  const updates = supabase.writes().filter(entry => entry.op === "update");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].filters, [
    { column: "id", kind: "eq", value: "kw-1" },
    { column: "brand_id", kind: "eq", value: BRAND_A },
    { column: "deleted_at", kind: "is", value: null },
    { column: "analise_semantica->aprovacao", kind: "is", value: null },
    { column: "status", kind: "eq", value: "bruto" },
  ]);
  assert.equal(updates[0].columns, "id", "o update pede o id de volta para contar as linhas afetadas");
  const semantic = supabase.rows[0].analise_semantica as Row;
  assert.equal(semantic.humanDecision, "preserve");
  assert.equal(semantic.dna_origem, "logico_deterministico");
  assert.equal(readSubjectDiscoveryBlock(semantic).searches[0].searchId, SEARCH);
  assert.equal(supabase.rows[0].lista_id, "lista-9");
  assert.equal(supabase.rows[0].status, "bruto");
});

test("existente com registro de aprovação (aprovada, em revisão, publicada) não é escrita e a assinatura fica idêntica", async () => {
  const rows = [await approved("kw-a", "clínica de estética"), await approved("kw-r", "estética facial", "em_revisao"), await approved("kw-p", "botox preço", "publicado")];
  const before = structuredClone(rows);
  const signatures = rows.map(row => approvedPackageSignature(packageInput(row)));
  const supabase = fakeSupabase(rows);
  const result = await run(supabase, request([candidate("Clínica de Estética"), candidate("estética facial"), candidate("botox preco")]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.rows.map(row => row.outcome), ["not_recorded_approval", "not_recorded_approval", "not_recorded_approval"]);
  assert.equal(result.rows[0].reason, SUBJECT_DISCOVERY_REASONS.not_recorded_approval);
  assert.deepEqual(result.notAffected.map(row => row.keywordId), ["kw-a", "kw-r", "kw-p"]);
  assert.equal(result.counts.notAffected, 3);
  assert.equal(supabase.writes().length, 0);
  assert.deepEqual(supabase.rows, before);
  supabase.rows.forEach((row, index) => {
    assert.equal(approvedPackageSignature(packageInput(row)), signatures[index]);
    assert.equal(approvedPackageDiverged(packageInput(row)), false);
  });
  // Nenhuma leitura da coluna inteira para quem não é elegível.
  assert.equal(supabase.reads().some(entry => entry.columns === SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS && (entry.filters.find(filter => filter.kind === "in")?.value as unknown[] || []).length > 0), false);
});

test("aprovação simulada entre a leitura e a escrita: 0 linhas afetadas, a aprovação fica e a resposta diz 'alterada durante o envio'", async () => {
  const target = keyword("kw-1", "seo para clínicas médicas", { intent: "Informacional", volume_search: 90, results_allintitle: 4, analise_semantica: { dna_origem: "logico_deterministico" } });
  let approvedSemantic: Row | null = null;
  const supabase = fakeSupabase([target], {
    beforeUpdate: rows => {
      const row = rows.find(candidateRow => candidateRow.id === "kw-1")!;
      row.status = "aprovado";
      row.analise_semantica = approvedSemantic;
    },
  });
  approvedSemantic = await applyApproval({ ...packageInput(target), approvedAt: APPROVED_AT, approvedBy: ACTOR });
  const approvedRow = { ...target, status: "aprovado", analise_semantica: approvedSemantic };
  const signature = approvedPackageSignature(packageInput(approvedRow));

  const result = await run(supabase, request([candidate("seo para clínicas médicas")]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.rows[0].outcome, "not_recorded_changed");
  assert.equal(result.rows[0].reason, SUBJECT_DISCOVERY_REASONS.not_recorded_changed);
  assert.deepEqual(result.notAffected.map(row => row.keywordId), ["kw-1"]);
  const after = supabase.rows[0];
  assert.deepEqual((after.analise_semantica as Row).aprovacao, (approvedSemantic as Row).aprovacao, "a aprovação não foi apagada");
  assert.equal("subject_discovery" in (after.analise_semantica as Row), false);
  assert.equal(approvedPackageSignature(packageInput(after)), signature);
  assert.equal(approvedPackageDiverged(packageInput(after)), false);
});

test("status mudado entre a leitura e a escrita também não grava", async () => {
  const supabase = fakeSupabase([keyword("kw-1", "seo local")], {
    beforeUpdate: rows => { rows[0].status = "rejeitado"; },
  });
  const result = await run(supabase, request([candidate("seo local")]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.rows[0].outcome, "not_recorded_changed");
  assert.equal("subject_discovery" in (supabase.rows[0].analise_semantica as Row), false);
});

test("acima de 50 elegíveis, as excedentes voltam sem escrita e com o motivo; a coluna inteira só das 50", async () => {
  const rows = Array.from({ length: 55 }, (_, index) => keyword(`kw-${String(index).padStart(2, "0")}`, `keyword existente ${index}`));
  const supabase = fakeSupabase(rows);
  const result = await run(supabase, request(rows.map(row => candidate(String(row.keyword)))));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.counts.recorded, 50);
  const limited = result.rows.filter(row => row.outcome === "not_recorded_limit");
  assert.deepEqual(limited.map(row => row.index), [50, 51, 52, 53, 54]);
  assert.equal(limited[0].reason, SUBJECT_DISCOVERY_REASONS.not_recorded_limit);
  assert.deepEqual(result.notAffected.map(row => row.index), [50, 51, 52, 53, 54]);
  assert.equal(supabase.writes().length, 50);
  const fullReads = supabase.reads().filter(entry => entry.columns === SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS);
  const fullIds = fullReads.flatMap(entry => entry.filters.find(filter => filter.kind === "in")?.value as string[]);
  assert.equal(fullIds.length, 50);
  assert.equal(fullIds.includes("kw-50"), false);
  for (const index of [50, 51, 52, 53, 54]) assert.equal("subject_discovery" in (supabase.rows[index].analise_semantica as Row), false);
});

test("janela: searches guarda 5 e subjectKeywordIds preserva, até 10, os ids distintos que saíram da janela", () => {
  const entry = (index: number, subjectKeywordId: string | null): SubjectDiscoverySearchEntry => ({
    searchId: `search-${index}`, importRequestId: `request-${index}`, importedAt: NOW, actorId: ACTOR, subjectKeywordId,
    subjectPhrase: `frase ${index}`, origins: ["labs_related"], evidence: [], provenanceVerified: false,
  });
  let semantic: Row = { outra: "chave" };
  for (let index = 1; index <= 6; index += 1) semantic = appendSubjectDiscoverySearch(semantic, entry(index, `subject-${index}`)).semantic;
  let block = readSubjectDiscoveryBlock(semantic);
  assert.deepEqual(block.searches.map(search => search.searchId), ["search-2", "search-3", "search-4", "search-5", "search-6"]);
  assert.deepEqual(block.subjectKeywordIds, ["subject-1", "subject-2", "subject-3", "subject-4", "subject-5", "subject-6"], "subject-1 saiu da janela mas continua no sinal");
  assert.equal(semantic.outra, "chave");

  for (let index = 7; index <= 11; index += 1) semantic = appendSubjectDiscoverySearch(semantic, entry(index, `subject-${index}`)).semantic;
  block = readSubjectDiscoveryBlock(semantic);
  assert.equal(block.subjectKeywordIds.length, 10);
  assert.equal(block.subjectKeywordIds.includes("subject-1"), false, "acima de 10, o mais antigo sai");
  assert.equal(block.subjectKeywordIds.at(-1), "subject-11");

  // Busca sem Assunto não mexe no sinal; id repetido não duplica.
  const before = block.subjectKeywordIds;
  semantic = appendSubjectDiscoverySearch(semantic, entry(12, null)).semantic;
  semantic = appendSubjectDiscoverySearch(semantic, entry(13, "subject-5")).semantic;
  block = readSubjectDiscoveryBlock(semantic);
  assert.equal(block.subjectKeywordIds.length, 10);
  assert.equal(new Set(block.subjectKeywordIds).size, 10);
  assert.deepEqual(new Set(block.subjectKeywordIds), new Set(before));

  // A mesma searchId não regrava.
  const again = appendSubjectDiscoverySearch(semantic, entry(13, "subject-9"));
  assert.equal(again.changed, false);
  assert.deepEqual(again.semantic, semantic);
});

test("subjectKeywordId validado: mesma marca, viva e declarada, com leitura estreita", async () => {
  const supabase = fakeSupabase([keyword(SUBJECT_ID, "SEO para clínicas", { analise_semantica: declaredSubject })]);
  const result = await run(supabase, request([candidate("seo odontologico")], { subjectKeywordId: SUBJECT_ID }));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.subject, { keywordId: SUBJECT_ID, status: "validated", reason: null });
  const subjectRead = supabase.reads().find(entry => entry.columns === SUBJECT_DISCOVERY_SUBJECT_COLUMNS)!;
  assert.deepEqual(subjectRead.filters, [
    { column: "id", kind: "eq", value: SUBJECT_ID },
    { column: "brand_id", kind: "eq", value: BRAND_A },
    { column: "deleted_at", kind: "is", value: null },
  ]);
  const created = supabase.rows.find(row => row.keyword === "seo odontologico")!;
  const block = readSubjectDiscoveryBlock(created.analise_semantica);
  assert.equal(block.searches[0].subjectKeywordId, SUBJECT_ID);
  assert.deepEqual(block.subjectKeywordIds, [SUBJECT_ID]);
});

test("subjectKeywordId de outra marca ou inexistente vira null com o mesmo motivo; não declarado vira null com o motivo da retirada", async () => {
  const foreign = fakeSupabase([{ ...keyword(SUBJECT_ID, "SEO para clínicas", { analise_semantica: declaredSubject }), brand_id: BRAND_B }]);
  const foreignResult = await run(foreign, request([candidate("seo odontologico")], { subjectKeywordId: SUBJECT_ID }));
  const missing = fakeSupabase([]);
  const missingResult = await run(missing, request([candidate("seo odontologico")], { subjectKeywordId: SUBJECT_ID }));
  assert.ok(foreignResult.ok && missingResult.ok);
  if (!foreignResult.ok || !missingResult.ok) return;
  assert.deepEqual(foreignResult.subject, { keywordId: null, status: "not_found", reason: SUBJECT_DISCOVERY_SUBJECT_REASONS.not_found });
  assert.deepEqual(missingResult.subject, foreignResult.subject);
  const foreignCreated = foreign.rows.find(row => row.keyword === "seo odontologico")!;
  assert.equal(foreignCreated.brand_id, BRAND_A);
  assert.equal(readSubjectDiscoveryBlock(foreignCreated.analise_semantica).searches[0].subjectKeywordId, null);
  assert.deepEqual(readSubjectDiscoveryBlock(foreignCreated.analise_semantica).subjectKeywordIds, []);

  const withdrawn = fakeSupabase([keyword(SUBJECT_ID, "SEO para clínicas", { analise_semantica: { ...declaredSubject, keyword_subject: null } })]);
  const withdrawnResult = await run(withdrawn, request([candidate("seo odontologico")], { subjectKeywordId: SUBJECT_ID }));
  assert.ok(withdrawnResult.ok);
  if (!withdrawnResult.ok) return;
  assert.deepEqual(withdrawnResult.subject, { keywordId: null, status: "not_declared", reason: SUBJECT_DISCOVERY_SUBJECT_REASONS.not_declared });
  assert.equal(readSubjectDiscoveryBlock(withdrawn.rows.find(row => row.keyword === "seo odontologico")!.analise_semantica).searches[0].subjectKeywordId, null);
});

test("a frase declarada Assunto no mesmo envio não entra como item e não recebe o bloco", async () => {
  const subjectRow = keyword(SUBJECT_ID, "SEO para clínicas", { analise_semantica: declaredSubject });
  const supabase = fakeSupabase([subjectRow]);
  const result = await run(supabase, request([candidate("seo para clinicas"), candidate("SEO  para  Clínicas"), candidate("seo clinica")], { subjectKeywordId: SUBJECT_ID }));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.rows.map(row => row.outcome), ["skipped_subject", "duplicate", "created"]);
  assert.equal(result.rows[0].keywordId, SUBJECT_ID);
  assert.equal(result.counts.skippedSubject, 1);
  assert.deepEqual(supabase.rows.find(row => row.id === SUBJECT_ID), subjectRow, "o Assunto não é escrito");
  assert.equal(supabase.writes().filter(entry => entry.op === "update").length, 0);

  // Sem Assunto no envio, a frase é uma candidata como as outras.
  const plain = fakeSupabase([]);
  const plainResult = await run(plain, request([candidate("seo para clinicas")]));
  assert.ok(plainResult.ok);
  if (!plainResult.ok) return;
  assert.equal(plainResult.rows[0].outcome, "created");
});

test("dedupe por normalizeKeyword: acento, caixa e espaços são a mesma keyword", async () => {
  const supabase = fakeSupabase([]);
  const result = await run(supabase, request([candidate("Harmonização Facial"), candidate("harmonizacao  facial")]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.rows.map(row => row.outcome), ["created", "duplicate"]);
  assert.equal(supabase.rows.length, 1);
});

test("a mesma searchId reimportada não escreve nada", async () => {
  const supabase = fakeSupabase([keyword("kw-1", "seo local")]);
  const first = await run(supabase, request([candidate("seo local"), candidate("seo regional")]));
  assert.ok(first.ok);
  const writesAfterFirst = supabase.writes().length;
  const snapshot = structuredClone(supabase.rows);
  const second = await run(supabase, request([candidate("seo local"), candidate("seo regional")], { importRequestId: "9e000000-0000-4000-8000-000000000002" }));
  assert.ok(second.ok);
  if (!second.ok) return;
  assert.deepEqual(second.rows.map(row => row.outcome), ["already_recorded", "already_recorded"]);
  assert.equal(second.rows[0].reason, SUBJECT_DISCOVERY_REASONS.already_recorded);
  assert.equal(supabase.writes().length, writesAfterFirst);
  assert.deepEqual(supabase.rows, snapshot);
});

test("importRequestId em curso é recusado; terminado o envio, a trava sai", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const supabase = fakeSupabase([], { gate });
  const first = run(supabase, request([candidate("seo local")]));
  const second = await run(supabase, request([candidate("seo local")]));
  assert.deepEqual(second.ok ? null : second.code, "IMPORT_REQUEST_IN_PROGRESS");
  release();
  const firstResult = await first;
  assert.ok(firstResult.ok);
  const third = await run(supabase, request([candidate("seo local")]));
  assert.ok(third.ok, "a trava é liberada no fim");
});

test("isolamento: keyword de outra marca não casa, não é lida inteira nem escrita; toda leitura filtra a marca da rota", async () => {
  const foreign = { ...keyword("kw-b", "seo local"), brand_id: BRAND_B, analise_semantica: { segredo: "marca B" } };
  const supabase = fakeSupabase([foreign]);
  const result = await run(supabase, request([candidate("seo local")]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.rows[0].outcome, "created");
  assert.deepEqual(supabase.rows.find(row => row.id === "kw-b"), foreign);
  for (const read of supabase.reads()) {
    assert.ok(read.filters.some(filter => filter.column === "brand_id" && filter.value === BRAND_A), `leitura sem a marca: ${read.columns}`);
  }
  for (const write of supabase.writes()) assert.equal(write.values?.brand_id ?? BRAND_A, BRAND_A);
});

test("egress: nada de select('*'); vivas por id,keyword; aprovação por caminho JSON; coluna inteira só das elegíveis", async () => {
  const rows = [keyword("kw-1", "seo local"), await approved("kw-2", "seo regional")];
  const supabase = fakeSupabase(rows);
  await run(supabase, request([candidate("seo local"), candidate("seo regional"), candidate("seo nacional")]));
  const columns = supabase.reads().map(entry => entry.columns);
  assert.equal(columns.includes("*"), false);
  assert.equal(columns.includes(""), false);
  assert.ok(columns.includes(SUBJECT_DISCOVERY_LIVE_COLUMNS));
  assert.equal(SUBJECT_DISCOVERY_LIVE_COLUMNS, "id,keyword");
  assert.equal(SUBJECT_DISCOVERY_APPROVAL_COLUMNS, "id,status,aprovacao:analise_semantica->aprovacao");
  const approvalRead = supabase.reads().find(entry => entry.columns === SUBJECT_DISCOVERY_APPROVAL_COLUMNS)!;
  assert.deepEqual(approvalRead.filters.find(filter => filter.kind === "in")?.value, ["kw-1", "kw-2"]);
  const fullRead = supabase.reads().find(entry => entry.columns === SUBJECT_DISCOVERY_ELIGIBLE_COLUMNS)!;
  assert.deepEqual(fullRead.filters.find(filter => filter.kind === "in")?.value, ["kw-1"], "a aprovada não tem a coluna inteira lida");
  assert.equal(supabase.reads().some(entry => entry.columns === SUBJECT_DISCOVERY_SUBJECT_COLUMNS), false, "sem subjectKeywordId, nenhuma leitura do Assunto");
});

test("corrida no insert: outro envio criou a mesma frase; a linha volta como existente, sem regravar", async () => {
  const supabase = fakeSupabase([], {
    insertError: { code: "23505", message: "duplicate" },
    onInsertError: rows => { if (!rows.some(row => row.id === "kw-race")) rows.push(keyword("kw-race", "seo local")); },
  });
  const result = await run(supabase, request([candidate("seo local")]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.rows[0].outcome, "not_recorded_concurrent");
  assert.equal(result.rows[0].keywordId, "kw-race");
  assert.deepEqual(result.notAffected.map(row => row.keywordId), ["kw-race"]);
  assert.equal(supabase.writes().filter(entry => entry.op === "update").length, 0);
});

test("falha do insert sem corrida vira 'failed' com código sanitizado", async () => {
  const supabase = fakeSupabase([], { insertError: { code: "42501", message: "permission denied" } });
  const result = await run(supabase, request([candidate("seo local")]));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.rows[0].outcome, "failed");
  assert.match(result.rows[0].reason || "", /42501/);
  assert.equal(result.counts.failed, 1);
});

test("egress: muitos inserts falhando sem corrida não releem a marca; com corrida, relê uma vez só", async () => {
  const items = Array.from({ length: 5 }, (_, index) => candidate(`keyword ${index}`));
  const denied = fakeSupabase([], { insertError: { code: "42501", message: "permission denied" } });
  const deniedResult = await run(denied, request(items));
  assert.ok(deniedResult.ok);
  if (!deniedResult.ok) return;
  assert.equal(deniedResult.counts.failed, 5);
  assert.equal(denied.reads().filter(entry => entry.columns === SUBJECT_DISCOVERY_LIVE_COLUMNS).length, 1, "só a leitura inicial das vivas");

  const raced = fakeSupabase([], {
    insertError: { code: "23505", message: "duplicate" },
    onInsertError: rows => { if (!rows.some(row => row.id === "kw-race-0")) rows.push(keyword("kw-race-0", "keyword 0"), keyword("kw-race-3", "keyword 3")); },
  });
  const racedResult = await run(raced, request(items));
  assert.ok(racedResult.ok);
  if (!racedResult.ok) return;
  assert.equal(raced.reads().filter(entry => entry.columns === SUBJECT_DISCOVERY_LIVE_COLUMNS).length, 2, "a leitura inicial e uma releitura, não uma por falha");
  assert.deepEqual(racedResult.rows.map(row => row.outcome), ["not_recorded_concurrent", "failed", "failed", "not_recorded_concurrent", "failed"]);
  assert.deepEqual(racedResult.rows.filter(row => row.outcome === "not_recorded_concurrent").map(row => row.keywordId), ["kw-race-0", "kw-race-3"]);
});

test("ator precisa ser auth.users.id; marca vazia é recusada; nada é lido", async () => {
  const supabase = fakeSupabase([]);
  const noActor = await run(supabase, request([candidate("seo")]), BRAND_A, "local-user");
  assert.deepEqual(noActor.ok ? null : noActor.code, "ACTOR_REQUIRED");
  const noBrand = await run(supabase, request([candidate("seo")]), "  ");
  assert.deepEqual(noBrand.ok ? null : noBrand.code, "BRAND_REQUIRED");
  assert.equal(supabase.log.length, 0);
});
