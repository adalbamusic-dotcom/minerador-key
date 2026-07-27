import type { RadarAnalysisVersion, RadarPlannerTransfer } from "./analysis-contracts.ts";

export type RadarInvestigationState = "not_started" | "in_progress" | "awaiting_approval" | "approved" | "blocked";
export type RadarTransferState = "not_sent" | "sent" | "update_available";

export function deriveRadarInvestigationState(input: { analysis: RadarAnalysisVersion | null; organicCount: number; pendingOrganicCount: number; conflictCount: number }): RadarInvestigationState {
  if (input.conflictCount > 0) return "blocked";
  if (input.analysis?.payload.status === "approved") return "approved";
  if (!input.analysis) return "not_started";
  if (input.organicCount > 0 && input.pendingOrganicCount === 0) return "awaiting_approval";
  return "in_progress";
}

export function deriveRadarTransferState(input: { currentVersionNumber: number; analysisStatus: string | null; transfer: RadarPlannerTransfer | null; fallbackSentVersionNumber?: number | null }) {
  const sentVersionNumber = input.transfer?.sourceAnalysisVersionNumber ?? input.fallbackSentVersionNumber ?? null;
  if (sentVersionNumber === null) return { state: "not_sent" as const, sentVersionNumber: null, receipt: false };
  const receipt = Boolean(input.transfer && input.analysisStatus === "approved" && input.currentVersionNumber === sentVersionNumber + 1);
  return {
    state: !receipt && input.currentVersionNumber > sentVersionNumber ? "update_available" as const : "sent" as const,
    sentVersionNumber,
    receipt,
  };
}

export function radarInvestigationLabel(state: RadarInvestigationState) {
  return ({ not_started: "Não iniciada", in_progress: "Em investigação", awaiting_approval: "Aguardando aprovação", approved: "Aprovada", blocked: "Bloqueada por conflitos" } as const)[state];
}

export function radarTransferLabel(state: RadarTransferState, sentVersionNumber: number | null) {
  if (state === "not_sent") return "Ainda não enviado";
  if (state === "update_available") return `Versão anterior v${sentVersionNumber} enviada · nova atualização pendente`;
  return sentVersionNumber ? `Enviado ao Planejador · v${sentVersionNumber}` : "Enviado ao Planejador";
}
