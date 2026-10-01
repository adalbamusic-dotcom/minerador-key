import { normalizeIntentKey } from "../minerador/intent-taxonomy.ts";
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
  /*
   * A TAXONOMIA DO MINERADOR VEM ANTES DO TEXTO LIVRE (2026-10-01).
   *
   * "Informativa" — o rótulo canônico que o Minerador grava — não casava com
   * /informacion/ e virava null: toda Principal informativa saía "Ambígua", e
   * o artigo ficava "Incompatível" sem conflito nenhum.
   */
  const canonica = normalizeIntentKey(texto);
  if (canonica !== "unknown") return INTENT_BY_NORMALIZED[canonica];
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
  /** Funil que a SERP mostra (topo/meio/fundo/misto), pelas quatro lentes. Ausente em parecer antigo. */
  serpObservedFunnel?: string | null;
  /** Participação de cada intenção na SERP, em %, para dizer o porquê. */
  serpIntentShares?: { informacional: number; comercial: number; transacional: number; lenses: number; results: number } | null;
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
  /**
   * "Aplicar KGR" do ARTIGO (contrato `article-kgr-decision-v2`, SDD
   * 2026-09-28). Quando informado, é a única fonte da aplicabilidade: `false`
   * = KGR não aplicável por padrão; `true` = o humano (ou um vínculo
   * confirmado, ou a regra antiga gravada) aplica o KGR. Ausente = leitura
   * anterior, pela aplicabilidade da Principal.
   */
  articleAppliesKgr?: boolean | null;

  /** Conflitos de compatibilidade detectados na composição. */
  compatibilityConflicts: number;
  /** Secundárias cuja compatibilidade foi avaliada. */
  compatibilityEvaluated: number;
  /** Quantas keywords a composição tem. Uma só não tem par a comparar. */
  compositionKeywordCount?: number;
  /**
   * A Principal é um Assunto declarado (D3). Sozinho, o Assunto é tronco que
   * aguarda sustentação — nunca "Não aplicável".
   */
  principalIsSubject?: boolean;

  isPublished: boolean;
  principalProtected: boolean;
};

const contarUnicos = (valores: readonly (ArticleTerminalIntent | ArticleTerminalFunnel | null)[]) =>
  [...new Set(valores.filter(Boolean))];

const serpSharesText = (shares: NonNullable<ClassificationEvidence["serpIntentShares"]>) =>
  `informacional ${shares.informacional}% · comercial ${shares.comercial}% · transacional ${shares.transacional}% (${shares.lenses} lente${shares.lenses === 1 ? "" : "s"}, ${shares.results} resultados)`;

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

  /*
   * A SERP TEM A ÚLTIMA PALAVRA (dono, 2026-10-01).
   *
   * O Minerador entrega um padrão genérico (Google Ads); a SERP é dado real
   * das quatro lentes. Quando ela mostra uma intenção, é ELA que vale — mesmo
   * com participação baixa, mesmo contra a Principal ou a composição. O que
   * o Minerador declarava fica dito no motivo, não decide.
   */
  if (daSerp) {
    const declarada = principal && principal !== daSerp ? ` O Minerador declarava ${principal}; a SERP corrige.` : "";
    const fatia = evidence.serpIntentShares ? ` Participação na SERP: ${serpSharesText(evidence.serpIntentShares)}.` : "";
    return {
      value: daSerp,
      source: "serp",
      reason: `A SERP vigente mostra intenção ${daSerp}.${fatia}${declarada}`,
    };
  }

  // Sem SERP com intenção: Principal e composição (o padrão do Minerador).
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
  // A SERP tem a última palavra também sobre o funil (dono, 2026-10-01).
  const daSerp = evidence.serpObservedFunnel && evidence.serpObservedFunnel !== "indefinido" ? normalizeFunnelLabel(evidence.serpObservedFunnel) : null;
  if (daSerp) {
    const declarado = principal && principal !== daSerp ? ` O Minerador declarava ${principal}; a SERP corrige.` : "";
    const fatia = evidence.serpIntentShares ? ` Participação na SERP: ${serpSharesText(evidence.serpIntentShares)}.` : "";
    return { value: daSerp, source: "serp", reason: `A SERP vigente mostra funil ${daSerp}.${fatia}${declarado}` };
  }
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
  /*
   * PADRÃO "KGR NÃO APLICÁVEL" (SDD 2026-09-28). A aplicabilidade é do
   * ARTIGO: sem "Aplicar KGR", não se aplica — e isso é resultado terminal,
   * não pendência. A mesa e o ArticleDNA leem a mesma resposta.
   */
  if (typeof evidence.articleAppliesKgr === "boolean") {
    return evidence.articleAppliesKgr
      ? { value: "APPLICABLE", source: "article_decision", reason: "O artigo aplica o KGR (\"Aplicar KGR\" = Sim)." }
      : { value: "NOT_APPLICABLE", source: "article_decision", reason: "KGR não aplicável por padrão: ninguém escolheu Aplicar KGR neste artigo." };
  }
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
  // O artigo aplica o KGR sem decisão humana registrada: vínculo confirmado ou regra antiga gravada.
  if (evidence.articleAppliesKgr === true) {
    return {
      value: "YES",
      source: "article_decision",
      reason: evidence.principalKgrScore === null
        ? "O artigo aplica o KGR; falta o allintitle da Principal para calcular a métrica."
        : `O artigo aplica o KGR; KGR do artigo ${evidence.principalKgrScore}.`,
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
    /*
     * D2/D3 — PUBLICADO E ASSUNTO NUNCA SÃO "NÃO APLICÁVEL".
     *
     * A página publicada já foi formada e comprovada no ar: sozinha, ela é um
     * artigo completo que aguarda reforço. O Assunto é tronco. Os dois são
     * compatíveis consigo mesmos por definição, e o motivo diz o que falta —
     * o valor continua dentro do vocabulário gravado no ArticleDNA.
     */
    if (evidence.isPublished) {
      return {
        value: "COMPATIBLE",
        source: "article_decision",
        reason: "Artigo publicado: a página no ar já comprova a composição. Sozinho, é um artigo completo que aguarda reforço de keywords compatíveis (até seis).",
      };
    }
    if (evidence.principalIsSubject) {
      return {
        value: "COMPATIBLE",
        source: "article_decision",
        reason: "Assunto declarado é tronco: aguarda as keywords de sustentação que o humano confirmar.",
      };
    }
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

/**
 * O RETRATO DA CLASSIFICAÇÃO, MONTADO NUM LUGAR SÓ (2026-10-01).
 *
 * A tela (`classificationEvidenceFor`) e o "Gravar melhorias" do servidor
 * montam a mesma evidência: intenção e funil de cada keyword (KeywordDNA
 * primeiro), a intenção observada no parecer da SERP e o KGR do artigo. Antes
 * só a tela sabia montar, e a melhoria gravava a sucessora com a classificação
 * da composição ANTERIOR. Nenhum score novo, nenhuma métrica recalculada.
 */
export function buildClassificationEvidence(input: {
  principal: { intent: string | null; funnel: string | null };
  secondaries: readonly { intent: string | null; funnel: string | null }[];
  keywordCount: number;
  serpInterpretation: { observedIntent: string; observedFunnel?: string | null; intentShares?: ClassificationEvidence["serpIntentShares"] } | null;
  serpResolved: boolean;
  kgr: {
    principalKgrScore: number | null;
    principalApplicability: ClassificationEvidence["principalKgrApplicability"];
    fullKgr: boolean;
    source: string;
    decision: string;
    requiresHumanDecision: boolean;
    applyKgr: boolean;
  };
  principalIsSubject: boolean;
  isPublished: boolean;
  principalProtected: boolean;
}): ClassificationEvidence {
  const { principal, secondaries } = input;
  // Conflito de compatibilidade é divergência de intenção declarada em
  // relação à Principal — a mesma leitura que o resumo já fazia.
  const avaliadas = secondaries.filter(item => item.intent).length;
  const conflitos = principal.intent
    ? secondaries.filter(item => item.intent && item.intent !== principal.intent).length
    : 0;
  const observada = input.serpInterpretation?.observedIntent ?? null;
  return {
    principalIntent: principal.intent,
    compositionIntents: secondaries.map(item => item.intent),
    serpObservedIntent: observada === "indefinido" ? null : observada,
    serpMixedIntent: observada === "misto",
    serpObservedFunnel: input.serpInterpretation?.observedFunnel ?? null,
    serpIntentShares: input.serpInterpretation?.intentShares ?? null,
    serpResolved: input.serpResolved,
    principalFunnel: principal.funnel,
    compositionFunnels: secondaries.map(item => item.funnel),
    principalKgrScore: input.kgr.principalKgrScore,
    principalKgrApplicability: input.kgr.principalApplicability,
    fullKgr: input.kgr.fullKgr,
    humanKgrDecision: input.kgr.source === "HUMAN_DECISION" && (input.kgr.decision === "YES" || input.kgr.decision === "NO")
      ? input.kgr.decision
      : null,
    awaitingHumanKgrDecision: input.kgr.requiresHumanDecision,
    // "Aplicar KGR" do artigo: a mesa e o ArticleDNA fecham com a mesma resposta.
    articleAppliesKgr: input.kgr.applyKgr,
    compatibilityConflicts: conflitos,
    compatibilityEvaluated: avaliadas,
    // Uma keyword não tem par: a compatibilidade não se aplica, e isso é
    // resultado terminal, não incerteza — exceto publicado e Assunto (D2/D3).
    compositionKeywordCount: input.keywordCount,
    principalIsSubject: input.principalIsSubject,
    isPublished: input.isPublished,
    principalProtected: input.principalProtected,
  };
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
  /*
   * Com "Aplicar KGR" informado, só o artigo que APLICA o KGR sem allintitle
   * medido fica bloqueado — inclusive por decisão humana: aplicar o KGR sem a
   * métrica não fecha. KGR não aplicável nunca bloqueia.
   */
  if (typeof evidence.articleAppliesKgr === "boolean") {
    if (evidence.articleAppliesKgr && evidence.principalKgrScore === null) codes.push("KGR_APPLICABLE_WITHOUT_METRIC");
    return codes;
  }
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

/* ------------- a decisão da SERP gravada no ArticleDNA (2026-10-01) ------------- */

const INTENCAO_NORMALIZADA: Partial<Record<ArticleTerminalIntent, "informational" | "commercial_investigation" | "transactional" | "navigational" | "local" | "mixed">> = {
  INFORMATIONAL: "informational",
  COMMERCIAL_INVESTIGATION: "commercial_investigation",
  TRANSACTIONAL: "transactional",
  NAVIGATIONAL: "navigational",
  LOCAL: "local",
  MIXED: "mixed",
};
const ETAPA_DO_FUNIL: Partial<Record<ArticleTerminalFunnel, string>> = {
  TOP: "Topo de funil (SERP)",
  MIDDLE: "Meio de funil (SERP)",
  BOTTOM: "Fundo de funil (SERP)",
  MIXED: "Funil misto (SERP)",
};

/**
 * CONCLUIR GRAVA O QUE A SERP DECIDIU (dono, 2026-10-01).
 *
 * A classificação já dá a última palavra à SERP; sem isto, o ArticleDNA
 * continuava com `mainIntent`, `intentProfile` e `journeyStage` do padrão
 * genérico do Minerador, e a ficha mostrava duas respostas para a mesma
 * pergunta. Só os campos que a SERP decidiu (`source = "serp"`) mudam; o
 * rótulo do Minerador continua em `intentProfile.originalLabel`, como
 * proveniência. Sem SERP decidindo, o payload volta igual.
 */
export function applySerpDecisionToArticle<T extends {
  mainIntent: string;
  journeyStage: string;
  intentProfile?: { primaryIntent: string; articlePurpose?: string; status?: string } & Record<string, unknown>;
}>(payload: T, classification: Pick<ArticleClassification, "intent" | "funnel">): T {
  const intencao = classification.intent.source === "serp" ? INTENCAO_NORMALIZADA[classification.intent.value] : undefined;
  const etapa = classification.funnel.source === "serp" ? ETAPA_DO_FUNIL[classification.funnel.value] : undefined;
  if (!intencao && !etapa) return payload;
  return {
    ...payload,
    ...(intencao ? {
      mainIntent: intencao,
      ...(payload.intentProfile ? { intentProfile: { ...payload.intentProfile, primaryIntent: intencao, articlePurpose: intencao, status: "confirmed" } } : {}),
    } : {}),
    ...(etapa ? { journeyStage: etapa } : {}),
  };
}
