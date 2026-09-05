import type { ArticleKgrIdentity } from "./contracts.ts";
import { kgrApplicabilityLabel, readKgrApplicability, type KgrApplicability, type KgrSemantic } from "../minerador/kgr-applicability.ts";
import type { SerpEvidencePriority } from "./serp-evidence-priority.ts";

/**
 * Decisão KGR do Artigo. É um fato do Article, não da keyword: o score e a
 * aplicabilidade recebidos em cada KeywordDNA são lidos como estão, nunca
 * recalculados, sobrescritos, somados nem votados.
 */
export type ArticleKgrDecision =
  | "YES"
  | "NO"
  | "PENDING_HUMAN_DECISION"
  | "PENDING_APPLICABILITY"
  | "ABSENT";

export type ArticleKgrDecisionSource =
  | "FULL_KGR_RULE"
  | "HUMAN_DECISION"
  | "CONFIRMED_KGR_BINDING"
  | "KEYWORD_APPLICABILITY_RULE"
  | "AWAITING_HUMAN_DECISION"
  | "AWAITING_KEYWORD_APPLICABILITY"
  | "MISSING_KGR_SCORE";

/** Limite estrito do KGR pleno: 0.25 exato não é pleno. */
export const FULL_KGR_THRESHOLD = 0.25;

export type ArticleKgrDecisionTone = "success" | "warning" | "neutral";

export type ArticleKgrDecisionReadModel = {
  decision: ArticleKgrDecision;
  source: ArticleKgrDecisionSource;
  label: string;
  tone: ArticleKgrDecisionTone;
  /** Verdadeiro somente quando a decisão pertence ao humano na Revisão. */
  requiresHumanDecision: boolean;
  fullKgr: boolean;
  /** Fatos recebidos da Principal; permanecem separados da decisão do artigo. */
  principalKgrScore: number | null;
  principalApplicability: KgrApplicability;
  principalApplicabilityLabel: string;
  /** Contagem informativa das secundárias; nunca classifica o artigo. */
  secondaryApplicableCount: number;
  principalReviewProposal: boolean;
  conflict: boolean;
  notes: string[];
};

export type ArticleKgrKeywordFact = {
  kgr?: number | null;
  kgr_score?: number | null;
  analise_semantica?: KgrSemantic | null;
};

export type ArticleKgrDecisionInput = {
  /** Contrato canônico existente do artigo; ausente enquanto não há ArticleDNA. */
  kgrIdentity?: ArticleKgrIdentity | null;
  principal?: ArticleKgrKeywordFact | null;
  principalKeywordId?: string | null;
  supports?: readonly ArticleKgrKeywordFact[];
};

/** Score real recebido do Minerador. Ausência nunca vira zero. */
export function readPrincipalKgrScore(keyword: ArticleKgrKeywordFact | null | undefined): number | null {
  const value = keyword?.kgr ?? keyword?.kgr_score;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function isFullKgrScore(score: number | null): boolean {
  return score !== null && score >= 0 && score < FULL_KGR_THRESHOLD;
}

function humanDecisionSource(identity: ArticleKgrIdentity | null | undefined, principalKeywordId?: string | null): "HUMAN_DECISION" | "CONFIRMED_KGR_BINDING" | null {
  if (!identity) return null;
  if (identity.bindingStatus === "conflict" || identity.status === "conflict") return null;
  // Uma decisão humana da Principal anterior é histórico, não decisão atual.
  if (principalKeywordId && identity.primaryKeywordId && identity.primaryKeywordId !== principalKeywordId) return null;
  if (identity.decisionSource === "HUMAN_DECISION" || identity.source === "human_confirmation") return "HUMAN_DECISION";
  if (identity.bindingStatus === "confirmed" && identity.status !== "candidate") return "CONFIRMED_KGR_BINDING";
  return null;
}

const DECISION_LABELS: Record<ArticleKgrDecision, string> = {
  YES: "Sim",
  NO: "Não",
  PENDING_HUMAN_DECISION: "A decidir",
  PENDING_APPLICABILITY: "Pendente",
  ABSENT: "—",
};

export function articleKgrDecisionLabel(input: { decision: ArticleKgrDecision; source: ArticleKgrDecisionSource }): string {
  if (input.decision === "YES" && input.source === "FULL_KGR_RULE") return "Sim · KGR pleno";
  return DECISION_LABELS[input.decision];
}

function decisionTone(decision: ArticleKgrDecision): ArticleKgrDecisionTone {
  if (decision === "YES") return "success";
  if (decision === "PENDING_HUMAN_DECISION") return "warning";
  return "neutral";
}

/**
 * Classifica o KGR do artigo a partir da Principal aprovada:
 *
 * 1. decisão humana já registrada no contrato canônico prevalece;
 * 2. score válido `< 0.25` é KGR pleno e não pede decisão humana;
 * 3. `>= 0.25` com aplicabilidade `Aplicável` fica com o humano;
 * 4. `>= 0.25` com `Não aplicável` é `Não`;
 * 5. `>= 0.25` com aplicabilidade pendente permanece `Pendente`;
 * 6. score ausente permanece ausente.
 */
export function readArticleKgrDecision(input: ArticleKgrDecisionInput): ArticleKgrDecisionReadModel {
  const identity = input.kgrIdentity || null;
  const principalKgrScore = readPrincipalKgrScore(input.principal);
  const principalApplicability = readKgrApplicability(input.principal?.analise_semantica);
  const supports = input.supports || [];
  const secondaryApplicableCount = supports.filter(support => readKgrApplicability(support.analise_semantica) === "applicable").length;
  const conflict = Boolean(identity && (identity.bindingStatus === "conflict" || identity.status === "conflict"));
  const registered = humanDecisionSource(identity, input.principalKeywordId);
  const fullKgr = isFullKgrScore(principalKgrScore);

  let decision: ArticleKgrDecision;
  let source: ArticleKgrDecisionSource;
  if (registered) {
    decision = identity?.isKgrArticle ? "YES" : "NO";
    source = registered;
  } else if (fullKgr) {
    decision = "YES";
    source = "FULL_KGR_RULE";
  } else if (principalKgrScore === null) {
    decision = "ABSENT";
    source = "MISSING_KGR_SCORE";
  } else if (principalApplicability === "applicable") {
    decision = "PENDING_HUMAN_DECISION";
    source = "AWAITING_HUMAN_DECISION";
  } else if (principalApplicability === "not_applicable") {
    decision = "NO";
    source = "KEYWORD_APPLICABILITY_RULE";
  } else {
    decision = "PENDING_APPLICABILITY";
    source = "AWAITING_KEYWORD_APPLICABILITY";
  }

  const principalReviewProposal = decision !== "YES" && principalApplicability !== "applicable" && secondaryApplicableCount === 1;

  const notes: string[] = [];
  if (source === "FULL_KGR_RULE") notes.push(`KGR pleno: score ${principalKgrScore} da Principal é menor que ${FULL_KGR_THRESHOLD}; não exige decisão humana.`);
  if (source === "HUMAN_DECISION") notes.push("Decisão KGR do artigo registrada por confirmação humana.");
  if (source === "CONFIRMED_KGR_BINDING") notes.push("Decisão KGR do artigo herdada de vínculo KGR confirmado (principal e slug).");
  if (source === "AWAITING_HUMAN_DECISION") notes.push(`Score ${principalKgrScore} não é KGR pleno e a Principal está marcada como aplicável: a decisão do artigo é humana.`);
  if (source === "KEYWORD_APPLICABILITY_RULE") notes.push("Principal marcada como não aplicável fora do KGR pleno: o artigo não é KGR.");
  if (source === "AWAITING_KEYWORD_APPLICABILITY") notes.push("Aplicabilidade do KGR da Principal pendente: não inferir Sim nem Não.");
  if (source === "MISSING_KGR_SCORE") notes.push("A Principal não tem score KGR recebido; ausência não é zero.");
  if (conflict) notes.push("Identidade KGR em conflito: decisão humana obrigatória antes de qualquer vínculo.");
  if (principalReviewProposal) {
    notes.push("Apenas uma secundária tem KGR aplicável: pode surgir proposta de revisão da Principal; o artigo não vira KGR automaticamente.");
  } else if (decision !== "YES" && principalApplicability !== "applicable" && secondaryApplicableCount > 1) {
    notes.push(`${secondaryApplicableCount} secundárias com KGR aplicável: evidência para revisão humana, não classificação do artigo.`);
  }

  return {
    decision,
    source,
    label: articleKgrDecisionLabel({ decision, source }),
    tone: decisionTone(decision),
    requiresHumanDecision: decision === "PENDING_HUMAN_DECISION",
    fullKgr: source === "FULL_KGR_RULE",
    principalKgrScore,
    principalApplicability,
    principalApplicabilityLabel: kgrApplicabilityLabel(principalApplicability),
    secondaryApplicableCount,
    principalReviewProposal,
    conflict,
    notes,
  };
}

export type ArticleKgrSerpRecommendation = "FAVORAVEL" | "DESFAVORAVEL" | "INCONCLUSIVA";

export const ARTICLE_KGR_SERP_RECOMMENDATION_LABELS: Record<ArticleKgrSerpRecommendation, string> = {
  FAVORAVEL: "Favorável",
  DESFAVORAVEL: "Desfavorável",
  INCONCLUSIVA: "Inconclusiva",
};

export type ArticleKgrSerpReadout = {
  principalKgrScore: number | null;
  principalApplicability: KgrApplicability;
  principalApplicabilityLabel: string;
  competitionLabel: string;
  evidenceStrengthLabel: string;
  competitiveEvidence: string[];
  recommendation: ArticleKgrSerpRecommendation;
  recommendationLabel: string;
  rationale: string;
};

type SerpCompetition = "baixa" | "media" | "alta" | "desconhecida";
type SerpCompatibility = "coerente" | "parcialmente_coerente" | "incompativel" | "insuficiente";

export type ArticleKgrSerpReadoutInput = {
  decision: ArticleKgrDecisionReadModel;
  competitionLevel: SerpCompetition;
  intentCompatibility: SerpCompatibility;
  evidencePriority: SerpEvidencePriority;
  principalObservation?: {
    competition: SerpCompetition;
    compatibility: SerpCompatibility;
    conflict: boolean;
    insufficientEvidence: boolean;
    likelyCannibalization?: "likely" | "unlikely" | "unknown";
  } | null;
};

const competitionLabels: Record<SerpCompetition, string> = { baixa: "Baixa", media: "Média", alta: "Alta", desconhecida: "Desconhecida" };
const compatibilityLabels: Record<SerpCompatibility, string> = {
  coerente: "Coerente",
  parcialmente_coerente: "Parcialmente coerente",
  incompativel: "Incompatível",
  insuficiente: "Insuficiente",
};
const evidenceStrengthLabels: Record<SerpEvidencePriority, string> = {
  prioritaria: "Prioritária",
  complementar: "Complementar",
  insuficiente: "Insuficiente",
};

/**
 * Lê a SERP de formação como evidência para a decisão KGR do artigo. Só existe
 * quando a decisão é humana (não pleno + Principal aplicável) e quando há
 * evidência observável. Nunca altera score nem aplicabilidade upstream.
 */
export function resolveArticleKgrSerpReadout(input: ArticleKgrSerpReadoutInput): ArticleKgrSerpReadout | null {
  if (!input.decision.requiresHumanDecision) return null;
  const observation = input.principalObservation || null;
  const competition = observation?.competition || input.competitionLevel;
  const compatibility = observation?.compatibility || input.intentCompatibility;
  if (!observation && competition === "desconhecida") return null;

  const competitionLabel = competitionLabels[competition];
  const evidenceStrengthLabel = evidenceStrengthLabels[input.evidencePriority];
  const competitiveEvidence = [
    `Competição observada: ${competitionLabel}`,
    `Compatibilidade de intenção: ${compatibilityLabels[compatibility]}`,
    `Força da evidência: ${evidenceStrengthLabel}`,
    ...(observation?.conflict ? ["Conflito observado na formação para a Principal."] : []),
    ...(observation?.insufficientEvidence ? ["Evidência insuficiente para a Principal nesta coleta."] : []),
    ...(observation?.likelyCannibalization === "likely" ? ["Canibalização provável observada entre as keywords do artigo."] : []),
  ];

  const base = {
    principalKgrScore: input.decision.principalKgrScore,
    principalApplicability: input.decision.principalApplicability,
    principalApplicabilityLabel: input.decision.principalApplicabilityLabel,
    competitionLabel,
    evidenceStrengthLabel,
    competitiveEvidence,
  };

  const insufficient = input.evidencePriority === "insuficiente" || competition === "desconhecida" || Boolean(observation?.insufficientEvidence);
  if (insufficient) {
    return {
      ...base,
      recommendation: "INCONCLUSIVA",
      recommendationLabel: ARTICLE_KGR_SERP_RECOMMENDATION_LABELS.INCONCLUSIVA,
      rationale: "A evidência observada não sustenta uma recomendação para a estratégia KGR.",
    };
  }

  const unfavourable = competition === "alta" || compatibility === "incompativel" || Boolean(observation?.conflict);
  const favourable = competition === "baixa" && compatibility === "coerente";
  const recommendation: ArticleKgrSerpRecommendation = unfavourable ? "DESFAVORAVEL" : favourable ? "FAVORAVEL" : "INCONCLUSIVA";
  const rationale = recommendation === "DESFAVORAVEL"
    ? "Evidência competitiva ou de intenção contraria a estratégia KGR; a decisão do artigo continua humana."
    : recommendation === "FAVORAVEL"
      ? "Competição baixa e intenção coerente sustentam a estratégia KGR; é recomendação, não aprovação."
      : "As evidências observadas não convergem para favorável nem desfavorável.";

  return {
    ...base,
    recommendation,
    recommendationLabel: ARTICLE_KGR_SERP_RECOMMENDATION_LABELS[recommendation],
    rationale,
  };
}
