/**
 * A CADEIA CORRENTE — snapshot, curadoria, análise, relatório e aprovação.
 *
 * O smoke mostrou "Resultados SERP 8 · Concorrentes selecionados 7 ·
 * Referências aprovadas 8" na mesma tela. Três números que pareciam descrever a
 * mesma coisa e não descreviam, e não havia um lugar onde alguém pudesse
 * conferir a qual versão cada um pertencia.
 *
 * Este módulo monta essa conferência: cada entidade marcada CURRENT declara o
 * snapshot e a impressão digital da curadoria a que pertence, e a cadeia diz se
 * elas fecham. Quando não fecham, `breaks` nomeia a divergência.
 *
 * O histórico não some — mas o que não é da versão corrente também não pode
 * ser apresentado como se fosse.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { SerpReviewRecord } from "../editorial/contracts.ts";
import type { RadarSerpView } from "./snapshot-view.ts";
import type { RadarSerpReviewCurrentness } from "./serp-review-state.ts";
import { buildRadarSerpSelectionProjection, radarOrganicDecisionKey, type RadarSerpSelectionScope } from "./serp-curation.ts";

export type RadarChainSnapshot = {
  snapshotId: string;
  snapshotHash: string;
  version: number;
  organicResultIds: string[];
};

export type RadarChainCuration = {
  curationVersionId: string;
  snapshotId: string;
  snapshotHash: string;
  selectedResultIds: string[];
  fingerprint: string;
};

export type RadarChainAnalysis = {
  analysisVersionId: string;
  snapshotId: string;
  curationFingerprint: string;
  attemptedResultIds: string[];
  successfulResultIds: string[];
  failedResultIds: string[];
};

export type RadarChainReport = {
  reportVersionId: string;
  analysisVersionId: string;
  snapshotId: string;
  curationFingerprint: string;
};

export type RadarChainApproval = {
  approvalVersionId: string;
  snapshotId: string;
  snapshotHash: string;
  curationFingerprint: string;
  selectedResultIds: string[];
};

export type RadarCurrentStateChain = {
  snapshot: RadarChainSnapshot | null;
  curation: RadarChainCuration | null;
  analysis: RadarChainAnalysis | null;
  report: RadarChainReport | null;
  approval: RadarChainApproval | null;
  consistent: boolean;
  /** As divergências, nomeadas. Vazio quando tudo pertence à mesma cadeia. */
  breaks: string[];
};

/**
 * A impressão digital da curadoria: as chaves selecionadas, em ordem.
 *
 * É o mesmo formato que a aprovação da SERP já gravava nas notas, o que torna
 * a comparação entre aprovação e seleção corrente direta em vez de inferida.
 *
 * Produz a mesma string que `radarSelectionFingerprint` (as chaves da projeção
 * já vêm ordenadas); esta versão recebe os ids prontos, para a cadeia poder ser
 * montada a partir de qualquer fonte.
 */
export function radarCurationFingerprint(selectedResultIds: readonly string[]): string {
  return [...selectedResultIds].sort().join("|");
}

export function buildRadarCurrentStateChain(input: {
  view: RadarSerpView | null | undefined;
  analysis: RadarAnalysisVersion | null | undefined;
  review?: SerpReviewRecord | null;
  reviewCurrentness?: RadarSerpReviewCurrentness;
  scope?: RadarSerpSelectionScope;
}): RadarCurrentStateChain {
  const breaks: string[] = [];

  const snapshot: RadarChainSnapshot | null = input.view?.record.research && input.view.hash
    ? {
      snapshotId: input.view.record.id,
      snapshotHash: input.view.hash,
      version: input.view.version,
      organicResultIds: input.view.organicResults.map(radarOrganicDecisionKey),
    }
    : null;

  /*
   * A curadoria corrente só existe quando a análise pertence a ESTE snapshot.
   * Uma análise de outro snapshot não é curadoria antiga: é outra investigação.
   */
  const projection = buildRadarSerpSelectionProjection(input.view, input.analysis, input.scope);
  const analysisPayload = input.analysis?.payload;
  const compativel = Boolean(projection.compatible && analysisPayload && snapshot && analysisPayload.serpSnapshotId === snapshot.snapshotId);

  const selectedResultIds = compativel ? projection.selectedKeys : [];
  const fingerprint = radarCurationFingerprint(selectedResultIds);

  const curation: RadarChainCuration | null = compativel && input.analysis && analysisPayload
    ? {
      curationVersionId: input.analysis.versionId,
      snapshotId: analysisPayload.serpSnapshotId,
      snapshotHash: analysisPayload.serpSnapshotHash,
      selectedResultIds,
      fingerprint,
    }
    : null;

  const analysis: RadarChainAnalysis | null = compativel && input.analysis && analysisPayload && analysisPayload.extractions.length
    ? (() => {
      const porUrl = new Map(projection.selectedRows.map(row => [row.result.url, row.key]));
      const successfulResultIds = analysisPayload.extractions.flatMap(page => {
        const key = porUrl.get(page.url);
        return key ? [key] : [];
      });
      const successo = new Set(successfulResultIds);
      return {
        analysisVersionId: input.analysis.versionId,
        snapshotId: analysisPayload.serpSnapshotId,
        curationFingerprint: fingerprint,
        attemptedResultIds: selectedResultIds,
        successfulResultIds,
        failedResultIds: selectedResultIds.filter(key => !successo.has(key)),
      };
    })()
    : null;

  const relatorio = compativel ? analysisPayload?.competitiveReport || null : null;
  const report: RadarChainReport | null = relatorio && input.analysis
    ? {
      reportVersionId: relatorio.id,
      analysisVersionId: relatorio.analysis.versionId,
      snapshotId: relatorio.serp.snapshotId,
      curationFingerprint: fingerprint,
    }
    : null;

  /*
   * A APROVAÇÃO SÓ É CORRENTE COM SNAPSHOT E CURADORIA ATUAIS.
   *
   * Aprovação de outro snapshot, ou aprovada sobre uma curadoria que mudou
   * depois, é histórico — e histórico não conta como estado de agora.
   */
  const review = input.review;
  const aprovacaoCorrente = Boolean(
    review
    && review.status === "approved"
    && snapshot
    && review.snapshotId === snapshot.snapshotId
    && input.reviewCurrentness === "current",
  );
  const approval: RadarChainApproval | null = aprovacaoCorrente && review && snapshot
    ? {
      approvalVersionId: review.id,
      snapshotId: review.snapshotId,
      snapshotHash: snapshot.snapshotHash,
      curationFingerprint: fingerprint,
      selectedResultIds,
    }
    : null;

  /* ----------------------------- as quebras ------------------------------- */

  if (snapshot && analysisPayload && !compativel) {
    breaks.push("A análise carregada descreve outro snapshot, versão ou curadoria; ela não é a investigação corrente.");
  }
  if (report && snapshot && report.snapshotId !== snapshot.snapshotId) {
    breaks.push("O relatório pertence a outro snapshot.");
  }
  if (report && input.analysis && report.analysisVersionId !== input.analysis.versionId) {
    breaks.push("O relatório pertence a outra versão da análise; gere o relatório novamente.");
  }
  if (review?.status === "approved" && !aprovacaoCorrente) {
    breaks.push("Existe aprovação preservada, mas ela não descreve o snapshot e a curadoria atuais.");
  }

  return { snapshot, curation, analysis, report, approval, consistent: breaks.length === 0, breaks };
}
