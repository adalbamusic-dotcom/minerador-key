/**
 * O DRIVER FAKE — Postgres o bastante para rodar a autoridade REAL.
 *
 * O que este arquivo substitui é o DRIVER, não a regra: `appendArquitetoArtifact`,
 * `WorkflowRepository`, `createTerritoryWorkflowItem` e os `save*Store` rodam
 * exatamente como em produção, com as mesmas validações de Brand, contrato,
 * identidade e lock. Se a regra recusa algo lá, recusa aqui.
 *
 * O que NÃO é emulado: as duas stored procedures
 * (`persist_internal_link_graph` e `persist_silo_working_copy_atomic`). Inventar
 * o comportamento de um procedimento que não está neste repositório
 * enfraqueceria a prova em vez de reforçá-la; o teste registra a chamada e
 * confere o payload religado, que é a fronteira que o TypeScript controla.
 */

import type { PipelineContext } from "../lib/server/pipeline-runtime.ts";

type Row = Record<string, unknown>;
type Order = { column: string; ascending: boolean };

export type RpcCall = { name: string; args: Record<string, unknown> };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compare(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""), "en");
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Array<(row: Row) => boolean> = [];
  private ordering: Order | null = null;
  private max: number | null = null;

  constructor(private readonly rows: Row[]) {}

  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push(row => row[column] !== value); return this; }
  in(column: string, values: readonly unknown[]) { this.filters.push(row => values.includes(row[column])); return this; }
  is(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.ordering = { column, ascending: options?.ascending !== false }; return this; }
  limit(count: number) { this.max = count; return this; }

  private resolve(): Row[] {
    let result = this.rows.filter(row => this.filters.every(filter => filter(row)));
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      result = [...result].sort((left, right) => (ascending ? 1 : -1) * compare(left[column], right[column]));
    }
    return this.max === null ? result : result.slice(0, this.max);
  }

  async maybeSingle() {
    const found = this.resolve();
    if (found.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
    return { data: found[0] ? clone(found[0]) : null, error: null };
  }

  async single() {
    const found = this.resolve();
    if (found.length !== 1) return { data: null, error: { code: "PGRST116", message: "expected exactly one row" } };
    return { data: clone(found[0]), error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.resolve().map(clone), error: null }).then(onfulfilled, onrejected);
  }
}

class TableHandle {
  constructor(private readonly store: FakeCanonicalDatabase, private readonly table: string) {}

  select() { return new Query(this.store.rows(this.table)); }

  insert(row: Row) {
    const inserted: Row = {
      id: row.id ?? crypto.randomUUID(),
      lock_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
    };
    this.store.rows(this.table).push(inserted);
    return {
      select: () => ({
        single: async () => ({ data: clone(inserted), error: null }),
        maybeSingle: async () => ({ data: clone(inserted), error: null }),
      }),
    };
  }

  update(changes: Row) {
    const filters: Array<(row: Row) => boolean> = [];
    const builder = {
      eq(column: string, value: unknown) { filters.push(row => row[column] === value); return builder; },
      select: () => ({
        maybeSingle: async () => {
          const target = this.store.rows(this.table).find(row => filters.every(filter => filter(row)));
          if (!target) return { data: null, error: null };
          Object.assign(target, changes, { lock_version: Number(target.lock_version ?? 1) + 1, updated_at: new Date().toISOString() });
          return { data: clone(target), error: null };
        },
        single: async () => {
          const target = this.store.rows(this.table).find(row => filters.every(filter => filter(row)));
          if (!target) return { data: null, error: { code: "PGRST116", message: "no row" } };
          Object.assign(target, changes, { lock_version: Number(target.lock_version ?? 1) + 1, updated_at: new Date().toISOString() });
          return { data: clone(target), error: null };
        },
      }),
    };
    return builder;
  }
}

export class FakeCanonicalDatabase {
  private readonly tables = new Map<string, Row[]>();
  readonly rpcCalls: RpcCall[] = [];
  /** Procedimentos não emulados: o teste registra a chamada e devolve sucesso. */
  rpcHandler: ((call: RpcCall) => { data: unknown; error: unknown }) | null = null;

  rows(table: string): Row[] {
    const current = this.tables.get(table);
    if (current) return current;
    const created: Row[] = [];
    this.tables.set(table, created);
    return created;
  }

  from(table: string) { return new TableHandle(this, table); }

  async rpc(name: string, args: Record<string, unknown>) {
    const call = { name, args: clone(args) };
    this.rpcCalls.push(call);
    return this.rpcHandler ? this.rpcHandler(call) : { data: null, error: { code: "RPC_NOT_EMULATED", message: `${name} não é emulado` } };
  }

  snapshot() {
    return Object.fromEntries([...this.tables.entries()].map(([table, rows]) => [table, clone(rows)]));
  }
}

/**
 * O contexto tem a mesma FORMA do canônico. A autorização real acontece antes,
 * em `resolvePipelineContext`; aqui ela já aconteceu, e o que interessa provar
 * é o comportamento dos writers depois dela.
 */
export function fakePipelineContext(
  database: FakeCanonicalDatabase,
  brandId: string,
  actorUserId: string,
  action: "view" | "create" | "edit" = "edit",
): PipelineContext {
  return {
    brandId,
    actorUserId,
    action,
    module: "arquiteto",
    permissions: ["arquiteto"],
    authorizationSource: "canonical_actor_rpc",
    supabase: database as unknown as PipelineContext["supabase"],
  };
}
