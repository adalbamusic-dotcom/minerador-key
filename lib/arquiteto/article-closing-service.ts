/**
 * O FECHAMENTO DO ARTICLE — UMA AUTORIDADE, DOIS PONTOS DE ENTRADA.
 *
 * Aprovar um artigo e aprovar dez são o MESMO ato repetido. Ter um caminho
 * para o botão individual e outro para o lote significa duas definições de
 * "aprovado" que divergem no primeiro caso de borda — e foi assim que
 * `changeSelectedArticleStatus` passou a existir gravando apenas evento
 * local, sem validação, sem persistência, sem readback. Ele NÃO é reconectado:
 * ligá-lo ao seletor daria a aparência de aprovação sem o ato.
 *
 * A persistência entra por PORTA. O domínio decide o que fechar e o que
 * recusar; quem grava é o chamador, com o writer que já existe.
 *
 * READBACK ENCERRA. Um POST que não lançou exceção não é prova de que o
 * remoto guardou o que foi enviado — e é por isso que existe um resultado
 * para "não sei": `pending_confirmation` manda RELER, nunca repetir.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

/* ------------------------------ bloqueios -------------------------------- */

export const ARTICLE_CLOSING_BLOCKERS = [
  "NO_ARTICLE_DNA",
  "NO_PRINCIPAL",
  "MULTIPLE_PRINCIPALS",
  "PENDING_HUMAN_DECISION",
  "STRUCTURAL_CONFLICT",
  "SERP_NOT_COLLECTED",
  "SERP_STALE",
  "SERP_AWAITS_DECISION",
  "FORMATION_NOT_SAVED",
] as const;
export type ArticleClosingBlockerCode = (typeof ARTICLE_CLOSING_BLOCKERS)[number];

/**
 * O controle que RESOLVE cada bloqueio.
 *
 * "Existem conflitos" sem dizer quais, onde e o que fazer é uma pendência que
 * ninguém consegue fechar. Todo bloqueio aponta para onde se age.
 */
export const BLOCKER_RESOLUTION: Record<ArticleClosingBlockerCode, string> = {
  NO_ARTICLE_DNA: "Concluir formação na fase Artigos.",
  NO_PRINCIPAL: "Definir a Principal na revisão de composição.",
  MULTIPLE_PRINCIPALS: "Deixar uma única Principal na revisão de composição.",
  PENDING_HUMAN_DECISION: "Resolver as decisões abertas na aba Revisão deste artigo.",
  STRUCTURAL_CONFLICT: "Revisar a atribuição arquitetural ou registrar decisão justificada.",
  SERP_NOT_COLLECTED: "Reprocessar artigos para coletar a evidência deste candidato.",
  SERP_STALE: "A composição mudou: reprocessar para reavaliar, ou decidir sobre a evidência atual.",
  SERP_AWAITS_DECISION: "Registrar a decisão editorial sobre a SERP na aba SERP deste artigo.",
  FORMATION_NOT_SAVED: "Salvar a formação antes de enviar para aprovação.",
};

export type ArticleClosingBlocker = {
  code: ArticleClosingBlockerCode;
  detail: string;
  resolveWith: string;
  /** Artigos e Silos citados — o conflito precisa ser localizável. */
  references: string[];
};

/* ------------------------------ evidência -------------------------------- */

/** Três estados, não dois. Ver o complemento da SDD. */
export const SERP_EVIDENCE_STATES = ["NOT_COLLECTED", "STALE", "CURRENT"] as const;
export type SerpEvidenceState = (typeof SERP_EVIDENCE_STATES)[number];

export const SERP_EVIDENCE_LABELS: Record<SerpEvidenceState, string> = {
  NOT_COLLECTED: "não coletada",
  STALE: "desatualizada para esta composição",
  CURRENT: "vigente",
};

/**
 * `serpAssessmentRef` preenchida prova COLETA, nunca validade.
 *
 * Chamar de "não executada" uma evidência histórica que só não corresponde à
 * composição de agora apaga trabalho que foi feito — e manda coletar de novo
 * o que já está no acervo.
 */
export function resolveSerpEvidenceState(input: {
  hasAssessment: boolean;
  assessmentBaseHash: string | null;
  currentBaseHash: string | null;
}): SerpEvidenceState {
  if (!input.hasAssessment) return "NOT_COLLECTED";
  if (!input.assessmentBaseHash || !input.currentBaseHash) return "STALE";
  return input.assessmentBaseHash === input.currentBaseHash ? "CURRENT" : "STALE";
}

/**
 * A LEITURA DA SERP VEM DO GATE, NÃO DE UMA SEGUNDA CONTA.
 *
 * `article-serp-gate` já é a autoridade da fase Artigos: ele sabe que
 * "sustentada" não precisa de decisão nenhuma e que "divergente" precisa. Se o
 * fechamento recalculasse isso a partir dos registros crus, um artigo com
 * evidência sustentada — que não tem `humanResolution` porque não precisa de
 * uma — apareceria bloqueado aqui e liberado lá: a mesma pergunta com duas
 * respostas, separadas só pela tela que se está olhando.
 *
 * `processing` e `failed` entram como não coletada de propósito: nos dois
 * casos não existe evidência utilizável para esta composição, e o caminho que
 * resolve é o mesmo — voltar ao provider.
 */
export function serpEvidenceFromGate(
  gate: { state: string; blocksConclusion: boolean } | null | undefined,
): { serp: SerpEvidenceState; serpDecisionResolved: boolean } {
  if (!gate) return { serp: "NOT_COLLECTED", serpDecisionResolved: false };
  if (gate.state === "stale") return { serp: "STALE", serpDecisionResolved: false };
  if (!gate.state.startsWith("current_")) return { serp: "NOT_COLLECTED", serpDecisionResolved: false };
  // O gate já respondeu se ainda falta gente decidir: `blocksConclusion`.
  return { serp: "CURRENT", serpDecisionResolved: !gate.blocksConclusion };
}

/* ------------------------------- o portão -------------------------------- */

export type ArticleClosingCandidate = {
  articleId: string;
  label: string;
  hasArticleDna: boolean;
  approved: boolean;
  /** Formação salva no remoto; rascunho local não fecha nada. */
  formationSaved: boolean;
  principalKeywordIds: readonly string[];
  pendingDecisions: readonly string[];
  /** Conflitos POR EXTENSO, com as referências que os localizam. */
  conflicts: readonly { detail: string; references: readonly string[] }[];
  serp: SerpEvidenceState;
  /** A evidência inconclusiva/divergente teve decisão humana vigente? */
  serpDecisionResolved: boolean;
};

export type ArticleClosingAction = "submit_for_approval" | "approve" | "reopen_revision";

/**
 * O VERBO DE CADA AÇÃO.
 *
 * Um lote de "enviar para aprovação" anunciando "3 aprovado(s)" descreveria um
 * ato que não aconteceu. O resultado é o mesmo mecanismo; a palavra não é.
 */
const ACTION_WORDS: Record<ArticleClosingAction, { done: string; noop: string; counted: string }> = {
  submit_for_approval: {
    done: "Enviado para aprovação e confirmado no readback",
    noop: "Já estava na fila de aprovação: nenhuma versão nova foi criada.",
    counted: "enviado(s)",
  },
  approve: {
    done: "Aprovado e confirmado no readback",
    noop: "Já aprovado: o conteúdo não mudou e nenhuma versão nova foi criada.",
    counted: "aprovado(s)",
  },
  reopen_revision: {
    done: "Revisão reaberta e confirmada no readback",
    noop: "A revisão já estava aberta: nenhuma versão nova foi criada.",
    counted: "reaberto(s)",
  },
};

/**
 * O que impede este artigo de receber esta ação.
 *
 * Lista vazia significa elegível. A mesma função responde ao botão individual
 * e ao seletor em lote: uma tela recusando o que a outra aceita seria a mesma
 * pergunta com duas respostas.
 */
export function articleClosingBlockers(
  candidate: ArticleClosingCandidate,
  action: ArticleClosingAction,
): ArticleClosingBlocker[] {
  const bloqueio = (code: ArticleClosingBlockerCode, detail: string, references: string[] = []) =>
    ({ code, detail, resolveWith: BLOCKER_RESOLUTION[code], references });

  if (action === "reopen_revision") {
    // Reabrir não apaga a aprovação: ela continua ligada à sua versão.
    return candidate.approved ? [] : [bloqueio("NO_ARTICLE_DNA", "Não há versão aprovada para reabrir.")];
  }

  const blockers: ArticleClosingBlocker[] = [];
  if (!candidate.hasArticleDna) blockers.push(bloqueio("NO_ARTICLE_DNA", "O artigo ainda não foi materializado."));
  if (!candidate.formationSaved) blockers.push(bloqueio("FORMATION_NOT_SAVED", "A formação tem alterações não persistidas."));

  if (action === "submit_for_approval") return blockers;

  // ------------------------------------------------------- aprovar
  const principais = candidate.principalKeywordIds.length;
  if (principais === 0) blockers.push(bloqueio("NO_PRINCIPAL", "Nenhuma busca marcada como Principal."));
  if (principais > 1) {
    blockers.push(bloqueio("MULTIPLE_PRINCIPALS", `${principais} buscas marcadas como Principal.`, [...candidate.principalKeywordIds]));
  }
  if (candidate.pendingDecisions.length) {
    blockers.push(bloqueio("PENDING_HUMAN_DECISION",
      `${candidate.pendingDecisions.length} decisão(ões) em aberto: ${candidate.pendingDecisions.join("; ")}.`));
  }

  /*
   * Conflitos duplicados são AGRUPADOS, preservando as referências.
   *
   * O mesmo conflito relatado por dois diagnósticos vira duas linhas idênticas
   * na tela e faz a pessoa procurar dois problemas onde há um. Agrupar pelo
   * texto e somar as referências mantém a localização sem repetir a leitura.
   */
  const porTexto = new Map<string, Set<string>>();
  for (const conflito of candidate.conflicts) {
    const atual = porTexto.get(conflito.detail) ?? new Set<string>();
    for (const referencia of conflito.references) atual.add(referencia);
    porTexto.set(conflito.detail, atual);
  }
  for (const [detail, referencias] of porTexto) {
    blockers.push(bloqueio("STRUCTURAL_CONFLICT", detail, [...referencias].sort()));
  }

  if (candidate.serp === "NOT_COLLECTED") {
    blockers.push(bloqueio("SERP_NOT_COLLECTED", "Nenhuma evidência de SERP para esta composição."));
  }
  if (candidate.serp === "STALE" && !candidate.serpDecisionResolved) {
    blockers.push(bloqueio("SERP_STALE", "A evidência existente descreve outra composição."));
  }
  /*
   * Evidência VIGENTE ainda pode estar esperando gente.
   *
   * Divergente e inconclusiva descrevem esta composição — coletar de novo não
   * muda nada. Chamar isso de "não coletada" mandaria refazer a coleta que já
   * existe; o que falta é a decisão editorial.
   */
  if (candidate.serp === "CURRENT" && !candidate.serpDecisionResolved) {
    blockers.push(bloqueio("SERP_AWAITS_DECISION", "A SERP vigente ainda aguarda decisão editorial."));
  }
  return blockers;
}

/* ------------------------------ o resultado ------------------------------ */

export const ARTICLE_CLOSING_OUTCOMES = [
  "approved",
  "already_approved",
  "blocked",
  "failed",
  "pending_confirmation",
] as const;
export type ArticleClosingOutcome = (typeof ARTICLE_CLOSING_OUTCOMES)[number];

export type ArticleClosingResult = {
  articleId: string;
  label: string;
  outcome: ArticleClosingOutcome;
  /** Identidade da versão resultante, quando houve uma. */
  versionId: string | null;
  versionNumber: number | null;
  contentHash: string | null;
  blockers: ArticleClosingBlocker[];
  message: string;
};

export type ClosingPersistPort = (candidate: ArticleClosingCandidate) => Promise<{
  /** `true` quando o remoto confirmou versão, hash e status por readback. */
  readbackConfirmed: boolean;
  /** `false` quando o conteúdo era idêntico e nenhuma versão nova nasceu. */
  changed: boolean;
  versionId: string | null;
  versionNumber: number | null;
  contentHash: string | null;
}>;

/**
 * Fecha UM artigo. O lote é um laço sobre isto — nunca um caminho paralelo.
 */
export async function closeArticleRevision(input: {
  candidate: ArticleClosingCandidate;
  action: ArticleClosingAction;
  persist: ClosingPersistPort;
}): Promise<ArticleClosingResult> {
  const { candidate } = input;
  const base = { articleId: candidate.articleId, label: candidate.label, versionId: null, versionNumber: null, contentHash: null };

  const blockers = articleClosingBlockers(candidate, input.action);
  if (blockers.length) {
    return { ...base, outcome: "blocked", blockers, message: blockers.map(item => item.detail).join(" ") };
  }

  try {
    const persistido = await input.persist(candidate);
    if (!persistido.changed) {
      // Conteúdo inalterado NÃO gera versão nova. Anunciar "aprovado" aqui
      // faria a contagem do lote inflar sobre trabalho que não aconteceu.
      return {
        ...base, outcome: "already_approved", blockers: [],
        versionId: persistido.versionId, versionNumber: persistido.versionNumber, contentHash: persistido.contentHash,
        message: ACTION_WORDS[input.action].noop,
      };
    }
    if (!persistido.readbackConfirmed) {
      /*
       * O writer não é transacional: a escrita pode ter commitado. Chamar isto
       * de falha convidaria a repetir e gravar duas vezes; chamar de sucesso
       * mentiria. O ato correto é RELER.
       */
      return {
        ...base, outcome: "pending_confirmation", blockers: [],
        versionId: persistido.versionId, versionNumber: persistido.versionNumber, contentHash: persistido.contentHash,
        message: "A gravação não foi confirmada pelo readback. Recarregue antes de repetir: a escrita pode ter sido aplicada.",
      };
    }
    return {
      ...base, outcome: "approved", blockers: [],
      versionId: persistido.versionId, versionNumber: persistido.versionNumber, contentHash: persistido.contentHash,
      message: `${ACTION_WORDS[input.action].done}${persistido.versionNumber ? ` (v${persistido.versionNumber})` : ""}.`,
    };
  } catch (error) {
    return {
      ...base, outcome: "failed", blockers: [],
      message: error instanceof Error ? error.message : "A gravação falhou.",
    };
  }
}

/* -------------------------------- o lote --------------------------------- */

export type ArticleClosingBatch = {
  results: ArticleClosingResult[];
  approved: number;
  alreadyApproved: number;
  blocked: number;
  failed: number;
  pendingConfirmation: number;
  /** Continuam selecionados para que a pessoa possa resolvê-los. */
  keepSelectedArticleIds: string[];
  summary: string;
};

export async function closeArticleRevisions(input: {
  candidates: readonly ArticleClosingCandidate[];
  action: ArticleClosingAction;
  persist: ClosingPersistPort;
}): Promise<ArticleClosingBatch> {
  const results: ArticleClosingResult[] = [];
  for (const candidate of input.candidates) {
    // Sequencial de propósito: uma falha não pode apagar o que já foi
    // confirmado, e o remoto precisa ver um ato de cada vez.
    results.push(await closeArticleRevision({ candidate, action: input.action, persist: input.persist }));
  }

  const conta = (outcome: ArticleClosingOutcome) => results.filter(item => item.outcome === outcome).length;
  const approved = conta("approved");
  const alreadyApproved = conta("already_approved");
  const blocked = conta("blocked");
  const failed = conta("failed");
  const pendingConfirmation = conta("pending_confirmation");

  const palavra = ACTION_WORDS[input.action].counted;
  const partes = [
    approved ? `${approved} ${palavra}` : null,
    alreadyApproved ? `${alreadyApproved} já ${palavra}` : null,
    blocked ? `${blocked} bloqueado(s)` : null,
    failed ? `${failed} com falha` : null,
    pendingConfirmation ? `${pendingConfirmation} aguardando confirmação` : null,
  ].filter(Boolean);

  return {
    results,
    approved, alreadyApproved, blocked, failed, pendingConfirmation,
    keepSelectedArticleIds: results
      .filter(item => item.outcome === "blocked" || item.outcome === "failed" || item.outcome === "pending_confirmation")
      .map(item => item.articleId),
    summary: partes.length ? partes.join(" · ") : "Nenhum artigo processado.",
  };
}

/* ---------------------- a contagem antes de aplicar ---------------------- */

export function summarizeClosingEligibility(input: {
  candidates: readonly ArticleClosingCandidate[];
  action: ArticleClosingAction;
}) {
  const avaliados = input.candidates.map(candidate => ({
    candidate,
    blockers: articleClosingBlockers(candidate, input.action),
  }));
  const elegiveis = avaliados.filter(item => item.blockers.length === 0);
  const bloqueados = avaliados.filter(item => item.blockers.length > 0);
  return {
    selected: input.candidates.length,
    eligible: elegiveis.length,
    blocked: bloqueados.length,
    blockedDetails: bloqueados.map(item => ({
      articleId: item.candidate.articleId,
      label: item.candidate.label,
      blockers: item.blockers,
    })),
  };
}
