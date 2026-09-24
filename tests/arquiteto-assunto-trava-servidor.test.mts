import assert from "node:assert/strict";
import test from "node:test";

import { ARQUITETO_KEYWORD_ROW_COLUMNS, createMineradorArquitetoHandoff } from "../lib/server/arquiteto-workspace.ts";
import type { PipelineContext } from "../lib/server/pipeline-runtime.ts";
import { applyApproval, SUBJECT_APPROVAL_REASON } from "../lib/minerador/approved-package.ts";
import { evaluateMineradorArquitetoHandoff } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { setKeywordSubject } from "../lib/minerador/keyword-subject.ts";

/**
 * TRAVA DE APROVAÇÃO NO SERVIDOR (SDD 2026-09-24, F1.7, P10, Q3, Q9).
 *
 * `prepareCanonicalHandoff` passa a recusar aprovação registrada a partir de
 * `SERVER_APPROVAL_GATE_SINCE` sem os processos exigidos (só a Lógica, para
 * Assunto declarado). Anterior passa com alerta; já recebida só alerta.
 *
 * Roda com `--conditions=react-server` e o registro de TS, como
 * `tests/arquiteto-leitura-da-marca-estreita.test.mts`. O banco é uma tabela
 * em memória atrás de um cliente com a forma do `postgrest-js`; nenhuma rede.
 * As variáveis do Supabase são apagadas para a leitura opcional da
 * Qualificação falhar localmente, sem sair da máquina.
 */

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const INTENT = "Comercial investigativa";
const BEFORE = "2026-09-20T15:00:00+00:00";
const AFTER = "2026-09-24T15:00:00+00:00";

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
  payload: Row[] = [];
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
  upsert(rows: Row[]) { this.op = "upsert"; this.payload = rows; return this; }
  update(values: Row) { this.op = "update"; this.payload = [values]; return this; }
  then<A, B = never>(resolve: (value: Reply) => A, reject?: (reason: unknown) => B) {
    return Promise.resolve().then(() => this.db.run(this)).then(resolve, reject);
  }
}

function matches(row: Row, filters: Filter[]) {
  return filters.every(filter => {
    if (filter.kind === "eq") return row[filter.column] === filter.value;
    if (filter.kind === "is") return (row[filter.column] ?? null) === filter.value;
    return (filter.value as unknown[]).some(value => String(value).toLowerCase() === String(row[filter.column]).toLowerCase());
  });
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
    const table = (this.tables[query.table] ||= []);
    if (query.op === "upsert") {
      for (const row of query.payload) {
        const key = (candidate: Row) => ["marca_id", "subject_type", "subject_id", "stage"].map(column => candidate[column]).join("|");
        if (!table.some(existing => key(existing) === key(row))) table.push({ ...row });
      }
      return { data: null, error: null };
    }
    if (query.op === "update") {
      for (const row of table.filter(candidate => matches(candidate, query.filters))) Object.assign(row, query.payload[0]);
      return { data: null, error: null };
    }
    const requested = query.columns === "*" ? null : query.columns.split(",").map(column => column.trim());
    const projected = table.filter(row => matches(row, query.filters)).map(row => requested
      ? Object.fromEntries(requested.map(column => [column, structuredClone(row[column] ?? null)]))
      : structuredClone(row));
    if (query.single) return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
  }
  keywordReads() {
    return this.log.filter(entry => entry.table === "minerador_keywords" && entry.op === "select");
  }
  writes() {
    return this.log.filter(entry => entry.op !== "select");
  }
}

function contextFor(db: FakeDb): PipelineContext {
  return {
    actorUserId: ACTOR,
    brandId: BRAND,
    module: "arquiteto",
    action: "create",
    permissions: ["arquiteto:create"],
    authorizationSource: "canonical_actor_rpc",
    supabase: db as unknown as PipelineContext["supabase"],
  } as PipelineContext;
}

/* --------------------------------- fixtures -------------------------------- */

function comLogica(): Record<string, unknown> {
  const semantic: Record<string, unknown> = { dna_origem: "logico_deterministico", intencao_principal: INTENT, nicho: "Marketing para clínicas", funnel: "BOFU" };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Marketing para clínicas", funnel: "BOFU" });
  return semantic;
}

function declarar(semantic: Record<string, unknown>) {
  const result = setKeywordSubject(semantic, { note: "Serviço de SEO para donos de clínica", actorId: ACTOR, changedAt: "2026-09-24T11:00:00+00:00", origin: "review" });
  assert.ok(result.ok);
  return result.semantic;
}

async function approvedKeyword(n: number, semantic: Record<string, unknown>, approvedAt: string): Promise<Row> {
  const row: Row = {
    id: uuid(n),
    keyword: `keyword ${n}`,
    location: "Brasil",
    results_allintitle: null,
    volume_search: null,
    kgr_score: null,
    intent: INTENT,
    status: "aprovado",
    created_at: "2026-09-20T10:00:00+00:00",
    lista_id: null,
    volume_source: null,
    brand_id: BRAND,
    deleted_at: null,
    purge_after: null,
    deleted_by: null,
  };
  row.analise_semantica = await applyApproval({
    keywordId: String(row.id),
    brandId: BRAND,
    keyword: String(row.keyword),
    intent: INTENT,
    volumeSearch: null,
    resultsAllintitle: null,
    kgrScore: null,
    listaId: null,
    semantic,
    approvedAt,
    approvedBy: ACTOR,
  });
  return row;
}

function receivedWorkflow(subjectId: string): Row {
  return {
    id: uuid(700),
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
  };
}

async function fixtures() {
  return {
    afterWithoutProcess: await approvedKeyword(1, {}, AFTER),
    beforeWithoutProcess: await approvedKeyword(2, {}, BEFORE),
    subjectWithLogic: await approvedKeyword(3, declarar(comLogica()), AFTER),
    subjectWithoutLogic: await approvedKeyword(4, declarar({}), AFTER),
    receivedAfterWithoutProcess: await approvedKeyword(5, {}, AFTER),
  };
}

function dbWith(rows: Row[], workflow: Row[] = [], siteUrl: string | null = null) {
  return new FakeDb({ minerador_keywords: rows, editorial_workflow_items: workflow, editorial_artifact_versions: [], marcas: [{ id: BRAND, silos_existentes: [], site_url: siteUrl }] });
}

type ServerOutcome = { verdict: "refuse" | "alert" | "pass"; reason?: string };

async function serverOutcome(row: Row, workflow: Row[] = []): Promise<ServerOutcome> {
  try {
    const result = await createMineradorArquitetoHandoff(contextFor(dbWith([row], workflow)), [String(row.id)]) as { approvalAlerts?: Array<{ keywordId: string }> };
    return { verdict: result.approvalAlerts?.some(alert => alert.keywordId === row.id) ? "alert" : "pass" };
  } catch (error) {
    const failure = error as { code?: string; status?: number; message?: string };
    assert.equal(failure.code, "CONFLICT");
    assert.equal(failure.status, 409);
    return { verdict: "refuse", reason: failure.message };
  }
}

/* ---------------------------------- testes --------------------------------- */

test("aprovada depois da ativação, sem processo, é recusada com 409 e nada é gravado", async () => {
  const { afterWithoutProcess } = await fixtures();
  const db = dbWith([afterWithoutProcess]);
  await assert.rejects(
    createMineradorArquitetoHandoff(contextFor(db), [uuid(1)]),
    (error: { code?: string; status?: number; message?: string }) =>
      error.code === "CONFLICT" && error.status === 409
      && /A aprovação desta keyword está incompleta para o envio ao Arquiteto\. "keyword 1": Aprovar exige Lógica, Volume e Resultados/.test(error.message || ""),
  );
  assert.deepEqual(db.writes(), [], "nenhum workflow criado");
});

test("aprovada antes da ativação passa como hoje, com alerta na resposta", async () => {
  const { beforeWithoutProcess } = await fixtures();
  const db = dbWith([beforeWithoutProcess]);
  const result = await createMineradorArquitetoHandoff(contextFor(db), [uuid(2)]) as Record<string, unknown>;
  assert.equal(result.persistence, "PERSISTED");
  assert.deepEqual(result.createdKeywordIds, [uuid(2)]);
  const alerts = result.approvalAlerts as Array<Record<string, unknown>>;
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].keywordId, uuid(2));
  assert.equal(alerts[0].keyword, "keyword 2");
  assert.equal(alerts[0].scope, "before_gate");
  assert.match(String(alerts[0].reason), /^Aprovada antes da trava de envio/);
});

test("Assunto com Lógica e Volume null passa sem alerta; sem Lógica é recusado com o motivo da D2", async () => {
  const { subjectWithLogic, subjectWithoutLogic } = await fixtures();
  const result = await createMineradorArquitetoHandoff(contextFor(dbWith([subjectWithLogic])), [uuid(3)]) as Record<string, unknown>;
  assert.equal(result.persistence, "PERSISTED");
  assert.equal("approvalAlerts" in result, false, "sem alerta, a resposta é a de sempre");

  await assert.rejects(
    createMineradorArquitetoHandoff(contextFor(dbWith([subjectWithoutLogic])), [uuid(4)]),
    (error: { message?: string }) => (error.message || "").endsWith(SUBJECT_APPROVAL_REASON),
  );
});

test("já recebida pelo Arquiteto: só alerta, não sai de lá e não é recusada", async () => {
  const { receivedAfterWithoutProcess } = await fixtures();
  const db = dbWith([receivedAfterWithoutProcess], [receivedWorkflow(uuid(5))]);
  const result = await createMineradorArquitetoHandoff(contextFor(db), [uuid(5)]) as Record<string, unknown>;
  assert.deepEqual(result.existingKeywordIds, [uuid(5)]);
  const alerts = result.approvalAlerts as Array<Record<string, unknown>>;
  assert.deepEqual(alerts.map(alert => alert.scope), ["already_received"]);
  assert.equal(db.tables.editorial_workflow_items.length, 1);
  assert.equal(db.tables.editorial_workflow_items[0].state, "received");
});

test("um pedido com uma recusada recusa o lote inteiro, sem gravar nenhuma", async () => {
  const { afterWithoutProcess, subjectWithLogic } = await fixtures();
  const db = dbWith([afterWithoutProcess, subjectWithLogic]);
  await assert.rejects(createMineradorArquitetoHandoff(contextFor(db), [uuid(1), uuid(3)]), (error: { status?: number }) => error.status === 409);
  assert.deepEqual(db.writes(), []);
});

test("custo de leitura zero: as leituras de keyword continuam as duas de sempre, só dos ids pedidos", async () => {
  const { subjectWithLogic } = await fixtures();
  const db = dbWith([subjectWithLogic]);
  await createMineradorArquitetoHandoff(contextFor(db), [uuid(3)]);
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
});

/* ------------------- página de destino conferida no servidor ------------------- */

const SITE = "https://clinicaexemplo.com.br";

function declararComDestino(destinationUrl: string) {
  // O `destinationCheck` é o que o cliente mandaria: o servidor não confia nele.
  const result = setKeywordSubject(comLogica(), {
    note: "Serviço de SEO para donos de clínica",
    destinationUrl,
    destinationCheck: { hostMatchesBrand: true, catalogPageType: null, catalogTitle: null, checkedAt: "2026-09-24T11:00:00+00:00" },
    actorId: ACTOR,
    changedAt: "2026-09-24T11:00:00+00:00",
    origin: "review",
  });
  assert.ok(result.ok);
  return result.semantic;
}

function marcasReads(db: FakeDb) {
  return db.log.filter(entry => entry.table === "marcas" && entry.columns === "site_url");
}

test("destino forjado de outro domínio, com hostMatchesBrand gravado pelo cliente, é recusado com 409", async () => {
  const forged = await approvedKeyword(6, declararComDestino("https://concorrente.com.br/oferta"), AFTER);
  const db = dbWith([forged], [], SITE);
  await assert.rejects(
    createMineradorArquitetoHandoff(contextFor(db), [uuid(6)]),
    (error: { code?: string; status?: number; message?: string }) =>
      error.code === "CONFLICT" && error.status === 409 && /página de destino/.test(error.message || "") && /clinicaexemplo\.com\.br/.test(error.message || ""),
  );
  assert.deepEqual(db.writes(), []);
  assert.equal(marcasReads(db).length, 1);
  assert.deepEqual(marcasReads(db)[0].filters, [{ column: "id", kind: "eq", value: BRAND }]);
});

test("marca sem site_url com destino gravado é recusada; destino válido passa", async () => {
  const valid = await approvedKeyword(7, declararComDestino(`${SITE}/seo-para-clinicas`), AFTER);
  await assert.rejects(
    createMineradorArquitetoHandoff(contextFor(dbWith([valid], [], null)), [uuid(7)]),
    (error: { status?: number; message?: string }) => error.status === 409 && /não tem site cadastrado/.test(error.message || ""),
  );
  const result = await createMineradorArquitetoHandoff(contextFor(dbWith([valid], [], SITE)), [uuid(7)]) as Record<string, unknown>;
  assert.equal(result.persistence, "PERSISTED");
  assert.equal("approvalAlerts" in result, false);
});

test("destino que não passa mais, numa keyword já recebida, só alerta", async () => {
  const received = await approvedKeyword(8, declararComDestino("https://concorrente.com.br/oferta"), AFTER);
  const db = dbWith([received], [receivedWorkflow(uuid(8))], SITE);
  const result = await createMineradorArquitetoHandoff(contextFor(db), [uuid(8)]) as Record<string, unknown>;
  const alerts = result.approvalAlerts as Array<Record<string, unknown>>;
  assert.deepEqual(alerts.map(alert => alert.scope), ["destination"]);
  assert.equal(db.tables.editorial_workflow_items[0].state, "received");
});

test("sem destino em nenhuma elegível, a marca não é lida", async () => {
  const { subjectWithLogic } = await fixtures();
  const db = dbWith([subjectWithLogic], [], SITE);
  await createMineradorArquitetoHandoff(contextFor(db), [uuid(3)]);
  assert.equal(marcasReads(db).length, 0);
});

test("o gate da tela e o do servidor dão o mesmo veredito para a mesma fixture", async () => {
  const all = await fixtures();
  const cases: Array<[Row, Row[], boolean]> = [
    [all.afterWithoutProcess, [], false],
    [all.beforeWithoutProcess, [], false],
    [all.subjectWithLogic, [], false],
    [all.subjectWithoutLogic, [], false],
    [all.receivedAfterWithoutProcess, [receivedWorkflow(uuid(5))], true],
  ];
  const verdicts: string[] = [];
  for (const [row, workflow, received] of cases) {
    const screen = evaluateMineradorArquitetoHandoff(row as Parameters<typeof evaluateMineradorArquitetoHandoff>[0], BRAND, null, { alreadyReceived: received });
    const server = await serverOutcome(row, workflow);
    assert.equal(screen.approvalGate?.verdict, server.verdict, String(row.keyword));
    assert.equal(screen.ok, server.verdict !== "refuse", String(row.keyword));
    if (server.verdict === "refuse") assert.ok(server.reason?.endsWith(screen.reason || "∅"), String(row.keyword));
    verdicts.push(server.verdict);
  }
  assert.deepEqual(verdicts, ["refuse", "alert", "pass", "refuse", "alert"]);
});
