/**
 * O HISTÓRICO DE ANÁLISES, SEM O PESO QUE NINGUÉM LÊ.
 *
 * ========================== O QUE FOI MEDIDO ==========================
 *
 * O workspace de uma marca real devolvia 6,0 MB, dos quais 5,98 MB — 98,8% —
 * eram `analysisVersions`: 25 versões históricas de UM artigo. Dentro da maior
 * delas, `extractions` (832 KB, o HTML das páginas da SERP) e
 * `competitiveReport` (717 KB).
 *
 * Esse payload atravessa a rede, o `JSON.parse` e a validação Zod a cada F5,
 * e vive em memória enquanto a tela estiver aberta. Selecionar um artigo,
 * expandir uma área ou qualquer re-render passa por ele.
 *
 * ====================== QUEM USA O QUÊ, DE VERDADE ======================
 *
 * Auditado consumidor por consumidor:
 *
 *   a versão CORRENTE       payload inteiro — é a análise em uso
 *   a última APROVADA       payload inteiro — sustenta o que foi aprovado
 *   as demais               versionId, versionNumber, contentHash, status,
 *                           createdAt, origin, createdBy
 *
 * O histórico da tela de análise (`renderHistory`) lista número, status e
 * data. `approvedArticleVersions` filtra por status. `analysis-readback` usa
 * o hash. NENHUM deles abre `extractions` ou `competitiveReport` de uma versão
 * que não seja a corrente.
 *
 * ========================= O QUE ISTO NÃO FAZ =========================
 *
 * NADA É APAGADO DO BANCO. Esta é uma poda de LEITURA: o registro remoto
 * continua íntegro, e quem precisar de uma versão antiga inteira a busca por
 * `versionId`. O que muda é o que viaja na primeira pintura.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/** O mínimo que identifica uma versão para a poda. */
type VersaoPodavel = {
  versionId: string;
  versionNumber: number;
  payload: Record<string, unknown> & { status?: unknown };
};

/**
 * Os campos que só a versão em uso precisa carregar.
 *
 * `extractions` é o conteúdo bruto das páginas analisadas; `competitiveReport`
 * é o relatório derivado delas. Juntos, respondiam por 96% do peso de uma
 * análise medida em produção.
 */
export const RADAR_ANALYSIS_HEAVY_FIELDS = ["extractions", "competitiveReport"] as const;

/**
 * QUAIS VERSÕES FICAM INTEIRAS — e por que exatamente estas duas.
 *
 * A CORRENTE é a que a tela abre. A última APROVADA é a que sustenta o que já
 * foi decidido: sem ela, uma tela que mostra a aprovação perderia a evidência
 * que a justifica. Quando as duas são a mesma, preserva-se uma só.
 */
export function radarAnalysisVersionsToPreserve(versions: readonly VersaoPodavel[]): Set<string> {
  const ordenadas = [...versions].sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber);
  const corrente = ordenadas[0]?.versionId;
  const aprovada = ordenadas.find(item => item.payload?.status === "approved")?.versionId;
  return new Set([corrente, aprovada].filter((item): item is string => Boolean(item)));
}

/**
 * A PODA, aplicada na leitura.
 *
 * Devolve uma cópia: mutar o registro lido seria apagar dado de quem o leu
 * antes por outro caminho, no mesmo processo.
 *
 * Os campos podados viram vazio, não somem — `extractions: []` e
 * `competitiveReport: null` são valores que o schema já aceita, e uma versão
 * antiga sem a chave falharia a validação em vez de carregar leve.
 */
export function pruneRadarAnalysisHistory<T extends VersaoPodavel>(versions: readonly T[]): T[] {
  const preservar = radarAnalysisVersionsToPreserve(versions);
  return versions.map(versao => {
    if (preservar.has(versao.versionId)) return versao;
    return {
      ...versao,
      payload: { ...versao.payload, extractions: [], competitiveReport: null },
    };
  });
}
