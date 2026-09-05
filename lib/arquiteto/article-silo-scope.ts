/**
 * ESCOPO DE SILO DE CADA ARTICLE.
 *
 * Um Article pertence a UM Silo. Se a principal está num Silo e uma secundária
 * em outro, o Article não tem pai: ele não cabe em nenhuma SiloPage, o slug não
 * tem raiz e o link interno não sabe de onde sai.
 *
 * Isto é AUDITORIA, não correção: nada é reagrupado aqui. Misturar Silos é um
 * defeito que precisa ser visto e decidido por gente, não silenciado por uma
 * regra automática de desempate.
 *
 * Serve tanto para o read-model de candidatos quanto para os ArticleDNA já
 * materializados — os dois respondem à mesma pergunta.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const ARTICLE_SCOPE_ISSUE_CODES = [
  /** Keywords do Article estão em Silos diferentes. */
  "CROSS_SILO",
  /** Alguma keyword não tem Silo nenhum. */
  "KEYWORD_WITHOUT_SILO",
  /** O Silo existe mas não foi confirmado por um humano. */
  "SILO_NOT_CONFIRMED",
  /** O Article não declara a que Silo pertence. */
  "SILO_REF_UNRESOLVED",
  /** A principal declarada não está entre as keywords do Article. */
  "PRINCIPAL_OUTSIDE_ARTICLE",
] as const;
export type ArticleScopeIssue = (typeof ARTICLE_SCOPE_ISSUE_CODES)[number];

export type ArticleScopeSubject = {
  /** `articleId` do ArticleDNA ou `candidateRef` do read-model. */
  ref: string;
  label: string;
  /** Silo declarado pelo próprio Article. */
  siloRef: string | null;
  principalKeywordId: string | null;
  keywordIds: string[];
};

export type ArticleScopeVerdict = {
  ref: string;
  label: string;
  /** Silos observados nas keywords — mais de um já é o defeito. */
  observedSiloRefs: (string | null)[];
  issues: ArticleScopeIssue[];
  ok: boolean;
};

export type ArticleScopeAudit = {
  verdicts: ArticleScopeVerdict[];
  crossSilo: number;
  withoutSilo: number;
  notConfirmed: number;
  unresolved: number;
  ok: boolean;
};

export function auditArticleSiloScope(input: {
  subjects: readonly ArticleScopeSubject[];
  /** Silo de cada keyword, pela membership canônica. */
  siloRefByKeywordId: ReadonlyMap<string, string | null>;
  confirmedSiloRefs: ReadonlySet<string>;
}): ArticleScopeAudit {
  const verdicts: ArticleScopeVerdict[] = [];

  for (const subject of input.subjects) {
    const issues: ArticleScopeIssue[] = [];
    const observed = [...new Set(subject.keywordIds.map(id => input.siloRefByKeywordId.get(id) ?? null))];

    const reais = observed.filter((ref): ref is string => Boolean(ref));
    if (reais.length > 1) issues.push("CROSS_SILO");
    if (observed.some(ref => ref === null)) issues.push("KEYWORD_WITHOUT_SILO");
    if (reais.some(ref => !input.confirmedSiloRefs.has(ref))) issues.push("SILO_NOT_CONFIRMED");
    if (!subject.siloRef) issues.push("SILO_REF_UNRESOLVED");
    if (subject.principalKeywordId && !subject.keywordIds.includes(subject.principalKeywordId)) {
      issues.push("PRINCIPAL_OUTSIDE_ARTICLE");
    }

    verdicts.push({
      ref: subject.ref,
      label: subject.label,
      observedSiloRefs: observed,
      issues,
      ok: issues.length === 0,
    });
  }

  const conta = (code: ArticleScopeIssue) => verdicts.filter(item => item.issues.includes(code)).length;
  return {
    verdicts,
    crossSilo: conta("CROSS_SILO"),
    withoutSilo: conta("KEYWORD_WITHOUT_SILO"),
    notConfirmed: conta("SILO_NOT_CONFIRMED"),
    unresolved: conta("SILO_REF_UNRESOLVED"),
    ok: verdicts.every(item => item.ok),
  };
}

export const ARTICLE_SCOPE_ISSUE_LABELS: Record<ArticleScopeIssue, string> = {
  CROSS_SILO: "Keywords de Silos diferentes no mesmo artigo",
  KEYWORD_WITHOUT_SILO: "Keyword sem Silo",
  SILO_NOT_CONFIRMED: "Silo ainda não confirmado",
  SILO_REF_UNRESOLVED: "Artigo sem Silo declarado",
  PRINCIPAL_OUTSIDE_ARTICLE: "Principal fora da composição",
};
