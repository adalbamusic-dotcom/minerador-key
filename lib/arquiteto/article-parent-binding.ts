/**
 * O PAI ESTRUTURAL DO ARTICLE.
 *
 * No fluxo Silo-first o Article nasce DENTRO de um Silo confirmado, e esse
 * vínculo precisa atravessar todas as camadas:
 *
 *   Silo confirmado → ArticleFormationUniverse → ArticleCandidate → ArticleDNA
 *
 * A membership da keyword e o pai do Article são coisas diferentes. Elas devem
 * CONCORDAR, mas a keyword não é a autoridade: descobrir o pai pelo consenso
 * das keywords faz o Article trocar de Silo em silêncio toda vez que uma delas
 * se move. O pai é declarado uma vez, na formação, e conferido depois.
 *
 * `territoryRef` é o campo canônico — ele já existe no contrato e já diz, na
 * própria documentação, que ausência significa reconciliação de legado. Nada
 * de campo novo.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const PARENT_BINDING_CODES = [
  /** Declarado no payload e igual ao de todas as keywords. */
  "PARENT_DECLARED",
  /**
   * Sem `territoryRef` no payload; o Silo é inferido pelas keywords porque
   * todas concordam. Legado — legível, mas não é contrato.
   */
  "PARENT_INFERRED_LEGACY",
  /** Declarado, mas alguma keyword aponta para outro Silo. */
  "PARENT_CONFLICT",
  /** Sem declaração e sem consenso: nem inferir dá. */
  "PARENT_UNRESOLVED",
] as const;
export type ParentBindingCode = (typeof PARENT_BINDING_CODES)[number];

export type ParentBindingVerdict = {
  ref: string;
  code: ParentBindingCode;
  /** Pai declarado no artefato, quando existe. */
  declaredParent: string | null;
  /** Pais observados nas keywords da composição. */
  observedParents: (string | null)[];
  /** O pai que vale para leitura — nunca escolhido no empate. */
  effectiveParent: string | null;
  reason: string;
};

export function resolveParentBinding(input: {
  ref: string;
  declaredParent: string | null;
  keywordIds: readonly string[];
  parentByKeywordId: ReadonlyMap<string, string | null>;
}): ParentBindingVerdict {
  const observados = [...new Set(input.keywordIds.map(id => input.parentByKeywordId.get(id) ?? null))];
  const reais = observados.filter((ref): ref is string => Boolean(ref));
  const consenso = reais.length === 1 && !observados.includes(null) ? reais[0] : null;

  if (input.declaredParent) {
    // Divergiu: NÃO mover o Article. Quem decide para onde ele vai é gente.
    const divergentes = reais.filter(ref => ref !== input.declaredParent);
    if (divergentes.length || observados.includes(null)) {
      return {
        ref: input.ref,
        code: "PARENT_CONFLICT",
        declaredParent: input.declaredParent,
        observedParents: observados,
        effectiveParent: input.declaredParent,
        reason: "O artigo declara um Silo e alguma keyword da composição aponta para outro.",
      };
    }
    return {
      ref: input.ref,
      code: "PARENT_DECLARED",
      declaredParent: input.declaredParent,
      observedParents: observados,
      effectiveParent: input.declaredParent,
      reason: "O Silo está declarado no artefato e as keywords concordam.",
    };
  }

  if (consenso) {
    return {
      ref: input.ref,
      code: "PARENT_INFERRED_LEGACY",
      declaredParent: null,
      observedParents: observados,
      effectiveParent: consenso,
      reason: "O artigo não declara o Silo; ele é inferido porque todas as keywords concordam.",
    };
  }

  return {
    ref: input.ref,
    code: "PARENT_UNRESOLVED",
    declaredParent: null,
    observedParents: observados,
    effectiveParent: null,
    reason: reais.length > 1
      ? "Sem Silo declarado e as keywords apontam para Silos diferentes."
      : "Sem Silo declarado e sem membership nas keywords.",
  };
}

export const PARENT_BINDING_LABELS: Record<ParentBindingCode, string> = {
  PARENT_DECLARED: "Silo declarado",
  PARENT_INFERRED_LEGACY: "Silo inferido (legado)",
  PARENT_CONFLICT: "Conflito de Silo",
  PARENT_UNRESOLVED: "Silo não resolvido",
};

/**
 * O candidato pode virar ArticleDNA?
 *
 * Recusa formação que atravessa Silo — antes de escrever, não depois. Deixar
 * passar criaria um Article sem pai possível: nenhuma SiloPage o comporta e o
 * slug não tem raiz.
 */
export function assertSingleParent(input: {
  candidateRef: string;
  parentSiloRef: string | null;
  keywordIds: readonly string[];
  parentByKeywordId: ReadonlyMap<string, string | null>;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.parentSiloRef) {
    return { ok: false, reason: "O artigo não declara a que Silo pertence." };
  }
  const divergentes = input.keywordIds.filter(id => {
    const ref = input.parentByKeywordId.get(id) ?? null;
    return ref !== input.parentSiloRef;
  });
  if (divergentes.length) {
    return {
      ok: false,
      reason: `${divergentes.length} keyword(s) da composição pertencem a outro Silo.`,
    };
  }
  return { ok: true };
}

/* ------------------- o pai como a tela precisa mostrar -------------------- */

/**
 * PERTENCER A UM SILO E TER SILO CANÔNICO SÃO COISAS DIFERENTES.
 *
 * O Article nasce dentro de um Silo confirmado por decisão humana. O `siloId`
 * canônico só existe depois que SiloDNA e SiloPage são consolidados — um passo
 * POSTERIOR, que não desfaz a confirmação anterior.
 *
 * Ler `siloId == null` como "sem silo" apagava a decisão do humano na tela: o
 * mesmo artigo aparecia aprovado, com pai declarado, e ao lado "ARTIGOS SEM
 * SILO". O grafo pode continuar bloqueado por falta de SiloPage — isso é
 * portão, não identidade, e são perguntas separadas.
 */
export const ARTICLE_PARENT_STATES = [
  /** Sem `territoryRef`: aí sim não há pai. */
  "NO_PARENT",
  /** Território declarado, mas ainda candidato: a confirmação é que falta. */
  "TERRITORY_CANDIDATE",
  /** Silo confirmado; SiloDNA/SiloPage canônicos ainda não consolidados. */
  "TERRITORY_CONFIRMED",
  /** Silo canônico existe: SiloDNA e SiloPage consolidados. */
  "CANONICAL_SILO",
] as const;
export type ArticleParentState = (typeof ARTICLE_PARENT_STATES)[number];

export type ArticleParentReading = {
  state: ArticleParentState;
  /** O nome do Silo. A tela nunca mostra o identificador cru. */
  label: string;
  /** O que ainda falta, quando falta — sufixo curto ao lado do nome. */
  pending: string | null;
  territoryRef: string | null;
  canonicalSiloId: string | null;
  /** Pertence a um Silo? Verdadeiro já na confirmação, não na consolidação. */
  hasParent: boolean;
};

export function readArticleParent(input: {
  territoryRef: string | null;
  territoryName: string | null;
  territoryConfirmed: boolean;
  canonicalSiloId: string | null;
  canonicalSiloName?: string | null;
}): ArticleParentReading {
  const nome = (input.canonicalSiloName || input.territoryName || "").trim();

  if (input.canonicalSiloId) {
    return {
      state: "CANONICAL_SILO",
      label: nome || "Silo canônico",
      pending: null,
      territoryRef: input.territoryRef,
      canonicalSiloId: input.canonicalSiloId,
      hasParent: true,
    };
  }

  if (!input.territoryRef) {
    return {
      state: "NO_PARENT",
      label: "Sem Silo",
      pending: "o artigo não declara a que Silo pertence",
      territoryRef: null,
      canonicalSiloId: null,
      hasParent: false,
    };
  }

  return input.territoryConfirmed
    ? {
      state: "TERRITORY_CONFIRMED",
      label: nome || "Silo confirmado",
      pending: "consolidação canônica pendente",
      territoryRef: input.territoryRef,
      canonicalSiloId: null,
      hasParent: true,
    }
    : {
      state: "TERRITORY_CANDIDATE",
      label: nome || "Silo candidato",
      pending: "confirmação do Silo pendente",
      territoryRef: input.territoryRef,
      canonicalSiloId: null,
      hasParent: false,
    };
}

/** Texto único da célula: nome e, quando houver, o que falta. */
export function articleParentLabel(reading: ArticleParentReading): string {
  return reading.pending ? `${reading.label} · ${reading.pending}` : reading.label;
}
