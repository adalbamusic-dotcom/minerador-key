/**
 * O NOME DA OPERAÇÃO QUE REALMENTE FOI GRAVADA.
 *
 * O smoke do 18.9 passou inteiro e produziu uma frase falsa:
 *
 *   "A análise do Radar foi concluída e não precisa ser refeita…"
 *
 * ao lado de "0 páginas analisadas · Pronto para analisar · Analisar
 * concorrência". Nada ali estava quebrado — o que foi gravado era a PESQUISA,
 * e o aviso chamava de análise porque quem escreveu o texto olhou o nome do
 * endpoint (`saveRadarAnalysis`) em vez do conteúdo.
 *
 * DERIVAR DO ARTEFATO, NÃO ACEITAR DO CHAMADOR.
 *
 * Um rótulo passado por parâmetro é uma segunda fonte de verdade: treze pontos
 * de chamada, treze oportunidades de divergir, e a divergência só aparece
 * depois — numa frase que o usuário lê e acredita. A versão persistida carrega
 * a prova do que aconteceu; é dela que o nome sai.
 *
 * A ORDEM É A DO CICLO, DO FIM PARA O COMEÇO: uma versão que congelou a
 * investigação também tem análise e pesquisa dentro. Quem responde é a etapa
 * mais avançada que aquele artefato alcançou.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarSearchModeLabel, type RadarPrimarySearchMode } from "./search-mode.ts";

/** O que a versão precisa expor para se nomear. Nada além disso. */
export type RadarPersistedOperationInput = {
  finalizedBundle?: unknown;
  competitiveReport?: unknown;
  analysisCompletedAt?: string | null;
  extractions?: readonly unknown[];
  deepResearch?: { primarySearchMode?: RadarPrimarySearchMode | string | null } | null;
};

/**
 * O GÊNERO DO SUJEITO — 18.10.2 · §10.
 *
 * O smoke leu "O relatório competitivo foi concluída". A frase do aviso é
 * montada com o rótulo na frente e um particípio fixo atrás, e o rótulo mudou
 * de gênero conforme a etapa. Quem sabe o gênero é quem escolhe o rótulo.
 */
export function radarPersistedOperationIsFeminine(payload: RadarPersistedOperationInput | null | undefined): boolean {
  return radarPersistedOperationLabel(payload).startsWith("A ");
}

export function radarPersistedOperationLabel(payload: RadarPersistedOperationInput | null | undefined): string {
  if (!payload) return "A operação do Radar";

  if (payload.finalizedBundle) return "A finalização da investigação";
  if (payload.competitiveReport) return "O relatório competitivo";

  /*
   * ANÁLISE É PÁGINA LIDA — não é a intenção de ler.
   *
   * `analysisCompletedAt` é o carimbo do ANALYZE concluído; `extractions` é a
   * evidência de que houve leitura. Qualquer um dos dois autoriza chamar de
   * análise. NENHUM dos dois, e chamar de análise é a mentira que este módulo
   * existe para impedir: era esse o estado do smoke — zero páginas, pronto
   * para analisar, e um aviso dizendo que a análise tinha terminado.
   */
  if (payload.analysisCompletedAt || (payload.extractions?.length || 0) > 0) return "A análise da concorrência";

  if (payload.deepResearch) {
    const modo = payload.deepResearch.primarySearchMode;
    const destino = modo === "WEB" || modo === "YOUTUBE" || modo === "AMAZON" ? radarSearchModeLabel(modo) : null;
    return destino ? `A Pesquisa ${destino}` : "A pesquisa do Radar";
  }

  /* Versão sem nenhuma das marcas acima: o que ela guarda é decisão de SERP. */
  return "A curadoria da SERP";
}
