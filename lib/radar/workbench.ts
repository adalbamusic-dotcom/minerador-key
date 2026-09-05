export const RADAR_WORKBENCH_STAGES = [
  "serp",
  "referencias",
  "analise-serp",
  "evidencias-adicionais",
  "relatorio",
  "aprovacao-planejador",
] as const;

export type RadarWorkbenchStage = typeof RADAR_WORKBENCH_STAGES[number];
export type RadarWorkbenchStageState = "done" | "current" | "pending" | "optional";
export type RadarAdditionalEvidenceState = "not-needed" | "not-started" | "in-progress" | "reviewed";

export type RadarWorkbenchReferenceCounts = {
  total: number;
  primary: number;
  support: number;
  format: number;
  pending: number;
  excluded: number;
  own: number;
};

export type RadarActivityEvent = {
  label: string;
  detail: string;
  at: string | null;
};

export type RadarActivityModel = {
  requestsSent: number;
  contributionsReceived: number;
  pending: number;
  lastUpdatedAt: string | null;
  events: RadarActivityEvent[];
  sourceLabel: string;
};

export type RadarWorkbenchStageModel = {
  id: RadarWorkbenchStage;
  label: string;
  state: RadarWorkbenchStageState;
  detail: string;
};

export type RadarWorkbenchModel = {
  articleId: string;
  title: string;
  keyword: string;
  silo: string;
  hierarchy: string;
  articleDnaVersion: string;
  publication: string;
  mode: string;
  serp: {
    provider: string;
    capturedAt: string | null;
    resultCount: number;
    status: string;
  };
  references: RadarWorkbenchReferenceCounts;
  analysis: {
    status: string;
    detail: string;
  };
  additionalEvidence: {
    state: RadarAdditionalEvidenceState;
    specialist: string;
    contentCount: number;
    contributionCount: number;
  };
  activity: RadarActivityModel;
  report: {
    status: string;
    detail: string;
  };
  nextAction: string;
  stages: RadarWorkbenchStageModel[];
};

export const RADAR_WORKBENCH_STAGE_LABELS: Record<RadarWorkbenchStage, string> = {
  serp: "SERP",
  referencias: "Referências",
  "analise-serp": "Análise SERP",
  "evidencias-adicionais": "Evidências adicionais",
  relatorio: "Relatório",
  "aprovacao-planejador": "Aprovação / Planejador",
};

export function resolveRadarWorkbenchStage(value: string | null | undefined): RadarWorkbenchStage {
  return RADAR_WORKBENCH_STAGES.includes(value as RadarWorkbenchStage) ? value as RadarWorkbenchStage : "serp";
}

export function resolveRadarWorkbenchArticleId(input: { selectedId?: string | null; expandedId?: string | null; fallbackId?: string | null; rowIds: string[] }): string | null {
  const available = new Set(input.rowIds);
  return [input.selectedId, input.expandedId, input.fallbackId].find(id => Boolean(id && available.has(id))) || null;
}

export function summarizeRadarReferenceCounts(input: Array<{
  role: "primary" | "support" | "format" | "own" | "excluded" | "pending";
}>): RadarWorkbenchReferenceCounts {
  const counts: RadarWorkbenchReferenceCounts = { total: input.length, primary: 0, support: 0, format: 0, pending: 0, excluded: 0, own: 0 };
  for (const item of input) counts[item.role] += 1;
  return counts;
}

export function deriveRadarNextAction(input: {
  identityReady: boolean;
  serpCollected: boolean;
  referencesPending: number;
  analysisStarted: boolean;
  analysisQueue: number;
  pagesAnalyzed: number;
  reportGenerated: boolean;
  reportApproved: boolean;
  sentToPlanner: boolean;
  additionalEvidenceState: RadarAdditionalEvidenceState;
}): string {
  if (!input.identityReady) return "Confira a identidade recebida do Arquiteto antes de continuar.";
  if (!input.serpCollected) return "Colete ou recupere a SERP deste artigo.";
  if (input.referencesPending > 0) return `Revise ${input.referencesPending} referência(s) pendente(s).`;
  if (!input.analysisStarted) return "Inicie a análise SERP usando o snapshot existente.";
  if (input.analysisQueue > 0) return `Analise ${input.analysisQueue} referência(s) selecionada(s).`;
  if (input.pagesAnalyzed === 0) return "Selecione referências comparáveis para formar a amostra.";
  if (!input.reportGenerated) return "Revise a análise SERP e gere a prévia do relatório.";
  if (!input.reportApproved) return "Revise as necessidades e aprove o relatório.";
  if (!input.sentToPlanner) return "Envie as evidências aprovadas ao Planejador quando fizer sentido.";
  if (input.additionalEvidenceState === "in-progress") return "Revise as evidências adicionais antes de encerrar o Radar.";
  return "Investigação consolidada; histórico e proveniência permanecem disponíveis.";
}

export function buildRadarWorkbenchStages(input: {
  serpCollected: boolean;
  serpResultCount: number;
  referencesReviewed: boolean;
  referenceCounts: RadarWorkbenchReferenceCounts;
  analysisStarted: boolean;
  pagesAnalyzed: number;
  additionalEvidenceState: RadarAdditionalEvidenceState;
  reportGenerated: boolean;
  reportApproved: boolean;
  sentToPlanner: boolean;
}): RadarWorkbenchStageModel[] {
  const current = !input.serpCollected
    ? "serp"
    : !input.referencesReviewed
      ? "referencias"
      : !input.analysisStarted || input.pagesAnalyzed === 0
        ? "analise-serp"
        : !input.reportGenerated || !input.reportApproved || !input.sentToPlanner
          ? "relatorio"
          : "aprovacao-planejador";

  const isDone = (stage: RadarWorkbenchStage) => stage === "serp"
    ? input.serpCollected
    : stage === "referencias"
      ? input.referencesReviewed
      : stage === "analise-serp"
        ? input.pagesAnalyzed > 0
        : stage === "evidencias-adicionais"
          ? input.additionalEvidenceState === "reviewed"
          : stage === "relatorio"
            ? input.reportGenerated
            : input.reportApproved && input.sentToPlanner;

  return RADAR_WORKBENCH_STAGES.map(stage => {
    const state: RadarWorkbenchStageState = stage === "evidencias-adicionais" && input.additionalEvidenceState === "not-needed"
      ? "optional"
      : isDone(stage)
        ? "done"
        : stage === current
          ? "current"
          : "pending";
    const detail = stage === "serp"
      ? input.serpCollected ? `Concluída · ${input.serpResultCount} resultado(s)` : "Aguardando coleta"
      : stage === "referencias"
        ? input.referencesReviewed ? `${input.referenceCounts.primary} principais · ${input.referenceCounts.support} apoio` : `${input.referenceCounts.pending} pendente(s)`
        : stage === "analise-serp"
          ? input.pagesAnalyzed > 0 ? `${input.pagesAnalyzed} página(s) analisada(s)` : input.analysisStarted ? "Amostra aguardando" : "Não iniciada"
          : stage === "evidencias-adicionais"
            ? input.additionalEvidenceState === "not-needed" ? "Opcional · não necessária" : input.additionalEvidenceState === "reviewed" ? "Revisadas" : input.additionalEvidenceState === "in-progress" ? "Em andamento" : "Não iniciadas"
            : stage === "relatorio"
              ? input.reportGenerated ? "Prévia disponível" : "Aguardando análise"
              : input.sentToPlanner ? "Enviado ao Planejador" : input.reportApproved ? "Aprovado · pronto para envio" : "Aguardando aprovação";
    return { id: stage, label: RADAR_WORKBENCH_STAGE_LABELS[stage], state, detail };
  });
}
