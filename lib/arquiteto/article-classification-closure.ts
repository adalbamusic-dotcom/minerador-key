/**
 * FECHAMENTO DAS CLASSIFICAÇÕES DO ARTICLE.
 *
 * INCERTEZA É RESULTADO. PENDÊNCIA NÃO É.
 *
 * "Pendente", "não recebido", "não executado" e "aguardando" descrevem o
 * ESTADO DO PROCESSO. Enquanto a formação está aberta eles são legítimos.
 * Depois que o humano conclui a formação, o ArticleDNA aprovado é um retrato
 * fechado daquele artigo — e um retrato não tem campo em branco esperando
 * alguém voltar depois.
 *
 * Quando a evidência não sustenta uma resposta forte, o resultado registra a
 * INCERTEZA com o nome dela: `AMBIGUOUS`, `INDETERMINATE`, `PARTIAL`,
 * `NOT_APPLICABLE`. Isso é diferente de deixar trabalho para depois, e é
 * diferente de inventar certeza — os dois erros opostos que este módulo evita.
 *
 * VOCABULÁRIO PRÓPRIO, DE PROPÓSITO. Os enums do Minerador
 * (`NormalizedSearchIntent`, `KgrApplicability`, `IntentCompatibility`)
 * continuam intocados: eles descrevem o que a keyword é, e carregam valores de
 * processo (`unknown`, `pending`) que fazem sentido lá. Aqui se descreve o que
 * o ARTIGO decidiu. Traduzir na fronteira mantém as duas leituras honestas em
 * vez de forçar um enum a significar duas coisas.
 *
 * O KGR NÃO É INVENTADO PELA SERP. Ele sai dos fatos do KeywordDNA; a SERP
 * fecha intenção, compatibilidade e funil, nunca a métrica.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

/* ------------------------- vocabulários terminais ------------------------- */

export const ARTICLE_TERMINAL_INTENTS = [
  "INFORMATIONAL",
  "COMMERCIAL_INVESTIGATION",
  "TRANSACTIONAL",
  "NAVIGATIONAL",
  "LOCAL",
  /** A composição/SERP sustenta mais de uma intenção, e isso é o achado. */
  "MIXED",
  /** A evidência não permite escolher. Resultado — não "não processamos". */
  "AMBIGUOUS",
] as const;
export type ArticleTerminalIntent = (typeof ARTICLE_TERMINAL_INTENTS)[number];

export const ARTICLE_TERMINAL_FUNNELS = ["TOP", "MIDDLE", "BOTTOM", "MIXED", "INDETERMINATE"] as const;
export type ArticleTerminalFunnel = (typeof ARTICLE_TERMINAL_FUNNELS)[number];

export const ARTICLE_TERMINAL_KGR = ["YES", "NO", "NOT_APPLICABLE"] as const;
export type ArticleTerminalKgr = (typeof ARTICLE_TERMINAL_KGR)[number];

export const ARTICLE_TERMINAL_KGR_APPLICABILITY = ["APPLICABLE", "NOT_APPLICABLE"] as const;
export type ArticleTerminalKgrApplicability = (typeof ARTICLE_TERMINAL_KGR_APPLICABILITY)[number];

/*
 * "Não aplicável" é diferente de "ambígua".
 *
 * Ambígua diz que faltou base para afirmar coerência ou conflito. Num artigo
 * de UMA keyword não falta base: não existe par a avaliar, e a pergunta não se
 * aplica. Devolver "Ambígua" ali fazia a mesa exibir incerteza sobre uma
 * comparação que ninguém pode fazer.
 */
export const ARTICLE_TERMINAL_COMPATIBILITY = ["COMPATIBLE", "PARTIAL", "INCOMPATIBLE", "AMBIGUOUS", "NOT_APPLICABLE"] as const;
export type ArticleTerminalCompatibility = (typeof ARTICLE_TERMINAL_COMPATIBILITY)[number];

export const ARTICLE_TERMINAL_PROTECTIONS = ["NEW", "PUBLISHED_LOCKED", "PUBLISHED_REVISABLE"] as const;
export type ArticleTerminalProtection = (typeof ARTICLE_TERMINAL_PROTECTIONS)[number];

/**
 * De onde veio o valor exibido — §10.
 *
 * Misturar fato da Principal com estado agregado do grupo faz o resumo mentir
 * sobre o que está sendo afirmado.
 */
export type ClassificationSource = "principal" | "group" | "serp" | "article_decision";

export type ResolvedField<T> = {
  value: T;
  /** Por que este valor, em português, para a tela mostrar. */
  reason: string;
  source: ClassificationSource;
};

export type ArticleClassification = {
  intent: ResolvedField<ArticleTerminalIntent>;
  funnel: ResolvedField<ArticleTerminalFunnel>;
  kgr: ResolvedField<ArticleTerminalKgr>;
  kgrApplicability: ResolvedField<ArticleTerminalKgrApplicability>;
  compatibility: ResolvedField<ArticleTerminalCompatibility>;
  protection: ResolvedField<ArticleTerminalProtection>;
};

/* ------------------- tradução da fronteira: intenção ---------------------- */

const INTENT_BY_NORMALIZED: Record<string, ArticleTerminalIntent> = {
  informational: "INFORMATIONAL",
  commercial_investigation: "COMMERCIAL_INVESTIGATION",
  transactional: "TRANSACTIONAL",
  navigational: "NAVIGATIONAL",
  local: "LOCAL",
  mixed: "MIXED",
};

/** Rótulos livres que o Minerador entrega em `analise_semantica`. */
const INTENT_BY_FREE_TEXT: Array<[RegExp, ArticleTerminalIntent]> = [
  [/informacion/i, "INFORMATIONAL"],
  [/comercial|investiga/i, "COMMERCIAL_INVESTIGATION"],
  [/transacion|compra/i, "TRANSACTIONAL"],
  [/navegacion|marca/i, "NAVIGATIONAL"],
  [/local/i, "LOCAL"],
  [/mist|mix/i, "MIXED"],
];

export function normalizeIntentLabel(raw: string | null | undefined): ArticleTerminalIntent | null {
  const texto = typeof raw === "string" ? raw.trim() : "";
  if (!texto) return null;
  const direto = INTENT_BY_NORMALIZED[texto.toLowerCase()];
  if (direto) return direto;
  // `unknown` do enum do Minerador significa "não classificamos" — estado de
  // processo. Ele NÃO vira intenção terminal por tradução; quem decide isso é
  // a resolução abaixo, com a evidência inteira na mão.
  if (texto.toLowerCase() === "unknown") return null;
  return INTENT_BY_FREE_TEXT.find(([padrao]) => padrao.test(texto))?.[1] ?? null;
}

const FUNNEL_BY_FREE_TEXT: Array<[RegExp, ArticleTerminalFunnel]> = [
  // TOFU/MOFU/BOFU é o vocabulário que o Minerador realmente grava. Não
  // reconhecê-lo descartava sinal existente e fechava como INDETERMINATE um
  // funil que estava classificado.
  [/^tofu|topo|^top|awareness|descoberta/i, "TOP"],
  [/^mofu|meio|middle|considera/i, "MIDDLE"],
  [/^bofu|fundo|bottom|decis|convers/i, "BOTTOM"],
  [/mist|mix/i, "MIXED"],
];

export function normalizeFunnelLabel(raw: string | null | undefined): ArticleTerminalFunnel | null {
  const texto = typeof raw === "string" ? raw.trim() : "";
  if (!texto) return null;
  return FUNNEL_BY_FREE_TEXT.find(([padrao]) => padrao.test(texto))?.[1] ?? null;
}

/* ------------------------------ a resolução ------------------------------- */

export type ClassificationEvidence = {
  /** Intenção declarada pela Principal (Minerador ou KeywordDNA). */
  principalIntent: string | null;
  /** Intenções observadas nas demais keywords da composição. */
  compositionIntents: readonly (string | null)[];
  /** Intenção observada na SERP vigente, quando houve execução. */
  serpObservedIntent: string | null;
  /** A SERP vigente misturou intenções de forma relevante? */
  serpMixedIntent: boolean;
  /** A SERP foi executada e está vigente para esta composição. */
  serpResolved: boolean;
  /**
   * O Minerador CONCLUIU que a intenção é ambígua (`intencao_ambigua = sim`).
   *
   * Isto não é ausência de processamento: é o resultado dele. A diferença
   * aparece no motivo mostrado — "o Minerador concluiu que é ambígua" e "não
   * há intenção declarada" descrevem situações distintas.
   */
  principalIntentConcludedAmbiguous?: boolean;
  /** O Minerador resolveu o funil explicitamente como não classificável. */
  funnelConcludedUnclassifiable?: boolean;

  principalFunnel: string | null;
  compositionFunnels: readonly (string | null)[];

  /** Score do KGR da Principal, como recebido. Ausência nunca vira zero. */
  principalKgrScore: number | null;
  /** Aplicabilidade recebida: `pending` significa que o fato não chegou. */
  principalKgrApplicability: "pending" | "applicable" | "not_applicable";
  /** KGR pleno pela regra vigente do contrato (score < 0.25). */
  fullKgr: boolean;
  /** Decisão humana de KGR já registrada, quando existir. */
  humanKgrDecision: "YES" | "NO" | null;
  /** A regra atual devolve a decisão ao humano neste caso. */
  awaitingHumanKgrDecision: boolean;

  /** Conflitos de compatibilidade detectados na composição. */
  compatibilityConflicts: number;
  /** Secundárias cuja compatibilidade foi avaliada. */
  compatibilityEvaluated: number;
  /** Quantas keywords a composição tem. Uma só não tem par a comparar. */
  compositionKeywordCount?: number;

  isPublished: boolean;
  principalProtected: boolean;
};

const contarUnicos = (valores: readonly (ArticleTerminalIntent | ArticleTerminalFunnel | null)[]) =>
  [...new Set(valores.filter(Boolean))];

function resolveIntent(evidence: ClassificationEvidence): ResolvedField<ArticleTerminalIntent> {
  const principal = normalizeIntentLabel(evidence.principalIntent);
  const daComposicao = contarUnicos(evidence.compositionIntents.map(normalizeIntentLabel)) as ArticleTerminalIntent[];
  const daSerp = normalizeIntentLabel(evidence.serpObservedIntent);

  // A SERP mistura intenções de forma relevante: o achado É a mistura.
  if (evidence.serpMixedIntent) {
    return {
      value: "MIXED",
      source: "serp",
      reason: "A SERP vigente apresenta mistura relevante de intenções; a mistura é o resultado observado, não uma dúvida em aberto.",
    };
  }

  // Principal e SERP concordam, ou só uma delas fala: valor forte.
  const candidatos = contarUnicos([principal, daSerp]) as ArticleTerminalIntent[];
  if (candidatos.length === 1) {
    const unico = candidatos[0];
    const divergentes = daComposicao.filter(intent => intent !== unico);
    if (!divergentes.length) {
      return {
        value: unico,
        source: daSerp === unico && principal !== unico ? "serp" : "principal",
        reason: daSerp === unico
          ? "A intenção da Principal é sustentada pela SERP vigente e a composição não diverge."
          : "A Principal declara esta intenção e a composição não diverge.",
      };
    }
    return {
      value: "MIXED",
      source: "group",
      reason: `A Principal é ${unico} e ${divergentes.length} keyword(s) da composição declaram outra intenção: o artigo cobre mais de uma.`,
    };
  }

  // Principal e SERP discordam entre si.
  if (candidatos.length > 1) {
    return {
      value: "MIXED",
      source: "serp",
      reason: "A intenção declarada pela Principal e a observada na SERP diferem; o artigo atende às duas.",
    };
  }

  // Nada decide. Registrar a incerteza — nunca deixar pendência.
  //
  // A ambiguidade CONCLUÍDA pelo Minerador é preservada como o que é: um
  // resultado upstream, não a falta de um.
  if (evidence.principalIntentConcludedAmbiguous) {
    return {
      value: "AMBIGUOUS",
      source: "principal",
      reason: evidence.serpResolved
        ? "O Minerador concluiu que a intenção desta Principal é ambígua e a SERP vigente não desempata."
        : "O Minerador concluiu que a intenção desta Principal é ambígua.",
    };
  }
  return {
    value: "AMBIGUOUS",
    source: "article_decision",
    reason: evidence.serpResolved
      ? "Nem a Principal nem a SERP vigente sustentam uma intenção única para este artigo."
      : "Não há intenção declarada pela Principal e a SERP não sustenta uma escolha única.",
  };
}

function resolveFunnel(evidence: ClassificationEvidence): ResolvedField<ArticleTerminalFunnel> {
  const principal = normalizeFunnelLabel(evidence.principalFunnel);
  const daComposicao = contarUnicos(evidence.compositionFunnels.map(normalizeFunnelLabel)) as ArticleTerminalFunnel[];
  const todos = contarUnicos([principal, ...daComposicao]) as ArticleTerminalFunnel[];

  if (todos.length === 1) {
    return {
      value: todos[0],
      source: principal ? "principal" : "group",
      reason: principal
        ? "A Principal declara este estágio e a composição não diverge."
        : "A composição converge para um único estágio de funil.",
    };
  }
  if (todos.length > 1) {
    return {
      value: "MIXED",
      source: "group",
      reason: `A composição declara ${todos.length} estágios de funil distintos: o artigo atravessa mais de um.`,
    };
  }
  if (evidence.funnelConcludedUnclassifiable) {
    return {
      value: "INDETERMINATE",
      source: "principal",
      reason: "O Minerador resolveu explicitamente o funil desta Principal como não classificável.",
    };
  }
  return {
    value: "INDETERMINATE",
    source: "article_decision",
    reason: "A composição não sustenta classificação única de estágio de funil.",
  };
}

function resolveKgrApplicability(evidence: ClassificationEvidence): ResolvedField<ArticleTerminalKgrApplicability> {
  if (evidence.principalKgrApplicability === "applicable") {
    return { value: "APPLICABLE", source: "principal", reason: "A Principal recebeu aplicabilidade de KGR do Minerador.", };
  }
  if (evidence.principalKgrApplicability === "not_applicable") {
    return { value: "NOT_APPLICABLE", source: "principal", reason: "O Minerador classificou esta Principal como fora do escopo do KGR." };
  }
  /*
   * `pending` significa que o FATO não chegou — e daí não se conclui
   * "aplicável". Afirmar aplicabilidade sem o dado seria a falsa certeza que
   * o §12 proíbe; o terminal honesto é declarar que o KGR não se aplica a
   * este artigo por ausência dos fatos, dizendo isso por extenso.
   */
  return {
    value: "NOT_APPLICABLE",
    source: "article_decision",
    reason: "O Minerador não entregou os fatos de aplicabilidade desta Principal: o KGR não se aplica a este artigo.",
  };
}

function resolveKgr(
  evidence: ClassificationEvidence,
  applicability: ResolvedField<ArticleTerminalKgrApplicability>,
): ResolvedField<ArticleTerminalKgr> {
  // Decisão humana registrada é a autoridade e não é recalculada.
  if (evidence.humanKgrDecision) {
    return {
      value: evidence.humanKgrDecision,
      source: "article_decision",
      reason: "Decisão humana de KGR registrada para este artigo.",
    };
  }
  // NOT_APPLICABLE não vira "Não": são coisas distintas no contrato vigente.
  if (applicability.value === "NOT_APPLICABLE") {
    return {
      value: "NOT_APPLICABLE",
      source: applicability.source,
      reason: `KGR não avaliado porque a aplicabilidade é Não aplicável. ${applicability.reason}`,
    };
  }
  if (evidence.fullKgr) {
    return {
      value: "YES",
      source: "principal",
      reason: `KGR pleno pela métrica da Principal (${evidence.principalKgrScore ?? "?"}), abaixo do limite vigente.`,
    };
  }
  if (evidence.principalKgrScore === null) {
    return {
      value: "NOT_APPLICABLE",
      source: "article_decision",
      reason: "A Principal não trouxe score de KGR: sem a métrica não há o que afirmar.",
    };
  }
  return {
    value: "NO",
    source: "principal",
    reason: `A métrica da Principal (${evidence.principalKgrScore}) não caracteriza KGR pleno.`,
  };
}

function resolveCompatibility(evidence: ClassificationEvidence): ResolvedField<ArticleTerminalCompatibility> {
  /*
   * Artigo de uma keyword não tem compatibilidade pairwise.
   *
   * A Principal é a própria keyword por estrutura, e não há secundária com
   * quem compará-la. Isto é resultado terminal, não incerteza — e não gera
   * decisão humana nenhuma.
   */
  if (evidence.compositionKeywordCount === 1) {
    return {
      value: "NOT_APPLICABLE",
      source: "group",
      reason: "Artigo de uma keyword: não existe par para avaliar compatibilidade.",
    };
  }
  if (!evidence.compatibilityEvaluated) {
    return {
      value: "AMBIGUOUS",
      source: "article_decision",
      reason: "Nenhuma secundária teve compatibilidade avaliada: não há base para afirmar coerência nem conflito.",
    };
  }
  if (!evidence.compatibilityConflicts) {
    return {
      value: "COMPATIBLE",
      source: "group",
      reason: `As ${evidence.compatibilityEvaluated} secundária(s) avaliadas são coerentes com a Principal.`,
    };
  }
  if (evidence.compatibilityConflicts >= evidence.compatibilityEvaluated) {
    return {
      value: "INCOMPATIBLE",
      source: "group",
      reason: "Todas as secundárias avaliadas conflitam com a Principal.",
    };
  }
  return {
    value: "PARTIAL",
    source: "group",
    reason: `${evidence.compatibilityConflicts} de ${evidence.compatibilityEvaluated} secundária(s) conflitam com a Principal.`,
  };
}

function resolveProtection(evidence: ClassificationEvidence): ResolvedField<ArticleTerminalProtection> {
  if (!evidence.isPublished) {
    return { value: "NEW", source: "article_decision", reason: "O artigo não corresponde a nenhuma página publicada." };
  }
  return evidence.principalProtected
    ? { value: "PUBLISHED_LOCKED", source: "principal", reason: "Página publicada com identidade travada: slug e canonical não mudam por decisão de tela." }
    : { value: "PUBLISHED_REVISABLE", source: "principal", reason: "Página publicada cuja identidade permanece revisável." };
}

export function resolveArticleClassification(evidence: ClassificationEvidence): ArticleClassification {
  const kgrApplicability = resolveKgrApplicability(evidence);
  return {
    intent: resolveIntent(evidence),
    funnel: resolveFunnel(evidence),
    kgrApplicability,
    kgr: resolveKgr(evidence, kgrApplicability),
    compatibility: resolveCompatibility(evidence),
    protection: resolveProtection(evidence),
  };
}

/* ---------------------------- o portão do §13 ----------------------------- */

/**
 * O que ainda é ESTADO DE PROCESSO e por isso impede concluir a formação.
 *
 * A resolução acima sempre devolve terminal — ela não pode ficar em branco.
 * O que ela NÃO pode fazer é decidir no lugar do humano quando a regra
 * vigente devolve a decisão a ele: KGR com score fora do pleno e
 * aplicabilidade `Aplicável` é decisão editorial, não default.
 */
export const CLASSIFICATION_BLOCKER_LABELS = {
  /**
   * O contrato afirma que o KGR SE APLICA a esta Principal e a métrica nunca
   * chegou. É o único caso em que os fatos não respondem: dizer "Não" seria
   * reprovar sem medir, e dizer "Não aplicável" contradiria o que o próprio
   * Minerador declarou. Aqui a decisão é editorial de verdade.
   */
  KGR_APPLICABLE_WITHOUT_METRIC: "KGR (aplicável, sem métrica)",
} as const;
export type ClassificationBlockerCode = keyof typeof CLASSIFICATION_BLOCKER_LABELS;

/**
 * CÁLCULO DISPONÍVEL NÃO VIRA DECISÃO HUMANA.
 *
 * A regra anterior barrava todo artigo cujo score ficasse fora do KGR pleno
 * com aplicabilidade `Aplicável` — mas aí o fato JÁ RESPONDE: score ≥ 0,25
 * não é KGR pleno, e `NO` sai da métrica, não de uma opinião. Transformar
 * isso em pendência devolvia ao humano um trabalho que os dados já fizeram,
 * e travava a conclusão de artigos completos.
 *
 * O humano continua podendo sobrepor: decisão registrada prevalece e não é
 * recalculada. O que ele não precisa mais é confirmar a aritmética.
 *
 * A exigência de SERP vigente também saiu daqui: ela já é o portão
 * `SERP_EVIDENCE_CURRENT` da conclusão. Duas leituras da mesma pergunta é
 * exatamente o defeito que este módulo existe para não repetir.
 */
export function unresolvedClassifications(evidence: ClassificationEvidence): ClassificationBlockerCode[] {
  const codes: ClassificationBlockerCode[] = [];
  if (
    evidence.principalKgrApplicability === "applicable"
    && evidence.principalKgrScore === null
    && !evidence.humanKgrDecision
  ) {
    codes.push("KGR_APPLICABLE_WITHOUT_METRIC");
  }
  return codes;
}

/** Mensagem do §13, nomeando os campos. */
export function unresolvedClassificationMessage(codes: readonly ClassificationBlockerCode[]): string | null {
  if (!codes.length) return null;
  return `Este Article ainda possui classificações não resolvidas: ${codes.map(code => CLASSIFICATION_BLOCKER_LABELS[code]).join(", ")}.`;
}

/* ------------------------- rótulos para a tela ---------------------------- */

export const ARTICLE_INTENT_LABELS: Record<ArticleTerminalIntent, string> = {
  INFORMATIONAL: "Informacional",
  COMMERCIAL_INVESTIGATION: "Comercial",
  TRANSACTIONAL: "Transacional",
  NAVIGATIONAL: "Navegacional",
  LOCAL: "Local",
  MIXED: "Mista",
  AMBIGUOUS: "Ambígua",
};

export const ARTICLE_FUNNEL_LABELS: Record<ArticleTerminalFunnel, string> = {
  TOP: "Topo",
  MIDDLE: "Meio",
  BOTTOM: "Fundo",
  MIXED: "Misto",
  INDETERMINATE: "Indeterminado",
};

export const ARTICLE_KGR_LABELS: Record<ArticleTerminalKgr, string> = {
  YES: "Sim",
  NO: "Não",
  NOT_APPLICABLE: "Não aplicável",
};

export const ARTICLE_KGR_APPLICABILITY_LABELS: Record<ArticleTerminalKgrApplicability, string> = {
  APPLICABLE: "Aplicável",
  NOT_APPLICABLE: "Não aplicável",
};

export const ARTICLE_COMPATIBILITY_LABELS: Record<ArticleTerminalCompatibility, string> = {
  COMPATIBLE: "Compatível",
  PARTIAL: "Parcial",
  INCOMPATIBLE: "Incompatível",
  AMBIGUOUS: "Ambígua",
  NOT_APPLICABLE: "Não aplicável",
};

export const ARTICLE_PROTECTION_LABELS: Record<ArticleTerminalProtection, string> = {
  NEW: "Novo",
  PUBLISHED_LOCKED: "Publicado protegido",
  PUBLISHED_REVISABLE: "Publicado revisável",
};

/** Nenhum destes pode sobreviver a uma aprovação. */
export const PROCESS_STATE_WORDS = ["pendente", "não recebido", "nao recebido", "não executado", "aguardando", "a decidir"] as const;

export function isProcessStateWord(label: string): boolean {
  const normalizado = label.trim().toLowerCase();
  return PROCESS_STATE_WORDS.some(palavra => normalizado === palavra);
}
