/**
 * As corridas brutas moram fora da linha do workflow.
 *
 * MEDIDO EM 2026-09-21: a maior linha de `editorial_workflow_items` tem
 * 8032 kB; a média das três de estágio `radar`, 3528 kB. O peso está nas
 * corridas cruas dos providers, dentro de cada versão de análise.
 *
 * Isso não pesa só na listagem — essa já foi resolvida por view. Pesa no
 * caminho de ESCRITA: `appendRadarAnalysis` lê a linha inteira, acrescenta
 * UMA versão e regrava tudo. Cada análise nova custa ~8 MB de descida mais
 * ~8 MB de subida, e cresce a cada rodada.
 *
 * Este módulo é a fronteira: separa a versão em parte leve (que fica no
 * payload) e corrida (que vai para `radar_analysis_runs`), e as funde de
 * volta na leitura. Os ~20 módulos que leem `amazonSearch` e companhia não
 * mudam — recebem a versão inteira, como sempre receberam.
 */

/**
 * Os quatro campos que saem da linha.
 *
 * São os MESMOS que `pruneRadarAnalysisHistory` já esvazia na leitura: não é
 * critério novo, é o critério que o sistema já usava para dizer o que é
 * transporte e o que é conteúdo. Um teste amarra as duas listas.
 *
 * O valor vazio de cada um importa tanto quanto o nome. `extractions` vira
 * `[]` e os outros viram `null` porque é isso que o schema aceita — uma
 * versão SEM a chave falharia a validação em vez de carregar leve.
 */
export const ANALYSIS_RUN_FIELDS = {
  extractions: [] as unknown,
  competitiveReport: null as unknown,
  youtubeSearch: null as unknown,
  amazonSearch: null as unknown,
} as const;

export type AnalysisRunField = keyof typeof ANALYSIS_RUN_FIELDS;

export const ANALYSIS_RUN_FIELD_NAMES = Object.keys(ANALYSIS_RUN_FIELDS) as AnalysisRunField[];

type Registro = Record<string, unknown>;

function registro(valor: unknown): Registro | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Registro : null;
}

/** Um campo carrega conteúdo, ou já está no estado vazio? */
function temConteudo(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  return true;
}

export type AnalysisRunSplit = {
  /** A versão como vai para o payload do workflow: sem as corridas. */
  light: Registro;
  /** As corridas, como vão para `radar_analysis_runs.payload`. */
  run: Registro;
  /** Havia algo para separar? Falso dispensa a escrita na tabela lateral. */
  hasRun: boolean;
};

/**
 * Separa uma versão de análise em parte leve e corrida.
 *
 * Só move campo que TEM conteúdo. Uma versão que já estava vazia não gera
 * linha na tabela lateral, e não vira uma corrida de quatro nulos que
 * depois seria reidratada por cima de nada.
 */
export function splitAnalysisRun(version: Registro | null | undefined): AnalysisRunSplit {
  const versao = { ...(version || {}) };
  const payload = registro(versao.payload);
  if (!payload) return { light: versao, run: {}, hasRun: false };

  const leve: Registro = { ...payload };
  const run: Registro = {};
  for (const campo of ANALYSIS_RUN_FIELD_NAMES) {
    if (!(campo in payload) || !temConteudo(payload[campo])) continue;
    run[campo] = payload[campo];
    leve[campo] = ANALYSIS_RUN_FIELDS[campo];
  }

  const hasRun = Object.keys(run).length > 0;
  return { light: hasRun ? { ...versao, payload: leve } : versao, run, hasRun };
}

/**
 * Devolve a versão com as corridas de volta.
 *
 * A direção importa: o que manda é a versão LEVE, que é o estado corrente
 * gravado. A corrida só repõe os campos que ela própria carrega — se uma
 * decisão mudou na versão depois que a corrida foi guardada, ela permanece.
 */
export function mergeAnalysisRun(version: Registro | null | undefined, run: Registro | null | undefined): Registro {
  const versao = { ...(version || {}) };
  const corrida = registro(run);
  const payload = registro(versao.payload);
  if (!corrida || !payload) return versao;

  const completo: Registro = { ...payload };
  let mudou = false;
  for (const campo of ANALYSIS_RUN_FIELD_NAMES) {
    if (!(campo in corrida) || !temConteudo(corrida[campo])) continue;
    completo[campo] = corrida[campo];
    mudou = true;
  }
  return mudou ? { ...versao, payload: completo } : versao;
}

/** A versão ainda carrega corrida dentro do payload? */
export function hasInlineAnalysisRun(version: Registro | null | undefined): boolean {
  const payload = registro(registro(version)?.payload);
  if (!payload) return false;
  return ANALYSIS_RUN_FIELD_NAMES.some(campo => temConteudo(payload[campo]));
}
