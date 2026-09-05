/**
 * Leitura da IA arquitetural por artigo.
 *
 * A IA faz uma segunda leitura da formação: pertencimento das keywords, escolha
 * da Principal, papéis, canibalização e coerência com a SERP. Execução sem
 * mutação é resultado legítimo — "concluída sem propostas" —, nunca ausência de
 * execução e nunca pendência humana artificial.
 */
export type ArticleAiDecisionInput = {
  keywordId: string;
  keyword: string;
  currentRole: string;
  action: string;
  suggestedRole: string;
  justification: string;
  humanDecisionPoints: readonly string[];
  siloPlacementAction: string;
  conflictReasons: readonly string[];
  /** `false` quando a decisão não muda artigo, papel nem Silo. */
  material: boolean;
};

export type ArticleAiProposal = {
  keywordId: string;
  keyword: string;
  currentState: string;
  proposal: string;
  reason: string;
  evidence: string;
  impact: string;
};

export type ArticleAiReadout = {
  executed: boolean;
  /** Itens devolvidos pela IA para este artigo, antes da classificação. */
  rawCount: number;
  /** Itens com mutação real; é este número que a UI chama de proposta. */
  materialCount: number;
  noOp: boolean;
  proposals: ArticleAiProposal[];
  summary: string[];
};

const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  secundaria: "Secundária",
  reforco_narrativo: "Reforço narrativo",
};

const ACTION_LABELS: Record<string, string> = {
  manter_no_artigo: "Manter no artigo",
  mover_para_artigo: "Mover para outro artigo selecionado",
  reforcar_publicado: "Reforçar o artigo publicado",
  criar_novo_artigo: "Separar em um novo artigo",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

function proposalLabel(decision: ArticleAiDecisionInput): string {
  const action = ACTION_LABELS[decision.action] || decision.action.replaceAll("_", " ");
  return decision.suggestedRole !== decision.currentRole
    ? `${action} · passar a ${roleLabel(decision.suggestedRole)}`
    : action;
}

export type ArticleAiReadoutInput = {
  executed: boolean;
  keywordCount: number;
  serpConsidered: boolean;
  decisions: readonly ArticleAiDecisionInput[];
};

/** Classifica a execução da IA para um artigo e monta a leitura da aba. */
export function buildArticleAiReadout(input: ArticleAiReadoutInput): ArticleAiReadout {
  const material = input.decisions.filter(decision => decision.material);
  const executed = input.executed || input.decisions.length > 0;
  const noOp = executed && material.length === 0;

  const proposals = material.map<ArticleAiProposal>(decision => ({
    keywordId: decision.keywordId,
    keyword: decision.keyword,
    currentState: roleLabel(decision.currentRole),
    proposal: proposalLabel(decision),
    reason: decision.justification,
    evidence: decision.conflictReasons.length
      ? decision.conflictReasons.join(" · ")
      : input.serpConsidered ? "SERP de formação e KeywordDNAs recebidos." : "KeywordDNAs recebidos; SERP ainda não coletada.",
    impact: decision.humanDecisionPoints.length
      ? decision.humanDecisionPoints.join(" · ")
      : "Nada foi alterado: a decisão é humana, na aba Revisão.",
  }));

  const summary = noOp
    ? [
      ...(input.keywordCount <= 1 ? ["Unidade com uma única keyword: não há agrupamento a rever."] : [`Unidade com ${input.keywordCount} keywords: agrupamento revisado.`]),
      "Formação mantida: nenhuma mudança de artigo, Principal ou papel foi recomendada.",
      input.serpConsidered ? "SERP de formação considerada na leitura." : "SERP de formação ainda não coletada para esta leitura.",
      "Nenhuma mutação arquitetural recomendada; nenhuma pendência humana criada.",
    ]
    : [];

  return {
    executed,
    rawCount: input.decisions.length,
    materialCount: material.length,
    noOp,
    proposals,
    summary,
  };
}
