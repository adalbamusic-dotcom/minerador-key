import type {
  ArchitectKeyword,
  KeywordArticleCatalogEntry,
  KeywordArticleDecision,
  KeywordArticleReview,
  KeywordReviewCandidate,
  KeywordReviewFocusGroup,
  LogicalKeywordRecommendation,
  ProvisionalArticleGroup,
} from "./contracts.ts";
import { buildProvisionalGroups, compareKeywords } from "./engine.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";
import type { AIReviewAnnotation } from "../editorial/operational-contracts.ts";
import { normalizeArticleWorkingCopyKeyword } from "./article-phase.ts";
import { projectKeywordForStrategicReview, projectStrategicSemantic } from "./ai-strategic-payload.ts";

type AssignedKeyword = ArchitectKeyword & {
  clusterId?: string | number;
  provisionalGroupId?: string;
  siloId?: string | number | null;
  computedHierarquia?: string;
  computedSlug?: string;
  reviewRole?: "principal" | "secundaria" | "reforco_narrativo";
  workingArticleId?: string;
  aiReviewAnnotation?: AIReviewAnnotation;
  [key: string]: unknown;
};

const semanticString = (keyword: ArchitectKeyword, ...keys: string[]) => {
  const semantic = keyword.analise_semantica || {};
  for (const key of keys) {
    const value = semantic[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const semanticConfidence = (keyword: ArchitectKeyword) => {
  const value = keyword.analise_semantica?.confianca ?? keyword.analise_semantica?.confidence;
  if (typeof value === "number" && value >= 0 && value <= 1) return value;
  return null;
};

export function compactKeywordForReview(keyword: ArchitectKeyword): KeywordReviewCandidate {
  return {
    keywordId: keyword.id,
    keyword: keyword.keyword,
    intent: keyword.intent || semanticString(keyword, "intencao_principal", "searchIntent"),
    centralEntity: semanticString(keyword, "entidade_central", "centralEntity"),
    audience: semanticString(keyword, "publico", "audience"),
    perceivedProblem: semanticString(keyword, "problema_percebido", "perceivedProblem"),
    desiredResult: semanticString(keyword, "resultado_desejado", "desiredResult"),
    editorialType: semanticString(keyword, "tipo_editorial", "formato_esperado", "likelyEditorialType"),
    confidence: semanticConfidence(keyword),
    isPublished: Boolean(keyword.isPublished || keyword.status?.toLowerCase() === "publicado"),
    // Projeção estratégica: a IA decide arquitetura com fatos, não com o
    // registro cru da keyword. O lossless continua na UI, não no payload.
    keywordDnaSnapshot: {
      ...projectKeywordForStrategicReview(keyword as ArchitectKeyword & Record<string, unknown>),
      analise_semantica: projectStrategicSemantic(keyword.analise_semantica),
    },
  };
}

export function buildKeywordArticleCatalog(groups: ProvisionalArticleGroup[]): KeywordArticleCatalogEntry[] {
  return [...groups]
    .sort((first, second) => Number(Boolean(second.publishedAnchorId)) - Number(Boolean(first.publishedAnchorId)))
    .map(group => {
      const principal = group.keywords.find(keyword => keyword.id === group.principalSuggestion.keywordId) || group.keywords[0];
      const values = (key: "intent" | "entity") => [...new Set(group.keywords.map(keyword => key === "intent"
        ? keyword.intent || ""
        : semanticString(keyword, "entidade_central", "centralEntity") || "").filter(Boolean))].slice(0, 12);
      return {
        groupId: group.id,
        articleId: group.publishedAnchorId || group.id,
        isPublished: Boolean(group.publishedAnchorId),
        publishedAnchorId: group.publishedAnchorId,
        principalKeywordId: principal.id,
        principalKeyword: principal.keyword,
        keywordIds: group.keywordIds.slice(0, 30),
        keywordTerms: group.keywords.map(keyword => keyword.keyword).slice(0, 12),
        intents: values("intent"),
        centralEntities: values("entity"),
        siloId: group.suggestedSiloId,
        siloName: group.suggestedSiloName,
      };
    });
}

const focusGroup = (group: ProvisionalArticleGroup, keywords: ArchitectKeyword[]): KeywordReviewFocusGroup => ({
  groupId: group.id,
  articleId: group.publishedAnchorId || group.id,
  isPublished: Boolean(group.publishedAnchorId),
  publishedAnchorId: group.publishedAnchorId,
  currentPrincipalKeywordId: group.principalSuggestion.keywordId,
  siloId: group.suggestedSiloId,
  siloName: group.suggestedSiloName,
  keywords: keywords.map(compactKeywordForReview),
});

export function buildKeywordReviewBatches(
  groups: ProvisionalArticleGroup[],
  maximumKeywords = 4,
  maximumGroups = 1,
): KeywordReviewFocusGroup[][] {
  const focus = [...groups]
    .sort((first, second) => Number(Boolean(second.publishedAnchorId)) - Number(Boolean(first.publishedAnchorId)))
    .flatMap(group => {
      const parts: KeywordReviewFocusGroup[] = [];
      for (let index = 0; index < group.keywords.length; index += maximumKeywords) {
        parts.push(focusGroup(group, group.keywords.slice(index, index + maximumKeywords)));
      }
      return parts;
    });
  const batches: KeywordReviewFocusGroup[][] = [];
  let current: KeywordReviewFocusGroup[] = [];
  let keywordCount = 0;
  for (const item of focus) {
    if (current.length && (current.length >= maximumGroups || keywordCount + item.keywords.length > maximumKeywords)) {
      batches.push(current);
      current = [];
      keywordCount = 0;
    }
    current.push(item);
    keywordCount += item.keywords.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Unidade canônica de execução da IA é o Article: um lote por artigo, com
 * todas as keywords daquele artigo. Selecionar 5 artigos produz 5 execuções
 * independentes, e a falha de um artigo não contamina os demais.
 */
export function buildArticleReviewBatches(groups: ProvisionalArticleGroup[]): KeywordReviewFocusGroup[][] {
  return [...groups]
    .sort((first, second) => Number(Boolean(second.publishedAnchorId)) - Number(Boolean(first.publishedAnchorId)))
    .map(group => [focusGroup(group, group.keywords)]);
}

const fitAgainstGroup = (keyword: ArchitectKeyword, group: ProvisionalArticleGroup) => {
  const comparisons = group.keywords.filter(candidate => candidate.id !== keyword.id).map(candidate => compareKeywords(keyword, candidate));
  if (!comparisons.length) return group.keywordIds.includes(keyword.id) ? group.confidence : 0;
  return Math.max(...comparisons.map(comparison => comparison.combined));
};

export function buildRelevantArticleCatalog(
  allGroups: ProvisionalArticleGroup[],
  focusGroups: KeywordReviewFocusGroup[],
  maximumArticles = 12,
): KeywordArticleCatalogEntry[] {
  const focusKeywords = focusGroups.flatMap(focus => focus.keywords.map(keyword =>
    allGroups.flatMap(group => group.keywords).find(candidate => candidate.id === keyword.keywordId))).filter((keyword): keyword is ArchitectKeyword => Boolean(keyword));
  const focusIds = new Set(focusGroups.map(group => group.groupId));
  const ranked = allGroups.map(group => ({
    group,
    score: Math.max(0, ...focusKeywords.map(keyword => fitAgainstGroup(keyword, group))) + (group.publishedAnchorId ? 0.08 : 0),
  })).sort((first, second) => Number(focusIds.has(second.group.id)) - Number(focusIds.has(first.group.id)) || second.score - first.score);
  const selected = ranked.slice(0, maximumArticles).map(item => item.group);
  for (const group of allGroups.filter(candidate => focusIds.has(candidate.id))) {
    if (!selected.some(candidate => candidate.id === group.id)) selected.unshift(group);
  }
  return buildKeywordArticleCatalog(selected.slice(0, maximumArticles));
}

export function buildLogicalKeywordRecommendations(
  allGroups: ProvisionalArticleGroup[],
  focusGroups: KeywordReviewFocusGroup[],
): LogicalKeywordRecommendation[] {
  const keywordIndex = new Map(allGroups.flatMap(group => group.keywords.map(keyword => [keyword.id, keyword] as const)));
  return focusGroups.flatMap(focus => focus.keywords.map(compact => {
    const keyword = keywordIndex.get(compact.keywordId)!;
    const source = allGroups.find(group => group.id === focus.groupId)!;
    const currentFit = fitAgainstGroup(keyword, source);
    const targets = allGroups.filter(group => group.id !== focus.groupId).map(group => ({ group, fit: fitAgainstGroup(keyword, group) }))
      .sort((first, second) => (second.fit + (second.group.publishedAnchorId ? 0.08 : 0)) - (first.fit + (first.group.publishedAnchorId ? 0.08 : 0)));
    const best = targets[0];
    const recommendation: LogicalKeywordRecommendation["recommendation"] = currentFit >= (best?.fit || 0) - 0.05
      ? "manter"
      : best?.group.publishedAnchorId && best.fit >= 0.45 ? "avaliar_publicado"
        : best?.fit >= 0.55 ? "avaliar_movimento" : "avaliar_novo_artigo";
    return {
      keywordId: keyword.id,
      currentGroupId: focus.groupId,
      currentFit: Math.max(0, Math.min(1, currentFit)),
      bestTargetGroupId: best?.group.id || null,
      bestTargetFit: best ? Math.max(0, Math.min(1, best.fit)) : null,
      bestTargetPublished: Boolean(best?.group.publishedAnchorId),
      recommendation,
      reason: recommendation === "manter" ? "O encaixe atual e competitivo com as alternativas."
        : best?.group.publishedAnchorId ? "O melhor candidato logico e um artigo publicado."
          : best ? "Outro artigo possui maior compatibilidade semantica." : "Nenhum artigo existente apresentou encaixe suficiente.",
    };
  }));
}

export function mergeKeywordArticleReviews(reviews: KeywordArticleReview[]): KeywordArticleReview {
  const stageTrace = reviews.flatMap(review => review.stageTrace || []);
  const diff = reviews.flatMap(review => review.diff || []);
  return {
    decisions: reviews.flatMap(review => review.decisions),
    conflicts: reviews.flatMap(review => review.conflicts),
    summary: reviews.map((review, index) => `Lote ${index + 1}: ${review.summary}`).join(" "),
    proposalId: `ai-architecture:${crypto.randomUUID()}`,
    source: "ai",
    approvalStatus: "pending_human",
    ...(stageTrace.length ? { stageTrace } : {}),
    ...(diff.length ? { diff } : {}),
  };
}

const published = (keyword: AssignedKeyword) => Boolean(keyword.isPublished || keyword.status?.toLowerCase() === "publicado");

const createWorkingArticleId = () => `working-article:${crypto.randomUUID()}`;

export function enforceAssignedKeywordLimit(current: AssignedKeyword[]): AssignedKeyword[] {
  const clusters = new Map<string, AssignedKeyword[]>();
  current.forEach(keyword => {
    const key = String(keyword.provisionalGroupId || keyword.clusterId || keyword.id);
    clusters.set(key, [...(clusters.get(key) || []), keyword]);
  });

  return [...clusters.entries()].flatMap(([groupKey, items]) => {
    if (items.length <= MAX_KEYWORDS_PER_ARTICLE) return items;
    const anchor = items.find(published);
    const kept = anchor
      ? [anchor, ...items.filter(item => item.id !== anchor.id)
        .sort((first, second) => compareKeywords(anchor, second).combined - compareKeywords(anchor, first).combined)
        .slice(0, MAX_KEYWORDS_PER_ARTICLE - 1)]
      : [];
    const keptIds = new Set(kept.map(item => item.id));
    const toRegroup = anchor ? items.filter(item => !keptIds.has(item.id)) : items;
    const overflowGroups = buildProvisionalGroups(toRegroup);
    const base = anchor || items[0];
    const remapped = overflowGroups.flatMap((group, index) => {
      const preserveOriginalGroup = !anchor && index === 0;
      const nextGroupId = preserveOriginalGroup ? groupKey : `overflow:${groupKey}:${group.id}`;
      const nextClusterId = preserveOriginalGroup
        ? String(base.clusterId || nextGroupId)
        : `overflow:${String(base.clusterId || groupKey)}:${index + 1}`;
      const existingWorkingArticleId = group.keywords
        .map(keyword => (keyword as AssignedKeyword).workingArticleId)
        .find(value => typeof value === "string" && value.trim());
      const workingArticleId = preserveOriginalGroup && existingWorkingArticleId
        ? existingWorkingArticleId
        : createWorkingArticleId();
      return group.keywords.map(keyword => {
        const original = items.find(item => item.id === keyword.id)!;
        const principal = keyword.id === group.principalSuggestion.keywordId;
        const articleKeyword = normalizeArticleWorkingCopyKeyword(original);
        return {
          ...articleKeyword,
          workingArticleId,
          clusterId: nextClusterId,
          provisionalGroupId: nextGroupId,
          ...(published(original) ? {
            siloId: original.siloId,
            silo_id: original.silo_id,
            siloName: original.siloName,
          } : {
            siloId: null,
            silo_id: null,
            siloName: null,
          }),
          reviewRole: principal
            ? "principal" as const
            : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" as const : "secundaria" as const,
        };
      });
    });
    return [...kept, ...remapped];
  });
}

/**
 * Proposta sem mutação: manter a keyword no artigo, manter o Silo, manter o
 * papel atual e não deixar ponto de decisão humana. Execução da IA continua
 * registrada, mas não cria pendência humana artificial.
 */
export function isNoOpKeywordArticleDecision(
  decision: KeywordArticleDecision,
  currentRole: "principal" | "secundaria" | "reforco_narrativo" | null | undefined,
  conflictCount = 0,
): boolean {
  return decision.action === "manter_no_artigo"
    && decision.siloPlacement.action === "manter_silo"
    && (!currentRole || currentRole === decision.suggestedRole)
    && decision.humanDecisionPoints.length === 0
    && conflictCount === 0;
}

/**
 * Propostas materiais: as que realmente pedem leitura humana. O provider pode
 * devolver decisões que apenas confirmam o estado atual; contá-las como
 * "proposta gerada" cria pendência inexistente na bancada.
 */
export function materialKeywordArticleDecisions(
  review: Pick<KeywordArticleReview, "decisions" | "conflicts">,
  resolveCurrentRole: (keywordId: string) => "principal" | "secundaria" | "reforco_narrativo" | null | undefined,
): KeywordArticleDecision[] {
  return review.decisions.filter(decision => {
    const conflictCount = review.conflicts.filter(conflict => conflict.entityIds.includes(decision.keywordId)).length;
    return !isNoOpKeywordArticleDecision(decision, resolveCurrentRole(decision.keywordId), conflictCount);
  });
}

export function applyKeywordArticleReview(
  current: AssignedKeyword[],
  review: KeywordArticleReview,
  appliedAt = new Date().toISOString(),
): AssignedKeyword[] {
  const byGroup = new Map<string, AssignedKeyword>();
  current.forEach(keyword => {
    const groupId = keyword.provisionalGroupId;
    if (groupId && !byGroup.has(groupId)) byGroup.set(groupId, keyword);
  });
  const decisions = new Map(review.decisions.map(decision => [decision.keywordId, decision]));
  const generatedGroups = new Map<string, { clusterId: string; groupId: string; workingArticleId: string }>();

  let next = current.map(keyword => {
    const decision = decisions.get(keyword.id);
    if (!decision || published(keyword) || decision.action === "manter_no_artigo") {
      return decision && !published(keyword)
        ? { ...normalizeArticleWorkingCopyKeyword(keyword), reviewRole: decision.suggestedRole }
        : keyword;
    }
    if (decision.action === "criar_novo_artigo") {
      const key = `${decision.sourceGroupId}:${decision.newArticleKey}`;
      const group = generatedGroups.get(key) || {
        clusterId: `ai-${generatedGroups.size + 1}-${decision.newArticleKey}`,
        groupId: `ai-group-${decision.sourceGroupId}-${decision.newArticleKey}`,
        workingArticleId: createWorkingArticleId(),
      };
      generatedGroups.set(key, group);
      // A proposta pode mencionar um Silo, mas a fase Artigos não o
      // materializa nem copia a proposta para a working copy. A formação de
      // Silo ocorre somente na etapa própria, após ArticleDNA aprovado.
      const articleKeyword = normalizeArticleWorkingCopyKeyword(keyword);
      return { ...articleKeyword, workingArticleId: group.workingArticleId, clusterId: group.clusterId, provisionalGroupId: group.groupId, reviewRole: decision.suggestedRole,
      };
    }
    const target = decision.targetGroupId ? byGroup.get(decision.targetGroupId) : undefined;
    if (!target) return normalizeArticleWorkingCopyKeyword(keyword);
    return {
      ...normalizeArticleWorkingCopyKeyword(keyword),
      workingArticleId: target.workingArticleId || keyword.workingArticleId,
      clusterId: target.clusterId,
      provisionalGroupId: target.provisionalGroupId,
      computedSlug: target.computedSlug,
      reviewRole: decision.action === "reforcar_publicado" ? "reforco_narrativo" : decision.suggestedRole,
    };
  });

  next = enforceAssignedKeywordLimit(next);

  const clusters = new Map<string, AssignedKeyword[]>();
  next.forEach(keyword => {
    const key = String(keyword.provisionalGroupId || keyword.clusterId || keyword.id);
    const items = clusters.get(key) || [];
    items.push(keyword);
    clusters.set(key, items);
  });
  next = next.map(keyword => {
    const cluster = clusters.get(String(keyword.provisionalGroupId || keyword.clusterId || keyword.id)) || [keyword];
    const anchor = cluster.find(published);
    const recommendedPrincipal = cluster
      .map(item => ({ item, decision: decisions.get(item.id) }))
      .filter(entry => entry.decision?.suggestedRole === "principal")
      .sort((first, second) => (second.decision?.confidence || 0) - (first.decision?.confidence || 0))[0]?.item;
    const principal = anchor || recommendedPrincipal || cluster[0];
    if (keyword.id === principal.id) {
      return normalizeArticleWorkingCopyKeyword({ ...keyword, reviewRole: "principal" as const });
    }
    const decision = decisions.get(keyword.id) as KeywordArticleDecision | undefined;
    const suggestedRole = decision?.suggestedRole || keyword.reviewRole;
    const role = suggestedRole === "reforco_narrativo" ? "reforco_narrativo" : "secundaria";
    return normalizeArticleWorkingCopyKeyword({ ...keyword, reviewRole: role });
  });
  const originalById = new Map(current.map(keyword => [keyword.id, keyword]));
  const architectureChanged = (before: AssignedKeyword, after: AssignedKeyword) => [
    "workingArticleId", "clusterId", "provisionalGroupId", "siloId", "silo_id", "lista_id", "siloName",
  ].some(field => String(before[field] ?? "") !== String(after[field] ?? ""));
  return next.map(keyword => {
    const decision = decisions.get(keyword.id);
    if (!decision) {
      const original = originalById.get(keyword.id);
      if (!original || !architectureChanged(original, keyword)) return keyword;
      return {
        ...keyword,
        aiReviewAnnotation: {
          id: `ai-review:derived:${keyword.id}:${appliedAt}`,
          module: "arquiteto",
          entityId: keyword.id,
          action: "limite_maximo_6_keywords",
          summary: "A proposta da IA exigiu redistribuição para respeitar o máximo de seis keywords por artigo.",
          details: ["Alteração derivada da aplicação da proposta; revisar e aceitar ou desfazer no histórico."],
          confidence: 1,
          source: "ai",
          reviewState: "pending_fine_review",
          appliedLocally: true,
          createdAt: appliedAt,
        },
      };
    }
    const conflictNotes = review.conflicts
      .filter(conflict => conflict.entityIds.includes(keyword.id))
      .map(conflict => `${conflict.severity}: ${conflict.reason} — ${conflict.recommendation}`);
    const noOp = isNoOpKeywordArticleDecision(decision, originalById.get(keyword.id)?.reviewRole, conflictNotes.length);
    const placement = decision.siloPlacement;
    const siloProposalNotes = placement.action === "manter_silo" ? [] : [
      placement.action === "propor_novo_silo"
        ? `Proposta de Silo “${placement.siloName}” preservada somente como decisão pendente (${placement.newSiloKey}); nenhum Silo foi criado nesta fase.`
        : `Proposta de vínculo ao Silo ${placement.siloId || placement.siloName || "existente"} preservada somente como decisão pendente; nenhuma atribuição foi aplicada nesta fase.`,
    ];
    return {
      ...keyword,
      aiReviewAnnotation: {
        id: `ai-review:${keyword.id}:${appliedAt}`,
        module: "arquiteto",
        entityId: keyword.id,
        action: decision.action,
        summary: decision.justification,
        details: [
          ...decision.humanDecisionPoints,
          ...siloProposalNotes,
          ...conflictNotes,
          ...(noOp ? ["Sem alteração estrutural recomendada: papel, artigo e Silo permanecem como estavam."] : []),
        ],
        confidence: decision.confidence,
        source: "ai",
        reviewState: noOp ? "reviewed" : "pending_fine_review",
        appliedLocally: true,
        structuralChange: !noOp,
        createdAt: appliedAt,
      },
    };
  });
}
