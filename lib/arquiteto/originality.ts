import type { ArticleDNA, ArchitectConflict } from "./contracts.ts";

export function buildOriginalityReport(article: ArticleDNA, internalConflicts: ArchitectConflict[]) {
  const uniqueContributions = [
    ...article.differentiation,
    ...article.evidenceNeeded.map(item => `Evidencia propria necessaria: ${item}`),
  ];
  const genericRisks = [
    ...(article.differentiation.length === 0 ? ["Nenhuma diferenca concreta foi definida."] : []),
    ...(article.evidenceNeeded.length === 0 ? ["O artigo nao exige provas ou experiencia propria."] : []),
    ...(article.requiredTopics.length < 3 ? ["Cobertura editorial ainda superficial."] : []),
  ];
  const base = uniqueContributions.length / Math.max(1, uniqueContributions.length + genericRisks.length);
  const conflictPenalty = Math.min(0.5, internalConflicts.filter(item => item.severity === "alto" || item.severity === "critico").length * 0.1);
  return {
    internalConflicts,
    externalSimilarity: { status: "aguardando_serp" as const, score: null, matches: [] as string[] },
    strategicOriginality: {
      score: Math.max(0, Math.min(1, base - conflictPenalty)),
      uniqueContributions,
      genericRisks,
      recommendations: [
        "Validar o angulo contra a SERP antes de escrever.",
        "Exigir exemplos, evidencias ou experiencia que concorrentes nao apresentem.",
      ],
    },
  };
}
