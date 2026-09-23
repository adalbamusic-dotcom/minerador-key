import { radarGoogleSerpWriteLock, type RadarGoogleSerpWriteDecision } from "../radar/google-research-write-lock.ts";
import { WorkflowRepository } from "./editorial-repositories.ts";
import { radarAnalysisPayloadFromWorkflowRow } from "./radar-primary-mode.ts";

/**
 * ===== AS DUAS LEITURAS DA TRAVA NA ROTA DA SERP — SDD do Radar, R1b =====
 *
 * A rota /api/editorial/serp pergunta pela trava duas vezes:
 *
 * 1. ANTES de qualquer gasto, com a versão CORRENTE reidratada. A autoridade
 *    de fonte (`resolveRadarResearchSource`) reaproveita essa mesma leitura e
 *    precisa de `youtubeSearch` e `amazonSearch` da corrente, que são campos
 *    de corrida. Só a ÚLTIMA versão do array é reidratada: a trava e o plano de
 *    fonte leem apenas ela, e `findByArticle` reidratava todas (8,22 MB por
 *    leitura no item mais pesado, medido em 2026-09-23, dos quais 5,72 MB de
 *    corridas antigas descartadas).
 *
 * 2. DE NOVO, logo antes de gravar o snapshot. A coleta leva segundos, e um
 *    FINALIZE gravado nesse intervalo por outra aba ou outro dispositivo
 *    deixaria uma SERP nova sob uma investigação já congelada. Aqui basta a
 *    parte LEVE da linha: `finalizedBundle` nunca sai dela (splitAnalysisRun só
 *    move os quatro campos de corrida), então nenhuma corrida é lida.
 *
 * A janela entre a segunda leitura e o insert continua existindo; ela passa de
 * segundos (a chamada ao provider) para milissegundos. Fechá-la exigiria
 * guarda condicional no banco, que é mudança de esquema.
 */

export async function readRadarCurrentAnalysisForSerp(brandId: string, articleId: string, repository = new WorkflowRepository()): Promise<unknown> {
  const linha = await repository.findByArticleHydratingVersions(brandId, articleId, "radar", versoes => {
    const corrente = versoes.at(-1)?.versionId;
    return [typeof corrente === "string" ? corrente : null];
  });
  return radarAnalysisPayloadFromWorkflowRow(linha?.payload);
}

export const RADAR_SERP_FINALIZED_DURING_COLLECTION_MESSAGE =
  "A investigação foi finalizada enquanto esta SERP era coletada. A coleta foi feita e registrada no uso, mas não foi gravada como snapshot: a SERP congelada continua sendo a que a investigação leu. Reabra a investigação antes de coletar de novo.";

export async function radarGoogleSerpWriteLockAtSave(brandId: string, articleId: string, repository = new WorkflowRepository()): Promise<RadarGoogleSerpWriteDecision> {
  const linha = await repository.findByArticleWithoutRuns(brandId, articleId, "radar");
  return radarGoogleSerpWriteLock(radarAnalysisPayloadFromWorkflowRow(linha?.payload));
}
