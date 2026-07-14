import type { ArchitectConflict, ProvisionalArticleGroup } from "./contracts.ts";
import { compareKeywords, tokenize } from "./engine.ts";

const conflictId = (type: string, ids: string[]) => `${type}:${[...ids].sort().join(":")}`;

export function detectArchitectureConflicts(groups: ProvisionalArticleGroup[]): ArchitectConflict[] {
  const conflicts: ArchitectConflict[] = [];
  const principals = new Map<string, string[]>();

  for (const group of groups) {
    const principalId = group.principalSuggestion.keywordId;
    principals.set(principalId, [...(principals.get(principalId) || []), group.id]);
    for (let i = 0; i < group.keywords.length; i += 1) {
      for (let j = i + 1; j < group.keywords.length; j += 1) {
        const first = group.keywords[i];
        const second = group.keywords[j];
        const comparison = compareKeywords(first, second);
        if (comparison.lexical >= 0.9) conflicts.push({
          id: conflictId("keyword_quase_identica", [first.id, second.id]),
          level: "keyword",
          type: "keyword_quase_identica",
          severity: "atencao",
          entityIds: [first.id, second.id],
          reason: "As keywords possuem variacao lexical minima.",
          evidence: [`Similaridade lexical de ${Math.round(comparison.lexical * 100)}%.`],
          recommendation: "Manter uma como principal e tratar a outra como secundaria ou reforco.",
          humanDecisionRequired: true,
        });
        if (comparison.intent === 0) conflicts.push({
          id: conflictId("intencao_conflitante", [first.id, second.id]),
          level: "keyword",
          type: "intencao_conflitante",
          severity: "alto",
          entityIds: [first.id, second.id],
          reason: "O grupo mistura intencoes que normalmente exigem contratos editoriais diferentes.",
          evidence: [String(first.intent || "desconhecida"), String(second.intent || "desconhecida")],
          recommendation: "Dividir o grupo ou validar a composicao pela SERP.",
          humanDecisionRequired: true,
        });
      }
    }
  }

  for (const [principalId, groupIds] of principals) {
    if (groupIds.length > 1) conflicts.push({
      id: conflictId("principal_duplicada", [principalId, ...groupIds]),
      level: "keyword",
      type: "principal_duplicada",
      severity: "critico",
      entityIds: [principalId, ...groupIds],
      reason: "A mesma keyword foi sugerida como principal em mais de um artigo.",
      evidence: groupIds,
      recommendation: "Escolher um unico contrato editorial para a keyword principal.",
      humanDecisionRequired: true,
    });
  }

  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const first = groups[i];
      const second = groups[j];
      const firstPrincipal = first.keywords.find(keyword => keyword.id === first.principalSuggestion.keywordId)!;
      const secondPrincipal = second.keywords.find(keyword => keyword.id === second.principalSuggestion.keywordId)!;
      const comparison = compareKeywords(firstPrincipal, secondPrincipal);
      if (comparison.combined >= 0.72) conflicts.push({
        id: conflictId("artigos_sobrepostos", [first.id, second.id]),
        level: "artigo",
        type: "artigos_sobrepostos",
        severity: "alto",
        entityIds: [first.id, second.id],
        reason: "Os artigos propostos possuem tema, intencao e entidades muito proximos.",
        evidence: [`Afinidade combinada de ${Math.round(comparison.combined * 100)}%.`],
        recommendation: "Unir os grupos ou definir fronteiras anti-canibalizacao explicitas.",
        humanDecisionRequired: true,
      });
      const sameSilo = first.suggestedSiloId && first.suggestedSiloId === second.suggestedSiloId;
      const sharedTokens = [...tokenize(firstPrincipal.keyword)].filter(token => tokenize(secondPrincipal.keyword).has(token));
      if (!sameSilo && sharedTokens.length >= 2) conflicts.push({
        id: conflictId("fronteira_de_silo", [first.id, second.id]),
        level: "silo",
        type: "fronteira_de_silo",
        severity: "atencao",
        entityIds: [first.id, second.id],
        reason: "Temas semanticamente proximos foram direcionados a silos diferentes.",
        evidence: sharedTokens,
        recommendation: "Definir a fronteira dos silos antes de aprovar a arquitetura.",
        humanDecisionRequired: true,
      });
    }
  }
  return [...new Map(conflicts.map(conflict => [conflict.id, conflict])).values()];
}
