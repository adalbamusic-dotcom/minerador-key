/**
 * DOIS EIXOS, NÃO UM.
 *
 * "Aprovado" respondia a duas perguntas diferentes ao mesmo tempo: se o
 * artefato passou pela decisão editorial e onde ele está no pipeline. Um
 * ArticleDNA aprovado e ainda sem grafo aparecia igual a um pronto para
 * transferência, e a mesa não tinha como distinguir "a decisão foi tomada" de
 * "o item pode seguir".
 *
 *   approval_state   → o que a pessoa decidiu sobre o ARTEFATO.
 *   workflow_status  → onde o ITEM está no caminho.
 *
 * Eles se cruzam mas não se substituem. `APROVADO + CONCLUIDO` e
 * `APROVADO + PRONTO_PARA_RADAR` são estados distintos do mesmo artefato
 * aprovado, e "Pronto para Radar" nunca ocupa o lugar de "Aprovado".
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export const APPROVAL_STATES = ["BRUTO", "APROVADO", "REJEITADO"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const WORKFLOW_STATUSES = [
  "RASCUNHO", "EM_PROCESSO", "DESCARTADO",
  "EM_PROCESSAMENTO",
  "AGUARDANDO_CONCLUSAO",
  /**
   * A formação fechou; o ArticleDNA nasce no fechamento canônico do Silo.
   *
   * É estado DERIVADO — ninguém o grava. Ele existe porque "Em processo"
   * descrevia trabalho humano pendente sobre uma formação que a pessoa já
   * tinha fechado, e a mesa acabava mostrando dois status concorrentes na
   * mesma célula para dizer a mesma coisa.
   */
  "AGUARDANDO_CONSOLIDACAO_DO_SILO",
  "CONCLUIDO",
  "PRONTO_PARA_RADAR",
  "ENVIADO_AO_RADAR",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Rótulos da UI. O eixo editorial nunca empresta palavra ao operacional. */
export const APPROVAL_STATE_LABELS: Record<ApprovalState, string> = {
  BRUTO: "Bruto",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
};

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  RASCUNHO:"Rascunho", EM_PROCESSO:"Em processo", DESCARTADO:"Descartado",
  EM_PROCESSAMENTO: "Em processamento",
  AGUARDANDO_CONCLUSAO: "Aguardando conclusão",
  AGUARDANDO_CONSOLIDACAO_DO_SILO: "Aguardando consolidação do Silo",
  CONCLUIDO: "Concluído",
  PRONTO_PARA_RADAR: "Pronto para Radar",
  ENVIADO_AO_RADAR: "Enviado ao Radar",
};

/** O vocabulário que já existe em `VersionStatusSchema`. */
export type CanonicalVersionStatus = "draft" | "proposed" | "approved" | "rejected" | "superseded";

/**
 * Traduz o status da versão canônica para o eixo editorial.
 *
 * `superseded` NÃO é uma decisão: é uma versão que deixou de ser corrente.
 * Quem pergunta pela decisão precisa perguntar à versão canônica; traduzir
 * `superseded` para "Aprovado" faria uma versão vencida responder pela atual.
 */
export function approvalStateOf(status: CanonicalVersionStatus | null | undefined): ApprovalState {
  if (status === "approved") return "APROVADO";
  if (status === "rejected") return "REJEITADO";
  return "BRUTO";
}

/**
 * §5 — `PRONTO_PARA_RADAR` SÓ EXISTE DEPOIS DO GRAFO APROVADO.
 *
 * Os três primeiros são guia de trabalho: a pessoa organiza o lote quando
 * quiser, e eles não afirmam nada sobre artefato. `PRONTO_PARA_RADAR` é outra
 * coisa — é a declaração de que o item pode seguir —, e ela pressupõe o
 * InternalLinkGraph aprovado, que é o último ato da passada do Arquiteto.
 *
 * O servidor já recusa a alegação sem grafo vigente. Isto NÃO substitui aquela
 * recusa: oferecer na tela uma opção que só pode falhar faz a pessoa descobrir
 * o impedimento depois de clicar, quando ele já era conhecido antes.
 *
 * `ENVIADO_AO_RADAR` nunca entra: ele é consequência do handoff confirmado, e
 * escolhê-lo à mão inventaria uma entrega que não aconteceu.
 */
export function availableGlobalStatusTargets(
  articles: readonly { graphApproval: ApprovalState }[],
): Exclude<WorkflowStatus, "EM_PROCESSAMENTO" | "AGUARDANDO_CONCLUSAO" | "AGUARDANDO_CONSOLIDACAO_DO_SILO" | "CONCLUIDO" | "ENVIADO_AO_RADAR">[] {
  const guias = ["RASCUNHO", "EM_PROCESSO", "DESCARTADO"] as const;
  /*
   * Basta UM elegível para a opção existir: o lote recusa por artigo, com o
   * motivo de cada um, e sumir com a opção porque um item do lote não tem
   * grafo obrigaria a desmarcar tudo e tentar de novo um por um.
   */
  const algumComGrafo = articles.some(article => article.graphApproval === "APROVADO");
  return algumComGrafo ? [...guias, "PRONTO_PARA_RADAR"] : [...guias];
}

/* ------------------------- as duas colunas da mesa ------------------------ */

/**
 * §1/§3 — CADA COLUNA RESPONDE UMA PERGUNTA, E RESPONDE UMA VEZ.
 *
 * A homologação encontrou as duas colunas dizendo "Em processo" pelo MESMO
 * motivo — não existe ArticleDNA —, e a de Status ainda repetia
 * "Aguardando consolidação do Silo" logo abaixo, como se fossem dois estados
 * concorrentes do mesmo item.
 *
 * A causa é vocabulário emprestado: as duas liam a mesma chave de badge, e
 * `draft` significa "Em processo" no eixo operacional. Aprovação não tem
 * `draft`: ou existe artefato e ele tem decisão — BRUTO, APROVADO, REJEITADO
 * —, ou não existe artefato e a pergunta NÃO TEM RESPOSTA.
 *
 * Ausência de artefato não é decisão negativa. É ausência, e a coluna diz isso
 * com um traço em vez de inventar um estado.
 *
 * Esta função é a única autoridade das duas células. Nenhuma delas volta a ser
 * derivada na tela.
 */
export type ArticleRowApproval = {
  /** `null` quando não há artefato sobre o qual decidir. */
  state: ApprovalState | null;
  /** O que a célula mostra. Traço quando não há artefato. */
  label: string;
  /** Por que está assim — vai para o `title`, nunca para a célula. */
  hint: string;
};

export type ArticleRowWorkflow = {
  /** `null` só para "publicado", que não é estado do pipeline editorial. */
  status: WorkflowStatus | null;
  /** Chave do badge compartilhado. */
  badge: string;
  label: string;
};

export function resolveArticleRowAxes(input: {
  /** Estado da versão CANÔNICA do ArticleDNA; `null` quando ela não existe. */
  canonicalArticleDnaStatus: CanonicalVersionStatus | null;
  /** Existe versão gravada que ainda não é a canônica? */
  hasUncanonicalVersion: boolean;
  /** A pessoa fechou a formação e o marcador remoto confirmou. */
  formationConcluded: boolean;
  /**
   * §8 — O PAR CANÔNICO DO SILO EXISTE?
   *
   * A homologação encontrou `APPROVAL = APROVADO` e `WORKFLOW = APROVADO`: com
   * o ArticleDNA gravado e o Silo ainda pendente, o eixo operacional copiava a
   * palavra do editorial e declarava concluído um item cujo Silo não existe.
   *
   * Aprovar o artigo não conclui o item. `CONCLUIDO` exige o par — SiloDNA e
   * SiloPage —, e até lá o status continua sendo a espera real.
   */
  canonicalSiloConsolidated?: boolean;
  published: boolean;
  sentToRadar: boolean;
  /**
   * O badge da revisão corrente, quando o artefato existe.
   *
   * A checklist de revisão continua sendo a autoridade sobre "aguardando
   * revisão humana" e "pronto para aprovação": achatar isso aqui apagaria a
   * pendência que a pessoa precisa resolver.
   */
  reviewBadge?: string | null;
}): { approval: ArticleRowApproval; workflow: ArticleRowWorkflow } {
  const artefatoExiste = Boolean(input.canonicalArticleDnaStatus) || input.hasUncanonicalVersion;

  const approval: ArticleRowApproval = !artefatoExiste
    ? {
      state: null,
      label: "—",
      hint: "ArticleDNA ainda não materializado: não há artefato sobre o qual decidir.",
    }
    : (() => {
      const state = approvalStateOf(input.canonicalArticleDnaStatus);
      return {
        state,
        label: APPROVAL_STATE_LABELS[state],
        hint: state === "APROVADO"
          ? "Decisão humana gravada sobre o ArticleDNA canônico."
          : state === "REJEITADO"
            ? "O ArticleDNA canônico foi recusado."
            : "O ArticleDNA existe e ainda não recebeu decisão.",
      };
    })();

  const workflow: ArticleRowWorkflow = input.published
    ? { status: null, badge: "published", label: "Publicado" }
    : input.sentToRadar
      ? { status: "ENVIADO_AO_RADAR", badge: "sent_radar", label: WORKFLOW_STATUS_LABELS.ENVIADO_AO_RADAR }
      : artefatoExiste
        ? input.canonicalArticleDnaStatus === "approved"
          // Artigo aprovado sem par canônico NÃO é item concluído: o que falta
          // é o Silo, e é ele que a coluna nomeia até existir.
          ? input.canonicalSiloConsolidated === false
            ? {
              status: "AGUARDANDO_CONSOLIDACAO_DO_SILO",
              badge: "awaiting_silo_consolidation",
              label: WORKFLOW_STATUS_LABELS.AGUARDANDO_CONSOLIDACAO_DO_SILO,
            }
            : { status: "CONCLUIDO", badge: input.reviewBadge || "approved", label: WORKFLOW_STATUS_LABELS.CONCLUIDO }
          : { status: "AGUARDANDO_CONCLUSAO", badge: input.reviewBadge || "awaiting_approval", label: WORKFLOW_STATUS_LABELS.AGUARDANDO_CONCLUSAO }
        : input.formationConcluded
          ? {
            status: "AGUARDANDO_CONSOLIDACAO_DO_SILO",
            badge: "awaiting_silo_consolidation",
            label: WORKFLOW_STATUS_LABELS.AGUARDANDO_CONSOLIDACAO_DO_SILO,
          }
          : { status: "EM_PROCESSAMENTO", badge: "draft", label: WORKFLOW_STATUS_LABELS.EM_PROCESSAMENTO };

  return { approval, workflow };
}

export type ArticleOperationalInput = {
  articleId: string;
  /** Decisão sobre o ArticleDNA canônico. */
  articleApproval: ApprovalState;
  /** Decisão sobre o SiloDNA que abriga o artigo. */
  siloApproval: ApprovalState;
  /** Decisão sobre o InternalLinkGraph do Silo. */
  graphApproval: ApprovalState;
  /** Recusas técnicas do portão do Radar, já formuladas. */
  gateIssues: readonly string[];
  /** A formação já pode ser concluída, mas ainda não foi. */
  readyToConclude?: boolean;
  /**
   * O status GRAVADO em `editorial_workflow_items`, lido do servidor.
   *
   * É a autoridade — `PRONTO_PARA_RADAR` não se deriva nem se guarda em
   * sessão. `null` significa que ninguém marcou ainda, não que o item foi
   * recusado.
   */
  persistedStatus?: WorkflowStatus | null;
  /**
   * A base gravada com a marca ainda é a base de agora.
   *
   * §2 — reaprovar o artefato NÃO ressuscita o `PRONTO_PARA_RADAR` antigo. O
   * servidor invalida o status na leitura; isto aqui é a mesma recusa feita
   * na tela, para que a janela entre a mudança e a próxima leitura não mostre
   * "pronto" sobre uma base que já não existe.
   *
   * Ausente significa "não há o que contradizer" — o caminho da mesa sempre
   * informa este campo.
   */
  persistedBaseMatches?: boolean;
  /** A pessoa marcou o item como pronto (efeito local imediato do lote). */
  markedReady?: boolean;
  /** Houve envio ao Radar. */
  sentToRadar?: boolean;
  /** O readback remoto confirmou o envio. */
  handoffConfirmed?: boolean;
};

export type ArticleOperationalState = {
  articleId: string;
  approvalState: ApprovalState;
  workflowStatus: WorkflowStatus;
  /** `Marcar como Pronto para Radar` pode agir sobre este item. */
  canMarkReady: boolean;
  /** Por que não pode, nas palavras que a pessoa lê. */
  blockers: string[];
};

const APPROVAL_BLOCKER: Record<"article" | "silo" | "graph", { pendente: string; rejeitado: string }> = {
  article: {
    pendente: "ArticleDNA ainda não foi concluído.",
    rejeitado: "ArticleDNA está rejeitado.",
  },
  silo: {
    pendente: "O Silo deste artigo ainda não teve a arquitetura confirmada.",
    rejeitado: "O SiloDNA deste artigo está rejeitado.",
  },
  graph: {
    pendente: "Os links internos deste Silo ainda não foram confirmados.",
    rejeitado: "O InternalLinkGraph deste Silo está rejeitado.",
  },
};

function approvalBlockersOf(input: ArticleOperationalInput): string[] {
  const eixos: Array<[keyof typeof APPROVAL_BLOCKER, ApprovalState]> = [
    ["article", input.articleApproval],
    ["silo", input.siloApproval],
    ["graph", input.graphApproval],
  ];
  return eixos.flatMap(([eixo, estado]) => {
    if (estado === "APROVADO") return [];
    /*
     * REJEITADO não é "ainda não". §9: um artefato rejeitado NUNCA avança para
     * PRONTO_PARA_RADAR — nem com todos os outros gates verdes. Dizer
     * "ainda não foi concluído" sobre uma rejeição mandaria a pessoa esperar
     * por um ato que já aconteceu e disse não.
     */
    return [estado === "REJEITADO" ? APPROVAL_BLOCKER[eixo].rejeitado : APPROVAL_BLOCKER[eixo].pendente];
  });
}

/**
 * Resolve os dois eixos de um artigo.
 *
 * O eixo editorial é lido, nunca calculado a partir do operacional: marcar
 * como pronto não aprova, e enviar ao Radar não reaprova.
 */
export function resolveArticleOperationalState(input: ArticleOperationalInput): ArticleOperationalState {
  const blockers = [...approvalBlockersOf(input), ...input.gateIssues];
  const canMarkReady = blockers.length === 0;

  const workflowStatus: WorkflowStatus = (() => {
    if (input.persistedStatus === "DESCARTADO" || input.persistedStatus === "RASCUNHO" || input.persistedStatus === "EM_PROCESSO") return input.persistedStatus;
    /*
     * ENVIADO_AO_RADAR é FATO CONSUMADO.
     *
     * O item existe no Radar; nada que aconteça depois aqui o desfaz. Ele vem
     * do que está gravado, ou do envio desta sessão já confirmado no readback
     * remoto — nunca do clique.
     */
    if (input.persistedStatus === "ENVIADO_AO_RADAR") return "ENVIADO_AO_RADAR";
    if (input.sentToRadar && input.handoffConfirmed) return "ENVIADO_AO_RADAR";

    /*
     * PRONTO_PARA_RADAR é DECISÃO GRAVADA — mas ela pressupõe artefatos que
     * continuam válidos. Se um deles foi rejeitado ou sucedido depois da
     * marca, §9 proíbe o item de seguir aparecendo como pronto: o status cai
     * para o derivado e os bloqueios dizem o que mudou.
     *
     * Isto não apaga nada no servidor. É leitura: a marca continua lá, e
     * volta a valer sozinha quando o artefato voltar a ficar aprovado.
     */
    if (input.persistedStatus === "PRONTO_PARA_RADAR") {
      if (canMarkReady && input.persistedBaseMatches !== false) return "PRONTO_PARA_RADAR";
      /*
       * REBAIXAR PARA A PALAVRA QUE O SERVIDOR VAI ESCREVER.
       *
       * `invalidateStaleReady` grava `EM_PROCESSO` quando a base venceu. Cair
       * aqui no estado derivado da fase — `CONCLUIDO` — faria a tela dizer uma
       * coisa e a próxima leitura do banco dizer outra, sobre o mesmo item.
       */
      return "EM_PROCESSO";
    }
    if (input.markedReady && canMarkReady) return "PRONTO_PARA_RADAR";

    if (input.articleApproval === "APROVADO") return "CONCLUIDO";
    if (input.readyToConclude) return "AGUARDANDO_CONCLUSAO";
    return "EM_PROCESSAMENTO";
  })();

  return {
    articleId: input.articleId,
    approvalState: input.articleApproval,
    workflowStatus,
    canMarkReady,
    blockers,
  };
}

export type ReadyForRadarBatchPlan = {
  /** Artigos que a ação em lote pode marcar. */
  eligible: string[];
  /** Recusados, com o motivo de cada um. */
  refused: { articleId: string; blockers: string[] }[];
  /** Já marcados antes desta ação; a ação é idempotente sobre eles. */
  alreadyReady: string[];
};

/**
 * Planeja `Marcar como Pronto para Radar` para 1, N ou todos os selecionados.
 *
 * A recusa é NOMEADA por artigo. Um lote em que metade não passa não pode
 * virar um erro único: a pessoa precisa saber qual artigo travou e por quê,
 * senão ela desmarca tudo e tenta um por um.
 */
export function planReadyForRadarBatch(articles: readonly ArticleOperationalInput[]): ReadyForRadarBatchPlan {
  const eligible: string[] = [];
  const refused: ReadyForRadarValidation["refused"] = [];
  const alreadyReady: string[] = [];

  for (const article of articles) {
    const estado = resolveArticleOperationalState(article);
    if (estado.workflowStatus === "PRONTO_PARA_RADAR" || estado.workflowStatus === "ENVIADO_AO_RADAR") {
      alreadyReady.push(article.articleId);
      continue;
    }
    if (estado.canMarkReady) eligible.push(article.articleId);
    else refused.push({ articleId: article.articleId, blockers: estado.blockers });
  }

  return { eligible, refused, alreadyReady };
}

/**
 * A prova de que marcar não aprova.
 *
 * §11 proíbe a ação em lote de tocar `approval_state`, ArticleDNA, SiloDNA,
 * grafo, SERP, Principal ou membership. Esta função é o único caminho de
 * transição do eixo operacional, e ela recebe e devolve SÓ o eixo operacional
 * — não há por onde um artefato entrar. O teste trava a assinatura.
 */
export function applyReadyForRadar(
  current: WorkflowStatus,
): WorkflowStatus {
  if (current === "ENVIADO_AO_RADAR") return current;
  return "PRONTO_PARA_RADAR";
}

/** Transição do envio, depois do readback remoto confirmado. */
export function applyRadarHandoffConfirmed(current: WorkflowStatus): WorkflowStatus {
  return current === "PRONTO_PARA_RADAR" || current === "CONCLUIDO" ? "ENVIADO_AO_RADAR" : current;
}

/**
 * §7 — enviar exige o status, não a elegibilidade.
 *
 * Elegível e pronto são coisas diferentes: a primeira é uma conta que a
 * máquina faz, a segunda é uma decisão que alguém tomou. O envio responde à
 * segunda.
 */
export function canSendToRadar(status: WorkflowStatus): boolean {
  return status === "PRONTO_PARA_RADAR";
}

/* -------------------------------------------------------------- servidor */

/**
 * O que o cliente ALEGA ter verificado ao marcar.
 *
 * Chega como insumo. Quem decide é o índice canônico abaixo — a mesma
 * doutrina de `import_radar`, que revalida o RadarItem contra o estado
 * gravado antes de aceitar a escrita.
 */
/**
 * A BASE CANÔNICA DA MARCA.
 *
 * `PRONTO_PARA_RADAR` não é uma propriedade do artigo: é uma afirmação sobre
 * um conjunto ESPECÍFICO de versões. Sem guardar quais eram, não há como
 * responder depois se a marca ainda vale — e o estado gravado passa a mentir
 * em silêncio assim que qualquer uma delas muda.
 */
export type ReadyBase = {
  articleDnaVersionId: string;
  siloDnaVersionId: string;
  siloPageVersionId: string;
  internalLinkGraphVersionId: string;
};

export type ReadyForRadarClaim = ReadyBase & {
  articleId: string;
};

export function readyBaseFromClaim(claim: ReadyForRadarClaim): ReadyBase {
  return {
    articleDnaVersionId: claim.articleDnaVersionId,
    siloDnaVersionId: claim.siloDnaVersionId,
    siloPageVersionId: claim.siloPageVersionId,
    internalLinkGraphVersionId: claim.internalLinkGraphVersionId,
  };
}

/**
 * Lê a base gravada no `payload` do workflow item.
 *
 * Linha antiga, sem base, devolve `null` — e `null` INVALIDA. É deliberado:
 * não dá para provar que uma marca feita antes deste registro ainda vale, e o
 * erro caro aqui é manter "pronto" sobre algo que ninguém consegue conferir.
 */
export function readReadyBase(payload: unknown): ReadyBase | null {
  if (!payload || typeof payload !== "object") return null;
  const bruto = payload as Record<string, unknown>;
  const campos: Array<keyof ReadyBase> = [
    "articleDnaVersionId", "siloDnaVersionId", "siloPageVersionId", "internalLinkGraphVersionId",
  ];
  const base = {} as ReadyBase;
  for (const campo of campos) {
    const valor = bruto[campo];
    if (typeof valor !== "string" || !valor.trim()) return null;
    base[campo] = valor;
  }
  return base;
}

/** Duas bases são a mesma quando as quatro referências são as mesmas. */
export function sameReadyBase(left: ReadyBase | null, right: ReadyBase | null): boolean {
  if (!left || !right) return false;
  return left.articleDnaVersionId === right.articleDnaVersionId
    && left.siloDnaVersionId === right.siloDnaVersionId
    && left.siloPageVersionId === right.siloPageVersionId
    && left.internalLinkGraphVersionId === right.internalLinkGraphVersionId;
}

/**
 * O estado canônico, do jeito que o servidor o leu.
 *
 * Cada conjunto contém SÓ versões aprovadas e vigentes: uma versão aprovada
 * que já foi sucedida não entra, senão "approved/current" viraria só
 * "approved" e um artigo poderia avançar apoiado numa versão vencida.
 */
export type CanonicalApprovalIndex = {
  graphBases?: ReadonlyMap<string,{siloDnaVersionId:string;siloPageVersionId:string;articleVersionIds:readonly string[]}>;
  approvedArticleVersions: ReadonlySet<string>;
  approvedSiloVersions: ReadonlySet<string>;
  approvedSiloPageVersions: ReadonlySet<string>;
  approvedGraphVersions: ReadonlySet<string>;
  /** Prova que a versão pertence AO artigo alegado, e não a outro. */
  articleIdByVersion: ReadonlyMap<string, string>;
};

/** §6 — o detalhe técnico da recusa. Não vai para a mesa; vai para o log. */
export type ReadyForRadarDiagnostic = {
  articleDnaVersionRef: string;
  articleDnaKnownApproved: boolean;
  /** A que artigo o índice canônico diz que esta versão pertence. */
  articleIdOfVersion: string | null;
  resolvedSiloDnaVersionRef: string;
  siloDnaKnownApproved: boolean;
  resolvedSiloPageVersionRef: string;
  siloPageKnownApproved: boolean;
  graphVersionRef: string;
  graphKnownApproved: boolean;
  graphBase: { siloDnaVersionId: string; siloPageVersionId: string; articleVersionIds: readonly string[] } | null;
};

export type ReadyForRadarValidation = {
  accepted: ReadyForRadarClaim[];
  refused: { articleId: string; blockers: string[]; diagnostic?: ReadyForRadarDiagnostic }[];
};

/**
 * §3 — validação individual antes de persistir. Quem falha é NOMEADO.
 *
 * Um lote não é atômico aqui de propósito: recusar os seis porque um não
 * passou faria a pessoa perder o trabalho dos cinco que estavam prontos.
 */
export function validateReadyForRadarClaims(input: {
  claims: readonly ReadyForRadarClaim[];
  canonical: CanonicalApprovalIndex;
}): ReadyForRadarValidation {
  const accepted: ReadyForRadarClaim[] = [];
  const refused: ReadyForRadarValidation["refused"] = [];

  for (const claim of input.claims) {
    const blockers: string[] = [];

    if (!input.canonical.approvedArticleVersions.has(claim.articleDnaVersionId)) {
      blockers.push("O ArticleDNA alegado não está aprovado e vigente no estado canônico desta Brand.");
    } else {
      const dono = input.canonical.articleIdByVersion.get(claim.articleDnaVersionId);
      if (dono !== claim.articleId) {
        // Marcar o artigo A apoiado na versão do artigo B passaria pelos
        // outros três testes sem que nada estivesse errado com as versões.
        blockers.push("A versão do ArticleDNA pertence a outro artigo.");
      }
    }
    if (!input.canonical.approvedSiloVersions.has(claim.siloDnaVersionId)) {
      blockers.push("O SiloDNA alegado não está aprovado e vigente no estado canônico desta Brand.");
    }
    if (!input.canonical.approvedSiloPageVersions.has(claim.siloPageVersionId)) {
      blockers.push("A SiloPage alegada não está aprovada e vigente no estado canônico desta Brand.");
    }
    if (!input.canonical.approvedGraphVersions.has(claim.internalLinkGraphVersionId)) {
      blockers.push("O InternalLinkGraph alegado não está aprovado e vigente no estado canônico desta Brand.");
    }

    if (input.canonical.graphBases) {
      const base = input.canonical.graphBases.get(claim.internalLinkGraphVersionId);
      if (!base || base.siloDnaVersionId !== claim.siloDnaVersionId || base.siloPageVersionId !== claim.siloPageVersionId || !base.articleVersionIds.includes(claim.articleDnaVersionId)) blockers.push("O grafo não corresponde ao artigo e ao par de Silo alegados.");
    }
    if (blockers.length) {
      /*
       * §6 — RECUSA COM DIAGNÓSTICO, NÃO COM "NÃO VIGENTE".
       *
       * A homologação recebeu "ArticleDNA, SiloDNA e SiloPage não estão
       * aprovados e vigentes" e não tinha como saber QUAL das três checagens
       * falhou nem sobre quais versões. Sem isso, a próxima tentativa é
       * adivinhação — e o índice canônico do servidor tem uma regra de
       * validade além do status aprovado, que não aparecia em lugar nenhum.
       *
       * O diagnóstico nomeia as refs alegadas e o que o índice conhece sobre
       * cada uma. Ele não vai para a mesa: é detalhe técnico.
       */
      refused.push({
        articleId: claim.articleId,
        blockers,
        diagnostic: {
          articleDnaVersionRef: claim.articleDnaVersionId,
          articleDnaKnownApproved: input.canonical.approvedArticleVersions.has(claim.articleDnaVersionId),
          articleIdOfVersion: input.canonical.articleIdByVersion.get(claim.articleDnaVersionId) ?? null,
          resolvedSiloDnaVersionRef: claim.siloDnaVersionId,
          siloDnaKnownApproved: input.canonical.approvedSiloVersions.has(claim.siloDnaVersionId),
          resolvedSiloPageVersionRef: claim.siloPageVersionId,
          siloPageKnownApproved: input.canonical.approvedSiloPageVersions.has(claim.siloPageVersionId),
          graphVersionRef: claim.internalLinkGraphVersionId,
          graphKnownApproved: input.canonical.approvedGraphVersions.has(claim.internalLinkGraphVersionId),
          graphBase: input.canonical.graphBases?.get(claim.internalLinkGraphVersionId) ?? null,
        },
      });
    } else accepted.push(claim);
  }

  return { accepted, refused };
}

/* ------------------------------------------------------- invalidação */

/**
 * A base gravada ainda descreve o estado canônico de AGORA?
 *
 * Uma referência que saiu do índice deixou de ser aprovada, ou foi sucedida
 * por outra versão. Os dois casos significam a mesma coisa para o status: a
 * marca foi feita sobre uma base que não existe mais.
 */
export function readyBaseMatchesCurrent(input: {
  base: ReadyBase | null;
  canonical: CanonicalApprovalIndex;
}): { matches: boolean; reasons: string[] } {
  if (!input.base) {
    return { matches: false, reasons: ["A marca foi feita antes do registro da base canônica e não pode ser conferida."] };
  }
  const reasons: string[] = [];
  if (!input.canonical.approvedArticleVersions.has(input.base.articleDnaVersionId)) {
    reasons.push("O ArticleDNA da base deixou de ser a versão aprovada vigente.");
  }
  if (!input.canonical.approvedSiloVersions.has(input.base.siloDnaVersionId)) {
    reasons.push("O SiloDNA da base deixou de ser a versão aprovada vigente.");
  }
  if (!input.canonical.approvedSiloPageVersions.has(input.base.siloPageVersionId)) {
    reasons.push("A SiloPage da base deixou de ser a versão aprovada vigente.");
  }
  if (!input.canonical.approvedGraphVersions.has(input.base.internalLinkGraphVersionId)) {
    reasons.push("O InternalLinkGraph da base deixou de ser a versão aprovada vigente.");
  }
  if (input.canonical.graphBases) {
    const graph = input.canonical.graphBases.get(input.base.internalLinkGraphVersionId);
    if (!graph || graph.siloDnaVersionId !== input.base.siloDnaVersionId
      || graph.siloPageVersionId !== input.base.siloPageVersionId
      || !graph.articleVersionIds.includes(input.base.articleDnaVersionId)) {
      reasons.push("O grafo não corresponde mais à base do artigo e do Silo.");
    }
  }
  return { matches: reasons.length === 0, reasons };
}

export type ReadyInvalidationPlan = {
  /** Precisam voltar remotamente para CONCLUIDO, com o motivo. */
  invalidate: { articleId: string; reasons: string[] }[];
  /** Continuam válidos como estão. */
  keep: string[];
};

/**
 * §4 — quem está PRONTO sobre base vencida volta para CONCLUIDO.
 *
 * §5 — `ENVIADO_AO_RADAR` NUNCA entra aqui. O handoff aconteceu; rebaixá-lo
 * reescreveria um fato passado para descrever um artefato presente. Versão
 * nova depois do envio começa o próprio ciclo, sem mexer no envio antigo.
 */
export function planReadyInvalidation(input: {
  rows: readonly { articleId: string; status: string; base: ReadyBase | null }[];
  canonical: CanonicalApprovalIndex;
}): ReadyInvalidationPlan {
  const invalidate: { articleId: string; reasons: string[] }[] = [];
  const keep: string[] = [];

  for (const row of input.rows) {
    if (row.status !== "PRONTO_PARA_RADAR") { keep.push(row.articleId); continue; }
    const veredito = readyBaseMatchesCurrent({ base: row.base, canonical: input.canonical });
    if (veredito.matches) keep.push(row.articleId);
    else invalidate.push({ articleId: row.articleId, reasons: veredito.reasons });
  }

  return { invalidate, keep };
}
