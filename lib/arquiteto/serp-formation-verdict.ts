import type { SerpEvidencePriority } from "./serp-evidence-priority.ts";

/**
 * Veredito da SERP de formação.
 *
 * A SERP responde uma pergunta só: as KeywordDNAs já qualificadas podem
 * coexistir neste ArticleDNA? Evidência insuficiente nunca vira conflito
 * bloqueante — sem evidência não existe o que o humano resolver, e a estrutura
 * atual permanece.
 */
export type SerpFormationVerdictKind = "NOT_RUN" | "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE";

export type SerpDivergenceAction = "keep" | "separate" | "promote_primary";

export type SerpFormationDivergence = {
  keywordId: string;
  keyword: string;
  currentRole: string;
  upstreamFact: string;
  observedEvidence: string;
  overlapLabel: string;
  dominantPageType: string;
  observedIntent: string;
  evidenceStrength: string;
  recommendation: string;
  reason: string;
  impact: string;
  actions: SerpDivergenceAction[];
  /** Explicação para quem não conhece SEO: o que houve, por que importa e o que cada botão faz. */
  plain?: SerpDivergencePlain;
};

export type SerpDivergencePlain = {
  title: string;
  what: string;
  why: string;
  keep: string;
  apply: string;
  tip: string;
};

export type SerpKeywordObservation = {
  keywordId: string;
  keyword: string;
  currentRole: string;
  upstreamIntent: string;
  observedBehaviour: string;
  overlapLabel: string;
  dominantPageType: string;
  evidenceStrength: string;
  architecturalImpact: string;
};

export type SerpFormationVerdictReadModel = {
  kind: SerpFormationVerdictKind;
  label: string;
  headline: string;
  explanation: string;
  impact: string;
  divergences: SerpFormationDivergence[];
  /** Inconclusivo pode pedir nova coleta; nunca exige decisão humana. */
  canRefresh: boolean;
  blocking: boolean;
  /** Somente DIVERGENCE com evidência suficiente exige decisão humana. */
  humanDecisionRequired: boolean;
  observations: string[];
  /** Fatos por keyword: úteis sempre, mas nunca rotulados como conflito. */
  keywordObservations: SerpKeywordObservation[];
};

export type SerpFormationObservationInput = {
  keywordId: string;
  keyword: string;
  currentRole: "principal" | "secundaria" | "reforco_narrativo";
  upstreamIntent: string | null;
  observedIntent: string | null;
  compatibility: "coerente" | "parcialmente_coerente" | "incompativel" | "insuficiente";
  overlap: "low" | "medium" | "high" | "unknown";
  dominantPageType: string | null;
  competition: "baixa" | "media" | "alta" | "desconhecida";
  conflict: boolean;
  insufficientEvidence: boolean;
  likelyCannibalization: "likely" | "unlikely" | "unknown";
  needsSeparation: boolean | null;
  principalPossiblyInadequate: boolean | null;
  decisionStatus: "pending" | "followed" | "ignored" | "superseded";
  recommendationAction: string | null;
  recommendationReason: string | null;
};

export type SerpFormationVerdictInput = {
  hasAssessment: boolean;
  evidencePriority: SerpEvidencePriority;
  /** Total de keywords do artigo: com uma só não existe agrupamento a testar. */
  keywordCount: number;
  observations: readonly SerpFormationObservationInput[];
};

const OVERLAP_LABELS: Record<SerpFormationObservationInput["overlap"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  unknown: "Não observada",
};

const EVIDENCE_LABELS: Record<SerpEvidencePriority, string> = {
  prioritaria: "Forte",
  complementar: "Complementar",
  insuficiente: "Insuficiente",
};

const ACTION_RECOMMENDATION: Record<string, string> = {
  separar_artigo: "Separar esta keyword do artigo atual.",
  retirar_do_artigo: "Retirar esta keyword do artigo atual.",
  tornar_principal: "Promover esta keyword a Principal do artigo.",
  revisar_humano: "Revisar o pertencimento desta keyword.",
  sugerir_artigo_suporte: "Avaliar um artigo de suporte para esta keyword.",
};

function keywordObservations(input: SerpFormationVerdictInput): SerpKeywordObservation[] {
  const evidenceLabel = EVIDENCE_LABELS[input.evidencePriority];
  return input.observations.map(observation => ({
    keywordId: observation.keywordId,
    keyword: observation.keyword,
    currentRole: observation.currentRole,
    upstreamIntent: observation.upstreamIntent || "Indeterminada",
    observedBehaviour: observation.observedIntent || "Não observado",
    overlapLabel: OVERLAP_LABELS[observation.overlap],
    dominantPageType: observation.dominantPageType || "Não observada",
    evidenceStrength: observation.insufficientEvidence ? "Insuficiente" : evidenceLabel,
    architecturalImpact: "Nenhum",
  }));
}

/**
 * A mesma divergência, dita para quem nunca ouviu falar de SERP (dono,
 * 2026-09-30: "vai ter muitos user inexperientes em SEO mexendo").
 */
export function plainSerpDivergence(observation: SerpFormationObservationInput): SerpDivergencePlain {
  const k = `“${observation.keyword}”`;
  const overlap = OVERLAP_LABELS[observation.overlap].toLocaleLowerCase("pt-BR");
  const promote = observation.recommendationAction === "tornar_principal" || observation.principalPossiblyInadequate === true;
  const apart = observation.compatibility === "incompativel" || observation.needsSeparation === true
    || observation.recommendationAction === "separar_artigo" || observation.recommendationAction === "retirar_do_artigo";
  const what = promote
    ? `Pelo que o Google mostra, este artigo parece ser mais procurado por ${k} do que pela principal atual.`
    : observation.likelyCannibalization === "likely"
      ? `O Google mostra quase as mesmas páginas para ${k} e para outra keyword do artigo. As duas podem estar disputando o mesmo lugar em vez de somar.`
      : apart
        ? `Quando alguém pesquisa ${k}, o Google mostra páginas diferentes das que mostra para a principal do artigo (páginas em comum: ${overlap}). Para o Google, pode ser outro assunto.`
        : `O Google deu sinais mistos para ${k}: parte das páginas é a mesma da principal do artigo, parte não (páginas em comum: ${overlap}).`;
  return {
    title: promote ? `${k} pode representar melhor este artigo` : `${k} pode não pertencer a este artigo`,
    what,
    why: promote
      ? "Por que isso importa: a principal é a busca que dá nome ao artigo e orienta o título. Se o Google liga o artigo mais a outra busca, trocar a principal pode trazer mais visitas. Não é um erro do sistema: a plataforma nunca troca a principal sozinha, por isso pede a sua decisão."
      : "Por que isso importa: o Google costuma mostrar uma página para cada assunto. Uma keyword de outro assunto ocupa espaço no artigo sem ajudar a ranquear e pode enfraquecer a principal. Não é um erro do sistema: a plataforma nunca move keyword sozinha, por isso pede a sua decisão.",
    keep: promote
      ? `“Manter no artigo”: a principal atual continua; ${k} fica com o papel que já tem. O aviso sai da lista de pendências.`
      : `“Manter no artigo”: você confirma que ${k} fala do mesmo assunto. Ela continua no artigo e o aviso sai da lista de pendências.`,
    apply: promote
      ? "“Aplicar recomendação”: você concorda com o Google. O aviso sai da lista, mas nada muda sozinho: para trocar a principal, ajuste a formação do artigo depois. Em artigo publicado, URL e slug não mudam."
      : `“Aplicar recomendação”: você concorda com o Google. O aviso sai da lista, mas nada sai do artigo sozinho: para tirar ${k}, ajuste a formação do artigo depois.`,
    tip: promote
      ? `Na dúvida, pergunte: ${k} descreve melhor o que este artigo entrega do que a principal atual? E ela tem mais volume? Se as duas respostas forem sim, siga a recomendação.`
      : `Na dúvida, pergunte: quem pesquisa ${k} quer ler exatamente o que este artigo entrega? Se sim, mantenha.`,
  };
}

function divergenceActions(observation: SerpFormationObservationInput): SerpDivergenceAction[] {
  const actions: SerpDivergenceAction[] = ["keep", "separate"];
  if (observation.recommendationAction === "tornar_principal" || observation.principalPossiblyInadequate) actions.push("promote_primary");
  return actions;
}

function isMaterialDivergence(observation: SerpFormationObservationInput): boolean {
  if (observation.insufficientEvidence) return false;
  if (observation.decisionStatus !== "pending") return false;
  return observation.conflict
    || observation.compatibility === "incompativel"
    || observation.needsSeparation === true
    || observation.principalPossiblyInadequate === true
    || observation.likelyCannibalization === "likely"
    || observation.recommendationAction === "separar_artigo"
    || observation.recommendationAction === "retirar_do_artigo"
    || observation.recommendationAction === "tornar_principal";
}

/** Classifica a SERP de formação em compatível, inconclusiva ou divergente. */
export function resolveSerpFormationVerdict(input: SerpFormationVerdictInput): SerpFormationVerdictReadModel {
  if (!input.hasAssessment) {
    return {
      kind: "NOT_RUN",
      label: "Não executada",
      headline: "Ainda não há avaliação SERP para este artigo.",
      explanation: "A SERP de formação observa compatibilidade; ela não movimenta keywords.",
      impact: "Nenhuma alteração estrutural obrigatória.",
      divergences: [],
      canRefresh: false,
      blocking: false,
      humanDecisionRequired: false,
      observations: [],
      keywordObservations: [],
    };
  }

  const evidenceLabel = EVIDENCE_LABELS[input.evidencePriority];
  const singleKeyword = input.keywordCount <= 1;
  const insufficient = input.evidencePriority === "insuficiente"
    || input.observations.length === 0
    || input.observations.every(observation => observation.insufficientEvidence);

  const intentNotes = input.observations
    .filter(observation => observation.upstreamIntent && observation.observedIntent
      && observation.upstreamIntent.toLocaleLowerCase("pt-BR") !== observation.observedIntent.toLocaleLowerCase("pt-BR"))
    .map(observation => `${observation.keyword}: intenção upstream ${observation.upstreamIntent} · comportamento observado na SERP ${observation.observedIntent}.`);

  if (insufficient) {
    return {
      kind: "INCONCLUSIVE",
      label: "Inconclusivo",
      headline: "A SERP não confirma nem rejeita a formação atual.",
      explanation: `A cobertura observada não é suficiente para concluir (força da evidência: ${evidenceLabel}).`,
      impact: "Nenhuma alteração estrutural obrigatória. A estrutura atual é mantida.",
      divergences: [],
      canRefresh: true,
      blocking: false,
      humanDecisionRequired: false,
      keywordObservations: keywordObservations(input),
      observations: [
        ...intentNotes,
        ...(intentNotes.length ? ["Se a evidência ficar forte, solicitar revisão upstream da KeywordDNA no Minerador."] : []),
      ],
    };
  }

  // Um artigo com uma única keyword não tem agrupamento a testar: qualquer
  // diferença observada é observação sobre a keyword, não conflito do artigo.
  if (singleKeyword) {
    return {
      kind: intentNotes.length ? "INCONCLUSIVE" : "COMPATIBLE",
      label: intentNotes.length ? "Inconclusivo" : "Compatível",
      headline: intentNotes.length
        ? "Diferença entre o fato upstream e o comportamento observado na SERP."
        : "A SERP observada é compatível com a formação atual.",
      explanation: intentNotes.length
        ? `Artigo com uma única keyword: não existe outra keyword para comparar, então isso não é conflito de agrupamento (força da evidência: ${evidenceLabel}).`
        : `Nenhuma incompatibilidade observada (força da evidência: ${evidenceLabel}).`,
      impact: "Nenhuma alteração estrutural obrigatória.",
      divergences: [],
      canRefresh: intentNotes.length > 0,
      blocking: false,
      humanDecisionRequired: false,
      keywordObservations: keywordObservations(input),
      observations: [
        ...intentNotes,
        ...(intentNotes.length ? ["Caso a evidência futura se torne forte, solicitar revisão upstream da KeywordDNA."] : []),
      ],
    };
  }

  const divergences = input.observations.filter(isMaterialDivergence).map<SerpFormationDivergence>(observation => ({
    keywordId: observation.keywordId,
    keyword: observation.keyword,
    currentRole: observation.currentRole,
    upstreamFact: observation.upstreamIntent ? `Intenção qualificada no Minerador: ${observation.upstreamIntent}.` : "Intenção upstream não recebida.",
    observedEvidence: observation.observedIntent ? `Comportamento observado na SERP: ${observation.observedIntent}.` : "Comportamento observado não classificado.",
    overlapLabel: OVERLAP_LABELS[observation.overlap],
    dominantPageType: observation.dominantPageType || "Não observado",
    observedIntent: observation.observedIntent || "Não observado",
    evidenceStrength: evidenceLabel,
    recommendation: ACTION_RECOMMENDATION[observation.recommendationAction || ""] || "Revisar o pertencimento desta keyword.",
    reason: observation.recommendationReason
      || (observation.likelyCannibalization === "likely"
        ? "Canibalização provável entre as keywords do artigo."
        : "Baixa compatibilidade para competir na mesma página."),
    impact: "A decisão é humana: a SERP não move, divide nem consolida o artigo.",
    actions: divergenceActions(observation),
    plain: plainSerpDivergence(observation),
  }));

  if (!divergences.length) {
    return {
      kind: "COMPATIBLE",
      label: "Compatível",
      headline: "As keywords observadas podem coexistir neste artigo.",
      explanation: `Nenhuma divergência material observada (força da evidência: ${evidenceLabel}).`,
      impact: "Nenhuma decisão humana necessária.",
      divergences: [],
      canRefresh: false,
      blocking: false,
      humanDecisionRequired: false,
      keywordObservations: keywordObservations(input),
      observations: intentNotes,
    };
  }

  return {
    kind: "DIVERGENCE",
    label: "Divergência",
    headline: `${divergences.length} divergência(s) com evidência suficiente para decisão humana.`,
    explanation: `A SERP observou incompatibilidade material na formação atual (força da evidência: ${evidenceLabel}).`,
    impact: "A estrutura permanece como está até a decisão humana.",
    divergences,
    canRefresh: false,
    blocking: true,
    humanDecisionRequired: true,
    keywordObservations: keywordObservations(input),
    observations: intentNotes,
  };
}
