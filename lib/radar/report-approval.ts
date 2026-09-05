/**
 * A AUTORIDADE ÚNICA DE APROVAÇÃO DO RADAR.
 *
 * Existiam duas. O Workbench gravava um flag em estado local — e a própria
 * mensagem dizia "aprovado localmente; isso não cria uma versão remota nem
 * envia ao Planejador". A página de detalhe fazia o trabalho inteiro. Duas
 * telas, dois significados para o mesmo verbo, e o pacote final só existia
 * se alguém lembrasse de visitar `/radar/{articleId}`.
 *
 * Aprovar passa a ser UM ato, definido aqui:
 *
 *   1. o portão confere que as evidências estão resolvidas;
 *   2. o relatório competitivo é construído;
 *   3. `buildRadarEvidencePackage` monta o pacote;
 *   4. `buildRadarPlannerHandoff` monta o handoff;
 *   5. a sucessora é persistida com os três dentro;
 *   6. o READBACK decide — não o POST que não lançou exceção.
 *
 * Os builders NÃO são reimplementados: são os mesmos que a página de detalhe
 * já usava. Este módulo os orquestra e é o único lugar onde a ordem vive.
 *
 * A persistência entra por PORTA (`persist`), não por import: o domínio não
 * conhece fetch nem Supabase, e as duas telas injetam o writer que já têm.
 */

import { analysisApprovalIssues, createRadarAnalysisSuccessor, type RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { RadarKgrStrategy } from "./strategy-context.ts";
import { buildRadarCompetitiveReport } from "./competitive-report.ts";
import { buildRadarEvidencePackage } from "./evidence-package.ts";
import { buildRadarPlannerHandoff } from "./planner-handoff.ts";

/* ------------------------------ o portão --------------------------------- */

export type ExpertEvidenceReadiness = {
  /** A leitura remota terminou e corresponde à seleção corrente. */
  loaded: boolean;
  /** A chave lida bate com a chave pedida — senão é resposta de outra pergunta. */
  selectionMatches: boolean;
  error: boolean;
  pendingCount: number;
  blockedCount: number;
};

export type RadarApprovalGateInput = {
  analysis: RadarAnalysisVersion | null;
  hasResearch: boolean;
  brandIdSelected: boolean;
  kgrStrategy?: RadarKgrStrategy | null;
  expertEvidence: ExpertEvidenceReadiness;
};

/**
 * O QUE IMPEDE APROVAR — em uma lista, para as duas telas mostrarem o mesmo.
 *
 * Antes, cada tela decidia por conta própria o que "pronto" significava: o
 * Workbench nem checava o especialista. Uma tela recusando o que a outra
 * aceita é a mesma pergunta com duas respostas.
 */
export function radarReportApprovalIssues(input: RadarApprovalGateInput): string[] {
  const issues: string[] = [];
  if (!input.analysis) issues.push("Não há análise para aprovar.");
  if (!input.hasResearch) issues.push("A pesquisa da SERP precisa estar carregada.");
  if (!input.brandIdSelected) issues.push("Selecione uma Brand antes de aprovar.");

  const expert = input.expertEvidence;
  if (!expert.loaded || !expert.selectionMatches) {
    issues.push("Aguarde a leitura remota do ExpertBrief antes de aprovar.");
  }
  if (expert.error) {
    issues.push("A contribuição do especialista não pôde ser lida; a aprovação permanece bloqueada.");
  }
  if (expert.pendingCount || expert.blockedCount) {
    issues.push("Revise todas as contribuições remotas do especialista antes de aprovar o relatório.");
  }

  if (input.analysis) issues.push(...analysisApprovalIssues(input.analysis, input.kgrStrategy));
  return issues;
}

/* ---------------------------- a aprovação -------------------------------- */

export type RadarApprovalPersistResult = {
  persistenceMode: string;
  readbackConfirmed: boolean;
};

export type ApproveRadarReportInput = RadarApprovalGateInput & {
  analysis: RadarAnalysisVersion;
  research: Parameters<typeof buildRadarCompetitiveReport>[0]["research"];
  article: Parameters<typeof buildRadarCompetitiveReport>[0]["article"];
  radarItemId: string;
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string;
  siloDnaVersionId: string | null;
  radarItemState: string;
  selectedBy: string;
  expertEvidencePayload: Parameters<typeof buildRadarPlannerHandoff>[0]["expertEvidence"];
  /** Escrita + readback. O domínio não conhece transporte. */
  persist: (successor: RadarAnalysisVersion) => Promise<RadarApprovalPersistResult>;
  /** Transição do RadarItem, quando o estado pedir. */
  transitionToApproved?: () => void;
  now?: string;
};

export type RadarApprovalResult =
  | { ok: false; reason: "BLOCKED"; issues: string[] }
  | { ok: false; reason: "NOT_PERSISTED"; message: string }
  | {
    ok: true;
    approvedAt: string;
    analysisVersionId: string;
    analysisVersionNumber: number;
    evidencePackageHash: string | null;
    handoffId: string | null;
  };

export async function approveRadarReport(input: ApproveRadarReportInput): Promise<RadarApprovalResult> {
  const issues = radarReportApprovalIssues(input);
  if (issues.length) return { ok: false, reason: "BLOCKED", issues };

  const approvalVersionId = crypto.randomUUID();
  const approvalVersionNumber = input.analysis.versionNumber + 1;
  const approvedAt = input.now || new Date().toISOString();

  const report = await buildRadarCompetitiveReport({
    payload: input.analysis.payload,
    article: input.article,
    research: input.research,
    radarItemId: input.radarItemId,
    analysisVersionId: approvalVersionId,
  } as Parameters<typeof buildRadarCompetitiveReport>[0]);

  const packageData = await buildRadarEvidencePackage(input.analysis.payload, {
    radarItemId: input.radarItemId,
    analysisVersionId: approvalVersionId,
    analysisVersionNumber: approvalVersionNumber,
  } as Parameters<typeof buildRadarEvidencePackage>[1]);

  const handoff = await buildRadarPlannerHandoff({
    packageData,
    approvedReport: report,
    brandId: input.brandId,
    radarItemId: input.radarItemId,
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    articleDnaContentHash: input.articleDnaContentHash,
    siloDnaVersionId: input.siloDnaVersionId,
    sourceAnalysisVersionId: approvalVersionId,
    sourceAnalysisVersionNumber: approvalVersionNumber,
    selectedBy: input.selectedBy,
    humanDecisions: input.analysis.payload.keywordDecisions.map(decision => ({
      id: `keyword:${decision.keywordId}`,
      target: `keyword:${decision.keywordId}`,
      decision: decision.decision,
      note: decision.note,
    })) as Parameters<typeof buildRadarPlannerHandoff>[0]["humanDecisions"],
    expertEvidence: input.expertEvidencePayload,
    now: approvedAt,
  } as Parameters<typeof buildRadarPlannerHandoff>[0]);

  const successor = await createRadarAnalysisSuccessor(
    input.analysis,
    {
      status: "approved",
      competitiveReport: report,
      approvedAt,
      approvedBy: input.selectedBy,
      plannerPackage: packageData,
      plannerHandoff: handoff,
    } as Parameters<typeof createRadarAnalysisSuccessor>[1],
    input.selectedBy,
    approvalVersionId,
  );

  // O READBACK é quem encerra. Um POST que não lançou exceção não é prova de
  // que o remoto guardou o que foi enviado.
  const saved = await input.persist(successor);
  if (saved.persistenceMode !== "remote" || !saved.readbackConfirmed) {
    return {
      ok: false,
      reason: "NOT_PERSISTED",
      message: "A aprovação foi aplicada apenas na recuperação local; a persistência remota não foi confirmada.",
    };
  }

  if (input.radarItemState === "awaiting_approval") input.transitionToApproved?.();

  return {
    ok: true,
    approvedAt,
    analysisVersionId: approvalVersionId,
    analysisVersionNumber: approvalVersionNumber,
    evidencePackageHash: (packageData as { contentHash?: string } | null)?.contentHash ?? null,
    handoffId: (handoff as { handoffId?: string } | null)?.handoffId ?? null,
  };
}
