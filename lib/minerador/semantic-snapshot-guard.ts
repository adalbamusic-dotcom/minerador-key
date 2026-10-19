/**
 * O COMPARE-AND-SWAP DO DNA DA KEYWORD SEM ESTOURAR A URL (2026-10-19).
 *
 * O defeito: os dois gravadores que fazem compare-and-swap do
 * `analise_semantica` (o núcleo do cadastro do Assunto e o
 * `constrainKeywordSnapshot` da Lógica/aprovação) mandavam o DNA INTEIRO como
 * filtro na URL do PostgREST (`analise_semantica=eq.<json>`). As páginas
 * publicadas da AdalbaPro têm DNA de 17–20 kB, que viram 24–27 kB na URL; o
 * gateway do Supabase recusa a partir de ~25,2 kB com um "400 Bad Request"
 * (medido em 19/10 com GET só de leitura). No "Aprovar e enviar" do verde a 7ª
 * keyword passou do limite, o erro subiu cru e a rota respondeu 503 com 6
 * Assuntos já gravados.
 *
 * A troca, sem migration e com a mesma garantia na prática:
 * - o filtro vai por CHAVE de topo (`analise_semantica->chave=eq.<json>`),
 *   das menores para as maiores, até um orçamento fixo da URL
 *   (`SEMANTIC_SNAPSHOT_URL_BUDGET`) — atômico no UPDATE;
 * - as chaves que não cabem (séries e históricos grandes) e a lista de
 *   chaves são conferidas por uma releitura do DNA inteiro logo antes do
 *   UPDATE (`semanticSnapshotStillCurrent`); diferente = nada é gravado.
 * O limite residual (escrita concorrente só numa chave grande nos
 * milissegundos entre a releitura e o UPDATE) só fecha com `row_version`
 * (migration 20260923140000, ainda não aplicada no remoto). A releitura depois
 * do UPDATE continua com cada gravador.
 */

export const SEMANTIC_SNAPSHOT_URL_BUDGET = 12_000;

type Semantic = Record<string, unknown>;

/** Só chaves simples viram caminho de filtro (`->chave`); o resto vai para a releitura. */
const CHAVE_DE_FILTRO = /^[A-Za-z0-9_]+$/;

export type SemanticSnapshotPlan = {
  /** `analise_semantica->chave` + o JSON do valor, prontos para `.filter(col, "eq", valor)`. */
  filters: Array<{ column: string; value: string }>;
  /** Chaves conferidas pela releitura (não couberam no orçamento, nulas ou de nome não simples). */
  overflowKeys: string[];
  /** O tamanho, na URL, do que foi para os filtros. */
  urlCost: number;
};

export function planSemanticSnapshot(semantic: Semantic, budget: number = SEMANTIC_SNAPSHOT_URL_BUDGET): SemanticSnapshotPlan {
  const itens = Object.entries(semantic).map(([key, value]) => {
    const json = value === undefined ? "null" : JSON.stringify(value);
    return { key, value, json, cost: encodeURIComponent(`analise_semantica->${key}`).length + encodeURIComponent(`eq.${json}`).length + 2 };
  }).sort((a, b) => a.cost - b.cost || a.key.localeCompare(b.key));
  const filters: SemanticSnapshotPlan["filters"] = [];
  const overflowKeys: string[] = [];
  let urlCost = 0;
  for (const item of itens) {
    if (!CHAVE_DE_FILTRO.test(item.key) || item.value === null || item.value === undefined || urlCost + item.cost > budget) { overflowKeys.push(item.key); continue; }
    filters.push({ column: `analise_semantica->${item.key}`, value: item.json });
    urlCost += item.cost;
  }
  return { filters, overflowKeys: overflowKeys.sort(), urlCost };
}

type SnapshotQuery<T> = {
  is: (column: string, value: null) => T;
  filter: (column: string, operator: string, value: string) => T;
};

/**
 * Aplica o compare-and-swap do DNA no UPDATE com a URL limitada. DNA nulo =
 * `is null`; DNA vazio = `eq.{}` (cabe); senão um filtro por chave até o
 * orçamento. Quem chama confere as `overflowKeys` com
 * `semanticSnapshotStillCurrent` antes (sem chave fora, a releitura é dispensável).
 */
export function constrainSemanticSnapshot<T extends SnapshotQuery<T>>(query: T, semantic: Semantic | null, plan: SemanticSnapshotPlan | null = semantic ? planSemanticSnapshot(semantic) : null): T {
  if (semantic === null) return query.is("analise_semantica", null);
  if (!Object.keys(semantic).length) return query.filter("analise_semantica", "eq", "{}");
  let guarded = query;
  for (const filtro of (plan ?? planSemanticSnapshot(semantic)).filters) guarded = guarded.filter(filtro.column, "eq", filtro.value);
  return guarded;
}

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor as Semantic).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, canonico(v)]));
}

/** O mesmo DNA, sem depender da ordem das chaves (o jsonb devolve reordenado). */
export function sameSemanticSnapshot(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonico(a ?? null)) === JSON.stringify(canonico(b ?? null));
}

type ReadClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * A releitura do DNA inteiro logo antes do UPDATE: `true` = ainda é o lido
 * (pode gravar com os filtros por chave); `false` = mudou ou sumiu (nada é
 * gravado). Erro de leitura sobe para quem chama, que o trata por item.
 */
export async function semanticSnapshotStillCurrent(client: ReadClient, input: { brandId: string; keywordId: string; semantic: Semantic | null }): Promise<boolean> {
  const result = await client.from("minerador_keywords").select("id,analise_semantica")
    .eq("id", input.keywordId).eq("brand_id", input.brandId).is("deleted_at", null).maybeSingle();
  if (result.error) throw result.error;
  const row = result.data as { id?: unknown; analise_semantica?: unknown } | null;
  if (!row || String(row.id) !== input.keywordId) return false;
  return sameSemanticSnapshot(row.analise_semantica ?? null, input.semantic);
}

/** Precisa da releitura antes do UPDATE? (há chave fora dos filtros). */
export function semanticSnapshotNeedsReread(semantic: Semantic | null, plan: SemanticSnapshotPlan | null): boolean {
  return Boolean(semantic && plan && plan.overflowKeys.length);
}
