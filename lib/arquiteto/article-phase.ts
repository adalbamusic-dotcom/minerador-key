import type { ProvisionalArticleGroup } from "./contracts.ts";

export type ArticlePhaseProcessState = "available" | "processing" | "completed" | "pending" | "partial" | "error" | "blocked";

export type ArticlePhaseProcessStates = {
  logic: ArticlePhaseProcessState;
  serp: ArticlePhaseProcessState;
  ai: ArticlePhaseProcessState;
  review: ArticlePhaseProcessState;
};

type ArticleBoundaryKeyword = Record<string, unknown> & {
  isPublished?: boolean;
  status?: string;
};

const isPublishedKeyword = (keyword: ArticleBoundaryKeyword) => Boolean(
  keyword.isPublished || keyword.status?.toLowerCase() === "publicado",
);

const stringValue = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * A fase Artigos não atribui Silo a uma keyword nova. O vínculo de origem
 * (por exemplo, lista_id) permanece intacto para preservar proveniência; os
 * campos que a UI e os adaptadores tratavam como atribuição de Silo ou
 * hierarquia de Silo são neutralizados. Roles do Article (principal,
 * secundária e reforço) continuam em reviewRole. Identidades publicadas
 * permanecem imutáveis.
 */
export function normalizeArticleWorkingCopyKeyword<T extends ArticleBoundaryKeyword>(keyword: T): T {
  if (isPublishedKeyword(keyword)) return keyword;
  return {
    ...keyword,
    siloId: null,
    silo_id: null,
    siloName: null,
    computedHierarquia: null,
    hierarquia: null,
  } as T;
}

/**
 * Mantém o vínculo de Silo somente como proteção de um Article publicado. Um
 * grupo novo continua sem Silo até a formação explícita da etapa Silos.
 */
export function normalizeArticleProvisionalGroup(group: ProvisionalArticleGroup): ProvisionalArticleGroup {
  const keywords = group.keywords.map(keyword => normalizeArticleWorkingCopyKeyword(keyword as ArticleBoundaryKeyword) as typeof keyword);
  const published = keywords.find(keyword => isPublishedKeyword(keyword as ArticleBoundaryKeyword));
  const publishedRecord = published as unknown as ArticleBoundaryKeyword | undefined;
  const protectedSiloId = publishedRecord
    ? stringValue(publishedRecord.siloId)
      || stringValue(publishedRecord.silo_id)
      // Some legacy published rows only expose the existing Silo through the
      // canonical list reference. Never use this fallback for a new keyword:
      // normalizeArticleWorkingCopyKeyword already cleared it in that case.
      || stringValue(publishedRecord.lista_id)
    : null;
  const protectedSiloName = publishedRecord ? stringValue(publishedRecord.siloName) : null;

  return {
    ...group,
    keywords,
    suggestedSiloId: protectedSiloId,
    suggestedSiloName: protectedSiloName,
  };
}

export type SerpAssessmentCompletenessInput = {
  queryCount: number;
  queriedKeywordDnaIds: readonly string[];
  snapshotCount: number;
  recommendationCount: number;
  unassociatedRecommendationCount?: number;
};

/** Conflito é resultado diagnóstico; não reduz uma coleta integral a parcial. */
export function isSerpAssessmentComplete(input: SerpAssessmentCompletenessInput) {
  const queriedCount = input.queriedKeywordDnaIds.length;
  return queriedCount > 0
    && input.queryCount === queriedCount
    && input.snapshotCount === queriedCount
    && input.recommendationCount === queriedCount
    && (input.unassociatedRecommendationCount || 0) === 0;
}

export type ArticlePhaseProcessInput = {
  hasArticleInput: boolean;
  logicProcessing: boolean;
  hasLogicalOutput: boolean;
  serpProcessing: boolean;
  hasSerpAssessments: boolean;
  serpHasIncompleteAssessment: boolean;
  serpHasError: boolean;
  aiProcessing: boolean;
  aiHasOutput: boolean;
  reviewProcessing: boolean;
  hasArticleDna: boolean;
  allArticleDnaApproved: boolean;
  pendingAiReview: boolean;
  unresolvedConflicts: number;
};

/** Resolve os quatro estados da fase sem misturar execução e decisão editorial. */
export function resolveArticlePhaseProcessStates(input: ArticlePhaseProcessInput): ArticlePhaseProcessStates {
  const logic = input.logicProcessing
    ? "processing"
    : input.hasLogicalOutput
      ? "completed"
      : input.hasArticleInput ? "available" : "blocked";

  const serp = input.serpProcessing
    ? "processing"
    : input.serpHasError && !input.hasSerpAssessments
      ? "error"
      : !input.hasSerpAssessments
        ? input.hasArticleInput ? "available" : "blocked"
        : input.serpHasIncompleteAssessment ? "partial" : "completed";

  const ai = input.aiProcessing
    ? "processing"
    : input.aiHasOutput
      ? "completed"
      : input.hasArticleInput ? "available" : "blocked";

  const review = input.reviewProcessing
    ? "processing"
    : !input.hasArticleDna
      ? input.hasArticleInput ? "pending" : "blocked"
      : input.pendingAiReview || input.unresolvedConflicts > 0 || !input.allArticleDnaApproved
        ? "pending"
        : "completed";

  return { logic, serp, ai, review };
}

export type ArticleSiloReadinessState = "not_started" | "blocked" | "ready" | "assigned";

export type ArticleSiloReadiness = {
  state: ArticleSiloReadinessState;
  label: string;
  reasons: string[];
};

export type ArticleSiloReadinessInput = {
  hasArticleDna: boolean;
  siloAssigned: boolean;
  reviewPending: boolean;
  unresolvedConflicts: number;
  approved: boolean;
  kgrDecisionPending: boolean;
};

/**
 * Derivador único de `READY_FOR_SILOS`.
 *
 * Silo nunca é pré-condição para fechar o artigo: é o passo seguinte. Um
 * artigo só fica pronto para Silos quando a fase Artigos terminou — definição
 * consolidada, revisão humana resolvida, conflitos obrigatórios resolvidos,
 * aprovação concluída e decisão KGR resolvida quando exigida.
 */
export function resolveArticleSiloReadiness(input: ArticleSiloReadinessInput): ArticleSiloReadiness {
  if (input.siloAssigned) return { state: "assigned", label: "Silo definido", reasons: [] };
  if (!input.hasArticleDna) return { state: "not_started", label: "Não iniciado", reasons: ["A definição do artigo ainda não foi consolidada."] };
  const reasons = [
    ...(input.reviewPending ? ["A revisão humana do artigo ainda não foi concluída."] : []),
    ...(input.unresolvedConflicts > 0 ? [`${input.unresolvedConflicts} conflito(s) obrigatório(s) sem resolução.`] : []),
    ...(!input.approved ? ["A definição do artigo ainda não foi aprovada."] : []),
    ...(input.kgrDecisionPending ? ["A decisão KGR do artigo ainda não foi resolvida."] : []),
  ];
  return reasons.length
    ? { state: "blocked", label: "Aguardando fechamento do artigo", reasons }
    : { state: "ready", label: "Pronto para Silos", reasons: [] };
}

export type ArticleRadarGateInput = {
  selectedArticleCount: number;
  consolidatedArticleCount: number;
  approvedArticleCount: number;
  pendingAiReviewCount: number;
  unresolvedConflictCount: number;
  missingSerpAssessmentCount: number;
  incompleteSerpAssessmentCount: number;
  pendingKgrHumanDecisionCount?: number;
  /** Silos e Links Internos fecham a fase do Arquiteto antes do Radar. */
  missingSiloCount?: number;
  missingApprovedInternalLinkGraphCount?: number;
};

/**
 * Gate de transferência ao Radar.
 *
 * O Radar recebe unidade estruturalmente completa: ArticleDNA aprovado, Silo
 * definido, InternalLinkGraph aprovado e evidência SERP íntegra. Aprovar o
 * ArticleDNA não envia ao Radar — são eventos distintos.
 */
export function articleRadarGateIssues(input: ArticleRadarGateInput): string[] {
  const issues: string[] = [];
  if (input.selectedArticleCount === 0) issues.push("Selecione ao menos um artigo.");
  if (input.consolidatedArticleCount < input.selectedArticleCount) issues.push("ArticleDNA ainda não consolidado para todos os artigos selecionados.");
  if (input.approvedArticleCount < input.selectedArticleCount) issues.push("A revisão humana do ArticleDNA ainda não foi aprovada para todos os artigos selecionados.");
  if (input.pendingAiReviewCount > 0) issues.push("Existem propostas da IA aguardando revisão humana.");
  if (input.unresolvedConflictCount > 0) issues.push("Existem conflitos obrigatórios sem decisão humana.");
  if ((input.pendingKgrHumanDecisionCount || 0) > 0) issues.push("Existe decisão humana Sim/Não do KGR do artigo pendente.");
  if (input.missingSerpAssessmentCount > 0) issues.push("A avaliação SERP ainda não existe para todos os artigos selecionados.");
  if (input.incompleteSerpAssessmentCount > 0) issues.push("A avaliação SERP está incompleta para um ou mais artigos selecionados.");
  if ((input.missingSiloCount || 0) > 0) issues.push("Existe artigo sem Silo definido; conclua a etapa Silos antes do Radar.");
  if ((input.missingApprovedInternalLinkGraphCount || 0) > 0) issues.push("Existe artigo sem InternalLinkGraph aprovado; conclua os Links Internos antes do Radar.");
  return [...new Set(issues)];
}

export type ArticleRadarReadinessState = "blocked" | "ready" | "sent";

export type ArticleRadarReadiness = {
  state: ArticleRadarReadinessState;
  label: string;
  reasons: string[];
};

export type ArticleRadarReadinessInput = {
  siloReadiness: ArticleSiloReadiness;
  siloArtifactsApproved: boolean;
  internalLinkGraphApproved: boolean;
  serpAssessmentComplete: boolean;
  alreadySent: boolean;
};

/**
 * Derivador de `READY_FOR_RADAR`, distinto de `READY_FOR_SILOS`.
 *
 * Pronto para Silos significa que a fase Artigos fechou. Pronto para Radar
 * exige a fase do Arquiteto inteira: Silo definido com SiloDNA/SiloPage
 * aprovados, InternalLinkGraph aprovado e evidência SERP íntegra.
 */
export function resolveArticleRadarReadiness(input: ArticleRadarReadinessInput): ArticleRadarReadiness {
  if (input.alreadySent) return { state: "sent", label: "Enviado ao Radar", reasons: [] };
  const reasons = [
    ...(input.siloReadiness.state === "assigned" ? [] : ["O artigo ainda não tem Silo definido."]),
    ...(input.siloArtifactsApproved ? [] : ["SiloDNA e SiloPage ainda não foram aprovados."]),
    ...(input.internalLinkGraphApproved ? [] : ["O InternalLinkGraph ainda não foi aprovado."]),
    ...(input.serpAssessmentComplete ? [] : ["A avaliação SERP ainda não está íntegra."]),
  ];
  return reasons.length
    ? { state: "blocked", label: "Aguardando Silos e Links Internos", reasons }
    : { state: "ready", label: "Pronto para o Radar", reasons: [] };
}
