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
  /**
   * DUAS COISAS DIFERENTES, LADO A LADO.
   *
   * `approved` é fato histórico: a versão vigente foi aprovada, e essa
   * decisão pertence àquela versão. `revisionPending` é o presente: a
   * composição em revisão ainda tem decisão humana em aberto.
   *
   * Antes disto o status colapsava as duas em "Aprovado", e o botão de
   * aprovar — condicionado a `readyForApproval` — sumia exatamente quando
   * havia pendência sobre uma versão já aprovada. A pessoa via
   * "Aprovado · 2 decisões pendentes" e não tinha ato nenhum para fechar a
   * segunda.
   */
  revisionPending: boolean;
  /** A revisão corrente pode ser fechada agora? Independe de `approved`. */
  revisionReadyToClose: boolean;
  /** Frase única para a tela: "v5 aprovada · revisão atual com 2 pendências". */
  headline: string;
  blockers: string[];
};

export type ArticleReviewChecklistInput = {
  hasArticleDna: boolean;
  approved: boolean;
  /** Rótulo da versão aprovada, para a frase distinguir os dois tempos. */
  approvedVersionLabel?: string | null;
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

  /*
   * A REVISÃO CORRENTE É CALCULADA SEM OLHAR PARA `approved`.
   *
   * Aprovação anterior não resolve pendência nova — ela pertence à versão que
   * foi aprovada. Deixar `approved` curto-circuitar isto escondia o ato que
   * a pessoa precisava executar.
   */
  const revisionPending = input.hasArticleDna && pendingCount > 0;
  const revisionReadyToClose = input.hasArticleDna && pendingCount === 0;

  const status: ArticleReviewStatus = !input.hasArticleDna
    ? "IN_FORMATION"
    : revisionPending
      ? "AWAITING_HUMAN_REVIEW"
      : input.approved
        ? "APPROVED"
        : "READY_FOR_APPROVAL";

  const versao = input.approvedVersionLabel?.trim();
  const headline = !input.hasArticleDna
    ? "Em formação: nenhuma versão materializada ainda."
    : input.approved && revisionPending
      ? `${versao ? `${versao} aprovada` : "Versão aprovada"} · revisão atual com ${pendingCount} pendência${pendingCount === 1 ? "" : "s"}`
      : input.approved
        ? `${versao ? `${versao} aprovada` : "Versão aprovada"} · sem pendência na revisão atual`
        : revisionPending
          ? `Revisão atual com ${pendingCount} pendência${pendingCount === 1 ? "" : "s"}`
          : "Revisão atual fechada: pronta para aprovação.";

  return {
    decisions,
    requiredCount: decisions.length,
    resolvedCount,
    pendingCount,
    status,
    statusLabel: STATUS_LABELS[status],
    statusBadge: STATUS_BADGES[status],
    /*
     * Pronto para aprovar é sobre a REVISÃO, não sobre o histórico. Uma versão
     * aprovada cuja revisão corrente fechou continua podendo gerar sucessora —
     * é assim que uma mudança material é consolidada sem reescrever o passado.
     */
    // Aprovado sem pendência não tem o que fechar: sucessora só nasce de
    // conteúdo alterado, e oferecer o botão aqui criaria versão à toa.
    readyForApproval: revisionReadyToClose && !input.approved,
    approved: input.approved,
    revisionPending,
    revisionReadyToClose,
    headline,
    blockers: decisions.filter(decision => !decision.resolved).map(decision => `${decision.title}: ${decision.what}`),
  };
}
