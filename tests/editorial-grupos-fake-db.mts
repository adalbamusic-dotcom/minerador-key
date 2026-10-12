import { randomUUID } from "node:crypto";

/**
 * BANCO DE MENTIRA DOS GRUPOS (F2) — em memória, sem Supabase, sem rede.
 *
 * Tem a forma do `postgrest-js` que o repositório e o núcleo usam: `select`
 * com apelido e caminho JSON (`apelido:payload->subject->>keywordId`), `eq`,
 * `in`, `is`, `not(col, "is", null)`, `order`, `range`, `upsert` (com
 * `onConflict` e `ignoreDuplicates`), `insert`, `delete` e `maybeSingle`.
 * Fica fora dos globs das suítes (não começa com `arquiteto-`, `radar-` nem
 * `minerador-`): é importado pelos testes da F2.
 */

export type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** Chaves únicas por tabela, como no banco (para o upsert). */
const CHAVES: Record<string, string[]> = {
  editorial_group_articles: ["marca_id", "article_id"],
};

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

export type Logged = { table: string; op: string; select: string };

export class GroupsFakeDb {
  tables: Record<string, Row[]>;
  /** Tabela → erro devolvido em qualquer operação (ex.: M1 não aplicada). */
  failures: Record<string, { code: string; message: string }> = {};
  /** Esconde do `select("*")` (não dos caminhos JSON) — ver o teste do servidor. */
  hiddenFromStar = new Set<string>();
  log: Logged[] = [];
  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    return new GroupsFakeQuery(this, table);
  }
  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }
}

class GroupsFakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "upsert" | "delete" | "update" = "select";
  private payload: unknown = null;
  private columns = "*";
  private options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private faixa: [number, number] | null = null;
  private singleMode: "maybe" | "one" | null = null;
  private head = false;
  private db: GroupsFakeDb;
  private table: string;
  constructor(db: GroupsFakeDb, table: string) {
    this.db = db;
    this.table = table;
  }
  select(columns = "*", options?: { head?: boolean }) { if (this.op === "select") { this.columns = columns; this.head = Boolean(options?.head); } return this; }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this; }
  is(column: string, value: unknown) { this.filters.push(row => (row[column] ?? null) === value); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error(`not não simulado: ${operator}`);
    this.filters.push(row => (row[column] ?? null) !== null);
    return this;
  }
  in(column: string, values: readonly unknown[]) { this.filters.push(row => values.includes(row[column])); return this; }
  order() { return this; }
  range(from: number, to: number) { this.faixa = [from, to]; return this; }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; return this; }
  upsert(rows: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = "upsert"; this.payload = rows; this.options = options; return this; }
  delete() { this.op = "delete"; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }
  then<A = { data: unknown; error: unknown }, B = never>(onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.exec()).then(onfulfilled, onrejected);
  }
  private exec(): { data: unknown; error: unknown; count?: number | null } {
    this.db.log.push({ table: this.table, op: this.op, select: this.columns });
    const failure = this.db.failures[this.table];
    if (failure) return { data: null, error: failure };
    const linhas = this.db.rows(this.table);
    const casa = (row: Row) => this.filters.every(filter => filter(row));
    if (this.op === "select") {
      let encontradas = linhas.filter(casa);
      if (this.columns === "*" && this.db.hiddenFromStar.has(this.table)) encontradas = [];
      if (this.head) return { data: null, error: null, count: encontradas.length };
      if (this.faixa) encontradas = encontradas.slice(this.faixa[0], this.faixa[1] + 1);
      const projetadas = encontradas.map(row => projeta(row, this.columns));
      if (this.singleMode === "maybe") return { data: projetadas[0] ?? null, error: null };
      return { data: projetadas, error: null };
    }
    if (this.op === "insert") {
      const novas = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      for (const row of novas) linhas.push({ id: randomUUID(), occurred_at: new Date().toISOString(), ...row });
      return { data: novas, error: null };
    }
    if (this.op === "upsert") {
      const novas = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const chaves = (this.options.onConflict || "").split(",").filter(Boolean);
      for (const row of novas) {
        // O banco de verdade recusa grupo de outra marca pela FK composta.
        if (this.table === "editorial_group_articles") {
          const grupo = this.db.rows("editorial_groups").find(group => group.id === row.group_id);
          if (!grupo || grupo.marca_id !== row.marca_id) return { data: null, error: { code: "23503", message: "fk_editorial_group_articles_group" } };
        }
        const igual = linhas.find(atual => (chaves.length ? chaves : CHAVES[this.table] || []).every(chave => atual[chave] === row[chave]));
        if (igual) {
          if (!this.options.ignoreDuplicates) Object.assign(igual, row);
          continue;
        }
        linhas.push({ ...row });
      }
      return { data: null, error: null };
    }
    if (this.op === "delete") {
      const restantes = linhas.filter(row => !casa(row));
      this.db.tables[this.table] = restantes;
      return { data: null, error: null };
    }
    const alvo = linhas.filter(casa);
    for (const row of alvo) Object.assign(row, this.payload as Row);
    return { data: alvo, error: null };
  }
}
