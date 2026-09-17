/**
 * ===== O START DA AMAZON — AMAZON_SEARCH_1 · §19, §20 e §21 =====
 *
 * ================== A MESMA DISCIPLINA DO YOUTUBE ==================
 *
 * Contexto confirmado → alvo conferido → corrida gravada como COLLECTING →
 * readback → só então o provider. Se qualquer passo falhar, o provider nunca é
 * alcançado e nada é cobrado.
 *
 * As PORTAS são as mesmas (`radarStartPorts`): a leitura do artigo, do estado e
 * a escrita da versão não mudam por perfil. Duplicá-las criaria duas políticas
 * de persistência para o mesmo contêiner — e uma delas envelheceria sozinha.
 *
 * ============ §20 · DOIS STARTS CONCORRENTES, UM SÓ GASTO ============
 *
 * A trava não é retentada. Dois cliques simultâneos leriam o mesmo estado e
 * gravariam duas corridas equivalentes — e as duas cobrariam. Quem perde para
 * ANTES de qualquer chamada.
 */

import {
  RadarStartError,
  ensureRadarAnalysisContext,
  type RadarStartPorts,
} from "./radar-youtube-start.ts";
import { OptimisticLockError } from "./editorial-db";
import { VersionedRadarAnalysisSchema, createRadarAnalysisSuccessor, type RadarAnalysisVersion } from "../radar/analysis-contracts.ts";
import {
  RADAR_AMAZON_PROVIDER_ENDPOINT,
  buildRadarAmazonRunFingerprint,
  buildRadarAmazonStartedRun,
  type RadarAmazonQuery,
  type RadarAmazonSearchRun,
} from "../radar/amazon-search-run.ts";
import { radarDecideResearchSource, radarResearchPlanOfAnalysis, type RadarPrimarySearchMode } from "../radar/search-mode.ts";
import type { RadarAmazonEditorialIntent, RadarAmazonResearchTarget } from "../radar/amazon-editorial-target.ts";

const correnteDe = (estado: { analyses: RadarAnalysisVersion[] } | null) =>
  estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;

export async function startRadarAmazonRun(
  input: {
    brandId: string;
    articleId: string;
    articleDnaVersionId: string;
    actorId: string;
    queries: readonly RadarAmazonQuery[];
    limitations?: readonly string[];
    runId: string;
    startedAt: string;
    /** §18 · a configuração que originou esta coleta, gravada com ela. */
    editorialSetup?: { intent: RadarAmazonEditorialIntent; target: RadarAmazonResearchTarget } | null;
  },
  ports: RadarStartPorts,
): Promise<{ run: RadarAmazonSearchRun; analysis: RadarAnalysisVersion; currentMode: RadarPrimarySearchMode | null }> {
  const article = await ports.loadArticle({ brandId: input.brandId, articleId: input.articleId });
  if (!article) throw new RadarStartError("article_dna_not_found", "O ArticleDNA canônico deste artigo não foi encontrado para esta marca.", 404);
  if (article.versionId !== input.articleDnaVersionId) {
    throw new RadarStartError("radar_article_dna_mismatch", "A versão do ArticleDNA enviada diverge da versão canônica do artigo.", 409);
  }

  const contexto = await ensureRadarAnalysisContext({ brandId: input.brandId, articleId: input.articleId, actorId: input.actorId }, ports);

  /*
   * O ALVO SAI DO QUE ESTÁ GRAVADO, e a fonte é aditiva.
   *
   * Um artigo que já coletou o Google como apoio continua podendo coletar a
   * Amazon, que é a fonte obrigatória do alvo comercial. O que a autoridade
   * recusa é a TROCA de alvo — e ela recusa antes de qualquer gasto.
   */
  const plano = radarResearchPlanOfAnalysis(contexto.analysis.payload);
  const decisao = radarDecideResearchSource({
    currentTarget: plano.primaryTarget,
    source: "AMAZON_SERP",
    intendedTarget: "AMAZON",
  });
  const currentMode = plano.primaryTarget;

  const anterior = contexto.analysis.payload.amazonSearch;
  const run = buildRadarAmazonStartedRun({
    runId: input.runId,
    /* Uma coleta nova SUCEDE a anterior; ela não a reescreve. */
    runVersion: (anterior?.runVersion || 0) + 1,
    startedAt: input.startedAt,
    startedBy: input.actorId,
    fingerprint: buildRadarAmazonRunFingerprint({
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      queryIds: input.queries.map(consulta => consulta.queryId),
    }),
    queries: input.queries,
    endpoint: RADAR_AMAZON_PROVIDER_ENDPOINT,
    limitations: input.limitations,
  });

  const comprometida = await createRadarAnalysisSuccessor(contexto.analysis, {
    amazonSearch: run,
    /*
     * §18 · O ALVO É GRAVADO JUNTO COM A CORRIDA QUE ELE ORIGINOU.
     *
     * Na mesma versão, não numa escrita à parte. Separá-las abriria a janela em
     * que a corrida existe e a configuração que a justifica não — e quem
     * reabrisse o artigo veria uma coleta paga sem saber o que ela foi olhar.
     */
    ...(input.editorialSetup
      ? {
        amazonEditorialSetup: {
          intent: input.editorialSetup.intent,
          target: input.editorialSetup.target,
          declaredAt: input.startedAt,
          declaredBy: input.actorId,
        },
      }
      : {}),
    ...(decisao.declaresTarget
      ? {
        researchTarget: {
          primaryTarget: decisao.primaryTarget,
          declaredAt: input.startedAt,
          declaredBy: input.actorId,
          reason: "Declarado pela primeira coleta de SERP da Amazon deste artigo.",
        },
      }
      : {}),
  }, input.actorId);

  try {
    await ports.appendAnalysis({ brandId: input.brandId, articleId: input.articleId, expectedLock: contexto.lockVersion, analysis: comprometida });
  } catch (erro) {
    if (erro instanceof OptimisticLockError) {
      throw new RadarStartError("radar_start_contended", "Outra coleta deste artigo começou primeiro. Recarregue a investigação antes de tentar de novo.", 409);
    }
    throw erro;
  }

  /*
   * §20 · READBACK ANTES DO PROVIDER.
   *
   * A corrida precisa estar LEGÍVEL no banco, com o mesmo `runId`, antes de
   * qualquer chamada paga. Sem isso, uma gravação aceita e não visível deixaria
   * a coleta paga sem onde pousar.
   */
  const relido = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  const corrente = correnteDe(relido);
  if (!corrente || corrente.payload.amazonSearch?.runId !== run.runId || corrente.payload.amazonSearch?.state !== "COLLECTING") {
    throw new RadarStartError("radar_run_readback_failed", "A corrida da Amazon não foi confirmada no banco; nenhuma consulta foi executada.", 503);
  }

  return { run: VersionedRadarAnalysisSchema.parse(corrente).payload.amazonSearch!, analysis: corrente, currentMode };
}

/**
 * FECHA A MESMA CORRIDA QUE O START ABRIU.
 *
 * O `runId` é conferido contra o que está gravado: se outra coleta assumiu o
 * artigo no meio do caminho, esta não sobrescreve o trabalho dela.
 *
 * §15 · O caminho da FALHA passa pela mesma porta: uma coleta que não trouxe
 * nada fecha como `COLLECTION_FAILED`, com o motivo preservado e o mesmo
 * `runId` — nunca uma corrida nova.
 */
export async function finishRadarAmazonRun(
  input: { brandId: string; articleId: string; actorId: string; runId: string; run: RadarAmazonSearchRun },
  ports: RadarStartPorts,
): Promise<{ analysis: RadarAnalysisVersion; run: RadarAmazonSearchRun }> {
  if (input.run.runId !== input.runId) throw new RadarStartError("radar_run_identity_mismatch", "A corrida a gravar não é a que foi iniciada.", 500);

  const estado = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  const corrente = correnteDe(estado);
  if (!estado || !corrente) throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para este artigo.", 404);
  if (corrente.payload.amazonSearch?.runId !== input.runId) {
    throw new RadarStartError("radar_run_superseded", "Outra coleta assumiu este artigo enquanto esta executava; o resultado não foi gravado por cima.", 409);
  }

  const proxima = await createRadarAnalysisSuccessor(corrente, { amazonSearch: input.run }, input.actorId);
  await ports.appendAnalysis({ brandId: input.brandId, articleId: input.articleId, expectedLock: estado.lockVersion, analysis: proxima });

  const relido = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  const confirmado = correnteDe(relido);
  if (!confirmado || confirmado.payload.amazonSearch?.runId !== input.runId || confirmado.payload.amazonSearch?.state === "COLLECTING") {
    throw new RadarStartError("radar_result_readback_failed", "A coleta foi executada e o resultado não foi confirmado no banco.", 503);
  }
  return { analysis: confirmado, run: confirmado.payload.amazonSearch };
}
