import { buildRadarDeepResearchView } from "./deep-research-view.ts";
import { buildRadarSerpCurationSummary, radarAnalysisMatchesSerp } from "./serp-curation.ts";
import { buildRadarSerpView } from "./snapshot-view.ts";
import { latestRadarR5SerpRecord } from "./r5-sequential.ts";
import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import type { RadarEditorialArticleModel } from "./editorial-article-model.ts";
import type { RadarEditorialBlueprint } from "./editorial-blueprint.ts";
import type { SerpCollectionRecord } from "../editorial/contracts.ts";

/**
 * ===== A FOTOGRAFIA DO GOOGLE, FORA DO REACT — 1.1 · §8 =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * `blueprint_json`, `suggested_title`, `promise` e `sections` saíam VAZIOS no
 * CSV de um artigo Google que tinha, na tela, um Blueprint editorial completo.
 *
 * A causa não era o export: era a autoridade. O modelo competitivo do pipeline
 * do Google (`RadarCompetitiveObservedModel`) só era construído dentro de
 * `radar-page.tsx`, a partir de estado que a tela já tinha carregado. Todo
 * consumidor de servidor — a resolução canônica, o dossiê, o export — recebia
 * `googleObserved: undefined` e, com ele, `blueprint: null`. O adapter fazia a
 * coisa certa com a entrada errada.
 *
 * ==================== POR QUE AQUI, E NÃO NA ROTA ====================
 *
 * A tela não pode ser a única a saber montar isso (§1 do gate anterior: ler
 * React para reconstruir dado é o defeito, não a solução). O caminho é chamar
 * os MESMOS builders de domínio que ela chama, na mesma ordem, com as mesmas
 * entradas — e é exatamente isso que esta função faz.
 *
 * ==================== ZERO PROVIDER ====================
 *
 * Tudo aqui é leitura do que já foi pago: o snapshot da SERP gravado, a versão
 * de análise gravada e o fundamento do Arquiteto. Nada coleta.
 */
export type RadarGoogleReadModel = {
  observed: RadarCompetitiveObservedModel;
  blueprint: RadarEditorialBlueprint;
  articleModel: RadarEditorialArticleModel;
};

export function radarGoogleReadModelOfAnalysis(input: {
  context: RadarArticleResearchContext;
  analysis: RadarAnalysisVersion | null;
  /** Os snapshots gravados desta marca e deste artigo. */
  serpRecords: readonly SerpCollectionRecord[];
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
}): RadarGoogleReadModel {
  const registro = latestRadarR5SerpRecord([...input.serpRecords], input.articleId);
  const view = registro ? buildRadarSerpView(registro) : null;

  /*
   * ===== A ANÁLISE SÓ VALE PARA O SNAPSHOT QUE A ORIGINOU =====
   *
   * É a mesma trava que a tela aplica. Uma análise da v2 lida contra o
   * snapshot da v3 produziria uma fotografia montada com curadoria de uma
   * coleta e páginas de outra — e ela pareceria perfeitamente válida.
   */
  const analise = radarAnalysisMatchesSerp({
    analysis: input.analysis,
    brandId: input.brandId,
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    view,
  }) ? input.analysis : null;

  const escopo = {
    brandId: input.brandId,
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
  };
  const curadoria = buildRadarSerpCurationSummary({ view, analysis: analise, scope: escopo });

  const vista = buildRadarDeepResearchView({
    context: input.context,
    record: analise?.payload.deepResearch || null,
    running: false,
    snapshot: view ? { query: view.query, organicResults: view.organicResults } : null,
    extractions: analise?.payload.extractions || [],
    extractionFailures: analise?.payload.extractionFailures.length || 0,
    extractionFailureUrls: (analise?.payload.extractionFailures || []).map(item => item.url),
    selectedReferences: curadoria.selectedCompetitors,
    curationConfirmed: curadoria.curationStarted,
    model: analise?.payload.competitiveReport?.observedCompetitiveModel || null,
    diagnostic: view?.diagnostic
      ? { dominantIntent: view.diagnostic.dominantIntent, dominantFormats: view.diagnostic.dominantFormats }
      : null,
    analysisConfirmed: Boolean(analise?.payload.analysisCompletedAt),
    persistedAnalysis: analise?.payload || null,
    verifiedSources: analise?.payload.verifiedSources || [],
    /*
     * §2 · FROZEN > LIVE. A leitura viva continua sendo calculada ao lado, mas
     * quem responde pelo que já foi finalizado é o que está gravado.
     */
    finalizedBundle: analise?.payload.finalizedBundle || null,
  });

  /*
   * ===== §8 · O QUE SAI DAQUI É O QUE A TELA RENDERIZA =====
   *
   * Não é "o equivalente": é o MESMO objeto, da mesma passagem. A rota já
   * remontava o artigo-modelo por conta própria, com um argumento a mais no
   * builder do blueprint do que a tela usa — e um argumento a mais é tudo o
   * que é preciso para as duas leituras divergirem sem ninguém notar.
   *
   * Devolver a vista inteira torna a paridade ESTRUTURAL: não existem duas
   * cadeias para comparar.
   */
  return { observed: vista.observed, blueprint: vista.blueprint, articleModel: vista.articleModel };
}
