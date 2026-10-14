/**
 * BANCO DE MENTIRA DAS LISTAS LEVES (F2, 2026-10-14) — em memória, sem rede.
 *
 * A forma do `postgrest-js` que as leituras da F2 usam: `select` com apelido e
 * caminho JSON (`apelido:payload->subject->>keywordId`, `->>` devolve texto),
 * `eq`, `in`, `is`, `order` (de verdade, várias colunas, estável), `range`,
 * `limit`, `maybeSingle`. Conta as consultas e os BYTES devolvidos
 * (`JSON.stringify` do `data`), para medir o que cada leitura tira do banco.
 * Fica fora dos globs das suítes (não começa com `arquiteto-`, `radar-` nem
 * `minerador-`).
 */

export type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
export type Logged = { table: string; select: string; rows: number; bytes: number; filters: string[] };

function caminho(linha: Row, expressao: string): unknown {
  const partes = expressao.split(/(->>?)/);
  let atual: unknown = linha[partes[0].trim()];
  let texto = false;
  for (let indice = 1; indice < partes.length; indice += 2) {
    texto = partes[indice] === "->>";
    const chave = partes[indice + 1];
    atual = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Row)[chave] : undefined;
  }
  if (atual === undefined || atual === null) return null;
  if (texto && typeof atual === "object") return JSON.stringify(atual);
  if (texto && typeof atual !== "string") return String(atual);
  return atual;
}

function projeta(linha: Row, select: string): Row {
  if (!select || select === "*") return structuredClone(linha);
  const saida: Row = {};
  for (const bruto of select.split(",")) {
    const item = bruto.trim();
    if (!item) continue;
    const temApelido = /^[A-Za-z_][A-Za-z0-9_]*:/.test(item);
    const [apelido, expressao] = temApelido ? [item.slice(0, item.indexOf(":")), item.slice(item.indexOf(":") + 1)] : [item.split(/->>?/).at(-1) || item, item];
    saida[apelido] = structuredClone(caminho(linha, expressao));
  }
  return saida;
}

export class ListasLevesFakeDb {
  tables: Record<string, Row[]>;
  log: Logged[] = [];
  constructor(tables: Record<string, Row[]>) { this.tables = tables; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any { return new Consulta(this, table); }
  /** Zera o registro (para medir só uma leitura). */
  reset() { this.log = []; }
  bytes() { return this.log.reduce((total, entrada) => total + entrada.bytes, 0); }
}

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private descricao: string[] = [];
  private ordens: Array<{ coluna: string; asc: boolean }> = [];
  private columns = "*";
  private faixa: [number, number] | null = null;
  private limite: number | null = null;
  private single = false;
  private db: ListasLevesFakeDb;
  private table: string;
  constructor(db: ListasLevesFakeDb, table: string) { this.db = db; this.table = table; }
  select(columns = "*") { this.columns = columns; return this; }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); this.descricao.push(`${column}=${String(value)}`); return this; }
  is(column: string, value: unknown) { this.filters.push(row => (row[column] ?? null) === value); this.descricao.push(`${column} is ${String(value)}`); return this; }
  in(column: string, values: readonly unknown[]) { const set = new Set(values); this.filters.push(row => set.has(row[column])); this.descricao.push(`${column} in (${values.length})`); return this; }
  order(column: string, options: { ascending?: boolean } = {}) { this.ordens.push({ coluna: column, asc: options.ascending !== false }); return this; }
  range(from: number, to: number) { this.faixa = [from, to]; return this; }
  limit(n: number) { this.limite = n; return this; }
  maybeSingle() { this.single = true; return this; }
  then<A = { data: unknown; error: unknown }, B = never>(onfulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.exec()).then(onfulfilled, onrejected);
  }
  private exec() {
    /*
     * F6 (2026-10-14): as views da M-L (`*_lista_leve`) só existem no banco de
     * mentira quando o teste as registra; sem isso respondem como o PostgREST
     * sem a migration aplicada (PGRST205), e o leitor cai para a leitura de antes.
     */
    if (this.table.endsWith("_lista_leve") && !(this.table in this.db.tables)) {
      this.db.log.push({ table: this.table, select: this.columns, rows: 0, bytes: 0, filters: this.descricao });
      return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${this.table}' in the schema cache` } };
    }
    let linhas = (this.db.tables[this.table] || []).filter(row => this.filters.every(filter => filter(row)));
    if (this.ordens.length) {
      linhas = linhas.map((row, indice) => ({ row, indice })).sort((a, b) => {
        for (const ordem of this.ordens) {
          const x = a.row[ordem.coluna] as string | number; const y = b.row[ordem.coluna] as string | number;
          if (x === y) continue;
          const cmp = x < y ? -1 : 1;
          return ordem.asc ? cmp : -cmp;
        }
        return a.indice - b.indice;
      }).map(item => item.row);
    }
    if (this.faixa) linhas = linhas.slice(this.faixa[0], this.faixa[1] + 1);
    if (this.limite !== null) linhas = linhas.slice(0, this.limite);
    const data = linhas.map(row => projeta(row, this.columns));
    const devolvido = this.single ? data[0] ?? null : data;
    this.db.log.push({ table: this.table, select: this.columns, rows: data.length, bytes: JSON.stringify(devolvido).length, filters: this.descricao });
    return { data: devolvido, error: null };
  }
}
