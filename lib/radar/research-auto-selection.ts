/**
 * A SELEÇÃO AUTOMÁTICA — o máximo de referência útil, sem teto artificial.
 *
 * Na Fase 1 ninguém marca dezoito caixinhas para depois clicar em confirmar. O
 * sistema decide sozinho o que entra, usando os sinais que a investigação já
 * produziu, e REGISTRA O MOTIVO de cada decisão. A pessoa continua podendo
 * mudar tudo — só não é obrigada a decidir nada para o fluxo andar.
 *
 * NÃO EXISTE LIMITE DE QUANTIDADE. Se o universo tem dezoito páginas úteis,
 * dezoito entram; se tem trinta, entram trinta. O que exclui uma referência é
 * ela não servir — nunca uma cota.
 *
 * O QUE EXCLUI, E POR QUÊ:
 *
 *   elemento da própria SERP  não é página, não há o que extrair
 *   domínio próprio           é nosso: comparar conosco não é benchmark
 *   vídeo e rede social       formato observável, mas a extração não rende texto
 *   sem relevância observada  não está na principal nem se repete
 *
 * Todo o resto entra, com o papel que a classificação já apurou.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarArticleResearchContext } from "./article-research-context.ts";
import { buildRadarCompetitorUniverse, type RadarCompetitorUniverse, type RadarExecutedQuery } from "./competitor-universe.ts";
import type { RadarDeepResearchRecord } from "./deep-research.ts";
import { buildRadarResearchCuration, buildRadarResearchCurationView, type RadarResearchCuration, type RadarResearchDecision } from "./research-curation.ts";
import { buildRadarResearchReferences, radarReferenceAppearanceSummary, type RadarResearchReference } from "./research-reference.ts";
import { RADAR_DEFAULT_SEARCH_MODE, radarResultBelongsToMode, type RadarPrimarySearchMode } from "./search-mode.ts";

export type RadarAutoDecision = { decision: RadarResearchDecision; reason: string };

/**
 * A decisão automática de UMA referência.
 *
 * Cada ramo devolve o motivo que a tela mostra e que fica gravado na curadoria:
 * "selecionada porque recorre em três consultas" é auditável; "selecionada"
 * sozinha não é.
 */
export function autoDecideRadarReference(reference: RadarResearchReference, mode: RadarPrimarySearchMode = RADAR_DEFAULT_SEARCH_MODE): RadarAutoDecision {
  const recorrencia = radarReferenceAppearanceSummary(reference);
  const tipo = reference.appearances[0]?.resultType || null;

  /*
   * O MODO DECIDE O QUE É AMOSTRA.
   *
   * No modo Web, um vídeo é formato observado — não entra no benchmark de
   * texto. No modo YouTube, uma página de artigo é referência cruzada — não
   * entra no benchmark de vídeo. Os dois continuam visíveis; nenhum dos dois
   * contamina a régua do outro.
   */
  if (!radarResultBelongsToMode(mode, tipo)) {
    return mode === "WEB"
      ? { decision: "format", reason: "Resultado de vídeo: registra o formato que a busca premia, fora do benchmark de texto." }
      : { decision: "excluded", reason: "Página de texto na pesquisa de vídeo: referência cruzada, fora do benchmark audiovisual." };
  }

  if (reference.classification === "SERP_FEATURE") {
    return { decision: "excluded", reason: "Elemento da própria SERP: não é uma página para analisar." };
  }
  if (reference.siloCompatibility === "own_domain") {
    return { decision: "excluded", reason: "Página do nosso próprio domínio: serve de contexto, não de concorrente." };
  }
  if (reference.classification === "FORMAT_REFERENCE") {
    return { decision: "format", reason: `Vídeo ou rede social (${reference.domain}): registra o formato que a busca premia, fora do benchmark de texto.` };
  }
  if (reference.classification === "AUTHORITY_SOURCE") {
    return { decision: "authority", reason: `Domínio de autoridade (${reference.domain}): entra como fonte, não como concorrente a imitar.` };
  }
  if (reference.classification === "EDITORIAL_COMPETITOR") {
    return { decision: "primary", reason: `Concorrente editorial. ${recorrencia}` };
  }
  if (reference.classification === "COMMERCIAL_COMPETITOR" || reference.classification === "PRODUCT_REFERENCE") {
    return { decision: "support", reason: `Página comercial: evidência de intenção de compra na busca. ${recorrencia}` };
  }
  if (reference.classification === "LATERAL_REFERENCE") {
    /*
     * O REFORÇO CONTINUA MAIS CONSERVADOR QUE A SECUNDÁRIA.
     *
     * A hierarquia é Principal > Secundária > Reforço, e ela não se dissolve
     * porque a leitura de entidade ficou mais generosa. Aqui vale quando
     * recorre entre consultas ou quando há relação OBSERVADA com o assunto —
     * `unknown` não promove. Uma aparição única de reforço sobre a qual nada
     * se sabe é assunto vizinho, e assunto vizinho não entra na amostra só
     * para engrossar número.
     */
    return reference.queryCount > 1
      || reference.entityCompatibility === "compatible"
      || reference.entityCompatibility === "related"
      ? { decision: "support", reason: `Referência lateral com relação observada com o tema. ${recorrencia}` }
      : { decision: "excluded", reason: "Aparece só em uma consulta de reforço e não menciona a entidade do artigo." };
  }
  return { decision: "excluded", reason: "Não aparece na consulta principal nem se repete entre as consultas." };
}

export type RadarAutoSelectionResult = {
  universe: RadarCompetitorUniverse | null;
  references: RadarResearchReference[];
  curation: RadarResearchCuration | null;
  /** Quantas entram na amostra analisável (concorrente, apoio ou fonte). */
  selected: number;
  /** Quantas ficaram de fora, e por quê — agrupado para a tela. */
  excluded: number;
  reasons: Array<{ referenceId: string; url: string; decision: RadarResearchDecision; reason: string }>;
};

/**
 * As consultas executadas, reconstruídas do próprio registro.
 *
 * A evidência de cada consulta já está gravada — canônica e auxiliares. Montar
 * o universo a partir dela mantém uma fonte só: o que a tela mostra é o que
 * ficou persistido, não um segundo cálculo feito com outros dados.
 */
export function radarExecutedQueriesFromRecord(record: RadarDeepResearchRecord): RadarExecutedQuery[] {
  return record.queries
    .filter(query => query.evidence && query.keyword)
    .map(query => ({
      queryId: query.queryId,
      keyword: query.keyword as string,
      role: query.role,
      keywordId: query.keywordId,
      serpClass: query.serpClass,
      results: (query.evidence?.results || []).map(result => ({
        position: result.position,
        url: result.url,
        title: result.title,
        domain: result.domain,
        inferredType: result.inferredType,
      })),
    }));
}

/**
 * O universo inteiro, decidido de uma vez.
 *
 * Devolve a curadoria pronta para gravar junto com o registro da investigação:
 * uma escrita, com o motivo de cada referência dentro dela.
 */
export function buildRadarAutomaticResearchCuration(input: {
  record: RadarDeepResearchRecord;
  context: RadarArticleResearchContext;
  confirmedBy: string;
  now?: string;
  mode?: RadarPrimarySearchMode;
}): RadarAutoSelectionResult {
  const mode = input.mode || input.record.primarySearchMode || RADAR_DEFAULT_SEARCH_MODE;
  const queries = radarExecutedQueriesFromRecord(input.record);
  if (!queries.length) return { universe: null, references: [], curation: null, selected: 0, excluded: 0, reasons: [] };

  const universe = buildRadarCompetitorUniverse({ queries, context: input.context });
  const references = buildRadarResearchReferences({ queries, universe, context: input.context });

  const draft: Record<string, RadarAutoDecision> = {};
  const reasons: RadarAutoSelectionResult["reasons"] = [];
  for (const reference of references) {
    const decidida = autoDecideRadarReference(reference, mode);
    draft[reference.referenceId] = decidida;
    reasons.push({ referenceId: reference.referenceId, url: reference.url, decision: decidida.decision, reason: decidida.reason });
  }

  const view = buildRadarResearchCurationView({ references, draft });
  return {
    universe,
    references,
    curation: buildRadarResearchCuration({ view, confirmedBy: input.confirmedBy, now: input.now }),
    selected: view.selectedCount,
    excluded: view.rows.filter(row => row.decision === "excluded").length,
    reasons,
  };
}
