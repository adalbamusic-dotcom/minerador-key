import type { ArticleCandidate, ArticleKeywordRole } from "./article-formation.ts";

/**
 * A SERP É GATE DA FORMAÇÃO, NÃO REFINAMENTO POSTERIOR.
 *
 * O `engine.ts` responde "estas buscas parecem pertencer juntas". Isso é uma
 * hipótese determinística sobre texto: ela não sabe o que o Google brasileiro
 * devolve para cada uma delas. Concluir um Article com base só nisso é gravar
 * como contrato uma suposição que nunca foi confrontada com o mercado.
 *
 * A precedência é evidencial, não de mutação:
 *
 *   LÓGICA  hipótese determinística
 *   SERP    evidência externa observável   ← precede na LEITURA
 *   IA      proposta analítica opcional
 *   HUMANO  consolidação                   ← decide, sempre
 *
 * A SERP nunca move keyword, nunca troca Principal e nunca materializa. Ela
 * responde se a composição se sustenta — e quando ela contradiz a lógica, é a
 * lógica que precisa se explicar.
 *
 * "SERP obrigatória" também não significa "chamar o provider sempre". Significa
 * que nenhum Article chega à conclusão sem evidência VIGENTE para a composição
 * que está sendo gravada. Evidência vigente é reaproveitada; o que envelheceu é
 * o que precisa ser refeito — e só no Article afetado.
 *
 * Domínio puro: sem storage, sem fetch, sem provider.
 */

/* ------------------------ a base da evidência ---------------------------- */

/**
 * O que a evidência SERP descreve.
 *
 * Se qualquer um destes campos muda, a SERP anterior passou a falar de outro
 * artigo. O papel entra de propósito: perguntamos à SERP se aquela busca cabe
 * como secundária ou como reforço, então mudar o papel muda a pergunta.
 *
 * Não entram: timestamp, seleção visual, posição no mapa, zoom, expansão da UI.
 * Nada disso muda o que o Google devolve.
 */
export type ArticleSerpBase = {
  territoryRef: string;
  principalKeywordId: string;
  /** Papel de cada busca da composição, em ordem estável. */
  roles: readonly { keywordId: string; role: ArticleKeywordRole }[];
  suggestedSlug: string | null;
  /** Intenção declarada de cada busca; a SERP compara com a observada. */
  intents: readonly { keywordId: string; intent: string | null }[];
  /** Contexto estrutural do Silo que muda a pergunta feita ao mercado. */
  siloContext: { centralEntity: string | null; macroIntent: string | null };
};

export function articleSerpBaseHash(base: ArticleSerpBase): string {
  const canonical = JSON.stringify([
    base.territoryRef,
    base.principalKeywordId,
    [...base.roles].map(item => `${item.keywordId}:${item.role}`).sort(),
    base.suggestedSlug || "",
    [...base.intents].map(item => `${item.keywordId}:${(item.intent || "").trim().toLowerCase()}`).sort(),
    (base.siloContext.centralEntity || "").trim().toLowerCase(),
    (base.siloContext.macroIntent || "").trim().toLowerCase(),
  ]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `serpbase:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** A base de um candidato do cenário corrente. */
export function articleSerpBaseOf(input: {
  candidate: ArticleCandidate;
  intentByKeywordId: ReadonlyMap<string, string | null>;
  siloContext?: { centralEntity?: string | null; macroIntent?: string | null };
}): ArticleSerpBase {
  const membros = [
    ...input.candidate.keywords.map(item => ({ keywordId: item.keywordId, role: item.role })),
    // Excedente do teto participa da composição e por isso da pergunta.
    ...input.candidate.overflowKeywordIds.map(keywordId => ({ keywordId, role: "reforco" as ArticleKeywordRole })),
  ];
  return {
    territoryRef: input.candidate.siloRef,
    principalKeywordId: input.candidate.principalKeywordId,
    roles: membros,
    suggestedSlug: input.candidate.suggestedSlug,
    intents: membros.map(item => ({ keywordId: item.keywordId, intent: input.intentByKeywordId.get(item.keywordId) ?? null })),
    siloContext: {
      centralEntity: input.siloContext?.centralEntity ?? null,
      macroIntent: input.siloContext?.macroIntent ?? null,
    },
  };
}

/* ------------------------- o estado do gate ------------------------------ */

/**
 * OS ESTADOS DO GATE.
 *
 * A distinção que faltava, e que fazia a mesa se contradizer:
 *
 *   DIVERGENT  != MISSING
 *   INCONCLUSIVE != MISSING
 *
 * Se o parecer existe, pertence a este candidato e descreve a composição de
 * agora, então a SERP FOI executada. Dizer "não tem evidência" sobre um
 * artigo que foi ao mercado e voltou com uma divergência é apagar justamente
 * o achado — e mandar o humano coletar de novo o que já está gravado.
 *
 * O que muda entre eles é a CONCLUSÃO editorial, e quem a resolve é a pessoa.
 */
export const ARTICLE_SERP_STATES = [
  "missing",
  "processing",
  "failed",
  "stale",
  "current_supported",
  "current_divergent_unresolved",
  "current_divergent_resolved",
  "current_inconclusive_unresolved",
  "current_inconclusive_resolved",
] as const;

export type ArticleSerpState = (typeof ARTICLE_SERP_STATES)[number];

/**
 * Rótulos da fase Artigos.
 *
 * "Não necessária" NÃO existe aqui. Um Article novo nunca está fora do gate:
 * dizer que a evidência é dispensável é afirmar que a hipótese da lógica basta,
 * e é exatamente essa afirmação que o contrato proíbe.
 */
export const ARTICLE_SERP_STATE_LABELS: Record<ArticleSerpState, string> = {
  missing: "não executada",
  processing: "processando",
  failed: "falhou",
  stale: "desatualizada",
  current_supported: "sustentada",
  current_divergent_unresolved: "divergente",
  current_divergent_resolved: "divergente · resolvida",
  current_inconclusive_unresolved: "inconclusiva",
  current_inconclusive_resolved: "inconclusiva · resolvida",
};

/** A SERP foi ao mercado e voltou descrevendo ESTA composição? */
export function serpWasExecutedFor(state: ArticleSerpState): boolean {
  return state.startsWith("current_");
}

/** Falta uma decisão editorial da pessoa — não falta evidência. */
export function serpAwaitsHuman(state: ArticleSerpState): boolean {
  return state === "current_divergent_unresolved" || state === "current_inconclusive_unresolved";
}

/** Precisa ir (ou voltar) ao provider. */
export function serpNeedsCollection(state: ArticleSerpState): boolean {
  return state === "missing" || state === "stale" || state === "failed";
}

export type ArticleSerpGateState = {
  candidateRef: string;
  state: ArticleSerpState;
  label: string;
  /** Hash da composição que a evidência precisaria descrever. */
  expectedBaseHash: string;
  observedBaseHash: string | null;
  /** Impede concluir enquanto não for resolvido. */
  blocksConclusion: boolean;
  /** Passa a poder concluir se um humano registrar a decisão. */
  requiresHumanDecision: boolean;
  reason: string;
};

export type ObservedArticleSerp = {
  /** Base que a evidência descreve; ausente em avaliação anterior ao gate. */
  formationBaseHash: string | null;
  verdict: "NOT_RUN" | "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE";
  /** Decisão humana registrada sobre divergência/inconclusão desta base. */
  humanDecisionBaseHash?: string | null;
};

/**
 * Este Article pode ser concluído?
 *
 * A pergunta é sempre sobre a composição de AGORA. Uma avaliação excelente de
 * uma composição anterior não autoriza gravar a atual — e é justamente aí que
 * o erro costuma passar despercebido, porque a tela mostra um ✓ verde.
 */
export function resolveArticleFormationSerpState(input: {
  candidateRef: string;
  expectedBaseHash: string;
  observed: ObservedArticleSerp | null;
  processing?: boolean;
  failed?: boolean;
}): ArticleSerpGateState {
  const monta = (
    state: ArticleSerpState,
    reason: string,
    options: { blocks?: boolean; human?: boolean } = {},
  ): ArticleSerpGateState => ({
    candidateRef: input.candidateRef,
    state,
    label: ARTICLE_SERP_STATE_LABELS[state],
    expectedBaseHash: input.expectedBaseHash,
    observedBaseHash: input.observed?.formationBaseHash ?? null,
    blocksConclusion: options.blocks ?? true,
    requiresHumanDecision: options.human ?? false,
    reason,
  });

  if (input.processing) {
    return monta("processing", "A evidência SERP deste artigo está sendo coletada.");
  }
  if (input.failed) {
    // Falha não é ausência de necessidade: é evidência que faltou por erro.
    return monta("failed", "A coleta da SERP falhou neste artigo; refaça antes de concluir.");
  }
  if (!input.observed || input.observed.verdict === "NOT_RUN") {
    return monta("missing", "Este artigo ainda não foi confrontado com a SERP.");
  }
  if (input.observed.formationBaseHash !== input.expectedBaseHash) {
    return monta("stale", input.observed.formationBaseHash
      ? "A composição mudou depois desta coleta: a evidência anterior não descreve mais este artigo."
      : "A avaliação vigente é anterior ao gate e não declara qual composição observou.");
  }

  const decidido = input.observed.humanDecisionBaseHash === input.expectedBaseHash;

  if (input.observed.verdict === "DIVERGENCE") {
    return decidido
      ? monta("current_divergent_resolved", "A SERP diverge da composição e a decisão editorial já foi registrada para esta base.", { blocks: false })
      : monta("current_divergent_unresolved", "A SERP foi executada e diverge desta composição; a decisão editorial precisa ser registrada.", { human: true });
  }
  if (input.observed.verdict === "INCONCLUSIVE") {
    return decidido
      ? monta("current_inconclusive_resolved", "A evidência é insuficiente e a decisão de seguir assim já foi registrada para esta base.", { blocks: false })
      : monta("current_inconclusive_unresolved", "A SERP foi executada mas não confirma nem rejeita esta composição; decida explicitamente.", { human: true });
  }
  return monta("current_supported", "A SERP vigente sustenta esta composição.", { blocks: false });
}

/**
 * Leitura do lote.
 *
 * `analyzed` conta quem FOI ao mercado — inclusive divergente e inconclusivo.
 * Era essa contagem que faltava: sem ela a mesa dizia "3 vigentes" sobre um
 * lote em que os 7 tinham parecer, e a conclusão acusava ausência de
 * evidência onde havia decisão pendente.
 */
export function summarizeArticleSerpGate(states: readonly ArticleSerpGateState[]) {
  const porEstado = new Map<ArticleSerpState, number>();
  for (const item of states) porEstado.set(item.state, (porEstado.get(item.state) || 0) + 1);
  const conta = (state: ArticleSerpState) => porEstado.get(state) || 0;
  return {
    total: states.length,
    /** Parecer vigente para a composição atual, qualquer que seja o veredito. */
    analyzed: states.filter(item => serpWasExecutedFor(item.state)).length,
    supported: conta("current_supported"),
    divergent: conta("current_divergent_unresolved") + conta("current_divergent_resolved"),
    divergentResolved: conta("current_divergent_resolved"),
    inconclusive: conta("current_inconclusive_unresolved") + conta("current_inconclusive_resolved"),
    inconclusiveResolved: conta("current_inconclusive_resolved"),
    missing: conta("missing"),
    stale: conta("stale"),
    failed: conta("failed"),
    processing: conta("processing"),
    /** Evidência existe; falta a pessoa decidir. */
    awaitingHuman: states.filter(item => serpAwaitsHuman(item.state)).length,
    blocking: states.filter(item => item.blocksConclusion).length,
    /** Quem precisa de SERP nova: sem evidência, envelhecida ou com falha. */
    needsCollection: states.filter(item => serpNeedsCollection(item.state)).map(item => item.candidateRef),
    /** Quem espera decisão: a lista que a portaria nomeia. */
    awaitingDecision: states.filter(item => serpAwaitsHuman(item.state)).map(item => item.candidateRef),
  };
}

/* ------------------- o parecer da SERP sobre a composição ---------------- */

/** Ações que dizem, em texto, que o mercado NÃO sustenta a composição. */
const ACOES_DIVERGENTES = new Set([
  "tornar_principal",
  "separar_artigo",
  "retirar_do_artigo",
  "sugerir_artigo_suporte",
]);

/**
 * O parecer, lido do que a própria avaliação registrou.
 *
 * Nada é recalculado aqui: `intentCompatibility`, `conflicts` e as ações por
 * keyword já são o que a SERP concluiu. A tradução para três estados existe
 * para o gate poder perguntar uma coisa só — "esta composição se sustenta?".
 */
export function serpVerdictOfAssessment(assessment: {
  intentCompatibility: "coerente" | "parcialmente_coerente" | "incompativel" | "insuficiente";
  conflicts: readonly string[];
  recommendations: readonly { action: string; confidence: string }[];
}): "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE" {
  /**
   * Uma recomendação específica e confiante vem primeiro.
   *
   * "Separar este artigo" com confiança alta é o mercado dizendo algo concreto
   * sobre UMA busca, mesmo quando a leitura geral do grupo ficou fraca.
   * Rebaixar isso a "inconclusiva" esconderia o achado mais acionável do lote.
   */
  const divergenciaConfiavel = assessment.recommendations
    .some(item => ACOES_DIVERGENTES.has(item.action) && item.confidence !== "inconclusiva");
  if (divergenciaConfiavel) return "DIVERGENCE";

  // Evidência fraca não é evidência a favor: dizer "compatível" aqui faria a
  // ausência de sinal virar aprovação.
  if (assessment.intentCompatibility === "insuficiente") return "INCONCLUSIVE";
  if (assessment.recommendations.length
    && assessment.recommendations.every(item => item.confidence === "inconclusiva")) return "INCONCLUSIVE";

  if (assessment.intentCompatibility === "incompativel") return "DIVERGENCE";
  /**
   * `conflicts` sozinho NÃO é divergência.
   *
   * O próprio domínio da SERP registra a regra: "ausência de resultado ou
   * cobertura permanece como evidência insuficiente, não como conflito". No
   * lote real, todo conflito era "a intenção esperada (unknown) não coincide
   * com a aparente" — ou seja, o Minerador não declarou intenção. Tratar isso
   * como divergência seria culpar o mercado por uma lacuna nossa.
   */
  if (assessment.conflicts.length) return "INCONCLUSIVE";
  if (assessment.recommendations.some(item => ACOES_DIVERGENTES.has(item.action))) return "INCONCLUSIVE";
  return "COMPATIBLE";
}

/** Nome anterior preservado: a mesma função, uma porta só. */
export const resolveArticleSerpGate = resolveArticleFormationSerpState;
