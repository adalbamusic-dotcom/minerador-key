import { randomUUID } from "node:crypto";

/**
 * BANCO DE MENTIRA DO PLANO DECLARADO (F4) — em memória, sem rede.
 *
 * A mesma forma do `postgrest-js` usada pelos núcleos do Minerador e dos
 * grupos: `select` com apelido e caminho JSON, `eq`, `in`, `is`, `not(col,
 * "is", null)`, `gt`, `order`, `range`, `insert`/`update` com releitura,
 * `maybeSingle`/`single` e a contagem `head`. A view `editorial_group_summary`
 * é calculada das tabelas, como no banco. Fora dos globs das suítes.
 */

export type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

function caminho(linha: Row, expressao: string): unknown {
  const partes = expressao.split(/->>?/);
  let atual: unknown = linha[partes[0]];
  for (const chave of partes.slice(1)) {
    atual = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Row)[chave] : undefined;
  }
  return atual === undefined ? null : atual;
}

function projeta(linha: Row, select: string): Row {
  if (!select || select === "*") return structuredClone(linha);
  const saida: Row = {};
  for (const bruto of select.split(",")) {
    const item = bruto.trim();
    const [apelido, expressao] = item.includes(":") ? [item.slice(0, item.indexOf(":")), item.slice(item.indexOf(":") + 1)] : [item.split(/->>?/).at(-1) || item, item];
    saida[apelido] = structuredClone(caminho(linha, expressao));
  }
  return saida;
}

export class PlanFakeDb {
  tables: Record<string, Row[]>;
  log: Array<{ table: string; op: string }> = [];
  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    return new PlanFakeQuery(this, table);
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
}

class PlanFakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: unknown = null;
  private columns = "*";
  private returning: string | null = null;
  private faixa: [number, number] | null = null;
  private singleMode: "maybe" | "one" | null = null;
  private head = false;
  private db: PlanFakeDb;
  private table: string;
  constructor(db: PlanFakeDb, table: string) {
    this.db = db;
    this.table = table;
  }
  select(columns = "*", options?: { head?: boolean }) {
    if (this.op === "select") { this.columns = columns; this.head = Boolean(options?.head); } else this.returning = columns;
    return this;
  }
  eq(column: string, value: unknown) { this.filters.push(row => caminho(row, column) === value); return this; }
  is(column: string, value: unknown) { this.filters.push(row => (caminho(row, column) ?? null) === value); return this; }
  gt(column: string, value: unknown) { this.filters.push(row => String(row[column] ?? "") > String(value)); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error(`not não simulado: ${operator}`);
    this.filters.push(row => (row[column] ?? null) !== null);
    return this;
  }
  in(column: string, values: readonly unknown[]) { this.filters.push(row => values.includes(row[column])); return this; }
  order() { return this; }
  range(from: number, to: number) { this.faixa = [from, to]; return this; }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }
  then<A = { data: unknown; error: unknown }, B = never>(onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.exec()).then(onfulfilled, onrejected);
  }
  private finish(rows: Row[], columns: string) {
    const projetadas = rows.map(row => projeta(row, columns));
    if (this.singleMode === "maybe") return { data: projetadas[0] ?? null, error: null };
    if (this.singleMode === "one") return projetadas.length === 1 ? { data: projetadas[0], error: null } : { data: null, error: { code: "PGRST116", message: "not single" } };
    return { data: projetadas, error: null };
  }
  private exec(): { data: unknown; error: unknown; count?: number | null } {
    this.db.log.push({ table: this.table, op: this.op });
    const linhas = this.db.rows(this.table);
    const casa = (row: Row) => this.filters.every(filter => filter(row));
    if (this.op === "select") {
      let encontradas = linhas.filter(casa);
      if (this.head) return { data: null, error: null, count: encontradas.length };
      if (this.faixa) encontradas = encontradas.slice(this.faixa[0], this.faixa[1] + 1);
      return this.finish(encontradas, this.columns);
    }
    if (this.op === "insert") {
      const novas = ((Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[]).map((row): Row => ({ id: randomUUID(), occurred_at: new Date().toISOString(), lock_version: 1, deleted_at: null, group_id: null, ...row }));
      if (this.table === "minerador_keywords") {
        for (const row of novas) if (row.group_id) {
          const grupo = this.db.rows("editorial_groups").find(group => group.id === row.group_id);
          if (!grupo || grupo.marca_id !== row.brand_id) return { data: null, error: { code: "23503", message: "fk_minerador_keywords_group" } };
        }
      }
      linhas.push(...novas);
      return this.returning ? this.finish(novas, this.returning) : { data: null, error: null };
    }
    const alvo = linhas.filter(casa);
    const patch = this.payload as Row;
    // A FK composta (group_id, brand_id) do banco: grupo de outra marca é recusado.
    if (this.table === "minerador_keywords" && typeof patch.group_id === "string") {
      const grupo = this.db.rows("editorial_groups").find(group => group.id === patch.group_id);
      if (alvo.some(row => !grupo || grupo.marca_id !== row.brand_id)) return { data: null, error: { code: "23503", message: "fk_minerador_keywords_group" } };
    }
    for (const row of alvo) Object.assign(row, structuredClone(patch));
    return this.returning ? this.finish(alvo, this.returning) : { data: null, error: null };
  }
}
