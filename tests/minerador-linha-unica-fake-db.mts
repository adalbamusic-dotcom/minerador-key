import { randomUUID } from "node:crypto";

/**
 * BANCO DE MENTIRA DA LINHA ÚNICA DO MINERADOR (F0, SDD
 * `docs/compartilhado/sdd-linha-unica-do-minerador-2026-10-16.md`) — em
 * memória, sem rede, sem custo.
 *
 * A mesma forma do `postgrest-js` que os núcleos usam (a do
 * `plano-declarado-fake-db.mts`, mais o que os núcleos de decisão pedem):
 * `select` com apelido e caminho JSON, `eq`, `neq`, `is`, `in`, `gt`, `gte`,
 * `lt`, `lte`, `not(col, "is", null)`, `filter(col, "eq", valor)` (com o
 * JSON comparado sem ordem de chave, como o jsonb), `ilike`, `order`,
 * `range`, `limit`, `insert`/`update`/`upsert`/`delete` com releitura,
 * `maybeSingle`/`single`, a contagem `head` e `rpc` com tratadores do teste.
 *
 * `maxRows` imita o `max_rows = 1000` do PostgREST (supabase/config.toml):
 * nenhuma leitura devolve mais que isso, com ou sem `range`.
 *
 * `beforeWrite` deixa o teste simular a escrita concorrente entre a leitura
 * e a gravação de um núcleo. Fora dos globs das suítes (não é `.test.`).
 */

export type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
export type WriteLog = { table: string; op: "select" | "insert" | "update" | "upsert" | "delete" | "rpc"; payload: unknown; affected: number };

function caminho(linha: Row, expressao: string): unknown {
  const partes = expressao.split(/->>?/).map(parte => parte.trim());
  let atual: unknown = linha[partes[0]];
  for (const chave of partes.slice(1)) {
    atual = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Row)[chave] : undefined;
  }
  if (expressao.includes("->>") && atual !== undefined && atual !== null && typeof atual !== "object") return String(atual);
  return atual === undefined ? null : atual;
}

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor as Row).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonico(v)]));
}

export function mesmoJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
}

function projeta(linha: Row, select: string): Row {
  if (!select || select.trim() === "*") return structuredClone(linha);
  const saida: Row = {};
  for (const bruto of select.split(",")) {
    const item = bruto.trim();
    if (!item) continue;
    const [apelido, expressao] = item.includes(":") ? [item.slice(0, item.indexOf(":")), item.slice(item.indexOf(":") + 1)] : [item.split(/->>?/).at(-1) || item, item];
    saida[apelido.trim()] = structuredClone(caminho(linha, expressao.trim()));
  }
  return saida;
}

export type RpcHandler = (args: Row, db: LinhaUnicaFakeDb) => { data: unknown; error: unknown };

export class LinhaUnicaFakeDb {
  tables: Record<string, Row[]>;
  log: WriteLog[] = [];
  maxRows: number;
  rpcs: Record<string, RpcHandler> = {};
  beforeWrite: ((table: string, op: string, alvo: Row[]) => void) | null = null;
  constructor(tables: Record<string, Row[]>, options: { maxRows?: number } = {}) {
    this.tables = tables;
    this.maxRows = options.maxRows ?? 1000;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    return new LinhaUnicaFakeQuery(this, table);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(name: string, args: Row = {}): any {
    const handler = this.rpcs[name];
    this.log.push({ table: name, op: "rpc", payload: structuredClone(args), affected: 0 });
    const resultado = handler ? handler(args, this) : { data: null, error: { code: "PGRST202", message: `rpc ${name} não simulada` } };
    return Promise.resolve(resultado);
  }
  rows(table: string): Row[] {
    if (table === "editorial_group_summary") {
      return this.rows("editorial_groups").map(group => ({
        ...group,
        keyword_count: this.rows("minerador_keywords").filter(row => row.group_id === group.id && row.brand_id === group.marca_id && !row.deleted_at).length,
        article_count: this.rows("editorial_group_articles").filter(row => row.group_id === group.id && row.marca_id === group.marca_id).length,
      }));
    }
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }
  /** As escritas (sem as leituras), para "nada foi gravado". */
  writes(table?: string): WriteLog[] {
    return this.log.filter(entry => entry.op !== "select" && (!table || entry.table === table));
  }
}

class LinhaUnicaFakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: unknown = null;
  private columns = "*";
  private returning: string | null = null;
  private faixa: [number, number] | null = null;
  private ordem: Array<{ column: string; ascending: boolean }> = [];
  private singleMode: "maybe" | "one" | null = null;
  private head = false;
  private contar = false;
  private onConflict: string | null = null;
  private db: LinhaUnicaFakeDb;
  private table: string;
  constructor(db: LinhaUnicaFakeDb, table: string) {
    this.db = db;
    this.table = table;
  }
  select(columns = "*", options?: { head?: boolean; count?: string }) {
    if (this.op === "select") {
      this.columns = columns;
      this.head = Boolean(options?.head);
      this.contar = Boolean(options?.count);
    } else this.returning = columns;
    return this;
  }
  eq(column: string, value: unknown) { this.filters.push(row => caminho(row, column) === value); return this; }
  neq(column: string, value: unknown) { this.filters.push(row => caminho(row, column) !== value); return this; }
  is(column: string, value: unknown) { this.filters.push(row => (caminho(row, column) ?? null) === value); return this; }
  gt(column: string, value: unknown) { this.filters.push(row => String(caminho(row, column) ?? "") > String(value)); return this; }
  gte(column: string, value: unknown) { this.filters.push(row => String(caminho(row, column) ?? "") >= String(value)); return this; }
  lt(column: string, value: unknown) { this.filters.push(row => String(caminho(row, column) ?? "") < String(value)); return this; }
  lte(column: string, value: unknown) { this.filters.push(row => String(caminho(row, column) ?? "") <= String(value)); return this; }
  ilike(column: string, pattern: string) {
    const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
    this.filters.push(row => regex.test(String(caminho(row, column) ?? "")));
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error(`not não simulado: ${operator}`);
    this.filters.push(row => (caminho(row, column) ?? null) !== null);
    return this;
  }
  filter(column: string, operator: string, value: string) {
    if (operator !== "eq") throw new Error(`filter não simulado: ${operator}`);
    let esperado: unknown = value;
    try { esperado = JSON.parse(value); } catch { esperado = value; }
    this.filters.push(row => {
      const atual = caminho(row, column);
      if (esperado && typeof esperado === "object") return mesmoJson(atual, esperado);
      return atual !== null && String(atual) === String(value);
    });
    return this;
  }
  in(column: string, values: readonly unknown[]) { this.filters.push(row => values.includes(caminho(row, column))); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.ordem.push({ column, ascending: options?.ascending !== false }); return this; }
  range(from: number, to: number) { this.faixa = [from, to]; return this; }
  limit(n: number) { this.faixa = [0, n - 1]; return this; }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; return this; }
  upsert(rows: Row | Row[], options?: { onConflict?: string }) { this.op = "upsert"; this.payload = rows; this.onConflict = options?.onConflict ?? null; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  delete() { this.op = "delete"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }
  then<A = { data: unknown; error: unknown }, B = never>(onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.exec()).then(onfulfilled, onrejected);
  }
  private finish(rows: Row[], columns: string, count?: number) {
    const projetadas = rows.map(row => projeta(row, columns));
    if (this.singleMode === "maybe") return projetadas.length > 1 ? { data: null, error: { code: "PGRST116", message: "mais de uma linha" } } : { data: projetadas[0] ?? null, error: null };
    if (this.singleMode === "one") return projetadas.length === 1 ? { data: projetadas[0], error: null } : { data: null, error: { code: "PGRST116", message: "not single" } };
    return { data: projetadas, error: null, ...(count !== undefined ? { count } : {}) };
  }
  private ordenar(rows: Row[]): Row[] {
    if (!this.ordem.length) return rows;
    return [...rows].sort((a, b) => {
      for (const { column, ascending } of this.ordem) {
        const x = String(caminho(a, column) ?? "");
        const y = String(caminho(b, column) ?? "");
        if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
  }
  private exec(): { data: unknown; error: unknown; count?: number | null } {
    const linhas = this.db.rows(this.table);
    const casa = (row: Row) => this.filters.every(filter => filter(row));
    if (this.op === "select") {
      let encontradas = this.ordenar(linhas.filter(casa));
      this.db.log.push({ table: this.table, op: "select", payload: this.columns, affected: encontradas.length });
      const total = encontradas.length;
      if (this.head) return { data: null, error: null, count: total };
      if (this.faixa) encontradas = encontradas.slice(this.faixa[0], this.faixa[1] + 1);
      encontradas = encontradas.slice(0, this.db.maxRows);
      return this.finish(encontradas, this.columns, this.contar ? total : undefined);
    }
    if (this.op === "insert" || this.op === "upsert") {
      const entrada = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const novas: Row[] = [];
      const tocadas: Row[] = [];
      for (const bruto of entrada) {
        const chaves = this.onConflict ? this.onConflict.split(",").map(chave => chave.trim()) : ["id"];
        const existente = this.op === "upsert" ? linhas.find(row => chaves.every(chave => row[chave] !== undefined && row[chave] === bruto[chave])) : undefined;
        if (existente) { Object.assign(existente, structuredClone(bruto)); tocadas.push(existente); continue; }
        const row: Row = { id: randomUUID(), occurred_at: new Date().toISOString(), lock_version: 1, deleted_at: null, group_id: null, ...structuredClone(bruto) };
        if (this.table === "minerador_keywords" && row.group_id) {
          const grupo = this.db.rows("editorial_groups").find(group => group.id === row.group_id);
          if (!grupo || grupo.marca_id !== row.brand_id) return { data: null, error: { code: "23503", message: "fk_minerador_keywords_group" } };
        }
        novas.push(row);
        tocadas.push(row);
      }
      this.db.beforeWrite?.(this.table, this.op, tocadas);
      linhas.push(...novas);
      this.db.log.push({ table: this.table, op: this.op, payload: structuredClone(this.payload), affected: tocadas.length });
      return this.returning ? this.finish(tocadas, this.returning) : { data: null, error: null };
    }
    if (this.op === "delete") {
      const alvo = linhas.filter(casa);
      this.db.beforeWrite?.(this.table, "delete", alvo);
      for (const row of alvo) linhas.splice(linhas.indexOf(row), 1);
      this.db.log.push({ table: this.table, op: "delete", payload: null, affected: alvo.length });
      return this.returning ? this.finish(alvo, this.returning) : { data: null, error: null };
    }
    this.db.beforeWrite?.(this.table, "update", linhas.filter(casa));
    const alvo = linhas.filter(casa);
    const patch = this.payload as Row;
    if (this.table === "minerador_keywords" && typeof patch.group_id === "string") {
      const grupo = this.db.rows("editorial_groups").find(group => group.id === patch.group_id);
      if (alvo.some(row => !grupo || grupo.marca_id !== row.brand_id)) return { data: null, error: { code: "23503", message: "fk_minerador_keywords_group" } };
    }
    for (const row of alvo) Object.assign(row, structuredClone(patch));
    this.db.log.push({ table: this.table, op: "update", payload: structuredClone(patch), affected: alvo.length });
    return this.returning ? this.finish(alvo, this.returning) : { data: null, error: null };
  }
}
