import type { ArticleKgrIdentity } from "./contracts.ts";
import {
  KGR_INTEREST_VOLUME_RANGE,
  calculateKgrFromMetrics,
  isInKgrInterestVolumeRange,
  kgrApplicabilityLabel,
  readKgrApplicability,
  type KgrApplicability,
  type KgrSemantic,
} from "../minerador/kgr-applicability.ts";
import type { SerpEvidencePriority } from "./serp-evidence-priority.ts";

/**
 * Decisão KGR do Artigo. É um fato do Article, não da keyword: o score e a
 * aplicabilidade recebidos em cada KeywordDNA são lidos como estão, nunca
 * recalculados, sobrescritos, somados nem votados.
 *
 * PADRÃO "KGR NÃO APLICÁVEL" (decisão do dono, 2026-09-28; SDD
 * `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`, fatia
 * A1). O KGR só se aplica quando o humano escolhe "Aplicar KGR" no artigo.
 * Score abaixo de 0,25 deixou de virar "Sim" sozinho: ele é informação, como a
 * faixa de volume 150–550. KGR não aplicável nunca bloqueia formação nem
 * aprovação. Nenhum valor novo de enum: o padrão é `NO` com a fonte
 * `KEYWORD_APPLICABILITY_RULE`, e o contrato vira `article-kgr-decision-v2`
 * (string livre).
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

/** Versão do contrato gravada nas identidades novas (string livre no schema). */
export const ARTICLE_KGR_DECISION_CONTRACT_VERSION = "article-kgr-decision-v2";

/** Motivo gravado e exibido quando ninguém escolheu "Aplicar KGR". */
export const ARTICLE_KGR_DEFAULT_REASON = "KGR não aplicável por padrão: ninguém escolheu Aplicar KGR neste artigo.";

/** Faixa de volume de interesse para KGR (regra do dono), só informativa. */
export const ARTICLE_KGR_INTEREST_VOLUME_RANGE = KGR_INTEREST_VOLUME_RANGE;

/** Validade da medição de allintitle reaproveitada (a mesma do cache de SERP). */
export const ARTICLE_ALLINTITLE_MAX_AGE_DAYS = 30;

/** Tipo do registro de medição guardado em `kgrIdentity.evidence`. */
export const ARTICLE_ALLINTITLE_EVIDENCE_KIND = "article_allintitle";

export type ArticleKgrDecisionTone = "success" | "warning" | "neutral";

export type ArticleKgrScoreSource = "arquiteto_allintitle" | "minerador" | "identity" | null;

export type ArticleKgrDecisionReadModel = {
  decision: ArticleKgrDecision;
  source: ArticleKgrDecisionSource;
  label: string;
  tone: ArticleKgrDecisionTone;
  /**
   * Mantido pelo contrato dos consumidores; desde o padrão "não aplicável" é
   * sempre `false`: o KGR nunca pende de decisão para formar ou aprovar.
   */
  requiresHumanDecision: boolean;
  /** Identidade gravada pela regra antiga (KGR pleno automático), lida como está. */
  fullKgr: boolean;
  /** O artigo trabalha KGR: "Aplicar KGR" = Sim (humano, vínculo confirmado ou regra antiga gravada). */
  applyKgr: boolean;
  /** Score do ARTIGO: allintitle da Principal ÷ volume da Principal. Ausência nunca vira zero. */
  principalKgrScore: number | null;
  /** De onde veio o score. */
  scoreSource: ArticleKgrScoreSource;
  /** Allintitle da Principal usado no score, quando conhecido. */
  principalResultCount: number | null;
  /** Volume da Principal usado no score, quando conhecido. */
  principalVolume: number | null;
  /** Quando o allintitle do artigo foi medido pelo Arquiteto (se foi). */
  allintitleMeasuredAt: string | null;
  /** Score abaixo de 0,25: informação, nunca decisão. */
  scoreInFullRange: boolean;
  /** Volume da Principal na faixa de interesse 150–550: informação, nunca decisão. */
  volumeInInterestRange: boolean;
  /** Fatos recebidos da Principal; permanecem separados da decisão do artigo. */
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
  /** Allintitle medido pelo Minerador (opcional desde 2026-09-28). */
  results_allintitle?: number | null;
  volume_search?: number | null;
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

const finitePositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const finiteNonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Uma medição de allintitle da Principal feita pelo Arquiteto, guardada em `kgrIdentity.evidence`. */
export type ArticleAllintitleEvidence = {
  kind: typeof ARTICLE_ALLINTITLE_EVIDENCE_KIND;
  keywordId: string;
  resultCount: number;
  measuredAt: string;
  query: string | null;
  source: "arquiteto";
};

/**
 * A medição mais recente de allintitle feita pelo Arquiteto para ESTA
 * Principal. Medição de outra Principal é histórico e não vale aqui.
 */
export function readArticleAllintitleEvidence(identity: ArticleKgrIdentity | null | undefined, principalKeywordId?: string | null): ArticleAllintitleEvidence | null {
  if (!identity?.evidence?.length) return null;
  let latest: ArticleAllintitleEvidence | null = null;
  for (const entry of identity.evidence) {
    if (!entry || entry.kind !== ARTICLE_ALLINTITLE_EVIDENCE_KIND) continue;
    const keywordId = typeof entry.keywordId === "string" ? entry.keywordId : null;
    if (!keywordId || (principalKeywordId && keywordId !== principalKeywordId)) continue;
    if (!finiteNonNegativeInteger(entry.resultCount)) continue;
    const measuredAt = typeof entry.measuredAt === "string" && Number.isFinite(Date.parse(entry.measuredAt)) ? entry.measuredAt : null;
    if (!measuredAt) continue;
    if (latest && Date.parse(latest.measuredAt) >= Date.parse(measuredAt)) continue;
    latest = { kind: ARTICLE_ALLINTITLE_EVIDENCE_KIND, keywordId, resultCount: entry.resultCount, measuredAt, query: typeof entry.query === "string" ? entry.query : null, source: "arquiteto" };
  }
  return latest;
}

/** A medição cabe na validade de 30 dias? */
export function isAllintitleMeasurementFresh(measuredAt: string | null | undefined, now: Date, maxAgeDays = ARTICLE_ALLINTITLE_MAX_AGE_DAYS): boolean {
  const time = Date.parse(String(measuredAt ?? ""));
  if (!Number.isFinite(time)) return false;
  const age = now.getTime() - time;
  return age >= -60_000 && age <= maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * O score do ARTIGO: allintitle da Principal ÷ volume da Principal.
 *
 * Ordem: a medição do Arquiteto em `kgrIdentity` (mesma Principal) → o score
 * da linha do Minerador → allintitle e volume da linha do Minerador → o valor
 * já gravado na identidade da mesma Principal. Ausência nunca vira zero.
 */
export function readArticleKgrScore(input: ArticleKgrDecisionInput): {
  score: number | null;
  source: ArticleKgrScoreSource;
  resultCount: number | null;
  volume: number | null;
  measuredAt: string | null;
} {
  const identity = input.kgrIdentity || null;
  const samePrincipal = Boolean(identity) && (!input.principalKeywordId || !identity?.primaryKeywordId || identity.primaryKeywordId === input.principalKeywordId);
  const principalVolume = finitePositive(input.principal?.volume_search) ? input.principal!.volume_search as number
    : samePrincipal && finitePositive(identity?.primaryVolume) ? identity!.primaryVolume as number : null;
  const measured = samePrincipal ? readArticleAllintitleEvidence(identity, input.principalKeywordId || identity?.primaryKeywordId || null) : null;
  if (measured) {
    return { score: calculateKgrFromMetrics(principalVolume, measured.resultCount), source: "arquiteto_allintitle", resultCount: measured.resultCount, volume: principalVolume, measuredAt: measured.measuredAt };
  }
  const minerador = readPrincipalKgrScore(input.principal);
  const mineradorResults = finiteNonNegativeInteger(input.principal?.results_allintitle) ? input.principal!.results_allintitle as number : null;
  if (minerador !== null) return { score: minerador, source: "minerador", resultCount: mineradorResults, volume: principalVolume, measuredAt: null };
  const calculated = calculateKgrFromMetrics(principalVolume, mineradorResults);
  if (calculated !== null) return { score: calculated, source: "minerador", resultCount: mineradorResults, volume: principalVolume, measuredAt: null };
  const stored = samePrincipal && typeof identity?.kgrValue === "number" && Number.isFinite(identity.kgrValue) && identity.kgrValue >= 0 ? identity.kgrValue : null;
  return { score: stored, source: stored === null ? null : "identity", resultCount: samePrincipal && finiteNonNegativeInteger(identity?.resultCount) ? identity!.resultCount as number : mineradorResults, volume: principalVolume, measuredAt: null };
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

/**
 * Identidade gravada pela regra ANTIGA (KGR pleno automático, até 2026-09-28).
 * É lida como está — "Sim · regra antiga" — e só o humano a troca para Não.
 */
function legacyFullKgrRule(identity: ArticleKgrIdentity | null | undefined, principalKeywordId?: string | null): boolean {
  if (!identity || !identity.isKgrArticle) return false;
  if (identity.bindingStatus === "conflict" || identity.status === "conflict") return false;
  if (principalKeywordId && identity.primaryKeywordId && identity.primaryKeywordId !== principalKeywordId) return false;
  return identity.decisionSource === "FULL_KGR_RULE";
}

const DECISION_LABELS: Record<ArticleKgrDecision, string> = {
  YES: "Sim",
  NO: "Não",
  PENDING_HUMAN_DECISION: "A decidir",
  PENDING_APPLICABILITY: "Pendente",
  ABSENT: "—",
};

export function articleKgrDecisionLabel(input: { decision: ArticleKgrDecision; source: ArticleKgrDecisionSource }): string {
  if (input.decision === "YES" && input.source === "FULL_KGR_RULE") return "Sim · regra antiga (KGR pleno automático)";
  if (input.decision === "NO" && input.source === "KEYWORD_APPLICABILITY_RULE") return "Não aplicável";
  return DECISION_LABELS[input.decision];
}

function decisionTone(decision: ArticleKgrDecision): ArticleKgrDecisionTone {
  if (decision === "YES") return "success";
  if (decision === "PENDING_HUMAN_DECISION") return "warning";
  return "neutral";
}

const formatScore = (score: number) => score.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * Classifica o KGR do artigo (contrato `article-kgr-decision-v2`):
 *
 * 1. "Aplicar KGR" escolhido pelo humano (Sim/Não) prevalece;
 * 2. vínculo KGR confirmado (principal e slug) prevalece;
 * 3. identidade gravada pela regra antiga (KGR pleno automático) é lida como está;
 * 4. no resto, "KGR não aplicável" por padrão — score e faixa 150–550 são informação.
 */
export function readArticleKgrDecision(input: ArticleKgrDecisionInput): ArticleKgrDecisionReadModel {
  const identity = input.kgrIdentity || null;
  const scoreRead = readArticleKgrScore(input);
  const principalKgrScore = scoreRead.score;
  const principalApplicability = readKgrApplicability(input.principal?.analise_semantica);
  const supports = input.supports || [];
  const secondaryApplicableCount = supports.filter(support => readKgrApplicability(support.analise_semantica) === "applicable").length;
  const conflict = Boolean(identity && (identity.bindingStatus === "conflict" || identity.status === "conflict"));
  const registered = humanDecisionSource(identity, input.principalKeywordId);
  const legacy = !registered && legacyFullKgrRule(identity, input.principalKeywordId);

  let decision: ArticleKgrDecision;
  let source: ArticleKgrDecisionSource;
  if (registered) {
    decision = identity?.isKgrArticle ? "YES" : "NO";
    source = registered;
  } else if (legacy) {
    decision = "YES";
    source = "FULL_KGR_RULE";
  } else {
    decision = "NO";
    source = "KEYWORD_APPLICABILITY_RULE";
  }
  const applyKgr = decision === "YES";
  const scoreInFullRange = isFullKgrScore(principalKgrScore);
  const volumeInInterestRange = isInKgrInterestVolumeRange(scoreRead.volume);
  const principalReviewProposal = !applyKgr && principalApplicability !== "applicable" && secondaryApplicableCount === 1;

  const notes: string[] = [];
  if (source === "KEYWORD_APPLICABILITY_RULE") notes.push("KGR não aplicável por padrão. Escolha \"Aplicar KGR\" para trabalhar o KGR neste artigo; a escolha não bloqueia a formação nem a aprovação.");
  if (source === "FULL_KGR_RULE") notes.push("Aplicado pela regra antiga (KGR pleno automático), gravada antes de 2026-09-28. Trocar para Não é decisão humana e fica no histórico.");
  if (source === "HUMAN_DECISION") notes.push(applyKgr ? "\"Aplicar KGR\" escolhido por decisão humana." : "\"Não aplicar KGR\" escolhido por decisão humana.");
  if (source === "CONFIRMED_KGR_BINDING") notes.push("Decisão KGR do artigo herdada de vínculo KGR confirmado (principal e slug).");
  if (applyKgr && principalKgrScore === null) notes.push("KGR aplicado sem allintitle da Principal: meça o allintitle para calcular o KGR antes de concluir.");
  if (principalKgrScore === null && !applyKgr) notes.push("Sem allintitle medido para a Principal; ausência não é zero.");
  if (principalKgrScore !== null) notes.push(`KGR do artigo ${formatScore(principalKgrScore)}${scoreInFullRange ? ` (abaixo de ${formatScore(FULL_KGR_THRESHOLD)}: bom)` : ""}; é informação, não decisão.`);
  if (volumeInInterestRange) notes.push(`Volume da Principal na faixa de interesse para KGR (${ARTICLE_KGR_INTEREST_VOLUME_RANGE.min} a ${ARTICLE_KGR_INTEREST_VOLUME_RANGE.max}).`);
  if (!applyKgr && principalApplicability === "applicable") notes.push("A Principal está marcada como KGR aplicável no Minerador; o artigo só trabalha KGR com \"Aplicar KGR\".");
  if (conflict) notes.push("Identidade KGR em conflito: decisão humana obrigatória antes de qualquer vínculo.");
  if (principalReviewProposal) {
    notes.push("Apenas uma secundária tem KGR aplicável: pode surgir proposta de revisão da Principal; o artigo não vira KGR automaticamente.");
  } else if (!applyKgr && principalApplicability !== "applicable" && secondaryApplicableCount > 1) {
    notes.push(`${secondaryApplicableCount} secundárias com KGR aplicável: evidência para revisão humana, não classificação do artigo.`);
  }

  return {
    decision,
    source,
    label: articleKgrDecisionLabel({ decision, source }),
    tone: decisionTone(decision),
    requiresHumanDecision: false,
    fullKgr: source === "FULL_KGR_RULE",
    applyKgr,
    principalKgrScore,
    scoreSource: scoreRead.source,
    principalResultCount: scoreRead.resultCount,
    principalVolume: scoreRead.volume,
    allintitleMeasuredAt: scoreRead.measuredAt,
    scoreInFullRange,
    volumeInInterestRange,
    principalApplicability,
    principalApplicabilityLabel: kgrApplicabilityLabel(principalApplicability),
    secondaryApplicableCount,
    principalReviewProposal,
    conflict,
    notes,
  };
}

/* ------------------------ guarda de versionamento ------------------------ */

/**
 * O que, na identidade KGR, é MUDANÇA REAL para abrir versão sucessora do
 * ArticleDNA: a Principal, a decisão humana ("Aplicar KGR"), o vínculo
 * confirmado e — só com o KGR aplicado — a medição de allintitle. A troca da
 * regra de derivação (v1 → v2) e uma medição de artigo sem KGR aplicado não
 * são mudança real: nenhuma sucessora nasce delas. A data da decisão humana é
 * carimbo: repetir a mesma escolha não é revisão.
 */
function kgrIdentityFingerprint(identity: ArticleKgrIdentity | null | undefined) {
  if (!identity) return { principal: null as string | null, human: null as string | null, binding: null as string | null, measurement: null as string | null };
  const human = identity.decisionSource === "HUMAN_DECISION" || identity.source === "human_confirmation"
    ? `${identity.decision ?? (identity.isKgrArticle ? "YES" : "NO")}`
    : null;
  const binding = identity.bindingStatus === "confirmed" ? `${identity.isKgrArticle}|${identity.boundSlug ?? ""}` : null;
  const applied = (human !== null || binding !== null) && identity.isKgrArticle;
  const measured = applied ? readArticleAllintitleEvidence(identity, identity.primaryKeywordId ?? null) : null;
  return {
    principal: identity.primaryKeywordId ?? null,
    human,
    binding,
    measurement: measured ? `${measured.resultCount}|${measured.measuredAt}` : null,
  };
}

export function articleKgrIdentityChangedMaterially(current: ArticleKgrIdentity | null | undefined, next: ArticleKgrIdentity | null | undefined): boolean {
  const before = kgrIdentityFingerprint(current);
  const after = kgrIdentityFingerprint(next);
  if (before.human !== after.human) return true;
  if (before.binding !== after.binding) return true;
  if (before.measurement !== after.measurement) return true;
  // Principal trocada com as duas identidades presentes: a decisão é reavaliada.
  return Boolean(before.principal && after.principal && before.principal !== after.principal);
}

/**
 * A identidade KGR que uma nova formação do MESMO artigo carrega, diante da
 * versão aprovada (canônica).
 *
 * A identidade nasce no ArticleDNA; a cópia de trabalho da Principal muitas
 * vezes não a traz, ou traz só a medição de allintitle gravada pela rota do
 * Arquiteto (padrão "não aplicável" + evidência). Sem esta reconciliação a
 * derivação nova — que não cria mais identidade por score — trocaria em
 * silêncio uma identidade antiga ("Sim · regra antiga", vínculo confirmado)
 * por "Não aplicável", e a medição sem "Aplicar KGR" abriria sucessora.
 *
 * Regra: se a cópia de trabalho traz DECISÃO (humana ou vínculo confirmado),
 * ela vale. Se não traz, a decisão da canônica continua valendo e só a
 * medição de allintitle mais nova entra nas evidências. Principal trocada não
 * herda a identidade da Principal anterior.
 */
export function reconcileArticleKgrIdentityWithCanonical(input: {
  canonical: ArticleKgrIdentity | null | undefined;
  candidate: ArticleKgrIdentity | null | undefined;
  principalKeywordId: string;
}): ArticleKgrIdentity | undefined {
  const canonical = input.canonical || null;
  const candidate = input.candidate || null;
  if (!canonical) return candidate || undefined;
  if (canonical.primaryKeywordId && canonical.primaryKeywordId !== input.principalKeywordId) return candidate || undefined;
  const decisaoDaCopia = kgrIdentityFingerprint(candidate);
  if (decisaoDaCopia.human !== null || decisaoDaCopia.binding !== null) return candidate || undefined;
  return mergeArticleAllintitleEvidence(canonical, candidate);
}

/**
 * Identidade padrão "não aplicável" para a Principal atual. Só nasce quando há
 * o que guardar (histórico de decisão de outra Principal ou medição de
 * allintitle) — sem isso o artigo não carrega identidade nenhuma.
 */
export function defaultNotApplicableKgrIdentity(input: {
  principalKeywordId: string;
  principalKeywordDnaId?: string;
  principalKeywordDnaVersionId?: string;
  principalKeywordDnaContentHash?: ArticleKgrIdentity["principalKeywordDnaContentHash"];
  primaryVolume?: number | null;
  decisionHistory?: ArticleKgrIdentity["decisionHistory"];
}): ArticleKgrIdentity {
  return {
    isKgrArticle: false,
    source: "minerador",
    ...(input.principalKeywordDnaId ? { principalKeywordDnaId: input.principalKeywordDnaId } : {}),
    ...(input.principalKeywordDnaVersionId ? { principalKeywordDnaVersionId: input.principalKeywordDnaVersionId } : {}),
    ...(input.principalKeywordDnaContentHash ? { principalKeywordDnaContentHash: input.principalKeywordDnaContentHash } : {}),
    primaryKeywordId: input.principalKeywordId,
    primaryVolume: input.primaryVolume ?? null,
    bindingStatus: "not_applicable",
    status: "not_kgr",
    decision: "NO",
    decisionSource: "KEYWORD_APPLICABILITY_RULE",
    decisionReason: ARTICLE_KGR_DEFAULT_REASON,
    decisionContractVersion: ARTICLE_KGR_DECISION_CONTRACT_VERSION,
    ...(input.decisionHistory?.length ? { decisionHistory: input.decisionHistory } : {}),
    purpose: "Registro do padrão \"KGR não aplicável\"; o KGR só se aplica com a escolha humana \"Aplicar KGR\".",
  };
}

/**
 * A identidade que a mesa lê: a DECISÃO vem da identidade gravada no
 * ArticleDNA (quando existe); a medição de allintitle da working copy, se for
 * da mesma Principal e mais nova, entra só nas evidências — é o que deixa o
 * KGR do artigo aparecer logo depois de medir, sem abrir versão.
 */
export function mergeArticleAllintitleEvidence(recorded: ArticleKgrIdentity | null | undefined, working: ArticleKgrIdentity | null | undefined): ArticleKgrIdentity | undefined {
  if (!recorded) return working || undefined;
  if (!working) return recorded;
  const principal = recorded.primaryKeywordId ?? null;
  if (principal && working.primaryKeywordId && working.primaryKeywordId !== principal) return recorded;
  const daWorking = readArticleAllintitleEvidence(working, principal ?? working.primaryKeywordId ?? null);
  if (!daWorking) return recorded;
  const gravada = readArticleAllintitleEvidence(recorded, principal ?? working.primaryKeywordId ?? null);
  if (gravada && Date.parse(gravada.measuredAt) >= Date.parse(daWorking.measuredAt)) return recorded;
  const entrada = (working.evidence || []).find(item => item?.kind === ARTICLE_ALLINTITLE_EVIDENCE_KIND && item.measuredAt === daWorking.measuredAt && item.keywordId === daWorking.keywordId);
  return {
    ...recorded,
    ...(recorded.primaryVolume == null && working.primaryVolume != null ? { primaryVolume: working.primaryVolume } : {}),
    evidence: [...(recorded.evidence || []), ...(entrada ? [entrada] : [])],
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
 * quando o artigo trabalha KGR ("Aplicar KGR" = Sim) e quando há evidência
 * observável. Nunca altera score nem aplicabilidade upstream.
 */
export function resolveArticleKgrSerpReadout(input: ArticleKgrSerpReadoutInput): ArticleKgrSerpReadout | null {
  // Com o padrão "não aplicável", a evidência aparece para o artigo que trabalha KGR.
  if (!input.decision.applyKgr && !input.decision.requiresHumanDecision) return null;
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
