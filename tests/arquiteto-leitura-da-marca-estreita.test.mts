import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARQUITETO_KEYWORD_ID_BATCH,
  ARQUITETO_KEYWORD_INDEX_COLUMNS,
  ARQUITETO_KEYWORD_ROW_COLUMNS,
  ARQUITETO_PATCH_KEYWORD_KGR_COLUMNS,
  ARQUITETO_PATCH_KEYWORD_STATUS_COLUMNS,
  architectPatchKeywordReadInput,
  createMineradorArquitetoHandoff,
  loadCanonicalArquitetoWorkspace,
  readArchitectPatchKeywords,
} from "../lib/server/arquiteto-workspace.ts";
import type { PipelineContext } from "../lib/server/pipeline-runtime.ts";

/**
 * LEITURA DA MARCA ESTREITA NO ARQUITETO — SDD de egress, E8 (parte localizada).
 *
 * Antes: a montagem do Arquiteto lia `select("*")` de TODAS as keywords vivas
 * da marca, com `analise_semantica` inteiro (464 a 747 kB por chamada), o
 * handoff lia a marca inteira duas vezes para usar só os ids pedidos, e o
 * PATCH da working copy lia `analise_semantica` da marca inteira para usar o
 * status de poucos itens.
 *
 * Este arquivo roda com `--conditions=react-server` e o registro de TS
 * (`scripts/node-ts-register.mjs`), como `test:serp-cache`: o módulo começa
 * com `import "server-only"` e usa o alias `@/`. O banco é uma tabela em
 * memória atrás de um cliente com a forma do `postgrest-js`; nenhuma rede.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const OTHER_BRAND = "4a737e74-e35d-4a49-8284-87b3f964e495";
const ACTOR = "11111111-1111-4111-8111-111111111111";

/** Colunas reais de `minerador_keywords` (information_schema, 2026-09-23). */
const KEYWORD_SCHEMA = ["id", "keyword", "location", "results_allintitle", "volume_search", "kgr_score", "intent", "status", "created_at", "lista_id", "analise_semantica", "volume_source", "brand_id", "deleted_at", "purge_after", "deleted_by"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/* ------------------------------ banco em memória ----------------------------- */

type Row = Record<string, unknown>;
type Filter = { column: string; kind: "eq" | "is" | "in"; value: unknown };
type Reply = { data: unknown; error: { code?: string; message?: string } | null };
type Logged = { table: string; op: string; columns: string; filters: Filter[] };

class Query {
  op = "select";
  columns = "*";
  filters: Filter[] = [];
  single = false;
  readonly db: FakeDb;
  readonly table: string;
  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }
  select(columns: string) { this.columns = columns; return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, kind: "eq", value }); return this; }
  is(column: string, value: unknown) { this.filters.push({ column, kind: "is", value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ column, kind: "in", value: [...value] }); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.single = true; return this; }
  upsert() { this.op = "upsert"; return this; }
  update() { this.op = "update"; return this; }
  then<A, B = never>(resolve: (value: Reply) => A, reject?: (reason: unknown) => B) {
    return Promise.resolve().then(() => this.db.run(this)).then(resolve, reject);
  }
}

class FakeDb {
  readonly tables: Record<string, Row[]>;
  readonly log: Logged[] = [];
  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }
  from(table: string) { return new Query(this, table); }
  run(query: Query): Reply {
    this.log.push({ table: query.table, op: query.op, columns: query.columns, filters: query.filters });
    if (query.op !== "select") return { data: null, error: null };
    // O PostgREST recusa a consulta inteira quando um valor não cabe no uuid.
    for (const filter of query.filters) {
      if (filter.kind === "in" && filter.column === "id" && (filter.value as unknown[]).some(value => !UUID.test(String(value)))) {
        return { data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } };
      }
    }
    const requested = query.columns === "*" ? null : query.columns.split(",").map(column => column.trim());
    if (query.table === "minerador_keywords" && requested) {
      const unknown = requested.find(column => !KEYWORD_SCHEMA.includes(column));
      if (unknown) return { data: null, error: { code: "42703", message: `column minerador_keywords.${unknown} does not exist` } };
    }
    const rows = (this.tables[query.table] || []).filter(row => query.filters.every(filter => {
      if (filter.kind === "eq") return row[filter.column] === filter.value;
      if (filter.kind === "is") return (row[filter.column] ?? null) === filter.value;
      // `id` é uuid: o Postgres compara sem diferenciar caixa.
      if (filter.column === "id") return (filter.value as unknown[]).some(value => String(value).toLowerCase() === String(row.id).toLowerCase());
      return (filter.value as unknown[]).includes(row[filter.column]);
    }));
    const projected = rows.map(row => requested
      ? Object.fromEntries(requested.map(column => [column, row[column] ?? null]))
      : structuredClone(row));
    if (query.single) return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
  }
  keywordReads() {
    return this.log.filter(entry => entry.table === "minerador_keywords" && entry.op === "select");
  }
}

function contextFor(db: FakeDb): PipelineContext {
  return {
    actorUserId: ACTOR,
    brandId: BRAND,
    module: "arquiteto",
    action: "view",
    permissions: ["arquiteto:view"],
    authorizationSource: "canonical_actor_rpc",
    supabase: db as unknown as PipelineContext["supabase"],
  };
}

/* --------------------------------- fixtures -------------------------------- */

const PESADO = { intencao: "Informativa", serp: { itens: Array.from({ length: 40 }, (_, index) => ({ posicao: index + 1, titulo: `resultado ${index}` })) } };

function keywordRow(n: number, overrides: Row = {}): Row {
  return {
    id: uuid(n),
    keyword: `keyword ${n}`,
    location: "Brasil",
    results_allintitle: 10 + n,
    volume_search: 100 * n,
    kgr_score: 0.1,
    intent: "Informativo",
    status: "aprovado",
    created_at: "2026-09-20T10:00:00+00:00",
    lista_id: uuid(900),
    analise_semantica: structuredClone(PESADO),
    volume_source: "google_ads",
    brand_id: BRAND,
    deleted_at: null,
    purge_after: null,
    deleted_by: null,
    ...overrides,
  };
}

function workflowRow(n: number, subjectId: string, overrides: Row = {}): Row {
  return {
    id: uuid(500 + n),
    marca_id: BRAND,
    subject_type: "keyword",
    subject_id: subjectId,
    article_id: null,
    stage: "architect",
    state: "received",
    source_entity_id: subjectId,
    source_version_id: null,
    source_content_hash: null,
    payload: {},
    lock_version: 1,
    created_at: "2026-09-21T10:00:00+00:00",
    updated_at: "2026-09-21T10:00:00+00:00",
    ...overrides,
  };
}

function baseTables(): Record<string, Row[]> {
  return {
    minerador_keywords: [
      keywordRow(1),
      keywordRow(2),
      keywordRow(3, { status: "novo" }),
      keywordRow(4, { status: "publicado" }),
      keywordRow(5, { deleted_at: "2026-09-22T10:00:00+00:00" }),
      keywordRow(6, { brand_id: OTHER_BRAND }),
    ],
    editorial_workflow_items: [
      workflowRow(1, uuid(1)),
      workflowRow(2, uuid(4)),
      workflowRow(3, uuid(2), { state: "blocked" }),
      workflowRow(4, uuid(6), { marca_id: OTHER_BRAND }),
    ],
    editorial_artifact_versions: [],
    marcas: [{ id: BRAND, silos_existentes: [] }],
  };
}

function withoutSemantic(row: Row) {
  const { analise_semantica: _removed, ...rest } = row;
  return rest;
}

function byId(rows: readonly Row[]) {
  return [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

/* --------------------------- forma das leituras ---------------------------- */

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const serverSource = stripComments(readFileSync(new URL("../lib/server/arquiteto-workspace.ts", import.meta.url), "utf8"));
const routeSource = stripComments(readFileSync(new URL("../app/api/arquiteto/workspace/route.ts", import.meta.url), "utf8"));

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `trecho ${start} → ${end} não encontrado`);
  return source.slice(from, to);
}

test("índice = todas as colunas de minerador_keywords menos analise_semantica; linha inteira = índice + analise_semantica", () => {
  const index = ARQUITETO_KEYWORD_INDEX_COLUMNS.split(",");
  assert.deepEqual([...index].sort(), KEYWORD_SCHEMA.filter(column => column !== "analise_semantica").sort());
  assert.ok(!index.includes("analise_semantica"));
  assert.equal(ARQUITETO_KEYWORD_ROW_COLUMNS, `${ARQUITETO_KEYWORD_INDEX_COLUMNS},analise_semantica`);
  assert.equal(ARQUITETO_PATCH_KEYWORD_STATUS_COLUMNS, "id,status");
  assert.equal(ARQUITETO_PATCH_KEYWORD_KGR_COLUMNS, "id,status,kgr_score,analise_semantica");
  assert.equal(ARQUITETO_KEYWORD_ID_BATCH, 100);
});

test("o servidor do Arquiteto não lê minerador_keywords com select('*') e sempre filtra a marca", () => {
  assert.doesNotMatch(serverSource, /from\("minerador_keywords"\)\.select\("\*"\)/);
  const reads = serverSource.match(/from\("minerador_keywords"\)[^;]*;/g) || [];
  assert.equal(reads.length, 4, "índice, linha inteira da marca, linha inteira por ids e PATCH");
  for (const read of reads) assert.match(read, /\.eq\("brand_id", context\.brandId\)/);
  // Só a leitura do PATCH fica sem `deleted_at`, como sempre foi.
  assert.equal(reads.filter(read => read.includes('.is("deleted_at", null)')).length, 3);
  assert.equal(reads.filter(read => read.includes('.in("id", batch)')).length, 2);
});

test("a montagem usa o índice por padrão e a linha inteira só das recebidas", () => {
  const load = block(serverSource, "export async function loadCanonicalArquitetoWorkspace", "export async function createMineradorArquitetoHandoff");
  assert.match(load, /fullKeywordDetail \? listBrandKeywords\(context\) : listBrandKeywordIndex\(context\)/);
  assert.match(load, /listBrandKeywordsByIds\(context, receivedKeywordIdsOf\(rows\)\)/);
});

test("o handoff filtra os ids pedidos no banco e não lê mais a marca inteira", () => {
  const prepare = block(serverSource, "async function prepareCanonicalHandoff", "async function persistCanonicalHandoff");
  assert.match(prepare, /listBrandKeywordsByIds\(context, \[\.\.\.requested\]\)/);
  assert.doesNotMatch(prepare, /listBrandKeywords\(|listBrandKeywordIndex\(|allKeywords/);
  assert.match(prepare, /keywords\.length !== requested\.size/);
  assert.match(prepare, /"NOT_AUTHORIZED"[^)]*403/);
});

test("o PATCH não lê minerador_keywords da marca inteira na rota", () => {
  assert.doesNotMatch(routeSource, /from\("minerador_keywords"\)/);
  const patch = block(routeSource, "export async function PATCH", "for (const update of parsed.updates || [])");
  assert.ok(patch.indexOf("readArchitectPatchKeywords(") > 0, "a leitura continua antes do laço de gravação");
  // O pedido de leitura sai da função testada abaixo, com todos os updates.
  assert.match(patch, /readArchitectPatchKeywords\(context, architectPatchKeywordReadInput\(parsed\.updates \|\| \[\]\)\)/);
});

test("o GET só reconhece keywordDetail=full e ignora outro valor em vez de responder 400", () => {
  const schema = block(routeSource, "const QuerySchema", ";");
  assert.doesNotMatch(schema, /keywordDetail/);
  assert.match(routeSource, /searchParams\.get\("keywordDetail"\) === "full" \? "full" as const : undefined/);
  const get = block(routeSource, "export async function GET", "export async function PATCH");
  assert.match(get, /loadCanonicalArquitetoWorkspace\(context, \{ keywordDetail: keywordDetailOf\(searchParams\) \}\)/);
});

test("o bootstrap do cliente não grava o índice estreito nas fontes de recuperação", () => {
  const clientSource = stripComments(readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"));
  const writes = clientSource.match(/setDatabaseSources\(current => \(\{[^}]*\}\)\)/g) || [];
  assert.ok(writes.length >= 2, "bootstrap e recarga de silos");
  for (const write of writes) assert.doesNotMatch(write, /keywords:/);
  // A única origem de `keywords` das fontes é a leitura com detalhe completo.
  const sources = block(clientSource, "const readArchitectDatabaseSources = async", "const fetchMasterList");
  assert.match(sources, /loadCanonicalArquitetoWorkspace\(selectedBrandId, \{ keywordDetail: "full" \}\)/);
  assert.match(sources, /keywords: canonical\.availableKeywords/);
  assert.equal((clientSource.match(/keywords: canonical\.availableKeywords/g) || []).length, 1);
});

test("PATCH: só o update com articleKgrDecision pede as colunas de KGR", () => {
  const updates = [
    { workflowItemId: uuid(501), assignment: { articleKgrDecision: "YES" as const } },
    { workflowItemId: uuid(502), assignment: { role: "principal" } },
    { workflowItemId: uuid(503), assignment: { articleKgrDecision: "NO" as const, manualEdit: true } },
  ];
  assert.deepEqual(architectPatchKeywordReadInput(updates), {
    workflowItemIds: [uuid(501), uuid(502), uuid(503)],
    kgrDecisionWorkflowItemIds: [uuid(501), uuid(503)],
  });
  assert.deepEqual(architectPatchKeywordReadInput([{ workflowItemId: uuid(502), assignment: {} }]), {
    workflowItemIds: [uuid(502)],
    kgrDecisionWorkflowItemIds: [],
  });
  assert.deepEqual(architectPatchKeywordReadInput([]), { workflowItemIds: [], kgrDecisionWorkflowItemIds: [] });
});

test("PATCH: decisão de KGR com workflowItemId em maiúsculas ainda lê kgr_score e analise_semantica", async () => {
  const tables = baseTables();
  const upperId = "abcdef00-0000-4000-8000-0000000000aa";
  tables.editorial_workflow_items.push(workflowRow(0, uuid(2), { id: upperId }));
  const db = new FakeDb(tables);
  const keywordById = await readArchitectPatchKeywords(contextFor(db), architectPatchKeywordReadInput([
    { workflowItemId: upperId.toUpperCase(), assignment: { articleKgrDecision: "YES" } },
  ]));
  assert.deepEqual(keywordById.get(uuid(2)), { id: uuid(2), status: "aprovado", kgr_score: 0.1, analise_semantica: PESADO });
  assert.deepEqual(db.keywordReads().map(read => read.columns), [ARQUITETO_PATCH_KEYWORD_KGR_COLUMNS]);
});

/* ------------------------ comportamento, banco falso ----------------------- */

test("montagem: availableKeywords traz todas as vivas da marca sem analise_semantica; keywords traz a linha inteira das recebidas", async () => {
  const db = new FakeDb(baseTables());
  const workspace = await loadCanonicalArquitetoWorkspace(contextFor(db));

  assert.deepEqual(workspace.availableKeywords.map(row => row.id).sort(), [uuid(1), uuid(2), uuid(3), uuid(4)]);
  for (const row of workspace.availableKeywords) {
    assert.ok(!("analise_semantica" in row), "o índice não carrega o payload");
    assert.equal(row.brand_id, BRAND);
    assert.equal(typeof row.keyword, "string");
  }
  assert.deepEqual(workspace.keywords.map(row => row.id).sort(), [uuid(1), uuid(4)]);
  for (const row of workspace.keywords) assert.deepEqual(row.analise_semantica, PESADO);

  const reads = db.keywordReads();
  assert.equal(reads.length, 2);
  const index = reads.find(read => read.columns === ARQUITETO_KEYWORD_INDEX_COLUMNS);
  const full = reads.find(read => read.columns === ARQUITETO_KEYWORD_ROW_COLUMNS);
  assert.ok(index && full);
  assert.deepEqual(index.filters, [{ column: "brand_id", kind: "eq", value: BRAND }, { column: "deleted_at", kind: "is", value: null }]);
  assert.deepEqual(full.filters.slice(0, 2), [{ column: "brand_id", kind: "eq", value: BRAND }, { column: "deleted_at", kind: "is", value: null }]);
  assert.deepEqual((full.filters[2]?.value as string[]).sort(), [uuid(1), uuid(4)]);
});

test("montagem: mesma resposta que a leitura completa, fora o analise_semantica das não recebidas", async () => {
  const narrow = await loadCanonicalArquitetoWorkspace(contextFor(new FakeDb(baseTables())));
  const fullDb = new FakeDb(baseTables());
  const full = await loadCanonicalArquitetoWorkspace(contextFor(fullDb), { keywordDetail: "full" });

  assert.deepEqual(fullDb.keywordReads().map(read => read.columns), [ARQUITETO_KEYWORD_ROW_COLUMNS]);
  assert.deepEqual(narrow.importEligibility, full.importEligibility);
  assert.deepEqual(byId(narrow.keywords), byId(full.keywords));
  assert.deepEqual(byId(narrow.availableKeywords), byId(full.availableKeywords.map(withoutSemantic)));
  assert.deepEqual(narrow.workflowItems, full.workflowItems);
  assert.deepEqual(narrow.brandSiloCatalog, full.brandSiloCatalog);
});

test("montagem: sem recebidas não lê linha inteira nenhuma", async () => {
  const tables = baseTables();
  tables.editorial_workflow_items = [];
  const db = new FakeDb(tables);
  const workspace = await loadCanonicalArquitetoWorkspace(contextFor(db));
  assert.deepEqual(workspace.keywords, []);
  assert.deepEqual(db.keywordReads().map(read => read.columns), [ARQUITETO_KEYWORD_INDEX_COLUMNS]);
});

test("montagem: recebida apagada, de outra marca ou com id fora do formato continua recusando com 409", async () => {
  for (const subjectId of [uuid(5), uuid(6), "nao-e-uuid"]) {
    const tables = baseTables();
    tables.editorial_workflow_items = [workflowRow(1, uuid(1)), workflowRow(9, subjectId)];
    await assert.rejects(
      loadCanonicalArquitetoWorkspace(contextFor(new FakeDb(tables))),
      (error: { code?: string; status?: number }) => error.code === "CONFLICT" && error.status === 409,
    );
  }
});

test("handoff: lê só os ids pedidos, nas duas passagens, e recusa com 403 id de outra marca", async () => {
  const db = new FakeDb(baseTables());
  const result = await createMineradorArquitetoHandoff(contextFor(db), [uuid(3)]);
  assert.equal(result.persistence, "UNCHANGED");
  const reads = db.keywordReads();
  assert.equal(reads.length, 2, "preparação e confirmação");
  for (const read of reads) {
    assert.equal(read.columns, ARQUITETO_KEYWORD_ROW_COLUMNS);
    assert.deepEqual(read.filters, [
      { column: "brand_id", kind: "eq", value: BRAND },
      { column: "deleted_at", kind: "is", value: null },
      { column: "id", kind: "in", value: [uuid(3)] },
    ]);
  }

  for (const foreign of [uuid(6), uuid(5), uuid(77)]) {
    await assert.rejects(
      createMineradorArquitetoHandoff(contextFor(new FakeDb(baseTables())), [uuid(3), foreign]),
      (error: { code?: string; status?: number }) => error.code === "NOT_AUTHORIZED" && error.status === 403,
    );
  }
});

test("handoff: id pedido em maiúsculas continua recusado com 403, como no filtro em memória de antes", async () => {
  const lowerId = "abcdef00-0000-4000-8000-0000000000bb";
  const tables = baseTables();
  tables.minerador_keywords.push(keywordRow(88, { id: lowerId, status: "novo" }));
  await assert.rejects(
    createMineradorArquitetoHandoff(contextFor(new FakeDb(tables)), [lowerId.toUpperCase()]),
    (error: { code?: string; status?: number }) => error.code === "NOT_AUTHORIZED" && error.status === 403,
  );
  // O mesmo id em minúsculas, como o banco devolve e o cliente envia, passa.
  const result = await createMineradorArquitetoHandoff(contextFor(new FakeDb(tables)), [lowerId]);
  assert.equal(result.persistence, "UNCHANGED");
});

test("handoff: pedidos acima de 100 ids vão em lotes", async () => {
  const tables = baseTables();
  const ids = Array.from({ length: 230 }, (_, index) => uuid(1000 + index));
  tables.minerador_keywords.push(...ids.map((id, index) => keywordRow(1000 + index, { id, status: "novo" })));
  const db = new FakeDb(tables);
  await createMineradorArquitetoHandoff(contextFor(db), ids);
  const sizes = db.keywordReads().map(read => (read.filters.find(filter => filter.kind === "in")?.value as unknown[]).length);
  assert.deepEqual(sizes, [100, 100, 30, 100, 100, 30]);
});

test("PATCH: só os subject_id enviados; status por padrão, KGR só no item com decisão; sem filtro de deleted_at", async () => {
  const tables = baseTables();
  tables.editorial_workflow_items.push(workflowRow(5, uuid(5)));
  const db = new FakeDb(tables);
  const keywordById = await readArchitectPatchKeywords(contextFor(db), {
    workflowItemIds: [uuid(501), uuid(502), uuid(505), uuid(504)],
    kgrDecisionWorkflowItemIds: [uuid(501)],
  });

  // uuid(504) é item de outra marca: não entra no mapa (o find do laço dá 403).
  assert.deepEqual([...keywordById.keys()].sort(), [uuid(1), uuid(4), uuid(5)]);
  assert.deepEqual(keywordById.get(uuid(1)), { id: uuid(1), status: "aprovado", kgr_score: 0.1, analise_semantica: PESADO });
  assert.deepEqual(keywordById.get(uuid(4)), { id: uuid(4), status: "publicado" });
  // Apagada continua visível, como na leitura antiga.
  assert.deepEqual(keywordById.get(uuid(5)), { id: uuid(5), status: "aprovado" });

  const workflowRead = db.log.find(entry => entry.table === "editorial_workflow_items");
  assert.equal(workflowRead?.columns, "id,subject_id");
  assert.deepEqual(workflowRead?.filters[0], { column: "marca_id", kind: "eq", value: BRAND });
  const reads = db.keywordReads();
  assert.deepEqual(reads.map(read => read.columns), [ARQUITETO_PATCH_KEYWORD_STATUS_COLUMNS, ARQUITETO_PATCH_KEYWORD_KGR_COLUMNS]);
  for (const read of reads) {
    assert.deepEqual(read.filters[0], { column: "brand_id", kind: "eq", value: BRAND });
    assert.ok(!read.filters.some(filter => filter.column === "deleted_at"));
  }
});

test("PATCH: sem updates não lê nada", async () => {
  const db = new FakeDb(baseTables());
  const keywordById = await readArchitectPatchKeywords(contextFor(db), { workflowItemIds: [], kgrDecisionWorkflowItemIds: [] });
  assert.equal(keywordById.size, 0);
  assert.equal(db.log.length, 0);
});
