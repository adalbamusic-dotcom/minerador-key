import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GLOBAL_TRANSITION_STEPS,
  GlobalTransitionError,
  describeGlobalTransitionFailure,
  persistGlobalTransition,
} from "../lib/server/global-workflow-transition.ts";

/**
 * A GRAVAÇÃO DO STATUS GLOBAL.
 *
 * A homologação recebeu, nos cinco artigos, apenas "A gravação do status
 * falhou". Duas coisas estavam erradas:
 *
 * 1. O INSERT não enviava `source_entity_id`, que é NOT NULL no schema. Como
 *    nenhum dos cinco tinha linha `architect`, TODA transição caía no INSERT e
 *    TODO INSERT violava a restrição.
 * 2. O erro do PostgREST não é `instanceof Error` — é objeto simples —, então
 *    o chamador caía no fallback e a mensagem real do banco sumia.
 */

/* ---------------------------------------------------------------- fake db */

type Registro = { table: string; op: string; payload?: Record<string, unknown> };

function fakeDb(config: {
  insertError?: unknown;
  updateError?: unknown;
  updateReturnsNull?: boolean;
  eventError?: unknown;
  readbackState?: string;
  readbackEventState?: string;
  rollbackError?: unknown;
}) {
  const registro: Registro[] = [];
  let lock = 1;
  const build = (table: string) => {
    const contexto: { op: string; payload?: Record<string, unknown> } = { op: "select" };
    const chain: Record<string, unknown> = {
      insert(payload: Record<string, unknown>) {
        contexto.op = "insert"; contexto.payload = payload;
        registro.push({ table, op: "insert", payload });
        return chain;
      },
      update(payload: Record<string, unknown>) {
        contexto.op = "update"; contexto.payload = payload;
        registro.push({ table, op: "update", payload });
        return chain;
      },
      select() { return chain; },
      eq() { return chain; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(chain).then(resolve); },
      single() {
        if (table === "editorial_workflow_items" && contexto.op === "insert") {
          return Promise.resolve(config.insertError
            ? { data: null, error: config.insertError }
            : { data: { id: "wf-1", state: contexto.payload?.state, lock_version: lock, payload: {} }, error: null });
        }
        if (table === "editorial_decision_events" && contexto.op === "insert") {
          return Promise.resolve(config.eventError
            ? { data: null, error: config.eventError }
            : { data: { id: "ev-1" }, error: null });
        }
        if (table === "editorial_decision_events") {
          return Promise.resolve({ data: { id: "ev-1", to_state: config.readbackEventState ?? "PRONTO_PARA_RADAR" }, error: null });
        }
        return Promise.resolve({
          data: { id: "wf-1", state: config.readbackState ?? "PRONTO_PARA_RADAR", lock_version: lock, payload: {} },
          error: null,
        });
      },
      maybeSingle() {
        if (contexto.op === "update" && table === "editorial_workflow_items") {
          if (config.rollbackError && registro.filter(item => item.op === "update").length > 1) {
            return Promise.resolve({ data: null, error: config.rollbackError });
          }
          if (config.updateError) return Promise.resolve({ data: null, error: config.updateError });
          if (config.updateReturnsNull) return Promise.resolve({ data: null, error: null });
          lock += 1;
          return Promise.resolve({ data: { id: "wf-1", state: contexto.payload?.state, lock_version: lock, payload: {} }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return { db: { from: (table: string) => build(table) } as never, registro };
}

const entrada = (overrides: Record<string, unknown> = {}) => ({
  brandId: "09762023-d0d4-4c24-b34e-d0fdfd43f891",
  articleId: "cand:pilar",
  actorId: "user-1",
  target: "PRONTO_PARA_RADAR",
  previous: null,
  payload: {},
  sourceVersionId: "art:v1",
  ...overrides,
});

/* ============ A · sem workflow item: NONE → PRONTO_PARA_RADAR ========== */

test("A — artigo sem linha remota é CRIADO, com source_entity_id e source_version_id", async () => {
  const { db, registro } = fakeDb({});
  const row = await persistGlobalTransition(db, entrada() as never);
  assert.equal(row.state, "PRONTO_PARA_RADAR");

  const insert = registro.find(item => item.table === "editorial_workflow_items" && item.op === "insert")!;
  assert.ok(insert, "a primeira transição precisa INSERTAR");
  // A causa raiz: NOT NULL que o INSERT não enviava.
  assert.equal(insert.payload!.source_entity_id, "cand:pilar");
  assert.equal(insert.payload!.source_version_id, "art:v1", "a versão que sustentou a transição viaja junto");
  assert.equal(insert.payload!.stage, "architect");
  assert.equal(insert.payload!.subject_type, "article");
  assert.equal(insert.payload!.subject_id, "cand:pilar");
  assert.equal(insert.payload!.state, "PRONTO_PARA_RADAR");

  // E o histórico nasce junto, com from_state nulo.
  const evento = registro.find(item => item.table === "editorial_decision_events" && item.op === "insert")!;
  assert.ok(evento, "a criação também registra o histórico");
  assert.equal(evento.payload!.from_state, null);
  assert.equal(evento.payload!.to_state, "PRONTO_PARA_RADAR");
  assert.equal(evento.payload!.source_version_id, "art:v1");
});

test("A — NOT NULL violado devolve o passo e a frase operacional", async () => {
  const { db } = fakeDb({
    insertError: { code: "23502", message: 'null value in column "source_entity_id" violates not-null constraint' },
  });
  await assert.rejects(
    () => persistGlobalTransition(db, entrada() as never),
    (error: unknown) => {
      assert.ok(error instanceof GlobalTransitionError);
      assert.equal((error as GlobalTransitionError).step, "INSERT_INITIAL_ITEM");
      assert.equal((error as GlobalTransitionError).message, "Não foi possível criar o estado inicial do artigo.");
      // O técnico sobrevive para o log — era ele que sumia.
      assert.match(describeGlobalTransitionFailure(error).technical, /23502/);
      assert.match(describeGlobalTransitionFailure(error).technical, /source_entity_id/);
      return true;
    },
  );
});

/* ============ B/C · atualização com lock ============================== */

test("B — artigo com linha existente ATUALIZA sob lock", async () => {
  const { db, registro } = fakeDb({});
  const row = await persistGlobalTransition(db, entrada({
    previous: { id: "wf-1", state: "EM_PROCESSO", lock_version: 3, payload: {} },
  }) as never);
  assert.equal(row.state, "PRONTO_PARA_RADAR");
  assert.equal(registro.some(item => item.table === "editorial_workflow_items" && item.op === "insert"), false, "não recria");
  const evento = registro.find(item => item.table === "editorial_decision_events")!;
  assert.equal(evento.payload!.from_state, "EM_PROCESSO", "o histórico guarda de onde veio");
});

test("C — lock divergente recusa sem falso sucesso", async () => {
  const { db, registro } = fakeDb({ updateReturnsNull: true });
  await assert.rejects(
    () => persistGlobalTransition(db, entrada({
      previous: { id: "wf-1", state: "EM_PROCESSO", lock_version: 1, payload: {} },
    }) as never),
    (error: unknown) => {
      assert.equal((error as GlobalTransitionError).step, "LOCK_VERSION_CHECK");
      assert.match((error as GlobalTransitionError).message, /recarregue e tente novamente/);
      return true;
    },
  );
  assert.equal(registro.some(item => item.table === "editorial_decision_events"), false, "sem item, sem histórico");
});

/* ============ D · histórico falhou ==================================== */

test("D — evento que falha reverte o item e NÃO declara sucesso", async () => {
  const { db, registro } = fakeDb({ eventError: { code: "23503", message: "fk violation" } });
  await assert.rejects(
    () => persistGlobalTransition(db, entrada({
      previous: { id: "wf-1", state: "EM_PROCESSO", lock_version: 2, payload: {} },
    }) as never),
    (error: unknown) => {
      assert.equal((error as GlobalTransitionError).step, "INSERT_DECISION_EVENT");
      assert.match((error as GlobalTransitionError).message, /revertida/);
      return true;
    },
  );
  const updates = registro.filter(item => item.table === "editorial_workflow_items" && item.op === "update");
  assert.equal(updates.length, 2, "a compensação é uma segunda escrita, sobre a própria revisão");
  assert.equal(updates[1].payload!.state, "EM_PROCESSO", "volta ao estado anterior");
});

test("D — compensação que também falha pede reconciliação, sem sucesso", async () => {
  const { db } = fakeDb({
    eventError: { code: "23503", message: "fk violation" },
    rollbackError: { code: "40001", message: "serialization failure" },
  });
  await assert.rejects(
    () => persistGlobalTransition(db, entrada({
      previous: { id: "wf-1", state: "EM_PROCESSO", lock_version: 2, payload: {} },
    }) as never),
    (error: unknown) => {
      assert.equal((error as GlobalTransitionError).step, "COMPENSATING_ROLLBACK");
      assert.match((error as GlobalTransitionError).message, /reconciliação remota/);
      return true;
    },
  );
});

/* ============ E · readback divergente ================================= */

test("E — readback do item divergente falha", async () => {
  const { db } = fakeDb({ readbackState: "EM_PROCESSO" });
  await assert.rejects(
    () => persistGlobalTransition(db, entrada() as never),
    (error: unknown) => {
      assert.equal((error as GlobalTransitionError).step, "READBACK_ITEM");
      assert.match((error as GlobalTransitionError).message, /readback remoto divergiu/);
      return true;
    },
  );
});

test("E — readback do histórico divergente falha", async () => {
  const { db } = fakeDb({ readbackEventState: "EM_PROCESSO" });
  await assert.rejects(
    () => persistGlobalTransition(db, entrada() as never),
    (error: unknown) => {
      assert.equal((error as GlobalTransitionError).step, "READBACK_EVENT");
      return true;
    },
  );
});

/* ============ F/G · o lote e a idempotência =========================== */

test("F — os cinco da Care Glow criam item e histórico, cada um", async () => {
  const artigos = ["cand:pilar", "cand:noturno", "cand:nivea", "cand:mascara", "cand:vitaminac"];
  const confirmados: string[] = [];
  for (const articleId of artigos) {
    const { db, registro } = fakeDb({});
    const row = await persistGlobalTransition(db, entrada({ articleId, sourceVersionId: `art:${articleId}` }) as never);
    assert.equal(row.state, "PRONTO_PARA_RADAR");
    assert.ok(registro.find(item => item.table === "editorial_workflow_items" && item.op === "insert"));
    assert.ok(registro.find(item => item.table === "editorial_decision_events" && item.op === "insert"));
    confirmados.push(articleId);
  }
  assert.equal(confirmados.length, 5, "5 elegíveis, 0 recusados");
});

test("G — reaplicar sobre linha já PRONTA usa UPDATE, não cria segunda linha", async () => {
  const { db, registro } = fakeDb({});
  await persistGlobalTransition(db, entrada({
    previous: { id: "wf-1", state: "PRONTO_PARA_RADAR", lock_version: 4, payload: {} },
  }) as never);
  assert.equal(registro.filter(item => item.table === "editorial_workflow_items" && item.op === "insert").length, 0);
  const evento = registro.find(item => item.table === "editorial_decision_events")!;
  assert.equal(evento.payload!.from_state, "PRONTO_PARA_RADAR");
  assert.equal(evento.payload!.to_state, "PRONTO_PARA_RADAR");
});

/* ============ contrato · o diagnóstico chega ao log =================== */

test("todo passo tem nome, e o erro do PostgREST não some mais", () => {
  assert.deepEqual([...GLOBAL_TRANSITION_STEPS], [
    "INSERT_INITIAL_ITEM", "UPDATE_ITEM", "LOCK_VERSION_CHECK",
    "INSERT_DECISION_EVENT", "COMPENSATING_ROLLBACK", "READBACK_ITEM", "READBACK_EVENT",
  ]);
  // Objeto simples do PostgREST — o caso que o `instanceof Error` engolia.
  const cru = describeGlobalTransitionFailure({ code: "23502", message: "not-null", details: "coluna X" });
  assert.equal(cru.step, "UNKNOWN");
  assert.match(cru.technical, /23502 · not-null · coluna X/);
});

test("a rota registra passo e técnico, e devolve só a frase operacional", () => {
  const rota = readFileSync("app/api/arquiteto/workflow-status/route.ts", "utf8");
  assert.match(rota, /\[arquiteto\]\[workflow-status\] falha na transição/);
  assert.match(rota, /step: detalhe\.step, message: detalhe\.message, technical: detalhe\.technical/);
  assert.match(rota, /return detalhe\.message;/);
  // O fallback que engolia a causa saiu dos dois caminhos.
  assert.doesNotMatch(rota, /"A gravação do status falhou\."/);
  assert.doesNotMatch(rota, /"Falha ao persistir status e histórico\."/);
});

test("o schema exige source_entity_id: a causa raiz não pode voltar", () => {
  const migration = readFileSync("supabase/migrations/0027_editorial_artifacts_workflow_serp.sql", "utf8");
  assert.match(migration, /source_entity_id text NOT NULL/);
  const writer = readFileSync("lib/server/global-workflow-transition.ts", "utf8");
  assert.match(writer, /source_entity_id: input\.articleId/);
});
