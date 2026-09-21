/**
 * As séries de medição: pesadas para trafegar, irrelevantes para a assinatura.
 *
 * A listagem do Minerador baixava `analise_semantica` inteiro para cada
 * keyword da marca — 1 034 kB em 109 linhas, 98,3% do peso da linha. Quatro
 * arrays respondiam por 209 kB (20%): as duas séries mensais de volume e os
 * dois históricos de medição. Nenhum deles é lido pela tabela; só o painel do
 * DNA os abre, uma keyword por vez.
 *
 * Podá-los da listagem esbarrava na assinatura do pacote aprovado, que cobria
 * o `analise_semantica` inteiro: um leitor podado é um leitor que sabe menos,
 * e as 29 aprovadas apareceriam divergentes. A saída não foi contornar a
 * assinatura e sim corrigi-la. `volumeSearch`, `resultsAllintitle` e
 * `kgrScore` JÁ são campos próprios do conteúdo assinado — a série mensal e os
 * históricos não acrescentavam garantia nenhuma, só faziam uma remedição
 * invalidar a aprovação do SIGNIFICADO da keyword. O esquema v3 os exclui.
 *
 * Esta lista é a fonte única: dela saem a assinatura v3, a view de listagem
 * (`minerador_keywords_listagem`) e a hidratação ao expandir. Elas precisam
 * concordar — uma série podada na view mas assinada no cliente devolveria
 * exatamente a divergência que se quis evitar.
 */
export const MEASUREMENT_SERIES_PATHS: readonly (readonly string[])[] = [
  ["discovery_import", "sourceSnapshot", "metrics", "monthlySearchVolumes"],
  ["volume_measurement", "monthlySearchVolumes"],
  ["dataforseo_keyword_overview_history"],
  ["allintitle_measurement_history"],
];

type Semantic = Record<string, unknown>;

function asRecord(value: unknown): Semantic | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : null;
}

function readPath(semantic: Semantic | null | undefined, path: readonly string[]): unknown {
  let current: unknown = semantic;
  for (const key of path) {
    const record = asRecord(current);
    if (!record || !(key in record)) return undefined;
    current = record[key];
  }
  return current;
}

/** Remove uma trilha sem tocar no resto: só os nós do caminho são copiados. */
function removePath(semantic: Semantic, path: readonly string[]): Semantic {
  const [head, ...rest] = path;
  if (!(head in semantic)) return semantic;
  if (rest.length === 0) {
    const next = { ...semantic };
    delete next[head];
    return next;
  }
  const child = asRecord(semantic[head]);
  if (!child) return semantic;
  const prunedChild = removePath(child, rest);
  if (prunedChild === child) return semantic;
  return { ...semantic, [head]: prunedChild };
}

function writePath(semantic: Semantic, path: readonly string[], value: unknown): Semantic {
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...semantic, [head]: value };
  const child = asRecord(semantic[head]);
  // Sem o nó pai não se inventa estrutura: a série volta onde havia lugar
  // para ela, e uma linha que nunca teve o bloco continua sem ele.
  if (!child) return semantic;
  return { ...semantic, [head]: writePath(child, rest, value) };
}

/** O `analise_semantica` como a listagem o recebe: sem as séries de medição. */
export function withoutMeasurementSeries(semantic: Semantic | null | undefined): Semantic {
  let result: Semantic = { ...(semantic || {}) };
  for (const path of MEASUREMENT_SERIES_PATHS) result = removePath(result, path);
  return result;
}

/** Alguma série sobreviveu? Usado para decidir se vale hidratar a linha. */
export function hasMeasurementSeries(semantic: Semantic | null | undefined): boolean {
  return MEASUREMENT_SERIES_PATHS.some(path => readPath(semantic, path) !== undefined);
}

/**
 * Devolve a linha podada com as séries do registro completo de volta.
 *
 * A direção importa: o que vale é o `pruned`, que é o estado corrente da tela
 * — a hidratação acrescenta as séries e não ressuscita decisão nenhuma que
 * tenha mudado desde o carregamento.
 */
export function withMeasurementSeries(pruned: Semantic | null | undefined, full: Semantic | null | undefined): Semantic {
  let result: Semantic = { ...(pruned || {}) };
  for (const path of MEASUREMENT_SERIES_PATHS) {
    const value = readPath(full, path);
    if (value === undefined) continue;
    result = writePath(result, path, value);
  }
  return result;
}

/** Origem podada da listagem (view criada em 20260921030000). */
export const MINERADOR_LISTING_VIEW = "minerador_keywords_listagem";

/** A tabela completa: readbacks, escrita e a hidratação ao expandir. */
export const MINERADOR_KEYWORDS_TABLE = "minerador_keywords";
