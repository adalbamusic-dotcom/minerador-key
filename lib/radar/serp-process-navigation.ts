export const RADAR_SERP_PROCESS_TABS = ["collection", "competitors", "analysis", "evidence", "review", "history"] as const;

export type RadarSerpProcessTab = typeof RADAR_SERP_PROCESS_TABS[number];

export type RadarSerpProcessState = {
  hasSnapshot: boolean;
  resultCount: number;
  hasAnalysis: boolean;
  pendingDecisions: number;
  selectedCompetitors: number;
  pendingAnalysisCount: number;
  analyzedCount: number;
  evidenceCount: number;
  needsCount: number;
  reviewStatus: "approved" | "rejected" | null;
  historyCount: number;
};

export type RadarSerpProcessTabModel = {
  id: RadarSerpProcessTab;
  label: string;
  status: string;
};

export function nextSerpStep(state: RadarSerpProcessState): RadarSerpProcessTab {
  if (!state.hasSnapshot) return "collection";
  if (!state.hasAnalysis || state.pendingDecisions > 0 || state.selectedCompetitors === 0) return "competitors";
  if (state.pendingAnalysisCount > 0 || state.analyzedCount === 0) return "analysis";
  if (state.reviewStatus === "approved") return "history";
  if (state.evidenceCount > 0 || state.needsCount > 0) return "evidence";
  return "review";
}

export function buildRadarSerpProcessTabs(state: RadarSerpProcessState): RadarSerpProcessTabModel[] {
  return [
    { id: "collection", label: "Coleta", status: state.hasSnapshot ? "✓" : "Pendente" },
    { id: "competitors", label: "Concorrentes", status: state.hasSnapshot ? `${state.selectedCompetitors}/${state.resultCount}` : "Sem dados" },
    { id: "analysis", label: "Análise", status: !state.hasAnalysis ? "Pendente" : state.pendingAnalysisCount > 0 ? "Reaberta" : state.analyzedCount ? "✓" : "Pendente" },
    { id: "evidence", label: "Evidências", status: state.needsCount ? `${state.needsCount} pend.` : state.evidenceCount ? `${state.evidenceCount}` : "—" },
    { id: "review", label: "Revisão", status: state.reviewStatus === "approved" ? "Aprovada" : state.reviewStatus === "rejected" ? "Rejeitada" : "Pendente" },
    { id: "history", label: "Histórico", status: String(state.historyCount) },
  ];
}
