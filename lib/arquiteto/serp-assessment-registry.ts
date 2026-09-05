import type { SerpFormationAssessment } from "./serp-formation.ts";

const OUTDATED_REASON = "Substituído por uma nova avaliação SERP deste artigo.";

/**
 * Move a avaliação anterior para o histórico sem revalidar o objeto: o registro
 * é projeção, não validação. Revalidar aqui faria uma avaliação antiga gravada
 * sob outro formato derrubar uma atualização válida.
 */
function toHistory(assessment: SerpFormationAssessment): SerpFormationAssessment {
  return { ...assessment, evaluationStatus: "outdated", outdatedReason: assessment.outdatedReason || OUTDATED_REASON };
}

/**
 * Registro das avaliações SERP por Article.
 *
 * Identidades distintas que estavam sendo confundidas:
 * - `articleId`: identidade lógica do artigo, estável entre execuções;
 * - `assessment.id` (`serp-formation:brand:article:vN`): identidade da versão;
 * - `version`: ordem da versão daquele artigo.
 *
 * Regra: existe exatamente uma avaliação vigente (`active`) por Article; as
 * anteriores continuam no histórico como `outdated`, nunca apagadas.
 */
export type SerpAssessmentMergeResult = {
  /** Lista completa: vigentes + histórico, sem duplicar identidade de versão. */
  assessments: SerpFormationAssessment[];
  /** Versões novas que precisam de confirmação no readback. */
  confirmTargets: SerpFormationAssessment[];
  /** Reexecução que devolveu exatamente o mesmo conteúdo da vigente. */
  unchangedArticleIds: string[];
};

function activeFor(assessments: readonly SerpFormationAssessment[], brandId: string, articleId: string) {
  return assessments
    .filter(item => item.brandId === brandId && item.articleId === articleId && item.evaluationStatus === "active")
    .sort((left, right) => right.version - left.version)
    .at(0);
}

/**
 * Integra as avaliações recém-produzidas ao registro existente.
 *
 * Uma reexecução idêntica (mesmo conteúdo) mantém a versão vigente e não gera
 * duplicata nem falso erro de confirmação. Conteúdo diferente cria a sucessora
 * e move a anterior para o histórico.
 */
export function mergeSerpAssessments(input: {
  existing: readonly SerpFormationAssessment[];
  incoming: readonly SerpFormationAssessment[];
  brandId: string;
}): SerpAssessmentMergeResult {
  // A mesma unidade pode chegar repetida quando a seleção envia o grupo duas
  // vezes; a última resposta é a que vale.
  const incomingByArticle = new Map<string, SerpFormationAssessment>();
  for (const assessment of input.incoming) {
    if (assessment.brandId !== input.brandId) continue;
    incomingByArticle.set(assessment.articleId, assessment);
  }

  let assessments = [...input.existing];
  const confirmTargets: SerpFormationAssessment[] = [];
  const unchangedArticleIds: string[] = [];

  for (const [articleId, assessment] of incomingByArticle) {
    const current = activeFor(assessments, input.brandId, articleId);
    if (current && current.contentHash === assessment.contentHash) {
      unchangedArticleIds.push(articleId);
      continue;
    }
    assessments = assessments
      // Mesma identidade de versão: a resposta nova substitui, não convive.
      .filter(item => item.id !== assessment.id)
      // A vigente anterior vira histórico; nada é apagado.
      .map(item => item.brandId === input.brandId && item.articleId === articleId && item.evaluationStatus === "active"
        ? toHistory(item)
        : item);
    assessments.push(assessment);
    confirmTargets.push(assessment);
  }

  return { assessments, confirmTargets, unchangedArticleIds };
}

/** Projeção corrente: no máximo uma avaliação vigente por Article. */
export function currentSerpAssessments(assessments: readonly SerpFormationAssessment[], brandId: string): SerpFormationAssessment[] {
  const byArticle = new Map<string, SerpFormationAssessment>();
  for (const assessment of assessments) {
    if (assessment.brandId !== brandId || assessment.evaluationStatus !== "active") continue;
    const current = byArticle.get(assessment.articleId);
    if (!current || assessment.version > current.version) byArticle.set(assessment.articleId, assessment);
  }
  return [...byArticle.values()];
}

export type SerpRefreshAttempt = {
  status: "ok" | "error";
  message?: string;
  stage?: string;
  code?: string;
  retryable?: boolean;
};

export type SerpArticleState = {
  /** Estado do processo: só é erro quando não há avaliação vigente. */
  processState: "not_run" | "ready" | "error";
  hasCurrentAssessment: boolean;
  lastAttemptFailed: boolean;
  attemptMessage: string | null;
};

/**
 * Uma tentativa de atualização que falha não invalida a avaliação vigente:
 * estado do processo e resultado da última tentativa são coisas diferentes.
 */
export function resolveSerpArticleState(input: {
  currentAssessment: SerpFormationAssessment | undefined;
  lastAttempt?: SerpRefreshAttempt | null;
}): SerpArticleState {
  const hasCurrentAssessment = Boolean(input.currentAssessment);
  const lastAttemptFailed = input.lastAttempt?.status === "error";
  return {
    processState: hasCurrentAssessment ? "ready" : lastAttemptFailed ? "error" : "not_run",
    hasCurrentAssessment,
    lastAttemptFailed,
    attemptMessage: lastAttemptFailed ? input.lastAttempt?.message || "A última atualização da SERP falhou." : null,
  };
}
