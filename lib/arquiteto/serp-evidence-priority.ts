type SerpEvidenceAssessmentInput = {
  evaluationStatus: "active" | "outdated";
  queriedKeywordDnaIds?: string[];
  keywordDnaReferences: Array<{ keywordId: string }>;
  snapshots: Array<{ keywordId: string; organicResults: unknown[] }>;
  recommendations: Array<{ keywordId: string }>;
  formationEvidence?: { keywordObservations: Array<{ keywordId: string; insufficientEvidence: boolean }> };
  notes: string[];
};

export type SerpEvidencePriority = "prioritaria" | "complementar" | "insuficiente";

export interface SerpEvidencePriorityResolution {
  priority: SerpEvidencePriority;
  reason: string;
  limitations: string[];
}

/**
 * Define somente a precedência de apresentação da evidência SERP.
 * Não altera grupos, papéis, slug ou qualquer artefato consolidado.
 */
export function resolveSerpEvidencePriority(
  assessment: SerpEvidenceAssessmentInput,
): SerpEvidencePriorityResolution {
  const queriedKeywordIds = assessment.queriedKeywordDnaIds?.length
    ? assessment.queriedKeywordDnaIds
    : assessment.keywordDnaReferences.map(reference => reference.keywordId);
  const observations = assessment.formationEvidence?.keywordObservations || [];
  const limitations = [
    ...(assessment.evaluationStatus === "outdated" ? ["Assessment desatualizado."] : []),
    ...(assessment.notes || []),
  ];

  if (assessment.evaluationStatus !== "active") {
    return {
      priority: "insuficiente",
      reason: "Assessment desatualizado não prevalece sobre a hipótese ou a revisão atual.",
      limitations,
    };
  }

  const complete = Boolean(
    assessment.formationEvidence
    && queriedKeywordIds.length > 0
    && assessment.snapshots.length === queriedKeywordIds.length
    && assessment.recommendations.length === queriedKeywordIds.length
    && observations.length === queriedKeywordIds.length
    && queriedKeywordIds.every(keywordId => {
      const observation = observations.find(item => item.keywordId === keywordId);
      const snapshot = assessment.snapshots.find(item => item.keywordId === keywordId);
      const recommendation = assessment.recommendations.find(item => item.keywordId === keywordId);
      return Boolean(observation && snapshot && recommendation && snapshot.organicResults.length && !observation.insufficientEvidence);
    }),
  );

  if (!complete) {
    return {
      priority: "insuficiente",
      reason: "A cobertura não é completa, representativa ou suficiente para prevalecer sobre a hipótese.",
      limitations: [...new Set([...limitations, "Não usar esta SERP como desempate automático."])],
    };
  }

  return {
    priority: "prioritaria",
    reason: "Cobertura completa e observável: a recomendação SERP prevalece na apresentação, mas exige decisão humana.",
    limitations,
  };
}
