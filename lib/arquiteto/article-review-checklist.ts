import type { SerpFormationVerdictReadModel } from "./serp-formation-verdict.ts";

/**
 * Checklist de fechamento do Article.
 *
 * A Revisão humana é o painel final de decisão da fase Artigos: toda pendência
 * responde o que falta, por quê e o que o humano pode fazer. Sem pendência, o
 * artigo fica pronto para aprovação explícita — nunca existe "aguardando
 * aprovação" sem um lugar para aprovar.
 */
export type ArticleReviewDecisionKind = "article_kgr" | "unit_type" | "serp_divergence" | "ai_proposal" | "conflict";

export type ArticleReviewDecision = {
  id: string;
  kind: ArticleReviewDecisionKind;
  title: string;
  resolved: boolean;
  /** Estado atual em uma linha (ex.: "Sim · KGR pleno"). */
  state: string;
  /** O que falta ou o que já foi decidido. */
  what: string;
  /** Por que essa decisão existe. */
  why: string;
  /** O que o humano pode fazer agora. */
  how: string;
};

export type ArticleReviewStatus = "IN_FORMATION" | "AWAITING_HUMAN_REVIEW" | "READY_FOR_APPROVAL" | "APPROVED";

export type ArticleReviewChecklist = {
  decisions: ArticleReviewDecision[];
  requiredCount: number;
  resolvedCount: number;
  pendingCount: number;
  status: ArticleReviewStatus;
  statusLabel: string;
  /** Chave do badge compartilhado de status. */
  statusBadge: string;
  readyForApproval: boolean;
  approved: boolean;
  blockers: string[];
};

export type ArticleReviewChecklistInput = {
  hasArticleDna: boolean;
  approved: boolean;
  kgr: {
    label: string;
    requiresHumanDecision: boolean;
    fullKgr: boolean;
    principalKeyword: string | null;
    principalScoreLabel: string;
  };
  unitType: { defined: boolean; label: string | null };
  serp: Pick<SerpFormationVerdictReadModel, "kind" | "label" | "divergences">;
  aiProposals: readonly { id: string; title: string; resolved: boolean }[];
  /**
   * Os conflitos POR EXTENSO, não o contador.
   *
   * "Existem conflitos" é uma pendência que ninguém consegue resolver: o
   * humano precisa saber QUAL par de buscas está em disputa para decidir.
   */
  unresolvedConflicts: readonly string[];
};

const STATUS_LABELS: Record<ArticleReviewStatus, string> = {
  IN_FORMATION: "Em formação",
  AWAITING_HUMAN_REVIEW: "Aguardando revisão humana",
  READY_FOR_APPROVAL: "Pronto para aprovação",
  APPROVED: "Aprovado",
};

const STATUS_BADGES: Record<ArticleReviewStatus, string> = {
  IN_FORMATION: "draft",
  AWAITING_HUMAN_REVIEW: "awaiting_human_review",
  READY_FOR_APPROVAL: "ready_for_approval",
  APPROVED: "approved",
};

/** Monta a lista de decisões obrigatórias e o estado de fechamento do artigo. */
export function buildArticleReviewChecklist(input: ArticleReviewChecklistInput): ArticleReviewChecklist {
  const decisions: ArticleReviewDecision[] = [];

  decisions.push({
    id: "article-kgr",
    kind: "article_kgr",
    title: "KGR do artigo",
    resolved: !input.kgr.requiresHumanDecision,
    state: input.kgr.label,
    what: input.kgr.requiresHumanDecision
      ? "Falta registrar se este artigo segue estratégia KGR."
      : input.kgr.fullKgr
        ? "Resolvido pela regra: score da Principal abaixo de 0,25."
        : "Decisão do artigo já resolvida.",
    why: `Principal ${input.kgr.principalKeyword || "não definida"} · score ${input.kgr.principalScoreLabel}.`,
    how: input.kgr.requiresHumanDecision
      ? "Escolher Sim ou Não no seletor KGR do artigo, nesta aba."
      : "Nenhuma ação necessária.",
  });

  decisions.push({
    id: "unit-type",
    kind: "unit_type",
    title: "Tipo de unidade",
    resolved: input.unitType.defined,
    state: input.unitType.label || "A definir",
    what: input.unitType.defined ? "Tipo de unidade definido." : "Falta registrar o tipo de unidade do artigo.",
    why: "O tipo da unidade orienta o Planejador e o Redator; categoria/cluster pertence à etapa Silos.",
    how: input.unitType.defined ? "Nenhuma ação necessária." : "Escolher o tipo e registrar a decisão nesta aba.",
  });

  input.serp.divergences.forEach((divergence, index) => {
    decisions.push({
      id: `serp-divergence:${divergence.keywordId}`,
      kind: "serp_divergence",
      title: `Divergência SERP ${index + 1} · ${divergence.keyword}`,
      resolved: false,
      state: `${divergence.currentRole} · sobreposição ${divergence.overlapLabel}`,
      what: divergence.recommendation,
      why: divergence.reason,
      how: "Decidir na aba SERP: manter no artigo, separar ou promover a Principal quando aplicável.",
    });
  });

  input.aiProposals.forEach((proposal, index) => {
    decisions.push({
      id: `ai-proposal:${proposal.id}`,
      kind: "ai_proposal",
      title: `Proposta da IA ${index + 1}`,
      resolved: proposal.resolved,
      state: proposal.resolved ? "Revisada" : "Aguardando revisão humana",
      what: proposal.title,
      why: "A IA propõe arquitetura; ela não aprova nem consolida o ArticleDNA.",
      how: proposal.resolved ? "Nenhuma ação necessária." : "Revisar a proposta na aba IA e concluir o pente-fino.",
    });
  });

  if (input.unresolvedConflicts.length > 0) {
    decisions.push({
      id: "structural-conflicts",
      kind: "conflict",
      title: "Conflitos estruturais",
      resolved: false,
      state: `${input.unresolvedConflicts.length} conflito(s) sem resolução`,
      what: input.unresolvedConflicts.join(" "),
      why: "Conflitos estruturais impedem consolidar uma definição confiável do artigo.",
      how: "Resolver os conflitos apontados na formação antes de aprovar.",
    });
  }

  const resolvedCount = decisions.filter(decision => decision.resolved).length;
  const pendingCount = decisions.length - resolvedCount;
  const status: ArticleReviewStatus = input.approved
    ? "APPROVED"
    : !input.hasArticleDna
      ? "IN_FORMATION"
      : pendingCount > 0 ? "AWAITING_HUMAN_REVIEW" : "READY_FOR_APPROVAL";

  return {
    decisions,
    requiredCount: decisions.length,
    resolvedCount,
    pendingCount,
    status,
    statusLabel: STATUS_LABELS[status],
    statusBadge: STATUS_BADGES[status],
    readyForApproval: status === "READY_FOR_APPROVAL",
    approved: input.approved,
    blockers: decisions.filter(decision => !decision.resolved).map(decision => `${decision.title}: ${decision.what}`),
  };
}
